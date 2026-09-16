// MACRO: PEDIDOS PESQUISADOS
//
// ESCOPO: so a tela Pedidos > Rastreio de pedidos do SPX.
//
// Pega na macro_at_exportada os codigos que ainda nao foram pesquisados, joga
// na Pesquisa em lote e exporta o resultado. O arquivo cai na pasta de
// downloads e o XM Vigia manda pra macro_pedidos_pesquisados, ligando cada
// pedido de volta a AT de onde ele veio.
//
// Faz, na ordem:
//   1. pede os codigos ao vigia (ele e quem tem o login do sistema)
//   2. abre a Pesquisa em lote
//   3. cola os codigos, um por linha, e clica em Enviar
//   4. Exportar > Exportar pedidos pesquisados
//   5. espera o relatorio ficar pronto no painel Ultima tarefa e baixa
//
// DE ONDE VEM OS CODIGOS: a extensao nao alcanca banco nem backend. Quem tem o
// login e o vigia, que roda na maquina. Ela pergunta a ele por 127.0.0.1 -
// mesmo arranjo do ColadorNeon, e o que evita uma segunda copia da senha.
//
// O pedido passa pelo service worker de proposito: pagina HTTPS falando com
// http://127.0.0.1 esbarra em bloqueio de rede privada do Chrome, e o erro que
// chega e um "failed to fetch" que nao conta nada. Do service worker, com
// permissao de host, o caminho e limpo.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;
  const S = G.spx;
  const P = G.painel;

  const TEXTO_LOTE = 'Pesquisa em lote';
  const TEXTO_EXPORTAR = 'Exportar';
  const TEXTO_EXPORTAR_PESQUISADOS = 'Exportar pedidos pesquisados';
  // O SPX aceita ate 10 mil por vez - esta escrito na propria caixa.
  const MAX_POR_VEZ = 10000;

  let rodando = false;

  // ── 1. os codigos ──────────────────────────────────────────────────────
  async function pedirCodigos() {
    let resposta;
    try {
      resposta = await chrome.runtime.sendMessage({ xmMacro: 'pendentes', limite: MAX_POR_VEZ });
    } catch (e) {
      throw new Error('não consegui falar com a extensão — dê F5 na aba');
    }
    if (!resposta || !resposta.ok) {
      const motivo = (resposta && resposta.error) || 'sem resposta';
      throw new Error(`o XM Vigia não respondeu (${motivo}). Ele está aberto na bandeja?`);
    }
    const codigos = (resposta.codigos || []).filter(Boolean);
    if (!codigos.length) {
      throw new Error('não há pedido novo pra pesquisar — rode o macro da AT Exportada antes');
    }
    P.nota(`${codigos.length} códigos${resposta.total > codigos.length
      ? ` (de ${resposta.total} no total)` : ''}`);
    return codigos;
  }

  // ── 2 e 3. pesquisa em lote ────────────────────────────────────────────
  function acharCaixaDeLote() {
    const caixas = [...document.querySelectorAll('textarea')].filter(S.visivel);
    if (caixas.length) return caixas[0];
    // Alguns desenhos usam input grande em vez de textarea.
    return [...document.querySelectorAll('input[type="text"]')]
      .filter(S.visivel)
      .find((c) => /rastreamento|tracking/i.test(c.placeholder || '')) || null;
  }

  async function abrirPesquisaEmLote() {
    if (acharCaixaDeLote()) return acharCaixaDeLote();
    const botao = S.acharBotao(TEXTO_LOTE) || S.folhaVisivelComTexto(TEXTO_LOTE);
    if (!botao) throw new Error(`não achei o botão "${TEXTO_LOTE}"`);
    S.clicar(botao);
    await S.dormir(800);
    return await S.esperar(acharCaixaDeLote, {
      oque: 'a caixa da Pesquisa em lote abrir', limite: 15000 });
  }

  async function colarEEnviar(codigos) {
    const caixa = await abrirPesquisaEmLote();
    // Uma por linha: e o que a propria caixa pede.
    S.escrever(caixa, codigos.join('\n'));
    await S.dormir(400);

    if (!caixa.value || caixa.value.split('\n').filter(Boolean).length !== codigos.length) {
      throw new Error(`a caixa ficou com ${caixa.value.split('\n').filter(Boolean).length} ` +
                      `códigos em vez de ${codigos.length}`);
    }

    // Preso ao dialogo: "Enviar" solto na tela seria de outra caixa qualquer.
    const dialogo = caixa.closest('[role="dialog"], [class*="modal"], [class*="dialog"]') || document;
    const enviar = S.acharBotao('Enviar', { dentro: dialogo }) ||
                   S.acharBotao('Submit', { dentro: dialogo });
    if (!enviar) throw new Error('não achei o botão "Enviar" da Pesquisa em lote');

    const base = S.rede.ativas;
    S.clicar(enviar);
    await S.dormir(900);
    await S.esperarRede({ base, limite: 120000 });
    await S.dormir(900);
  }

  // ── 4. exportar ────────────────────────────────────────────────────────
  const acharItemExportar = () =>
    S.acharBotao(TEXTO_EXPORTAR_PESQUISADOS) ||
    S.folhaVisivelComTexto(TEXTO_EXPORTAR_PESQUISADOS);

  async function exportarPesquisados() {
    let item = acharItemExportar();
    if (!item) {
      const abre = S.acharBotao(TEXTO_EXPORTAR) ||
                   S.acharBotao(TEXTO_EXPORTAR, { comeca: true });
      if (!abre) throw new Error(`não achei o botão "${TEXTO_EXPORTAR}"`);
      S.clicar(abre);
      await S.dormir(700);
      item = acharItemExportar();
    }
    if (!item) {
      throw new Error(`não achei "${TEXTO_EXPORTAR_PESQUISADOS}" no menu Exportar`);
    }

    const base = S.rede.ativas;
    S.clicar(item);
    await S.dormir(900);
    await S.esperarRede({ base, limite: 60000 });
  }

  // ── o macro ────────────────────────────────────────────────────────────
  async function rodar() {
    if (rodando) { P.nota('já está rodando'); return; }
    rodando = true;
    S.parar = false;
    P.abrir('Pedidos Pesquisados', () => { S.parar = true; });

    const T = G.painelDeTarefas;

    try {
      if (!location.href.includes('orderTracking')) {
        P.nota('atenção: esta não parece a tela Rastreio de pedidos');
      }

      P.passo('1/5 · pedindo os códigos ao vigia');
      const codigos = await pedirCodigos();

      P.passo('2/5 · Pesquisa em lote');
      await colarEEnviar(codigos);

      P.passo('3/5 · lendo o painel antes de exportar');
      const antes = await T.lerTarefasAgora();
      await T.fecharPainelTarefas();

      P.passo('4/5 · Exportar pedidos pesquisados');
      await exportarPesquisados();

      P.passo('5/5 · esperando o relatório ficar pronto');
      // Sem nome alvo: o nome que o SPX da a este relatorio ainda nao se
      // conhece. A regra que importa continua valendo - a tarefa certa e a que
      // nao estava la antes do clique - e o quadro mostra o nome que achou,
      // que e como esse nome fica conhecido.
      const alvo = await T.esperarRelatorio(antes, null);
      await T.baixar(alvo);

      P.ok(`baixado: ${alvo.nome} — ${alvo.quando}`);
    } catch (e) {
      if (e instanceof S.Parado) P.erro('parado por você');
      else P.erro(e.message || String(e));
    } finally {
      rodando = false;
      S.parar = false;
    }
  }

  G.pedidos = { rodar, pedirCodigos, acharCaixaDeLote, acharItemExportar };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
      if (msg && msg.xmMacro === 'pedidos') { rodar(); responder({ ok: true }); }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
