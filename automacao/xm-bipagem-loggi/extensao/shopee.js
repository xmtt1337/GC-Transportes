// Conferencia da Shopee, no mundo da pagina (spx.shopee.com.br).
//
// "Conferir agora" faz no SPX as mesmas buscas da tela:
//   1. pesquisa em lote do Order Tracking (/api/fleet_order/order/tracking_list/search) dos BR
//      do romaneio de hoje que ainda podem mudar (o sistema manda); 500 por vez, 2 ao mesmo tempo;
//   2. lista de ATs criadas hoje (/spx_delivery/admin/assignment/assignment_task/search/v2,
//      ctime = comeco e fim do dia em segundos), pagina por pagina.
// Devolve so o que a conferencia usa: horarios, motorista, status e estacao de cada BR; e de
// cada AT os BR dela, cidade, bairro, cluster, motorista e criacao. Nome, telefone e endereco
// do destinatario nao saem desta pagina.
//
// x-sap-ri e x-sap-sec sao a protecao anti-robo do SPX: nao copiar nem gerar. O pedido sai pelo
// XMLHttpRequest da propria pagina, com os cabecalhos que o proprio site usa (csrf etc.), lidos
// quando ele chama a API. Nada disso sai da pagina. Se a Shopee recusar, para.

(() => {
  const ROTA_RASTREIO = '/api/fleet_order/order/tracking_list/search';
  const ROTA_ATS = '/spx_delivery/admin/assignment/assignment_task/search/v2';
  const LOTE_RASTREIO = 500;
  const LOTE_MINIMO = 50;
  const EM_PARALELO = 2;
  const POR_PAGINA_ATS = 50;
  const MAX_PAGINAS = 200;
  const PAUSA_MS = 200; // entre paginas de AT
  const HEADERS_DO_SITE = ['x-csrftoken', 'device-id', 'app', 'version'];

  /** Comeco e fim do dia (AAAA-MM-DD) de Sao Paulo, em segundos. */
  function faixaDoDia(dia) {
    const ini = Math.floor(Date.parse(`${dia}T00:00:00-03:00`) / 1000);
    return `${ini},${ini + 86399}`;
  }
  const hojeSP = (agora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

  function enxugarRastreio(r) {
    return {
      codigo: r.shipment_id || r.sls_tracking_number || '',
      recebido_em: r.current_station_received_time || 0,
      saiu_em: r.delivering_time || 0,
      entregue_em: r.delivered_time || 0,
      motorista: r.driver_name || '',
      status: r.order_status,
      estacao: r.current_station_name || '',
    };
  }

  function enxugarAt(a) {
    return {
      at: a.assignment_task_id || '',
      codigos: String(a.shipment_id || '').split(',').map((c) => c.trim()).filter(Boolean),
      motorista: a.driver_name || '',
      cidade: a.city || '',
      bairro: a.neighborhood || '',
      cluster: a.cluster || '',
      criada_em: a.ctime || 0,
    };
  }

  const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Pesquisa em lote, 50 BR por vez. post(rota, corpo) devolve o "data" da resposta. */
  // 500 BR por chamada, 2 chamadas ao mesmo tempo. Se o SPX recusar um lote grande, divide ao
  // meio e tenta de novo (ate LOTE_MINIMO); abaixo disso o erro e de verdade e para.
  async function rastrear(post, codigos, aviso = () => {}) {
    const saida = [];
    let feitos = 0;
    const umLote = async (lote) => {
      try {
        const data = await post(ROTA_RASTREIO, { count: lote.length, page_no: 1, search_id_list: lote });
        saida.push(...((data && data.list) || []).map(enxugarRastreio));
        feitos += lote.length;
        aviso(feitos, codigos.length);
      } catch (e) {
        if (lote.length <= LOTE_MINIMO) throw e;
        const meio = Math.ceil(lote.length / 2);
        await umLote(lote.slice(0, meio));
        await umLote(lote.slice(meio));
      }
    };
    const lotes = [];
    for (let i = 0; i < codigos.length; i += LOTE_RASTREIO) lotes.push(codigos.slice(i, i + LOTE_RASTREIO));
    let proximo = 0;
    const trabalhador = async () => { while (proximo < lotes.length) await umLote(lotes[proximo++]); };
    await Promise.all(Array.from({ length: Math.min(EM_PARALELO, lotes.length) }, trabalhador));
    return saida;
  }

  /** Todas as ATs criadas no dia, pagina por pagina. */
  async function listarAts(post, dia, aviso = () => {}, dormir = dormirPadrao) {
    const saida = [];
    let total = null;
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const data = await post(ROTA_ATS, { ctime: faixaDoDia(dia), pageno: pagina, count: POR_PAGINA_ATS, search_type: 0 });
      const lista = (data && data.list) || [];
      if (total == null) total = Number(data && data.total) || 0;
      saida.push(...lista.map(enxugarAt));
      aviso(saida.length, total);
      if (!lista.length || saida.length >= total) break;
      await dormir(PAUSA_MS);
    }
    return saida;
  }

  if (typeof module !== 'undefined') {
    module.exports = { faixaDoDia, enxugarRastreio, enxugarAt, rastrear, listarAts, hojeSP, HEADERS_DO_SITE };
    return;
  }

  const headers = {};
  const original = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    const n = String(nome).toLowerCase();
    if (HEADERS_DO_SITE.includes(n)) headers[n] = valor;
    return original.apply(this, arguments);
  };

  const post = (rota, corpo) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', rota);
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    Object.entries(headers).forEach(([n, v]) => xhr.setRequestHeader(n, v));
    xhr.onload = () => {
      let j = null;
      try { j = JSON.parse(xhr.responseText); } catch { /* tratado abaixo */ }
      if (xhr.status !== 200 || !j) return reject(new Error(`A Shopee recusou (HTTP ${xhr.status}). Dê F5 no SPX e tente de novo.`));
      if (j.retcode !== 0) return reject(new Error(`A Shopee recusou (retcode ${j.retcode}): ${j.message || 'sem mensagem'}`));
      resolve(j.data);
    };
    xhr.onerror = () => reject(new Error('A Shopee não respondeu.'));
    xhr.send(JSON.stringify(corpo));
  });

  const responder = (dados) => window.postMessage({ xmOperacao: 'shopeeResposta', ...dados }, window.location.origin);

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data.xmOperacao !== 'shopeeBuscar') return;
    const { id } = e.data;
    const codigos = Array.isArray(e.data.codigos) ? e.data.codigos : [];
    if (!headers['x-csrftoken']) {
      responder({ id, fim: true, erro: 'O SPX ainda não fez nenhuma busca nesta aba. Dê F5 no SPX e clique em Conferir agora de novo.' });
      return;
    }
    try {
      const rastreio = codigos.length ? await rastrear(post, codigos, (n, t) => responder({ id, andamento: `Pesquisando no SPX os BR que faltam: ${n} de ${t}...` })) : [];
      const ats = await listarAts(post, hojeSP(), (n, t) => responder({ id, andamento: `Lendo as ATs de hoje: ${n} de ${t}...` }));
      responder({ id, fim: true, rastreio, ats });
    } catch (err) {
      responder({ id, fim: true, erro: err.message });
    }
  });
})();
