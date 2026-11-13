[CmdletBinding()]
param(
    # Match details for the banner (team names, scores, event lines). Defaults to dlf\match.json.
    [string]$MatchFile = '',
    # Copy the built pak01 into this PC's Deadlock addons folder (gameinfo.gi is never touched).
    [switch]$Deploy,
    # Installed game pak whose scripts/abilities.vdata_c and modifiers.vdata_c are the VData baseline.
    [string]$GamePak = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\pak01_dir.vpk'
)

# DLF observer HUD (pak01): the Deadlock Observer Mod rebased on current stock, plus the DLF
# broadcast banner above the top bar, its ESC-menu editor, pickup rings, debuff icons, and the
# spectator VData (dlf/spectator-status.json) that puts the listed ultimates on every healthbar.
# Produces dist\dlf\game\... and a release 7z whose root is game\, so it extracts or drags straight
# onto the Deadlock folder. The VData is rebuilt from -GamePak each time, so it always matches the installed game.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')

$module = Join-Path $root 'dlf'
if (-not $MatchFile) { $MatchFile = Join-Path $module 'match.json' }
$stage = Join-Path $root '_dlf_build'
$source = Join-Path $stage 'dlf'
$compiled = Join-Path $stage 'dlf_compiled'
$dist = Join-Path $root 'dist\dlf'
$vpkOut = Join-Path $dist 'game\citadel\addons\pak01_dir.vpk'
$archiveOut = Join-Path $root ('dist\DLF_Observer_Mod_{0}.7z' -f (Get-Date -Format 'yy.MM.dd'))
$sevenZip = Get-RepoToolPath -ToolName '7z.exe' -Candidates @(
    'C:\Program Files\7-Zip\7z.exe',
    'C:\Program Files (x86)\7-Zip\7z.exe'
)
$destination = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak01_dir.vpk'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$packer = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$python = (Get-Command py.exe -ErrorAction SilentlyContinue).Source
if (-not $python) { throw 'py.exe (Python launcher) not found' }
if (-not (Test-Path -LiteralPath $GamePak)) { throw "Game pak not found: $GamePak" }
$vdata = @('abilities', 'modifiers')

$styles = @(
    'base/citadel_hud_hero_shop', 'base/citadel_hud_top_bar', 'base/citadel_hud_top_bar_chat',
    'base/hud', 'base/hud_paused', 'base/hud_spectate_bar',
    'citadel_hud_hero_shop', 'citadel_hud_top_bar', 'citadel_hud_top_bar_chat', 'hud', 'hud_paused',
    'hud_spectate_bar', 'objectives_map',
    'observer/citadel_hud_top_bar', 'observer/hud_paused',
    'qollock/citadel_hud_top_bar', 'qollock/hud_paused',
    'dlf/dlf_banner', 'dlf/dlf_menu', 'dlf/dlf_card', 'dlf/dlf_status_world', 'dlf/dlf_soul_graph',
    'dlf/dlf_pg_board', 'dlf/dlf_feed'
)
$scripts = @(
    'observer/observer_core', 'observer/observer_start',
    'qollock/ql_feat_rejuvtimers', 'qollock/ql_feat_urntimer',
    'qollock/ql_recent_purchases_data',
    'dlf/dlf_state', 'dlf/dlf_match', 'dlf/dlf_banner', 'dlf/dlf_heroes', 'dlf/dlf_menu',
    'dlf/pickup_config', 'dlf/pickup_host', 'dlf/pickup_bridge', 'dlf/pickup_timers',
    'dlf/dlf_debuff_icons', 'dlf/dlf_debuffs', 'dlf/dlf_status_css', 'dlf/dlf_debuff_world', 'dlf/dlf_debuff_relay',
    'dlf/dlf_ult_cooldown', 'dlf/dlf_soul_graph', 'dlf/dlf_pause', 'dlf/dlf_buys', 'dlf/dlf_names', 'dlf/dlf_urn', 'dlf/dlf_objmap',
    'dlf/dlf_pg_loader', 'dlf/dlf_pg_board'
)
# Generated at stage time: dlf_match from the match file, pickup_* from canonical HPv2 sources.
$generatedScripts = @('dlf/dlf_match', 'dlf/pickup_config', 'dlf/pickup_bridge', 'dlf/pickup_timers')
# Shipped as Closure ADVANCED output (locals renamed, dead code dropped; property names kept by the
# shared externs). Left as written: the data tables (match, heroes, icons, status classes, read as
# globals) and the decompiled observer/QOLLOCK scripts, which the validator's scenarios do not cover.
$closureScripts = @(
    'dlf/dlf_state', 'dlf/dlf_banner', 'dlf/dlf_menu', 'dlf/dlf_debuffs', 'dlf/dlf_debuff_world',
    'dlf/dlf_debuff_relay', 'dlf/dlf_ult_cooldown', 'dlf/pickup_host', 'dlf/pickup_config',
    'dlf/pickup_timers', 'dlf/pickup_bridge', 'dlf/dlf_soul_graph', 'dlf/dlf_pause', 'dlf/dlf_buys', 'dlf/dlf_names', 'dlf/dlf_urn', 'dlf/dlf_objmap',
    'dlf/dlf_pg_loader', 'dlf/dlf_pg_board'
)
$layouts = @(
    'citadel_hud_top_bar', 'citadel_hud_top_bar_player', 'hud_paused',
    'unit_status_overlay_v2', 'citadel_status_effect', 'hud_escape_menu', 'dlf/pickup_event_relay', 'dlf/debuff_event_relay',
    # Kill feed rows: the stock layout plus dlf_feed.css (killstreak flame on the name plate).
    'citadel_hud_data_feed_info',
    # Post-game board (ported from Observer HUD): the stock post-game page plus the loader, the board and one column layout.
    'post_game/citadel_db_page_post_game_new', 'dlf/dlf_pg_board', 'dlf/dlf_pg_column'
)
# Fonts (dlf\fonts) are loose files in game\citadel\panorama\fonts: Panorama does not load fonts from
# addon VPKs, and the stock fonts.conf only loads file names on its <fontpattern> list, so each ships
# under a listed name the game does not use; Pango matches the family inside the file (seen live
# 2026-10-16: a VPK copy and a loose gofire.otf were ignored, a loose quantico.otf renders GOFIRE).
# gofire.otf is the previous banner PSD's font (Sealoung, free for personal use); Operation Napalm
# is CC0. Modesto Lite Expanded is an Adobe Typekit font for the 2026-10-20 PSD: check its licence
# before publishing an archive that contains it.
$fonts = [ordered]@{
    'modesto-lite-expanded.otf' = 'vt323.ttf'
    'gofire.otf' = 'quantico.otf'
    'operation-napalm-italic.ttf' = 'rajdhani.ttf'
}
$fontsDist = Join-Path $dist 'game\citadel\panorama\fonts'
$fontsDestination = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\panorama\fonts'
# Purchase notice frame pieces (Observer HUD's, dlf_card.css .DLFBuyEdge*; observer_hud/scripts/make-notice-frame.py).
$noticeFrames = @(
    'dlf/buy_frame2_l', 'dlf/buy_frame2_m', 'dlf/buy_frame2_r',
    'dlf/buy_frame3_l', 'dlf/buy_frame3_m', 'dlf/buy_frame3_r'
)
# Post-game board torn-paper masks (observer_hud/scripts/make-torn-masks.py, copied; dlf_pg_board.css opacity-mask).
$boardMasks = @('dlf/torn_head_l', 'dlf/torn_head_r', 'dlf/torn_graph', 'dlf/torn_track', 'dlf/torn_award')
$assets = @(
    @($layouts | ForEach-Object { "panorama/layout/$_.vxml_c" }) +
    @($scripts | ForEach-Object { "panorama/scripts/$_.vjs_c" }) +
    @($styles | ForEach-Object { "panorama/styles/$_.vcss_c" }) +
    @('panorama/images/dlf/dlf_banner.vtex_c', 'panorama/images/dlf/dlf_banner_2ban.vtex_c', 'panorama/images/dlf/dlf_emblem_amber.vtex_c', 'panorama/images/dlf/dlf_emblem_sapphire.vtex_c') +
    @($noticeFrames | ForEach-Object { "panorama/images/$_.vtex_c" }) +
    @($boardMasks | ForEach-Object { "panorama/images/$_.vtex_c" }) +
    @($vdata | ForEach-Object { "scripts/$_.vdata_c" })
) | Sort-Object

# Decompiles scripts/<name>.vdata_c of $Pak into $OutDir\scripts\<name>.vdata. The RED2 block is
# dropped first: Source2Viewer cannot read the KV3 type that Deadlock 6779+ writes there.
function Export-VData([string]$Pak, [string]$OutDir) {
    $raw = Join-Path $OutDir 'raw'
    New-Item -ItemType Directory -Path $raw, (Join-Path $OutDir 'scripts') -Force | Out-Null
    foreach ($name in $vdata) {
        $packed = Join-Path $raw "$name.vdata_c"
        $stripped = Join-Path $raw "$name.nored.vdata_c"
        $text = Join-Path $OutDir "scripts\$name.vdata"
        & $packer --no-progress --extract "scripts/$name.vdata_c" --output $packed $Pak | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $packed)) { throw "Could not extract scripts/$name.vdata_c from $Pak" }
        & $python (Join-Path $module 'scripts\strip_red2.py') $packed $stripped
        if ($LASTEXITCODE -ne 0) { throw "Could not strip RED2 from scripts/$name.vdata_c" }
        & $viewer -i $stripped -o $text -d | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $text)) {
            throw "Could not decompile scripts/$name.vdata_c from $Pak"
        }
    }
    Remove-Item -LiteralPath $raw -Recurse -Force
}

Write-Host "`n[1/4] Validating DLF source..." -ForegroundColor Cyan
foreach ($script in $scripts | Where-Object { $generatedScripts -notcontains $_ }) {
    & node --check (Join-Path $module "panorama\scripts\$script.js")
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $script.js" }
}
& node (Join-Path $module 'scripts\validate-dlf.js')
if ($LASTEXITCODE -ne 0) { throw 'DLF validation failed' }

Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_dlf_build'
try {
    Write-Host "`n[2/4] Staging and compiling (match: $MatchFile)..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $module 'panorama') -Destination $source -Recurse
    & node (Join-Path $module 'scripts\write-match.js') $MatchFile (Join-Path $source 'panorama\scripts\dlf\dlf_match.js')
    if ($LASTEXITCODE -ne 0) { throw "Invalid match file: $MatchFile" }
    & node (Join-Path $module 'scripts\compose-pickups.js') (Join-Path $source 'panorama')
    if ($LASTEXITCODE -ne 0) { throw 'Pickup composition failed (canonical HPv2 source drift?)' }
    foreach ($script in $generatedScripts) {
        & node --check (Join-Path $source "panorama\scripts\$script.js")
        if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: generated $script.js" }
    }
    # Closure ADVANCED to ES2020 (Panorama's V8 runs it; ES5 output added Closure's iterator
    # polyfills to every file), then every VM scenario again on the minified scripts.
    Invoke-HpColorsRewriteClosureAdvanced -StageSourceRoot $source -WorkRoot $stage -LanguageOut 'ECMASCRIPT_2020' `
        -ScriptRelativePaths @($closureScripts | ForEach-Object { "panorama\scripts\$_.js" })
    $env:DLF_RUNTIME_ROOT = Join-Path $source 'panorama'
    try {
        & node (Join-Path $module 'scripts\validate-dlf.js') | Select-Object -Last 1
        if ($LASTEXITCODE -ne 0) { throw 'DLF validation failed on the Closure ADVANCED scripts' }
    } finally {
        Remove-Item Env:DLF_RUNTIME_ROOT -ErrorAction SilentlyContinue
    }
    # Spectator VData: the installed game's files plus dlf/spectator-status.json.
    Export-VData -Pak $GamePak -OutDir $source
    & $python (Join-Path $module 'scripts\spectator_status.py') (Join-Path $source 'scripts\abilities.vdata') (Join-Path $source 'scripts\modifiers.vdata') `
        --localization (Join-Path (Split-Path -Parent $GamePak) 'resource\localization')
    if ($LASTEXITCODE -ne 0) { throw 'Spectator VData transform failed (an ability or modifier was renamed?)' }
    $stockAbilities = Join-Path $stage 'stock_abilities.vdata_c'
    & $packer --no-progress --extract 'scripts/abilities.vdata_c' --output $stockAbilities $GamePak | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $stockAbilities)) { throw 'Could not extract stock abilities.vdata_c' }

    $required = @($assets | ForEach-Object { Join-Path $compiled $_ })
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $source -RequiredOutputs $required -HiddenWindow -TimeoutSeconds 300
    # The Dota compiler emits no RERL for Deadlock icons; copy the stock one (also proves the icons match the game).
    & $python (Join-Path $root 'abilities\scripts\inject_stock_external_refs.py') (Join-Path $compiled 'scripts\abilities.vdata_c') (Join-Path $source 'scripts\abilities.vdata') $stockAbilities
    if ($LASTEXITCODE -ne 0) { throw 'RERL injection failed for abilities.vdata_c' }

    Write-Host "`n[3/4] Packing pak01 and checking the exact inventory..." -ForegroundColor Cyan
    if (Test-Path -LiteralPath $dist) { Remove-TreeUnderRoot -Path $dist -RootPath $root -ExpectedLeaf 'dlf' }
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
    if ($difference.Count) { throw "DLF pak01 inventory mismatch: $($difference | Out-String)" }
    # The packed VData, decompiled again, must carry every spectator change.
    $packedVData = Join-Path $stage 'packed'
    Export-VData -Pak $vpkOut -OutDir $packedVData
    & $python (Join-Path $module 'scripts\spectator_status.py') --verify (Join-Path $packedVData 'scripts\abilities.vdata') (Join-Path $packedVData 'scripts\modifiers.vdata')
    if ($LASTEXITCODE -ne 0) { throw 'Packed VData is missing spectator changes' }
    Write-Host "  pak01 OK -> $vpkOut ($((Get-Item -LiteralPath $vpkOut).Length) bytes, $($inventory.Count) assets)" -ForegroundColor Green
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_dlf_build'
}

Write-Host "`n[4/4] Writing release 7z..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $fontsDist -Force | Out-Null
$fontFiles = @()
foreach ($font in $fonts.Keys) {
    $fontSource = Join-Path $module "fonts\$font"
    if (-not (Test-Path -LiteralPath $fontSource)) { throw "Font missing: $fontSource" }
    $fontOut = Join-Path $fontsDist $fonts[$font]
    Copy-Item -LiteralPath $fontSource -Destination $fontOut
    $fontFiles += $fontOut
}
# Only these files go in, under game\..., whatever else is left in dist\dlf. No gameinfo.gi (user
# 2026-10-20): the observer PC's own gameinfo.gi must already mount citadel/addons.
$releaseEntries = @(@($vpkOut) + $fontFiles | ForEach-Object { $_.Substring($dist.Length + 1) })
if (Test-Path -LiteralPath $archiveOut) { Remove-Item -LiteralPath $archiveOut -Force }
Push-Location -LiteralPath $dist
try {
    & $sevenZip a -t7z -mx=9 $archiveOut @releaseEntries | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7z failed for $archiveOut" }
} finally {
    Pop-Location
}
$files = @(& $sevenZip l -slt $archiveOut | Where-Object { $_ -like 'Path = game\*' } | ForEach-Object { $_.Substring(7) } | Sort-Object)
if ($LASTEXITCODE -ne 0 -or (Compare-Object $files @($releaseEntries | Sort-Object))) {
    throw "Release 7z holds $($files -join ', ') instead of $($releaseEntries -join ', ')"
}
Write-Host "  Release -> $archiveOut (drag its game folder onto the Deadlock folder)" -ForegroundColor Green

if ($Deploy) {
    if (-not (Test-Path -LiteralPath (Split-Path $destination -Parent))) { throw 'Deadlock addons folder missing' }
    if (Test-Path -LiteralPath $destination) {
        Copy-Item -LiteralPath $destination -Destination "$destination.backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')"
    }
    Copy-Item -LiteralPath $vpkOut -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $vpkOut).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
        throw 'Deployed pak01 hash mismatch'
    }
    Write-Host "  Deployed -> $destination (restart Deadlock)" -ForegroundColor Green
    if (-not (Test-Path -LiteralPath $fontsDestination)) { throw 'Deadlock panorama\fonts folder missing' }
    foreach ($fontOut in $fontFiles) {
        $target = Join-Path $fontsDestination (Split-Path $fontOut -Leaf)
        if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $fontOut).Hash) {
            Copy-Item -LiteralPath $target -Destination "$target.backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')"
        }
        Copy-Item -LiteralPath $fontOut -Destination $target -Force
        if ((Get-FileHash -LiteralPath $fontOut).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { throw "Deployed font hash mismatch: $target" }
        Write-Host "  Font -> $target" -ForegroundColor Green
    }
}
