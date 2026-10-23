[CmdletBinding()]
param([switch]$SkipDeploy, [switch]$Remove)

# Throwaway pak10 for observer_hud/PLAN.md phase 1 (injection spike). -Remove uninstalls it.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $repo 'scripts\source2_package_pipeline.ps1')
$destination = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak10_dir.vpk'

if ($Remove) {
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    Write-Host 'Removed pak10 spike.'
    return
}

$stage = Join-Path $repo '_observer_spike_build'
$source = Join-Path $stage 'observer_spike'
$compiled = Join-Path $stage 'observer_spike_compiled'
$out = Join-Path $repo '.tmp\observer_spike_pak10_dir.vpk'
$packer = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $repo 'vpk cli\vpkeditcli.exe'),
    (Join-Path $repo 'passive_items_mod\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $repo '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $repo '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$assets = @(
    'panorama/layout/citadel_status_effect.vxml_c',
    'panorama/layout/hud_spectate_bar.vxml_c',
    'panorama/layout/observer_hud/spike_alias.vxml_c',
    'panorama/layout/observer_hud/spike_bar.vxml_c',
    'panorama/layout/observer_hud/spike_menu.vxml_c',
    'panorama/layout/observer_hud/spike_world_relay.vxml_c',
    'panorama/scripts/observer_hud/oh_spike.vjs_c',
    'panorama/scripts/observer_hud/oh_spike_world.vjs_c',
    'panorama/scripts/observer_hud/oh_spike_world_relay.vjs_c',
    'panorama/styles/observer_hud/spike_alias.vcss_c',
    'panorama/styles/observer_hud/spike_bar.vcss_c',
    'panorama/styles/observer_hud/spike_host.vcss_c',
    'panorama/styles/observer_hud/spike_menu.vcss_c'
)

foreach ($script in 'oh_spike.js', 'oh_spike_world.js', 'oh_spike_world_relay.js') {
    & node --check (Join-Path $PSScriptRoot "panorama\scripts\observer_hud\$script")
    if ($LASTEXITCODE -ne 0) { throw "spike syntax check failed: $script" }
}

Remove-TreeUnderRoot -Path $stage -RootPath $repo -ExpectedLeaf '_observer_spike_build'
try {
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'panorama') -Destination $source -Recurse
    $required = @($assets | ForEach-Object { Join-Path $compiled $_ })
    Invoke-Source2Compiler -CompilerPath (Join-Path $repo 'sr2compiler\New folder.exe') -SourceDir $source -RequiredOutputs $required
    New-Item -ItemType Directory -Path (Split-Path $out -Parent) -Force | Out-Null
    Invoke-VpkPack -VpkEditCli $packer -InputDir $compiled -OutputPath $out
    $tree = Get-PackedVpkTree -VpkEditCli $packer -VpkPath $out -Source2ViewerPath $viewer
    $inventory = @($tree | ForEach-Object { $line = ([string]$_).Trim(); if ($line) { ($line -split '\s+', 2)[0] } } | Select-Object -Unique)
    $difference = @(Compare-Object -ReferenceObject $assets -DifferenceObject $inventory)
    if ($difference.Count) { throw "spike pak10 inventory mismatch: $($difference | Out-String)" }
    $tree | Write-Host
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $repo -ExpectedLeaf '_observer_spike_build'
}

if (-not $SkipDeploy) {
    if (-not (Test-Path -LiteralPath (Split-Path $destination -Parent))) { throw 'Deadlock addons folder missing' }
    Copy-Item -LiteralPath $out -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $out).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) { throw 'Deployed pak10 hash mismatch' }
    Get-Item -LiteralPath $destination | Select-Object FullName, Length
}
Write-Host 'Built pak10 observer spike. Logs: [OH-SPIKE] lines in citadel\console.log.'
