$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
$repoRoot = Split-Path $scriptDir -Parent
$sourceHud = Join-Path $scriptDir 'hud.xml'
$sourceLayouts = Join-Path $scriptDir 'panorama\layout'
$sourceStyles = Join-Path $scriptDir 'panorama\styles'
$sourceScripts = Join-Path $scriptDir 'panorama\scripts'
$stageAddon = Join-Path $repoRoot '.tmp_3d_hud_addon'
$stageTerser = Join-Path $repoRoot '.tmp_3d_hud_terser'
$stageTerserCompiled = Join-Path $repoRoot '.tmp_3d_hud_terser_compiled'
$stageHudLayout = Join-Path $stageAddon 'panorama\layout'
$stageStyles = Join-Path $stageAddon 'panorama\styles'
$stageScripts = Join-Path $stageAddon 'panorama\scripts'
$stageTerserScripts = Join-Path $stageTerser 'panorama\scripts'
$compiledHud = Join-Path $stageTerserCompiled 'panorama\layout\hud.vxml_c'
$compiledCss = Join-Path $stageTerserCompiled 'panorama\styles\3d_hud.vcss_c'
$compiledScript = Join-Path $stageTerserCompiled 'panorama\scripts\3d_hero_dynamic.vjs_c'
$compiler = Join-Path $repoRoot 'sr2compiler\New folder.exe'
$vpkeditcli = Join-Path $repoRoot 'passive_items_mod\compiler\vpkeditcli.exe'
$vpkOut = Join-Path $scriptDir 'pak98_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk'
$sourceScript = Join-Path $stageAddon 'panorama\scripts\3d_hero_dynamic.js'
$compressedScript = Join-Path $stageTerser 'panorama\scripts\3d_hero_dynamic.js'

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

function Remove-RepoChild {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Leaf
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $resolvedRoot = (Resolve-Path -LiteralPath $repoRoot).Path
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $expectedPath = Join-Path $resolvedRoot $Leaf
    if ($resolvedPath -ne $expectedPath) {
        throw "Refusing to remove unexpected path: $resolvedPath"
    }

    Remove-Item -LiteralPath $Path -Recurse -Force
}

Require-Path -Path $sourceHud -Label '3D HUD XML'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'

Write-Host "`n[1/4] Staging 3D HUD addon..." -ForegroundColor Cyan
Remove-RepoChild -Path $stageAddon -Leaf '.tmp_3d_hud_addon'
Remove-RepoChild -Path $stageTerser -Leaf '.tmp_3d_hud_terser'
Remove-RepoChild -Path $stageTerserCompiled -Leaf '.tmp_3d_hud_terser_compiled'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}

New-Item -ItemType Directory -Path $stageHudLayout -Force | Out-Null
Copy-Item -LiteralPath $sourceHud -Destination (Join-Path $stageHudLayout 'hud.xml') -Force
if (Test-Path -LiteralPath $sourceLayouts) {
    Copy-Item -Path (Join-Path $sourceLayouts '*') -Destination $stageHudLayout -Recurse -Force
}
if (Test-Path -LiteralPath $sourceStyles) {
    New-Item -ItemType Directory -Path $stageStyles -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceStyles '*') -Destination $stageStyles -Recurse -Force
}
if (Test-Path -LiteralPath $sourceScripts) {
    New-Item -ItemType Directory -Path $stageScripts -Force | Out-Null
    Copy-Item -Path (Join-Path $sourceScripts '*') -Destination $stageScripts -Recurse -Force
}
Write-Host "  Staged -> $stageAddon" -ForegroundColor Green

Write-Host "`n[2/4] Minifying Panorama JS with terser..." -ForegroundColor Cyan
Copy-Item -LiteralPath $stageAddon -Destination $stageTerser -Recurse -Force
if (-not (Test-Path -LiteralPath $sourceScript)) {
    throw "Source script not found for terser: $sourceScript"
}
if (-not (Test-Path -LiteralPath $compressedScript)) {
    throw "Terser target not created: $compressedScript"
}

$terserArgs = @(
    '--yes'
    'terser'
    $sourceScript
    '-c'
    'passes=3'
    '-m'
    'keep_fnames=true,keep_classnames=true'
    '--comments'
    'false'
    '-o'
    $compressedScript
)

& npx @terserArgs
if ($LASTEXITCODE -ne 0) {
    throw "terser failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path -LiteralPath $compressedScript)) {
    throw "Compressed script not found after terser run: $compressedScript"
}
Write-Host "  Minified OK -> $compressedScript" -ForegroundColor Green

Write-Host "`n[3/4] Compiling staged addon..." -ForegroundColor Cyan
$compile = Start-Process -FilePath $compiler -ArgumentList "`"$stageTerser`"" -PassThru -Wait -NoNewWindow
if ($compile.ExitCode -ne 0) {
    if (-not (Test-Path -LiteralPath $compiledHud)) {
        throw "Compiler failed with code $($compile.ExitCode) and did not emit $compiledHud"
    }
    Write-Host "  Compiler exited $($compile.ExitCode), but hud.vxml_c exists; continuing." -ForegroundColor Yellow
}

Require-Path -Path $compiledHud -Label 'Compiled hud.vxml_c'
Require-Path -Path $compiledCss -Label 'Compiled 3d_hud.vcss_c'
Require-Path -Path $compiledScript -Label 'Compiled 3d_hero_dynamic.vjs_c'
Write-Host "  Compiled OK -> $compiledHud" -ForegroundColor Green

Write-Host "`n[4/4] Packing pak98_dir.vpk..." -ForegroundColor Cyan
$packArgs = "`"$stageTerserCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    throw "vpkeditcli failed with code $($pack.ExitCode)"
}

Require-Path -Path $vpkOut -Label 'pak98_dir.vpk'
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`nDeploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
Require-Path -Path $destDir -Label 'Deadlock addons folder'
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
$destSize = (Get-Item -LiteralPath $vpkDest).Length
Write-Host "  Deployed OK -> $vpkDest ($([math]::Round($destSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`nCleaning temporary compile folders..." -ForegroundColor Cyan
Remove-RepoChild -Path $stageAddon -Leaf '.tmp_3d_hud_addon'
Remove-RepoChild -Path $stageTerser -Leaf '.tmp_3d_hud_terser'
Remove-RepoChild -Path $stageTerserCompiled -Leaf '.tmp_3d_hud_terser_compiled'
Write-Host "  Cleaned OK" -ForegroundColor Green

Write-Host "`nDone. Test in Deadlock with -dev -tools and check W.log/Panorama debugger." -ForegroundColor Yellow
