param(
  [Parameter(Mandatory=$true)][string]$RunId,
  [string]$TraceZip = "G:\PerfViewData.etl.zip",
  [string]$TraceEventRoot = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection\fps\perfview_2026-05-13\traceevent_pkg"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutDir = Join-Path (Join-Path $Root "results") $RunId
if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($TraceZip, $OutDir, $true)
$etlEntry = Get-ChildItem -LiteralPath $OutDir -Filter "*.etl" -File | Sort-Object Length -Descending | Select-Object -First 1
if (!$etlEntry) { throw "No .etl file found after extracting $TraceZip to $OutDir" }
$etl = $etlEntry.FullName

$script:dirs = @(
  (Join-Path $TraceEventRoot "lib\netstandard2.0"),
  (Join-Path $TraceEventRoot "deps\Microsoft.Diagnostics.NETCore.Client.0.2.510501\lib\netstandard2.0"),
  (Join-Path $TraceEventRoot "deps\System.Collections.Immutable.9.0.8\lib\netstandard2.0"),
  (Join-Path $TraceEventRoot "deps\System.Reflection.Metadata.9.0.8\lib\netstandard2.0"),
  (Join-Path $TraceEventRoot "deps\System.Runtime.CompilerServices.Unsafe.6.1.2\lib\netstandard2.0"),
  (Join-Path $TraceEventRoot "deps\System.Text.Json.9.0.8\lib\netstandard2.0")
)

[AppDomain]::CurrentDomain.add_AssemblyResolve({
  param($sender, $args)
  $name = (New-Object System.Reflection.AssemblyName($args.Name)).Name + ".dll"
  foreach ($dir in $script:dirs) {
    $candidate = Join-Path $dir $name
    if (Test-Path $candidate) { return [System.Reflection.Assembly]::LoadFrom($candidate) }
  }
  return $null
})

foreach ($dir in $script:dirs) {
  if (!(Test-Path $dir)) { throw "Missing TraceEvent dependency dir: $dir" }
  Get-ChildItem $dir -Filter "*.dll" | ForEach-Object {
    try { [void][System.Reflection.Assembly]::LoadFrom($_.FullName) } catch {}
  }
}

function Percentile($arr, [double]$p) {
  if (!$arr -or $arr.Count -eq 0) { return $null }
  $s = @($arr | Sort-Object)
  $idx = [int][Math]::Floor(($s.Count - 1) * $p)
  return [double]$s[$idx]
}

function SummaryRow($name, $arr) {
  if (!$arr -or $arr.Count -eq 0) {
    return [pscustomobject]@{ name=$name; count=0; avgMs=$null; p50=$null; p90=$null; p95=$null; p99=$null; max=$null }
  }
  [pscustomobject]@{
    name = $name
    count = $arr.Count
    avgMs = [math]::Round(($arr | Measure-Object -Average).Average, 3)
    p50 = [math]::Round((Percentile $arr 0.50), 3)
    p90 = [math]::Round((Percentile $arr 0.90), 3)
    p95 = [math]::Round((Percentile $arr 0.95), 3)
    p99 = [math]::Round((Percentile $arr 0.99), 3)
    max = [math]::Round(($arr | Measure-Object -Maximum).Maximum, 3)
  }
}

function Inc($hash, $key) {
  if ([string]::IsNullOrEmpty($key)) { $key = "(unknown)" }
  if ($hash.ContainsKey($key)) { $hash[$key]++ } else { $hash[$key] = 1 }
}

$log = [Microsoft.Diagnostics.Tracing.Etlx.TraceLog]::OpenOrConvert($etl)
try {
  $durationMs = ($log.SessionEndTime - $log.SessionStartTime).TotalMilliseconds
  $targets = @($log.Processes | Where-Object {
    $_.Name -eq "launcher" -or $_.CommandLine -match "Deadlock|citadel|project"
  })
  $proc = $targets | Sort-Object CPUMSec -Descending | Select-Object -First 1
  if (!$proc) { throw "Could not find Deadlock launcher process in trace." }

  $frames = New-Object System.Collections.Generic.List[object]
  $simTicks = @{}
  $clientTicks = @{}
  $providerCounts = @{}
  $eventCounts = @{}
  $exclusiveModules = @{}
  $threadSamples = @{}

  foreach ($e in $proc.EventsInProcess) {
    Inc $providerCounts $e.ProviderName
    Inc $eventCounts "$($e.ProviderName)|$($e.EventName)"

    if ($e.EventName -eq "FrameAccumulateTime") {
      $ft = [double]($e.PayloadStringByName("FrameTime") -replace ",", "")
      $uft = [double]($e.PayloadStringByName("UnfilteredFrameTime") -replace ",", "")
      $st = [int]($e.PayloadStringByName("SimulationTicks") -replace ",", "")
      $ct = [int]($e.PayloadStringByName("ClientCommandTicks") -replace ",", "")
      $frames.Add([pscustomobject]@{ time=$e.TimeStampRelativeMSec; frame=$ft; unfiltered=$uft; sim=$st; cmd=$ct })
      Inc $simTicks ([string]$st)
      Inc $clientTicks ([string]$ct)
    }

    if ($e.ProviderName -eq "Windows Kernel" -and $e.EventName -eq "PerfInfo/Sample") {
      Inc $threadSamples ([string]$e.ThreadID)
      $cs = $log.GetCallStackForEvent($e)
      if ($null -ne $cs) { Inc $exclusiveModules $cs.CodeAddress.ModuleName }
    }
  }

  $windows = @(
    @{ name="all"; min=0; max=999999 },
    @{ name="after_5s"; min=5000; max=999999 },
    @{ name="5s_to_40s"; min=5000; max=40000 },
    @{ name="after_40s"; min=40000; max=999999 }
  )
  $frameWindows = foreach ($w in $windows) {
    $arr = @($frames | Where-Object { $_.time -ge $w.min -and $_.time -lt $w.max } | ForEach-Object { $_.frame })
    SummaryRow $w.name $arr
  }

  $topThreads = @($proc.Threads | Sort-Object CPUMSec -Descending | Select-Object -First 20 | ForEach-Object {
    [pscustomobject]@{ tid=$_.ThreadID; cpuMs=[math]::Round($_.CPUMSec, 1); name=$_.ThreadInfo }
  })

  $topModules = @($exclusiveModules.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 30 | ForEach-Object {
    [pscustomobject]@{ module=$_.Key; samples=$_.Value }
  })

  $summary = [pscustomobject]@{
    runId = $RunId
    traceZip = $TraceZip
    traceZipLastWrite = (Get-Item $TraceZip).LastWriteTime.ToString("s")
    start = $log.SessionStartTime.ToString("s")
    end = $log.SessionEndTime.ToString("s")
    durationMs = [math]::Round($durationMs, 2)
    eventsLost = $log.EventsLost
    processId = $proc.ProcessID
    processName = $proc.Name
    gameCpuMs = [math]::Round($proc.CPUMSec, 1)
    avgGameCpuCores = [math]::Round($proc.CPUMSec / $durationMs, 3)
    frameEvents = $frames.Count
    frameEventsPerSecond = [math]::Round(($frames.Count * 1000.0) / $durationMs, 2)
    frameWindows = $frameWindows
    simTicks = $simTicks
    clientCommandTicks = $clientTicks
    topThreads = $topThreads
    topModules = $topModules
  }

  $jsonPath = Join-Path $OutDir "summary.json"
  $mdPath = Join-Path $OutDir "summary.md"
  $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

  $clean = $frameWindows | Where-Object { $_.name -eq "5s_to_40s" } | Select-Object -First 1
  $md = @()
  $md += "# $RunId"
  $md += ""
  $md += "- Duration: $([math]::Round($durationMs / 1000, 2))s"
  $md += "- Events lost: $($log.EventsLost)"
  $md += "- Game CPU: $([math]::Round($proc.CPUMSec, 1))ms"
  $md += "- Avg game CPU cores: $([math]::Round($proc.CPUMSec / $durationMs, 3))"
  $md += "- Frame events/sec: $([math]::Round(($frames.Count * 1000.0) / $durationMs, 2))"
  $md += "- Clean 5s-40s P99: $($clean.p99)ms"
  $md += "- Clean 5s-40s max: $($clean.max)ms"
  $md += ""
  $md += "## Frame Windows"
  $md += ""
  $md += "| Window | Count | Avg | P95 | P99 | Max |"
  $md += "| --- | ---: | ---: | ---: | ---: | ---: |"
  foreach ($row in $frameWindows) {
    $md += "| $($row.name) | $($row.count) | $($row.avgMs) | $($row.p95) | $($row.p99) | $($row.max) |"
  }
  $md += ""
  $md += "## Top Modules"
  $md += ""
  $md += "| Module | Samples |"
  $md += "| --- | ---: |"
  foreach ($m in ($topModules | Select-Object -First 15)) {
    $md += "| $($m.module) | $($m.samples) |"
  }
  $md -join "`r`n" | Set-Content -LiteralPath $mdPath -Encoding UTF8

  Write-Host "Wrote $jsonPath"
  Write-Host "Wrote $mdPath"
  Write-Host ("Clean 5s-40s P99: {0}ms, max: {1}ms, avg CPU cores: {2}" -f $clean.p99, $clean.max, $summary.avgGameCpuCores)
}
finally {
  $log.Dispose()
}
