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

Esse envio SUBSTITUI a AT das estacoes que vierem no arquivo - e a foto de
agora, nao historico. Quem faz a troca e o backend, numa transacao so: se
falhar no meio, o que estava la continua valendo. O que atravessa a
substituicao e a memoria de quando cada codigo apareceu e se ele ja foi
pesquisado - e disso que o macro seguinte depende.

POR QUE PASSA PELO BACKEND, E NAO DIRETO NO NEON
Escrever direto no banco seria menos codigo aqui e uma segunda verdade no
sistema: a rota apaga e insere na mesma transacao, confere o limite de linhas
e carimba quem importou. Duplicar isso em Python significaria manter os dois
iguais pra sempre.

RODA ESCONDIDO - e isso e um risco conhecido: programa silencioso que falha
nao e notado. Por isso o icone fica VERMELHO ate o proximo envio dar certo, e
todo resultado vira aviso na bandeja e linha no registro.
"""

import gzip
import hashlib
import json
import logging
import os
import socket
import sys
import threading
import time
from logging.handlers import RotatingFileHandler

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
ESPERAS_S = [15, 30, 60, 120, 300, 300, 600]
# Um envio carrega o dia inteiro de uma estacao: dezenas de milhares de linhas.
TIMEOUT = (15, 420)
# Acima disto vale comprimir: o corpo e JSON repetitivo e encolhe umas 10x.
LIMITE_GZIP = 512 * 1024

PORTA_TRAVA = 49731   # so pra garantir um vigia por maquina

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
    """Falhou agora; tentar de novo faz sentido."""


class ErroDeConta(Exception):
    """Falhou por causa do usuario/senha; tentar de novo nao muda nada."""


class Backend:
    def __init__(self, ler_config):
        self.ler_config = ler_config
        self.token = None

    def _url(self, rota):
        return self.ler_config().get("backend", BACKEND_PADRAO).rstrip("/") + rota

    def entrar(self):
        cfg = self.ler_config()
        try:
            r = requests.post(self._url("/login"),
                              json={"username": cfg["usuario"], "password": cfg["senha"]},
                              timeout=TIMEOUT)
        except requests.RequestException as e:
            raise ErroDeEnvio(f"nao alcancei o servidor: {e}") from e

        if r.status_code >= 500:
            raise ErroDeEnvio(f"servidor respondeu {r.status_code}")
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
            return requests.post(self._url(rota), data=dados, headers=cabecalhos, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise ErroDeEnvio(f"nao alcancei o servidor: {e}") from e

    def enviar_at(self, nome_arquivo, linhas):
        corpo = {"arquivo": nome_arquivo, "linhas": linhas}

        for tentativa in (1, 2):
            if not self.token:
                self.entrar()
            r = self._post(ROTA_CARGA, corpo)

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
                r = self._post(ROTA_CARGA, corpo, comprimir=False)
            if r.status_code >= 500:
                raise ErroDeEnvio(f"servidor respondeu {r.status_code}")
            try:
                resposta = r.json()
            except ValueError as e:
                raise ErroDeEnvio(f"resposta ilegivel do servidor ({r.status_code})") from e
            if not r.ok or resposta.get("error"):
                raise ErroDeEnvio(resposta.get("error") or f"servidor respondeu {r.status_code}")
            return resposta

        raise ErroDeEnvio("nao consegui autenticar")


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

    def _varrer(self):
        vistos = []
        for caminho in self._arquivos():
            vistos.append(caminho)
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
            linhas, faltando = at.ler_arquivo(pendente.caminho)
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

        numeros = at.resumo(linhas)
        estacoes = ", ".join(numeros["estacoes"]) or "sem estacao"
        if faltando:
            log.warning("colunas ausentes em %s (entram vazias): %s", nome, ", ".join(faltando))

        self.ultimo = f"enviando {nome}"
        self.avisar("Enviando", f"{nome}\n{numeros['ats']} ATs · {numeros['linhas']} linhas · {estacoes}")

        try:
            resposta = self.backend.enviar_at(f"{nome} — {ORIGEM}", linhas)
        except ErroDeConta as e:
            self._tirar(pendente)
            self.avisar("Login recusado", f"{e}\nAbra Configurar na bandeja.", erro=True)
            return
        except ErroDeEnvio as e:
            pendente.tentativas += 1
            if pendente.tentativas >= MAX_TENTATIVAS:
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
        ats = resposta.get("ats", numeros["ats"])
        self.registro.marcar(pendente.chave, nome=nome,
                             resultado=f"{ats} ATs, {gravadas} linhas, {estacoes}")
        self.ultimo = f"{nome} · {ats} ATs às {time.strftime('%H:%M')}"
        self.avisar("Alimentado", f"{nome}\n{ats} ATs · {gravadas} linhas · {estacoes}")

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
