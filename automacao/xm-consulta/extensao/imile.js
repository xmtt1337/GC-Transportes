// Consulta de pedidos no DS da iMile, no mundo da pagina.
//
// A busca normal do pedido (track/query) ja traz o remetente aberto. O olho do
// telefone e uma chamada getDesensitizationInfoV1, que abre nome, telefone e
// produto juntos e gasta 1 da cota de revelacoes da conta (700 em 04/11/2026).
// A busca vem antes: se a iMile recusar, a cota nao e gasta.
// A propria resposta traz a cota: a consulta para antes de ela acabar, para
// sobrar para o uso normal da tela. Nunca tentar contornar essa cota.
//
// Front-Sec e a assinatura de seguranca do DS: nao copiar nem gerar. Se a iMile
// recusar o pedido sem ela, a consulta para no primeiro pedido.

(() => {
  const ROTA_BUSCA = '/saastms/v1/biz/track/query';
  const ROTA = '/saastms/v1/biz/track/getDesensitizationInfoV1';
  const RESERVA_DA_COTA = 30;
  const HEADERS_DO_SITE = ['authorization', 'lang', 'timezone', 'resource-code', 'sys-name',
    'x-page-path', 'path', 'hubcode', 'sys-portal'];

  function criarConsulta(post) {
    return async function consultar(codigo) {
      const busca = await post(ROTA_BUSCA, { searchType: 'waybillNo', searchValue: codigo });
      if (!busca || busca.status !== 'success' || !busca.resultObject) {
        throw new Error(`A iMile recusou a busca: ${(busca && busca.message) || 'sem mensagem'}`);
      }
      const remetente = busca.resultObject.consignorinfo || {};

      const r = await post(ROTA, { waybillNo: codigo, keyName: 'consigneeContact', model: 'TRACK' });
      if (!r || r.status !== 'success' || !r.resultObject) {
        throw new Error(`A iMile recusou: ${(r && r.message) || 'sem mensagem'}`);
      }
      const info = r.resultObject.infoResult || {};
      const cota = r.resultObject.config || {};
      if (cota.limit) throw new Error('A cota de revelacoes da iMile acabou.');

      const dados = {
        status: '',
        nome: info.consigneeContact || info.consignee || '',
        telefone: info.consigneeMobile || info.consigneePhone || '',
        remetente: remetente.consignor || remetente.consignorContact || '',
        produto: info.sku || info.skuZh || '',
      };
      const restam = Number(cota.maxCount) - Number(cota.currentCount);
      if (Number.isFinite(restam) && restam <= RESERVA_DA_COTA) {
        dados.parar = `Parei para nao esgotar a cota da iMile: usadas ${cota.currentCount} de ${cota.maxCount}, ficaram ${restam} para o uso na tela.`;
      }
      return dados;
    };
  }

  function lerResposta(status, texto) {
    let j = null;
    try {
      j = JSON.parse(texto);
    } catch { /* tratado abaixo */ }
    if (status !== 200 || !j) throw new Error(`A iMile recusou (HTTP ${status}).`);
    return j;
  }

  if (typeof module !== 'undefined') {
    module.exports = { criarConsulta, lerResposta, HEADERS_DO_SITE, RESERVA_DA_COTA };
    return;
  }

  const headers = {};
  const original = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    const n = String(nome).toLowerCase();
    if (HEADERS_DO_SITE.includes(n)) headers[n] = valor;
    return original.apply(this, arguments);
  };

  const post = (url, corpo) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    xhr.setRequestHeader('Content-Type', 'application/json');
    Object.entries(headers).forEach(([n, v]) => xhr.setRequestHeader(n, v));
    xhr.onload = () => {
      try {
        resolve(lerResposta(xhr.status, xhr.responseText));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => reject(new Error('A iMile nao respondeu.'));
    xhr.send(JSON.stringify(corpo));
  });

  const consultar = criarConsulta(post);

  async function atender(pedido) {
    if (pedido.tipo === 'status') return { pronto: !!headers.authorization };
    if (pedido.tipo === 'consultar') {
      try {
        const dados = await consultar(pedido.codigo);
        const { parar, ...resto } = dados;
        return { ok: true, dados: resto, parar };
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
