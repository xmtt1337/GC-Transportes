@echo off
cd /d "%~dp0"
python -c "import requests, certifi, websockets, customtkinter" 2>nul || python -m pip install requests certifi websockets customtkinter
start "" pythonw xm_consulta.py
