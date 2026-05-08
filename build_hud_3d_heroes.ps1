$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$modSrc = Join-Path $root 'hud'
$modCompiled = Join-Path $root 'hud_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'
$vpkOut = Join-Path $root 'pak98_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak98_dir.vpk'
$compiledHud = Join-Path $modCompiled 'panorama\layout\hud.vxml_c'

function Require-Path {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Remove-RepoChild {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Leaf
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    $resolvedRoot = (Resolve-Path -LiteralPath $root).Path
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    if ($resolvedPath -ne (Join-Path $resolvedRoot $Leaf)) {
        throw "Refusing to remove unexpected path: $resolvedPath"
    }

    Remove-Item -LiteralPath $Path -Recurse -Force
}

Require-Path -Path $modSrc -Label 'HUD source folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'

Write-Host "`n[1/3] Compiling hud..." -ForegroundColor Cyan
Remove-RepoChild -Path $modCompiled -Leaf 'hud_compiled'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}

$compile = Start-Process -FilePath $compiler -ArgumentList "`"$modSrc`"" -PassThru -Wait -NoNewWindow
if ($compile.ExitCode -ne 0) {
    if (-not (Test-Path -LiteralPath $compiledHud)) {
        throw "Compiler failed with code $($compile.ExitCode) and did not emit $compiledHud"
    }
    Write-Host "  Compiler exited $($compile.ExitCode), but hud.vxml_c exists; continuing." -ForegroundColor Yellow
}

Require-Path -Path $compiledHud -Label 'Compiled hud.vxml_c'
Write-Host "  Compiled OK -> $compiledHud" -ForegroundColor Green

Write-Host "`n[2/3] Packing pak98_dir.vpk..." -ForegroundColor Cyan
$packArgs = "`"$modCompiled`" -o `"$vpkOut`" -s --no-progress"
$pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
if ($pack.ExitCode -ne 0) {
    throw "vpkeditcli failed with code $($pack.ExitCode)"
}

Require-Path -Path $vpkOut -Label 'pak98_dir.vpk'
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`n[3/3] Deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
Require-Path -Path $destDir -Label 'Deadlock addons folder'

Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
$destSize = (Get-Item -LiteralPath $vpkDest).Length
Write-Host "  Deployed OK -> $vpkDest ($([math]::Round($destSize / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "`nDone. Launch Deadlock with -dev -tools and check W.log/Panorama debugger for ThreeDHeroHudProbe." -ForegroundColor Yellow
