// "Conferência" na barra de cima do Arco (ao lado de Acareações), com a cara do proprio Arco.
//
// Abre uma pagina no padrao das telas do Arco (faixa azul, cartao branco, abas e filtro "Cidades")
// com os pacotes que estao SEM GRUPO na Loggi (estacao Recebimento, como Distribuir > Grupos):
//   Chegaram hoje  - recebidos hoje e ainda sem grupo
//   Todos parados  - todos sem grupo, ha quantos dias, com o prazo
// Os pacotes vem pelo loggi.js (sessao da propria pagina); daqui nada sai.

(() => {
  if (typeof module !== 'undefined') return;
  const R = self.XMAgrupamento;
  const CANAL = 'xmAgrup';
  const MARCA = 'data-xm-conferencia';

  const ICONE = {
    caixa: '<path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>',
    caixaMarcada: '<path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>',
    seta: '<path d="m7 10 5 5 5-5z"/>',
  };
  const svg = (nome) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONE[nome]}</svg>`;

  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .pagina { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1100; overflow-y: auto; background: #f5f8fa;
        font: 400 14px/1.5 'Open Sans', sans-serif; color: #2e3545; -webkit-font-smoothing: antialiased; }
      .faixa { position: absolute; top: 0; left: 0; right: 0; height: 180px; background-image: linear-gradient(135deg, #00baff, #007cff); }
      .miolo { position: relative; max-width: 1040px; margin: 0 auto; padding: 8px 44px 48px; }
      .cab { display: flex; justify-content: space-between; align-items: flex-start; color: #fff; min-height: 120px; }
      .cab h1 { margin: 0 0 8px; font: 700 28px/1.3 'Open Sans', sans-serif; }
      .cab .sub { margin: 0; font-size: 26px; font-weight: 400; }
      .cab button { margin-top: 4px; padding: 0 24px; min-height: 44px; color: #fff; background: transparent; border: 1px solid #fff; border-radius: 24px;
        font: 600 15px 'Open Sans', sans-serif; cursor: pointer; }
      .cab button:hover { background: rgba(255, 255, 255, .12); }
      .cartao { background: #fff; border-radius: 8px; box-shadow: 0 8px 16px rgba(0, 0, 0, .08); padding: 0 40px 32px; min-height: 360px; }
      .abas { display: flex; gap: 8px; border-bottom: 1px solid #d8ddeb; }
      .abas button { position: relative; padding: 16px 16px 14px; color: #757d8c; background: none; border: 0; font: 600 14px 'Open Sans', sans-serif; cursor: pointer; }
      .abas button.ativa { color: #00baff; }
      .abas button.ativa::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: #00baff; }
      .abas .qtd { margin-left: 6px; padding: 1px 8px; border-radius: 10px; background: #f5f8fa; color: #757d8c; font-size: 12px; }
      .abas button.ativa .qtd { background: #f3fcff; color: #00baff; }
      .filtros { display: flex; align-items: center; gap: 16px; padding: 24px 0 20px; position: relative; }
      .pilula { display: inline-flex; align-items: center; gap: 2px; padding: 6px 12px 6px 20px; min-height: 40px; color: #00baff; background: #fff;
        border: 1px solid #00baff; border-radius: 24px; font: 600 14px 'Open Sans', sans-serif; cursor: pointer; }
      .pilula:hover { background: rgba(0, 186, 255, .04); }
      .ico { width: 24px; height: 24px; fill: currentColor; flex: none; }
      .total { margin-left: auto; color: #757d8c; }
      .total b { color: #2e3545; }
      .tabela { width: 100%; border-collapse: separate; border-spacing: 0; }
      .tabela th { padding: 14px 16px; text-align: left; color: #757d8c; font-weight: 400; background: #f5f8fa; }
      .tabela th:first-child { border-radius: 8px 0 0 8px; }
      .tabela th:last-child { border-radius: 0 8px 8px 0; }
      .tabela td { padding: 16px; border-bottom: 1px solid #f5f8fa; }
      .tabela .cod { font-family: ui-monospace, Consolas, monospace; font-size: 13px; word-break: break-all; }
      .tabela .num { white-space: nowrap; }
      .tabela .velho { color: #d32f2f; font-weight: 600; }
      .ponto { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: #2196f3; vertical-align: middle; }
      .vazio { padding: 48px 0; text-align: center; color: #757d8c; }
      .vazio.erro { color: #d32f2f; }
      /* filtro "Cidades" igual ao do Arco */
      .pop { position: absolute; top: 72px; left: 0; z-index: 2; width: 380px; background: #fff; border-radius: 12px;
        box-shadow: 0 5px 5px -3px rgba(0,0,0,.2), 0 8px 10px 1px rgba(0,0,0,.14), 0 3px 14px 2px rgba(0,0,0,.12); }
      .pop .titulo { padding: 28px 28px 12px; color: #bec7d6; font-size: .75rem; font-weight: 700; line-height: 1; }
      .pop ul { max-height: 360px; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
      .pop li { display: flex; align-items: center; gap: 16px; padding: 10px 28px; border-bottom: 1px solid #f5f8fa; cursor: pointer; font-size: .875rem; }
      .pop li:hover { background: rgba(0, 0, 0, .04); }
      .pop li.sel { padding-left: 25px; background: #f3fcff; border-left: 3px solid #079bd3; border-bottom-color: #ccf1ff; }
      .pop li .ico { color: rgba(0, 0, 0, .6); }
      .pop li.sel .ico { color: #00baff; }
      .pop li span { flex: 1; }
      .pop li small { color: #757d8c; }
      .pop footer { display: grid; grid-template-columns: auto 1fr; gap: 16px; padding: 20px 28px; border-top: 1px solid #f5f8fa; }
      .pop footer button { white-space: nowrap; padding: 0 16px; min-height: 44px; border-radius: 24px; font: 600 15px 'Open Sans', sans-serif; cursor: pointer; }
      .pop .ver-todos { color: #2e3545; background: none; border: 0; }
      .pop .aplicar { color: #00baff; background: #fff; border: 1px solid #00baff; }
    </style>
    <div class="pagina" hidden>
      <div class="faixa"></div>
      <div class="miolo">
        <div class="cab">
          <div><h1>Conferência</h1><p class="sub">Carregando...</p></div>
          <button type="button" class="atualizar">Atualizar</button>
        </div>
        <div class="cartao">
          <div class="abas">
            <button type="button" data-aba="hoje" class="ativa">Chegaram hoje<span class="qtd q-hoje">0</span></button>
            <button type="button" data-aba="todos">Todos parados<span class="qtd q-todos">0</span></button>
          </div>
          <div class="filtros">
            <button type="button" class="pilula cidades">Cidades${svg('seta')}</button>
            <span class="total"></span>
            <div class="pop" hidden>
              <div class="titulo">Escolha uma ou mais opções</div>
              <ul></ul>
              <footer><button type="button" class="ver-todos">Ver todos</button><button type="button" class="aplicar">Aplicar filtros</button></footer>
            </div>
          </div>
          <div class="corpo"></div>
        </div>
      </div>
    </div>`;

  const $ = (s) => sombra.querySelector(s);
  const pagina = $('.pagina');
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const el = (tag, classe, texto) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; };
  const icone = (nome) => { const t = document.createElement('template'); t.innerHTML = svg(nome); return t.content.firstChild; };

  let aba = 'hoje';
  let parados = null; // { hoje, todos }
  let erro = '';
  let filtro = new Set(); // chaves de cidade aplicadas
  let escolhendo = new Set(); // marcadas no filtro, antes de "Aplicar filtros"

  // ── buscar na Loggi (pelo loggi.js) ───────────────────────────────────────
  function pedirALoggi(tipo) {
    return new Promise((ok, nao) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        window.removeEventListener('message', ouvir);
        clearTimeout(limite);
        if (e.data.erro) nao(new Error(e.data.erro)); else ok(e.data);
      };
      const limite = setTimeout(() => { window.removeEventListener('message', ouvir); nao(new Error('A Loggi demorou para responder. Clique em Atualizar.')); }, 90000);
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: 'pedir', id, tipo }, location.origin);
    });
  }

  let buscando = false;
  async function carregar() {
    if (buscando) return;
    buscando = true;
    erro = '';
    parados = null;
    desenhar();
    try {
      const r = await pedirALoggi('avulsos');
      R.aprenderNomes(r.avulsos.map((p) => p.cidade));
      parados = R.separarParados(r.avulsos);
    } catch (e) {
      erro = e.message;
    } finally {
      buscando = false;
      desenhar();
    }
  }

  // ── desenhar ──────────────────────────────────────────────────────────────
  function desenhar() {
    sombra.querySelectorAll('[data-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
    $('.q-hoje').textContent = parados ? numero(parados.hoje.length) : '…';
    $('.q-todos').textContent = parados ? numero(parados.todos.length) : '…';
    $('.sub').textContent = parados ? `${numero(parados.todos.length)} pacotes sem grupo` : erro ? 'Não deu para carregar' : 'Carregando...';
    const corpo = $('.corpo');
    if (!parados) {
      corpo.replaceChildren(el('div', `vazio${erro ? ' erro' : ''}`, erro || 'Buscando os pacotes sem grupo na Loggi...'));
      $('.total').textContent = '';
      return;
    }
    const lista = R.daCidade(parados[aba], filtro);
    const cidades = $('.cidades');
    cidades.firstChild.textContent = filtro.size ? `Cidades • ${filtro.size}` : 'Cidades';
    $('.total').replaceChildren(el('b', '', numero(lista.length)), ` pacote${lista.length === 1 ? '' : 's'}`);
    if (!lista.length) {
      corpo.replaceChildren(el('div', 'vazio', aba === 'hoje' ? 'Nenhum pacote que chegou hoje está sem grupo.' : 'Nenhum pacote parado sem grupo.'));
      return;
    }
    const tabela = el('table', 'tabela');
    const cab = el('tr');
    const colunas = aba === 'hoje' ? ['Código', 'Cidade', 'Recebido', 'Prazo', 'Status'] : ['Código', 'Cidade', 'Recebido', 'Parado há', 'Prazo', 'Status'];
    colunas.forEach((c) => cab.append(el('th', '', c)));
    const thead = el('thead');
    thead.append(cab);
    const tbody = el('tbody');
    for (const p of lista.slice(0, 2000)) {
      const tr = el('tr');
      tr.append(el('td', 'cod', p.codigo || p.rastreio || p.id), el('td', '', R.bonito(p.cidade)), el('td', 'num', R.recebidoCurto(p.recebido)));
      if (aba === 'todos') {
        const d = R.diasParado(p.recebido);
        tr.append(el('td', `num${d >= 2 ? ' velho' : ''}`, d == null ? '' : d === 0 ? 'hoje' : d === 1 ? '1 dia' : `${d} dias`));
      }
      const st = el('td', 'num');
      st.append(el('span', 'ponto'), R.situacaoDe(p));
      tr.append(el('td', 'num', R.prazoCurto(p.prazo)), st);
      tbody.append(tr);
    }
    tabela.append(thead, tbody);
    corpo.replaceChildren(tabela);
  }

  function desenharFiltro() {
    const base = parados ? parados[aba] : [];
    $('.pop ul').replaceChildren(...R.contarPorCidade(base).map((c) => {
      const li = el('li');
      const marcada = escolhendo.has(c.chave);
      if (marcada) li.classList.add('sel');
      li.append(icone(marcada ? 'caixaMarcada' : 'caixa'), el('span', '', c.nome), el('small', '', numero(c.qtd)));
      li.addEventListener('click', () => { if (escolhendo.has(c.chave)) escolhendo.delete(c.chave); else escolhendo.add(c.chave); desenharFiltro(); });
      return li;
    }));
  }

  $('.cidades').addEventListener('click', () => {
    const pop = $('.pop');
    if (!pop.hidden) { pop.hidden = true; return; }
    escolhendo = new Set(filtro);
    desenharFiltro();
    pop.hidden = false;
  });
  $('.ver-todos').addEventListener('click', () => { filtro = new Set(); $('.pop').hidden = true; desenhar(); });
  $('.aplicar').addEventListener('click', () => { filtro = new Set(escolhendo); $('.pop').hidden = true; desenhar(); });
  sombra.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; $('.pop').hidden = true; desenhar(); }));
  $('.atualizar').addEventListener('click', carregar);
  pagina.addEventListener('click', (e) => { if (!e.composedPath().some((x) => x.classList && (x.classList.contains('pop') || x.classList.contains('cidades')))) $('.pop').hidden = true; });

  // ── item "Conferência" na barra do Arco ───────────────────────────────────
  const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  let barraItem = null; // o "Acareações" usado de modelo
  let aberta = false;
  let ativoDaLoggi = []; // itens da barra que pareciam selecionados: { el, estilo }

  function acharAcareacoes() {
    return [...document.querySelectorAll('button, a')].find((e) => normal(e.textContent) === 'acareacoes' && e.getBoundingClientRect().top < 160) || null;
  }

  function colocarNaBarra() {
    if (document.querySelector(`[${MARCA}]`)) return;
    const modelo = acharAcareacoes();
    if (!modelo) return;
    barraItem = modelo;
    let embrulho = modelo;
    while (embrulho.parentElement && embrulho.parentElement.children.length === 1 && embrulho.parentElement !== document.body) embrulho = embrulho.parentElement;
    const novo = embrulho.cloneNode(true);
    novo.setAttribute(MARCA, '');
    const botao = novo.matches('button, a') ? novo : novo.querySelector('button, a');
    if (!botao) return;
    botao.removeAttribute('href');
    botao.removeAttribute('id');
    botao.setAttribute('role', 'button');
    const texto = [...botao.querySelectorAll('*')].concat([botao]).find((n) => [...n.childNodes].some((c) => c.nodeType === 3 && normal(c.textContent) === 'acareacoes'));
    if (texto) [...texto.childNodes].forEach((c) => { if (c.nodeType === 3 && normal(c.textContent) === 'acareacoes') c.textContent = 'Conferência'; });
    novo.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); abrir(); }, true);
    embrulho.after(novo);
  }

  function itensDaBarra() {
    const nosso = document.querySelector(`[${MARCA}]`);
    if (!nosso || !barraItem) return [];
    const topo = barraItem.getBoundingClientRect().top;
    return [...document.querySelectorAll('button, a')].filter((e) => !nosso.contains(e) && Math.abs(e.getBoundingClientRect().top - topo) < 12);
  }

  // Selecionado igual ao "Na base" quando aberto (pilula branca, texto azul); o item que a Loggi
  // marcava fica com cara de nao selecionado ate fechar.
  function marcarBarra(abrindo) {
    const nosso = document.querySelector(`[${MARCA}]`);
    const botao = nosso && (nosso.matches('button, a') ? nosso : nosso.querySelector('button, a'));
    if (abrindo) {
      ativoDaLoggi = itensDaBarra().filter((e) => getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)').map((e) => ({ el: e, estilo: e.getAttribute('style') }));
      ativoDaLoggi.forEach(({ el: e }) => { e.style.backgroundColor = 'transparent'; e.style.color = '#fff'; });
      if (botao) { botao.style.backgroundColor = '#fff'; botao.style.color = '#00baff'; botao.style.borderRadius = '23px'; }
    } else {
      ativoDaLoggi.forEach(({ el: e, estilo }) => { if (estilo == null) e.removeAttribute('style'); else e.setAttribute('style', estilo); });
      ativoDaLoggi = [];
      if (botao) { botao.style.backgroundColor = ''; botao.style.color = ''; }
    }
  }

  // A pagina comeca logo abaixo da barra (a barra continua igual e clicavel).
  function posicionar() {
    if (!aberta) return;
    const r = barraItem && barraItem.isConnected ? barraItem.getBoundingClientRect() : null;
    pagina.style.top = `${r ? Math.max(0, r.bottom + 16) : 96}px`;
  }

  let caminho = location.pathname;
  function abrir() {
    if (aberta) return;
    aberta = true;
    caminho = location.pathname;
    pagina.hidden = false;
    marcarBarra(true);
    posicionar();
    carregar();
  }
  function fechar() {
    if (!aberta) return;
    aberta = false;
    pagina.hidden = true;
    $('.pop').hidden = true;
    marcarBarra(false);
  }

  // Clicou em outro item da barra (ou a Loggi trocou de tela): a pagina da Loggi volta.
  window.addEventListener('click', (e) => {
    if (!aberta || e.composedPath().includes(hospedeiro)) return;
    const b = e.target && e.target.closest && e.target.closest('button, a');
    if (b && !b.closest(`[${MARCA}]`) && itensDaBarra().includes(b)) fechar();
  }, true);
  window.addEventListener('keydown', (e) => { if (aberta && e.key === 'Escape' && !$('.pop').hidden) $('.pop').hidden = true; }, true);
  window.addEventListener('resize', posicionar);

  setInterval(() => {
    colocarNaBarra(); // o Arco redesenha a barra as vezes: o item volta
    if (aberta && location.pathname !== caminho) fechar();
    posicionar();
  }, 700);

  document.documentElement.append(hospedeiro);
})();
