[CmdletBinding()]
param([switch]$SkipDeploy)

# pak08 Feeder Feed: overrides hud_damage_report.xml with a FEEDER FEED tab fed by the kill feed.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')
$stage = Join-Path $root '_feeder_feed_build'
$source = Join-Path $stage 'feeder_feed'
$compiled = Join-Path $stage 'feeder_feed_compiled'
$out = Join-Path $root 'pak08_dir.vpk'
$destination = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak08_dir.vpk'
$packer = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$assets = @(
    'panorama/layout/hud_damage_report.vxml_c',
    'panorama/scripts/feeder_feed.vjs_c',
    'panorama/styles/feeder_feed.vcss_c'
)

& node --check (Join-Path $root 'feeder_feed\panorama\scripts\feeder_feed.js')
if ($LASTEXITCODE -ne 0) { throw 'feeder_feed syntax check failed' }
& node (Join-Path $root 'feeder_feed\scripts\validate-feeder-feed.js')
if ($LASTEXITCODE -ne 0) { throw 'feeder_feed validation failed' }

Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_feeder_feed_build'
try {
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'feeder_feed\panorama') -Destination $source -Recurse

    # Ship the Closure ADVANCED build, and prove it by re-running every scenario against it.
    $staged = 'panorama\scripts\feeder_feed.js'
    Invoke-HpColorsRewriteClosureAdvanced -StageSourceRoot $source -ScriptRelativePaths @($staged) -WorkRoot $stage
    $env:FEEDER_FEED_SOURCE = Join-Path $source $staged
    try {
        & node (Join-Path $root 'feeder_feed\scripts\validate-feeder-feed.js')
        if ($LASTEXITCODE -ne 0) { throw 'feeder_feed validation failed on the Closure build' }
    } finally {
        Remove-Item Env:FEEDER_FEED_SOURCE -ErrorAction SilentlyContinue
    }
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
        throw "feeder_feed pak08 inventory mismatch: $($difference | Out-String)"
    }
    $tree | Write-Host
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_feeder_feed_build'
}

if (-not $SkipDeploy) {
    if (-not (Test-Path -LiteralPath (Split-Path $destination -Parent))) { throw 'Deadlock addons folder missing' }
    if (Test-Path -LiteralPath $destination) {
        Copy-Item -LiteralPath $destination -Destination "$destination.backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')"
    }
    Copy-Item -LiteralPath $out -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $out).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
        throw 'Deployed pak08 hash mismatch'
    }
    Get-Item -LiteralPath $destination | Select-Object FullName, Length
}
Write-Host 'Built pak08 Feeder Feed. Restart Deadlock; open the damage report (scoreboard/dead) and pick the FEEDER FEED tab. Logs: [FF] lines in citadel\console.log.'
