"""Testes do vigia: o que ele manda pro banco e o que ele deixa quieto.

Este programa roda escondido e grava por cima da AT do dia. Os erros que
importam nao aparecem na tela de ninguem:

  - reenviar um arquivo ja enviado (substitui a AT boa por ela mesma, ou pior,
    por uma versao velha);
  - mandar o que ja estava na pasta de downloads quando o programa foi
    instalado - arquivos de dias anteriores;
  - desistir na primeira falha de rede, sendo que o Render dorme e demora quase
    um minuto pra acordar.

Nao ha rede aqui: o backend e dublado. O que se testa e a decisao.

Dados de TESTE, inventados.
"""

import os
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import vigia_alimentacao as va  # noqa: E402


CABECALHO = ("Task ID,Station name,Corridor-Cage/Route,Cage,SPX tracking num,"
             "TO number,Driver name,Driver ID,Agency,Delivery Date,Zipcode,"
             "Number of order/TO,Number of assigned orders/TO,Status,City,"
             "Cluster,Neighborhood,Create Time,Complete time,Driver Assigned Time")


def csv_valido(task="AT202609159TTTD"):
    linha = (f"{task},XPT_SC_Cacador,CTB-2,,BR000000000001N,TO1,FULANO,1,GC,"
             "2026-09-15,89500-000,1,1,Complete,Curitibanos,CTB-2,Centro,"
             "2026-09-15 08:00:00,,")
    return CABECALHO + "\n" + linha + "\n"


class BackendDublado:
    def __init__(self, erro=None):
        self.erro = erro
        self.enviados = []
        self.token = None

    def enviar_at(self, nome, linhas):
        if self.erro:
            raise self.erro
        self.enviados.append((nome, len(linhas)))
        return {"success": True, "gravadas": len(linhas), "ats": 1,
                "estacoes": ["XPT_SC_Cacador"]}


class BaseDoVigia(unittest.TestCase):
    def setUp(self):
        self.temporaria = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporaria.cleanup)
        raiz = self.temporaria.name

        self.pasta = os.path.join(raiz, "downloads")
        os.makedirs(self.pasta)

        # Config e registro vao pro temporario: o teste nao pode encostar no
        # APPDATA de quem estiver rodando.
        for nome, valor in (("CONFIG_DIR", raiz),
                            ("CONFIG_PATH", os.path.join(raiz, "config.json")),
                            ("ENVIADOS_PATH", os.path.join(raiz, "enviados.json")),
                            ("ESPERA_PARADO_S", 0)):
            antigo = getattr(va, nome)
            setattr(va, nome, valor)
            self.addCleanup(setattr, va, nome, antigo)

        self.avisos = []
        self.cfg = {"usuario": "operacao", "senha": "x", "pasta": self.pasta,
                    "backend": "http://localhost"}

    def escrever(self, nome, conteudo=None):
        caminho = os.path.join(self.pasta, nome)
        with open(caminho, "w", encoding="utf-8", newline="") as f:
            f.write(csv_valido() if conteudo is None else conteudo)
        # mtime no passado: senao o vigia acha que o download ainda esta saindo
        antigo = time.time() - 60
        os.utime(caminho, (antigo, antigo))
        return caminho

    def criar_vigia(self, backend=None):
        vigia = va.Vigia(lambda: self.cfg,
                         lambda t, x, erro=False: self.avisos.append((t, x, erro)))
        vigia.backend = backend or BackendDublado()
        return vigia

    def varrer(self, vigia):
        # Duas passadas: a estabilidade do arquivo e medida comparando o
        # tamanho entre uma olhada e outra.
        vigia._varrer()
        vigia._varrer()


class Deteccao(BaseDoVigia):
    def test_enfileira_arquivo_novo(self):
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia()
        self.varrer(vigia)
        self.assertEqual(len(vigia.fila), 1)

    def test_ignora_nome_que_nao_e_o_relatorio(self):
        self.escrever("br_at_romaneio_v2_20260915.csv")
        self.escrever("qualquer_coisa.xlsx")
        vigia = self.criar_vigia()
        self.varrer(vigia)
        self.assertEqual(vigia.fila, [])

    def test_nao_enfileira_duas_vezes_o_mesmo_arquivo(self):
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia()
        self.varrer(vigia)
        self.varrer(vigia)
        self.assertEqual(len(vigia.fila), 1)

    def test_copia_com_outro_nome_e_mesmo_conteudo_nao_vai_de_novo(self):
        # "arquivo (1).csv" do Chrome: mesmo relatorio, nome diferente
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia()
        self.varrer(vigia)
        alvo = vigia.fila[0]
        vigia.registro.marcar(alvo.chave, nome="ja foi", resultado="ok")
        vigia.fila.clear()

        self.escrever("br_assignment_task_20260915 (1).csv")
        self.varrer(vigia)
        self.assertEqual(vigia.fila, [])

    def test_rodada_nova_do_macro_vai_mesmo_com_nome_parecido(self):
        # Conteudo diferente = relatorio novo, ainda que o nome seja irmao
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia()
        self.varrer(vigia)
        vigia.registro.marcar(vigia.fila[0].chave, nome="manha", resultado="ok")
        vigia.fila.clear()

        self.escrever("br_assignment_task_20260915 (1).csv", csv_valido("AT_OUTRA"))
        self.varrer(vigia)
        self.assertEqual(len(vigia.fila), 1)

    def test_download_pela_metade_nao_e_lido(self):
        caminho = self.escrever("br_assignment_task_baixando.csv")
        agora = time.time()
        os.utime(caminho, (agora, agora))
        antigo = va.ESPERA_PARADO_S
        va.ESPERA_PARADO_S = 3
        self.addCleanup(setattr, va, "ESPERA_PARADO_S", antigo)

        vigia = self.criar_vigia()
        self.varrer(vigia)
        self.assertEqual(vigia.fila, [])


class PrimeiraExecucao(BaseDoVigia):
    def test_o_que_ja_estava_na_pasta_nao_e_enviado(self):
        # Downloads de antes do programa existir. Reenviar substituiria a AT de
        # hoje pela de um dia velho.
        self.escrever("br_assignment_task_ontem.csv")
        vigia = self.criar_vigia()
        self.assertTrue(vigia.registro.primeira_vez)
        vigia._ignorar_o_que_ja_estava()
        self.varrer(vigia)
        self.assertEqual(vigia.fila, [])

    def test_arquivo_que_chega_depois_e_enviado(self):
        self.escrever("br_assignment_task_ontem.csv")
        vigia = self.criar_vigia()
        vigia._ignorar_o_que_ja_estava()

        self.escrever("br_assignment_task_agora.csv", csv_valido("AT_NOVA"))
        self.varrer(vigia)
        self.assertEqual(len(vigia.fila), 1)

    def test_na_segunda_abertura_nao_ignora_mais_nada(self):
        vigia = self.criar_vigia()
        vigia.registro.marcar("qualquer", nome="x", resultado="ok")
        self.assertFalse(va.Registro().primeira_vez)


class Envio(BaseDoVigia):
    def test_o_sistema_recebe_de_onde_veio_a_carga(self):
        # Sem a marca, carga automatica e carga subida a mao ficam identicas na
        # tela do site - e "isso veio de onde?" e sempre a primeira pergunta
        # quando o numero sai estranho.
        self.escrever("br_assignment_task_20260915.csv")
        backend = BackendDublado()
        vigia = self.criar_vigia(backend)
        self.varrer(vigia)
        vigia._processar(vigia.fila[0])

        enviado = backend.enviados[0][0]
        self.assertIn("br_assignment_task_20260915.csv", enviado)
        self.assertIn(va.ORIGEM, enviado)

    def test_sucesso_marca_e_nao_repete(self):
        self.escrever("br_assignment_task_20260915.csv")
        backend = BackendDublado()
        vigia = self.criar_vigia(backend)
        self.varrer(vigia)
        vigia._processar(vigia.fila[0])

        self.assertEqual(len(backend.enviados), 1)
        self.assertEqual(vigia.fila, [])
        self.varrer(vigia)
        self.assertEqual(vigia.fila, [])

    def test_arquivo_de_outro_relatorio_e_recusado_sem_tentar_de_novo(self):
        self.escrever("br_assignment_task_estranho.csv", "Coluna A,Coluna B\n1,2\n")
        backend = BackendDublado()
        vigia = self.criar_vigia(backend)
        self.varrer(vigia)
        vigia._processar(vigia.fila[0])

        self.assertEqual(backend.enviados, [])
        self.assertEqual(vigia.fila, [])
        self.assertTrue(self.avisos[-1][2], "o aviso tem que sair como erro")

    def test_falha_de_rede_espera_e_tenta_de_novo(self):
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia(BackendDublado(va.ErroDeEnvio("servidor dormindo")))
        self.varrer(vigia)
        pendente = vigia.fila[0]
        vigia._processar(pendente)

        self.assertEqual(vigia.fila, [pendente])
        self.assertEqual(pendente.tentativas, 1)
        self.assertGreater(pendente.nao_antes, time.time())
        self.assertIsNone(vigia._proximo(), "nao pode tentar antes da hora")

    def test_desiste_depois_do_limite_e_avisa(self):
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia(BackendDublado(va.ErroDeEnvio("caiu")))
        self.varrer(vigia)
        pendente = vigia.fila[0]
        for _ in range(va.MAX_TENTATIVAS):
            pendente.nao_antes = 0
            vigia._processar(pendente)

        self.assertEqual(vigia.fila, [])
        self.assertTrue(self.avisos[-1][2])
        self.assertIn("Nao consegui enviar", self.avisos[-1][0])

    def test_login_errado_nao_fica_tentando(self):
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia(BackendDublado(va.ErroDeConta("senha nao confere")))
        self.varrer(vigia)
        vigia._processar(vigia.fila[0])

        self.assertEqual(vigia.fila, [])
        self.assertTrue(self.avisos[-1][2])

    def test_sem_configuracao_o_arquivo_espera_sem_gastar_tentativa(self):
        self.cfg["senha"] = ""
        self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia()
        self.varrer(vigia)
        pendente = vigia.fila[0]
        vigia._processar(pendente)

        self.assertEqual(vigia.fila, [pendente])
        self.assertEqual(pendente.tentativas, 0)

    def test_envio_manual_repoe_arquivo_ja_enviado(self):
        caminho = self.escrever("br_assignment_task_20260915.csv")
        vigia = self.criar_vigia()
        self.varrer(vigia)
        vigia._processar(vigia.fila[0])
        self.assertEqual(vigia.fila, [])

        vigia.enfileirar(caminho)
        self.assertEqual(len(vigia.fila), 1)


class Config(unittest.TestCase):
    def test_so_esta_configurado_com_usuario_senha_e_pasta(self):
        self.assertFalse(va.configurado({"usuario": "x", "senha": "", "pasta": "c:/"}))
        self.assertFalse(va.configurado({"usuario": "", "senha": "y", "pasta": "c:/"}))
        self.assertTrue(va.configurado({"usuario": "x", "senha": "y", "pasta": "c:/"}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
