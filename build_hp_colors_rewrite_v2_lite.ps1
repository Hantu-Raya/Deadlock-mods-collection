[CmdletBinding()]
param([switch]$Deploy)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$cssSource = Join-Path $root 'hp_colors_rewrite_v2_lite\panorama\styles\unit_status_v2.css'
$modCompiled = Join-Path $root 'hp_colors_rewrite_v2_lite_compiled'
$stageRoot = Join-Path $root '_hp_colors_rewrite_v2_lite_build'
$stageSource = Join-Path $stageRoot 'hp_colors_rewrite_v2_lite'
$stageOutput = Join-Path $stageRoot 'hp_colors_rewrite_v2_lite_compiled'
$stageCss = Join-Path $stageSource 'panorama\styles\unit_status_v2.css'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'hp_colors_rewrite_v2_lite_pak02_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak02_dir.vpk'
$expectedPackedAssets = @('panorama/styles/unit_status_v2.vcss_c')
$requiredCompiled = @(Join-Path $stageOutput 'panorama\styles\unit_status_v2.vcss_c')

foreach ($inputPath in @($cssSource, $compiler)) {
    if (-not (Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw "Missing input: $inputPath" }
}
& node --test (Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-lite.test.js')
if ($LASTEXITCODE -ne 0) { throw 'HP Colors Rewrite v2 Lite validation failed' }

Remove-TreeUnderRoot -Path $modCompiled -RootPath $root -ExpectedLeaf 'hp_colors_rewrite_v2_lite_compiled'
Remove-TreeUnderRoot -Path $stageRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_lite_build'
try {
    New-Item -ItemType Directory -Path (Split-Path $stageCss -Parent) -Force | Out-Null
    # Stage exactly one authored asset; README and any future files never enter the pack.
    Copy-Item -LiteralPath $cssSource -Destination $stageCss
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredCompiled -TimeoutSeconds 120
    Move-Item -LiteralPath $stageOutput -Destination $modCompiled
}
finally {
    Remove-TreeUnderRoot -Path $stageRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_lite_build'
}

$compiledAssets = @(Get-ChildItem -LiteralPath $modCompiled -Recurse -File | ForEach-Object {
    $_.FullName.Substring($modCompiled.Length + 1).Replace('\', '/')
})
$assetDifference = @(Compare-Object -ReferenceObject $expectedPackedAssets -DifferenceObject $compiledAssets)
if ($assetDifference.Count -gt 0) { throw "Lite compiled asset set mismatch: $($compiledAssets -join ', ')" }

Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets -Tree $vpkTree -Label 'HP Colors Rewrite v2 Lite VPK' -Required $expectedPackedAssets -Forbidden @('panorama/layout', 'panorama/scripts', '.xml', '.css', '.js', '.vtex', '.png', 'README.md')

if (-not $Deploy) {
    Write-Host "Build complete (not deployed): $vpkOut"
    return
}
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path -LiteralPath $destDir -PathType Container)) { throw "Deadlock addons folder not found: $destDir" }
if (Test-Path -LiteralPath $vpkDest) {
    $backupPath = "$vpkDest.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss_fff')"
    Copy-Item -LiteralPath $vpkDest -Destination $backupPath
}
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
if ((Get-FileHash -LiteralPath $vpkOut -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $vpkDest -Algorithm SHA256).Hash) {
    throw 'Lite deployed VPK hash mismatch'
}
Write-Host "Deployed Lite to $vpkDest. Fully restart Deadlock."
