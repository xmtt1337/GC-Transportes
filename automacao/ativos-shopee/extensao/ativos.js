// XM - Ativos Shopee: o grupo "Ativos Shopee" no menu lateral do SPX e a pagina de disparo,
// no tema do proprio SPX (sem painel flutuante).
//
// Menu: o SPX e Vue; cada grupo e li.ssc-menu-submenu (titulo + ul.ssc-menu, display:none
// fechado) e cada item a.ssc-menu-item. O nosso grupo copia essas classes e os atributos data-v-*
// dos grupos deles (os estilos com escopo do Vue dependem deles), entao abre, fecha e empurra os
// de baixo igual aos outros. Os elementos deles nunca sao alterados: o realce do item deles e
// apagado so por CSS enquanto a nossa pagina esta aberta.
//
// Pagina: entra em .content-container .layout-main, escondendo (display:none) o que o SPX mostra
// ali; ao clicar em outro item do menu ou trocar de endereco, sai e devolve tudo como estava.
//
// Fluxo: cola os BR -> o spx.js pede o export de pedidos ao SPX -> o fundo.js le nome e telefone
// -> o sistema diz quem ja recebeu ativo -> "Disparar" manda um por um pelo WABA do sistema
// (modelo confirmacao_entrega). A conversa aparece no sistema normalmente.

(() => {
  const R = self.XMAtivos;
  const ID_GRUPO = 'xm-ativos-grupo';
  const ID_PAGINA = 'xm-ativos-pagina';
  const LARANJA = 'rgb(238, 77, 45)';
  const FUNDO_ABERTO = 'rgb(14, 23, 35)';
  const HOVER_MENU = 'rgb(48, 56, 68)';
  const PAUSA_ENVIO_MS = 500; // igual ao disparo em massa do sistema
  const RITMO_OLHO_MS = 1500; // olho do telefone: o mesmo ritmo do consultador de telefone

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const dataV = (el) => (el ? [...el.attributes].filter((a) => a.name.startsWith('data-v-')).map((a) => a.name) : []);
  const comDataV = (el, nomes) => { nomes.forEach((n) => el.setAttribute(n, '')); return el; };

  // ── estilo ────────────────────────────────────────────────────────────────────
  const CSS = `
  #${ID_GRUPO} a.xm-ativos-item { cursor: pointer; }
  body.xm-ativos-aberto .sidebar-container a.ssc-menu-item-selected:not(.xm-ativos-item) { font-weight: normal !important; color: rgba(255,255,255,.7) !important; }
  body.xm-ativos-aberto .sidebar-container a.ssc-menu-item-selected:not(.xm-ativos-item) .ssc-menu-item-cursor { background: transparent !important; }
  .xm-ativos-pagina { padding: 16px 24px 32px; color: #333; font-size: 14px; line-height: 1.5; box-sizing: border-box; }
  .xm-ativos-pagina * { box-sizing: border-box; }
  .xm-ativos-pagina .xm-cartao { background: #fff; border-radius: 4px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .xm-ativos-pagina .xm-titulo { font-size: 18px; font-weight: 500; color: #333; margin: 0 0 4px; }
  .xm-ativos-pagina .xm-sub { color: #999; font-size: 13px; margin: 0 0 16px; }
  .xm-ativos-pagina .xm-rotulo { display: block; color: #666; font-size: 13px; margin: 0 0 6px; }
  .xm-ativos-pagina .xm-campo, .xm-ativos-pagina .xm-area { width: 100%; border: 1px solid #e5e5e5; border-radius: 4px; font: inherit; color: #333; background: #fff; outline: none; }
  .xm-ativos-pagina .xm-campo { height: 32px; padding: 0 12px; }
  .xm-ativos-pagina .xm-area { min-height: 120px; padding: 8px 12px; resize: vertical; font-family: inherit; }
  .xm-ativos-pagina .xm-campo:focus, .xm-ativos-pagina .xm-area:focus { border-color: ${LARANJA}; }
  .xm-ativos-pagina .xm-linha { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .xm-ativos-pagina .xm-linha > label { flex: 1 1 200px; max-width: 280px; }
  .xm-ativos-pagina .xm-acoes { display: flex; gap: 8px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
  .xm-ativos-pagina .xm-btn { height: 32px; padding: 0 16px; border: 1px solid #e5e5e5; border-radius: 4px; background: #fff; color: #333; font: inherit; cursor: pointer; white-space: nowrap; }
  .xm-ativos-pagina .xm-btn:hover:not(:disabled) { color: ${LARANJA}; border-color: ${LARANJA}; }
  .xm-ativos-pagina .xm-btn-primario { background: ${LARANJA}; border-color: ${LARANJA}; color: #fff; }
  .xm-ativos-pagina .xm-btn-primario:hover:not(:disabled) { background: #d73211; border-color: #d73211; color: #fff; }
  .xm-ativos-pagina .xm-btn:disabled { opacity: .5; cursor: not-allowed; }
  .xm-ativos-pagina .xm-link { background: none; border: 0; padding: 0; color: #2673dd; font: inherit; cursor: pointer; }
  .xm-ativos-pagina .xm-link:hover { text-decoration: underline; }
  .xm-ativos-pagina .xm-status { color: #666; font-size: 13px; }
  .xm-ativos-pagina .xm-status.xm-erro { color: #d0021b; }
  .xm-ativos-pagina .xm-conta { color: #666; font-size: 13px; float: right; }
  .xm-ativos-pagina .xm-cabecalho { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .xm-ativos-pagina .xm-contas { color: #666; font-size: 13px; }
  .xm-ativos-pagina .xm-contas b { color: #333; }
  .xm-ativos-pagina .xm-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid #f0f0f0; border-radius: 4px; }
  .xm-ativos-pagina table.xm-tabela { width: 100%; border-collapse: collapse; }
  .xm-ativos-pagina .xm-tabela th { position: sticky; top: 0; background: #fafafa; color: #333; font-weight: 500; text-align: left; padding: 10px 16px; border-bottom: 1px solid #e8e8e8; white-space: nowrap; z-index: 1; }
  .xm-ativos-pagina .xm-tabela td { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  .xm-ativos-pagina .xm-tabela tr:hover td { background: #fafafa; }
  .xm-ativos-pagina .xm-tabela .xm-cod { white-space: nowrap; }
  .xm-ativos-pagina .xm-tabela input[type=checkbox] { width: 16px; height: 16px; accent-color: ${LARANJA}; cursor: pointer; }
  .xm-ativos-pagina .xm-tag { display: inline-block; padding: 0 8px; border-radius: 2px; font-size: 12px; line-height: 20px; white-space: nowrap; }
  .xm-ativos-pagina .xm-tag-pronto { background: #f5f5f5; color: #666; }
  .xm-ativos-pagina .xm-tag-ok { background: #e7f6ec; color: #1a8f43; }
  .xm-ativos-pagina .xm-tag-aviso { background: #fff5e6; color: #b26a00; }
  .xm-ativos-pagina .xm-tag-erro { background: #fdecee; color: #d0021b; }
  .xm-ativos-pagina .xm-previa { white-space: pre-wrap; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 4px; padding: 12px 16px; color: #333; font-size: 13px; margin-top: 12px; }
  .xm-ativos-pagina details summary { cursor: pointer; color: #666; font-size: 13px; margin-top: 12px; }
  .xm-ativos-pagina [hidden] { display: none !important; }
  `;

  function colocarEstilo() {
    if (document.getElementById('xm-ativos-estilo')) return;
    const s = document.createElement('style');
    s.id = 'xm-ativos-estilo';
    s.textContent = CSS;
    (document.head || document.documentElement).append(s);
  }

  // ── menu lateral ──────────────────────────────────────────────────────────────
  // Dois grupos nossos, logo depois do grupo dos pedidos do SPX:
  //   Ativos       (Disparar ativos, Conversas) — só SAC, admin e dev (o servidor barra os outros);
  //   Conferência  (Vapt Vupt) — toda a operação (pedido do usuário, 19/11/2026).
  const ICONE_ATIVOS = 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 11H7v-2h10v2zm0-3H7V8h10v2z';
  const ICONE_CONFERENCIA = 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z';
  const SETA = 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z';
  const SVG = 'http://www.w3.org/2000/svg';
  let aberta = false;
  let papelAtual = null; // cargo da conta entrada (null = ninguém entrou ainda)

  const GRUPOS = [
    {
      id: ID_GRUPO, titulo: 'Ativos', icone: ICONE_ATIVOS, // dentro do SPX o "Shopee" sobrava (19/11/2026)
      paginas: [{ chave: 'disparar', titulo: 'Disparar ativos' }, { chave: 'conversas', titulo: 'Conversas' }],
      // Sem conta entrada ainda aparece (é por ele que o SAC entra); com conta, só para quem usa ativos.
      visivel: (papel) => papel == null || R.ROLES_ATIVOS.includes(papel),
    },
    {
      id: 'xm-conferencia-grupo', titulo: 'Conferência', icone: ICONE_CONFERENCIA,
      paginas: [{ chave: 'vapt', titulo: 'Vapt Vupt' }],
      visivel: () => true,
    },
  ];
  const PAGINAS = GRUPOS.flatMap((g) => g.paginas.map((p) => ({ ...p, grupo: g })));
  const grupoDaPagina = (chave) => (PAGINAS.find((p) => p.chave === chave) || {}).grupo;
  const lis = {}; // id do grupo -> li no menu
  let atual = null; // chave da pagina aberta
  const elementos = {};

  function svg(caminho, classe, v) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'currentColor');
    s.setAttribute('width', '24');
    s.setAttribute('class', classe);
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('fill-rule', 'evenodd');
    p.setAttribute('d', caminho);
    comDataV(s, v);
    comDataV(p, v);
    s.append(p);
    return s;
  }

  function montarGrupo(menu, def) {
    const modelo = menu.querySelector('li.ssc-menu-submenu:not(.xm-grupo)');
    const itemModelo = menu.querySelector('a.ssc-menu-item:not(.xm-ativos-item)');
    const vLi = dataV(modelo);
    const vTitulo = dataV(modelo && modelo.querySelector('.sub-menu-title'));
    const vIcone = dataV(modelo && modelo.querySelector('svg.title-icon'));
    const vItem = dataV(itemModelo);
    const vCaixa = dataV(itemModelo && itemModelo.parentElement);

    const li = comDataV(document.createElement('li'), vLi);
    li.id = def.id;
    li.className = 'submenu ssc-menu-submenu xm-grupo';
    li.style.cssText = 'color: rgba(255, 255, 255, 0.7); border-top: 1px solid transparent; border-bottom: 1px solid transparent;';

    const titulo = document.createElement('div');
    titulo.className = 'ssc-menu-submenu-title';
    const nome = comDataV(document.createElement('span'), vTitulo);
    nome.className = 'sub-menu-title';
    nome.textContent = def.titulo;
    const seta = document.createElement('span');
    seta.className = 'ssc-menu-submenu-title-icon';
    seta.append(svg(SETA, 'submenu-icon', []));
    titulo.append(svg(def.icone, 'title-icon', vIcone), ' ', nome, ' ', seta);

    const ul = document.createElement('ul');
    ul.className = 'ssc-menu';
    ul.style.cssText = 'color: rgba(255, 255, 255, 0.7); display: none;';
    for (const p of def.paginas) {
      const caixa = comDataV(document.createElement('div'), vCaixa);
      const item = comDataV(document.createElement('a'), vItem);
      item.className = 'submenu-item ssc-menu-item xm-ativos-item';
      item.title = p.titulo;
      item.dataset.pagina = p.chave;
      item.setAttribute('data-active-background', '#ee4d2d');
      item.style.paddingLeft = '44px';
      const cursor = document.createElement('span');
      cursor.className = 'ssc-menu-item-cursor';
      item.append(cursor, ` ${p.titulo} `);
      item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); mostrarPagina(p.chave); });
      item.addEventListener('mouseenter', () => { if (!item.classList.contains('ssc-menu-item-selected')) item.style.color = 'rgb(255, 255, 255)'; });
      item.addEventListener('mouseleave', () => { if (!item.classList.contains('ssc-menu-item-selected')) item.style.color = ''; });
      caixa.append(item);
      ul.append(caixa);
    }
    li.append(titulo, ul);

    // Um grupo aberto por vez, como o menu do SPX: abrir um nosso fecha o deles (pelo clique no
    // título deles, para o próprio SPX fechar e ficar coerente) e o outro nosso.
    titulo.addEventListener('click', () => {
      const abrir = !li.classList.contains('ssc-menu-opened');
      if (abrir) { fecharOsDoSpx(); GRUPOS.forEach((g) => { if (g.id !== def.id) abrirGrupo(g.id, false); }); }
      abrirGrupo(def.id, abrir);
    });
    // O realce ao passar o mouse do SPX vem de script deles (estilo direto no elemento), então
    // não pega no nosso: a mesma cor, medida na tela deles (rgb 48, 56, 68 com texto branco).
    titulo.addEventListener('mouseenter', () => {
      if (li.classList.contains('ssc-menu-opened')) return;
      titulo.style.background = HOVER_MENU;
      titulo.style.color = 'rgb(255, 255, 255)';
    });
    titulo.addEventListener('mouseleave', () => {
      if (li.classList.contains('ssc-menu-opened')) return;
      titulo.style.background = '';
      titulo.style.color = '';
    });
    return li;
  }

  function fecharOsDoSpx() {
    document.querySelectorAll('.sidebar-container li.ssc-menu-submenu.ssc-menu-opened:not(.xm-grupo) > .ssc-menu-submenu-title')
      .forEach((t) => t.click());
  }

  function abrirGrupo(id, abrir) {
    const li = lis[id];
    if (!li) return;
    const titulo = li.querySelector('.ssc-menu-submenu-title');
    const ul = li.querySelector('ul.ssc-menu');
    li.classList.toggle('ssc-menu-opened', abrir);
    ul.style.display = abrir ? '' : 'none';
    ul.style.background = abrir ? FUNDO_ABERTO : '';
    li.style.background = abrir ? FUNDO_ABERTO : '';
    titulo.style.color = abrir ? 'rgb(255, 255, 255)' : '';
    titulo.style.background = abrir ? FUNDO_ABERTO : '';
  }

  /** Marca o item da pagina aberta (null = nenhum). */
  function marcarItem(chave) {
    const doGrupo = grupoDaPagina(chave);
    Object.entries(lis).forEach(([id, li]) => {
      li.querySelectorAll('a.xm-ativos-item').forEach((item) => {
        const sel = item.dataset.pagina === chave;
        const cursor = item.querySelector('.ssc-menu-item-cursor');
        ['ssc-menu-item-active', 'ssc-menu-item-selected'].forEach((c) => item.classList.toggle(c, sel));
        item.style.fontWeight = sel ? 'bold' : '';
        item.style.color = sel ? 'rgb(255, 255, 255)' : '';
        cursor.style.background = sel ? LARANJA : '';
      });
      ['ssc-menu-item-active', 'ssc-menu-child-item-active'].forEach((c) => li.classList.toggle(c, !!doGrupo && doGrupo.id === id));
    });
    document.body.classList.toggle('xm-ativos-aberto', !!chave);
  }

  /** Mostra ou esconde os grupos conforme o cargo da conta entrada. */
  function aplicarPapel(papel) {
    papelAtual = papel;
    aplicarVisibilidade();
  }

  // ── configuração (página de opções da extensão: opcoes.html) ──────────────────
  // Liga e desliga cada menu nosso; vale na hora (storage.onChanged). O cargo continua valendo por
  // cima: quem não usa ativos não vê o grupo Ativos de jeito nenhum.
  let menus = { disparar: true, conversas: true, vapt: true, aviso: true };
  const ligado = (chave) => menus[chave] !== false;

  function aplicarVisibilidade() {
    GRUPOS.forEach((g) => {
      const li = lis[g.id];
      if (!li) return;
      li.querySelectorAll('a.xm-ativos-item').forEach((a) => { a.parentElement.style.display = ligado(a.dataset.pagina) ? '' : 'none'; });
      const algum = g.paginas.some((p) => ligado(p.chave));
      li.style.display = g.visivel(papelAtual) && algum ? '' : 'none';
    });
    // A página aberta foi desligada: volta para a tela do SPX.
    if (aberta && atual && !ligado(atual)) fecharPagina();
  }

  try {
    chrome.storage.local.get('menus').then(({ menus: salvos }) => { menus = { ...menus, ...(salvos || {}) }; aplicarVisibilidade(); }).catch(() => {});
    chrome.storage.onChanged.addListener((mud, area) => {
      if (area === 'local' && mud.menus) { menus = { disparar: true, conversas: true, vapt: true, aviso: true, ...(mud.menus.newValue || {}) }; aplicarVisibilidade(); }
    });
  } catch { /* extensão recarregada sem F5: fica tudo visível */ }

  // "Configurar" nas páginas: abre a página de opções da extensão.
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('.xm-cfg')) { e.preventDefault(); pedirAoFundo('abrirOpcoes').catch(() => {}); }
  });

  function colocarMenu() {
    const menu = document.querySelector('.sidebar-container .ssc-menu-vertical');
    if (!menu) return;
    const lista = (menu.querySelector('li.ssc-menu-submenu:not(.xm-grupo)') || {}).parentElement || menu;
    // Logo depois do grupo dos pedidos (achado pelo link do Order Tracking: o nome muda com o
    // idioma, "Pedidos" em português). No fim do menu ficava cortado pela barra de baixo.
    let anterior = [...lista.children].find((li) => !li.classList.contains('xm-grupo') && li.querySelector('a[href="#/orderTracking"]'));
    GRUPOS.forEach((def) => {
      let li = lis[def.id];
      if (!li || !menu.contains(li)) {
        const reabrir = li && li.classList.contains('ssc-menu-opened');
        li = montarGrupo(menu, def);
        lis[def.id] = li;
        if (anterior) anterior.after(li); else lista.append(li);
        const daPagina = grupoDaPagina(atual);
        if (reabrir || (aberta && daPagina && daPagina.id === def.id)) abrirGrupo(def.id, true);
      }
      anterior = li;
    });
    aplicarPapel(papelAtual);
    if (aberta) marcarItem(atual);
  }

  // ── entrar e sair das paginas ─────────────────────────────────────────────────
  let pagina = null; // a de Disparar (as funcoes dela usam $)
  let escondidos = [];
  let migalha = null;

  function areaPrincipal() { return document.querySelector('.content-container .layout-main'); }

  function esconderDoSpx(main) {
    for (const c of main.children) {
      if (c.dataset.xmPagina || c.dataset.xmEscondido) continue;
      escondidos.push([c, c.style.display]);
      c.dataset.xmEscondido = '1';
      c.style.display = 'none';
    }
  }

  // O que as paginas de Conversas e Vapt Vupt usam daqui.
  const ctx = {
    R, esc, numero, dormir, LARANJA,
    pedirAoFundo: (...a) => pedirAoFundo(...a),
    pedirAoSpx: (...a) => pedirAoSpx(...a),
    blocoLogin: (...a) => blocoLogin(...a),
    aoEntrar: (r) => aplicarPapel(r && r.papel),
  };

  // As paginas de outros arquivos: conversas.js (self.XMAtivosConversas) e vapt.js (self.XMAtivosVapt).
  const MODULOS = { conversas: () => self.XMAtivosConversas, vapt: () => self.XMAtivosVapt };

  function elementoDa(chave) {
    if (!elementos[chave]) {
      const el = chave === 'disparar' ? (pagina = montarPagina()) : MODULOS[chave]().montar(ctx);
      el.dataset.xmPagina = chave;
      elementos[chave] = el;
    }
    return elementos[chave];
  }

  function aoSair(chave) {
    const m = MODULOS[chave] && MODULOS[chave]();
    if (m) m.aoSair();
  }

  function mostrarPagina(chave) {
    const main = areaPrincipal();
    if (!main) return;
    if (atual && atual !== chave) { aoSair(atual); elementos[atual].remove(); }
    atual = chave;
    aberta = true;
    esconderDoSpx(main);
    const el = elementoDa(chave);
    if (el.parentElement !== main) main.append(el);
    const bc = document.querySelector('.header-container .ssc-breadcrumb');
    if (bc && !migalha) {
      [...bc.children].forEach((s) => { s.dataset.xmDisplay = s.style.display; s.style.display = 'none'; });
      const modelo = bc.querySelector('.ssc-breadcrumb-item');
      migalha = document.createElement('span');
      migalha.className = modelo ? modelo.className : 'ssc-breadcrumb-item';
      bc.append(migalha);
    }
    const def = grupoDaPagina(chave);
    if (migalha) migalha.textContent = `${def.titulo}  /  ${PAGINAS.find((p) => p.chave === chave).titulo}`;
    GRUPOS.forEach((g) => abrirGrupo(g.id, g.id === def.id));
    marcarItem(chave);
    if (chave === 'disparar') atualizarConta();
    else MODULOS[chave]().aoMostrar();
  }

  function fecharPagina() {
    if (!aberta) return;
    aberta = false;
    aoSair(atual);
    if (elementos[atual]) elementos[atual].remove();
    atual = null;
    escondidos.forEach(([c, d]) => { c.style.display = d; delete c.dataset.xmEscondido; });
    escondidos = [];
    const bc = document.querySelector('.header-container .ssc-breadcrumb');
    if (migalha) migalha.remove();
    migalha = null;
    if (bc) [...bc.children].forEach((s) => { if ('xmDisplay' in s.dataset) { s.style.display = s.dataset.xmDisplay; delete s.dataset.xmDisplay; } });
    marcarItem(null);
  }

  // Abrir um grupo do SPX fecha os nossos (um aberto por vez, como o menu deles).
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('.sidebar-container .ssc-menu-submenu-title');
    if (!t || t.closest('li.xm-grupo')) return;
    const li = t.closest('li.ssc-menu-submenu');
    if (li && !li.classList.contains('ssc-menu-opened')) GRUPOS.forEach((g) => abrirGrupo(g.id, false));
  }, true);

  // Outro item do menu (ou outro endereco): volta para a tela do SPX.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.ssc-menu-item');
    if (a && !a.classList.contains('xm-ativos-item')) fecharPagina();
  }, true);
  window.addEventListener('hashchange', fecharPagina);

  // O SPX redesenha o menu e o conteudo: recoloca o grupo e mantem a tela dele escondida.
  let agendado = false;
  new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    setTimeout(() => {
      agendado = false;
      colocarEstilo();
      colocarMenu();
      if (aberta && atual) {
        const main = areaPrincipal();
        if (main) { esconderDoSpx(main); const el = elementos[atual]; if (el.parentElement !== main) main.append(el); }
      }
    }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });

  /** Formulario de login (usado pela pagina de Conversas). aoEntrar(r) depois de entrar. */
  function blocoLogin(aoEntrar) {
    const d = document.createElement('div');
    d.innerHTML = `
      <div class="xm-linha">
        <label><span class="xm-rotulo">Usuário do sistema</span><input class="xm-campo xm-l-usuario" autocomplete="username"></label>
        <label><span class="xm-rotulo">Senha</span><input class="xm-campo xm-l-senha" type="password" autocomplete="current-password"></label>
        <button class="xm-btn xm-btn-primario xm-l-entrar" type="button">Entrar</button>
      </div>
      <p class="xm-status xm-l-status"></p>`;
    const st = (t, erro) => { const p = d.querySelector('.xm-l-status'); p.textContent = t; p.className = `xm-status xm-l-status${erro ? ' xm-erro' : ''}`; };
    const entrarAgora = async () => {
      const usuario = d.querySelector('.xm-l-usuario').value;
      const senha = d.querySelector('.xm-l-senha').value;
      if (!usuario || !senha) return st('Preencha usuário e senha.', true);
      st('Entrando...');
      try {
        const r = await pedirAoFundo('entrar', { usuario, senha });
        d.querySelector('.xm-l-senha').value = '';
        st('');
        aplicarPapel(r.papel);
        aoEntrar(r);
      } catch (e) { st(e.message, true); }
    };
    d.querySelector('.xm-l-entrar').addEventListener('click', entrarAgora);
    d.querySelector('.xm-l-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrarAgora(); });
    return d;
  }

  // ── conversa com o fundo.js e com o spx.js ────────────────────────────────────
  function pedirAoFundo(tipo, dados = {}) {
    if (!chrome.runtime || !chrome.runtime.id) return Promise.reject(new Error('A extensão foi atualizada. Aperte F5 nesta página.'));
    return chrome.runtime.sendMessage({ tipo, ...dados }).then((r) => {
      if (!r) throw new Error('A extensão não respondeu. Aperte F5 nesta página.');
      if (r.erro) { const e = new Error(r.erro); e.conta = !!r.conta; throw e; }
      return r;
    });
  }

  /** Pede ao spx.js (mundo da pagina) e espera a resposta final; o andamento vai para aviso. */
  function pedirAoSpx(tipo, dados, aviso = () => {}) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data.xmAtivos !== 'resposta' || e.data.id !== id) return;
        if (!e.data.fim) { aviso(String(e.data.andamento || '')); return; }
        window.removeEventListener('message', ouvir);
        if (e.data.erro) reject(new Error(e.data.erro)); else resolve(e.data);
      };
      window.addEventListener('message', ouvir);
      window.postMessage({ xmAtivos: tipo, id, ...dados }, location.origin);
    });
  }

  // ── a pagina ──────────────────────────────────────────────────────────────────
  const estado = { linhas: [], ocupado: false, logado: false, nome: '' };
  const $ = (id) => pagina.querySelector(`#xm-${id}`);

  function montarPagina() {
    const p = document.createElement('div');
    p.id = ID_PAGINA;
    p.className = 'xm-ativos-pagina';
    p.innerHTML = `
      <div class="xm-cartao">
        <span class="xm-conta" id="xm-conta"></span>
        <h2 class="xm-titulo">Disparar ativos</h2>
        <p class="xm-sub">Mensagem "confirmação de entrega" da Shopee pelo WhatsApp da GC. A conversa aparece no sistema XMTT.</p>
        <div id="xm-login" hidden>
          <div class="xm-linha">
            <label><span class="xm-rotulo">Usuário do sistema</span><input class="xm-campo" id="xm-usuario" autocomplete="username"></label>
            <label><span class="xm-rotulo">Senha</span><input class="xm-campo" id="xm-senha" type="password" autocomplete="current-password"></label>
            <button class="xm-btn xm-btn-primario" id="xm-entrar" type="button">Entrar</button>
          </div>
        </div>
        <div id="xm-busca" hidden>
          <label class="xm-rotulo" for="xm-codigos">SPX Tracking Number (um por linha, ou separados por espaço)</label>
          <textarea class="xm-area" id="xm-codigos" placeholder="BR..."></textarea>
          <div class="xm-acoes">
            <button class="xm-btn xm-btn-primario" id="xm-buscar" type="button">Buscar pedidos</button>
            <button class="xm-btn" id="xm-limpar" type="button">Redefinir</button>
          </div>
        </div>
        <p class="xm-status" id="xm-status"></p>
      </div>
      <div class="xm-cartao" id="xm-resultado" hidden>
        <div class="xm-cabecalho">
          <span class="xm-contas" id="xm-contas"></span>
          <button class="xm-btn xm-btn-primario" id="xm-disparar" type="button" disabled>Disparar</button>
        </div>
        <div class="xm-tabela-caixa">
          <table class="xm-tabela">
            <thead><tr><th style="width:40px"><input type="checkbox" id="xm-todos" title="Marcar todos os prontos"></th><th>SPX Tracking Number</th><th>Nome do cliente</th><th>Telefone</th><th>Situação</th></tr></thead>
            <tbody id="xm-linhas"></tbody>
          </table>
        </div>
        <details><summary>Ver a mensagem</summary><div class="xm-previa" id="xm-previa"></div></details>
      </div>`;
    p.querySelector('#xm-entrar').addEventListener('click', entrar);
    p.querySelector('#xm-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    p.querySelector('#xm-buscar').addEventListener('click', buscar);
    p.querySelector('#xm-limpar').addEventListener('click', limpar);
    p.querySelector('#xm-disparar').addEventListener('click', disparar);
    p.querySelector('#xm-todos').addEventListener('change', (e) => {
      estado.linhas.forEach((l) => { if (podeMarcar(l)) l.marcado = e.target.checked; });
      desenhar();
    });
    p.querySelector('#xm-linhas').addEventListener('change', (e) => {
      const cod = e.target && e.target.dataset && e.target.dataset.cod;
      const l = estado.linhas.find((x) => x.codigo === cod);
      if (l) { l.marcado = e.target.checked; desenharContas(); }
    });
    return p;
  }

  function status(texto, erro = false) {
    if (!pagina) return;
    $('status').textContent = texto;
    $('status').className = `xm-status${erro ? ' xm-erro' : ''}`;
  }

  function mostrarLogin(logado, nome) {
    estado.logado = logado;
    estado.nome = nome || '';
    $('login').hidden = logado;
    $('busca').hidden = !logado;
    $('conta').innerHTML = logado ? `${esc(estado.nome)} · <button class="xm-link xm-cfg" type="button">Configurar</button> · <button class="xm-link" id="xm-sair" type="button">Sair</button>` : '';
    const sair = $('sair');
    if (sair) sair.addEventListener('click', () => pedirAoFundo('sair').then(() => { aplicarPapel(null); mostrarLogin(false); status(''); }));
  }

  function atualizarConta() {
    pedirAoFundo('estado').then((r) => { aplicarPapel(r.logado ? r.papel : null); mostrarLogin(r.logado, r.nome); })
      .catch((e) => status(e.message, true));
  }

  function erroDeConta(e) {
    if (e.conta) mostrarLogin(false);
    status(e.message, true);
  }

  async function entrar() {
    const usuario = $('usuario').value;
    const senha = $('senha').value;
    if (!usuario || !senha) return status('Preencha usuário e senha.', true);
    status('Entrando...');
    try {
      const r = await pedirAoFundo('entrar', { usuario, senha });
      $('senha').value = '';
      aplicarPapel(r.papel);
      mostrarLogin(true, r.nome);
      status('');
    } catch (e) { status(e.message, true); }
  }

  function limpar() {
    if (estado.ocupado) return;
    $('codigos').value = '';
    estado.linhas = [];
    $('resultado').hidden = true;
    status('');
  }

  // ── linhas da tabela ──────────────────────────────────────────────────────────
  // O telefone so vem pelo olho, na hora do disparo (o export traz so o nome). Ate la, o pedido
  // com nome esta "pronto"; depois do olho, o envio pode falhar por telefone vazio ou invalido.
  const podeMarcar = (l) => l.achado && !!l.nome && l.situacao_envio !== 'enviado';

  function situacaoTexto(l) {
    if (l.situacao_envio === 'olho') return ['Buscando telefone...', 'pronto'];
    if (l.situacao_envio === 'enviando') return ['Enviando...', 'pronto'];
    if (l.situacao_envio === 'enviado') return ['Enviado', 'ok'];
    if (l.situacao_envio === 'erro') return [`Não enviou: ${l.erro}`, 'erro'];
    if (!l.achado) return ['Não achado no SPX', 'erro'];
    if (!l.nome) return ['Sem nome no SPX', 'erro'];
    if (l.ativo) {
      const quando = l.ativo.enviado_em ? new Date(l.ativo.enviado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const resposta = l.ativo.estado === 'recebeu' ? ' · respondeu: recebeu' : l.ativo.estado === 'nao_recebeu' ? ' · respondeu: não recebeu' : ' · sem resposta';
      return [`Já recebeu ativo${quando ? ` em ${quando}` : ''}${resposta}`, 'aviso'];
    }
    return ['Pronto', 'pronto'];
  }

  function desenharContas() {
    const ls = estado.linhas;
    const prontos = ls.filter((l) => podeMarcar(l)).length;
    const marcados = ls.filter((l) => l.marcado && podeMarcar(l)).length;
    const semNome = ls.filter((l) => !l.achado || !l.nome).length;
    const jaTem = ls.filter((l) => l.ativo).length;
    const enviados = ls.filter((l) => l.situacao_envio === 'enviado').length;
    $('contas').innerHTML = `<b>${numero(ls.length)}</b> pedido(s) · ${numero(prontos)} com nome · ${numero(semNome)} sem nome ou não achado`
      + ` · ${numero(jaTem)} já receberam ativo${enviados ? ` · <b>${numero(enviados)}</b> enviado(s) agora` : ''}`;
    const btn = $('disparar');
    btn.textContent = `Disparar ${numero(marcados)} ativo(s)`;
    btn.disabled = estado.ocupado || !marcados;
    const todos = $('todos');
    todos.checked = prontos > 0 && marcados === prontos;
    todos.disabled = estado.ocupado;
    const primeiro = ls.find((l) => l.marcado && podeMarcar(l)) || ls.find((l) => podeMarcar(l));
    $('previa').textContent = primeiro ? R.montarTexto(primeiro.nome, primeiro.codigo) : 'Nenhum pedido com nome.';
  }

  function desenhar() {
    $('resultado').hidden = !estado.linhas.length;
    $('linhas').innerHTML = estado.linhas.map((l) => {
      const [txt, tipo] = situacaoTexto(l);
      const tel = l.e164 ? R.telefoneLegivel(l.e164) : (l.telefone || (podeMarcar(l) ? 'busca ao disparar' : '—'));
      return `<tr>
        <td><input type="checkbox" data-cod="${esc(l.codigo)}" ${l.marcado ? 'checked' : ''} ${podeMarcar(l) && !estado.ocupado ? '' : 'disabled'}></td>
        <td class="xm-cod">${esc(l.codigo)}</td>
        <td>${esc(l.nome || '—')}</td>
        <td style="white-space:nowrap;${l.e164 ? '' : 'color:#999'}">${esc(tel)}</td>
        <td><span class="xm-tag xm-tag-${tipo}">${esc(txt)}</span></td>
      </tr>`;
    }).join('');
    desenharContas();
  }

  // ── buscar e disparar ─────────────────────────────────────────────────────────
  async function buscar() {
    if (estado.ocupado) return;
    const codigos = R.lerCodigos($('codigos').value);
    if (!codigos.length) return status('Cole pelo menos um SPX Tracking Number (BR...).', true);
    if (codigos.length > R.MAX_CODIGOS) return status(`São ${numero(codigos.length)} BR; o export do SPX aceita até ${numero(R.MAX_CODIGOS)} de uma vez.`, true);
    estado.ocupado = true;
    $('buscar').disabled = true;
    try {
      status(`Pedindo ao SPX o export de pedidos (${numero(codigos.length)} BR)...`);
      const { url } = await pedirAoSpx('exportar', { codigos }, status);
      status('Lendo os nomes...');
      const { contatos } = await pedirAoFundo('contatos', { url });
      status('Vendo no sistema quem já recebeu ativo...');
      const { estados } = await pedirAoFundo('situacao', { pedidos: codigos });
      const deCodigo = new Map(contatos.map((c) => [c.codigo, c]));
      estado.linhas = codigos.map((codigo) => {
        const c = deCodigo.get(codigo);
        const ativo = (estados || {})[codigo] || null;
        const l = { codigo, achado: !!c, nome: c ? c.nome : '', telefone: '', e164: '', ativo, marcado: false };
        l.marcado = podeMarcar(l) && !ativo; // quem já recebeu ativo fica desmarcado
        return l;
      });
      const faltam = estado.linhas.filter((l) => !l.achado).length;
      status((faltam ? `${numero(faltam)} BR não vieram no export do SPX (de outra estação ou código errado). ` : '')
        + 'O telefone é buscado no olho do SPX só na hora do disparo, 1 visualização por pedido marcado.');
    } catch (e) {
      erroDeConta(e);
    } finally {
      estado.ocupado = false;
      $('buscar').disabled = false;
      desenhar();
    }
  }

  async function disparar() {
    if (estado.ocupado) return;
    const fila = estado.linhas.filter((l) => l.marcado && podeMarcar(l));
    if (!fila.length) return;
    estado.ocupado = true;
    let ok = 0;
    let falha = 0;
    let ultimoOlho = 0;
    try {
      for (let i = 0; i < fila.length; i += 1) {
        const l = fila[i];
        status(`Pedido ${numero(i + 1)} de ${numero(fila.length)}... (${numero(ok)} enviado(s), ${numero(falha)} falha(s))`);
        try {
          if (!l.e164) {
            const espera = RITMO_OLHO_MS - (Date.now() - ultimoOlho);
            if (espera > 0) await dormir(espera);
            l.situacao_envio = 'olho';
            desenhar();
            ultimoOlho = Date.now();
            const olho = await pedirAoSpx('telefone', { codigo: l.codigo });
            if (olho.outraEstacao) throw new Error('não é desta estação no SPX');
            l.telefone = olho.telefone;
          }
          const envio = R.montarEnvio({ codigo: l.codigo, nome: l.nome, telefone: l.telefone });
          if (envio.erro) throw new Error(envio.erro);
          l.e164 = envio.corpo.numero;
          l.situacao_envio = 'enviando';
          desenhar();
          await pedirAoFundo('enviar', { corpo: envio.corpo });
          l.situacao_envio = 'enviado';
          l.marcado = false;
          ok += 1;
        } catch (e) {
          l.situacao_envio = 'erro';
          l.erro = e.message;
          falha += 1;
          if (e.conta) { erroDeConta(e); break; }
          // A Shopee recusou o olho (limite de visualização, sessão): parar, não insistir.
          if (/A Shopee recusou|não respondeu|F5/.test(e.message)) { status(e.message, true); break; }
        }
        desenhar();
        if (i < fila.length - 1) await dormir(PAUSA_ENVIO_MS);
      }
      if (!/A Shopee recusou|não respondeu|F5/.test($('status').textContent)) {
        status(`Concluído: ${numero(ok)} enviado(s), ${numero(falha)} falha(s).`, falha > 0 && ok === 0);
      }
    } finally {
      estado.ocupado = false;
      desenhar();
    }
  }

  // ── aviso de mensagem nova de cliente ─────────────────────────────────────────
  // Em qualquer tela do SPX, com a conta do sistema entrada: pergunta ao sistema só pelas
  // mensagens recebidas depois da última vista (/macros/whatsapp/novidades, consulta leve), e
  // mostra um aviso com som leve. O aviso fica 6 s (era 2,5 s; o usuário pediu mais tempo) e some
  // em 0,5 s; com o mouse em cima ele não some, e volta a contar ao tirar o mouse.
  // Clicar abre a conversa. A primeira pergunta só marca o ponto de partida: não avisa o antigo.
  const NOVIDADES_MS = 20000;
  const AVISO_FICA_MS = 6000;
  const AVISO_SOME_MS = 500;
  const MAX_AVISOS = 3;
  let ultimaVista = null;
  let perguntando = false;

  const CSS_AVISO = `
  .xm-avisos { position: fixed; top: 72px; right: 24px; z-index: 2147483000; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
  .xm-aviso { pointer-events: auto; width: 320px; background: #fff; color: #333; border-left: 4px solid ${LARANJA}; border-radius: 0 4px 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,.15); padding: 10px 14px; font: 13px/1.45 Roboto, "Helvetica Neue", Arial, sans-serif; cursor: pointer;
    opacity: 0; transform: translateY(-6px); transition: opacity ${AVISO_SOME_MS}ms ease, transform ${AVISO_SOME_MS}ms ease; }
  .xm-aviso.xm-visivel { opacity: 1; transform: none; }
  .xm-aviso b { display: block; font-weight: 500; color: #333; }
  .xm-aviso .xm-aviso-cod { color: ${LARANJA}; font-size: 12px; }
  .xm-aviso .xm-aviso-txt { color: #666; font-size: 12px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }`;

  function caixaDeAvisos() {
    let c = document.getElementById('xm-avisos');
    if (c) return c;
    if (!document.getElementById('xm-avisos-estilo')) {
      const st = document.createElement('style');
      st.id = 'xm-avisos-estilo';
      st.textContent = CSS_AVISO;
      (document.head || document.documentElement).append(st);
    }
    c = document.createElement('div');
    c.id = 'xm-avisos';
    c.className = 'xm-avisos';
    document.body.append(c);
    return c;
  }

  function mostrarAviso({ titulo, codigo, texto, aoClicar }) {
    const a = document.createElement('div');
    a.className = 'xm-aviso';
    a.innerHTML = `<b>${esc(titulo)}</b>${codigo ? `<span class="xm-aviso-cod">${esc(codigo)}</span>` : ''}${texto ? `<div class="xm-aviso-txt">${esc(texto)}</div>` : ''}`;
    if (aoClicar) a.addEventListener('click', () => { aoClicar(); a.remove(); });
    caixaDeAvisos().append(a);
    requestAnimationFrame(() => a.classList.add('xm-visivel'));
    let tempo = null;
    const contar = () => {
      clearTimeout(tempo);
      tempo = setTimeout(() => { a.classList.remove('xm-visivel'); tempo = setTimeout(() => a.remove(), AVISO_SOME_MS); }, AVISO_FICA_MS);
    };
    a.addEventListener('mouseenter', () => { clearTimeout(tempo); a.classList.add('xm-visivel'); });
    a.addEventListener('mouseleave', contar);
    contar();
  }

  // Som leve: dois tons curtos e baixos. O navegador só deixa tocar depois de um clique na
  // página, então o áudio é preparado no primeiro clique.
  let audio = null;
  const prepararAudio = () => {
    try { audio = audio || new AudioContext(); if (audio.state === 'suspended') audio.resume(); } catch { audio = null; }
  };
  document.addEventListener('pointerdown', prepararAudio, { capture: true, passive: true });
  function tocarSom() {
    if (!audio || audio.state !== 'running') return;
    const agora = audio.currentTime;
    [[880, 0], [1320, 0.12]].forEach(([freq, atraso]) => {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(0, agora + atraso);
      vol.gain.linearRampToValueAtTime(0.06, agora + atraso + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.22);
      osc.connect(vol).connect(audio.destination);
      osc.start(agora + atraso);
      osc.stop(agora + atraso + 0.25);
    });
  }

  function abrirConversaDoAviso(numero, pedido) {
    if (self.XMAtivosConversas) self.XMAtivosConversas.abrirDepois(numero, pedido);
    mostrarPagina('conversas');
  }

  async function verNovidades() {
    if (perguntando || document.hidden || !chrome.runtime || !chrome.runtime.id) return;
    perguntando = true;
    try {
      const { logado, papel } = await pedirAoFundo('estado');
      if (papelAtual !== (logado ? papel : null)) aplicarPapel(logado ? papel : null);
      if (!logado) { ultimaVista = null; return; }
      // Mensagem de cliente é coisa de quem usa os ativos; a operação (só Conferência) não pergunta.
      if (!R.ROLES_ATIVOS.includes(papel)) return;
      if (!ligado('aviso')) return; // desligado na configuração da extensão
      const q = ultimaVista == null ? '' : `?desde=${ultimaVista}`;
      const { dados } = await pedirAoFundo('sistema', { metodo: 'GET', caminho: `/macros/whatsapp/novidades${q}` });
      const primeira = ultimaVista == null;
      ultimaVista = dados.ultimo;
      if (primeira || !dados.novas.length) return;
      // Uma por conversa (a mais recente), no máximo 3 avisos; o resto vira um aviso de resumo.
      const porNumero = new Map();
      // Só avisa do que a tela de Conversas mostra: cliente com disparo da Shopee em Ativos, ou em
      // Acareação para SAC e dev. "Nos chamaram" (sem disparo nosso) fica de fora.
      const veAcareacao = R.ROLES_ACAREACAO.includes(papel);
      dados.novas.filter((n) => n.outros || (veAcareacao && n.acareacao)).forEach((n) => porNumero.set(n.numero, n));
      if (!porNumero.size) return;
      const lista = [...porNumero.values()].reverse();
      lista.slice(0, MAX_AVISOS).forEach((n) => mostrarAviso({
        titulo: 'Nova mensagem de cliente',
        codigo: n.pedido || R.formatarNumero(n.numero),
        texto: n.texto,
        aoClicar: () => abrirConversaDoAviso(n.numero, n.pedido),
      }));
      if (lista.length > MAX_AVISOS) {
        mostrarAviso({ titulo: `+${lista.length - MAX_AVISOS} conversa(s) com mensagem nova`, aoClicar: () => mostrarPagina('conversas') });
      }
      tocarSom();
      if (self.XMAtivosConversas) self.XMAtivosConversas.novidade(lista.map((n) => n.numero));
    } catch { /* sem sistema ou sem conta: tenta de novo na próxima */ } finally {
      perguntando = false;
    }
  }
  setInterval(verNovidades, NOVIDADES_MS);
  setTimeout(verNovidades, 3000);

  colocarEstilo();
  colocarMenu();
  // Cargo de quem já está entrado: decide se o grupo Ativos aparece.
  if (chrome.runtime && chrome.runtime.id) {
    pedirAoFundo('estado').then((r) => aplicarPapel(r.logado ? r.papel : null)).catch(() => {});
  }
})();
