[CmdletBinding()]
param([switch]$Deploy, [switch]$ShowRankBarebones)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')
$stage = Join-Path $root '_test_hp_colors_v2_showrank_build'
$source = Join-Path $stage 'runtime'
$compiled = Join-Path $stage 'runtime_compiled'
$out = Join-Path $PSScriptRoot 'pak02_dir.vpk'
$packer = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$assets = @(
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/layout/unit_status_overlay_v2.vxml_c',
    'panorama/styles/hp_colors_v2_menu.vcss_c',
    'panorama/styles/unit_status_v2.vcss_c',
    'panorama/images/hpv2/ultimate_progress.vtex_c',
    'panorama/scripts/hp_colors_v2_contract.vjs_c',
    'panorama/scripts/hp_colors_v2_state.vjs_c',
    'panorama/scripts/hp_colors_v2_menu.vjs_c',
    'panorama/scripts/unit_status_v2_colors.vjs_c',
    'panorama/layout/citadel_hud_top_bar.vxml_c',
    'panorama/layout/test_event_relay.vxml_c',
    'panorama/scripts/test_event_bridge.vjs_c',
    'panorama/scripts/test_topbar_pickups.vjs_c'
)
& node (Join-Path $PSScriptRoot 'scripts\validate-timers.js') $PSScriptRoot
if ($LASTEXITCODE -ne 0) { throw 'Timer state and native progress validation failed' }
foreach ($name in @('hp_colors_v2_contract.js', 'hp_colors_v2_state.js', 'hp_colors_v2_menu.js', 'unit_status_v2_colors.js', 'test_event_bridge.js', 'test_topbar_pickups.js')) {
    & node --check (Join-Path $PSScriptRoot "panorama\scripts\$name")
    if ($LASTEXITCODE -ne 0) { throw "Runtime script syntax check failed: $name" }
}
Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_test_hp_colors_v2_showrank_build'
try {
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'panorama') -Destination $source -Recurse
    if (-not $ShowRankBarebones) {
        foreach ($layoutName in @('hud_escape_menu.xml', 'citadel_hud_top_bar.xml')) {
            $layoutPath = Join-Path $source "panorama\layout\$layoutName"
            [xml]$layout = [System.IO.File]::ReadAllText($layoutPath)
            foreach ($node in @($layout.SelectNodes("//include[contains(@src,'showrank_barebones')] | //*[@id='ShowRankBarebonesNotificationRoot' or @id='ShowRankBarebonesTeamAverageLayer']"))) {
                [void]$node.ParentNode.RemoveChild($node)
            }
            $layout.Save($layoutPath)
        }
    }
    $scripts = @('hp_colors_v2_contract.js', 'hp_colors_v2_state.js', 'hp_colors_v2_menu.js', 'unit_status_v2_colors.js') | ForEach-Object { 'panorama/scripts/' + $_ }
    Invoke-HpColorsRewriteClosureAdvanced -StageSourceRoot $source -ScriptRelativePaths $scripts -WorkRoot $stage
    & node (Join-Path $PSScriptRoot 'scripts\validate-timers.js') $source
    if ($LASTEXITCODE -ne 0) { throw 'Closure timer state and native progress validation failed' }
    $required = @($assets | ForEach-Object { Join-Path $compiled $_ })
    Invoke-Source2Compiler -CompilerPath (Join-Path $root 'sr2compiler\New folder.exe') -SourceDir $source -RequiredOutputs $required -TimeoutSeconds 120
    Invoke-VpkPack -VpkEditCli $packer -InputDir $compiled -OutputPath $out
    $tree = Get-PackedVpkTree -VpkEditCli $packer -VpkPath $out -Source2ViewerPath $viewer
    $inventory = @($tree | ForEach-Object { $line = ([string]$_).Trim(); if ($line) { ($line -split '\s+', 2)[0] } } | Select-Object -Unique)
    if (@(Compare-Object -ReferenceObject $assets -DifferenceObject $inventory).Count) { throw 'Merged V2 package inventory mismatch' }
    $tree | Write-Host
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_test_hp_colors_v2_showrank_build'
}
if ($Deploy) {
    if (Get-Process -Name deadlock, citadel -ErrorAction SilentlyContinue) {
        throw 'Close Deadlock before deploying the combined test package.'
    }
    $addons = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons'
    if ($ShowRankBarebones -and -not (Test-Path -LiteralPath (Join-Path $addons 'pak89_dir.vpk'))) {
        throw 'ShowRank Barebones composition requires its installed pak89. Build without -ShowRankBarebones for standalone timers.'
    }
    $destination = Join-Path $addons 'pak02_dir.vpk'
    $pickupPak = Join-Path $addons 'pak04_dir.vpk'
    $backup = Join-Path $PSScriptRoot ('deployment-backups\' + (Get-Date -Format 'yyyyMMdd_HHmmssfff'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    if (Test-Path -LiteralPath $destination) {
        Copy-Item -LiteralPath $destination -Destination (Join-Path $backup 'pak02_dir.vpk')
    }
    Copy-Item -LiteralPath $out -Destination $destination -Force
    $hashes = @($out, $destination) | ForEach-Object {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $stream = [System.IO.File]::OpenRead($_)
        try { ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '') }
        finally { $stream.Dispose(); $sha256.Dispose() }
    }
    if ($hashes[0] -ne $hashes[1]) { throw 'Combined test pak02 deployment hash mismatch' }
    if (Test-Path -LiteralPath $pickupPak) {
        Move-Item -LiteralPath $pickupPak -Destination (Join-Path $backup 'pak04_dir.vpk')
    }
    Write-Host "Deployed test pak02. Prior pak02 and conflicting pickup pak04 backed up under $backup"
    Write-Host "SHA256: $($hashes[1])"
    Write-Host 'Restart Deadlock to load the combined test package.'
} else {
    Write-Host "Built test pak02: HP Colors V2 with pickup and ultimate timers. ShowRank composition: $([bool]$ShowRankBarebones). Nothing installed."
}
Write-Host 'This replaces normal pak02 and pickup pak04; production source is unchanged. ShowRank hooks are optional via -ShowRankBarebones.'
