$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc = Join-Path $root 'buff_timer_virgin'
$modCompiled = Join-Path $root 'buff_timer_virgin_compiled'
$terserSrc = Join-Path $root 'buff_timer_virgin_terser'
$terserCompiled = Join-Path $root 'buff_timer_virgin_terser_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'
$vpkOut = Join-Path $root 'pak98_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk'
$scriptRelative = 'panorama\scripts\rejuvnbufftimer.js'

# Clean rebuild: remove stale compiled output and previous pack artifacts.
if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
if (Test-Path $terserSrc) { Remove-Item -Recurse -Force $terserSrc }
if (Test-Path $terserCompiled) { Remove-Item -Recurse -Force $terserCompiled }
if (Test-Path $vpkOut) { Remove-Item -Force $vpkOut }

# [1/4] Prepare terser source
Write-Host "`n[1/4] Preparing minified buff_timer_virgin source..." -ForegroundColor Cyan
Copy-Item -Path $modSrc -Destination $terserSrc -Recurse -Force

$sourceScript = Join-Path $modSrc $scriptRelative
$compressedScript = Join-Path $terserSrc $scriptRelative
if (-not (Test-Path $compressedScript)) {
    throw "Compressed script target was not created: $compressedScript"
}

$terserArgs = @(
    '--yes'
    'terser'
    $sourceScript
    '-c'
    'passes=3'
    '-m'
    'keep_fnames=true,keep_classnames=true'
    '--comments'
    'false'
    '-o'
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
Write-Host "  Minified OK -> $compressedScript ($([math]::Round($scriptInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green

# [2/4] Compile
Write-Host "`n[2/4] Compiling buff_timer_virgin..." -ForegroundColor Cyan
$compileTarget = Join-Path $terserCompiled 'panorama\scripts\rejuvnbufftimer.vjs_c'
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
        throw "Compiler exited $($proc.ExitCode) and no output produced"
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but output exists; continuing." -ForegroundColor Yellow
}
if (-not (Test-Path $compileTarget)) {
    throw "Compiled output not found"
}
Copy-Item -Path $terserCompiled -Destination $modCompiled -Recurse -Force
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

# [3/4] Pack VPK
Write-Host "`n[3/4] Packing VPK..." -ForegroundColor Cyan
$packArgs = "`"$modCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    throw "vpkeditcli failed with code $($pack.ExitCode)"
}
if (-not (Test-Path $vpkOut)) {
    throw "VPK not created at $vpkOut"
}
$vpkSize = (Get-Item $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

# [4/4] Deploy
Write-Host "`n[4/4] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path $destDir)) {
    throw "Destination folder not found: $destDir"
}
Copy-Item -Path $vpkOut -Destination $vpkDest -Force
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`nDone! Launch Deadlock to test." -ForegroundColor Yellow
