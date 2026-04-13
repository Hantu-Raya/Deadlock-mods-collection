$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$modSrc = Join-Path $root "abilities"
$modCompiled = Join-Path $root "abilities_compiled"
$modScripts = Join-Path $modSrc "scripts"
$compiler = Join-Path $root "sr2compiler\New folder.exe"
$vpkeditcli = Join-Path $root "passive_items_mod\compiler\vpkeditcli.exe"
$addons = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons"
$python = (Get-Command py.exe -ErrorAction SilentlyContinue).Source
$sevenZip = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
$dateTag = Get-Date -Format 'MM_dd'

if (-not $python) {
    $pythonCandidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Launcher\py.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
        "C:\Users\Administrator\AppData\Local\Programs\Python\Launcher\py.exe",
        "C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe"
    )
    $python = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $sevenZip) {
    $sevenZip = "C:\Program Files\7-Zip\7z.exe"
}

if (-not $python -or -not (Test-Path -LiteralPath $python)) {
    throw "Python was not found on PATH or in the expected user install paths"
}

if (-not (Test-Path $sevenZip)) {
    throw "7z.exe was not found on PATH or at C:\Program Files\7-Zip\7z.exe"
}

$pakSpecs = @(
    @{
        Name = "pak03"
        StageDir = Join-Path $root "pak03_dir"
        VpkOut = Join-Path $root "pak03_dir.vpk"
        ArchiveName = "filter_for_passive_and_active_items_$dateTag.7z"
        Script = "active.py"
        InputFile = "abilities.vdata"
        CompiledSource = Join-Path $modCompiled "scripts\abilities.vdata_c"
    }
    @{
        Name = "pak04"
        StageDir = Join-Path $root "pak04_dir"
        VpkOut = Join-Path $root "pak04_dir.vpk"
        ArchiveName = "filter_for_passive_items_$dateTag.7z"
        Script = "passive.py"
        InputFile = "abilities2.vdata"
        CompiledSource = Join-Path $modCompiled "scripts\abilities2.vdata_c"
    }
    @{
        Name = "pak05"
        StageDir = Join-Path $root "pak05_dir"
        VpkOut = Join-Path $root "pak05_dir.vpk"
        ArchiveName = "filter_for_passive_and_active_items_no_behavior_$dateTag.7z"
        Script = "active_no_behavior.py"
        InputFile = "abilities.vdata"
        CompiledSource = Join-Path $modCompiled "scripts\abilities.vdata_c"
    }
)

function Invoke-AbilityScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptName,
        [Parameter(Mandatory = $true)]
        [string]$InputFile
    )

    Write-Host "[transform] $ScriptName" -ForegroundColor Cyan
    $proc = Start-Process -FilePath $python -ArgumentList $ScriptName, $InputFile -WorkingDirectory $modScripts -PassThru -Wait
    if ($proc.ExitCode -ne 0) {
        throw "$ScriptName failed with exit code $($proc.ExitCode)"
    }
}

function Invoke-AbilityCompiler {
    if (Test-Path $modCompiled) {
        Remove-Item -Recurse -Force $modCompiled
    }

    Write-Host "[compile] abilities" -ForegroundColor Cyan
    $proc = Start-Process -FilePath $compiler -ArgumentList "`"$modSrc`"" -PassThru -Wait
    $compiledActive = Join-Path $modCompiled "scripts\abilities.vdata_c"
    $compiledPassive = Join-Path $modCompiled "scripts\abilities2.vdata_c"

    if ($proc.ExitCode -ne 0 -and (-not (Test-Path $compiledActive) -or -not (Test-Path $compiledPassive))) {
        throw "Compiler failed with exit code $($proc.ExitCode)"
    }

    if (-not (Test-Path $compiledActive)) {
        throw "Compiled active output not found: $compiledActive"
    }

    if (-not (Test-Path $compiledPassive)) {
        throw "Compiled passive output not found: $compiledPassive"
    }
}

function Stage-And-Pack {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageDir,
        [Parameter(Mandatory = $true)]
        [string]$CompiledSource,
        [Parameter(Mandatory = $true)]
        [string]$VpkOut
    )

    if (Test-Path $StageDir) {
        Remove-Item -Recurse -Force $StageDir
    }

    New-Item -ItemType Directory -Path (Join-Path $StageDir "scripts") -Force | Out-Null
    Copy-Item -LiteralPath $CompiledSource -Destination (Join-Path $StageDir "scripts\abilities.vdata_c") -Force

    if (Test-Path $VpkOut) {
        Remove-Item -Force $VpkOut
    }

    Write-Host "[pack] $(Split-Path $VpkOut -Leaf)" -ForegroundColor Cyan
    $packArgs = "`"$StageDir`" -o `"$VpkOut`" -s --no-progress"
    $pack = Start-Process -FilePath $vpkeditcli -ArgumentList $packArgs -PassThru -Wait -NoNewWindow
    if ($pack.ExitCode -ne 0) {
        throw "vpkeditcli failed for $(Split-Path $VpkOut -Leaf) with exit code $($pack.ExitCode)"
    }

    if (-not (Test-Path $VpkOut)) {
        throw "VPK not created: $VpkOut"
    }
}

function Compress-Vpk {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VpkOut,
        [Parameter(Mandatory = $true)]
        [string]$ArchiveName
    )

    $archivePath = Join-Path $addons $ArchiveName
    if (Test-Path $archivePath) {
        Remove-Item -Force $archivePath
    }

    Write-Host "[archive] $ArchiveName" -ForegroundColor Cyan
    & $sevenZip a -t7z $archivePath $VpkOut | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $archivePath)) {
        throw "7z failed for $ArchiveName"
    }

    return $archivePath
}

foreach ($spec in $pakSpecs) {
    Invoke-AbilityScript -ScriptName $spec.Script -InputFile $spec.InputFile
    Invoke-AbilityCompiler
    Stage-And-Pack -StageDir $spec.StageDir -CompiledSource $spec.CompiledSource -VpkOut $spec.VpkOut
}

$archives = foreach ($spec in $pakSpecs) {
    Compress-Vpk -VpkOut $spec.VpkOut -ArchiveName $spec.ArchiveName
}

foreach ($spec in $pakSpecs) {
    if (Test-Path $spec.StageDir) {
        Remove-Item -Recurse -Force $spec.StageDir
    }

    if (Test-Path $spec.VpkOut) {
        Remove-Item -Force $spec.VpkOut
    }
}

Get-Item $archives | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
