// XM - Conferencias no DS da iMile, no mundo da pagina (ds.imile.com).
//
//   buscar  POST /saastms/v1/biz/waybillInfo/searchDispatchWaybill: a mesma busca da tela
//           "Pesquisar por destinatario" (dispatchWaybillQueryDs) com Horario de recebimento (Hub) =
//           hoje, todas as paginas. Da cada pacote sai so: waybill, entregador (courier = Delivery
//           Associate), cidade (consigneeCity), station de entrega (dispatchStation), recebimento,
//           chegada no DS e Last Scan Status. Nada de nome, telefone, endereco ou documento.
//
// Front-Sec e a assinatura de seguranca do DS: nao copiar nem gerar. O pedido sai pelo
// XMLHttpRequest da propria pagina, com os cabecalhos que o proprio site usa (lidos quando ele
// chama a API). Nada disso sai da pagina. Se a iMile recusar, para.
// Canal de mensagens proprio ("xmConfImile"), para nao esbarrar no da XM - Ativos ("xmAtivosImile").

(() => {
  const CANAL = 'xmConfImile';
  const ROTA = '/saastms/v1/biz/waybillInfo/searchDispatchWaybill';
  const POR_PAGINA = 100;
  const POR_PAGINA_RESERVA = 20; // o da propria tela, se a iMile recusar 100
  const MAX_PAGINAS = 400;
  const PAUSA_MS = 300;
  const HEADERS_DO_SITE = ['authorization', 'lang', 'timezone', 'resource-code', 'sys-name',
    'x-page-path', 'path', 'hubcode', 'sys-portal'];

  const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Hoje no horario do Brasil (o DS mostra BRA -3), AAAA-MM-DD. */
  const hoje = (agora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);

  /** O corpo que a propria tela manda, com o recebimento no hub no dia. */
  function corpoDaBusca(dia, pagina, porPagina) {
    return {
      currentPage: pagina, showCount: porPagina,
      waybillNos: [], referenceNos: [], labelOrderCodes: [], mainWaybillNos: [],
      dateSearchType: 'receive', startTime: `${dia} 00:00:00`, endTime: `${dia} 23:59:59`,
      actualReceiveStation: '', dispatchStatus: '', stationCode: '', lastScanStatus: [],
      stageStatus: '', stageDetailStatus: '', handleType: '',
      returnProvince: '', returnCity: '', returnArea: '', clientCodes: [],
    };
  }

  const txt = (v) => (v == null ? '' : String(v));

  /** Um resultado da iMile -> so o que a conferencia usa. */
  function paraPacote(r) {
    return {
      waybill: txt(r.waybillNo),
      entregador: txt(r.courier || r.courierCode),
      cidade: txt(r.consigneeCity),
      ponto: txt(r.dispatchStation || r.dispatchStationCode),
      entrada: txt(r.receiveTime),
      chegada: txt(r.arrivalTime || r.dsUnloadingTime),
      status: txt(r.lastScanStatus),
    };
  }

  const recusou = (r) => !r || r.status !== 'success' || !r.resultObject;

  /** Todas as paginas do dia. post(rota, corpo) devolve a resposta inteira. */
  async function buscarDoDia(post, dia, aviso = () => {}, dormir = dormirPadrao) {
    let porPagina = POR_PAGINA;
    let r = await post(ROTA, corpoDaBusca(dia, 1, porPagina));
    if (recusou(r)) {
      porPagina = POR_PAGINA_RESERVA;
      r = await post(ROTA, corpoDaBusca(dia, 1, porPagina));
    }
    if (recusou(r)) throw new Error(`A iMile recusou a busca: ${(r && r.message) || 'sem mensagem'}`);
    const pag = r.resultObject.pagination || {};
    const total = Number(pag.totalResult) || 0;
    const paginas = Math.min(MAX_PAGINAS, Math.max(1, Number(pag.totalPage) || Math.ceil(total / porPagina)));
    const pacotes = (r.resultObject.results || []).map(paraPacote);
    aviso(`Lendo o DS: página 1 de ${paginas}...`);
    for (let p = 2; p <= paginas; p += 1) {
      await dormir(PAUSA_MS);
      const rp = await post(ROTA, corpoDaBusca(dia, p, porPagina));
      if (recusou(rp)) throw new Error(`A iMile recusou a página ${p}: ${(rp && rp.message) || 'sem mensagem'}`);
      pacotes.push(...(rp.resultObject.results || []).map(paraPacote));
      aviso(`Lendo o DS: página ${p} de ${paginas}...`);
    }
    return { pacotes: pacotes.filter((x) => x.waybill), total };
  }

  function lerResposta(status, texto) {
    let j = null;
    try { j = JSON.parse(texto); } catch { /* tratado abaixo */ }
    if (status !== 200 || !j) throw new Error(`A iMile recusou (HTTP ${status}). Dê F5 no DS e tente de novo.`);
    return j;
  }

  if (typeof module !== 'undefined') {
    module.exports = { CANAL, ROTA, HEADERS_DO_SITE, POR_PAGINA, hoje, corpoDaBusca, paraPacote, buscarDoDia, lerResposta };
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
      try { resolve(lerResposta(xhr.status, xhr.responseText)); } catch (e) { reject(e); }
    };
    xhr.onerror = () => reject(new Error('A iMile não respondeu.'));
    xhr.send(JSON.stringify(corpo));
  });

  const responder = (dados) => window.postMessage({ [CANAL]: 'resposta', ...dados }, window.location.origin);
  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== 'buscar') return;
    const { id } = e.data;
    if (!headers.authorization) {
      responder({ id, fim: true, erro: 'O DS da iMile ainda não fez nenhuma consulta nesta aba. Dê F5 e tente de novo.' });
      return;
    }
    try {
      const r = await buscarDoDia(post, hoje(), (andamento) => responder({ id, andamento }));
      responder({ id, fim: true, ...r });
    } catch (err) {
      responder({ id, fim: true, erro: err.message });
    }
  });
})();
