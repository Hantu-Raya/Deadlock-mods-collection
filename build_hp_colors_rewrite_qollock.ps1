[CmdletBinding()]
param(
    [switch]$Deploy,
    [switch]$RefreshFromInstalledQollock,
    [string]$Source2ViewerPath = ''
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')

$canonicalSrc = Join-Path $root 'hp_colors_rewrite'
$supportSrc = Join-Path $root 'hp_colors_rewrite_qollock'
$compiledOut = Join-Path $root 'hp_colors_rewrite_qollock_compiled'
$buildRoot = Join-Path $root '_hp_colors_rewrite_qollock_build'
$stageSource = Join-Path $buildRoot 'hp_colors_rewrite_qollock'
$refreshRoot = Join-Path $buildRoot 'refresh'
$stageOutput = Join-Path $buildRoot 'hp_colors_rewrite_qollock_compiled'
$canonicalClosureTestRoot = Join-Path $buildRoot 'hp_colors_rewrite_closure_test'
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

$canonicalRewriteScripts = @(
    'panorama\scripts\hp_colors_contract.js',
    'panorama\scripts\hp_colors_state.js',
    'panorama\scripts\hp_colors_menu.js',
    'panorama\scripts\healthbar_probe.js'
)
$qollockRewriteScripts = $canonicalRewriteScripts + @(
    'panorama\scripts\qollock_hp_colors_bridge.js'
)

$canonicalFiles = @(
    'panorama\layout\unit_status_overlay.xml',
    'panorama\scripts\hp_colors_contract.js',
    'panorama\scripts\healthbar_probe.js',
    'panorama\scripts\hp_colors_state.js',
    'panorama\scripts\hp_colors_menu.js',
    'panorama\styles\hp_colors_menu.css',
    'panorama\styles\hp_colors_unit_status.css'
)
$supportFiles = @(
    'panorama\layout\hud.xml',
    'panorama\layout\hud_escape_menu.xml',
    'panorama\scripts\qollock_hp_colors_bridge.js'
)

$requiredCompiled = @(
    (Join-Path $stageOutput 'panorama\layout\hud.vxml_c'),
    (Join-Path $stageOutput 'panorama\layout\hud_escape_menu.vxml_c'),
    (Join-Path $stageOutput 'panorama\layout\unit_status_overlay.vxml_c'),
    (Join-Path $stageOutput 'panorama\scripts\hp_colors_contract.vjs_c'),
    (Join-Path $stageOutput 'panorama\scripts\healthbar_probe.vjs_c'),
    (Join-Path $stageOutput 'panorama\scripts\hp_colors_state.vjs_c'),
    (Join-Path $stageOutput 'panorama\scripts\hp_colors_menu.vjs_c'),
    (Join-Path $stageOutput 'panorama\scripts\qollock_hp_colors_bridge.vjs_c'),
    (Join-Path $stageOutput 'panorama\styles\hp_colors_menu.vcss_c'),
    (Join-Path $stageOutput 'panorama\styles\hp_colors_unit_status.vcss_c')
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
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

function Assert-QolSourceHashes {
    param([Parameter(Mandatory = $true)][string]$Path)

    Require-Path -Path $Path -Label 'QOLLOCK source hash manifest'
    $entries = @(Get-Content -LiteralPath $Path | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($entries.Count -eq 0) {
        throw 'QOLLOCK source hash manifest is empty'
    }

    foreach ($entry in $entries) {
        $parts = $entry.Trim() -split '\s+', 2
        if ($parts.Count -ne 2 -or $parts[0] -notmatch '^[0-9a-fA-F]{64}$') {
            throw "Invalid QOLLOCK source hash entry: $entry"
        }
        $sourcePath = $parts[1].Trim()
        Require-Path -Path $sourcePath -Label 'Pinned QOLLOCK source'
        $actual = Get-Sha256 -Path $sourcePath
        if ($actual -ne $parts[0].ToLowerInvariant()) {
            throw "QOLLOCK source drift detected: $sourcePath expected=$($parts[0]) actual=$actual"
        }
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
    $destination = Join-Path $DestinationRoot $RelativePath
    Require-Path -Path $source -Label "$Label source"
    $destinationParent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

Require-Path -Path $canonicalSrc -Label 'Canonical HP Colors Rewrite source folder'
Require-Path -Path $supportSrc -Label 'HP Colors Rewrite QOLLOCK support folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'
Require-Path -Path $contractPath -Label 'pak02 asset contract'
Require-Path -Path $refreshScript -Label 'QOLLOCK compatibility refresh script'
Require-Path -Path $qollockPak -Label 'Pinned QOLLOCK package'
if ($RefreshFromInstalledQollock) {
    Require-Path -Path $Source2ViewerPath -Label 'Source2Viewer CLI for QOLLOCK refresh'
    Write-Host "`n[0/4] Refreshing compatibility layouts from installed pak03..." -ForegroundColor Cyan
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
$qollockTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $qollockPak
Assert-PackedVpkAssets `
    -Tree $qollockTree `
    -Label 'Pinned QOLLOCK pak03' `
    -Required @($assetContract.requiredPinnedQollockAssets)
Assert-QolSourceHashes -Path $manifestPath

Write-Host "`n[1/4] Preparing Closure ADVANCED pak02 compatibility runtime..." -ForegroundColor Cyan
Remove-TreeUnderRoot -Path $compiledOut -RootPath $root -ExpectedLeaf 'hp_colors_rewrite_qollock_compiled'
Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_qollock_build'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}

try {
    foreach ($relativePath in $canonicalFiles) {
        Copy-StagedFile -RelativePath $relativePath -SourceRoot $canonicalSrc -DestinationRoot $stageSource -Label 'Canonical Rewrite'
    }
    foreach ($relativePath in $supportFiles) {
        Copy-StagedFile -RelativePath $relativePath -SourceRoot $supportSrc -DestinationRoot $stageSource -Label 'QOLLOCK compatibility'
    }
    Invoke-HpColorsRewriteClosureAdvanced `
        -StageSourceRoot $stageSource `
        -ScriptRelativePaths $qollockRewriteScripts `
        -WorkRoot $buildRoot

    Copy-Item -LiteralPath $canonicalSrc -Destination $canonicalClosureTestRoot -Recurse -Force
    foreach ($relativePath in $canonicalRewriteScripts) {
        Copy-StagedFile `
            -RelativePath $relativePath `
            -SourceRoot $stageSource `
            -DestinationRoot $canonicalClosureTestRoot `
            -Label 'Closure ADVANCED Rewrite'
    }
    Invoke-HpColorsRewriteClosureTests `
        -RepositoryRoot $root `
        -SourceRoot $canonicalClosureTestRoot `
        -QollockSourceRoot $stageSource

    Write-Host "`n[2/4] Compiling pak02 compatibility runtime..." -ForegroundColor Cyan

    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredCompiled -TimeoutSeconds 120
    Move-Item -LiteralPath $stageOutput -Destination $compiledOut
}
finally {
    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_qollock_build'
}
Write-Host "  Compiled OK -> $compiledOut" -ForegroundColor Green

Write-Host "`n[3/4] Packing pak02_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $compiledOut -OutputPath $vpkOut
$vpkTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
$assetContract = Get-Content -LiteralPath $contractPath -Raw | ConvertFrom-Json
Assert-PackedVpkAssets `
    -Tree $vpkTree `
    -Label 'HP Colors Rewrite QOLLOCK pak02' `
    -Required @($assetContract.requiredPackedAssets) `
    -Forbidden @($assetContract.forbiddenPackedAssets)
Write-Host "  Packed OK -> $vpkOut" -ForegroundColor Green

if ($Deploy) {
    Write-Host "`n[4/4] Deploying pak02_dir.vpk only..." -ForegroundColor Cyan
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
}
else {
    Write-Host "`n[4/4] Deployment skipped (use -Deploy to copy pak02_dir.vpk only)." -ForegroundColor Yellow
}
