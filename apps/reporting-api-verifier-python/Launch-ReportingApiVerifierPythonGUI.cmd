@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if not exist "%SCRIPT_DIR%config.local.json" copy /Y "%SCRIPT_DIR%config.sample.json" "%SCRIPT_DIR%config.local.json" >nul
if not exist "%SCRIPT_DIR%credentials.local.json" copy /Y "%SCRIPT_DIR%credentials.sample.json" "%SCRIPT_DIR%credentials.local.json" >nul

where python >nul 2>nul
if %errorlevel%==0 (
  python "%SCRIPT_DIR%launch.py" --config "%SCRIPT_DIR%config.local.json"
) else (
  py -3 "%SCRIPT_DIR%launch.py" --config "%SCRIPT_DIR%config.local.json"
)

if errorlevel 1 (
  echo.
  echo Launch failed. Check Python installation and config.local.json / credentials.local.json
  pause
)

endlocal
