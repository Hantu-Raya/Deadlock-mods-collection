[CmdletBinding()]
param(
    # Copy the built pak10 into this PC's Deadlock addons folder.
    [switch]$Install,
    # Installed game pak whose scripts/abilities.vdata_c and modifiers.vdata_c are the VData baseline.
    # Default: the Deadlock install found in a Steam library on this PC.
    [string]$GamePak = '',
    # Organisation variant (observer_hud/orgs/<Org>, observer_hud/orgs/README.md): the same pak10 with that
    # org's font, art, CSS and defaults on top; its own dist folder and archive, never the public release.
    [string]$Org = ''
)

# Observer HUD (pak10, observer PCs only): two tournament looks on the stock spectator top bar (Base
# Game+ Names and Night Desk: header band, player names, plates or team names, bans, stage, organiser,
# soul lead graph), an Escape-menu editor, the ability status column under each card, the spectator
# VData (dlf/spectator-status.json) that makes those statuses visible on world bars, and the Night Shift
# post-game board (pg_*, ADR 0009).
# The HUD parts are injected from hud_spectate_bar.xml (observer_hud/PLAN.md, approach B), so the pak
# overrides only hud_spectate_bar.xml, citadel_status_effect.xml, the post-game page
# (post_game/citadel_db_page_post_game_new.xml, ADR 0009), the private-lobby page
# (citadel_db_page_private_lobby.xml, the 0.3.0 lobby setup), the kill feed row
# (citadel_hud_data_feed_info.xml, the killstreak flame on the name plate) and the two VData files.
# The VData is rebuilt from -GamePak on every build: rebuild after every Deadlock patch.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')

$module = Join-Path $root 'observer_hud'
$dlf = Join-Path $root 'dlf'
$stage = Join-Path $root '_observer_hud_build'
$source = Join-Path $stage 'observer_hud'
$compiled = Join-Path $stage 'observer_hud_compiled'
$orgDir = $null
$orgConfig = $null
if ($Org) {
    if ($Org -notmatch '^[a-z0-9_]+$') { throw "-Org $Org`: lower-case letters, digits and _ only" }
    $orgDir = Join-Path $module "orgs\$Org"
    if (-not (Test-Path -LiteralPath (Join-Path $orgDir 'org.json'))) { throw "No org variant at $orgDir" }
    $orgConfig = Get-Content -LiteralPath (Join-Path $orgDir 'org.json') -Raw -Encoding UTF8 | ConvertFrom-Json
}
$distLeaf = if ($Org) { "observer_hud_$Org" } else { 'observer_hud' }
$dist = Join-Path $root "dist\$distLeaf"
$vpkOut = Join-Path $dist 'game\citadel\addons\pak10_dir.vpk'
# The public version comes from the editor (oh_menu.js VERSION), so each release has its own archive name.
$versionMatch = [regex]::Match((Get-Content -LiteralPath (Join-Path $module 'panorama\scripts\observer_hud\oh_menu.js') -Raw), 'const VERSION = "([0-9]+\.[0-9]+\.[0-9]+)"')
if (-not $versionMatch.Success) { throw 'VERSION not found in oh_menu.js' }
$version = $versionMatch.Groups[1].Value
$archiveName = if ($Org) { 'Observer_HUD_{0}_{1}_{2}.7z' -f $Org, $version, (Get-Date -Format 'yy.MM.dd') } else { 'Observer_HUD_{0}_{1}.7z' -f $version, (Get-Date -Format 'yy.MM.dd') }
$archiveOut = Join-Path $root "dist\$archiveName"
# -Install copies the pak beside the game pak the VData comes from (citadel\addons).
if (-not $GamePak) {
    # Every fixed drive's usual Steam library folders; the first Deadlock found wins.
    $tail = 'steamapps\common\Deadlock\game\citadel\pak01_dir.vpk'
    $found = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Z]:\\$' } | ForEach-Object {
        foreach ($library in @('SteamLibrary', 'Steam', 'Program Files (x86)\Steam', 'Program Files\Steam', 'Games\Steam')) {
            Join-Path (Join-Path $_.Root $library) $tail
        }
    } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $found) { throw 'Deadlock not found in a Steam library on this PC: pass -GamePak <...\game\citadel\pak01_dir.vpk>' }
    $GamePak = $found
}
$destination = Join-Path (Split-Path $GamePak -Parent) 'addons\pak10_dir.vpk'
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
$python = (Get-Command py.exe -ErrorAction SilentlyContinue).Source
if (-not $python) { throw 'py.exe (Python launcher) not found' }
if (-not (Test-Path -LiteralPath $GamePak)) { throw "Game pak not found: $GamePak" }
$vdata = @('abilities', 'modifiers')

$layouts = @(
    'hud_spectate_bar', 'citadel_status_effect', 'post_game/citadel_db_page_post_game_new', 'citadel_db_page_private_lobby',
    'citadel_hud_data_feed_info',
    'observer_hud/band', 'observer_hud/tournament_bar', 'observer_hud/debuffs', 'observer_hud/urn', 'observer_hud/editor',
    'observer_hud/debuff_relay', 'observer_hud/pg_board', 'observer_hud/pg_column', 'observer_hud/lobby_alias', 'observer_hud/lobby_setup', 'observer_hud/lobby_share'
)
$styles = @(
    'observer_hud/oh_host', 'observer_hud/oh_band', 'observer_hud/oh_bar', 'observer_hud/oh_debuffs',
    'observer_hud/oh_editor', 'observer_hud/oh_status_world', 'observer_hud/pg_board', 'observer_hud/oh_lobby',
    'observer_hud/oh_feed'
)
$scripts = @(
    'observer_hud/oh_state', 'observer_hud/oh_heroes', 'observer_hud/oh_debuff_icons', 'observer_hud/oh_item_icons',
    'observer_hud/oh_host', 'observer_hud/oh_menu', 'observer_hud/oh_debuffs', 'observer_hud/oh_buys', 'observer_hud/oh_link',
    'observer_hud/oh_debuff_world', 'observer_hud/oh_debuff_relay', 'observer_hud/pg_loader', 'observer_hud/pg_board',
    'observer_hud/oh_lobby'
)
# Shipped as Closure ADVANCED output; the generated data tables (read as var OH_* globals) stay as written.
$closureScripts = @(
    'observer_hud/oh_state', 'observer_hud/oh_host', 'observer_hud/oh_menu', 'observer_hud/oh_debuffs',
    'observer_hud/oh_buys', 'observer_hud/oh_link', 'observer_hud/oh_debuff_world', 'observer_hud/oh_debuff_relay',
    'observer_hud/pg_loader', 'observer_hud/pg_board', 'observer_hud/oh_lobby'
)
# Purchase notice frame pieces (observer_hud/scripts/make-notice-frame.py), each a PNG + .vtex.
$images = @(
    'observer_hud/buy_frame2_l', 'observer_hud/buy_frame2_m', 'observer_hud/buy_frame2_r',
    'observer_hud/buy_frame3_l', 'observer_hud/buy_frame3_m', 'observer_hud/buy_frame3_r',
    # Post-game torn paper masks (observer_hud/scripts/make-torn-masks.py).
    'observer_hud/torn_head_l',
    'observer_hud/torn_head_r',
    'observer_hud/torn_graph',
    'observer_hud/torn_track',
    'observer_hud/torn_award'
)
# An org variant adds its own art (orgs/<Org>/panorama/images, make-org-art.py) and ships its font as a loose
# file under a name the stock fonts.conf lists (dlf ADR 0003: Panorama loads no font from a VPK).
$orgFont = $null
if ($Org) {
    $orgImages = Join-Path $orgDir 'panorama\images'
    if (Test-Path -LiteralPath $orgImages) {
        $images += @(Get-ChildItem -LiteralPath $orgImages -Recurse -Filter '*.png' | ForEach-Object {
            $_.FullName.Substring($orgImages.Length + 1).Replace('\', '/') -replace '\.png$', ''
        })
    }
    if ($orgConfig.font) {
        $orgFont = Join-Path $orgDir $orgConfig.font.source
        if (-not (Test-Path -LiteralPath $orgFont)) { throw "Org font missing: $orgFont (orgs/$Org/README.md says where it comes from)" }
        if ($orgConfig.font.installAs -notmatch '^[a-z0-9-]+\.(otf|ttf)$') { throw "Org font installAs: $($orgConfig.font.installAs)" }
    }
}
$assets = @(
    @($layouts | ForEach-Object { "panorama/layout/$_.vxml_c" }) +
    @($scripts | ForEach-Object { "panorama/scripts/$_.vjs_c" }) +
    @($styles | ForEach-Object { "panorama/styles/$_.vcss_c" }) +
    @($images | ForEach-Object { "panorama/images/$_.vtex_c" }) +
    @($vdata | ForEach-Object { "scripts/$_.vdata_c" })
) | Sort-Object

# Decompiles scripts/<name>.vdata_c of $Pak into $OutDir\scripts\<name>.vdata (DLF's pipeline). The RED2
# block is dropped first: Source2Viewer cannot read the KV3 type that Deadlock 6779+ writes there.
function Export-VData([string]$Pak, [string]$OutDir) {
    $raw = Join-Path $OutDir 'raw'
    New-Item -ItemType Directory -Path $raw, (Join-Path $OutDir 'scripts') -Force | Out-Null
    foreach ($name in $vdata) {
        $packed = Join-Path $raw "$name.vdata_c"
        $stripped = Join-Path $raw "$name.nored.vdata_c"
        $text = Join-Path $OutDir "scripts\$name.vdata"
        & $packer --no-progress --extract "scripts/$name.vdata_c" --output $packed $Pak | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $packed)) { throw "Could not extract scripts/$name.vdata_c from $Pak" }
        & $python (Join-Path $dlf 'scripts\strip_red2.py') $packed $stripped
        if ($LASTEXITCODE -ne 0) { throw "Could not strip RED2 from scripts/$name.vdata_c" }
        & $viewer -i $stripped -o $text -d | Out-Null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $text)) { throw "Could not decompile scripts/$name.vdata_c from $Pak" }
    }
    Remove-Item -LiteralPath $raw -Recurse -Force
}

Write-Host "`n[1/4] Validating Observer HUD source..." -ForegroundColor Cyan
# The release gate runs every check on the source, then on the Closure output: a developer's OH_CHECK
# filter, OH_ATTRIB or OH_RUNTIME_ROOT left in the shell must not shrink or redirect it.
$validatorEnv = @{}
foreach ($name in @('OH_CHECK', 'OH_ATTRIB', 'OH_RUNTIME_ROOT')) {
    $validatorEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $null, 'Process')
}
foreach ($script in $scripts) {
    & node --check (Join-Path $module "panorama\scripts\$script.js")
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $script.js" }
}
& node (Join-Path $module 'scripts\validate-observer-hud.js')
if ($LASTEXITCODE -ne 0) { throw 'Observer HUD validation failed' }

Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_observer_hud_build'
try {
    Write-Host "`n[2/4] Staging, minifying and compiling..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $module 'panorama') -Destination $source -Recurse
    Invoke-HpColorsRewriteClosureAdvanced -StageSourceRoot $source -WorkRoot $stage -LanguageOut 'ECMASCRIPT_2020' `
        -ScriptRelativePaths @($closureScripts | ForEach-Object { "panorama\scripts\$_.js" })
    $env:OH_RUNTIME_ROOT = Join-Path $source 'panorama'
    try {
        # Quiet when green (the source run above printed every check); the failing check and its error otherwise.
        $closureRun = & node (Join-Path $module 'scripts\validate-observer-hud.js') 2>&1
        if ($LASTEXITCODE -ne 0) {
            $closureRun | Where-Object { "$_" -notmatch '^ok - ' } | ForEach-Object { Write-Host "$_" }
            throw 'Observer HUD validation failed on the Closure ADVANCED scripts'
        }
        $closureRun | Select-Object -Last 1
    } finally {
        Remove-Item Env:OH_RUNTIME_ROOT -ErrorAction SilentlyContinue
    }
    if ($Org) {
        # After both validator runs: the base behaviour is proven, the overlay checks itself (apply-org.py).
        & $python (Join-Path $module 'scripts\apply-org.py') $Org $source
        if ($LASTEXITCODE -ne 0) { throw "Org overlay $Org failed" }
    }
    # Spectator VData: the installed game's files plus dlf/spectator-status.json (shared spec).
    Export-VData -Pak $GamePak -OutDir $source
    & $python (Join-Path $dlf 'scripts\spectator_status.py') (Join-Path $source 'scripts\abilities.vdata') (Join-Path $source 'scripts\modifiers.vdata') `
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

    Write-Host "`n[3/4] Packing pak10 and checking the exact inventory..." -ForegroundColor Cyan
    if (Test-Path -LiteralPath $dist) { Remove-TreeUnderRoot -Path $dist -RootPath $root -ExpectedLeaf $distLeaf }
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
    if ($difference.Count) { throw "Observer HUD pak10 inventory mismatch: $($difference | Out-String)" }
    # The packed VData, decompiled again, must carry every spectator change.
    $packedVData = Join-Path $stage 'packed'
    Export-VData -Pak $vpkOut -OutDir $packedVData
    & $python (Join-Path $dlf 'scripts\spectator_status.py') --verify (Join-Path $packedVData 'scripts\abilities.vdata') (Join-Path $packedVData 'scripts\modifiers.vdata')
    if ($LASTEXITCODE -ne 0) { throw 'Packed VData is missing spectator changes' }
    Write-Host "  pak10 OK -> $vpkOut ($((Get-Item -LiteralPath $vpkOut).Length) bytes, $($inventory.Count) assets)" -ForegroundColor Green
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_observer_hud_build'
    foreach ($name in $validatorEnv.Keys) { [Environment]::SetEnvironmentVariable($name, $validatorEnv[$name], 'Process') }
}

Write-Host "`n[4/4] Writing release 7z..." -ForegroundColor Cyan
# The archive holds only pak10_dir.vpk at its root, no folders (user 2026-10-24); users put it in citadel\addons.
# An org archive with a font holds game\citadel\addons\pak10_dir.vpk and game\citadel\panorama\fonts\<font>
# instead, extracted over the Deadlock folder (the font must be loose).
$releaseEntries = @(Split-Path -Leaf $vpkOut)
$releaseRoot = Split-Path -Parent $vpkOut
$fontOut = $null
if ($orgFont) {
    $fontOut = Join-Path $dist "game\citadel\panorama\fonts\$($orgConfig.font.installAs)"
    New-Item -ItemType Directory -Path (Split-Path $fontOut -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $orgFont -Destination $fontOut
    $releaseRoot = $dist
    $releaseEntries = @(@($vpkOut, $fontOut) | ForEach-Object { $_.Substring($dist.Length + 1) })
}
# Written to a temporary name and checked first; an older archive under the final name is kept beside it
# under its own hash (a same-day rebuild once overwrote the only local copy of a release, MAP.md).
$archiveTemp = "$archiveOut.tmp"
if (Test-Path -LiteralPath $archiveTemp) { Remove-Item -LiteralPath $archiveTemp -Force }
Push-Location -LiteralPath $releaseRoot
try {
    & $sevenZip a -t7z -mx=9 $archiveTemp @releaseEntries | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "7z failed for $archiveTemp" }
} finally {
    Pop-Location
}
$files = @(& $sevenZip l -slt $archiveTemp | Where-Object { $_ -like 'Path = *' } | ForEach-Object { $_.Substring(7) } | Where-Object { $_ -ne $archiveTemp } | Sort-Object)
if ($LASTEXITCODE -ne 0 -or (Compare-Object $files @($releaseEntries | Sort-Object))) {
    throw "Release 7z holds $($files -join ', ') instead of $($releaseEntries -join ', ')"
}
if (Test-Path -LiteralPath $archiveOut) {
    $oldHash = (Get-FileHash -LiteralPath $archiveOut -Algorithm SHA256).Hash.Substring(0, 8).ToLowerInvariant()
    $kept = [IO.Path]::ChangeExtension($archiveOut, ".$oldHash.7z")
    if (-not (Test-Path -LiteralPath $kept)) { Move-Item -LiteralPath $archiveOut -Destination $kept }
    else { Remove-Item -LiteralPath $archiveOut -Force }
    Write-Host "  Kept the previous archive as $(Split-Path -Leaf $kept)" -ForegroundColor DarkGray
}
Move-Item -LiteralPath $archiveTemp -Destination $archiveOut
if ($fontOut) { Write-Host "  Release -> $archiveOut (extract over the Deadlock folder: pak10 + $($orgConfig.font.installAs))" -ForegroundColor Green }
else { Write-Host "  Release -> $archiveOut (put pak10_dir.vpk in game\citadel\addons)" -ForegroundColor Green }

if ($Install) {
    if (-not (Test-Path -LiteralPath (Split-Path $destination -Parent))) { throw 'Deadlock addons folder missing' }
    if (Test-Path -LiteralPath $destination) {
        Copy-Item -LiteralPath $destination -Destination "$destination.backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')"
    }
    Copy-Item -LiteralPath $vpkOut -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $vpkOut).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) {
        throw 'Installed pak10 hash mismatch'
    }
    Write-Host "  Installed -> $destination (restart Deadlock)" -ForegroundColor Green
    if ($fontOut) {
        # Backups go beside the fonts folder: fonts.conf would load a copy whose name starts with a listed one.
        $fonts = Join-Path (Split-Path $GamePak -Parent) 'panorama\fonts'
        if (-not (Test-Path -LiteralPath $fonts)) { throw 'Deadlock panorama\fonts folder missing' }
        $target = Join-Path $fonts (Split-Path $fontOut -Leaf)
        if ((Test-Path -LiteralPath $target) -and (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $fontOut).Hash) {
            $backups = Join-Path (Split-Path $fonts -Parent) 'fonts_backup'
            New-Item -ItemType Directory -Path $backups -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination (Join-Path $backups "$(Split-Path $target -Leaf).backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')")
        }
        Copy-Item -LiteralPath $fontOut -Destination $target -Force
        if ((Get-FileHash -LiteralPath $fontOut).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { throw "Installed font hash mismatch: $target" }
        Write-Host "  Font -> $target ($($orgConfig.font.family))" -ForegroundColor Green
    }
}
