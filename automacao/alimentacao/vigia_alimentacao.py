"""VIGIA DA ALIMENTACAO - segunda metade do macro da alimentacao Shopee.

A extensao do Chrome (extensao-macros-spx) exporta a AT do dia e baixa o
arquivo. Dali pra frente ela nao alcanca nada: extensao nao le pasta nem fala
com banco. Este programa pega a partir da pasta de downloads.

O que ele faz, sozinho, sem janela:

    ve chegar  br_assignment_task_*.xlsx  na pasta de downloads
    espera o download terminar de verdade
    le o arquivo com o MESMO mapeamento de colunas que o site usa
    manda pra POST /macros/at-exportada  (tabela propria do macro)
    avisa na bandeja se deu certo ou nao

A CARGA NAO ENCOSTA NA at_exportada. Aquela tabela e alimentada a mao pela
equipe e sustenta a conferencia do dia; o macro tem tabela propria
(macro_at_exportada). A operacao continua exatamente como sempre foi.

Esse envio ACUMULA - nao apaga nada, nao atualiza nada. Cada rodada vira
linhas novas, mesmo pro mesmo pacote de uma exportacao anterior; e assim que
da pra ver como uma AT mudou ao longo do dia. "O que ainda falta pesquisar"
nao e uma marcacao (nao ha coluna pra isso): e uma pergunta feita na hora,
comparando quando o pacote apareceu pela ultima vez na AT com quando ele foi
pesquisado pela ultima vez.

POR QUE PASSA PELO BACKEND, E NAO DIRETO NO NEON
Escrever direto no banco seria menos codigo aqui e uma segunda verdade no
sistema: a rota confere se aquele arquivo ja entrou antes (pra retentativa de
rede nao duplicar a carga inteira), insere na transacao e confere o limite de
linhas. Duplicar isso em Python significaria manter os dois iguais pra sempre.

RODA ESCONDIDO - e isso e um risco conhecido: programa silencioso que falha
nao e notado. Por isso o icone fica VERMELHO ate o proximo envio dar certo, e
todo resultado vira aviso na bandeja e linha no registro.
"""

import gzip
import hashlib
import json
import logging
import os
import re
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler
from urllib.parse import parse_qs, quote, urlparse

import requests

import alimentacao_at as at

# ── onde as coisas moram ────────────────────────────────────────────────────
# Fora do repositorio: aqui dentro tem senha.
CONFIG_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "XM_Vigia")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")
ENVIADOS_PATH = os.path.join(CONFIG_DIR, "enviados.json")
LOG_PATH = os.path.join(CONFIG_DIR, "vigia.log")

BACKEND_PADRAO = "https://sistema-backend-i4uh.onrender.com"

# Vai junto do nome do arquivo no campo "arquivo" da at_exportada, que e o que
# o site mostra como procedencia da carga.
#
# Sem isso, uma carga automatica e uma carga que alguem subiu a mao ficam
# identicas na tela - as duas so dizem o nome do arquivo e o nome da conta. E
# quando o numero sai estranho, a primeira pergunta e sempre "isso veio de
# onde?". O campo so e exibido; nada no sistema decide nada a partir dele.
ORIGEM = "XM Vigia (automático)"

# Onde a carga entra. E /macros/at-exportada, NAO /shopee/at.
#
# A /shopee/at grava na at_exportada, que a equipe alimenta a mao e que sustenta
# a conferencia do dia. O macro escrevendo la substituia o trabalho de alguem
# sem avisar - de hora em hora, com o agendamento ligado. O macro tem tabela
# propria; a operacao continua exatamente como sempre foi.
ROTA_CARGA = "/macros/at-exportada"
ROTA_PESQUISADOS = "/macros/pedidos-pesquisados"
ROTA_BACKLOG = "/macros/backlog-shopee"
ROTA_PENDENTES = "/macros/at-exportada/pendentes"
# O que a tela Macros do sistema pediu pra rodar, e a agenda vigente (ver
# Backend.comandos). A extensao pergunta a cada ~30s.
ROTA_COMANDOS = "/macros/comandos"

# Onde cada relatorio entra. A chave e o tipo que alimentacao_at.ler_qualquer
# devolve (pelo cabecalho pra AT e pedidos pesquisados; pelo nome do arquivo
# pro backlog).
DESTINO = {"at": ROTA_CARGA, "pesquisados": ROTA_PESQUISADOS, "backlog": ROTA_BACKLOG}

# Porta do atendimento a extensao, so em 127.0.0.1.
#
# A extensao nao alcanca banco nem backend - ela so sabe mexer na tela do SPX.
# Quem tem o login e este programa. Mesmo arranjo do ColadorNeon: o programa e
# o cerebro, a extensao sao as maos. Assim a senha fica num lugar so.
PORTA_ATENDIMENTO = 49732

def _downloads_padrao():
    return os.path.join(os.path.expanduser("~"), "Downloads")

# De quanto em quanto tempo olha a pasta. Baixo o suficiente pra parecer
# instantaneo, alto o suficiente pra nao pesar em nada.
INTERVALO_S = 2
# Quanto tempo o arquivo precisa ficar parado antes de ser lido. O Chrome
# renomeia o .crdownload no fim, mas antivirus ainda mexe no arquivo depois.
ESPERA_PARADO_S = 3
# Tentativas de envio antes de desistir. Render dorme no plano free e demora
# quase um minuto pra acordar - desistir na primeira seria desistir do normal.
MAX_TENTATIVAS = 8
# Erro TEMPORARIO (rede fora, servidor 5xx) insiste bem mais: depois das 7
# esperas da lista abaixo cada nova tentativa espera o ultimo valor (10 min),
# entao 80 tentativas cobrem umas 12 horas - um turno inteiro.
MAX_TENTATIVAS_TEMPORARIO = 80
# Quanto tempo antes de o vigia abrir um arquivo ainda conta como "chegou
# agora". Serve pro download que aconteceu enquanto ele estava sendo
# reiniciado.
#
# A REGRA EXISTE porque "novo" nao pode significar so "nunca vi esse conteudo":
# no dia em que o filtro de nome abriu pra pegar o segundo relatorio, anos de
# download antigo viraram novidade de uma vez e foram todos pro banco. Arquivo
# so entra se chegou enquanto o vigia estava olhando.
GRACA_S = 3600
ESPERAS_S = [15, 30, 60, 120, 300, 300, 600]
# Um envio carrega o dia inteiro de uma estacao: dezenas de milhares de linhas.
TIMEOUT = (15, 420)
# A consulta de comandos e minuscula e roda de 30 em 30s: se o servidor nao
# responder, esperar 7 minutos (o TIMEOUT acima) so empilharia consultas
# presas. Um minuto cobre o Render acordando.
TIMEOUT_COMANDOS = (15, 60)
# Acima disto vale comprimir: o corpo e JSON repetitivo e encolhe umas 10x.
LIMITE_GZIP = 512 * 1024

PORTA_TRAVA = 49731   # so pra garantir um vigia por maquina

# Antivirus com "protecao web" fica no meio das conexoes HTTPS: ele abre a
# conexao, olha o conteudo e reapresenta com um certificado PROPRIO. Esse
# certificado esta na loja do Windows, mas nao no pacote do certifi que o
# requests usa por padrao - e ai todo envio morre com
# "unable to get local issuer certificate", como se o servidor estivesse fora.
#
# O sintoma engana: parece problema de rede ou de servidor, e nao e. Acontece
# numa maquina e nao na do lado, dependendo do antivirus instalado.
CERTIFICADOS_DE_ANTIVIRUS = [
    r"C:\ProgramData\Avast Software\Avast\wscert.pem",
    r"C:\ProgramData\AVG\Antivirus\wscert.pem",
    r"C:\ProgramData\Kaspersky Lab\AVP\Data\Cert\(fake)Kaspersky Anti-Virus personal root certificate.cer",
    r"C:\ProgramData\ESET\ESET Security\Certs\root.pem",
]
VARIAVEIS_DE_CERTIFICADO = ("REQUESTS_CA_BUNDLE", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS")


def caminhos_de_certificado(ambiente=None, existe=os.path.exists):
    """Os PEMs extras que esta maquina tem, sem repetir."""
    ambiente = os.environ if ambiente is None else ambiente
    achados = []
    for nome in VARIAVEIS_DE_CERTIFICADO:
        caminho = (ambiente.get(nome) or "").strip().strip('"')
        if caminho and existe(caminho):
            achados.append(caminho)
    achados.extend(c for c in CERTIFICADOS_DE_ANTIVIRUS if existe(c))

    saida = []
    vistos = set()
    for caminho in achados:
        chave = os.path.normcase(os.path.abspath(caminho))
        if chave not in vistos:
            vistos.add(chave)
            saida.append(caminho)
    return saida


def bundle_de_certificados():
    """certifi MAIS as raizes locais, num arquivo so.

    Os dois juntos, e nao so o do antivirus: quando ele nao esta no meio da
    conexao, quem vale e a lista normal. Um pacote com raiz demais so amplia o
    que se aceita como valido - o perigoso seria desligar a verificacao.
    """
    try:
        import certifi
        base = certifi.where()
    except ImportError:
        return True   # sem certifi, o requests que decida

    extras = caminhos_de_certificado()
    if not extras:
        return base

    destino = os.path.join(CONFIG_DIR, "certificados.pem")
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        partes = []
        for caminho in [base] + extras:
            with open(caminho, "rb") as f:
                partes.append(f.read())
        with open(destino, "wb") as f:
            f.write(b"\n".join(partes))
        return destino
    except OSError:
        log.warning("nao consegui montar o pacote de certificados; usando so o certifi")
        return base

log = logging.getLogger("vigia")


def preparar_log():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    log.setLevel(logging.INFO)
    if log.handlers:
        return
    arquivo = RotatingFileHandler(LOG_PATH, maxBytes=512 * 1024, backupCount=3, encoding="utf-8")
    arquivo.setFormatter(logging.Formatter("%(asctime)s  %(levelname)-7s %(message)s",
                                           datefmt="%Y-%m-%d %H:%M:%S"))
    log.addHandler(arquivo)
    if sys.stderr:
        log.addHandler(logging.StreamHandler())


# ── config ──────────────────────────────────────────────────────────────────
def carregar_config():
    padrao = {
        "usuario": "",
        "senha": "",
        "pasta": _downloads_padrao(),
        "backend": BACKEND_PADRAO,
    }
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            padrao.update(json.load(f))
    except (OSError, ValueError):
        pass
    return padrao


def salvar_json(caminho, dados):
    """Grava inteiro ou nao grava. Um config pela metade deixaria o programa
    sem login no dia seguinte, e sem nenhuma pista do porque."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    temporario = f"{caminho}.{os.getpid()}.tmp"
    with open(temporario, "w", encoding="utf-8") as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)
    os.replace(temporario, caminho)


def configurado(cfg):
    return bool(cfg.get("usuario") and cfg.get("senha") and cfg.get("pasta"))


# ── o que ja foi enviado ────────────────────────────────────────────────────
# A chave e o conteudo do arquivo, nao o nome.
#
# O Chrome renomeia duplicado pra "arquivo (1).xlsx": pelo nome, o mesmo
# relatorio baixado duas vezes iria pro banco duas vezes. E rodar o macro de
# novo mais tarde gera um arquivo DIFERENTE, que precisa mesmo ir - o que o
# nome sozinho nao distingue e o conteudo distingue.
def impressao(caminho):
    h = hashlib.sha1()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


class Registro:
    def __init__(self):
        self.itens = {}
        self.primeira_vez = not os.path.exists(ENVIADOS_PATH)
        try:
            with open(ENVIADOS_PATH, "r", encoding="utf-8") as f:
                self.itens = json.load(f)
        except (OSError, ValueError):
            self.itens = {}

    def tem(self, chave):
        return chave in self.itens

    def marcar(self, chave, **info):
        info["quando"] = time.strftime("%Y-%m-%d %H:%M:%S")
        self.itens[chave] = info
        # Teto: 7 dias de alimentacao sao uns poucos arquivos, mas o dicionario
        # nao pode crescer pra sempre numa maquina que nunca e reiniciada.
        if len(self.itens) > 400:
            antigos = sorted(self.itens.items(), key=lambda kv: kv[1].get("quando", ""))
            for chave_velha, _ in antigos[:100]:
                self.itens.pop(chave_velha, None)
        try:
            salvar_json(ENVIADOS_PATH, self.itens)
        except OSError:
            log.exception("nao consegui gravar o registro de enviados")


# ── backend ─────────────────────────────────────────────────────────────────
class ErroDeEnvio(Exception):
    """Falhou agora; tentar de novo faz sentido.

    `temporario` separa duas familias que pedem paciencias muito diferentes:
    rede fora do ar e servidor 5xx PASSAM SOZINHOS (segunda de manha o
    "Permission denied" de conexao durou uns 25 min e o vigia ja tinha
    desistido do arquivo - que ficou parado na pasta), entao vale insistir por
    horas. Recusa do servidor (413, 400...) nao passa: o mesmo arquivo vai ser
    recusado igual toda vez, e reenviar 14 MB a cada 10 min so gasta banda.
    """

    def __init__(self, mensagem, temporario=False):
        super().__init__(mensagem)
        self.temporario = temporario


class ErroDeConta(Exception):
    """Falhou por causa do usuario/senha; tentar de novo nao muda nada."""


class Backend:
    def __init__(self, ler_config):
        self.ler_config = ler_config
        self.token = None
        self.ca = bundle_de_certificados()

    def _url(self, rota):
        return self.ler_config().get("backend", BACKEND_PADRAO).rstrip("/") + rota

    def entrar(self):
        cfg = self.ler_config()
        try:
            r = requests.post(self._url("/login"),
                              json={"username": cfg["usuario"], "password": cfg["senha"]},
                              timeout=TIMEOUT, verify=self.ca)
        except requests.RequestException as e:
            raise ErroDeEnvio(f"nao alcancei o servidor: {e}", temporario=True) from e

        if r.status_code >= 500:
            raise ErroDeEnvio(f"servidor respondeu {r.status_code}", temporario=True)
        try:
            corpo = r.json()
        except ValueError as e:
            raise ErroDeEnvio("o servidor respondeu algo que nao e JSON") from e

        if not corpo.get("success"):
            if corpo.get("inativo"):
                raise ErroDeConta("esse usuario esta inativo no sistema")
            raise ErroDeConta("usuario ou senha nao confere")
        if corpo.get("require_password_change"):
            raise ErroDeConta("a senha desse usuario e temporaria - entre no site e troque")
        if not corpo.get("token"):
            raise ErroDeConta("o login passou mas nao veio token")

        self.token = corpo["token"]
        return corpo.get("name") or corpo.get("username") or cfg["usuario"]

    def _post(self, rota, corpo, comprimir=True):
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        cabecalhos = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        if comprimir and len(dados) > LIMITE_GZIP:
            dados = gzip.compress(dados, 6)
            cabecalhos["Content-Encoding"] = "gzip"
        try:
            return requests.post(self._url(rota), data=dados, headers=cabecalhos,
                                 timeout=TIMEOUT, verify=self.ca)
        except requests.RequestException as e:
            raise ErroDeEnvio(f"nao alcancei o servidor: {e}", temporario=True) from e

    def enviar(self, rota, nome_arquivo, linhas):
        corpo = {"arquivo": nome_arquivo, "linhas": linhas}

        for tentativa in (1, 2):
            if not self.token:
                self.entrar()
            r = self._post(rota, corpo)

            # Token invalido volta como 403 (server.js:196), nao 401. Uma
            # relogada resolve; se voltar de novo, e o papel da conta.
            if r.status_code in (401, 403) and tentativa == 1:
                self.token = None
                continue
            if r.status_code in (401, 403):
                raise ErroDeConta(
                    "o servidor recusou a conta - ela precisa ser da operacao, "
                    "nao de entregador")
            # Corpo comprimido recusado: manda de novo sem comprimir, pra nao
            # depender de como o servidor esta configurado hoje.
            if r.status_code in (400, 413, 415) and len(json.dumps(corpo)) > LIMITE_GZIP:
                r = self._post(rota, corpo, comprimir=False)
            if r.status_code >= 500:
                raise ErroDeEnvio(f"servidor respondeu {r.status_code}", temporario=True)
            try:
                resposta = r.json()
            except ValueError as e:
                raise ErroDeEnvio(f"resposta ilegivel do servidor ({r.status_code})") from e
            if not r.ok or resposta.get("error"):
                raise ErroDeEnvio(resposta.get("error") or f"servidor respondeu {r.status_code}")
            return resposta

        raise ErroDeEnvio("nao consegui autenticar")

    def pendentes(self, limite=10000):
        """Os codigos da AT que ainda nao foram pesquisados.

        E o que o macro de pedidos pesquisados cola na Pesquisa em lote do SPX.
        """
        for tentativa in (1, 2):
            if not self.token:
                self.entrar()
            try:
                r = requests.get(self._url(f"{ROTA_PENDENTES}?limite={int(limite)}"),
                                 headers={"Authorization": f"Bearer {self.token}"},
                                 timeout=TIMEOUT, verify=self.ca)
            except requests.RequestException as e:
                raise ErroDeEnvio(f"nao alcancei o servidor: {e}", temporario=True) from e

            if r.status_code in (401, 403) and tentativa == 1:
                self.token = None
                continue
            if r.status_code in (401, 403):
                raise ErroDeConta("o servidor recusou a conta")
            if not r.ok:
                raise ErroDeEnvio(f"servidor respondeu {r.status_code}")
            try:
                return r.json()
            except ValueError as e:
                raise ErroDeEnvio("resposta ilegivel do servidor") from e

        raise ErroDeEnvio("nao consegui autenticar")

    def _requisitar(self, metodo, rota, corpo=None):
        """GET/POST autenticado com uma relogada se o token venceu; devolve o JSON.

        Serve as consultas pequenas e frequentes (comandos). O envio das cargas
        tem o proprio caminho (enviar), com gzip e tentativas.
        """
        for tentativa in (1, 2):
            if not self.token:
                self.entrar()
            try:
                r = requests.request(metodo, self._url(rota), json=corpo,
                                     headers={"Authorization": f"Bearer {self.token}"},
                                     timeout=TIMEOUT_COMANDOS, verify=self.ca)
            except requests.RequestException as e:
                raise ErroDeEnvio(f"nao alcancei o servidor: {e}", temporario=True) from e

            if r.status_code in (401, 403) and tentativa == 1:
                self.token = None
                continue
            if r.status_code in (401, 403):
                raise ErroDeConta("o servidor recusou a conta")
            if r.status_code >= 500:
                raise ErroDeEnvio(f"servidor respondeu {r.status_code}", temporario=True)
            try:
                dados = r.json()
            except ValueError as e:
                raise ErroDeEnvio("resposta ilegivel do servidor") from e
            if not r.ok:
                raise ErroDeEnvio(dados.get("error") or f"servidor respondeu {r.status_code}")
            return dados

        raise ErroDeEnvio("nao consegui autenticar")

    def comandos(self):
        """O que a tela Macros pediu pra rodar e a agenda vigente.

        Devolve {"comandos": [{"id", "qual"}], "agenda": ...}. O servidor
        entrega cada comando UMA vez so: quem chama tem que repassar a extensao
        na mesma resposta, ou o pedido se perde.
        """
        return self._requisitar("GET", f"{ROTA_COMANDOS}/pendentes")

    def resultado_comando(self, id_comando, ok, erro=None):
        """Conta ao servidor se a extensao conseguiu iniciar o macro."""
        rota = f"{ROTA_COMANDOS}/{quote(str(id_comando), safe='')}/resultado"
        return self._requisitar("POST", rota, {"ok": bool(ok), "erro": erro})


# ── o vigia ─────────────────────────────────────────────────────────────────
class Pendente:
    def __init__(self, caminho, chave):
        self.caminho = caminho
        self.chave = chave
        self.tentativas = 0
        self.nao_antes = 0.0


class Vigia:
    def __init__(self, ler_config, avisar):
        self.ler_config = ler_config
        self.avisar = avisar
        self.parar = threading.Event()
        self.backend = Backend(ler_config)
        self.registro = Registro()
        self.fila = []
        self.trava = threading.Lock()
        self._tamanhos = {}
        self._impressoes = {}
        self.desde = time.time() - GRACA_S
        self.ultimo = "esperando arquivo"

    def comecar(self):
        # Na primeira vez, o que ja esta na pasta NAO vai: sao downloads de
        # antes do programa existir, e reenviar tudo substituiria a AT de hoje
        # pela de algum dia velho.
        if self.registro.primeira_vez:
            self._ignorar_o_que_ja_estava()
        for alvo in (self._olhar, self._trabalhar):
            threading.Thread(target=alvo, daemon=True).start()

    def encerrar(self):
        self.parar.set()

    # ── achar arquivo ───────────────────────────────────────────────────
    def _arquivos(self):
        pasta = self.ler_config().get("pasta") or ""
        try:
            nomes = os.listdir(pasta)
        except OSError:
            return []
        return [os.path.join(pasta, n) for n in nomes if at.eh_arquivo_alvo(n)]

    def _ignorar_o_que_ja_estava(self):
        for caminho in self._arquivos():
            try:
                self.registro.marcar(impressao(caminho), nome=os.path.basename(caminho),
                                     resultado="ja estava na pasta quando o vigia comecou")
            except OSError:
                continue
        log.info("primeira execucao: %d arquivo(s) que ja estavam na pasta foram ignorados",
                 len(self.registro.itens))

    def _parado(self, caminho):
        """O download terminou? Tamanho igual em duas olhadas e sem mexida
        recente. O .crdownload do Chrome nem chega aqui - nao casa com o
        filtro de extensao."""
        try:
            estado = os.stat(caminho)
        except OSError:
            return False
        if time.time() - estado.st_mtime < ESPERA_PARADO_S:
            self._tamanhos[caminho] = estado.st_size
            return False
        anterior = self._tamanhos.get(caminho)
        self._tamanhos[caminho] = estado.st_size
        return anterior == estado.st_size

    def _olhar(self):
        while not self.parar.is_set():
            try:
                self._varrer()
            except Exception:
                log.exception("erro ao varrer a pasta")
            self.parar.wait(INTERVALO_S)

    def _impressao_de(self, caminho):
        """O hash guardado enquanto o arquivo nao mudar.

        Sem isto o vigia releria do disco o arquivo inteiro - dezenas de MB -
        a cada duas segundos, pra sempre, so pra concluir que ele ja foi
        enviado.
        """
        estado = os.stat(caminho)
        marca = (estado.st_size, estado.st_mtime)
        guardado = self._impressoes.get(caminho)
        if guardado and guardado[0] == marca:
            return guardado[1]
        chave = impressao(caminho)
        self._impressoes[caminho] = (marca, chave)
        return chave

    def _chegou_agora(self, caminho):
        """Foi baixado enquanto o vigia estava olhando?

        Sem isto, qualquer mudanca no filtro de nome transforma a pasta inteira
        em novidade - foi o que aconteceu quando o segundo relatorio entrou e
        anos de download antigo foram parar no banco de uma vez.
        """
        try:
            return os.path.getmtime(caminho) >= self.desde
        except OSError:
            return False

    def _varrer(self):
        vistos = []
        for caminho in self._arquivos():
            vistos.append(caminho)
            if not self._chegou_agora(caminho):
                continue
            if not self._parado(caminho):
                continue
            try:
                chave = self._impressao_de(caminho)
            except OSError:
                continue
            if self.registro.tem(chave):
                continue
            with self.trava:
                if any(p.chave == chave for p in self.fila):
                    continue
                self.fila.append(Pendente(caminho, chave))
            log.info("arquivo novo: %s", os.path.basename(caminho))

        # O que saiu da pasta sai da memoria junto.
        for guardado in list(self._impressoes):
            if guardado not in vistos:
                self._impressoes.pop(guardado, None)
                self._tamanhos.pop(guardado, None)

    # ── enviar ──────────────────────────────────────────────────────────
    def _proximo(self):
        agora = time.time()
        with self.trava:
            for p in self.fila:
                if p.nao_antes <= agora:
                    return p
        return None

    def _tirar(self, pendente):
        with self.trava:
            if pendente in self.fila:
                self.fila.remove(pendente)

    def _adiar(self, pendente, segundos):
        pendente.nao_antes = time.time() + segundos

    def _trabalhar(self):
        while not self.parar.is_set():
            pendente = self._proximo()
            if pendente is None:
                self.parar.wait(1)
                continue
            try:
                self._processar(pendente)
            except Exception:
                log.exception("erro inesperado ao processar %s", pendente.caminho)
                self._tirar(pendente)

    def _processar(self, pendente):
        nome = os.path.basename(pendente.caminho)

        # Sem login o arquivo espera de gracas: nao gasta tentativa, porque o
        # que falta e alguem configurar, nao o servidor responder.
        if not configurado(self.ler_config()):
            self._adiar(pendente, 30)
            self.ultimo = "esperando usuario e senha"
            return

        try:
            tipo, linhas, faltando = at.ler_qualquer(pendente.caminho)
        except at.ArquivoInvalido as e:
            self._tirar(pendente)
            self.registro.marcar(pendente.chave, nome=nome, resultado=f"recusado: {e}")
            self.avisar("Arquivo recusado", f"{nome}\n{e}", erro=True)
            return
        except OSError as e:
            # Sumiu ou esta preso: tenta de novo daqui a pouco.
            self._adiar(pendente, 30)
            log.warning("nao consegui abrir %s: %s", nome, e)
            return

        # Nao e nenhum dos relatorios conhecidos. Isso NAO e erro: o filtro de
        # nome e generoso de proposito, e a pasta de downloads tem de tudo.
        # Alarme vermelho aqui ensinaria a ignorar alarme vermelho.
        if tipo is None:
            self._tirar(pendente)
            self.registro.marcar(pendente.chave, nome=nome, resultado="nao e relatorio conhecido")
            log.info("ignorado (nao e AT, pedidos pesquisados nem backlog): %s", nome)
            return

        numeros = at.resumo(linhas)
        estacoes = ", ".join(numeros["estacoes"]) or "sem estacao"
        if faltando:
            log.warning("colunas ausentes em %s (entram vazias): %s", nome, ", ".join(faltando))

        ROTULO_TIPO = {"at": "AT exportada", "pesquisados": "pedidos pesquisados", "backlog": "backlog"}
        rotulo = ROTULO_TIPO.get(tipo, tipo)
        if tipo == "at":
            detalhe = f"{numeros['ats']} ATs · {numeros['linhas']} linhas · {estacoes}"
        elif tipo == "pesquisados":
            detalhe = f"{numeros['linhas']} pedidos"
        else:
            detalhe = f"{numeros['linhas']} linhas"

        self.ultimo = f"enviando {nome}"
        # So na primeira: com a insistencia longa, um balao "Enviando" a cada
        # 10 min por horas viraria ruido.
        if pendente.tentativas == 0:
            self.avisar("Enviando", f"{nome}\n{rotulo}: {detalhe}")

        try:
            resposta = self.backend.enviar(DESTINO[tipo], f"{nome} — {ORIGEM}", linhas)
        except ErroDeConta as e:
            self._tirar(pendente)
            self.avisar("Login recusado", f"{e}\nAbra Configurar na bandeja.", erro=True)
            return
        except ErroDeEnvio as e:
            pendente.tentativas += 1
            limite = MAX_TENTATIVAS_TEMPORARIO if e.temporario else MAX_TENTATIVAS
            if pendente.tentativas >= limite:
                self._tirar(pendente)
                self.registro.marcar(pendente.chave, nome=nome, resultado=f"desisti: {e}")
                self.avisar("Nao consegui enviar", f"{nome}\n{e}\nUse 'Enviar um arquivo' pra tentar de novo.", erro=True)
                return
            espera = ESPERAS_S[min(pendente.tentativas - 1, len(ESPERAS_S) - 1)]
            self._adiar(pendente, espera)
            log.warning("tentativa %d de %s falhou (%s) - nova tentativa em %ds",
                        pendente.tentativas, nome, e, espera)
            self.ultimo = f"tentando de novo em {espera}s"
            return

        self._tirar(pendente)
        gravadas = resposta.get("gravadas", numeros["linhas"])

        # As duas tabelas ACUMULAM: nada e apagado nem atualizado, cada envio
        # vira linha nova. "ja_importado" e o backend dizendo que este arquivo
        # (pelo nome) ja tinha entrado antes - a retentativa do vigia depois
        # de uma resposta perdida no caminho, por exemplo. Sem isto, o aviso
        # diria "gravado" de novo pra um envio que nao gravou nada.
        if resposta.get("ja_importado"):
            self.ultimo = f"{nome} · já estava gravado"
            self.registro.marcar(pendente.chave, nome=nome, resultado=f"{rotulo}: já importado antes")
            self.avisar("Já estava gravado", f"{nome}\neste arquivo já tinha sido importado")
            return

        if tipo == "at":
            ats = resposta.get("ats", numeros["ats"])
            falta = resposta.get("a_pesquisar")
            resumo_texto = (f"{ats} ATs · {gravadas} linhas · {estacoes}" +
                            (f"\n{falta} a pesquisar" if falta is not None else ""))
            self.ultimo = f"AT: {ats} ATs às {time.strftime('%H:%M')}"
        elif tipo == "pesquisados":
            ligados = resposta.get("ligados_a_at", 0)
            resumo_texto = f"{gravadas} pedidos · {ligados} ligados a uma AT"
            self.ultimo = f"pesquisados: {gravadas} às {time.strftime('%H:%M')}"
        else:
            resumo_texto = f"{gravadas} linhas"
            self.ultimo = f"backlog: {gravadas} linhas às {time.strftime('%H:%M')}"

        self.registro.marcar(pendente.chave, nome=nome,
                             resultado=f"{rotulo}: {resumo_texto}".replace("\n", " · "))
        self.avisar("Alimentado", f"{nome}\n{resumo_texto}")

    # ── envio manual, pelo menu ─────────────────────────────────────────
    def enfileirar(self, caminho):
        try:
            chave = impressao(caminho)
        except OSError as e:
            self.avisar("Nao consegui abrir", str(e), erro=True)
            return
        with self.trava:
            self.fila = [p for p in self.fila if p.chave != chave]
            self.fila.append(Pendente(caminho, chave))
        log.info("envio manual: %s", os.path.basename(caminho))


# ── atendimento a extensao ──────────────────────────────────────────────────
# A extensao so sabe mexer na tela do SPX: nao alcanca banco nem backend, e
# guardar a senha do sistema dentro dela seria uma segunda copia da credencial
# pra manter em dia. Entao ela pergunta aqui.
#
# So escuta em 127.0.0.1 - nao aceita conexao de fora da maquina. E responde
# com o cabecalho de CORS que a extensao precisa; sem ele o Chrome bloqueia a
# resposta e o erro que aparece la e "failed to fetch", que nao conta nada.
# So aceita id no formato que o servidor gera (UUID): o caminho vira parte de
# uma URL do backend, e qualquer coisa fora disso nao e um comando dele.
ID_COMANDO = re.compile(
    r"^/comandos/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/resultado$")


class Atendimento(BaseHTTPRequestHandler):
    vigia = None

    def _responder(self, codigo, corpo):
        dados = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def do_OPTIONS(self):
        self._responder(204, {})

    def do_GET(self):
        caminho = urlparse(self.path)
        if caminho.path == "/ping":
            return self._responder(200, {"vigia": "de pe", "ultimo": self.vigia.ultimo})
        if caminho.path == "/comandos":
            return self._comandos()
        if caminho.path != "/pendentes":
            return self._responder(404, {"error": "nao conheco esse caminho"})

        limite = 10000
        try:
            pedido = parse_qs(caminho.query).get("limite", [""])[0]
            if pedido:
                limite = max(1, min(10000, int(pedido)))
        except ValueError:
            pass

        try:
            resposta = self.vigia.backend.pendentes(limite)
        except (ErroDeConta, ErroDeEnvio) as e:
            return self._responder(503, {"error": str(e)})
        except Exception as e:
            log.exception("erro ao buscar pendentes")
            return self._responder(500, {"error": str(e)})

        log.info("extensao pediu pendentes: %d de %d",
                 len(resposta.get("codigos", [])), resposta.get("total", 0))
        return self._responder(200, resposta)

    # A extensao pergunta aqui, de 30 em 30s, se a tela Macros pediu alguma
    # coisa. A resposta do servidor sai daqui direto pra ela: o comando so e
    # entregue UMA vez, entao nao pode parar no meio do caminho.
    def _comandos(self):
        try:
            resposta = self.vigia.backend.comandos()
        except (ErroDeConta, ErroDeEnvio) as e:
            return self._responder(503, {"error": str(e)})
        except Exception as e:
            log.exception("erro ao buscar comandos")
            return self._responder(500, {"error": str(e)})

        # So registra quando ha o que contar: de 30 em 30s, uma linha por
        # consulta seriam quase 3 mil por dia de nada.
        if resposta.get("comandos"):
            log.info("extensao recebeu comando(s) da tela Macros: %s",
                     ", ".join(c.get("qual", "?") for c in resposta["comandos"]))
        return self._responder(200, resposta)

    # A extensao conta aqui se conseguiu iniciar o macro; o vigia repassa ao
    # servidor, que mostra o resultado na tela Macros.
    def do_POST(self):
        # O corpo e lido ANTES de decidir a rota: responder e fechar com bytes
        # da requisicao ainda por ler faz o Windows resetar a conexao, e quem
        # chamou nao recebe nem o 404.
        try:
            tamanho = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            tamanho = 0
        bruto = self.rfile.read(min(tamanho, 8192)) if tamanho > 0 else b""

        achado = ID_COMANDO.match(urlparse(self.path).path)
        if not achado:
            return self._responder(404, {"error": "nao conheco esse caminho"})

        try:
            corpo = json.loads(bruto or b"{}")
            if not isinstance(corpo, dict):
                raise ValueError("corpo nao e objeto")
        except (ValueError, UnicodeDecodeError):
            return self._responder(400, {"error": "corpo ilegivel"})

        erro = str(corpo.get("error") or "")[:300] or None
        try:
            self.vigia.backend.resultado_comando(achado.group(1), corpo.get("ok"), erro)
        except (ErroDeConta, ErroDeEnvio) as e:
            return self._responder(503, {"error": str(e)})
        except Exception as e:
            log.exception("erro ao contar o resultado do comando")
            return self._responder(500, {"error": str(e)})

        if not corpo.get("ok"):
            log.info("comando %s nao rodou: %s", achado.group(1)[:8], erro)
        return self._responder(200, {"ok": True})

    def log_message(self, formato, *args):
        # O log padrao do http.server escreve no stderr, que num pythonw nao
        # existe - e escrever nele derruba o atendimento.
        pass


def abrir_atendimento(vigia):
    Atendimento.vigia = vigia
    try:
        servidor = ThreadingHTTPServer(("127.0.0.1", PORTA_ATENDIMENTO), Atendimento)
    except OSError as e:
        log.warning("nao consegui abrir a porta %d pra extensao: %s", PORTA_ATENDIMENTO, e)
        return None
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    log.info("atendendo a extensao em 127.0.0.1:%d", PORTA_ATENDIMENTO)
    return servidor


# ── iniciar com o Windows ───────────────────────────────────────────────────
CHAVE_RUN = r"Software\Microsoft\Windows\CurrentVersion\Run"
NOME_RUN = "XM Vigia Alimentacao"


def _comando_autostart():
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}"'
    # pythonw roda sem abrir janela preta de console.
    pythonw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    executavel = pythonw if os.path.exists(pythonw) else sys.executable
    return f'"{executavel}" "{os.path.abspath(__file__)}"'


def autostart_ligado():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, CHAVE_RUN) as chave:
            return bool(winreg.QueryValueEx(chave, NOME_RUN)[0])
    except OSError:
        return False


def ligar_autostart(ligar):
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, CHAVE_RUN, 0, winreg.KEY_SET_VALUE) as chave:
        if ligar:
            winreg.SetValueEx(chave, NOME_RUN, 0, winreg.REG_SZ, _comando_autostart())
        else:
            try:
                winreg.DeleteValue(chave, NOME_RUN)
            except OSError:
                pass


# ── bandeja ─────────────────────────────────────────────────────────────────
CORES = {
    "ok":          (34, 197, 94, 255),
    "erro":        (239, 68, 68, 255),
    "trabalhando": (249, 115, 22, 255),
    "sem_config":  (148, 163, 184, 255),
}


def desenhar_icone(estado):
    from PIL import Image, ImageDraw

    imagem = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    lapis = ImageDraw.Draw(imagem)
    lapis.rounded_rectangle((3, 3, 61, 61), radius=15, fill=CORES.get(estado, CORES["ok"]))
    branco = (255, 255, 255, 255)
    lapis.polygon([(32, 45), (18, 29), (26, 29), (26, 15), (38, 15), (38, 29), (46, 29)], fill=branco)
    lapis.rectangle((18, 49, 46, 54), fill=branco)
    return imagem


class App:
    def __init__(self):
        import customtkinter as ctk

        self.ctk = ctk
        self.cfg = carregar_config()
        self.estado = "ok" if configurado(self.cfg) else "sem_config"
        self.janela_aberta = None

        ctk.set_appearance_mode("dark")
        self.raiz = ctk.CTk()
        self.raiz.withdraw()

        self.vigia = Vigia(lambda: self.cfg, self.avisar)

        import pystray
        self.pystray = pystray
        self.icone = pystray.Icon("xm_vigia", desenhar_icone(self.estado),
                                  "XM Vigia — alimentação Shopee", self._menu())

    # ── avisos ──────────────────────────────────────────────────────────
    def avisar(self, titulo, texto, erro=False):
        log.log(logging.ERROR if erro else logging.INFO, "%s: %s", titulo, texto.replace("\n", " · "))
        self.estado = "erro" if erro else "ok"
        try:
            self.icone.icon = desenhar_icone(self.estado)
            self.icone.title = f"XM Vigia — {self.vigia.ultimo}"[:127]
            self.icone.notify(texto, titulo)
            self.icone.update_menu()
        except Exception:
            # Bandeja e aviso: se o Windows recusar, o registro ja guardou.
            log.debug("nao consegui avisar na bandeja", exc_info=True)

    # ── menu ────────────────────────────────────────────────────────────
    def _menu(self):
        item = self.pystray.MenuItem
        return self.pystray.Menu(
            item(lambda _: f"Pasta: {os.path.basename(self.cfg.get('pasta') or '—')}", None, enabled=False),
            item(lambda _: f"Situação: {self.vigia.ultimo}", None, enabled=False),
            self.pystray.Menu.SEPARATOR,
            item("Enviar um arquivo…", self._escolher_arquivo),
            item("Abrir a pasta vigiada", self._abrir_pasta),
            item("Abrir o registro", self._abrir_registro),
            self.pystray.Menu.SEPARATOR,
            item("Configurar…", self._abrir_config),
            item("Iniciar com o Windows", self._alternar_autostart,
                 checked=lambda _: autostart_ligado()),
            self.pystray.Menu.SEPARATOR,
            item("Sair", self._sair),
        )

    def _na_interface(self, funcao):
        """Tkinter so aceita ordem da thread dele; o menu roda na thread da
        bandeja. Tudo que abre janela passa por aqui."""
        self.raiz.after(0, funcao)

    def _escolher_arquivo(self):
        self._na_interface(self._dialogo_arquivo)

    def _dialogo_arquivo(self):
        from tkinter import filedialog
        caminho = filedialog.askopenfilename(
            title="Arquivo da AT exportada",
            initialdir=self.cfg.get("pasta") or _downloads_padrao(),
            filetypes=[("Planilha da AT", "*.xlsx *.csv"), ("Todos", "*.*")])
        if caminho:
            self.vigia.enfileirar(caminho)

    def _abrir_pasta(self):
        pasta = self.cfg.get("pasta") or _downloads_padrao()
        if os.path.isdir(pasta):
            os.startfile(pasta)
        else:
            self.avisar("Pasta não existe", pasta, erro=True)

    def _abrir_registro(self):
        if os.path.exists(LOG_PATH):
            os.startfile(LOG_PATH)

    def _alternar_autostart(self):
        try:
            ligar_autostart(not autostart_ligado())
            self.icone.update_menu()
        except OSError as e:
            self.avisar("Não consegui mexer no início automático", str(e), erro=True)

    def _sair(self):
        self.vigia.encerrar()
        self.icone.stop()
        self.raiz.after(0, self.raiz.quit)

    # ── janela de configuração ──────────────────────────────────────────
    def _abrir_config(self):
        self._na_interface(self._janela_config)

    def _janela_config(self):
        if self.janela_aberta is not None and self.janela_aberta.winfo_exists():
            self.janela_aberta.focus_force()
            return

        ctk = self.ctk
        janela = ctk.CTkToplevel(self.raiz)
        self.janela_aberta = janela
        janela.title("XM Vigia — alimentação Shopee")
        janela.geometry("460x420")
        janela.resizable(False, False)
        janela.attributes("-topmost", True)

        ctk.CTkLabel(janela, text="Alimentação Shopee",
                     font=ctk.CTkFont(size=17, weight="bold")).pack(pady=(18, 0))
        ctk.CTkLabel(janela, text="A conta precisa ser da operação — entregador não pode alimentar.",
                     text_color="#94a3b8", font=ctk.CTkFont(size=11)).pack(pady=(2, 12))

        campos = ctk.CTkFrame(janela, fg_color="transparent")
        campos.pack(fill="x", padx=22)

        def linha(rotulo, valor, **kwargs):
            ctk.CTkLabel(campos, text=rotulo, anchor="w",
                         font=ctk.CTkFont(size=11)).pack(fill="x", pady=(8, 2))
            entrada = ctk.CTkEntry(campos, height=34, **kwargs)
            entrada.insert(0, valor or "")
            entrada.pack(fill="x")
            return entrada

        usuario = linha("Usuário do sistema", self.cfg.get("usuario"))
        senha = linha("Senha", self.cfg.get("senha"), show="•")
        pasta = linha("Pasta vigiada", self.cfg.get("pasta"))

        ctk.CTkButton(campos, text="Escolher pasta…", height=28, width=120,
                      fg_color="#334155", hover_color="#475569",
                      command=lambda: self._escolher_pasta(janela, pasta)).pack(anchor="e", pady=(6, 0))

        aviso = ctk.CTkLabel(janela, text="", font=ctk.CTkFont(size=11), wraplength=410)
        aviso.pack(pady=(12, 0))

        botao = ctk.CTkButton(janela, text="Testar e salvar", height=38,
                              fg_color="#ee4d2d", hover_color="#d8431f")
        botao.pack(pady=(10, 0), padx=22, fill="x")

        def salvar():
            novo = dict(self.cfg)
            novo["usuario"] = usuario.get().strip()
            novo["senha"] = senha.get()
            novo["pasta"] = pasta.get().strip() or _downloads_padrao()
            if not novo["usuario"] or not novo["senha"]:
                aviso.configure(text="Falta usuário ou senha.", text_color="#f87171")
                return
            if not os.path.isdir(novo["pasta"]):
                aviso.configure(text="Essa pasta não existe.", text_color="#f87171")
                return

            botao.configure(state="disabled", text="Testando…")
            aviso.configure(text="Falando com o servidor (pode demorar se ele estiver dormindo)…",
                            text_color="#94a3b8")

            def tentar():
                try:
                    quem = Backend(lambda: novo).entrar()
                    resultado = ("ok", f"Entrou como {quem}. Vigiando {novo['pasta']}.")
                except (ErroDeConta, ErroDeEnvio) as e:
                    resultado = ("erro", str(e))
                janela.after(0, lambda: terminar(resultado))

            def terminar(resultado):
                tipo, texto = resultado
                botao.configure(state="normal", text="Testar e salvar")
                if tipo == "erro":
                    aviso.configure(text=texto, text_color="#f87171")
                    return
                self.cfg = novo
                salvar_json(CONFIG_PATH, novo)
                self.vigia.backend.token = None
                self.estado = "ok"
                self.icone.icon = desenhar_icone("ok")
                self.icone.update_menu()
                aviso.configure(text=texto, text_color="#4ade80")
                janela.after(1200, fechar)

            threading.Thread(target=tentar, daemon=True).start()

        def fechar():
            self.janela_aberta = None
            janela.destroy()

        botao.configure(command=salvar)
        janela.protocol("WM_DELETE_WINDOW", fechar)

    def _escolher_pasta(self, janela, entrada):
        from tkinter import filedialog
        escolhida = filedialog.askdirectory(
            title="Pasta onde o Chrome salva os downloads",
            initialdir=entrada.get() or _downloads_padrao(), parent=janela)
        if escolhida:
            entrada.delete(0, "end")
            entrada.insert(0, os.path.normpath(escolhida))

    # ── vida ────────────────────────────────────────────────────────────
    def rodar(self):
        self.vigia.comecar()
        abrir_atendimento(self.vigia)
        threading.Thread(target=self.icone.run, daemon=True).start()
        if not configurado(self.cfg):
            self.raiz.after(600, self._janela_config)
        log.info("vigia de pe — pasta: %s", self.cfg.get("pasta"))
        self.raiz.mainloop()


def travar_instancia():
    """Um vigia por maquina. Dois mandariam o mesmo arquivo duas vezes, e o
    segundo envio apagaria o que o primeiro gravou."""
    tomada = socket.socket()
    try:
        tomada.bind(("127.0.0.1", PORTA_TRAVA))
        tomada.listen(1)
        return tomada
    except OSError:
        return None


def main():
    preparar_log()
    trava = travar_instancia()
    if trava is None:
        log.info("ja tem um vigia rodando nesta maquina - saindo")
        return
    try:
        App().rodar()
    finally:
        trava.close()


if __name__ == "__main__":
    main()
