@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if not exist "%SCRIPT_DIR%config.local.json" copy /Y "%SCRIPT_DIR%config.sample.json" "%SCRIPT_DIR%config.local.json" >nul
if not exist "%SCRIPT_DIR%credentials.local.json" copy /Y "%SCRIPT_DIR%credentials.sample.json" "%SCRIPT_DIR%credentials.local.json" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Launch-ApiVerifierGui.ps1" -ConfigPath "%SCRIPT_DIR%config.local.json"
if errorlevel 1 (
  echo.
  echo Launch failed. Check config.local.json and credentials.local.json
  pause
)
endlocal
