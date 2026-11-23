// XM - Conferencias na Anjun, no mundo da pagina (newsupplier.anjunexpress.com). Mesma busca da
// XM - Operacao (de onde veio), com canal proprio ("xmConfAnjun").
//
// "Conferir agora" faz a MESMA busca da tela Consulta de pacotes com "Tempo de entrada no
// ponto" = hoje (/admin/package/pageQuery, searchTimeType 1, storageStartTime/EndTime), pagina
// por pagina, e devolve so o que a conferencia usa: waybill, entregador, cidade, ponto, entrada
// no ponto, cliente, valor declarado e status. Nome, telefone e endereco do destinatario nao
// saem desta pagina.
//
// O token e o que o proprio site usa, lido quando ele chama a API (setRequestHeader). Fica so
// nesta pagina: nao vai para o storage, para o fundo.js nem para o sistema.

(() => {
  const ROTA = '/admin/package/pageQuery';
  const POR_PAGINA = 200;
  const MAX_PAGINAS = 150;
  const PAUSA_MS = 250;

  const dois = (n) => String(n).padStart(2, '0');
  /** AAAA-MM-DD de hoje em Sao Paulo (o portal filtra pela hora local da base). */
  function hojeSP(agora = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
  }

  /** Corpo do pageQuery igual ao da tela, com o filtro de entrada no ponto do dia. */
  function corpoDaBusca(dia, pagina, porPagina = POR_PAGINA) {
    return {
      pageNumber: pagina,
      pageSize: porPagina,
      params: {
        type: 0, searchTimeType: 1, number: '', packageStatus: null, consigneeId: null, delivererId: null,
        siteIdList: [], receiveStateList: [], reason: '', problemType: '', problemTypeSub: '', claimsState: '',
        processingResult: '', businessModel: '', customerIds: null, merchantIds: null, receiveName: '',
        receiveZipcode: '', invoiceAccessKey: '', orderType: 0, waybillNumberList: [],
        storageStartTime: `${dia} 00:00:00`, storageEndTime: `${dia} 23:59:59`,
      },
    };
  }

  /** Um registro do portal → so os campos da conferencia (nada do destinatario). */
  function enxugar(r) {
    return {
      waybill: r.waybillNumber || r.packageNumber || '',
      entregador: r.delivererName || '',
      cidade: r.receiveCity || '',
      ponto: r.siteName || '',
      entrada: r.storageTime || '',
      cliente: r.customerName || '',
      valor: r.declaredValue == null ? null : r.declaredValue,
      status: r.packageStatusName || '',
    };
  }

  /**
   * Todas as paginas do dia. post(corpo) devolve o "data" da resposta ({records, total}).
   * aviso(n, total) mostra o andamento.
   */
  async function buscarDia(post, dia, aviso = () => {}, dormir = (ms) => new Promise((r) => setTimeout(r, ms))) {
    const pacotes = [];
    let total = null;
    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina += 1) {
      const data = await post(corpoDaBusca(dia, pagina));
      const lista = (data && Array.isArray(data.records)) ? data.records : [];
      if (total == null) total = Number(data && data.total) || 0;
      pacotes.push(...lista.map(enxugar));
      aviso(pacotes.length, total);
      if (!lista.length || pacotes.length >= total) break;
      await dormir(PAUSA_MS);
    }
    return { pacotes, total: total || 0 };
  }

  if (typeof module !== 'undefined') {
    module.exports = { corpoDaBusca, enxugar, buscarDia, hojeSP, dois, CANAL: 'xmConfAnjun' };
    return;
  }

  const headers = {};
  const original = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (nome, valor) {
    const n = String(nome).toLowerCase();
    if (n === 'token' || n === 'accept-language') headers[n] = valor;
    return original.apply(this, arguments);
  };

  async function post(corpo) {
    const r = await window.fetch(ROTA, {
      method: 'POST',
      headers: { ...headers, accept: 'application/json, text/plain, */*', 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.code !== 200) {
      throw new Error(`A Anjun recusou a busca (${(j && j.msg) || `HTTP ${r.status}`}). Dê F5 no portal e tente de novo.`);
    }
    return j.data;
  }

  const CANAL = 'xmConfAnjun';
  const responder = (dados) => window.postMessage({ [CANAL]: 'resposta', ...dados }, window.location.origin);

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== 'buscar') return;
    const id = e.data.id;
    if (!headers.token) {
      responder({ id, fim: true, erro: 'O portal ainda não fez nenhuma busca nesta aba. Dê F5 no portal e clique em Conferir agora de novo.' });
      return;
    }
    try {
      const r = await buscarDia(post, hojeSP(), (n, total) => responder({ id, andamento: `Lendo os pacotes de hoje: ${n} de ${total}...` }));
      responder({ id, fim: true, pacotes: r.pacotes, total: r.total });
    } catch (err) {
      responder({ id, fim: true, erro: err.message });
    }
  });
})();
