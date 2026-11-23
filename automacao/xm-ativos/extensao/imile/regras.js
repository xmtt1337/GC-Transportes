// O que a XM - Ativos iMile decide, sem tela. Usado pelo fundo.js (service worker) e pelo ativos.js
// (a pagina dentro do DS da iMile). Nos testes, carregado pelo Node.
//
// O disparo e o mesmo da XM - Ativos Shopee, com o modelo da iMile: confirmacao_imile
//   {{1}} nome do cliente  {{2}} quem dispara (a conta do sistema)  {{3}} produto  {{4}} pedido
// (o texto aprovado mostra o Pedido antes do Produto, mas os parametros vao na ordem dos numeros).

(() => {
  const BACKEND = 'https://sistema-backend-i4uh.onrender.com';
  // O login das extensoes (canal "vigia") so abre rotas /macros/: as mesmas do sistema, com as
  // mesmas regras (polo, SAIR, so sac/dev/admin).
  const ROTA_ENVIAR = '/macros/whatsapp/enviar';
  const ROTA_SITUACAO = '/macros/whatsapp/ativos-status';
  const ROTA_ACESSO = '/macros/acesso';
  const TEMPLATE = 'confirmacao_imile';
  const MAX_CODIGOS = 500;

  class ErroDeConta extends Error {}

  /** Waybills da iMile colados (so digitos, 10 a 16), sem repetir; devolve tambem o que nao serviu. */
  function lerCodigos(texto) {
    const vistos = new Set();
    const ignorados = [];
    for (const parte of String(texto || '').split(/[\s,;]+/)) {
      const c = parte.trim();
      if (!c) continue;
      if (/^\d{10,16}$/.test(c)) vistos.add(c);
      else ignorados.push(c);
    }
    return { codigos: [...vistos], ignorados };
  }

  function digitosLocais(valor) {
    const semPrefixo = String(valor || '').trim().replace(/^\+\s*55\s*/, '');
    let d = semPrefixo.replace(/\D/g, '');
    if (d.startsWith('55') && (d.length - 2 === 10 || d.length - 2 === 11)) d = d.slice(2);
    return d.slice(0, 11);
  }

  function validarTelefone(valor) {
    const d = digitosLocais(valor);
    if (!d) return { ok: false, erro: 'Sem telefone na iMile.' };
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

  /** O texto aprovado do confirmacao_imile. */
  function montarTexto({ nome, atendente, produto, pedido }) {
    return `Olá, ${nome || '___'}! Tudo bem?
Me chamo ${atendente || '___'} e faço parte do time de SAC da iMile Delivery.
Gostaria de confirmar se você recebeu seu pedido:
Pedido: ${pedido || '___'}
Produto: ${produto || '___'}

Você recebeu o pedido?
Por favor, responda com SIM ou NÃO.`;
  }

  /**
   * Corpo do disparo, igual ao do disparo em massa do sistema: sem prazo (nao e acareacao) e
   * destino "outros" (o servidor so respeita para dev; para os demais o cargo decide).
   * Devolve { erro } ou { corpo }.
   */
  function montarEnvio({ codigo, nome, telefone, produto, atendente }) {
    const tel = validarTelefone(telefone);
    if (!tel.ok) return { erro: tel.erro };
    if (!nome) return { erro: 'Sem nome na iMile.' };
    if (!atendente) return { erro: 'Sem o nome de quem dispara (entre de novo no sistema).' };
    const produtoTexto = String(produto || '').trim() || 'não informado';
    return {
      corpo: {
        numero: tel.e164, template: TEMPLATE, parametros: [nome, atendente, produtoTexto, codigo],
        texto: montarTexto({ nome, atendente, produto: produtoTexto, pedido: codigo }), nome_cliente: nome, pedido: codigo,
        prazo_horas: null, transportadora: 'imile', destino: 'outros',
      },
    };
  }

  /** Cargo que está no token (só para mostrar ou esconder o grupo; quem decide é o servidor). */
  function papelDoToken(token) {
    try {
      const parte = String(token || '').split('.')[1] || '';
      const json = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(parte.replace(/-/g, '+').replace(/_/g, '/'))))
        : Buffer.from(parte, 'base64').toString('utf8');
      return JSON.parse(json).role || '';
    } catch { return ''; }
  }

  /** Chamada ao sistema. Sessao vencida vira ErroDeConta (volta ao login); 403 e falta de acesso. */
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
      const e = new Error(!j.error || j.error === 'Acesso negado' ? 'Sua conta não tem acesso aos ativos (só SAC, admin e dev).' : j.error);
      e.semAcesso = true;
      throw e;
    }
    if (!r.ok) throw new Error(j.error || `O sistema respondeu ${r.status}.`);
    return j;
  }

  /** Login com o canal das extensoes ("vigia"): nao derruba o login do site. */
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

  /** Quem vê o grupo "Ativos" no menu (o servidor barra os outros do mesmo jeito). */
  const ROLES_ATIVOS = ['sac', 'dev', 'admin'];

  const publico = {
    BACKEND, ROTA_ENVIAR, ROTA_SITUACAO, TEMPLATE, MAX_CODIGOS, ErroDeConta, ROLES_ATIVOS,
    lerCodigos, digitosLocais, validarTelefone, telefoneLegivel, montarTexto, montarEnvio, papelDoToken, api, entrar,
  };
  if (typeof self !== 'undefined') self.XMAtivosImile = publico;
  if (typeof module !== 'undefined' && module.exports) module.exports = publico;
})();
