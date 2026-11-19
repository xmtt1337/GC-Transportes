// O que a XM - Ativos Shopee decide, sem tela. Usado pelo fundo.js (service worker) e pelo
// ativos.js (a pagina dentro do SPX). Nos testes, carregado pelo Node.

(() => {
  const BACKEND = 'https://sistema-backend-i4uh.onrender.com';
  // O login das extensoes (canal "vigia") so abre rotas /macros/. Estas sao as mesmas do
  // sistema (/admin/whatsapp/...), com as mesmas regras: polo, SAIR, so sac/dev/admin.
  const ROTA_ENVIAR = '/macros/whatsapp/enviar';
  const ROTA_SITUACAO = '/macros/whatsapp/ativos-status';
  // Atras de verificarNaoEntregador e sem banco: so confere se a conta pode usar a extensao.
  const ROTA_ACESSO = '/macros/acesso';
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
   * Export de pedidos do SPX (export_return_order_*.csv) -> por BR o nome do destinatario.
   * A coluna Buyer Phone vem SEMPRE vazia (conferido em 58 exports, 18/11/2026): o telefone so
   * sai pelo "olho" (spx.js buscarTelefone), na hora do disparo.
   */
  function contatosDoExport(texto) {
    const [cab = [], ...linhas] = lerCsv(texto);
    const col = (nome) => cab.findIndex((c) => String(c).trim().toLowerCase() === nome);
    const i = { codigo: col('order id'), nome: col('buyer name'), telefone: col('buyer phone') };
    if (i.codigo < 0) throw new Error('O export de pedidos do SPX veio sem a coluna Order ID.');
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

  // ── Conversas (mesmas regras de meusite/js/whatsapp-conversa.js) ─────────────────────────────
  // Quem pode ver e mexer em cada conversa e decidido pelo servidor (polo, cargo, quem disparou):
  // ele so devolve o que a conta enxerga. Aqui fica so como a tela separa e ordena.

  const ROLES_ACAREACAO = ['sac', 'dev'];
  const PRAZO_HORAS_PADRAO = 48;
  // Templates que identificam a Shopee quando o disparo nao gravou a transportadora (os antigos).
  const TEMPLATES_SHOPEE = ['confirmacao_entrega', 'reclamacao_shopee'];

  /** Cargo gravado no token do sistema (so para escolher a aba inicial; quem barra e o servidor). */
  function papelDoToken(token) {
    try {
      const parte = String(token || '').split('.')[1] || '';
      const json = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(parte.replace(/-/g, '+').replace(/_/g, '/'))))
        : Buffer.from(parte, 'base64').toString('utf8');
      return JSON.parse(json).role || '';
    } catch { return ''; }
  }

  const ehShopee = (c) => (c.transportadora ? c.transportadora === 'shopee' : TEMPLATES_SHOPEE.includes(c.template_inicial));

  /** Aba da conversa: entregadores | chamaram | acareacao | outros (igual a _wacAbaDe). */
  function abaDe(c) {
    if (c.tem_entregador) return 'entregadores';
    if (!c.primeiro_envio) return 'chamaram';
    const acareacao = c.tipo !== 'outros' && (!c.enviado_por_role || ROLES_ACAREACAO.includes(c.enviado_por_role));
    return acareacao ? 'acareacao' : 'outros';
  }

  /**
   * As conversas que a extensao mostra: so as que nasceram de disparo da Shopee (Acareacao e
   * Ativos). "Nos chamaram" (cliente que escreveu sem disparo nosso) fica so no sistema
   * (pedido do usuario, 19/11/2026).
   */
  function conversasDaShopee(lista) {
    return (Array.isArray(lista) ? lista : [])
      .filter((c) => { const a = abaDe(c); return (a === 'acareacao' || a === 'outros') && ehShopee(c); })
      .sort((a, b) => new Date(b.ultima || 0) - new Date(a.ultima || 0));
  }

  function vencimento(c) {
    return new Date(new Date(c.primeiro_envio).getTime() + (c.prazo_horas || PRAZO_HORAS_PADRAO) * 3600000);
  }

  /** Coluna da acareacao: vencendo_hoje | mais_24h | vencidos | respondidos. */
  function statusPrazo(c, agora = new Date()) {
    if (c.respondido) return 'respondidos';
    const horas = (vencimento(c) - agora) / 3600000;
    if (horas <= 0) return 'vencidos';
    if (horas <= 24) return 'vencendo_hoje';
    return 'mais_24h';
  }

  /** Coluna dos outros ativos: novas_respostas | aguardando | entregue | nao_entregue. */
  function colunaDesfecho(c) {
    if (c.respondido) return c.resultado === 'recebeu' ? 'entregue' : 'nao_entregue';
    if (Number(c.nao_lidas) > 0) return 'novas_respostas';
    return 'aguardando';
  }

  /** "faltam 6h 10min" / "venceu há 3h" */
  function tempoRestante(venc, agora = new Date()) {
    const ms = venc - agora;
    const totalMin = Math.floor(Math.abs(ms) / 60000);
    const horas = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const texto = horas >= 24 ? `${Math.floor(horas / 24)}d ${horas % 24}h` : horas >= 1 ? `${horas}h ${min}min` : `${min}min`;
    return ms < 0 ? `venceu há ${texto}` : `faltam ${texto}`;
  }

  /** 5549999276131 -> +55 49 99927-6131 */
  function formatarNumero(numero) {
    const n = String(numero || '').replace(/\D/g, '');
    const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${n}`;
  }

  /** "Hoje 10:05" / "Ontem 18:30" / "12/11 09:00" */
  function dataCurta(valor, agora = new Date()) {
    if (!valor) return '—';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '—';
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
    if (mesmoDia(d, agora)) return `Hoje ${hora}`;
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    if (mesmoDia(d, ontem)) return `Ontem ${hora}`;
    const dia = d.toLocaleDateString('pt-BR', d.getFullYear() === agora.getFullYear()
      ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${dia} ${hora}`;
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
    // So a sessao vencida derruba o login. 403 e o cargo sem acesso a ESTA parte (ex.: os ativos,
    // que sao so de SAC, admin e dev, enquanto a Conferencia e de toda a operacao): avisa e segue.
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
   * conta pode usar a extensao (/macros/acesso: toda a operacao, menos entregador). O que cada
   * cargo ve dentro dela (os ativos so para SAC, admin e dev) e decidido por pagina.
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

  /** Quem ve o grupo "Ativos" no menu (o servidor barra os outros do mesmo jeito). */
  const ROLES_ATIVOS = ['sac', 'dev', 'admin'];
  /** Quem escolhe o polo na Conferencia (os outros veem so o proprio). */
  const ROLES_TODOS_POLOS = ['dev', 'admin'];

  /**
   * Export de pedidos do SPX -> por BR comprador, CEP, motorista e sort code (o relatorio de
   * divergencias da Conferencia). Telefone e endereco ficam de fora. Igual ao da XM - Operacao.
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

  const publico = {
    BACKEND, ROTA_ENVIAR, ROTA_SITUACAO, TEMPLATE, MAX_CODIGOS, ErroDeConta,
    lerCodigos, lerCsv, nomeLimpo, contatosDoExport, digitosLocais, validarTelefone, telefoneLegivel,
    montarTexto, montarEnvio, api, entrar, pedidosDoExport, ROLES_ATIVOS, ROLES_TODOS_POLOS,
    ROLES_ACAREACAO, papelDoToken, ehShopee, abaDe, conversasDaShopee, vencimento, statusPrazo, colunaDesfecho,
    tempoRestante, formatarNumero, dataCurta,
  };
  if (typeof self !== 'undefined') self.XMAtivos = publico;
  if (typeof module !== 'undefined' && module.exports) module.exports = publico;
})();
