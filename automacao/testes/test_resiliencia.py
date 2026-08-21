# -*- coding: utf-8 -*-
"""Testes da politica que mantem a sessao viva sozinha.

O que motivou: as 3h da manha o colador parou com "a aba desconectou no meio"
e ficou parado ate alguem acordar, com 963 codigos na fila. Tropeco de
infraestrutura nao pode terminar sessao - tem que virar espera e nova
tentativa.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import colador_neon as cn  # noqa: E402


class Backoff(unittest.TestCase):
    def test_cresce_com_as_tentativas(self):
        self.assertLess(cn.espera_retentativa(1), cn.espera_retentativa(2))
        self.assertLess(cn.espera_retentativa(2), cn.espera_retentativa(3))

    def test_primeira_tentativa_e_rapida(self):
        """Tropeco isolado nao pode custar meio minuto de fila parada."""
        self.assertLessEqual(cn.espera_retentativa(1), 5)

    def test_tem_teto(self):
        """Uma noite ruim nao pode virar espera de horas."""
        for tentativas in (50, 500, 100000):
            self.assertEqual(cn.espera_retentativa(tentativas),
                             cn.ESPERA_MAX_RETENTATIVA)

    def test_nunca_dorme_zero(self):
        """Sem espera minima, um SPX fora do ar viraria martelada em laco."""
        for tentativas in (0, 1):
            self.assertGreater(cn.espera_retentativa(tentativas), 0)


class Adiamento(unittest.TestCase):
    def test_insiste_antes_de_adiar(self):
        """Aba caida volta em segundos: nao se desiste do codigo na primeira."""
        self.assertFalse(cn.deve_adiar(1, 20))
        self.assertFalse(cn.deve_adiar(cn.TENTATIVAS_ANTES_DE_ADIAR - 1, 20))

    def test_adia_depois_do_limite(self):
        self.assertTrue(cn.deve_adiar(cn.TENTATIVAS_ANTES_DE_ADIAR, 20))
        self.assertTrue(cn.deve_adiar(cn.TENTATIVAS_ANTES_DE_ADIAR + 5, 2))

    def test_nao_adia_o_unico_codigo_do_lote(self):
        """Com um codigo so, trocar de lugar na fila nao muda nada."""
        self.assertFalse(cn.deve_adiar(cn.TENTATIVAS_ANTES_DE_ADIAR + 99, 1))
        self.assertFalse(cn.deve_adiar(cn.TENTATIVAS_ANTES_DE_ADIAR + 99, 0))


class NaoConsomeCodigo(unittest.TestCase):
    """Garante no fonte o que o teste de unidade nao alcanca.

    loop_colagem so roda com Tk, banco e aba de verdade. O que da pra fixar
    aqui e a regra que o bug de producao violou: falha de envio nao pode nem
    derrubar a sessao (raise) nem consumir o codigo (pop antes da confirmacao).
    """

    @classmethod
    def setUpClass(cls):
        import inspect
        cls.fonte = inspect.getsource(cn.ColadorApp.loop_colagem)

    def trecho_da_falha(self):
        """Do 'if not entrou:' ate o else do modo teclado."""
        return self.fonte.split('if not entrou:')[1].split('                else:')[0]

    def test_falha_de_envio_nao_levanta(self):
        self.assertNotIn('raise', self.trecho_da_falha())

    def test_falha_de_envio_espera_e_repete(self):
        trecho = self.trecho_da_falha()
        self.assertIn('self.contornar', trecho)
        self.assertIn('continue', trecho)

    def test_confirmacao_so_depois_do_ok(self):
        """O pop do lote tem que vir depois do envio ter dado certo."""
        pos_envio = self.fonte.index('entrou, motivo = self.ponte.enviar_codigo')
        pos_pop = self.fonte.index('self.lote.pop(0)\n                self.fila_confirmar')
        self.assertLess(pos_envio, pos_pop)

    def test_a_volta_do_laco_tem_rede(self):
        """Erro de banco no meio da noite tem que virar nova tentativa."""
        self.assertIn('falhas_volta', self.fonte)
        self.assertIn('self.contornar(str(e)', self.fonte)

    def test_segura_o_sono_da_maquina(self):
        self.assertIn('impedir_suspensao()', self.fonte)
        self.assertIn('liberar_suspensao()', self.fonte)


if __name__ == '__main__':
    unittest.main()
