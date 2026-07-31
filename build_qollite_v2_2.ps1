param(
    [string]$VpkEditCli = ''
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$qolLiteRoot = Join-Path $root 'qollite'
$panoramaSource = Join-Path $qolLiteRoot 'panorama'
$stockGenerator = Join-Path $qolLiteRoot 'scripts\generate-stock-overrides.js'
$stockManifest = Join-Path $qolLiteRoot 'stock\manifest.json'
$provenanceValidator = Join-Path $qolLiteRoot 'scripts\validate-provenance.js'
$stageSource = Join-Path $root 'qollite_v2_2_stage'
$stageCompiled = Join-Path $root 'qollite_v2_2_stage_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkOutput = Join-Path $root 'qollite_passive_enabled_dir.vpk'
$inventoryOutput = Join-Path $root 'qollite_passive_enabled_dir.inventory.json'
$vpkBuildOutput = Join-Path $root 'qollite_passive_enabled_dir.build.vpk'
$inventoryBuildOutput = Join-Path $root 'qollite_passive_enabled_dir.build.json'

function Get-NormalizedRelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $resolvedRoot = (Resolve-Path -LiteralPath $RootPath).Path.TrimEnd('\', '/')
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    if (-not $resolvedPath.StartsWith($resolvedRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is not under root. Path=$resolvedPath Root=$resolvedRoot"
    }
    return $resolvedPath.Substring($resolvedRoot.Length + 1).Replace('\', '/')
}

function Copy-ExplicitPanoramaSource {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$StageRoot
    )

    if (-not (Test-Path -LiteralPath $SourceRoot)) {
        throw "QOL Lite Panorama source not found: $SourceRoot"
    }

    $files = @(Get-ChildItem -LiteralPath $SourceRoot -Recurse -File)
    if ($files.Count -eq 0) {
        throw "QOL Lite Panorama source is empty: $SourceRoot"
    }

    $allowedExtensions = @('.js', '.css', '.xml', '.vtex', '.vmat', '.vpcf', '.vmdl')
    $records = @()
    foreach ($file in $files) {
        $extension = [System.IO.Path]::GetExtension($file.Name).ToLowerInvariant()
        if ($allowedExtensions -notcontains $extension) {
            throw "Unsupported Panorama source input: $($file.FullName)"
        }
        $relativePath = Get-NormalizedRelativePath -RootPath $SourceRoot -Path $file.FullName
        $targetPath = Join-Path (Join-Path $StageRoot 'panorama') $relativePath
        if (Test-Path -LiteralPath $targetPath) {
            throw "Generated stock layout conflicts with original source: $relativePath"
        }
        New-Item -ItemType Directory -Path (Split-Path -Parent $targetPath) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $targetPath
        $records += [PSCustomObject]@{
            sourcePath = ('qollite/panorama/' + $relativePath)
            origin = 'qol-lite-original'
            stagedPath = ('panorama/' + $relativePath)
        }
    }
    return $records
}

function Get-GeneratedStockRecords {
    param(
        [Parameter(Mandatory = $true)][string]$StageRoot,
        [Parameter(Mandatory = $true)][string]$ManifestPath
    )

    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    if ($manifest.commit -ne '3573cbb746581eccc7752fc2e00c21d4447d72bb' -or -not $manifest.layouts) {
        throw "Stock manifest is not pinned to the required SteamTracking commit: $ManifestPath"
    }

    $expectedRecords = @{}
    foreach ($layout in @($manifest.layouts)) {
        $outputPath = ([string]$layout.outputPath).Replace('\', '/')
        $stockPath = ([string]$layout.path).Replace('\', '/')
        $stockOrigin = ([string]$layout.origin).Replace('\', '/')
        if (-not $outputPath -or -not $stockPath -or $stockOrigin -ne ('game/citadel/pak01_dir/panorama/layout/' + $stockPath)) {
            throw "Stock manifest has an invalid layout provenance entry: $ManifestPath"
        }
        $stagedPath = 'panorama/layout/' + $outputPath
        if ($expectedRecords.ContainsKey($stagedPath)) {
            throw "Stock manifest has a duplicate generated output path: $stagedPath"
        }
        $expectedRecords[$stagedPath] = [PSCustomObject]@{
            sourcePath = ('SteamTracking/GameTracking-Deadlock@3573cbb746581eccc7752fc2e00c21d4447d72bb/' + $stockOrigin)
            origin = 'valve-stock-pinned'
            stagedPath = $stagedPath
        }
    }

    $layoutRoot = Join-Path $StageRoot 'panorama\layout'
    if (-not (Test-Path -LiteralPath $layoutRoot)) {
        throw "Stock generator did not create the staged panorama/layout directory: $layoutRoot"
    }

    $records = @()
    foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $StageRoot 'panorama') -Recurse -File)) {
        $relativePath = Get-NormalizedRelativePath -RootPath $StageRoot -Path $file.FullName
        if (-not $expectedRecords.ContainsKey($relativePath)) {
            throw "Stock generator emitted an unexpected file: $relativePath"
        }
        $records += $expectedRecords[$relativePath]
    }
    if ($records.Count -ne $expectedRecords.Count) {
        throw 'Stock generator did not emit every layout declared in its manifest.'
    }
    return $records
}

function Get-RequiredCompiledOutputs {
    param(
        [Parameter(Mandatory = $true)][string]$StageRoot,
        [Parameter(Mandatory = $true)][string]$CompiledRoot
    )

    $extensionMap = @{
        '.js' = '.vjs_c'
        '.css' = '.vcss_c'
        '.xml' = '.vxml_c'
        '.vtex' = '.vtex_c'
        '.vmat' = '.vmat_c'
        '.vpcf' = '.vpcf_c'
        '.vmdl' = '.vmdl_c'
    }
    $outputs = @()
    foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $StageRoot 'panorama') -Recurse -File)) {
        $extension = [System.IO.Path]::GetExtension($file.Name).ToLowerInvariant()
        if (-not $extensionMap.ContainsKey($extension)) {
            throw "Unsupported staged Panorama source input: $($file.FullName)"
        }
        $sourceRelativePath = Get-NormalizedRelativePath -RootPath $StageRoot -Path $file.FullName
        $outputRelativePath = $sourceRelativePath.Substring(0, $sourceRelativePath.Length - $extension.Length) + $extensionMap[$extension]
        $outputs += [PSCustomObject]@{
            sourceRelativePath = $sourceRelativePath
            compiledRelativePath = $outputRelativePath
            compiledPath = Join-Path $CompiledRoot $outputRelativePath
        }
    }
    if ($outputs.Count -eq 0) {
        throw 'No Source 2 compilable QOL Lite inputs were staged.'
    }
    return @($outputs | Sort-Object compiledRelativePath -Unique)
}

function Assert-PackedQolLiteTree {
    param(
        [Parameter(Mandatory = $true)][string[]]$Tree,
        [Parameter(Mandatory = $true)][string[]]$ExpectedPaths
    )

    $expected = @{}
    foreach ($path in $ExpectedPaths) {
        $leaf = Split-Path -Leaf $path
        $key = $leaf.ToLowerInvariant()
        if ($expected.ContainsKey($key)) {
            throw "Compiled outputs contain a duplicate leaf name: $leaf"
        }
        $expected[$key] = $path
    }

    $actual = @{}
    foreach ($entry in $Tree) {
        $line = ([string]$entry) -replace "$([char]27)\[[0-9;]*m", ''
        $line = $line.Trim()
        if ($line -notmatch '(?<leaf>[A-Za-z0-9_. -]+)\s+-\s+\d+(?:\.\d+)?\s+(?:bytes|kb|mb|gb)\s*$') {
            continue
        }
        $leaf = $Matches.leaf.Trim()
        if ($leaf -match '(?i)\.(js|css|xml)$') {
            throw "VPK contains raw Panorama source: $leaf"
        }
        if ($leaf -match '(?i)^abilities\.vdata') {
            throw "VPK contains forbidden abilities override: $leaf"
        }
        if ($leaf -match '(?i)(hud[_-]?passive[_-]?items[_-]?disabled|passive[_-]?disabled|passiveitems.*disabled)') {
            throw "VPK contains passive-disabled state: $leaf"
        }
        if ($leaf -notmatch '(?i)\.v(js|css|xml|tex|mat|pcf|mdl)_c$') {
            throw "VPK contains unsupported packed entry: $leaf"
        }
        $key = $leaf.ToLowerInvariant()
        if ($actual.ContainsKey($key)) {
            throw "VPK contains duplicate packed leaf: $leaf"
        }
        $actual[$key] = $leaf
    }

    $unexpected = @($actual.Keys | Where-Object { -not $expected.ContainsKey($_) })
    $missing = @($expected.Keys | Where-Object { -not $actual.ContainsKey($_) })
    if ($unexpected.Count -gt 0 -or $missing.Count -gt 0) {
        throw "VPK tree does not exactly match compiled source outputs. Unexpected=$($unexpected -join ', ') Missing=$($missing -join ', ')"
    }
}

function Publish-ReleasePair {
    param(
        [Parameter(Mandatory = $true)][string]$VpkSource,
        [Parameter(Mandatory = $true)][string]$VpkDestination,
        [Parameter(Mandatory = $true)][string]$InventorySource,
        [Parameter(Mandatory = $true)][string]$InventoryDestination
    )

    $vpkBackup = "$VpkDestination.transaction-backup"
    $inventoryBackup = "$InventoryDestination.transaction-backup"
    foreach ($backup in @($vpkBackup, $inventoryBackup)) {
        if (Test-Path -LiteralPath $backup) {
            Remove-Item -LiteralPath $backup -Force
        }
    }
    try {
        if (Test-Path -LiteralPath $VpkDestination) {
            Move-Item -LiteralPath $VpkDestination -Destination $vpkBackup
        }
        if (Test-Path -LiteralPath $InventoryDestination) {
            Move-Item -LiteralPath $InventoryDestination -Destination $inventoryBackup
        }
        Move-Item -LiteralPath $VpkSource -Destination $VpkDestination
        Move-Item -LiteralPath $InventorySource -Destination $InventoryDestination
        foreach ($backup in @($vpkBackup, $inventoryBackup)) {
            if (Test-Path -LiteralPath $backup) {
                Remove-Item -LiteralPath $backup -Force
            }
        }
    } catch {
        foreach ($destination in @($VpkDestination, $InventoryDestination)) {
            if (Test-Path -LiteralPath $destination) {
                Remove-Item -LiteralPath $destination -Force
            }
        }
        if (Test-Path -LiteralPath $vpkBackup) {
            Move-Item -LiteralPath $vpkBackup -Destination $VpkDestination
        }
        if (Test-Path -LiteralPath $inventoryBackup) {
            Move-Item -LiteralPath $inventoryBackup -Destination $InventoryDestination
        }
        throw
    }
}

function Invoke-ProvenanceValidator {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    & node $provenanceValidator @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "QOL Lite provenance validation failed with exit code $LASTEXITCODE"
    }
}

foreach ($requiredPath in @($qolLiteRoot, $panoramaSource, $stockGenerator, $stockManifest, $provenanceValidator, $compiler)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required QOL Lite build input not found: $requiredPath"
    }
}

$vpkeditcliCandidates = @(
    $VpkEditCli,
    (Join-Path $root 'vpk cli\vpkeditcli.exe')
)
$vpkeditcli = Get-RepoToolPath -Candidates $vpkeditcliCandidates -ToolName 'vpkeditcli'

Remove-TreeUnderRoot -Path $stageSource -RootPath $root -ExpectedLeaf 'qollite_v2_2_stage'
Remove-TreeUnderRoot -Path $stageCompiled -RootPath $root -ExpectedLeaf 'qollite_v2_2_stage_compiled'
if (Test-Path -LiteralPath $vpkBuildOutput) { Remove-Item -LiteralPath $vpkBuildOutput -Force }
if (Test-Path -LiteralPath $inventoryBuildOutput) { Remove-Item -LiteralPath $inventoryBuildOutput -Force }

try {
    New-Item -ItemType Directory -Path $stageSource -Force | Out-Null

    & node $stockGenerator --output $stageSource
    if ($LASTEXITCODE -ne 0) {
        throw "Stock layout generator failed with exit code $LASTEXITCODE"
    }
    $inventoryRecords = @(Get-GeneratedStockRecords -StageRoot $stageSource -ManifestPath $stockManifest)
    $inventoryRecords += @(Copy-ExplicitPanoramaSource -SourceRoot $panoramaSource -StageRoot $stageSource)

    Invoke-ProvenanceValidator -Arguments @(
        '--root', $root,
        '--source-root', $stageSource,
        '--stage-source', $stageSource
    )

    $requiredOutputs = @(Get-RequiredCompiledOutputs -StageRoot $stageSource -CompiledRoot $stageCompiled)
    $passiveStyleOutput = @($requiredOutputs | Where-Object { $_.sourceRelativePath -match '(?i)\.css$' -and (Get-Content -LiteralPath (Join-Path $stageSource $_.sourceRelativePath) -Raw) -match '#hud_passive_items\b' })
    if ($passiveStyleOutput.Count -eq 0) {
        throw '#hud_passive_items source stylesheet was not selected for compilation.'
    }

    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs @($requiredOutputs | ForEach-Object { $_.compiledPath }) -HiddenWindow
    Invoke-ProvenanceValidator -Arguments @('--root', $root, '--compiled', $stageCompiled)

    Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $stageCompiled -OutputPath $vpkBuildOutput
    $packedTree = @(Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkBuildOutput)
    Assert-PackedVpkAssets -Tree $packedTree -Required @($requiredOutputs | ForEach-Object { $_.compiledRelativePath }) -Forbidden @('scripts/abilities.vdata') -Label 'QOL Lite VPK'
    Assert-PackedQolLiteTree -Tree $packedTree -ExpectedPaths @($requiredOutputs | ForEach-Object { $_.compiledRelativePath })

    $originByStagedPath = @{}
    foreach ($record in $inventoryRecords) {
        if ($originByStagedPath.ContainsKey($record.stagedPath)) {
            throw "Duplicate staged source inventory path: $($record.stagedPath)"
        }
        $originByStagedPath[$record.stagedPath] = $record
    }

    $packedAssets = @()
    foreach ($output in $requiredOutputs) {
        if (-not $originByStagedPath.ContainsKey($output.sourceRelativePath)) {
            throw "No provenance record for compiled source: $($output.sourceRelativePath)"
        }
        $record = $originByStagedPath[$output.sourceRelativePath]
        $packedAssets += [PSCustomObject]@{
            sourcePath = $record.sourcePath
            origin = $record.origin
            packedRelativePath = $output.compiledRelativePath
        }
    }
    [PSCustomObject]@{
        schemaVersion = 1
        release = '2.2'
        vpk = (Split-Path -Leaf $vpkOutput)
        passiveItems = 'enabled'
        assets = @($packedAssets | Sort-Object packedRelativePath)
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $inventoryBuildOutput -Encoding utf8
    Publish-ReleasePair -VpkSource $vpkBuildOutput -VpkDestination $vpkOutput -InventorySource $inventoryBuildOutput -InventoryDestination $inventoryOutput
} finally {
    Remove-TreeUnderRoot -Path $stageSource -RootPath $root -ExpectedLeaf 'qollite_v2_2_stage'
    Remove-TreeUnderRoot -Path $stageCompiled -RootPath $root -ExpectedLeaf 'qollite_v2_2_stage_compiled'
    if (Test-Path -LiteralPath $vpkBuildOutput) { Remove-Item -LiteralPath $vpkBuildOutput -Force }
    if (Test-Path -LiteralPath $inventoryBuildOutput) { Remove-Item -LiteralPath $inventoryBuildOutput -Force }
}
