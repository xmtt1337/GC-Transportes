@echo off
rem Atualiza o kit (vigia + extensao) com a versao mais nova do GitHub. Ver atualizar_macros.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar_macros.ps1"
echo.
pause
