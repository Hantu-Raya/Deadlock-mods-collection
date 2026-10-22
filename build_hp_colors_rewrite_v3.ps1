[CmdletBinding()]
param(
    [switch]$SkipDeploy,
    [switch]$CheckUpstream,
    [switch]$AllowPinMismatch,
    [string]$InstalledSteamInf = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\steam.inf'
)

$ErrorActionPreference = 'Stop'
# -Debug is the native CmdletBinding common switch; do not redeclare it.
$isDebug = $PSBoundParameters.ContainsKey('Debug') -and [bool]$PSBoundParameters['Debug']
if (-not $SkipDeploy) { throw 'V3 is build-only. Pass -SkipDeploy; deployment is not implemented.' }
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-v3-pipeline.ps1')
$source = Join-Path $root 'hp_colors_rewrite_v3'
$buildRoot = Join-Path $source '.build'
# Local installed-version guard is offline and runs before tool resolution or stage cleanup.
$pinCheckArgs = @('--check-installed', $InstalledSteamInf)
if ($AllowPinMismatch) { $pinCheckArgs += '--allow-pin-mismatch' }
& node (Join-Path $source 'tools\game-data.js') @pinCheckArgs
if ($LASTEXITCODE -ne 0) { throw 'V3 installed-version check failed; see ClientVersion mismatch/metadata details above.' }
$mode = if ($isDebug) { 'debug' } else { 'release' }
$stage = Join-Path $buildRoot $mode
$stageSource = Join-Path $stage 'hp_colors_rewrite_v3'
$compiled = Join-Path $stage 'hp_colors_rewrite_v3_compiled'
$vpk = Join-Path $stage 'pak02_dir.vpk'
$vpkTool = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$assets = Get-HpV3Assets

# Network is opt-in: resolve upstream HEAD once and fail before staging if any pin has drifted.
if ($CheckUpstream) {
    & node (Join-Path $source 'tools\game-data.js') --check-upstream
    if ($LASTEXITCODE -ne 0) { throw 'Upstream v3 game data changed or could not be checked; review the drift report and rebase explicitly.' }
}
& node (Join-Path $source 'tools\generate.js') --check
if ($LASTEXITCODE -ne 0) { throw 'V3 generation check failed; see pin mismatch/stale-file details above. Run tools/generate.js only after reviewing inputs.' }

# Clean only this v3 mode before compilation: stale outputs cannot count as success.
Remove-TreeUnderRoot -Path $stage -RootPath $buildRoot -ExpectedLeaf $mode
New-Item -ItemType Directory -Path $stageSource -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'panorama') -Destination $stageSource -Recurse
$transformArgs = @((Join-Path $stageSource 'panorama\scripts'))
$transformArgs += if ($isDebug) { '--debug' } else { '--minify' }
& node (Join-Path $source 'tools\stage-scripts.js') @transformArgs
if ($LASTEXITCODE -ne 0) { throw 'V3 staged-script transform failed; see recursive logging/debug-marker error above.' }

# The same E2E seam boots the exact transformed scripts that will be compiled.
$previousSource = $env:HPV3_SOURCE_ROOT
$previousDebug = $env:HPV3_DEBUG
try {
    $env:HPV3_SOURCE_ROOT = $stageSource
    $env:HPV3_DEBUG = if ($isDebug) { '1' } else { '0' }
    Invoke-HpV3Suite -Root $root -StageSource $stageSource -Mode $mode
}
finally {
    $env:HPV3_SOURCE_ROOT = $previousSource
    $env:HPV3_DEBUG = $previousDebug
}

Invoke-HpV3CompileAndPack -Root $root -Stage $stage -StageSource $stageSource -Compiled $compiled -Vpk $vpk -Assets $assets `
    -Forbidden @('.js', '.xml', '.css', 'hp_colors_v2', 'unit_status_v2_colors', 'panorama/scripts/hp_colors_v3_timers.vjs_c') -VpkTool $vpkTool -Viewer $viewer -Label 'HPV3 pak02'
Write-Host "HPV3 $mode build complete: $vpk"
Write-Host 'Deployment skipped; this wrapper has no game-folder writes.'
