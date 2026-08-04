@echo off
cd /d "%~dp0"
python -c "import psycopg2" 2>nul || python -m pip install psycopg2-binary
python -c "import customtkinter, pyautogui, keyboard, win32gui" 2>nul || python -m pip install customtkinter pyautogui keyboard pywin32 pillow
python colador_neon.py
pause
