[CmdletBinding()]
param(
    [switch]$SkipDeploy,
    [switch]$RefreshFromInstalledQollock,
    [string]$Source2ViewerPath = ''
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')

$canonicalSrc = Join-Path $root 'hp_colors_rewrite_v2'
$supportSrc = Join-Path $root 'hp_colors_rewrite_v2_qollock'
$compiledOut = Join-Path $root 'hp_colors_rewrite_v2_qollock_compiled'
$buildRoot = Join-Path $root '_hp_colors_rewrite_v2_qollock_build'
$stageSource = Join-Path $buildRoot 'hp_colors_rewrite_v2_qollock'
$refreshRoot = Join-Path $buildRoot 'refresh'
$stageOutput = Join-Path $buildRoot 'hp_colors_rewrite_v2_qollock_compiled'
$canonicalClosureTestRoot = Join-Path $buildRoot 'hp_colors_rewrite_v2_closure_test'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak02_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak02_dir.vpk'
$qollockPak = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak03_dir.vpk'
$manifestPath = Join-Path $supportSrc 'qollock-source.sha256'
$contractPath = Join-Path $supportSrc 'pak02-contract.json'
$refreshScript = Join-Path $root 'scripts\refresh-hp-colors-rewrite-qollock.js'
$canonicalEscapeMenu = Join-Path $canonicalSrc 'panorama\layout\hud_escape_menu.xml'
if ([string]::IsNullOrWhiteSpace($Source2ViewerPath)) {
    $Source2ViewerPath = Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'
}

$canonicalScripts = @(
    'panorama\scripts\hp_colors_v2_contract.js',
    'panorama\scripts\hp_colors_v2_state.js',
    'panorama\scripts\hp_colors_v2_menu.js',
    'panorama\scripts\unit_status_v2_colors.js',
    'panorama\scripts\unit_status_v2_segment_align.js'
)
$compatibilityScripts = $canonicalScripts + @(
    'panorama\scripts\qollock_hp_colors_bridge.js'
)
$canonicalFiles = @(
    'panorama\layout\unit_status_overlay_v2.xml',
    'panorama\scripts\hp_colors_v2_contract.js',
    'panorama\scripts\hp_colors_v2_state.js',
    'panorama\scripts\hp_colors_v2_menu.js',
    'panorama\scripts\unit_status_v2_colors.js',
    'panorama\scripts\unit_status_v2_segment_align.js',
    'panorama\styles\hp_colors_v2_menu.css',
    'panorama\styles\unit_status_v2.css'
)
$supportFiles = @(
    'panorama\layout\hud.xml',
    'panorama\layout\hud_escape_menu.xml',
    'panorama\scripts\qollock_hp_colors_bridge.js'
)
$expectedPackedAssets = @(
    'panorama/layout/hud.vxml_c',
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/layout/unit_status_overlay_v2.vxml_c',
    'panorama/scripts/hp_colors_v2_contract.vjs_c',
    'panorama/scripts/hp_colors_v2_state.vjs_c',
    'panorama/scripts/hp_colors_v2_menu.vjs_c',
    'panorama/scripts/unit_status_v2_colors.vjs_c',
    'panorama/scripts/unit_status_v2_segment_align.vjs_c',
    'panorama/scripts/qollock_hp_colors_bridge.vjs_c',
    'panorama/styles/hp_colors_v2_menu.vcss_c',
    'panorama/styles/unit_status_v2.vcss_c'
)
$requiredCompiled = @(
    $expectedPackedAssets | ForEach-Object {
        Join-Path $stageOutput $_.Replace('/', '\')
    }
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

function Assert-QolSourceHashes {
    param([Parameter(Mandatory = $true)][string]$Path)
    Require-Path -Path $Path -Label 'QOLLOCK source manifest'
    $entries = @(Get-Content -LiteralPath $Path | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($entries.Count -ne 1) {
        throw "QOLLOCK source manifest must contain exactly one package hash: $Path"
    }
    if ($entries[0] -notmatch '^([0-9A-Fa-f]{64})\s+(.+)$') {
        throw "Malformed QOLLOCK source manifest entry: $($entries[0])"
    }
    $expected = $Matches[1].ToUpperInvariant()
    $source = $Matches[2].Trim().Replace('/', '\')
    Require-Path -Path $source -Label 'Pinned QOLLOCK package'
    $actual = Get-Sha256 -Path $source
    if ($actual -ne $expected) {
        throw "Pinned QOLLOCK package drifted. Expected=$expected Actual=$actual Source=$source"
    }
}

function Copy-StagedFile {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$DestinationRoot,
        [Parameter(Mandatory = $true)][string]$Label
    )
    $source = Join-Path $SourceRoot $RelativePath
    Require-Path -Path $source -Label "$Label source asset"
    $destination = Join-Path $DestinationRoot $RelativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

Require-Path -Path $canonicalSrc -Label 'Canonical HP Colors Rewrite v2 source folder'
Require-Path -Path $supportSrc -Label 'HP Colors Rewrite v2 QOLLOCK support folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'
Require-Path -Path $contractPath -Label 'pak02 asset contract'
Require-Path -Path $refreshScript -Label 'QOLLOCK compatibility refresh script'
Require-Path -Path $qollockPak -Label 'Pinned QOLLOCK package'

if ($RefreshFromInstalledQollock) {
    Require-Path -Path $Source2ViewerPath -Label 'Source2Viewer CLI for QOLLOCK refresh'
    Write-Host "`n[0/5] Refreshing compatibility layouts from installed pak03..." -ForegroundColor Cyan
    Remove-TreeUnderRoot -Path $refreshRoot -RootPath $root -ExpectedLeaf 'refresh'
    New-Item -ItemType Directory -Path $refreshRoot -Force | Out-Null
    $compiledHud = Join-Path $refreshRoot 'hud.vxml_c'
    $compiledEscapeMenu = Join-Path $refreshRoot 'hud_escape_menu.vxml_c'
    $decompiledHud = Join-Path $refreshRoot 'hud.xml'
    $decompiledEscapeMenu = Join-Path $refreshRoot 'hud_escape_menu.xml'
    try {
        & $vpkeditcli $qollockPak --extract 'panorama/layout/hud.vxml_c' --output $compiledHud --no-progress
        if ($LASTEXITCODE -ne 0) { throw "QOLLOCK HUD extraction failed with exit code $LASTEXITCODE" }
        & $vpkeditcli $qollockPak --extract 'panorama/layout/hud_escape_menu.vxml_c' --output $compiledEscapeMenu --no-progress
        if ($LASTEXITCODE -ne 0) { throw "QOLLOCK Escape-menu extraction failed with exit code $LASTEXITCODE" }
        & $Source2ViewerPath -i $compiledHud -o $decompiledHud -d
        if ($LASTEXITCODE -ne 0) { throw "QOLLOCK HUD decompilation failed with exit code $LASTEXITCODE" }
        & $Source2ViewerPath -i $compiledEscapeMenu -o $decompiledEscapeMenu -d
        if ($LASTEXITCODE -ne 0) { throw "QOLLOCK Escape-menu decompilation failed with exit code $LASTEXITCODE" }
        & node $refreshScript $qollockPak $decompiledHud $decompiledEscapeMenu $canonicalEscapeMenu $supportSrc $manifestPath
        if ($LASTEXITCODE -ne 0) { throw "QOLLOCK compatibility refresh failed with exit code $LASTEXITCODE" }
    }
    finally {
        Remove-TreeUnderRoot -Path $refreshRoot -RootPath $root -ExpectedLeaf 'refresh'
    }
}

$assetContract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
foreach ($requiredSource in @($assetContract.requiredSources)) {
    Require-Path -Path (Join-Path $supportSrc $requiredSource) -Label 'QOLLOCK compatibility source asset'
}
$qollockTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $qollockPak
Assert-PackedVpkAssets `
    -Tree $qollockTree `
    -Label 'Pinned QOLLOCK pak03' `
    -Required @($assetContract.requiredPinnedQollockAssets)
Assert-QolSourceHashes -Path $manifestPath

Write-Host "`n[1/5] Validating HP Colors Rewrite v2 QOLLOCK source..." -ForegroundColor Cyan
& node --test (Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-qollock.test.js')
if ($LASTEXITCODE -ne 0) {
    throw "HP Colors Rewrite v2 QOLLOCK validator failed with exit code $LASTEXITCODE"
}

Write-Host "`n[2/5] Preparing Closure ADVANCED compatibility runtime..." -ForegroundColor Cyan
Remove-TreeUnderRoot -Path $compiledOut -RootPath $root -ExpectedLeaf 'hp_colors_rewrite_v2_qollock_compiled'
Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_qollock_build'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}

try {
    foreach ($relativePath in $canonicalFiles) {
        Copy-StagedFile -RelativePath $relativePath -SourceRoot $canonicalSrc -DestinationRoot $stageSource -Label 'Canonical Rewrite v2'
    }
    foreach ($relativePath in $supportFiles) {
        Copy-StagedFile -RelativePath $relativePath -SourceRoot $supportSrc -DestinationRoot $stageSource -Label 'QOLLOCK compatibility'
    }
    Invoke-HpColorsRewriteClosureAdvanced `
        -StageSourceRoot $stageSource `
        -ScriptRelativePaths $compatibilityScripts `
        -WorkRoot $buildRoot
    Copy-Item -LiteralPath $canonicalSrc -Destination $canonicalClosureTestRoot -Recurse -Force
    foreach ($relativePath in $canonicalScripts) {
        Copy-StagedFile `
            -RelativePath $relativePath `
            -SourceRoot $stageSource `
            -DestinationRoot $canonicalClosureTestRoot `
            -Label 'Closure ADVANCED Rewrite v2'
    }
    Invoke-HpColorsRewriteClosureTests `
        -RepositoryRoot $root `
        -SourceRoot $canonicalClosureTestRoot `
        -QollockSourceRoot $stageSource

    Write-Host "`n[3/5] Compiling HP Colors Rewrite v2 QOLLOCK runtime..." -ForegroundColor Cyan
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredCompiled -TimeoutSeconds 120
    Move-Item -LiteralPath $stageOutput -Destination $compiledOut
}
finally {
    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_qollock_build'
}
Write-Host "  Compiled OK -> $compiledOut" -ForegroundColor Green

$compiledAssets = @(
    Get-ChildItem -LiteralPath $compiledOut -Recurse -File | ForEach-Object {
        $_.FullName.Substring($compiledOut.Length + 1).Replace('\', '/')
    }
)
$assetDifference = @(
    Compare-Object `
        -ReferenceObject ($expectedPackedAssets | Sort-Object) `
        -DifferenceObject ($compiledAssets | Sort-Object)
)
if ($assetDifference.Count -gt 0) {
    throw "HP Colors Rewrite v2 QOLLOCK compiled asset set mismatch. Expected=$($expectedPackedAssets -join ',') Actual=$($compiledAssets -join ',')"
}

Write-Host "`n[4/5] Packing pak02_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $compiledOut -OutputPath $vpkOut
$vpkTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets `
    -Tree $vpkTree `
    -Label 'HP Colors Rewrite v2 QOLLOCK pak02' `
    -Required @($assetContract.requiredPackedAssets) `
    -Forbidden @($assetContract.forbiddenPackedAssets)
Write-Host "  Packed OK -> $vpkOut" -ForegroundColor Green

if ($SkipDeploy) {
    Write-Host "`n[5/5] Deployment skipped." -ForegroundColor Yellow
    Write-Host 'HP Colors Rewrite v2 QOLLOCK build complete' -ForegroundColor Green
    return
}

Write-Host "`n[5/5] Backing up and deploying pak02_dir.vpk only..." -ForegroundColor Cyan
Require-Path -Path (Split-Path -Parent $vpkDest) -Label 'Deadlock addons folder'
if (Test-Path -LiteralPath $vpkDest) {
    $backupStamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    Copy-Item -LiteralPath $vpkDest -Destination "$vpkDest.backup_$backupStamp"
}
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
$sourceHash = Get-Sha256 -Path $vpkOut
$deployedHash = Get-Sha256 -Path $vpkDest
if ($sourceHash -ne $deployedHash) {
    throw "Deployed pak02 hash mismatch. Source=$sourceHash Destination=$deployedHash"
}
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green
Write-Host 'HP Colors Rewrite v2 QOLLOCK build complete' -ForegroundColor Green
Write-Host 'Restart Deadlock before the live smoke test.' -ForegroundColor Yellow
