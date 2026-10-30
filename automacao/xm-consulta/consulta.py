"""O que o XM Consulta decide, sem tela e sem rede de verdade.

Transportadora nova entra em TRANSPORTADORAS com ativa=True depois de a extensao
saber consultar nela (ver extensao/fundo.js).

O CSV tem dado pessoal de cliente: nada daqui escreve nome ou telefone em log.
"""

import csv
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime

import requests

BACKEND_PADRAO = "https://sistema-backend-i4uh.onrender.com"
TIMEOUT = 90  # o Render pode estar acordando
# Rota so de leitura, atras de verificarNaoEntregador: entregador entra na conta
# mas nao passa daqui. Mesma regra das demais rotas de macro.
ROTA_ACESSO = "/macros/resumo"
INTERVALO_PADRAO = 0.5  # 2 consultas por segundo

CERTIFICADOS_DE_ANTIVIRUS = [
    r"C:\ProgramData\Avast Software\Avast\wscert.pem",
    r"C:\ProgramData\AVG\Antivirus\wscert.pem",
    r"C:\ProgramData\Kaspersky Lab\AVP\Data\Cert\(fake)Kaspersky Anti-Virus personal root certificate.cer",
    r"C:\ProgramData\ESET\ESET Security\Certs\root.pem",
]


@dataclass(frozen=True)
class Transportadora:
    chave: str
    nome: str
    url: str
    padrao: str
    ativa: bool


TRANSPORTADORAS = [
    Transportadora(
        "anjun", "Anjun",
        "https://newsupplier.anjunexpress.com/#/views/packageCenter/packageQuery",
        r"AJ\d{10,}", True),
    Transportadora("shopee", "Shopee", "", "", False),
    Transportadora("imile", "iMile", "", "", False),
]


class ErroDeConta(Exception):
    """Login recusado ou conta sem acesso; tentar de novo nao muda nada."""


class ErroDeServidor(Exception):
    pass


def bundle_de_certificados(pasta):
    """certifi mais a raiz do antivirus, se houver (mesmo caso do XM Vigia)."""
    import certifi

    extras = [c for c in CERTIFICADOS_DE_ANTIVIRUS if os.path.exists(c)]
    if not extras:
        return certifi.where()
    destino = os.path.join(pasta, "certificados.pem")
    partes = []
    for caminho in [certifi.where()] + extras:
        with open(caminho, "rb") as f:
            partes.append(f.read())
    with open(destino, "wb") as f:
        f.write(b"\n".join(partes))
    return destino


class Backend:
    """Mesmo acesso do XM Vigia: login do sistema, token no canal 'vigia'.

    Esse canal so abre as rotas /macros/ e nao derruba a sessao do site. O token
    fica so na memoria e a senha nao e guardada.
    """

    def __init__(self, url=BACKEND_PADRAO, verificar=True):
        self.url = url.rstrip("/")
        self.verificar = verificar
        self.token = None

    def entrar(self, usuario, senha):
        try:
            r = requests.post(
                f"{self.url}/login",
                json={"username": usuario, "password": senha, "canal": "vigia"},
                timeout=TIMEOUT, verify=self.verificar)
            corpo = r.json()
        except (requests.RequestException, ValueError) as e:
            raise ErroDeServidor(f"Não alcancei o sistema: {e}") from e

        if corpo.get("inativo"):
            raise ErroDeConta("Esse usuário está inativo.")
        if not corpo.get("success"):
            raise ErroDeConta("Usuário ou senha não confere.")
        if corpo.get("require_password_change"):
            raise ErroDeConta("A senha é temporária. Entre no site e troque.")
        if not corpo.get("token"):
            raise ErroDeServidor("O login passou, mas não veio token.")

        self.token = corpo["token"]
        self.conferir()
        return corpo.get("name") or corpo.get("username") or usuario

    def conferir(self):
        """O token ainda abre e a conta tem acesso? Roda antes de cada consulta."""
        try:
            r = requests.get(
                f"{self.url}{ROTA_ACESSO}",
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=TIMEOUT, verify=self.verificar)
        except requests.RequestException as e:
            raise ErroDeServidor(f"Não alcancei o sistema: {e}") from e
        if r.status_code in (401, 403):
            self.token = None
            raise ErroDeConta("Sessão vencida ou conta sem acesso. Entre de novo.")
        if r.status_code >= 400:
            raise ErroDeServidor(f"O sistema respondeu {r.status_code}.")


def extrair_codigos(texto, padrao):
    """Codigos unicos, na ordem colada, e quantos pedacos nao eram codigo."""
    codigos, vistos, ignorados = [], set(), 0
    for pedaco in re.split(r"[\s,;]+", texto or ""):
        if not pedaco:
            continue
        codigo = pedaco.upper()
        if not re.fullmatch(padrao, codigo, re.IGNORECASE):
            ignorados += 1
        elif codigo not in vistos:
            vistos.add(codigo)
            codigos.append(codigo)
    return codigos, ignorados


def link_whatsapp(telefone):
    d = re.sub(r"\D", "", str(telefone or ""))
    if len(d) in (10, 11):
        return f"https://wa.me/55{d}"
    if len(d) in (12, 13) and d.startswith("55"):
        return f"https://wa.me/{d}"
    return ""


def porcentagem(feitos, total):
    return int(feitos * 100 / total) if total else 0


def texto_tempo(segundos):
    s = max(0, round(segundos))
    return f"{s // 60} min {s % 60:02d} s" if s >= 60 else f"{s} s"


def _celula(valor):
    # Nome vem de fora: "=..." viraria formula ao abrir no Excel.
    texto = str(valor if valor is not None else "")
    return f"'{texto}" if texto[:1] in ("=", "+", "-", "@") else texto


COLUNAS = ["waybill", "status", "nome", "telefone", "whatsapp"]


def gravar_csv(pasta, transportadora, linhas, agora=None):
    os.makedirs(pasta, exist_ok=True)
    quando = (agora or datetime.now()).strftime("%Y-%m-%d_%H-%M-%S")
    caminho = os.path.join(pasta, f"{transportadora}-contatos-{quando}.csv")
    with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
        escritor = csv.writer(f, delimiter=";", quoting=csv.QUOTE_ALL)
        escritor.writerow(COLUNAS)
        for linha in linhas:
            escritor.writerow(_celula(linha.get(c, "")) for c in COLUNAS)
    return caminho


@dataclass
class Resultado:
    linhas: list = field(default_factory=list)
    pendentes: list = field(default_factory=list)
    erro: str = None
    parado: bool = False


def executar(transportadora, codigos, pedir, ao_avancar, parar,
             intervalo=INTERVALO_PADRAO, relogio=time.monotonic, dormir=time.sleep):
    """Consulta um codigo de cada vez e para no primeiro erro.

    Erro aqui costuma ser bloqueio da transportadora ou sessao vencida: insistir
    nos proximos so piora. O que ja veio fica, e o que faltou volta em pendentes.
    """
    res = Resultado()
    total = len(codigos)
    for i, codigo in enumerate(codigos):
        if parar.is_set():
            res.parado = True
            res.pendentes = codigos[i:]
            break
        inicio = relogio()
        try:
            r = pedir({"tipo": "consultar", "transportadora": transportadora, "codigo": codigo})
            if not r.get("ok"):
                raise RuntimeError(r.get("erro") or "A extensão não conseguiu consultar.")
        except Exception as e:
            res.erro = f"Parou em {codigo}: {e}"
            res.pendentes = codigos[i:]
            break
        dados = r.get("dados") or {}
        res.linhas.append({
            "waybill": codigo,
            "status": dados.get("status", ""),
            "nome": dados.get("nome", ""),
            "telefone": dados.get("telefone", ""),
            "whatsapp": link_whatsapp(dados.get("telefone")),
        })
        ao_avancar(i + 1, total)
        if i < total - 1:
            dormir(max(0, intervalo - (relogio() - inicio)))
    return res
