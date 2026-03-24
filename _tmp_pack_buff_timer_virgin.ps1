$ErrorActionPreference = 'Stop'

$root        = "F:\Users\Shiv\Desktop\Deadlock-mods-collection"
$modSrc      = "$root\buff_timer_virgin"
$modCompiled = "$root\buff_timer_virgin_compiled"
$compiler    = "$root\sr2compiler\New folder.exe"
$vpkeditcli  = "$root\passive_items_mod\compiler\vpkeditcli.exe"
$vpkOut      = "$root\pak98_dir.vpk"
$vpkDest     = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk"

if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
if (Test-Path $vpkOut) { Remove-Item -Force $vpkOut }

Write-Host "[1/3] Compiling buff_timer_virgin..." -ForegroundColor Cyan
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$modSrc`"" -PassThru -Wait
if ($proc.ExitCode -ne 0 -and -not (Test-Path "$modCompiled\panorama\scripts\rejuvnbufftimer.vjs_c")) {
    throw "Compiler exited with code $($proc.ExitCode) and no compiled output was produced"
}
if (-not (Test-Path "$modCompiled\panorama\scripts\rejuvnbufftimer.vjs_c")) {
    throw "Compiled output not found at: $modCompiled"
}
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "[2/3] Packing VPK..." -ForegroundColor Cyan
$packArgs = "`"$modCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    throw "vpkeditcli failed with code $($pack.ExitCode)"
}
if (-not (Test-Path $vpkOut)) {
    throw "VPK not created at $vpkOut"
}
$vpkSize = (Get-Item $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut  ($([math]::Round($vpkSize/1KB, 1)) KB)" -ForegroundColor Green

Write-Host "[3/3] Deploying to Deadlock addons..." -ForegroundColor Cyan
Copy-Item -Path $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Get-Item $modCompiled, $vpkOut, $vpkDest | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
