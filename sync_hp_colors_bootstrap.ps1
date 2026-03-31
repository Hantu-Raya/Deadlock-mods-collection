param(
  [string]$CfgDir = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\cfg"
)

$ErrorActionPreference = "Stop"

$machineConvarsPath = Join-Path $CfgDir "machine_convars.vcfg"
$anitaCfgPath = Join-Path $CfgDir "anitaui_settings.cfg"
$title = "HP Colors"
$tokenPrefix = "[ANITA-v1-hp_colors]:"
$blockStart = "// BEGIN HP Colors"
$blockEnd = "// END HP Colors"

function Decode-Base64Url {
  param([Parameter(Mandatory = $true)][string]$InputText)

  $normalized = $InputText.Replace('-', '+').Replace('_', '/')
  switch ($normalized.Length % 4) {
    2 { $normalized += "==" }
    3 { $normalized += "=" }
  }

  $bytes = [Convert]::FromBase64String($normalized)
  return [System.Text.Encoding]::UTF8.GetString($bytes)
}

if (-not (Test-Path $machineConvarsPath)) {
  throw "machine_convars.vcfg not found: $machineConvarsPath"
}

$machineLine = (Select-String -Path $machineConvarsPath -Pattern 'deadlock_hero_debuts_seen' | Select-Object -First 1).Line
if (-not $machineLine) {
  throw "deadlock_hero_debuts_seen not found in $machineConvarsPath"
}

$tokenMatch = [regex]::Match($machineLine, '\[ANITA-v1-hp_colors\]:(?<payload>[A-Za-z0-9_-]+)')
if (-not $tokenMatch.Success) {
  throw "HP Colors token not found in deadlock_hero_debuts_seen"
}

$rawJson = Decode-Base64Url -InputText $tokenMatch.Groups["payload"].Value
$payload = $rawJson | ConvertFrom-Json
if (-not $payload -or -not $payload.values) {
  throw "Decoded token did not contain a values object"
}

$existingLines = @()
if (Test-Path $anitaCfgPath) {
  $existingLines = Get-Content -Path $anitaCfgPath
}

$filteredLines = New-Object System.Collections.Generic.List[string]
$skipBlock = $false
foreach ($line in $existingLines) {
  if ($line -eq $blockStart) {
    $skipBlock = $true
    continue
  }
  if ($line -eq $blockEnd) {
    $skipBlock = $false
    continue
  }
  if ($skipBlock) { continue }
  if ($line -match 'mod_title\\":\\"HP Colors\\"') { continue }
  $filteredLines.Add($line)
}

if ($filteredLines.Count -eq 0) {
  $filteredLines.Add('echo "ANITA_CFG_LOADED"')
  $filteredLines.Add('// Generated/maintained manually for sandboxed Panorama runtime.')
  $filteredLines.Add('// Use one line per setting update payload.')
  $filteredLines.Add('// Format:')
  $filteredLines.Add('// panorama_dispatch_event ClientUI_FireOutput "{\"magic_word\":\"ANITA_BOOTSTRAP_UPDATE\",\"mod_title\":\"<Mod Title>\",\"setting_id\":\"<setting_id>\",\"value\":\"<value>\"}"')
}

$blockLines = New-Object System.Collections.Generic.List[string]
$blockLines.Add($blockStart)

foreach ($property in $payload.values.PSObject.Properties) {
  $valueText = [string]$property.Value
  $eventPayload = @{
    magic_word = 'ANITA_BOOTSTRAP_UPDATE'
    mod_title = $title
    setting_id = $property.Name
    value = $valueText
  } | ConvertTo-Json -Compress

  $escapedPayload = $eventPayload.Replace('"', '\"')
  $blockLines.Add("panorama_dispatch_event ClientUI_FireOutput ""$escapedPayload""")
}

$blockLines.Add($blockEnd)

$outputLines = New-Object System.Collections.Generic.List[string]
foreach ($line in $filteredLines) {
  $outputLines.Add($line)
}
if ($outputLines.Count -gt 0 -and $outputLines[$outputLines.Count - 1] -ne "") {
  $outputLines.Add("")
}
foreach ($line in $blockLines) {
  $outputLines.Add($line)
}

Set-Content -Path $anitaCfgPath -Value $outputLines -Encoding ASCII
Get-Item $anitaCfgPath | Select-Object FullName,Length,LastWriteTime
