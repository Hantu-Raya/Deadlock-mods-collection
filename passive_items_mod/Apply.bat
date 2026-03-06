@echo off
setlocal EnableDelayedExpansion

echo.
echo  ========================================
echo    Simple Mod Compiler
echo  ========================================
echo.

:: Check for .NET 9.0 Runtime
set "DOTNET_OK=0"
for /f "tokens=*" %%i in ('dotnet --list-runtimes 2^>nul ^| findstr "Microsoft.NETCore.App 9."') do (
    set "DOTNET_OK=1"
)

if "%DOTNET_OK%"=="0" (
    echo  [ERROR] .NET 9.0 Runtime is not installed!
    echo.
    echo  Please download and install it from:
    echo  https://dotnet.microsoft.com/en-us/download/dotnet/thank-you/runtime-desktop-9.0.13-windows-x64-installer
    echo.
    echo  Opening browser to download page...
    start "" "https://dotnet.microsoft.com/en-us/download/dotnet/thank-you/runtime-desktop-9.0.13-windows-x64-installer"
    pause
    exit /b 1
)

set "MOD_DIR=%~dp0"
set "SETTINGS_FILE=%MOD_DIR%settings.json"
set "JS_OUT=%MOD_DIR%panorama\scripts\mod_settings_data.js"
set "COMPILER=%MOD_DIR%compiler\Compiler.exe"
set "PREF_FILE=%MOD_DIR%compiler\pref.json"

:: Check required files
if not exist "%SETTINGS_FILE%" (
    echo  [ERROR] settings.json not found!
    echo  Please run "Configure Mod.html" and save the settings file first.
    pause
    exit /b 1
)

:: Generate JS from JSON using PowerShell
echo  [1/2] Reading settings...

:: Use a temporary PowerShell script to avoid escaping hell
set "PS_SCRIPT=%TEMP%\mod_gen_%RANDOM%.ps1"
(
    echo $ErrorActionPreference = 'Stop'
    echo $json = Get-Content -LiteralPath '%SETTINGS_FILE%' ^| ConvertFrom-Json
    echo $val = $json.hud_passive_items_margin_top
    echo $js = 'var MOD_SETTINGS_DATA = [ { mod_title: "Passive Items Position", setting_id: "hud_passive_items_margin_top", value: ' + $val + ' } ];'
    echo Set-Content -Path '%JS_OUT%' -Value $js -Encoding Ascii
) > "%PS_SCRIPT%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
if errorlevel 1 (
    echo  [ERROR] Failed to process settings.json
    del "%PS_SCRIPT%"
    pause
    exit /b 1
)
del "%PS_SCRIPT%"

echo    Generated mod_settings_data.js

:: Auto-detect game and compile
echo  [2/2] Compiling...

set "GAME_DIR="
set "GAME_ID="

:: Try registry first (most reliable)
for /f "tokens=2*" %%A in ('reg query "HKCU\Software\Valve\Steam" /v SteamPath 2^>nul') do set "STEAM_PATH=%%B"
if defined STEAM_PATH (
    set "STEAM_PATH=!STEAM_PATH:/=\!"
    if exist "!STEAM_PATH!\steamapps\common\dota 2 beta\game\bin\win64\resourcecompiler.exe" (
        set "GAME_DIR=!STEAM_PATH!\steamapps\common\dota 2 beta"
        set "GAME_ID=deadlock"
    )
    if not defined GAME_DIR if exist "!STEAM_PATH!\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\resourcecompiler.exe" (
        set "GAME_DIR=!STEAM_PATH!\steamapps\common\Counter-Strike Global Offensive"
        set "GAME_ID=cs2"
    )
)

:: Fallback to common paths if registry failed
if not defined GAME_DIR (
    set "STEAM_PATHS=C:\Program Files (x86)\Steam E:\SteamLibrary D:\SteamLibrary D:\steam"
    for %%S in (!STEAM_PATHS!) do (
        if not defined GAME_DIR (
            if exist "%%S\steamapps\common\dota 2 beta\game\bin\win64\resourcecompiler.exe" (
                set "GAME_DIR=%%S\steamapps\common\dota 2 beta"
                set "GAME_ID=deadlock"
            )
        )
        if not defined GAME_DIR (
            if exist "%%S\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\resourcecompiler.exe" (
                set "GAME_DIR=%%S\steamapps\common\Counter-Strike Global Offensive"
                set "GAME_ID=cs2"
            )
        )
    )
)

if defined GAME_DIR (
    set "GAME_DIR_FWD=!GAME_DIR:\=/!"
    > "%PREF_FILE%" echo { "directory": "!GAME_DIR_FWD!", "vpkeditcli": "vpkeditcli.exe", "game": "!GAME_ID!" }
    echo    Found game at: !GAME_DIR! [!GAME_ID!]
) else (
    echo    [WARNING] Could not auto-detect game. Using existing pref.json if available.
)

:: Run Compiler
"%COMPILER%" "%MOD_DIR:~0,-1%"
if errorlevel 1 (
    echo.
    echo  [ERROR] Compiler failed.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo    Done!
echo  ========================================
echo.
if /I "%CI%"=="true" exit /b 0
pause
