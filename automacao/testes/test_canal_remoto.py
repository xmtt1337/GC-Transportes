"""Testes do canal remoto: a tela Macros do site manda "Rodar" pro Colador.

O que se protege:
  - "recebimento"/"at_cluster" (como o backend fala, em modules/macros-comando/colador.js)
    e "Recebimento"/"AT Cluster" (como esta janela fala, em MODOS) tem que ser a MESMA
    coisa dos dois lados - se um dos dois mudar de grafia sozinho, o Colador nunca reconhece
    o pedido, e ninguem percebe: o pedido so fica "aguardando" pra sempre;
  - a reivindicacao de um comando usa FOR UPDATE SKIP LOCKED, a mesma garantia de
    "nao repetir e nao pular" que o resto deste arquivo usa pra codigo - dois coladores
    pegando o MESMO pedido de Rodar rodaria a sessao em dobro;
  - só pega comando 'aguardando' (nunca um que outro colador já pegou ou que já terminou).

Nao ha rede nem banco aqui - o que se testa e o SQL e as tabelas de tradução.
Dados de TESTE, inventados.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import colador_neon as cn  # noqa: E402


class TraducaoDeQual(unittest.TestCase):
    def test_bate_com_o_que_o_backend_usa(self):
        # Os mesmos dois nomes de modules/macros-comando/colador.js (QUAIS).
        self.assertEqual(set(cn.QUAL_DO_MODO.values()), {"recebimento", "at_cluster"})

    def test_cobre_os_dois_modos_da_janela_e_so_eles(self):
        self.assertEqual(set(cn.QUAL_DO_MODO.keys()), set(cn.MODOS.keys()))

    def test_e_uma_traducao_de_mao_dupla_de_verdade(self):
        for modo, qual in cn.QUAL_DO_MODO.items():
            self.assertEqual(cn.MODO_DA_QUAL[qual], modo)
        for qual, modo in cn.MODO_DA_QUAL.items():
            self.assertEqual(cn.QUAL_DO_MODO[modo], qual)

    def test_sao_minusculas_com_underline_iguais_ao_backend(self):
        for qual in cn.MODO_DA_QUAL:
            self.assertEqual(qual, qual.lower())
            self.assertNotIn(" ", qual)


class NomeDaMaquina(unittest.TestCase):
    def test_devolve_algo_nao_vazio_de_verdade(self):
        # Roda de verdade (sem mock) - so garante que nao levanta e nao passa de 60.
        nome = cn.nome_da_maquina()
        self.assertIsInstance(nome, str)
        self.assertLessEqual(len(nome), 60)


class SqlDoCanalRemoto(unittest.TestCase):
    """O banco é dublado nos outros arquivos de teste - aqui, como em test_filas.py, o que
    se confere é a FORMA do SQL: a tabela certa, a garantia certa."""

    def test_reivindicar_usa_for_update_skip_locked(self):
        sql = cn.sql_reivindicar_comando()
        self.assertIn("FOR UPDATE SKIP LOCKED", sql)
        self.assertIn("macros_comandos_colador", sql)

    def test_reivindicar_so_pega_o_que_esta_aguardando(self):
        sql = cn.sql_reivindicar_comando()
        self.assertIn("estado = 'aguardando'", sql)
        self.assertIn("ORDER BY criado_em ASC", sql, "o pedido mais antigo primeiro")

    def test_reivindicar_marca_como_iniciado_e_com_a_maquina(self):
        sql = cn.sql_reivindicar_comando()
        self.assertIn("estado = 'iniciado'", sql)
        self.assertIn("maquina = %(maquina)s", sql)

    def test_reivindicar_filtra_pelo_qual_pedido(self):
        self.assertIn("qual = %(qual)s", cn.sql_reivindicar_comando())

    def test_reivindicar_devolve_a_config_como_texto(self):
        # ::text de proposito - ver o comentario no arquivo: evita depender de o psycopg2
        # decodificar jsonb sozinho, quando ninguem mais nesta base faz isso.
        self.assertIn("config::text", cn.sql_reivindicar_comando())

    def test_marcar_erro_grava_estado_e_motivo_pelo_id(self):
        sql = cn.sql_marcar_erro_comando()
        self.assertIn("macros_comandos_colador", sql)
        self.assertIn("estado = 'erro'", sql)
        self.assertIn("erro = %(erro)s", sql)
        self.assertIn("id = %(id)s", sql)

    def test_presenca_e_upsert_por_qual_e_maquina(self):
        sql = cn.sql_presenca_colador()
        self.assertIn("macros_colador_presenca", sql)
        self.assertIn("ON CONFLICT (qual, maquina)", sql)
        self.assertIn("visto_em = NOW()", sql)


if __name__ == "__main__":
    unittest.main()
