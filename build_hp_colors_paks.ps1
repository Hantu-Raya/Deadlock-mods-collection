param(
    [ValidateSet("all", "full", "minimal")]
    [string]$Variant = "all",

    [string]$PakName = "pak97_dir.vpk",
    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",
    [switch]$KeepStaging
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$sevenZip = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
if (-not $sevenZip) {
    $sevenZip = "C:\Program Files\7-Zip\7z.exe"
}
$dateTag = Get-Date -Format 'MM_dd'

$buildSpecs = @(
    @{
        Id = "full"
        DisplayName = "HP Colors full menu"
        BuildScript = Join-Path $root "build_hp_colors.ps1"
        BuildArgs = @()
        VpkOut = Join-Path $root $PakName
        ArchiveName = "hp_colors_full_$dateTag.7z"
        StageDir = Join-Path $root "_hp_colors_archive_full"
    }
    @{
        Id = "minimal"
        DisplayName = "HP Colors minimal runtime"
        BuildScript = Join-Path $root "build_hp_colors_minimal.ps1"
        BuildArgs = @("-PakName", $PakName)
        VpkOut = Join-Path $root $PakName
        ArchiveName = "hp_colors_minimal_runtime_$dateTag.7z"
        StageDir = Join-Path $root "_hp_colors_archive_minimal"
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

function Invoke-HpBuild {
    param([Parameter(Mandatory = $true)][hashtable]$Spec)

    Write-Host "[build] $($Spec.DisplayName)" -ForegroundColor Cyan
    $buildArgs = @($Spec.BuildArgs)
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Spec.BuildScript @buildArgs
    if ($LASTEXITCODE -ne 0) {
        throw "$($Spec.DisplayName) build failed with exit code $LASTEXITCODE"
    }
    Require-Path -Path $Spec.VpkOut -Label "$($Spec.Id) VPK"
}

function Compress-HpVpk {
    param([Parameter(Mandatory = $true)][hashtable]$Spec)

    $archivePath = Join-Path $AddonsPath $Spec.ArchiveName
    Remove-TreeUnderRoot -Path $Spec.StageDir -RootPath $root
    New-Item -ItemType Directory -Path $Spec.StageDir -Force | Out-Null
    Copy-Item -LiteralPath $Spec.VpkOut -Destination (Join-Path $Spec.StageDir $PakName) -Force

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    Write-Host "[archive] $($Spec.ArchiveName)" -ForegroundColor Cyan
    Push-Location -LiteralPath $Spec.StageDir
    try {
        & $sevenZip a -t7z $archivePath ".\*" -mx=9 -bso0 -bsp0
        if ($LASTEXITCODE -ne 0) {
            throw "7z failed for $($Spec.Id) with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    Require-Path -Path $archivePath -Label $Spec.ArchiveName
    $listing = & $sevenZip l $archivePath -ba
    if ($LASTEXITCODE -ne 0) {
        throw "7z could not list $($Spec.ArchiveName)"
    }
    if (-not (($listing | Select-String -SimpleMatch $PakName -Quiet))) {
        throw "$($Spec.ArchiveName) does not contain $PakName"
    }

    if (-not $KeepStaging) {
        Remove-TreeUnderRoot -Path $Spec.StageDir -RootPath $root
    }

    return $archivePath
}

Require-Path -Path $sevenZip -Label "7z.exe"
Require-Path -Path $AddonsPath -Label "Deadlock addons folder"

$selectedSpecs = if ($Variant -eq "all") {
    $buildSpecs
} else {
    @($buildSpecs | Where-Object { $_.Id -eq $Variant })
}

$archives = @()
foreach ($spec in $selectedSpecs) {
    Require-Path -Path $spec.BuildScript -Label "$($spec.DisplayName) build script"
    Invoke-HpBuild -Spec $spec
    $archives += Compress-HpVpk -Spec $spec
}

Get-Item -LiteralPath $archives | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
