"""Ponte entre o programa e a extensao XM Consulta.

WebSocket so em 127.0.0.1, com a extensao conectando. A porta e alcancavel por
qualquer programa da maquina, entao nada de codigo ou contato passa antes da
prova mutua descrita em extensao/fundo.js. A chave nunca viaja.

A Origin e so uma barreira a mais: quem nao e extensao do Chrome nem chega ao
desafio. Quem garante e a prova.

Asyncio em thread separada porque a tela e Tk (mesmo arranjo do ponte_navegador).
"""

import asyncio
import hashlib
import hmac
import json
import secrets
import threading

import websockets

PORTA = 49741
PRAZO_OLA = 5
PRAZO_RESPOSTA = 30
INTERVALO_PING = 20  # service worker do Chrome dorme apos 30s sem mensagem


class ErroDaPonte(Exception):
    pass


def prova(chave, papel, nonce_servidor, nonce_cliente):
    texto = f"{papel}|{nonce_servidor}|{nonce_cliente}"
    return hmac.new(chave.encode(), texto.encode(), hashlib.sha256).hexdigest()


class Ponte:
    def __init__(self, chave, porta=PORTA, exigir_origem=True, ao_mudar=None):
        self.chave = chave
        self.porta = porta
        self.exigir_origem = exigir_origem
        self.ao_mudar = ao_mudar
        self.loop = None
        self.conexao = None
        self.thread = None
        self._fim = None
        self._pendentes = {}
        self._proximo = 0

    @property
    def conectada(self):
        return self.conexao is not None

    def iniciar(self):
        pronto = threading.Event()
        erro = {}

        def rodar():
            try:
                asyncio.run(self._servir(pronto))
            except Exception as e:
                erro["e"] = e
                pronto.set()

        self.thread = threading.Thread(target=rodar, daemon=True)
        self.thread.start()
        pronto.wait(5)
        if "e" in erro:
            raise ErroDaPonte(f"Não abri a porta {self.porta}. O programa já está aberto?") from erro["e"]

    def parar(self):
        if self.loop and self._fim:
            self.loop.call_soon_threadsafe(self._fim.set)
            self.thread.join(2)

    def pedir(self, mensagem, prazo=PRAZO_RESPOSTA):
        """Manda e bloqueia ate a extensao responder. Chamar fora da thread da tela."""
        if not self.conectada:
            raise ErroDaPonte("A extensão não está ligada ao programa.")
        futuro = asyncio.run_coroutine_threadsafe(self._pedir(mensagem, prazo), self.loop)
        return futuro.result(prazo + 2)

    async def _pedir(self, mensagem, prazo):
        self._proximo += 1
        id_ = self._proximo
        futuro = self.loop.create_future()
        self._pendentes[id_] = futuro
        try:
            await self.conexao.send(json.dumps({**mensagem, "id": id_}))
            return await asyncio.wait_for(futuro, prazo)
        except (asyncio.TimeoutError, AttributeError) as e:
            raise ErroDaPonte("A extensão não respondeu a tempo.") from e
        except websockets.ConnectionClosed as e:
            raise ErroDaPonte("A extensão desconectou.") from e
        finally:
            self._pendentes.pop(id_, None)

    async def _servir(self, pronto):
        self.loop = asyncio.get_running_loop()
        self._fim = asyncio.Event()
        async with websockets.serve(self._atender, "127.0.0.1", self.porta,
                                    ping_interval=30, ping_timeout=120) as servidor:
            self.porta = servidor.sockets[0].getsockname()[1]
            pronto.set()
            pulso = asyncio.create_task(self._pulsar())
            await self._fim.wait()
            pulso.cancel()

    async def _pulsar(self):
        while True:
            await asyncio.sleep(INTERVALO_PING)
            if self.conexao:
                try:
                    await self.conexao.send(json.dumps({"tipo": "ping"}))
                except websockets.ConnectionClosed:
                    pass

    async def _autenticar(self, conexao):
        nonce = secrets.token_hex(16)
        await conexao.send(json.dumps({"tipo": "desafio", "nonce": nonce}))
        try:
            ola = json.loads(await asyncio.wait_for(conexao.recv(), PRAZO_OLA))
            nonce_cliente, recebida = ola["nonce"], ola["prova"]
            if not (isinstance(nonce_cliente, str) and isinstance(recebida, str)):
                return False
        except (asyncio.TimeoutError, ValueError, KeyError, TypeError):
            return False
        if not hmac.compare_digest(recebida, prova(self.chave, "cliente", nonce, nonce_cliente)):
            return False
        await conexao.send(json.dumps({
            "tipo": "aceito",
            "prova": prova(self.chave, "servidor", nonce, nonce_cliente),
        }))
        return True

    async def _atender(self, conexao):
        origem = conexao.request.headers.get("Origin") or ""
        if self.exigir_origem and not origem.startswith("chrome-extension://"):
            await conexao.close(1008, "origem")
            return
        if not await self._autenticar(conexao):
            await conexao.close(1008, "chave")
            return

        self.conexao = conexao
        self._avisar()
        try:
            async for bruto in conexao:
                msg = json.loads(bruto)
                futuro = self._pendentes.get(msg.get("id"))
                if futuro and not futuro.done():
                    futuro.set_result(msg)
        except (websockets.ConnectionClosed, ValueError):
            pass
        finally:
            if self.conexao is conexao:
                self.conexao = None
                for futuro in self._pendentes.values():
                    if not futuro.done():
                        futuro.set_exception(ErroDaPonte("A extensão desconectou."))
                self._avisar()

    def _avisar(self):
        if self.ao_mudar:
            self.ao_mudar(self.conectada)
