// MACRO: AT EXPORTADA
//
// ESCOPO: so a tela Entrega > Atribuicao de Entrega do SPX, alimentando
// Alimentar > AT Exportada no sistema. Nao faz Romaneiro nem nenhuma outra
// alimentacao - esses sao outros macros, quando existirem. Esta escrito aqui
// porque "alimentacao" sozinho sugere que ele cobre tudo, e nao cobre.
//
// Faz, na ordem:
//   1. poe a data de HOJE nos dois campos de "Horario de Criacao"
//   2. clica em Procurar
//   3. abre a setinha do cabecalho e marca "Select All in All Pages"
//   4. clica em Exportar AT
//   5. espera o "Br Assignment Task" ficar pronto no painel Ultima tarefa e
//      baixa ELE - nao o "Br AT Romaneio V2", nem o da rodada de ontem
//
// O passo 5 e o unico que pode errar em silencio: os dois relatorios abrem no
// Excel do mesmo jeito, e so os numeros denunciam. Por isso o painel e lido
// ANTES do clique em Exportar: o relatorio certo e, por definicao, o que nao
// estava la.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;
  const S = G.spx;
  const P = G.painel;

  const TELA = '#/delivery-assignment/list';
  const ROTULO_DATA = 'Horário de Criação';
  const TEXTO_TODAS_PAGINAS = 'Select All in All Pages';
  const ESPERA_RELATORIO_MS = 30 * 60 * 1000;

  let rodando = false;

  // Como se sabe que a tela carregou.
  //
  // NAO serve o filtro de data: ele fica escondido quando o painel de filtros
  // esta recolhido, que e o estado normal - e ai o macro espera pra sempre por
  // algo que so aparece depois de ele mesmo clicar em "Mais". O que esta
  // sempre na tela e o botao de buscar.
  const achouATela = () => !!(S.acharBotao('Procurar') || S.acharBotao('Search') ||
                              S.acharBotao('Buscar'));

  // ── achar coisas na tela ───────────────────────────────────────────────
  function folhaComRegex(re, opcoes) {
    const o = opcoes || {};
    for (const el of (o.dentro || document).querySelectorAll('*')) {
      if (el.children.length) continue;
      if (!S.visivel(el)) continue;
      const m = L.normalizar(el.textContent).match(re);
      if (!m) continue;
      if (o.filtro && !o.filtro(el)) continue;
      return { el, m };
    }
    return null;
  }

  const ehInicio = (c) => /in[ií]cio|inicio|start/i.test(c.placeholder || '');
  const ehFim = (c) => /final|fim|end/i.test(c.placeholder || '');

  function depoisDe(referencia, lista) {
    return lista.find((el) =>
      referencia.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) || null;
  }

  // O par de campos de data que pertence a ESTE rotulo.
  //
  // A tela tem tres filtros de periodo iguais lado a lado (Data de Entrega,
  // Horario Designado ao Motorista, Horario de Criacao) e nenhum deles tem id.
  // O caminho e subir do rotulo ate a primeira caixa que tenha os dois campos;
  // se essa caixa engoliu o filtro vizinho, vale o par que vem DEPOIS do rotulo
  // na ordem da pagina.
  function acharFiltroData(rotulo) {
    for (const r of S.folhasComTexto(rotulo).filter(S.visivel)) {
      let caixa = r.parentElement;
      for (let i = 0; i < 8 && caixa; i++, caixa = caixa.parentElement) {
        const campos = [...caixa.querySelectorAll('input')].filter(S.visivel);
        const inicios = campos.filter(ehInicio);
        const fins = campos.filter(ehFim);
        if (!inicios.length || !fins.length) continue;
        return {
          inicio: depoisDe(r, inicios) || inicios[0],
          fim: depoisDe(r, fins) || fins[0],
          caixa,
        };
      }
    }
    return null;
  }

  // O "Mais" que abre o resto dos filtros. Com prefixo tambem, porque o rotulo
  // costuma vir com a setinha grudada ("Mais ˅").
  const TEXTOS_MAIS = ['Mais', 'More', 'Expandir', 'Mostrar mais'];

  function acharMaisFiltros() {
    for (const texto of TEXTOS_MAIS) {
      const b = S.acharBotao(texto) || S.folhaVisivelComTexto(texto) ||
                S.acharBotao(texto, { comeca: true });
      if (b) return b;
    }
    return null;
  }

  async function abrirMaisFiltros() {
    const b = acharMaisFiltros();
    if (!b) return false;
    S.clicar(b);
    await S.dormir(700);
    return true;
  }

  // ── 1. data de hoje ────────────────────────────────────────────────────
  // Todo o texto do cabecalho do calendario, sem o que esta dentro da grade.
  // Sem essa separacao o painel de outubro passa por setembro: a grade dele
  // tambem tem um "09" escrito (o dia 9), e ai qualquer teste de mes acerta.
  function cabecalhoDoMes(caixa, tabela) {
    const partes = [];
    const it = document.createTreeWalker(caixa, NodeFilter.SHOW_TEXT);
    let no;
    while ((no = it.nextNode())) {
      if (tabela.contains(no)) break;
      const t = L.normalizar(no.nodeValue);
      if (t) partes.push(t);
    }
    return partes.join(' ');
  }

  function acharPainelDoMes(p) {
    const grades = [...document.querySelectorAll('table')]
      .filter((t) => S.visivel(t) && t.querySelectorAll('td').length >= 28);
    for (const tabela of grades) {
      let caixa = tabela.parentElement;
      for (let i = 0; i < 4 && caixa; i++, caixa = caixa.parentElement) {
        const cabecalho = cabecalhoDoMes(caixa, tabela);
        if (cabecalho.length <= 40 && L.mesCombina(cabecalho, p)) return { tabela, caixa };
      }
    }
    return null;
  }

  function celulaDoDia(tabela, p) {
    const celulas = [...tabela.querySelectorAll('td')];

    const porAtributo = celulas.find((td) =>
      ['title', 'data-date', 'aria-label'].some((a) => {
        const v = td.getAttribute(a);
        return v && L.dataConfere(v, p);
      }));
    if (porAtributo) return porAtributo;

    // Sem atributo sobra a posicao. O texto sozinho nao serve: a grade tem 6
    // semanas inteiras, entao as pontas sao dias do mes vizinho.
    for (const primeiroDia of [0, 1]) {
      const i = L.indiceNaGrade(p.anoNumero, p.mesNumero, p.diaNumero, primeiroDia);
      const td = celulas[i];
      if (td && Number(L.normalizar(td.textContent)) === p.diaNumero) return td;
    }
    return null;
  }

  function miolo(td) {
    let el = td;
    while (el.children.length === 1) el = el.children[0];
    return el;
  }

  async function clicarDia(p) {
    const painelMes = acharPainelDoMes(p);
    if (!painelMes) return false;
    const td = celulaDoDia(painelMes.tabela, p);
    if (!td) return false;
    S.clicar(miolo(td));
    await S.dormir(400);
    return true;
  }

  async function porDataPeloCalendario(filtro, p) {
    S.clicar(filtro.inicio);
    await S.dormir(500);
    if (!(await clicarDia(p))) return false;

    // depois do primeiro clique o calendario ja espera o fim do periodo; se
    // tiver fechado, e so reabrir pelo outro campo
    if (!acharPainelDoMes(p)) {
      S.clicar(filtro.fim);
      await S.dormir(500);
    }
    if (!(await clicarDia(p))) return false;

    // Alguns pickers so confirmam no OK. A busca fica presa ao calendario que
    // ainda esta aberto: um "OK" solto na tela seria de outra caixa qualquer.
    const aberto = acharPainelDoMes(p);
    if (aberto) {
      const ok = S.acharBotao('OK', { dentro: aberto.caixa.parentElement || aberto.caixa });
      if (ok) { S.clicar(ok); await S.dormir(400); }
    }

    await S.dormir(300);
    return L.dataConfere(filtro.inicio.value, p) && L.dataConfere(filtro.fim.value, p);
  }

  async function porDataDigitando(filtro, p) {
    for (const formato of L.FORMATOS_DATA) {
      const texto = formato(p);
      S.clicar(filtro.inicio);
      await S.dormir(200);
      S.escrever(filtro.inicio, texto);
      await S.dormir(250);
      S.apertarEnter(filtro.inicio);
      await S.dormir(350);

      S.clicar(filtro.fim);
      await S.dormir(200);
      S.escrever(filtro.fim, texto);
      await S.dormir(250);
      S.apertarEnter(filtro.fim);
      await S.dormir(500);

      if (L.dataConfere(filtro.inicio.value, p) && L.dataConfere(filtro.fim.value, p)) {
        P.nota(`formato aceito: ${texto}`);
        return true;
      }
    }
    return false;
  }

  async function porDataDeHoje() {
    const p = L.partesDaData(new Date());
    let filtro = acharFiltroData(ROTULO_DATA);
    if (!filtro) {
      // O painel de filtros vem recolhido, e este filtro esta na parte
      // escondida. Nao e excecao: e o estado normal da tela.
      P.nota('abrindo o resto dos filtros');
      if (await abrirMaisFiltros()) {
        filtro = await S.esperar(() => acharFiltroData(ROTULO_DATA), {
          oque: `o filtro "${ROTULO_DATA}" aparecer`, limite: 12000, intervalo: 300,
        }).catch(() => null);
      }
    }
    if (!filtro) throw new Error(`não achei o filtro "${ROTULO_DATA}" na tela`);

    if (L.dataConfere(filtro.inicio.value, p) && L.dataConfere(filtro.fim.value, p)) {
      P.nota(`já estava em ${p.dia}/${p.mes}/${p.ano}`);
      return;
    }

    if (await porDataPeloCalendario(filtro, p)) {
      P.nota(`${p.dia}/${p.mes}/${p.ano} até ${p.dia}/${p.mes}/${p.ano}`);
      return;
    }
    P.nota('calendário não deu — digitando a data');
    if (await porDataDigitando(filtro, p)) {
      P.nota(`${p.dia}/${p.mes}/${p.ano} até ${p.dia}/${p.mes}/${p.ano}`);
      return;
    }
    throw new Error(`não consegui pôr a data de hoje em "${ROTULO_DATA}"`);
  }

  // ── 2. procurar ────────────────────────────────────────────────────────
  async function procurar() {
    const botao = S.acharBotao('Procurar') || S.acharBotao('Search') || S.acharBotao('Buscar');
    if (!botao) throw new Error('não achei o botão "Procurar"');
    const base = S.rede.ativas;
    S.clicar(botao);
    await S.dormir(700);
    await S.esperarRede({ base, limite: 90000 });
    await S.dormir(700);

    const total = folhaComRegex(/^total:\s*([\d.,]+)/i);
    if (!total) return null;
    P.nota(`${total.m[1]} tarefas no período`);
    return Number(total.m[1].replace(/[.,]/g, ''));
  }

  // ── 3. marcar tudo ─────────────────────────────────────────────────────
  // A setinha fica colada no checkbox do cabecalho e nao tem id, nome nem
  // texto que sirva de ancora. O que se sabe dela e a POSICAO: ela encosta no
  // checkbox, do lado direito.
  //
  // Por isso o primeiro palpite e elementFromPoint, que devolve o que o mouse
  // acertaria naquele ponto - seja svg, span ou um "^" escrito. Procurar por
  // "icone sem texto" errava justamente quando a seta e um caractere.
  // O checkbox do cabecalho da tabela.
  //
  // NAO da pra procurar por input[type=checkbox] visivel: o design system do
  // SPX (ssc-react) deixa o input de verdade com opacity 0 atras de um span
  // desenhado - foi por isso que a primeira versao achava zero candidato e
  // nem chegava a procurar a setinha. Quem tem caixa na tela e o span.
  function checkboxDoCabecalho() {
    const dentro = document.querySelector('[class*="pro-table"], table') || document;
    const achados = [];
    for (const el of dentro.querySelectorAll('[class*="checkbox"], input[type="checkbox"]')) {
      if (!S.visivel(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.width > 44 || r.height < 6 || r.height > 44) continue;
      achados.push({ el, topo: r.top });
    }
    achados.sort((a, b) => a.topo - b.topo);
    return achados.length ? achados[0].el : null;   // o mais alto e o do cabecalho
  }

  // Onde a seta mora hoje, do mais especifico pro mais generico. O primeiro e
  // o que o SPX usa agora; os outros sao grafias do mesmo componente, pra
  // aguentar uma renomeacao sem virar caca ao tesouro de novo.
  const SELETORES_SETA = [
    '[class*="table-row-selection"] [class*="icon-down"]',
    '[class*="selection-extra"]',
    '[class*="selection-column"] [class*="dropdown"]',
    '[class*="pro-table"] [class*="dropdown-trigger"]',
  ];

  function candidatosSeta() {
    const saida = [];
    // O que a pessoa ensinou vem primeiro: ela viu a tela, eu nao.
    //
    // Com os dois pais junto: quem clica acerta o desenho (o <svg>), mas quem
    // escuta o clique costuma ser o <span> de fora. O evento borbulha, entao
    // na maioria das vezes tanto faz - mas quando nao faz, e por isso.
    for (const el of G.aprender.elementosEnsinados('seta')) {
      if (!el) continue;
      for (const alvo of [el, el.parentElement, el.parentElement && el.parentElement.parentElement]) {
        if (alvo && !saida.includes(alvo) && !/^(th|td|tr)$/i.test(alvo.tagName)) saida.push(alvo);
      }
    }
    // Quando o seletor nomeia o elemento, ele vale por si: os filtros abaixo
    // sao pra PALPITE, e aplicar eles no alvo nomeado ja custou uma rodada -
    // derrubaram justamente a seta que o seletor tinha achado.
    //
    // No palpite eles ficam, porque ali a vizinhanca e perigosa: o checkbox
    // marca so a pagina atual (export sai pela metade) e o cabecalho de
    // coluna ordena a tabela e recarrega tudo. Nenhum dos dois abre menu.
    const juntar = (el, nomeado) => {
      if (!el || saida.includes(el)) return;
      if (/^(th|td|tr|table|thead|tbody)$/i.test(el.tagName)) return;
      if (!nomeado) {
        if (el.closest('[class*="checkbox"]')) return;
        if (L.normalizar(el.textContent) !== '') return;
        if (!S.visivel(el)) return;
      }
      saida.push(el);
    };

    for (const seletor of SELETORES_SETA) {
      for (const el of document.querySelectorAll(seletor)) {
        juntar(el, true);
        juntar(el.parentElement, true);   // o gatilho costuma ser o span de fora
      }
    }

    // Reserva: o que o mouse acertaria logo a direita do checkbox.
    const cabecalho = checkboxDoCabecalho();
    if (cabecalho) {
      const borda = cabecalho.getBoundingClientRect();
      const meio = borda.top + borda.height / 2;
      for (const dx of [9, 14, 19, 24]) {
        juntar(document.elementFromPoint(borda.right + dx, meio));
      }
    }
    return saida.slice(0, 8);
  }

  // Casa por texto inteiro e, se nao achar, por "contem" - o SPX as vezes
  // pendura um contador ou um icone dentro do mesmo item do menu.
  function acharItemTodasPaginas() {
    // Ensinado primeiro, mas so quando o menu esta mesmo aberto: o popup do
    // SPX fica no DOM depois de fechado, com caixa e tudo - quem carrega o
    // "escondido" e um pai, e so checkVisibility enxerga isso.
    const ensinado = G.aprender.elementosEnsinados('item').find(S.visivel);
    if (ensinado) return ensinado;
    const exato = S.acharBotao(TEXTO_TODAS_PAGINAS) || S.folhaVisivelComTexto(TEXTO_TODAS_PAGINAS);
    if (exato) return exato;

    // Ultimo recurso: casar por "contem". Com um limite de tamanho junto, que
    // nao e detalhe - o popup do SPX fica no DOM depois de fechado e o
    // container de fora continua visivel, com o texto dos DOIS itens grudado
    // ("Select All in Current PageSelect All in All Pages"). Sem o limite ele
    // vencia essa busca com o menu ainda fechado, e o macro clicava nesse
    // container - que nao faz nada - em vez de abrir o menu.
    const alvo = L.chave(TEXTO_TODAS_PAGINAS);
    const tetoDeTexto = TEXTO_TODAS_PAGINAS.length + 10;
    const achados = [];
    for (const el of document.querySelectorAll('*')) {
      const texto = L.normalizar(el.textContent);
      if (texto.length > tetoDeTexto) continue;
      if (!L.chave(texto).includes(alvo)) continue;
      if (!S.visivel(el)) continue;
      achados.push({ el, tamanho: texto.length });
    }
    achados.sort((a, b) => a.tamanho - b.tamanho);
    return achados.length ? achados[0].el : null;
  }

  // "0 Task(s) Selected" nao mora num elemento so: o numero vem num span e o
  // resto em outro. Procurar so em folha com o texto inteiro devolvia nada, e
  // a espera do contador estourava mesmo com a selecao tendo dado certo.
  // Por isso aqui vale qualquer elemento - e fica o de texto mais curto, que
  // e o que embrulha exatamente essa frase.
  function quantasSelecionadas() {
    const padrao = /(?:^|\s)([\d.,]+)\s*task\(s\)\s*selected/i;
    let melhor = null;
    for (const el of document.querySelectorAll('*')) {
      const texto = L.normalizar(el.textContent);
      if (texto.length > 60) continue;
      const casou = texto.match(padrao);
      if (!casou || !S.visivel(el)) continue;
      if (!melhor || texto.length < melhor.texto.length) melhor = { texto, numero: casou[1] };
    }
    return melhor ? Number(melhor.numero.replace(/[.,]/g, '')) : null;
  }

  async function selecionarTodasPaginas(total) {
    let item = acharItemTodasPaginas();
    if (!item) {
      for (const seta of candidatosSeta()) {
        S.clicar(seta);
        await S.dormir(650);
        item = acharItemTodasPaginas();
        if (item) break;
        S.apertarEsc();
        await S.dormir(250);
      }
    }
    if (!item) {
      throw new Error(`não achei "${TEXTO_TODAS_PAGINAS}". No popup da extensão, ` +
                      'clique em "Ensinar a setinha" e depois na setinha do cabeçalho.');
    }
    const base = S.rede.ativas;
    S.clicar(item);
    await S.dormir(700);
    await S.esperarRede({ base, limite: 60000 });

    // Espera chegar ao TOTAL, nao so sair do zero.
    //
    // Uma tentativa anterior que marcou a pagina atual deixa o contador em 20
    // antes mesmo deste clique; aceitar "maior que zero" devolveria esse 20 na
    // hora e o macro seguiria exportando um terco do dia. Quem decide e o
    // numero que a busca achou.
    let n = null;
    try {
      n = await S.esperar(() => {
        const q = quantasSelecionadas();
        return q && (!total || q >= total) ? q : null;
      }, {
        oque: total ? `o contador chegar a ${total}` : 'o contador "Task(s) Selected" sair do zero',
        limite: 60000,
        intervalo: 400,
      });
    } catch (e) {
      const q = quantasSelecionadas();
      // Marcou so a pagina atual: o clique pegou "Select All in Current Page"
      // ou o proprio checkbox. E o erro caro - o arquivo abriria normalmente,
      // so que com um pedaco do dia.
      if (q) throw new Error(`marcou ${q} de ${total} — pegou só a página atual, não todas`);
      throw e;
    }
    P.nota(`${n} selecionadas`);
  }

  // ── 4. exportar ────────────────────────────────────────────────────────
  const TEXTOS_CONFIRMA = ['OK', 'Ok', 'Confirmar', 'Confirm', 'Sim', 'Yes', 'Exportar', 'Export'];

  async function confirmarSeAparecer() {
    const dialogos = [...document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="dialog"]')]
      .filter(S.visivel);
    for (const d of dialogos) {
      for (const texto of TEXTOS_CONFIRMA) {
        const b = S.acharBotao(texto, { dentro: d });
        if (b && !S.desabilitado(b)) {
          P.nota(`confirmando "${L.normalizar(b.textContent)}"`);
          S.clicar(b);
          await S.dormir(700);
          return true;
        }
      }
    }
    return false;
  }

  async function exportarAt() {
    const botao = await S.esperar(() => {
      const b = S.acharBotao('Exportar AT', { comeca: true }) ||
                S.acharBotao('Export AT', { comeca: true });
      return b && !S.desabilitado(b) ? b : null;
    }, { oque: 'o botão "Exportar AT" liberar', limite: 45000 });

    const base = S.rede.ativas;
    S.clicar(botao);
    await S.dormir(900);
    await confirmarSeAparecer();
    await S.esperarRede({ base, limite: 60000 });
  }

  // ── 5. painel Ultima tarefa ────────────────────────────────────────────
  const NOMES_DO_PAINEL = ['Última tarefa', 'Ultima tarefa', 'Latest Task', 'Last task'];

  function acharPainelTarefas() {
    let titulo = null;
    for (const nome of NOMES_DO_PAINEL) {
      titulo = S.folhaVisivelComTexto(nome);
      if (titulo) break;
    }
    if (!titulo) return null;
    let caixa = titulo.parentElement;
    for (let i = 0; i < 8 && caixa; i++, caixa = caixa.parentElement) {
      if (L.chave(caixa.textContent).includes('exportar')) return caixa;
    }
    return titulo.parentElement;
  }

  // O icone do painel fica no topo, entre o sininho e o seletor de idioma.
  // Nenhum dos dois tem texto, entao a ancora possivel e o idioma: o que
  // interessa esta a esquerda dele.
  function candidatosIconePainel() {
    const idioma = folhaComRegex(/^(portugu[êe]s|english|bahasa|ti[ếe]ng|中文)/i, {
      filtro: (el) => el.getBoundingClientRect().top < 120,
    });
    const limiteX = idioma
      ? idioma.el.getBoundingClientRect().left
      : raiz.innerWidth;

    const vistos = new Set();
    const saida = [];
    for (const el of document.querySelectorAll('svg, i, [class*="icon"], button, [role="button"]')) {
      if (!S.visivel(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top > 120 || r.width < 8 || r.width > 48 || r.height < 8 || r.height > 48) continue;
      if (r.right > limiteX + 6) continue;
      if (r.left < raiz.innerWidth * 0.5) continue;
      const alvo = el.closest('button, [role="button"], [class*="icon"]') || el;
      if (vistos.has(alvo)) continue;
      vistos.add(alvo);
      saida.push({ el: alvo, x: alvo.getBoundingClientRect().left });
    }
    saida.sort((a, b) => b.x - a.x);   // do mais perto do idioma pra esquerda
    return saida.slice(0, 5).map((c) => c.el);
  }

  async function abrirPainelTarefas() {
    const jaAberto = acharPainelTarefas();
    if (jaAberto) return jaAberto;
    for (const icone of candidatosIconePainel()) {
      S.clicar(icone);
      await S.dormir(650);
      const painel = acharPainelTarefas();
      if (painel) return painel;
      S.apertarEsc();
      await S.dormir(250);
    }
    return null;
  }

  async function fecharPainelTarefas() {
    if (!acharPainelTarefas()) return;
    S.apertarEsc();
    await S.dormir(350);
    if (!acharPainelTarefas()) return;
    // Esc nem sempre fecha esse tipo de dropdown; um clique no vazio do topo
    // resolve sem acertar nenhum botao da tela.
    S.clicar(document.body);
    await S.dormir(350);
  }

  const CARIMBOS = /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/g;
  const quantosCarimbos = (texto) => (texto.match(CARIMBOS) || []).length;

  const temAcao = (caixa) =>
    !!(S.acharBotao('Baixar', { dentro: caixa }) ||
       S.acharBotao('Download', { dentro: caixa }) ||
       /\d{1,3}\s*%/.test(L.normalizar(caixa.textContent)));

  function lerTarefas(painel) {
    const linhas = [];
    const vistos = new Set();
    for (const el of painel.querySelectorAll('*')) {
      if (el.children.length) continue;
      const quando = L.normalizar(el.textContent);
      if (!L.EH_MOMENTO.test(quando)) continue;

      // Sobe ate a caixa que tem o carimbo E o que fazer com ele.
      //
      // Parar no primeiro ancestral com texto pegava so o bloquinho de
      // "nome + data": o botao Baixar fica na coluna ao lado, fora dele, e a
      // linha era lida como "ainda gerando" com o arquivo pronto na tela.
      //
      // Quem diz que ja subiu demais e o numero de carimbos: dois significa
      // que duas linhas foram engolidas na mesma caixa, e ai o nome e o botao
      // passam a ser de qualquer uma delas.
      let caixa = el.parentElement;
      let linha = null;
      let reserva = null;
      for (let i = 0; i < 7 && caixa; i++, caixa = caixa.parentElement) {
        const texto = L.normalizar(caixa.textContent);
        if (quantosCarimbos(texto) !== 1 || texto.length > 400) break;
        if (texto.length <= quando.length) continue;
        if (!reserva) reserva = caixa;
        if (temAcao(caixa)) { linha = caixa; break; }
      }
      linha = linha || reserva;
      if (!linha || vistos.has(linha)) continue;
      vistos.add(linha);

      const texto = L.normalizar(linha.textContent);
      const baixar = S.acharBotao('Baixar', { dentro: linha }) ||
                     S.acharBotao('Download', { dentro: linha });
      const porcento = texto.match(/(\d{1,3})\s*%/);
      linhas.push({
        nome: L.normalizar(texto.split(quando)[0]),
        quando,
        pronto: !!baixar,
        progresso: porcento ? porcento[1] + '%' : null,
        el: linha,
      });
    }
    return linhas;
  }

  async function lerTarefasAgora() {
    const painel = await abrirPainelTarefas();
    if (!painel) throw new Error('não consegui abrir o painel "Última tarefa"');
    return lerTarefas(painel);
  }

  // Quanto se espera pela tarefa APARECER no painel. Ela nasce logo, em 0%; o
  // que demora e ela ficar pronta. Separar os dois prazos distingue "ainda
  // gerando" de "o clique em Exportar nao chegou a pedir nada" - que antes
  // ficava meia hora parecendo trabalho em andamento.
  const ESPERA_NASCER_MS = 90 * 1000;

  async function esperarRelatorio(antes, nomeAlvo) {
    const comecou = Date.now();
    const fim = Date.now() + ESPERA_RELATORIO_MS;
    let avisado = '';
    let ultimoAviso = '';
    let reabertoEm = Date.now();

    for (;;) {
      const painel = await abrirPainelTarefas();
      if (!painel) throw new Error('o painel "Última tarefa" fechou e não abriu de novo');
      const agora = lerTarefas(painel);

      // Reprocura a cada volta em vez de guardar a linha achada na primeira.
      //
      // O carimbo da linha MUDA quando ela fica pronta: nasce com a hora do
      // pedido e passa pra hora em que terminou (18:38:21 -> 18:38:23). Fixar
      // a linha pelo carimbo era procurar por algo que deixa de existir, e o
      // macro ficava em "gerando..." pra sempre com o arquivo pronto na tela.
      const nova = L.escolherTarefaNova(antes, agora,
        nomeAlvo === undefined ? L.NOME_RELATORIO : nomeAlvo);
      if (nova) {
        if (nova.quando !== avisado) {
          P.nota(`relatório novo: ${nova.nome} — ${nova.quando}`);
          avisado = nova.quando;
        }
        if (nova.pronto) return nova;
        const aviso = nova.progresso || 'gerando…';
        if (aviso !== ultimoAviso) { P.nota(aviso); ultimoAviso = aviso; }
      } else if (Date.now() - comecou > ESPERA_NASCER_MS) {
        throw new Error('nenhum relatório novo apareceu no painel — ' +
                        'o clique em Exportar não chegou a pedir nada');
      }

      if (Date.now() > fim) {
        throw new Error('o relatório não ficou pronto em 30 min — baixe à mão no painel');
      }
      await S.dormir(3000);

      // Se o painel nao se atualizar sozinho, ficariamos olhando pro 0% pra
      // sempre. Fechar e abrir de novo forca o SPX a reconsultar.
      if (Date.now() - reabertoEm > 45000) {
        await fecharPainelTarefas();
        await S.dormir(400);
        reabertoEm = Date.now();
      }
    }
  }

  async function baixar(linha) {
    const botao = S.acharBotao('Baixar', { dentro: linha.el }) ||
                  S.acharBotao('Download', { dentro: linha.el });
    if (!botao) throw new Error('o relatório ficou pronto mas o botão "Baixar" sumiu');

    const barrados = S.download.bloqueados;
    S.clicar(botao);
    await S.dormir(2500);

    // O navegador barra janela aberta por clique de macro (nao ha "ativacao do
    // usuario"). rede.js contorna baixando por dentro da pagina; o que nao
    // pode e o macro dizer "baixado" sem contar que isso aconteceu.
    if (S.download.bloqueados > barrados) {
      const contornou = S.download.contornados > 0;
      P.nota(contornou
        ? 'o Chrome barrou a janela do download — baixei por dentro da página'
        : 'o Chrome barrou a janela do download e não consegui contornar');
      if (!contornou) {
        throw new Error('libere pop-ups para spx.shopee.com.br e rode de novo');
      }
      await S.dormir(2500);
    }
  }

  // ── o macro ────────────────────────────────────────────────────────────
  async function rodar() {
    if (rodando) { P.nota('já está rodando'); return; }
    rodando = true;
    S.parar = false;
    P.abrir('AT Exportada', () => { S.parar = true; });

    try {
      await G.aprender.carregar();

      P.passo('abrindo Entrega › Atribuição de Entrega');
      const mudou = await S.irParaTela(TELA, achouATela, 'Atribuição de Entrega');
      P.nota(mudou ? 'tela aberta' : 'já estava nela');

      P.passo('1/5 · data de hoje em "Horário de Criação"');
      await porDataDeHoje();

      P.passo('2/5 · Procurar');
      const total = await procurar();

      P.passo('3/5 · Select All in All Pages');
      await selecionarTodasPaginas(total);

      P.passo('4/5 · Exportar AT');
      const antes = await lerTarefasAgora();
      await fecharPainelTarefas();
      await exportarAt();

      P.passo('5/5 · esperando o relatório ficar pronto');
      const alvo = await esperarRelatorio(antes);
      await baixar(alvo);

      P.ok(`baixado: ${alvo.nome} — ${alvo.quando}`);
    } catch (e) {
      if (e instanceof S.Parado) P.erro('parado por você');
      else P.erro(e.message || String(e));
    } finally {
      rodando = false;
      S.parar = false;
    }
  }

  G.alimentacao = { rodar, lerTarefas, acharPainelTarefas, acharFiltroData, candidatosSeta,
                    candidatosIconePainel, quantasSelecionadas, checkboxDoCabecalho,
                    SELETORES_SETA, acharItemTodasPaginas, acharMaisFiltros };

  // O painel "Ultima tarefa" e o mesmo nas duas telas do SPX, e esperar um
  // relatorio ficar pronto tem as mesmas armadilhas (o carimbo que muda, o
  // botao Baixar que mora fora do bloco de nome+data, o pop-up bloqueado).
  // O macro de pedidos pesquisados usa estas daqui em vez de repetir tudo.
  G.painelDeTarefas = { abrirPainelTarefas, fecharPainelTarefas, lerTarefas,
                        lerTarefasAgora, esperarRelatorio, baixar, folhaComRegex };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
      if (!msg || !msg.xmMacro) return;
      if (msg.xmMacro === 'alimentacao') {
        // Responde se ACEITOU. Sem isso o popup dizia "rodando" pra um comeco
        // que nao aconteceu, e a pessoa ficava esperando.
        if (rodando) responder({ ok: false, error: 'a AT Exportada já está rodando' });
        else { rodar(); responder({ ok: true }); }
      }
      if (msg.xmMacro === 'diagnostico') { responder({ ok: true, texto: G.diagnostico() }); }
      if (msg.xmMacro === 'ensinar') { G.aprender.ensinar(msg.qual || 'seta'); responder({ ok: true }); }
      return true;
    });
  }

  console.log('[XM Macros] AT Exportada pronta — clique no ícone da extensão');
})(typeof window !== 'undefined' ? window : globalThis);
