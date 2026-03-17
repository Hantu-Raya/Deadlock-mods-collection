$ErrorActionPreference = 'Stop'

$root        = "F:\Users\Shiv\Desktop\Deadlock-mods-collection"
$modSrc      = "$root\jungle_timer"
$modCompiled = "$root\jungle_timer_compiled"
$compiler    = "$root\sr2compiler\New folder.exe"
$vpkeditcli  = "$root\passive_items_mod\compiler\vpkeditcli.exe"
$vpkOut      = "$root\pak97_dir.vpk"
$vpkDest     = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak97_dir.vpk"

# ── Step 1: Compile ────────────────────────────────────────────────────────────
Write-Host "`n[1/3] Compiling jungle_timer..." -ForegroundColor Cyan
# The compiler is interactive (Console.ReadKey at end), so start it in a new
# window and wait for the process to exit naturally.
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$modSrc`"" -PassThru -Wait
if ($proc.ExitCode -ne 0) {
    Write-Host "[ERROR] Compiler exited with code $($proc.ExitCode)" -ForegroundColor Red
    exit 1
}

# Verify compiled output exists
if (-not (Test-Path "$modCompiled\panorama\scripts\jungle_timer.vjs_c")) {
    Write-Host "[ERROR] Compiled output not found at: $modCompiled" -ForegroundColor Red
    exit 1
}
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# ── Step 2: Pack VPK ──────────────────────────────────────────────────────────
Write-Host "`n[2/3] Packing VPK..." -ForegroundColor Cyan

# Remove stale VPK if it exists
if (Test-Path $vpkOut) { Remove-Item $vpkOut -Force }

# vpkeditcli packs a directory into a single-file VPK
# Usage: vpkeditcli --create <output.vpk> <input_dir>
$packArgs = "--create `"$vpkOut`" `"$modCompiled`""
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
