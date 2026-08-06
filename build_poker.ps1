$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$modSrc = Join-Path $root 'poker'
$modCompiled = Join-Path $root 'poker_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$cardAssetsSrc = Join-Path $modSrc 'panorama\images\poker\cards'
$cardAssetsOut = Join-Path $modCompiled 'panorama\images\poker\cards'
$chipAssetsSrc = Join-Path $modSrc 'panorama\images\poker\chips'
$chipAssetsOut = Join-Path $modCompiled 'panorama\images\poker\chips'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak01_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak01_dir.vpk'
$requiredCardAssets = @(
    'card_face_ace',
    'card_face_jack',
    'card_face_joker',
    'card_face_king',
    'card_face_queen',
    'card_suit_club',
    'card_suit_diamond',
    'card_suit_heart',
    'card_suit_spade'
)
$requiredChipAssets = @(
    'pot_100_red_chips_512',
    'pot_300_green_chips_512',
    'pot_500_green_chips_512',
    'pot_1000_black_chips_512',
    'pot_2500_plus_mixed_chips_512'
)

$requiredCompiledOutputs = @(
    (Join-Path $modCompiled 'panorama\layout\chat.vxml_c'),
    (Join-Path $modCompiled 'panorama\layout\hud_escape_menu.vxml_c'),
    (Join-Path $modCompiled 'panorama\scripts\poker_chat_debug.vjs_c'),
    (Join-Path $modCompiled 'panorama\scripts\poker_escape_menu.vjs_c'),
    (Join-Path $modCompiled 'panorama\styles\poker_escape_menu.vcss_c')
)
$requiredTextureOutputs = @(
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_face_ace.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_face_jack.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_face_joker.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_face_king.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_face_queen.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_suit_club.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_suit_diamond.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_suit_heart.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\cards\card_suit_spade.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\chips\pot_100_red_chips_512.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\chips\pot_300_green_chips_512.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\chips\pot_500_green_chips_512.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\chips\pot_1000_black_chips_512.vtex_c'),
    (Join-Path $modCompiled 'panorama\images\poker\chips\pot_2500_plus_mixed_chips_512.vtex_c')
)
$requiredPackedAssets = @(
    'panorama/layout/chat.vxml_c',
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/scripts/poker_chat_debug.vjs_c',
    'panorama/scripts/poker_escape_menu.vjs_c',
    'panorama/styles/poker_escape_menu.vcss_c',
    'panorama/images/poker/cards/card_face_ace.vtex_c',
    'panorama/images/poker/cards/card_face_jack.vtex_c',
    'panorama/images/poker/cards/card_face_joker.vtex_c',
    'panorama/images/poker/cards/card_face_king.vtex_c',
    'panorama/images/poker/cards/card_face_queen.vtex_c',
    'panorama/images/poker/cards/card_suit_club.vtex_c',
    'panorama/images/poker/cards/card_suit_diamond.vtex_c',
    'panorama/images/poker/cards/card_suit_heart.vtex_c',
    'panorama/images/poker/cards/card_suit_spade.vtex_c',
    'panorama/images/poker/chips/pot_100_red_chips_512.vtex_c',
    'panorama/images/poker/chips/pot_300_green_chips_512.vtex_c',
    'panorama/images/poker/chips/pot_500_green_chips_512.vtex_c',
    'panorama/images/poker/chips/pot_1000_black_chips_512.vtex_c',
    'panorama/images/poker/chips/pot_2500_plus_mixed_chips_512.vtex_c'
)
$forbiddenPackedAssets = @(
    'panorama/images/poker/cards/card_face_ace.png',
    'panorama/images/poker/cards/card_face_jack.png',
    'panorama/images/poker/cards/card_face_joker.png',
    'panorama/images/poker/cards/card_face_king.png',
    'panorama/images/poker/cards/card_face_queen.png',
    'panorama/images/poker/cards/card_suit_club.png',
    'panorama/images/poker/cards/card_suit_diamond.png',
    'panorama/images/poker/cards/card_suit_heart.png',
    'panorama/images/poker/cards/card_suit_spade.png',
    'panorama/images/poker/chips/pot_100_red_chips_512.png',
    'panorama/images/poker/chips/pot_300_green_chips_512.png',
    'panorama/images/poker/chips/pot_500_green_chips_512.png',
    'panorama/images/poker/chips/pot_1000_black_chips_512.png',
    'panorama/images/poker/chips/pot_2500_plus_mixed_chips_512.png'
)
$forbiddenRawCardAssets = $forbiddenPackedAssets + @(
    'panorama/images/poker/cards/card_face_ace.vtex',
    'panorama/images/poker/cards/card_face_jack.vtex',
    'panorama/images/poker/cards/card_face_joker.vtex',
    'panorama/images/poker/cards/card_face_king.vtex',
    'panorama/images/poker/cards/card_face_queen.vtex',
    'panorama/images/poker/cards/card_suit_club.vtex',
    'panorama/images/poker/cards/card_suit_diamond.vtex',
    'panorama/images/poker/cards/card_suit_heart.vtex',
    'panorama/images/poker/cards/card_suit_spade.vtex',
    'panorama/images/poker/chips/pot_100_red_chips_512.vtex',
    'panorama/images/poker/chips/pot_300_green_chips_512.vtex',
    'panorama/images/poker/chips/pot_500_green_chips_512.vtex',
    'panorama/images/poker/chips/pot_1000_black_chips_512.vtex',
    'panorama/images/poker/chips/pot_2500_plus_mixed_chips_512.vtex'
)

if (-not (Test-Path -LiteralPath $modSrc)) { throw "Source mod not found: $modSrc" }
if (-not (Test-Path -LiteralPath $compiler)) { throw "Compiler not found: $compiler" }
if (-not (Test-Path -LiteralPath $cardAssetsSrc)) { throw "Card source folder missing: $cardAssetsSrc" }
foreach ($asset in $requiredCardAssets) {
    $pngSource = Join-Path $cardAssetsSrc "$asset.png"
    $vtexSource = Join-Path $cardAssetsSrc "$asset.vtex"
    if (-not (Test-Path -LiteralPath $pngSource)) { throw "Card PNG source missing: $pngSource" }
    if (-not (Test-Path -LiteralPath $vtexSource)) { throw "Card VTEX source missing: $vtexSource" }
}
if (-not (Test-Path -LiteralPath $chipAssetsSrc)) { throw "Chip source folder missing: $chipAssetsSrc" }
foreach ($asset in $requiredChipAssets) {
    $pngSource = Join-Path $chipAssetsSrc "$asset.png"
    $vtexSource = Join-Path $chipAssetsSrc "$asset.vtex"
    if (-not (Test-Path -LiteralPath $pngSource)) { throw "Chip PNG source missing: $pngSource" }
    if (-not (Test-Path -LiteralPath $vtexSource)) { throw "Chip VTEX source missing: $vtexSource" }
}

function Invoke-PokerTextureCompiler {
    $prefPath = Join-Path $root 'sr2compiler\pref.json'
    if (-not (Test-Path -LiteralPath $prefPath)) { throw "sr2compiler pref.json not found: $prefPath" }
    $dotaRoot = (Get-Content -LiteralPath $prefPath -Raw | ConvertFrom-Json).directory
    if (-not $dotaRoot) { throw "sr2compiler pref.json does not define a Dota install directory" }

    $resourceCompiler = Join-Path $dotaRoot 'game\bin\win64\resourcecompiler.exe'
    $gamePath = Join-Path $dotaRoot 'game\dota'
    $contentAddonsRoot = Join-Path $dotaRoot 'content\dota_addons'
    $gameAddonsRoot = Join-Path $dotaRoot 'game\dota_addons'
    $addonName = 'deadlock_poker_cards_compile'
    $contentStage = Join-Path $contentAddonsRoot $addonName
    $gameStage = Join-Path $gameAddonsRoot $addonName
    $stageCardDir = Join-Path $contentStage 'panorama\images\poker\cards'
    $compiledCardDir = Join-Path $gameStage 'panorama\images\poker\cards'
    $stageChipDir = Join-Path $contentStage 'panorama\images\poker\chips'
    $compiledChipDir = Join-Path $gameStage 'panorama\images\poker\chips'
    $fileList = Join-Path $root '.scratch\poker_card_vtex_filelist.txt'

    if (-not (Test-Path -LiteralPath $resourceCompiler)) { throw "resourcecompiler.exe not found: $resourceCompiler" }
    if (-not (Test-Path -LiteralPath $gamePath)) { throw "Dota game path not found: $gamePath" }

    Remove-TreeUnderRoot -Path $contentStage -RootPath $contentAddonsRoot -ExpectedLeaf $addonName
    Remove-TreeUnderRoot -Path $gameStage -RootPath $gameAddonsRoot -ExpectedLeaf $addonName
    New-Item -ItemType Directory -Force -Path $stageCardDir, $stageChipDir | Out-Null
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $fileList) | Out-Null

    $vtexFiles = @()
    foreach ($asset in $requiredCardAssets) {
        Copy-Item -LiteralPath (Join-Path $cardAssetsSrc "$asset.png") -Destination (Join-Path $stageCardDir "$asset.png") -Force
        Copy-Item -LiteralPath (Join-Path $cardAssetsSrc "$asset.vtex") -Destination (Join-Path $stageCardDir "$asset.vtex") -Force
        $vtexFiles += (Join-Path $stageCardDir "$asset.vtex")
    }
    foreach ($asset in $requiredChipAssets) {
        Copy-Item -LiteralPath (Join-Path $chipAssetsSrc "$asset.png") -Destination (Join-Path $stageChipDir "$asset.png") -Force
        Copy-Item -LiteralPath (Join-Path $chipAssetsSrc "$asset.vtex") -Destination (Join-Path $stageChipDir "$asset.vtex") -Force
        $vtexFiles += (Join-Path $stageChipDir "$asset.vtex")
    }
    $vtexFiles | Set-Content -LiteralPath $fileList -Encoding ASCII

    Write-Host "  Compiling poker VTEX textures..." -ForegroundColor Cyan
    & $resourceCompiler -filelist $fileList -game $gamePath -f -nop4
    if ($LASTEXITCODE -ne 0) { throw "resourcecompiler failed for card textures with exit code $LASTEXITCODE" }

    New-Item -ItemType Directory -Force -Path $cardAssetsOut | Out-Null
    foreach ($asset in $requiredCardAssets) {
        $compiledAsset = Join-Path $compiledCardDir "$asset.vtex_c"
        if (-not (Test-Path -LiteralPath $compiledAsset)) { throw "Compiled card texture missing: $compiledAsset" }
        Copy-Item -LiteralPath $compiledAsset -Destination (Join-Path $cardAssetsOut "$asset.vtex_c") -Force
    }
    New-Item -ItemType Directory -Force -Path $chipAssetsOut | Out-Null
    foreach ($asset in $requiredChipAssets) {
        $compiledAsset = Join-Path $compiledChipDir "$asset.vtex_c"
        if (-not (Test-Path -LiteralPath $compiledAsset)) { throw "Compiled chip texture missing: $compiledAsset" }
        Copy-Item -LiteralPath $compiledAsset -Destination (Join-Path $chipAssetsOut "$asset.vtex_c") -Force
    }

    foreach ($requiredOutput in $requiredTextureOutputs) {
        if (-not (Test-Path -LiteralPath $requiredOutput)) { throw "Compiled card texture output missing: $requiredOutput" }
    }

    Remove-TreeUnderRoot -Path $contentStage -RootPath $contentAddonsRoot -ExpectedLeaf $addonName
    Remove-TreeUnderRoot -Path $gameStage -RootPath $gameAddonsRoot -ExpectedLeaf $addonName
}

function Assert-NoPackedPokerRawCardAssets {
    param([Parameter(Mandatory = $true)][string[]]$Tree)

    $normalizedTree = $Tree | ForEach-Object { ($_ -replace '\\', '/').Trim() }
    foreach ($asset in $forbiddenRawCardAssets) {
        $escaped = [regex]::Escape($asset)
        $leaf = [regex]::Escape((Split-Path -Leaf $asset))
        $found = $false
        foreach ($line in $normalizedTree) {
            if ($line -match "(^|[\\s|])$escaped($|[\\s|])" -or $line -match "(^|[\\s|/])$leaf($|[\\s|])") {
                $found = $true
                break
            }
        }
        if ($found) { throw "poker pak01_dir.vpk contains forbidden raw card asset: $asset" }
    }
}

# Clean rebuild: remove stale compiled output and previous poker pack artifact.
Remove-TreeUnderRoot -Path $modCompiled -RootPath $root -ExpectedLeaf 'poker_compiled'
if (Test-Path -LiteralPath $vpkOut) { Remove-Item -LiteralPath $vpkOut -Force }

# [1/4] Compile
Write-Host "`n[1/4] Compiling poker..." -ForegroundColor Cyan
Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $modSrc -RequiredOutputs $requiredCompiledOutputs -TimeoutSeconds 120
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green
Invoke-PokerTextureCompiler
Write-Host "  Poker VTEX textures compiled OK" -ForegroundColor Green
Get-ChildItem -LiteralPath $cardAssetsOut, $chipAssetsOut -File |
    Where-Object { $_.Extension -in @('.png', '.vtex') } |
    Remove-Item -Force
Write-Host "  Raw poker PNG/VTEX sources removed from compiled output" -ForegroundColor Green

# [2/4] Pack VPK
Write-Host "`n[2/4] Packing pak01_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

# [3/4] Verify packed assets
Write-Host "`n[3/4] Verifying packed assets..." -ForegroundColor Cyan
$packedTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets -Tree $packedTree -Required $requiredPackedAssets -Forbidden $forbiddenPackedAssets -Label 'poker pak01_dir.vpk'
Assert-NoPackedPokerRawCardAssets -Tree $packedTree
Write-Host "  VPK assets OK" -ForegroundColor Green

# [4/4] Deploy
Write-Host "`n[4/4] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path -LiteralPath $destDir)) {
    throw "Destination folder not found: $destDir"
}
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
$destInfo = Get-Item -LiteralPath $vpkDest
Write-Host "  Deployed OK -> $vpkDest ($([math]::Round($destInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`nDone! Launch Deadlock to test poker chat debug logging." -ForegroundColor Yellow
