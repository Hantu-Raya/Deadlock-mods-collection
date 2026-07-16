param(
    [switch]$SmokeTestOnly
)

$ErrorActionPreference = 'Stop'

$root        = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc = "$root\hp_colors"
$modCompiled = "$root\hp_color_debug_compiled"
$debugProbeSrc = "$root\hp_color_debug\panorama\scripts\hero_detection_debug.js"
$debugProbeTest = "$root\hp_color_debug\scripts\validate-hero-detection-debug.test.js"
$terserSrc   = "$root\hp_color_debug_terser"
$terserCompiled = "$root\hp_color_debug_terser_compiled"
$compiler    = "$root\sr2compiler\New folder.exe"
$vpkeditcliCandidates = @(
    "$root\passive_items_mod\compiler\vpkeditcli.exe",
    "$root\vpk cli\vpkeditcli.exe",
    "$root\passive_items_mod_release\compiler\vpkeditcli.exe"
)
$vpkeditcli = $vpkeditcliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $vpkeditcli) {
    Write-Host "[ERROR] vpkeditcli.exe not found. Checked:" -ForegroundColor Red
    foreach ($candidate in $vpkeditcliCandidates) {
        Write-Host "  $candidate" -ForegroundColor Red
    }
    exit 1
}
$vpkOut      = "$root\pak97_dir.vpk"
$vpkDest     = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk"
$builderPresetVpk = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk"

# Clean rebuild: remove stale compiled output and previous pack artifact.
if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
if (Test-Path $terserSrc)   { Remove-Item -Recurse -Force $terserSrc }
if (Test-Path $terserCompiled) { Remove-Item -Recurse -Force $terserCompiled }
if (Test-Path $vpkOut)      { Remove-Item -Force $vpkOut }

# ## Step 0: Schema drift audit ################################################
if (-not $SmokeTestOnly) {
Write-Host "`n[0/4] Running schema drift audit..." -ForegroundColor Cyan
$auditScript = "$modSrc\scripts\validate-schema.js"
if (Test-Path $auditScript) {
    & node $auditScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Schema audit failed - fix drift before building." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Schema audit passed." -ForegroundColor Green
} else {
    Write-Host "  [WARN] Audit script not found, skipping." -ForegroundColor Yellow
}
$heroSelectorAuditScript = "$modSrc\scripts\validate-hero-selector.js"
if (Test-Path $heroSelectorAuditScript) {
    & node $heroSelectorAuditScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Hero selector audit failed - fix preset hero dropdown before building." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Hero selector audit passed." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Hero selector audit script not found: $heroSelectorAuditScript" -ForegroundColor Red
    exit 1
}
$runtimeReplayAuditScript = "$modSrc\scripts\validate-runtime-replay.js"
if (Test-Path $runtimeReplayAuditScript) {
    & node $runtimeReplayAuditScript
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Runtime replay audit failed - fix healthbar preset replay before building." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Runtime replay audit passed." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Runtime replay audit script not found: $runtimeReplayAuditScript" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $debugProbeTest)) {
    Write-Host "[ERROR] Hero detection debug probe test not found: $debugProbeTest" -ForegroundColor Red
    exit 1
}
& node --test $debugProbeTest
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Hero detection debug probe validation failed." -ForegroundColor Red
    exit 1
}
Write-Host "  Hero detection debug probe validation passed." -ForegroundColor Green
} else {
    Write-Host "`n[0/4] Smoke-test-only build: validators skipped by request." -ForegroundColor Yellow
}

# ## Step 1: Prepare minified build source #####################################
Write-Host "`n[1/4] Preparing current hp_colors source with hero detection debug overlay..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $terserSrc | Out-Null
Copy-Item -Path "$modSrc\panorama" -Destination "$terserSrc\panorama" -Recurse -Force

$presetStoreSync = "$root\scripts\sync_hp_preset_store.js"
$terserBaseHud = "$terserSrc\panorama\layout\base_hud.xml"
if ((Test-Path $builderPresetVpk) -and (Test-Path $presetStoreSync) -and (Test-Path $terserBaseHud)) {
    & node $presetStoreSync $builderPresetVpk $terserBaseHud
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] HPColorsPresetStore sync failed - fix pak96_dir.vpk or base_hud before building." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  [WARN] HPColorsPresetStore sync skipped; pak96_dir.vpk or sync script not found." -ForegroundColor Yellow
}
if (-not (Test-Path -LiteralPath $debugProbeSrc)) {
    Write-Host "[ERROR] Hero detection debug probe not found: $debugProbeSrc" -ForegroundColor Red
    exit 1
}
$stagedProbe = "$terserSrc\panorama\scripts\hero_detection_debug.js"
Copy-Item -LiteralPath $debugProbeSrc -Destination $stagedProbe -Force

$coreInclude = '<include src="s2r://panorama/scripts/anita_ui_core.vjs_c" />'
$probeInclude = '<include src="s2r://panorama/scripts/hero_detection_debug.vjs_c" />'
$baseHudText = [IO.File]::ReadAllText($terserBaseHud)
if (-not $baseHudText.Contains($coreInclude)) {
    Write-Host "[ERROR] Current base_hud.xml is missing the Anita core include required for the debug overlay." -ForegroundColor Red
    exit 1
}
$baseHudText = $baseHudText.Replace($coreInclude, "$coreInclude`r`n`t`t$probeInclude")
[IO.File]::WriteAllText($terserBaseHud, $baseHudText, [Text.UTF8Encoding]::new($false))

$scriptFiles = Get-ChildItem "$terserSrc\panorama\scripts" -Filter *.js | Sort-Object Name
if (-not $scriptFiles) {
    Write-Host "[ERROR] No Panorama scripts found to minify" -ForegroundColor Red
    exit 1
}

function Write-HpClosureExterns {
    param(
        [string]$Path,
        [object[]]$SourcePaths
    )

    $externProperties = @(
        "AnitaUI", "GameUI", "HP_COLORS", "Register", "DispatchEvent", "RegisterForUnhandledEvent",
        "ClientUI_FireOutput", "ANITA_REGISTER", "ANITA_UPDATE", "ANITA_BULK_UPDATE",
        "ANITA_REQUEST_BOOTSTRAP", "HP_COLORS_PRESET_SNAPSHOT", "HP_COLORS_PRESET_REQUEST",
        "CustomUIConfig", "SteamOverlayAPI", "IsReady", "GetVersion", "Toggle", "findRegisteredMod",
        "registerMod", "registeredMods", "__anitaLastEmittedValues", "magic_word", "mod_title",
        "setting_id", "new_value", "values", "values_raw", "config", "storageNamespace", "storageVersion"
    )

    foreach ($sourcePath in $SourcePaths) {
        if (-not (Test-Path -LiteralPath $sourcePath)) { continue }
        $sourceText = Get-Content -LiteralPath $sourcePath -Raw
        foreach ($match in [regex]::Matches($sourceText, '\.([A-Za-z_$][A-Za-z0-9_$]*)')) {
            $externProperties += $match.Groups[1].Value
        }
        foreach ($match in [regex]::Matches($sourceText, '["'']([A-Za-z_$][A-Za-z0-9_$]*)["'']\s*:')) {
            $externProperties += $match.Groups[1].Value
        }
        foreach ($match in [regex]::Matches($sourceText, '[{,]\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:')) {
            $externProperties += $match.Groups[1].Value
        }
        foreach ($match in [regex]::Matches($sourceText, '\[["'']([A-Za-z_$][A-Za-z0-9_$]*)["'']\]')) {
            $externProperties += $match.Groups[1].Value
        }
    }

    $externProperties = $externProperties | Where-Object { $_ } | Sort-Object -Unique
    $lines = @(
        "/** @externs */",
        "var `$ = {};",
        "`$.GetContextPanel = function() {};",
        "`$.CreatePanel = function(type, parent, id) {};",
        "`$.Schedule = function(delay, callback) {};",
        "`$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.RegisterForUnhandledEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.Msg = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "var GameUI = {};",
        "GameUI.CustomUIConfig = function() {};",
        "var SteamOverlayAPI = {};",
        "var AnitaCore = {};",
        "var HP_COLORS = {};"
    )
    foreach ($name in $externProperties) {
        $lines += "Object.prototype.$name;"
    }
    Set-Content -LiteralPath $Path -Value $lines -Encoding ASCII
}

function Test-HpClosureOutput {
    param(
        [string]$SourcePath,
        [string]$OutputPath,
        [string]$ScriptName
    )

    if (-not (Test-Path -LiteralPath $OutputPath)) {
        Write-Host "[ERROR] Closure ADVANCED did not create $ScriptName" -ForegroundColor Red
        exit 1
    }

    $outputInfo = Get-Item -LiteralPath $OutputPath
    if ($outputInfo.Length -lt 128) {
        Write-Host "[ERROR] Closure ADVANCED output for $ScriptName is suspiciously tiny ($($outputInfo.Length) bytes)" -ForegroundColor Red
        exit 1
    }

    $sourceText = Get-Content -LiteralPath $SourcePath -Raw
    $outputText = Get-Content -LiteralPath $OutputPath -Raw
    $requiredFragments = @("AnitaUI", "HP_COLORS", "Register", "DispatchEvent", "ClientUI_FireOutput", "ANITA_REGISTER", "HP_COLORS_PRESET_SNAPSHOT", "HP_COLORS_PRESET_REQUEST")
    foreach ($fragment in $requiredFragments) {
        if ($sourceText.Contains($fragment) -and -not $outputText.Contains($fragment)) {
            Write-Host "[ERROR] Closure ADVANCED output for $ScriptName dropped required runtime fragment '$fragment'" -ForegroundColor Red
            exit 1
        }
    }
}

$closureSourcePaths = $scriptFiles | ForEach-Object {
    if ($_.Name -eq "hero_detection_debug.js") {
        $debugProbeSrc
    } else {
        Join-Path "$modSrc\panorama\scripts" $_.Name
    }
}
$closureExterns = Join-Path $terserSrc "hp_colors_closure_externs.js"
Write-HpClosureExterns $closureExterns $closureSourcePaths

foreach ($script in $scriptFiles) {
    $sourceScript = if ($script.Name -eq "hero_detection_debug.js") {
        $debugProbeSrc
    } else {
        Join-Path "$modSrc\panorama\scripts" $script.Name
    }
    $minifiedScript = $script.FullName
    $closureArgs = @(
        "--yes"
        "google-closure-compiler"
        "--externs"
        $closureExterns
        "--js"
        $sourceScript
        "--compilation_level"
        "ADVANCED"
        "--js_output_file"
        $minifiedScript
    )

    & npx @closureArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Closure ADVANCED failed for $($script.Name) with code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
    if (-not $SmokeTestOnly) {
        Test-HpClosureOutput $sourceScript $minifiedScript $script.Name
    }
}

Remove-Item -LiteralPath $closureExterns -Force
Write-Host "  Closure ADVANCED JS OK -> $terserSrc" -ForegroundColor Green
if (-not $SmokeTestOnly) {
$optimizedAuditDir = "$terserSrc\hp_colors_closure"
New-Item -ItemType Directory -Force -Path $optimizedAuditDir | Out-Null
$optimizedAnitaAudit = "$optimizedAuditDir\anita_ui_core.js"
$optimizedRuntimeAudit = "$optimizedAuditDir\healthbar_logic.js"
Copy-Item -LiteralPath "$terserSrc\panorama\scripts\anita_ui_core.js" -Destination $optimizedAnitaAudit -Force
Copy-Item -LiteralPath "$terserSrc\panorama\scripts\healthbar_logic.js" -Destination $optimizedRuntimeAudit -Force
& node $heroSelectorAuditScript $optimizedAnitaAudit
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Minified hero selector audit failed - fix preset hero dropdown before compiling." -ForegroundColor Red
    exit 1
}
Write-Host "  Minified hero selector audit passed." -ForegroundColor Green
& node $runtimeReplayAuditScript $optimizedRuntimeAudit
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Minified runtime replay audit failed - fix healthbar preset replay before compiling." -ForegroundColor Red
    exit 1
}
Write-Host "  Minified runtime replay audit passed." -ForegroundColor Green
Remove-Item -LiteralPath $optimizedAuditDir -Recurse -Force
}

$buildOnlyScriptsDir = "$terserSrc\scripts"
if (Test-Path $buildOnlyScriptsDir) {
    Remove-Item -Recurse -Force $buildOnlyScriptsDir
}
$unusedImageDir = "$terserSrc\panorama\images\hp_colors"
foreach ($unusedImage in @("icon_copy.svg", "icon_open_builder.svg")) {
    $unusedImagePath = Join-Path $unusedImageDir $unusedImage
    if (Test-Path $unusedImagePath) {
        Remove-Item -Force $unusedImagePath
    }
}
if ((Test-Path $unusedImageDir) -and -not (Get-ChildItem -LiteralPath $unusedImageDir -Force)) {
    Remove-Item -Force $unusedImageDir
}

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
$compiledSelectorTargets = @(
    "$terserCompiled\panorama\scripts\anita_ui_core.vjs_c",
    "$terserCompiled\panorama\styles\anita_ui.vcss_c"
)
foreach ($selectorTarget in $compiledSelectorTargets) {
    if (-not (Test-Path $selectorTarget)) {
        Write-Host "[ERROR] Compiled hero selector asset not found: $selectorTarget" -ForegroundColor Red
        exit 1
    }
}
Copy-Item -Path $terserCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# ## Step 3: Pack VPK ##########################################################
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
Write-Host "  Using vpkeditcli -> $vpkeditcli" -ForegroundColor DarkGray
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
$vpkTree = & $vpkeditcli $vpkOut --file-tree --no-progress
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Could not inspect packed VPK contents" -ForegroundColor Red
    exit 1
}
foreach ($packedAsset in @("anita_ui_core.vjs_c", "anita_ui.vcss_c", "healthbar_logic.vjs_c", "hero_detection_debug.vjs_c")) {
    if (-not (($vpkTree | Select-String -SimpleMatch $packedAsset -Quiet))) {
        Write-Host "[ERROR] Packed VPK missing required asset: $packedAsset" -ForegroundColor Red
        exit 1
    }
}
if (($vpkTree | Select-String -SimpleMatch "hud_health.vxml_c" -Quiet)) {
    Write-Host "[ERROR] Packed VPK still includes unused hud_health.vxml_c" -ForegroundColor Red
    exit 1
}
foreach ($buildOnlyAsset in @("validate-schema.vjs_c", "validate-hero-selector.vjs_c", "validate-runtime-replay.vjs_c")) {
    if (($vpkTree | Select-String -SimpleMatch $buildOnlyAsset -Quiet)) {
        Write-Host "[ERROR] Packed VPK still includes build-only asset: $buildOnlyAsset" -ForegroundColor Red
        exit 1
    }
}
foreach ($unusedImageAsset in @("icon_copy.vsvg_c", "icon_open_builder.vsvg_c")) {
    if (($vpkTree | Select-String -SimpleMatch $unusedImageAsset -Quiet)) {
        Write-Host "[ERROR] Packed VPK still includes unused image asset: $unusedImageAsset" -ForegroundColor Red
        exit 1
    }
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

Write-Host "`n  Done! Launch Deadlock and filter console lines containing [HP_HERO_TOPBAR_DEBUG]." -ForegroundColor Yellow
