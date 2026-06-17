$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc = Join-Path $root 'recent_purchase'
$modCompiled = Join-Path $root 'recent_purchase_compiled'
$stagingSrc = Join-Path $root 'recent_purchase_terser'
$stagingCompiled = Join-Path $root 'recent_purchase_terser_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcliCandidates = @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkeditcli = $vpkeditcliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$vpkOut = Join-Path $root 'pak81_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak81_dir.vpk'
$scriptRelative = 'panorama\scripts\recent_purchase_queue_costs.js'

function New-RecentPurchaseClosureExterns {
    param([Parameter(Mandatory = $true)][string]$Path)

    $externs = @'
/** @externs */
var $ = {};
$.Schedule = function(delay, callback) {};
$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};
$.GetContextPanel = function() {};
var GameUI = {};
var SteamOverlayAPI = {};
Object.prototype.FindChildTraverse = function(id) {};
Object.prototype.GetParent = function() {};
Object.prototype.GetChild = function(index) {};
Object.prototype.GetChildCount = function() {};
Object.prototype.BHasClass = function(className) {};
Object.prototype.SetPanelEvent = function(eventName, callback) {};
Object.prototype.IsValid = function() {};
Object.prototype._rpText;
Object.prototype._lastChatMsg;
Object.prototype.text;
Object.prototype.style;
Object.prototype.color;
Object.prototype.washColor;
Object.prototype.fontSize;
Object.prototype.fontWeight;
Object.prototype.verticalAlign;
'@
    Set-Content -LiteralPath $Path -Value $externs -Encoding ASCII
    return $Path
}

function Assert-ClosureOutput {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int64]$MinBytes,
        [Parameter(Mandatory = $true)][string[]]$RequiredFragments
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Compressed script not found after Closure ADVANCED run: $Path"
    }
    $scriptInfo = Get-Item -LiteralPath $Path
    if ($scriptInfo.Length -lt $MinBytes) {
        throw "Closure ADVANCED output is suspiciously small: $($scriptInfo.Length) bytes at $Path"
    }
    $content = Get-Content -LiteralPath $Path -Raw
    foreach ($fragment in $RequiredFragments) {
        if (-not $content.Contains($fragment)) {
            throw "Closure ADVANCED output is missing required runtime fragment: $fragment"
        }
    }
    return $scriptInfo
}


function Remove-RepoChild {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Leaf
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolvedRoot = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\') + '\'
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    if (-not ($resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedPath) -eq $Leaf)) {
        throw "Refusing to remove unexpected path: $resolvedPath"
    }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

if (-not (Test-Path -LiteralPath $modSrc)) { throw "Source mod not found: $modSrc" }
if (-not (Test-Path -LiteralPath $compiler)) { throw "Compiler not found: $compiler" }
if (-not $vpkeditcli) { throw "vpkeditcli not found in known repo tool paths" }

# Clean rebuild: remove stale minified, compiled output, and previous pack artifacts.
Remove-RepoChild -Path $modCompiled -Leaf 'recent_purchase_compiled'
Remove-RepoChild -Path $stagingSrc -Leaf 'recent_purchase_terser'
Remove-RepoChild -Path $stagingCompiled -Leaf 'recent_purchase_terser_compiled'
if (Test-Path -LiteralPath $vpkOut) { Remove-Item -LiteralPath $vpkOut -Force }

# -- Step 1: Prepare Closure ADVANCED source --------------------------------------
Write-Host "`n[1/4] Preparing Closure ADVANCED recent_purchase source..." -ForegroundColor Cyan
Copy-Item -LiteralPath $modSrc -Destination $stagingSrc -Recurse -Force

$sourceScript = Join-Path $modSrc $scriptRelative
$compressedScript = Join-Path $stagingSrc $scriptRelative
if (-not (Test-Path -LiteralPath $compressedScript)) {
    throw "Compressed script target was not created: $compressedScript"
}

$closureExterns = New-RecentPurchaseClosureExterns -Path (Join-Path $stagingSrc 'closure-externs.js')
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

$sourceInfo = Get-Item -LiteralPath $sourceScript
$scriptInfo = Assert-ClosureOutput -Path $compressedScript -MinBytes 1024 -RequiredFragments @(
    '$.Schedule',
    'RecentPurchaseTotalCostLabel',
    'RecentPurchaseDeficitLabel',
    'CitadelChatInputSubmitted',
    'Need '
)
Remove-Item -LiteralPath $closureExterns -Force
Write-Host "  Closure ADVANCED OK -> $compressedScript ($([math]::Round($sourceInfo.Length / 1KB, 1)) KB -> $([math]::Round($scriptInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green

# -- Step 2: Compile --------------------------------------------------------------
Write-Host "`n[2/4] Compiling recent_purchase..." -ForegroundColor Cyan
$compileTarget = Join-Path $stagingCompiled 'panorama\scripts\recent_purchase_queue_costs.vjs_c'
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$stagingSrc`"" -PassThru -WindowStyle Hidden
$compileDeadline = (Get-Date).AddSeconds(120)
while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path -LiteralPath $compileTarget) {
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
    if (-not (Test-Path -LiteralPath $compileTarget)) {
        throw "Compiler exited $($proc.ExitCode) and no output produced"
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but output exists; continuing." -ForegroundColor Yellow
}
if (-not (Test-Path -LiteralPath $compileTarget)) {
    throw "Compiled output not found at: $compileTarget"
}
Copy-Item -LiteralPath $stagingCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# -- Step 3: Pack VPK ------------------------------------------------------------
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
$packArgs = "`"$modCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    throw "vpkeditcli failed with code $($pack.ExitCode)"
}
if (-not (Test-Path -LiteralPath $vpkOut)) {
    throw "VPK not created at $vpkOut"
}
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

# -- Step 4: Deploy --------------------------------------------------------------
Write-Host "`n[4/4] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path -LiteralPath $destDir)) {
    throw "Destination folder not found: $destDir"
}
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`nDone! Launch Deadlock to test." -ForegroundColor Yellow
