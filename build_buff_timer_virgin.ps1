$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$modSrc = Join-Path $root 'buff_timer_virgin'
$modCompiled = Join-Path $root 'buff_timer_virgin_compiled'
$stagingSrc = Join-Path $root 'buff_timer_virgin_terser'
$stagingCompiled = Join-Path $root 'buff_timer_virgin_terser_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak98_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk'
$scriptRelative = 'panorama\scripts\rejuvnbufftimer.js'

function New-BuffTimerClosureExterns {
    param([Parameter(Mandatory = $true)][string]$Path)

    $externs = @'
/** @externs */
var $ = {};
/** @param {...*} var_args */
$.Msg = function(var_args) {};
/** @param {number} delay @param {function()} callback @return {*} */
$.Schedule = function(delay, callback) {};
/** @param {*} handle */
$.CancelScheduled = function(handle) {};
/** @param {...*} var_args */
$.DispatchEvent = function(var_args) {};
/** @param {string} type @param {*} parent @param {string} id @return {*} */
$.CreatePanel = function(type, parent, id) {};
/** @return {*} */
$.GetContextPanel = function() {};
var GameUI = {};
var SteamOverlayAPI = {};
Object.prototype.handleRejuvPingActivate;
Object.prototype.handleBuffPingActivate;
/** @param {string} id @return {*} */
Object.prototype.FindChildTraverse = function(id) {};
/** @param {string} className @return {!Array<*>} */
Object.prototype.FindChildrenWithClassTraverse = function(className) {};
/** @return {!Array<*>} */
Object.prototype.Children = function() {};
/** @return {*} */
Object.prototype.GetParent = function() {};
/** @param {number} index @return {*} */
Object.prototype.GetChild = function(index) {};
/** @return {number} */
Object.prototype.GetChildCount = function() {};
/** @param {string} className @return {boolean} */
Object.prototype.BHasClass = function(className) {};
/** @param {string} className */
Object.prototype.AddClass = function(className) {};
/** @param {string} className */
Object.prototype.RemoveClass = function(className) {};
/** @param {string} className @param {boolean} enabled */
Object.prototype.SetHasClass = function(className, enabled) {};
/** @param {string} src */
Object.prototype.SetImage = function(src) {};
/** @param {number} delay */
Object.prototype.DeleteAsync = function(delay) {};
/** @return {boolean} */
Object.prototype.IsValid = function() {};
Object.prototype.id;
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



# Clean rebuild: remove stale compiled output and previous pack artifacts.
Remove-TreeUnderRoot -Path $modCompiled -RootPath $root -ExpectedLeaf 'buff_timer_virgin_compiled'
Remove-TreeUnderRoot -Path $stagingSrc -RootPath $root -ExpectedLeaf 'buff_timer_virgin_terser'
Remove-TreeUnderRoot -Path $stagingCompiled -RootPath $root -ExpectedLeaf 'buff_timer_virgin_terser_compiled'
if (Test-Path $vpkOut) { Remove-Item -Force $vpkOut }

# [1/4] Prepare Closure ADVANCED source
Write-Host "`n[1/4] Preparing Closure ADVANCED buff_timer_virgin source..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $stagingSrc -Force | Out-Null
Copy-Item -Path (Join-Path $modSrc 'panorama') -Destination $stagingSrc -Recurse -Force

$sourceScript = Join-Path $modSrc $scriptRelative
$compressedScript = Join-Path $stagingSrc $scriptRelative
if (-not (Test-Path $compressedScript)) {
    throw "Compressed script target was not created: $compressedScript"
}

$runtimeValidator = Join-Path $root 'buff_timer_virgin\scripts\validate-runtime-engine.js'
& node $runtimeValidator
if ($LASTEXITCODE -ne 0) {
    throw "Runtime engine validator failed with exit code $LASTEXITCODE"
}

$teamChatValidator = Join-Path $root 'buff_timer_virgin\scripts\validate-team-chat-intent.js'
& node $teamChatValidator
if ($LASTEXITCODE -ne 0) {
    throw "Team chat validator failed with exit code $LASTEXITCODE"
}
$stagedSource = [System.IO.File]::ReadAllText($compressedScript)
$productionSource = [regex]::Replace(
    $stagedSource,
    '(?s)\s*// TEST_EXPORTS_BEGIN.*?// TEST_EXPORTS_END\s*',
    "`r`n"
)
if ($productionSource -eq $stagedSource) {
    throw "Test export markers were not found in staged runtime source"
}
[System.IO.File]::WriteAllText(
    $compressedScript,
    $productionSource,
    [System.Text.UTF8Encoding]::new($false)
)

$closureOutput = "$compressedScript.closure.js"


$closureExterns = New-BuffTimerClosureExterns -Path (Join-Path $stagingSrc 'closure-externs.js')
$closureArgs = @(
    '--yes'
    'google-closure-compiler'
    '--externs'
    $closureExterns
    '--js'
    $compressedScript
    '--compilation_level'
    'ADVANCED'
    '--js_output_file'
    $closureOutput
)

& npx @closureArgs
if ($LASTEXITCODE -ne 0) {
    throw "Closure ADVANCED failed with exit code $LASTEXITCODE"
}
Move-Item -LiteralPath $closureOutput -Destination $compressedScript -Force

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
$compileScript = Join-Path $stagingCompiled 'panorama\scripts\rejuvnbufftimer.vjs_c'
$compileLayout = Join-Path $stagingCompiled 'panorama\layout\hud.vxml_c'
$compileTimerStyle = Join-Path $stagingCompiled 'panorama\styles\hud_timer.vcss_c'
$compileClaimStyle = Join-Path $stagingCompiled 'panorama\styles\buff_claim.vcss_c'
Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stagingSrc -RequiredOutputs @(
    $compileScript,
    $compileLayout,
    $compileTimerStyle,
    $compileClaimStyle
) -TimeoutSeconds 120
Copy-Item -Path $stagingCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# [3/4] Pack VPK
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$packedTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets -Tree $packedTree -Label 'Buff Timer VPK' -Required @(
    'panorama/scripts/rejuvnbufftimer.vjs_c',
    'panorama/layout/hud.vxml_c',
    'panorama/styles/hud_timer.vcss_c',
    'panorama/styles/buff_claim.vcss_c'
) -Forbidden @(
    'scripts/validate-runtime-engine.vjs_c',
    'scripts/validate-team-chat-intent.vjs_c'
)
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
