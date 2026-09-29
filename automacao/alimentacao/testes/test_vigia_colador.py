"""Testes da ponte do colador no vigia (extensao -> vigia -> servidor).

Substitui o colador_neon.py falando direto no Postgres: agora e o vigia quem
pergunta ao servidor (com o MESMO login que ja usa pra AT Exportada/Pedidos/
Backlog), e a extensao pergunta ao vigia em 127.0.0.1 - igual ao /pendentes e
/comandos que ja existiam.

O que se protege:
  - modo, tabela e ids sao validados no PROPRIO vigia antes de gastar uma
    viagem ao servidor (o servidor valida de novo, mas o 400 aqui e imediato);
  - lote leva tam/carencia/dia/xpt pra rota certa (/macros/colador/<modo>/lote);
  - confirmar/liberar/at vao pro servidor com o corpo esperado;
  - erro de rede vira 503, erro inesperado vira 500 sem derrubar o atendimento.

Nao ha rede aqui: o requests e dublado, e o servidor local sobe numa porta
livre. Dados de TESTE, inventados.
"""

import json
import os
import sys
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import vigia_alimentacao as va  # noqa: E402


class RespostaDublada:
    def __init__(self, status=200, corpo=None, json_invalido=False):
        self.status_code = status
        self.ok = status < 400
        self._corpo = corpo if corpo is not None else {}
        self._invalido = json_invalido

    def json(self):
        if self._invalido:
            raise ValueError("nao e json")
        return self._corpo


def backend_com(respostas):
    """Um Backend de verdade, com a rede (requests) e o login dublados."""
    b = va.Backend(lambda: {"usuario": "u", "senha": "s"})
    b.token = "token-1"
    b.pedidos = []
    fila = list(respostas)

    def pedir(metodo, url, **kw):
        b.pedidos.append({"metodo": metodo, "url": url, **kw})
        item = fila.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    return b, pedir


class MetodosDoBackend(unittest.TestCase):
    def rodar(self, respostas, chamada):
        b, pedir = backend_com(respostas)
        with mock.patch.object(va.requests, "request", side_effect=pedir):
            return b, chamada(b)

    def test_lote_vai_na_rota_com_modo_no_caminho(self):
        b, r = self.rodar([RespostaDublada(200, {"tabela": None, "itens": []})],
                          lambda b: b.colador_lote("recebimento", 20, 60))
        self.assertEqual(r, {"tabela": None, "itens": []})
        pedido = b.pedidos[0]
        self.assertEqual(pedido["metodo"], "GET")
        self.assertIn("/macros/colador/recebimento/lote?", pedido["url"])
        self.assertIn("tam=20", pedido["url"])
        self.assertIn("carencia=60", pedido["url"])

    def test_lote_so_leva_dia_e_xpt_quando_informados(self):
        b, _ = self.rodar([RespostaDublada(200, {"itens": []})],
                          lambda b: b.colador_lote("at_cluster", 5, 10))
        self.assertNotIn("dia=", b.pedidos[0]["url"])
        self.assertNotIn("xpt=", b.pedidos[0]["url"])

        b, _ = self.rodar([RespostaDublada(200, {"itens": []})],
                          lambda b: b.colador_lote("at_cluster", 5, 10, dia="2026-09-28", xpt="XPT_CFC"))
        self.assertIn("dia=2026-09-28", b.pedidos[0]["url"])
        self.assertIn("xpt=XPT_CFC", b.pedidos[0]["url"])

    def test_confirmar_manda_tabela_e_ids_no_corpo(self):
        b, r = self.rodar([RespostaDublada(200, {"ok": True, "atualizados": 2})],
                          lambda b: b.colador_confirmar("recebimento", "shopee_recebimentos", [1, 2]))
        self.assertEqual(r, {"ok": True, "atualizados": 2})
        pedido = b.pedidos[0]
        self.assertEqual(pedido["metodo"], "POST")
        self.assertTrue(pedido["url"].endswith("/macros/colador/recebimento/confirmar"))
        self.assertEqual(pedido["json"], {"tabela": "shopee_recebimentos", "ids": [1, 2]})

    def test_liberar_vai_pra_rota_de_liberar_do_modo_certo(self):
        b, _ = self.rodar([RespostaDublada(200, {"ok": True})],
                          lambda b: b.colador_liberar("at_cluster", "entregador_pedidos_at", [9]))
        pedido = b.pedidos[0]
        self.assertTrue(pedido["url"].endswith("/macros/colador/at_cluster/liberar"))
        self.assertEqual(pedido["json"], {"tabela": "entregador_pedidos_at", "ids": [9]})

    def test_at_nao_leva_modo_na_rota(self):
        b, _ = self.rodar([RespostaDublada(200, {"ok": True, "atualizados": 1})],
                          lambda b: b.colador_at("BR1", "2026-09-28", "AT1"))
        pedido = b.pedidos[0]
        self.assertTrue(pedido["url"].endswith("/macros/colador/at"))
        self.assertEqual(pedido["json"], {"codigo": "BR1", "dia": "2026-09-28", "at": "AT1"})

    def test_erro_de_rede_e_temporario(self):
        with self.assertRaises(va.ErroDeEnvio) as ctx:
            self.rodar([va.requests.ConnectionError("sem rede")],
                       lambda b: b.colador_lote("recebimento", 20, 60))
        self.assertTrue(ctx.exception.temporario)

    def test_conta_recusada_e_erro_de_conta(self):
        with self.assertRaises(va.ErroDeConta):
            self.rodar([RespostaDublada(403), RespostaDublada(403)],
                       lambda b: b.colador_confirmar("recebimento", "shopee_recebimentos", [1]))


class BackendDeMentira:
    def __init__(self, resposta=None, erro=None):
        self.resposta = resposta
        self.erro = erro
        self.chamadas = []

    def _chamar(self, nome, *args, **kwargs):
        self.chamadas.append((nome, args, kwargs))
        if self.erro:
            raise self.erro
        return self.resposta

    def colador_lote(self, *a, **k):
        return self._chamar("colador_lote", *a, **k)

    def colador_confirmar(self, *a, **k):
        return self._chamar("colador_confirmar", *a, **k)

    def colador_liberar(self, *a, **k):
        return self._chamar("colador_liberar", *a, **k)

    def colador_at(self, *a, **k):
        return self._chamar("colador_at", *a, **k)


class VigiaDeMentira:
    ultimo = "esperando"

    def __init__(self, backend):
        self.backend = backend


class ServidorLocal(unittest.TestCase):
    """O atendimento a extensao de verdade, numa porta livre de 127.0.0.1."""

    def subir(self, backend):
        self._vigia_anterior = va.Atendimento.vigia
        va.Atendimento.vigia = VigiaDeMentira(backend)
        servidor = ThreadingHTTPServer(("127.0.0.1", 0), va.Atendimento)
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        self.addCleanup(self._derrubar, servidor)
        return f"http://127.0.0.1:{servidor.server_address[1]}"

    def _derrubar(self, servidor):
        servidor.shutdown()
        servidor.server_close()
        va.Atendimento.vigia = self._vigia_anterior

    def chamar(self, base, caminho, metodo="GET", corpo=None, bruto=None):
        dados = bruto if bruto is not None else (
            json.dumps(corpo).encode() if corpo is not None else None)
        req = urllib.request.Request(base + caminho, data=dados, method=metodo,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    # ── GET /colador/lote ────────────────────────────────────────────────────
    def test_lote_repassa_a_resposta_do_servidor(self):
        resposta = {"tabela": "shopee_recebimentos", "itens": [{"id": 1, "codigo": "BR1"}]}
        base = self.subir(BackendDeMentira(resposta))
        status, corpo = self.chamar(base, "/colador/lote?modo=recebimento&tam=20&carencia=60")
        self.assertEqual(status, 200)
        self.assertEqual(corpo, resposta)

    def test_lote_passa_tam_carencia_dia_xpt_pro_backend(self):
        backend = BackendDeMentira({"itens": []})
        base = self.subir(backend)
        self.chamar(base, "/colador/lote?modo=at_cluster&tam=7&carencia=30&dia=2026-09-28&xpt=XPT_VIA")
        nome, args, kwargs = backend.chamadas[0]
        self.assertEqual(nome, "colador_lote")
        self.assertEqual(args, ("at_cluster", 7, 30))
        self.assertEqual(kwargs, {"dia": "2026-09-28", "xpt": "XPT_VIA"})

    def test_lote_sem_dia_nem_xpt_manda_none(self):
        backend = BackendDeMentira({"itens": []})
        base = self.subir(backend)
        self.chamar(base, "/colador/lote?modo=recebimento&tam=20&carencia=60")
        _, _, kwargs = backend.chamadas[0]
        self.assertEqual(kwargs, {"dia": None, "xpt": None})

    def test_lote_com_modo_desconhecido_e_400_sem_chamar_o_backend(self):
        backend = BackendDeMentira({"itens": []})
        base = self.subir(backend)
        status, corpo = self.chamar(base, "/colador/lote?modo=xis&tam=20&carencia=60")
        self.assertEqual(status, 400)
        self.assertEqual(backend.chamadas, [])

    def test_lote_com_tam_carencia_invalidos_cai_no_padrao_em_vez_de_quebrar(self):
        backend = BackendDeMentira({"itens": []})
        base = self.subir(backend)
        self.chamar(base, "/colador/lote?modo=recebimento&tam=abc&carencia=xyz")
        _, args, _ = backend.chamadas[0]
        self.assertEqual(args, ("recebimento", 20, 60))

    def test_lote_com_tam_fora_do_limite_e_recortado(self):
        backend = BackendDeMentira({"itens": []})
        base = self.subir(backend)
        self.chamar(base, "/colador/lote?modo=recebimento&tam=99999&carencia=99999")
        _, args, _ = backend.chamadas[0]
        self.assertEqual(args, ("recebimento", 500, 3600))

    def test_lote_com_erro_de_rede_e_503(self):
        base = self.subir(BackendDeMentira(erro=va.ErroDeEnvio("nao alcancei o servidor", temporario=True)))
        status, corpo = self.chamar(base, "/colador/lote?modo=recebimento&tam=20&carencia=60")
        self.assertEqual(status, 503)
        self.assertIn("nao alcancei", corpo["error"])

    def test_lote_com_erro_inesperado_e_500_sem_derrubar_o_atendimento(self):
        base = self.subir(BackendDeMentira(erro=RuntimeError("bug")))
        with self.assertLogs(va.log, "ERROR"):
            status, _ = self.chamar(base, "/colador/lote?modo=recebimento&tam=20&carencia=60")
        self.assertEqual(status, 500)
        self.assertEqual(self.chamar(base, "/ping")[0], 200)

    # ── POST /colador/confirmar e /colador/liberar ──────────────────────────
    def test_confirmar_repassa_modo_tabela_e_ids(self):
        backend = BackendDeMentira({"ok": True, "atualizados": 2})
        base = self.subir(backend)
        status, corpo = self.chamar(base, "/colador/confirmar", "POST",
                                    {"modo": "recebimento", "tabela": "shopee_recebimentos", "ids": [1, 2]})
        self.assertEqual(status, 200)
        self.assertEqual(corpo, {"ok": True, "atualizados": 2})
        nome, args, _ = backend.chamadas[0]
        self.assertEqual((nome, args), ("colador_confirmar", ("recebimento", "shopee_recebimentos", [1, 2])))

    def test_liberar_repassa_modo_tabela_e_ids(self):
        backend = BackendDeMentira({"ok": True, "atualizados": 1})
        base = self.subir(backend)
        self.chamar(base, "/colador/liberar", "POST",
                   {"modo": "at_cluster", "tabela": "entregador_pedidos_at", "ids": [9]})
        nome, args, _ = backend.chamadas[0]
        self.assertEqual((nome, args), ("colador_liberar", ("at_cluster", "entregador_pedidos_at", [9])))

    def test_confirmar_com_modo_ou_tabela_invalidos_e_400(self):
        backend = BackendDeMentira({"ok": True})
        base = self.subir(backend)
        casos = [
            {"modo": "xis", "tabela": "shopee_recebimentos", "ids": [1]},
            {"modo": "recebimento", "tabela": "outra_coisa", "ids": [1]},
            {"modo": "recebimento", "tabela": "shopee_recebimentos", "ids": []},
            {"modo": "recebimento", "tabela": "shopee_recebimentos", "ids": "1"},
            {"modo": "recebimento", "tabela": "shopee_recebimentos"},
        ]
        for corpo in casos:
            status, _ = self.chamar(base, "/colador/confirmar", "POST", corpo)
            self.assertEqual(status, 400, corpo)
        self.assertEqual(backend.chamadas, [])

    def test_confirmar_com_mais_de_500_ids_e_400(self):
        backend = BackendDeMentira({"ok": True})
        base = self.subir(backend)
        status, _ = self.chamar(base, "/colador/confirmar", "POST",
                                {"modo": "recebimento", "tabela": "shopee_recebimentos",
                                 "ids": list(range(1, 502))})
        self.assertEqual(status, 400)

    def test_confirmar_com_corpo_ilegivel_e_400(self):
        backend = BackendDeMentira({"ok": True})
        base = self.subir(backend)
        status, _ = self.chamar(base, "/colador/confirmar", "POST", bruto=b"{quebrado")
        self.assertEqual(status, 400)
        self.assertEqual(backend.chamadas, [])

    def test_liberar_com_erro_de_rede_e_503(self):
        base = self.subir(BackendDeMentira(erro=va.ErroDeEnvio("servidor respondeu 503", temporario=True)))
        status, _ = self.chamar(base, "/colador/liberar", "POST",
                                {"modo": "recebimento", "tabela": "shopee_recebimentos", "ids": [1]})
        self.assertEqual(status, 503)

    # ── POST /colador/at ─────────────────────────────────────────────────────
    def test_at_repassa_codigo_dia_e_at(self):
        backend = BackendDeMentira({"ok": True, "atualizados": 1})
        base = self.subir(backend)
        status, corpo = self.chamar(base, "/colador/at", "POST",
                                    {"codigo": "BR1", "dia": "2026-09-28", "at": "AT1"})
        self.assertEqual(status, 200)
        nome, args, _ = backend.chamadas[0]
        self.assertEqual((nome, args), ("colador_at", ("BR1", "2026-09-28", "AT1")))

    def test_at_sem_campo_obrigatorio_e_400(self):
        backend = BackendDeMentira({"ok": True})
        base = self.subir(backend)
        for corpo in ({"dia": "2026-09-28", "at": "AT1"}, {"codigo": "BR1", "at": "AT1"},
                      {"codigo": "BR1", "dia": "2026-09-28"}):
            status, _ = self.chamar(base, "/colador/at", "POST", corpo)
            self.assertEqual(status, 400, corpo)
        self.assertEqual(backend.chamadas, [])

    # ── o que ja existia continua ────────────────────────────────────────────
    def test_ping_e_caminho_desconhecido_continuam_como_antes(self):
        base = self.subir(BackendDeMentira({}))
        self.assertEqual(self.chamar(base, "/ping")[0], 200)
        self.assertEqual(self.chamar(base, "/nao-existe")[0], 404)


if __name__ == "__main__":
    unittest.main()
