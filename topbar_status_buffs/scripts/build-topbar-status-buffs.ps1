$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path -LiteralPath (Join-Path $scriptDir '..\..')
$root = $root.Path
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

$compiledSentinels = @(
    'panorama\layout\unit_status_overlay.vxml_c',
    'panorama\layout\citadel_hud_top_bar_player.vxml_c',
    'panorama\scripts\topbar_status_buffs_healthbar.vjs_c',
    'panorama\scripts\topbar_status_buffs_topbar.vjs_c',
    'panorama\scripts\topbar_status_buffs_debug.vjs_c',
    'panorama\styles\topbar_status_buffs.vcss_c'
)

function Require-Path {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Remove-TreeUnderRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Leaf
    )
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolvedRoot = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\') + '\'
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    if (-not ($resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedPath) -eq $Leaf)) {
        throw "Refusing to remove unexpected path: $resolvedPath"
    }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

function Test-CompiledSentinels {
    foreach ($sentinel in $compiledSentinels) {
        if (-not (Test-Path -LiteralPath (Join-Path $modCompiled $sentinel))) {
            return $false
        }
    }
    return $true
}

Require-Path -Path $modSrc -Label 'topbar_status_buffs source folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
if (-not $vpkeditcli) {
    Write-Host '[ERROR] vpkeditcli.exe not found. Checked:' -ForegroundColor Red
    foreach ($candidate in $vpkeditcliCandidates) { Write-Host "  $candidate" -ForegroundColor Red }
    exit 1
}

Write-Host "`n[1/4] Validating topbar_status_buffs source..." -ForegroundColor Cyan
& node (Join-Path $root 'topbar_status_buffs\scripts\validate-topbar-status-buffs.js')
if ($LASTEXITCODE -ne 0) { throw "Validator failed with exit code $LASTEXITCODE" }

Write-Host "`n[2/4] Compiling topbar_status_buffs..." -ForegroundColor Cyan
Remove-TreeUnderRoot -Path $modCompiled -Leaf 'topbar_status_buffs_compiled'
if (Test-Path -LiteralPath $vpkOut) { Remove-Item -LiteralPath $vpkOut -Force }

$proc = Start-Process -FilePath $compiler -ArgumentList "`"$modSrc`"" -PassThru
$compileDeadline = (Get-Date).AddSeconds(120)
while (-not $proc.HasExited -and (Get-Date) -lt $compileDeadline) {
    Start-Sleep -Milliseconds 500
    if (Test-CompiledSentinels) {
        Start-Sleep -Seconds 2
        if (-not $proc.HasExited) {
            Write-Host '[WARN] Compiler produced required outputs but did not exit; stopping wrapper.' -ForegroundColor Yellow
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
if ($proc.ExitCode -ne 0) {
    if (-not (Test-CompiledSentinels)) {
        throw "Compiler exited $($proc.ExitCode) and did not emit all required outputs"
    }
    Write-Host "[WARN] Compiler exited $($proc.ExitCode) but all required outputs exist; continuing." -ForegroundColor Yellow
}
foreach ($sentinel in $compiledSentinels) {
    Require-Path -Path (Join-Path $modCompiled $sentinel) -Label $sentinel
}
$buildOnlyCompiledScripts = Join-Path $modCompiled 'scripts'
if (Test-Path -LiteralPath $buildOnlyCompiledScripts) {
    Remove-TreeUnderRoot -Path $buildOnlyCompiledScripts -Leaf 'scripts'
}
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[3/4] Packing and inspecting pak89_dir.vpk..." -ForegroundColor Cyan
Write-Host "  Using vpkeditcli -> $vpkeditcli" -ForegroundColor DarkGray
$packArgs = @($modCompiled, '-o', $vpkOut, '-s', '--no-progress')
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) { throw "vpkeditcli failed with code $($pack.ExitCode)" }
Require-Path -Path $vpkOut -Label 'pak89_dir.vpk'

$vpkTree = & $vpkeditcli $vpkOut --file-tree --no-progress
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect packed VPK contents' }
foreach ($requiredAsset in $compiledSentinels) {
    $asset = $requiredAsset.Replace('\', '/')
    $leaf = Split-Path -Leaf $requiredAsset
    if (-not (($vpkTree | Select-String -SimpleMatch $asset -Quiet) -or ($vpkTree | Select-String -SimpleMatch $leaf -Quiet))) {
        throw "Packed VPK missing required asset: $asset"
    }
}
foreach ($forbiddenAsset in @('AGENTS', 'implementation.md', 'validate-topbar-status-buffs', 'build-topbar-status-buffs')) {
    if (($vpkTree | Select-String -SimpleMatch $forbiddenAsset -Quiet)) {
        throw "Packed VPK contains build-only asset: $forbiddenAsset"
    }
}
Write-Host "  Packed tree verified -> $vpkOut" -ForegroundColor Green

Write-Host "`n[4/4] Deploying pak89_dir.vpk..." -ForegroundColor Cyan
$destDir = Split-Path -Parent $vpkDest
Require-Path -Path $destDir -Label 'Deadlock addons folder'
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
Require-Path -Path $vpkDest -Label 'deployed pak89_dir.vpk'
Write-Host "  Deployed OK -> $vpkDest" -ForegroundColor Green
