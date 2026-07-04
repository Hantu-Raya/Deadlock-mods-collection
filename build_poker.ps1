$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$modSrc = Join-Path $root 'poker'
$modCompiled = Join-Path $root 'poker_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak01_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak01_dir.vpk'

$requiredCompiledOutputs = @(
    (Join-Path $modCompiled 'panorama\layout\chat.vxml_c'),
    (Join-Path $modCompiled 'panorama\layout\hud_escape_menu.vxml_c'),
    (Join-Path $modCompiled 'panorama\scripts\poker_chat_debug.vjs_c'),
    (Join-Path $modCompiled 'panorama\scripts\poker_escape_menu.vjs_c'),
    (Join-Path $modCompiled 'panorama\styles\poker_escape_menu.vcss_c')
)
$requiredPackedAssets = @(
    'panorama/layout/chat.vxml_c',
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/scripts/poker_chat_debug.vjs_c',
    'panorama/scripts/poker_escape_menu.vjs_c',
    'panorama/styles/poker_escape_menu.vcss_c'
)

if (-not (Test-Path -LiteralPath $modSrc)) { throw "Source mod not found: $modSrc" }
if (-not (Test-Path -LiteralPath $compiler)) { throw "Compiler not found: $compiler" }

# Clean rebuild: remove stale compiled output and previous poker pack artifact.
Remove-TreeUnderRoot -Path $modCompiled -RootPath $root -ExpectedLeaf 'poker_compiled'
if (Test-Path -LiteralPath $vpkOut) { Remove-Item -LiteralPath $vpkOut -Force }

# [1/4] Compile
Write-Host "`n[1/4] Compiling poker..." -ForegroundColor Cyan
Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $modSrc -RequiredOutputs $requiredCompiledOutputs -TimeoutSeconds 120
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# [2/4] Pack VPK
Write-Host "`n[2/4] Packing pak01_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

# [3/4] Verify packed assets
Write-Host "`n[3/4] Verifying packed assets..." -ForegroundColor Cyan
$packedTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets -Tree $packedTree -Required $requiredPackedAssets -Label 'poker pak01_dir.vpk'
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
