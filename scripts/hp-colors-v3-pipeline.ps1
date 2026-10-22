# Shared HP Colors v3 compile/pack steps. Dot-sourced by build_hp_colors_rewrite_v3.ps1 (canonical)
# and the QOLLOCK and ShowRank lane wrappers after source2_package_pipeline.ps1.

# The exact canonical v3 pak02 asset contract; variant lanes add their own assets.
function Get-HpV3Assets {
    return @(
        'panorama/layout/hud_escape_menu.vxml_c',
        'panorama/layout/unit_status_overlay_v2.vxml_c',
        'panorama/layout/hp_colors_v3_relay.vxml_c',
        'panorama/layout/citadel_hud_top_bar.vxml_c',
        'panorama/images/hpv3/ultimate_progress.vtex_c',
        'panorama/scripts/hp_colors_v3_settings.vjs_c',
        'panorama/scripts/hp_colors_v3_world_settings.vjs_c',
        'panorama/scripts/hp_colors_v3_world_boot.vjs_c',
        'panorama/scripts/hp_colors_v3_from_v2.vjs_c',
        'panorama/scripts/hp_colors_v3_codec.vjs_c',
        'panorama/scripts/hp_colors_v3_storage.vjs_c',
        'panorama/scripts/hp_colors_v3_menu.vjs_c',
        'panorama/scripts/hp_colors_v3_preview.vjs_c',
        'panorama/scripts/hp_colors_v3_renderer.vjs_c',
        'panorama/scripts/hp_colors_v3_bridge.vjs_c',
        'panorama/scripts/hp_colors_v3_timers_world.vjs_c',
        'panorama/scripts/hp_colors_v3_timers_hud.vjs_c',
        'panorama/styles/hp_colors_v3_menu.vcss_c',
        'panorama/styles/hp_colors_v3_world.vcss_c',
        'panorama/styles/unit_status_v2.vcss_c'
    )
}

# Runs the v3 VM suite against the staged v3 tree (HPV3_SOURCE_ROOT/HPV3_DEBUG must already be set).
# A pass is recorded under hp_colors_rewrite_v3/.build/suite-pass/<key>, the key hashing every input
# (tools/suite-cache.js); the same staged tree, sources, tests and tooling are not tested twice, so the
# QOLLOCK and ShowRank wrappers reuse the canonical wrapper's pass. HPV3_SUITE_CACHE=0 always runs it.
function Invoke-HpV3Suite {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$StageSource,
        [Parameter(Mandatory = $true)][string]$Mode
    )
    $v3 = Join-Path $Root 'hp_colors_rewrite_v3'
    $key = (& node (Join-Path $v3 'tools\suite-cache.js') --key $StageSource $Mode | Select-Object -Last 1)
    if ($LASTEXITCODE -ne 0 -or $key -notmatch '^[0-9a-f]{64}$') { throw 'V3 suite cache key failed' }
    $passDir = Join-Path $v3 '.build\suite-pass'
    $marker = Join-Path $passDir $key
    if ($env:HPV3_SUITE_CACHE -ne '0' -and (Test-Path -LiteralPath $marker)) {
        Write-Host "HPV3 staged suite ($Mode): passed before for identical inputs $($key.Substring(0, 12)); not rerun (HPV3_SUITE_CACHE=0 forces it)"
        return
    }
    # Include every present/future suite; no staged exclusions are currently intentional.
    $testFiles = @(Get-ChildItem -LiteralPath (Join-Path $v3 'tests') -Filter '*.test.js' -File | Sort-Object Name | ForEach-Object { $_.FullName })
    & node --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Staged v3 VM tests failed' }
    New-Item -ItemType Directory -Path $passDir -Force | Out-Null
    Set-Content -LiteralPath $marker -Value ("{0} {1} {2}" -f (Get-Date -Format o), $Mode, $StageSource) -Encoding UTF8
}

# Compiles $StageSource (output: $Compiled), requires the exact asset set, packs $Vpk and requires the
# exact packed set.
function Invoke-HpV3CompileAndPack {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Stage,
        [Parameter(Mandatory = $true)][string]$StageSource,
        [Parameter(Mandatory = $true)][string]$Compiled,
        [Parameter(Mandatory = $true)][string]$Vpk,
        [Parameter(Mandatory = $true)][string[]]$Assets,
        [Parameter(Mandatory = $true)][string[]]$Forbidden,
        [Parameter(Mandatory = $true)][string]$VpkTool,
        [Parameter(Mandatory = $true)][string]$Viewer,
        [Parameter(Mandatory = $true)][string]$Label
    )
    $compiler = Join-Path $Root 'sr2compiler\New folder.exe'
    # Like the menu-gen prototype, capture the summary as well as checking required outputs.
    # Redirected Console.ReadKey throws AFTER success; that specific exit is not a compile failure.
    $stdout = Join-Path $Stage 'compile.stdout.log'
    $stderr = Join-Path $Stage 'compile.stderr.log'
    $proc = Start-Process -FilePath $compiler -ArgumentList "`"$StageSource`"" -NoNewWindow -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $proc.Handle
    # The compiler ends with "Press any key to exit..."; with redirected stdin it either crashes (known exit)
    # or, in some hosts, hangs there. Stop it once that line appears; success is still judged by summary + outputs.
    $deadline = (Get-Date).AddSeconds(180)
    $stoppedAtPrompt = $false
    while (-not $proc.HasExited) {
        if ((Get-Date) -gt $deadline) {
            Stop-Process -Id $proc.Id -Force
            throw 'Source 2 compiler timed out'
        }
        if ((Test-Path -LiteralPath $stdout) -and (Select-String -LiteralPath $stdout -SimpleMatch 'Press any key to exit' -Quiet)) {
            Start-Sleep -Seconds 2
            if (-not $proc.HasExited) {
                Stop-Process -Id $proc.Id -Force
                $proc.WaitForExit()
                $stoppedAtPrompt = $true
            }
            break
        }
        Start-Sleep -Milliseconds 500
    }
    $summary = Select-String -LiteralPath $stdout -Pattern 'compiled, \d+ failed' | Select-Object -Last 1
    $missing = @($Assets | Where-Object { -not (Test-Path -LiteralPath (Join-Path $Compiled $_)) })
    Write-Host "Compiler exit=$($proc.ExitCode); summary=$($summary.Line)"
    if ($missing.Count) { throw "Missing compiled outputs: $($missing -join ', ')" }
    if (-not $summary -or $summary.Line -notmatch '\b0 failed\b') { throw 'Missing success summary or compiler failures' }
    if ($stoppedAtPrompt) {
        Write-Host 'Stopped compiler left at its exit prompt after 0 failed and all required outputs.'
    }
    elseif ($proc.ExitCode -ne 0) {
        $errorText = [System.IO.File]::ReadAllText($stderr)
        if ($proc.ExitCode -ne -532462766 -or $errorText -notmatch 'System.InvalidOperationException' -or $errorText -notmatch 'System.ConsolePal.ReadKey') {
            throw "Unexpected compiler exit $($proc.ExitCode): $errorText"
        }
        Write-Host 'Accepted known redirected Console.ReadKey exit after 0 failed and all required outputs.'
    }
    $actual = @(Get-ChildItem -LiteralPath $Compiled -Recurse -File | ForEach-Object {
        $_.FullName.Substring($Compiled.Length + 1).Replace('\', '/')
    })
    if (@(Compare-Object ($Assets | Sort-Object) ($actual | Sort-Object)).Count) {
        throw "Compiled asset set differs from exact $Label contract: $($actual -join ', ')"
    }
    Invoke-VpkPack -VpkEditCli $VpkTool -InputDir $Compiled -OutputPath $Vpk
    $listing = @(Get-PackedVpkTree -VpkEditCli $VpkTool -VpkPath $Vpk -Source2ViewerPath $Viewer | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $listing | Set-Content -LiteralPath (Join-Path $Stage 'vpk-listing.full.txt')
    # Source2Viewer lists each full path followed by CRC/size metadata.
    $tree = @($listing | ForEach-Object { $_ -replace ' CRC:[0-9a-fA-F]+ size:\d+$', '' })
    Assert-PackedVpkAssets -Tree $tree -Required $Assets -Forbidden $Forbidden -Label $Label
    if (@(Compare-Object ($Assets | Sort-Object) ($tree | Sort-Object)).Count) {
        throw "VPK asset set differs from exact $Label contract: $($tree -join ', ')"
    }
    $tree | Set-Content -LiteralPath (Join-Path $Stage 'vpk-listing.txt')
    Write-Host "VPK exact asset set ($($tree.Count)):"
    $tree | ForEach-Object { Write-Host $_ }

}
