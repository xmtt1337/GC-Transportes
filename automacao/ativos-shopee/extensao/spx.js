// XM - Ativos Shopee, no mundo da pagina (spx.shopee.com.br).
//
// Pede ao SPX o export de pedidos (o mesmo do botao Export do Order Tracking) dos BR colados:
//   1. POST /api/admin/tracking/am_hub/return/export {search_id_list, searched_tag: 1} -> task_id;
//   2. GET  /spxdata/api/export_platform/export_task/list_for_portal ate export_status 2 (pronto);
//   3. GET  /spxdata/api/export_platform/export_task/get_signed_download_url -> link do CSV (10 min).
// Daqui so sai o link; quem baixa e le o arquivo e o fundo.js. O export traz o NOME aberto (sem
// gastar o "olho"), mas o telefone vem sempre vazio: ele sai pelo olho (buscarTelefone), um pedido
// por vez, so dos que vao receber o ativo. A tarefa do export aparece no Latest Task do SPX.
//
// x-sap-ri e x-sap-sec sao a protecao anti-robo do SPX: nao copiar nem gerar. O pedido sai pelo
// XMLHttpRequest da propria pagina, com os cabecalhos que o proprio site usa (csrf etc.), lidos
// quando ele chama a API. Nada disso sai da pagina. Se a Shopee recusar, para.

(() => {
  const HEADERS_DO_SITE = ['x-csrftoken', 'device-id', 'app', 'version'];
  const ROTA_EXPORT = '/api/admin/tracking/am_hub/return/export';
  const ROTA_TAREFAS = '/spxdata/api/export_platform/export_task/list_for_portal';
  const ROTA_LINK = '/spxdata/api/export_platform/export_task/get_signed_download_url';
  const EXPORT_PRONTO = 2;
  const ESPERA_MS = 3000;
  const MAX_ESPERAS = 60; // ~3 min

  // O "olho" do telefone (o mesmo da tela de detalhe e do consultador de telefone). Cada chamada
  // gasta 1 visualizacao da conta no SPX: so e chamado para o pedido que vai receber o ativo.
  const ROTA_OLHO = '/api/fleet_order/order/detail/show_sensitive_data';
  const PEDIDO_DE_OUTRA_ESTACAO = 200301007;

  const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Telefone do destinatario pelo olho. get(url) devolve a resposta inteira (com retcode). */
  async function buscarTelefone(get, codigo) {
    const r = await get(`${ROTA_OLHO}?shipment_id=${encodeURIComponent(codigo)}&data_field=buyer_contact`);
    if (r.retcode === PEDIDO_DE_OUTRA_ESTACAO) return { outraEstacao: true, telefone: '' };
    if (r.retcode !== 0) throw new Error(`A Shopee recusou o telefone (retcode ${r.retcode}): ${r.message || 'sem mensagem'}`);
    return { outraEstacao: false, telefone: String((r.data && r.data.data_detail) || '') };
  }

  /**
   * Export de pedidos dos BR pedidos. chamar(metodo, rota, corpo) devolve o "data" da resposta.
   * Devolve o link assinado do CSV.
   */
  async function exportarPedidos(chamar, codigos, aviso = () => {}, dormir = dormirPadrao, agora = () => Date.now()) {
    const criada = await chamar('POST', ROTA_EXPORT, { search_id_list: codigos, searched_tag: 1 });
    const id = criada && criada.task_id;
    if (!id) throw new Error('O SPX não criou o export de pedidos.');
    const desde = Math.floor(agora() / 1000) - 3600;
    for (let vez = 1; vez <= MAX_ESPERAS; vez += 1) {
      await dormir(ESPERA_MS);
      const data = await chamar('GET', `${ROTA_TAREFAS}?start_time=${desde}&task_ids=${id}`);
      const tarefa = ((data && data.task_list) || []).find((t) => String(t.task_id) === String(id));
      if (tarefa && tarefa.failed_reason) throw new Error(`O export do SPX falhou: ${tarefa.failed_reason}`);
      if (tarefa && Number(tarefa.export_status) === EXPORT_PRONTO) {
        const link = await chamar('GET', `${ROTA_LINK}?source=fms&task_id=${id}`);
        if (!link || !link.download_url) throw new Error('O SPX não deu o link do export.');
        return link.download_url;
      }
      aviso(vez * (ESPERA_MS / 1000));
    }
    throw new Error('O export de pedidos do SPX demorou demais. Tente de novo.');
  }

  if (typeof module !== 'undefined') {
    module.exports = { exportarPedidos, buscarTelefone, HEADERS_DO_SITE };
    return;
  }

  const headers = {};
  const original = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    const n = String(nome).toLowerCase();
    if (HEADERS_DO_SITE.includes(n)) headers[n] = valor;
    return original.apply(this, arguments);
  };

  const chamar = (metodo, rota, corpo) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(metodo, rota);
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    if (corpo !== undefined) xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    Object.entries(headers).forEach(([n, v]) => xhr.setRequestHeader(n, v));
    xhr.onload = () => {
      let j = null;
      try { j = JSON.parse(xhr.responseText); } catch { /* tratado abaixo */ }
      if (xhr.status !== 200 || !j) return reject(new Error(`A Shopee recusou (HTTP ${xhr.status}). Dê F5 no SPX e tente de novo.`));
      if (j.retcode !== 0) return reject(new Error(`A Shopee recusou (retcode ${j.retcode}): ${j.message || 'sem mensagem'}`));
      resolve(j.data);
    };
    xhr.onerror = () => reject(new Error('A Shopee não respondeu.'));
    xhr.send(corpo === undefined ? null : JSON.stringify(corpo));
  });

  // GET que devolve a resposta inteira (o olho responde retcode proprio para outra estacao).
  const getBruto = (url) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    Object.entries(headers).forEach(([n, v]) => xhr.setRequestHeader(n, v));
    xhr.onload = () => {
      let j = null;
      try { j = JSON.parse(xhr.responseText); } catch { /* tratado abaixo */ }
      if (xhr.status !== 200 || !j) return reject(new Error(`A Shopee recusou (HTTP ${xhr.status}). Dê F5 no SPX e tente de novo.`));
      resolve(j);
    };
    xhr.onerror = () => reject(new Error('A Shopee não respondeu.'));
    xhr.send();
  });

  const responder = (dados) => window.postMessage({ xmAtivos: 'resposta', ...dados }, window.location.origin);

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.xmAtivos !== 'telefone') return;
    const { id } = e.data;
    if (!headers['x-csrftoken']) {
      responder({ id, fim: true, erro: 'O SPX ainda não fez nenhuma busca nesta aba. Dê F5 no SPX e tente de novo.' });
      return;
    }
    try {
      responder({ id, fim: true, ...(await buscarTelefone(getBruto, String(e.data.codigo || ''))) });
    } catch (err) {
      responder({ id, fim: true, erro: err.message });
    }
  });

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.xmAtivos !== 'exportar') return;
    const { id } = e.data;
    const codigos = Array.isArray(e.data.codigos) ? e.data.codigos : [];
    if (!headers['x-csrftoken']) {
      responder({ id, fim: true, erro: 'O SPX ainda não fez nenhuma busca nesta aba. Dê F5 no SPX e tente de novo.' });
      return;
    }
    try {
      const url = await exportarPedidos(chamar, codigos, (s) => responder({ id, andamento: `Esperando o export de pedidos do SPX (${s} s)...` }));
      responder({ id, fim: true, url });
    } catch (err) {
      responder({ id, fim: true, erro: err.message });
    }
  });
})();
