// O que a XM - Agrupamento Loggi decide, sem tela e sem rede. Usado pelo menu.js; nos testes,
// carregado pelo Node.
//
// Confere contra UM circulo da Loggi (as cidades dele + as adicionadas nele) OU as cidades marcadas
// da lista da base (a da Loggi + as adicionadas a mao). Comeca sem nada escolhido; "Limpar" volta a isso.
// A configuracao fica no navegador, uma por base (codigo da base no Arco, ex.: CCR).

(() => {
  const PREFIXO = /^CITY_[A-Z]{2}_/;

  // Windows-1252 nos bytes 0x80-0x9F (o resto do Latin-1 e o proprio codigo do caractere).
  const CP1252 = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
    0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
    0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
    0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
  };

  /**
   * Acentuacao quebrada: texto em UTF-8 lido como Latin-1/Windows-1252 ("CaÃ§ador", "JOAÃ‡ABA",
   * "SÃ£o JosÃ©"), as vezes duas vezes. Volta cada caractere ao byte que era e le de novo como
   * UTF-8. Texto certo ("São", "SÃO PAULO") nao forma UTF-8 valido e fica como esta.
   */
  function consertarTexto(v) {
    let t = String(v == null ? '' : v);
    for (let vez = 0; vez < 3 && /[ÂÃ]/.test(t); vez += 1) {
      const bytes = [];
      for (const ch of t) {
        const c = ch.codePointAt(0);
        if (c < 0x100) bytes.push(c);
        else if (CP1252[c] !== undefined) bytes.push(CP1252[c]);
        else return t;
      }
      let lido;
      try { lido = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { break; }
      if (lido === t) break;
      t = lido;
    }
    return t;
  }

  // Caractere perdido no caminho ("Ca?ador", "Ca�ador"): vira curinga na comparacao.
  const PERDIDO = /[?�]+/g;

  function base(v) {
    let t = consertarTexto(v).trim();
    if (PREFIXO.test(t)) t = t.replace(PREFIXO, '').replace(/_/g, ' ');
    return t.replace(/['’`´^~¨]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim()
      .replace(/\s*\(\s*[a-z]{2}\s*\)$/, '')
      .replace(/\s+-\s+.*$/, '')
      .replace(/\s*[-/,]\s*[a-z]{2}$/, '');
  }

  // Letra repetida em seguida conta uma vez so ("Tangaraa", "Massaranduba"): dos dois lados.
  const semRepetidas = (t) => t.replace(/([a-z])\1+/g, '$1');

  /**
   * Uma chave so para "CITY_SC_HERVAL_DOESTE", "Herval d'Oeste", "HERVAL D OESTE - SC",
   * "Caçador (SC)" e "CaÃ§ador": acentuacao consertada, sem acento, sem UF no fim, so letras e
   * numeros, sem letra repetida em seguida.
   */
  function chave(v) {
    return semRepetidas(base(v).replace(PERDIDO, '').replace(/[^a-z0-9]/g, ''));
  }

  /** "Ca?ador" -> /^ca.{0,2}ador$/ (sem caractere perdido: null). */
  function curinga(v) {
    const t = base(v);
    if (!/[?�]/.test(t)) return null;
    const partes = t.split(PERDIDO).map((p) => semRepetidas(p.replace(/[^a-z0-9]/g, '')));
    if (partes.join('').length < 3) return null; // quase tudo perdido: nao da para saber
    return new RegExp(`^${partes.join('[a-z0-9]{0,2}')}$`);
  }

  // ── nome padrao das cidades ──────────────────────────────────────────────────
  // A Loggi manda a mesma cidade de varios jeitos ("CACADOR", "Cacador", "Caçador"). Para mostrar,
  // vale a grafia mais completa que ja apareceu (com acento) e a caixa de nome proprio:
  // "São Cristóvão do Sul", "Herval d'Oeste".
  const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const capital = (w) => w.replace(/^(\p{L})/u, (c) => c.toUpperCase());

  function formatarNome(v) {
    const t = consertarTexto(v).replace(/\s+/g, ' ').trim().toLowerCase();
    return t.split(' ').map((w, i) => {
      if (i > 0 && PARTICULAS.has(w)) return w;
      const ap = w.match(/^d['’](\p{L}.*)$/u); // d'oeste -> d'Oeste
      if (ap && i > 0) return `d'${capital(ap[1])}`;
      return capital(w).replace(/-(\p{L})/gu, (m, c) => `-${c.toUpperCase()}`);
    }).join(' ');
  }

  const preferidos = new Map();
  const pontos = (n) => (String(n).match(/[^\x00-\x7f]/g) || []).length * 2 + (/['’]/.test(n) ? 1 : 0);
  /** Guarda a grafia mais completa de cada cidade (a com mais acento ganha). */
  function aprenderNomes(nomes) {
    for (const bruto of nomes || []) {
      const n = consertarTexto(bruto).replace(/\s+/g, ' ').trim();
      const k = chave(n);
      if (!k) continue;
      const atual = preferidos.get(k);
      if (!atual || pontos(n) > pontos(atual)) preferidos.set(k, n);
    }
  }
  /** O nome da cidade para mostrar: a melhor grafia conhecida, com caixa de nome proprio. */
  const bonito = (n) => (String(n || '').trim() ? formatarNome(preferidos.get(chave(n)) || n) : '');

  /** "CITY_SC_LINDOIA_DO_SUL" -> "Lindoia Do Sul" (quando a Loggi nao mandou o nome). */
  function nomeDoCodigo(codigo) {
    return String(codigo || '').replace(PREFIXO, '').toLowerCase().split('_').filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  }

  // Configuracao de uma base:
  //   escolha: null (nada escolhido), { tipo: 'circulo', id } ou { tipo: 'cidades', chaves: [...] }
  //   adicionadas: cidades escritas a mao (entram na lista de cidades da base)
  //   extrasCirculo: { idDoCirculo: [cidades escritas a mao naquele circulo] }
  // Ate a 1.1 havia "Base toda" com todas ligadas (escolha.tipo 'base' e desligadas): vira nada escolhido.
  const cfgVazia = () => ({ adicionadas: [], extrasCirculo: {}, escolha: null });
  function normalizarCfg(c) {
    const cfg = { ...cfgVazia(), ...(c || {}), extrasCirculo: { ...((c && c.extrasCirculo) || {}) } };
    const e = cfg.escolha;
    if (!e || (e.tipo !== 'circulo' && e.tipo !== 'cidades')) cfg.escolha = null;
    else if (e.tipo === 'cidades') cfg.escolha = { tipo: 'cidades', chaves: [...new Set(e.chaves || [])] };
    delete cfg.desligadas;
    return cfg;
  }

  // Ordem alfabetica do portugues: sem olhar acento nem maiuscula ("Água Doce" junto de "Agua Doce").
  const porNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base', numeric: true });

  /** As cidades da base para marcar (as da Loggi e as adicionadas), em ordem alfabetica. */
  function listaDaBase(cidadesLoggi, cfg) {
    const c = normalizarCfg(cfg);
    const vistas = new Set();
    const lista = [];
    for (const x of cidadesLoggi || []) {
      const k = chave(x.codigo || x.nome);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      lista.push({ chave: k, nome: bonito(consertarTexto(x.nome) || nomeDoCodigo(x.codigo)), pacotes: Number(x.pacotes) || 0, origem: 'loggi' });
    }
    for (const nome of c.adicionadas) {
      const k = chave(nome);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      lista.push({ chave: k, nome: bonito(nome), pacotes: null, origem: 'adicionada' });
    }
    return lista.sort(porNome);
  }

  /** As cidades de um circulo: as da Loggi e as adicionadas nele. */
  function listaDoCirculo(circulo, cidadesLoggi, cfg) {
    const c = normalizarCfg(cfg);
    const nomes = new Map((cidadesLoggi || []).map((x) => [chave(x.codigo || x.nome), consertarTexto(x.nome)]));
    const vistas = new Set();
    const lista = [];
    const somar = (k, nome, origem) => {
      if (!k || vistas.has(k)) return;
      vistas.add(k);
      lista.push({ chave: k, nome, pacotes: null, origem });
    };
    for (const cod of (circulo && circulo.cidades) || []) somar(chave(cod), bonito(nomes.get(chave(cod)) || nomeDoCodigo(cod)), 'loggi');
    for (const nome of c.extrasCirculo[circulo && circulo.id] || []) somar(chave(nome), bonito(nome), 'adicionada');
    return lista.sort(porNome);
  }

  /** Os circulos em ordem alfabetica. */
  const ordenarCirculos = (circulos) => [...(circulos || [])].sort(porNome);

  const juntar = (nomes) => (nomes.length < 2 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`);

  /**
   * O que vale agora: um circulo, as cidades marcadas ou nada (sem conferencia).
   *   rotulo: "Círculo X" / "Caçador, Videira e mais 2"
   *   fora:   o fim de "123 é de Lages: ..." ("fora do círculo X" / "não é de Caçador" / "fora das cidades marcadas")
   */
  function montarAlvo(cfg, cidadesLoggi, circulos) {
    const c = normalizarCfg(cfg);
    const e = c.escolha;
    if (e && e.tipo === 'circulo') {
      const circulo = (circulos || []).find((x) => x.id === e.id);
      if (circulo) {
        const cidades = listaDoCirculo(circulo, cidadesLoggi, c);
        return { tipo: 'circulo', id: circulo.id, nome: circulo.nome, cidades, chaves: cidades.map((x) => x.chave),
          rotulo: `Círculo ${circulo.nome}`, fora: `fora do círculo ${circulo.nome}` };
      }
    }
    if (e && e.tipo === 'cidades') {
      const marcadas = new Set(e.chaves);
      const cidades = listaDaBase(cidadesLoggi, c).filter((x) => marcadas.has(x.chave));
      if (cidades.length) {
        const nomes = cidades.map((x) => x.nome);
        return { tipo: 'cidades', cidades, chaves: cidades.map((x) => x.chave),
          rotulo: nomes.length <= 3 ? juntar(nomes) : `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}`,
          fora: nomes.length === 1 ? `não é de ${nomes[0]}` : 'fora das cidades marcadas' };
      }
    }
    return { tipo: 'nada', cidades: [], chaves: [], rotulo: '', fora: '' };
  }

  /** O pacote e do que esta escolhido? Nada escolhido: nao confere (ok: null). */
  function conferirBipe(cidade, alvo) {
    if (!alvo || !alvo.chaves || !alvo.chaves.length) return { ok: null };
    if (alvo.chaves.includes(chave(cidade))) return { ok: true };
    const re = curinga(cidade);
    return { ok: !!re && alvo.chaves.some((k) => re.test(k)) };
  }

  /**
   * Na hora do "Continuar": dos bipados nesta tela, os que ainda estao na lista (o codigo aparece
   * no texto da tela; o tirado na lixeira some) e sao de fora.
   * @param {Map} bipes  codigo -> cidade
   */
  function pendentes(bipes, textoDaTela, alvo) {
    const tela = String(textoDaTela || '').toUpperCase();
    const errados = [];
    for (const [codigo, cidade] of bipes || []) {
      if (!tela.includes(String(codigo).toUpperCase())) continue;
      if (conferirBipe(cidade, alvo).ok === false) errados.push({ codigo, cidade });
    }
    return errados;
  }

  /** Quantos dos bipados ainda estao na lista de agrupar (o codigo aparece no texto dela): certos e de fora. */
  function contarNaLista(bipes, textoDaLista, alvo) {
    const tela = String(textoDaLista || '').toUpperCase();
    let certos = 0;
    let deFora = 0;
    for (const [codigo, cidade] of bipes || []) {
      if (!tela.includes(String(codigo).toUpperCase())) continue;
      const { ok } = conferirBipe(cidade, alvo);
      if (ok === true) certos += 1;
      if (ok === false) deFora += 1;
    }
    return { certos, deFora };
  }

  /** Escolhe um circulo (vale um so); clicar de novo no mesmo desmarca. */
  function escolherCirculo(cfg, id) {
    const c = normalizarCfg(cfg);
    const mesmo = c.escolha && c.escolha.tipo === 'circulo' && c.escolha.id === id;
    return { ...c, escolha: mesmo ? null : { tipo: 'circulo', id } };
  }

  /** Marca/desmarca uma cidade. Marcar cidade troca um circulo escolhido pelas cidades. */
  function alternarCidade(cfg, k) {
    const c = normalizarCfg(cfg);
    const atuais = new Set(c.escolha && c.escolha.tipo === 'cidades' ? c.escolha.chaves : []);
    if (atuais.has(k)) atuais.delete(k); else atuais.add(k);
    return { ...c, escolha: atuais.size ? { tipo: 'cidades', chaves: [...atuais] } : null };
  }

  /** Limpar: nada escolhido (as cidades adicionadas a mao continuam na lista). */
  const limpar = (cfg) => ({ ...normalizarCfg(cfg), escolha: null });

  /**
   * Adicionar cidade. Com um circulo escolhido, entra naquele circulo; senao entra na lista da base
   * e ja fica marcada. Nome vazio ou repetido nao muda nada.
   */
  function adicionarCidade(cfg, nome, cidadesLoggi, circulos) {
    const c = normalizarCfg(cfg);
    const n = String(nome || '').replace(/\s+/g, ' ').trim();
    const k = chave(n);
    if (!k) return { cfg: c, erro: 'Escreva o nome da cidade.' };
    const alvo = montarAlvo(c, cidadesLoggi, circulos);
    if (alvo.tipo === 'circulo') {
      if (alvo.chaves.includes(k)) return { cfg: c, erro: `${n} já está no círculo.` };
      const lista = [...(c.extrasCirculo[alvo.id] || []), n];
      return { cfg: { ...c, extrasCirculo: { ...c.extrasCirculo, [alvo.id]: lista } } };
    }
    const existe = listaDaBase(cidadesLoggi, c).find((x) => x.chave === k);
    const marcadas = new Set(alvo.tipo === 'cidades' ? alvo.chaves : []);
    if (existe && marcadas.has(k)) return { cfg: c, erro: `${existe.nome} já está marcada.` };
    const comNome = existe ? c : { ...c, adicionadas: [...c.adicionadas, n] };
    return { cfg: { ...comNome, escolha: { tipo: 'cidades', chaves: [...marcadas, k] } } };
  }

  /** Tira uma cidade adicionada a mao (do circulo escolhido, ou da lista da base). */
  function tirarAdicionada(cfg, k, cidadesLoggi, circulos) {
    const c = normalizarCfg(cfg);
    const alvo = montarAlvo(c, cidadesLoggi, circulos);
    if (alvo.tipo === 'circulo') {
      const lista = (c.extrasCirculo[alvo.id] || []).filter((n) => chave(n) !== k);
      return { ...c, extrasCirculo: { ...c.extrasCirculo, [alvo.id]: lista } };
    }
    const sem = { ...c, adicionadas: c.adicionadas.filter((n) => chave(n) !== k) };
    if (c.escolha && c.escolha.tipo === 'cidades') {
      const resto = c.escolha.chaves.filter((x) => x !== k);
      sem.escolha = resto.length ? { tipo: 'cidades', chaves: resto } : null;
    }
    return sem;
  }

  /** Cidades bipadas fora do escolhido, sem repetir: atalho do "Adicionar cidade". */
  function sugestoes(bipes, alvo) {
    const vistas = new Map();
    for (const cidade of (bipes || new Map()).values()) {
      const k = chave(cidade);
      if (k && conferirBipe(cidade, alvo).ok === false && !vistas.has(k)) vistas.set(k, cidade);
    }
    return [...vistas.values()];
  }

  /** Busca sem acento nem caixa, por nome (cidades ou circulos). */
  const filtrar = (itens, texto) => {
    const t = chave(texto);
    return t ? itens.filter((c) => chave(c.nome).includes(t)) : itens;
  };

  // ── Na base x agrupados: o que falta agrupar ──────────────────────────────────
  // O "Na base" vem do relatorio da propria tela (o "Baixar relatório" do Arco, listagem_na_base_<base>.csv).
  // "Ja agrupado" = estava na lista quando o "Continuar" passou (grupo criado), guardado neste navegador.

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

  const cabecalho = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  /**
   * Relatorio Na base -> so o que a conta usa: codigo de barras, ID, cidade, prazo, "Chegou em" e
   * Status. Nome, telefone e endereco ficam de fora.
   */
  function linhasNaBase(texto) {
    const [cab = [], ...linhas] = lerCsv(texto);
    const col = (nome) => cab.findIndex((c) => cabecalho(c) === nome);
    const i = { codigo: col('codigo de barras'), id: col('id do pacote'), cidade: col('cidade'), prazo: col('prazo'), chegou: col('chegou em'), status: col('status') };
    if (i.cidade < 0 || (i.codigo < 0 && i.id < 0)) throw new Error('O relatório Na base veio sem as colunas Cidade e Código de barras.');
    const valor = (l, k) => (i[k] < 0 ? '' : String(l[i[k]] || '').trim());
    return linhas
      .map((l) => ({ codigo: valor(l, 'codigo'), id: valor(l, 'id'), cidade: consertarTexto(valor(l, 'cidade')), prazo: valor(l, 'prazo'), chegou: valor(l, 'chegou'), status: valor(l, 'status') }))
      .filter((p) => p.codigo || p.id);
  }

  /** O link do "Baixar relatório" e da Loggi? (so esse vai para o fundo.js buscar) */
  function linkDoRelatorio(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && (u.hostname === 'loggi.com' || u.hostname.endsWith('.loggi.com')) && /\/packages\/report/.test(u.pathname);
    } catch { return false; }
  }

  /** O relatorio de toda a base, qualquer que seja o filtro da tela ("para amanhã" etc.). */
  function relatorioDaBase(url) {
    try {
      const u = new URL(url);
      if (u.searchParams.has('view')) u.searchParams.set('view', 'base');
      return u.toString();
    } catch { return ''; }
  }

  const diaSP = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const hoje = (agora = Date.now()) => diaSP(agora);
  const ontem = (agora = Date.now()) => diaSP(agora - 86400000);

  /** "Chegou em" -> "AAAA-MM-DD" no fuso de Sao Paulo (ISO com fuso, AAAA-MM-DD ou DD/MM/AAAA). */
  const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

  /** Dia e mes sem ano: o ano de agora (ou o passado, se o mes ainda vai chegar: "28 dez" lido em janeiro). */
  function comAno(dia, mes, agora) {
    const [a, m] = hoje(agora).split('-').map(Number);
    const ano = mes > m + 1 ? a - 1 : a;
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  /**
   * "Chegou em" -> "AAAA-MM-DD" no fuso de Sao Paulo. Aceita ISO (com ou sem fuso), AAAA-MM-DD,
   * DD/MM/AAAA, DD/MM, "25 nov", "25 de nov.", "hoje" e "ontem" (com ou sem hora depois).
   */
  function diaDe(valor, agora = Date.now()) {
    const t = String(valor || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(t)) {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) return diaSP(d.getTime());
    }
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = t.match(/^(\d{1,2})\/(\d{1,2})(?!\d)/);
    if (m) return comAno(Number(m[1]), Number(m[2]), agora);
    const minus = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^hoje\b/.test(minus)) return hoje(agora);
    if (/^ontem\b/.test(minus)) return ontem(agora);
    m = minus.match(/^(\d{1,2})\s*(?:de\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s*(?:de\s*)?(\d{4}))?/);
    if (m) return m[3] ? `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : comAno(Number(m[1]), MESES[m[2]], agora);
    return '';
  }

  /** "Chegou em" -> "08:15" (ou o texto como veio). */
  function horaDe(valor) {
    const t = String(valor || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/i.test(t)) {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    }
    const m = t.match(/(\d{1,2}):(\d{2})/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t;
  }

  /** Agrupados guardados ({ CODIGO: 'AAAA-MM-DD' }): ficam so os de hoje e de ontem. */
  function agrupadosValidos(registro, agora = Date.now()) {
    const valem = new Set([hoje(agora), ontem(agora)]);
    const r = {};
    for (const [c, dia] of Object.entries(registro || {})) if (valem.has(dia)) r[c] = dia;
    return r;
  }

  /** Junta os codigos de um grupo criado agora aos agrupados guardados. */
  function somarAgrupados(registro, codigos, agora = Date.now()) {
    const r = agrupadosValidos(registro, agora);
    for (const c of codigos || []) r[String(c).toUpperCase()] = hoje(agora);
    return r;
  }

  /**
   * O que falta agrupar: na base, das cidades escolhidas, sem grupo criado e fora da lista de agora.
   * @param {object[]} linhas     do relatorio (linhasNaBase)
   * @param {object} agrupados    { CODIGO: dia } (agrupadosValidos)
   * @param {Iterable} naLista    codigos bipados que estao na lista de agrupar agora
   * @param {boolean} soHoje      so os que chegaram hoje
   */
  function faltantes(linhas, alvo, agrupados, naLista, { soHoje = true, agora = Date.now(), avulsos = null } = {}) {
    if (!alvo || !alvo.chaves || !alvo.chaves.length) return [];
    const up = (c) => String(c || '').toUpperCase();
    const agora_ = new Set([...(naLista || [])].map(up));
    const ja = new Set(Object.keys(agrupados || {}));
    const tem = (conj, p) => (p.codigo && conj.has(up(p.codigo))) || (p.id && conj.has(up(p.id)));
    const dia = hoje(agora);
    return (linhas || [])
      .filter((p) => conferirBipe(p.cidade, alvo).ok === true)
      .filter((p) => !tem(agora_, p))
      // Com os avulsos da Loggi (Recebimento + Sem tentativa): nao agrupado = esta neles, feito em
      // qualquer computador. Sem eles, vale o que este navegador guardou dos grupos criados.
      .filter((p) => (avulsos ? tem(avulsos, p) : !tem(ja, p)))
      .filter((p) => !soHoje || diaDe(p.chegou, agora) === dia)
      .sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR', { sensitivity: 'base' }) || String(a.chegou).localeCompare(String(b.chegou)));
  }

  /** Para conferir a leitura: quantos vieram, quantos chegaram hoje e um exemplo do "Chegou em". */
  function resumoNaBase(linhas, agora = Date.now()) {
    const ls = linhas || [];
    const dia = hoje(agora);
    return { total: ls.length, hoje: ls.filter((p) => diaDe(p.chegou, agora) === dia).length,
      semData: ls.filter((p) => !diaDe(p.chegou, agora)).length, exemplo: (ls.find((p) => p.chegou) || {}).chegou || '' };
  }

  /** Avulsos da Loggi -> conjunto com todos os codigos de cada um (barras, rastreio, ID), em maiusculas. */
  function codigosAvulsos(pacotes) {
    const s = new Set();
    for (const p of pacotes || []) for (const c of [p.codigo, p.rastreio, p.id]) if (c) s.add(String(c).toUpperCase());
    return s;
  }

  // ── Conferencia (menu do Arco): pacotes sem grupo ───────────────────────────
  const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  /** Prazo da Loggi -> "até 27 nov" (como a tela do Arco). */
  function prazoCurto(iso) {
    const d = diaDe(iso);
    if (!d) return '';
    const [, m, dia] = d.split('-').map(Number);
    return `até ${String(dia).padStart(2, '0')} ${MES_CURTO[m - 1]}`;
  }

  /** Dias inteiros entre o dia do recebimento e hoje (Sao Paulo). */
  function diasParado(iso, agora = Date.now()) {
    const d = diaDe(iso, agora);
    if (!d) return null;
    return Math.max(0, Math.round((Date.parse(`${hoje(agora)}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86400000));
  }

  /** "25/11 08:10" (outro dia) ou "08:10" (hoje). */
  function recebidoCurto(iso, agora = Date.now()) {
    const d = diaDe(iso, agora);
    if (!d) return '';
    const h = horaDe(iso);
    if (d === hoje(agora)) return h;
    const [, m, dia] = d.split('-');
    return `${dia}/${m} ${h}`;
  }

  const SITUACOES = { 89: 'Sem tentativa' };
  const situacaoDe = (p) => p.situacao || SITUACOES[p.status] || (p.status ? `Status ${p.status}` : '');

  /**
   * Os sem grupo da Loggi (estacao Recebimento) para as abas: "hoje" = recebidos hoje (mais novos
   * primeiro); "todos" = todos parados (mais antigos primeiro).
   */
  function separarParados(pacotes, agora = Date.now()) {
    const dia = hoje(agora);
    const todos = [...(pacotes || [])].sort((a, b) => String(a.recebido || '9').localeCompare(String(b.recebido || '9')));
    const deHoje = todos.filter((p) => diaDe(p.recebido, agora) === dia).reverse();
    return { hoje: deHoje, todos };
  }

  /** Quantos por cidade (nome padrao), em ordem alfabetica. */
  function contarPorCidade(pacotes) {
    const m = new Map();
    for (const p of pacotes || []) {
      const k = chave(p.cidade) || '?';
      const atual = m.get(k) || { chave: k, nome: bonito(p.cidade) || 'Sem cidade', qtd: 0 };
      atual.qtd += 1;
      m.set(k, atual);
    }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  }

  /** Filtra pelas cidades marcadas (Set de chaves); vazio = todas. */
  const daCidade = (pacotes, chaves) => (!chaves || !chaves.size ? pacotes : pacotes.filter((p) => chaves.has(chave(p.cidade) || '?')));

  /**
   * As cidades que a base atende: as de todos os circulos da Loggi + as adicionadas a mao
   * (na base toda ou num circulo). Set de chaves; vazio = nao deu para saber.
   */
  function cidadesAtendidas(circulos, cfg) {
    const c = normalizarCfg(cfg);
    const s = new Set();
    for (const ci of circulos || []) for (const cod of ci.cidades || []) if (chave(cod)) s.add(chave(cod));
    for (const lista of Object.values(c.extrasCirculo)) for (const nome of lista || []) if (chave(nome)) s.add(chave(nome));
    for (const nome of c.adicionadas || []) if (chave(nome)) s.add(chave(nome));
    return s;
  }

  // Vai embora da base, nao espera atribuicao ("Aguardando reenvio", devolucao...).
  const SAINDO = /reenvio|devolu|retorno|extravi|transferir|redirecion/i;

  /**
   * Pendentes de atribuicao x de fora: fica de fora o pacote de cidade que a base nao atende
   * (veio errado para ca) ou que esta saindo da base. Sem a lista de cidades: so o status separa.
   */
  function separarDaBase(pacotes, atendidas) {
    const daBase = [];
    const fora = [];
    for (const p of pacotes || []) {
      const k = chave(p.cidade);
      const deOutra = atendidas && atendidas.size && !(k && (atendidas.has(k) || [...atendidas].some((a) => { const r = curinga(p.cidade); return r && r.test(a); })));
      (deOutra || SAINDO.test(situacaoDe(p)) ? fora : daBase).push(p);
    }
    return { daBase, fora };
  }

  /** Bipados que estao na lista de agrupar agora (o codigo aparece no texto dela). */
  const naListaAgora = (bipes, textoDaLista) => {
    const tela = String(textoDaLista || '').toUpperCase();
    return [...(bipes || new Map()).keys()].filter((c) => tela.includes(String(c).toUpperCase()));
  };

  /** O botao clicado e o "Agrupar" (ou "Agrupar pacotes") de alguma tela do Arco? */
  const ehAgrupar = (texto) => /^agrupar( pacotes)?$/.test(String(texto || '').replace(/\s+/g, ' ').trim().toLowerCase());

  const publico = { chave, consertarTexto, formatarNome, aprenderNomes, bonito, nomeDoCodigo, cfgVazia, normalizarCfg, listaDaBase, listaDoCirculo, montarAlvo, conferirBipe,
    pendentes, contarNaLista, ordenarCirculos, escolherCirculo, alternarCidade, limpar, adicionarCidade, tirarAdicionada, sugestoes, filtrar, ehAgrupar,
    lerCsv, linhasNaBase, linkDoRelatorio, relatorioDaBase, hoje, diaDe, horaDe, resumoNaBase, codigosAvulsos,
    prazoCurto, diasParado, recebidoCurto, situacaoDe, separarParados, contarPorCidade, daCidade, cidadesAtendidas, separarDaBase, agrupadosValidos, somarAgrupados, faltantes, naListaAgora };
  if (typeof module !== 'undefined') module.exports = publico;
  else self.XMAgrupamento = publico;
})();
