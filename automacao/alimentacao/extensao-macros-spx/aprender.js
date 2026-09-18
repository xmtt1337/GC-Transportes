// MODO ENSINAR - a pessoa aponta, o macro guarda.
//
// Por que existe: a tela do SPX nao tem id, nome nem texto em metade dos
// botoes, e a unica forma de achar alguns deles era deduzir pela vizinhanca.
// Deduzir erra, e cada erro custa uma ida e volta ("manda o diagnostico") com
// alguem parado esperando.
//
// Aqui o caminho e o contrario: quem esta na frente da tela clica no botao, e
// o seletor daquele elemento fica guardado. Da proxima vez o macro vai direto
// nele. Se a Shopee mudar o layout, ensina de novo em dez segundos - nao
// precisa de nova versao da extensao.
//
// O clique de ensino NAO passa pra pagina: ele e interceptado na captura, pra
// ninguem abrir menu ou marcar checkbox sem querer durante o aprendizado.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;
  const S = G.spx;

  const CHAVE = 'ensinados';
  const LIMITE_MS = 45000;

  // O que cada coisa ensinada PRECISA dizer.
  //
  // Ensinar apontando pro lugar errado e facil - um clique meio segundo fora e
  // o "Select All in All Pages" vira "Criar tarefa de atribuicao", que foi o
  // que aconteceu. E seletor errado guardado e PIOR que nenhum: sem ele o
  // macro procura e erra na cara; com ele, clica com confianca no botao
  // errado, e esse aqui cria tarefa de atribuicao de verdade.
  //
  // A seta nao entra: ela e um icone, nao tem texto pra conferir.
  const TEXTO_ESPERADO = {
    item: 'Select All in All Pages',
  };

  let ensinados = {};
  let cancelar = null;

  // ── guardar ────────────────────────────────────────────────────────────
  async function carregar() {
    try {
      const guardado = await chrome.storage.local.get(CHAVE);
      ensinados = guardado[CHAVE] || {};
    } catch (e) {
      ensinados = {};
    }
    return ensinados;
  }

  async function guardar(qual, ficha) {
    ensinados[qual] = ficha;
    try {
      await chrome.storage.local.set({ [CHAVE]: ensinados });
    } catch (e) {
      console.warn('[XM Macros] nao consegui guardar o que foi ensinado', e);
    }
  }

  // Aceita tambem o formato antigo, quando so o seletor era guardado.
  const fichaDe = (qual) => {
    const guardado = ensinados[qual];
    if (!guardado) return null;
    return typeof guardado === 'string' ? { seletor: guardado, texto: '' } : guardado;
  };

  const seletorDe = (qual) => (fichaDe(qual) || {}).seletor || null;
  const textoDe = (qual) => (fichaDe(qual) || {}).texto || '';

  // O TEXTO desempata, e nao e detalhe: no menu do SPX, "Select All in Current
  // Page" e "Select All in All Pages" sao o mesmo div.selection-menu-item, com
  // o mesmo caminho ate a raiz. Escolher pelo seletor sozinho pegava o
  // primeiro - marcava a pagina atual e exportava 20 linhas de 78.
  function esquecer(qual) {
    delete ensinados[qual];
    try { chrome.storage.local.set({ [CHAVE]: ensinados }); } catch (e) { /* nada a fazer */ }
  }

  function elementosEnsinados(qual) {
    const ficha = fichaDe(qual);
    if (!ficha || !ficha.seletor) return [];

    // Ensino que nao bate com o esperado se apaga sozinho, em vez de ficar
    // guardado esperando o dia de clicar no botao errado.
    const esperado = TEXTO_ESPERADO[qual];
    if (esperado && L.chave(ficha.texto) !== L.chave(esperado)) {
      console.warn(`[XM Macros] o "${qual}" estava ensinado em "${ficha.texto}", ` +
                   `que nao e "${esperado}" - esquecendo`);
      esquecer(qual);
      return [];
    }
    let achados;
    try {
      achados = [...document.querySelectorAll(ficha.seletor)];
    } catch (e) {
      return [];   // seletor guardado de uma versao antiga da tela
    }
    if (!ficha.texto) return achados;
    const iguais = achados.filter((el) => L.chave(el.textContent) === L.chave(ficha.texto));
    return iguais.length ? iguais : [];
  }

  // ── montar o seletor ───────────────────────────────────────────────────
  // Classe com hash de build ("index_tabela__ic7IM") muda a cada deploy da
  // Shopee; guardar ela seria ensinar algo que expira sozinho.
  function classesUteis(el) {
    // Em SVG className NAO e string, e um SVGAnimatedString - por isso o
    // getAttribute em vez do atalho.
    const bruto = typeof el.className === 'string'
      ? el.className
      : (el.getAttribute && el.getAttribute('class')) || '';
    return String(bruto).split(/\s+/)
      // O CSS Modules da Shopee sufixa a classe com um hash de build
      // ("index_download-action-icon__2izcz", "index_tabela__ic7IM") - o
      // hash muda a cada deploy, e guardar ele foi o que fez um ensino de
      // ontem parar de casar hoje. Os filtros de hex/digito abaixo nao
      // pegam esse formato (o hash mistura letra fora de a-f com digito
      // avulso), entao o corte e ANTES deles: tudo depois do "__" some,
      // sobra so a parte que o proprio nome do componente da.
      .map((c) => c.replace(/__.+$/, ''))
      .filter((c) => c && !/[0-9a-f]{5,}/i.test(c) && !/\d{3,}/.test(c))
      .slice(0, 3);
  }

  function pedaco(el) {
    const tag = (el.tagName || '').toLowerCase();
    const classes = classesUteis(el);
    return classes.length ? tag + '.' + classes.join('.') : tag;
  }

  // Sobe do elemento clicado ate o caminho ficar unico na pagina. Para de
  // subir assim que der - caminho curto sobrevive melhor a remendo de layout.
  function seletorEstavel(alvo) {
    const partes = [];
    let el = alvo;
    for (let i = 0; i < 6 && el && el !== document.body; i++, el = el.parentElement) {
      partes.unshift(pedaco(el));
      const tentativa = partes.join(' ');
      try {
        if (document.querySelectorAll(tentativa).length === 1) return tentativa;
      } catch (e) {
        return partes.join(' ');
      }
    }
    return partes.join(' ');
  }

  // ── a faixa que aparece na tela ────────────────────────────────────────
  function faixa(texto, cor) {
    fecharFaixa();
    const host = document.createElement('div');
    host.id = 'xm-macro-ensinar';
    document.documentElement.appendChild(host);
    const sombra = host.attachShadow({ mode: 'open' });
    sombra.innerHTML = `
      <style>
        .barra { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
                 background: ${cor}; color: #fff; padding: 11px 16px;
                 font: 600 13px/1.4 "Segoe UI", system-ui, sans-serif;
                 text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,.3); }
        .dica { font-weight: 400; opacity: .85; font-size: 12px; }
      </style>
      <div class="barra"></div>`;
    sombra.querySelector('.barra').innerHTML = texto;
    return host;
  }

  function fecharFaixa() {
    const antigo = document.getElementById('xm-macro-ensinar');
    if (antigo) antigo.remove();
  }

  // ── ensinar ────────────────────────────────────────────────────────────
  const ROTULOS = {
    seta: 'a setinha ao lado do checkbox do cabeçalho (a que abre o menu)',
    item: 'o "Select All in All Pages" — com o menu já aberto',
    backlog: 'o ícone de baixar ao lado do card "Backlog" (Painel › Entrega/Devolução › AMH-LM › Delivery V3.0)',
  };

  function ensinar(qual) {
    if (cancelar) cancelar();

    faixa(`Clique ${ROTULOS[qual] || 'no elemento'}.<br>` +
          '<span class="dica">O clique não vai valer na página — é só pra eu aprender. Esc cancela.</span>',
          '#ee4d2d');

    const aoClicar = (evento) => {
      // Na captura e antes de tudo: o clique nao pode abrir menu nem marcar
      // checkbox, senao ensinar mexeria na tela de verdade.
      evento.preventDefault();
      evento.stopPropagation();
      if (evento.stopImmediatePropagation) evento.stopImmediatePropagation();

      const caminho = typeof evento.composedPath === 'function' ? evento.composedPath() : [];
      const alvo = caminho[0] || evento.target;
      if (!alvo || alvo.id === 'xm-macro-ensinar') return;

      const seletor = seletorEstavel(alvo);
      const texto = L.normalizar(alvo.textContent).slice(0, 80);

      // Recusa na hora o que claramente nao e o que se pediu. Avisar depois,
      // quando o macro ja clicou, nao serve de nada.
      const esperado = TEXTO_ESPERADO[qual];
      if (esperado && L.chave(texto) !== L.chave(esperado)) {
        limpar();
        faixa(`Isso é “${texto || 'sem texto'}”, não “${esperado}”.<br>` +
              '<span class="dica">Nada foi guardado. Aperte Alt+M e clique no item certo.</span>',
              '#b45309');
        setTimeout(fecharFaixa, 7000);
        return;
      }

      limpar();
      guardar(qual, { seletor, texto }).then(() => {
        console.log(`[XM Macros] aprendi "${qual}": ${seletor}` + (texto ? `  texto="${texto}"` : ''));
        const quantos = document.querySelectorAll(seletor).length;
        faixa(`Aprendido: <code>${seletor}</code>` +
              (texto ? `<br><span class="dica">texto: “${texto}”` +
                       (quantos > 1 ? ` — ${quantos} elementos casam com o caminho, o texto desempata` : '') +
                       '</span>' : '') +
              '<br><span class="dica">Agora é só rodar o macro.</span>', '#16a34a');
        setTimeout(fecharFaixa, 8000);
      });
    };

    const aoTeclar = (evento) => {
      if (evento.key === 'Escape') {
        limpar();
        fecharFaixa();
      }
    };

    function limpar() {
      document.removeEventListener('click', aoClicar, true);
      document.removeEventListener('mousedown', engolir, true);
      document.removeEventListener('pointerdown', engolir, true);
      document.removeEventListener('keydown', aoTeclar, true);
      clearTimeout(relogio);
      cancelar = null;
    }

    // O mousedown tambem precisa morrer aqui: parte dos componentes do SPX
    // abre no mousedown, e ai o menu apareceria antes do click chegar.
    const engolir = (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      if (evento.stopImmediatePropagation) evento.stopImmediatePropagation();
    };

    document.addEventListener('click', aoClicar, true);
    document.addEventListener('mousedown', engolir, true);
    document.addEventListener('pointerdown', engolir, true);
    document.addEventListener('keydown', aoTeclar, true);

    const relogio = setTimeout(() => {
      limpar();
      faixa('Tempo esgotado — clique em "Ensinar" de novo.', '#64748b');
      setTimeout(fecharFaixa, 4000);
    }, LIMITE_MS);

    cancelar = () => { limpar(); fecharFaixa(); };
  }

  G.aprender = { carregar, ensinar, seletorDe, textoDe, elementosEnsinados, seletorEstavel,
                 faixa, fecharFaixa, ensinados: () => ensinados };

  carregar();
})(typeof window !== 'undefined' ? window : globalThis);
