#!/usr/bin/env python3
"""
Automação: iMile DS Portal → Google Sheets
Baixa o relatório de remessas do dia e cola em uma planilha Google.
"""

import os
import sys
import time
import pandas as pd
import gspread
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ── Configurações ──────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

IMILE_EMAIL    = os.getenv("IMILE_EMAIL", "")
IMILE_PASSWORD = os.getenv("IMILE_PASSWORD", "")
GOOGLE_CREDS   = Path(__file__).parent / os.getenv("GOOGLE_CREDENTIALS_FILE", "credenciais_google.json")
SHEET_NAME     = os.getenv("GOOGLE_SHEET_NAME", "iMile - Relatório Diário")
DOWNLOAD_DIR   = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

URL_RELATORIO  = "https://ds.imile.com/#/DSOperation/WaybillManagement/dispatchWaybillQueryDs"
HOJE           = datetime.now().strftime("%Y-%m-%d")
HOJE_DISPLAY   = datetime.now().strftime("%d/%m/%Y")

GOOGLE_SCOPES  = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


# ── Passo 1: Login ─────────────────────────────────────────────────────────────
def fazer_login(page):
    log("Acessando portal iMile...")
    page.goto("https://ds.imile.com/#/login", wait_until="networkidle")
    time.sleep(2)

    # Tenta preencher usuário/e-mail
    for sel in ["input[name='username']", "input[type='email']", "input[placeholder*='Email']",
                "input[placeholder*='email']", "input[placeholder*='user']", ".el-input__inner"]:
        if page.locator(sel).count() > 0:
            inputs = page.locator(sel).all()
            if inputs:
                inputs[0].fill(IMILE_EMAIL)
                break

    # Preenche senha
    page.locator("input[type='password']").first.fill(IMILE_PASSWORD)

    # Clica em Login
    for sel in ["button[type='submit']", "button:has-text('Login')", "button:has-text('Sign in')",
                ".login-btn", ".submit-btn"]:
        if page.locator(sel).count() > 0:
            page.locator(sel).first.click()
            break

    page.wait_for_load_state("networkidle")
    time.sleep(3)
    log("Login realizado.")


# ── Passo 2: Configurar filtros ────────────────────────────────────────────────
def configurar_filtros(page):
    log("Acessando página de relatório...")
    page.goto(URL_RELATORIO, wait_until="networkidle")
    time.sleep(3)

    # Clica no seletor "Time Type"
    log("Selecionando 'Time Type' → 'Received Time'...")
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_01_pagina.png"))

    # Tenta localizar o dropdown de Time Type
    seletores_time_type = [
        "text=Time Type",
        "[placeholder*='Time Type']",
        "label:has-text('Time Type') + div .el-select",
        ".el-select:near(:text('Time Type'))",
    ]
    clicou = False
    for sel in seletores_time_type:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=3000):
                locator.click()
                clicou = True
                log(f"  → Clicou em Time Type usando: {sel}")
                break
        except Exception:
            continue

    if not clicou:
        log("  ⚠ Não encontrou 'Time Type' — verifique debug_01_pagina.png")
        page.screenshot(path=str(DOWNLOAD_DIR / "debug_erro_time_type.png"))
        return False

    time.sleep(1)

    # Seleciona "Received Time"
    for sel in ["li:has-text('Received Time')", ".el-select-dropdown__item:has-text('Received Time')",
                "text=Received Time"]:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=3000):
                locator.click()
                log("  → 'Received Time' selecionado.")
                break
        except Exception:
            continue

    time.sleep(1)

    # Preenche data de início (hoje)
    log(f"Definindo data: {HOJE}...")
    _preencher_data(page, HOJE)

    time.sleep(1)
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_02_filtros.png"))
    return True


def _preencher_data(page, data_iso: str):
    """Tenta preencher os campos de data com a data fornecida (YYYY-MM-DD)."""
    data_fmt = datetime.strptime(data_iso, "%Y-%m-%d").strftime("%Y-%m-%d")

    # Muitos portais usam el-date-picker com dois inputs (início e fim)
    date_inputs = page.locator("input.el-input__inner[placeholder*='date'], "
                               "input[placeholder*='Date'], input[placeholder*='Start'], "
                               "input[placeholder*='End'], .el-date-editor input").all()

    if len(date_inputs) >= 2:
        for inp in date_inputs[:2]:
            try:
                inp.triple_click()
                inp.fill(data_fmt)
                inp.press("Enter")
            except Exception:
                pass
    elif len(date_inputs) == 1:
        date_inputs[0].triple_click()
        date_inputs[0].fill(data_fmt)
        date_inputs[0].press("Enter")
    else:
        log("  ⚠ Campos de data não encontrados — verifique debug_02_filtros.png")


# ── Passo 3: Pesquisar ─────────────────────────────────────────────────────────
def pesquisar(page):
    log("Clicando em 'Search'...")
    for sel in ["button:has-text('Search')", "button:has-text('Pesquisar')",
                "button:has-text('Query')", ".search-btn", "button[type='submit']"]:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=3000):
                locator.click()
                log("  → Pesquisa iniciada.")
                break
        except Exception:
            continue

    page.wait_for_load_state("networkidle")
    time.sleep(3)
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_03_resultados.png"))


# ── Passo 4: Exportar ──────────────────────────────────────────────────────────
def exportar(page) -> Path | None:
    log("Abrindo janela de exportação...")
    for sel in ["button:has-text('Export')", "button:has-text('Exportar')",
                ".export-btn", "button:has-text('导出')"]:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=5000):
                locator.click()
                log("  → Botão Export clicado.")
                break
        except Exception:
            continue

    time.sleep(2)
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_04_modal_export.png"))

    # Clica em "Create Latest Export File"
    log("Clicando em 'Create Latest Export File'...")
    for sel in ["text=Create Latest Export File", "button:has-text('Create Latest')",
                "button:has-text('Create')", ".create-btn"]:
        try:
            locator = page.locator(sel).first
            if locator.is_visible(timeout=5000):
                locator.click()
                log("  → 'Create Latest Export File' clicado.")
                break
        except Exception:
            continue

    time.sleep(3)
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_05_aguardando.png"))

    # Aguarda o arquivo ficar pronto e clica em Download/Export
    log("Aguardando arquivo ficar pronto (máx. 60s)...")
    arquivo_baixado = None

    for tentativa in range(12):
        for sel in ["button:has-text('Download')", "a:has-text('Download')",
                    "button:has-text('Export')", "text=Export", ".download-btn"]:
            try:
                locator = page.locator(sel).last
                if locator.is_visible(timeout=3000):
                    with page.expect_download(timeout=60000) as dl_info:
                        locator.click()
                    download = dl_info.value
                    destino = DOWNLOAD_DIR / f"imile_{HOJE}.xlsx"
                    download.save_as(str(destino))
                    log(f"  → Arquivo salvo: {destino}")
                    arquivo_baixado = destino
                    break
            except Exception:
                continue
        if arquivo_baixado:
            break
        log(f"  ... aguardando ({tentativa + 1}/12)")
        time.sleep(5)

    if not arquivo_baixado:
        log("⚠ Não foi possível baixar o arquivo. Verifique os screenshots em downloads/")

    return arquivo_baixado


# ── Passo 5: Upload para Google Sheets ────────────────────────────────────────
def upload_google_sheets(arquivo: Path):
    if not GOOGLE_CREDS.exists():
        log(f"⚠ Arquivo de credenciais não encontrado: {GOOGLE_CREDS}")
        log("  Consulte o arquivo CONFIGURAR_GOOGLE.md para instruções.")
        return

    log("Conectando ao Google Sheets...")
    creds = Credentials.from_service_account_file(str(GOOGLE_CREDS), scopes=GOOGLE_SCOPES)
    gc = gspread.authorize(creds)

    # Abre ou cria a planilha
    try:
        sh = gc.open(SHEET_NAME)
        log(f"  → Planilha encontrada: '{SHEET_NAME}'")
    except gspread.SpreadsheetNotFound:
        sh = gc.create(SHEET_NAME)
        # Compartilha com o e-mail do usuário para que ele possa acessar
        sh.share("cobrador10rs@gmail.com", perm_type="user", role="writer")
        log(f"  → Planilha criada e compartilhada: '{SHEET_NAME}'")

    # Nome da aba = data de hoje
    aba_nome = datetime.now().strftime("%d-%m-%Y")
    try:
        aba = sh.worksheet(aba_nome)
        aba.clear()
        log(f"  → Aba '{aba_nome}' encontrada — limpando dados anteriores.")
    except gspread.WorksheetNotFound:
        aba = sh.add_worksheet(title=aba_nome, rows=5000, cols=50)
        log(f"  → Aba '{aba_nome}' criada.")

    # Lê o arquivo baixado
    log("Lendo arquivo baixado...")
    try:
        if arquivo.suffix.lower() in [".xlsx", ".xls"]:
            df = pd.read_excel(arquivo, dtype=str)
        else:
            df = pd.read_csv(arquivo, dtype=str)
    except Exception as e:
        log(f"⚠ Erro ao ler arquivo: {e}")
        return

    df = df.fillna("")
    dados = [df.columns.tolist()] + df.values.tolist()

    log(f"  → {len(df)} linhas encontradas. Enviando para o Google Sheets...")
    aba.update(dados, value_input_option="USER_ENTERED")
    log(f"Planilha atualizada com sucesso!")
    log(f"Acesse: https://docs.google.com/spreadsheets/d/{sh.id}")


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    if not IMILE_EMAIL or not IMILE_PASSWORD:
        print("ERRO: Defina IMILE_EMAIL e IMILE_PASSWORD no arquivo .env")
        sys.exit(1)

    log(f"=== Iniciando automação iMile — {HOJE_DISPLAY} ===")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=300)
        ctx = browser.new_context(accept_downloads=True)
        page = ctx.new_page()

        try:
            fazer_login(page)
            ok = configurar_filtros(page)
            if not ok:
                log("Erro na configuração dos filtros. Encerrando.")
                browser.close()
                return
            pesquisar(page)
            arquivo = exportar(page)
        finally:
            browser.close()

    if arquivo and arquivo.exists():
        upload_google_sheets(arquivo)
    else:
        log("Nenhum arquivo para enviar ao Google Sheets.")

    log("=== Automação concluída ===")


if __name__ == "__main__":
    main()
