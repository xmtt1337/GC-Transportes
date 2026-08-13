@echo off
REM Dois cliques aqui. O relatorio aparece na tela e fica salvo na Area de Trabalho.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0checar_maquina.ps1"
echo.
pause
