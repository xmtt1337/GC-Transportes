// Consulta de pedidos no SPX da Shopee, no mundo da pagina.
//
// Cada olho da tela e uma chamada show_sensitive_data por campo. Aqui so saem
// nome e telefone do recebedor e nome do remetente.
//
// x-sap-ri e x-sap-sec sao a protecao anti-robo do SPX: nao copiar nem gerar.
// O pedido sai pelo XMLHttpRequest da propria pagina. Se a Shopee recusar assim,
// a consulta para no primeiro pedido, e o certo e parar mesmo.

(() => {
  const ROTA = '/api/fleet_order/order/detail/show_sensitive_data';
  const CAMPOS = { nome: 'buyer_name', telefone: 'buyer_contact', remetente: 'seller_name' };
  const PEDIDO_DE_OUTRA_ESTACAO = 200301007;
  const PAUSA_CAMPO_MS = 300;
  const HEADERS_DO_SITE = ['x-csrftoken', 'device-id', 'app', 'version'];

  function criarConsulta(get, esperar) {
    return async function consultar(codigo) {
      const dados = { status: '', nome: '', telefone: '', remetente: '' };
      const nomes = Object.keys(CAMPOS);
      for (let i = 0; i < nomes.length; i++) {
        const url = `${ROTA}?shipment_id=${encodeURIComponent(codigo)}&data_field=${CAMPOS[nomes[i]]}`;
        const r = await get(url);
        if (r.retcode === PEDIDO_DE_OUTRA_ESTACAO) return { ...dados, status: 'nao e desta estacao' };
        if (r.retcode !== 0) {
          throw new Error(`A Shopee recusou (retcode ${r.retcode}): ${r.message || 'sem mensagem'}`);
        }
        dados[nomes[i]] = (r.data && r.data.data_detail) || '';
        if (i < nomes.length - 1) await esperar(PAUSA_CAMPO_MS);
      }
      return dados;
    };
  }

  function lerResposta(status, texto) {
    let j = null;
    try {
      j = JSON.parse(texto);
    } catch { /* tratado abaixo */ }
    if (status !== 200 || !j) throw new Error(`A Shopee recusou (HTTP ${status}).`);
    return j;
  }

  if (typeof module !== 'undefined') {
    module.exports = { criarConsulta, lerResposta, HEADERS_DO_SITE };
    return;
  }

  const headers = {};
  const original = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    const n = String(nome).toLowerCase();
    if (HEADERS_DO_SITE.includes(n)) headers[n] = valor;
    return original.apply(this, arguments);
  };

  const get = (url) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    Object.entries(headers).forEach(([n, v]) => xhr.setRequestHeader(n, v));
    xhr.onload = () => {
      try {
        resolve(lerResposta(xhr.status, xhr.responseText));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error('A Shopee nao respondeu.'));
    xhr.send();
  });

  const consultar = criarConsulta(get, (ms) => new Promise((r) => setTimeout(r, ms)));

  async function atender(pedido) {
    if (pedido.tipo === 'status') return { pronto: !!headers['x-csrftoken'] };
    if (pedido.tipo === 'consultar') {
      try {
        return { ok: true, dados: await consultar(pedido.codigo) };
      } catch (e) {
        return { ok: false, erro: e.message };
      }
    }
    return { ok: false, erro: 'Pedido desconhecido.' };
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.xmConsulta !== 'pedido') return;
    const resposta = await atender(e.data.pedido);
    window.postMessage({ xmConsulta: 'resposta', id: e.data.id, resposta }, window.location.origin);
  });
})();
