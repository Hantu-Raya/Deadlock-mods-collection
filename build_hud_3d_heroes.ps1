$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$modSrc = Join-Path $root '3d hud'
$modCompiled = Join-Path $root '3d hud_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak98_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk'
$compiledHud = Join-Path $modCompiled 'panorama\layout\hud.vxml_c'
$compiledHudHealth = Join-Path $modCompiled 'panorama\layout\hud_health.vxml_c'
$compiledScript = Join-Path $modCompiled 'panorama\scripts\3d_hero_dynamic.vjs_c'
$compiledStyle = Join-Path $modCompiled 'panorama\styles\3d_hud.vcss_c'

function Require-Path {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}


Require-Path -Path $modSrc -Label '3D HUD source folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'

Write-Host "`n[1/3] Compiling 3d hud..." -ForegroundColor Cyan
Remove-TreeUnderRoot -Path $modCompiled -RootPath $root -ExpectedLeaf '3d hud_compiled'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}

Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $modSrc -RequiredOutputs @($compiledHud, $compiledHudHealth, $compiledScript, $compiledStyle) -TimeoutSeconds 120
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[2/3] Packing pak98_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
Require-Path -Path $vpkOut -Label 'pak98_dir.vpk'
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`n[3/3] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
Require-Path -Path $destDir -Label 'Deadlock addons folder'

Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
$destSize = (Get-Item -LiteralPath $vpkDest).Length
Write-Host "  Deployed OK -> $vpkDest ($([math]::Round($destSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`nDone. Launch Deadlock with -dev -tools and check W.log/Panorama debugger for ThreeDHeroHudProbe." -ForegroundColor Yellow
