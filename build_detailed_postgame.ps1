[CmdletBinding()]
param(
    # Copy the built pak11 into this PC's Deadlock addons folder.
    [switch]$Install
)

# Detailed Post Scoreboard Menu (pak11): the Night Shift post-game stats board on the stock post-game
# Scoreboard screen (exact stats, souls by source, final items, soul lead graph), forked from Observer
# HUD's pg_* without its observer extras (detailed_postgame/AGENTS.md). It overrides only
# post_game/citadel_db_page_post_game_new.xml; everything else lives under detailed_postgame/.
# Observer HUD (pak10) and DLF (pak01) override the same page: a lower-numbered pak with it wins.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$module = Join-Path $root 'detailed_postgame'
$stage = Join-Path $root '_detailed_postgame_build'
$source = Join-Path $stage 'detailed_postgame'
$compiled = Join-Path $stage 'detailed_postgame_compiled'
$dist = Join-Path $root 'dist\detailed_postgame'
$vpkOut = Join-Path $dist 'game\citadel\addons\pak11_dir.vpk'
# The version is the board's own MOD_VERSION (the credit line), so the archive name cannot drift from it.
$versionMatch = [regex]::Match((Get-Content -Raw (Join-Path $module 'panorama\scripts\detailed_postgame\pg_board.js')), 'MOD_VERSION\s*=\s*"([^"]+)"')
if (-not $versionMatch.Success) { throw 'MOD_VERSION not found in pg_board.js' }
$archiveOut = Join-Path $root ('dist\Detailed_Postgame_v{0}_{1}.7z' -f $versionMatch.Groups[1].Value, (Get-Date -Format 'yy.MM.dd'))
$destination = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak11_dir.vpk'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$sevenZip = Get-RepoToolPath -ToolName '7z.exe' -Candidates @(
    'C:\Program Files\7-Zip\7z.exe',
    'C:\Program Files (x86)\7-Zip\7z.exe'
)
$packer = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)

$layouts = @('post_game/citadel_db_page_post_game_new', 'detailed_postgame/pg_board', 'detailed_postgame/pg_column')
$scripts = @('detailed_postgame/pg_loader', 'detailed_postgame/pg_board')
$styles = @('detailed_postgame/pg_board')
# Torn paper masks (copied from observer_hud, made by observer_hud/scripts/make-torn-masks.py), each a PNG + .vtex.
$images = @('torn_head_l', 'torn_head_r', 'torn_graph', 'torn_track', 'torn_award' | ForEach-Object { "detailed_postgame/$_" })
$assets = @(
    @($layouts | ForEach-Object { "panorama/layout/$_.vxml_c" }) +
    @($scripts | ForEach-Object { "panorama/scripts/$_.vjs_c" }) +
    @($styles | ForEach-Object { "panorama/styles/$_.vcss_c" }) +
    @($images | ForEach-Object { "panorama/images/$_.vtex_c" })
) | Sort-Object

Write-Host "`n[1/4] Validating Detailed Post Scoreboard Menu source..." -ForegroundColor Cyan
foreach ($script in $scripts) {
    & node --check (Join-Path $module "panorama\scripts\$script.js")
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $script.js" }
}
& node (Join-Path $module 'scripts\validate-detailed-postgame.js')
if ($LASTEXITCODE -ne 0) { throw 'Detailed Post Scoreboard Menu validation failed' }

Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_detailed_postgame_build'
try {
    Write-Host "`n[2/4] Staging and compiling..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $module 'panorama') -Destination $source -Recurse
    $required = @($assets | ForEach-Object { Join-Path $compiled $_ })
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $source -RequiredOutputs $required -HiddenWindow -TimeoutSeconds 300

    Write-Host "`n[3/4] Packing pak11 and checking the exact inventory..." -ForegroundColor Cyan
    if (Test-Path -LiteralPath $dist) { Remove-TreeUnderRoot -Path $dist -RootPath $root -ExpectedLeaf 'detailed_postgame' }
    New-Item -ItemType Directory -Path (Split-Path $vpkOut -Parent) -Force | Out-Null
    Invoke-VpkPack -VpkEditCli $packer -InputDir $compiled -OutputPath $vpkOut
    $tree = Get-PackedVpkTree -VpkEditCli $packer -VpkPath $vpkOut -Source2ViewerPath $viewer
    $inventory = @(
        $tree |
            ForEach-Object {
                $line = ([string]$_).Trim()
                if ($line) { ($line -split '\s+', 2)[0] }
            } |
            Select-Object -Unique
    )
    $difference = @(Compare-Object -ReferenceObject $assets -DifferenceObject $inventory)
    if ($difference.Count) { throw "Detailed Post Scoreboard Menu pak11 inventory mismatch: $($difference | Out-String)" }
    Write-Host "  pak11 OK -> $vpkOut ($((Get-Item -LiteralPath $vpkOut).Length) bytes, $($inventory.Count) assets)" -ForegroundColor Green
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_detailed_postgame_build'
}

Write-Host "`n[4/4] Writing release 7z..." -ForegroundColor Cyan
# The archive holds only pak11_dir.vpk at its root; users put it in citadel\addons.
$releaseEntries = @(Split-Path -Leaf $vpkOut)
if (Test-Path -LiteralPath $archiveOut) { Remove-Item -LiteralPath $archiveOut -Force }
Push-Location -LiteralPath (Split-Path -Parent $vpkOut)
try {
    & $sevenZip a -t7z -mx=9 $archiveOut @releaseEntries | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7z failed for $archiveOut" }
} finally {
    Pop-Location
}
$files = @(& $sevenZip l -slt $archiveOut | Where-Object { $_ -like 'Path = *' } | ForEach-Object { $_.Substring(7) } | Where-Object { $_ -ne $archiveOut } | Sort-Object)
if ($LASTEXITCODE -ne 0 -or (Compare-Object $files @($releaseEntries | Sort-Object))) {
    throw "Release 7z holds $($files -join ', ') instead of $($releaseEntries -join ', ')"
}
Write-Host "  Release -> $archiveOut (put pak11_dir.vpk in game\citadel\addons)" -ForegroundColor Green

if ($Install) {
    $addons = Split-Path $destination -Parent
    if (-not (Test-Path -LiteralPath $addons)) { throw 'Deadlock addons folder missing' }
    # Lower-numbered paks win the page (pak01 DLF, pak10 Observer HUD); say which one hides this board.
    $page = 'panorama/layout/post_game/citadel_db_page_post_game_new.vxml_c'
    foreach ($pak in @(Get-ChildItem -LiteralPath $addons -Filter 'pak*_dir.vpk' | Where-Object { $_.Name -match '^pak(\d+)_dir\.vpk$' -and [int]$Matches[1] -lt 11 })) {
        $owned = $false
        try { $owned = [bool](Get-PackedVpkTree -VpkEditCli $packer -VpkPath $pak.FullName -Source2ViewerPath $viewer | Select-String -SimpleMatch $page -Quiet) } catch { }
        if ($owned) { Write-Warning "$($pak.Name) also overrides the post-game page and wins: its board shows instead of this one." }
    }
    if (Test-Path -LiteralPath $destination) {
        Copy-Item -LiteralPath $destination -Destination "$destination.backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')"
    }
    Copy-Item -LiteralPath $vpkOut -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $vpkOut).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
        throw 'Installed pak11 hash mismatch'
    }
    Write-Host "  Installed -> $destination (restart Deadlock)" -ForegroundColor Green
}
