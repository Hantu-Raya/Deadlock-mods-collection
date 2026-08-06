param(
    [switch]$RefreshFromSteamTracking
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$modSrc = Join-Path $root "abilities"
$modCompiled = Join-Path $root "abilities_compiled"
$modScripts = Join-Path $modSrc "scripts"
$compiler = Join-Path $root "sr2compiler\New folder.exe"
$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root "passive_items_mod\compiler\vpkeditcli.exe"),
    (Join-Path $root "vpk cli\vpkeditcli.exe")
)
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
        Name = "pak02"
        StageDir = Join-Path $root "pak02_dir"
        VpkOut = Join-Path $root "pak02_dir.vpk"
        ArchiveName = "templete_$dateTag.7z"
        Script = $null
        InputFile = "abilities.vdata"
        CompiledSource = Join-Path $modCompiled "scripts\abilities.vdata_c"
        BehaviorState = "skip"
    }
    @{
        Name = "pak03"
        StageDir = Join-Path $root "pak03_dir"
        VpkOut = Join-Path $root "pak03_dir.vpk"
        ArchiveName = "filter_for_passive_and_active_items_yesBehaviour_$dateTag.7z"
        Script = "active.py"
        InputFile = "abilities.vdata"
        CompiledSource = Join-Path $modCompiled "scripts\abilities.vdata_c"
        BehaviorState = "enabled"
    }
    @{
        Name = "pak04"
        StageDir = Join-Path $root "pak04_dir"
        VpkOut = Join-Path $root "pak04_dir.vpk"
        ArchiveName = "filter_for_passive_items_$dateTag.7z"
        Script = "passive.py"
        InputFile = "abilities2.vdata"
        CompiledSource = Join-Path $modCompiled "scripts\abilities2.vdata_c"
        BehaviorState = "skip"
    }
    @{
        Name = "pak05"
        StageDir = Join-Path $root "pak05_dir"
        VpkOut = Join-Path $root "pak05_dir.vpk"
        ArchiveName = "filter_for_passive_and_active_items_$dateTag.7z"
        Script = "active_no_behavior.py"
        InputFile = "abilities.vdata"
        CompiledSource = Join-Path $modCompiled "scripts\abilities.vdata_c"
        BehaviorState = "disabled"
    }
)

$legacyArchiveNames = @(
    "filter_for_passive_and_active_items_noBehaviour_$dateTag.7z",
    "filter_for_passive_and_active_items_no_behavior_$dateTag.7z",
    "filter_for_passive_and_active_items_no_behavior_yes_behavior_$dateTag.7z"
)

function Remove-RootIncludeBlock {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InputPath
    )

    $content = Get-Content -LiteralPath $InputPath -Raw
    $includePattern = '(?ms)^\s*_include\s*=\s*\r?\n\s*\[\s*\r?\n(?:\s*resource_name:"[^"]+",?\s*\r?\n)+\s*\]\s*\r?\n'
    $matches = [regex]::Matches($content, $includePattern)

    if ($matches.Count -gt 1) {
        throw "Expected at most one root _include block in $InputPath, found $($matches.Count)"
    }
    if ($matches.Count -eq 1) {
        Write-Host "[preprocess] remove _include from $(Split-Path $InputPath -Leaf)" -ForegroundColor Cyan
        $updated = [regex]::Replace($content, $includePattern, '', 1)
        [System.IO.File]::WriteAllText($InputPath, $updated, [System.Text.UTF8Encoding]::new($false))
    }
}

function Copy-ItemWithRetry {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    for ($attempt = 1; $attempt -le 10; $attempt++) {
        try {
            Copy-Item -LiteralPath $Source -Destination $Destination -Force
            return
        } catch {
            if ($attempt -eq 10) {
                throw
            }
            Start-Sleep -Milliseconds 500
        }
    }
}


function Update-AbilityBaselinesFromSteamTracking {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$InputFiles
    )

    $upstreamUrl = "https://raw.githubusercontent.com/SteamTracking/GameTracking-Deadlock/master/game/citadel/pak01_dir/scripts/abilities.vdata"
    Write-Host "[update] fetch upstream abilities.vdata" -ForegroundColor Cyan
    $response = Invoke-WebRequest -Uri $upstreamUrl -UseBasicParsing
    $content = [string]$response.Content

    if (-not $content.StartsWith("<!-- kv3 encoding:text:")) {
        throw "Unexpected upstream abilities.vdata response"
    }

    $includePattern = '(?ms)^\s*_include\s*=\s*\r?\n\s*\[\s*\r?\n(?:\s*resource_name:"[^"]+",?\s*\r?\n)+\s*\]\s*\r?\n'
    $matches = [regex]::Matches($content, $includePattern)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one root _include block in upstream abilities.vdata, found $($matches.Count)"
    }
    $content = [regex]::Replace($content, $includePattern, '', 1)

    foreach ($inputFile in $InputFiles) {
        $inputPath = Join-Path $modScripts $inputFile
        Write-Host "[update] write $inputFile from upstream abilities.vdata" -ForegroundColor Cyan
        [System.IO.File]::WriteAllText($inputPath, $content, [System.Text.UTF8Encoding]::new($false))
    }
}

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

function Test-AbilityBehaviorState {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InputFile,
        [Parameter(Mandatory = $true)]
        [ValidateSet("enabled", "disabled", "skip")]
        [string]$BehaviorState
    )

    if ($BehaviorState -eq "skip") {
        return
    }

    $inputPath = Join-Path $modScripts $InputFile
    $expectEnabled = if ($BehaviorState -eq "enabled") { "True" } else { "False" }
    $scriptPath = $modScripts -replace "\\", "\\"
    $verifyInputPath = $inputPath -replace "\\", "\\"
    $verifyCode = "import sys; sys.path.insert(0, r'$scriptPath'); from active import verify_behavior_state; sys.exit(0 if verify_behavior_state(r'$verifyInputPath', expect_enabled=$expectEnabled) else 1)"

    Write-Host "[verify] behavior $BehaviorState for $InputFile" -ForegroundColor Cyan
    & $python -c $verifyCode
    if ($LASTEXITCODE -ne 0) {
        throw "Behavior state verification failed for $InputFile ($BehaviorState)"
    }
}

function Invoke-AbilityCompiler {
    if (Test-Path $modCompiled) { Remove-Item -Recurse -Force $modCompiled }
    Write-Host "[compile] abilities" -ForegroundColor Cyan
    $compiledActive = Join-Path $modCompiled "scripts\abilities.vdata_c"
    $compiledPassive = Join-Path $modCompiled "scripts\abilities2.vdata_c"
    Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $modSrc -RequiredOutputs @($compiledActive, $compiledPassive) -TimeoutSeconds 180
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

    Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $StageDir -OutputPath $VpkOut
}

function Compress-Vpk {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VpkOut,
        [Parameter(Mandatory = $true)]
        [string]$ArchiveName
    )

    $archivePath = Join-Path $addons $ArchiveName
    if (Test-Path $archivePath) { Remove-Item -Force $archivePath }
    Write-Host "[archive] $ArchiveName" -ForegroundColor Cyan
    Compress-Vpk7Zip -SevenZip $sevenZip -InputPath $VpkOut -ArchivePath $archivePath -ExpectedLeaf (Split-Path -Leaf $VpkOut)
    return $archivePath
}

function Remove-LegacyArchives {
    foreach ($archiveName in $legacyArchiveNames) {
        $archivePath = Join-Path $addons $archiveName
        if (Test-Path -LiteralPath $archivePath) {
            Write-Host "[archive] remove legacy $archiveName" -ForegroundColor Cyan
            Remove-Item -LiteralPath $archivePath -Force
        }
    }
}

$inputFiles = $pakSpecs | ForEach-Object { $_.InputFile } | Select-Object -Unique

if ($RefreshFromSteamTracking) {
    Update-AbilityBaselinesFromSteamTracking -InputFiles $inputFiles
}

$inputBaselines = @{}
$baselineDir = Join-Path ([System.IO.Path]::GetTempPath()) ("deadlock_abilities_baseline_" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null

foreach ($inputFile in $inputFiles) {
    $inputPath = Join-Path $modScripts $inputFile
    Remove-RootIncludeBlock -InputPath $inputPath

    $baselinePath = Join-Path $baselineDir $inputFile
    Copy-ItemWithRetry -Source $inputPath -Destination $baselinePath
    $inputBaselines[$inputFile] = $baselinePath
}

foreach ($spec in $pakSpecs) {
    Copy-ItemWithRetry -Source $inputBaselines[$spec.InputFile] -Destination (Join-Path $modScripts $spec.InputFile)
    if ($spec.Script) {
        Invoke-AbilityScript -ScriptName $spec.Script -InputFile $spec.InputFile
    } else {
        Write-Host "[transform] skip for $($spec.InputFile)" -ForegroundColor Cyan
    }
    Test-AbilityBehaviorState -InputFile $spec.InputFile -BehaviorState $spec.BehaviorState
    Invoke-AbilityCompiler
    Stage-And-Pack -StageDir $spec.StageDir -CompiledSource $spec.CompiledSource -VpkOut $spec.VpkOut
}

Remove-LegacyArchives

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

foreach ($inputFile in $inputFiles) {
    Copy-ItemWithRetry -Source $inputBaselines[$inputFile] -Destination (Join-Path $modScripts $inputFile)
}

if (Test-Path $baselineDir) {
    Remove-Item -Recurse -Force $baselineDir
}

Get-Item $archives | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
