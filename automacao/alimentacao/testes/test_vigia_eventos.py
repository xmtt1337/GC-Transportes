"""Testes dos eventos do vigia: cada desfecho de um arquivo vira um aviso ao sistema.

O caso que motivou tudo (25/09/2026): num segundo computador "o macro baixa o arquivo, o vigia
identifica, mas o sistema nao e alimentado" - e nada dizia PORQUE. Cada desfecho ia so pro
registro local. Estes testes garantem que TODO desfecho (gravou, ja estava gravado, recusou,
login, rede, erro inesperado, falta de login) chega ao sistema com o nome do arquivo, e que
falar com o sistema nunca atrapalha o envio em si.

Tambem trava o laco infinito que existia: erro inesperado devolvia o arquivo pra fila a cada 2s.

Nao ha rede aqui: o backend e dublado. Dados de TESTE, inventados.
"""

import json
import os
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vigia_alimentacao as va  # noqa: E402
from test_vigia_alimentacao import CABECALHO, BackendDublado, BaseDoVigia  # noqa: E402


class BackendComEventos(BackendDublado):
    """O duble de sempre, mais o canal de eventos."""

    def __init__(self, *a, erro_eventos=None, **k):
        super().__init__(*a, **k)
        self.erro_eventos = erro_eventos
        self.lotes = []

    def enviar_eventos(self, eventos):
        if self.erro_eventos:
            raise self.erro_eventos
        self.lotes.append(list(eventos))
        return {"ok": True, "gravados": len(eventos)}


def eventos_de(vigia):
    with vigia.trava_eventos:
        return list(vigia._eventos)


# ── a fila de eventos ─────────────────────────────────────────────────────
class Relatar(BaseDoVigia):
    def test_evento_leva_maquina_hora_origem_e_arquivo(self):
        vigia = self.criar_vigia()
        vigia.relatar("backlog", "erro", "deu ruim", arquivo="backlogs.xlsx")
        [e] = eventos_de(vigia)
        self.assertEqual((e["macro"], e["nivel"], e["origem"]), ("backlog", "erro", "vigia"))
        self.assertEqual(e["arquivo"], "backlogs.xlsx")
        self.assertEqual(e["maquina"], va.nome_da_maquina())
        self.assertTrue(e["quando"].endswith("+00:00"), "hora em UTC com fuso, pro servidor nao errar 3h")

    def test_texto_e_cortado_e_arquivo_e_opcional(self):
        vigia = self.criar_vigia()
        vigia.relatar("geral", "aviso", "x" * 1000)
        [e] = eventos_de(vigia)
        self.assertEqual(len(e["texto"]), 300)
        self.assertNotIn("arquivo", e)

    def test_evento_com_quando_usa_essa_hora_e_sem_quando_usa_agora(self):
        vigia = self.criar_vigia()
        vigia.relatar("backlog", "erro", "a", quando="2026-09-25T11:41:57+00:00")
        vigia.relatar("backlog", "erro", "b")
        vigia.relatar("backlog", "erro", "c", quando="")
        a_, b_, c_ = eventos_de(vigia)
        self.assertEqual(a_["quando"], "2026-09-25T11:41:57+00:00")
        self.assertTrue(b_["quando"].endswith("+00:00"))
        self.assertNotEqual(b_["quando"], a_["quando"])
        self.assertTrue(c_["quando"].endswith("+00:00"), "vazio cai na hora de agora")

    def test_relatar_nunca_levanta_nem_com_lixo(self):
        vigia = self.criar_vigia()
        vigia.relatar(None, None, object())     # nao pode derrubar o envio
        vigia.relatar("backlog", "ok", None)

    def test_a_fila_de_eventos_tem_teto_e_guarda_os_mais_novos(self):
        vigia = self.criar_vigia()
        for i in range(va.EVENTOS_GUARDADOS + 50):
            vigia.relatar("geral", "aviso", f"e{i}")
        eventos = eventos_de(vigia)
        self.assertEqual(len(eventos), va.EVENTOS_GUARDADOS)
        self.assertEqual(eventos[-1]["texto"], f"e{va.EVENTOS_GUARDADOS + 49}")


# ── cada desfecho de um arquivo ───────────────────────────────────────────
class Desfechos(BaseDoVigia):
    def processar(self, backend=None, nome="br_assignment_task_romaneio_20260925.csv", conteudo=None):
        self.escrever(nome, conteudo)
        vigia = self.criar_vigia(backend or BackendComEventos())
        self.varrer(vigia)
        vigia._processar(vigia.fila[0])
        return vigia

    def test_gravou_conta_ok_com_o_arquivo_e_o_macro_certo(self):
        vigia = self.processar()
        [e] = eventos_de(vigia)
        self.assertEqual((e["macro"], e["nivel"]), ("alimentacao", "ok"))
        self.assertEqual(e["arquivo"], "br_assignment_task_romaneio_20260925.csv")
        self.assertIn("Gravado no sistema", e["texto"])
        self.assertNotIn("\n", e["texto"])

    def test_cada_relatorio_cai_no_macro_dele(self):
        self.assertEqual(va.MACRO_DO_TIPO, {"at": "alimentacao", "pesquisados": "pedidos", "backlog": "backlog"})

    def test_ja_estava_gravado_e_aviso_com_o_nome_do_arquivo(self):
        vigia = self.processar(BackendComEventos(ja_importado=True))
        [e] = eventos_de(vigia)
        self.assertEqual((e["macro"], e["nivel"]), ("alimentacao", "aviso"))
        self.assertIn("Já estava gravado", e["texto"])
        self.assertEqual(e["arquivo"], "br_assignment_task_romaneio_20260925.csv")

    def test_arquivo_conhecido_mas_quebrado_e_erro_geral(self):
        vigia = self.processar(nome="br_assignment_task_vazio.csv", conteudo=CABECALHO + "\n")
        [e] = eventos_de(vigia)
        self.assertEqual((e["macro"], e["nivel"]), ("geral", "erro"))
        self.assertIn("Arquivo recusado", e["texto"])

    def test_arquivo_que_nao_e_relatorio_e_aviso_geral(self):
        # O vigia "identificou" (o nome bate) e ignorou: sem um evento, isso e silencio.
        vigia = self.processar(nome="export_return_order_estranho.csv", conteudo="Coluna A,Coluna B\n1,2\n")
        [e] = eventos_de(vigia)
        self.assertEqual((e["macro"], e["nivel"]), ("geral", "aviso"))
        self.assertIn("Ignorei export_return_order_estranho.csv", e["texto"])

    def test_login_recusado_e_erro_do_macro(self):
        vigia = self.processar(BackendComEventos(va.ErroDeConta("usuario ou senha nao confere")))
        [e] = eventos_de(vigia)
        self.assertEqual((e["macro"], e["nivel"]), ("alimentacao", "erro"))
        self.assertIn("Login recusado", e["texto"])
        self.assertIn("usuario ou senha", e["texto"])

    def test_primeira_falha_de_rede_avisa_uma_vez_so(self):
        self.escrever("br_assignment_task_20260925.csv")
        vigia = self.criar_vigia(BackendComEventos(va.ErroDeEnvio("servidor dormindo", temporario=True)))
        self.varrer(vigia)
        pendente = vigia.fila[0]
        for _ in range(5):
            pendente.nao_antes = 0
            vigia._processar(pendente)
        eventos = eventos_de(vigia)
        self.assertEqual(len(eventos), 1, "uma tentativa por vez nao pode virar dezenas de eventos")
        self.assertEqual(eventos[0]["nivel"], "aviso")
        self.assertIn("vou tentar de novo", eventos[0]["texto"])
        self.assertIn("servidor dormindo", eventos[0]["texto"])

    def test_desistir_e_erro(self):
        self.escrever("br_assignment_task_20260925.csv")
        vigia = self.criar_vigia(BackendComEventos(va.ErroDeEnvio("caiu")))
        self.varrer(vigia)
        pendente = vigia.fila[0]
        for _ in range(va.MAX_TENTATIVAS):
            pendente.nao_antes = 0
            vigia._processar(pendente)
        ultimo = eventos_de(vigia)[-1]
        self.assertEqual(ultimo["nivel"], "erro")
        self.assertIn("Desisti de enviar", ultimo["texto"])


# ── falta de login: antes ficava MUDO ─────────────────────────────────────
class SemLogin(BaseDoVigia):
    def test_sem_usuario_e_senha_avisa_UMA_vez_e_nao_envia_nada(self):
        self.cfg["senha"] = ""
        self.escrever("br_assignment_task_20260925.csv")
        backend = BackendComEventos()
        vigia = self.criar_vigia(backend)
        self.varrer(vigia)
        pendente = vigia.fila[0]
        for _ in range(6):                # o arquivo e reagendado a cada 30s; cada volta passa por aqui
            pendente.nao_antes = 0
            vigia._processar(pendente)

        self.assertEqual(backend.enviados, [])
        self.assertEqual(len(vigia.fila), 1, "continua esperando - nao descarta o arquivo")
        eventos = eventos_de(vigia)
        self.assertEqual(len(eventos), 1, "uma vez por arquivo, nao um por tentativa")
        self.assertEqual((eventos[0]["macro"], eventos[0]["nivel"]), ("geral", "erro"))
        self.assertIn("falta configurar usuário e senha", eventos[0]["texto"])
        avisos_de_erro = [a for a in self.avisos if a[2]]
        self.assertEqual(len(avisos_de_erro), 1, "e um balao so na bandeja")
        self.assertIn("Falta configurar", avisos_de_erro[0][0])

    def test_o_evento_da_falta_de_login_chega_depois_que_configura(self):
        self.cfg["senha"] = ""
        self.escrever("br_assignment_task_20260925.csv")
        backend = BackendComEventos()
        vigia = self.criar_vigia(backend)
        self.varrer(vigia)
        vigia._processar(vigia.fila[0])

        self.assertEqual(vigia._descarregar_eventos(), 0, "sem login nao da pra contar nada ainda")
        self.cfg["senha"] = "x"
        self.assertEqual(vigia._descarregar_eventos(), 1)
        self.assertIn("falta configurar", backend.lotes[0][0]["texto"])


# ── erro inesperado: o laco infinito ──────────────────────────────────────
class ErroInesperado(BaseDoVigia):
    def preparar(self):
        self.escrever("br_assignment_task_20260925.csv")
        vigia = self.criar_vigia(BackendComEventos())
        self.varrer(vigia)
        return vigia

    def rodar_uma_volta(self, vigia, erro):
        """O _trabalhar de VERDADE, por uma volta so (sem thread), com a leitura do arquivo quebrando."""
        voltas = iter([False, True])
        vigia.parar = mock.Mock(is_set=lambda: next(voltas), wait=lambda s: None)
        with mock.patch.object(va.at, "ler_qualquer", side_effect=erro), self.assertLogs(va.log, "ERROR"):
            vigia._trabalhar()

    def test_erro_inesperado_nao_devolve_o_arquivo_pra_fila_a_cada_2_segundos(self):
        # Antes: o except so dava log.exception e tirava da fila SEM marcar - a varredura
        # seguinte (2s depois) achava o arquivo "novo" e dava o mesmo erro, pra sempre.
        vigia = self.preparar()
        self.rodar_uma_volta(vigia, ZeroDivisionError("bug"))
        self.assertEqual(vigia.fila, [])
        self.varrer(vigia)
        self.assertEqual(vigia.fila, [], "a varredura seguinte nao o traz de volta")

    def test_erro_inesperado_conta_ao_sistema_e_avisa_na_bandeja(self):
        vigia = self.preparar()
        nome = os.path.basename(vigia.fila[0].caminho)
        self.rodar_uma_volta(vigia, KeyError("coluna"))
        [e] = eventos_de(vigia)
        self.assertEqual((e["macro"], e["nivel"]), ("geral", "erro"))
        self.assertIn("KeyError", e["texto"])
        self.assertEqual(e["arquivo"], nome)
        self.assertTrue(self.avisos[-1][2])
        self.assertIn("Erro inesperado", self.avisos[-1][0])
        self.assertIn("erro inesperado", vigia.ultimo)

    def test_o_registro_guarda_o_erro_pra_nao_insistir(self):
        vigia = self.preparar()
        chave = vigia.fila[0].chave
        self.rodar_uma_volta(vigia, ValueError("x"))
        self.assertTrue(vigia.registro.tem(chave))
        self.assertIn("erro inesperado", vigia.registro.itens[chave]["resultado"])


# ── mandar os eventos ao sistema ──────────────────────────────────────────
class Descarregar(BaseDoVigia):
    def test_leva_o_lote_e_esvazia_a_fila(self):
        backend = BackendComEventos()
        vigia = self.criar_vigia(backend)
        vigia.relatar("backlog", "ok", "a")
        vigia.relatar("backlog", "ok", "b")
        self.assertEqual(vigia._descarregar_eventos(), 2)
        self.assertEqual(len(backend.lotes[0]), 2)
        self.assertEqual(eventos_de(vigia), [])

    def test_fora_do_ar_guarda_e_entrega_depois_com_a_hora_original(self):
        backend = BackendComEventos(erro_eventos=va.ErroDeEnvio("servidor fora", temporario=True))
        vigia = self.criar_vigia(backend)
        vigia.relatar("backlog", "erro", "aconteceu antes")
        hora = eventos_de(vigia)[0]["quando"]
        with self.assertLogs(va.log, "WARNING"):
            self.assertEqual(vigia._descarregar_eventos(), 0)
        self.assertEqual(len(eventos_de(vigia)), 1, "nada se perde")

        backend.erro_eventos = None
        self.assertEqual(vigia._descarregar_eventos(), 1)
        self.assertEqual(backend.lotes[0][0]["quando"], hora, "a hora e a de quando ACONTECEU")

    def test_conta_recusada_tambem_guarda(self):
        backend = BackendComEventos(erro_eventos=va.ErroDeConta("recusou"))
        vigia = self.criar_vigia(backend)
        vigia.relatar("geral", "erro", "x")
        with self.assertLogs(va.log, "WARNING"):
            vigia._descarregar_eventos()
        self.assertEqual(len(eventos_de(vigia)), 1)

    def test_nao_repete_o_aviso_de_falha_a_cada_5_segundos(self):
        backend = BackendComEventos(erro_eventos=va.ErroDeEnvio("fora"))
        vigia = self.criar_vigia(backend)
        vigia.relatar("geral", "erro", "x")
        with self.assertLogs(va.log, "WARNING") as capturado:
            for _ in range(5):
                vigia._descarregar_eventos()
        self.assertEqual(len(capturado.output), 1)

    def test_manda_no_maximo_20_por_vez_e_o_resto_vai_na_proxima(self):
        backend = BackendComEventos()
        vigia = self.criar_vigia(backend)
        for i in range(45):
            vigia.relatar("geral", "aviso", f"e{i}")
        vigia._descarregar_eventos()
        vigia._descarregar_eventos()
        vigia._descarregar_eventos()
        self.assertEqual([len(l) for l in backend.lotes], [20, 20, 5])
        self.assertEqual([e["texto"] for l in backend.lotes for e in l], [f"e{i}" for i in range(45)],
                         "na ordem em que aconteceram")

    def test_sem_nada_na_fila_nao_fala_com_o_servidor(self):
        backend = BackendComEventos()
        vigia = self.criar_vigia(backend)
        self.assertEqual(vigia._descarregar_eventos(), 0)
        self.assertEqual(backend.lotes, [])

    def test_o_envio_de_verdade_vai_por_post_na_rota_de_eventos(self):
        b = va.Backend(lambda: {"usuario": "u", "senha": "s", "backend": "http://x"})
        b.token = "t"
        capturado = {}

        class Resp:
            status_code = 200
            ok = True

            def json(self):
                return {"ok": True}

        def pedir(metodo, url, **kw):
            capturado.update(metodo=metodo, url=url, corpo=kw["json"])
            return Resp()

        with mock.patch.object(va.requests, "request", side_effect=pedir):
            b.enviar_eventos([{"macro": "backlog"}])
        self.assertEqual(capturado["metodo"], "POST")
        self.assertTrue(capturado["url"].endswith("/macros/eventos"))
        self.assertEqual(capturado["corpo"], {"eventos": [{"macro": "backlog"}]})

    def test_a_consulta_de_comandos_leva_o_nome_deste_computador(self):
        b = va.Backend(lambda: {"usuario": "u", "senha": "s", "backend": "http://x"})
        b.token = "t"
        urls = []

        class Resp:
            status_code = 200
            ok = True

            def json(self):
                return {"comandos": []}

        with mock.patch.object(va.requests, "request",
                               side_effect=lambda m, u, **k: urls.append(u) or Resp()):
            b.comandos()
        self.assertIn("maquina=", urls[0])


# ── o que a extensao conta ────────────────────────────────────────────────
class VigiaDeMentira:
    ultimo = "esperando"

    def __init__(self):
        self.relatos = []

    def relatar(self, macro, nivel, texto, arquivo=None, origem="vigia", quando=None):
        self.relatos.append((macro, nivel, texto, origem))
        self.quandos = getattr(self, "quandos", []) + [quando]


class ServidorLocal(unittest.TestCase):
    def subir(self):
        self._anterior = va.Atendimento.vigia
        va.Atendimento.vigia = self.vigia = VigiaDeMentira()
        servidor = ThreadingHTTPServer(("127.0.0.1", 0), va.Atendimento)
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        self.addCleanup(self._derrubar, servidor)
        return f"http://127.0.0.1:{servidor.server_address[1]}"

    def _derrubar(self, servidor):
        servidor.shutdown()
        servidor.server_close()
        va.Atendimento.vigia = self._anterior

    def post(self, base, caminho, corpo=None, bruto=None):
        dados = bruto if bruto is not None else json.dumps(corpo).encode()
        req = urllib.request.Request(base + caminho, data=dados, method="POST",
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_a_extensao_conta_como_o_macro_terminou(self):
        base = self.subir()
        status, _ = self.post(base, "/eventos", {"macro": "backlog", "nivel": "erro",
                                                 "texto": "o SPX pediu login"})
        self.assertEqual(status, 200)
        self.assertEqual(self.vigia.relatos, [("backlog", "erro", "o SPX pediu login", "extensao")])

    def test_evento_atrasado_da_extensao_mantem_a_hora_de_quando_aconteceu(self):
        base = self.subir()
        self.post(base, "/eventos", {"macro": "backlog", "nivel": "erro", "texto": "x",
                                     "quando": "2026-09-25T11:41:57.000Z"})
        self.post(base, "/eventos", {"macro": "backlog", "nivel": "erro", "texto": "y", "quando": 12345})
        self.assertEqual(self.vigia.quandos, ["2026-09-25T11:41:57.000Z", None])

    def test_evento_incompleto_ou_torto_e_400_e_nao_chega_ao_relator(self):
        base = self.subir()
        for corpo in ({}, {"macro": "backlog"}, {"macro": "backlog", "nivel": "ok", "texto": ""},
                      {"macro": 5, "nivel": "ok", "texto": "x"}):
            self.assertEqual(self.post(base, "/eventos", corpo)[0], 400, corpo)
        self.assertEqual(self.post(base, "/eventos", bruto=b"{quebrado")[0], 400)
        self.assertEqual(self.post(base, "/eventos", bruto=b"[1]")[0], 400)
        self.assertEqual(self.vigia.relatos, [])

    def test_o_caminho_dos_resultados_de_comando_continua_igual(self):
        base = self.subir()
        self.assertEqual(self.post(base, "/comandos/abc/resultado", {"ok": True})[0], 404)


if __name__ == "__main__":
    unittest.main()
