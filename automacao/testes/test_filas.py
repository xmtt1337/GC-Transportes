"""Testes das duas filas que o colador atende.

O galpao e os entregadores tem tabelas separadas: a trava de duplicado por dia
e uma por tabela, e juntas elas brigavam - o galpao receber um codigo impedia o
entregador de pedir AT pra ele.

O que se protege aqui e o codigo nao sumir na travessia: reserva, confirmacao e
liberacao passaram a ser por fila, e trocar a tabela errada marca como colado
algo que nunca foi.

Dados de TESTE, inventados.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import colador_neon as cn  # noqa: E402


class Filas(unittest.TestCase):
    def test_sao_duas_e_o_galpao_vem_primeiro(self):
        self.assertEqual(len(cn.FILAS), 2)
        self.assertEqual(cn.FILAS[0], 'shopee_recebimentos')
        self.assertIn('entregador', cn.FILAS[1])

    def test_tabela_solta_aponta_pra_primeira(self):
        """Onde ainda se fala de "a" tabela (rotulo, lista de XPT)."""
        self.assertEqual(cn.TABELA, cn.FILAS[0])


class SqlPorFila(unittest.TestCase):
    """Cada SQL tem que sair falando da tabela que recebeu, e so dela."""

    def _so_menciona(self, sql, tabela):
        outra = [t for t in cn.FILAS if t != tabela][0]
        self.assertIn(tabela, sql)
        self.assertNotIn(outra, sql)

    def test_reservar(self):
        for tabela in cn.FILAS:
            for modo in cn.MODOS:
                self._so_menciona(cn.sql_reservar(modo, tabela), tabela)

    def test_confirmar(self):
        for tabela in cn.FILAS:
            for modo in cn.MODOS:
                self._so_menciona(cn.sql_confirmar(modo, tabela), tabela)

    def test_liberar(self):
        for tabela in cn.FILAS:
            for modo in cn.MODOS:
                self._so_menciona(cn.sql_liberar(modo, tabela), tabela)

    def test_contar(self):
        for tabela in cn.FILAS:
            for modo in cn.MODOS:
                self._so_menciona(cn.sql_contar(modo, tabela), tabela)

    def test_gravar_at(self):
        for tabela in cn.FILAS:
            self._so_menciona(cn.sql_gravar_at(tabela), tabela)

    def test_pular_e_zerar(self):
        for tabela in cn.FILAS:
            for modo in cn.MODOS:
                self._so_menciona(cn.sql_pular(modo, tabela), tabela)
                self._so_menciona(cn.sql_zerar(modo, tabela), tabela)


class ColunasIguaisNasDuas(unittest.TestCase):
    """O colador so pode ignorar de qual fila veio se as colunas forem iguais."""

    def test_reserva_usa_as_mesmas_colunas_nas_duas(self):
        for modo in cn.MODOS:
            a = cn.sql_reservar(modo, cn.FILAS[0]).replace(cn.FILAS[0], 'X')
            b = cn.sql_reservar(modo, cn.FILAS[1]).replace(cn.FILAS[1], 'X')
            self.assertEqual(a, b, "as duas filas tem que ser lidas do mesmo jeito")

    def test_confirmacao_idem(self):
        for modo in cn.MODOS:
            a = cn.sql_confirmar(modo, cn.FILAS[0]).replace(cn.FILAS[0], 'X')
            b = cn.sql_confirmar(modo, cn.FILAS[1]).replace(cn.FILAS[1], 'X')
            self.assertEqual(a, b)


class GravacaoDaAt(unittest.TestCase):
    def test_nao_sobrescreve_at_ja_gravada(self):
        """Segunda captura do mesmo pacote nao pode trocar a AT que ja valia."""
        self.assertIn('at_numero IS NULL', cn.sql_gravar_at(cn.FILAS[0]))

    def test_casa_por_dia_e_codigo_sem_diferenciar_caixa(self):
        sql = cn.sql_gravar_at(cn.FILAS[0])
        self.assertIn('dia = %(dia)s', sql)
        self.assertIn('UPPER(codigo) = UPPER(%(codigo)s)', sql)


class LoteCarregaAFila(unittest.TestCase):
    """O lote passou a ser (tabela, id, codigo): sem a tabela, a confirmacao
    iria pro lugar errado e marcaria como colado o que nao foi."""

    @classmethod
    def setUpClass(cls):
        import inspect
        cls.fonte = inspect.getsource(cn.ColadorApp)

    def test_reservar_devolve_a_fila_junto(self):
        trecho = self.fonte.split('def reservar_lote')[1].split('def ')[0]
        self.assertIn('for tabela in FILAS', trecho)
        self.assertIn('(tabela, r[0], r[1])', trecho)

    def test_laco_desempacota_os_tres(self):
        self.assertIn('tabela, registro_id, codigo = self.lote[0]', self.fonte)

    def test_confirmacao_agrupa_por_fila(self):
        trecho = self.fonte.split('def loop_confirmacao')[1].split('def ')[0]
        self.assertIn('porFila', trecho)

    def test_liberacao_agrupa_por_fila(self):
        trecho = self.fonte.split('def finalizar_execucao')[1].split('def ')[0]
        self.assertIn('porFila', trecho)


class LogEmArquivo(unittest.TestCase):
    """O .exe nao tem console: print some e nao sobra memoria nenhuma."""

    def test_registrar_existe_e_escreve(self):
        self.assertTrue(callable(cn.registrar))
        self.assertTrue(cn.LOG_PATH.endswith('colador.log'))

    def test_a_captura_da_at_e_registrada(self):
        import inspect
        fonte = inspect.getsource(cn.ColadorApp.loop_at)
        self.assertIn('registrar(', fonte)
        self.assertIn('ats_sessao', fonte)


if __name__ == '__main__':
    unittest.main()
