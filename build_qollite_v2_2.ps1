param(
    [string]$OutputPath = "",
    [string]$VpkEditCli = "",
    [int]$CompileTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$sourceRoot = Join-Path $root 'qollite'
$buildRoot = Join-Path $root '.tmp\qollite-v2-2-build'
$packRoot = Join-Path $buildRoot 'pack'
$closureExterns = Join-Path $buildRoot 'qollite-closure.externs.js'
$closureLayoutEntrypoints = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$closureInputBytes = 0L
$closureOutputBytes = 0L
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$compilerPreferenceText = Get-Content -LiteralPath (Join-Path $root 'sr2compiler\pref.json') -Raw
$compilerDirectoryMatch = [regex]::Match($compilerPreferenceText, '"directory"\s*:\s*"([^"]+)"')
if (-not $compilerDirectoryMatch.Success) { throw 'Compiler preference does not define directory.' }
$compilerAddonRoot = Join-Path $compilerDirectoryMatch.Groups[1].Value 'content\dota_addons'

if (-not $OutputPath) {
    $OutputPath = Join-Path $root 'qollite_passive_enabled_dir.vpk'
}
if (-not $VpkEditCli) {
    $VpkEditCli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
        (Join-Path $root 'vpk cli\vpkeditcli.exe'),
        (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe')
    )
}

function Remove-BuildPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    Remove-TreeUnderRoot -Path $Path -RootPath $root
}

function Remove-CompilerStage {
    param([Parameter(Mandatory = $true)][string]$SourceDir)
    $compilerStage = Join-Path $compilerAddonRoot (Split-Path -Leaf $SourceDir)
    if (Test-Path -LiteralPath $compilerStage) {
        Remove-Item -LiteralPath $compilerStage -Recurse -Force
    }
}

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][string]$Path
    )
    $basePath = [System.IO.Path]::GetFullPath($Base).TrimEnd('\', '/')
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    return $fullPath.Substring($basePath.Length).TrimStart('\', '/')
}

function Initialize-QolliteClosure {
    $scriptPaths = @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'panorama\scripts') -Filter '*.js' -File | Sort-Object Name | ForEach-Object FullName)
    if ($scriptPaths.Count -eq 0) { throw 'No Panorama JavaScript files found for Closure ADVANCED.' }

    $externProperties = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($scriptPath in $scriptPaths) {
        $source = [System.IO.File]::ReadAllText($scriptPath)
        foreach ($match in [regex]::Matches($source, '\.\s*([A-Za-z_$][A-Za-z0-9_$]*)')) {
            $null = $externProperties.Add($match.Groups[1].Value)
        }
        foreach ($match in [regex]::Matches($source, '(?:^|[,{])\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:', [System.Text.RegularExpressions.RegexOptions]::Multiline)) {
            $null = $externProperties.Add($match.Groups[1].Value)
        }
    }

    Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'panorama\layout') -Filter '*.xml' -File -Recurse | ForEach-Object {
        $layoutSource = [System.IO.File]::ReadAllText($_.FullName)
        foreach ($match in [regex]::Matches($layoutSource, '\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')) {
            $null = $closureLayoutEntrypoints.Add($match.Groups[1].Value)
        }
    }

    $lines = @(
        '/** @externs */',
        '/** @const */ var $ = {};',
        '$.GetContextPanel = function() {};',
        '$.Schedule = function(delay, callback) {};',
        '$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};',
        '$.RegisterEventHandler = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};',
        '$.RegisterForUnhandledEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};',
        '$.CreatePanel = function(type, parent, id) {};',
        '$.Msg = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};',
        '/** @const */ var GameUI = {};',
        'GameUI.CustomUIConfig = function() {};',
        '/** @const */ var Game = {};',
        'Game.GetMapInfo = function() {};',
        'Game.GetDOTATime = function() {};',
        'Game.GetGameTime = function() {};',
        'Game.Time = 0;',
        'Game.GameTime = 0;',
        '/** @const */ var SteamOverlayAPI = {};',
        'SteamOverlayAPI.OpenURL = function(url) {};',
        'SteamOverlayAPI.OpenExternalBrowserURL = function(url) {};'
    )
    foreach ($propertyName in @($externProperties | Sort-Object)) {
        $lines += "Object.prototype.$propertyName;"
    }
    [System.IO.File]::WriteAllText($closureExterns, ($lines -join "`n"), [System.Text.UTF8Encoding]::new($false))
}

function Invoke-QolliteClosureAdvanced {
    param([Parameter(Mandatory = $true)][string]$ScriptPath)

    $source = [System.IO.File]::ReadAllText($ScriptPath)
    $script:closureInputBytes += [System.Text.Encoding]::UTF8.GetByteCount($source)
    $globalNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($match in [regex]::Matches($source, '(?m)^(?:var|let|const|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)')) {
        $null = $globalNames.Add($match.Groups[1].Value)
    }
    foreach ($match in [regex]::Matches($source, '\b(?:var|let|const|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)')) {
        $name = $match.Groups[1].Value
        if ($closureLayoutEntrypoints.Contains($name)) { $null = $globalNames.Add($name) }
    }
    foreach ($name in @($globalNames | Sort-Object)) {
        $source += "`nif (typeof $name !== `"undefined`") this[`"$name`"] = $name;`n"
    }
    [System.IO.File]::WriteAllText($ScriptPath, $source, [System.Text.UTF8Encoding]::new($false))

    $outputPath = "$ScriptPath.closure.js"
    & npx --yes google-closure-compiler `
        --externs $closureExterns `
        --js $ScriptPath `
        --compilation_level ADVANCED `
        --warning_level QUIET `
        --jscomp_off undefinedVars `
        --js_output_file $outputPath
    if ($LASTEXITCODE -ne 0) {
        throw "Closure ADVANCED failed for $(Split-Path -Leaf $ScriptPath) with exit code $LASTEXITCODE"
    }
    if (-not (Test-Path -LiteralPath $outputPath) -or (Get-Item -LiteralPath $outputPath).Length -eq 0) {
        throw "Closure ADVANCED did not produce $(Split-Path -Leaf $ScriptPath)"
    }
    & node --check $outputPath
    if ($LASTEXITCODE -ne 0) {
        throw "Closure ADVANCED output failed syntax validation: $(Split-Path -Leaf $ScriptPath)"
    }
    $minified = [System.IO.File]::ReadAllText($outputPath)
    foreach ($name in $globalNames) {
        if (-not $minified.Contains($name)) {
            throw "Closure ADVANCED removed required global '$name' from $(Split-Path -Leaf $ScriptPath)"
        }
    }
    $script:closureOutputBytes += [System.Text.Encoding]::UTF8.GetByteCount($minified)
    Move-Item -LiteralPath $outputPath -Destination $ScriptPath -Force
}

function Get-AuthoredSources {
    return @(
        Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'panorama\scripts') -Filter '*.js' -File
        Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'panorama\layout') -Filter '*.xml' -File -Recurse
        Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'panorama\styles') -Filter '*.css' -File -Recurse
    ) | Sort-Object FullName
}

function Get-CompiledExtension {
    param([Parameter(Mandatory = $true)][string]$Extension)
    switch ($Extension.ToLowerInvariant()) {
        '.js' { return '.vjs_c' }
        '.xml' { return '.vxml_c' }
        '.css' { return '.vcss_c' }
        default { throw "Unsupported authored extension: $Extension" }
    }
}

function Compile-AuthoredSources {
    param([Parameter(Mandatory = $true)][object[]]$SourceFiles)

    $chunkSize = 8
    for ($offset = 0; $offset -lt $SourceFiles.Count; $offset += $chunkSize) {
        $chunkIndex = [int]($offset / $chunkSize)
        $lastIndex = [Math]::Min($offset + $chunkSize - 1, $SourceFiles.Count - 1)
        $chunkFiles = @($SourceFiles[$offset..$lastIndex])
        $chunkSource = Join-Path $buildRoot ("chunk_{0:D2}" -f $chunkIndex)
        $chunkCompiled = "${chunkSource}_compiled"

        foreach ($path in @($chunkSource, $chunkCompiled)) { Remove-BuildPath -Path $path }
        foreach ($sourceFile in $chunkFiles) {
            $relative = Get-RelativePath -Base $sourceRoot -Path $sourceFile.FullName
            $destination = Join-Path $chunkSource $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath $sourceFile.FullName -Destination $destination -Force
            if ($sourceFile.Extension -eq '.js') {
                Invoke-QolliteClosureAdvanced -ScriptPath $destination
            }
        }

        $requiredOutputs = @($chunkFiles | ForEach-Object {
            $relative = Get-RelativePath -Base $sourceRoot -Path $_.FullName
            $compiledExtension = Get-CompiledExtension -Extension $_.Extension
            Join-Path $chunkCompiled ([System.IO.Path]::ChangeExtension($relative, $compiledExtension))
        })

        Remove-CompilerStage -SourceDir $chunkSource
        Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $chunkSource -RequiredOutputs $requiredOutputs -TimeoutSeconds $CompileTimeoutSeconds -HiddenWindow
        Copy-Item -Path (Join-Path $chunkCompiled '*') -Destination $packRoot -Recurse -Force
        Remove-CompilerStage -SourceDir $chunkSource
        foreach ($path in @($chunkSource, $chunkCompiled)) { Remove-BuildPath -Path $path }
    }

    if ($closureOutputBytes -ge $closureInputBytes) {
        throw "Closure ADVANCED did not reduce JavaScript size: $closureInputBytes -> $closureOutputBytes bytes"
    }
    Write-Host "Closure ADVANCED JavaScript: $closureInputBytes -> $closureOutputBytes bytes" -ForegroundColor Green
}

function Assert-LocalStyleImportClosure {
    param([Parameter(Mandatory = $true)][string[]]$Tree)

    $required = @()
    $styleRoot = Join-Path $sourceRoot 'panorama\styles'
    foreach ($style in Get-ChildItem -LiteralPath $styleRoot -Filter '*.css' -File -Recurse) {
        $text = Get-Content -LiteralPath $style.FullName -Raw
        foreach ($match in [regex]::Matches($text, '@import\s+url\("s2r://panorama/styles/([^"]+)\.vcss_c"\)')) {
            $relativeSource = 'panorama\styles\' + $match.Groups[1].Value.Replace('/', '\') + '.css'
            if (Test-Path -LiteralPath (Join-Path $sourceRoot $relativeSource)) {
                $required += [System.IO.Path]::ChangeExtension($relativeSource, '.vcss_c')
            }
        }
    }

    $required = @($required | Sort-Object -Unique)
    if ($required.Count -gt 0) {
        Assert-PackedVpkAssets -Tree $Tree -Required $required -Label 'QOL Lite local CSS import closure'
    }
}

function Copy-PrecompiledVisuals {
    $allowedExtensions = @('.vtex_c', '.vmat_c', '.vmdl_c', '.vpcf_c')
    foreach ($asset in Get-ChildItem -LiteralPath $sourceRoot -File -Recurse) {
        if ($allowedExtensions -notcontains $asset.Extension.ToLowerInvariant()) { continue }
        $relative = Get-RelativePath -Base $sourceRoot -Path $asset.FullName
        if ($relative -match '(?i)qollock|pak47') {
            throw "Forbidden precompiled asset path: $relative"
        }
        $destination = Join-Path $packRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $asset.FullName -Destination $destination -Force
    }
}

function Read-OriginManifest {
    param([Parameter(Mandatory = $true)][string]$Path)
    $raw = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    $entries = if ($raw -is [System.Array]) { @($raw) } else { @($raw.files) }
    $origins = @{}
    foreach ($entry in $entries) {
        $source = if ($entry.sourcePath) { [string]$entry.sourcePath } else { [string]$entry.source }
        $origins[$source.Replace('\', '/').ToLowerInvariant()] = [string]$entry.origin
    }
    return $origins
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

function Write-PackageInventory {
    $origins = @{}
    foreach ($manifestName in @('layout-manifest.json', 'styles-manifest.json')) {
        $manifestOrigins = Read-OriginManifest -Path (Join-Path $sourceRoot "stock\$manifestName")
        foreach ($key in $manifestOrigins.Keys) { $origins[$key] = $manifestOrigins[$key] }
    }

    $assets = @()
    foreach ($asset in Get-ChildItem -LiteralPath $packRoot -File -Recurse | Sort-Object FullName) {
        $relative = (Get-RelativePath -Base $packRoot -Path $asset.FullName).Replace('\', '/')
        $sourcePath = $null
        $origin = 'qol-lite-original'
        if ($relative.EndsWith('.vxml_c', [System.StringComparison]::OrdinalIgnoreCase)) {
            $sourcePath = $relative.Substring(0, $relative.Length - 7) + '.xml'
        } elseif ($relative.EndsWith('.vcss_c', [System.StringComparison]::OrdinalIgnoreCase)) {
            $sourcePath = $relative.Substring(0, $relative.Length - 7) + '.css'
        } elseif ($relative.EndsWith('.vjs_c', [System.StringComparison]::OrdinalIgnoreCase)) {
            $sourcePath = $relative.Substring(0, $relative.Length - 6) + '.js'
        }
        if ($sourcePath) {
            $key = $sourcePath.ToLowerInvariant()
            if ($origins.ContainsKey($key)) { $origin = $origins[$key] }
        }
        $assets += [ordered]@{
            packedRelativePath = $relative
            sourcePath = $sourcePath
            origin = $origin
            sha256 = Get-Sha256 -Path $asset.FullName
            bytes = $asset.Length
        }
    }

    $inventory = [ordered]@{
        schemaVersion = 1
        release = '2.2'
        stockCommit = '3573cbb746581eccc7752fc2e00c21d4447d72bb'
        assets = $assets
    }
    $inventoryPath = [System.IO.Path]::ChangeExtension($OutputPath, '.inventory.json')
    [System.IO.File]::WriteAllText(
        $inventoryPath,
        ($inventory | ConvertTo-Json -Depth 6),
        [System.Text.UTF8Encoding]::new($false)
    )
}

if (-not (Test-Path -LiteralPath $sourceRoot)) { throw "QOL Lite source not found: $sourceRoot" }
if (-not (Test-Path -LiteralPath $compiler)) { throw "Source 2 compiler not found: $compiler" }
if (-not (Test-Path -LiteralPath $VpkEditCli)) { throw "VPK tool not found: $VpkEditCli" }

Remove-BuildPath -Path $buildRoot
if (Test-Path -LiteralPath $OutputPath) { Remove-Item -LiteralPath $OutputPath -Force }

try {
    New-Item -ItemType Directory -Path $packRoot -Force | Out-Null
    Initialize-QolliteClosure
    $authoredSources = @(Get-AuthoredSources)
    Compile-AuthoredSources -SourceFiles $authoredSources
    Copy-PrecompiledVisuals

    $tree = @(Get-ChildItem -LiteralPath $packRoot -File -Recurse | ForEach-Object FullName)
    Assert-LocalStyleImportClosure -Tree $tree
    Assert-PackedVpkAssets -Tree $tree -Required @(
        'panorama\scripts\qollite_map_bootstrap.vjs_c',
        'panorama\scripts\qollite_notifications_bootstrap.vjs_c',
        'panorama\scripts\qollite_topbar.vjs_c',
        'panorama\scripts\qollite_showrank.vjs_c',
        'panorama\scripts\qollite_passive.vjs_c',
        'panorama\scripts\qollite_recent_purchases.vjs_c',
        'panorama\scripts\qollite_quickbuy.vjs_c',
        'panorama\layout\hud.vxml_c',
        'panorama\layout\citadel_hud_top_bar.vxml_c',
        'panorama\styles\hud_minimap.vcss_c',
        'panorama\images\minimap\qollite_tunnels.vtex_c',
        'models\abilities\engineer_wall.vmdl_c'
    ) -Forbidden @(
        'qollock',
        'pak47',
        'umm_core.vjs_c',
        'umm.vcss_c',
        'scripts\abilities.vdata_c',
        '.js',
        '.xml',
        '.css',
        '.png'
    ) -Label 'QOL Lite v2.2 staging'

    Write-PackageInventory
    Invoke-VpkPack -VpkEditCli $VpkEditCli -InputDir $packRoot -OutputPath $OutputPath
    & $VpkEditCli $OutputPath --verify-checksums all --no-progress
    if ($LASTEXITCODE -ne 0) { throw "VPK checksum verification failed with exit code $LASTEXITCODE" }
} finally {
    foreach ($chunkSource in Get-ChildItem -LiteralPath $buildRoot -Directory -Filter 'chunk_*' -ErrorAction SilentlyContinue) {
        Remove-CompilerStage -SourceDir $chunkSource.FullName
    }
    Remove-BuildPath -Path $buildRoot
}

Write-Host "QOL Lite v2.2 VPK -> $OutputPath" -ForegroundColor Green
