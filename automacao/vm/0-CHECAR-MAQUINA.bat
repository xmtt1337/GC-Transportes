@echo off
REM Nao precisa de administrador - so olha e conta.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0passo0.ps1"
echo.
pause
