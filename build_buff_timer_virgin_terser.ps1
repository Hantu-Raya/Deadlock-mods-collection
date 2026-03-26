$ErrorActionPreference = 'Stop'

$root = "F:\Users\Shiv\Desktop\Deadlock-mods-collection"
$sourceMod = Join-Path $root "buff_timer_virgin"
$compressedMod = Join-Path $root "buff_timer_virgin_terser"
$scriptRelative = "panorama\scripts\rejuvnbufftimer.js"
$sourceScript = Join-Path $sourceMod $scriptRelative
$compressedScript = Join-Path $compressedMod $scriptRelative

if (Test-Path $compressedMod) {
    Remove-Item -Recurse -Force $compressedMod
}

Copy-Item -Path $sourceMod -Destination $compressedMod -Recurse -Force

if (-not (Test-Path $compressedScript)) {
    throw "Compressed script target was not created: $compressedScript"
}

Write-Host "[1/2] Minifying panorama/scripts/rejuvnbufftimer.js with terser..." -ForegroundColor Cyan

$terserArgs = @(
    "--yes"
    "terser"
    $sourceScript
    "-c"
    "-m"
    "keep_fnames=true,keep_classnames=true"
    "-o"
    $compressedScript
)

& npx @terserArgs
if ($LASTEXITCODE -ne 0) {
    throw "terser failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $compressedScript)) {
    throw "Compressed script not found after terser run: $compressedScript"
}

$scriptInfo = Get-Item $compressedScript
Write-Host "  Compressed OK -> $compressedScript ($([math]::Round($scriptInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "[2/2] Compressed source folder ready -> $compressedMod" -ForegroundColor Green

Get-Item $compressedMod, $compressedScript | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
