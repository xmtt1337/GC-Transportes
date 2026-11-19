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
//
// Entregador responsavel: o login X passa pela Conversao de nomes do sistema (fundo.js);
// a base vira a unidade dela (UNIDADES).

(() => {
  const TIPOS = {
    entregador: 'Entregador',
    base: 'Base',
    nao_identificado: 'Não identificado',
    erro: 'Erro',
  };

  // Final do codigo da base no rastreio (ex.: SC-W-D073) -> quem responde por ela.
  const UNIDADES = {
    D073: 'Terceirizado Joaçaba',
    D026: 'Caçador',
    D047: 'Terceirizada Videira',
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

  const SEM_RESPONSAVEL = {
    sem_conversao: 'Login sem conversão no sistema (Conversões › Usuário → Entregador)',
    ambiguo: 'Login com mais de um entregador na Conversão de nomes',
    sem_login: 'Entregador responsável não buscado: entre no sistema na extensão',
  };
  const SEM_NOME = '(sem nome no rastreio)';

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

  function unidadeDaBase(base) {
    const m = /(D\d{3})\s*$/i.exec(String(base || ''));
    return (m && UNIDADES[m[1].toUpperCase()]) || '';
  }

  // "14-10-2026 10:07:15" -> "2026-10-14"
  function diaIso(data) {
    const m = /^(\d{2})-(\d{2})-(\d{4})/.exec(String(data || '').trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
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
      tipo: 'nao_identificado', culpado: '', responsavel: '', base: '', unidade: '', recebidoPor: '',
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

    if (iPosse >= 0) {
      const posse = antes[iPosse];
      resultado.evidencia = { data: posse.data, texto: posse.texto };
      if (posse.tipo === 'saida') {
        resultado.tipo = 'entregador';
        resultado.culpado = posse.entregador || SEM_NOME;
      } else {
        resultado.tipo = 'base';
        resultado.base = posse.base;
        resultado.culpado = posse.base ? `Base ${posse.base}` : 'Base (sem código no rastreio)';
        resultado.recebidoPor = posse.pessoa;
      }
    } else if (resultado.situacao === 'ok') {
      resultado.situacao = 'nao_identificado';
    }
    resultado.unidade = unidadeDaBase(resultado.base);
    if (resultado.tipo === 'base') resultado.responsavel = resultado.unidade;
    return resultado;
  }

  // ── entregador responsavel (Conversao de nomes do sistema) ─────────────────
  const temLogin = (i) => i.tipo === 'entregador' && i.culpado && i.culpado !== SEM_NOME;
  const chaveConversao = (login, dia) => `${String(login).toLowerCase()}|${dia || ''}`;

  // O que perguntar ao sistema: login de cada culpado entregador, com o dia em que saiu.
  function pedidosDeConversao(itens) {
    const vistos = new Map();
    for (const i of itens) {
      if (!temLogin(i)) continue;
      const dia = diaIso(i.evidencia && i.evidencia.data);
      vistos.set(chaveConversao(i.culpado, dia), { login: i.culpado, dia });
    }
    return [...vistos.values()];
  }

  // respostas: [{ login, dia, entregador, ambiguo }] do sistema; null = nao deu para buscar.
  function aplicarConversao(itens, respostas) {
    const mapa = new Map((respostas || []).map((r) => [chaveConversao(r.login, r.dia), r]));
    for (const i of itens) {
      if (!temLogin(i)) continue;
      if (!respostas) {
        if (!i.responsavel) i.semResponsavel = 'sem_login';
        continue;
      }
      const r = mapa.get(chaveConversao(i.culpado, diaIso(i.evidencia && i.evidencia.data)));
      i.responsavel = (r && r.entregador) || '';
      if (i.responsavel) delete i.semResponsavel;
      else i.semResponsavel = r && r.ambiguo ? 'ambiguo' : 'sem_conversao';
    }
    return itens;
  }

  // itens: [{ codigo, situacao, ...analise, erro }]. Agrupa pelo responsavel (varios logins do
  // mesmo entregador viram uma linha); sem responsavel, pelo culpado.
  function resumir(itens) {
    const grupos = new Map();
    for (const i of itens) {
      if (!i.culpado) continue;
      const nome = i.responsavel || i.culpado;
      const chave = `${i.tipo}|${nome}`;
      if (!grupos.has(chave)) grupos.set(chave, { tipo: i.tipo, nome, culpados: [], pedidos: [] });
      const g = grupos.get(chave);
      if (!g.culpados.includes(i.culpado)) g.culpados.push(i.culpado);
      g.pedidos.push(i.codigo);
    }
    return [...grupos.values()].sort((a, b) => b.pedidos.length - a.pedidos.length || a.nome.localeCompare(b.nome));
  }

  function observacao(i) {
    const partes = [];
    if (i.situacao === 'erro') partes.push(`Erro: ${i.erro || 'sem mensagem'}`);
    else if (SITUACOES[i.situacao]) partes.push(SITUACOES[i.situacao]);
    if (i.tipo === 'entregador' && !i.responsavel && SEM_RESPONSAVEL[i.semResponsavel]) partes.push(SEM_RESPONSAVEL[i.semResponsavel]);
    if (i.tipo === 'base' && !i.responsavel) partes.push('Base sem unidade cadastrada na extensão');
    if (i.depois) partes.push(`Teve movimento depois da falha: ${i.depois}`);
    return partes.join(' | ');
  }

  const baseComUnidade = (i) => (i.base ? (i.unidade ? `${i.base} (${i.unidade})` : i.base) : '');
  const aspas = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const linha = (valores) => valores.map(aspas).join(';');

  function montarCsv(itens) {
    const linhas = [linha(['Pedido', 'Culpado', 'Entregador responsável', 'Tipo', 'Base', 'Por quê (último evento antes da falha)',
      'Data desse evento', 'Falha', 'Data da falha', 'Recebido na base por', 'Assinado por', 'Entregadores que saíram com o pacote',
      'Observação'])];
    for (const i of itens) {
      linhas.push(linha([
        i.codigo, i.culpado || '', i.responsavel || '', TIPOS[i.tipo] || '', baseComUnidade(i),
        i.evidencia ? i.evidencia.texto : '', i.evidencia ? i.evidencia.data : '',
        i.falha ? i.falha.motivo : '', i.falha ? i.falha.data : '',
        i.recebidoPor || '', i.assinadoPor || '', (i.entregadores || []).join(', '), observacao(i),
      ]));
    }
    return linhas.join('\r\n');
  }

  function montarCsvResumo(itens) {
    const linhas = [linha(['Entregador responsável', 'Tipo', 'Quantidade', 'Culpado no rastreio', 'Pedidos'])];
    for (const g of resumir(itens)) {
      linhas.push(linha([g.nome, TIPOS[g.tipo] || '', g.pedidos.length, g.culpados.join(', '), g.pedidos.join(', ')]));
    }
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
    lerCodigos, classificar, analisar, unidadeDaBase, diaIso, pedidosDeConversao, aplicarConversao, resumir, observacao,
    montarCsv, montarCsvResumo, dividirEmLotes, tempoEstimado, TIPOS, SITUACOES, UNIDADES,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.XMPerdasRegras = api;
})();
