function Get-RepoToolPath {
    param(
        [Parameter(Mandatory=$true)][string[]]$Candidates,
        [Parameter(Mandatory=$true)][string]$ToolName
    )

    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }
    throw "$ToolName not found. Checked: $($Candidates -join ', ')"
}

function Assert-PathUnderRoot {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$RootPath
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $resolvedRoot = [System.IO.Path]::GetFullPath($RootPath).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    $rootPrefix = $resolvedRoot + [System.IO.Path]::DirectorySeparatorChar
    $altRootPrefix = $resolvedRoot + [System.IO.Path]::AltDirectorySeparatorChar

    if ($resolvedPath.Equals($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        (-not $resolvedPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
         -not $resolvedPath.StartsWith($altRootPrefix, [System.StringComparison]::OrdinalIgnoreCase))) {
        throw "Refusing to operate outside root. Path=$resolvedPath Root=$resolvedRoot"
    }
}

function Remove-TreeUnderRoot {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$RootPath,
        [string]$ExpectedLeaf = ""
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }
    Assert-PathUnderRoot -Path $Path -RootPath $RootPath
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    if ($ExpectedLeaf -and (Split-Path -Leaf $resolvedPath) -ne $ExpectedLeaf) {
        throw "Refusing to remove unexpected path: $resolvedPath"
    }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}


function Invoke-Source2Compiler {
    param(
        [Parameter(Mandatory=$true)][string]$CompilerPath,
        [Parameter(Mandatory=$true)][string]$SourceDir,
        [Parameter(Mandatory=$true)][string[]]$RequiredOutputs,
        [int]$TimeoutSeconds = 120,
        [switch]$HiddenWindow
    )

    $startProcessArgs = @{
        FilePath = $CompilerPath
        ArgumentList = "`"$SourceDir`""
        PassThru = $true
    }
    if ($HiddenWindow) { $startProcessArgs.WindowStyle = 'Hidden' }
    $proc = Start-Process @startProcessArgs
    $compileDeadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
        Start-Sleep -Milliseconds 500
        $allRequiredOutputsExist = $true
        foreach ($requiredOutput in $RequiredOutputs) {
            if (-not (Test-Path -LiteralPath $requiredOutput)) {
                $allRequiredOutputsExist = $false
                break
            }
        }
        if ($allRequiredOutputsExist) {
            Start-Sleep -Seconds 2
            if (-not $proc.HasExited) {
                Write-Host "[WARN] Compiler produced output but did not exit; stopping wrapper." -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                $proc.WaitForExit()
            }
            break
        }
    }

    if (-not $proc.HasExited) {
        Write-Host "[WARN] Compiler timed out; stopping wrapper." -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $proc.WaitForExit()
    }

    $missingOutputs = @($RequiredOutputs | Where-Object { -not (Test-Path -LiteralPath $_) })
    if ($missingOutputs.Count -gt 0) {
        throw "Compiler did not create required output: $($missingOutputs -join ', ')"
    }
    if ($proc.ExitCode -ne 0) {
        Write-Host "[WARN] Compiler exited $($proc.ExitCode) but output exists; continuing." -ForegroundColor Yellow
    }
}

function Invoke-VpkPack {
    param(
        [Parameter(Mandatory=$true)][string]$VpkEditCli,
        [Parameter(Mandatory=$true)][string]$InputDir,
        [Parameter(Mandatory=$true)][string]$OutputPath
    )

    $packOutput = & $VpkEditCli $InputDir -o $OutputPath -s --no-progress 2>&1
    $exitCode = $LASTEXITCODE
    if ($packOutput) {
        $packOutput | ForEach-Object { Write-Host $_ }
    }
    if ($exitCode -ne 0) {
        throw "vpkeditcli failed with exit code $exitCode"
    }
    if (-not (Test-Path -LiteralPath $OutputPath)) {
        throw "VPK not created: $OutputPath"
    }
}

function Get-PackedVpkTree {
    param(
        [Parameter(Mandatory=$true)][string]$VpkEditCli,
        [Parameter(Mandatory=$true)][string]$VpkPath,
        [string]$Source2ViewerPath = ""
    )

    if ($Source2ViewerPath -and (Test-Path -LiteralPath $Source2ViewerPath)) {
        $tree = & $Source2ViewerPath -i $VpkPath --vpk_list
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "Source2Viewer failed to inspect VPK with exit code $exitCode" }
        return [string[]]$tree
    }

    $tree = & $VpkEditCli $VpkPath --file-tree --no-progress
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "vpkeditcli failed to inspect VPK with exit code $exitCode" }
    return [string[]]$tree
}

function Test-PackedAsset {
    param(
        [Parameter(Mandatory=$true)][string[]]$Tree,
        [Parameter(Mandatory=$true)][string]$Asset
    )

    $leaf = Split-Path -Leaf $Asset
    return (($Tree | Select-String -SimpleMatch $Asset -Quiet) -or
        ($leaf -and ($Tree | Select-String -SimpleMatch $leaf -Quiet)))
}

function Assert-PackedVpkAssets {
    param(
        [Parameter(Mandatory=$true)][string[]]$Tree,
        [string[]]$Required = @(),
        [string[]]$Forbidden = @(),
        [string]$Label = "VPK"
    )

    foreach ($asset in $Required) {
        if (-not (Test-PackedAsset -Tree $Tree -Asset $asset)) {
            throw "$Label missing required asset: $asset"
        }
    }
    foreach ($asset in $Forbidden) {
        if (Test-PackedAsset -Tree $Tree -Asset $asset) {
            throw "$Label contains forbidden asset: $asset"
        }
    }
}

function Compress-Vpk7Zip {
    param(
        [Parameter(Mandatory=$true)][string]$SevenZip,
        [Parameter(Mandatory=$true)][string]$InputPath,
        [Parameter(Mandatory=$true)][string]$ArchivePath,
        [string]$ExpectedLeaf = ""
    )

    & $SevenZip a -t7z $ArchivePath $InputPath | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ArchivePath)) {
        throw "7z failed for $ArchivePath"
    }
    if ($ExpectedLeaf) {
        $listing = & $SevenZip l $ArchivePath
        if ($LASTEXITCODE -ne 0) {
            throw "7z failed to list $ArchivePath"
        }
        if (-not ($listing | Select-String -SimpleMatch $ExpectedLeaf -Quiet)) {
            throw "7z archive missing expected file: $ExpectedLeaf"
        }
    }
}
