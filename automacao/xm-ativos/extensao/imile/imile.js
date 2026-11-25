// XM - Ativos iMile, no mundo da pagina (ds.imile.com). As mesmas chamadas da XM - Consultas de
// telefone:
//   buscar   POST /saastms/v1/biz/waybillInfo/searchDispatchWaybill {waybillNos:[ate 50]}: a lista do
//            "Pesquisar por despacho" do DS (a mesma da XM - Conferencias), 50 waybills por chamada
//            (desde 25/11/2026: 1 chamada por waybill fazia a iMile responder "system is busy").
//            O que a lista nao trouxer vai pela busca normal, 1 por vez:
//            POST /saastms/v1/biz/track/query {searchType:'waybillNo', searchValue} (nao gasta cota).
//   revelar  POST /saastms/v1/biz/track/getDesensitizationInfoV1 {waybillNo, keyName:'consigneeContact',
//            model:'TRACK'}: o "olho" — abre nome, telefone e produto juntos e gasta 1 da cota de
//            revelacoes da conta (~700). A resposta traz a cota: para antes de ela acabar.
//
// Front-Sec e a assinatura de seguranca do DS: nao copiar nem gerar. O pedido sai pelo
// XMLHttpRequest da propria pagina, com os cabecalhos que o proprio site usa (lidos quando ele
// chama a API). Nada disso sai da pagina. Se a iMile recusar, para.
// Canal de mensagens proprio ("xmAtivosImile").

(() => {
  const CANAL = 'xmAtivosImile';
  const ROTA_BUSCA = '/saastms/v1/biz/track/query';
  const ROTA_LOTE = '/saastms/v1/biz/waybillInfo/searchDispatchWaybill';
  const LOTE = 50;
  const DIAS_DO_LOTE = 90; // se a iMile exigir periodo: recebidos nos ultimos 90 dias
  const ROTA_OLHO = '/saastms/v1/biz/track/getDesensitizationInfoV1';
  const RESERVA_DA_COTA = 30; // revelacoes que ficam para o uso normal da tela
  // Em 25/11/2026, 63 waybills a 1 a cada 250 ms: a partir do 9o a iMile respondeu "The system is
  // busy, please try again later" para todos. Agora 1 a cada 600 ms; se ela pedir calma, espera e
  // tenta o mesmo de novo (e segue mais devagar). Se continuar recusando, para: o resto fica "nao
  // buscado" (nunca "nao achado") para buscar de novo depois.
  const PAUSA_BUSCA_MS = 600;
  const PAUSA_DEVAGAR_MS = 1500;
  const ESPERAS_OCUPADO_MS = [3000, 8000, 15000, 30000];
  const OCUPADO = /busy|try again|frequent|too many|频繁|稍后/i;
  const MOTIVO_OCUPADO = 'a iMile pediu para ir mais devagar';
  const ocupado = (r) => !!r && r.status !== 'success' && OCUPADO.test(String(r.message || ''));
  const HEADERS_DO_SITE = ['authorization', 'lang', 'timezone', 'resource-code', 'sys-name',
    'x-page-path', 'path', 'hubcode', 'sys-portal'];

  const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

  const diaSp = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  /** Corpo da lista do despacho filtrada pelos waybills; com dias, por recebimento nesse periodo. */
  function corpoDoLote(codigos, dias = 0, agora = Date.now()) {
    return {
      currentPage: 1, showCount: Math.max(codigos.length, 20),
      waybillNos: codigos, referenceNos: [], labelOrderCodes: [], mainWaybillNos: [],
      dateSearchType: 'receive',
      startTime: dias ? `${diaSp(agora - dias * 86400000)} 00:00:00` : '',
      endTime: dias ? `${diaSp(agora)} 23:59:59` : '',
      actualReceiveStation: '', dispatchStatus: '', stationCode: '', lastScanStatus: [],
      stageStatus: '', stageDetailStatus: '', handleType: '',
      returnProvince: '', returnCity: '', returnArea: '', clientCodes: [],
    };
  }

  // Remetente que a lista traz mascarado ("***") nao serve: fica vazio (a mensagem da iMile nao usa).
  const semMascara = (v) => { const t = String(v || '').trim(); return t.includes('*') ? '' : t; };

  /** Pede de novo enquanto a iMile pedir calma (3/8/15/30 s). */
  async function comCalma(chamar, dormir, aviso) {
    let r = await chamar();
    for (let t = 0; ocupado(r) && t < ESPERAS_OCUPADO_MS.length; t += 1) {
      aviso(ESPERAS_OCUPADO_MS[t]);
      await dormir(ESPERAS_OCUPADO_MS[t]);
      r = await chamar();
    }
    return r;
  }

  /**
   * Os waybills pela lista do despacho, 50 por chamada. Devolve Map waybill -> { remetente } so com
   * os que vieram; qualquer recusa so deixa o lote para a busca 1 por vez.
   */
  async function buscarEmLote(post, codigos, aviso = () => {}, dormir = dormirPadrao) {
    const achados = new Map();
    let dias = 0;
    for (let i = 0; i < codigos.length; i += LOTE) {
      const parte = codigos.slice(i, i + LOTE);
      aviso(i, codigos.length, `Buscando na iMile: ${Math.min(i + LOTE, codigos.length)} de ${codigos.length}...`);
      try {
        const pedir = () => comCalma(() => post(ROTA_LOTE, corpoDoLote(parte, dias)), dormir,
          (ms) => aviso(i, codigos.length, `A iMile pediu para ir mais devagar: esperando ${Math.round(ms / 1000)} s...`));
        let r = await pedir();
        if (!dias && r && r.status !== 'success' && !ocupado(r)) { dias = DIAS_DO_LOTE; r = await pedir(); }
        const lista = r && r.status === 'success' && r.resultObject && Array.isArray(r.resultObject.results) ? r.resultObject.results : [];
        for (const x of lista) {
          const cod = String(x.waybillNo || '');
          if (parte.includes(cod) && !achados.has(cod)) achados.set(cod, { remetente: semMascara(x.consignorContact || x.consignor) });
        }
      } catch { /* fica para a busca 1 por vez */ }
      if (i + LOTE < codigos.length) await dormir(PAUSA_BUSCA_MS);
    }
    return achados;
  }

  /** Primeiro em lotes; o que faltar, 1 por vez. aviso(n, total, texto?) mostra o andamento. */
  async function buscarPedidos(post, codigos, aviso = () => {}, dormir = dormirPadrao) {
    const lote = await buscarEmLote(post, codigos, aviso, dormir);
    const faltam = codigos.filter((c) => !lote.has(c));
    const avulsos = new Map();
    if (faltam.length) {
      const um = await buscarUmAUm(post, faltam, (n, t, texto) => aviso(n, t, texto || `Buscando 1 por vez os que a lista não trouxe: ${n} de ${t}...`), dormir);
      for (const p of um) avulsos.set(p.codigo, p);
    }
    return codigos.map((c) => (lote.has(c) ? { codigo: c, achado: true, ...lote.get(c) } : avulsos.get(c)));
  }

  /**
   * Busca normal de cada waybill (sem cota). post(rota, corpo) devolve a resposta inteira.
   * aviso(n, total, texto?) mostra o andamento.
   */
  async function buscarUmAUm(post, codigos, aviso = () => {}, dormir = dormirPadrao) {
    const saida = [];
    let pausa = PAUSA_BUSCA_MS;
    for (let i = 0; i < codigos.length; i += 1) {
      const codigo = codigos[i];
      let r = await post(ROTA_BUSCA, { searchType: 'waybillNo', searchValue: codigo });
      for (let t = 0; ocupado(r) && t < ESPERAS_OCUPADO_MS.length; t += 1) {
        const espera = ESPERAS_OCUPADO_MS[t];
        aviso(i, codigos.length, `A iMile pediu para ir mais devagar: esperando ${Math.round(espera / 1000)} s para continuar (${i} de ${codigos.length})...`);
        await dormir(espera);
        pausa = PAUSA_DEVAGAR_MS;
        r = await post(ROTA_BUSCA, { searchType: 'waybillNo', searchValue: codigo });
      }
      if (ocupado(r)) {
        for (const resto of codigos.slice(i)) saida.push({ codigo: resto, achado: false, naoBuscado: true, motivo: MOTIVO_OCUPADO });
        aviso(codigos.length, codigos.length);
        return saida;
      }
      if (r && r.status === 'success' && r.resultObject) {
        const remetente = r.resultObject.consignorinfo || {};
        saida.push({ codigo, achado: true, remetente: remetente.consignor || remetente.consignorContact || '' });
      } else {
        saida.push({ codigo, achado: false, motivo: (r && r.message) || '' });
      }
      aviso(i + 1, codigos.length);
      if (i < codigos.length - 1) await dormir(pausa);
    }
    return saida;
  }

  /** O olho de um waybill: nome, telefone e produto, e a cota que sobrou. */
  async function revelar(post, codigo, dormir = dormirPadrao) {
    const r = await comCalma(() => post(ROTA_OLHO, { waybillNo: codigo, keyName: 'consigneeContact', model: 'TRACK' }), dormir, () => {});
    if (!r || r.status !== 'success' || !r.resultObject) {
      const e = new Error(`A iMile recusou o olho: ${(r && r.message) || 'sem mensagem'}`);
      e.parar = true;
      throw e;
    }
    const info = r.resultObject.infoResult || {};
    const cota = r.resultObject.config || {};
    if (cota.limit) {
      const e = new Error('A cota de revelações da iMile acabou.');
      e.parar = true;
      throw e;
    }
    const restam = Number(cota.maxCount) - Number(cota.currentCount);
    return {
      nome: info.consigneeContact || info.consignee || '',
      telefone: info.consigneeMobile || info.consigneePhone || '',
      produto: info.sku || info.skuZh || '',
      cota: { usadas: Number(cota.currentCount) || 0, max: Number(cota.maxCount) || 0, restam: Number.isFinite(restam) ? restam : null },
      parar: Number.isFinite(restam) && restam <= RESERVA_DA_COTA
        ? `Parei para não esgotar a cota da iMile: usadas ${cota.currentCount} de ${cota.maxCount}, ficaram ${restam} para o uso na tela.` : '',
    };
  }

  function lerResposta(status, texto) {
    let j = null;
    try { j = JSON.parse(texto); } catch { /* tratado abaixo */ }
    if (status !== 200 || !j) throw new Error(`A iMile recusou (HTTP ${status}). Dê F5 no DS e tente de novo.`);
    return j;
  }

  if (typeof module !== 'undefined') {
    module.exports = { buscarPedidos, buscarEmLote, buscarUmAUm, corpoDoLote, ROTA_LOTE, LOTE, revelar, lerResposta, HEADERS_DO_SITE, RESERVA_DA_COTA, CANAL, ESPERAS_OCUPADO_MS, PAUSA_BUSCA_MS };
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
  const ouvir = (tipo, f) => window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== tipo) return;
    const { id } = e.data;
    if (!headers.authorization) {
      responder({ id, fim: true, erro: 'O DS da iMile ainda não fez nenhuma consulta nesta aba. Dê F5 e tente de novo.' });
      return;
    }
    try {
      await f(e.data, id);
    } catch (err) {
      responder({ id, fim: true, erro: err.message, parar: !!err.parar });
    }
  });

  ouvir('buscar', async (d, id) => {
    const codigos = Array.isArray(d.codigos) ? d.codigos : [];
    const pedidos = await buscarPedidos(post, codigos, (n, t, texto) => responder({ id, andamento: texto || `Buscando na iMile: ${n} de ${t}...`, n, t }));
    responder({ id, fim: true, pedidos });
  });

  ouvir('revelar', async (d, id) => {
    responder({ id, fim: true, ...(await revelar(post, String(d.codigo || ''))) });
  });
})();
