"""Le o arquivo da AT exportada e monta as linhas que o backend espera.

O relatorio da AT e o ROMANEIO (botao "Exportar Romaneio", tarefa "Br AT
Romaneio V2" no painel) - nao o "Exportar AT" (Br Assignment Task). O Romaneio
vem em portugues e traz "NÚMERO DO PEDIDO" fazendo o papel de codigo; o outro e
em ingles e usa "SPX tracking num". CAMPOS reconhece as duas grafias, porque o
mesmo campo logico (task_id, station, codigo...) pode chegar com qualquer um
dos dois nomes - quem decidiu trocar de relatorio foi a operacao, depois de ver
que o Romaneio e o que a conferencia realmente usa.

Se a Shopee renomear uma coluna, o envio continua funcionando e ela entra
vazia - ninguem ve erro nenhum, so o numero errado na conferencia dias depois.
Por isso os nomes ficam explicitos aqui, e os testes travam contra o cabecalho
real do arquivo.
"""

import csv
import os
import re
import unicodedata
from datetime import date, datetime

# Cabecalhos do relatorio da AT.
#   (chave que o backend espera, rotulo pra mensagem, grafias ja vistas)
#
# Cada linha tem grafias em INGLES (Br Assignment Task, o "Exportar AT" que nao
# usamos mais) e em PORTUGUES (Br AT Romaneio V2, o "Exportar Romaneio" que o
# macro baixa hoje) - o casamento e sem acento e sem caixa, e aceita as duas
# porque e mais barato que manter dois mapeamentos.
#
# Colunas que so existem no Romaneio (SEQ, PARADA, ENDEREÇO COMPLETO, TIPO DE
# VEICULO REAL...) nao tem chave aqui e mesmo assim nao se perdem: toda a linha
# crua do arquivo vai pra coluna `dados`, promover uma delas depois e barato.
CAMPOS = [
    ("task_id",              "Task ID / ATs",                ("task id", "ats")),
    ("station",              "Station name / Estação",       ("station name", "station", "estacao")),
    ("rota",                 "Route / Rota",                 ("corridor-cage/route", "corridor cage/route", "route", "rota")),
    ("cage",                 "Cage / Corredor-Gaiola",       ("cage", "corredor-gaiola")),
    ("codigo",               "SPX tracking num / Número do Pedido",
                                                              ("spx tracking num", "spx tracking number", "spx tracking",
                                                               "numero do pedido")),
    ("numero_to",            "TO number",                    ("to number",)),
    ("driver_nome",          "Driver name",                  ("driver name",)),
    ("driver_id",            "Driver ID",                    ("driver id",)),
    ("agency",               "Agency",                       ("agency",)),
    ("delivery_date",        "Delivery Date",                ("delivery date",)),
    ("zipcode",              "Zipcode / CEP",                ("zipcode", "zip code", "cep")),
    ("qtd_pedidos",          "Number of order/TO / Total de Pedidos",
                                                              ("number of order/to", "number of order / to",
                                                               "total de pedidos")),
    ("qtd_atribuidos",       "Number of assigned orders/TO", ("number of assigned orders/to",)),
    ("status",               "Status",                       ("status",)),
    ("cidade",               "City / Cidade",                ("city", "cidade")),
    ("cluster",              "Cluster / Nome do Cluster",    ("cluster", "nome do cluster")),
    ("bairro",               "Neighborhood / Bairro",        ("neighborhood", "bairro")),
    ("create_time",          "Create Time",                  ("create time",)),
    ("complete_time",        "Complete time",                ("complete time",)),
    ("driver_assigned_time", "Driver Assigned Time",         ("driver assigned time",)),
]

# Sem estes dois nao da pra saber o que e a linha nem qual AT substituir.
OBRIGATORIOS = ("task_id", "station")

# Colunas do relatorio de pedidos pesquisados (Pedidos > Rastreio de pedidos >
# Exportar pedidos pesquisados), conferidas no arquivo de verdade
# (export_return_order_*.csv).
#
# So tres sao nomeadas: o que interessa e o numero de rastreamento, que liga o
# pedido de volta a AT. As outras sessenta colunas vao inteiras pra `dados`, em
# JSON - promover coluna depois e barato.
#
# ATENCAO ao "Order ID": nesse relatorio ele e o NUMERO DE RASTREAMENTO
# (BR2633884...N), e nao o numero do pedido - quem faz o papel de pedido e o
# "Shopee Order SN" (260912SE1D2WSR). Na tela os dois aparecem como "SPX TN" e
# "Order SN", e no arquivo trocam de nome. Mapear pelo palpite trocava os dois
# de lugar, e o codigo que liga tudo de volta a AT entraria errado.
CAMPOS_PESQUISADOS = [
    ("codigo", "Order ID", (
        "order id", "spx tn", "spx tn (numero de rastreamento)", "spx tracking num",
        "spx tracking number", "sls tracking number", "numero de rastreamento spx",
        "numero de rastreamento", "tracking number", "tracking no")),
    ("order_sn", "Shopee Order SN", (
        "shopee order sn", "order sn", "numero do pedido")),
    ("status", "Status", ("status", "status do pedido", "order status")),
    # Vem pronto no proprio arquivo - a tela "por entregador" (Torre de
    # Controle > Na Rua > Shopee) agrupa por aqui, sem precisar de join com a AT.
    ("driver_nome", "Driver Name", ("driver name", "nome do motorista")),
    ("driver_id", "Driver ID", ("driver id",)),
]
OBRIGATORIOS_PESQUISADOS = ("codigo",)

# Os dois tipos que o vigia sabe receber, na ordem em que sao testados:
#   (tipo, campos, obrigatorios, quantas colunas conhecidas bastam)
#
# A AT vem primeiro porque o arquivo dela TAMBEM tem numero de rastreamento: se
# a pesquisa fosse testada antes, todo arquivo de AT passaria por relatorio de
# pedidos pesquisados e entraria na tabela errada.
#
# O minimo do relatorio de pesquisados e 2 e nao 3: so tres colunas dele sao
# nomeadas, e exigir as tres seria quebrar a leitura inteira se a Shopee
# renomear uma. O codigo continua obrigatorio - sem ele a linha nao serve pra
# nada mesmo.
TIPOS = [
    ("at", CAMPOS, OBRIGATORIOS, 5),
    ("pesquisados", CAMPOS_PESQUISADOS, OBRIGATORIOS_PESQUISADOS, 2),
]

# Quantas colunas conhecidas precisam aparecer pra uma linha valer como
# cabecalho. Serve contra o falso positivo: uma linha de titulo com "Status"
# escrito nao e cabecalho de nada.
MINIMO_DE_COLUNAS = 5

# O arquivo que o macro da alimentacao baixa e "br_assignment_task_romaneio_*"
# - o nome do arquivo NAO muda quando o relatorio troca de "Br Assignment
# Task" pra "Br AT Romaneio V2"; o SPX so acrescenta "_romaneio" ao mesmo
# prefixo. Ambos entram aqui de proposito: quem decide o TIPO e o cabecalho
# (identificar()), nao o nome do arquivo.
PREFIXO = "br_assignment_task_"
# Os comecos dos relatorios que interessam, e so eles.
#
# "export_" sozinho era largo demais: a pasta de downloads tem anos de
# export_forward_order_* que alguem baixou a mao, e todos viraram novidade no
# dia em que o filtro abriu. Relatorio que nao e nosso nao deve nem ser aberto.
#
# "backlogs" e o terceiro: Painel > Entrega/Devolucao > AMH-LM > Delivery V3.0,
# o iconezinho de baixar ao lado do card "Backlog". Sempre com esse nome exato
# (a Shopee so acrescenta "(1)", "(2)"... quando ja existe um igual na pasta),
# entao aqui o nome do arquivo decide o tipo - ao contrario da AT e dos
# pedidos pesquisados, que sao identificados pelo CABECALHO porque o nome dos
# dois ja mudou com o tempo.
PREFIXOS = ("br_assignment_task_", "export_return_order_", "backlogs")
EXTENSOES = (".xlsx", ".csv")

# Teto do backend por envio (AT_MAX_LINHAS no server.js). Conferir aqui evita
# subir 20 MB pra receber 400 do outro lado.
MAX_LINHAS = 50000


class ArquivoInvalido(Exception):
    """O arquivo existe mas nao e o que esperavamos."""


def normalizar(valor):
    texto = unicodedata.normalize("NFD", "" if valor is None else str(valor))
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", texto).strip().lower()


def eh_arquivo_alvo(caminho):
    """Vale a pena ABRIR este arquivo? Quem decide o que ele e, depois, e o
    cabecalho - o nome so evita ler a pasta de downloads inteira.

    Os dois relatorios comecam diferente ("br_" e "export_"), e o nome completo
    de cada um muda com o tempo - por isso so o comeco entra aqui.
    """
    nome = os.path.basename(str(caminho)).lower().replace(" ", "_")
    return nome.startswith(PREFIXOS) and nome.endswith(EXTENSOES)


def texto_da_celula(valor):
    """O valor como o Excel MOSTRA, nao como o Python guarda.

    O site le com raw:false e recebe tudo ja formatado em texto. Aqui a planilha
    devolve tipos: sem esta conversao um Task ID inteiro viraria "2.0260916e+13"
    e uma data viraria "2026-09-15 00:00:00" com hora que nao existia no arquivo.
    """
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return "TRUE" if valor else "FALSE"
    if isinstance(valor, datetime):
        if valor.hour or valor.minute or valor.second:
            return valor.strftime("%Y-%m-%d %H:%M:%S")
        return valor.strftime("%Y-%m-%d")
    if isinstance(valor, date):
        return valor.strftime("%Y-%m-%d")
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    return str(valor).strip()


def _celula(linha, indice):
    if indice is None or indice >= len(linha):
        return ""
    return texto_da_celula(linha[indice])


def achar_cabecalho(grade, campos=None, obrigatorios=None, minimo=None):
    """Em qual linha esta o cabecalho e onde cada coluna caiu.

    Procura nas 10 primeiras porque o export as vezes vem com titulo e linha em
    branco antes da tabela.
    """
    campos = CAMPOS if campos is None else campos
    obrigatorios = OBRIGATORIOS if obrigatorios is None else obrigatorios
    minimo = MINIMO_DE_COLUNAS if minimo is None else minimo
    minimo = min(minimo, len(campos))

    for i in range(min(len(grade), 10)):
        nomes = [normalizar(c) for c in (grade[i] or [])]
        indices = {}
        for chave, _rotulo, grafias in campos:
            for j, nome in enumerate(nomes):
                if nome in grafias:
                    indices[chave] = j
                    break
        if all(o in indices for o in obrigatorios) and len(indices) >= minimo:
            return i, indices
    return -1, None


def identificar(grade):
    """Qual relatorio e este arquivo, olhando o cabecalho. None se nao for nenhum.

    Pelo CONTEUDO, e nao pelo nome: o nome do arquivo depende de como a Shopee
    batiza o export do dia, e ja mudou. As colunas sao o que o relatorio e.
    """
    for tipo, campos, obrigatorios, minimo in TIPOS:
        indice, _ = achar_cabecalho(grade, campos, obrigatorios, minimo)
        if indice >= 0:
            return tipo
    return None


def mapear(grade, campos=None, obrigatorios=None, rotulo_do_tipo="da AT",
           conteudo=("task_id", "codigo"), minimo=None):
    """A grade crua do arquivo -> (linhas pro backend, colunas que faltaram)."""
    campos = CAMPOS if campos is None else campos
    obrigatorios = OBRIGATORIOS if obrigatorios is None else obrigatorios

    indice_cabecalho, indices = achar_cabecalho(grade, campos, obrigatorios, minimo)
    if indice_cabecalho < 0:
        esperadas = ", ".join(r for c, r, _ in campos if c in obrigatorios)
        raise ArquivoInvalido(
            f"nao achei o cabecalho {rotulo_do_tipo} neste arquivo - "
            f"ele precisa ter pelo menos as colunas {esperadas}")

    cabecalho = grade[indice_cabecalho] or []
    faltando = [rotulo for chave, rotulo, _ in campos if chave not in indices]

    linhas = []
    for i in range(indice_cabecalho + 1, len(grade)):
        bruta = grade[i] or []
        registro = {chave: _celula(bruta, indices.get(chave)) for chave, _r, _g in campos}
        # Linha vazia do fim do arquivo: o Excel costuma trazer varias.
        if not any(registro.get(c) for c in conteudo):
            continue

        # A linha inteira do arquivo vai junto, inclusive as colunas que o
        # sistema ainda nao usa - assim uma necessidade nova nao obriga a
        # reimportar tudo.
        completo = {}
        for j, nome in enumerate(cabecalho):
            chave = str(nome or "").strip()
            if chave:
                completo[chave] = _celula(bruta, j)
        registro["dados"] = completo
        linhas.append(registro)

    return linhas, faltando


def mapear_backlog(grade):
    """A grade crua do backlogs.xlsx -> linhas pro backend.

    Sem CAMPOS aqui de proposito: ninguem sabe ainda quais colunas esse
    relatorio traz (e a Shopee pode trocar sem avisar, como ja fez com os
    outros dois). Em vez de adivinhar nome de coluna e arriscar o mesmo erro
    de "Driver Name" vindo vazio por causa de grafia errada, a linha INTEIRA
    vira `dados` - promover uma coluna especifica fica pra quando alguem
    pedir, olhando o que chegou de verdade.

    O cabecalho e SEMPRE a linha 0, sem escanear as primeiras linhas
    procurando titulo ou linha em branco (como a AT e os pedidos pesquisados
    fazem) - o arquivo real baixado no hub veio direto no cabecalho, com uma
    UNICA coluna ("Station ID"). Com so 1 coluna nao da pra distinguir
    "titulo" de "cabecalho de verdade" pela quantidade de celulas
    preenchidas (as duas teriam 1), entao nem vale tentar - se um dia
    aparecer um arquivo com titulo antes, ajusta aqui olhando pro que chegou.
    """
    if not grade or not any(texto_da_celula(c) for c in (grade[0] or [])):
        raise ArquivoInvalido("nao achei um cabecalho no arquivo de backlog")

    cabecalho = grade[0] or []
    linhas = []
    for i in range(1, len(grade)):
        bruta = grade[i] or []
        completo = {}
        for j, nome in enumerate(cabecalho):
            chave = str(nome or "").strip()
            if chave:
                completo[chave] = _celula(bruta, j)
        if not any(completo.values()):
            continue
        linhas.append({"dados": completo})
    return linhas


def _grade_csv(caminho):
    with open(caminho, "rb") as f:
        bruto = f.read()
    for codificacao in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            texto = bruto.decode(codificacao)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ArquivoInvalido("nao consegui decodificar o texto do CSV")

    # O separador muda com a regiao do Excel de quem exportou.
    amostra = texto[:8192]
    try:
        dialeto = csv.Sniffer().sniff(amostra, delimiters=",;\t")
        separador = dialeto.delimiter
    except csv.Error:
        separador = ";" if amostra.count(";") > amostra.count(",") else ","

    return [linha for linha in csv.reader(texto.splitlines(), delimiter=separador)]


def _grade_xlsx(caminho):
    import openpyxl

    livro = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    try:
        aba = livro[livro.sheetnames[0]]
        return [list(linha) for linha in aba.iter_rows(values_only=True)]
    finally:
        livro.close()


def ler_grade(caminho):
    extensao = os.path.splitext(caminho)[1].lower()
    if extensao == ".csv":
        return _grade_csv(caminho)
    if extensao == ".xlsx":
        return _grade_xlsx(caminho)
    if extensao == ".xls":
        raise ArquivoInvalido(
            ".xls antigo nao e lido aqui - exporte em .xlsx ou .csv no SPX")
    raise ArquivoInvalido(f"nao sei ler arquivo {extensao}")


def _conferir(linhas):
    if not linhas:
        raise ArquivoInvalido("o arquivo nao tem nenhuma linha preenchida")
    if len(linhas) > MAX_LINHAS:
        raise ArquivoInvalido(
            f"{len(linhas)} linhas - o limite por envio e {MAX_LINHAS}")


def ler_arquivo(caminho):
    """O caminho do arquivo da AT -> (linhas, colunas que faltaram)."""
    linhas, faltando = mapear(ler_grade(caminho))
    _conferir(linhas)
    return linhas, faltando


def ler_qualquer(caminho):
    """O caminho -> (tipo, linhas, colunas que faltaram).

    Tipo None quer dizer "nao e nenhum dos relatorios que sei ler" - e isso NAO
    e erro: a pasta de downloads tem de tudo, e o filtro de nome e generoso de
    proposito. Erro e um arquivo do tipo certo que nao da pra ler.
    """
    # Backlog e pelo NOME, nao pelo cabecalho - e o unico dos tres sem CAMPOS
    # conhecidos pra identificar por conteudo (ver mapear_backlog).
    nome = os.path.basename(str(caminho)).lower()
    if nome.startswith("backlogs"):
        linhas = mapear_backlog(ler_grade(caminho))
        _conferir(linhas)
        return "backlog", linhas, []

    grade = ler_grade(caminho)
    tipo = identificar(grade)
    if tipo is None:
        return None, [], []

    if tipo == "at":
        linhas, faltando = mapear(grade)
    else:
        linhas, faltando = mapear(grade, CAMPOS_PESQUISADOS, OBRIGATORIOS_PESQUISADOS,
                                  rotulo_do_tipo="dos pedidos pesquisados",
                                  conteudo=("codigo",), minimo=2)
    _conferir(linhas)
    return tipo, linhas, faltando


def resumo(linhas):
    """O que vai ser gravado, em numeros - e o texto do aviso na bandeja.

    ATs alem de linhas porque o arquivo traz VARIAS ATs (um Task ID por AT), e
    e a estacao que decide o que vai ser substituido no banco.
    """
    ats = {l["task_id"].strip() for l in linhas if l.get("task_id", "").strip()}
    estacoes = []
    for l in linhas:
        estacao = (l.get("station") or "").strip()
        if estacao and estacao not in estacoes:
            estacoes.append(estacao)
    return {"linhas": len(linhas), "ats": len(ats), "estacoes": estacoes}
