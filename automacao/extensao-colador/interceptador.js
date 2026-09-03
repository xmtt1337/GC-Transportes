// Pega a AT no instante em que ela nasce.
//
// A AT nao vem de arquivo nenhum: quando o pedido e colado na tela de cluster,
// o SPX chama a propria API e a resposta JA TRAZ o numero dela. Uma chamada so
// liga o codigo a AT:
//
//   POST .../assisted_sorting/delivery/order/add
//   enviado : {"as_task_id":"AS2026090434813","fleet_order_id":"BR262699568359N"}
//   resposta: {"retcode":0,"message":"Success","data":{"at_no":"AT202609049AXFA"}}
//
// Ler daqui e melhor do que raspar a tela: nao quebra quando a Shopee mexe no
// layout, e chega no mesmo segundo, sem depender de importar arquivo depois.
//
// POR QUE ESTE ARQUIVO E SEPARADO DO content_script.js
// Content script roda num mundo isolado: o `fetch` que ele enxerga NAO e o que
// a pagina usa, entao trocar o fetch la nao intercepta nada. Este roda no mundo
// da PAGINA ("world": "MAIN" no manifest) e conversa com o outro por
// postMessage, que e a unica ponte entre os dois mundos.

(() => {
  'use strict';

  if (window.__gcInterceptadorAt) return;
  window.__gcInterceptadorAt = true;

  // O caminho da chamada que cria a AT. Se a Shopee renomear isso, e aqui que
  // quebra primeiro - e o sintoma vai ser "a AT parou de aparecer no site".
  const ROTA_CRIA_AT = '/assisted_sorting/delivery/order/add';

  // Onde cada coisa mora, do jeito que o SPX manda hoje. Em lista porque nome
  // de campo e a parte que mais muda; a primeira que existir vence.
  const CAMPOS_CODIGO = ['fleet_order_id', 'order_id', 'sls_tracking_no', 'tracking_no'];
  const CAMPOS_AT = ['at_no', 'at_id', 'assisted_task_no'];

  function primeiroCampo(objeto, nomes) {
    if (!objeto || typeof objeto !== 'object') return null;
    for (const nome of nomes) {
      const v = objeto[nome];
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    }
    return null;
  }

  function comoJson(texto) {
    if (typeof texto !== 'string') return null;
    const t = texto.trim();
    if (!t || (t[0] !== '{' && t[0] !== '[')) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  // Manda pro content_script, que e quem fala com o colador. A origem explicita
  // evita que outra aba/iframe leia isto.
  function avisar(codigo, at) {
    if (!codigo || !at) return;
    console.log(`[GC Colador] AT capturada: ${codigo} -> ${at}`);
    window.postMessage({ __gcColadorAt: true, codigo, at }, window.location.origin);
  }

  function examinar(url, corpoEnviado, corpoRecebido) {
    if (!url || url.indexOf(ROTA_CRIA_AT) === -1) return;

    const enviado = comoJson(corpoEnviado);
    const recebido = comoJson(corpoRecebido);
    if (!recebido) return;
    // retcode 0 e o "deu certo" do SPX. Sem isso, uma recusa viraria AT vazia
    // gravada como se o pedido tivesse entrado.
    if (recebido.retcode !== undefined && recebido.retcode !== 0) return;

    const codigo = primeiroCampo(enviado, CAMPOS_CODIGO);
    const at = primeiroCampo(recebido.data, CAMPOS_AT);
    avisar(codigo, at);
  }

  // ── fetch ──────────────────────────────────────────────────────────────
  const fetchOriginal = window.fetch;
  window.fetch = function (...args) {
    let url = '';
    let enviado = null;
    try {
      url = String(args[0] && args[0].url ? args[0].url : args[0] || '');
      enviado = args[1] && args[1].body ? String(args[1].body) : null;
    } catch (e) { /* nao e motivo pra atrapalhar a pagina */ }

    const promessa = fetchOriginal.apply(this, args);
    if (!url || url.indexOf(ROTA_CRIA_AT) === -1) return promessa;

    return promessa.then(resposta => {
      // clone() pra ler sem consumir o corpo: sem isso a pagina fica sem a
      // propria resposta e a tela do SPX quebra.
      try {
        resposta.clone().text()
          .then(texto => { try { examinar(url, enviado, texto); } catch (e) {} })
          .catch(() => {});
      } catch (e) {}
      return resposta;
    });
  };

  // ── XMLHttpRequest ─────────────────────────────────────────────────────
  // O SPX e grande e tem tela velha: cobrir os dois evita a conclusao errada de
  // "a captura parou de funcionar" quando na verdade aquela tela usa XHR.
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    try { this.__gcUrl = String(url); } catch (e) {}
    return xhrOpen.call(this, metodo, url, ...resto);
  };

  XMLHttpRequest.prototype.send = function (corpo) {
    try {
      const url = this.__gcUrl || '';
      if (url.indexOf(ROTA_CRIA_AT) !== -1) {
        const enviado = corpo ? String(corpo) : null;
        this.addEventListener('load', () => {
          try {
            const tipo = this.responseType;
            const texto = (tipo === '' || tipo === 'text') ? this.responseText
                        : (tipo === 'json' ? JSON.stringify(this.response) : '');
            examinar(url, enviado, texto);
          } catch (e) {}
        });
      }
    } catch (e) {}
    return xhrSend.call(this, corpo);
  };

  console.log('[GC Colador] interceptador da AT ligado');
})();
