// MACRO: BACKLOG
//
// ESCOPO: so a tela Painel > Entrega/Devolução > AMH-LM > Delivery V3.0
// ("Visão geral do hub"), #/dashboard/all-mile-hub/lm.
//
// O mais simples dos três: clica no iconezinho de baixar ao lado do card
// "Backlog" e pronto - o clique já dispara o download direto, sem "Última
// tarefa" pra esperar e sem botão "Baixar" separado. O arquivo cai como
// "backlogs.xlsx" (ou "backlogs (N).xlsx" se já existir um igual na pasta) e
// quem faz o resto é o XM Vigia: reconhece esse arquivo pelo NOME (não tem
// cabeçalho conhecido pra identificar por conteúdo, ao contrário da AT e dos
// pedidos pesquisados) e manda pra macro_backlog_shopee.
//
// SEM SELETOR ADIVINHADO: o ícone de baixar não tem texto - só dá pra achar
// ensinando (popup > "Ensinar o Backlog", ou Alt+B com a tela aberta).
// Seletor adivinhado errado aqui seria PIOR que nenhum: clicaria em outra
// coisa (o ícone de ajuda do lado, por exemplo) com confiança.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;
  const S = G.spx;
  const P = G.painel;

  const TELA = '#/dashboard/all-mile-hub/lm';
  const TEXTO_BACKLOG = 'Backlog';

  const achouATela = () => !!S.folhaVisivelComTexto(TEXTO_BACKLOG);

  function acharBotaoBaixar() {
    return G.aprender.elementosEnsinados('backlog').filter(S.visivel)[0] || null;
  }

  // O card do Backlog desenha depois dos números do painel: espera, e na segunda volta rola até
  // ele (o SPX só desenha o que está perto da tela). null se não apareceu.
  async function esperarBotaoBaixar() {
    const achar = () => acharBotaoBaixar();
    const espera = (limite) => S.esperar(achar, { oque: 'o ícone de baixar do Backlog', limite, intervalo: 500 })
      .catch((e) => { if (e instanceof S.Parado) throw e; return null; });
    let botao = await espera(20000);
    if (botao) return botao;
    P.nota('o ícone ainda não apareceu — rolando até o card do Backlog');
    const card = S.folhaVisivelComTexto(TEXTO_BACKLOG);
    try { if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center' }); } catch (e) { /* segue */ }
    botao = await espera(20000);
    return botao;
  }

  // Pede ao service worker pra recarregar esta aba e rodar o Backlog de novo (ele limita quantas).
  function pedirRepeticao() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return false;
      const r = chrome.runtime.sendMessage({ xmRepetirMacro: 'backlog' });
      if (r && typeof r.catch === 'function') r.catch(() => {});
      return true;
    } catch (e) { return false; }
  }

  let rodando = false;

  async function rodar() {
    if (rodando) { P.nota('já está rodando'); return; }
    rodando = true;
    S.parar = false;
    P.abrir('Backlog', () => { S.parar = true; });

    try {
      await G.aprender.carregar();

      P.passo('abrindo Painel › Entrega/Devolução › AMH-LM');
      const mudou = await S.irParaTela(TELA, achouATela, 'AMH-LM (Delivery V3.0)');
      P.nota(mudou ? 'tela aberta' : 'já estava nela');

      P.passo('1/2 · achando o ícone de baixar do Backlog');
      const botao = await esperarBotaoBaixar();
      if (!botao) {
        // O ícone tem padrão gravado (aprender.js): não achar é a tela que não desenhou o card
        // (carregando, janela escondida). Recarrega a aba e roda de novo (20/10/2026).
        const repete = pedirRepeticao();
        throw new Error('não achei o ícone de baixar do "Backlog" na tela (esperei 40s)' +
          (repete ? ' — vou recarregar a aba e rodar de novo' : '') +
          '; se continuar, ensine de novo pelo popup ("Ensinar o Backlog" ou Alt+B nesta tela)');
      }

      P.passo('2/2 · clicando pra baixar');
      const base = S.rede.ativas;
      S.clicar(botao);
      await S.dormir(600);
      await S.esperarRede({ base, limite: 20000 });
      // Sem "Última tarefa" nem "Baixar" aqui: o clique já É o download. Essa
      // folga é só pro arquivo terminar de cair na pasta antes de dar por
      // encerrado - quem confirma de verdade que chegou é o XM Vigia.
      await S.dormir(1200);

      P.ok('clique disparado — o XM Vigia pega o arquivo na pasta de downloads');
    } catch (e) {
      if (e instanceof S.Parado) P.erro('parado por você');
      else P.erro(e.message || String(e));
    } finally {
      rodando = false;
      S.parar = false;
    }
  }

  G.backlog = { rodar, achouATela, acharBotaoBaixar, esperarBotaoBaixar, TELA, TEXTO_BACKLOG };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
      if (msg && msg.xmMacro === 'backlog') {
        if (rodando) responder({ ok: false, error: 'o Backlog já está rodando' });
        else { rodar(); responder({ ok: true }); }
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
