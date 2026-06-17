param(
    [string]$BuilderPresetVpkPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk",
    [string]$PakName = "pak97_color_debug_dir.vpk"
)

$ErrorActionPreference = 'Stop'

$root            = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc          = "$root\hp_colors_minimal_color_debug"
$modCompiled     = "$root\hp_colors_minimal_color_debug_compiled"
$terserSrc       = "$root\hp_colors_minimal_color_debug_terser"
$terserCompiled  = "$root\hp_colors_minimal_color_debug_terser_compiled"
$compiler        = "$root\sr2compiler\New folder.exe"
$vpkeditcli      = "$root\passive_items_mod\compiler\vpkeditcli.exe"
$vpkeditFallback = "$root\vpk cli\vpkeditcli.exe"
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

    $externPath = Join-Path $StageSrc "hp_colors_minimal_color_debug_closure_advanced.externs.js"
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
        "GetParent",
        "IsValid",
        "Msg",
        "RegisterForUnhandledEvent",
        "RemoveClass",
        "Schedule",
        "SetAttributeString",
        "FindChildrenWithClassTraverse",
        "SetHasClass",
        "actual_damage",
        "aliases",
        "allow_unknown_fallback",
        "alive",
        "cfg_raw",
        "__hpColorsPresetDebug",
        "crosshair",
        "gameui",
        "gameui_ready",
        "hero",
        "heroMode",
        "heroes",
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
        "brightness",
        "fontSize",
        "height",
        "marginTop",
        "opacity",
        "text",
        "visibility",
        "washColor",
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
        "`$.Schedule = function(delay, callback) {};",
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
        $requiredFragments += @("__hpColorsCfgRaw", "hp_colors_minimal_cfg_raw", "values_raw", "magic_word")
    } elseif ($ScriptName -eq "healthbar_logic.js") {
        $requiredFragments += @("hp_info_health_margin_top", "hp_healthbar_height", "low_hp_pulsing", "magic_word")
    }
    foreach ($fragment in $requiredFragments) {
        if (-not $source.Contains($fragment)) {
            throw "Closure ADVANCED output for $ScriptName is missing required runtime fragment: $fragment"
        }
    }
}


Remove-RepoPathIfExists $modCompiled -Recurse
Remove-RepoPathIfExists $terserSrc -Recurse
Remove-RepoPathIfExists $terserCompiled -Recurse
Remove-VpkFamilyIfExists $vpkOut

Write-Host "`n[0/4] Validating minimal color debug source..." -ForegroundColor Cyan
$auditScript = "$modSrc\scripts\validate-minimal.js"
if (-not (Test-Path $auditScript)) {
    Write-Host "[ERROR] Color debug audit script not found: $auditScript" -ForegroundColor Red
    exit 1
}
& node $auditScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Color debug audit failed - fix drift before building." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $BuilderPresetVpkPath)) {
    Write-Host "[WARN] Builder preset VPK not found yet: $BuilderPresetVpkPath" -ForegroundColor Yellow
    Write-Host "       Install/download the web-builder settings VPK alongside this minimal VPK before in-game testing." -ForegroundColor Yellow
}
Write-Host "  Color debug audit passed." -ForegroundColor Green

Write-Host "`n[1/4] Preparing Closure ADVANCED hp_colors_minimal_color_debug source..." -ForegroundColor Cyan
Copy-Item -LiteralPath $modSrc -Destination $terserSrc -Recurse -Force
$supportScriptDir = "$terserSrc\scripts"
if (Test-Path $supportScriptDir) {
    Remove-Item -LiteralPath $supportScriptDir -Recurse -Force
}

$scriptFiles = Get-ChildItem "$terserSrc\panorama\scripts" -Filter *.js | Sort-Object Name
if (-not $scriptFiles) {
    Write-Host "[ERROR] No Panorama scripts found for Closure ADVANCED" -ForegroundColor Red
    exit 1
}

$externsPath = New-HpMinimalClosureAdvancedExterns -StageSrc $terserSrc
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
Write-Host "  Closure ADVANCED JS OK -> $terserSrc" -ForegroundColor Green


Write-Host "`n[2/4] Compiling hp_colors_minimal_color_debug..." -ForegroundColor Cyan
$healthbarTarget = "$terserCompiled\panorama\scripts\healthbar_logic.vjs_c"
$coreTarget = "$terserCompiled\panorama\scripts\anita_ui_core.vjs_c"
$requiredCompileTargets = @(
    "$terserCompiled\panorama\layout\unit_status_overlay.vxml_c",
    $healthbarTarget,
    $coreTarget,
    "$terserCompiled\panorama\styles\unit_status.vcss_c"
)
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$terserSrc`"" -PassThru
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
Copy-Item -LiteralPath $terserCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
if (-not (Test-Path $vpkeditcli) -and (Test-Path $vpkeditFallback)) {
    $vpkeditcli = $vpkeditFallback
}
if (-not (Test-Path $vpkeditcli)) {
    Write-Host "[ERROR] vpkeditcli not found: $vpkeditcli" -ForegroundColor Red
    exit 1
}
$packArgs = @($modCompiled, "-o", $vpkOut, "-s", "--no-progress")
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

$source2Viewer = "$root\.tmp\source2viewer-cli\Source2Viewer-CLI.exe"
if (Test-Path $source2Viewer) {
    $tree = & $source2Viewer -i $vpkOut --vpk_list 2>&1
    $requiredPacked = @(
        "panorama/layout/unit_status_overlay.vxml_c",
        "panorama/scripts/anita_ui_core.vjs_c",
        "panorama/scripts/healthbar_logic.vjs_c",
        "panorama/styles/unit_status.vcss_c"
    )
    foreach ($required in $requiredPacked) {
        if (-not ($tree -match [regex]::Escape($required))) {
            Write-Host "[ERROR] Packed VPK missing required minimal asset: $required" -ForegroundColor Red
            exit 1
        }
    }
    $forbiddenPacked = @(
        "panorama/layout/base_hud.vxml_c",
        "panorama/layout/hud_escape_menu.vxml_c",
        "panorama/layout/unit_status_overlay_v2.vxml_c",
        "panorama/layout/unit_status_overlay_new.vxml_c",
        "panorama/scripts/anita_persist_loader.vjs_c",
        "panorama/scripts/hp_registrar.vjs_c",
        "panorama/styles/anita_ui.vcss_c"
    )
    foreach ($forbidden in $forbiddenPacked) {
        if ($tree -match [regex]::Escape($forbidden)) {
            Write-Host "[ERROR] Packed VPK contains forbidden non-minimal asset: $forbidden" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host "  Packed file tree verified minimal-only." -ForegroundColor Green
} else {
    Write-Host "[WARN] Source2Viewer CLI not found; skipping packed file-tree verification." -ForegroundColor Yellow
}

Write-Host "`n[4/4] Deploying minimal color debug VPK..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path $destDir)) {
    Write-Host "[ERROR] Destination folder not found: $destDir" -ForegroundColor Red
    exit 1
}
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`n  Done. Install this debug runtime VPK with the separate web-builder preset VPK. Disable the normal minimal runtime while testing." -ForegroundColor Yellow
Write-Host "  Debug runtime:  $vpkDest" -ForegroundColor Yellow
Write-Host "  Builder preset:  $BuilderPresetVpkPath" -ForegroundColor Yellow
