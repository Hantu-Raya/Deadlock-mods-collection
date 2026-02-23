$modDir = 'F:\Users\Shiv\Desktop\Deadlock-mods-collection\passive_items_mod'
$rootDir = 'F:\Users\Shiv\Desktop\Deadlock-mods-collection'
$compiler = "$modDir\compiler\Compiler.exe"
$templateDir = "$modDir\templates"
$jsFile = "$modDir\panorama\scripts\mod_settings_data.js"

Write-Host "Building Passive Items Mod Templates" -ForegroundColor Cyan
Write-Host "Range: -6% to 25%" -ForegroundColor Cyan
Write-Host ""

$success = 0
$failed = 0

for ($m = -6; $m -le 25; $m++) {
    Write-Host "Building template: margin = $m%" -NoNewline
    
    # Generate JS with specific value
    $js = "var MOD_SETTINGS_DATA = [ { mod_title: `"Passive Items Position`", setting_id: `"hud_passive_items_margin_top`", value: $m } ];"
    Set-Content -Path $jsFile -Value $js -Encoding Ascii
    
    # Run compiler
    $proc = Start-Process -FilePath $compiler -ArgumentList $modDir -PassThru -WindowStyle Hidden
    $proc.WaitForExit()
    
    $vpkSource = "$rootDir\pak99_dir.vpk"
    if ($proc.ExitCode -eq 0 -and (Test-Path $vpkSource)) {
        Move-Item $vpkSource "$templateDir\passive_items_mod_$m.vpk" -Force
        Write-Host " OK" -ForegroundColor Green
        $success++
    } else {
        Write-Host " FAIL" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "Build Complete: $success succeeded, $failed failed" -ForegroundColor Yellow
Write-Host "Templates location: $templateDir" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""

Get-ChildItem $templateDir -Filter "*.vpk" | Select-Object Name, @{N='SizeKB';E={[math]::Round($_.Length/1KB,2)}} | Format-Table -AutoSize
