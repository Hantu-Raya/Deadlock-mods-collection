$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$moduleRoot = Join-Path $root 'profile_stats_community'
$buildRoot = Join-Path $root '_profile_stats_community_build'
$compositionScript = Join-Path $root 'scripts\profile-stats-community-composition.js'
$stageSource = Join-Path $buildRoot 'src'
$stageCompiled = Join-Path $buildRoot 'src_compiled'
$vpkOutput = Join-Path $root 'pak80_dir.vpk'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkEditCli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$source2Viewer = Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'

$requiredSourceAssets = @(
    'panorama/layout/citadel_db_page_profile.xml',
    'panorama/layout/citadel_ui_context_menu_player.xml',
    'panorama/layout/profile_card.xml',
    'panorama/scripts/profile_stats_community.js',
    'panorama/scripts/profile_stats_community_context_menu.js',
    'panorama/styles/profile_stats_community.css'
)
$requiredCompiledAssets = @(
    'panorama/layout/citadel_db_page_profile.vxml_c',
    'panorama/layout/citadel_ui_context_menu_player.vxml_c',
    'panorama/layout/profile_card.vxml_c',
    'panorama/scripts/profile_stats_community.vjs_c',
    'panorama/scripts/profile_stats_community_context_menu.vjs_c',
    'panorama/styles/profile_stats_community.vcss_c'
)
$forbiddenPackedAssets = @(
    'panorama/layout/citadel_db_page_profile.xml',
    'panorama/layout/citadel_ui_context_menu_player.xml',
    'panorama/layout/profile_card.xml',
    'panorama/scripts/profile_stats_community.js',
    'panorama/scripts/profile_stats_community_context_menu.js',
    'panorama/styles/profile_stats_community.css',
    'AGENTS.md',
    'README.md',
    'package.json',
    'bridge.html',
    'tests/'
)

function Assert-ProfileStatsAssetSet {
    param(
        [Parameter(Mandatory = $true)][string[]]$Actual,
        [Parameter(Mandatory = $true)][string[]]$ExpectedAssets,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $expected = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($asset in $ExpectedAssets) {
        if (-not $expected.Add($asset)) {
            throw "$Label required asset is duplicated: $asset"
        }
    }

    $actualSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $duplicates = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $Actual) {
        if (-not $actualSet.Add($asset)) {
            $duplicates.Add($asset)
        }
    }

    $missing = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $expected) {
        if (-not $actualSet.Contains($asset)) {
            $missing.Add($asset)
        }
    }

    $unexpected = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $actualSet) {
        if (-not $expected.Contains($asset)) {
            $unexpected.Add($asset)
        }
    }

    if ($duplicates.Count -or $missing.Count -or $unexpected.Count) {
        throw "$Label asset set mismatch. Missing=[$($missing -join ', ')]; Unexpected=[$($unexpected -join ', ')]; Duplicates=[$($duplicates -join ', ')]"
    }
}

function Get-ProfileStatsAssetPaths {
    param([Parameter(Mandatory = $true)][string]$RootPath)

    $resolvedRoot = (Resolve-Path -LiteralPath $RootPath).Path.TrimEnd('\', '/')
    $panoramaRoot = Join-Path $resolvedRoot 'panorama'
    if (-not (Test-Path -LiteralPath $panoramaRoot)) {
        throw "Profile Stats panorama source folder not found: $panoramaRoot"
    }

    return @(
        Get-ChildItem -LiteralPath $panoramaRoot -Recurse -File |
            ForEach-Object {
                $_.FullName.Substring($resolvedRoot.Length).TrimStart('\', '/') -replace '\\', '/'
            } |
            Sort-Object
    )
}

function Get-ProfileStatsPackedAssetPaths {
    param([Parameter(Mandatory = $true)][string[]]$Tree)

    return @(
        foreach ($entry in $Tree) {
            $line = ([string]$entry).Trim() -replace '\\', '/'
            if (-not $line) { continue }
            if ($line -notmatch '^(\S+)\s+CRC:[0-9A-Fa-f]+\s+size:\d+$') {
                throw "Unexpected packed VPK tree entry: $line"
            }
            $Matches[1]
        }
    )
}
function Get-ProfileStatsSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '')
        } finally {
            $sha256.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Invoke-ProfileStatsClosureMinification {
    param(
        [Parameter(Mandatory = $true)][string]$ReadableSourcePath,
        [Parameter(Mandatory = $true)][string]$StagedSourcePath,
        [Parameter(Mandatory = $true)][string]$TemporaryRoot,
        [switch]$ValidateProtocolKeys
    )

    $externsPath = Join-Path $TemporaryRoot 'profile_stats_community.externs.js'
    $minifiedPath = Join-Path $TemporaryRoot 'profile_stats_community.min.js'
    New-Item -ItemType Directory -Path $TemporaryRoot -Force | Out-Null
    $dynamicLookupKeys = @()
    $protocolGroupIds = @()
    if ($ValidateProtocolKeys) {
        $dynamicLookupKeys = @(
            'kda', 'kills_plus_assists', 'player_damage_per_health',
            'average_kills', 'average_deaths', 'average_assists',
            'accuracy', 'critical_hit_rate', 'kd',
            'player_damage_per_minute', 'damage_taken_per_minute', 'objective_damage_per_minute',
            'net_worth_per_minute', 'average_last_hits', 'average_denies',
            'self_healing_per_minute', 'player_healing_per_minute', 'heal_prevented',
            'invalid_query', 'network_error', 'upstream_error',
            'rate_limit', 'empty_sample', 'invalid_payload', 'payload_too_large', 'internal_error',
            'ranked', 'standard', 'community', 'percentile'
        )
        $protocolGroupIds = @(
            'performance', 'scoreboard', 'accuracy_kd', 'damage', 'economy', 'healing'
        )
    }

    try {
        $propertyNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
        foreach ($match in [regex]::Matches([System.IO.File]::ReadAllText($ReadableSourcePath), '\.([A-Za-z_$][A-Za-z0-9_$]*)')) {
            [void]$propertyNames.Add($match.Groups[1].Value)
        }

        $externs = [System.Collections.Generic.List[string]]::new()
        $externs.Add('var $;')
        $externs.Add('function DismissAllContextMenus() {}')
        $externs.Add('function DropInputFocus() {}')
        foreach ($propertyName in ($propertyNames | Sort-Object)) {
            $externs.Add("Object.prototype.$propertyName;")
        }
        foreach ($dynamicLookupKey in $dynamicLookupKeys) {
            $externs.Add("Object.prototype['$dynamicLookupKey'];")
        }
        [System.IO.File]::WriteAllLines($externsPath, $externs, [System.Text.UTF8Encoding]::new($false))

        & npx --yes google-closure-compiler --js $StagedSourcePath --js_output_file $minifiedPath --externs $externsPath --compilation_level ADVANCED --language_in ECMASCRIPT5 --language_out ECMASCRIPT5 --warning_level QUIET
        if ($LASTEXITCODE -ne 0) {
            throw "Closure Compiler failed with exit code $LASTEXITCODE"
        }
        if (-not (Test-Path -LiteralPath $minifiedPath)) {
            throw "Closure Compiler did not produce minified runtime: $minifiedPath"
        }

        $readableBytes = (Get-Item -LiteralPath $ReadableSourcePath).Length
        $minifiedBytes = (Get-Item -LiteralPath $minifiedPath).Length
        if ($minifiedBytes -lt 512) {
            throw "Closure Compiler output is implausibly small: $minifiedBytes bytes"
        }
        if ($minifiedBytes -ge $readableBytes) {
            throw "Closure Compiler output was not smaller than readable source: $minifiedBytes >= $readableBytes bytes"
        }

        & node --check $minifiedPath
        if ($LASTEXITCODE -ne 0) {
            throw 'Closure Compiler output has invalid JavaScript syntax'
        }
        $minifiedSource = [System.IO.File]::ReadAllText($minifiedPath)
        foreach ($dynamicLookupKey in $dynamicLookupKeys) {
            $objectKeyPattern = '(?:\{|,)\s*(?:"|'')?' + [regex]::Escape($dynamicLookupKey) + '(?:"|'')?:'
            if (-not [regex]::IsMatch($minifiedSource, $objectKeyPattern)) {
                throw "Closure Compiler renamed dynamic lookup key: $dynamicLookupKey"
            }
        }
        foreach ($protocolGroupId in $protocolGroupIds) {
            $stringValuePattern = '["'']' + [regex]::Escape($protocolGroupId) + '["'']'
            if (-not [regex]::IsMatch($minifiedSource, $stringValuePattern)) {
                throw "Closure Compiler removed protocol group ID: $protocolGroupId"
            }
        }


        Move-Item -LiteralPath $minifiedPath -Destination $StagedSourcePath -Force
    } finally {
        foreach ($temporaryPath in @($externsPath, $minifiedPath)) {
            if (Test-Path -LiteralPath $temporaryPath) {
                Remove-Item -LiteralPath $temporaryPath -Force
            }
        }
    }
}

function Assert-ProfileStatsProject {
    if (-not (Test-Path -LiteralPath $moduleRoot)) {
        throw "Profile Stats Community source folder not found: $moduleRoot"
    }
    if (-not (Test-Path -LiteralPath $compositionScript)) {
        throw "Profile Stats Community composition script not found: $compositionScript"
    }
    $resolvedModuleRoot = (Resolve-Path -LiteralPath $moduleRoot).Path
    Assert-PathUnderRoot -Path $resolvedModuleRoot -RootPath $root
    Assert-PathUnderRoot -Path (Resolve-Path -LiteralPath $compositionScript).Path -RootPath $root
    & npm --prefix $moduleRoot run validate
    if ($LASTEXITCODE -ne 0) {
        throw "Profile Stats Community validation failed with exit code $LASTEXITCODE"
    }
    Assert-ProfileStatsAssetSet -Actual (Get-ProfileStatsAssetPaths -RootPath $moduleRoot) -ExpectedAssets $requiredSourceAssets -Label 'Profile Stats Community source package'
}


foreach ($path in @($moduleRoot, $compositionScript, $buildRoot, $stageSource, $stageCompiled, $vpkOutput, $compiler, $vpkEditCli, $source2Viewer)) {
    Assert-PathUnderRoot -Path $path -RootPath $root
    if (Test-Path -LiteralPath $path) {
        Assert-PathUnderRoot -Path (Resolve-Path -LiteralPath $path).Path -RootPath $root
    }
}

Assert-ProfileStatsProject

if (Test-Path -LiteralPath $buildRoot) {
    $resolvedBuildRoot = (Resolve-Path -LiteralPath $buildRoot).Path
    Assert-PathUnderRoot -Path $resolvedBuildRoot -RootPath $root
    if ((Split-Path -Leaf $resolvedBuildRoot) -ne '_profile_stats_community_build') {
        throw "Refusing to remove unexpected staging path: $resolvedBuildRoot"
    }
}
Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_profile_stats_community_build'

if (Test-Path -LiteralPath $vpkOutput) {
    $resolvedVpkOutput = (Resolve-Path -LiteralPath $vpkOutput).Path
    Assert-PathUnderRoot -Path $resolvedVpkOutput -RootPath $root
    if ((Split-Path -Leaf $resolvedVpkOutput) -ne 'pak80_dir.vpk') {
        throw "Refusing to remove unexpected VPK output: $resolvedVpkOutput"
    }
    Remove-Item -LiteralPath $resolvedVpkOutput -Force
}

try {
    New-Item -ItemType Directory -Path $stageSource -Force | Out-Null
    foreach ($asset in $requiredSourceAssets) {
        $sourcePath = Join-Path $moduleRoot ($asset -replace '/', '\\')
        $stagedPath = Join-Path $stageSource ($asset -replace '/', '\\')
        if (-not (Test-Path -LiteralPath $sourcePath)) {
            throw "Required Profile Stats source asset not found: $sourcePath"
        }
        Assert-PathUnderRoot -Path (Resolve-Path -LiteralPath $sourcePath).Path -RootPath $root
        New-Item -ItemType Directory -Path (Split-Path -Parent $stagedPath) -Force | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $stagedPath -Force
    }
    & node $compositionScript --profile-stats $stageSource
    if ($LASTEXITCODE -ne 0) {
        throw "Profile Stats Community source composition failed with exit code $LASTEXITCODE"
    }
    Assert-ProfileStatsAssetSet -Actual (Get-ProfileStatsAssetPaths -RootPath $stageSource) -ExpectedAssets $requiredSourceAssets -Label 'Staged Profile Stats source'

    $stagedRuntime = Join-Path $stageSource 'panorama\scripts\profile_stats_community.js'
    $readableRuntime = Join-Path $buildRoot 'profile_stats_community.readable.js'
    Copy-Item -LiteralPath $stagedRuntime -Destination $readableRuntime -Force
    if ((Get-ProfileStatsSha256 -Path $readableRuntime) -ne (Get-ProfileStatsSha256 -Path $stagedRuntime)) {
        throw 'Staged Profile Stats runtime does not exactly match composed readable source before minification.'
    }
    Invoke-ProfileStatsClosureMinification -ReadableSourcePath $readableRuntime -StagedSourcePath $stagedRuntime -TemporaryRoot (Join-Path $buildRoot 'minify') -ValidateProtocolKeys
    $stagedContextRuntime = Join-Path $stageSource 'panorama\scripts\profile_stats_community_context_menu.js'
    $readableContextRuntime = Join-Path $buildRoot 'profile_stats_community_context_menu.readable.js'
    Copy-Item -LiteralPath $stagedContextRuntime -Destination $readableContextRuntime -Force
    if ((Get-ProfileStatsSha256 -Path $readableContextRuntime) -ne (Get-ProfileStatsSha256 -Path $stagedContextRuntime)) {
        throw 'Staged Profile Stats context-menu runtime does not exactly match composed readable source before minification.'
    }
    Invoke-ProfileStatsClosureMinification -ReadableSourcePath $readableContextRuntime -StagedSourcePath $stagedContextRuntime -TemporaryRoot (Join-Path $buildRoot 'minify-context-menu')
    Assert-ProfileStatsAssetSet -Actual (Get-ProfileStatsAssetPaths -RootPath $stageSource) -ExpectedAssets $requiredSourceAssets -Label 'Minified Profile Stats source'

    if (-not (Test-Path -LiteralPath $compiler)) {
        throw "Source2 compiler not found: $compiler"
    }
    if (-not (Test-Path -LiteralPath $source2Viewer)) {
        throw "Source2Viewer CLI not found: $source2Viewer"
    }

    $requiredCompiledOutputs = @($requiredCompiledAssets | ForEach-Object { Join-Path $stageCompiled ($_ -replace '/', '\\') })
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredCompiledOutputs -HiddenWindow
    Assert-ProfileStatsAssetSet -Actual (Get-ProfileStatsAssetPaths -RootPath $stageCompiled) -ExpectedAssets $requiredCompiledAssets -Label 'Compiled Profile Stats output'

    Invoke-VpkPack -VpkEditCli $vpkEditCli -InputDir $stageCompiled -OutputPath $vpkOutput
    $packedTree = Get-PackedVpkTree -VpkEditCli $vpkEditCli -VpkPath $vpkOutput -Source2ViewerPath $source2Viewer
    $packedAssets = Get-ProfileStatsPackedAssetPaths -Tree $packedTree
    Assert-ProfileStatsAssetSet -Actual $packedAssets -ExpectedAssets $requiredCompiledAssets -Label 'Packed Profile Stats VPK'
    Assert-PackedVpkAssets -Tree $packedTree -Required $requiredCompiledAssets -Forbidden $forbiddenPackedAssets -Label 'Packed Profile Stats VPK'
} finally {
    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_profile_stats_community_build'
}
