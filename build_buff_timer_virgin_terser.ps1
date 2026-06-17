$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceMod = Join-Path $root "buff_timer_virgin"
$compressedMod = Join-Path $root "buff_timer_virgin_terser"
$scriptRelative = "panorama\scripts\rejuvnbufftimer.js"
$sourceScript = Join-Path $sourceMod $scriptRelative
$compressedScript = Join-Path $compressedMod $scriptRelative
$externsPath = Join-Path $compressedMod "buff_timer_closure_advanced.externs.js"

if (Test-Path $compressedMod) {
    Remove-Item -Recurse -Force $compressedMod
}

Copy-Item -Path $sourceMod -Destination $compressedMod -Recurse -Force

if (-not (Test-Path $compressedScript)) {
    throw "Compressed script target was not created: $compressedScript"
}

function New-BuffTimerClosureExterns {
    param([Parameter(Mandatory = $true)][string]$Path)

    $externs = @'
/** @externs */
var $ = {};
$.Msg = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};
$.Schedule = function(delay, callback) {};
$.CancelScheduled = function(handle) {};
$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};
$.CreatePanel = function(type, parent, id) {};
$.GetContextPanel = function() {};
var GameUI = {};
Object.prototype.FindChildTraverse = function(id) {};
Object.prototype.FindChildrenWithClassTraverse = function(className) {};
Object.prototype.Children = function() {};
Object.prototype.GetParent = function() {};
Object.prototype.GetChild = function(index) {};
Object.prototype.GetChildCount = function() {};
Object.prototype.BHasClass = function(className) {};
Object.prototype.AddClass = function(className) {};
Object.prototype.RemoveClass = function(className) {};
Object.prototype.SetHasClass = function(className, enabled) {};
Object.prototype.SetImage = function(src) {};
Object.prototype.DeleteAsync = function(delay) {};
Object.prototype.IsValid = function() {};
Object.prototype.text;
Object.prototype.style;
'@
    Set-Content -LiteralPath $Path -Value $externs -Encoding ASCII
}

function Assert-ClosureOutput {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$RequiredFragments
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Compressed script not found after Closure ADVANCED run: $Path"
    }
    $scriptInfo = Get-Item -LiteralPath $Path
    if ($scriptInfo.Length -lt 1024) {
        throw "Closure ADVANCED output is suspiciously small: $($scriptInfo.Length) bytes at $Path"
    }
    $content = Get-Content -LiteralPath $Path -Raw
    foreach ($fragment in $RequiredFragments) {
        if (-not $content.Contains($fragment)) {
            throw "Closure ADVANCED output is missing required runtime fragment: $fragment"
        }
    }
    return $scriptInfo
}

Write-Host "[1/2] Minifying panorama/scripts/rejuvnbufftimer.js with Closure ADVANCED..." -ForegroundColor Cyan
New-BuffTimerClosureExterns -Path $externsPath

$closureArgs = @(
    "--yes"
    "google-closure-compiler"
    "--externs"
    $externsPath
    "--js"
    $sourceScript
    "--compilation_level"
    "ADVANCED"
    "--js_output_file"
    $compressedScript
)

& npx @closureArgs
if ($LASTEXITCODE -ne 0) {
    throw "google-closure-compiler ADVANCED failed with exit code $LASTEXITCODE"
}

$scriptInfo = Assert-ClosureOutput -Path $compressedScript -RequiredFragments @(
    "rejuv",
    "buff"
)
Remove-Item -LiteralPath $externsPath -Force
Write-Host "  Compressed OK -> $compressedScript ($([math]::Round($scriptInfo.Length / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "[2/2] Compressed source folder ready -> $compressedMod" -ForegroundColor Green

Get-Item $compressedMod, $compressedScript | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
