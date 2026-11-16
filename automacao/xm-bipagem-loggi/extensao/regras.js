// O que a XM - Bipagem Loggi decide, sem tela. Usado pelo menu.js (no site) e pela pagina.js.

(() => {
  const BACKEND = 'https://sistema-backend-i4uh.onrender.com';
  // Atras de verificarNaoEntregador e sem banco: so confere se a conta pode usar.
  const ROTA_ACESSO = '/macros/acesso';
  const ROTA = '/macros/loggi-bipagem';

  class ErroDeConta extends Error {}

  // Mesma regra do chaveCidade do backend (fechamento-transportadoras/precificacao.js):
  // "CACADOR - SC", "Caçador (SC)" e "caçador" viram "cacador".
  function chaveCidade(v) {
    return String(v || '').replace(/['’`´]/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim()
      .replace(/\s*\(\s*[a-z]{2}\s*\)$/, '')
      .replace(/\s+-\s+.*$/, '')
      .replace(/\s*[-/,]\s*[a-z]{2}$/, '')
      .replace(/\s+/g, ' ').trim();
  }

  /** Grupos e cidades marcados → as cidades que valem e um nome para mostrar. */
  function montarAlvo(selecao, grupos) {
    const sel = selecao || {};
    const ids = new Set((sel.grupos || []).map(Number));
    const escolhidos = (grupos || []).filter((g) => ids.has(Number(g.id)));
    const cidades = [];
    const chaves = new Set();
    const somar = (c) => {
      const k = chaveCidade(c);
      if (k && !chaves.has(k)) { chaves.add(k); cidades.push(c); }
    };
    escolhidos.forEach((g) => (g.cidades || []).forEach(somar));
    (sel.cidades || []).forEach(somar);
    const soltas = (sel.cidades || []).filter((c) => !escolhidos.some((g) => (g.cidades || []).includes(c)));
    const rotulo = [...escolhidos.map((g) => g.nome), ...soltas].join(' + ');
    return { cidades, chaves: [...chaves], rotulo };
  }

  /**
   * O pacote e das cidades marcadas? A cidade da Loggi passa pela Conversao de cidades
   * ("CACADOR" → "Caçador") antes de comparar. Sem nada marcado, nao ha o que conferir.
   */
  function conferirBipe(cidade, alvo, conversao) {
    if (!alvo || !alvo.chaves || !alvo.chaves.length) return { ok: null };
    const k = chaveCidade(cidade);
    const convertida = conversao && conversao[k];
    const kk = convertida ? chaveCidade(convertida) : k;
    return { ok: alvo.chaves.includes(kk) };
  }

  /**
   * Na hora do "Continuar": dos pacotes bipados nesta tela, os que ainda estao na lista (o
   * codigo aparece no texto da tela; o que foi tirado na lixeira some) e sao de outra cidade.
   * @param {Map} bipes  codigo → cidade, de cada bipe ouvido desde que a pagina abriu
   */
  function pendentes(bipes, textoDaTela, alvo, conversao) {
    const tela = String(textoDaTela || '').toUpperCase();
    const errados = [];
    for (const [codigo, cidade] of bipes || []) {
      if (!tela.includes(String(codigo).toUpperCase())) continue;
      if (conferirBipe(cidade, alvo, conversao).ok === false) errados.push({ codigo, cidade });
    }
    return errados;
  }

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
    await api(corpo.token, 'GET', ROTA_ACESSO, undefined, buscar, true);
    return { token: corpo.token, nome: corpo.name || corpo.username || usuario };
  }

  /** Chamada ao sistema. Sessão vencida ou sem acesso vira ErroDeConta (volta ao login). */
  async function api(token, metodo, caminho, corpo, buscar = fetch, absoluto = false) {
    let r;
    try {
      r = await buscar(`${BACKEND}${absoluto ? caminho : ROTA + caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new Error('Não alcancei o sistema. Tente de novo em instantes.');
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || (r.status === 403 && !j.error)) {
      throw new ErroDeConta('Sessão vencida ou conta sem acesso. Entre de novo.');
    }
    if (r.status === 403) throw new ErroDeConta('Essa conta não tem acesso.');
    if (!r.ok) throw new Error(j.error || `O sistema respondeu ${r.status}.`);
    return j;
  }

  const publico = { BACKEND, ErroDeConta, chaveCidade, montarAlvo, conferirBipe, pendentes, entrar, api };
  if (typeof module !== 'undefined') module.exports = publico;
  else self.XMBipagem = publico;
})();
