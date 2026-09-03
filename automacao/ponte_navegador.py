"""
Ponte entre o colador (Python) e a aba do SPX (extensão do Chrome).

Por que existe: digitar com pyautogui exige que a janela esteja em foco, então
só um macro roda por vez e a máquina fica ocupada. Escrevendo direto no campo
pela extensão, várias abas colam ao mesmo tempo, em segundo plano.

E tem um ganho que o teclado não dá: a aba responde se o código entrou. O
Python só marca colado_em no Neon depois desse "ok" — hoje ele marca por fé.

Protocolo (JSON por mensagem):
  aba   -> {"tipo":"ola", "pagina":"..."}          ao conectar
  py    -> {"tipo":"colar", "id":123, "codigo":"BR..."}
  aba   -> {"tipo":"ok",   "id":123}               escreveu e o campo liberou
  aba   -> {"tipo":"erro", "id":123, "motivo":"campo sumiu"}
  aba   -> {"tipo":"at", "codigo":"BR...", "at":"AT..."}   a AT que acabou de nascer
  py    -> {"tipo":"ping"} / aba -> {"tipo":"pong"}

A connection string do Neon não passa por aqui: quem fala com o banco é o
Python. Importa porque a extensão roda dentro da página da Shopee.
"""

import asyncio
import json
import queue
import threading
import time

import websockets

PORTA_PADRAO = 9876   # 9999 é da extensão BRS HTML Bridge, não mexer
PORTAS = range(9876, 9886)  # cada colador aberto ocupa uma; a extensão varre todas
# Quanto o Python espera a aba confirmar UM código. 0 = sem limite.
#
# Era 30s, e isso derrubava a sessão com o SPX bipando normal: o lado da aba
# pode legitimamente levar mais que isso (esperarCampoLivre 15s + 0,5s de
# sinal + 15s de campo travado = ~30,5s), e a aba em segundo plano ainda leva
# o throttling de timer do Chrome (setTimeout vira 1x/s, e 1x/min depois de
# 5 min oculta) — a resposta chega, só que tarde.
#
# Quem de fato precisa ser detectado é a aba MORRER, e isso não se mede com
# relógio: o WebSocket cai (F5, aba fechada, Chrome fechado) e o laço abaixo
# sai na hora por `not self.conectada`. O relógio só acertava por acidente.
TIMEOUT_RESPOSTA = 0

# Depois de tanto tempo no mesmo código, avisa quem chamou pra tela não ficar
# muda enquanto espera.
AVISAR_DEMORA = 30
INTERVALO_AVISO = 5

# Só aceita conexão vinda da página do SPX. O navegador põe o Origin sozinho e
# não deixa forjar, então qualquer outra coisa que fale nesta porta é barrada.
# Sem isso, um programa qualquer conectando aqui recebe códigos de verdade e,
# respondendo "ok", faz o colador marcar colado_em sem nada ter entrado no SPX.
ORIGEM_ESPERADA = 'https://spx.shopee.com.br'


class Ponte:
    """Servidor WebSocket local. Uma instância por colador aberto.

    Roda o asyncio numa thread separada — a UI do colador é Tk e não convive
    com event loop no mesmo lugar. Quem chama enviar_codigo() bloqueia até a
    aba responder, o que mantém o loop de colagem igual ao do teclado.
    """

    def __init__(self, porta=None, filtro_pagina="", papel="", origem=ORIGEM_ESPERADA):
        # porta=None procura a primeira livre: assim dá pra abrir um colador
        # por tarefa (recebimento numa aba, AT Cluster em outra) sem configurar
        # nada. O filtro_pagina é o que impede um roubar o código do outro.
        self.porta = porta
        self.filtro_pagina = (filtro_pagina or "").strip().lower()
        self.papel = papel
        self.origem = origem   # "" desliga a checagem (só pra teste)
        self.loop = None
        self.servidor = None
        self.thread = None
        self.conexao = None          # a aba conectada agora
        self.pagina = None           # URL que a aba informou
        self.respostas = queue.Queue()
        self.ao_conectar = None      # callbacks opcionais pra UI
        self.ao_desconectar = None
        # Chamado quando a aba avisa a AT que o SPX acabou de criar. Vem por
        # fora do par pergunta/resposta do colar: o SPX cria a AT na chamada
        # dele, no tempo dele, e nao necessariamente antes do "ok" do campo.
        self.ao_capturar_at = None
        self._parar = threading.Event()
        self._proximo_id = 0

    # ------------------------------------------------------------ ciclo
    def iniciar(self):
        if self.thread and self.thread.is_alive():
            return
        self._parar.clear()
        pronto = threading.Event()
        erro = {}

        def rodar():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
            try:
                self.loop.run_until_complete(self._servir(pronto, erro))
            except Exception as e:
                erro['e'] = e
                pronto.set()
            finally:
                try:
                    self.loop.close()
                except Exception:
                    pass

        self.thread = threading.Thread(target=rodar, daemon=True)
        self.thread.start()
        pronto.wait(timeout=10)
        if erro.get('e'):
            raise erro['e']

    async def _servir(self, pronto, erro):
        tentativas = [self.porta] if self.porta else list(PORTAS)
        ultimo = None
        for porta in tentativas:
            try:
                # Prazo folgado de propósito. Com 20s o servidor derrubava a
                # aba por atraso no pong — e o SPX é pesado, então esse atraso
                # acontece. Cada queda dessas abre um buraco de alguns segundos
                # em que a AT nasce e não tem pra quem ir.
                #
                # Prazo curto não protegia de nada aqui: a conexão é local
                # (127.0.0.1), e aba fechada o próprio TCP acusa na hora.
                self.servidor = await websockets.serve(
                    self._atender, "127.0.0.1", porta,
                    ping_interval=30, ping_timeout=120)
                self.porta = porta
                break
            except OSError as e:
                ultimo = e
                continue
        if self.servidor is None:
            if len(tentativas) == 1:
                erro['e'] = OSError(f"A porta {tentativas[0]} está ocupada ({ultimo})")
            else:
                erro['e'] = OSError(
                    f"Nenhuma porta livre entre {PORTAS[0]} e {PORTAS[-1]}. "
                    f"Quantos coladores estão abertos? ({ultimo})")
            pronto.set()
            return
        pronto.set()
        while not self._parar.is_set():
            await asyncio.sleep(0.2)
        self.servidor.close()
        await self.servidor.wait_closed()

    async def _atender(self, conexao):
        if self.origem and self._origem_da(conexao) != self.origem:
            # Não é a aba do SPX. Fecha calado: se respondesse "ok" nos códigos,
            # eles seriam marcados como colados sem existir no sistema.
            try:
                await conexao.close()
            except Exception:
                pass
            return

        aceita = False
        try:
            async for bruto in conexao:
                try:
                    msg = json.loads(bruto)
                except Exception:
                    continue
                tipo = msg.get('tipo')

                if tipo == 'ola':
                    pagina = msg.get('pagina') or ''
                    # A aba se apresenta e o colador diz se ela é dele. Sem
                    # isso, o colador do recebimento pegaria a aba do AT
                    # Cluster (ou o contrário) e os códigos iriam pro lugar
                    # errado — que é o conflito de rodar dois ao mesmo tempo.
                    if self.filtro_pagina and self.filtro_pagina not in pagina.lower():
                        await conexao.send(json.dumps({
                            'tipo': 'recusado', 'papel': self.papel,
                            'filtro': self.filtro_pagina}))
                        return
                    await conexao.send(json.dumps({'tipo': 'aceito', 'papel': self.papel}))

                    # Só derruba a anterior depois de ter uma aba de verdade:
                    # antes, uma aba recusada já matava a que estava colando.
                    if self.conexao is not None and self.conexao is not conexao:
                        try:
                            await self.conexao.close()
                        except Exception:
                            pass
                    self.conexao = conexao
                    aceita = True
                    self.pagina = pagina
                    if self.ao_conectar:
                        self.ao_conectar(pagina)

                elif tipo in ('ok', 'erro'):
                    self.respostas.put(msg)
                elif tipo == 'at':
                    # Fora da fila de respostas de propósito: se entrasse nela,
                    # enviar_codigo leria a AT achando que é a confirmação do
                    # código que está esperando.
                    codigo = (msg.get('codigo') or '').strip()
                    at = (msg.get('at') or '').strip()
                    if codigo and at and self.ao_capturar_at:
                        try:
                            self.ao_capturar_at(codigo, at)
                        except Exception:
                            pass   # AT perdida não pode derrubar a colagem
                elif tipo == 'pong':
                    pass
        except Exception:
            pass
        finally:
            if aceita and self.conexao is conexao:
                self.conexao = None
                self.pagina = None
                if self.ao_desconectar:
                    self.ao_desconectar()

    @staticmethod
    def _origem_da(conexao):
        """Lê o header Origin, que muda de lugar conforme a versão da lib."""
        try:
            pedido = getattr(conexao, 'request', None)
            cabecalhos = getattr(pedido, 'headers', None)
            if cabecalhos is None:
                cabecalhos = getattr(conexao, 'request_headers', {})
            return cabecalhos.get('Origin') or cabecalhos.get('origin') or ''
        except Exception:
            return ''

    def parar(self):
        self._parar.set()
        if self.thread:
            self.thread.join(timeout=5)
        self.conexao = None
        self.pagina = None

    # ------------------------------------------------------------- envio
    @property
    def conectada(self):
        return self.conexao is not None

    def enviar_codigo(self, codigo, timeout=TIMEOUT_RESPOSTA,
                      cancelado=None, ao_demorar=None):
        """Manda um código pra aba e espera ela confirmar.

        Retorna (True, None) se entrou, (False, motivo) se não. O motivo sobe
        pra tela do colador em vez de virar um código perdido em silêncio.

        timeout=0 espera o tempo que for, enquanto a aba estiver conectada.
        Como isso pode bloquear, `cancelado` é obrigatório na prática: é o que
        deixa o botão Parar funcionar. `ao_demorar(segundos)` é chamado de
        tempos em tempos numa espera longa, pra tela dizer o que está havendo.
        """
        if not self.conectada:
            return False, "nenhuma aba do SPX conectada"

        self._proximo_id += 1
        ident = self._proximo_id

        # Descarta resposta atrasada de um código anterior, senão ela seria
        # lida como se fosse a deste.
        while not self.respostas.empty():
            try:
                self.respostas.get_nowait()
            except queue.Empty:
                break

        mensagem = json.dumps({'tipo': 'colar', 'id': ident, 'codigo': codigo})
        try:
            futuro = asyncio.run_coroutine_threadsafe(
                self.conexao.send(mensagem), self.loop)
            futuro.result(timeout=5)
        except Exception as e:
            return False, f"falha ao enviar: {str(e)[:60]}"

        inicio = time.time()
        limite = (inicio + timeout) if timeout else None
        proximo_aviso = inicio + AVISAR_DEMORA
        while limite is None or time.time() < limite:
            if cancelado and cancelado():
                return False, "parado"
            try:
                resposta = self.respostas.get(timeout=0.2)
            except queue.Empty:
                if not self.conectada:
                    return False, "a aba desconectou no meio"
                agora = time.time()
                if ao_demorar and agora >= proximo_aviso:
                    proximo_aviso = agora + INTERVALO_AVISO
                    try:
                        ao_demorar(int(agora - inicio))
                    except Exception:
                        pass
                continue
            if resposta.get('id') != ident:
                continue          # resposta de outro código, ignora
            if resposta.get('tipo') == 'ok':
                return True, None
            return False, resposta.get('motivo') or "a aba recusou"

        return False, f"a aba não respondeu em {timeout}s"
