[CmdletBinding()]
param(
    [switch]$SkipDeploy
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')

$modSrc = Join-Path $root 'hp_colors_rewrite_v2'
$modCompiled = Join-Path $root 'hp_colors_rewrite_v2_compiled'
$compileStageRoot = Join-Path $root '_hp_colors_rewrite_v2_build'
$compileStageSource = Join-Path $compileStageRoot 'hp_colors_rewrite_v2'
$compileStageOutput = Join-Path $compileStageRoot 'hp_colors_rewrite_v2_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak02_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak02_dir.vpk'
$validators = @(
    (Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-baseline.test.js'),
    (Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-editor.test.js'),
    (Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-parity.test.js'),
    (Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-state.test.js')
)

$assetManifest = @(
    [pscustomobject]@{ Source = 'panorama\layout\hud_escape_menu.xml'; Packed = 'panorama/layout/hud_escape_menu.vxml_c' }
    [pscustomobject]@{ Source = 'panorama\layout\unit_status_overlay_v2.xml'; Packed = 'panorama/layout/unit_status_overlay_v2.vxml_c' }
    [pscustomobject]@{ Source = 'panorama\styles\hp_colors_v2_menu.css'; Packed = 'panorama/styles/hp_colors_v2_menu.vcss_c' }
    [pscustomobject]@{ Source = 'panorama\styles\unit_status_v2.css'; Packed = 'panorama/styles/unit_status_v2.vcss_c' }
    [pscustomobject]@{ Source = 'panorama\scripts\hp_colors_v2_contract.js'; Packed = 'panorama/scripts/hp_colors_v2_contract.vjs_c' }
    [pscustomobject]@{ Source = 'panorama\scripts\hp_colors_v2_state.js'; Packed = 'panorama/scripts/hp_colors_v2_state.vjs_c' }
    [pscustomobject]@{ Source = 'panorama\scripts\hp_colors_v2_menu.js'; Packed = 'panorama/scripts/hp_colors_v2_menu.vjs_c' }
    [pscustomobject]@{ Source = 'panorama\scripts\unit_status_v2_colors.js'; Packed = 'panorama/scripts/unit_status_v2_colors.vjs_c' }
    [pscustomobject]@{ Source = 'panorama\scripts\unit_status_v2_segment_align.js'; Packed = 'panorama/scripts/unit_status_v2_segment_align.vjs_c' }
)
$rewriteScripts = @(
    $assetManifest |
        Where-Object { $_.Source.EndsWith('.js') } |
        ForEach-Object { $_.Source }
)
$expectedPackedAssets = @($assetManifest | ForEach-Object { $_.Packed })
$requiredCompiled = @(
    $expectedPackedAssets |
        ForEach-Object { Join-Path $compileStageOutput $_.Replace('/', '\') }
)

function Require-Path {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $bytes = $sha256.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '')
    }
    finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

Require-Path -Path $modSrc -Label 'HP Colors Rewrite v2 source folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'
foreach ($validator in $validators) {
    Require-Path -Path $validator -Label 'HP Colors Rewrite v2 validator'
}

Write-Host "`n[1/5] Validating HP Colors Rewrite v2 source..." -ForegroundColor Cyan
& node --test $validators
if ($LASTEXITCODE -ne 0) {
    throw "HP Colors Rewrite v2 validator failed with exit code $LASTEXITCODE"
}

Write-Host "`n[2/5] Preparing HP Colors Rewrite v2 source..." -ForegroundColor Cyan
Remove-TreeUnderRoot -Path $modCompiled -RootPath $root -ExpectedLeaf 'hp_colors_rewrite_v2_compiled'
Remove-TreeUnderRoot -Path $compileStageRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_build'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}

try {
    $stagePanorama = Join-Path $compileStageSource 'panorama'
    New-Item -ItemType Directory -Path $stagePanorama -Force | Out-Null
    Copy-Item -Path (Join-Path $modSrc 'panorama\*') -Destination $stagePanorama -Recurse -Force
    Invoke-HpColorsRewriteClosureAdvanced `
        -StageSourceRoot $compileStageSource `
        -ScriptRelativePaths $rewriteScripts `
        -WorkRoot $compileStageRoot
    Invoke-HpColorsRewriteClosureTests -RepositoryRoot $root -SourceRoot $compileStageSource


    Write-Host "`n[3/5] Compiling HP Colors Rewrite v2..." -ForegroundColor Cyan
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $compileStageSource -RequiredOutputs $requiredCompiled -TimeoutSeconds 120
    Move-Item -LiteralPath $compileStageOutput -Destination $modCompiled
}
finally {
    Remove-TreeUnderRoot -Path $compileStageRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_build'
}
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

$compiledAssets = @(
    Get-ChildItem -LiteralPath $modCompiled -Recurse -File | ForEach-Object {
        $_.FullName.Substring($modCompiled.Length + 1).Replace('\', '/')
    }
)
$assetDifference = @(
    Compare-Object `
        -ReferenceObject ($expectedPackedAssets | Sort-Object) `
        -DifferenceObject ($compiledAssets | Sort-Object)
)
if ($assetDifference.Count -gt 0) {
    throw "HP Colors Rewrite v2 compiled asset set mismatch. Expected=$($expectedPackedAssets -join ',') Actual=$($compiledAssets -join ',')"
}

Write-Host "`n[4/5] Packing pak02_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
$forbiddenPackedAssets = @(
    'node_modules',
    'AGENTS.md',
    'FEATURES.md',
    'design.md',
    '.xml',
    '.css',
    '.js',
    'healthbar_logic'
)
Assert-PackedVpkAssets -Tree $vpkTree -Label 'HP Colors Rewrite v2 VPK' -Required $expectedPackedAssets -Forbidden $forbiddenPackedAssets
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

if ($SkipDeploy) {
    Write-Host "`n[5/5] Deployment skipped." -ForegroundColor Yellow
    Write-Host "`nHP Colors Rewrite v2 build complete. Compile-only VPK -> $vpkOut" -ForegroundColor Yellow
    return
}

Write-Host "`n[5/5] Backing up and deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
Require-Path -Path $destDir -Label 'Deadlock addons folder'

if (Test-Path -LiteralPath $vpkDest) {
    $backupStamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backupPath = "$vpkDest.backup_$backupStamp"
    Copy-Item -LiteralPath $vpkDest -Destination $backupPath
    Write-Host "  Previous addon backed up -> $backupPath" -ForegroundColor DarkGray
}

Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
$sourceHash = Get-Sha256 -Path $vpkOut
$deployedHash = Get-Sha256 -Path $vpkDest
if ($sourceHash -ne $deployedHash) {
    throw "Deployed VPK hash mismatch. Source=$sourceHash Destination=$deployedHash"
}

$destSize = (Get-Item -LiteralPath $vpkDest).Length
Write-Host "  Deployed OK -> $vpkDest ($([math]::Round($destSize / 1KB, 1)) KB)" -ForegroundColor Green
Write-Host "  SHA256 -> $deployedHash" -ForegroundColor DarkGray
Write-Host "`nDone. Restart Deadlock and run the smoke test from hp_colors_rewrite_v2\FEATURES.md." -ForegroundColor Yellow
Write-Host "HP Colors Rewrite v2 build complete" -ForegroundColor Green
