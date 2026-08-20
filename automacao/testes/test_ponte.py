"""Testes da espera por confirmacao da aba (ponte_navegador.enviar_codigo).

O bug que motivou: com timeout fixo de 30s a sessao morria com o SPX bipando
normal, porque a aba em segundo plano responde tarde (throttling de timer do
Chrome) e o pior caso legitimo dela ja passava de 30s. Aqui a aba e falsa: o
que se testa e a REGRA DE SAIDA da espera, nao o SPX.
"""

import os
import sys
import threading
import time
import unittest
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ponte_navegador import Ponte  # noqa: E402


class ConexaoFalsa:
    """Faz o papel do websocket da aba: guarda o que foi enviado."""

    def __init__(self):
        self.enviados = []

    async def send(self, mensagem):
        self.enviados.append(mensagem)


class EsperaDaAba(unittest.TestCase):
    def setUp(self):
        # enviar_codigo empurra o send pro event loop da ponte, entao precisa
        # de um loop de verdade rodando - so a aba e que e falsa.
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self.thread.start()

        self.ponte = Ponte(porta=0, origem="")
        self.ponte.loop = self.loop
        self.ponte.conexao = ConexaoFalsa()

    def tearDown(self):
        self.loop.call_soon_threadsafe(self.loop.stop)
        self.thread.join(timeout=2)
        self.loop.close()

    def responder(self, depois, tipo='ok', ident=1, motivo=None):
        """Enfileira a resposta da aba daqui a `depois` segundos."""
        def tarefa():
            time.sleep(depois)
            msg = {'tipo': tipo, 'id': ident}
            if motivo:
                msg['motivo'] = motivo
            self.ponte.respostas.put(msg)
        t = threading.Thread(target=tarefa, daemon=True)
        t.start()
        return t

    def test_resposta_lenta_ainda_vale(self):
        """Sem limite, a aba pode demorar - era exatamente o caso que quebrava."""
        self.responder(depois=1.2)
        entrou, motivo = self.ponte.enviar_codigo('BR872348273', timeout=0)
        self.assertTrue(entrou, motivo)
        self.assertIsNone(motivo)

    def test_timeout_explicito_ainda_corta(self):
        """Quem passar um limite continua sendo cortado por ele."""
        self.responder(depois=1.5)
        entrou, motivo = self.ponte.enviar_codigo('BR872348273', timeout=0.4)
        self.assertFalse(entrou)
        self.assertIn('não respondeu', motivo)

    def test_aba_desconectou_sai_na_hora(self):
        """Sem limite de tempo, quem termina a espera e a aba cair."""
        def derrubar():
            time.sleep(0.5)
            self.ponte.conexao = None
        threading.Thread(target=derrubar, daemon=True).start()

        inicio = time.time()
        entrou, motivo = self.ponte.enviar_codigo('BR872348273', timeout=0)
        self.assertFalse(entrou)
        self.assertEqual(motivo, 'a aba desconectou no meio')
        self.assertLess(time.time() - inicio, 3)

    def test_parar_interrompe_a_espera(self):
        """O botao Parar precisa furar a espera infinita."""
        parado = threading.Event()
        threading.Timer(0.5, parado.set).start()

        inicio = time.time()
        entrou, motivo = self.ponte.enviar_codigo(
            'BR872348273', timeout=0, cancelado=parado.is_set)
        self.assertFalse(entrou)
        self.assertEqual(motivo, 'parado')
        self.assertLess(time.time() - inicio, 3)

    def test_avisa_quem_espera_demais(self):
        """A tela nao pode ficar muda numa espera longa."""
        import ponte_navegador
        original = (ponte_navegador.AVISAR_DEMORA, ponte_navegador.INTERVALO_AVISO)
        ponte_navegador.AVISAR_DEMORA = 0.3
        ponte_navegador.INTERVALO_AVISO = 0.3
        try:
            avisos = []
            self.responder(depois=1.2)
            entrou, _ = self.ponte.enviar_codigo(
                'BR872348273', timeout=0, ao_demorar=avisos.append)
            self.assertTrue(entrou)
            self.assertGreaterEqual(len(avisos), 1)
        finally:
            ponte_navegador.AVISAR_DEMORA, ponte_navegador.INTERVALO_AVISO = original

    def test_erro_da_aba_sobe_com_motivo(self):
        """Recusa da aba nao vira sucesso silencioso."""
        self.responder(depois=0.2, tipo='erro', motivo='campo sumiu')
        entrou, motivo = self.ponte.enviar_codigo('BR872348273', timeout=0)
        self.assertFalse(entrou)
        self.assertEqual(motivo, 'campo sumiu')


if __name__ == '__main__':
    unittest.main()
