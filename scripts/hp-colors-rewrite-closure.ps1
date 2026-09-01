function New-HpColorsRewriteClosureExterns {
    param(
        [Parameter(Mandatory = $true)][string[]]$ScriptPaths,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $propertyNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $dotPropertyPattern = [regex]'\.\s*([A-Za-z_$][A-Za-z0-9_$]*)'
    $objectKeyPattern = [regex]'(?m)(?:^|[{,])\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:'

    foreach ($scriptPath in $ScriptPaths) {
        $source = [System.IO.File]::ReadAllText($scriptPath)
        foreach ($match in $dotPropertyPattern.Matches($source)) {
            [void]$propertyNames.Add($match.Groups[1].Value)
        }
        foreach ($match in $objectKeyPattern.Matches($source)) {
            [void]$propertyNames.Add($match.Groups[1].Value)
        }
    }

    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('/** @externs */')
    $lines.Add('/** @const */ var $ = {};')
    foreach ($propertyName in @($propertyNames | Sort-Object)) {
        $lines.Add("Object.prototype.$propertyName;")
    }
    [System.IO.File]::WriteAllText($Path, ($lines -join "`n"), [System.Text.Encoding]::ASCII)
    return $Path
}

function Get-HpColorsRewriteClosureContract {
    param([Parameter(Mandatory = $true)][string]$ScriptName)

    switch ($ScriptName) {
        'hp_colors_contract.js' {
            return @('HPColorsContractFactory', 'normalizeValues', 'enemyLow')
        }
        'hp_colors_state.js' {
            return @('HPColorsStateFactory', 'HPCRP1', 'preset_apply')
        }
        'hp_colors_menu.js' {
            return @('HPColorsMenuBoot', 'HPColorsMenuCancel', 'ClientUI_FireOutput')
        }
        'healthbar_probe.js' {
            return @('HP_COLORS_REWRITE_CONFIG', 'RegisterForUnhandledEvent', 'hp_counter')
        }
        'hp_colors_v2_contract.js' {
            return @('HPColorsV2ContractFactory', 'normalizeValues', 'enemyLow')
        }
        'hp_colors_v2_state.js' {
            return @('HPColorsV2StateFactory', 'HPCRP1', 'preset_apply')
        }
        'hp_colors_v2_menu.js' {
            return @('HPColorsMenuBoot', 'HPColorsMenuCancel', 'HP_COLORS_V2_CONFIG')
        }
        'unit_status_v2_colors.js' {
            return @('HP_COLORS_V2_CONFIG', 'RegisterForUnhandledEvent', 'hp_counter')
        }
        'unit_status_v2_segment_align.js' {
            return @('maxhp_segment_1', 'UnitHealthbarsContainer')
        }
        'qollock_hp_colors_bridge.js' {
            return @('ToggleSettingsWindow', 'HPColorsMenuBoot', 'HPColorsMenuCancel')
        }
        default {
            throw "No Closure ADVANCED output contract for Rewrite script: $ScriptName"
        }
    }
}

function Assert-HpColorsRewriteClosureOutput {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    if (-not (Test-Path -LiteralPath $OutputPath)) {
        throw "Closure ADVANCED script not created: $OutputPath"
    }
    $sourceLength = (Get-Item -LiteralPath $SourcePath).Length
    $outputLength = (Get-Item -LiteralPath $OutputPath).Length
    if ($outputLength -lt 256 -or $outputLength -ge $sourceLength) {
        throw "Closure ADVANCED output size is invalid for $(Split-Path -Leaf $SourcePath): source=$sourceLength output=$outputLength"
    }

    $output = [System.IO.File]::ReadAllText($OutputPath)
    foreach ($fragment in (Get-HpColorsRewriteClosureContract -ScriptName (Split-Path -Leaf $SourcePath))) {
        if (-not $output.Contains($fragment)) {
            throw "Closure ADVANCED output for $(Split-Path -Leaf $SourcePath) is missing required runtime fragment: $fragment"
        }
    }
}

function Invoke-HpColorsRewriteClosureAdvanced {
    param(
        [Parameter(Mandatory = $true)][string]$StageSourceRoot,
        [Parameter(Mandatory = $true)][string[]]$ScriptRelativePaths,
        [Parameter(Mandatory = $true)][string]$WorkRoot
    )

    $scriptPaths = @()
    foreach ($relativePath in $ScriptRelativePaths) {
        $scriptPath = Join-Path $StageSourceRoot $relativePath
        if (-not (Test-Path -LiteralPath $scriptPath)) {
            throw "Rewrite script missing from Closure stage: $scriptPath"
        }
        $scriptPaths += $scriptPath
    }

    $externsPath = Join-Path $WorkRoot 'hp-colors-rewrite-closure.externs.js'
    New-HpColorsRewriteClosureExterns -ScriptPaths $scriptPaths -Path $externsPath | Out-Null
    try {
        foreach ($scriptPath in $scriptPaths) {
            $scriptName = Split-Path -Leaf $scriptPath
            $closureOutput = Join-Path $WorkRoot ("$scriptName.closure-advanced.js")
            $closureArgs = @(
                '--yes'
                'google-closure-compiler'
                '--externs'
                $externsPath
                '--language_in'
                'ECMASCRIPT_NEXT'
                '--language_out'
                'ECMASCRIPT5_STRICT'
                '--js'
                $scriptPath
                '--compilation_level'
                'ADVANCED'
                '--js_output_file'
                $closureOutput
            )

            & npx @closureArgs
            if ($LASTEXITCODE -ne 0) {
                throw "Closure ADVANCED failed for $scriptName with exit code $LASTEXITCODE"
            }
            Assert-HpColorsRewriteClosureOutput -SourcePath $scriptPath -OutputPath $closureOutput
            Move-Item -LiteralPath $closureOutput -Destination $scriptPath -Force
            $size = (Get-Item -LiteralPath $scriptPath).Length
            Write-Host "  Closure ADVANCED OK -> $scriptName ($([math]::Round($size / 1KB, 1)) KB)" -ForegroundColor Green
        }
    }
    finally {
        if (Test-Path -LiteralPath $externsPath) {
            Remove-Item -LiteralPath $externsPath -Force
        }
    }
}

function Invoke-HpColorsRewriteClosureTests {
    param(
        [Parameter(Mandatory = $true)][string]$RepositoryRoot,
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [string]$QollockSourceRoot = ''
    )

    $isV2 = Test-Path -LiteralPath (
        Join-Path $SourceRoot 'panorama\scripts\hp_colors_v2_contract.js'
    )
    $testFilter = if ($isV2) {
        'validate-hp-colors-rewrite-v2-*.test.js'
    }
    else {
        'validate-hp-colors-rewrite-*.test.js'
    }
    $testPaths = @(
        Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot 'scripts') -Filter $testFilter |
            Where-Object {
                $_.Name -ne 'validate-hp-colors-rewrite-qollock.test.js' -and
                ($isV2 -or $_.Name -notlike 'validate-hp-colors-rewrite-v2-*')
            } |
            Sort-Object Name |
            ForEach-Object { $_.FullName }
    )
    if ($testPaths.Count -eq 0) {
        throw 'No HP Colors Rewrite behavioral tests found'
    }

    $previousSourceRoot = $env:HP_COLORS_REWRITE_SOURCE_ROOT
    $previousQollockRoot = $env:HP_COLORS_REWRITE_QOLLOCK_SOURCE_ROOT
    try {
        $env:HP_COLORS_REWRITE_SOURCE_ROOT = $SourceRoot
        Remove-Item Env:HP_COLORS_REWRITE_QOLLOCK_SOURCE_ROOT -ErrorAction SilentlyContinue
        & node --test @testPaths
        if ($LASTEXITCODE -ne 0) {
            throw "Closure ADVANCED Rewrite behavioral tests failed with exit code $LASTEXITCODE"
        }

        if (-not [string]::IsNullOrWhiteSpace($QollockSourceRoot)) {
            Remove-Item Env:HP_COLORS_REWRITE_SOURCE_ROOT -ErrorAction SilentlyContinue
            $env:HP_COLORS_REWRITE_QOLLOCK_SOURCE_ROOT = $QollockSourceRoot
            & node --test (Join-Path $RepositoryRoot 'scripts\validate-hp-colors-rewrite-qollock.test.js')
            if ($LASTEXITCODE -ne 0) {
                throw "Closure ADVANCED QOLLOCK bridge test failed with exit code $LASTEXITCODE"
            }
        }
    }
    finally {
        if ($null -eq $previousSourceRoot) {
            Remove-Item Env:HP_COLORS_REWRITE_SOURCE_ROOT -ErrorAction SilentlyContinue
        }
        else {
            $env:HP_COLORS_REWRITE_SOURCE_ROOT = $previousSourceRoot
        }
        if ($null -eq $previousQollockRoot) {
            Remove-Item Env:HP_COLORS_REWRITE_QOLLOCK_SOURCE_ROOT -ErrorAction SilentlyContinue
        }
        else {
            $env:HP_COLORS_REWRITE_QOLLOCK_SOURCE_ROOT = $previousQollockRoot
        }
    }
    Write-Host '  Closure ADVANCED behavioral tests passed.' -ForegroundColor Green
}
