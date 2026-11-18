// O que a XM - Ativos Shopee decide, sem tela. Usado pelo fundo.js (service worker) e pelo
// ativos.js (a pagina dentro do SPX). Nos testes, carregado pelo Node.

(() => {
  const BACKEND = 'https://sistema-backend-i4uh.onrender.com';
  // O login das extensoes (canal "vigia") so abre rotas /macros/. Estas sao as mesmas do
  // sistema (/admin/whatsapp/...), com as mesmas regras: polo, SAIR, so sac/dev/admin.
  const ROTA_ENVIAR = '/macros/whatsapp/enviar';
  const ROTA_SITUACAO = '/macros/whatsapp/ativos-status';
  // Modelo dos "demais ativos" da Shopee no WABA (o mesmo da tela Ativos do sistema).
  const TEMPLATE = 'confirmacao_entrega';
  const MAX_CODIGOS = 10000; // o export de pedidos do SPX aceita ate 10 mil BR

  class ErroDeConta extends Error {}

  /** BR colados (um por linha, ou separados por espaco, virgula ou ponto e virgula), sem repetir. */
  function lerCodigos(texto) {
    const vistos = new Set();
    for (const parte of String(texto || '').split(/[\s,;]+/)) {
      const c = parte.trim().toUpperCase();
      if (/^BR[0-9A-Z]{8,20}$/.test(c)) vistos.add(c);
    }
    return [...vistos];
  }

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

  /** O SPX grava alguns nomes com "_" no fim ("Fulano Tal_"): fica fora da mensagem. */
  function nomeLimpo(v) {
    return String(v || '').replace(/[_\s]+$/, '').replace(/^[_\s]+/, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Export de pedidos do SPX (export_return_order_*.csv) -> por BR so nome e telefone do
   * destinatario. Endereco e o resto do arquivo nao saem daqui.
   */
  function contatosDoExport(texto) {
    const [cab = [], ...linhas] = lerCsv(texto);
    const col = (nome) => cab.findIndex((c) => String(c).trim().toLowerCase() === nome);
    const i = { codigo: col('order id'), nome: col('buyer name'), telefone: col('buyer phone') };
    if (i.codigo < 0 || i.telefone < 0) throw new Error('O export de pedidos do SPX veio sem as colunas Order ID e Buyer Phone.');
    const valor = (l, k) => (i[k] < 0 ? '' : String(l[i[k]] || '').trim());
    return linhas
      .map((l) => ({ codigo: valor(l, 'codigo').toUpperCase(), nome: nomeLimpo(valor(l, 'nome')), telefone: valor(l, 'telefone') }))
      .filter((p) => p.codigo);
  }

  // Mesma regra do sistema (meusite/js/whatsapp-teste.js, _waDigitosLocais/_waValidarTelefone):
  // tira o 55 so quando o resto tem cara de numero local, para nao mutilar o DDD 55.
  function digitosLocais(valor) {
    const semPrefixo = String(valor || '').trim().replace(/^\+\s*55\s*/, '');
    let d = semPrefixo.replace(/\D/g, '');
    if (d.startsWith('55') && (d.length - 2 === 10 || d.length - 2 === 11)) d = d.slice(2);
    return d.slice(0, 11);
  }

  function validarTelefone(valor) {
    const d = digitosLocais(valor);
    if (!d) return { ok: false, erro: 'Sem telefone no SPX.' };
    if (d.length < 10) return { ok: false, erro: 'Telefone incompleto.' };
    const ddd = parseInt(d.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99) return { ok: false, erro: `DDD inválido (${d.slice(0, 2)}).` };
    if (d.length === 11 && d[2] !== '9') return { ok: false, erro: 'Celular com 9 dígitos precisa começar com 9 depois do DDD.' };
    return { ok: true, e164: `55${d}` };
  }

  /** (49) 9 9999-9999 para mostrar na tela. */
  function telefoneLegivel(e164) {
    const d = String(e164 || '').replace(/^55/, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return String(e164 || '');
  }

  /** O texto aprovado do confirmacao_entrega, igual ao da tela Ativos do sistema. */
  function montarTexto(nome, codigo) {
    return `Olá, ${nome || '___'}!
Aqui é da GCTRANSPORTES, parceira da SHOPEE e responsável pela entrega do seu pedido ${codigo || '___'}.
Por gentileza, poderia confirmar a entrega preenchendo os dados abaixo?
 [1]  Nome completo do destinatário:
 [2]  Seu pedido foi recebido?: SIM ou NÃO`;
  }

  /**
   * Corpo do disparo, igual ao do disparo em massa do sistema: sem prazo (nao e acareacao) e
   * destino "outros" (o servidor so respeita para dev; para os demais o cargo decide).
   * Devolve { erro } ou { corpo }.
   */
  function montarEnvio({ codigo, nome, telefone }) {
    const tel = validarTelefone(telefone);
    if (!tel.ok) return { erro: tel.erro };
    if (!nome) return { erro: 'Sem nome no SPX.' };
    return {
      corpo: {
        numero: tel.e164, template: TEMPLATE, parametros: [nome, codigo],
        texto: montarTexto(nome, codigo), nome_cliente: nome, pedido: codigo,
        prazo_horas: null, transportadora: 'shopee', destino: 'outros',
      },
    };
  }

  /** Chamada ao sistema. Sessao vencida ou sem acesso vira ErroDeConta (volta ao login). */
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
    if (r.status === 403) throw new ErroDeConta('Essa conta não pode disparar ativos (só SAC, admin e dev).');
    if (!r.ok) throw new Error(j.error || `O sistema respondeu ${r.status}.`);
    return j;
  }

  /**
   * Login com o canal das extensoes ("vigia"): nao derruba o login do site. Depois confere se a
   * conta pode disparar ativos e tem polo, consultando a situacao de nenhum pedido.
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
    await api(corpo.token, 'POST', ROTA_SITUACAO, { pedidos: [] }, buscar);
    return { token: corpo.token, nome: corpo.name || corpo.username || usuario };
  }

  const publico = {
    BACKEND, ROTA_ENVIAR, ROTA_SITUACAO, TEMPLATE, MAX_CODIGOS, ErroDeConta,
    lerCodigos, lerCsv, nomeLimpo, contatosDoExport, digitosLocais, validarTelefone, telefoneLegivel,
    montarTexto, montarEnvio, api, entrar,
  };
  if (typeof self !== 'undefined') self.XMAtivos = publico;
  if (typeof module !== 'undefined' && module.exports) module.exports = publico;
})();
