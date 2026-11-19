// XM - Perdas Anjun, no mundo da pagina.
//
// Busca o rastreio de um pacote do mesmo jeito que a janela "Consulta de rastreamentos"
// da Anjun: GET /admin/track/{codigo}, com o token e o idioma que o proprio site manda.
// O token e lido no momento em que o site chama a API e nao fica guardado em lugar
// nenhum alem desta pagina.

(() => {
  const headers = {};
  const original = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    const n = String(nome).toLowerCase();
    if (n === 'token' || n === 'accept-language') headers[n] = valor;
    return original.apply(this, arguments);
  };

  async function rastreio(codigo) {
    if (!headers.token) {
      return { ok: false, semToken: true, erro: 'A Anjun ainda não fez nenhuma consulta nesta aba. Clique em Buscar em qualquer tela dela e tente de novo.' };
    }
    const r = await fetch(`/admin/track/${encodeURIComponent(codigo)}`, { headers: { ...headers, accept: 'application/json' } });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.code !== 200) {
      const motivo = (j && j.msg) || 'sem mensagem';
      return {
        ok: false,
        frequente: /frequent/i.test(motivo),
        sessao: r.status === 401 || /login|token|expir/i.test(motivo),
        erro: `A Anjun recusou (HTTP ${r.status}, code ${j ? j.code : '?'}): ${motivo}`,
      };
    }
    return { ok: true, eventos: Array.isArray(j.data) ? j.data : [] };
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.xmPerdas !== 'pedido') return;
    let resposta;
    try {
      resposta = await rastreio(String(e.data.codigo || ''));
    } catch (erro) {
      resposta = { ok: false, erro: `Falha de rede: ${erro.message}` };
    }
    window.postMessage({ xmPerdas: 'resposta', id: e.data.id, resposta }, window.location.origin);
  });
})();
