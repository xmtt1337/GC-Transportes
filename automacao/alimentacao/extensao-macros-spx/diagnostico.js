// Relatorio de "o que eu consigo enxergar nesta tela".
//
// Serve pra quando o macro parar num passo: em vez de adivinhar qual seletor
// quebrou, o operador aperta Diagnostico, cola o texto na conversa e da pra
// consertar o ponto exato. O SPX muda de layout sem avisar, e quase sempre e
// um elemento so que saiu do lugar.
//
// So le a tela. Nao clica em nada, nao manda nada pra lugar nenhum.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;
  const S = G.spx;
  const A = G.alimentacao;

  function caminho(el) {
    if (!el) return '—';
    const partes = [];
    let n = el;
    for (let i = 0; i < 5 && n && n !== document.body; i++, n = n.parentElement) {
      if (n.id) { partes.unshift('#' + n.id); break; }
      const classes = (typeof n.className === 'string' ? n.className : '')
        .split(/\s+/)
        .filter((c) => c && !/[0-9a-f]{5,}/i.test(c))
        .slice(0, 2);
      partes.unshift(n.tagName.toLowerCase() + classes.map((c) => '.' + c).join(''));
    }
    return partes.join(' > ');
  }

  const resumo = (el) => el ? `achou  ${caminho(el)}` : 'NAO ACHOU';

  function diagnostico() {
    const p = L.partesDaData(new Date());
    const linhas = [];
    const diz = (rotulo, valor) => linhas.push(`${rotulo.padEnd(26)} ${valor}`);

    linhas.push('=== XM Macros - diagnostico da tela ===');
    // Sem isto nao da pra saber se a pessoa recarregou a extensao depois de
    // um conserto - e "continua igual" pode ser so a versao velha rodando.
    try { diz('versao da extensao', chrome.runtime.getManifest().version); } catch (e) { /* fora da extensao */ }
    diz('url', location.href);
    diz('hoje', `${p.dia}/${p.mes}/${p.ano}`);
    diz('espiao de rede', S.rede.viu ? `ligado (${S.rede.ativas} em voo)` : 'NAO REPORTOU');
    linhas.push('');

    const filtro = A.acharFiltroData('Horário de Criação');
    diz('filtro Horario de Criacao', filtro ? 'achou' : 'NAO ACHOU');
    if (filtro) {
      diz('  campo inicio', `placeholder="${filtro.inicio.placeholder}" valor="${filtro.inicio.value}"`);
      diz('  campo fim', `placeholder="${filtro.fim.placeholder}" valor="${filtro.fim.value}"`);
      diz('  caixa', caminho(filtro.caixa));
    }

    diz('botao Procurar', resumo(S.acharBotao('Procurar')));
    diz('botao Exportar AT', resumo(S.acharBotao('Exportar AT', { comeca: true })));
    diz('botao Exportar Romaneio', resumo(S.acharBotao('Exportar Romaneio', { comeca: true })));
    // O que o macro vai clicar de verdade. Com o menu fechado isto TEM que
    // dar "NAO ACHOU": achar algo aqui e o popup fantasma que fica no DOM.
    diz('menu todas as paginas', resumo(A.acharItemTodasPaginas()));
    diz('contador selecionadas', String(A.quantasSelecionadas()));
    linhas.push('');

    diz('checkbox do cabecalho', resumo(A.checkboxDoCabecalho()));
    for (const qual of ['seta', 'item']) {
      const seletor = G.aprender.seletorDe(qual);
      if (!seletor) { diz(`${qual} ensinado`, 'nada ensinado ainda'); continue; }
      const quantos = (() => { try { return document.querySelectorAll(seletor).length; } catch (e) { return -1; } })();
      diz(`${qual} ensinado`, `${seletor}`);
      diz('  ', `casa com ${quantos} | texto guardado: "${G.aprender.textoDe(qual) || '(nenhum)'}" ` +
                `| resolve pra ${G.aprender.elementosEnsinados(qual).length}`);
    }
    // Quantos elementos cada seletor pega e se eles passam nos filtros: e o
    // que diz se o problema e o seletor nao casar ou o filtro derrubar.
    for (const seletor of A.SELETORES_SETA) {
      const achados = [...document.querySelectorAll(seletor)];
      const primeiro = achados[0];
      diz(`  ${seletor}`, achados.length
        ? `${achados.length} — ${caminho(primeiro)} visivel=${S.visivel(primeiro)}`
        : '0');
    }
    const setas = A.candidatosSeta();
    diz('candidatos a setinha', String(setas.length));
    setas.forEach((el, i) => diz(`  ${i + 1}`, `${caminho(el)}  texto="${L.normalizar(el.textContent).slice(0, 12)}"`));
    linhas.push('');

    const icones = A.candidatosIconePainel();
    diz('candidatos a icone do painel', String(icones.length));
    icones.forEach((el, i) => diz(`  ${i + 1}`, caminho(el)));

    // Com o menu aberto (Alt+X), isto mostra se o item existe e se ele passa
    // nos testes do macro. E a resposta pra "o clique nao abriu" x "abriu e eu
    // nao enxerguei" - as duas falham igual na tela.
    linhas.push('');
    const comTexto = [];
    for (const el of document.querySelectorAll('*')) {
      const t = L.normalizar(el.textContent);
      if (t.length > 80 || !L.chave(t).includes('select all')) continue;
      comTexto.push(el);
    }
    diz('elementos com "select all"', String(comTexto.length));
    comTexto.slice(0, 6).forEach((el, i) =>
      diz(`  ${i + 1}`, `"${L.normalizar(el.textContent).slice(0, 34)}" visivel=${S.visivel(el)} ` +
                        `caixa=${el.getClientRects().length > 0} ${caminho(el)}`));

    // ── tela de Rastreio de pedidos (macro 2) ────────────────────────────
    if (location.href.includes('orderTracking') || G.pedidos.acharDialogoDeLote()) {
      linhas.push('');
      const D = G.pedidos;
      diz('botao Pesquisa em lote', resumo(S.acharBotao(D.TEXTO_LOTE) ||
                                          S.folhaVisivelComTexto(D.TEXTO_LOTE)));
      const dialogo = D.acharDialogoDeLote();
      diz('dialogo da Pesquisa em lote', dialogo ? 'ABERTO — ' + caminho(dialogo) : 'fechado');
      const caixa = D.acharCaixaDeLote(dialogo);
      diz('caixa dos codigos', caixa
        ? `${caminho(caixa)} placeholder="${(caixa.placeholder || '').slice(0, 40)}"`
        : 'NAO ACHOU');
      diz('botao Exportar', resumo(S.acharBotao(D.TEXTO_EXPORTAR)));
      diz('item Exportar pesquisados', resumo(D.acharItemExportar()));
      // Todo campo grande da tela, pra flagrar o que quase levou os codigos
      // por engano: o Shop ID tambem e um textarea.
      const grandes = [...document.querySelectorAll('textarea')].filter(S.visivel);
      diz('textareas visiveis na tela', String(grandes.length));
      grandes.slice(0, 5).forEach((el, i) =>
        diz(`  ${i + 1}`, `placeholder="${(el.placeholder || '').slice(0, 30)}" ` +
                          `dentro de dialogo=${!!el.closest('[role="dialog"], [class*="modal"], [class*="dialog"], [class*="popup"]')} ` +
                          `${caminho(el)}`));
    }

    const painel = A.acharPainelTarefas();
    diz('painel Ultima tarefa', painel ? 'ABERTO — ' + caminho(painel) : 'fechado');
    if (painel) {
      const tarefas = A.lerTarefas(painel);
      diz('  linhas lidas', String(tarefas.length));
      tarefas.forEach((t, i) =>
        diz(`  ${i + 1}`, `"${t.nome}" | ${t.quando} | ` +
                          `${t.pronto ? 'BAIXAR' : (t.progresso || 'gerando')} | caixa: ${caminho(t.el)}`));
    }

    linhas.push('');
    const grades = [...document.querySelectorAll('table')]
      .filter((t) => S.visivel(t) && t.querySelectorAll('td').length >= 28);
    diz('calendarios abertos', String(grades.length));

    const texto = linhas.join('\n');
    console.log(texto);
    return texto;
  }

  G.diagnostico = diagnostico;

  // ── atalhos ──────────────────────────────────────────────────────────────
  // Existem por um motivo especifico: abrir o popup da extensao TIRA O FOCO da
  // pagina e fecha o menu do SPX. Ou seja, pelo popup e impossivel fotografar
  // a tela com o menu aberto - que e justamente o estado que interessa quando
  // o macro para no "Select All in All Pages".
  //
  //   Alt+X  copia o diagnostico
  //   Alt+S  ensinar a Setinha
  //   Alt+M  ensinar o item do Menu (com o menu aberto)
  async function copiarDiagnostico() {
    const texto = diagnostico();
    try {
      await navigator.clipboard.writeText(texto);
      G.aprender.faixa('Diagnóstico copiado — é só colar na conversa.', '#16a34a');
    } catch (e) {
      // Sem permissao de area de transferencia o console resolve.
      G.aprender.faixa('Não consegui copiar — abra o F12 &gt; Console, está impresso lá.', '#b45309');
    }
    setTimeout(G.aprender.fecharFaixa, 5000);
  }

  document.addEventListener('keydown', (evento) => {
    if (!evento.altKey || evento.ctrlKey || evento.metaKey) return;
    const tecla = String(evento.key || '').toLowerCase();
    if (tecla === 'x') copiarDiagnostico();
    else if (tecla === 's') G.aprender.ensinar('seta');
    else if (tecla === 'm') G.aprender.ensinar('item');
    else return;
    evento.preventDefault();
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
