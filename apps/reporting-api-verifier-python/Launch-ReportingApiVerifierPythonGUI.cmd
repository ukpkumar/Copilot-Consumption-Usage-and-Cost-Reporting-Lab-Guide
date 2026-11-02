@echo off
setlocal
set "SCRIPT_DIR=%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
  python "%SCRIPT_DIR%launch.py" --config "%SCRIPT_DIR%config.local.json"
) else (
  py -3 "%SCRIPT_DIR%launch.py" --config "%SCRIPT_DIR%config.local.json"
)

endlocal

