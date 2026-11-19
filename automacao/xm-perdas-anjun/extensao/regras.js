// Regras da XM - Perdas Anjun: le o rastreio de um pacote e diz quem estava com ele
// quando a entrega falhou.
//
// O rastreio vem da Anjun do mais novo para o mais antigo, como na janela "Consulta de
// rastreamentos". A partir do "A entrega falhou" mais recente, desce o historico ate o
// primeiro evento de posse:
//   - "Objeto saiu para entrega ao destinatario, Entregador[X]"  -> culpado: entregador X
//   - "O pacote ja recebido pelo ponto de entrega[BASE]"          -> culpado: a base
// Ou seja: se o pacote foi recebido no ponto e o proximo passo (acima) ja e a falha,
// ninguem saiu com ele e o desconto e da base.

(() => {
  const TIPOS = {
    entregador: 'Entregador',
    base: 'Base',
    nao_identificado: 'Não identificado',
    erro: 'Erro',
  };

  const SITUACOES = {
    pendente: 'Na fila',
    rodando: 'Consultando...',
    ok: '',
    sem_falha: 'Sem "A entrega falhou" no rastreio: mostra quem está com o pacote agora',
    sem_rastreio: 'A Anjun não tem rastreio deste pacote',
    nao_identificado: 'Antes da falha não tem saída para entrega nem recebimento no ponto',
    erro: 'Erro na consulta',
  };

  function lerCodigos(texto) {
    const vistos = new Set();
    for (const m of String(texto || '').toUpperCase().matchAll(/AJ\d{12,18}/g)) vistos.add(m[0]);
    return [...vistos];
  }

  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // "Entregador[Fulano]" -> "Fulano"
  function noColchete(texto, rotulo) {
    const m = new RegExp(`${rotulo}\\s*\\[([^\\]]*)\\]`, 'i').exec(String(texto || ''));
    return m ? m[1].trim() : '';
  }

  function classificar(texto) {
    const t = normalizar(texto);
    const pessoa = noColchete(texto, 'Digitalizar pessoas');
    if (/entrega falhou/.test(t)) {
      const depois = String(texto).replace(/^.*?falhou\s*,?\s*/i, '');
      const motivo = depois.replace(/,?\s*Digitalizar pessoas\s*\[[^\]]*\]\s*$/i, '').trim();
      return { tipo: 'falha', motivo, perda: /perda/.test(t), pessoa };
    }
    if (/saiu para entrega/.test(t)) return { tipo: 'saida', entregador: noColchete(texto, 'Entregador') };
    if (/recebido pelo ponto de entrega/.test(t)) return { tipo: 'recebido', base: noColchete(texto, 'ponto de entrega'), pessoa };
    if (/foi assinado/.test(t)) return { tipo: 'assinado', pessoa };
    return { tipo: 'outro' };
  }

  // eventos: [{ dateTime, status }] do mais novo para o mais antigo (resposta de /admin/track)
  function analisar(eventos) {
    const lista = (Array.isArray(eventos) ? eventos : [])
      .filter((e) => e && e.status)
      .map((e) => ({ data: e.dateTime || '', texto: String(e.status), ...classificar(e.status) }));

    const resultado = {
      tipo: 'nao_identificado', culpado: '', base: '', recebidoPor: '',
      evidencia: null, falha: null, assinadoPor: '', entregadores: [], depois: '', situacao: 'ok',
    };
    if (!lista.length) return { ...resultado, situacao: 'sem_rastreio' };

    resultado.entregadores = [...new Set(lista.filter((e) => e.tipo === 'saida' && e.entregador).map((e) => e.entregador))];

    const iFalha = lista.findIndex((e) => e.tipo === 'falha');
    if (iFalha >= 0) {
      const f = lista[iFalha];
      resultado.falha = { data: f.data, motivo: f.motivo };
      if (iFalha > 0) resultado.depois = `${lista[0].data} ${lista[0].texto}`;
    } else {
      resultado.situacao = 'sem_falha';
    }

    const antes = lista.slice(iFalha + 1); // iFalha = -1 -> o historico inteiro
    const iPosse = antes.findIndex((e) => e.tipo === 'saida' || e.tipo === 'recebido');
    const assinado = antes.slice(0, iPosse >= 0 ? iPosse : antes.length).find((e) => e.tipo === 'assinado');
    if (assinado) resultado.assinadoPor = assinado.pessoa;
    const recebido = antes.find((e) => e.tipo === 'recebido');
    if (recebido) resultado.base = recebido.base;

    if (iPosse < 0) {
      if (resultado.situacao === 'ok') resultado.situacao = 'nao_identificado';
      return resultado;
    }
    const posse = antes[iPosse];
    resultado.evidencia = { data: posse.data, texto: posse.texto };
    if (posse.tipo === 'saida') {
      resultado.tipo = 'entregador';
      resultado.culpado = posse.entregador || '(sem nome no rastreio)';
    } else {
      resultado.tipo = 'base';
      resultado.base = posse.base;
      resultado.culpado = posse.base ? `Base ${posse.base}` : 'Base (sem código no rastreio)';
      resultado.recebidoPor = posse.pessoa;
    }
    return resultado;
  }

  // itens: [{ codigo, situacao, ...analise, erro }]
  function resumir(itens) {
    const grupos = new Map();
    for (const i of itens) {
      if (!i.culpado) continue;
      const chave = `${i.tipo}|${i.culpado}`;
      if (!grupos.has(chave)) grupos.set(chave, { tipo: i.tipo, culpado: i.culpado, pedidos: [] });
      grupos.get(chave).pedidos.push(i.codigo);
    }
    return [...grupos.values()].sort((a, b) => b.pedidos.length - a.pedidos.length || a.culpado.localeCompare(b.culpado));
  }

  function observacao(i) {
    const partes = [];
    if (i.situacao === 'erro') partes.push(`Erro: ${i.erro || 'sem mensagem'}`);
    else if (SITUACOES[i.situacao]) partes.push(SITUACOES[i.situacao]);
    if (i.depois) partes.push(`Teve movimento depois da falha: ${i.depois}`);
    return partes.join(' | ');
  }

  const aspas = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const linha = (valores) => valores.map(aspas).join(';');

  function montarCsv(itens) {
    const linhas = [linha(['Pedido', 'Culpado', 'Tipo', 'Base', 'Por quê (último evento antes da falha)', 'Data desse evento',
      'Falha', 'Data da falha', 'Recebido na base por', 'Assinado por', 'Entregadores que saíram com o pacote', 'Observação'])];
    for (const i of itens) {
      linhas.push(linha([
        i.codigo, i.culpado || '', TIPOS[i.tipo] || '', i.base || '',
        i.evidencia ? i.evidencia.texto : '', i.evidencia ? i.evidencia.data : '',
        i.falha ? i.falha.motivo : '', i.falha ? i.falha.data : '',
        i.recebidoPor || '', i.assinadoPor || '', (i.entregadores || []).join(', '), observacao(i),
      ]));
    }
    return linhas.join('\r\n');
  }

  function montarCsvResumo(itens) {
    const linhas = [linha(['Culpado', 'Tipo', 'Quantidade', 'Pedidos'])];
    for (const g of resumir(itens)) linhas.push(linha([g.culpado, TIPOS[g.tipo] || '', g.pedidos.length, g.pedidos.join(', ')]));
    return linhas.join('\r\n');
  }

  function dividirEmLotes(lista, tamanho) {
    const n = Math.max(1, Math.floor(Number(tamanho)) || 1);
    const lotes = [];
    for (let i = 0; i < lista.length; i += n) lotes.push(lista.slice(i, i + n));
    return lotes;
  }

  // Cada lote sai junto e o proximo espera intervaloMs desde o inicio do anterior.
  function tempoEstimado(qtd, lote, intervaloMs) {
    if (!qtd) return '';
    const segundos = (Math.ceil(qtd / Math.max(1, lote)) * intervaloMs) / 1000;
    return segundos < 60 ? 'menos de 1 min' : `uns ${Math.ceil(segundos / 60)} min`;
  }

  const api = {
    lerCodigos, classificar, analisar, resumir, observacao, montarCsv, montarCsvResumo, dividirEmLotes, tempoEstimado,
    TIPOS, SITUACOES,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.XMPerdasRegras = api;
})();
