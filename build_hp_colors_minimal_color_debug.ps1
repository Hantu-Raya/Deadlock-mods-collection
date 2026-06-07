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

Write-Host "`n[1/4] Preparing minified hp_colors_minimal_color_debug source..." -ForegroundColor Cyan
Copy-Item -LiteralPath $modSrc -Destination $terserSrc -Recurse -Force
$supportScriptDir = "$terserSrc\scripts"
if (Test-Path $supportScriptDir) {
    Remove-Item -LiteralPath $supportScriptDir -Recurse -Force
}

$scriptFiles = Get-ChildItem "$terserSrc\panorama\scripts" -Filter *.js | Sort-Object Name
if (-not $scriptFiles) {
    Write-Host "[ERROR] No Panorama scripts found to minify" -ForegroundColor Red
    exit 1
}

foreach ($script in $scriptFiles) {
    $sourceScript = Join-Path "$modSrc\panorama\scripts" $script.Name
    $minifiedScript = $script.FullName
    $terserArgs = @(
        "--yes"
        "terser"
        $sourceScript
        "-c"
        "passes=3"
        "-m"
        "keep_classnames=true"
        "--comments"
        "false"
        "-o"
        $minifiedScript
    )

    & npx @terserArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] terser failed for $($script.Name) with code $LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  Minified JS OK -> $terserSrc" -ForegroundColor Green

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
