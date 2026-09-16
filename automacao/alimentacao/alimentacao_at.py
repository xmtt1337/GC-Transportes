"""Le o arquivo da AT exportada e monta as linhas que o backend espera.

Este arquivo e o gemeo do meusite/js/shopee-at.js. O site faz exatamente isto
no navegador quando alguem usa Alimentar > AT Exportada; aqui a mesma coisa
acontece sozinha, a partir do arquivo que cai na pasta de downloads.

Os dois PRECISAM concordar. Se a Shopee renomear uma coluna e so um lado for
arrumado, o envio continua funcionando e a coluna entra vazia - ninguem ve erro
nenhum, so o numero errado na conferencia dias depois. Por isso a tabela de
nomes abaixo e copia fiel da de la, e os testes travam isso.
"""

import csv
import os
import re
import unicodedata
from datetime import date, datetime

# Cabecalhos do arquivo exportado pela Shopee.
#   (chave que o backend espera, rotulo pra mensagem, grafias ja vistas)
# O casamento e sem acento e sem caixa: o export muda entre uma versao e outra.
CAMPOS = [
    ("task_id",              "Task ID",                      ("task id",)),
    ("station",              "Station name",                 ("station name", "station")),
    ("rota",                 "Corridor-Cage/Route",          ("corridor-cage/route", "corridor cage/route", "route")),
    ("cage",                 "Cage",                         ("cage",)),
    ("codigo",               "SPX tracking num",             ("spx tracking num", "spx tracking number", "spx tracking")),
    ("numero_to",            "TO number",                    ("to number",)),
    ("driver_nome",          "Driver name",                  ("driver name",)),
    ("driver_id",            "Driver ID",                    ("driver id",)),
    ("agency",               "Agency",                       ("agency",)),
    ("delivery_date",        "Delivery Date",                ("delivery date",)),
    ("zipcode",              "Zipcode",                      ("zipcode", "zip code")),
    ("qtd_pedidos",          "Number of order/TO",           ("number of order/to", "number of order / to")),
    ("qtd_atribuidos",       "Number of assigned orders/TO", ("number of assigned orders/to",)),
    ("status",               "Status",                       ("status",)),
    ("cidade",               "City",                         ("city",)),
    ("cluster",              "Cluster",                      ("cluster",)),
    ("bairro",               "Neighborhood",                 ("neighborhood",)),
    ("create_time",          "Create Time",                  ("create time",)),
    ("complete_time",        "Complete time",                ("complete time",)),
    ("driver_assigned_time", "Driver Assigned Time",         ("driver assigned time",)),
]

# Sem estes dois nao da pra saber o que e a linha nem qual AT substituir.
OBRIGATORIOS = ("task_id", "station")

# Colunas do relatorio de pedidos pesquisados (Pedidos > Rastreio de pedidos >
# Exportar pedidos pesquisados).
#
# So tres colunas sao nomeadas: o que interessa e o numero de rastreamento, que
# liga o pedido de volta a AT. O resto da linha vai inteiro pra coluna `dados`,
# em JSON - promover coluna depois e barato, e chutar agora o nome de coluna que
# ninguem viu ainda so criaria campo vazio com nome errado.
CAMPOS_PESQUISADOS = [
    ("codigo", "SPX TN", (
        "spx tn", "spx tn (numero de rastreamento)", "spx tracking num",
        "spx tracking number", "numero de rastreamento spx", "numero de rastreamento",
        "tracking number", "tracking no")),
    ("order_sn", "Order SN", ("order sn", "numero do pedido", "order id")),
    ("status", "Status do pedido", ("status do pedido", "order status", "status")),
]
OBRIGATORIOS_PESQUISADOS = ("codigo",)

# Os dois tipos que o vigia sabe receber, na ordem em que sao testados.
#
# A AT vem primeiro porque o arquivo dela TAMBEM tem numero de rastreamento: se
# a pesquisa fosse testada antes, todo arquivo de AT passaria por relatorio de
# pedidos pesquisados e entraria na tabela errada.
TIPOS = [
    ("at", CAMPOS, OBRIGATORIOS),
    ("pesquisados", CAMPOS_PESQUISADOS, OBRIGATORIOS_PESQUISADOS),
]

# Quantas colunas conhecidas precisam aparecer pra uma linha valer como
# cabecalho. Serve contra o falso positivo: uma linha de titulo com "Status"
# escrito nao e cabecalho de nada.
MINIMO_DE_COLUNAS = 5

# O arquivo que o macro da alimentacao baixa.
#
# O outro botao do SPX gera o Romaneio - e ele desce como
# "br_assignment_task_romaneio_*.csv", ou seja, com o MESMO prefixo. So o
# prefixo deixaria ele entrar. As colunas sao outras (ATs, ROTA, SEQ, PARADA,
# em portugues), entao a leitura ia recusar depois; mas recusar depois vira
# alarme vermelho na bandeja por um arquivo que nunca foi pra ca.
PREFIXO = "br_assignment_task_"
PREFIXO_GERAL = "br_"
FORA = ("romaneio",)
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

    O prefixo e generoso de proposito: os exports do SPX comecam com "br_", e o
    nome de cada relatorio muda com o tempo. Exigir o nome exato do arquivo da
    AT deixaria o de pedidos pesquisados de fora, que e justamente o que ainda
    nao se conhece.
    """
    nome = os.path.basename(str(caminho)).lower().replace(" ", "_")
    if not nome.startswith(PREFIXO_GERAL) or not nome.endswith(EXTENSOES):
        return False
    return not any(palavra in nome for palavra in FORA)


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


def achar_cabecalho(grade, campos=None, obrigatorios=None):
    """Em qual linha esta o cabecalho e onde cada coluna caiu.

    Procura nas 10 primeiras porque o export as vezes vem com titulo e linha em
    branco antes da tabela.
    """
    campos = CAMPOS if campos is None else campos
    obrigatorios = OBRIGATORIOS if obrigatorios is None else obrigatorios
    # Relatorio com poucas colunas nomeadas nao tem como bater o minimo geral.
    minimo = min(MINIMO_DE_COLUNAS, len(campos))

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
    for tipo, campos, obrigatorios in TIPOS:
        indice, _ = achar_cabecalho(grade, campos, obrigatorios)
        if indice >= 0:
            return tipo
    return None


def mapear(grade, campos=None, obrigatorios=None, rotulo_do_tipo="da AT",
           conteudo=("task_id", "codigo")):
    """A grade crua do arquivo -> (linhas pro backend, colunas que faltaram)."""
    campos = CAMPOS if campos is None else campos
    obrigatorios = OBRIGATORIOS if obrigatorios is None else obrigatorios

    indice_cabecalho, indices = achar_cabecalho(grade, campos, obrigatorios)
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
    grade = ler_grade(caminho)
    tipo = identificar(grade)
    if tipo is None:
        return None, [], []

    if tipo == "at":
        linhas, faltando = mapear(grade)
    else:
        linhas, faltando = mapear(grade, CAMPOS_PESQUISADOS, OBRIGATORIOS_PESQUISADOS,
                                  rotulo_do_tipo="dos pedidos pesquisados",
                                  conteudo=("codigo",))
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
