@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Launch-ApiVerifierGui.ps1" -ConfigPath "%SCRIPT_DIR%config.local.json"
endlocal

