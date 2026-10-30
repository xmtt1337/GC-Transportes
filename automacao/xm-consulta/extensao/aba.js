// Mundo isolado da aba: leva o pedido do fundo.js ate o script da pagina e traz
// a resposta. Fica separado porque so o mundo da pagina enxerga o token do site,
// e so o mundo isolado fala com a extensao.

const PRAZO_MS = 25000;
let proximoId = 0;

function pedirPagina(pedido) {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${++proximoId}`;
    const fim = (resposta) => {
      clearTimeout(prazo);
      window.removeEventListener('message', ouvir);
      resolve(resposta);
    };
    const ouvir = (e) => {
      if (e.source !== window || !e.data || e.data.xmConsulta !== 'resposta' || e.data.id !== id) return;
      fim(e.data.resposta);
    };
    const prazo = setTimeout(() => fim({ ok: false, erro: 'A pagina nao respondeu a tempo.' }), PRAZO_MS);
    window.addEventListener('message', ouvir);
    window.postMessage({ xmConsulta: 'pedido', id, pedido }, window.location.origin);
  });
}

chrome.runtime.onMessage.addListener((pedido, _, responder) => {
  pedirPagina(pedido).then(responder);
  return true;
});
