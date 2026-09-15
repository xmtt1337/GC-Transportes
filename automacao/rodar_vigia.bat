@echo off
cd /d "%~dp0"
python -c "import requests, openpyxl, pystray, PIL, customtkinter" 2>nul || python -m pip install requests openpyxl pystray pillow customtkinter
rem pythonw: sem janela de console. O programa vive no icone da bandeja.
start "" pythonw vigia_alimentacao.py
