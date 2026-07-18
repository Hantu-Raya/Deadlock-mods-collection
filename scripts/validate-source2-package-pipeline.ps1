$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('source2_package_pipeline_' + [System.Guid]::NewGuid().ToString('N'))
$passed = 0

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )
    if (-not $Condition) { throw $Message }
    $script:passed += 1
}

function Assert-Throws {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
        [Parameter(Mandatory = $true)][string]$Message
    )
    try {
        & $ScriptBlock
    } catch {
        $script:passed += 1
        return
    }
    throw $Message
}

try {
    New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
    $toolOne = Join-Path $testRoot 'tool-one.exe'
    $toolTwo = Join-Path $testRoot 'tool-two.exe'
    Set-Content -LiteralPath $toolOne -Value 'one' -NoNewline
    Set-Content -LiteralPath $toolTwo -Value 'two' -NoNewline

    $tree = @(
        'panorama/scripts/anita_ui_core.vjs_c',
        'panorama/styles/unit_status.vcss_c',
        'scripts/abilities.vdata_c'
    )

    Assert-True -Condition (Test-PackedAsset -Tree $tree -Asset 'panorama/scripts/anita_ui_core.vjs_c') -Message 'Test-PackedAsset did not match a full path.'
    Assert-True -Condition (Test-PackedAsset -Tree $tree -Asset 'anita_ui_core.vjs_c') -Message 'Test-PackedAsset did not match a leaf path.'

    Assert-PackedVpkAssets -Tree $tree -Label 'test VPK' -Required @('panorama/styles/unit_status.vcss_c') -Forbidden @('panorama/scripts/hp_registrar.vjs_c')
    $passed += 1

    Assert-Throws -ScriptBlock { Assert-PackedVpkAssets -Tree $tree -Label 'test VPK' -Required @('missing_asset.vjs_c') } -Message 'Assert-PackedVpkAssets did not throw for a missing required asset.'
    Assert-Throws -ScriptBlock { Assert-PackedVpkAssets -Tree $tree -Label 'test VPK' -Forbidden @('scripts/abilities.vdata_c') } -Message 'Assert-PackedVpkAssets did not throw for a forbidden asset.'

    $outsideRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('source2_package_pipeline_outside_' + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $outsideRoot -Force | Out-Null
    try {
        Assert-Throws -ScriptBlock { Remove-TreeUnderRoot -Path $outsideRoot -RootPath $testRoot } -Message 'Remove-TreeUnderRoot did not refuse an outside-root path.'
    } finally {
        if (Test-Path -LiteralPath $outsideRoot) { Remove-Item -LiteralPath $outsideRoot -Recurse -Force }
    }

    $selectedTool = Get-RepoToolPath -ToolName 'test tool' -Candidates @((Join-Path $testRoot 'missing.exe'), $toolOne, $toolTwo)
    Assert-True -Condition ($selectedTool -eq $toolOne) -Message 'Get-RepoToolPath did not return the first existing candidate.'
    Assert-Throws -ScriptBlock { Get-RepoToolPath -ToolName 'missing tool' -Candidates @((Join-Path $testRoot 'missing-a.exe'), (Join-Path $testRoot 'missing-b.exe')) } -Message 'Get-RepoToolPath did not throw when no candidates existed.'

    Write-Host "source2_package_pipeline validation passed ($passed assertions)." -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
