// O que a XM - Agrupamento Loggi decide, sem tela e sem rede. Usado pelo menu.js; nos testes,
// carregado pelo Node.
//
// Cidades da base = as da Loggi (todas ligadas) menos as desligadas, mais as adicionadas a mao.
// Circulo = as cidades que o circulo tem na Loggi, mais as adicionadas a mao naquele circulo.
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

  /** "CITY_SC_LINDOIA_DO_SUL" -> "Lindoia Do Sul" (quando a Loggi nao mandou o nome). */
  function nomeDoCodigo(codigo) {
    return String(codigo || '').replace(PREFIXO, '').toLowerCase().split('_').filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  }

  const cfgVazia = () => ({ desligadas: [], adicionadas: [], extrasCirculo: {}, escolha: { tipo: 'base' } });
  const normalizarCfg = (c) => ({ ...cfgVazia(), ...(c || {}), extrasCirculo: { ...((c && c.extrasCirculo) || {}) } });

  /** As cidades da base, na ordem da Loggi (mais pacotes primeiro), e depois as adicionadas. */
  function listaDaBase(cidadesLoggi, cfg) {
    const c = normalizarCfg(cfg);
    const desligadas = new Set(c.desligadas);
    const vistas = new Set();
    const lista = [];
    for (const x of cidadesLoggi || []) {
      const k = chave(x.codigo || x.nome);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      lista.push({ chave: k, nome: consertarTexto(x.nome) || nomeDoCodigo(x.codigo), pacotes: Number(x.pacotes) || 0, origem: 'loggi', ligada: !desligadas.has(k) });
    }
    for (const nome of c.adicionadas) {
      const k = chave(nome);
      if (!k || vistas.has(k)) continue;
      vistas.add(k);
      lista.push({ chave: k, nome, pacotes: null, origem: 'adicionada', ligada: true });
    }
    return lista;
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
      lista.push({ chave: k, nome, pacotes: null, origem, ligada: true });
    };
    for (const cod of (circulo && circulo.cidades) || []) somar(chave(cod), nomes.get(chave(cod)) || nomeDoCodigo(cod), 'loggi');
    for (const nome of c.extrasCirculo[circulo && circulo.id] || []) somar(chave(nome), nome, 'adicionada');
    return lista;
  }

  /**
   * O que vale agora: base toda ou um circulo. Circulo que sumiu da Loggi volta para a base.
   *   fora: o fim de "Caçador: ..." na tarja ("fora do círculo X" / "fora das cidades da base")
   */
  function montarAlvo(cfg, cidadesLoggi, circulos) {
    const c = normalizarCfg(cfg);
    const circulo = c.escolha && c.escolha.tipo === 'circulo' ? (circulos || []).find((x) => x.id === c.escolha.id) : null;
    if (circulo) {
      const cidades = listaDoCirculo(circulo, cidadesLoggi, c);
      return { tipo: 'circulo', id: circulo.id, nome: circulo.nome, cidades, chaves: cidades.map((x) => x.chave),
        rotulo: `Círculo ${circulo.nome}`, fora: `fora do círculo ${circulo.nome}` };
    }
    const cidades = listaDaBase(cidadesLoggi, c);
    return { tipo: 'base', cidades, chaves: cidades.filter((x) => x.ligada).map((x) => x.chave),
      rotulo: 'Base toda', fora: 'fora das cidades da base' };
  }

  /** O pacote e do que esta escolhido? Sem lista, nao ha o que conferir (ok: null). */
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

  /** Liga/desliga uma cidade da Loggi na base. */
  function alternarCidade(cfg, k) {
    const c = normalizarCfg(cfg);
    const desligadas = new Set(c.desligadas);
    if (desligadas.has(k)) desligadas.delete(k); else desligadas.add(k);
    return { ...c, desligadas: [...desligadas] };
  }

  /** Adiciona no que esta escolhido (base ou o circulo). Nome vazio ou repetido nao muda nada. */
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
    const existe = alvo.cidades.find((x) => x.chave === k);
    if (existe && existe.ligada) return { cfg: c, erro: `${existe.nome} já está na lista.` };
    if (existe) return { cfg: alternarCidade(c, k) }; // estava desligada: liga
    return { cfg: { ...c, adicionadas: [...c.adicionadas, n] } };
  }

  /** Tira uma cidade adicionada a mao (da base ou do circulo escolhido). */
  function tirarAdicionada(cfg, k, cidadesLoggi, circulos) {
    const c = normalizarCfg(cfg);
    const alvo = montarAlvo(c, cidadesLoggi, circulos);
    if (alvo.tipo === 'circulo') {
      const lista = (c.extrasCirculo[alvo.id] || []).filter((n) => chave(n) !== k);
      return { ...c, extrasCirculo: { ...c.extrasCirculo, [alvo.id]: lista } };
    }
    return { ...c, adicionadas: c.adicionadas.filter((n) => chave(n) !== k) };
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

  /** Busca na lista de cidades, sem acento nem caixa. */
  const filtrar = (cidades, texto) => {
    const t = chave(texto);
    return t ? cidades.filter((c) => c.chave.includes(t)) : cidades;
  };

  const publico = { chave, consertarTexto, nomeDoCodigo, cfgVazia, normalizarCfg, listaDaBase, listaDoCirculo, montarAlvo, conferirBipe,
    pendentes, alternarCidade, adicionarCidade, tirarAdicionada, sugestoes, filtrar };
  if (typeof module !== 'undefined') module.exports = publico;
  else self.XMAgrupamento = publico;
})();
