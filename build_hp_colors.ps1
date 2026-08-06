$ErrorActionPreference = 'Stop'

$root        = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$modSrc      = "$root\hp_colors"
$modCompiled = "$root\hp_colors_compiled"
$closureSrc   = "$root\hp_colors_closure"
$closureCompiled = "$root\hp_colors_closure_compiled"
$compiler    = "$root\sr2compiler\New folder.exe"
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    "$root\passive_items_mod\compiler\vpkeditcli.exe",
    "$root\vpk cli\vpkeditcli.exe",
    "$root\passive_items_mod_release\compiler\vpkeditcli.exe"
)
$vpkOut      = "$root\pak97_dir.vpk"
$vpkDest     = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk"

# Clean rebuild: remove stale compiled output and previous pack artifact.
if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
if (Test-Path $closureSrc)   { Remove-Item -Recurse -Force $closureSrc }
if (Test-Path $closureCompiled) { Remove-Item -Recurse -Force $closureCompiled }
if (Test-Path $vpkOut)      { Remove-Item -Force $vpkOut }

# ## Step 0: Schema drift audit ################################################
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
    Write-Host "[ERROR] Schema audit script not found: $auditScript" -ForegroundColor Red
    exit 1
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

# ## Step 1: Prepare Closure ADVANCED build source ##############################
Write-Host "`n[1/4] Preparing Closure ADVANCED hp_colors source..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $closureSrc | Out-Null
Copy-Item -Path "$modSrc\panorama" -Destination "$closureSrc\panorama" -Recurse -Force

Write-Host "  [PRESET STORE] Skipping external preset-store sync; using source base_hud.xml as-is." -ForegroundColor DarkGray

$scriptFiles = Get-ChildItem "$closureSrc\panorama\scripts" -Filter *.js | Sort-Object Name
if (-not $scriptFiles) {
    Write-Host "[ERROR] No Panorama scripts found for Closure ADVANCED" -ForegroundColor Red
    exit 1
}
$expectedScriptNames = @("anita_ui_core.js", "healthbar_logic.js")
$actualScriptNames = @($scriptFiles | ForEach-Object { $_.Name })
$missingScripts = @($expectedScriptNames | Where-Object { $actualScriptNames -notcontains $_ })
$extraScripts = @($actualScriptNames | Where-Object { $expectedScriptNames -notcontains $_ })
if ($missingScripts.Count -gt 0 -or $extraScripts.Count -gt 0) {
    Write-Host "[ERROR] hp_colors Closure source scripts must be exactly: $($expectedScriptNames -join ', ')" -ForegroundColor Red
    if ($missingScripts.Count -gt 0) { Write-Host "  Missing: $($missingScripts -join ', ')" -ForegroundColor Red }
    if ($extraScripts.Count -gt 0) { Write-Host "  Extra: $($extraScripts -join ', ')" -ForegroundColor Red }
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

$closureSourcePaths = $scriptFiles | ForEach-Object { Join-Path "$modSrc\panorama\scripts" $_.Name }
$closureExterns = Join-Path $closureSrc "hp_colors_closure_externs.js"
Write-HpClosureExterns $closureExterns $closureSourcePaths

foreach ($script in $scriptFiles) {
    $sourceScript = Join-Path "$modSrc\panorama\scripts" $script.Name
    $closureScript = $script.FullName
    $closureArgs = @(
        "--yes"
        "google-closure-compiler"
        "--externs"
        $closureExterns
        "--language_in"
        "ECMASCRIPT_NEXT"
        "--language_out"
        "ECMASCRIPT5_STRICT"
        "--js"
        $sourceScript
        "--compilation_level"
        "ADVANCED"
        "--js_output_file"
        $closureScript
    )

    & npx @closureArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Closure ADVANCED failed for $($script.Name) with code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
    Test-HpClosureOutput $sourceScript $closureScript $script.Name
}

Remove-Item -LiteralPath $closureExterns -Force
Write-Host "  Closure ADVANCED JS OK -> $closureSrc" -ForegroundColor Green
& node $heroSelectorAuditScript "$closureSrc\panorama\scripts\anita_ui_core.js"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Closure ADVANCED hero selector audit failed - fix preset hero dropdown before compiling." -ForegroundColor Red
    exit 1
}
Write-Host "  Closure ADVANCED hero selector audit passed." -ForegroundColor Green
& node $runtimeReplayAuditScript "$closureSrc\panorama\scripts\healthbar_logic.js"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Closure ADVANCED runtime replay audit failed - fix healthbar preset replay before compiling." -ForegroundColor Red
    exit 1
}
Write-Host "  Closure ADVANCED runtime replay audit passed." -ForegroundColor Green

$buildOnlyScriptsDir = "$closureSrc\scripts"
if (Test-Path $buildOnlyScriptsDir) {
    Remove-Item -Recurse -Force $buildOnlyScriptsDir
}
$unusedImageDir = "$closureSrc\panorama\images\hp_colors"
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
$compileTarget = "$closureCompiled\panorama\scripts\healthbar_logic.vjs_c"
Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $closureSrc -RequiredOutputs @(
    $compileTarget,
    "$closureCompiled\panorama\scripts\anita_ui_core.vjs_c",
    "$closureCompiled\panorama\styles\anita_ui.vcss_c"
) -TimeoutSeconds 120
$compiledSelectorTargets = @(
    "$closureCompiled\panorama\scripts\anita_ui_core.vjs_c",
    "$closureCompiled\panorama\styles\anita_ui.vcss_c"
)
foreach ($selectorTarget in $compiledSelectorTargets) {
    if (-not (Test-Path $selectorTarget)) {
        Write-Host "[ERROR] Compiled hero selector asset not found: $selectorTarget" -ForegroundColor Red
        exit 1
    }
}
Copy-Item -Path $closureCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# ## Step 3: Pack VPK ##########################################################
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
Write-Host "  Using vpkeditcli -> $vpkeditcli" -ForegroundColor DarkGray
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets -Tree $vpkTree -Label 'HP Colors VPK' -Required @(
    "base_hud.vxml_c",
    "unit_status_overlay.vxml_c",
    "anita_ui_core.vjs_c",
    "healthbar_logic.vjs_c",
    "anita_ui.vcss_c",
    "unit_status.vcss_c"
) -Forbidden @(
    "anita_persist_loader.vjs_c",
    "hp_registrar.vjs_c",
    "hud_health.vxml_c",
    "validate-schema.vjs_c",
    "validate-hero-selector.vjs_c",
    "validate-runtime-replay.vjs_c",
    "icon_copy.vsvg_c",
    "icon_open_builder.vsvg_c"
)
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
