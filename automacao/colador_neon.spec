# -*- mode: python ; coding: utf-8 -*-
# Gera o ColadorNeon.exe pra rodar em máquina sem Python:
#   python -m PyInstaller colador_neon.spec

from PyInstaller.utils.hooks import collect_data_files

# O customtkinter lê os temas (.json) e as fontes do disco em tempo de
# execução — sem empacotar esses dados o .exe sobe e morre sem desenhar nada.
extras = collect_data_files('customtkinter')

a = Analysis(
    ['colador_neon.py'],
    pathex=[],
    binaries=[],
    datas=[('logo-gc.ico', '.')] + extras,
    hiddenimports=['psycopg2', 'websockets', 'ponte_navegador'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ColadorNeon',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['logo-gc.ico'],
)
