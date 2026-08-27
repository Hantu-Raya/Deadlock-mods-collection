param(
    [switch]$Install,
    [switch]$KeepStaging,
    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons"
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$barebonesRoot = Join-Path $root 'showrank_barebones'
$compositionScript = Join-Path $root 'scripts\profile-stats-community-composition.js'
$buildRoot = Join-Path $root '_showrank_barebones_build'
$stageSource = Join-Path $buildRoot 'src'
$stageCompiled = Join-Path $buildRoot 'src_compiled'
$vpkOutput = Join-Path $root 'showrank_barebones_dir.vpk'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkEditCli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$source2Viewer = Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'

$requiredSourceAssets = @(
    'panorama/layout/profile_card.xml',
    'panorama/layout/citadel_db_page_profile.xml',
    'panorama/layout/citadel_ui_context_menu_player.xml',
    'panorama/layout/citadel_hud_top_bar.xml',
    'panorama/layout/citadel_hud_top_bar_player.xml',
    'panorama/layout/hud_escape_menu.xml',
    'panorama/layout/players_list_entry.xml',
    'panorama/scripts/showrank_barebones.js',
    'panorama/styles/showrank_barebones_topbar.css'
)
$requiredCompiledAssets = @(
    'panorama/layout/profile_card.vxml_c',
    'panorama/layout/citadel_db_page_profile.vxml_c',
    'panorama/layout/citadel_ui_context_menu_player.vxml_c',
    'panorama/layout/citadel_hud_top_bar.vxml_c',
    'panorama/layout/citadel_hud_top_bar_player.vxml_c',
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/layout/players_list_entry.vxml_c',
    'panorama/scripts/showrank_barebones.vjs_c',
    'panorama/styles/showrank_barebones_topbar.vcss_c'
)

function Assert-BarebonesAssetSet {
    param(
        [Parameter(Mandatory = $true)][string[]]$Actual,
        [Parameter(Mandatory = $true)][string[]]$ExpectedAssets,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $expected = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($asset in $ExpectedAssets) {
        if (-not $expected.Add($asset)) { throw "Barebones required asset is duplicated: $asset" }
    }

    $actualSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $duplicates = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $Actual) {
        if (-not $actualSet.Add($asset)) { $duplicates.Add($asset) }
    }

    $missing = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $expected) {
        if (-not $actualSet.Contains($asset)) { $missing.Add($asset) }
    }

    $unexpected = [System.Collections.Generic.List[string]]::new()
    foreach ($asset in $actualSet) {
        if (-not $expected.Contains($asset)) { $unexpected.Add($asset) }
    }

    if ($duplicates.Count -or $missing.Count -or $unexpected.Count) {
        throw "$Label asset set mismatch. Missing=[$($missing -join ', ')]; Unexpected=[$($unexpected -join ', ')]; Duplicates=[$($duplicates -join ', ')]"
    }
}

function Get-BarebonesAssetPaths {
    param([Parameter(Mandatory = $true)][string]$RootPath)

    $resolvedRoot = (Resolve-Path -LiteralPath $RootPath).Path.TrimEnd('\', '/')
    $panoramaRoot = Join-Path $resolvedRoot 'panorama'
    if (-not (Test-Path -LiteralPath $panoramaRoot)) {
        throw "Barebones panorama source folder not found: $panoramaRoot"
    }
    return @(
        Get-ChildItem -LiteralPath $panoramaRoot -Recurse -File |
            ForEach-Object {
                $_.FullName.Substring($resolvedRoot.Length).TrimStart('\', '/') -replace '\\', '/'
            } |
            Sort-Object
    )
}

function Get-BarebonesPackedAssetPaths {
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

function Assert-DeadlockClosed {
    $running = @(Get-Process -Name 'deadlock' -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        throw 'Deadlock must be closed before installing ShowRank barebones.'
    }
}

function Get-BarebonesSha256 {
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
function Invoke-BarebonesClosureMinification {
    param(
        [Parameter(Mandatory = $true)][string]$ReadableSourcePath,
        [Parameter(Mandatory = $true)][string]$StagedSourcePath,
        [Parameter(Mandatory = $true)][string]$TemporaryRoot
    )

    $externsPath = Join-Path $TemporaryRoot 'showrank_barebones.externs.js'
    $minifiedPath = Join-Path $TemporaryRoot 'showrank_barebones.min.js'
    $dynamicLookupKeys = @(
        'kda', 'kills_plus_assists', 'player_damage_per_health',
        'average_kills', 'average_deaths', 'average_assists',
        'accuracy', 'critical_hit_rate', 'kd',
        'player_damage_per_minute', 'damage_taken_per_minute', 'objective_damage_per_minute',
        'net_worth_per_minute', 'average_last_hits', 'average_denies',
        'self_healing_per_minute', 'player_healing_per_minute', 'heal_prevented',
        'invalid_query', 'network_error', 'upstream_error',
        'rate_limit', 'empty_sample', 'invalid_payload', 'payload_too_large', 'internal_error',
        'ranked', 'standard', 'community', 'percentile',
        '50', '100', '150'
    )
    $protocolGroupIds = @(
        'performance', 'scoreboard', 'accuracy_kd', 'damage', 'economy', 'healing'
    )
    New-Item -ItemType Directory -Path $TemporaryRoot -Force | Out-Null

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
        if ($LASTEXITCODE -ne 0) { throw "Closure Compiler failed with exit code $LASTEXITCODE" }

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
        if ($LASTEXITCODE -ne 0) { throw "Closure Compiler output has invalid JavaScript syntax" }
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

        foreach ($publicFragment in @(
            'ShowRankBarebonesRefresh',
            'ShowRankBarebonesOpenStatlocker',
            'ShowRankBarebonesOpenPlayerProfile',
            'ShowRankBarebonesCopyAccount',
            'ShowRankBarebonesEscapeOpen',
            'ShowRankBarebonesEscapeOut',
            'ShowRankBarebonesMissingWindowExpired'
        )) {
            if (-not (Select-String -LiteralPath $minifiedPath -Pattern $publicFragment -SimpleMatch -Quiet)) {
                throw "Closure Compiler output is missing required public fragment: $publicFragment"
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


function Remove-BarebonesInstallTemporary {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$AddonsRoot
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    Assert-PathUnderRoot -Path $Path -RootPath $AddonsRoot
    if ((Split-Path -Leaf $Path) -ne 'pak89_dir.showrank-barebones.tmp.vpk') {
        throw "Refusing to remove unexpected temporary install file: $Path"
    }
    Remove-Item -LiteralPath $Path -Force
}

function Install-BarebonesVpk {
    param([Parameter(Mandatory = $true)][string]$SourceVpk)

    $destination = Join-Path $AddonsPath 'pak89_dir.vpk'
    $temporary = Join-Path $AddonsPath 'pak89_dir.showrank-barebones.tmp.vpk'
    $replaceBackup = Join-Path $AddonsPath 'pak89_dir.showrank-barebones.replace-backup.tmp.vpk'

    try {
        Assert-DeadlockClosed
        if (-not (Test-Path -LiteralPath $AddonsPath)) {
            throw "Deadlock addons folder not found: $AddonsPath"
        }
        if (Test-Path -LiteralPath $replaceBackup) {
            throw "A preserved barebones replacement backup requires recovery or removal: $replaceBackup"
        }

        Copy-Item -LiteralPath $SourceVpk -Destination $temporary -Force

        $sourceHash = Get-BarebonesSha256 -Path $SourceVpk
        $temporaryHash = Get-BarebonesSha256 -Path $temporary
        if (-not $sourceHash.Equals($temporaryHash, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Installed barebones VPK hash does not match build artifact: $temporary"
        }

        $temporaryTree = Get-PackedVpkTree -VpkEditCli $vpkEditCli -VpkPath $temporary -Source2ViewerPath $source2Viewer
        Assert-BarebonesAssetSet -Actual (Get-BarebonesPackedAssetPaths -Tree $temporaryTree) -ExpectedAssets $requiredCompiledAssets -Label 'Temporary barebones VPK'
        Assert-DeadlockClosed

        if (Test-Path -LiteralPath $destination) {
            [System.IO.File]::Replace($temporary, $destination, $replaceBackup, $true)
            Remove-Item -LiteralPath $replaceBackup -Force
        } else {
            [System.IO.File]::Move($temporary, $destination)
        }
    } catch {
        Remove-BarebonesInstallTemporary -Path $temporary -AddonsRoot $AddonsPath
        throw
    }
}

if (-not (Test-Path -LiteralPath $barebonesRoot)) {
    throw "ShowRank barebones source folder not found: $barebonesRoot"
}
if (-not (Test-Path -LiteralPath $compositionScript)) {
    throw "Profile Stats Community composition script not found: $compositionScript"
}
Assert-PathUnderRoot -Path (Resolve-Path -LiteralPath $compositionScript).Path -RootPath $root


& npm --prefix $barebonesRoot run validate
if ($LASTEXITCODE -ne 0) { throw "ShowRank barebones validation failed with exit code $LASTEXITCODE" }

Assert-BarebonesAssetSet -Actual (Get-BarebonesAssetPaths -RootPath $barebonesRoot) -ExpectedAssets $requiredSourceAssets -Label 'Barebones source package'

Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_showrank_barebones_build'
if (Test-Path -LiteralPath $vpkOutput) {
    Assert-PathUnderRoot -Path $vpkOutput -RootPath $root
    if ((Split-Path -Leaf (Resolve-Path -LiteralPath $vpkOutput).Path) -ne 'showrank_barebones_dir.vpk') {
        throw "Refusing to remove unexpected barebones VPK: $vpkOutput"
    }
    Remove-Item -LiteralPath $vpkOutput -Force
}

try {
    New-Item -ItemType Directory -Path $stageSource -Force | Out-Null
    foreach ($asset in $requiredSourceAssets) {
        $sourcePath = Join-Path $barebonesRoot ($asset -replace '/', '\\')
        $stagedPath = Join-Path $stageSource ($asset -replace '/', '\\')
        New-Item -ItemType Directory -Path (Split-Path -Parent $stagedPath) -Force | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $stagedPath -Force
    }
    & node $compositionScript $stageSource
    if ($LASTEXITCODE -ne 0) { throw "Profile Stats Community composition failed with exit code $LASTEXITCODE" }
    Assert-BarebonesAssetSet -Actual (Get-BarebonesAssetPaths -RootPath $stageSource) -ExpectedAssets $requiredSourceAssets -Label 'Composed barebones source'
    $readableRuntime = Join-Path $buildRoot 'showrank_barebones.readable.js'
    $stagedRuntime = Join-Path $stageSource 'panorama\scripts\showrank_barebones.js'
    Copy-Item -LiteralPath $stagedRuntime -Destination $readableRuntime -Force
    if ((Get-BarebonesSha256 -Path $readableRuntime) -ne (Get-BarebonesSha256 -Path $stagedRuntime)) {
        throw 'Staged barebones runtime does not exactly match the composed readable source before minification.'
    }
    Invoke-BarebonesClosureMinification -ReadableSourcePath $readableRuntime -StagedSourcePath $stagedRuntime -TemporaryRoot (Join-Path $buildRoot 'minify')

    $hadRuntimeOverride = Test-Path Env:SHOWRANK_BAREBONES_RUNTIME
    $previousRuntimeOverride = $env:SHOWRANK_BAREBONES_RUNTIME
    try {
        $env:SHOWRANK_BAREBONES_RUNTIME = $stagedRuntime
        & node (Join-Path $barebonesRoot 'tests\showrank-barebones-runtime.test.js')
        if ($LASTEXITCODE -ne 0) { throw "Minified barebones runtime test failed with exit code $LASTEXITCODE" }
        & node (Join-Path $barebonesRoot 'tests\profile-stats-community-runtime.test.js')
        if ($LASTEXITCODE -ne 0) { throw "Minified Profile Stats Community runtime test failed with exit code $LASTEXITCODE" }
    } finally {
        if ($hadRuntimeOverride) {
            $env:SHOWRANK_BAREBONES_RUNTIME = $previousRuntimeOverride
        } else {
            Remove-Item Env:SHOWRANK_BAREBONES_RUNTIME -ErrorAction SilentlyContinue
        }
    }


    if (-not (Test-Path -LiteralPath $compiler)) {
        throw "Source2 compiler not found: $compiler"
    }
    if (-not (Test-Path -LiteralPath $source2Viewer)) {
        throw "Source2Viewer CLI not found: $source2Viewer"
    }

    $requiredCompiledOutputs = @($requiredCompiledAssets | ForEach-Object { Join-Path $stageCompiled ($_ -replace '/', '\\') })
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource -RequiredOutputs $requiredCompiledOutputs -HiddenWindow
    Assert-BarebonesAssetSet -Actual (Get-BarebonesAssetPaths -RootPath $stageCompiled) -ExpectedAssets $requiredCompiledAssets -Label 'Compiled barebones output'

    Invoke-VpkPack -VpkEditCli $vpkEditCli -InputDir $stageCompiled -OutputPath $vpkOutput
    $packedTree = Get-PackedVpkTree -VpkEditCli $vpkEditCli -VpkPath $vpkOutput -Source2ViewerPath $source2Viewer
    Assert-BarebonesAssetSet -Actual (Get-BarebonesPackedAssetPaths -Tree $packedTree) -ExpectedAssets $requiredCompiledAssets -Label 'Packed barebones VPK'

    if ($Install) {
        Install-BarebonesVpk -SourceVpk $vpkOutput
    }
} finally {
    if (-not $KeepStaging) {
        Remove-TreeUnderRoot -Path $buildRoot -RootPath $root -ExpectedLeaf '_showrank_barebones_build'
    }
}
