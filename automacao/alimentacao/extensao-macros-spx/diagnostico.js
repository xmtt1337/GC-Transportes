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
    diz('menu todas as paginas', resumo(S.acharBotao('Select All in All Pages') ||
                                        S.folhaVisivelComTexto('Select All in All Pages')));
    diz('contador selecionadas', String(A.quantasSelecionadas()));
    linhas.push('');

    const setas = A.candidatosSeta();
    diz('candidatos a setinha', String(setas.length));
    setas.forEach((el, i) => diz(`  ${i + 1}`, caminho(el)));
    linhas.push('');

    const icones = A.candidatosIconePainel();
    diz('candidatos a icone do painel', String(icones.length));
    icones.forEach((el, i) => diz(`  ${i + 1}`, caminho(el)));

    const painel = A.acharPainelTarefas();
    diz('painel Ultima tarefa', painel ? 'ABERTO — ' + caminho(painel) : 'fechado');
    if (painel) {
      const tarefas = A.lerTarefas(painel);
      diz('  linhas lidas', String(tarefas.length));
      tarefas.forEach((t, i) =>
        diz(`  ${i + 1}`, `"${t.nome}" | ${t.quando} | ${t.pronto ? 'BAIXAR' : (t.progresso || 'gerando')}`));
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
})(typeof window !== 'undefined' ? window : globalThis);
