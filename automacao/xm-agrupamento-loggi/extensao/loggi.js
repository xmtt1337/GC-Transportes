// XM - Agrupamento Loggi, no mundo da pagina (arco.loggi.com).
//
// 1. Ouve o bipe da tela Agrupar: a propria tela pergunta pelo pacote
//    (group_packages/retrieve_and_validate_packages_by_barcode) e recebe a cidade de destino.
// 2. Busca na Loggi, quando o menu.js pede:
//    cidades   POST leve.loggi.com/api/v2/last_mile/packages/aggregated {aggregatedField:'city_enum'}
//              a lista de cidades da base com a quantidade de pacotes (a mesma do filtro Cidades do
//              Na base e da "Regiao de atuacao" do Criar circulo).
//    circulos  GET leve.loggi.com/api/v1/<empresa>:<centro>/circle/list (cada circulo com as cidades).
//
// A sessao e a da propria pagina: os cabecalhos que o Arco manda ao leve.loggi.com ficam so na
// memoria desta aba, para essas duas chamadas. Nada disso sai daqui: para o menu.js vao so nomes de
// cidade, quantidades e circulos (nome e cidades). Nenhuma rota com dado de pessoa e lida.

(() => {
  const CANAL = 'xmAgrup';
  const API = 'https://leve.loggi.com';
  const ROTA_BIPE = /\/group_packages\/retrieve_and_validate_packages_by_barcode/;
  const LEVE = /^https:\/\/leve\.loggi\.com\//;
  const FILTRO_PRAZO = 'last_last_mile_promised_date_annotation.annotation.last_mile_promised_date.promised_date.promised_date';

  function extrairBipes(resposta) {
    if (!resposta || typeof resposta !== 'object' || Array.isArray(resposta)) return [];
    const itens = [];
    for (const [codigo, p] of Object.entries(resposta)) {
      if (!p || typeof p !== 'object') continue;
      const end = p.loggiAddress || {};
      const cidade = (p.destination && p.destination.city)
        || (end.correiosAddress && end.correiosAddress.cidade)
        || (end.postalAddress && end.postalAddress.locality)
        || '';
      if (cidade) itens.push({ codigo, cidade: String(cidade) });
    }
    return itens;
  }

  /** Guarda de onde e a base (centro, empresa, codigo) pelo que o proprio Arco pede ao leve. */
  function lerBase(url, corpo, base) {
    const b = base;
    try {
      const q = new URL(url, 'https://leve.loggi.com').searchParams;
      if (q.get('distribution_center_id')) b.centro = q.get('distribution_center_id');
      if (q.get('last_mile_company_id')) b.empresa = q.get('last_mile_company_id');
      if (q.get('routing_code')) b.codigo = q.get('routing_code');
    } catch { /* url estranha: fica o que ja tinha */ }
    let j = null;
    try { j = typeof corpo === 'string' ? JSON.parse(corpo) : null; } catch { j = null; }
    if (j && typeof j === 'object') {
      if (j.distribution_center_id) b.centro = String(j.distribution_center_id);
      if (j.last_mile_company_id) b.empresa = String(j.last_mile_company_id);
      if (j.routing_code) b.codigo = String(j.routing_code);
      if (j.aggregatedField === 'city_enum' && j.lastMileCompanyType) b.tipo = String(j.lastMileCompanyType);
    }
    return b;
  }

  const baseCompleta = (b) => !!(b && b.centro && b.empresa && b.codigo);

  function corpoCidades(b) {
    return {
      view: 'annotation_for_base', routing_code: b.codigo, viewFilterBy: FILTRO_PRAZO,
      aggregatedField: 'city_enum', lastMileCompanyType: b.tipo || 'LEVE', searchArgument: '',
      distribution_center_id: Number(b.centro), last_mile_company_id: b.empresa,
    };
  }

  function urlCirculos(b) {
    const q = `distribution_center_id=${encodeURIComponent(b.centro)}&last_mile_company_id=${encodeURIComponent(b.empresa)}&routing_code=${encodeURIComponent(b.codigo)}`;
    return `${API}/api/v1/${encodeURIComponent(b.empresa)}:${encodeURIComponent(b.centro)}/circle/list?${q}`;
  }

  /** Resposta do aggregated -> [{ codigo: 'CITY_SC_CACADOR', nome: 'Cacador', pacotes: 4687 }] */
  function lerCidades(j) {
    return ((j && j.data) || []).filter((x) => x && x.id)
      .map((x) => ({ codigo: String(x.id), nome: String(x.label || ''), pacotes: Number(x.value) || 0 }));
  }

  /** Resposta do circle/list -> [{ id, nome, cidades: ['CITY_SC_...'] }] (sem entregadores). */
  function lerCirculos(j) {
    return ((j && j.circles) || []).filter((c) => c && c.id)
      .map((c) => ({ id: String(c.id), nome: String(c.name || ''), cidades: (c.cities || []).map(String) }));
  }

  if (typeof module !== 'undefined') {
    module.exports = { extrairBipes, lerBase, baseCompleta, corpoCidades, urlCirculos, lerCidades, lerCirculos, ROTA_BIPE, CANAL };
    return;
  }

  const base = { codigo: (location.pathname.split('/').filter(Boolean)[0] || '').toUpperCase() };
  let sessao = null; // { cabecalhos, comCredenciais } da ultima chamada do proprio Arco ao leve

  // ── ouvir o Arco ─────────────────────────────────────────────────────────────
  const X = XMLHttpRequest.prototype;
  const abrir0 = X.open;
  const cabecalho0 = X.setRequestHeader;
  const enviar0 = X.send;
  X.open = function (metodo, url) {
    this.__xmUrl = String(url);
    this.__xmCab = {};
    if (ROTA_BIPE.test(this.__xmUrl)) {
      this.addEventListener('load', () => {
        try { avisarBipe(typeof this.response === 'string' ? this.response : JSON.stringify(this.response)); } catch { /* outro formato */ }
      });
    }
    return abrir0.apply(this, arguments);
  };
  X.setRequestHeader = function (nome, valor) {
    if (this.__xmCab) this.__xmCab[nome] = valor;
    return cabecalho0.apply(this, arguments);
  };
  X.send = function (corpo) {
    if (!this.__xmProprio && LEVE.test(this.__xmUrl || '')) {
      lerBase(this.__xmUrl, corpo, base);
      if (Object.keys(this.__xmCab || {}).some((k) => /^authorization$/i.test(k))) {
        sessao = { cabecalhos: { ...this.__xmCab }, comCredenciais: !!this.withCredentials };
      }
    }
    return enviar0.apply(this, arguments);
  };

  const buscar0 = window.fetch;
  window.fetch = async function (entrada, op) {
    const url = String(entrada && entrada.url ? entrada.url : entrada);
    if (LEVE.test(url)) {
      try {
        lerBase(url, op && op.body, base);
        const h = new Headers((op && op.headers) || (entrada && entrada.headers) || {});
        if (h.has('authorization')) {
          const cab = {};
          h.forEach((v, k) => { if (k !== 'content-type') cab[k] = v; });
          sessao = { cabecalhos: cab, comCredenciais: !!(op && op.credentials === 'include') };
        }
      } catch { /* segue a chamada do Arco */ }
    }
    const r = await buscar0.apply(this, arguments);
    if (ROTA_BIPE.test(url)) r.clone().text().then(avisarBipe).catch(() => {});
    return r;
  };

  function avisarBipe(texto) {
    let itens;
    try { itens = extrairBipes(JSON.parse(texto)); } catch { return; }
    if (itens.length) window.postMessage({ [CANAL]: 'bipe', itens }, location.origin);
  }

  // ── buscar na Loggi ────────────────────────────────────────────────────────
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  async function esperarSessao() {
    for (let i = 0; i < 50 && !(sessao && baseCompleta(base)); i += 1) await dormir(300);
    if (!sessao || !baseCompleta(base)) throw new Error('A Loggi ainda não carregou nesta aba. Abra outra tela do Arco (ex.: Na base) e tente de novo.');
  }

  function pedir(metodo, url, corpo) {
    return new Promise((ok, nao) => {
      const x = new XMLHttpRequest();
      x.__xmProprio = true;
      x.open(metodo, url);
      x.withCredentials = sessao.comCredenciais;
      Object.entries(sessao.cabecalhos).forEach(([k, v]) => { if (!/^content-type$/i.test(k)) x.setRequestHeader(k, v); });
      if (corpo) x.setRequestHeader('Content-Type', 'application/json');
      x.onload = () => {
        if (x.status < 200 || x.status >= 300) return nao(new Error(`A Loggi recusou (HTTP ${x.status}). Dê F5 no Arco e tente de novo.`));
        try { ok(JSON.parse(x.responseText)); } catch { nao(new Error('A Loggi respondeu num formato que a extensão não conhece.')); }
      };
      x.onerror = () => nao(new Error('A Loggi não respondeu.'));
      x.send(corpo ? JSON.stringify(corpo) : null);
    });
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== 'pedir') return;
    const { id, tipo } = e.data;
    const responder = (dados) => window.postMessage({ [CANAL]: 'resposta', id, ...dados }, location.origin);
    try {
      await esperarSessao();
      const quem = { codigo: base.codigo, nome: base.codigo };
      if (tipo === 'cidades') responder({ base: quem, cidades: lerCidades(await pedir('POST', `${API}/api/v2/last_mile/packages/aggregated`, corpoCidades(base))) });
      else if (tipo === 'circulos') responder({ base: quem, circulos: lerCirculos(await pedir('GET', urlCirculos(base))) });
      else responder({ erro: 'Pedido desconhecido.' });
    } catch (err) {
      responder({ erro: err.message });
    }
  });
})();
