// Modulo "XMTT" (logo XM) na barra de icones do DS da iMile, dividido pelas extensoes XM.
//
// ARQUIVO IGUAL nas duas extensoes (os testes conferem):
//   automacao/xm-conferencias/extensao/imile/xmtt-modulo.js  (grupo "Conferencias")
//   automacao/xm-ativos/extensao/imile/xmtt-modulo.js        (grupo "Ativos")
// Cada extensao roda no seu mundo isolado; o que elas dividem e o DOM. Quem chega primeiro cria o
// item da barra (#xmtt-ds-modulo, por ultimo) e o painel (#xmtt-ds-painel); cada uma poe o seu grupo
// (titulo com setinha + itens) no painel, na ordem de data-xmtt-ordem.
//
// O DS e React com classes geradas na hora (emotion): item, painel e grupos sao CLONES dos do DS
// (mesmas classes), sem os eventos deles.
//
// Estado no DOM, para as duas extensoes enxergarem: <html data-xmtt-ds="dono:pagina"> (vazio = fora do
// modulo) e o evento "xmtt-ds", que chega na hora as duas. Com o modulo aberto, o que e do DS (item
// marcado na barra, painel e tela) e escondido com marca no proprio elemento (data-xmtt-escondido /
// data-xmtt-tirado), entao qualquer uma das duas devolve tudo como estava. Cada extensao poe e tira so
// a propria pagina. Clicar em qualquer coisa da barra fora do XMTT, ou trocar de endereco, sai do modulo.

(() => {
  const ID_MODULO = 'xmtt-ds-modulo';
  const ID_PAINEL = 'xmtt-ds-painel';
  const CLASSE_PAGINA = 'xmtt-ds-pagina';
  const TITULO = 'XMTT';
  const EVENTO = 'xmtt-ds';
  const SEL_BARRA = '.ImileSMN-AsideMenu-scoller, .ImileSMN-AsideMenu-scroller';
  const SEL_PAINEL = '.ImileSMN-Panel-content';
  const AZUL = '#2546ff';

  const html = document.documentElement;
  const atual = () => html.dataset.xmttDs || '';
  const areaPrincipal = () => document.querySelector('.ImileProLayoutNew-outlet');
  const painelDoDs = () => document.querySelector(SEL_PAINEL);
  const nossoPainel = () => document.getElementById(ID_PAINEL);
  const eNosso = (el) => !!(el && el.closest && el.closest(`#${ID_MODULO}, #${ID_PAINEL}, .${CLASSE_PAGINA}`));
  const eDeles = (el) => el && !eNosso(el);
  const temItens = (g) => !!(g && g.querySelector('.ImileSMN-Menu3-root'));
  const limpar = (el) => {
    el.querySelectorAll('[aria-label]').forEach((e) => e.removeAttribute('aria-label'));
    el.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  };

  const CSS = `
  #${ID_MODULO}, #${ID_PAINEL} .ImileSMN-MenuGroup-menu2Root, #${ID_PAINEL} .xmtt-ds-item { cursor: pointer; }
  #${ID_PAINEL} .xmtt-ds-item.xmtt-ativo .ImileEllipsis-root { color: ${AZUL}; font-weight: 500; }
  #${ID_PAINEL} .ImileSMN-MenuGroup-menu2Root > svg { transition: transform .2s; }
  #${ID_PAINEL} .ImileSMN-MenuGroup-root:not(.xmtt-aberto) .ImileSMN-MenuGroup-menu2Root > svg { transform: rotate(-90deg); }
  `;
  function colocarEstilo() {
    if (document.getElementById('xmtt-ds-estilo')) return;
    const s = document.createElement('style');
    s.id = 'xmtt-ds-estilo';
    s.textContent = CSS;
    (document.head || html).append(s);
  }

  // ── a logo XM no estilo dos icones do DS (duas tonalidades da cor do texto) ──────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const LOGO_X = 'M1 0h32l96 127H97ZM98 0h32L33 127H1Z';
  const LOGO_M = 'M134 12h5l34 49l42 -61h25v127h-27V48l-40 58l-41 -57v66l-25 -34V50Z';
  function iconeXm(classe) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('focusable', 'false');
    if (classe) s.setAttribute('class', classe); else { s.setAttribute('width', '24'); s.setAttribute('height', '24'); }
    for (const [d, opacidade] of [[LOGO_X, '.5'], [LOGO_M, '']]) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('transform', 'translate(2.4 6.92) scale(.08)');
      p.setAttribute('fill', 'currentColor');
      if (opacidade) p.setAttribute('opacity', opacidade);
      s.append(p);
    }
    return s;
  }

  // ── entrar, trocar de pagina e sair (estado no <html>) ──────────────────────────
  function anunciar() { html.dispatchEvent(new Event(EVENTO)); }

  function abrir(pagina) {
    html.dataset.xmttDs = pagina;
    html.dataset.xmttDsUltima = pagina;
    anunciar();
  }

  function sair() {
    if (!atual()) return;
    html.dataset.xmttDs = '';
    anunciar();
  }

  const itensVisiveis = () => {
    const p = nossoPainel();
    return p ? [...p.querySelectorAll('.xmtt-ds-item')].filter((i) => !i.closest('[data-xmtt-oculto]')) : [];
  };

  /** Clique no XMTT da barra: a ultima pagina aberta (se ainda existe), senao a primeira. */
  function entrar() {
    const itens = itensVisiveis();
    const ultima = html.dataset.xmttDsUltima;
    const alvo = itens.find((i) => i.dataset.pagina === ultima) || itens[0];
    if (alvo) abrir(alvo.dataset.pagina);
  }

  // ── o item da barra e o painel ──────────────────────────────────────────────────
  function garantirModulo() {
    const barra = document.querySelector(SEL_BARRA);
    if (!barra) return null;
    let m = document.getElementById(ID_MODULO);
    if (m && m.parentElement !== barra) { m.remove(); m = null; }
    if (!m) {
      const itens = [...barra.querySelectorAll('.ImileSMN-AsideMenu1-root')].filter(eDeles);
      const modeloItem = itens.find((i) => !i.classList.contains('active')) || itens[0];
      if (!modeloItem) return null;
      let embrulho = modeloItem; // o filho direto da barra (o arrastavel deles)
      while (embrulho.parentElement && embrulho.parentElement !== barra) embrulho = embrulho.parentElement;
      if (embrulho.parentElement !== barra) return null;
      m = embrulho.cloneNode(true);
      limpar(m);
      m.id = ID_MODULO;
      const raiz = m.querySelector('.ImileSMN-AsideMenu1-root');
      raiz.classList.remove('active');
      raiz.title = 'XMTT';
      const caixaIcone = raiz.querySelector('.ImileSMN-AsideMenu1-icon');
      const svgDeles = [...barra.querySelectorAll('.ImileSMN-AsideMenu1-icon svg')].find((s) => s.classList.contains('ImileSvgIcon-root'));
      if (caixaIcone) { caixaIcone.textContent = ''; caixaIcone.append(iconeXm(svgDeles ? svgDeles.getAttribute('class') : '')); }
      const nome = raiz.querySelector('.ImileEllipsis-root');
      if (nome) { nome.textContent = TITULO; nome.classList.remove('ImileEllipsis-hasTip'); }
      m.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); entrar(); });
      barra.append(m);
    } else if (m.nextElementSibling) {
      barra.append(m); // o DS pos item novo depois do nosso: o nosso fica por ultimo
    }
    m.style.setProperty('--index', String([...barra.children].indexOf(m)));
    const p = nossoPainel();
    m.style.display = p && !itensVisiveis().length ? 'none' : '';
    return m;
  }

  /** O painel: o titulo e uma pilha vazia, clonados do painel do DS (os grupos entram depois). */
  function garantirPainel() {
    const painel = painelDoDs();
    if (!painel) return null;
    let p = nossoPainel();
    if (p && p.parentElement === painel) return p;
    const raiz = painel.querySelector('.ImileSMN-MyMenus-root');
    const titulo = painel.querySelector('.ImileSMN-ContentPanel-title');
    const rolagem = painel.querySelector('.ImileSMN-MyMenus-root-scroller');
    const grupo = [...painel.querySelectorAll('.ImileSMN-MenuGroup-root')].find(eDeles);
    if (!raiz || !titulo || !rolagem || !grupo) return p || null;
    const antigo = p;
    p = raiz.cloneNode(false);
    p.id = ID_PAINEL;
    p.style.display = 'none';
    const t = titulo.cloneNode(false);
    t.textContent = TITULO;
    const r = rolagem.cloneNode(false);
    const pilha = grupo.parentElement.cloneNode(false);
    pilha.classList.add('xmtt-ds-pilha');
    // O DS redesenhou o painel: os grupos que ja existiam vao junto.
    if (antigo) antigo.querySelectorAll('[data-xmtt-dono]').forEach((g) => pilha.append(g));
    if (antigo) antigo.remove();
    r.append(pilha);
    p.append(t, r);
    painel.append(p);
    return p;
  }

  function abrirGrupo(g, abrir) {
    g.classList.toggle('xmtt-aberto', abrir);
    const titulo = g.querySelector('.ImileSMN-MenuGroup-menu2Root');
    if (titulo) titulo.classList.toggle('open', abrir);
    const caixa = titulo && titulo.nextElementSibling;
    if (caixa) {
      caixa.style.height = abrir ? 'auto' : '0px';
      caixa.style.overflow = 'hidden';
      caixa.style.visibility = abrir ? 'visible' : 'hidden';
    }
  }

  /**
   * O grupo de uma extensao: clone de um grupo do DS com itens (titulo com setinha + itens); se o
   * painel do DS nao tem nenhum agora, clona o grupo que a outra extensao ja pos.
   */
  function montarGrupo({ dono, ordem, titulo, itens }) {
    const painel = painelDoDs();
    const p = nossoPainel();
    const modelo = (painel && [...painel.querySelectorAll('.ImileSMN-MenuGroup-root')].find((g) => eDeles(g) && temItens(g)))
      || (p && p.querySelector('[data-xmtt-dono]'));
    if (!modelo) return null;
    const g = modelo.cloneNode(true);
    limpar(g);
    g.id = `xmtt-ds-grupo-${dono}`;
    g.dataset.xmttDono = dono;
    g.dataset.xmttOrdem = String(ordem);
    delete g.dataset.xmttOculto;
    g.style.display = '';
    const cabeca = g.querySelector('.ImileSMN-MenuGroup-menu2Root');
    cabeca.classList.remove('active');
    const nome = cabeca.querySelector('.ImileEllipsis-root');
    nome.textContent = titulo;
    nome.classList.remove('ImileEllipsis-hasTip');
    const lista = g.querySelector('.ImileSMN-MenuGroup-menu3Container');
    const itemModelo = lista.querySelector('.ImileSMN-Menu3-root');
    lista.textContent = '';
    for (const it of itens) {
      const item = itemModelo.cloneNode(true);
      item.classList.remove('active', 'xmtt-ativo');
      item.classList.add('xmtt-ds-item');
      item.dataset.pagina = `${dono}:${it.chave}`;
      const n = item.querySelector('.ImileEllipsis-root');
      n.textContent = it.titulo;
      n.classList.remove('ImileEllipsis-hasTip');
      item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); abrir(item.dataset.pagina); });
      lista.append(item);
    }
    cabeca.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); abrirGrupo(g, !g.classList.contains('xmtt-aberto')); });
    abrirGrupo(g, true);
    return g;
  }

  function colocarGrupo(g) {
    const p = nossoPainel();
    const pilha = p && p.querySelector('.xmtt-ds-pilha');
    if (!pilha || !g) return false;
    if (g.parentElement === pilha) return true;
    const ordem = Number(g.dataset.xmttOrdem);
    const depois = [...pilha.children].find((x) => Number(x.dataset.xmttOrdem) > ordem);
    if (depois) pilha.insertBefore(g, depois); else pilha.append(g);
    return true;
  }

  // ── modulo aberto: esconder o do DS / devolver ──────────────────────────────────
  function esconder(caixa, manter) {
    if (!caixa) return;
    for (const c of caixa.children) {
      if (manter(c) || c.hasAttribute('data-xmtt-escondido')) continue;
      c.setAttribute('data-xmtt-escondido', c.style.display || '');
      c.style.display = 'none';
    }
  }

  function aplicarModo() {
    document.querySelectorAll('.ImileSMN-AsideMenu1-root.active').forEach((el) => {
      if (!eDeles(el)) return;
      el.classList.remove('active');
      el.setAttribute('data-xmtt-tirado', '');
    });
    const raiz = document.querySelector(`#${ID_MODULO} .ImileSMN-AsideMenu1-root`);
    if (raiz) raiz.classList.add('active');
    const p = nossoPainel();
    if (p) { p.style.display = ''; esconder(painelDoDs(), (c) => c === p); }
    esconder(areaPrincipal(), (c) => c.classList.contains(CLASSE_PAGINA));
    const pag = atual();
    document.querySelectorAll(`#${ID_PAINEL} .xmtt-ds-item`).forEach((i) => {
      const sel = i.dataset.pagina === pag;
      i.classList.toggle('xmtt-ativo', sel);
      i.classList.toggle('active', sel);
    });
  }

  function restaurar() {
    document.querySelectorAll('[data-xmtt-escondido]').forEach((c) => {
      c.style.display = c.getAttribute('data-xmtt-escondido');
      c.removeAttribute('data-xmtt-escondido');
    });
    const raiz = document.querySelector(`#${ID_MODULO} .ImileSMN-AsideMenu1-root`);
    if (raiz) raiz.classList.remove('active');
    // Devolve o "active" so se o DS nao marcou outro nesse meio tempo (se marcou, ja redesenhou).
    const deles = [...document.querySelectorAll('.ImileSMN-AsideMenu1-root.active')].filter(eDeles);
    document.querySelectorAll('[data-xmtt-tirado]').forEach((el) => {
      if (!deles.length) el.classList.add('active');
      el.removeAttribute('data-xmtt-tirado');
    });
    const p = nossoPainel();
    if (p) p.style.display = 'none';
    document.querySelectorAll(`#${ID_PAINEL} .xmtt-ds-item`).forEach((i) => i.classList.remove('xmtt-ativo', 'active'));
  }

  // ── o que cada extensao registra ────────────────────────────────────────────────
  let registrado = null; // { dono, ordem, titulo, itens, montarPagina, aoMostrar, aoEsconder }
  let grupo = null;
  let pagina = null;
  let mostrando = '';
  let oculto = false;

  function manter() {
    if (!registrado) return;
    colocarEstilo();
    garantirPainel();
    if (!grupo || !grupo.isConnected || grupo.parentElement !== (nossoPainel() || {}).querySelector?.('.xmtt-ds-pilha')) {
      const existente = document.getElementById(`xmtt-ds-grupo-${registrado.dono}`);
      if (existente && existente !== grupo) existente.remove(); // sobra de uma carga anterior desta extensao
      const novo = nossoPainel() ? montarGrupo(registrado) : null;
      if (novo) { if (grupo) grupo.remove(); grupo = novo; colocarGrupo(grupo); }
    }
    if (grupo) {
      grupo.style.display = oculto ? 'none' : '';
      if (oculto) grupo.dataset.xmttOculto = '1'; else delete grupo.dataset.xmttOculto;
    }
    garantirModulo();
    reagir(false);
  }

  /** Mostra ou tira a pagina desta extensao conforme o estado; esconde/devolve o DS. */
  function reagir(doEvento) {
    if (!registrado) return;
    const pag = atual();
    const [dono, chave] = pag.split(':');
    if (pag && dono === registrado.dono && !oculto) {
      if (!pagina) pagina = registrado.montarPagina();
      pagina.classList.add(CLASSE_PAGINA);
      const main = areaPrincipal();
      if (main && pagina.parentElement !== main) main.append(pagina);
      if (mostrando !== pag) { mostrando = pag; registrado.aoMostrar(chave); }
    } else if (mostrando) {
      mostrando = '';
      if (pagina) pagina.remove();
      if (registrado.aoEsconder) registrado.aoEsconder();
    }
    if (pag) aplicarModo(); else if (doEvento) restaurar();
  }

  /**
   * Registra o grupo desta extensao no XMTT. itens: [{ chave, titulo }]. montarPagina() devolve o
   * elemento da pagina (montado uma vez); aoMostrar(chave) roda ao abrir cada pagina.
   */
  function registrar(cfg) {
    registrado = cfg;
    html.addEventListener(EVENTO, () => reagir(true));
    // Qualquer clique na barra fora do XMTT sai do modulo antes do DS tratar o clique.
    document.addEventListener('click', (e) => {
      const alvo = e.target && e.target.closest ? e.target : null;
      if (!alvo || !atual() || eNosso(alvo)) return;
      if (alvo.closest('.ImileSMN-Aside-Root')) sair();
    }, true);
    window.addEventListener('hashchange', sair);
    window.addEventListener('popstate', sair);
    let agendado = false;
    new MutationObserver(() => {
      if (agendado) return;
      agendado = true;
      setTimeout(() => { agendado = false; manter(); }, 250);
    }).observe(html, { childList: true, subtree: true });
    manter();
  }

  /** Esconde o grupo desta extensao (ex.: cargo sem acesso); com a pagina dela aberta, sai. */
  function ocultarGrupo(sim) {
    oculto = !!sim;
    if (oculto && registrado && atual().startsWith(`${registrado.dono}:`)) sair();
    manter();
  }

  self.XMTTDs = { ID_MODULO, ID_PAINEL, CLASSE_PAGINA, TITULO, registrar, ocultarGrupo, abrir, sair, entrar };
})();
