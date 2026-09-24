"""Testes da ponte de comandos do vigia (tela Macros -> extensao).

O caminho e: a extensao pergunta ao vigia (127.0.0.1), o vigia pergunta ao
servidor, e a resposta volta pra extensao. O servidor entrega cada comando UMA
vez so - se o vigia engolir a resposta (erro no meio, formato torto), o pedido
"Rodar" da tela se perde sem ninguem ficar sabendo.

O que se protege:
  - a resposta do servidor chega INTEIRA na extensao (comandos e agenda);
  - o vigia nao fica preso 7 minutos numa consulta que roda de 30 em 30s;
  - erro de rede vira 503 com o motivo, e nao um travamento;
  - so id no formato que o servidor gera (UUID) vira URL do backend: o caminho
    e da extensao, mas qualquer programa da maquina alcanca 127.0.0.1.

Nao ha rede aqui: o requests e dublado, e o servidor local sobe numa porta livre.

Dados de TESTE, inventados.
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

ID = "0f8fad5b-d9cb-469f-a165-70867728950e"


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
    b.entradas = 0

    def entrar():
        b.entradas += 1
        b.token = f"token-{b.entradas}"

    b.entrar = entrar
    b.pedidos = []
    fila = list(respostas)

    def pedir(metodo, url, **kw):
        b.pedidos.append({"metodo": metodo, "url": url, **kw})
        item = fila.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    return b, pedir


class ConsultaAoServidor(unittest.TestCase):
    def rodar(self, respostas, chamada):
        b, pedir = backend_com(respostas)
        with mock.patch.object(va.requests, "request", side_effect=pedir):
            return b, chamada(b)

    def test_comandos_devolve_a_resposta_inteira_do_servidor(self):
        corpo = {"comandos": [{"id": ID, "qual": "alimentacao"}],
                 "agenda": {"versao": "abc", "alimentacao": {"ativo": True}}}
        b, r = self.rodar([RespostaDublada(200, corpo)], lambda b: b.comandos())
        self.assertEqual(r, corpo, "comandos E agenda tem que chegar na extensao")

    def test_comandos_vai_no_endereco_certo_com_o_token(self):
        b, _ = self.rodar([RespostaDublada(200, {"comandos": []})], lambda b: b.comandos())
        pedido = b.pedidos[0]
        self.assertEqual(pedido["metodo"], "GET")
        self.assertTrue(pedido["url"].endswith("/macros/comandos/pendentes"))
        self.assertEqual(pedido["headers"]["Authorization"], "Bearer token-1")

    def test_nao_fica_preso_7_minutos_numa_consulta_de_30_em_30_segundos(self):
        b, _ = self.rodar([RespostaDublada(200, {"comandos": []})], lambda b: b.comandos())
        leitura = b.pedidos[0]["timeout"][1]
        self.assertLessEqual(leitura, 60)
        self.assertLess(leitura, va.TIMEOUT[1])

    def test_token_vencido_relogA_e_tenta_de_novo(self):
        b, r = self.rodar([RespostaDublada(403), RespostaDublada(200, {"comandos": []})],
                          lambda b: b.comandos())
        self.assertEqual(r, {"comandos": []})
        self.assertEqual(b.entradas, 2, "entrou de novo depois do 403")
        self.assertEqual(b.pedidos[1]["headers"]["Authorization"], "Bearer token-2")

    def test_recusado_de_novo_e_erro_de_conta(self):
        with self.assertRaises(va.ErroDeConta):
            self.rodar([RespostaDublada(403), RespostaDublada(403)], lambda b: b.comandos())

    def test_servidor_fora_do_ar_e_erro_temporario(self):
        with self.assertRaises(va.ErroDeEnvio) as ctx:
            self.rodar([RespostaDublada(503)], lambda b: b.comandos())
        self.assertTrue(ctx.exception.temporario)

    def test_rede_caida_e_erro_temporario(self):
        with self.assertRaises(va.ErroDeEnvio) as ctx:
            self.rodar([va.requests.ConnectionError("sem rede")], lambda b: b.comandos())
        self.assertTrue(ctx.exception.temporario)

    def test_resposta_que_nao_e_json_e_erro(self):
        with self.assertRaises(va.ErroDeEnvio):
            self.rodar([RespostaDublada(200, json_invalido=True)], lambda b: b.comandos())

    def test_recusa_do_servidor_leva_o_motivo_e_nao_e_temporaria(self):
        with self.assertRaises(va.ErroDeEnvio) as ctx:
            self.rodar([RespostaDublada(404, {"error": "Comando desconhecido"})],
                       lambda b: b.resultado_comando(ID, True))
        self.assertIn("Comando desconhecido", str(ctx.exception))
        self.assertFalse(ctx.exception.temporario)

    def test_resultado_vai_por_post_com_o_id_na_rota(self):
        b, _ = self.rodar([RespostaDublada(200, {"ok": True})],
                          lambda b: b.resultado_comando(ID, False, "aba fechada"))
        pedido = b.pedidos[0]
        self.assertEqual(pedido["metodo"], "POST")
        self.assertTrue(pedido["url"].endswith(f"/macros/comandos/{ID}/resultado"))
        self.assertEqual(pedido["json"], {"ok": False, "erro": "aba fechada"})

    def test_id_com_barra_nao_escapa_da_rota(self):
        b, _ = self.rodar([RespostaDublada(200, {"ok": True})],
                          lambda b: b.resultado_comando("../../admin/x", True))
        self.assertNotIn("/../", b.pedidos[0]["url"])
        self.assertIn("%2F", b.pedidos[0]["url"])


class BackendDeMentira:
    def __init__(self, resposta=None, erro=None):
        self.resposta = resposta
        self.erro = erro
        self.consultas = 0
        self.resultados = []

    def comandos(self):
        self.consultas += 1
        if self.erro:
            raise self.erro
        return self.resposta

    def resultado_comando(self, id_comando, ok, erro=None):
        if self.erro:
            raise self.erro
        self.resultados.append((id_comando, ok, erro))
        return {"ok": True}


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

    # ── GET /comandos ───────────────────────────────────────────────────────
    def test_comandos_repassa_a_resposta_do_servidor_sem_perder_nada(self):
        resposta = {"comandos": [{"id": ID, "qual": "backlog"}],
                    "agenda": {"versao": "v1", "backlog": {"ativo": True, "modo": "intervalo",
                                                            "minutos": 60, "horarios": []}}}
        base = self.subir(BackendDeMentira(resposta))
        with self.assertLogs(va.log, "INFO") as capturado:
            status, corpo = self.chamar(base, "/comandos")
        self.assertEqual(status, 200)
        self.assertEqual(corpo, resposta)
        self.assertIn("backlog", "\n".join(capturado.output))

    def test_agenda_null_passa_como_null(self):
        # null quer dizer "nada configurado pela tela" - a extensao volta pro popup.
        base = self.subir(BackendDeMentira({"comandos": [], "agenda": None}))
        _, corpo = self.chamar(base, "/comandos")
        self.assertIn("agenda", corpo)
        self.assertIsNone(corpo["agenda"])

    def test_sem_agenda_na_resposta_continua_sem_agenda(self):
        # ausente quer dizer "servidor nao soube": a extensao deixa como esta.
        base = self.subir(BackendDeMentira({"comandos": []}))
        _, corpo = self.chamar(base, "/comandos")
        self.assertNotIn("agenda", corpo)

    @unittest.skipUnless(hasattr(unittest.TestCase, "assertNoLogs"), "precisa do Python 3.10+")
    def test_consulta_sem_comando_nao_escreve_no_log(self):
        base = self.subir(BackendDeMentira({"comandos": [], "agenda": None}))
        with self.assertNoLogs(va.log, "INFO"):
            self.chamar(base, "/comandos")

    def test_erro_de_rede_vira_503_com_o_motivo(self):
        base = self.subir(BackendDeMentira(erro=va.ErroDeEnvio("nao alcancei o servidor", temporario=True)))
        status, corpo = self.chamar(base, "/comandos")
        self.assertEqual(status, 503)
        self.assertIn("nao alcancei", corpo["error"])

    def test_erro_de_conta_vira_503(self):
        base = self.subir(BackendDeMentira(erro=va.ErroDeConta("o servidor recusou a conta")))
        self.assertEqual(self.chamar(base, "/comandos")[0], 503)

    def test_erro_inesperado_vira_500_e_nao_derruba_o_vigia(self):
        base = self.subir(BackendDeMentira(erro=RuntimeError("bug")))
        with self.assertLogs(va.log, "ERROR"):
            status, _ = self.chamar(base, "/comandos")
        self.assertEqual(status, 500)
        self.assertEqual(self.chamar(base, "/ping")[0], 200, "o atendimento continua de pe")

    # ── POST /comandos/<id>/resultado ───────────────────────────────────────
    def test_resultado_e_repassado_ao_servidor(self):
        backend = BackendDeMentira()
        base = self.subir(backend)
        status, corpo = self.chamar(base, f"/comandos/{ID}/resultado", "POST",
                                    {"ok": False, "error": "não consegui abrir o SPX"})
        self.assertEqual(status, 200)
        self.assertEqual(backend.resultados, [(ID, False, "não consegui abrir o SPX")])

    def test_resultado_ok_vai_sem_erro(self):
        backend = BackendDeMentira()
        base = self.subir(backend)
        self.chamar(base, f"/comandos/{ID}/resultado", "POST", {"ok": True})
        self.assertEqual(backend.resultados, [(ID, True, None)])

    def test_erro_muito_longo_e_cortado(self):
        backend = BackendDeMentira()
        base = self.subir(backend)
        self.chamar(base, f"/comandos/{ID}/resultado", "POST", {"ok": False, "error": "x" * 5000})
        self.assertEqual(len(backend.resultados[0][2]), 300)

    def test_id_fora_do_formato_uuid_nao_chega_ao_backend(self):
        backend = BackendDeMentira()
        base = self.subir(backend)
        for caminho in ("/comandos/abc/resultado", "/comandos/../admin/resultado",
                        f"/comandos/{ID}/outra-coisa", f"/comandos/{ID}", "/qualquer"):
            status, _ = self.chamar(base, caminho, "POST", {"ok": True})
            self.assertEqual(status, 404, caminho)
        self.assertEqual(backend.resultados, [])

    def test_corpo_ilegivel_e_400(self):
        backend = BackendDeMentira()
        base = self.subir(backend)
        self.assertEqual(self.chamar(base, f"/comandos/{ID}/resultado", "POST", bruto=b"{quebrado")[0], 400)
        self.assertEqual(self.chamar(base, f"/comandos/{ID}/resultado", "POST", bruto=b"[1, 2]")[0], 400)
        self.assertEqual(backend.resultados, [])

    def test_resultado_com_servidor_fora_e_503(self):
        base = self.subir(BackendDeMentira(erro=va.ErroDeEnvio("servidor respondeu 503", temporario=True)))
        self.assertEqual(self.chamar(base, f"/comandos/{ID}/resultado", "POST", {"ok": True})[0], 503)

    # ── o que ja existia continua ───────────────────────────────────────────
    def test_ping_e_caminho_desconhecido_continuam_como_antes(self):
        base = self.subir(BackendDeMentira({"comandos": []}))
        self.assertEqual(self.chamar(base, "/ping")[0], 200)
        self.assertEqual(self.chamar(base, "/nao-existe")[0], 404)


if __name__ == "__main__":
    unittest.main()
