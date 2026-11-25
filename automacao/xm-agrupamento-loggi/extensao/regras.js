// O que a XM - Agrupamento Loggi decide, sem tela e sem rede. Usado pelo menu.js; nos testes,
// carregado pelo Node.
//
// Cidades da base = as da Loggi (todas ligadas) menos as desligadas, mais as adicionadas a mao.
// Circulo = as cidades que o circulo tem na Loggi, mais as adicionadas a mao naquele circulo.
// A configuracao fica no navegador, uma por base (codigo da base no Arco, ex.: CCR).

(() => {
  const PREFIXO = /^CITY_[A-Z]{2}_/;

  /**
   * Uma chave so para "CITY_SC_HERVAL_DOESTE", "Herval d'Oeste", "HERVAL D OESTE - SC" e
   * "Caçador (SC)": sem acento, sem UF no fim, so letras e numeros.
   */
  function chave(v) {
    let t = String(v || '').trim();
    if (PREFIXO.test(t)) t = t.replace(PREFIXO, '').replace(/_/g, ' ');
    t = t.replace(/['’`´]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim()
      .replace(/\s*\(\s*[a-z]{2}\s*\)$/, '')
      .replace(/\s+-\s+.*$/, '')
      .replace(/\s*[-/,]\s*[a-z]{2}$/, '');
    return t.replace(/[^a-z0-9]/g, '');
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
      lista.push({ chave: k, nome: x.nome || nomeDoCodigo(x.codigo), pacotes: Number(x.pacotes) || 0, origem: 'loggi', ligada: !desligadas.has(k) });
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
    const nomes = new Map((cidadesLoggi || []).map((x) => [chave(x.codigo || x.nome), x.nome]));
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
    return { ok: alvo.chaves.includes(chave(cidade)) };
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

  const publico = { chave, nomeDoCodigo, cfgVazia, normalizarCfg, listaDaBase, listaDoCirculo, montarAlvo, conferirBipe,
    pendentes, alternarCidade, adicionarCidade, tirarAdicionada, sugestoes, filtrar };
  if (typeof module !== 'undefined') module.exports = publico;
  else self.XMAgrupamento = publico;
})();
