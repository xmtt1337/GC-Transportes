"""Testes da leitura do arquivo da AT exportada.

O que se protege aqui e o erro que nao aparece: se uma coluna deixar de casar,
o envio continua dando "sucesso" e o campo entra vazio no banco. Ninguem ve
nada ate a conferencia do dia seguinte sair errada.

O outro e o filtro de nome. O painel do SPX gera dois relatorios parecidos, e
mandar o Romaneio pra rota da AT substituiria a AT do dia por lixo.

Dados de TESTE, inventados.
"""

import datetime
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import alimentacao_at as at  # noqa: E402


CABECALHO = [
    "Task ID", "Station name", "Corridor-Cage/Route", "Cage", "SPX tracking num",
    "TO number", "Driver name", "Driver ID", "Agency", "Delivery Date", "Zipcode",
    "Number of order/TO", "Number of assigned orders/TO", "Status", "City",
    "Cluster", "Neighborhood", "Create Time", "Complete time", "Driver Assigned Time",
]

LINHA = [
    "AT202609159TTTD", "XPT_SC_Cacador", "CTB-2", "", "BR000000000001N",
    "TO0001", "FULANO DE TAL", "138666", "GCTRANSPORTES", "2026-09-15", "89500-000",
    "1", "1", "Complete", "Curitibanos", "CTB-2", "Interior",
    "2026-09-15 08:00:00", "2026-09-15 17:00:00", "2026-09-15 08:10:00",
]


def grade_de_teste(linhas=1):
    return [CABECALHO] + [list(LINHA) for _ in range(linhas)]


class NomeDoArquivo(unittest.TestCase):
    def test_aceita_o_relatorio_da_alimentacao(self):
        self.assertTrue(at.eh_arquivo_alvo("br_assignment_task_20260915.xlsx"))
        self.assertTrue(at.eh_arquivo_alvo("br_assignment_task_20260915.csv"))

    def test_aceita_a_copia_que_o_chrome_renomeia(self):
        # Baixar duas vezes no mesmo dia vira "arquivo (1).xlsx"
        self.assertTrue(at.eh_arquivo_alvo("br_assignment_task_20260915 (1).xlsx"))

    def test_nao_liga_pra_caixa_nem_pro_caminho(self):
        self.assertTrue(at.eh_arquivo_alvo(r"C:\Users\x\Downloads\BR_Assignment_Task_1.XLSX"))

    def test_recusa_o_romaneio(self):
        # Nasce do outro botao do SPX e abre igualzinho no Excel
        self.assertFalse(at.eh_arquivo_alvo("br_at_romaneio_v2_20260915.xlsx"))

    def test_recusa_o_romaneio_que_usa_o_mesmo_prefixo(self):
        # Nome real visto na pasta de downloads: o Romaneio desce com o MESMO
        # prefixo do relatorio da alimentacao, so com "romaneio" no meio
        self.assertFalse(at.eh_arquivo_alvo("br_assignment_task_romaneio_20260915.csv"))

    def test_recusa_download_pela_metade(self):
        self.assertFalse(at.eh_arquivo_alvo("br_assignment_task_1.xlsx.crdownload"))

    def test_recusa_outro_arquivo_qualquer(self):
        self.assertFalse(at.eh_arquivo_alvo("relatorio.xlsx"))
        self.assertFalse(at.eh_arquivo_alvo("assignment_task_1.xlsx"))


class Celulas(unittest.TestCase):
    def test_inteiro_guardado_como_float_nao_vira_decimal(self):
        # O Excel devolve 138666.0; "138666.0" nao casa com nenhum Driver ID
        self.assertEqual(at.texto_da_celula(138666.0), "138666")

    def test_data_sem_hora_nao_ganha_hora(self):
        self.assertEqual(at.texto_da_celula(datetime.datetime(2026, 9, 15)), "2026-09-15")
        self.assertEqual(at.texto_da_celula(datetime.date(2026, 9, 15)), "2026-09-15")

    def test_data_com_hora_mantem_a_hora(self):
        self.assertEqual(at.texto_da_celula(datetime.datetime(2026, 9, 15, 8, 30, 5)),
                         "2026-09-15 08:30:05")

    def test_vazio_vira_texto_vazio(self):
        self.assertEqual(at.texto_da_celula(None), "")


class Cabecalho(unittest.TestCase):
    def test_acha_na_primeira_linha(self):
        indice, indices = at.achar_cabecalho(grade_de_teste())
        self.assertEqual(indice, 0)
        self.assertEqual(indices["task_id"], 0)
        self.assertEqual(indices["station"], 1)

    def test_acha_depois_de_titulo_e_linha_em_branco(self):
        grade = [["Relatorio de atribuicao"], [], CABECALHO, list(LINHA)]
        indice, _ = at.achar_cabecalho(grade)
        self.assertEqual(indice, 2)

    def test_casa_sem_acento_e_sem_caixa(self):
        grade = [[c.upper() for c in CABECALHO], list(LINHA)]
        indice, indices = at.achar_cabecalho(grade)
        self.assertEqual(indice, 0)
        self.assertIn("cluster", indices)

    def test_linha_de_titulo_nao_passa_por_cabecalho(self):
        # Tem "Status" escrito, mas nao e cabecalho de nada
        grade = [["Status", "do relatorio"], CABECALHO, list(LINHA)]
        indice, _ = at.achar_cabecalho(grade)
        self.assertEqual(indice, 1)

    def test_sem_task_id_nao_ha_cabecalho(self):
        sem_task = [c for c in CABECALHO if c != "Task ID"]
        indice, indices = at.achar_cabecalho([sem_task])
        self.assertEqual(indice, -1)
        self.assertIsNone(indices)


class Mapeamento(unittest.TestCase):
    def test_monta_as_chaves_que_o_backend_espera(self):
        linhas, faltando = at.mapear(grade_de_teste())
        self.assertEqual(len(linhas), 1)
        self.assertEqual(faltando, [])
        linha = linhas[0]
        self.assertEqual(linha["task_id"], "AT202609159TTTD")
        self.assertEqual(linha["station"], "XPT_SC_Cacador")
        self.assertEqual(linha["codigo"], "BR000000000001N")
        self.assertEqual(linha["driver_nome"], "FULANO DE TAL")
        self.assertEqual(linha["cluster"], "CTB-2")

    def test_guarda_a_linha_crua_com_os_nomes_do_arquivo(self):
        linhas, _ = at.mapear(grade_de_teste())
        self.assertEqual(linhas[0]["dados"]["Task ID"], "AT202609159TTTD")
        self.assertEqual(linhas[0]["dados"]["Neighborhood"], "Interior")

    def test_coluna_extra_do_arquivo_entra_nos_dados_crus(self):
        # Coluna que o sistema ainda nao usa nao pode se perder
        cabecalho = CABECALHO + ["Coluna Nova"]
        grade = [cabecalho, LINHA + ["valor novo"]]
        linhas, _ = at.mapear(grade)
        self.assertEqual(linhas[0]["dados"]["Coluna Nova"], "valor novo")

    def test_coluna_que_faltou_entra_vazia_e_e_avisada(self):
        sem_cluster = [c for c in CABECALHO if c != "Cluster"]
        indice = CABECALHO.index("Cluster")
        linha = [v for i, v in enumerate(LINHA) if i != indice]
        linhas, faltando = at.mapear([sem_cluster, linha])
        self.assertEqual(linhas[0]["cluster"], "")
        self.assertIn("Cluster", faltando)

    def test_linha_vazia_do_fim_do_arquivo_nao_entra(self):
        grade = grade_de_teste() + [[""] * len(CABECALHO), []]
        linhas, _ = at.mapear(grade)
        self.assertEqual(len(linhas), 1)

    def test_linha_curta_nao_estoura(self):
        # O Excel corta a linha quando as ultimas celulas estao vazias
        grade = [CABECALHO, LINHA[:5]]
        linhas, _ = at.mapear(grade)
        self.assertEqual(linhas[0]["task_id"], "AT202609159TTTD")
        self.assertEqual(linhas[0]["complete_time"], "")

    def test_arquivo_de_outro_relatorio_e_recusado(self):
        with self.assertRaises(at.ArquivoInvalido):
            at.mapear([["Coluna A", "Coluna B"], ["1", "2"]])


# Recorte do cabecalho REAL do export_return_order_*.csv (ele tem 63 colunas).
#
# O "Order ID" aqui e o numero de RASTREAMENTO, e o pedido e o "Shopee Order
# SN" - ao contrario do que os nomes sugerem, e ao contrario de como a tela
# chama os dois ("SPX TN" e "Order SN").
CABECALHO_PESQUISADOS = [
    "Order ID", "SLS Tracking Number", "Shopee Order SN", "Buyer Name",
    "Driver Name", "Delivered Time", "Status", "Current Station",
]

LINHA_PESQUISADOS = [
    "BR000000000001N", "BR000000000001N", "260912SE1D2WSR", "Fulana de Tal",
    "LUIZ GUSTAVO", "15-09-2026 11:53", "Delivered", "XPT_SC_Cacador",
]


class Identificacao(unittest.TestCase):
    """Qual relatorio e o arquivo, olhando o cabecalho e nao o nome.

    O nome do arquivo depende de como a Shopee batiza o export do dia, e ja
    mudou. As colunas sao o que o relatorio E.
    """

    def test_reconhece_a_at(self):
        self.assertEqual(at.identificar(grade_de_teste()), "at")

    def test_reconhece_os_pedidos_pesquisados(self):
        grade = [CABECALHO_PESQUISADOS, LINHA_PESQUISADOS]
        self.assertEqual(at.identificar(grade), "pesquisados")

    def test_a_AT_nunca_passa_por_pedidos_pesquisados(self):
        # O arquivo da AT TAMBEM tem numero de rastreamento. Se a pesquisa
        # fosse testada antes, toda AT entraria na tabela errada - e o sintoma
        # seria a tabela da AT vazia com a de pesquisados cheia.
        self.assertEqual(at.identificar(grade_de_teste()), "at")

    def test_arquivo_de_outro_assunto_nao_e_nenhum_dos_dois(self):
        self.assertIsNone(at.identificar([["Coluna A", "Coluna B"], ["1", "2"]]))

    def test_romaneio_nao_e_nenhum_dos_dois(self):
        # Colunas reais do Romaneio, em portugues
        romaneio = [["ATs", "ROTA", "SEQ", "PARADA", "NÚMERO DO PEDIDO",
                     "ENDEREÇO COMPLETO", "BAIRRO", "CIDADE", "CEP"],
                    ["AT1", "R1", "1", "P1", "123", "Rua X", "Centro", "Curitibanos", "89500"]]
        self.assertIsNone(at.identificar(romaneio))


class NomeGeneroso(unittest.TestCase):
    def test_aceita_os_dois_relatorios_pra_depois_olhar_dentro(self):
        # Nomes reais: a AT desce como br_*, os pedidos pesquisados como
        # export_return_order_* - o SPX chama esse export de "Return Order"
        # mesmo vindo do botao "Exportar pedidos pesquisados".
        self.assertTrue(at.eh_arquivo_alvo("br_assignment_task_20260916.csv"))
        self.assertTrue(at.eh_arquivo_alvo("export_return_order_2026-09-16_11-27-00.csv"))

    def test_continua_recusando_o_romaneio_pelo_nome(self):
        self.assertFalse(at.eh_arquivo_alvo("br_assignment_task_romaneio_20260915.csv"))

    def test_recusa_o_que_nao_e_export_do_spx(self):
        self.assertFalse(at.eh_arquivo_alvo("relatorio_interno.xlsx"))
        self.assertFalse(at.eh_arquivo_alvo("br_qualquer.pdf"))

    def test_recusa_export_do_spx_que_nao_e_nosso(self):
        # A pasta de downloads tem anos de export_forward_order_*, baixados a
        # mao pra outra finalidade. Quando o filtro aceitava so "export_", todos
        # viraram novidade de uma vez e foram parar no banco.
        self.assertFalse(at.eh_arquivo_alvo("export_forward_order_2026-08-29_02-00-38.csv"))
        self.assertFalse(at.eh_arquivo_alvo("br_outro_relatorio_qualquer.csv"))


class Resumo(unittest.TestCase):
    def test_conta_ats_e_nao_so_linhas(self):
        # Um Task ID por AT: o arquivo traz varias ATs, com varios pacotes cada
        grade = [CABECALHO]
        for task in ("AT1", "AT1", "AT2"):
            linha = list(LINHA)
            linha[0] = task
            grade.append(linha)
        linhas, _ = at.mapear(grade)
        numeros = at.resumo(linhas)
        self.assertEqual(numeros["linhas"], 3)
        self.assertEqual(numeros["ats"], 2)

    def test_lista_as_estacoes_sem_repetir(self):
        grade = [CABECALHO]
        for estacao in ("XPT_SC_Cacador", "XPT_SC_Videira", "XPT_SC_Cacador"):
            linha = list(LINHA)
            linha[1] = estacao
            grade.append(linha)
        linhas, _ = at.mapear(grade)
        self.assertEqual(at.resumo(linhas)["estacoes"],
                         ["XPT_SC_Cacador", "XPT_SC_Videira"])


class ArquivoDeVerdade(unittest.TestCase):
    """Do disco ate as linhas, como acontece quando o arquivo cai na pasta."""

    def _escrever(self, nome, conteudo):
        caminho = os.path.join(self.pasta.name, nome)
        with open(caminho, "w", encoding="utf-8", newline="") as f:
            f.write(conteudo)
        return caminho

    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.addCleanup(self.pasta.cleanup)

    def test_csv_com_virgula(self):
        conteudo = ",".join(CABECALHO) + "\n" + ",".join(LINHA) + "\n"
        caminho = self._escrever("br_assignment_task_teste.csv", conteudo)
        linhas, faltando = at.ler_arquivo(caminho)
        self.assertEqual(len(linhas), 1)
        self.assertEqual(faltando, [])
        self.assertEqual(linhas[0]["station"], "XPT_SC_Cacador")

    def test_csv_com_ponto_e_virgula(self):
        # Excel em portugues exporta assim
        conteudo = ";".join(CABECALHO) + "\n" + ";".join(LINHA) + "\n"
        caminho = self._escrever("br_assignment_task_teste.csv", conteudo)
        linhas, _ = at.ler_arquivo(caminho)
        self.assertEqual(linhas[0]["task_id"], "AT202609159TTTD")

    def test_arquivo_so_com_cabecalho_e_recusado(self):
        caminho = self._escrever("br_assignment_task_vazio.csv", ",".join(CABECALHO) + "\n")
        with self.assertRaises(at.ArquivoInvalido):
            at.ler_arquivo(caminho)

    def test_xls_antigo_avisa_o_que_fazer(self):
        caminho = self._escrever("br_assignment_task_velho.xls", "qualquer coisa")
        with self.assertRaises(at.ArquivoInvalido) as erro:
            at.ler_arquivo(caminho)
        self.assertIn("xlsx", str(erro.exception))

    def test_ler_qualquer_separa_os_dois_relatorios(self):
        da_at = self._escrever("br_assignment_task_x.csv",
                               ",".join(CABECALHO) + "\n" + ",".join(LINHA) + "\n")
        pesquisados = self._escrever(
            "br_order_tracking_x.csv",
            ",".join(CABECALHO_PESQUISADOS) + "\n" + ",".join(LINHA_PESQUISADOS) + "\n")

        tipo, linhas, _ = at.ler_qualquer(da_at)
        self.assertEqual(tipo, "at")
        self.assertEqual(linhas[0]["task_id"], "AT202609159TTTD")

        tipo, linhas, _ = at.ler_qualquer(pesquisados)
        self.assertEqual(tipo, "pesquisados")
        self.assertEqual(linhas[0]["codigo"], "BR000000000001N")
        self.assertEqual(linhas[0]["order_sn"], "260912SE1D2WSR",
                         "o pedido e o Shopee Order SN, nao o Order ID")
        self.assertEqual(linhas[0]["status"], "Delivered")

    def test_pedido_pesquisado_leva_a_linha_inteira_do_arquivo(self):
        # As colunas que ainda nao foram nomeadas nao podem se perder: promover
        # coluna depois e barato, reimportar tudo nao e.
        caminho = self._escrever(
            "br_order_tracking_x.csv",
            ",".join(CABECALHO_PESQUISADOS) + "\n" + ",".join(LINHA_PESQUISADOS) + "\n")
        _, linhas, _ = at.ler_qualquer(caminho)
        self.assertEqual(linhas[0]["dados"]["Driver Name"], "LUIZ GUSTAVO")
        self.assertEqual(linhas[0]["dados"]["Delivered Time"], "15-09-2026 11:53")

    def test_arquivo_de_outro_assunto_nao_e_erro_e_sim_tipo_nenhum(self):
        # A pasta de downloads tem de tudo; nao reconhecer nao pode virar alarme
        caminho = self._escrever("br_outra_coisa.csv", "Coluna A,Coluna B\n1,2\n")
        tipo, linhas, _ = at.ler_qualquer(caminho)
        self.assertIsNone(tipo)
        self.assertEqual(linhas, [])

    def test_xlsx_de_verdade(self):
        import openpyxl

        caminho = os.path.join(self.pasta.name, "br_assignment_task_teste.xlsx")
        livro = openpyxl.Workbook()
        aba = livro.active
        aba.append(CABECALHO)
        linha = list(LINHA)
        linha[7] = 138666          # Driver ID como numero, que e como o Excel guarda
        linha[9] = datetime.datetime(2026, 9, 15)
        aba.append(linha)
        livro.save(caminho)

        linhas, _ = at.ler_arquivo(caminho)
        self.assertEqual(linhas[0]["driver_id"], "138666")
        self.assertEqual(linhas[0]["delivery_date"], "2026-09-15")


if __name__ == "__main__":
    unittest.main(verbosity=2)
