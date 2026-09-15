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

  if (window.__gcMacroRede) return;
  window.__gcMacroRede = true;

  let ativas = 0;

  function avisar() {
    window.postMessage({ __gcMacroRede: true, ativas }, window.location.origin);
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

  avisar();
  console.log('[GC Macros] espiao de rede ligado');
})();
