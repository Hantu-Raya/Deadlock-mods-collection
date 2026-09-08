[CmdletBinding()]
param([switch]$SkipDeploy)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$stage = Join-Path $root '_test_hpv2_build'
$source = Join-Path $stage 'test_hpv2'
$compiled = Join-Path $stage 'test_hpv2_compiled'
$out = Join-Path $root 'pak04_dir.vpk'
$destination = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak04_dir.vpk'
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
    'panorama/scripts/test_pickup_profile.vjs_c',
    'panorama/layout/unit_status_overlay_v2.vxml_c',
    'panorama/layout/citadel_hud_top_bar.vxml_c',
    'panorama/styles/test_world_ultimate.vcss_c',
    'panorama/layout/test_event_relay.vxml_c',
    'panorama/scripts/test_topbar_pickups.vjs_c',
    'panorama/scripts/test_event_bridge.vjs_c'
)
& node --check (Join-Path $root 'test_hpv2\panorama\scripts\test_pickup_profile.js')
if ($LASTEXITCODE -ne 0) { throw 'Pickup profiler syntax check failed' }
& node (Join-Path $root 'test_hpv2\scripts\validate-profile.js')
if ($LASTEXITCODE -ne 0) { throw 'Pickup profiler arithmetic check failed' }
& node (Join-Path $root 'test_hpv2\scripts\validate-message-filter.js')
if ($LASTEXITCODE -ne 0) { throw 'Pickup message filter check failed' }
& node (Join-Path $root 'test_hpv2\scripts\validate-record-grouping.js')
if ($LASTEXITCODE -ne 0) { throw 'Pickup record grouping check failed' }
& node (Join-Path $root 'test_hpv2\scripts\validate-clock-reset.js')
if ($LASTEXITCODE -ne 0) { throw 'Pickup clock reset check failed' }
& node (Join-Path $root 'test_hpv2\scripts\validate-local-player.js')
if ($LASTEXITCODE -ne 0) { throw 'Pickup local-player exclusion check failed' }
& node (Join-Path $root 'test_hpv2\scripts\validate-ultimate.js')
if ($LASTEXITCODE -ne 0) { throw 'Healthbar ultimate validation failed' }

& node --check (Join-Path $root 'test_hpv2\panorama\scripts\test_event_bridge.js')
if ($LASTEXITCODE -ne 0) { throw 'Event probe syntax check failed' }
& node --check (Join-Path $root 'test_hpv2\panorama\scripts\test_topbar_pickups.js')
if ($LASTEXITCODE -ne 0) { throw 'Pickup script syntax check failed' }

Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_test_hpv2_build'
try {
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'test_hpv2\panorama') -Destination $source -Recurse

    $required = @($assets | ForEach-Object { Join-Path $compiled $_ })
    Invoke-Source2Compiler -CompilerPath (Join-Path $root 'sr2compiler\New folder.exe') -SourceDir $source -RequiredOutputs $required
    Invoke-VpkPack -VpkEditCli $packer -InputDir $compiled -OutputPath $out
    $tree = Get-PackedVpkTree -VpkEditCli $packer -VpkPath $out -Source2ViewerPath $viewer

    $inventory = @(
        $tree |
            ForEach-Object {
                $line = ([string]$_).Trim()
                if ($line) { ($line -split '\s+', 2)[0] }
            } |
            Select-Object -Unique
    )
    $difference = @(Compare-Object -ReferenceObject $assets -DifferenceObject $inventory)
    if ($difference.Count) {
        throw "test_hpv2 pak04 inventory mismatch: $($difference | Out-String)"
    }
    $tree | Write-Host
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_test_hpv2_build'
}


if (-not $SkipDeploy) {
    if (-not (Test-Path -LiteralPath (Split-Path $destination -Parent))) { throw 'Deadlock addons folder missing' }
    if (Test-Path -LiteralPath $destination) {
        Copy-Item -LiteralPath $destination -Destination "$destination.backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')"
    }
    Copy-Item -LiteralPath $out -Destination $destination -Force
    $hashes = @($out, $destination) | ForEach-Object {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $stream = [System.IO.File]::OpenRead($_)
        try { ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '') }
        finally { $stream.Dispose(); $sha256.Dispose() }
    }
    if ($hashes[0] -ne $hashes[1]) { throw 'Deployed pak04 hash mismatch' }
    Get-Item -LiteralPath $destination | Select-Object FullName, Length
    Write-Host "SHA256: $($hashes[1])"
}
Write-Host 'Built standalone pak04 pickup relay. Restart Deadlock and collect a buff; confirm the icon beside the ultimate.'
