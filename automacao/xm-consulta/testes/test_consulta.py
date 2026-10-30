"""Regras do XM Consulta, sem rede e sem tela. Dados de TESTE, inventados."""

import csv
import os
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import consulta  # noqa: E402

ANJUN = consulta.TRANSPORTADORAS[0]


class Resposta:
    def __init__(self, status=200, corpo=None):
        self.status_code = status
        self._corpo = corpo or {}

    def json(self):
        return self._corpo


class Codigos(unittest.TestCase):
    def test_aceita_separadores_tira_repetido_e_conta_lixo(self):
        texto = "AJ100000000000001\naj100000000000002, AJ100000000000001;BR123 xyz"
        codigos, ignorados = consulta.extrair_codigos(texto, ANJUN.padrao)
        self.assertEqual(codigos, ["AJ100000000000001", "AJ100000000000002"])
        self.assertEqual(ignorados, 2)

    def test_so_a_anjun_esta_ativa(self):
        self.assertEqual([t.nome for t in consulta.TRANSPORTADORAS if t.ativa], ["Anjun"])
        self.assertEqual([t.chave for t in consulta.TRANSPORTADORAS], ["anjun", "shopee", "imile"])


class Whatsapp(unittest.TestCase):
    def test_acrescenta_ddi_so_quando_falta(self):
        self.assertEqual(consulta.link_whatsapp("49900000000"), "https://wa.me/5549900000000")
        self.assertEqual(consulta.link_whatsapp("(49) 3333-3333"), "https://wa.me/554933333333")
        self.assertEqual(consulta.link_whatsapp("5549900000000"), "https://wa.me/5549900000000")

    def test_telefone_invalido_fica_vazio(self):
        self.assertEqual(consulta.link_whatsapp("123"), "")
        self.assertEqual(consulta.link_whatsapp(None), "")


class Csv(unittest.TestCase):
    def test_excel_com_ponto_e_virgula_acento_e_sem_formula(self):
        with tempfile.TemporaryDirectory() as pasta:
            caminho = consulta.gravar_csv(
                pasta, "anjun",
                [{"waybill": "AJ1", "status": "Em trânsito", "nome": '=Fulano "X"',
                  "telefone": "49900000000", "whatsapp": "https://wa.me/5549900000000"}],
                agora=datetime(2026, 10, 30, 12, 0, 0))
            with open(caminho, "rb") as f:
                self.assertTrue(f.read().startswith(b"\xef\xbb\xbf"))
            with open(caminho, encoding="utf-8-sig", newline="") as f:
                linhas = list(csv.reader(f, delimiter=";"))
        self.assertTrue(caminho.endswith("anjun-contatos-2026-10-30_12-00-00.csv"))
        self.assertEqual(linhas[0], consulta.COLUNAS)
        self.assertEqual(linhas[1][1], "Em trânsito")
        self.assertEqual(linhas[1][2], "'=Fulano \"X\"")


class Executar(unittest.TestCase):
    def setUp(self):
        self.parar = threading.Event()
        self.avancos = []
        self.pausas = []

    def rodar(self, codigos, pedir, relogio=lambda: 0):
        return consulta.executar("anjun", codigos, pedir,
                                 lambda f, t: self.avancos.append(consulta.porcentagem(f, t)),
                                 self.parar, relogio=relogio, dormir=self.pausas.append)

    def test_fluxo_completo_com_porcentagem_e_duas_por_segundo(self):
        ok = lambda m: {"ok": True, "dados": {"status": "S", "nome": "F", "telefone": "49900000000"}}
        res = self.rodar(["AJ1", "AJ2", "AJ3", "AJ4"], ok)
        self.assertEqual(self.avancos, [25, 50, 75, 100])
        self.assertEqual(self.pausas, [0.5, 0.5, 0.5])
        self.assertEqual(res.linhas[0]["whatsapp"], "https://wa.me/5549900000000")
        self.assertIsNone(res.erro)

    def test_pausa_desconta_o_tempo_da_consulta(self):
        tempos = iter([0, 0.4])
        ok = lambda m: {"ok": True, "dados": {}}
        self.rodar(["AJ1", "AJ2"], ok, relogio=lambda: next(tempos, 0))
        self.assertAlmostEqual(self.pausas[0], 0.1)

    def test_bloqueio_para_guarda_o_que_veio_e_devolve_o_resto(self):
        def pedir(m):
            if m["codigo"] == "AJ2":
                return {"ok": False, "erro": "A Anjun recusou (HTTP 429)"}
            return {"ok": True, "dados": {}}

        res = self.rodar(["AJ1", "AJ2", "AJ3"], pedir)
        self.assertEqual([l["waybill"] for l in res.linhas], ["AJ1"])
        self.assertEqual(res.pendentes, ["AJ2", "AJ3"])
        self.assertIn("HTTP 429", res.erro)

    def test_botao_parar(self):
        def pedir(m):
            self.parar.set()
            return {"ok": True, "dados": {}}

        res = self.rodar(["AJ1", "AJ2"], pedir)
        self.assertTrue(res.parado)
        self.assertEqual(res.pendentes, ["AJ2"])


class Acesso(unittest.TestCase):
    def test_login_usa_canal_vigia_e_confere_o_acesso(self):
        b = consulta.Backend("https://x.example")
        with mock.patch.object(consulta.requests, "post",
                               return_value=Resposta(corpo={"success": True, "token": "T", "name": "Fulano"})) as post, \
                mock.patch.object(consulta.requests, "get", return_value=Resposta()) as get:
            self.assertEqual(b.entrar("fulano", "senha"), "Fulano")
        self.assertEqual(post.call_args.kwargs["json"]["canal"], "vigia")
        self.assertEqual(get.call_args.kwargs["headers"]["Authorization"], "Bearer T")
        self.assertTrue(get.call_args.args[0].endswith("/macros/resumo"))

    def test_entregador_barrado_nao_fica_com_token(self):
        b = consulta.Backend("https://x.example")
        with mock.patch.object(consulta.requests, "post",
                               return_value=Resposta(corpo={"success": True, "token": "T"})), \
                mock.patch.object(consulta.requests, "get", return_value=Resposta(403)):
            with self.assertRaises(consulta.ErroDeConta):
                b.entrar("entregador", "senha")
        self.assertIsNone(b.token)

    def test_senha_errada_inativo_e_senha_temporaria(self):
        casos = [{"success": False}, {"success": False, "inativo": True},
                 {"success": True, "require_password_change": True}]
        for corpo in casos:
            b = consulta.Backend("https://x.example")
            with mock.patch.object(consulta.requests, "post", return_value=Resposta(corpo=corpo)):
                with self.assertRaises(consulta.ErroDeConta):
                    b.entrar("fulano", "senha")


if __name__ == "__main__":
    unittest.main()
