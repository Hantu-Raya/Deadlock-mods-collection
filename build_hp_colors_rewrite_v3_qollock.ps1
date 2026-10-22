[CmdletBinding()]
param(
    [switch]$SkipDeploy,
    [switch]$AllowPinMismatch,
    [string]$InstalledSteamInf = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\steam.inf'
)

# HP Colors v3 QOLLOCK pak02 (ticket 22b): the canonical v3 runtime plus this lane's composed Escape
# menu/topbar and window bridge, for the pinned QOLLOCK pak03 (QOLLOCK keeps hud.xml). The lane consumes
# hp_colors_rewrite_v3; the canonical lane never depends on it. Build-only: the installed pak03 here is
# not QOLLOCK.
$ErrorActionPreference = 'Stop'
# -Debug is the native CmdletBinding common switch; do not redeclare it.
$isDebug = $PSBoundParameters.ContainsKey('Debug') -and [bool]$PSBoundParameters['Debug']
if (-not $SkipDeploy) { throw 'The v3 QOLLOCK variant is build-only. Pass -SkipDeploy; deployment is not implemented.' }
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-v3-pipeline.ps1')
$v3 = Join-Path $root 'hp_colors_rewrite_v3'
$lane = Join-Path $root 'hp_colors_rewrite_v3_qollock'
$buildRoot = Join-Path $lane '.build'
$pinCheckArgs = @('--check-installed', $InstalledSteamInf)
if ($AllowPinMismatch) { $pinCheckArgs += '--allow-pin-mismatch' }
& node (Join-Path $v3 'tools\game-data.js') @pinCheckArgs
if ($LASTEXITCODE -ne 0) { throw 'V3 installed-version check failed; see ClientVersion mismatch/metadata details above.' }
$mode = if ($isDebug) { 'debug' } else { 'release' }
$stage = Join-Path $buildRoot $mode
# The compile tree keeps the canonical name so the outputs match the v3 asset paths.
$stageSource = Join-Path $stage 'hp_colors_rewrite_v3'
$stageLane = Join-Path $stage 'hp_colors_rewrite_v3_qollock'
$compiled = Join-Path $stage 'hp_colors_rewrite_v3_compiled'
$vpk = Join-Path $stage 'pak02_dir.vpk'
$pinned = Join-Path $stage 'pin'
$vpkTool = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$assets = @(Get-HpV3Assets) + 'panorama/scripts/hp_colors_v3_qollock_bridge.vjs_c'
$composer = Join-Path $lane 'tools\qollock.js'

# Both lanes must be current: v3's generated outputs, then this lane's composed layouts (release rule:
# a v3 menu change leaves them stale until tools/qollock.js recomposes them).
& node (Join-Path $v3 'tools\generate.js') --check
if ($LASTEXITCODE -ne 0) { throw 'V3 generation check failed; run hp_colors_rewrite_v3/tools/generate.js after reviewing inputs.' }
& node $composer --check
if ($LASTEXITCODE -ne 0) { throw 'QOLLOCK layouts are stale; run hp_colors_rewrite_v3_qollock/tools/qollock.js after reviewing the v3 menu change.' }

Remove-TreeUnderRoot -Path $stage -RootPath $buildRoot -ExpectedLeaf $mode
New-Item -ItemType Directory -Path $stageSource, $stageLane -Force | Out-Null
# The pinned pak03 (and the release zip when present) must match vendor/pin.json, and a fresh decompile
# must still match the vendored layouts and the reviewed QOLLOCK entries.
$inputs = @(& node $composer --verify-inputs $root)
if ($LASTEXITCODE -ne 0) { throw 'QOLLOCK pin check failed; see the pak03/zip hash details above.' }
$inputs | Select-Object -SkipLast 1 | ForEach-Object { Write-Host $_ }
& $viewer -i $inputs[-1] -o $pinned -d | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Pinned QOLLOCK pak03 decompilation failed with exit code $LASTEXITCODE" }
& node $composer --verify $pinned
if ($LASTEXITCODE -ne 0) { throw 'Pinned QOLLOCK pak03 no longer matches the lane vendor files; re-review ticket 22b before re-pinning.' }

Copy-Item -LiteralPath (Join-Path $v3 'panorama') -Destination $stageSource -Recurse
Copy-Item -LiteralPath (Join-Path $lane 'panorama') -Destination $stageLane -Recurse
foreach ($scripts in @((Join-Path $stageSource 'panorama\scripts'), (Join-Path $stageLane 'panorama\scripts'))) {
    $transformArgs = @($scripts)
    $transformArgs += if ($isDebug) { '--debug' } else { '--minify' }
    & node (Join-Path $v3 'tools\stage-scripts.js') @transformArgs
    if ($LASTEXITCODE -ne 0) { throw "Staged-script transform failed for $scripts; see recursive logging/debug-marker error above." }
}

# Both suites boot the exact transformed scripts that will be compiled; the lane suite must use the real
# pinned QOLLOCK runtime (no skips).
$saved = @{}
foreach ($name in 'HPV3_SOURCE_ROOT', 'HPV3_DEBUG', 'HPV3_QOLLOCK_SOURCE_ROOT', 'HPV3_QOLLOCK_ROOT', 'HPV3_QOLLOCK_REQUIRED') {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}
try {
    $env:HPV3_SOURCE_ROOT = $stageSource
    $env:HPV3_DEBUG = if ($isDebug) { '1' } else { '0' }
    $env:HPV3_QOLLOCK_SOURCE_ROOT = $stageLane
    $env:HPV3_QOLLOCK_ROOT = $pinned
    $env:HPV3_QOLLOCK_REQUIRED = '1'
    Invoke-HpV3Suite -Root $root -StageSource $stageSource -Mode $mode
    $testFiles = @(Get-ChildItem -LiteralPath (Join-Path $lane 'tests') -Filter '*.test.js' -File | Sort-Object Name | ForEach-Object { $_.FullName })
    & node --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw "Staged VM tests failed: $(Join-Path $lane 'tests')" }
}
finally {
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
}

# Compile input: the staged v3 tree with this lane's layouts and bridge laid over it.
Copy-Item -Path (Join-Path $stageLane 'panorama\*') -Destination (Join-Path $stageSource 'panorama') -Recurse -Force
# QOLLOCK keeps hud.xml and all of its own code: none of it may ship in this pak02.
Invoke-HpV3CompileAndPack -Root $root -Stage $stage -StageSource $stageSource -Compiled $compiled -Vpk $vpk -Assets $assets `
    -Forbidden @('.js', '.xml', '.css', 'hp_colors_v2', 'unit_status_v2_colors', 'panorama/scripts/hp_colors_v3_timers.vjs_c', 'panorama/layout/hud.vxml_c', 'ql_', 'qollock_hp_colors_bridge') `
    -VpkTool $vpkTool -Viewer $viewer -Label 'HPV3 QOLLOCK pak02'
$packedCheck = Join-Path $stage 'packed-check'
& $viewer -i $vpk -o $packedCheck -d | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Packed QOLLOCK pak02 decompilation failed with exit code $LASTEXITCODE" }
& node $composer --check-packed $packedCheck
if ($LASTEXITCODE -ne 0) { throw 'Packed QOLLOCK layouts lost composed includes, ids or structure.' }
Write-Host "HPV3 QOLLOCK $mode build complete: $vpk"
Write-Host 'Deployment skipped; never install this pak02 over a non-QOLLOCK pak03.'
