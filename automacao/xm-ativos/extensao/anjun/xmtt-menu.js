// Secao "XMTT" no menu lateral do portal da Anjun, dividida pelas extensoes XM.
//
// ARQUIVO IGUAL nas duas extensoes (os testes conferem):
//   automacao/xm-conferencias/extensao/anjun/xmtt-menu.js  (grupo "Conferencias")
//   automacao/xm-ativos/extensao/anjun/xmtt-menu.js        (grupo "Ativos")
// Cada extensao roda no seu mundo isolado; o que elas dividem e o DOM. Quem chega primeiro cria a
// secao (#xmtt-secao, acima de "Principais funcoes"); cada uma poe o seu grupo dentro, na ordem
// de data-xmtt-ordem. A marcacao e a do Element Plus do portal (clones dos elementos deles: mesmas
// classes e data-v), entao abrir/fechar o grupo de uma e o mesmo gesto para a outra.
//
// Uma pagina por vez: antes de abrir a sua pagina, a extensao anuncia (atributo data-xmtt-pagina
// no <html> + evento "xmtt-pagina", que chega na hora as duas); a outra fecha a dela e devolve o
// portal como estava.

(() => {
  const ID_SECAO = 'xmtt-secao';
  const TITULO = 'XMTT';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // A logo XM (redesenhada em 240x127), na cor do texto, como os icones deles (1024 x 1024).
  const LOGO_XM = 'M1 0h32l96 127H97ZM98 0h32L33 127H1ZM134 12h5l34 49l42 -61h25v127h-27V48l-40 58l-41 -57v66l-25 -34V50Z';

  const vista = () => document.querySelector('.aside-box .el-scrollbar__view');
  const secao = () => document.getElementById(ID_SECAO);
  /** Elemento das extensoes XM (secao XMTT ou uma pagina delas), e nao do portal. */
  const eDoXmtt = (el) => !!(el && el.closest && el.closest(`#${ID_SECAO}, .xmtt-pagina`));
  const raizDeles = (v) => v && [...v.querySelectorAll(':scope > ul.el-menu')].find((u) => !eDoXmtt(u));
  const tituloDeles = (v) => v && [...v.querySelectorAll(':scope > .aside-menu-section-title')].find((t) => !eDoXmtt(t));
  const recolhido = () => { const r = raizDeles(vista()); return !!(r && r.classList.contains('el-menu--collapse')); };

  /** Um icone no estilo deles: 'logo' (XM) ou um path proprio (com contorno). */
  function icone(tipo, caminho) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 1024 1024');
    s.setAttribute('xmlns', SVG_NS);
    const p = document.createElementNS(SVG_NS, 'path');
    if (tipo === 'logo') {
      p.setAttribute('d', LOGO_XM);
      p.setAttribute('transform', 'translate(32 258) scale(4)'); // 960 x 508 no meio
      p.setAttribute('fill', 'currentColor');
    } else {
      p.setAttribute('d', caminho);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '64');
      p.setAttribute('stroke-linejoin', 'round');
      p.setAttribute('stroke-linecap', 'round');
    }
    s.append(p);
    return s;
  }

  function limparClone(el) {
    [el, ...el.querySelectorAll('*')].forEach((e) => {
      e.removeAttribute('id');
      e.removeAttribute('aria-describedby');
      e.removeAttribute('aria-controls');
      ['data-old-padding-top', 'data-old-padding-bottom', 'data-old-overflow'].forEach((a) => e.removeAttribute(a));
    });
  }

  /** A secao XMTT (cria se ainda nao existe). null enquanto o menu do portal nao esta na tela. */
  function garantirSecao() {
    const v = vista();
    if (!v) return null;
    const existente = secao();
    if (existente && existente.parentElement === v) return existente;
    if (existente) existente.remove(); // o portal redesenhou o menu: monta de novo
    const raiz = raizDeles(v);
    if (!raiz) return null;
    const s = document.createElement('div');
    const t = tituloDeles(v);
    if (t) {
      const titulo = t.cloneNode(false);
      titulo.textContent = TITULO;
      s.append(titulo);
    }
    s.append(raiz.cloneNode(false));
    limparClone(s);
    s.id = ID_SECAO; // depois da limpeza (que tira os ids copiados deles)
    v.prepend(s);
    return s;
  }

  /**
   * O grupo (li.el-sub-menu) de uma extensao, clonado de um grupo deles com itens.
   * itens: [{ chave, titulo, caminhoIcone, aoClicar }]; aoTitulo(li) trata o clique no titulo.
   * caminhoIcone do grupo: o desenho dele (a secao ja diz XMTT; sem ele, cai na logo XM).
   */
  function montarGrupo({ id, ordem, titulo, caminhoIcone, itens, aoTitulo }) {
    const raiz = raizDeles(vista());
    if (!raiz) return null;
    const modelo = [...raiz.children].find((li) => li.matches('li.el-sub-menu') && li.querySelector(':scope > .el-sub-menu__title') && li.querySelector(':scope > ul li.el-menu-item'));
    if (!modelo) return null;
    const li = modelo.cloneNode(false);
    li.classList.remove('is-active', 'is-opened');
    li.setAttribute('aria-expanded', 'false');
    const cabeca = modelo.querySelector(':scope > .el-sub-menu__title').cloneNode(true);
    const caixaIcone = cabeca.querySelector('.menu-item-icon');
    if (caixaIcone) { caixaIcone.textContent = ''; caixaIcone.append(caminhoIcone ? icone('item', caminhoIcone) : icone('logo')); }
    const nome = cabeca.querySelector('.menu-title-tooltip-trigger');
    if (nome) nome.textContent = titulo;
    const seta = cabeca.querySelector('.el-sub-menu__icon-arrow');
    if (seta) seta.style.transform = 'none';
    const listaDeles = modelo.querySelector(':scope > ul.el-menu');
    const lista = listaDeles.cloneNode(false);
    lista.style.display = 'none';
    const itemModelo = listaDeles.querySelector(':scope > li.el-menu-item') || modelo.querySelector('li.el-menu-item');
    for (const it of itens) {
      const item = itemModelo.cloneNode(true);
      item.classList.remove('is-active');
      item.classList.add('xmtt-item');
      item.dataset.pagina = it.chave;
      const ic = item.querySelector('.menu-item-icon');
      if (ic) { ic.textContent = ''; ic.append(icone('item', it.caminhoIcone)); }
      const n = item.querySelector('.menu-title-tooltip-trigger');
      if (n) n.textContent = it.titulo;
      item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); it.aoClicar(); });
      lista.append(item);
    }
    li.append(cabeca, lista);
    limparClone(li);
    li.id = id;
    li.dataset.xmttOrdem = String(ordem);
    cabeca.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); aoTitulo(li); });
    return li;
  }

  /** Poe o grupo na secao, na ordem (Conferencias antes de Ativos). */
  function colocarGrupo(li) {
    const s = garantirSecao();
    if (!s || !li) return false;
    const ul = s.querySelector(':scope > ul.el-menu');
    if (li.parentElement === ul) return true;
    const ordem = Number(li.dataset.xmttOrdem);
    const depois = [...ul.children].find((x) => Number(x.dataset.xmttOrdem) > ordem);
    if (depois) ul.insertBefore(li, depois); else ul.append(li);
    return true;
  }

  // O deslizar do Element Plus (el-collapse-transition): altura de 0 ate o conteudo em 0.3s,
  // ease-in-out. Pela animacao do proprio navegador (element.animate): nao forca recalcular a
  // pagina antes de comecar e, cancelada no meio, segue da altura em que estava.
  const TEMPO_MS = 300;
  function deslizar(lista, abrir) {
    const atual = lista._xmttAnim;
    const de = lista.style.display === 'none' ? 0 : lista.getBoundingClientRect().height;
    if (atual) { atual.onfinish = null; atual.cancel(); lista._xmttAnim = null; }
    else if ((de > 0) === abrir) return; // ja esta como pedido
    lista.style.display = '';
    const ate = abrir ? lista.getBoundingClientRect().height : 0;
    if (typeof lista.animate !== 'function') { if (!abrir) lista.style.display = 'none'; return; }
    const anim = lista.animate([{ height: `${de}px` }, { height: `${ate}px` }], { duration: TEMPO_MS, easing: 'ease-in-out' });
    lista._xmttAnim = anim;
    anim.onfinish = () => { lista._xmttAnim = null; if (!abrir) lista.style.display = 'none'; };
  }

  /** Abre/fecha o grupo; deslizando como os deles (instantaneo: sem animar, p.ex. ao remontar). */
  function abrirGrupo(li, abrir, instantaneo) {
    if (!li) return;
    li.classList.toggle('is-opened', abrir);
    li.setAttribute('aria-expanded', String(abrir));
    const lista = li.querySelector(':scope > ul.el-menu');
    if (lista) {
      // sempre contida: as margens dos itens nao "vazam" e a altura nao pula no fim da animacao
      lista.style.overflow = 'hidden';
      const mostrar = abrir && !recolhido();
      if (instantaneo || !li.isConnected || recolhido()) {
        if (lista._xmttAnim) { lista._xmttAnim.onfinish = null; lista._xmttAnim.cancel(); lista._xmttAnim = null; }
        lista.style.display = mostrar ? '' : 'none';
      } else deslizar(lista, mostrar);
    }
    const seta = li.querySelector(':scope > .el-sub-menu__title .el-sub-menu__icon-arrow');
    if (seta) seta.style.transform = abrir ? 'rotateZ(180deg)' : 'none';
  }

  /** Um grupo aberto por vez: fecha os do portal (pelo clique deles) e os outros do XMTT. */
  function fecharOsOutros(li) {
    const raiz = raizDeles(vista());
    if (raiz) raiz.querySelectorAll(':scope > li.el-sub-menu.is-opened > .el-sub-menu__title').forEach((t) => t.click());
    const s = secao();
    if (s) s.querySelectorAll(':scope > ul.el-menu > li.el-sub-menu.is-opened').forEach((x) => { if (x !== li) abrirGrupo(x, false); });
  }

  /** Acompanha o recolher do menu deles (classe da raiz e o titulo da secao, que some recolhido). */
  function sincronizar() {
    const v = vista();
    const s = secao();
    if (!v || !s) return;
    const raiz = raizDeles(v);
    const ul = s.querySelector(':scope > ul.el-menu');
    if (raiz && ul) ul.classList.toggle('el-menu--collapse', raiz.classList.contains('el-menu--collapse'));
    const t = tituloDeles(v);
    const nosso = s.querySelector(':scope > .aside-menu-section-title');
    if (t && nosso) nosso.style.display = t.style.display;
    if (recolhido()) s.querySelectorAll('li.el-sub-menu > ul.el-menu').forEach((l) => { l.style.display = 'none'; });
  }

  /** Itens do menu do portal marcados (li.is-active), fora do XMTT. */
  const ativosDeles = () => [...document.querySelectorAll('.aside-box li.is-active')].filter((el) => !eDoXmtt(el));

  /** Antes de abrir a pagina de "dono": as outras extensoes fecham as delas (na hora). */
  function anunciarPagina(dono) {
    document.documentElement.dataset.xmttPagina = dono;
    document.dispatchEvent(new Event('xmtt-pagina'));
  }

  function aoAbrirOutra(dono, fechar) {
    document.addEventListener('xmtt-pagina', () => {
      if (document.documentElement.dataset.xmttPagina !== dono) fechar();
    });
  }

  self.XMTTMenu = {
    ID_SECAO, TITULO, eDoXmtt, recolhido, icone, garantirSecao, montarGrupo, colocarGrupo, abrirGrupo,
    fecharOsOutros, sincronizar, ativosDeles, anunciarPagina, aoAbrirOutra,
  };
})();
