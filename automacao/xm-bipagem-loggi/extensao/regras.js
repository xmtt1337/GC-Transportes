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

  const juntar = (nomes) => (nomes.length < 2 ? nomes.join('')
    : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`);

  /**
   * Círculo ou cidades marcados → as cidades que valem e os textos dos avisos. Vale UM
   * círculo só; se vierem vários (seleção antiga), fica o primeiro. Se vierem círculo e
   * cidades, vale o círculo.
   *   rotulo: o que fica no registro ("Círculo Lindomar", "Caçador, Videira")
   *   frase:  o fim de "não é ..." ("do círculo Lindomar", "das cidades Caçador e Videira")
   */
  function montarAlvo(selecao, grupos) {
    const sel = selecao || {};
    const primeiro = (sel.grupos || []).map(Number).find((id) => (grupos || []).some((g) => Number(g.id) === id));
    const circulos = (grupos || []).filter((g) => Number(g.id) === primeiro);
    const tipo = circulos.length ? 'circulo' : 'cidade';
    const cidades = [];
    const chaves = new Set();
    const somar = (c) => {
      const k = chaveCidade(c);
      if (k && !chaves.has(k)) { chaves.add(k); cidades.push(c); }
    };
    if (tipo === 'circulo') circulos.forEach((g) => (g.cidades || []).forEach(somar));
    else (sel.cidades || []).forEach(somar);

    const nomes = tipo === 'circulo' ? circulos.map((g) => g.nome) : cidades;
    let rotulo = '';
    let frase = '';
    // Circulo chamado "Círculo Lindomar" nao vira "Círculo Círculo Lindomar".
    const jaDiz = nomes.every((n) => chaveCidade(n).startsWith('circulo'));
    if (nomes.length && tipo === 'circulo' && jaDiz) {
      rotulo = nomes.join(' + ');
      frase = nomes.length === 1 ? `do ${nomes[0]}` : `dos ${juntar(nomes)}`;
    } else if (nomes.length && tipo === 'circulo') {
      rotulo = `${nomes.length === 1 ? 'Círculo' : 'Círculos'} ${nomes.join(' + ')}`;
      frase = nomes.length === 1 ? `do círculo ${nomes[0]}` : `dos círculos ${juntar(nomes)}`;
    } else if (nomes.length) {
      rotulo = nomes.join(', ');
      frase = nomes.length === 1 ? `de ${nomes[0]}` : `das cidades ${juntar(nomes)}`;
    }
    return { tipo, cidades, chaves: [...chaves], rotulo, frase };
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

  // Onde a Loggi so funciona com o login do sistema XMTT na extensao.
  const SITES_TRAVADOS = ['arco.loggi.com'];
  const precisaTravar = (host, logado) => SITES_TRAVADOS.includes(String(host || '').toLowerCase()) && !logado;

  /**
   * Clique num botao de icone (a lixeira): de qual pacote e a linha? Sobe do elemento clicado
   * ate o primeiro ancestral cujo texto tem um codigo bipado. Se ali ja aparecem dois ou
   * mais, passou da linha e chegou na lista: nao da para saber, devolve null.
   * @param {string[]} textos  innerText do elemento clicado e de cada ancestral, de dentro para fora
   * @param {Iterable<string>} codigos  codigos bipados nesta tela
   */
  function codigoDaLinha(textos, codigos) {
    const lista = [...codigos].map((c) => String(c).toUpperCase());
    for (const t of textos) {
      const texto = String(t || '').toUpperCase();
      const achados = lista.filter((c) => texto.includes(c));
      if (achados.length === 1) return achados[0];
      if (achados.length > 1) return null;
    }
    return null;
  }

  /** CSV (vírgula, aspas duplas, "" dentro de aspas) → linhas de colunas. */
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
   * Relatório Na base do Arco (listagem_na_base_<base>.csv) → os pacotes só com o que a conta
   * precisa: código de barras, ID, cidade, prazo, "Chegou em" e Status. Nome, telefone e
   * endereço ficam no navegador. Quem escolhe (chegou hoje, "Sem tentativa") é o sistema.
   */
  function linhasNaBase(texto) {
    const [cab = [], ...linhas] = lerCsv(texto);
    const col = (nome) => cab.findIndex((c) => chaveCidade(c) === nome);
    const i = { status: col('status'), codigo: col('codigo de barras'), id: col('id do pacote'), cidade: col('cidade'), prazo: col('prazo'), chegou: col('chegou em') };
    if (i.status < 0 || i.chegou < 0 || (i.codigo < 0 && i.id < 0)) throw new Error('O relatório Na base veio sem as colunas Status, Chegou em e Código de barras.');
    const valor = (l, k) => (i[k] < 0 ? '' : String(l[i[k]] || '').trim());
    return linhas
      .map((l) => ({ codigo: valor(l, 'codigo'), id: valor(l, 'id'), cidade: valor(l, 'cidade'), prazo: valor(l, 'prazo'), chegou: valor(l, 'chegou'), status: valor(l, 'status') }))
      .filter((p) => p.codigo || p.id);
  }

  /**
   * Export de pedidos do SPX (export_return_order_*.csv) → por BR só comprador, CEP, motorista e
   * sort code (o relatório de divergências). Telefone e endereço ficam de fora.
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

  const publico = { BACKEND, ErroDeConta, chaveCidade, montarAlvo, conferirBipe, pendentes, precisaTravar, codigoDaLinha, lerCsv, linhasNaBase, pedidosDoExport, entrar, api };
  if (typeof module !== 'undefined') module.exports = publico;
  else self.XMBipagem = publico;
})();
