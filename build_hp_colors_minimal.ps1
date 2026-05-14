param(
    [string]$BuilderPresetVpkPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk",
    [string]$PakName = "pak97_dir.vpk"
)

$ErrorActionPreference = 'Stop'

$root            = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc          = "$root\hp_colors_minimal"
$modCompiled     = "$root\hp_colors_minimal_compiled"
$terserSrc       = "$root\hp_colors_minimal_terser"
$terserCompiled  = "$root\hp_colors_minimal_terser_compiled"
$compiler        = "$root\sr2compiler\New folder.exe"
$vpkeditcli      = "$root\passive_items_mod\compiler\vpkeditcli.exe"
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

Remove-RepoPathIfExists $modCompiled -Recurse
Remove-RepoPathIfExists $terserSrc -Recurse
Remove-RepoPathIfExists $terserCompiled -Recurse
Remove-RepoPathIfExists $vpkOut

Write-Host "`n[0/4] Validating minimal hp_colors source..." -ForegroundColor Cyan
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
if (-not (Test-Path $BuilderPresetVpkPath)) {
    Write-Host "[WARN] Builder preset VPK not found yet: $BuilderPresetVpkPath" -ForegroundColor Yellow
    Write-Host "       Install/download the web-builder settings VPK alongside this minimal VPK before in-game testing." -ForegroundColor Yellow
}
Write-Host "  Minimal audit passed." -ForegroundColor Green

Write-Host "`n[1/4] Preparing minified hp_colors_minimal source..." -ForegroundColor Cyan
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

Write-Host "`n[2/4] Compiling hp_colors_minimal..." -ForegroundColor Cyan
$healthbarTarget = "$terserCompiled\panorama\scripts\healthbar_logic.vjs_c"
$coreTarget = "$terserCompiled\panorama\scripts\anita_ui_core.vjs_c"
$loaderTarget = "$terserCompiled\panorama\scripts\anita_persist_loader.vjs_c"
$registrarTarget = "$terserCompiled\panorama\scripts\hp_registrar.vjs_c"
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$terserSrc`"" -PassThru
$compileDeadline = (Get-Date).AddSeconds(120)
while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
    Start-Sleep -Milliseconds 500
    if ((Test-Path $healthbarTarget) -and (Test-Path $coreTarget) -and (Test-Path $loaderTarget) -and (Test-Path $registrarTarget)) {
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
    if ((-not (Test-Path $healthbarTarget)) -or (-not (Test-Path $coreTarget)) -or (-not (Test-Path $loaderTarget)) -or (-not (Test-Path $registrarTarget))) {
        Write-Host "[ERROR] Compiler exited $($proc.ExitCode) and required output is missing" -ForegroundColor Red
        exit 1
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but required output exists; continuing." -ForegroundColor Yellow
}
foreach ($target in @($healthbarTarget, $coreTarget, $loaderTarget, $registrarTarget)) {
    if (-not (Test-Path $target)) {
        Write-Host "[ERROR] Compiled output not found: $target" -ForegroundColor Red
        exit 1
    }
}
Copy-Item -LiteralPath $terserCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
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

Write-Host "`n[4/4] Deploying minimal runtime VPK..." -ForegroundColor Cyan
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
