[CmdletBinding()]
param(
    # Copy the built pak10 into this PC's Deadlock addons folder.
    [switch]$Install,
    # Installed game pak whose scripts/abilities.vdata_c and modifiers.vdata_c are the VData baseline.
    [string]$GamePak = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\pak01_dir.vpk'
)

# Observer HUD (pak10, observer PCs only): two tournament looks on the stock spectator top bar (Base
# Game+ Names and Night Desk: header band, player names, plates or team names, bans, stage, organiser,
# soul lead graph), an Escape-menu editor, the ability status column under each card, and
# the spectator VData (dlf/spectator-status.json) that makes those statuses visible on world bars.
# The Panorama parts are injected from hud_spectate_bar.xml (observer_hud/PLAN.md, approach B), so
# the pak overrides only hud_spectate_bar.xml, citadel_status_effect.xml and the two VData files.
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
$dist = Join-Path $root 'dist\observer_hud'
$vpkOut = Join-Path $dist 'game\citadel\addons\pak10_dir.vpk'
$archiveOut = Join-Path $root ('dist\Observer_HUD_{0}.7z' -f (Get-Date -Format 'yy.MM.dd'))
$destination = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak10_dir.vpk'
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
    'hud_spectate_bar', 'citadel_status_effect',
    'observer_hud/band', 'observer_hud/tournament_bar', 'observer_hud/debuffs', 'observer_hud/editor',
    'observer_hud/debuff_relay'
)
$styles = @(
    'observer_hud/oh_host', 'observer_hud/oh_band', 'observer_hud/oh_bar', 'observer_hud/oh_debuffs',
    'observer_hud/oh_editor', 'observer_hud/oh_status_world'
)
$scripts = @(
    'observer_hud/oh_state', 'observer_hud/oh_heroes', 'observer_hud/oh_debuff_icons', 'observer_hud/oh_item_icons',
    'observer_hud/oh_host', 'observer_hud/oh_menu', 'observer_hud/oh_debuffs', 'observer_hud/oh_buys',
    'observer_hud/oh_debuff_world', 'observer_hud/oh_debuff_relay'
)
# Shipped as Closure ADVANCED output; the generated data tables (read as var OH_* globals) stay as written.
$closureScripts = @(
    'observer_hud/oh_state', 'observer_hud/oh_host', 'observer_hud/oh_menu', 'observer_hud/oh_debuffs',
    'observer_hud/oh_buys', 'observer_hud/oh_debuff_world', 'observer_hud/oh_debuff_relay'
)
# Purchase notice frame pieces (observer_hud/scripts/make-notice-frame.py), each a PNG + .vtex.
$images = @(
    'observer_hud/buy_frame2_l', 'observer_hud/buy_frame2_m', 'observer_hud/buy_frame2_r',
    'observer_hud/buy_frame3_l', 'observer_hud/buy_frame3_m', 'observer_hud/buy_frame3_r'
)
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
        & node (Join-Path $module 'scripts\validate-observer-hud.js') | Select-Object -Last 1
        if ($LASTEXITCODE -ne 0) { throw 'Observer HUD validation failed on the Closure ADVANCED scripts' }
    } finally {
        Remove-Item Env:OH_RUNTIME_ROOT -ErrorAction SilentlyContinue
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
    if (Test-Path -LiteralPath $dist) { Remove-TreeUnderRoot -Path $dist -RootPath $root -ExpectedLeaf 'observer_hud' }
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
}

Write-Host "`n[4/4] Writing release 7z..." -ForegroundColor Cyan
$releaseEntries = @($vpkOut.Substring($dist.Length + 1))
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
}
