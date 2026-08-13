$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$modSrc = Join-Path $root 'hp_colors_rewrite'
$modCompiled = Join-Path $root 'hp_colors_rewrite_compiled'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$vpkOut = Join-Path $root 'pak01_dir.vpk'
$vpkDest = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak01_dir.vpk'

$requiredCompiled = @(
    (Join-Path $modCompiled 'panorama\layout\hud_escape_menu.vxml_c'),
    (Join-Path $modCompiled 'panorama\layout\unit_status_overlay.vxml_c'),
    (Join-Path $modCompiled 'panorama\scripts\healthbar_probe.vjs_c'),
    (Join-Path $modCompiled 'panorama\scripts\hp_colors_menu.vjs_c'),
    (Join-Path $modCompiled 'panorama\styles\hp_colors_menu.vcss_c'),
    (Join-Path $modCompiled 'panorama\styles\hp_colors_unit_status.vcss_c')
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

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $bytes = $sha256.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '')
    }
    finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}


Require-Path -Path $modSrc -Label 'HP Colors rewrite source folder'
Require-Path -Path $compiler -Label 'Source 2 compiler'
Require-Path -Path $vpkeditcli -Label 'vpkeditcli'

Write-Host "`n[1/3] Compiling HP Colors rewrite..." -ForegroundColor Cyan
Remove-TreeUnderRoot -Path $modCompiled -RootPath $root -ExpectedLeaf 'hp_colors_rewrite_compiled'
if (Test-Path -LiteralPath $vpkOut) {
    Remove-Item -LiteralPath $vpkOut -Force
}
Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $modSrc -RequiredOutputs $requiredCompiled -TimeoutSeconds 120
Write-Host "  Compiled OK -> $modCompiled" -ForegroundColor Green

Write-Host "`n[2/3] Packing pak01_dir.vpk..." -ForegroundColor Cyan
Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $modCompiled -OutputPath $vpkOut
$vpkTree = Get-PackedVpkTree -VpkEditCli $vpkeditcli -VpkPath $vpkOut
Assert-PackedVpkAssets -Tree $vpkTree -Label 'HP Colors Rewrite VPK' -Required @(
    'hud_escape_menu.vxml_c',
    'unit_status_overlay.vxml_c',
    'healthbar_probe.vjs_c',
    'hp_colors_menu.vjs_c',
    'hp_colors_menu.vcss_c',
    'hp_colors_unit_status.vcss_c'
) -Forbidden @(
    'AGENTS.md',
    'FEATURES.md',
    'design.md',
    'hud_escape_menu.xml',
    'unit_status_overlay.xml',
    'healthbar_probe.js',
    'hp_colors_menu.js',
    'hp_colors_menu.css',
    'hp_colors_unit_status.css'
)
$vpkSize = (Get-Item -LiteralPath $vpkOut).Length
Write-Host "  Packed OK -> $vpkOut ($([math]::Round($vpkSize / 1KB, 1)) KB)" -ForegroundColor Green


Write-Host "`n[3/3] Backing up and deploying to Deadlock addons..." -ForegroundColor Cyan
$destDir = Split-Path $vpkDest -Parent
Require-Path -Path $destDir -Label 'Deadlock addons folder'

if (Test-Path -LiteralPath $vpkDest) {
    $backupStamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backupPath = "$vpkDest.backup_$backupStamp"
    Copy-Item -LiteralPath $vpkDest -Destination $backupPath
    Write-Host "  Previous addon backed up -> $backupPath" -ForegroundColor DarkGray
}

Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
$sourceHash = Get-Sha256 -Path $vpkOut
$deployedHash = Get-Sha256 -Path $vpkDest
if ($sourceHash -ne $deployedHash) {
    throw "Deployed VPK hash mismatch. Source=$sourceHash Destination=$deployedHash"
}

$destSize = (Get-Item -LiteralPath $vpkDest).Length
Write-Host "  Deployed OK -> $vpkDest ($([math]::Round($destSize / 1KB, 1)) KB)" -ForegroundColor Green
Write-Host "  SHA256 -> $deployedHash" -ForegroundColor DarkGray
Write-Host "`nDone. Restart Deadlock and run the in-game smoke test from hp_colors_rewrite\FEATURES.md." -ForegroundColor Yellow
