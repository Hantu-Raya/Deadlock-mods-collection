[CmdletBinding()]
param(
    [switch]$SkipDeploy,
    [switch]$AllowPinMismatch,
    [string]$InstalledSteamInf = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\steam.inf'
)

# HP Colors v3 ShowRank pak02 (SPEC story 52): the canonical v3 runtime plus this lane's composed Escape
# menu/topbar, which add the ShowRank barebones pieces to v3's layouts. ShowRank itself stays pak89 (its
# runtime, stylesheets and other layouts are not repacked here); the composed pak02 overrides the two
# layouts both mods replace. The lane consumes hp_colors_rewrite_v3 and showrank_barebones; the canonical
# lane never depends on it. Build-only: this wrapper never writes the game folder.
$ErrorActionPreference = 'Stop'
# -Debug is the native CmdletBinding common switch; do not redeclare it.
$isDebug = $PSBoundParameters.ContainsKey('Debug') -and [bool]$PSBoundParameters['Debug']
if (-not $SkipDeploy) { throw 'The v3 ShowRank variant is build-only. Pass -SkipDeploy; deployment is not implemented.' }
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-v3-pipeline.ps1')
$v3 = Join-Path $root 'hp_colors_rewrite_v3'
$lane = Join-Path $root 'hp_colors_rewrite_v3_showrank'
$buildRoot = Join-Path $lane '.build'
$pinCheckArgs = @('--check-installed', $InstalledSteamInf)
if ($AllowPinMismatch) { $pinCheckArgs += '--allow-pin-mismatch' }
& node (Join-Path $v3 'tools\game-data.js') @pinCheckArgs
if ($LASTEXITCODE -ne 0) { throw 'V3 installed-version check failed; see ClientVersion mismatch/metadata details above.' }
$mode = if ($isDebug) { 'debug' } else { 'release' }
$stage = Join-Path $buildRoot $mode
# The compile tree keeps the canonical name so the outputs match the v3 asset paths.
$stageSource = Join-Path $stage 'hp_colors_rewrite_v3'
$stageLane = Join-Path $stage 'hp_colors_rewrite_v3_showrank'
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
# ShowRank adds no asset to pak02: its script, styles and other layouts stay in pak89.
$assets = @(Get-HpV3Assets)
$composer = Join-Path $lane 'tools\showrank.js'

# Both lanes must be current: v3's generated outputs, then this lane's composed layouts (release rule: a
# v3 menu change or a ShowRank layout change leaves them stale until tools/showrank.js recomposes them).
& node (Join-Path $v3 'tools\generate.js') --check
if ($LASTEXITCODE -ne 0) { throw 'V3 generation check failed; run hp_colors_rewrite_v3/tools/generate.js after reviewing inputs.' }
& node $composer --check
if ($LASTEXITCODE -ne 0) { throw 'ShowRank layouts are stale; run hp_colors_rewrite_v3_showrank/tools/showrank.js after reviewing the v3 menu or ShowRank layout change.' }

# The ShowRank dependency must carry the runtime these layouts call: the installed pak89 or the repo build.
$showrankScript = 'panorama/scripts/showrank_barebones.vjs_c'
$addons = Join-Path (Split-Path -Parent $InstalledSteamInf) 'addons'
$dependencies = @((Join-Path $addons 'pak89_dir.vpk'), (Join-Path $root 'showrank_barebones_dir.vpk')) | Where-Object { Test-Path -LiteralPath $_ }
$carrier = $null
foreach ($candidate in $dependencies) {
    $listing = @(Get-PackedVpkTree -VpkEditCli $vpkTool -VpkPath $candidate -Source2ViewerPath $viewer | ForEach-Object { ($_.Trim()) -replace ' CRC:[0-9a-fA-F]+ size:\d+$', '' })
    if ($listing -contains $showrankScript) { $carrier = $candidate; break }
    Write-Warning "ShowRank dependency $candidate does not contain $showrankScript"
}
if (-not $carrier) { throw "ShowRank dependency missing: neither installed pak89_dir.vpk ($addons) nor showrank_barebones_dir.vpk contains $showrankScript. Build/install ShowRank barebones first." }
Write-Host "ShowRank dependency verified: $carrier"

Remove-TreeUnderRoot -Path $stage -RootPath $buildRoot -ExpectedLeaf $mode
New-Item -ItemType Directory -Path $stageSource, $stageLane -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $v3 'panorama') -Destination $stageSource -Recurse
Copy-Item -LiteralPath (Join-Path $lane 'panorama') -Destination $stageLane -Recurse
$transformArgs = @((Join-Path $stageSource 'panorama\scripts'))
$transformArgs += if ($isDebug) { '--debug' } else { '--minify' }
& node (Join-Path $v3 'tools\stage-scripts.js') @transformArgs
if ($LASTEXITCODE -ne 0) { throw 'V3 staged-script transform failed; see recursive logging/debug-marker error above.' }

# Both suites boot the exact transformed v3 scripts that will be compiled; the lane suite boots the
# composed layouts staged for this build.
$saved = @{}
foreach ($name in 'HPV3_SOURCE_ROOT', 'HPV3_DEBUG', 'HPV3_SHOWRANK_SOURCE_ROOT') {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}
try {
    $env:HPV3_SOURCE_ROOT = $stageSource
    $env:HPV3_DEBUG = if ($isDebug) { '1' } else { '0' }
    $env:HPV3_SHOWRANK_SOURCE_ROOT = $stageLane
    Invoke-HpV3Suite -Root $root -StageSource $stageSource -Mode $mode
    $testFiles = @(Get-ChildItem -LiteralPath (Join-Path $lane 'tests') -Filter '*.test.js' -File | Sort-Object Name | ForEach-Object { $_.FullName })
    & node --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw "Staged VM tests failed: $(Join-Path $lane 'tests')" }
}
finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
}

# Compile input: the staged v3 tree with this lane's composed layouts laid over it.
Copy-Item -Path (Join-Path $stageLane 'panorama\*') -Destination (Join-Path $stageSource 'panorama') -Recurse -Force
# ShowRank keeps all of its own code in pak89: none of it may ship in this pak02.
Invoke-HpV3CompileAndPack -Root $root -Stage $stage -StageSource $stageSource -Compiled $compiled -Vpk $vpk -Assets $assets `
    -Forbidden @('.js', '.xml', '.css', 'hp_colors_v2', 'unit_status_v2_colors', 'panorama/scripts/hp_colors_v3_timers.vjs_c', 'showrank_barebones') `
    -VpkTool $vpkTool -Viewer $viewer -Label 'HPV3 ShowRank pak02'
Write-Host "HPV3 ShowRank $mode build complete: $vpk"
Write-Host 'Deployment skipped; this wrapper has no game-folder writes. Install ShowRank barebones as pak89 and this build as pak02.'
