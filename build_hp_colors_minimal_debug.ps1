param(
    [string]$BuilderPresetVpkPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk",
    [string]$PakName = "pak97_dir.vpk"
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $root "hp_colors_minimal"
$stage = Join-Path $root "_tmp_hp_colors_minimal_debug_src"
$compiled = Join-Path $root "_tmp_hp_colors_minimal_debug_compiled"
$closure = Join-Path $root "_tmp_hp_colors_minimal_debug_closure"
$closureCompiled = Join-Path $root "_tmp_hp_colors_minimal_debug_closure_compiled"
$buildScript = Join-Path $root "build_hp_colors_minimal.ps1"

function Get-FullPathSafe {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-UnderRepoRoot {
    param([Parameter(Mandatory = $true)][string]$Path)
    $fullRoot = Get-FullPathSafe $root
    $fullPath = Get-FullPathSafe $Path
    if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to touch path outside repo root: $fullPath"
    }
}

function Remove-RepoPathIfExists {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$Recurse
    )
    Assert-UnderRepoRoot $Path
    if (Test-Path -LiteralPath $Path) {
        if ($Recurse) {
            Remove-Item -LiteralPath $Path -Recurse -Force
        } else {
            Remove-Item -LiteralPath $Path -Force
        }
    }
}

function Add-DebugRuntime {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Marker,
        [Parameter(Mandatory = $true)][string]$Snippet
    )
    if ($Text.Contains($Snippet.Trim())) { return $Text }
    $idx = $Text.IndexOf($Marker, [System.StringComparison]::Ordinal)
    if ($idx -lt 0) { throw "Instrumentation marker not found: $Marker" }
    $insertAt = $idx + $Marker.Length
    return $Text.Insert($insertAt, "`n" + $Snippet)
}

function Add-DebugCall {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$FunctionName,
        [string]$Label = ""
    )
    $needle = "  function $FunctionName("
    $idx = $Text.IndexOf($needle, [System.StringComparison]::Ordinal)
    if ($idx -lt 0) { throw "Function not found for debug call: $FunctionName" }
    $braceIdx = $Text.IndexOf("{", $idx, [System.StringComparison]::Ordinal)
    if ($braceIdx -lt 0) { throw "Function opening brace not found: $FunctionName" }
    $debugLabel = if ($Label) { $Label } else { $FunctionName }
    $call = "`n    dbgCall(`"$debugLabel`");"
    $nextSliceEnd = [Math]::Min($Text.Length, $braceIdx + 120)
    if ($Text.Substring($braceIdx, $nextSliceEnd - $braceIdx).Contains($call.Trim())) { return $Text }
    return $Text.Insert($braceIdx + 1, $call)
}

function Instrument-HealthbarRuntime {
    param([Parameter(Mandatory = $true)][string]$Path)
    $text = Get-Content -LiteralPath $Path -Raw
    $snippet = @'
  var DEBUG_CALLS_ENABLED = true;
  var DEBUG_CALLS_PREFIX = "[HPDBG_MIN_RUNTIME]";
  var DEBUG_CALLS_INSTANCE = 0;
  var debugCallCounts = {};
  var debugCallLastCounts = {};
  var debugCallLastFlush = 0;

  function dbgMakeInstanceId() {
    try {
      var store = getSharedStore();
      if (store) {
        var next = (Number(store["__hpColorsMinimalDebugNextId"]) || 0) + 1;
        store["__hpColorsMinimalDebugNextId"] = next;
        return next;
      }
    } catch (eStore) {}
    return Math.floor(Math.random() * 1000000);
  }

  function dbgCall(name) {
    if (!DEBUG_CALLS_ENABLED) return;
    debugCallCounts[name] = (debugCallCounts[name] || 0) + 1;
  }

  function dbgCopyCallCounts() {
    var copy = {};
    for (var key in debugCallCounts) {
      if (Object.prototype.hasOwnProperty.call(debugCallCounts, key)) {
        copy[key] = debugCallCounts[key];
      }
    }
    return copy;
  }

  function dbgBuildCallDelta() {
    var delta = {};
    var totalParts = [];
    var deltaParts = [];
    for (var key in debugCallCounts) {
      if (Object.prototype.hasOwnProperty.call(debugCallCounts, key)) {
        var value = debugCallCounts[key] || 0;
        var previous = debugCallLastCounts[key] || 0;
        var change = value - previous;
        debugCallLastCounts[key] = value;
        totalParts.push(key + "=" + value);
        if (change) {
          delta[key] = change;
          deltaParts.push(key + "+" + change);
        }
      }
    }
    return {
      "delta": delta,
      "deltaText": deltaParts.join(" "),
      "totalText": totalParts.join(" ")
    };
  }

  function dbgFlush(reason) {
    if (!DEBUG_CALLS_ENABLED) return;
    var now = _ts();
    if (debugCallLastFlush && now - debugCallLastFlush < 1000) return;
    debugCallLastFlush = now;
    var summary = dbgBuildCallDelta();
    if (!summary.deltaText && reason === "tick") return;
    var line = DEBUG_CALLS_PREFIX + " id=" + DEBUG_CALLS_INSTANCE + " " + String(reason || "flush") + " delta " + summary.deltaText + " total " + summary.totalText;
    try {
      if (typeof $ !== "undefined" && $ && $.Msg) $.Msg(line);
    } catch (eMsg) {}
    try {
      var store = getSharedStore();
      if (store) {
        store["__hpColorsMinimalDebugCalls"] = {
          "id": DEBUG_CALLS_INSTANCE,
          "reason": String(reason || "flush"),
          "at": now,
          "delta": summary.delta,
          "counts": dbgCopyCallCounts()
        };
      }
    } catch (eStore) {}
  }

  function dbgTick() {
    if (!DEBUG_CALLS_INSTANCE) DEBUG_CALLS_INSTANCE = dbgMakeInstanceId();
    dbgFlush("tick");
    try { $.Schedule(2.0, dbgTick); } catch (eSchedule) {}
  }
'@
    $text = Add-DebugRuntime -Text $text -Marker "  var SAME_RAW_WAKE_WATCHDOG_MS = 5000;" -Snippet $snippet
    foreach ($name in @(
        "syncEnemyPulse",
        "syncAllyPulse",
        "requestLoopKick",
        "wakeForPresetReplay",
        "scheduleLoop",
        "tryApplySharedSnapshot",
        "applyPresetEventPayload",
        "refreshRedBarFromParentChildren",
        "readTeamBitsFrom",
        "getRedBarCandidateScore",
        "hasEnemyBarStyleDrift",
        "hasEnemyStyleDrift",
        "resolveRedBar",
        "refreshCurrentRedBarRef",
        "scan",
        "scanAllyFlags",
        "updateEnemyCounter",
        "paintEnemyHealthState",
        "gL",
        "lL",
        "aL"
    )) {
        $text = Add-DebugCall -Text $text -FunctionName $name
    }
    $text = $text.Replace("  function wakeForPresetReplay(reason) {`n    dbgCall(`"wakeForPresetReplay`");", "  function wakeForPresetReplay(reason) {`n    dbgCall(`"wakeForPresetReplay`");`n    dbgCall(`"wakeForPresetReplay:`" + String(reason || `"unknown`"));")
    $text = $text.Replace("    var wakeReason = presetReplayWakeReason(now);`n", "    var wakeReason = presetReplayWakeReason(now);`n    dbgCall(`"presetReplayWakeReason:`" + String(wakeReason || `"none`"));`n")
    $text = $text.Replace("  loadCfgDefaults();`n", "  loadCfgDefaults();`n  dbgTick();`n")
    Set-Content -LiteralPath $Path -Value $text -NoNewline
}

function Instrument-PublisherRuntime {
    param([Parameter(Mandatory = $true)][string]$Path)
    $text = Get-Content -LiteralPath $Path -Raw
    $snippet = @'
  var DEBUG_CALLS_ENABLED = true;
  var DEBUG_CALLS_PREFIX = "[HPDBG_MIN_PUBLISHER]";
  var DEBUG_CALLS_INSTANCE = 0;
  var debugCallCounts = {};
  var debugCallLastCounts = {};
  var debugCallLastFlush = 0;

  function dbgMakeInstanceId() {
    try {
      var store = getSharedStore();
      if (store) {
        var next = (Number(store["__hpColorsMinimalPublisherDebugNextId"]) || 0) + 1;
        store["__hpColorsMinimalPublisherDebugNextId"] = next;
        return next;
      }
    } catch (eStore) {}
    return Math.floor(Math.random() * 1000000);
  }

  function dbgCall(name) {
    if (!DEBUG_CALLS_ENABLED) return;
    debugCallCounts[name] = (debugCallCounts[name] || 0) + 1;
  }

  function dbgCopyCallCounts() {
    var copy = {};
    for (var key in debugCallCounts) {
      if (Object.prototype.hasOwnProperty.call(debugCallCounts, key)) {
        copy[key] = debugCallCounts[key];
      }
    }
    return copy;
  }

  function dbgBuildCallDelta() {
    var delta = {};
    var totalParts = [];
    var deltaParts = [];
    for (var key in debugCallCounts) {
      if (Object.prototype.hasOwnProperty.call(debugCallCounts, key)) {
        var value = debugCallCounts[key] || 0;
        var previous = debugCallLastCounts[key] || 0;
        var change = value - previous;
        debugCallLastCounts[key] = value;
        totalParts.push(key + "=" + value);
        if (change) {
          delta[key] = change;
          deltaParts.push(key + "+" + change);
        }
      }
    }
    return {
      "delta": delta,
      "deltaText": deltaParts.join(" "),
      "totalText": totalParts.join(" ")
    };
  }

  function dbgFlush(reason) {
    if (!DEBUG_CALLS_ENABLED) return;
    var now = nowMs();
    if (debugCallLastFlush && now - debugCallLastFlush < 1000) return;
    debugCallLastFlush = now;
    var summary = dbgBuildCallDelta();
    if (!summary.deltaText && reason === "tick") return;
    var line = DEBUG_CALLS_PREFIX + " id=" + DEBUG_CALLS_INSTANCE + " " + String(reason || "flush") + " delta " + summary.deltaText + " total " + summary.totalText;
    try {
      if (typeof $ !== "undefined" && $ && $.Msg) $.Msg(line);
    } catch (eMsg) {}
    try {
      var store = getSharedStore();
      if (store) {
        store["__hpColorsMinimalPublisherDebugCalls"] = {
          "id": DEBUG_CALLS_INSTANCE,
          "reason": String(reason || "flush"),
          "at": now,
          "delta": summary.delta,
          "counts": dbgCopyCallCounts()
        };
      }
    } catch (eStore) {}
  }

  function dbgTick() {
    if (!DEBUG_CALLS_INSTANCE) DEBUG_CALLS_INSTANCE = dbgMakeInstanceId();
    dbgFlush("tick");
    try { $.Schedule(2.0, dbgTick); } catch (eSchedule) {}
  }
'@
    $text = Add-DebugRuntime -Text $text -Marker '  var DEBUG_PREFIX = "[HP_COLORS_MINIMAL_PRESET]";' -Snippet $snippet
    foreach ($name in @(
        "readPresetEntries",
        "selectPresetForHero",
        "publishPreset",
        "replayCachedSnapshot",
        "handleBridgeEvent",
        "runBoundedHeroPresetProbe"
    )) {
        $text = Add-DebugCall -Text $text -FunctionName $name
    }
    $text = $text.Replace("  buildHeroTables();`n", "  buildHeroTables();`n  dbgTick();`n")
    Set-Content -LiteralPath $Path -Value $text -NoNewline
}

Remove-RepoPathIfExists $stage -Recurse
Remove-RepoPathIfExists $compiled -Recurse
Remove-RepoPathIfExists $closure -Recurse
Remove-RepoPathIfExists $closureCompiled -Recurse

Copy-Item -LiteralPath $source -Destination $stage -Recurse -Force

$healthbar = Join-Path $stage "panorama\scripts\healthbar_logic.js"
$publisher = Join-Path $stage "panorama\scripts\anita_ui_core.js"
Instrument-HealthbarRuntime -Path $healthbar
Instrument-PublisherRuntime -Path $publisher

Write-Host "`n[debug] Instrumented minimal runtime call counters:" -ForegroundColor Cyan
Write-Host "  Runtime logs:   [HPDBG_MIN_RUNTIME]" -ForegroundColor Yellow
Write-Host "  Publisher logs: [HPDBG_MIN_PUBLISHER]" -ForegroundColor Yellow
Write-Host "  Shared store:   __hpColorsMinimalDebugCalls / __hpColorsMinimalPublisherDebugCalls" -ForegroundColor Yellow

& powershell -NoProfile -ExecutionPolicy Bypass -File $buildScript `
    -BuilderPresetVpkPath $BuilderPresetVpkPath `
    -PakName $PakName `
    -SourceDir $stage `
    -CompiledDir $compiled `
    -ClosureSourceDir $closure `
    -ClosureCompiledDir $closureCompiled `
    -SkipSourceValidation
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "`n[debug] Minimal debugger build ready." -ForegroundColor Green
Write-Host "  VPK:        $(Join-Path $root $PakName)" -ForegroundColor Green
Write-Host "  Deployed:   $(Join-Path 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons' $PakName)" -ForegroundColor Green
Write-Host "  Stage kept: $stage" -ForegroundColor DarkGray
