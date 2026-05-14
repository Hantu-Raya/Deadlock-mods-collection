param(
  [string]$Wave,
  [switch]$List,
  [switch]$Clear,
  [switch]$InstallCfgOnly,
  [string]$GameInfoPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\gameinfo.gi",
  [string]$CfgDir = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\cfg"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WavesPath = Join-Path $Root "waves.json"
$CfgSource = Join-Path $Root "cfg"
$Backups = Join-Path $Root "backups"

if (!(Test-Path $WavesPath)) { throw "Missing waves.json at $WavesPath" }
if (!(Test-Path $Backups)) { New-Item -ItemType Directory -Path $Backups | Out-Null }

$waves = Get-Content -LiteralPath $WavesPath -Raw | ConvertFrom-Json

if ($List) {
  $waves | Sort-Object rank | ForEach-Object {
    "{0} rank={1} restart={2} convars={3} :: {4}" -f $_.id, $_.rank, $_.requiresRestart, @($_.convars).Count, $_.title
  }
  return
}

if (!(Test-Path $CfgDir)) { New-Item -ItemType Directory -Path $CfgDir | Out-Null }
Get-ChildItem -LiteralPath $CfgSource -Filter "*.cfg" | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $CfgDir $_.Name) -Force
}
Write-Host "Installed probe cfg files to $CfgDir"

if ($InstallCfgOnly) { return }

if ($Clear -and $Wave) { throw "Use either -Clear or -Wave, not both." }
if (!$Clear -and [string]::IsNullOrWhiteSpace($Wave)) { throw "Provide -Wave <id>, -Clear, -List, or -InstallCfgOnly." }

$waveObj = $null
if (!$Clear) {
  $waveObj = $waves | Where-Object { $_.id -eq $Wave } | Select-Object -First 1
  if (!$waveObj) { throw "Unknown wave '$Wave'. Run with -List." }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $Backups ("gameinfo.gi.$timestamp.bak")
Copy-Item -LiteralPath $GameInfoPath -Destination $backupPath -Force

$content = Get-Content -LiteralPath $GameInfoPath -Raw
$managedPattern = '(?ms)\r?\n\s*// >>> ETW WAVE BEGIN:.*?// <<< ETW WAVE END\r?\n?'
$content = [regex]::Replace($content, $managedPattern, "`r`n")

if (!$Clear -and @($waveObj.convars).Count -gt 0) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("        // >>> ETW WAVE BEGIN: $($waveObj.id)")
  $lines.Add("        // $($waveObj.title)")
  foreach ($c in $waveObj.convars) {
    $lines.Add(("        {0,-45} ""{1}"" // {2}" -f $c.name, $c.value, $waveObj.id))
  }
  $lines.Add("        // <<< ETW WAVE END")
  $block = "`r`n" + ($lines -join "`r`n") + "`r`n"

  $insertPattern = '(?m)^\s*}\s*\r?\n\s*Memory\s*\r?\n\s*{'
  $match = [regex]::Match($content, $insertPattern)
  if (!$match.Success) { throw "Could not find ConVars closing brace before Memory block." }
  $content = $content.Substring(0, $match.Index) + $block + $content.Substring($match.Index)
}

Set-Content -LiteralPath $GameInfoPath -Value $content -NoNewline -Encoding UTF8

if ($Clear) {
  Write-Host "Cleared managed ETW wave block."
} elseif (@($waveObj.convars).Count -eq 0) {
  Write-Host "Applied $($waveObj.id): no convars, managed block cleared."
} else {
  Write-Host "Applied $($waveObj.id) to $GameInfoPath"
  $waveObj.convars | ForEach-Object { Write-Host ("  {0} = {1}" -f $_.name, $_.value) }
}

Write-Host "Backup: $backupPath"
