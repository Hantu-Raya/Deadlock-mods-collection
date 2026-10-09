param([switch]$SkipDeploy)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$modSrc = Join-Path $root 'buff_timer_virgin'
$modCompiled = Join-Path $root 'buff_timer_virgin_compiled'
$closureSrc = Join-Path $root 'buff_timer_virgin_closure'
$closureCompiled = Join-Path $root 'buff_timer_virgin_closure_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak98_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk'
$timerScriptRelative = 'panorama\scripts\rejuvnbufftimer.js'
$settingsScriptRelative = 'panorama\scripts\bt_minimap_settings.js'

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
/** @param {string} eventName @param {!Function} callback */
Object.prototype.SetPanelEvent = function(eventName, callback) {};
/** @param {string} key @param {number} fallback @return {number} */
Object.prototype.GetAttributeInt = function(key, fallback) {};
/** @param {string} key @param {number} value */
Object.prototype.SetAttributeInt = function(key, value) {};
/** @param {string} key @param {string} fallback @return {string} */
Object.prototype.GetAttributeString = function(key, fallback) {};
/** @param {string} key @param {string} value */
Object.prototype.SetAttributeString = function(key, value) {};
/** @param {string} layout @param {boolean} a @param {boolean} b @return {boolean} */
Object.prototype.BLoadLayout = function(layout, a, b) {};
/** @param {string} id @return {*} */
Object.prototype.FindChildTraverse = function(id) {};
/** @param {string} className @return {!Array<*>} */
Object.prototype.FindChildrenWithClassTraverse = function(className) {};
/** @return {!Array<*>} */
Object.prototype.Children = function() {};
/** @return {*} */
Object.prototype.GetParent = function() {};
/** @param {*} child @param {*} before */
Object.prototype.MoveChildBefore = function(child, before) {};
/** @param {*} child @param {*} after */
Object.prototype.MoveChildAfter = function(child, after) {};
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
Object.prototype.paneltype;
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

function New-BuffSettingsClosureExterns {
    param([Parameter(Mandatory = $true)][string]$Path)

    $externs = @'
/** @externs */
var $ = {};
/** @return {*} */
$.GetContextPanel = function() {};
/** @param {string} type @param {*} parent @param {string} id @param {*=} props @return {*} */
$.CreatePanel = function(type, parent, id, props) {};
/** @param {number} delay @param {function()} callback @return {*} */
$.Schedule = function(delay, callback) {};
/** @param {*} handle */
$.CancelScheduled = function(handle) {};
/** @param {...*} var_args */
$.DispatchEvent = function(var_args) {};
/** @param {string} eventName @param {*} panel @param {!Function} callback @return {*} */
$.RegisterEventHandler = function(eventName, panel, callback) {};
/** @return {boolean} */
Object.prototype.IsValid = function() {};
/** @return {*} */
Object.prototype.GetParent = function() {};
/** @param {string} className @return {boolean} */
Object.prototype.BHasClass = function(className) {};
/** @param {string} className @param {boolean} enabled */
Object.prototype.SetHasClass = function(className, enabled) {};
/** @param {string} id @return {*} */
Object.prototype.FindChildTraverse = function(id) {};
/** @param {string} className @return {!Array<*>} */
Object.prototype.FindChildrenWithClassTraverse = function(className) {};
/** @param {string} layout @param {boolean} a @param {boolean} b @return {boolean} */
Object.prototype.BLoadLayout = function(layout, a, b) {};
/** @param {number} delay */
Object.prototype.DeleteAsync = function(delay) {};
/** @param {string} key @param {number} fallback @return {number} */
Object.prototype.GetAttributeInt = function(key, fallback) {};
/** @param {string} key @param {number} value */
Object.prototype.SetAttributeInt = function(key, value) {};
/** @param {string} eventName @param {!Function} callback */
Object.prototype.SetPanelEvent = function(eventName, callback) {};
/** @param {string} url */
Object.prototype.SetURL = function(url) {};
Object.prototype.SetFocus = function() {};
/** @return {!Array<*>} */
Object.prototype.Children = function() {};
Object.prototype.paneltype;
Object.prototype.id;
Object.prototype.text;
Object.prototype.style;
Object.prototype.washColor;
Object.prototype.backgroundColor;
Object.prototype.visible;
Object.prototype.hittestchildren;
Object.prototype.hittest;
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
Remove-TreeUnderRoot -Path $closureSrc -RootPath $root -ExpectedLeaf 'buff_timer_virgin_closure'
Remove-TreeUnderRoot -Path $closureCompiled -RootPath $root -ExpectedLeaf 'buff_timer_virgin_closure_compiled'
if (Test-Path $vpkOut) { Remove-Item -Force $vpkOut }

# [1/4] Validate and prepare both Closure ADVANCED scripts
Write-Host "`n[1/4] Validating and preparing Closure ADVANCED buff_timer_virgin scripts..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $closureSrc -Force | Out-Null
Copy-Item -Path (Join-Path $modSrc 'panorama') -Destination $closureSrc -Recurse -Force

$compressedScript = Join-Path $closureSrc $timerScriptRelative
$compressedSettingsScript = Join-Path $closureSrc $settingsScriptRelative
foreach ($script in @($compressedScript, $compressedSettingsScript)) {
    if (-not (Test-Path $script)) {
        throw "Compressed script target was not created: $script"
    }
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

# Boots the runtime against the local hpv2-store /bt/ page (D:/hpv2-store/bt/index.html), not the live one.
$settingsValidator = Join-Path $root 'buff_timer_virgin\scripts\validate-settings-store.js'
& node $settingsValidator
if ($LASTEXITCODE -ne 0) {
    throw "Settings store validator failed with exit code $LASTEXITCODE"
}
# Movable timer widgets: both scripts together, drag/resize/side/DONE/CANCEL and the schema 3 layout record.
$layoutValidator = Join-Path $root 'buff_timer_virgin\scripts\validate-layout-editor.js'
& node $layoutValidator
if ($LASTEXITCODE -ne 0) {
    throw "Layout editor validator failed with exit code $LASTEXITCODE"
}
# Claim/glow colours and glow strength: picking, painting, saving (schema 4) and the page size limit.
$lookValidator = Join-Path $root 'buff_timer_virgin\scripts\validate-look.js'
& node $lookValidator
if ($LASTEXITCODE -ne 0) {
    throw "Look validator failed with exit code $LASTEXITCODE"
}
foreach ($script in @($compressedScript, $compressedSettingsScript)) {
    $stagedSource = [System.IO.File]::ReadAllText($script)
    $productionSource = [regex]::Replace(
        $stagedSource,
        '(?s)\s*// TEST_EXPORTS_BEGIN.*?// TEST_EXPORTS_END\s*',
        "`r`n"
    )
    if ($productionSource -eq $stagedSource) {
        throw "Test export markers were not found in staged source: $script"
    }
    [System.IO.File]::WriteAllText(
        $script,
        $productionSource,
        [System.Text.UTF8Encoding]::new($false)
    )
}

$closureOutput = "$compressedScript.closure.js"


$closureExterns = New-BuffTimerClosureExterns -Path (Join-Path $closureSrc 'closure-externs.js')
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

$closureLog = & npx @closureArgs 2>&1 | ForEach-Object { "$_" }
$closureExitCode = $LASTEXITCODE
$closureLog | ForEach-Object { Write-Host $_ }
if ($closureExitCode -ne 0) {
    throw "Timer Closure ADVANCED failed with exit code $closureExitCode"
}
if ($closureLog -match 'WARNING - ') {
    throw "Timer Closure ADVANCED reported warnings (must be 0)"
}
Move-Item -LiteralPath $closureOutput -Destination $compressedScript -Force

$scriptInfo = Assert-ClosureOutput -Path $compressedScript -MinBytes 8192 -RequiredFragments @(
    '$.Schedule',
    'RejuvTime',
    'BuffTime',
    'bt_timer_gen',
    'bt_linger_prev',
    'TimerOverlayFrame',
    'MinimapGlowClip',
    'BTLingerLayer',
    'BTTimerDock',
    'minimap_persp',
    'HudMinimapContainer',
    'file://{resources}/layout/bt_timer_overlay.xml',
    'file://{resources}/layout/bt_minimap_glow.xml',
    'file://{resources}/layout/bt_linger_layer.xml'
)
Remove-Item -LiteralPath $closureExterns -Force
Write-Host "  Closure ADVANCED OK -> $compressedScript ($([math]::Round($scriptInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green

$settingsOutput = "$compressedSettingsScript.closure.js"
$settingsExterns = New-BuffSettingsClosureExterns -Path (Join-Path $closureSrc 'settings-closure-externs.js')
$closureArgs = @(
    '--yes'
    'google-closure-compiler'
    '--externs'
    $settingsExterns
    '--js'
    $compressedSettingsScript
    '--compilation_level'
    'ADVANCED'
    '--js_output_file'
    $settingsOutput
)
$closureLog = & npx @closureArgs 2>&1 | ForEach-Object { "$_" }
$closureExitCode = $LASTEXITCODE
$closureLog | ForEach-Object { Write-Host $_ }
if ($closureExitCode -ne 0) {
    throw "Settings Closure ADVANCED failed with exit code $closureExitCode"
}
if ($closureLog -match 'WARNING - ') {
    throw "Settings Closure ADVANCED reported warnings (must be 0)"
}
Move-Item -LiteralPath $settingsOutput -Destination $compressedSettingsScript -Force
$settingsInfo = Assert-ClosureOutput -Path $compressedSettingsScript -MinBytes 4096 -RequiredFragments @(
    'https://hantu-raya.github.io/hpv2-store/bt/',
    'BTS1:',
    'onvaluechanged',
    'BTSpectrum',
    'BTPreset',
    'ontextentrysubmit',
    'DropInputFocus',
    'BTMinimapSettingsHost',
    'file://{resources}/layout/bt_minimap_settings.xml',
    'bt-linger-off',
    'bt-glow-off',
    'bt_settings_gen'
)
Remove-Item -LiteralPath $settingsExterns -Force
Write-Host "  Closure ADVANCED OK -> $compressedSettingsScript ($([math]::Round($settingsInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green
# The shipped (renamed) scripts must still place, edit, save and restore the movable widgets.
$closureLayoutValidator = Join-Path $root 'buff_timer_virgin\scripts\validate-closure-layout.js'
& node $closureLayoutValidator (Split-Path -Parent $compressedScript)
if ($LASTEXITCODE -ne 0) {
    throw "Minified layout validator failed with exit code $LASTEXITCODE"
}

# [2/4] Compile two scripts, five layouts and four styles
Write-Host "`n[2/4] Compiling buff_timer_virgin..." -ForegroundColor Cyan
$compileScript = Join-Path $closureCompiled 'panorama\scripts\rejuvnbufftimer.vjs_c'
$compileSettingsScript = Join-Path $closureCompiled 'panorama\scripts\bt_minimap_settings.vjs_c'
$compileTimerOverlayLayout = Join-Path $closureCompiled 'panorama\layout\bt_timer_overlay.vxml_c'
$compileGlowLayout = Join-Path $closureCompiled 'panorama\layout\bt_minimap_glow.vxml_c'
$compileLingerLayout = Join-Path $closureCompiled 'panorama\layout\bt_linger_layer.vxml_c'
$compileMinimapLayout = Join-Path $closureCompiled 'panorama\layout\hud_minimap.vxml_c'
$compileSettingsLayout = Join-Path $closureCompiled 'panorama\layout\bt_minimap_settings.vxml_c'
$compileTimerStyle = Join-Path $closureCompiled 'panorama\styles\hud_timer.vcss_c'
$compileClaimStyle = Join-Path $closureCompiled 'panorama\styles\buff_claim.vcss_c'
$compileArrowStyle = Join-Path $closureCompiled 'panorama\styles\bt_minimap_arrows.vcss_c'
$compileSettingsStyle = Join-Path $closureCompiled 'panorama\styles\bt_minimap_settings.vcss_c'
Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $closureSrc -RequiredOutputs @(
    $compileScript,
    $compileSettingsScript,
    $compileTimerOverlayLayout,
    $compileGlowLayout,
    $compileLingerLayout,
    $compileMinimapLayout,
    $compileSettingsLayout,
    $compileTimerStyle,
    $compileClaimStyle,
    $compileArrowStyle,
    $compileSettingsStyle
) -TimeoutSeconds 120 -HiddenWindow
Copy-Item -Path $closureCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# [3/4] Pack VPK
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$packedTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets -Tree $packedTree -Label 'Buff Timer VPK' -Required @(
    'panorama/scripts/rejuvnbufftimer.vjs_c',
    'panorama/scripts/bt_minimap_settings.vjs_c',
    'panorama/layout/bt_timer_overlay.vxml_c',
    'panorama/layout/bt_minimap_glow.vxml_c',
    'panorama/layout/bt_linger_layer.vxml_c',
    'panorama/layout/hud_minimap.vxml_c',
    'panorama/layout/bt_minimap_settings.vxml_c',
    'panorama/styles/hud_timer.vcss_c',
    'panorama/styles/buff_claim.vcss_c',
    'panorama/styles/bt_minimap_arrows.vcss_c',
    'panorama/styles/bt_minimap_settings.vcss_c'
) -Forbidden @(
    'panorama/layout/hud.vxml_c',
    'panorama/layout/bt_claim_overlay.vxml_c',
    'scripts/validate-runtime-engine.vjs_c',
    'scripts/validate-team-chat-intent.vjs_c',
    'panorama/styles/hud_minimap.vcss_c'
)
$vpkSize = (Get-Item $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green
if ($SkipDeploy) {
    Write-Host "  SkipDeploy specified; packaged VPK assertions passed. Skipping deployment." -ForegroundColor Yellow
    return
}

# [4/4] Deploy
Write-Host "`n[4/4] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path $destDir)) {
    throw "Destination folder not found: $destDir"
}
Copy-Item -Path $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`nDone! Launch Deadlock to test." -ForegroundColor Yellow
