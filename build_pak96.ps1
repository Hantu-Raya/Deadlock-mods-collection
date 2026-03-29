$ErrorActionPreference = 'Stop'

$root        = "F:\Users\Shiv\Desktop\Deadlock-mods-collection"
$modSrc      = "$root\pak96"
$modCompiled = "$root\pak96_compiled"
$compiler    = "$root\sr2compiler\New folder.exe"
$vpkeditcli  = "$root\passive_items_mod\compiler\vpkeditcli.exe"
$vpkOut      = "$root\pak96_dir.vpk"
$vpkDest     = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk"

# Clean rebuild: remove stale compiled output and previous pack artifact.
if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
if (Test-Path $vpkOut)      { Remove-Item -Force $vpkOut }

# ── Step 1: Compile ────────────────────────────────────────────────────────────
Write-Host "`n[1/3] Compiling pak96..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$modSrc`"" -PassThru -Wait
if ($proc.ExitCode -ne 0) {
    if (-not (Test-Path "$modCompiled\panorama\scripts\healthbar_logic.vjs_c")) {
        Write-Host "[ERROR] Compiler exited $($proc.ExitCode) and no output produced" -ForegroundColor Red
        exit 1
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but output exists; continuing." -ForegroundColor Yellow
}
if (-not (Test-Path "$modCompiled\panorama\scripts\healthbar_logic.vjs_c")) {
    Write-Host "[ERROR] Compiled output not found" -ForegroundColor Red
    exit 1
}
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# ── Step 2: Pack VPK ──────────────────────────────────────────────────────────
Write-Host "`n[2/3] Packing VPK..." -ForegroundColor Cyan
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

# ── Step 3: Deploy ────────────────────────────────────────────────────────────
Write-Host "`n[3/3] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path $destDir)) {
    Write-Host "[ERROR] Destination folder not found: $destDir" -ForegroundColor Red
    exit 1
}
Copy-Item -Path $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`n  Done! Launch Deadlock to test." -ForegroundColor Yellow
