#!/usr/bin/env python3
"""
Automação: iMile DS Portal → Backend GC Transportes
Baixa o relatório de remessas do dia e envia para /alimentar/upload
"""

import os
import sys
import time
import base64
import pandas as pd
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

# ── Configurações ──────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")

IMILE_EMAIL    = os.getenv("IMILE_EMAIL", "")
IMILE_PASSWORD = os.getenv("IMILE_PASSWORD", "")
BACKEND_URL    = os.getenv("BACKEND_URL", "").rstrip("/")
BACKEND_USER   = os.getenv("BACKEND_USER", "")
BACKEND_PASS   = os.getenv("BACKEND_PASS", "")
DOWNLOAD_DIR   = Path(__file__).parent / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

URL_RELATORIO = "https://ds.imile.com/#/DSOperation/WaybillManagement/dispatchWaybillQueryDs"
HOJE          = datetime.now().strftime("%Y-%m-%d")

# Mapeamento de colunas do Excel iMile → campos do backend
# Ajuste os nomes à esquerda se as colunas do arquivo tiverem nomes diferentes
COLUNAS = {
    "codigo_barras": ["waybill no", "waybill", "tracking no", "tracking number",
                      "order no", "barcode", "código de barras", "codigo"],
    "id_pacote":     ["parcel id", "package id", "id pacote", "id do pacote", "package no"],
    "cidade":        ["city", "cidade", "recipient city", "consignee city", "destination city"],
    "regiao":        ["region", "area", "zona", "regiao", "região", "district"],
    "cep":           ["zip", "zip code", "cep", "postal code", "postcode"],
    "destinatario":  ["consignee", "recipient", "consignee name", "destinatario", "destinatário", "receiver"],
}


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


# ── Autenticação no backend ────────────────────────────────────────────────────
def login_backend() -> str:
    if not BACKEND_URL or not BACKEND_USER:
        log("⚠ BACKEND_URL ou BACKEND_USER não configurados no .env")
        sys.exit(1)
    log(f"Autenticando no backend ({BACKEND_URL})...")
    r = requests.post(f"{BACKEND_URL}/login",
                      json={"username": BACKEND_USER, "password": BACKEND_PASS},
                      timeout=15)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        log("⚠ Login no backend falhou — verifique BACKEND_USER e BACKEND_PASS no .env")
        sys.exit(1)
    log("  → Login no backend OK.")
    return data["token"]


# ── Passo 1: Login iMile ───────────────────────────────────────────────────────
def fazer_login(page):
    log("Acessando portal iMile...")
    page.goto("https://ds.imile.com/#/login", wait_until="networkidle")
    time.sleep(2)

    # Preenche usuário
    for sel in ["input[name='username']", "input[type='email']",
                "input[placeholder*='mail']", "input[placeholder*='user']",
                ".el-input__inner"]:
        els = page.locator(sel).all()
        if els:
            els[0].fill(IMILE_EMAIL)
            break

    # Preenche senha
    page.locator("input[type='password']").first.fill(IMILE_PASSWORD)

    # Clica em Login
    for sel in ["button[type='submit']", "button:has-text('Login')",
                "button:has-text('Sign in')", ".login-btn"]:
        if page.locator(sel).count() > 0:
            page.locator(sel).first.click()
            break

    page.wait_for_load_state("networkidle")
    time.sleep(3)
    log("  → Login iMile OK.")


# ── Passo 2: Filtros ───────────────────────────────────────────────────────────
def configurar_filtros(page) -> bool:
    log("Acessando página de relatório...")
    page.goto(URL_RELATORIO, wait_until="networkidle")
    time.sleep(3)
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_01_pagina.png"))

    # Time Type → Received Time
    log("Selecionando 'Time Type' → 'Received Time'...")
    clicou = False
    for sel in ["text=Time Type", "[placeholder*='Time Type']",
                "label:has-text('Time Type') + div .el-select"]:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=3000):
                loc.click()
                clicou = True
                break
        except Exception:
            continue

    if not clicou:
        log("  ⚠ 'Time Type' não encontrado — veja debug_01_pagina.png")
        return False

    time.sleep(1)

    for sel in ["li:has-text('Received Time')",
                ".el-select-dropdown__item:has-text('Received Time')",
                "text=Received Time"]:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=3000):
                loc.click()
                log("  → 'Received Time' selecionado.")
                break
        except Exception:
            continue

    time.sleep(1)

    # Data: hoje → hoje
    log(f"Definindo data: {HOJE}...")
    _preencher_data(page, HOJE)
    time.sleep(1)
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_02_filtros.png"))
    return True


def _preencher_data(page, data_iso: str):
    inputs = page.locator(
        "input.el-input__inner[placeholder*='date'], "
        "input[placeholder*='Date'], input[placeholder*='Start'], "
        "input[placeholder*='End'], .el-date-editor input"
    ).all()

    for inp in inputs[:2]:
        try:
            inp.triple_click()
            inp.fill(data_iso)
            inp.press("Enter")
        except Exception:
            pass


# ── Passo 3: Pesquisar ─────────────────────────────────────────────────────────
def pesquisar(page):
    log("Clicando em 'Search'...")
    for sel in ["button:has-text('Search')", "button:has-text('Query')",
                ".search-btn", "button[type='submit']"]:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=3000):
                loc.click()
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
    for sel in ["button:has-text('Export')", ".export-btn"]:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=5000):
                loc.click()
                log("  → Export clicado.")
                break
        except Exception:
            continue

    time.sleep(2)
    page.screenshot(path=str(DOWNLOAD_DIR / "debug_04_modal_export.png"))

    # Create Latest Export File
    log("Clicando em 'Create Latest Export File'...")
    for sel in ["text=Create Latest Export File",
                "button:has-text('Create Latest')", "button:has-text('Create')"]:
        try:
            loc = page.locator(sel).first
            if loc.is_visible(timeout=5000):
                loc.click()
                log("  → 'Create Latest Export File' clicado.")
                break
        except Exception:
            continue

    time.sleep(3)

    # Aguarda e baixa o arquivo
    log("Aguardando arquivo (máx. 60s)...")
    arquivo = None

    for tentativa in range(12):
        for sel in ["button:has-text('Download')", "a:has-text('Download')",
                    "button:has-text('Export')", ".download-btn"]:
            try:
                loc = page.locator(sel).last
                if loc.is_visible(timeout=3000):
                    with page.expect_download(timeout=60000) as dl:
                        loc.click()
                    destino = DOWNLOAD_DIR / f"imile_{HOJE}.xlsx"
                    dl.value.save_as(str(destino))
                    log(f"  → Salvo: {destino.name}")
                    arquivo = destino
                    break
            except Exception:
                continue
        if arquivo:
            break
        log(f"  ... aguardando ({tentativa + 1}/12)")
        time.sleep(5)

    if not arquivo:
        log("⚠ Não foi possível baixar o arquivo — veja screenshots em downloads/")

    return arquivo


# ── Passo 5: Parsear Excel ─────────────────────────────────────────────────────
def _encontrar_coluna(colunas_df: list[str], candidatos: list[str]) -> str | None:
    colunas_lower = {c.lower().strip(): c for c in colunas_df}
    for cand in candidatos:
        if cand.lower() in colunas_lower:
            return colunas_lower[cand.lower()]
    return None


def parsear_pacotes(arquivo: Path) -> list[dict]:
    log("Lendo e parseando arquivo Excel...")
    try:
        if arquivo.suffix.lower() in [".xlsx", ".xls"]:
            df = pd.read_excel(arquivo, dtype=str)
        else:
            df = pd.read_csv(arquivo, dtype=str)
    except Exception as e:
        log(f"⚠ Erro ao ler arquivo: {e}")
        return []

    df = df.fillna("")
    cols = df.columns.tolist()
    log(f"  → Colunas encontradas: {cols}")

    # Mapeia colunas automaticamente
    mapa = {campo: _encontrar_coluna(cols, candidatos)
            for campo, candidatos in COLUNAS.items()}

    log(f"  → Mapeamento: {mapa}")

    pacotes = []
    for _, row in df.iterrows():
        p = {}
        for campo, col in mapa.items():
            p[campo] = str(row[col]).strip() if col and row[col] else None
        # Precisa de pelo menos código de barras ou id do pacote
        if p.get("codigo_barras") or p.get("id_pacote"):
            pacotes.append(p)

    log(f"  → {len(pacotes)} pacotes extraídos.")
    return pacotes


# ── Passo 6: Enviar ao backend ─────────────────────────────────────────────────
def enviar_backend(arquivo: Path, pacotes: list[dict], token: str):
    log("Enviando para o backend...")

    with open(arquivo, "rb") as f:
        conteudo_b64 = base64.b64encode(f.read()).decode("utf-8")

    mime = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            if arquivo.suffix.lower() == ".xlsx" else "text/csv")

    payload = {
        "transportadora":  "imile",
        "nome_arquivo":    arquivo.name,
        "conteudo_base64": conteudo_b64,
        "mime_type":       mime,
        "pacotes":         pacotes,
    }

    r = requests.post(
        f"{BACKEND_URL}/alimentar/upload",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )

    if r.status_code == 200:
        data = r.json()
        log(f"  → Enviado com sucesso! {data.get('pacotes_inseridos', '?')} pacotes inseridos.")
    else:
        log(f"  ⚠ Erro {r.status_code}: {r.text[:300]}")


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    if not IMILE_EMAIL or not IMILE_PASSWORD:
        print("ERRO: Preencha IMILE_EMAIL e IMILE_PASSWORD no arquivo .env")
        sys.exit(1)

    log(f"=== iMile → Backend | {datetime.now().strftime('%d/%m/%Y %H:%M')} ===")

    # Login no backend primeiro (falha rápido se credenciais erradas)
    token = login_backend()

    # Automação no portal iMile
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=300)
        ctx     = browser.new_context(accept_downloads=True)
        page    = ctx.new_page()
        try:
            fazer_login(page)
            if not configurar_filtros(page):
                log("Erro nos filtros. Encerrando.")
                return
            pesquisar(page)
            arquivo = exportar(page)
        finally:
            browser.close()

    if not arquivo or not arquivo.exists():
        log("Nenhum arquivo baixado. Encerrando.")
        return

    pacotes = parsear_pacotes(arquivo)
    if not pacotes:
        log("Nenhum pacote encontrado no arquivo. Verifique as colunas em COLUNAS no topo do script.")
        return

    enviar_backend(arquivo, pacotes, token)
    log("=== Concluído ===")


if __name__ == "__main__":
    main()
