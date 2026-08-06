param(
    [string]$BuilderPresetVpkPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk",
    [string]$PakName = "pak97_dir.vpk",
    [string]$SourceDir = "",
    [string]$CompiledDir = "",
    [string]$ClosureSourceDir = "",
    [string]$ClosureCompiledDir = "",
    [switch]$SkipSourceValidation
)

$ErrorActionPreference = 'Stop'

$root            = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$modSrc          = if ($SourceDir) { $SourceDir } else { "$root\hp_colors_minimal" }
$modCompiled     = if ($CompiledDir) { $CompiledDir } else { "$root\hp_colors_minimal_compiled" }
$closureSrc      = if ($ClosureSourceDir) { $ClosureSourceDir } else { "$root\hp_colors_minimal_closure" }
$closureCompiled = if ($ClosureCompiledDir) { $ClosureCompiledDir } else { "$root\hp_colors_minimal_closure_compiled" }
$compiler        = "$root\sr2compiler\New folder.exe"
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    "$root\passive_items_mod\compiler\vpkeditcli.exe",
    "$root\vpk cli\vpkeditcli.exe"
)
$vpkOut          = "$root\$PakName"
$addonsDir       = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons"
$vpkDest         = Join-Path $addonsDir $PakName

function Get-FullPathSafe {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-UnderRepoRoot {
    param([Parameter(Mandatory = $true)][string]$Path)
    $fullRoot = Get-FullPathSafe $root
    $fullPath = Get-FullPathSafe $Path
    $rootPrefix = $fullRoot.TrimEnd('\', '/')
    $underRoot = $fullPath.Equals($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith("$rootPrefix\", [System.StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith("$rootPrefix/", [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $underRoot) {
        throw "Refusing to touch path outside repo root: $fullPath"
    }
}

function Remove-RepoPathIfExists {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$Recurse
    )
    Assert-UnderRepoRoot $Path
    if (Test-Path $Path) {
        if ($Recurse) {
            Remove-Item -LiteralPath $Path -Recurse -Force
        } else {
            Remove-Item -LiteralPath $Path -Force
        }
    }
}

function Remove-VpkFamilyIfExists {
    param([Parameter(Mandatory = $true)][string]$Path)
    $full = Get-FullPathSafe $Path
    $dir = Split-Path $full -Parent
    $leaf = Split-Path $full -Leaf
    $stem = $leaf -replace '_dir\.vpk$', ''
    if (-not $stem -or -not (Test-Path $dir)) { return }
    Get-ChildItem -LiteralPath $dir -Filter "$stem*.vpk" -File -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
    }
}

function New-HpMinimalClosureAdvancedExterns {
    param([Parameter(Mandatory = $true)][string]$StageSrc)

    $externPath = Join-Path $StageSrc "hp_colors_minimal_closure_advanced.externs.js"
    $externProperties = @(
        "AddClass",
        "BHasClass",
        "CancelScheduled",
        "Children",
        "CustomUIConfig",
        "DispatchEvent",
        "FindChildTraverse",
        "GetAttributeString",
        "GetContextPanel",
        "GetChild",
        "GetChildCount",
        "GetParent",
        "IsValid",
        "Msg",
        "RegisterForUnhandledEvent",
        "UnregisterForUnhandledEvent",
        "RemoveClass",
        "Schedule",
        "SetAttributeString",
        "FindChildrenWithClassTraverse",
        "SetHasClass",
        "actual_damage",
        "actuallayoutheight",
        "actuallayoutwidth",
        "aliases",
        "allow_unknown_fallback",
        "alive",
        "cfg_raw",
        "__hpColorsPresetDebug",
        "__hpColorsMinimalDebug",
        "crosshair",
        "applied_ids",
        "enabled",
        "inactive_ids",
        "leading_minor_pips",
        "major_hp",
        "major_pips",
        "max",
        "minor_hp",
        "minor_pips",
        "present",
        "referenced_slots",
        "retired",
        "rule_ids",
        "status",
        "tiers",
        "gameui",
        "gameui_ready",
        "hero",
        "heroMode",
        "heroes",
        "hp_bg_visible",
        "hp_color_high",
        "hp_color_low",
        "hp_color_mid",
        "hp_delta_color",
        "hp_bullet_shield_color",
        "hp_heal_color",
        "hp_counter_format",
        "hp_counter_position",
        "hp_counter_size",
        "hp_counter_visible",
        "hp_enabled",
        "hp_friend_color_high",
        "hp_friend_color_low",
        "hp_friend_color_mid",
        "hp_friend_delta_color",
        "hp_friend_bullet_shield_color",
        "hp_friend_heal_color",
        "hp_friend_enabled",
        "h",
        "hm",
        "hs",
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
        "hp_precise_pips_enabled",
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
        "id",
        "index",
        "interval",
        "magic_word",
        "mod_title",
        "name",
        "preset",
        "raw_length",
        "reason",
        "retries",
        "root",
        "root_attr",
        "root_ready",
        "stable_count",
        "style",
        "animationDuration",
        "__hpColorsCfgRaw",
        "brightness",
        "backgroundColor",
        "fontSize",
        "height",
        "marginTop",
        "marginLeft",
        "opacity",
        "text",
        "visibility",
        "transform",
        "washColor",
        "width",
        "x",
        "y",
        "zIndex",
        "token",
        "update_source",
        "v",
        "vals",
        "values",
        "values_raw",
        "vs",
        "version"
    )
    $lines = @(
        "/** @externs */",
        "/** @const */ var `$ = {};",
        "`$.CancelScheduled = function(handle) {};",
        "`$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.GetContextPanel = function() {};",
        "`$.Msg = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.RegisterForUnhandledEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.UnregisterForUnhandledEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
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

function Assert-HpMinimalClosureAdvancedOutput {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string]$ScriptName
    )

    if (-not (Test-Path -LiteralPath $ScriptPath)) {
        throw "Closure ADVANCED script not created: $ScriptPath"
    }
    $source = Get-Content -LiteralPath $ScriptPath -Raw
    if ($source.Length -lt 256) {
        throw "Closure ADVANCED produced suspiciously small output: $ScriptName"
    }

    $requiredFragments = @("HP_COLORS_PRESET_SNAPSHOT", "HP_COLORS_PRESET_REQUEST", "ClientUI_FireOutput")
    if ($ScriptName -eq "anita_ui_core.js") {
        $requiredFragments += @("__hpColorsCfgRaw", "hp_colors_minimal_cfg_raw", "values_raw", "magic_word", "UnregisterForUnhandledEvent")
    } elseif ($ScriptName -eq "healthbar_logic.js") {
        $requiredFragments += @("hp_info_health_margin_top", "hp_healthbar_height", "low_hp_pulsing", "magic_word", "UnregisterForUnhandledEvent")
    }
    foreach ($fragment in $requiredFragments) {
        if (-not $source.Contains($fragment)) {
            throw "Closure ADVANCED output for $ScriptName is missing required runtime fragment: $fragment"
        }
    }
}


Assert-UnderRepoRoot $modSrc
Assert-UnderRepoRoot $modCompiled
Assert-UnderRepoRoot $closureSrc
Assert-UnderRepoRoot $closureCompiled

Remove-RepoPathIfExists $modCompiled -Recurse
Remove-RepoPathIfExists $closureSrc -Recurse
Remove-RepoPathIfExists $closureCompiled -Recurse
Remove-VpkFamilyIfExists $vpkOut

Write-Host "`n[0/4] Validating minimal hp_colors source..." -ForegroundColor Cyan
if ($SkipSourceValidation) {
    Write-Host "  Skipping production minimal audit for staged/debug source." -ForegroundColor Yellow
    $debugScripts = @(
        "$modSrc\panorama\scripts\anita_ui_core.js",
        "$modSrc\panorama\scripts\healthbar_logic.js"
    )
    foreach ($debugScript in $debugScripts) {
        if (-not (Test-Path $debugScript)) {
            Write-Host "[ERROR] Debug source script not found: $debugScript" -ForegroundColor Red
            exit 1
        }
        & node --check $debugScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Debug source syntax check failed: $debugScript" -ForegroundColor Red
            exit 1
        }
    }
} else {
    $auditScript = "$modSrc\scripts\validate-minimal.js"
    if (-not (Test-Path $auditScript)) {
        Write-Host "[ERROR] Minimal audit script not found: $auditScript" -ForegroundColor Red
        exit 1
    }
    & node $auditScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Minimal audit failed - fix drift before building." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Minimal audit passed." -ForegroundColor Green
}
if (-not (Test-Path $BuilderPresetVpkPath)) {
    Write-Host "[WARN] Builder preset VPK not found yet: $BuilderPresetVpkPath" -ForegroundColor Yellow
    Write-Host "       Install/download the web-builder settings VPK alongside this minimal VPK before in-game testing." -ForegroundColor Yellow
}

Write-Host "`n[1/4] Preparing Closure ADVANCED hp_colors_minimal source..." -ForegroundColor Cyan
Copy-Item -LiteralPath $modSrc -Destination $closureSrc -Recurse -Force
$supportScriptDir = "$closureSrc\scripts"
if (Test-Path $supportScriptDir) {
    Remove-Item -LiteralPath $supportScriptDir -Recurse -Force
}

$scriptFiles = Get-ChildItem "$closureSrc\panorama\scripts" -Filter *.js | Sort-Object Name
if (-not $scriptFiles) {
    Write-Host "[ERROR] No Panorama scripts found for Closure ADVANCED" -ForegroundColor Red
    exit 1
}

$externsPath = New-HpMinimalClosureAdvancedExterns -StageSrc $closureSrc
foreach ($script in $scriptFiles) {
    $sourceScript = Join-Path "$modSrc\panorama\scripts" $script.Name
    $compiledScript = $script.FullName
    if (Test-Path -LiteralPath $compiledScript) {
        Remove-Item -LiteralPath $compiledScript -Force
    }
    $closureArgs = @(
        "--yes"
        "google-closure-compiler"
        "--externs"
        $externsPath
        "--language_in"
        "ECMASCRIPT_NEXT"
        "--language_out"
        "ECMASCRIPT5_STRICT"
        "--js"
        $sourceScript
        "--compilation_level"
        "ADVANCED"
        "--js_output_file"
        $compiledScript
    )

    & npx @closureArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] google-closure-compiler ADVANCED failed for $($script.Name) with code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
    try {
        Assert-HpMinimalClosureAdvancedOutput -ScriptPath $compiledScript -ScriptName $script.Name
    } catch {
        Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}
Remove-Item -LiteralPath $externsPath -Force
Write-Host "  Closure ADVANCED JS OK -> $closureSrc" -ForegroundColor Green

Write-Host "`n[2/5] Running fresh Closure behavioral tests..." -ForegroundColor Cyan
$closureTestScript = "$modSrc\scripts\validate-minimal.test.js"
if (-not (Test-Path -LiteralPath $closureTestScript)) {
    Write-Host "[ERROR] Minimal behavioral test script not found: $closureTestScript" -ForegroundColor Red
    exit 1
}
$env:HP_COLORS_MINIMAL_SOURCE_ROOT = $closureSrc
$env:HP_COLORS_MINIMAL_CLOSURE_TEST = "1"
& node --test $closureTestScript
$closureTestExit = $LASTEXITCODE
Remove-Item Env:HP_COLORS_MINIMAL_SOURCE_ROOT -ErrorAction SilentlyContinue
Remove-Item Env:HP_COLORS_MINIMAL_CLOSURE_TEST -ErrorAction SilentlyContinue
if ($closureTestExit -ne 0) {
    Write-Host "[ERROR] Closure behavioral tests failed with code $closureTestExit" -ForegroundColor Red
    exit $closureTestExit
}
Write-Host "  Closure behavioral tests passed." -ForegroundColor Green


Write-Host "`n[3/5] Compiling hp_colors_minimal..." -ForegroundColor Cyan
$healthbarTarget = "$closureCompiled\panorama\scripts\healthbar_logic.vjs_c"
$coreTarget = "$closureCompiled\panorama\scripts\anita_ui_core.vjs_c"
$requiredCompileTargets = @(
    "$closureCompiled\panorama\layout\unit_status_overlay.vxml_c",
    $healthbarTarget,
    $coreTarget,
    "$closureCompiled\panorama\styles\unit_status.vcss_c"
)
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$closureSrc`"" -PassThru
$compileDeadline = (Get-Date).AddSeconds(120)
while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
    Start-Sleep -Milliseconds 500
    $allRequiredCompiled = $true
    foreach ($target in $requiredCompileTargets) {
        if (-not (Test-Path $target)) {
            $allRequiredCompiled = $false
            break
        }
    }
    if ($allRequiredCompiled) {
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
    $missingCompileTargets = @($requiredCompileTargets | Where-Object { -not (Test-Path $_) })
    if ($missingCompileTargets.Count -gt 0) {
        foreach ($missingTarget in $missingCompileTargets) {
            Write-Host "[ERROR] Missing compiled output: $missingTarget" -ForegroundColor Red
        }
        Write-Host "[ERROR] Compiler exited $($proc.ExitCode) and required output is missing" -ForegroundColor Red
        exit 1
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but required output exists; continuing." -ForegroundColor Yellow
}
foreach ($target in $requiredCompileTargets) {
    if (-not (Test-Path $target)) {
        Write-Host "[ERROR] Compiled output not found: $target" -ForegroundColor Red
        exit 1
    }
}
Copy-Item -LiteralPath $closureCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[4/5] Packing VPK..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkSize = (Get-Item $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut  ($([math]::Round($vpkSize/1KB, 1)) KB)" -ForegroundColor Green

$source2Viewer = "$root\.tmp\source2viewer-cli\Source2Viewer-CLI.exe"
$tree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut -Source2ViewerPath $source2Viewer
Assert-PackedVpkAssets -Tree $tree -Label 'minimal HP Colors VPK' -Required @(
    "panorama/layout/unit_status_overlay.vxml_c",
    "panorama/scripts/anita_ui_core.vjs_c",
    "panorama/scripts/healthbar_logic.vjs_c",
    "panorama/styles/unit_status.vcss_c"
) -Forbidden @(
    "panorama/layout/base_hud.vxml_c",
    "panorama/layout/hud_escape_menu.vxml_c",
    "panorama/layout/unit_status_overlay_v2.vxml_c",
    "panorama/layout/unit_status_overlay_new.vxml_c",
    "panorama/scripts/anita_persist_loader.vjs_c",
    "panorama/scripts/hp_registrar.vjs_c",
    "panorama/styles/anita_ui.vcss_c"
)
Write-Host "  Packed file tree verified minimal-only." -ForegroundColor Green

Write-Host "`n[5/5] Deploying minimal runtime VPK..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path $destDir)) {
    Write-Host "[ERROR] Destination folder not found: $destDir" -ForegroundColor Red
    exit 1
}
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`n  Done. Install this minimal runtime VPK with the separate web-builder preset VPK." -ForegroundColor Yellow
Write-Host "  Minimal runtime: $vpkDest" -ForegroundColor Yellow
Write-Host "  Builder preset:  $BuilderPresetVpkPath" -ForegroundColor Yellow
