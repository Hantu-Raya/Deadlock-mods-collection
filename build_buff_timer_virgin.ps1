$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc = Join-Path $root 'buff_timer_virgin'
$modCompiled = Join-Path $root 'buff_timer_virgin_compiled'
$stagingSrc = Join-Path $root 'buff_timer_virgin_terser'
$stagingCompiled = Join-Path $root 'buff_timer_virgin_terser_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcliCandidates = @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkeditcli = $vpkeditcliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$vpkOut = Join-Path $root 'pak98_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk'
$scriptRelative = 'panorama\scripts\rejuvnbufftimer.js'

function New-BuffTimerClosureExterns {
    param([Parameter(Mandatory = $true)][string]$Path)

    $externs = @'
/** @externs */
var $ = {};
$.Msg = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};
$.Schedule = function(delay, callback) {};
$.CancelScheduled = function(handle) {};
$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};
$.CreatePanel = function(type, parent, id) {};
$.GetContextPanel = function() {};
var GameUI = {};
var SteamOverlayAPI = {};
Object.prototype.handleRejuvPingActivate;
Object.prototype.handleBuffPingActivate;
Object.prototype.FindChildTraverse = function(id) {};
Object.prototype.FindChildrenWithClassTraverse = function(className) {};
Object.prototype.Children = function() {};
Object.prototype.GetParent = function() {};
Object.prototype.GetChild = function(index) {};
Object.prototype.GetChildCount = function() {};
Object.prototype.BHasClass = function(className) {};
Object.prototype.AddClass = function(className) {};
Object.prototype.RemoveClass = function(className) {};
Object.prototype.SetHasClass = function(className, enabled) {};
Object.prototype.SetImage = function(src) {};
Object.prototype.DeleteAsync = function(delay) {};
Object.prototype.IsValid = function() {};
Object.prototype.text;
Object.prototype.style;
Object.prototype.contentwidth;
Object.prototype.contentheight;
Object.prototype.actuallayoutwidth;
Object.prototype.actuallayoutheight;
Object.prototype.actualxoffset;
Object.prototype.actualyoffset;
Object.prototype.actualuiscale_x;
Object.prototype.actualuiscale_y;
Object.prototype.actualX;
Object.prototype.actualY;
Object.prototype.checked;
Object.prototype.position;
Object.prototype.preTransformScale2d;
Object.prototype.opacity;
Object.prototype.washColor;
Object.prototype.clip;
Object.prototype.backgroundImage;
Object.prototype.color;
Object.prototype.width;
Object.prototype.height;
'@
    Set-Content -Path $Path -Value $externs -Encoding ASCII
    return $Path
}

function Assert-ClosureOutput {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int64]$MinBytes,
        [Parameter(Mandatory = $true)][string[]]$RequiredFragments
    )

    if (-not (Test-Path $Path)) {
        throw "Compressed script not found after Closure ADVANCED run: $Path"
    }
    $scriptInfo = Get-Item $Path
    if ($scriptInfo.Length -lt $MinBytes) {
        throw "Closure ADVANCED output is suspiciously small: $($scriptInfo.Length) bytes at $Path"
    }
    $content = Get-Content -Path $Path -Raw
    foreach ($fragment in $RequiredFragments) {
        if (-not $content.Contains($fragment)) {
            throw "Closure ADVANCED output is missing required runtime fragment: $fragment"
        }
    }
    return $scriptInfo
}

if (-not $vpkeditcli) { throw "vpkeditcli not found in known repo tool paths" }


# Clean rebuild: remove stale compiled output and previous pack artifacts.
if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
if (Test-Path $stagingSrc) { Remove-Item -Recurse -Force $stagingSrc }
if (Test-Path $stagingCompiled) { Remove-Item -Recurse -Force $stagingCompiled }
if (Test-Path $vpkOut) { Remove-Item -Force $vpkOut }

# [1/4] Prepare Closure ADVANCED source
Write-Host "`n[1/4] Preparing Closure ADVANCED buff_timer_virgin source..." -ForegroundColor Cyan
Copy-Item -Path $modSrc -Destination $stagingSrc -Recurse -Force

$sourceScript = Join-Path $modSrc $scriptRelative
$compressedScript = Join-Path $stagingSrc $scriptRelative
if (-not (Test-Path $compressedScript)) {
    throw "Compressed script target was not created: $compressedScript"
}

$closureExterns = New-BuffTimerClosureExterns -Path (Join-Path $stagingSrc 'closure-externs.js')
$closureArgs = @(
    '--yes'
    'google-closure-compiler'
    '--externs'
    $closureExterns
    '--js'
    $sourceScript
    '--compilation_level'
    'ADVANCED'
    '--js_output_file'
    $compressedScript
)

& npx @closureArgs
if ($LASTEXITCODE -ne 0) {
    throw "Closure ADVANCED failed with exit code $LASTEXITCODE"
}

$scriptInfo = Assert-ClosureOutput -Path $compressedScript -MinBytes 8192 -RequiredFragments @(
    'handleRejuvPingActivate',
    'handleBuffPingActivate',
    '$.Schedule',
    'RejuvTime',
    'BuffTime'
)
Remove-Item -LiteralPath $closureExterns -Force
Write-Host "  Closure ADVANCED OK -> $compressedScript ($([math]::Round($scriptInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green

# [2/4] Compile
Write-Host "`n[2/4] Compiling buff_timer_virgin..." -ForegroundColor Cyan
$compileTarget = Join-Path $stagingCompiled 'panorama\scripts\rejuvnbufftimer.vjs_c'
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$stagingSrc`"" -PassThru
$compileDeadline = (Get-Date).AddSeconds(120)
while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $compileTarget) {
        Start-Sleep -Seconds 2
        if (-not $proc.HasExited) {
            Write-Host "[WARN] Compiler produced output but did not exit; stopping wrapper." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            $proc.WaitForExit()
        }
        break
    }
}
if (-not $proc.HasExited) {
    Write-Host "[WARN] Compiler timed out; stopping wrapper." -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $proc.WaitForExit()
}
if ($proc.ExitCode -ne 0) {
    if (-not (Test-Path $compileTarget)) {
        throw "Compiler exited $($proc.ExitCode) and no output produced"
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but output exists; continuing." -ForegroundColor Yellow
}
if (-not (Test-Path $compileTarget)) {
    throw "Compiled output not found"
}
Copy-Item -Path $stagingCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# [3/4] Pack VPK
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
$packArgs = "`"$modCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    throw "vpkeditcli failed with code $($pack.ExitCode)"
}
if (-not (Test-Path $vpkOut)) {
    throw "VPK not created at $vpkOut"
}
$vpkSize = (Get-Item $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

# [4/4] Deploy
Write-Host "`n[4/4] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path $destDir)) {
    throw "Destination folder not found: $destDir"
}
Copy-Item -Path $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`nDone! Launch Deadlock to test." -ForegroundColor Yellow
