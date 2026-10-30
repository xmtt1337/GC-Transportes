"""A ponte com o fundo.js real (Node + Chrome dublado), e a prova mutua.

O que se protege: nenhum programa da maquina recebe codigo ou contato sem provar
a chave, nem a extensao atende um programa falso na porta.

Dados de TESTE, inventados.
"""

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import unittest

import websockets

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(AQUI))

from ponte_consulta import ErroDaPonte, Ponte  # noqa: E402

CHAVE = "chave-de-teste"
CLIENTE = os.path.join(AQUI, "cliente_fundo.js")


def abrir_cliente(porta, chave):
    return subprocess.Popen(["node", CLIENTE, str(porta), chave],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


def esperar_ligar(ponte, segundos=5):
    limite = time.monotonic() + segundos
    while not ponte.conectada and time.monotonic() < limite:
        time.sleep(0.05)
    return ponte.conectada


@unittest.skipUnless(shutil.which("node"), "precisa do Node")
class ComFundoReal(unittest.TestCase):
    def setUp(self):
        self.ponte = Ponte(CHAVE, porta=0, exigir_origem=False)
        self.ponte.iniciar()
        self.cliente = None
        self.addCleanup(self.ponte.parar)

    def tearDown(self):
        if self.cliente:
            self.cliente.kill()
            self.cliente.communicate()

    def test_chave_certa_atende_consulta_de_ponta_a_ponta(self):
        self.cliente = abrir_cliente(self.ponte.porta, CHAVE)
        self.assertTrue(esperar_ligar(self.ponte))

        self.assertTrue(self.ponte.pedir({"tipo": "preparar", "transportadora": "anjun"})["ok"])
        r = self.ponte.pedir({"tipo": "consultar", "transportadora": "anjun", "codigo": "AJ149900000000"})
        self.assertTrue(r["ok"])
        self.assertEqual(r["dados"]["telefone"], "49900000000")

    def test_chave_errada_nao_liga(self):
        self.cliente = abrir_cliente(self.ponte.porta, "outra-chave")
        self.assertFalse(esperar_ligar(self.ponte, 1.5))
        with self.assertRaises(ErroDaPonte):
            self.ponte.pedir({"tipo": "consultar", "codigo": "AJ1"})

    def test_transportadora_sem_suporte_responde_erro(self):
        self.cliente = abrir_cliente(self.ponte.porta, CHAVE)
        self.assertTrue(esperar_ligar(self.ponte))
        r = self.ponte.pedir({"tipo": "preparar", "transportadora": "imile"})
        self.assertFalse(r["ok"])


@unittest.skipUnless(shutil.which("node"), "precisa do Node")
class ProgramaFalso(unittest.TestCase):
    def test_extensao_nao_atende_servidor_sem_a_chave(self):
        respostas = []

        async def falso(conexao):
            await conexao.send(json.dumps({"tipo": "desafio", "nonce": "abc"}))
            await conexao.recv()
            await conexao.send(json.dumps({"tipo": "aceito", "prova": "inventada"}))
            await conexao.send(json.dumps({"id": 1, "tipo": "consultar",
                                           "transportadora": "anjun", "codigo": "AJ1"}))
            try:
                async for m in conexao:
                    respostas.append(m)
            except websockets.ConnectionClosed:
                pass

        async def rodar():
            async with websockets.serve(falso, "127.0.0.1", 0) as s:
                porta = s.sockets[0].getsockname()[1]
                cliente = abrir_cliente(porta, CHAVE)
                await asyncio.sleep(1.5)
                cliente.kill()
                cliente.communicate()

        asyncio.run(rodar())
        self.assertEqual(respostas, [])


class Origem(unittest.TestCase):
    def test_site_comum_nao_chega_ao_desafio(self):
        ponte = Ponte(CHAVE, porta=0)
        ponte.iniciar()
        self.addCleanup(ponte.parar)

        async def tentar():
            url = f"ws://127.0.0.1:{ponte.porta}"
            async with websockets.connect(url, origin="https://site-qualquer.example") as c:
                with self.assertRaises(websockets.ConnectionClosed):
                    await asyncio.wait_for(c.recv(), 2)

        asyncio.run(tentar())
        self.assertFalse(ponte.conectada)


if __name__ == "__main__":
    unittest.main()
