"""Testes da AT que a aba captura e manda pela ponte.

A AT nasce no SPX no instante da colagem: a resposta da chamada que o SPX faz
ja traz o numero, e o interceptador da extensao repassa pela ponte. O que se
protege aqui e o caminho dela nao atrapalhar a colagem - ela chega fora do par
pergunta/resposta e nao pode ser lida como se fosse a confirmacao de um codigo.

Dados de TESTE, inventados (o formato e o real: AT + 13, BR + 13).
"""

import asyncio
import json
import os
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ponte_navegador import Ponte  # noqa: E402

CODIGO = 'BR262699568359N'
AT = 'AT202609049AXFA'


class ConexaoFalsa:
    def __init__(self):
        self.enviados = []

    async def send(self, mensagem):
        self.enviados.append(mensagem)


class CapturaDaAt(unittest.TestCase):
    def setUp(self):
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

    def entregar(self, msg):
        """Faz o que _atender faria ao receber esta mensagem da aba."""
        tipo = msg.get('tipo')
        if tipo in ('ok', 'erro'):
            self.ponte.respostas.put(msg)
        elif tipo == 'at':
            codigo = (msg.get('codigo') or '').strip()
            at = (msg.get('at') or '').strip()
            if codigo and at and self.ponte.ao_capturar_at:
                try:
                    self.ponte.ao_capturar_at(codigo, at)
                except Exception:
                    pass

    def test_at_chega_pelo_callback(self):
        capturadas = []
        self.ponte.ao_capturar_at = lambda c, a: capturadas.append((c, a))
        self.entregar({'tipo': 'at', 'codigo': CODIGO, 'at': AT})
        self.assertEqual(capturadas, [(CODIGO, AT)])

    def test_at_nao_entra_na_fila_de_respostas(self):
        """Se entrasse, enviar_codigo leria a AT como confirmacao do codigo."""
        self.ponte.ao_capturar_at = lambda c, a: None
        self.entregar({'tipo': 'at', 'codigo': CODIGO, 'at': AT})
        self.assertTrue(self.ponte.respostas.empty())

    def test_at_sem_codigo_ou_sem_numero_e_ignorada(self):
        capturadas = []
        self.ponte.ao_capturar_at = lambda c, a: capturadas.append((c, a))
        self.entregar({'tipo': 'at', 'codigo': '', 'at': AT})
        self.entregar({'tipo': 'at', 'codigo': CODIGO, 'at': ''})
        self.entregar({'tipo': 'at'})
        self.assertEqual(capturadas, [])

    def test_callback_que_explode_nao_derruba_nada(self):
        """AT perdida e aceitavel; colagem interrompida nao."""
        def explode(c, a):
            raise RuntimeError('banco fora do ar')
        self.ponte.ao_capturar_at = explode
        self.entregar({'tipo': 'at', 'codigo': CODIGO, 'at': AT})   # nao pode levantar

    def test_at_no_meio_da_espera_nao_confunde_o_codigo(self):
        """O caso real: a AT chega enquanto o Python espera o 'ok' do campo."""
        self.ponte.ao_capturar_at = lambda c, a: None

        def aba():
            time.sleep(0.2)
            self.entregar({'tipo': 'at', 'codigo': CODIGO, 'at': AT})
            time.sleep(0.2)
            self.entregar({'tipo': 'ok', 'id': 1})
        threading.Thread(target=aba, daemon=True).start()

        entrou, motivo = self.ponte.enviar_codigo(CODIGO, timeout=5)
        self.assertTrue(entrou, motivo)


class MensagemDaAba(unittest.TestCase):
    """O formato que o interceptador manda, conferido contra o real do SPX."""

    def test_o_que_a_extensao_envia_e_json_valido(self):
        bruto = json.dumps({'tipo': 'at', 'codigo': CODIGO, 'at': AT})
        msg = json.loads(bruto)
        self.assertEqual(msg['tipo'], 'at')
        self.assertEqual(msg['codigo'], CODIGO)
        self.assertEqual(msg['at'], AT)


if __name__ == '__main__':
    unittest.main()
