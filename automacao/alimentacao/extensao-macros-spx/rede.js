// Conta quantas chamadas o SPX tem em voo, pro macro saber quando a tela
// terminou de carregar de verdade.
//
// POR QUE E UM ARQUIVO SEPARADO: content script roda num mundo isolado, e o
// `fetch` que ele enxerga NAO e o que a pagina usa. Trocar o fetch la nao
// intercepta nada. Este roda no mundo da PAGINA ("world": "MAIN" no manifest)
// e conversa com o outro por postMessage, a unica ponte entre os dois.
//
// Ele so conta. Nao le corpo, nao guarda url, nao manda nada pra fora.

(() => {
  'use strict';

  if (window.__xmMacroRede) return;
  window.__xmMacroRede = true;

  let ativas = 0;

  function avisar() {
    window.postMessage({ __xmMacroRede: true, ativas }, window.location.origin);
  }

  function entrou() { ativas++; avisar(); }
  function saiu() { ativas = Math.max(0, ativas - 1); avisar(); }

  const fetchOriginal = window.fetch;
  window.fetch = function (...args) {
    entrou();
    let promessa;
    try {
      promessa = fetchOriginal.apply(this, args);
    } catch (e) {
      saiu();
      throw e;
    }
    return promessa.then(
      (r) => { saiu(); return r; },
      (e) => { saiu(); throw e; },
    );
  };

  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (corpo) {
    let baixou = false;
    const terminou = () => { if (!baixou) { baixou = true; saiu(); } };
    try {
      entrou();
      this.addEventListener('loadend', terminou);
    } catch (e) {
      terminou();
    }
    return xhrSend.call(this, corpo);
  };

  // ── o download do relatorio ──────────────────────────────────────────────
  // O botao Baixar do SPX chama window.open. Clique de macro NAO da "ativacao
  // do usuario" pro navegador, entao o bloqueador de pop-up mata a janela: o
  // arquivo nunca vem, nenhum erro aparece na tela e o macro segue achando que
  // baixou. Foi exatamente o que aconteceu - a pasta de downloads ficou sem o
  // arquivo enquanto o painel do SPX dizia "Pronto".
  //
  // Quando a janela e bloqueada, o endereco e baixado por um iframe escondido.
  // Resposta com Content-Disposition: attachment vira download sem sair da
  // pagina e sem depender de permissao de pop-up.
  function baixarEscondido(endereco) {
    try {
      const moldura = document.createElement('iframe');
      moldura.style.display = 'none';
      moldura.src = endereco;
      document.documentElement.appendChild(moldura);
      setTimeout(() => { try { moldura.remove(); } catch (e) {} }, 60000);
      return true;
    } catch (e) {
      return false;
    }
  }

  const abrirOriginal = window.open;
  window.open = function (endereco, ...resto) {
    let janela = null;
    try {
      janela = abrirOriginal.apply(this, [endereco, ...resto]);
    } catch (e) {
      janela = null;
    }
    if (!janela && endereco) {
      const deu = baixarEscondido(String(endereco));
      console.log('[XM Macros] pop-up bloqueado; baixando por dentro da página:', String(endereco));
      window.postMessage({ __xmMacroDownload: true, bloqueado: true, contornado: deu },
                         window.location.origin);
    }
    return janela;
  };

  avisar();
  console.log('[XM Macros] espiao de rede ligado');
})();
