param(
  [string]$RepoRoot = "F:\Users\Shiv\Desktop\Deadlock-mods-collection",
  [string]$ModName = "passive_items_mod",
  [int]$PakNumber = 99,
  [string]$Destination = "",
  [string]$VpkCliPath = "",
  [switch]$NoPrompt,
  [switch]$BackupExisting
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$defaultDeployDir = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons"
$modDir = Join-Path $RepoRoot $ModName
$applyBat = Join-Path $modDir "Apply.bat"
$sr2CompilerExe = Join-Path $RepoRoot "sr2compiler\New folder.exe"
$compiledDir = Join-Path $RepoRoot "${ModName}_compiled"
$vpkCli = if ([string]::IsNullOrWhiteSpace($VpkCliPath)) {
  Join-Path $RepoRoot "passive_items_mod\compiler\vpkeditcli.exe"
} else {
  [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($VpkCliPath))
}
$vpkFileName = "pak{0}_dir.vpk" -f $PakNumber
$vpkOutput = Join-Path $RepoRoot $vpkFileName
$configPath = Join-Path $PSScriptRoot "deploy-config.json"

function Get-RememberedDestination {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return ""
  }

  try {
    $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($config.targets) {
      foreach ($prop in $config.targets.PSObject.Properties) {
        if ($prop.Name -eq $Key -and $prop.Value) {
          return [string]$prop.Value
        }
      }
    }
    if ($config.lastDestination) {
      return [string]$config.lastDestination
    }
  } catch {
    Write-Warning "Could not parse deploy-config.json. Ignoring saved destination."
  }

  return ""
}

function Save-RememberedDestination {
  param(
    [string]$Path,
    [string]$Value,
    [string]$Mod,
    [int]$Pak,
    [string]$Key
  )

  $targets = @{}
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    try {
      $existing = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
      if ($existing.targets) {
        foreach ($prop in $existing.targets.PSObject.Properties) {
          $targets[$prop.Name] = [string]$prop.Value
        }
      }
    } catch {
      Write-Warning "Could not parse existing deploy-config.json. Rewriting."
    }
  }

  $targets[$Key] = $Value

  $payload = @{
    lastDestination = $Value
    lastMod = $Mod
    lastPak = $Pak
    updatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    targets = $targets
  } | ConvertTo-Json -Depth 6

  Set-Content -LiteralPath $Path -Value $payload -Encoding Ascii
}

function Resolve-DeployTarget {
  param(
    [string]$RawDestination,
    [string]$VpkFileName
  )

  $expanded = [Environment]::ExpandEnvironmentVariables($RawDestination.Trim())

  if ($expanded.ToLowerInvariant().EndsWith(".vpk")) {
    return [System.IO.Path]::GetFullPath($expanded)
  }

  $resolvedDirectory = [System.IO.Path]::GetFullPath($expanded)
  return Join-Path $resolvedDirectory $VpkFileName
}

function Invoke-Compile {
  param(
    [string]$ModPath,
    [string]$ApplyBatPath,
    [string]$Sr2CompilerPath
  )

  if (Test-Path -LiteralPath $ApplyBatPath -PathType Leaf) {
    & $ApplyBatPath
    if ($LASTEXITCODE -ne 0) {
      throw "Compile via Apply.bat failed with exit code $LASTEXITCODE."
    }
    return
  }

  if (-not (Test-Path -LiteralPath $Sr2CompilerPath -PathType Leaf)) {
    throw "No compile method found. Missing Apply.bat and sr2 compiler: $Sr2CompilerPath"
  }

  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $compileOut = & $Sr2CompilerPath $ModPath 2>&1
  } finally {
    $ErrorActionPreference = $oldEap
  }

  $compileLines = @($compileOut | ForEach-Object { $_.ToString() })
  $compileLines | ForEach-Object { Write-Host $_ }

  if ($LASTEXITCODE -eq 0) {
    return
  }

  $outText = ($compileLines -join "`n")
  if ($outText -match "OK:\s+\d+\s+compiled,\s+0\s+failed") {
    Write-Warning "Compiler wrapper exited non-zero, but compile succeeded."
    return
  }

  throw "Compile failed with exit code $LASTEXITCODE."
}

if ($PakNumber -lt 0 -or $PakNumber -gt 999) {
  throw "PakNumber must be between 0 and 999."
}

if (-not (Test-Path -LiteralPath $modDir -PathType Container)) {
  throw "Mod folder not found: $modDir"
}

if (-not (Test-Path -LiteralPath $vpkCli -PathType Leaf)) {
  throw "vpkeditcli.exe not found: $vpkCli"
}

Write-Host "[1/4] Compile mod"
Invoke-Compile -ModPath $modDir -ApplyBatPath $applyBat -Sr2CompilerPath $sr2CompilerExe

if (-not (Test-Path -LiteralPath $compiledDir -PathType Container)) {
  throw "Compiled directory not found: $compiledDir"
}

Write-Host "[2/4] Pack VPK"
if (Test-Path -LiteralPath $vpkOutput -PathType Leaf) {
  Remove-Item -LiteralPath $vpkOutput -Force
}

& $vpkCli $compiledDir -o $vpkOutput -s
if ($LASTEXITCODE -ne 0) {
  throw "VPK packing failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $vpkOutput -PathType Leaf)) {
  throw "Expected VPK was not created: $vpkOutput"
}

$rememberKey = "$ModName|$PakNumber"
$rememberedDestination = Get-RememberedDestination -Path $configPath -Key $rememberKey
$chosenDestination = $Destination

if ([string]::IsNullOrWhiteSpace($chosenDestination)) {
  $fallback = if ([string]::IsNullOrWhiteSpace($rememberedDestination)) { $defaultDeployDir } else { $rememberedDestination }
  if ($NoPrompt) {
    $chosenDestination = $fallback
  } else {
    $inputPrompt = "Override/save destination (press Enter to use '$fallback')"
    $typed = Read-Host $inputPrompt
    $chosenDestination = if ([string]::IsNullOrWhiteSpace($typed)) { $fallback } else { $typed.Trim() }
  }
}

$targetPath = Resolve-DeployTarget -RawDestination $chosenDestination -VpkFileName $vpkFileName
$targetDir = Split-Path -Parent $targetPath
New-Item -Path $targetDir -ItemType Directory -Force | Out-Null

Write-Host "[3/4] Deploy VPK"
if ($BackupExisting -and (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $backupPath = "$targetPath.bak_$stamp"
  Copy-Item -LiteralPath $targetPath -Destination $backupPath -Force
  Write-Host "Backup: $backupPath"
}
Copy-Item -LiteralPath $vpkOutput -Destination $targetPath -Force

Save-RememberedDestination -Path $configPath -Value $chosenDestination -Mod $ModName -Pak $PakNumber -Key $rememberKey

Write-Host "[4/4] Done"
Write-Host "Mod: $ModName"
Write-Host "Pak: $PakNumber"
Write-Host "Packed VPK: $vpkOutput"
Write-Host "Deployed VPK: $targetPath"
Write-Host "Remembered destination: $chosenDestination"
