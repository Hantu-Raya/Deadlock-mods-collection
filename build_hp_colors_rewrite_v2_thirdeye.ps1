[CmdletBinding()]
param(
    [switch]$SkipDeploy,
    [string]$ThirdEyePakPath = '',
    [string]$Source2ViewerPath = '',
    [switch]$SkipPanoramaTests,
    [switch]$ShowRankBarebones
)

$ErrorActionPreference = 'Stop'

if ($ShowRankBarebones) {
    throw 'Third Eye compatibility cannot be combined with ShowRank Barebones; build the standalone variant instead.'
}

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
. (Join-Path $root 'scripts\hp-colors-rewrite-closure.ps1')

$canonicalSrc = Join-Path $root 'hp_colors_rewrite_v2'
$compatSrc = Join-Path $root 'hp_colors_rewrite_v2_thirdeye'
$compiledOut = Join-Path $root 'hp_colors_rewrite_v2_thirdeye_compiled'
$buildRoot = Join-Path $root '_hp_colors_rewrite_v2_thirdeye_build'
$stageSource = Join-Path $buildRoot 'hp_colors_rewrite_v2_thirdeye'
$stageOutput = Join-Path $buildRoot 'hp_colors_rewrite_v2_thirdeye_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
if ([string]::IsNullOrWhiteSpace($Source2ViewerPath)) {
    $Source2ViewerPath = Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'
}
$vpkOut = Join-Path $root 'pak02_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak02_dir.vpk'
$pinPath = Join-Path $compatSrc 'thirdeye-source-pin.json'
$composer = Join-Path $root 'scripts\compose-hp-colors-rewrite-v2-thirdeye.js'
$windowPatcher = Join-Path $root 'scripts\patch-hp-colors-thirdeye-window.js'
$timerValidator = Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-timers.js'
$thirdeyeValidator = Join-Path $root 'scripts\validate-hp-colors-rewrite-v2-thirdeye.test.js'
$canonicalEscape = Join-Path $canonicalSrc 'panorama\layout\hud_escape_menu.xml'
$thirdEyeEscapePin = Join-Path $compatSrc 'source_snapshots\hud_escape_menu.xml'
$thirdEyeWindowPin = Join-Path $compatSrc 'source_snapshots\window.js'
$thirdEyeNamespacePin = Join-Path $compatSrc 'source_snapshots\namespace.js'
$thirdEyeTopbarPin = Join-Path $compatSrc 'source_snapshots\topbar_ult_cooldown.js'
$compatTopbar = Join-Path $compatSrc 'panorama\scripts\features\topbar_ult_cooldown\feature.js'
$compatBridge = Join-Path $compatSrc 'panorama\scripts\hp_colors_thirdeye_bridge.js'
$mergedEscape = Join-Path $compatSrc 'panorama\layout\hud_escape_menu.xml'

$canonicalClosureScripts = @(
    'panorama\scripts\hp_colors_v2_contract.js',
    'panorama\scripts\hp_colors_v2_state.js',
    'panorama\scripts\hp_colors_v2_menu.js',
    'panorama\scripts\unit_status_v2_colors.js'
)
$canonicalFiles = @(
    'panorama\layout\unit_status_overlay_v2.xml',
    'panorama\layout\citadel_hud_top_bar.xml',
    'panorama\layout\test_event_relay.xml',
    'panorama\styles\hp_colors_v2_menu.css',
    'panorama\styles\unit_status_v2.css'
) + $canonicalClosureScripts + @(
    'panorama\scripts\test_event_bridge.js',
    'panorama\scripts\test_topbar_pickups.js',
    'panorama\images\hpv2\ultimate_progress.png',
    'panorama\images\hpv2\ultimate_progress.vtex'
)
$patchedWindowRelativePath = 'panorama/scripts/hp_colors_thirdeye_window.js'
$compatibilityClosureScripts = @(
    'panorama/scripts/hp_colors_thirdeye_bridge.js',
    $patchedWindowRelativePath
)
$compatRuntimeFiles = $compatibilityClosureScripts + @(
    'panorama/scripts/features/topbar_ult_cooldown/feature.js'
)
$compatRuntimeStageFiles = @($compatRuntimeFiles | Where-Object { $_ -ne $patchedWindowRelativePath })

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

function Get-PackedAssetName {
    param([Parameter(Mandatory = $true)][string]$RelativePath)
    $normalized = $RelativePath.Replace('\', '/')
    if ($normalized.EndsWith('.xml')) { return "$($normalized.Substring(0, $normalized.Length - 4)).vxml_c" }
    if ($normalized.EndsWith('.js')) { return "$($normalized.Substring(0, $normalized.Length - 3)).vjs_c" }
    if ($normalized.EndsWith('.css')) { return "$($normalized.Substring(0, $normalized.Length - 4)).vcss_c" }
    if ($normalized.EndsWith('.vtex')) { return "$($normalized)_c" }
    throw "Unsupported runtime source extension: $RelativePath"
}


Require-Path -Path $canonicalSrc -Label 'Canonical HP Colors Rewrite v2 source folder'
Require-Path -Path $compatSrc -Label 'HP Colors Rewrite v2 Third Eye source folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'
Require-Path -Path $Source2ViewerPath -Label 'Source2Viewer CLI'
Require-Path -Path $pinPath -Label 'Third Eye source pin'
Require-Path -Path $composer -Label 'Third Eye Escape composer'
Require-Path -Path $windowPatcher -Label 'Third Eye window patcher'
Require-Path -Path $timerValidator -Label 'HP Colors Rewrite v2 timer validator'
Require-Path -Path $thirdeyeValidator -Label 'HP Colors Rewrite v2 Third Eye validator'
Require-Path -Path $canonicalEscape -Label 'Canonical HPv2 Escape layout'
Require-Path -Path $thirdEyeEscapePin -Label 'Pinned Third Eye Escape layout'
Require-Path -Path $thirdEyeWindowPin -Label 'Pinned Third Eye window source'
Require-Path -Path $thirdEyeNamespacePin -Label 'Pinned Third Eye namespace source'
Require-Path -Path $thirdEyeTopbarPin -Label 'Pinned Third Eye topbar ultimate cooldown'
Require-Path -Path $compatBridge -Label 'Third Eye bridge source'

$pin = Get-Content -LiteralPath $pinPath -Raw | ConvertFrom-Json
if ($pin.schema -ne 'HPV2_THIRDEYE_SOURCE_PIN_1') {
    throw "Unsupported Third Eye source pin schema: $($pin.schema)"
}
if (-not $pin.runtimeExtraSources) {
    throw 'Third Eye source pin has no explicit runtime extra manifest'
}
$declaredRuntimeExtras = @($pin.runtimeExtraSources | ForEach-Object { $_.Replace('\', '/') })
if (@(Compare-Object -ReferenceObject ($compatRuntimeFiles | Sort-Object) -DifferenceObject ($declaredRuntimeExtras | Sort-Object)).Count -gt 0) {
    throw 'Third Eye runtime extra manifest does not match the wrapper source list'
}
foreach ($entry in @(
    [pscustomobject]@{ Path = $thirdEyeEscapePin; Expected = $pin.snapshotSha256.escape; Label = 'Pinned Third Eye Escape layout' },
    [pscustomobject]@{ Path = $thirdEyeWindowPin; Expected = $pin.snapshotSha256.window; Label = 'Pinned Third Eye window source' },
    [pscustomobject]@{ Path = $thirdEyeNamespacePin; Expected = $pin.snapshotSha256.namespace; Label = 'Pinned Third Eye namespace source' },
    [pscustomobject]@{ Path = $thirdEyeTopbarPin; Expected = $pin.snapshotSha256.topbarUltCooldown; Label = 'Pinned Third Eye topbar ultimate cooldown' }
)) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.Expected)) {
        throw "$($entry.Label) has no SHA-256 pin"
    }
    $actual = Get-Sha256 -Path $entry.Path
    if ($actual -ne ([string]$entry.Expected).ToLowerInvariant()) {
        throw "$($entry.Label) drifted. Expected=$($entry.Expected) Actual=$actual"
    }
}

if (-not [string]::IsNullOrWhiteSpace($ThirdEyePakPath)) {
    Require-Path -Path $ThirdEyePakPath -Label 'Supplied Third Eye package'
    Require-Path -Path $Source2ViewerPath -Label 'Source2Viewer CLI for supplied Third Eye package'
    $actualPackageHash = Get-Sha256 -Path $ThirdEyePakPath
    if ($actualPackageHash -ne ([string]$pin.packageSha256).ToLowerInvariant()) {
        throw "Supplied Third Eye package drifted. Expected=$($pin.packageSha256) Actual=$actualPackageHash Path=$ThirdEyePakPath"
    }
    $dependencyTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $ThirdEyePakPath -Source2ViewerPath $Source2ViewerPath
    Assert-PackedVpkAssets -Tree $dependencyTree -Label 'Supplied Third Eye package' -Required @($pin.requiredThirdEyeAssets)
    Write-Host "  Supplied Third Eye package verified -> $ThirdEyePakPath ($actualPackageHash)" -ForegroundColor Green
}

Remove-TreeUnderRoot -Path $compiledOut -RootPath $root -ExpectedLeaf 'hp_colors_rewrite_v2_thirdeye_compiled'
Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_thirdeye_build'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}
$patchedWindowBuild = Join-Path $buildRoot 'hp_colors_thirdeye_window.js'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
try {
    Write-Host "`n[1/5] Pinning and composing HPv2 + Third Eye Escape source..." -ForegroundColor Cyan
    & node $windowPatcher --input $thirdEyeWindowPin --output $patchedWindowBuild --sha256 ([string]$pin.snapshotSha256.window) --marker 'narrow HPv2 cancel/backdrop lifecycle composition'
    if ($LASTEXITCODE -ne 0) { throw 'Third Eye window patch failed' }
    & node $composer `
        --canonical $canonicalEscape `
        --thirdeye $thirdEyeEscapePin `
        --bridge $compatBridge `
        --window $patchedWindowBuild `
        --output $mergedEscape `
        --pin $pinPath `
        --topbarOutput $compatTopbar `
        --packageHash ([string]$pin.packageSha256)
    if ($LASTEXITCODE -ne 0) { throw 'Third Eye Escape composition failed' }

    Write-Host "`n[2/5] Preparing Closure ADVANCED compatibility runtime..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $stageSource -Force | Out-Null
    foreach ($relativePath in $canonicalFiles) {
        Copy-StagedFile -RelativePath $relativePath -SourceRoot $canonicalSrc -DestinationRoot $stageSource -Label 'Canonical Rewrite v2'
    }
    Copy-StagedFile -RelativePath 'panorama\layout\hud_escape_menu.xml' -SourceRoot $compatSrc -DestinationRoot $stageSource -Label 'Composed Third Eye Escape layout'
    foreach ($relativePath in $compatRuntimeStageFiles) {
        Copy-StagedFile -RelativePath $relativePath -SourceRoot $compatSrc -DestinationRoot $stageSource -Label 'Third Eye compatibility'
    }
    Copy-Item -LiteralPath $patchedWindowBuild -Destination (Join-Path $stageSource $patchedWindowRelativePath.Replace('/', '\')) -Force

    $runtimeSources = @(
        @($canonicalFiles | Where-Object { -not $_.EndsWith('.png') }) +
        @('panorama\layout\hud_escape_menu.xml') +
        $compatRuntimeFiles
    )
    $runtimeSources = @($runtimeSources | Sort-Object -Unique)
    $expectedPackedAssets = @($runtimeSources | ForEach-Object { Get-PackedAssetName -RelativePath $_ })
    $requiredCompiled = @($expectedPackedAssets | ForEach-Object { Join-Path $stageOutput $_.Replace('/', '\') })
    $closureScripts = $canonicalClosureScripts + $compatibilityClosureScripts

    Invoke-HpColorsRewriteClosureAdvanced `
        -StageSourceRoot $stageSource `
        -ScriptRelativePaths $closureScripts `
        -WorkRoot $buildRoot
    & node $timerValidator $stageSource
    if ($LASTEXITCODE -ne 0) { throw 'Closure timer validation failed' }
    if (-not $SkipPanoramaTests) {
        Invoke-HpColorsRewriteClosureTests -RepositoryRoot $root -SourceRoot $stageSource
        $previousThirdEyeSourceRoot = $env:HP_COLORS_REWRITE_V2_THIRDEYE_SOURCE_ROOT
        try {
            $env:HP_COLORS_REWRITE_V2_THIRDEYE_SOURCE_ROOT = $stageSource
            & node --test $thirdeyeValidator
            if ($LASTEXITCODE -ne 0) { throw 'Third Eye lifecycle validator failed' }
        }
        finally {
            if ($null -eq $previousThirdEyeSourceRoot) {
                Remove-Item Env:HP_COLORS_REWRITE_V2_THIRDEYE_SOURCE_ROOT -ErrorAction SilentlyContinue
            }
            else {
                $env:HP_COLORS_REWRITE_V2_THIRDEYE_SOURCE_ROOT = $previousThirdEyeSourceRoot
            }
        }
    }

    Write-Host "`n[3/5] Compiling HP Colors Rewrite v2 + Third Eye runtime..." -ForegroundColor Cyan
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredCompiled -TimeoutSeconds 180
    Move-Item -LiteralPath $stageOutput -Destination $compiledOut
}
finally {
    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_hp_colors_rewrite_v2_thirdeye_build'
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
    throw "HP Colors Rewrite v2 Third Eye compiled asset set mismatch. Expected=$($expectedPackedAssets -join ',') Actual=$($compiledAssets -join ',')"
}

Write-Host "`n[4/5] Packing pak02_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $compiledOut -OutputPath $vpkOut
$vpkTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut -Source2ViewerPath $Source2ViewerPath
$packedPaths = @($vpkTree | ForEach-Object {
    if ($_ -notmatch '^(.+?) CRC:') { throw "Unexpected Source2Viewer listing entry: $_" }
    $Matches[1]
})
if (@(Compare-Object -ReferenceObject ($expectedPackedAssets | Sort-Object) -DifferenceObject ($packedPaths | Sort-Object)).Count -gt 0) {
    throw 'Third Eye pak02 asset set differs from the explicit runtime manifest'
}
$forbiddenPackedAssets = @(
    'node_modules',
    'AGENTS.md',
    'FEATURES.md',
    'design.md',
    '.xml',
    '.css',
    '.js',
    'source_snapshots',
    'thirdeye-source-pin.json'
)
Assert-PackedVpkAssets -Tree $vpkTree -Label 'HP Colors Rewrite v2 Third Eye pak02' -Required $expectedPackedAssets -Forbidden $forbiddenPackedAssets
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

if ($SkipDeploy) {
    Write-Host "`n[5/5] Deployment skipped." -ForegroundColor Yellow
    Write-Host 'HP Colors Rewrite v2 Third Eye build complete. Compile-only VPK -> pak02_dir.vpk' -ForegroundColor Yellow
    return
}

Write-Host "`n[5/5] Backing up and deploying pak02_dir.vpk only..." -ForegroundColor Cyan
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
    throw "Deployed pak02 hash mismatch. Source=$sourceHash Destination=$deployedHash"
}
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green
Write-Host 'Restart Deadlock before the live smoke test.' -ForegroundColor Yellow
Write-Host 'HP Colors Rewrite v2 Third Eye build complete' -ForegroundColor Green
