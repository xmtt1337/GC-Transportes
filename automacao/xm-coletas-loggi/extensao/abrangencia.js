// XM - Coletas Loggi: qual cidade e da nossa abrangencia. Sem rede e sem Chrome (testavel).
//
// Abrangencia = as cidades de todos os circulos da base na Loggi (Distribuir > Circulos). Se a
// base nao tiver circulo nenhum, vale a lista de cidades da base (a do filtro Cidades do Na base).
// A comparacao usa a mesma chave da XM - Agrupamento Loggi (regras.js): sem acento, sem UF,
// acentuacao quebrada consertada, letra perdida ("Ca?ador") como curinga.

(() => {
  const R = typeof module !== 'undefined' ? require('./regras.js') : self.XMAgrupamento;

  /** circulos [{ cidades: ['CITY_SC_...'] }], cidades [{ codigo, nome }] -> { chaves, nomes, origem } */
  function montarAbrangencia(circulos, cidades) {
    const chaves = new Set();
    const nomes = new Map();
    const somar = (valor, nome) => {
      const k = R.chave(valor);
      if (!k) return;
      chaves.add(k);
      if (!nomes.has(k)) nomes.set(k, nome || R.nomeDoCodigo(valor));
    };
    const deCidade = new Map((cidades || []).map((c) => [R.chave(c.codigo || c.nome), c.nome]));
    for (const c of circulos || []) for (const cod of c.cidades || []) somar(cod, deCidade.get(R.chave(cod)));
    if (chaves.size) return { chaves, nomes, origem: 'circulos' };
    for (const c of cidades || []) somar(c.codigo || c.nome, c.nome);
    return { chaves, nomes, origem: chaves.size ? 'cidades' : 'nada' };
  }

  /** A cidade do pacote bipado e nossa? */
  function daAbrangencia(cidade, abr) {
    if (!abr || !abr.chaves || !abr.chaves.size) return false;
    const k = R.chave(cidade);
    if (k && abr.chaves.has(k)) return true;
    const re = R.curinga(cidade);
    return !!re && [...abr.chaves].some((x) => re.test(x));
  }

  /** Para guardar no chrome.storage (Set/Map nao vao). */
  const guardavel = (abr) => ({ chaves: [...abr.chaves], nomes: [...abr.nomes], origem: abr.origem });
  const deGuardado = (g) => ({ chaves: new Set((g && g.chaves) || []), nomes: new Map((g && g.nomes) || []), origem: (g && g.origem) || 'nada' });

  const api = { montarAbrangencia, daAbrangencia, guardavel, deGuardado };
  if (typeof module !== 'undefined') module.exports = api;
  else self.XMColetas = api;
})();
