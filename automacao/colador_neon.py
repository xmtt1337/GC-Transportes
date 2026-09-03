"""
GC TRANSPORTES - COLADOR NEON

Mesma ideia do BIPADOR (Utilidades/BIPADOR/bip.py): digita códigos um por um na
janela que estava em foco. A diferença é que a lista não vem colada à mão — vem
da tabela shopee_recebimentos do Neon, em lotes de 20.

Garantia de "não repetir e não pular":
  - o lote é RESERVADO com um único UPDATE ... RETURNING (atômico, com
    SKIP LOCKED), então dois coladores rodando ao mesmo tempo nunca pegam o
    mesmo código;
  - o código só é marcado como COLADO depois de realmente ter sido digitado;
  - se parar/travar no meio, o que sobrou da reserva é liberado e volta pra
    fila — reserva órfã também expira sozinha em 15 minutos.

Colunas de controle são criadas na primeira execução (ALTER TABLE idempotente):
colado_em, colado_por, reservado_em, reservado_por.
"""

import ctypes
import json
import os
import queue
import socket
import sys
import threading
import time
from datetime import datetime

import customtkinter as ctk
import psycopg2
import pyautogui
import win32con
import win32gui

from ponte_navegador import PORTA_PADRAO, Ponte

VERSAO = '2.8'   # subir junto com mudança de comportamento
APP_ID = 'GC.Transportes.ColadorNeon.1.0'
try:
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
except Exception:
    pass

# Config fica no APPDATA, fora do repositório — a connection string do Neon é
# credencial e não pode acabar num commit.
CONFIG_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'GC_Colador')
CONFIG_PATH = os.path.join(CONFIG_DIR, 'config.json')

# As duas filas que o colador atende, na ordem em que ele procura trabalho.
#
# Os entregadores ganharam fila propria porque a trava de duplicado por dia e
# uma so por tabela: o galpao receber um codigo impedia o entregador de pedir AT
# pra ele. Sao coisas diferentes - um diz "recebi este pacote", o outro "preciso
# de AT pra este" - e o segundo continua valendo com o primeiro ja feito.
#
# As colunas de controle sao iguais nas duas, entao daqui pra frente o colador
# nao precisa saber de qual fila o codigo veio: ele cola do mesmo jeito.
FILAS = ['shopee_recebimentos', 'entregador_pedidos_at']

# Onde ainda se fala de "a" tabela: rotulo da janela e a lista de XPTs.
TABELA = FILAS[0]
RESERVA_EXPIRA = '15 minutes'
ESPERA_NOVOS = 5  # segundos entre uma checagem e outra no modo contínuo
CARENCIA_PADRAO = 60  # segundos de folga entre receber e atribuir no SPX
SEGUNDOS_PARA_FOCAR = 4  # tempo pra clicar na janela de destino no modo teclado

# O colador roda a madrugada inteira sem ninguém olhando, então tropeço não
# pode virar sessão parada: aba descartada pelo Chrome, Neon derrubando conexão
# ociosa, SPX fora do ar por um minuto — tudo isso passa sozinho. A sessão só
# termina quando alguém aperta Parar ou a fila acaba.
ESPERA_RETENTATIVA = 2      # base do backoff, em segundos
ESPERA_MAX_RETENTATIVA = 30  # teto: nunca dormir mais que isso sem reavaliar
TENTATIVAS_ANTES_DE_ADIAR = 10  # depois disso o código vai pro fim do lote

# Por onde o código chega no SPX. O teclado exige a janela em foco e prende a
# máquina num macro só; o navegador escreve direto no campo pela extensão,
# então várias abas colam ao mesmo tempo, em segundo plano — e a aba ainda
# responde se o código entrou, o que o teclado nunca soube dizer.
SAIDA_TECLADO = 'Teclado (janela em foco)'
SAIDA_NAVEGADOR = 'Navegador (extensão)'

# Os dois trabalhos que o colador faz no SPX, cada um com suas colunas de
# controle. O AT Cluster é o mesmo código do recebimento, colado depois — e o
# "depois" não é um delay no relógio: ele só enxerga o que o recebimento já
# marcou como colado. Se o recebimento parar, o AT para junto em vez de
# atribuir pacote que o SPX ainda não recebeu.
MODOS = {
    'Recebimento': {
        'colado_em': 'colado_em',
        'colado_por': 'colado_por',
        'reservado_em': 'reservado_em',
        'reservado_por': 'reservado_por',
        'depende_de': None,
        'explicacao': 'recebe os pacotes no SPX',
        'pagina': 'singleReceiveNew',
    },
    'AT Cluster': {
        'colado_em': 'at_colado_em',
        'colado_por': 'at_colado_por',
        'reservado_em': 'at_reservado_em',
        'reservado_por': 'at_reservado_por',
        'depende_de': 'colado_em',
        'explicacao': 'atribui no SPX o que já foi recebido',
        # Entrega > Sorting Task Management > Detalhe da tarefa.
        # "detail" também aparece na URL, mas casaria com qualquer tela de
        # detalhe do SPX e as duas abas voltariam a brigar.
        'pagina': 'sorting-task',
    },
}


# Enquanto o colador estiver colando, o Windows nao pode suspender a maquina:
# de madrugada ninguem esta la pra acordar ela, e o SPX, o Chrome e o Neon
# somem juntos. ES_CONTINUOUS vale ate ser limpo, e vale POR THREAD - por isso
# quem chama e a thread de colagem, que vive exatamente o tempo da sessao.
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_AWAYMODE_REQUIRED = 0x00000040


def impedir_suspensao():
    """Segura a maquina acordada. A tela pode apagar; o sistema nao dorme."""
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(
            ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED)
    except Exception:
        pass   # sem isso o colador ainda funciona, so nao segura o sono


def liberar_suspensao():
    try:
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
    except Exception:
        pass


def espera_retentativa(tentativas):
    """Quanto dormir antes de tentar de novo. Cresce e para de crescer.

    Sem teto, uma noite de tropecos viraria uma espera de horas; sem
    crescimento, o colador martelaria um SPX fora do ar dez vezes por segundo.
    """
    return min(ESPERA_RETENTATIVA * max(1, tentativas), ESPERA_MAX_RETENTATIVA)


def deve_adiar(falhas, tamanho_lote):
    """Se so este codigo trava, manda ele pro fim do lote e anda a fila.

    So faz sentido com outro codigo pra tentar: com um codigo so no lote,
    trocar de lugar nao muda nada e o certo e continuar insistindo nele.
    """
    return falhas >= TENTATIVAS_ANTES_DE_ADIAR and tamanho_lote > 1


# O .exe é compilado sem console (console=False no .spec), então sys.stdout não
# existe e todo print some. Isso passou despercebido até a primeira madrugada em
# que precisamos saber o que tinha acontecido — e não havia como saber. O log em
# arquivo é a única memória que sobra depois que a janela fecha.
LOG_PATH = os.path.join(CONFIG_DIR, 'colador.log')
LOG_MAX_BYTES = 2 * 1024 * 1024


def registrar(linha):
    """Escreve no log e no console, quando houver console."""
    texto = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  {linha}"
    try:
        print(texto)
    except Exception:
        pass
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        # Corta pela metade ao passar do teto: um arquivo que cresce pra sempre
        # numa máquina de galpão acaba sendo o problema, não a solução.
        try:
            if os.path.getsize(LOG_PATH) > LOG_MAX_BYTES:
                with open(LOG_PATH, 'r', encoding='utf-8', errors='replace') as f:
                    sobra = f.readlines()[-2000:]
                with open(LOG_PATH, 'w', encoding='utf-8') as f:
                    f.writelines(sobra)
        except FileNotFoundError:
            pass
        with open(LOG_PATH, 'a', encoding='utf-8') as f:
            f.write(texto + '\n')
    except Exception:
        pass   # log é conveniência: não pode derrubar colagem nenhuma


def carregar_config():
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def salvar_config(dados):
    """Grava num temporário e troca de nome.

    Vários coladores abertos dividem este arquivo. Escrevendo por cima, dois
    fechando ao mesmo tempo deixariam um JSON pela metade e o próximo abriria
    sem connection string nenhuma.
    """
    os.makedirs(CONFIG_DIR, exist_ok=True)
    temporario = f"{CONFIG_PATH}.{os.getpid()}.tmp"
    with open(temporario, 'w', encoding='utf-8') as f:
        json.dump(dados, f, indent=2, ensure_ascii=False)
    os.replace(temporario, CONFIG_PATH)


def caminho_recurso(nome):
    """Acha o arquivo tanto rodando pelo .py quanto de dentro do .exe."""
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, nome)


def quem_sou():
    """Identifica esta máquina nas colunas reservado_por / colado_por."""
    return f"{os.environ.get('USERNAME', 'user')}@{socket.gethostname()}"


class Banco:
    """Conexão psycopg2 que se reconecta sozinha.

    O Neon derruba conexão ociosa e o colador fica parado entre lotes, então
    toda query passa por aqui e tem direito a uma segunda tentativa com
    conexão nova. Cada thread usa sua própria instância — cursor compartilhado
    entre threads não é seguro.
    """

    def __init__(self, url):
        self.url = url
        self.conn = None

    def _conexao(self):
        if self.conn is None or self.conn.closed:
            self.conn = psycopg2.connect(self.url, connect_timeout=15)
            self.conn.autocommit = True
        return self.conn

    def executar(self, sql, params=None, retorna=True):
        ultimo_erro = None
        for tentativa in (1, 2):
            try:
                with self._conexao().cursor() as cur:
                    cur.execute(sql, params or {})
                    return cur.fetchall() if retorna else None
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                ultimo_erro = e
                try:
                    if self.conn:
                        self.conn.close()
                except Exception:
                    pass
                self.conn = None
                if tentativa == 2:
                    raise ultimo_erro

    def fechar(self):
        try:
            if self.conn and not self.conn.closed:
                self.conn.close()
        except Exception:
            pass
        self.conn = None


def preparar_schema(db):
    """Cria as colunas de controle dos dois modos, nas duas filas. Idempotente.

    A fila dos entregadores o backend também cria (modules/at/migrations.js) —
    aqui é rede de segurança pro colador não depender da ordem em que as duas
    coisas sobem.
    """
    for i, tabela in enumerate(FILAS):
        # A fila dos entregadores pode ainda não existir se o backend novo não
        # subiu: sem isto o colador morreria na abertura por causa dela.
        db.executar(f"""
            CREATE TABLE IF NOT EXISTS {tabela} (
                id                  SERIAL PRIMARY KEY,
                codigo              TEXT NOT NULL,
                xpt                 TEXT NOT NULL,
                usuario_id          INTEGER,
                usuario_nome        TEXT,
                dia                 TEXT,
                data_hora_brasilia  TEXT,
                criado_em           TIMESTAMP DEFAULT NOW()
            )""", retorna=False)
        # O número da AT que o SPX cria no instante da colagem. Fica aqui, e não
        # na at_exportada, porque aquela tabela é o arquivo importado depois — a
        # AT que o entregador precisa ver é a de agora, no segundo em que nasceu.
        db.executar(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS at_numero TEXT",
                    retorna=False)
        db.executar(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS at_numero_em TIMESTAMP",
                    retorna=False)
        for modo, c in MODOS.items():
            db.executar(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS {c['colado_em']} TIMESTAMP",
                        retorna=False)
            db.executar(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS {c['colado_por']} TEXT",
                        retorna=False)
            db.executar(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS {c['reservado_em']} TIMESTAMP",
                        retorna=False)
            db.executar(f"ALTER TABLE {tabela} ADD COLUMN IF NOT EXISTS {c['reservado_por']} TEXT",
                        retorna=False)
            db.executar(
                f"CREATE INDEX IF NOT EXISTS idx_fila{i}_{c['colado_em']} "
                f"ON {tabela} (dia, id) WHERE {c['colado_em']} IS NULL",
                retorna=False,
            )


FILTRO = """
      AND (%(dia)s::text IS NULL OR dia = %(dia)s::text)
      AND (%(xpt)s::text IS NULL OR xpt = %(xpt)s::text)
"""

def _disponivel(modo):
    """O que este modo pode colar agora.

    No AT Cluster inclui a dependência do recebimento: só entra o que já foi
    colado lá e passou da carência, pro SPX ter tido tempo de processar.
    """
    c = MODOS[modo]
    cond = f"{c['colado_em']} IS NULL"
    if c['depende_de']:
        cond += (f" AND {c['depende_de']} IS NOT NULL"
                 f" AND {c['depende_de']} < NOW() - make_interval(secs => %(carencia)s)")
    return cond


def sql_reservar(modo, tabela):
    c = MODOS[modo]
    return f"""
UPDATE {tabela}
   SET {c['reservado_em']} = NOW(), {c['reservado_por']} = %(quem)s
 WHERE id IN (
       SELECT id
         FROM {tabela}
        WHERE {_disponivel(modo)}
          AND ({c['reservado_em']} IS NULL
               OR {c['reservado_por']} = %(quem)s
               OR {c['reservado_em']} < NOW() - INTERVAL '{RESERVA_EXPIRA}')
          {FILTRO}
        ORDER BY id
        LIMIT %(tam)s
        FOR UPDATE SKIP LOCKED
 )
 RETURNING id, codigo
"""


def sql_confirmar(modo, tabela):
    c = MODOS[modo]
    return f"""
UPDATE {tabela}
   SET {c['colado_em']} = NOW(), {c['colado_por']} = %(quem)s,
       {c['reservado_em']} = NULL, {c['reservado_por']} = NULL
 WHERE id = ANY(%(ids)s)
"""


def sql_gravar_at(tabela):
    """A AT do pacote, gravada na fila em que ele estiver.

    Roda nas duas: o mesmo código pode estar na fila do galpão e na do
    entregador no mesmo dia, e é a mesma AT do mesmo pacote nos dois casos.
    """
    return f"""
UPDATE {tabela}
   SET at_numero = %(at)s, at_numero_em = NOW()
 WHERE dia = %(dia)s AND UPPER(codigo) = UPPER(%(codigo)s)
       AND at_numero IS NULL
"""


def sql_liberar(modo, tabela):
    c = MODOS[modo]
    return f"""
UPDATE {tabela}
   SET {c['reservado_em']} = NULL, {c['reservado_por']} = NULL
 WHERE id = ANY(%(ids)s) AND {c['colado_em']} IS NULL
"""


def sql_contar(modo, tabela):
    """pendentes = dá pra colar agora; travados = esperando o estágio anterior."""
    c = MODOS[modo]
    travados = (f"COUNT(*) FILTER (WHERE {c['colado_em']} IS NULL "
                f"AND {c['depende_de']} IS NULL)") if c['depende_de'] else "0"
    return f"""
SELECT COUNT(*) FILTER (WHERE {_disponivel(modo)}) AS pendentes,
       COUNT(*) FILTER (WHERE {c['colado_em']} IS NOT NULL) AS colados,
       {travados} AS travados,
       COUNT(*) AS total
  FROM {tabela}
 WHERE TRUE
       {FILTRO}
"""


def sql_pular(modo, tabela):
    c = MODOS[modo]
    return f"""
UPDATE {tabela}
   SET {c['colado_em']} = NOW(), {c['colado_por']} = %(quem)s || ' [pulado]',
       {c['reservado_em']} = NULL, {c['reservado_por']} = NULL
 WHERE {c['colado_em']} IS NULL
       {FILTRO}
"""


def sql_zerar(modo, tabela):
    c = MODOS[modo]
    return f"""
UPDATE {tabela}
   SET {c['colado_em']} = NULL, {c['colado_por']} = NULL,
       {c['reservado_em']} = NULL, {c['reservado_por']} = NULL
 WHERE {c['colado_em']} IS NOT NULL
       {FILTRO}
"""


class ColadorApp:
    def __init__(self):
        self.cfg = carregar_config()
        self.quem = quem_sou()
        # Numa máquina nova ainda não existe config: aceita a string pela
        # variável de ambiente DATABASE_URL pra não ter que colar na mão.
        self.url_inicial = self.cfg.get('database_url') or os.environ.get('DATABASE_URL', '')

        self.executando = False
        self.pausado = False
        self.parar_thread = False
        self.thread_execucao = None
        self.janela_ativa = None
        self.control_window = None

        self.lote = []            # [(id, codigo)] ainda não digitados do lote atual
        self.reservados = set()   # ids reservados que ainda não viraram colados
        self.num_lote = 0
        self.colados_sessao = 0
        self.pendentes_banco = None
        self.tempos = []

        self.url_atual = ''
        self.filtros_exec = {'dia': None, 'xpt': None}
        self.tam_lote_exec = 20
        self.continuo_exec = True
        self.modo_exec = 'Recebimento'
        self.saida_exec = SAIDA_TECLADO
        self.ponte = None
        self.xpt_confirmado = False
        self.modo_confirmado = False

        self.fila_ui = queue.Queue()
        self.fila_confirmar = queue.Queue()
        self.thread_confirmar = None
        # A AT chega quando o SPX responde, fora do ritmo da colagem — por isso
        # fila própria: ela não pode entrar na frente de uma confirmação nem
        # segurar a colagem esperando o Neon.
        self.fila_at = queue.Queue()
        self.thread_at = None
        self.db = None            # conexão da thread de execução
        self.db_ui = None         # conexão da UI (testar / contar / zerar)

        self.setup_ui()
        self.bombear_ui()

    # ------------------------------------------------------------------ UI
    def setup_ui(self):
        ctk.set_appearance_mode("Light")
        ctk.set_default_color_theme("blue")

        self.root = ctk.CTk()
        self.root.title(f"GC TRANSPORTES - COLADOR NEON v{VERSAO}")
        self.root.geometry("520x760")
        self.root.resizable(False, False)
        self.root.protocol("WM_DELETE_WINDOW", self.ao_fechar)
        try:
            self.root.iconbitmap(caminho_recurso('logo-gc.ico'))
        except Exception:
            pass

        frame = ctk.CTkScrollableFrame(
            self.root, corner_radius=12, border_width=1,
            border_color="#d6e7ff", fg_color="#ffffff",
        )
        frame.pack(pady=16, padx=16, fill="both", expand=True)

        ctk.CTkLabel(
            frame, text="COLADOR NEON",
            font=("Segoe UI", 20, "bold"), text_color="#2c7be5",
        ).pack(pady=(6, 0))
        # A versão fica à vista porque é fácil abrir uma cópia velha do .exe e
        # achar que a mudança não veio.
        ctk.CTkLabel(
            frame,
            text=f"v{VERSAO} · controle por botão · tabela {TABELA}",
            font=("Segoe UI", 11), text_color="#7a8aa0",
        ).pack(pady=(0, 14))

        # --- conexão
        ctk.CTkLabel(frame, text="Connection string do Neon:",
                     font=("Segoe UI", 12), anchor="w").pack(fill="x", padx=12)
        self.url_entry = ctk.CTkEntry(
            frame, width=460, show="•",
            placeholder_text="postgresql://usuario:senha@ep-xxx.neon.tech/neondb?sslmode=require",
        )
        self.url_entry.pack(padx=12, pady=(4, 6))
        if self.url_inicial:
            self.url_entry.insert(0, self.url_inicial)

        linha_conn = ctk.CTkFrame(frame, fg_color="transparent")
        linha_conn.pack(pady=(0, 4))
        self.mostrar_var = ctk.BooleanVar(value=False)
        ctk.CTkCheckBox(
            linha_conn, text="mostrar", variable=self.mostrar_var,
            command=lambda: self.url_entry.configure(show="" if self.mostrar_var.get() else "•"),
            font=("Segoe UI", 11), checkbox_width=18, checkbox_height=18,
        ).pack(side="left", padx=(0, 12))
        ctk.CTkButton(linha_conn, text="Conectar e salvar", width=150,
                      command=self.conectar).pack(side="left")

        self.conn_label = ctk.CTkLabel(frame, text="Desconectado",
                                       font=("Segoe UI", 11), text_color="#999999")
        self.conn_label.pack(pady=(2, 12))

        # --- para onde o codigo vai
        caixa_saida = ctk.CTkFrame(frame, fg_color="#f5f9ff", corner_radius=10)
        caixa_saida.pack(fill="x", padx=12, pady=(0, 10))
        linha_saida = ctk.CTkFrame(caixa_saida, fg_color="transparent")
        linha_saida.pack(fill="x", padx=12, pady=(12, 4))
        ctk.CTkLabel(linha_saida, text="Colar por:", font=("Segoe UI", 12, "bold"),
                     width=80, anchor="w").pack(side="left")
        self.saida_menu = ctk.CTkOptionMenu(
            linha_saida, width=180, values=[SAIDA_TECLADO, SAIDA_NAVEGADOR],
            command=lambda _v: self.ao_trocar_saida(),
        )
        self.saida_menu.set(self.cfg.get('saida') or SAIDA_TECLADO)
        self.saida_menu.pack(side="left")
        self.saida_desc = ctk.CTkLabel(caixa_saida, text="", font=("Segoe UI", 11),
                                       text_color="#7a8aa0", justify="left", wraplength=440)
        self.saida_desc.pack(padx=12, pady=(0, 6), anchor="w")

        # Com mais de um colador aberto, é isto que decide qual aba é de quem.
        self.linha_pagina = ctk.CTkFrame(caixa_saida, fg_color="transparent")
        self.linha_pagina.pack(fill="x", padx=12, pady=(0, 12))
        ctk.CTkLabel(self.linha_pagina, text="Só na página cuja URL contém:",
                     font=("Segoe UI", 11)).pack(side="left")
        self.pagina_entry = ctk.CTkEntry(self.linha_pagina, width=170,
                                         placeholder_text="ex: singleReceiveNew")
        if self.cfg.get('pagina'):
            self.pagina_entry.insert(0, self.cfg['pagina'])
        self.pagina_entry.pack(side="left", padx=6)
        self.pagina_entry.bind("<FocusOut>", lambda _e: self.persistir_config())
        self.porta_label = ctk.CTkLabel(self.linha_pagina, text="", font=("Segoe UI", 11),
                                        text_color="#2c7be5")
        self.porta_label.pack(side="left", padx=4)

        # --- modo (o que este computador vai fazer no SPX)
        caixa_modo = ctk.CTkFrame(frame, fg_color="#eef4ff", corner_radius=10)
        caixa_modo.pack(fill="x", padx=12, pady=(0, 10))
        linha_modo_sel = ctk.CTkFrame(caixa_modo, fg_color="transparent")
        linha_modo_sel.pack(fill="x", padx=12, pady=(12, 4))
        ctk.CTkLabel(linha_modo_sel, text="Modo:", font=("Segoe UI", 12, "bold"),
                     width=50, anchor="w").pack(side="left")
        self.modo_menu = ctk.CTkOptionMenu(
            linha_modo_sel, width=200, values=list(MODOS),
            command=lambda _v: self.ao_trocar_modo(),
        )
        self.modo_menu.set(self.cfg.get('modo') or 'Recebimento')
        self.modo_menu.pack(side="left")
        self.modo_desc = ctk.CTkLabel(caixa_modo, text="", font=("Segoe UI", 11),
                                      text_color="#7a8aa0")
        self.modo_desc.pack(padx=12, anchor="w")

        self.linha_carencia = ctk.CTkFrame(caixa_modo, fg_color="transparent")
        self.linha_carencia.pack(fill="x", padx=12, pady=(6, 12))
        ctk.CTkLabel(self.linha_carencia, text="Só atribuir o recebido há mais de",
                     font=("Segoe UI", 11)).pack(side="left")
        self.carencia_entry = ctk.CTkEntry(self.linha_carencia, width=55)
        self.carencia_entry.insert(0, str(self.cfg.get('carencia', CARENCIA_PADRAO)))
        self.carencia_entry.pack(side="left", padx=6)
        self.carencia_entry.bind("<FocusOut>", lambda _e: self.ao_mudar_filtro())
        self.carencia_entry.bind("<Return>", lambda _e: self.ao_mudar_filtro())
        ctk.CTkLabel(self.linha_carencia, text="segundos",
                     font=("Segoe UI", 11)).pack(side="left")

        # --- filtros
        filtros = ctk.CTkFrame(frame, fg_color="#f5f9ff", corner_radius=10)
        filtros.pack(fill="x", padx=12, pady=(0, 12))

        linha_dia = ctk.CTkFrame(filtros, fg_color="transparent")
        linha_dia.pack(fill="x", padx=12, pady=(12, 6))
        ctk.CTkLabel(linha_dia, text="Dia:", font=("Segoe UI", 12), width=50,
                     anchor="w").pack(side="left")
        self.dia_entry = ctk.CTkEntry(linha_dia, width=130, placeholder_text="AAAA-MM-DD")
        self.dia_entry.insert(0, self.cfg.get('dia') or datetime.now().strftime('%Y-%m-%d'))
        self.dia_entry.pack(side="left", padx=(0, 10))
        self.todos_dias = ctk.BooleanVar(value=bool(self.cfg.get('todos_dias')))
        ctk.CTkCheckBox(
            linha_dia, text="todos os dias", variable=self.todos_dias,
            command=self.ao_mudar_filtro, font=("Segoe UI", 11),
            checkbox_width=18, checkbox_height=18,
        ).pack(side="left")
        self.dia_entry.bind("<FocusOut>", lambda _e: self.ao_mudar_filtro())
        self.dia_entry.bind("<Return>", lambda _e: self.ao_mudar_filtro())

        linha_xpt = ctk.CTkFrame(filtros, fg_color="transparent")
        linha_xpt.pack(fill="x", padx=12, pady=(0, 12))
        ctk.CTkLabel(linha_xpt, text="XPT:", font=("Segoe UI", 12), width=50,
                     anchor="w").pack(side="left")
        # Sem opção "Todos": XPT_CFC e XPT_VIA são recebidos em plataformas
        # diferentes, misturar os dois na mesma janela colaria código no lugar
        # errado. O XPT é perguntado na abertura e só muda por aqui.
        self.xpt_menu = ctk.CTkOptionMenu(
            linha_xpt, width=180, values=["XPT_CFC", "XPT_VIA"],
            command=lambda _v: self.ao_trocar_xpt(),
        )
        self.xpt_menu.set(self.cfg.get('xpt') or "XPT_CFC")
        self.xpt_menu.pack(side="left", padx=(0, 10))
        ctk.CTkButton(linha_xpt, text="Atualizar contagem", width=150,
                      fg_color="#8fa8c8", hover_color="#7891b0",
                      command=self.ao_mudar_filtro).pack(side="left")

        # --- modo contínuo
        linha_modo = ctk.CTkFrame(frame, fg_color="transparent")
        linha_modo.pack(fill="x", padx=12, pady=(0, 2))
        self.modo_continuo = ctk.BooleanVar(value=self.cfg.get('modo_continuo', True))
        ctk.CTkCheckBox(
            linha_modo, variable=self.modo_continuo, font=("Segoe UI", 12),
            text="Ficar aguardando e colar as bipagens novas conforme chegam",
            command=self.persistir_config, checkbox_width=18, checkbox_height=18,
        ).pack(side="left")

        # --- lote e intervalo
        linha_lote = ctk.CTkFrame(frame, fg_color="transparent")
        linha_lote.pack(pady=(0, 4))
        ctk.CTkLabel(linha_lote, text="Códigos por lote:",
                     font=("Segoe UI", 12)).pack(side="left", padx=(0, 8))
        self.lote_entry = ctk.CTkEntry(linha_lote, width=60)
        self.lote_entry.insert(0, str(self.cfg.get('tamanho_lote', 20)))
        self.lote_entry.pack(side="left")

        self.linha_intervalo = ctk.CTkFrame(frame, fg_color="transparent")
        self.linha_intervalo.pack(pady=8)
        linha_int = self.linha_intervalo
        self.interval_label = ctk.CTkLabel(linha_int, text="Intervalo: 0.5 segundos",
                                           font=("Segoe UI", 13))
        self.interval_label.pack(side="left", padx=(0, 10))
        self.interval_slider = ctk.CTkSlider(
            linha_int, from_=0, to=1.5, number_of_steps=15,
            command=self.update_interval_label,
            button_color="#2c7be5", progress_color="#2c7be5", width=190,
        )
        self.interval_slider.set(float(self.cfg.get('intervalo', 0.5)))
        self.interval_slider.pack(side="left")
        self.update_interval_label(self.interval_slider.get())

        # --- status
        self.status_banco = ctk.CTkLabel(
            frame, text="Conecte para ver quantos códigos faltam",
            font=("Segoe UI", 13), text_color="#444444", justify="center",
        )
        self.status_banco.pack(pady=(12, 4))

        self.status_sessao = ctk.CTkLabel(frame, text="", font=("Segoe UI", 12),
                                          text_color="#2c7be5")
        self.status_sessao.pack(pady=(0, 10))

        # Botões, e não atalho de teclado: atalho global dispara em todos os
        # coladores abertos ao mesmo tempo, então iniciar um pausava o outro.
        botoes = ctk.CTkFrame(frame, fg_color="transparent")
        botoes.pack(pady=(6, 4))
        self.botao_iniciar = ctk.CTkButton(
            botoes, text="▶  Iniciar", width=180, height=42,
            font=("Segoe UI", 15, "bold"), command=self.toggle_execution)
        self.botao_iniciar.pack(side="left", padx=5)
        self.botao_parar = ctk.CTkButton(
            botoes, text="⏹  Parar", width=110, height=42,
            font=("Segoe UI", 14), fg_color="#8fa8c8", hover_color="#7891b0",
            state="disabled", command=self.stop_execution)
        self.botao_parar.pack(side="left", padx=5)

        self.dica_foco = ctk.CTkLabel(
            frame, text="", font=("Segoe UI", 11), text_color="#7a8aa0",
            justify="center", wraplength=440)
        self.dica_foco.pack(pady=(0, 10))

        manutencao = ctk.CTkFrame(frame, fg_color="transparent")
        manutencao.pack(pady=(0, 12))
        ctk.CTkButton(
            manutencao, text="Começar do agora", width=150,
            fg_color="#e8eef7", hover_color="#dbe5f2", text_color="#5b6b80",
            command=self.comecar_do_agora,
        ).pack(side="left", padx=4)
        ctk.CTkButton(
            manutencao, text="Desmarcar colados", width=150,
            fg_color="#e8eef7", hover_color="#dbe5f2", text_color="#5b6b80",
            command=self.zerar_colados,
        ).pack(side="left", padx=4)

        self.atualizar_visual_modo()
        self.atualizar_visual_saida()
        self.atualizar_botoes()
        if self.url_inicial:
            self.root.after(300, self.conectar)

    def ui(self, fn):
        """Enfileira uma atualização de tela vinda de outra thread.

        Tk só pode ser tocado pela thread que roda o mainloop — chamar
        after() de fora falha calado e a tela congela. Quem drena é o
        bombear_ui(), que roda na thread certa.
        """
        self.fila_ui.put(fn)

    def bombear_ui(self):
        """Aplica na tela o que as threads pediram. Roda só na thread da UI."""
        while True:
            try:
                fn = self.fila_ui.get_nowait()
            except queue.Empty:
                break
            try:
                fn()
            except Exception as e:
                print(f"Erro ao atualizar a tela: {e}")
        try:
            self.root.after(80, self.bombear_ui)
        except Exception:
            pass

    def atualizar_botoes(self):
        """Deixa o botão principal contar a história: iniciar, pausar, continuar."""
        if not self.executando:
            self.botao_iniciar.configure(text="▶  Iniciar", state="normal",
                                         fg_color=["#3B8ED0", "#1F6AA5"])
            self.botao_parar.configure(state="disabled")
        elif self.pausado:
            self.botao_iniciar.configure(text="▶  Continuar", state="normal",
                                         fg_color=["#3B8ED0", "#1F6AA5"])
            self.botao_parar.configure(state="normal")
        else:
            self.botao_iniciar.configure(text="⏸  Pausar", state="normal",
                                         fg_color="#e8a33d", hover_color="#d18f2b")
            self.botao_parar.configure(state="normal")

        if self.saida_atual() == SAIDA_TECLADO and not self.executando:
            self.dica_foco.configure(
                text=f"No modo teclado, você tem {SEGUNDOS_PARA_FOCAR}s depois de clicar "
                     f"em Iniciar para clicar na janela onde os códigos devem cair.")
        else:
            self.dica_foco.configure(text="")

    def update_interval_label(self, valor):
        intervalo = round(valor * 10) / 10
        self.interval_label.configure(text=f"Respiro: {intervalo:.1f}s entre códigos")
        self.interval_slider.set(intervalo)

    # -------------------------------------------------- janela de controle
    def show_control_window(self):
        if self.control_window is None or not self.control_window.winfo_exists():
            self.control_window = ctk.CTkToplevel(self.root)
            self.control_window.title("Colador")
            self.control_window.geometry("300x140+{}+30".format(
                self.root.winfo_screenwidth() - 320))
            self.control_window.resizable(False, False)
            self.control_window.attributes('-topmost', True)
            self.control_window.protocol("WM_DELETE_WINDOW", self.hide_control_window)

            self.control_label = ctk.CTkLabel(
                self.control_window, text="", font=("Segoe UI", 13), justify="left")
            self.control_label.pack(pady=(12, 6), padx=16)

            # Com o colador minimizado, é por aqui que se pausa.
            barra = ctk.CTkFrame(self.control_window, fg_color="transparent")
            barra.pack(pady=(0, 10))
            self.control_pausar = ctk.CTkButton(
                barra, text="⏸ Pausar", width=110, height=32,
                font=("Segoe UI", 12), command=self.toggle_execution)
            self.control_pausar.pack(side="left", padx=4)
            ctk.CTkButton(barra, text="⏹ Parar", width=90, height=32,
                          font=("Segoe UI", 12), fg_color="#8fa8c8",
                          hover_color="#7891b0",
                          command=self.stop_execution).pack(side="left", padx=4)
        else:
            self.control_window.deiconify()

    def hide_control_window(self):
        if self.control_window is not None and self.control_window.winfo_exists():
            self.control_window.withdraw()

    def restore_window_focus(self):
        try:
            if self.janela_ativa:
                win32gui.SetWindowPos(
                    self.janela_ativa, win32con.HWND_TOP, 0, 0, 0, 0,
                    win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOACTIVATE)
                win32gui.SetForegroundWindow(self.janela_ativa)
                time.sleep(0.1)
        except Exception as e:
            print(f"Erro ao restaurar foco: {e}")

    # ----------------------------------------------------------- filtros
    def saida_atual(self):
        return self.saida_menu.get() if self.saida_menu.get() in (
            SAIDA_TECLADO, SAIDA_NAVEGADOR) else SAIDA_TECLADO

    def atualizar_visual_saida(self):
        if self.saida_atual() == SAIDA_NAVEGADOR:
            texto = ("A extensão do Chrome escreve no campo do SPX. Não precisa de "
                     "foco, dá pra usar a máquina, e a aba confirma se o código entrou.")
            self.linha_pagina.pack(fill="x", padx=12, pady=(0, 12))
            # Volta a valer aqui: descobrimos que o SPX não sinaliza quando
            # termina, então o respiro entre códigos é o que segura o ritmo.
            self.linha_intervalo.pack(pady=8)
        else:
            texto = ("Digita na janela que estiver em foco, como o bipador. "
                     "Prende a máquina e só um colador roda por vez.")
            self.linha_pagina.pack_forget()
            self.linha_intervalo.pack(pady=8)
        self.saida_desc.configure(text=texto)

    def pagina_alvo(self):
        return self.pagina_entry.get().strip()

    def sugerir_pagina(self):
        """Ajusta o filtro de página conforme o modo.

        Não mexe se você digitou um valor próprio — só troca quando o campo
        está vazio ou tem a sugestão de outro modo, que é o caso de quem
        acabou de trocar de Recebimento para AT Cluster.
        """
        atual = self.pagina_entry.get().strip()
        conhecidas = {m['pagina'] for m in MODOS.values() if m.get('pagina')}
        if atual and atual not in conhecidas:
            return
        self.pagina_entry.delete(0, 'end')
        sugestao = MODOS[self.modo_atual()].get('pagina') or ''
        if sugestao:
            self.pagina_entry.insert(0, sugestao)

    def ao_trocar_saida(self):
        if self.executando:
            self.stop_execution()
            self.status_sessao.configure(text="Colagem parada — a saída mudou",
                                         text_color="#ff9900")
        self.atualizar_visual_saida()
        self.atualizar_botoes()
        self.persistir_config()

    def modo_atual(self):
        return self.modo_menu.get() if self.modo_menu.get() in MODOS else 'Recebimento'

    def carencia(self):
        try:
            return max(0, min(3600, int(self.carencia_entry.get().strip())))
        except ValueError:
            return CARENCIA_PADRAO

    def filtros_atuais(self):
        dia = None if self.todos_dias.get() else (self.dia_entry.get().strip() or None)
        return {'dia': dia, 'xpt': self.xpt_menu.get() or None, 'carencia': self.carencia()}

    def atualizar_visual_modo(self):
        """Deixa na cara qual trabalho este computador está fazendo."""
        modo = self.modo_atual()
        self.modo_desc.configure(text=MODOS[modo]['explicacao'])
        # A carência só existe pra quem depende de outro estágio.
        if MODOS[modo]['depende_de']:
            self.linha_carencia.pack(fill="x", padx=12, pady=(6, 12))
        else:
            self.linha_carencia.pack_forget()

    def ao_trocar_modo(self):
        """Trocar de trabalho no meio da colagem embaralharia as duas filas."""
        self.modo_confirmado = True
        if self.executando:
            self.stop_execution()
            self.status_sessao.configure(
                text=f"Colagem parada — modo mudou para {self.modo_atual()}",
                text_color="#ff9900")
        self.atualizar_visual_modo()
        self.sugerir_pagina()
        self.ao_mudar_filtro()

    def tamanho_lote(self):
        try:
            return max(1, min(500, int(self.lote_entry.get().strip())))
        except ValueError:
            return 20

    def persistir_config(self):
        self.cfg.update({
            'database_url': self.url_entry.get().strip(),
            'dia': self.dia_entry.get().strip(),
            'todos_dias': self.todos_dias.get(),
            'xpt': self.xpt_menu.get(),
            'tamanho_lote': self.tamanho_lote(),
            'intervalo': round(self.interval_slider.get(), 1),
            'modo_continuo': self.modo_continuo.get(),
            'modo': self.modo_atual(),
            'carencia': self.carencia(),
            'saida': self.saida_atual(),
            'pagina': self.pagina_alvo(),
        })
        try:
            salvar_config(self.cfg)
        except Exception as e:
            print(f"Erro ao salvar config: {e}")

    def ao_mudar_filtro(self):
        self.persistir_config()
        if self.db_ui:
            self.contar_async()

    # ---------------------------------------------------------- conexão
    def conectar(self):
        url = self.url_entry.get().strip()
        if not url:
            self.conn_label.configure(text="Cole a connection string do Neon",
                                      text_color="#e74c3c")
            return
        self.conn_label.configure(text="Conectando...", text_color="#ff9900")

        def tarefa():
            try:
                db = Banco(url)
                preparar_schema(db)
                # Carrega os XPTs que existem de fato, em vez de chutar.
                xpts = [r[0] for r in db.executar(
                    f"SELECT DISTINCT xpt FROM {TABELA} WHERE xpt IS NOT NULL ORDER BY xpt")]
                self.db_ui = db
                self.ui(lambda: self.conexao_ok(xpts))
            except Exception as e:
                msg = str(e).strip().split("\n")[0][:90]
                self.ui(lambda: self.conn_label.configure(
                    text=f"Falhou: {msg}", text_color="#e74c3c"))

        threading.Thread(target=tarefa, daemon=True).start()

    def conexao_ok(self, xpts):
        self.conn_label.configure(text="Conectado ao Neon", text_color="#2ecc71")
        valores = xpts or ["XPT_CFC", "XPT_VIA"]
        atual = self.xpt_menu.get()
        self.xpt_menu.configure(values=valores)
        self.xpt_menu.set(atual if atual in valores else valores[0])
        self.persistir_config()
        self.contar_async()
        if not self.modo_confirmado:
            self.perguntar_modo()
        elif not self.xpt_confirmado:
            self.perguntar_xpt()

    def _dialogo_escolha(self, titulo, pergunta, ajuda, opcoes, ao_escolher, altura=280):
        """Diálogo de botão grande que não fecha sem uma escolha."""
        janela = ctk.CTkToplevel(self.root)
        janela.title(titulo)
        janela.geometry(f"420x{altura}")
        janela.resizable(False, False)
        janela.attributes('-topmost', True)
        janela.protocol("WM_DELETE_WINDOW", lambda: None)
        janela.after(100, janela.grab_set)

        ctk.CTkLabel(janela, text=pergunta, font=("Segoe UI", 16, "bold"),
                     text_color="#2c7be5").pack(pady=(24, 4))
        ctk.CTkLabel(janela, text=ajuda, wraplength=360, justify="center",
                     font=("Segoe UI", 12), text_color="#7a8aa0").pack(pady=(0, 16))

        def escolher(valor):
            janela.grab_release()
            janela.destroy()
            ao_escolher(valor)

        for valor, legenda in opcoes:
            botao = ctk.CTkFrame(janela, fg_color="transparent")
            botao.pack(pady=4)
            ctk.CTkButton(botao, text=valor, width=240, height=44,
                          font=("Segoe UI", 14, "bold"),
                          command=lambda v=valor: escolher(v)).pack()
            if legenda:
                ctk.CTkLabel(botao, text=legenda, font=("Segoe UI", 11),
                             text_color="#7a8aa0").pack()

    def perguntar_modo(self):
        """Primeira pergunta da sessão: receber ou atribuir."""
        def escolheu(valor):
            self.modo_menu.set(valor)
            self.modo_confirmado = True
            self.atualizar_visual_modo()
            self.sugerir_pagina()
            self.persistir_config()
            if not self.xpt_confirmado:
                self.perguntar_xpt()
            else:
                self.ao_mudar_filtro()

        self._dialogo_escolha(
            titulo="O que este computador vai fazer?",
            pergunta="O que este computador vai fazer?",
            ajuda="O AT Cluster só cola o que o Recebimento já colou — "
                  "não tem como atribuir na frente do recebimento.",
            opcoes=[(m, MODOS[m]['explicacao']) for m in MODOS],
            ao_escolher=escolheu, altura=300)

    def perguntar_xpt(self):
        """Escolha do XPT no início da sessão — cada um vai numa plataforma."""
        valores = list(self.xpt_menu.cget("values")) or ["XPT_CFC", "XPT_VIA"]

        def escolheu(valor):
            self.xpt_menu.set(valor)
            self.xpt_confirmado = True
            self.ao_mudar_filtro()

        self._dialogo_escolha(
            titulo="Qual XPT?",
            pergunta=f"Qual XPT, no modo {self.modo_atual()}?",
            ajuda="Cada XPT é tratado numa plataforma diferente — "
                  "o colador vai puxar só os códigos desse XPT.",
            opcoes=[(v, None) for v in valores],
            ao_escolher=escolheu, altura=260)

    def ao_trocar_xpt(self):
        """Trocar de XPT no meio da colagem misturaria plataformas — para antes."""
        self.xpt_confirmado = True
        if self.executando:
            self.stop_execution()
            self.status_sessao.configure(
                text=f"Colagem parada — XPT mudou para {self.xpt_menu.get()}",
                text_color="#ff9900")
        self.ao_mudar_filtro()

    def contar_async(self):
        modo = self.modo_atual()

        def tarefa():
            try:
                filtros = self.filtros_atuais()
                # Soma as duas filas: pra quem olha a tela, o que importa é
                # quanto falta colar, não em qual tabela o código está.
                somas = [0, 0, 0, 0]
                for tabela in FILAS:
                    linha = self.db_ui.executar(sql_contar(modo, tabela), filtros)[0]
                    somas = [a + (b or 0) for a, b in zip(somas, linha)]
                self.ui(lambda: self.mostrar_contagem(*somas))
            except Exception as e:
                msg = str(e).strip().split("\n")[0][:90]
                self.ui(lambda: self.status_banco.configure(
                    text=f"Erro ao contar: {msg}", text_color="#e74c3c"))

        threading.Thread(target=tarefa, daemon=True).start()

    def mostrar_contagem(self, pendentes, colados, travados, total):
        self.pendentes_banco = pendentes
        texto = f"{pendentes} a colar  ·  {colados} já colados  ·  {total} no filtro"
        if travados:
            texto += f"\n{travados} ainda esperando o recebimento"
        self.status_banco.configure(
            text=texto, text_color="#444444" if pendentes else "#2ecc71")
        self.atualizar_status()

    # ------------------------------------------------------------ execução
    def toggle_execution(self):
        if not self.executando:
            self.ui(self.iniciar)
        else:
            self.pausado = not self.pausado
            self.ui(self.atualizar_status)
            self.ui(self.atualizar_botoes)

    def iniciar(self):
        if self.executando:
            return
        if not self.db_ui:
            self.conn_label.configure(text="Conecte ao banco antes de iniciar",
                                      text_color="#e74c3c")
            return
        if not self.modo_confirmado:
            self.status_sessao.configure(text="Escolha o modo antes de iniciar",
                                         text_color="#e74c3c")
            self.perguntar_modo()
            return
        if not self.xpt_confirmado:
            self.status_sessao.configure(text="Escolha o XPT antes de iniciar",
                                         text_color="#e74c3c")
            self.perguntar_xpt()
            return

        if self.saida_atual() == SAIDA_NAVEGADOR:
            # Sem filtro, este colador aceita qualquer aba do SPX — e aí, com
            # dois abertos, um fisga a aba do outro e o código vai pra tela
            # errada. Melhor não deixar começar do que descobrir depois.
            if not self.pagina_alvo():
                self.status_sessao.configure(
                    text="Preencha 'Só na página cuja URL contém' — sem isso este "
                         "colador pega a aba de qualquer tela do SPX",
                    text_color="#e74c3c")
                return

            # Pela extensão não existe foco: o alvo é a aba, não a janela.
            self.janela_ativa = None
            try:
                # Ponte nova a cada início: o filtro de página e o papel podem
                # ter mudado desde a última vez.
                if self.ponte:
                    self.ponte.parar()
                self.ponte = Ponte(filtro_pagina=self.pagina_alvo(),
                                   papel=f"{self.modo_atual()} / {self.xpt_menu.get()}")
                self.ponte.ao_capturar_at = self.guardar_at
                self.ponte.iniciar()
                self.porta_label.configure(text=f"porta {self.ponte.porta}")
            except OSError as e:
                self.status_sessao.configure(text=str(e)[:110], text_color="#e74c3c")
                return
        else:
            # Sem atalho de teclado, clicar em Iniciar deixa o colador em foco.
            # A contagem dá tempo de clicar na janela que deve receber.
            self.contar_para_focar(SEGUNDOS_PARA_FOCAR)
            return

        self._comecar()

    def contar_para_focar(self, restam):
        if restam > 0:
            self.botao_iniciar.configure(text=f"clique na janela… {restam}",
                                         state="disabled")
            self.root.after(1000, lambda: self.contar_para_focar(restam - 1))
            return

        try:
            hwnd = win32gui.GetForegroundWindow()
        except Exception:
            hwnd = None

        # Sem essa trava o colador digitaria dentro da própria janela.
        if hwnd and hwnd in self.janelas_proprias():
            self.status_sessao.configure(
                text="A janela em foco é a do próprio colador — clique na janela "
                     "de destino durante a contagem",
                text_color="#e74c3c")
            self.atualizar_botoes()
            return

        self.janela_ativa = hwnd
        self._comecar()

    def _comecar(self):
        self.persistir_config()

        # Congela o que as threads vão usar — widget de Tk não se lê de fora da
        # thread da UI. O intervalo é exceção proposital: dá pra ajustar o
        # slider com a colagem rodando, como no bipador.
        self.url_atual = self.url_entry.get().strip()
        self.filtros_exec = self.filtros_atuais()
        self.tam_lote_exec = self.tamanho_lote()
        self.continuo_exec = self.modo_continuo.get()
        self.modo_exec = self.modo_atual()
        self.saida_exec = self.saida_atual()

        self.executando = True
        self.pausado = False
        self.parar_thread = False
        self.colados_sessao = 0
        self.ats_sessao = 0
        self.num_lote = 0
        self.lote = []
        self.tempos = []

        self.db = Banco(self.url_atual)
        self.thread_confirmar = threading.Thread(target=self.loop_confirmacao, daemon=True)
        self.thread_confirmar.start()
        self.thread_at = threading.Thread(target=self.loop_at, daemon=True)
        self.thread_at.start()

        self.show_control_window()
        self.atualizar_status()
        self.atualizar_botoes()

        self.thread_execucao = threading.Thread(target=self.loop_colagem, daemon=True)
        self.thread_execucao.start()

    def janelas_proprias(self):
        hwnds = []
        for janela in (self.root, self.control_window):
            try:
                if janela is None or not janela.winfo_exists():
                    continue
                hwnds.append(janela.winfo_id())
                frame = janela.wm_frame()
                hwnds.append(int(frame, 16) if str(frame).startswith('0x') else int(frame))
            except Exception:
                pass
        return hwnds

    def reservar_lote(self):
        """Reserva o próximo lote. Um único UPDATE — ninguém pega os mesmos ids.

        Procura fila por fila, na ordem de FILAS, e para na primeira que tiver
        trabalho. Não junta as duas no mesmo lote de propósito: o UPDATE ...
        RETURNING que garante que ninguém pega o mesmo código é por tabela, e
        misturar exigiria uma transação em volta pra manter essa garantia.

        Como o lote acaba e ele volta aqui, as duas filas andam de qualquer
        jeito — a do galpão só tem prioridade dentro de cada rodada.
        """
        params = dict(self.filtros_exec)
        params.update({'quem': self.quem, 'tam': self.tam_lote_exec})
        for tabela in FILAS:
            linhas = self.db.executar(sql_reservar(self.modo_exec, tabela), params)
            if linhas:
                self.reservados.update((tabela, r[0]) for r in linhas)
                return [(tabela, r[0], r[1]) for r in linhas]
        return []

    def registrar_tempo(self, segundos):
        """Guarda os últimos tempos por código, pra tela mostrar o ritmo real."""
        self.tempos.append(segundos)
        if len(self.tempos) > 20:
            self.tempos.pop(0)

    def ritmo(self):
        if not self.tempos:
            return ""
        media = sum(self.tempos) / len(self.tempos)
        return f" · {media:.1f}s por código"

    def esperar(self, segundos):
        """Sleep que responde ao Parar e à pausa sem demorar pra acordar."""
        fim = time.time() + segundos
        while time.time() < fim and not self.parar_thread:
            time.sleep(0.2)

    def contornar(self, motivo, tentativas):
        """Trata um tropeço sem derrubar a sessão: mostra e espera pra tentar de novo.

        Nada do que chega aqui é erro do código em si — código que o SPX
        recusa ele mostra na tela dele e a extensão devolve 'ok'. O que chega
        aqui é sempre infraestrutura (aba caiu, campo sumiu, Neon dormiu), e
        infraestrutura volta sozinha. O backoff existe pra não martelar: cresce
        até ESPERA_MAX_RETENTATIVA e para de crescer.
        """
        espera = espera_retentativa(tentativas)
        texto = f"{motivo} · tentando de novo em {espera}s (tentativa {tentativas})"
        self.ui(lambda: self.atualizar_status(texto))
        registrar(f"[contornado] {texto}")
        self.esperar(espera)

    def loop_colagem(self):
        erro = None
        falhas = 0        # tropeços seguidos no código da vez
        falhas_volta = 0  # tropeços seguidos numa volta inteira do laço
        impedir_suspensao()
        try:
            while not self.parar_thread:
              # Uma volta do laço não derruba a sessão. O colador roda a noite
              # inteira sem ninguém por perto: Neon dormindo, SPX fora do ar
              # por um minuto, aba descartada pelo Chrome — tudo isso tem que
              # virar espera e nova tentativa, não "Parou por erro" às 3h da
              # manhã com 900 códigos na fila.
              try:
                if self.pausado:
                    time.sleep(0.1)
                    continue

                if not self.lote:
                    self.ui(lambda: self.atualizar_status("buscando lote..."))
                    self.lote = self.reservar_lote()

                    if not self.lote:
                        if not self.continuo_exec:
                            break  # acabou: nada pendente no filtro
                        # Modo contínuo: fica de vigia. O que for bipado no
                        # recebimento daqui pra frente entra no próximo lote —
                        # e se ninguém bipa por um tempo, ele só espera; o que
                        # acumular sai junto na próxima rodada.
                        self.pendentes_banco = 0
                        espera = ("aguardando o recebimento colar"
                                  if MODOS[self.modo_exec]['depende_de']
                                  else "aguardando bipagens novas")
                        self.ui(lambda: self.atualizar_status(espera))
                        self.esperar(ESPERA_NOVOS)
                        falhas_volta = 0
                        continue

                    self.num_lote += 1
                    falhas_volta = 0
                    self.ui(self.atualizar_status)

                tabela, registro_id, codigo = self.lote[0]
                codigo = (codigo or '').strip()
                if not codigo:
                    self.lote.pop(0)
                    self.reservados.discard((tabela, registro_id))
                    continue

                if self.saida_exec == SAIDA_NAVEGADOR:
                    # Aba caiu (F5, troca de tela, Chrome descartou a aba) não
                    # é erro: ela reconecta sozinha em 3s. Espera sem consumir
                    # o código.
                    if not self.ponte.conectada:
                        self.ui(lambda: self.atualizar_status("esperando a aba do SPX"))
                        self.esperar(2)
                        continue

                    inicio_codigo = time.time()

                    def avisar_demora(segundos, cod=codigo):
                        self.ui(lambda: self.atualizar_status(
                            f"esperando a aba confirmar {cod} ({segundos}s)"))

                    entrou, motivo = self.ponte.enviar_codigo(
                        codigo,
                        cancelado=lambda: self.parar_thread,
                        ao_demorar=avisar_demora)
                    self.registrar_tempo(time.time() - inicio_codigo)
                    if self.parar_thread:
                        break

                    if not entrou:
                        # Não é o código que foi recusado: o que o SPX não
                        # aceita ele mostra na tela dele, e a extensão devolve
                        # "ok" do mesmo jeito. O que cai aqui é sempre a via —
                        # aba desconectou no meio, campo sumiu, falha ao
                        # enviar — e via volta sozinha. O código não foi
                        # consumido, então repetir não duplica nem pula nada.
                        falhas += 1
                        self.contornar(f"{codigo}: {motivo}", falhas)
                        if deve_adiar(falhas, len(self.lote)):
                            # Se travou só neste código, manda pro fim do lote
                            # e anda a fila em vez de ficar preso nele.
                            self.lote.append(self.lote.pop(0))
                            falhas = 0
                        continue
                    falhas = 0
                else:
                    self.restore_window_focus()
                    if self.parar_thread:
                        break

                    pyautogui.write(codigo)
                    pyautogui.press('enter')

                # Só marca como colado depois de digitado — parar no meio não
                # queima código nenhum.
                self.lote.pop(0)
                self.fila_confirmar.put((tabela, registro_id))
                self.colados_sessao += 1
                if self.pendentes_banco is not None:
                    self.pendentes_banco = max(0, self.pendentes_banco - 1)
                self.ui(self.atualizar_status)
                falhas_volta = 0

                # Pelo navegador quem dá o ritmo é o SPX: a extensão só devolve
                # o "ok" quando o campo destrava. Somar o intervalo do slider
                # em cima disso era só espera jogada fora.
                time.sleep(self.interval_slider.get())
              except Exception as e:
                # Rede de proteção da volta: erro de banco (o Neon derruba
                # conexão ociosa), de rede, ou qualquer coisa inesperada.
                # Espera e tenta de novo em vez de morrer — o lote segue
                # reservado e nenhum código foi consumido.
                falhas_volta += 1
                self.contornar(str(e).strip().split("\n")[0][:70], falhas_volta)
        except Exception as e:
            erro = str(e).strip().split("\n")[0][:90]
        finally:
            liberar_suspensao()
            self.finalizar_execucao(erro)

    def guardar_at(self, codigo, at):
        """Enfileira a AT que a aba capturou. Chamado da thread da ponte.

        Só enfileira: gravar aqui seguraria o WebSocket da aba enquanto o Neon
        responde, e o próximo código ficaria esperando um UPDATE que não tem
        nada a ver com ele.
        """
        self.fila_at.put((codigo, at))

    def loop_at(self):
        """Grava as ATs capturadas, uma a uma, fora do caminho da colagem.

        Erro aqui não pode parar nada: a AT é informação a mais: sem ela o
        pedido continua recebido e atribuído, só não aparece o número na tela
        do entregador. Por isso devolve pra fila e segue.
        """
        db = Banco(self.url_atual)
        try:
            while True:
                item = self.fila_at.get()
                if item is None:
                    break
                codigo, at = item
                try:
                    # Nas duas filas: o mesmo pacote pode estar na do galpão e
                    # na do entregador no mesmo dia, e a AT é a mesma.
                    for tabela in FILAS:
                        db.executar(sql_gravar_at(tabela),
                                    {'at': at, 'dia': self.dia_exec_at(), 'codigo': codigo},
                                    retorna=False)
                    self.ats_sessao += 1
                    self.ui(self.atualizar_status)
                    registrar(f"[AT] {codigo} -> {at}")
                except Exception as e:
                    registrar(f"[AT] ERRO ao gravar {codigo}: {e}")
                    self.fila_at.put((codigo, at))
                    time.sleep(2)
        finally:
            db.fechar()

    def dia_exec_at(self):
        """O dia em que a linha do código foi criada — é a chave junto do código.

        Usa o filtro do dia quando ele existe; em "todos os dias" cai no de
        hoje, que é quando a colagem está acontecendo.
        """
        dia = (self.filtros_exec or {}).get('dia')
        return dia or datetime.now().strftime('%Y-%m-%d')

    def loop_confirmacao(self):
        """Grava colado_em em segundo plano, agrupando ids, pra não atrasar a digitação."""
        db = Banco(self.url_atual)
        try:
            while True:
                item = self.fila_confirmar.get()
                if item is None:
                    break
                pares = [item]
                while len(pares) < 50:
                    try:
                        proximo = self.fila_confirmar.get_nowait()
                    except queue.Empty:
                        break
                    if proximo is None:
                        item = None
                        break
                    pares.append(proximo)
                # Um UPDATE por fila: as duas tabelas têm as mesmas colunas,
                # mas continuam sendo tabelas diferentes.
                porFila = {}
                for tabela, rid in pares:
                    porFila.setdefault(tabela, []).append(rid)
                try:
                    for tabela, ids in porFila.items():
                        db.executar(sql_confirmar(self.modo_exec, tabela),
                                    {'quem': self.quem, 'ids': ids}, retorna=False)
                    self.reservados.difference_update(pares)
                except Exception as e:
                    # Devolve pra fila: melhor confirmar atrasado do que perder.
                    registrar(f"Erro ao confirmar {len(pares)} códigos: {e}")
                    for par in pares:
                        self.fila_confirmar.put(par)
                    time.sleep(2)
                if item is None:
                    break
        finally:
            db.fechar()

    def finalizar_execucao(self, erro=None):
        self.executando = False
        self.pausado = False

        # Devolve pra fila o que foi reservado e não chegou a ser digitado.
        pendentes_lote = [(tabela, rid) for tabela, rid, _ in self.lote]
        self.lote = []
        self.fila_confirmar.put(None)
        if self.thread_confirmar:
            self.thread_confirmar.join(timeout=20)
        self.fila_at.put(None)
        if self.thread_at:
            self.thread_at.join(timeout=10)

        try:
            if pendentes_lote:
                porFila = {}
                for tabela, rid in pendentes_lote:
                    porFila.setdefault(tabela, []).append(rid)
                for tabela, ids in porFila.items():
                    self.db.executar(sql_liberar(self.modo_exec, tabela), {'ids': ids},
                                     retorna=False)
                self.reservados.difference_update(pendentes_lote)
        except Exception as e:
            registrar(f"Erro ao liberar reservas: {e}")
        finally:
            if self.db:
                self.db.fechar()
                self.db = None

        def na_ui():
            self.hide_control_window()
            self.atualizar_botoes()
            if erro:
                self.status_sessao.configure(text=f"Parou por erro: {erro}",
                                             text_color="#e74c3c")
            else:
                fim = "Parado" if self.continuo_exec else "Fila vazia"
                self.status_sessao.configure(
                    text=f"{fim} · {self.colados_sessao} códigos colados nesta sessão",
                    text_color="#2ecc71")
            if self.db_ui:
                self.contar_async()

        self.ui(na_ui)

    def stop_execution(self):
        self.parar_thread = True
        self.pausado = False

    def atualizar_status(self, extra=None):
        if not self.executando:
            return

        linha = (f"lote {self.num_lote} · faltam {len(self.lote)} nele · "
                 f"{self.colados_sessao} colados nesta sessão")
        # A AT capturada aparece aqui porque é o único jeito de saber, olhando a
        # janela, se a extensão está pegando o número. Sem isso, "a AT não chegou
        # no site" não distingue extensão velha de colador desconectado.
        if self.modo_exec == 'AT Cluster' or self.ats_sessao:
            linha += f" · {self.ats_sessao} ATs capturadas"
        if self.pendentes_banco is not None:
            linha += f" · {self.pendentes_banco} na fila"
        linha += self.ritmo()

        if self.pausado:
            cabecalho, cor = "PAUSADO", "#ff9900"
        elif extra:
            cabecalho, cor = extra, "#2c7be5"
        else:
            cabecalho, cor = "Colando", "#2ecc71"
        self.status_sessao.configure(text=f"{cabecalho} · {linha}", text_color=cor)

        if self.control_window is not None and self.control_window.winfo_exists():
            if self.pausado:
                situacao = "⏸ Pausado"
            elif extra:
                situacao = f"⏳ {extra}"
            else:
                situacao = "▶ Colando"
            self.control_label.configure(
                text=(f"{situacao}\n{self.modo_exec} · {self.xpt_menu.get()}"
                      f" · {self.colados_sessao} colados"),
                text_color=cor)
            if hasattr(self, 'control_pausar'):
                self.control_pausar.configure(
                    text="▶ Continuar" if self.pausado else "⏸ Pausar")

    # ------------------------------------------------------------ manutenção
    def comecar_do_agora(self):
        """Marca o que já existe como colado, pra colar só as bipagens novas.

        Serve pra quando o dia já começou e você não quer que o colador despeje
        todo o histórico de uma vez na plataforma.
        """
        if not self.db_ui or self.executando:
            if self.executando:
                self.status_sessao.configure(text="Pare a colagem antes disso",
                                             text_color="#e74c3c")
            return

        filtros = self.filtros_atuais()
        pendentes = self.pendentes_banco
        modo = self.modo_atual()

        def acao():
            def tarefa():
                try:
                    for tabela in FILAS:
                        self.db_ui.executar(sql_pular(modo, tabela),
                                            dict(filtros, quem=self.quem), retorna=False)
                    self.ui(self.contar_async)
                    self.ui(lambda: self.status_sessao.configure(
                        text="Histórico ignorado — só as bipagens novas serão coladas",
                        text_color="#2c7be5"))
                except Exception as e:
                    msg = str(e).strip().split("\n")[0][:90]
                    self.ui(lambda: self.status_sessao.configure(
                        text=f"Erro: {msg}", text_color="#e74c3c"))

            threading.Thread(target=tarefa, daemon=True).start()

        self.confirmar(
            titulo="Começar do agora",
            texto=(f"Ignorar os {pendentes if pendentes is not None else ''} códigos "
                   f"que já estão na fila de {self.descricao_filtro()}?\n\n"
                   f"Eles serão marcados como colados sem passar pela plataforma. "
                   f"Só o que for bipado a partir de agora será colado."),
            rotulo="Ignorar histórico", cor="#ff9900", hover="#e08900", acao=acao)

    def descricao_filtro(self):
        filtros = self.filtros_atuais()
        alvo = "todos os dias" if filtros['dia'] is None else f"{filtros['dia']}"
        return f"{alvo} / {filtros['xpt']} / {self.modo_atual()}"

    def confirmar(self, titulo, texto, rotulo, cor, hover, acao):
        janela = ctk.CTkToplevel(self.root)
        janela.title(titulo)
        janela.geometry("440x220")
        janela.resizable(False, False)
        janela.attributes('-topmost', True)
        janela.after(100, janela.grab_set)
        ctk.CTkLabel(janela, text=texto, wraplength=390, justify="left",
                     font=("Segoe UI", 13)).pack(pady=22, padx=22)

        botoes = ctk.CTkFrame(janela, fg_color="transparent")
        botoes.pack(pady=4)

        def confirmar_e_fechar():
            janela.grab_release()
            janela.destroy()
            acao()

        ctk.CTkButton(botoes, text=rotulo, width=150, fg_color=cor,
                      hover_color=hover, command=confirmar_e_fechar).pack(side="left", padx=6)
        ctk.CTkButton(botoes, text="Cancelar", width=130, fg_color="#8fa8c8",
                      hover_color="#7891b0",
                      command=janela.destroy).pack(side="left", padx=6)

    def zerar_colados(self):
        """Desmarca os colados do filtro atual, pra poder colar tudo de novo."""
        if not self.db_ui:
            return
        if self.executando:
            self.status_sessao.configure(text="Pare a colagem antes de desmarcar",
                                         text_color="#e74c3c")
            return

        filtros = self.filtros_atuais()
        modo = self.modo_atual()

        def acao():
            def tarefa():
                try:
                    for tabela in FILAS:
                        self.db_ui.executar(sql_zerar(modo, tabela), filtros, retorna=False)
                    self.ui(self.contar_async)
                    self.ui(lambda: self.status_sessao.configure(
                        text="Marcações removidas — a fila voltou ao início",
                        text_color="#2c7be5"))
                except Exception as e:
                    msg = str(e).strip().split("\n")[0][:90]
                    self.ui(lambda: self.status_sessao.configure(
                        text=f"Erro ao desmarcar: {msg}", text_color="#e74c3c"))

            threading.Thread(target=tarefa, daemon=True).start()

        self.confirmar(
            titulo="Desmarcar colados",
            texto=(f"Desmarcar como colados os registros de {self.descricao_filtro()}?\n\n"
                   f"Eles voltam pra fila e serão colados de novo na próxima execução."),
            rotulo="Desmarcar", cor="#e74c3c", hover="#c0392b", acao=acao)

    def ao_fechar(self):
        self.parar_thread = True
        if self.thread_execucao and self.thread_execucao.is_alive():
            self.thread_execucao.join(timeout=10)
        self.persistir_config()
        if self.db_ui:
            self.db_ui.fechar()
        if self.ponte:
            self.ponte.parar()
        self.root.destroy()

        # Fechar a janela estava deixando o processo vivo em segundo plano: o
        # servidor WebSocket e o loop asyncio seguram a saída, e aí o .exe fica
        # travado pra substituir e a porta ocupada pro próximo colador. Como
        # config, banco e ponte já foram encerrados acima, sair na marra aqui
        # não perde nada.
        os._exit(0)

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    ColadorApp().run()
