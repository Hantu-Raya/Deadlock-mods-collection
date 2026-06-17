$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$modSrc = Join-Path $root 'topbar_status_buffs'
$modCompiled = Join-Path $root 'topbar_status_buffs_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkOut = Join-Path $root 'pak89_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak89_dir.vpk'
$vpkeditcliCandidates = @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkeditcli = $vpkeditcliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not (Test-Path -LiteralPath $modSrc)) {
    Write-Host "[ERROR] Source module not found: $modSrc" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $compiler)) {
    Write-Host "[ERROR] Source 2 compiler not found: $compiler" -ForegroundColor Red
    exit 1
}
if (-not $vpkeditcli) {
    Write-Host '[ERROR] vpkeditcli.exe not found. Checked:' -ForegroundColor Red
    foreach ($candidate in $vpkeditcliCandidates) {
        Write-Host "  $candidate" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`n[0/4] Cleaning topbar_status_buffs outputs..." -ForegroundColor Cyan
if (Test-Path -LiteralPath $modCompiled) { Remove-Item -LiteralPath $modCompiled -Recurse -Force }
if (Test-Path -LiteralPath $vpkOut) { Remove-Item -LiteralPath $vpkOut -Force }
Write-Host '  Clean OK.' -ForegroundColor Green

Write-Host "`n[1/4] Validating source invariants..." -ForegroundColor Cyan
$validator = Join-Path $modSrc 'scripts\validate-topbar-status-buffs.js'
& node $validator
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] Source validation failed.' -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/4] Compiling topbar_status_buffs..." -ForegroundColor Cyan
$layoutSentinel = Join-Path $modCompiled 'panorama\layout\citadel_hud_top_bar_player.vxml_c'
$styleSentinel = Join-Path $modCompiled 'panorama\styles\topbar_status_buffs.vcss_c'
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$modSrc`"" -PassThru
$compileDeadline = (Get-Date).AddSeconds(120)
while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
    Start-Sleep -Milliseconds 500
    if ((Test-Path -LiteralPath $layoutSentinel) -and (Test-Path -LiteralPath $styleSentinel)) {
        Start-Sleep -Seconds 2
        if (-not $proc.HasExited) {
            Write-Host '[WARN] Compiler produced required output but did not exit; stopping wrapper.' -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            $proc.WaitForExit()
        }
        break
    }
}
if (-not $proc.HasExited) {
    Write-Host '[WARN] Compiler timed out; stopping wrapper.' -ForegroundColor Yellow
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    $proc.WaitForExit()
}
$sentinelsExist = (Test-Path -LiteralPath $layoutSentinel) -and (Test-Path -LiteralPath $styleSentinel)
if ($proc.ExitCode -ne 0) {
    if (-not $sentinelsExist) {
        Write-Host "[ERROR] Compiler exited $($proc.ExitCode) and required output is missing." -ForegroundColor Red
        exit 1
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but both required outputs exist; continuing." -ForegroundColor Yellow
}
if (-not (Test-Path -LiteralPath $layoutSentinel)) {
    Write-Host "[ERROR] Compiled layout missing: $layoutSentinel" -ForegroundColor Red
    exit 1
}
$compiledBuildScripts = Join-Path $modCompiled 'scripts'
if (Test-Path -LiteralPath $compiledBuildScripts) {
    Remove-Item -LiteralPath $compiledBuildScripts -Recurse -Force
}
if (-not (Test-Path -LiteralPath $styleSentinel)) {
    Write-Host "[ERROR] Compiled style missing: $styleSentinel" -ForegroundColor Red
    exit 1
}
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[3/4] Packing and inspecting pak89_dir.vpk..." -ForegroundColor Cyan
Write-Host "  Using vpkeditcli -> $vpkeditcli" -ForegroundColor DarkGray
$packArgs = "`"$modCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    Write-Host "[ERROR] vpkeditcli failed with code $($pack.ExitCode)" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $vpkOut)) {
    Write-Host "[ERROR] VPK not created at $vpkOut" -ForegroundColor Red
    exit 1
}
$vpkTree = & $vpkeditcli $vpkOut --file-tree --no-progress
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] Could not inspect packed VPK contents.' -ForegroundColor Red
    exit 1
}
foreach ($requiredAsset in @(
    'citadel_hud_top_bar_player.vxml_c',
    'topbar_status_buffs.vcss_c'
)) {
    if (-not (($vpkTree | Select-String -SimpleMatch $requiredAsset -Quiet))) {
        Write-Host "[ERROR] Packed VPK missing required asset: $requiredAsset" -ForegroundColor Red
        exit 1
    }
}
foreach ($forbiddenAsset in @(
    '.vjs_c',
    'validate-topbar-status-buffs.vjs_c',
    'AGENTS',
    'implementation.md',
    'topbar_rank_hud.vjs_c',
    'topbar_rank_rank_bridge.vjs_c',
    'profile_card.vxml_c',
    'players_list_entry.vxml_c',
    'hud_escape_menu.vxml_c',
    'rank-predict',
    'deadlock-api.com'
)) {
    if (($vpkTree | Select-String -SimpleMatch $forbiddenAsset -Quiet)) {
        Write-Host "[ERROR] Packed VPK contains forbidden asset/content marker: $forbiddenAsset" -ForegroundColor Red
        exit 1
    }
}
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`n[4/4] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
if (-not (Test-Path -LiteralPath $destDir)) {
    Write-Host "[ERROR] Destination folder not found: $destDir" -ForegroundColor Red
    exit 1
}
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
if (-not (Test-Path -LiteralPath $vpkDest)) {
    Write-Host "[ERROR] VPK not deployed at $vpkDest" -ForegroundColor Red
    exit 1
}
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green

Write-Host "`nDone: topbar_status_buffs pak89_dir.vpk built and deployed." -ForegroundColor Yellow
