// O que a XM - Conferencia Shopee decide, sem tela: o login no sistema XMTT (so ele vem do
// sistema) e a leitura do export de pedidos do SPX. Usado pelo fundo.js (service worker) e pelo
// menu.js (a pagina dentro do SPX). Nos testes, carregado pelo Node.

(() => {
  const BACKEND = 'https://sistema-backend-i4uh.onrender.com';
  // Atras de verificarNaoEntregador e sem banco: so confere se a conta pode usar a extensao.
  const ROTA_ACESSO = '/macros/acesso';
  const MAX_CODIGOS = 10000; // o export de pedidos do SPX aceita ate 10 mil BR

  class ErroDeConta extends Error {}

  /** CSV (virgula, aspas duplas, "" dentro de aspas) -> linhas de colunas. */
  function lerCsv(texto) {
    const linhas = [];
    let linha = [];
    let campo = '';
    let aspas = false;
    const t = String(texto || '').replace(/^﻿/, '');
    for (let i = 0; i < t.length; i += 1) {
      const c = t[i];
      if (aspas) {
        if (c === '"' && t[i + 1] === '"') { campo += '"'; i += 1; } else if (c === '"') aspas = false; else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === ',') { linha.push(campo); campo = ''; } else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i += 1;
        linha.push(campo); campo = '';
        if (linha.some((x) => x !== '')) linhas.push(linha);
        linha = [];
      } else campo += c;
    }
    linha.push(campo);
    if (linha.some((x) => x !== '')) linhas.push(linha);
    return linhas;
  }

  /**
   * Export de pedidos do SPX -> por BR comprador, CEP, motorista e sort code (o relatorio de
   * divergencias e a abrangencia). Telefone e endereco ficam de fora.
   */
  function pedidosDoExport(texto) {
    const [cab = [], ...linhas] = lerCsv(texto);
    const col = (nome) => cab.findIndex((c) => String(c).trim().toLowerCase() === nome);
    const i = { codigo: col('order id'), comprador: col('buyer name'), zip: col('zipcode name'), postal: col('postal code'),
      motorista: col('driver name'), sort: col('sort code name') };
    if (i.codigo < 0) throw new Error('O export de pedidos do SPX veio sem a coluna Order ID.');
    const valor = (l, k) => (i[k] < 0 ? '' : String(l[i[k]] || '').trim());
    return linhas
      .map((l) => ({ codigo: valor(l, 'codigo').toUpperCase(), comprador: valor(l, 'comprador'), cep: valor(l, 'zip') || valor(l, 'postal'),
        motorista: valor(l, 'motorista'), sort_code: valor(l, 'sort') }))
      .filter((p) => p.codigo);
  }

  /** Cargo que está no token (só informativo; quem decide o acesso é o servidor). */
  function papelDoToken(token) {
    try {
      const parte = String(token || '').split('.')[1] || '';
      const json = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(parte.replace(/-/g, '+').replace(/_/g, '/'))))
        : Buffer.from(parte, 'base64').toString('utf8');
      return String(JSON.parse(json).role || '');
    } catch {
      return '';
    }
  }

  /** Chamada ao sistema. Sessao vencida vira ErroDeConta (volta ao login). */
  async function api(token, metodo, caminho, corpo, buscar = fetch) {
    let r;
    try {
      r = await buscar(`${BACKEND}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new Error('Não alcancei o sistema. Tente de novo em instantes.');
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new ErroDeConta('Sessão vencida. Entre de novo.');
    if (r.status === 403) {
      const e = new Error(!j.error || j.error === 'Acesso negado' ? 'Sua conta não tem acesso a esta parte do sistema.' : j.error);
      e.semAcesso = true;
      throw e;
    }
    if (!r.ok) throw new Error(j.error || `O sistema respondeu ${r.status}.`);
    return j;
  }

  /**
   * Login com o canal das extensoes ("vigia"): nao derruba o login do site. Depois confere se a
   * conta pode usar a extensao (/macros/acesso: toda a operacao, menos entregador).
   */
  async function entrar(usuario, senha, buscar = fetch) {
    let corpo;
    try {
      const r = await buscar(`${BACKEND}/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: usuario, password: senha, canal: 'vigia' }),
      });
      corpo = await r.json();
    } catch {
      throw new Error('Não alcancei o sistema. Tente de novo em instantes.');
    }
    if (corpo.inativo) throw new ErroDeConta('Esse usuário está inativo.');
    if (!corpo.success) throw new ErroDeConta('Usuário ou senha não confere.');
    if (corpo.require_password_change) throw new ErroDeConta('A senha é temporária. Entre no site e troque.');
    if (!corpo.token) throw new Error('O login passou, mas não veio token.');
    try {
      await api(corpo.token, 'GET', ROTA_ACESSO, undefined, buscar);
    } catch (e) {
      if (e.semAcesso) throw new ErroDeConta('Essa conta não pode usar a extensão.');
      throw e;
    }
    return { token: corpo.token, nome: corpo.name || corpo.username || usuario, papel: papelDoToken(corpo.token) };
  }

  const publico = { BACKEND, MAX_CODIGOS, ErroDeConta, lerCsv, pedidosDoExport, papelDoToken, api, entrar };
  if (typeof self !== 'undefined') self.XMConf = publico;
  if (typeof module !== 'undefined' && module.exports) module.exports = publico;
})();
