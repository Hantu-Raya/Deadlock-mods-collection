[CmdletBinding()]
param(
    [ValidateSet('standalone', 'standalone_redesign')]
    [string]$Variant = 'standalone',
    [string]$PakName = 'pak99_dir.vpk',
    [string]$AddonsPath = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons',
    [switch]$SkipDeploy
)

# Builds the Mercurial Magnum notifier on top of one passive-item style variant:
# notifier panorama source + ../<Variant>/panorama/styles -> Closure ADVANCED -> compile -> pack -> deploy.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$moduleSrc = Join-Path $root 'mercurial_magnum_notifier'
$variantStyles = Join-Path $root "$Variant\panorama\styles"
$stageLeaf = "_${Variant}_mercurial_magnum_notifier_closure"
$stage = Join-Path $root $stageLeaf
$stageCompiled = Join-Path $root "${stageLeaf}_compiled"
$compiledLeaf = "${Variant}_mercurial_magnum_notifier_compiled"
$compiled = Join-Path $root $compiledLeaf
$vpkOut = Join-Path $root $PakName
$destination = Join-Path $AddonsPath $PakName
$scriptRelative = 'panorama\scripts\mercurial_magnum_notifier.js'
$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$packer = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe'),
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod_release\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$assets = @(
    'panorama/images/blood_tribute/upgrade_blood_tribute.vtex_c',
    'panorama/images/mercurial_magnum/upgrade_ethereal_bullets.vtex_c',
    'panorama/images/split_shot/upgrade_split_shot.vtex_c',
    'panorama/layout/ability_hud_elements/element_gun.vxml_c',
    'panorama/scripts/mercurial_magnum_notifier.vjs_c',
    'panorama/styles/base/hud.vcss_c',
    'panorama/styles/base/hud_abilities.vcss_c',
    'panorama/styles/base/hud_ability_icon_passive.vcss_c',
    'panorama/styles/hud.vcss_c',
    'panorama/styles/hud_abilities.vcss_c',
    'panorama/styles/hud_ability_icon_passive.vcss_c',
    'panorama/styles/mercurial_magnum_notifier.vcss_c'
)
$closureExterns = @'
/** @externs */
var $ = {};
$.GetContextPanel = function() {};
$.Schedule = function(delay, callback) {};
Object.prototype.IsValid = function() {};
Object.prototype.GetParent = function() {};
Object.prototype.BHasClass = function(className) {};
Object.prototype.SetHasClass = function(className, enabled) {};
Object.prototype.FindChildTraverse = function(id) {};
Object.prototype.FindChildrenWithClassTraverse = function(className) {};
Object.prototype.GetAttributeString = function(name, fallback) {};
Object.prototype.text;
Object.prototype.style;
Object.prototype.visibility;
Object.prototype.opacity;
Object.prototype.clip;
'@

# Get-FileHash is unavailable in some Windows PowerShell installs.
function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try { ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '') }
    finally { $stream.Dispose(); $sha256.Dispose() }
}

foreach ($path in @($moduleSrc, $variantStyles, $compiler)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required input missing: $path" }
}

# -- 1. Validate source ----------------------------------------------------------
Write-Host "`n[1/5] Validating notifier source..." -ForegroundColor Cyan
& node --check (Join-Path $moduleSrc $scriptRelative)
if ($LASTEXITCODE -ne 0) { throw 'Notifier syntax check failed' }
& node (Join-Path $moduleSrc 'scripts\validate-notifier.js')
if ($LASTEXITCODE -ne 0) { throw 'Notifier validation failed' }

Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf $stageLeaf
Remove-TreeUnderRoot -Path $stageCompiled -RootPath $root -ExpectedLeaf "${stageLeaf}_compiled"
Remove-TreeUnderRoot -Path $compiled -RootPath $root -ExpectedLeaf $compiledLeaf
if (Test-Path -LiteralPath $vpkOut) { Remove-Item -LiteralPath $vpkOut -Force }

try {
    # -- 2. Stage variant source and minify -----------------------------------------
    Write-Host "`n[2/5] Staging $Variant styles and running Closure ADVANCED..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $moduleSrc 'panorama') -Destination $stage -Recurse
    Copy-Item -Path (Join-Path $variantStyles '*') -Destination (Join-Path $stage 'panorama\styles') -Recurse -Force
    foreach ($style in @('hud_ability_icon_passive.css', 'base\hud_ability_icon_passive.css')) {
        $want = Get-Sha256 -Path (Join-Path $variantStyles $style)
        $got = Get-Sha256 -Path (Join-Path $stage "panorama\styles\$style")
        if ($want -ne $got) { throw "Staged $style does not match the $Variant variant" }
    }

    $externsPath = Join-Path $root "${stageLeaf}_externs.js"
    Set-Content -LiteralPath $externsPath -Value $closureExterns -Encoding ASCII
    $minified = Join-Path $stage $scriptRelative
    try {
        & npx --yes google-closure-compiler --externs $externsPath --js (Join-Path $moduleSrc $scriptRelative) `
            --compilation_level ADVANCED --language_out ECMASCRIPT_2020 --js_output_file $minified
        if ($LASTEXITCODE -ne 0) { throw "Closure ADVANCED failed with exit code $LASTEXITCODE" }
    } finally {
        Remove-Item -LiteralPath $externsPath -Force -ErrorAction SilentlyContinue
    }
    $minifiedText = Get-Content -LiteralPath $minified -Raw
    foreach ($fragment in @('MercurialMagnumNotifier', 'upgrade_ethereal_bullets', 'BLOOD TRIBUTE', 'Schedule')) {
        if (-not $minifiedText.Contains($fragment)) { throw "Closure output missing runtime fragment: $fragment" }
    }
    # The same behavior suite must pass against the shipped (minified) runtime.
    $env:NOTIFIER_RUNTIME_PATH = $minified
    try {
        & node (Join-Path $moduleSrc 'scripts\validate-notifier.js')
        if ($LASTEXITCODE -ne 0) { throw 'Minified notifier failed validation' }
    } finally {
        Remove-Item Env:\NOTIFIER_RUNTIME_PATH -ErrorAction SilentlyContinue
    }
    Write-Host "  Closure OK -> $((Get-Item -LiteralPath $minified).Length) bytes" -ForegroundColor Green

    # -- 3. Compile ------------------------------------------------------------------
    Write-Host "`n[3/5] Compiling..." -ForegroundColor Cyan
    $required = @($assets | ForEach-Object { Join-Path $stageCompiled $_ })
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stage -RequiredOutputs $required -HiddenWindow
    Copy-Item -LiteralPath $stageCompiled -Destination $compiled -Recurse

    # -- 4. Pack and check the exact inventory -------------------------------------
    Write-Host "`n[4/5] Packing $PakName..." -ForegroundColor Cyan
    Invoke-VpkPack -VpkEditCli $packer -InputDir $compiled -OutputPath $vpkOut
    $tree = Get-PackedVpkTree -VpkEditCli $packer -VpkPath $vpkOut -Source2ViewerPath $viewer
    $inventory = @(
        $tree |
            ForEach-Object {
                $line = ([string]$_).Trim()
                if ($line) { ($line -split '\s+', 2)[0] }
            } |
            Select-Object -Unique
    )
    $difference = @(Compare-Object -ReferenceObject $assets -DifferenceObject $inventory)
    if ($difference.Count) { throw "$PakName inventory mismatch: $($difference | Out-String)" }
    Write-Host "  Packed OK -> $vpkOut ($((Get-Item -LiteralPath $vpkOut).Length) bytes, $($inventory.Count) assets)" -ForegroundColor Green
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf $stageLeaf
    Remove-TreeUnderRoot -Path $stageCompiled -RootPath $root -ExpectedLeaf "${stageLeaf}_compiled"
}

# -- 5. Deploy (backup beside the target, then hash-verify) ----------------------
if ($SkipDeploy) { return }
Write-Host "`n[5/5] Deploying to $destination..." -ForegroundColor Cyan
if (-not (Test-Path -LiteralPath $AddonsPath)) { throw "Deadlock addons folder missing: $AddonsPath" }
if (Get-Process -Name 'deadlock', 'project8' -ErrorAction SilentlyContinue) {
    Write-Host '  [WARN] Deadlock is running; restart it after deploy to load the new VPK.' -ForegroundColor Yellow
}
if (Test-Path -LiteralPath $destination) {
    $backup = "$destination.backup_$(Get-Date -Format 'yyyyMMdd_HHmmssfff')"
    Copy-Item -LiteralPath $destination -Destination $backup
    Write-Host "  Backup -> $backup"
}
Copy-Item -LiteralPath $vpkOut -Destination $destination -Force
$hashes = @($vpkOut, $destination) | ForEach-Object { Get-Sha256 -Path $_ }
if ($hashes[0] -ne $hashes[1]) { throw "Deployed $PakName hash mismatch" }
Write-Host "  Deployed OK ($((Get-Item -LiteralPath $destination).Length) bytes, SHA256 $($hashes[1]))" -ForegroundColor Green
Write-Host "`nRestart Deadlock, then smoke-test all three indicators." -ForegroundColor Yellow
