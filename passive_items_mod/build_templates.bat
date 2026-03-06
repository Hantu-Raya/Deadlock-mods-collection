@echo off
setlocal EnableDelayedExpansion

echo ========================================
echo   Passive Items Mod - Template Builder
echo   Range: -6%% to 25%%
echo ========================================
echo.

set "MOD_DIR=%~dp0"
set "TEMPLATE_DIR=%MOD_DIR%templates"
set "COMPILER=%MOD_DIR%compiler\Compiler.exe"

:: Create templates directory
if not exist "%TEMPLATE_DIR%" mkdir "%TEMPLATE_DIR%"

:: Build templates for -6 to 25
for /L %%M in (-6,1,25) do (
    echo Building template: margin_top = %%M%%
    
    :: Generate mod_settings_data.js with specific value
    (
        echo var MOD_SETTINGS_DATA = [ { mod_title: "Passive Items Position", setting_id: "hud_passive_items_margin_top", value: %%M } ];
    ) > "%MOD_DIR%panorama\scripts\mod_settings_data.js"
    
    :: Run compiler
    "%COMPILER%" "%MOD_DIR:~0,-1%"
    
    if errorlevel 1 (
        echo [ERROR] Failed to build template for %%M%%
    ) else (
        :: Copy and rename VPK
        if exist "%MOD_DIR%pak99_dir.vpk" (
            copy "%MOD_DIR%pak99_dir.vpk" "%TEMPLATE_DIR%\passive_items_mod_%%M.vpk" >nul
            echo   Created: passive_items_mod_%%M.vpk
        ) else (
            echo [WARNING] VPK not found for %%M%%
        )
    )
    
    echo.
)

echo ========================================
echo   Template build complete!
echo   Files location: %TEMPLATE_DIR%
echo ========================================
echo.
pause
