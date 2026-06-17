$ErrorActionPreference = 'Stop'

$root        = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc      = "$root\hp_colors"
$modCompiled = "$root\hp_colors_compiled"
$terserSrc   = "$root\hp_colors_terser"
$terserCompiled = "$root\hp_colors_terser_compiled"
$compiler    = "$root\sr2compiler\New folder.exe"
$vpkeditcliCandidates = @(
    "$root\passive_items_mod\compiler\vpkeditcli.exe",
    "$root\vpk cli\vpkeditcli.exe",
    "$root\passive_items_mod_release\compiler\vpkeditcli.exe"
)
$vpkeditcli = $vpkeditcliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$vpkOut      = "$root\pak97_dir.vpk"
$vpkDest     = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk"

# Clean rebuild: remove stale compiled output and previous pack artifact.
if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
if (Test-Path $terserSrc)   { Remove-Item -Recurse -Force $terserSrc }
if (Test-Path $terserCompiled) { Remove-Item -Recurse -Force $terserCompiled }
if (Test-Path $vpkOut)      { Remove-Item -Force $vpkOut }

# ## Step 0: Schema drift audit ################################################
Write-Host "`n[0/4] Running schema drift audit..." -ForegroundColor Cyan
$auditScript = "$modSrc\scripts\validate-schema.js"
if (Test-Path $auditScript) {
    & node $auditScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Schema audit failed # fix drift before building." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Schema audit passed." -ForegroundColor Green
} else {
    Write-Host "  [WARN] Audit script not found, skipping." -ForegroundColor Yellow
}

# ## Step 1: Prepare Closure ADVANCED build source ##############################
function New-HpColorsClosureAdvancedExterns {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageRoot
    )

    $externPath = Join-Path $StageRoot "hp_colors_closure_advanced.externs.js"
    $externProperties = @(
        "AddClass",
        "AnitaUI",
        "BHasClass",
        "Children",
        "CreatePanel",
        "CustomUIConfig",
        "DeleteAsync",
        "DispatchEvent",
        "FindChildTraverse",
        "FindChildrenWithClassTraverse",
        "GetAttributeString",
        "GetChild",
        "GetChildCount",
        "GetContextPanel",
        "GetParent",
        "GetVersion",
        "IsReady",
        "IsValid",
        "OpenExternalBrowserURL",
        "OpenURL",
        "Register",
        "RegisterEventHandler",
        "RegisterForUnhandledEvent",
        "RemoveAndDeleteChildren",
        "RemoveClass",
        "Schedule",
        "SetAttributeString",
        "SetFocus",
        "SetHasClass",
        "SetImage",
        "SetPanelEvent",
        "Toggle",
        "__anitaActiveCategory",
        "__anitaBootstrapReceived",
        "__anitaEditingPresetNameKey",
        "__anitaHeroOptions",
        "__anitaHeroSummaryLabel",
        "__anitaImportCodeInput",
        "__anitaLastEmittedValues",
        "__anitaLastRenderSyncAt",
        "__anitaPendingWriteToken",
        "__anitaPortableSyncBurstToken",
        "__anitaPortableSyncLoopStarted",
        "__anitaPortableSyncReason",
        "__anitaPortableSyncTicks",
        "__anitaPresetHeroModes",
        "__anitaPresetHeroSelections",
        "__anitaPresetNameOverrides",
        "__anitaPresetNotice",
        "__anitaPresetPriorityOrder",
        "__anitaRemovedPresetRows",
        "__anitaRowPanel",
        "__anitaSelectedPresetKey",
        "__hpColorsBootstrapAppliedAt",
        "__hpColorsBootstrapRequests",
        "__hpColorsStartupSyncToken",
        "__hpHeroPresetHasScopedPreset",
        "__hpHeroPresetLockAfterGameTime",
        "actuallayoutwidth",
        "aliases",
        "animationDuration",
        "backgroundImage",
        "bootstrap_reason",
        "brightness",
        "c",
        "canfocus",
        "category",
        "class",
        "config",
        "currentValue",
        "defaultValue",
        "description",
        "count",
        "elements",
        "equals",
        "force_emit",
        "force_persist",
        "full",
        "hasScopedPreset",
        "height",
        "hp_bg_visible",
        "hp_color_high",
        "hp_color_low",
        "hp_color_mid",
        "hp_counter_format",
        "hp_counter_position",
        "hp_counter_size",
        "hp_counter_visible",
        "hp_enabled",
        "hp_friend_color_high",
        "hp_friend_color_low",
        "hp_friend_color_mid",
        "hp_friend_enabled",
        "hp_friend_pulse_bpm",
        "hp_friend_pulse_color",
        "hp_friend_pulse_color_enabled",
        "hp_friend_pulse_enabled",
        "hp_friend_pulse_intensity",
        "hp_friend_pulse_threshold",
        "hp_healthbar_height",
        "hp_high_threshold",
        "hp_info_health_margin_top",
        "hp_kill_zone_color",
        "hp_kill_zone_enabled",
        "hp_kill_zone_threshold",
        "hp_kill_zone_width",
        "hp_level_number_visible",
        "hp_low_threshold",
        "hp_mode",
        "hp_pip_visible",
        "hp_pulse_bpm",
        "hp_pulse_color",
        "hp_pulse_color_enabled",
        "hp_pulse_color_mode",
        "hp_pulse_enabled",
        "hp_pulse_hide_bar",
        "hp_pulse_intensity",
        "hp_pulse_text_enabled",
        "hp_pulse_text_position",
        "hp_pulse_text_scale",
        "hp_pulse_threshold",
        "hp_skip_buildings",
        "hp_team_colors",
        "hp_text_color_high",
        "hp_text_color_low",
        "hp_text_color_mid",
        "hp_text_color_mode",
        "hp_ult_color_custom",
        "hp_ult_color_enabled",
        "heroId",
        "heroMode",
        "heroes",
        "hittest",
        "hittestchildren",
        "hm",
        "hs",
        "id",
        "ignoreParentFlow",
        "isDummy",
        "key",
        "label",
        "magic_word",
        "max",
        "min",
        "mod_title",
        "name",
        "options",
        "paneltype",
        "p",
        "placeholder",
        "preset",
        "reason",
        "setting_id",
        "skip_bridge_persist",
        "step",
        "storageNamespace",
        "storageVersion",
        "style",
        "sync_reason",
        "text",
        "title",
        "token",
        "type",
        "uiScale",
        "update_source",
        "value",
        "values",
        "v",
        "version",
        "visibleWhen",
        "washColor",
        "width",
        "zIndex"
    )
    $lines = @(
        "/** @externs */",
        "/** @const */ var `$ = {};",
        "`$.CreatePanel = function(type, parent, id) {};",
        "`$.GetContextPanel = function() {};",
        "`$.Schedule = function(delay, callback) {};",
        "`$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.RegisterEventHandler = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.RegisterForUnhandledEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.Msg = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "/** @const */ var GameUI = {};",
        "GameUI.CustomUIConfig = function() {};",
        "/** @const */ var SteamOverlayAPI = {};",
        "SteamOverlayAPI.OpenURL = function(url) {};",
        "SteamOverlayAPI.OpenExternalBrowserURL = function(url) {};"
    )

    foreach ($propertyName in $externProperties) {
        $lines += "Object.prototype.$propertyName;"
    }
    Set-Content -LiteralPath $externPath -Value ($lines -join "`n") -NoNewline
    return $externPath
}

function Assert-HpColorsClosureAdvancedOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,
        [Parameter(Mandatory = $true)]
        [string]$ScriptName,
        [Parameter(Mandatory = $true)]
        [long]$OriginalLength
    )

    if (-not (Test-Path -LiteralPath $ScriptPath)) {
        throw "Closure ADVANCED output not created: $ScriptPath"
    }
    $source = Get-Content -LiteralPath $ScriptPath -Raw
    if ($source.Length -lt 128 -or ($OriginalLength -ge 4096 -and $source.Length -lt 512)) {
        throw "Closure ADVANCED produced suspiciously small hp_colors output: $ScriptName"
    }

    $requiredFragments = @("ClientUI_FireOutput")
    if ($ScriptName -eq "anita_ui_core.js") {
        $requiredFragments += @("AnitaUI", "Register", "Toggle", "IsReady", "ANITA_ALIVE", "ANITA_HANDSHAKE")
    } elseif ($ScriptName -eq "hp_registrar.js") {
        $requiredFragments += @("AnitaUI", "Register", "ANITA_REGISTER", "ANITA_REQUEST_BOOTSTRAP", "ANITA_HANDSHAKE")
    } elseif ($ScriptName -eq "anita_persist_loader.js") {
        $requiredFragments += @("ANITA_REGISTER", "ANITA_REQUEST_BOOTSTRAP", "ANITA_BULK_UPDATE", "ANITA_UPDATE")
    } elseif ($ScriptName -eq "healthbar_logic.js") {
        $requiredFragments += @("ANITA_BULK_UPDATE", "ANITA_UPDATE", "hp_counter", "__hpColorsCfgRaw")
    }

    foreach ($fragment in $requiredFragments) {
        if (-not $source.Contains($fragment)) {
            throw "Closure ADVANCED output for $ScriptName is missing required runtime fragment: $fragment"
        }
    }
}

Write-Host "`n[1/4] Preparing Closure ADVANCED hp_colors source..." -ForegroundColor Cyan
Copy-Item -Path $modSrc -Destination $terserSrc -Recurse -Force

$scriptFiles = Get-ChildItem "$terserSrc\panorama\scripts" -Filter *.js | Sort-Object Name
if (-not $scriptFiles) {
    Write-Host "[ERROR] No Panorama scripts found for Closure ADVANCED" -ForegroundColor Red
    exit 1
}

$externsPath = New-HpColorsClosureAdvancedExterns -StageRoot $terserSrc
foreach ($script in $scriptFiles) {
    $sourceScript = Join-Path "$modSrc\panorama\scripts" $script.Name
    $minifiedScript = $script.FullName
    $originalLength = (Get-Item -LiteralPath $sourceScript).Length
    $closureArgs = @(
        "--yes"
        "google-closure-compiler"
        "--externs"
        $externsPath
        "--js"
        $sourceScript
        "--compilation_level"
        "ADVANCED"
        "--js_output_file"
        $minifiedScript
    )

    & npx @closureArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] google-closure-compiler ADVANCED failed for $($script.Name) with code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
    try {
        Assert-HpColorsClosureAdvancedOutput -ScriptPath $minifiedScript -ScriptName $script.Name -OriginalLength $originalLength
    } catch {
        Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

Remove-Item -LiteralPath $externsPath -Force
Write-Host "  Closure ADVANCED JS OK -> $terserSrc" -ForegroundColor Green

# ## Step 2: Compile ############################################################
Write-Host "`n[2/4] Compiling hp_colors..." -ForegroundColor Cyan
$compileTarget = "$terserCompiled\panorama\scripts\healthbar_logic.vjs_c"
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$terserSrc`"" -PassThru
$compileDeadline = (Get-Date).AddSeconds(120)
while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $compileTarget) {
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
if ($proc.ExitCode -ne 0) {
    if (-not (Test-Path $compileTarget)) {
        Write-Host "[ERROR] Compiler exited $($proc.ExitCode) and no output produced" -ForegroundColor Red
        exit 1
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but output exists; continuing." -ForegroundColor Yellow
}
if (-not (Test-Path $compileTarget)) {
    Write-Host "[ERROR] Compiled output not found" -ForegroundColor Red
    exit 1
}
Copy-Item -Path $terserCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# ## Step 3: Pack VPK ##########################################################
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
if (-not $vpkeditcli) {
    Write-Host "[ERROR] vpkeditcli.exe not found in known repo tool paths." -ForegroundColor Red
    exit 1
}
$packArgs = "`"$modCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    Write-Host "[ERROR] vpkeditcli failed with code $($pack.ExitCode)" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $vpkOut)) {
    Write-Host "[ERROR] VPK not created at $vpkOut" -ForegroundColor Red
    exit 1
}
$vpkSize = (Get-Item $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut  ($([math]::Round($vpkSize/1KB, 1)) KB)" -ForegroundColor Green

# ## Step 4: Deploy ############################################################
Write-Host "`n[4/4] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path $destDir)) {
    Write-Host "[ERROR] Destination folder not found: $destDir" -ForegroundColor Red
    exit 1
}
Copy-Item -Path $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`n  Done! Launch Deadlock to test." -ForegroundColor Yellow
