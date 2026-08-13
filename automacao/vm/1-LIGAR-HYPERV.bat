@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Este passo precisa de administrador. Confirme na janela do Windows...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0passo1.ps1" %*
pause
