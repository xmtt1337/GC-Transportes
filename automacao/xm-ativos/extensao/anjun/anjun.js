// XM - Ativos na Anjun, no mundo da pagina (newsupplier.anjunexpress.com). As mesmas chamadas das
// telas do portal:
//   buscar   POST /admin/package/pageQuery: a busca da Consulta de pacotes pelos waybills (sem
//            dado sensivel): Cliente, Comerciante (a loja, que vira o Remetente) e status. Diz se
//            o pedido esta nesta conta.
//   revelar  POST /admin/package/packageInfoLimit {waybillNumber} traz nome e telefones
//            criptografados; POST /user/sensitive/viewPlaintext abre so esses (o "Visualizar
//            Informacoes Sensiveis" da tela). Igual a XM - Consultas de telefone.
//
// O token e o que o proprio site usa, lido quando ele chama a API (setRequestHeader). Fica so
// nesta pagina. O pedido sai pelo XMLHttpRequest da propria pagina. Se a Anjun recusar, para.
// Canal de mensagens proprio ("xmAtivosAnjun").

(() => {
  const CANAL = 'xmAtivosAnjun';
  const ROTA_BUSCA = '/admin/package/pageQuery';
  const ROTA_PACOTE = '/admin/package/packageInfoLimit';
  const ROTA_ABRIR = '/user/sensitive/viewPlaintext';
  const POR_BUSCA = 100;
  const PAUSA_BUSCA_MS = 400;
  const CAMPOS = ['receiveName', 'receiveMobile', 'receivePhone'];
  const HEADERS_DO_SITE = ['token', 'accept-language'];

  const dormirPadrao = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Corpo da Consulta de pacotes por waybill (o mesmo da tela, sem filtro de data). */
  function corpoDaBusca(codigos) {
    return {
      pageNumber: 1,
      pageSize: codigos.length,
      params: {
        type: 0, searchTimeType: 0, number: codigos.join('\n'), packageStatus: null, consigneeId: null, delivererId: null,
        siteIdList: [], receiveStateList: [], reason: '', problemType: '', problemTypeSub: '', claimsState: '',
        processingResult: '', businessModel: '', customerIds: null, merchantIds: null, receiveName: '',
        receiveZipcode: '', invoiceAccessKey: '', orderType: 0, waybillNumberList: codigos,
      },
    };
  }

  /** Busca os waybills em partes. post(rota, corpo) devolve o "data" da resposta. */
  async function buscarPedidos(post, codigos, aviso = () => {}, dormir = dormirPadrao) {
    const achados = new Map();
    for (let i = 0; i < codigos.length; i += POR_BUSCA) {
      const parte = codigos.slice(i, i + POR_BUSCA);
      const data = await post(ROTA_BUSCA, corpoDaBusca(parte));
      for (const r of (data && Array.isArray(data.records)) ? data.records : []) {
        const codigo = String(r.waybillNumber || '').toUpperCase();
        if (codigo && !achados.has(codigo)) {
          achados.set(codigo, { cliente: r.customerName || '', comerciante: r.merchantName || '', status: r.packageStatusName || '' });
        }
      }
      aviso(Math.min(i + POR_BUSCA, codigos.length), codigos.length);
      if (i + POR_BUSCA < codigos.length) await dormir(PAUSA_BUSCA_MS);
    }
    return codigos.map((codigo) => (achados.has(codigo)
      ? { codigo, achado: true, ...achados.get(codigo) }
      : { codigo, achado: false, motivo: 'não aparece na Consulta de pacotes desta conta' }));
  }

  const cifrado = (v) => (v.startsWith('{$') ? v : `{$${v}$}`);

  /** Nome e telefone de um waybill (packageInfoLimit + viewPlaintext). */
  async function revelar(post, codigo) {
    const p = await post(ROTA_PACOTE, { waybillNumber: codigo });
    if (!p) return { nome: '', telefone: '', cliente: '', comerciante: '', semPacote: true };
    const data = {};
    const chave = {};
    CAMPOS.forEach((campo) => {
      const v = p[campo];
      if (typeof v === 'string' && v) { const k = `field${Object.keys(data).length}`; data[k] = cifrado(v); chave[campo] = k; }
    });
    const claro = Object.keys(data).length ? (await post(ROTA_ABRIR, { data })) || {} : {};
    const ler = (campo) => (chave[campo] ? String(claro[chave[campo]] || '') : '');
    return {
      nome: ler('receiveName'),
      telefone: ler('receiveMobile') || ler('receivePhone'),
      cliente: p.customerName || '',
      comerciante: p.merchantName || '',
    };
  }

  /** Resposta da Anjun: {code, data, msg}. Recusa vira erro com a mensagem deles. */
  function lerResposta(status, texto) {
    let j = null;
    try { j = JSON.parse(texto); } catch { /* tratado abaixo */ }
    if (status !== 200 || !j || j.code !== 200) {
      const e = new Error(`A Anjun recusou (${(j && j.msg) || `HTTP ${status}`}).`);
      e.msgAnjun = (j && j.msg) || '';
      throw e;
    }
    return j.data;
  }

  if (typeof module !== 'undefined') {
    module.exports = { corpoDaBusca, buscarPedidos, revelar, lerResposta, CANAL, POR_BUSCA };
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
    xhr.onerror = () => reject(new Error('A Anjun não respondeu.'));
    xhr.send(JSON.stringify(corpo));
  });

  const responder = (dados) => window.postMessage({ [CANAL]: 'resposta', ...dados }, window.location.origin);
  const ouvir = (tipo, f) => window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== tipo) return;
    const { id } = e.data;
    if (!headers.token) {
      responder({ id, fim: true, erro: 'O portal da Anjun ainda não fez nenhuma consulta nesta aba. Dê F5 e tente de novo.' });
      return;
    }
    try {
      await f(e.data, id);
    } catch (err) {
      responder({ id, fim: true, erro: err.message, msgAnjun: err.msgAnjun || '' });
    }
  });

  ouvir('buscar', async (d, id) => {
    const codigos = Array.isArray(d.codigos) ? d.codigos : [];
    const pedidos = await buscarPedidos(post, codigos, (n, t) => responder({ id, andamento: `Buscando na Anjun: ${n} de ${t}...`, n, t }));
    responder({ id, fim: true, pedidos });
  });

  ouvir('revelar', async (d, id) => {
    responder({ id, fim: true, ...(await revelar(post, String(d.codigo || ''))) });
  });
})();
