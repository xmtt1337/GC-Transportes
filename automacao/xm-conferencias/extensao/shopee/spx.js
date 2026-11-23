// XM - Conferencia Shopee, no mundo da pagina (spx.shopee.com.br).
//
// So leitura, para o Vapt Vupt:
//   - a viagem do dia: painel AMH-LM, Viagens de Carga Direta e o anexo da viagem (o romaneio, xlsx);
//   - a pesquisa em lote do Order Tracking (tracking_list/search) dos BR da viagem;
//   - as ATs criadas hoje (assignment_task/search/v2);
//   - o export de pedidos (o mesmo do botao Export do Order Tracking): comprador e CEP.
// O "olho" do telefone NAO esta aqui (fica so na XM - Ativos Shopee).
//
// x-sap-ri e x-sap-sec sao a protecao anti-robo do SPX: nao copiar nem gerar. O pedido sai pelo
// XMLHttpRequest da propria pagina, com os cabecalhos que o proprio site usa (csrf etc.), lidos
// quando ele chama a API. Nada disso sai da pagina. Se a Shopee recusar, para.
// Canal de mensagens proprio ("xmConf"): a XM - Ativos Shopee usa outro ("xmAtivos").

(() => {
  const CANAL = 'xmConf';
  const HEADERS_DO_SITE = ['x-csrftoken', 'device-id', 'app', 'version'];

  // ── export de pedidos ───────────────────────────────────────────────────────
  const ROTA_EXPORT = '/api/admin/tracking/am_hub/return/export';
  const ROTA_TAREFAS = '/spxdata/api/export_platform/export_task/list_for_portal';
  const ROTA_LINK = '/spxdata/api/export_platform/export_task/get_signed_download_url';
  const EXPORT_PRONTO = 2;
  const ESPERA_MS = 3000;
  const MAX_ESPERAS = 60; // ~3 min

  // ── pesquisa em lote e ATs ──────────────────────────────────────────────────
  //   pesquisa em lote do Order Tracking: 500 BR por vez, 2 ao mesmo tempo;
  //   ATs criadas hoje (ctime = comeco e fim do dia), pagina por pagina.
  const ROTA_RASTREIO = '/api/fleet_order/order/tracking_list/search';
  const ROTA_ATS = '/spx_delivery/admin/assignment/assignment_task/search/v2';
  const LOTE_RASTREIO = 500;
  const LOTE_MINIMO = 50;
  const EM_PARALELO = 2;
  const POR_PAGINA_ATS = 50;
  const MAX_PAGINAS = 200;
  const PAUSA_ATS_MS = 200;

  // ── a viagem do dia ─────────────────────────────────────────────────────────
  const ROTA_PAINEL_LH = '/mgmt/api/pc/dashboard/lm/linehaul_trips';
  const ROTA_ANEXO = '/api/admin/transportation/agency/email/attachments/get';
  const ROTAS_DA_VIAGEM = [
    ROTA_PAINEL_LH,
    '/api/admin/transportation/trip/list_v2',
    '/api/admin/transportation/trip/history/list',
    ROTA_ANEXO,
  ];

  const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

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

  /** Pesquisa em lote. post(rota, corpo) devolve o "data"; lote recusado divide ao meio (ate 50). */
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
      await dormir(PAUSA_ATS_MS);
    }
    return saida;
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

  /** Só as rotas da viagem passam (GET; o painel tenta POST se o GET der 404). */
  const rotaDaViagem = (url) => ROTAS_DA_VIAGEM.includes(String(url || '').split('?')[0]);

  if (typeof module !== 'undefined') {
    module.exports = { exportarPedidos, rastrear, listarAts, faixaDoDia, enxugarRastreio, enxugarAt, rotaDaViagem, CANAL, HEADERS_DO_SITE };
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

  /** GET que devolve a resposta inteira. */
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

  /** O anexo da viagem em bytes (xlsx). */
  const getBinario = (url) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    Object.entries(headers).forEach(([n, v]) => xhr.setRequestHeader(n, v));
    xhr.onload = () => {
      if (xhr.status !== 200) return reject(new Error(`A Shopee recusou o anexo da viagem (HTTP ${xhr.status}).`));
      const bytes = xhr.response;
      const u8 = new Uint8Array(bytes || new ArrayBuffer(0));
      if (u8[0] === 0x50 && u8[1] === 0x4b) return resolve(bytes); // "PK": é o xlsx
      // Não veio arquivo: o SPX respondeu JSON (erro ou viagem sem anexo).
      let j = null;
      try { j = JSON.parse(new TextDecoder().decode(u8)); } catch { /* tratado abaixo */ }
      reject(new Error(j ? `O SPX não deu o anexo da viagem (retcode ${j.retcode}): ${j.message || 'sem mensagem'}` : 'O anexo da viagem não veio como planilha.'));
    };
    xhr.onerror = () => reject(new Error('A Shopee não respondeu.'));
    xhr.send();
  });

  const responder = (dados) => window.postMessage({ [CANAL]: 'resposta', ...dados }, window.location.origin);
  const post = (rota, corpo) => chamar('POST', rota, corpo);
  const semSessao = (id) => {
    if (headers['x-csrftoken']) return false;
    responder({ id, fim: true, erro: 'O SPX ainda não fez nenhuma busca nesta aba. Dê F5 no SPX e tente de novo.' });
    return true;
  };
  const ouvir = (tipo, f) => window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== tipo) return;
    const { id } = e.data;
    if (semSessao(id)) return;
    try {
      await f(e.data, id);
    } catch (err) {
      responder({ id, fim: true, erro: err.message });
    }
  });

  // A viagem do dia (o anexo volta em bytes; quem lê é o conferencia.js).
  ouvir('lerViagem', async (d, id) => {
    const url = String(d.url || '');
    if (!rotaDaViagem(url)) throw new Error('Rota do SPX não permitida.');
    const rota = url.split('?')[0];
    if (rota === ROTA_ANEXO) { responder({ id, fim: true, bytes: await getBinario(url) }); return; }
    let j;
    try {
      j = await getBruto(url);
    } catch (e) {
      // O painel AMH-LM respondeu 404 ao GET (20/11/2026). O print da Rede não tinha aba Payload,
      // o que também acontece num POST sem corpo: tenta uma vez como POST.
      if (rota !== ROTA_PAINEL_LH || !/HTTP 404/.test(e.message)) throw e;
      j = { retcode: 0, data: await chamar('POST', url, {}) };
    }
    if (j.retcode != null && Number(j.retcode) !== 0) throw new Error(`A Shopee recusou (retcode ${j.retcode}): ${j.message || 'sem mensagem'}`);
    responder({ id, fim: true, json: j });
  });

  // Rastreio dos BR pedidos + ATs de hoje.
  ouvir('buscar', async (d, id) => {
    const codigos = Array.isArray(d.codigos) ? d.codigos : [];
    const rastreio = codigos.length ? await rastrear(post, codigos, (n, t) => responder({ id, andamento: `Pesquisando no SPX: ${n} de ${t}...`, etapa: 'pesquisa', n, t })) : [];
    const ats = await listarAts(post, hojeSP(), (n, t) => responder({ id, andamento: `Lendo as ATs de hoje: ${n} de ${t}...`, etapa: 'ats', n, t }));
    responder({ id, fim: true, rastreio, ats });
  });

  // Export de pedidos da viagem (daqui só sai o link; quem baixa e lê é o fundo.js).
  ouvir('exportar', async (d, id) => {
    const codigos = Array.isArray(d.codigos) ? d.codigos : [];
    const url = await exportarPedidos(chamar, codigos, (s) => responder({ id, andamento: `Esperando o export de pedidos do SPX (${s} s)...`, etapa: 'export', s }));
    responder({ id, fim: true, url });
  });
})();
