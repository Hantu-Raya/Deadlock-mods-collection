# Prototype (ticket 10): compile the preview fragment, its stylesheet and scripts with the repo's
# Source 2 compiler, the same way prototypes/menu-gen/compile.ps1 does. The renderer prototype is
# staged under the name the fragment includes. No VPK pack, no deploy, no game launch.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = (Resolve-Path (Join-Path $here '..\..\..')).Path
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')

$compiler = Join-Path $root 'sr2compiler\New folder.exe'
$stageRoot = Join-Path $here '.stage'
$stageSource = Join-Path $stageRoot 'hpc3_preview'
$stageOutput = Join-Path $stageRoot 'hpc3_preview_compiled'
$log = Join-Path $here 'compile.log'
$required = @(
    (Join-Path $stageOutput 'panorama\layout\hp_colors_v3_preview.vxml_c'),
    (Join-Path $stageOutput 'panorama\styles\hp_colors_v3_preview.vcss_c'),
    (Join-Path $stageOutput 'panorama\scripts\hp_colors_v3_preview.vjs_c'),
    (Join-Path $stageOutput 'panorama\scripts\hp_colors_v3_renderer_prototype.vjs_c')
)

if (Test-Path -LiteralPath $stageRoot) { Remove-TreeUnderRoot -Path $stageRoot -RootPath $here -ExpectedLeaf '.stage' }
New-Item -ItemType Directory -Path (Join-Path $stageSource 'panorama\scripts') -Force | Out-Null
Copy-Item -Path (Join-Path $here 'panorama\*') -Destination (Join-Path $stageSource 'panorama') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $here '..\renderer\renderer.js') `
    -Destination (Join-Path $stageSource 'panorama\scripts\hp_colors_v3_renderer_prototype.js') -Force

# Redirected stdin makes the tool's trailing Console.ReadKey() throw, so a nonzero exit after
# "OK: N compiled, 0 failed" is expected; success is judged by outputs + summary.
$errLog = Join-Path $stageRoot 'compile.stderr.log'
$proc = Start-Process -FilePath $compiler -ArgumentList "`"$stageSource`"" -NoNewWindow -PassThru `
    -RedirectStandardOutput $log -RedirectStandardError $errLog
$null = $proc.Handle  # needed for ExitCode with -NoNewWindow
if (-not $proc.WaitForExit(180000)) { Stop-Process -Id $proc.Id -Force; throw 'compiler timed out' }
if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog | Add-Content -LiteralPath $log }

$summary = Select-String -LiteralPath $log -Pattern 'compiled, \d+ failed' | Select-Object -Last 1
$missing = @($required | Where-Object { -not (Test-Path -LiteralPath $_) })
Write-Host "compiler exit code: $($proc.ExitCode)"
Write-Host "summary: $($summary.Line)"
foreach ($file in $required) {
    if (Test-Path -LiteralPath $file) { Write-Host ("{0}  {1} bytes  sha256 {2}" -f $file.Substring($here.Length + 1), (Get-Item -LiteralPath $file).Length, (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash) }
}
if ($missing.Count) { throw "missing compiled output: $($missing -join ', ')" }
if (-not $summary -or $summary.Line -notmatch '\b0 failed') { throw 'compiler summary missing or reports failures' }
Write-Host 'COMPILE OK'
