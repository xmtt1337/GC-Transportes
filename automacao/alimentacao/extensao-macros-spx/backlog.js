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
      const botao = acharBotaoBaixar();
      if (!botao) {
        throw new Error('o ícone de baixar do "Backlog" ainda não foi ensinado — ' +
                         'abra o popup e clique em "Ensinar o Backlog" (ou Alt+B nesta tela)');
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

  G.backlog = { rodar, achouATela, acharBotaoBaixar, TELA, TEXTO_BACKLOG };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
      if (msg && msg.xmMacro === 'backlog') {
        if (rodando) responder({ ok: false, error: 'o Backlog já está rodando' });
        else { rodar(); responder({ ok: true }); }
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
