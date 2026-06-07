param(
    [ValidateSet("all", "standalone", "standalone_redesign")]
    [string]$Variant = "all",

    [string]$StandalonePakName = "pak06_dir.vpk",
    [string]$RedesignPakName = "pak07_dir.vpk",
    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",

    [int]$CompileTimeoutSeconds = 120,
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$compiler = Join-Path $root "sr2compiler\New folder.exe"
$vpkeditcli = Join-Path $root "passive_items_mod\compiler\vpkeditcli.exe"
if (-not (Test-Path -LiteralPath $vpkeditcli)) {
    $vpkeditcli = Join-Path $root "vpk cli\vpkeditcli.exe"
}
$sevenZip = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
if (-not $sevenZip) {
    $sevenZip = "C:\Program Files\7-Zip\7z.exe"
}
$addons = $AddonsPath
$dateTag = Get-Date -Format 'MM_dd'

$pakSpecs = @(
    @{
        Id = "standalone"
        DisplayName = "Standalone passive items"
        SourceDir = Join-Path $root "standalone"
        CompiledDir = Join-Path $root "standalone_compiled"
        StageDir = Join-Path $root "pak06_dir"
        VpkOut = Join-Path $root $StandalonePakName
        PakName = $StandalonePakName
        ArchiveName = "standalone_passive_items_$dateTag.7z"
    }
    @{
        Id = "standalone_redesign"
        DisplayName = "Standalone passive items redesign"
        SourceDir = Join-Path $root "standalone_redesign"
        CompiledDir = Join-Path $root "standalone_redesign_compiled"
        StageDir = Join-Path $root "pak07_dir"
        VpkOut = Join-Path $root $RedesignPakName
        PakName = $RedesignPakName
        ArchiveName = "standalone_passive_items_redesign_$dateTag.7z"
    }
)

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-UnderRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    $resolvedPath = Get-FullPath $Path
    $resolvedRoot = (Get-FullPath $RootPath).TrimEnd('\', '/')
    if ($resolvedPath -eq $resolvedRoot) {
        throw "Refusing to operate on the repo root itself: $resolvedPath"
    }
    if (-not $resolvedPath.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside repo root. Path=$resolvedPath Root=$resolvedRoot"
    }
}

function Remove-TreeUnderRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Assert-UnderRoot -Path $Path -RootPath $RootPath
    Remove-Item -LiteralPath $Path -Recurse -Force
}

function Require-Path {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Get-CompiledRelativePath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $extension = [System.IO.Path]::GetExtension($RelativePath).ToLowerInvariant()
    $suffix = switch ($extension) {
        ".css" { ".vcss_c" }
        ".xml" { ".vxml_c" }
        ".js" { ".vjs_c" }
        default { throw "Unsupported source extension for compile check: $RelativePath" }
    }

    $withoutExtension = $RelativePath.Substring(0, $RelativePath.Length - $extension.Length)
    return $withoutExtension + $suffix
}

function Get-SourceAssetRelativePaths {
    param([Parameter(Mandatory = $true)][string]$SourceDir)

    $panoramaDir = Join-Path $SourceDir "panorama"
    Require-Path -Path $panoramaDir -Label "Panorama source directory"

    $assets = Get-ChildItem -LiteralPath $panoramaDir -Recurse -File |
        Where-Object { $_.Extension -in @(".css", ".xml", ".js") } |
        Sort-Object FullName

    if (-not $assets) {
        throw "No Panorama .css/.xml/.js assets found under $panoramaDir"
    }

    $sourceRoot = (Get-FullPath $SourceDir).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    return @($assets | ForEach-Object {
        (Get-FullPath $_.FullName).Substring($sourceRoot.Length)
    })
}

function Invoke-StandaloneCompiler {
    param([Parameter(Mandatory = $true)][hashtable]$Spec)

    Remove-TreeUnderRoot -Path $Spec.CompiledDir -RootPath $root

    $sourceAssets = Get-SourceAssetRelativePaths -SourceDir $Spec.SourceDir
    $expectedOutputs = @($sourceAssets | ForEach-Object {
        Join-Path $Spec.CompiledDir (Get-CompiledRelativePath -RelativePath $_)
    })

    Write-Host "[compile] $($Spec.Id)" -ForegroundColor Cyan
    $proc = Start-Process -FilePath $compiler -ArgumentList "`"$($Spec.SourceDir)`"" -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds($CompileTimeoutSeconds)

    while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $missing = @($expectedOutputs | Where-Object { -not (Test-Path -LiteralPath $_) })
        if ($missing.Count -eq 0) {
            Start-Sleep -Seconds 2
            if (-not $proc.HasExited) {
                Write-Host "  [warn] compiler produced output but did not exit; stopping wrapper" -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                $proc.WaitForExit()
            }
            break
        }
    }

    if (-not $proc.HasExited) {
        Write-Host "  [warn] compiler timed out; stopping wrapper" -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $proc.WaitForExit()
    }

    $missingOutputs = @($expectedOutputs | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missingOutputs.Count -gt 0) {
        throw "Compiled output missing for $($Spec.Id): $($missingOutputs -join ', ')"
    }

    if ($proc.ExitCode -ne 0) {
        Write-Host "  [warn] compiler exited $($proc.ExitCode) after producing expected outputs; continuing" -ForegroundColor Yellow
    }

    Write-Host "  Compiled OK: $($expectedOutputs.Count) file(s) -> $($Spec.CompiledDir)" -ForegroundColor Green
}

function Stage-CompiledOutput {
    param([Parameter(Mandatory = $true)][hashtable]$Spec)

    Remove-TreeUnderRoot -Path $Spec.StageDir -RootPath $root
    New-Item -ItemType Directory -Path $Spec.StageDir -Force | Out-Null

    Write-Host "[stage] $($Spec.Id) -> $(Split-Path $($Spec.StageDir) -Leaf)" -ForegroundColor Cyan
    Get-ChildItem -LiteralPath $Spec.CompiledDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Spec.StageDir -Recurse -Force
    }
}

function Pack-StandaloneVpk {
    param([Parameter(Mandatory = $true)][hashtable]$Spec)

    if (Test-Path -LiteralPath $Spec.VpkOut) {
        Remove-Item -LiteralPath $Spec.VpkOut -Force
    }

    Write-Host "[pack] $($Spec.Id) -> $($Spec.PakName)" -ForegroundColor Cyan
    $packArgs = "`"$($Spec.StageDir)`" -o `"$($Spec.VpkOut)`" -s --no-progress"
    $pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
    if ($pack.ExitCode -ne 0) {
        throw "vpkeditcli failed for $($Spec.Id) with exit code $($pack.ExitCode)"
    }
    Require-Path -Path $Spec.VpkOut -Label $Spec.PakName
}

function Compress-StandaloneVpk {
    param([Parameter(Mandatory = $true)][hashtable]$Spec)

    $archivePath = Join-Path $addons $Spec.ArchiveName
    $archiveStage = Join-Path $root ("_standalone_archive_" + $Spec.Id)

    Remove-TreeUnderRoot -Path $archiveStage -RootPath $root
    New-Item -ItemType Directory -Path $archiveStage -Force | Out-Null
    Copy-Item -LiteralPath $Spec.VpkOut -Destination (Join-Path $archiveStage $Spec.PakName) -Force

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    Write-Host "[archive] $($Spec.ArchiveName)" -ForegroundColor Cyan
    Push-Location -LiteralPath $archiveStage
    try {
        & $sevenZip a -t7z $archivePath ".\*" -mx=9 -bso0 -bsp0
        if ($LASTEXITCODE -ne 0) {
            throw "7z failed for $($Spec.Id) with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    Require-Path -Path $archivePath -Label $Spec.ArchiveName
    if (-not $KeepStaging) {
        Remove-TreeUnderRoot -Path $archiveStage -RootPath $root
    }

    return $archivePath
}

Require-Path -Path $compiler -Label "sr2compiler wrapper"
Require-Path -Path $vpkeditcli -Label "vpkeditcli.exe"
Require-Path -Path $sevenZip -Label "7z.exe"
Require-Path -Path $addons -Label "Deadlock addons folder"

$selectedSpecs = if ($Variant -eq "all") {
    $pakSpecs
} else {
    @($pakSpecs | Where-Object { $_.Id -eq $Variant })
}

$archives = @()
foreach ($spec in $selectedSpecs) {
    Require-Path -Path $spec.SourceDir -Label "$($spec.DisplayName) source"
    Invoke-StandaloneCompiler -Spec $spec
    Stage-CompiledOutput -Spec $spec
    Pack-StandaloneVpk -Spec $spec
    $archives += Compress-StandaloneVpk -Spec $spec
}

if (-not $KeepStaging) {
    foreach ($spec in $selectedSpecs) {
        Remove-TreeUnderRoot -Path $spec.StageDir -RootPath $root
        if (Test-Path -LiteralPath $spec.VpkOut) {
            Remove-Item -LiteralPath $spec.VpkOut -Force
        }
    }
}

Get-Item -LiteralPath $archives | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
