// XM - Conferencia Shopee: o grupo "Conferencia" no menu lateral do SPX (item Vapt Vupt) e a
// pagina dentro do SPX, no tema dele. Separada da XM - Ativos Shopee em 20/11/2026.
//
// Menu: o SPX e Vue; cada grupo e li.ssc-menu-submenu (titulo + ul.ssc-menu, display:none
// fechado) e cada item a.ssc-menu-item. O nosso grupo copia essas classes e os atributos data-v-*
// dos grupos deles, entao abre, fecha e empurra os de baixo igual aos outros. Os elementos deles
// nunca sao alterados: o realce do item deles e apagado so por CSS enquanto a nossa pagina esta
// aberta.
//
// Convivencia com a XM - Ativos Shopee (outra extensao, mesmo menu): as classes daqui sao
// xm-conf-* (as dela, xm-grupo / xm-ativos-item), entao uma ve o grupo da outra como mais um
// grupo do SPX: abrir um fecha o outro, e clicar no item de uma fecha a pagina da outra. O grupo
// daqui fica logo depois do grupo Ativos (se ele existir) ou do grupo dos pedidos.
//
// Pagina: entra em .content-container .layout-main, escondendo (display:none) o que o SPX mostra
// ali; ao clicar em outro item do menu ou trocar de endereco, sai e devolve tudo como estava.

(() => {
  const R = self.XMConf;
  const CANAL = 'xmConf'; // o mesmo do spx.js desta extensão
  const ID_GRUPO = 'xm-conf-grupo';
  const CLASSE_GRUPO = 'xm-conf-grupo';
  const CLASSE_ITEM = 'xm-conf-item';
  const ID_GRUPO_ATIVOS = 'xm-ativos-grupo'; // da XM - Ativos Shopee, se estiver instalada
  const LARANJA = 'rgb(238, 77, 45)';
  const FUNDO_ABERTO = 'rgb(14, 23, 35)';
  const HOVER_MENU = 'rgb(48, 56, 68)';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const dataV = (el) => (el ? [...el.attributes].filter((a) => a.name.startsWith('data-v-')).map((a) => a.name) : []);
  const comDataV = (el, nomes) => { nomes.forEach((n) => el.setAttribute(n, '')); return el; };

  // ── estilo ────────────────────────────────────────────────────────────────────
  const CSS = `
  #${ID_GRUPO} a.${CLASSE_ITEM} { cursor: pointer; }
  body.xm-conf-aberto .sidebar-container a.ssc-menu-item-selected:not(.${CLASSE_ITEM}) { font-weight: normal !important; color: rgba(255,255,255,.7) !important; }
  body.xm-conf-aberto .sidebar-container a.ssc-menu-item-selected:not(.${CLASSE_ITEM}) .ssc-menu-item-cursor { background: transparent !important; }
  .xm-conf-pagina { padding: 16px 24px 32px; color: #333; font-size: 14px; line-height: 1.5; box-sizing: border-box; }
  .xm-conf-pagina * { box-sizing: border-box; }
  .xm-conf-pagina .xm-cartao { background: #fff; border-radius: 4px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .xm-conf-pagina .xm-titulo { font-size: 18px; font-weight: 500; color: #333; margin: 0 0 4px; }
  .xm-conf-pagina .xm-sub { color: #999; font-size: 13px; margin: 0 0 16px; }
  .xm-conf-pagina .xm-rotulo { display: block; color: #666; font-size: 13px; margin: 0 0 6px; }
  .xm-conf-pagina .xm-campo { width: 100%; height: 32px; padding: 0 12px; border: 1px solid #e5e5e5; border-radius: 4px; font: inherit; color: #333; background: #fff; outline: none; }
  .xm-conf-pagina .xm-campo:focus { border-color: ${LARANJA}; }
  .xm-conf-pagina .xm-linha { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .xm-conf-pagina .xm-linha > label { flex: 1 1 200px; max-width: 280px; }
  .xm-conf-pagina .xm-btn { height: 32px; padding: 0 16px; border: 1px solid #e5e5e5; border-radius: 4px; background: #fff; color: #333; font: inherit; cursor: pointer; white-space: nowrap; }
  .xm-conf-pagina .xm-btn:hover:not(:disabled) { color: ${LARANJA}; border-color: ${LARANJA}; }
  .xm-conf-pagina .xm-btn-primario { background: ${LARANJA}; border-color: ${LARANJA}; color: #fff; }
  .xm-conf-pagina .xm-btn-primario:hover:not(:disabled) { background: #d73211; border-color: #d73211; color: #fff; }
  .xm-conf-pagina .xm-btn:disabled { opacity: .5; cursor: not-allowed; }
  .xm-conf-pagina .xm-link { background: none; border: 0; padding: 0; color: #2673dd; font: inherit; cursor: pointer; }
  .xm-conf-pagina .xm-link:hover { text-decoration: underline; }
  .xm-conf-pagina .xm-status { color: #666; font-size: 13px; }
  .xm-conf-pagina .xm-status.xm-erro { color: #d0021b; }
  .xm-conf-pagina .xm-conta { color: #666; font-size: 13px; float: right; }
  .xm-conf-pagina .xm-cabecalho { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .xm-conf-pagina .xm-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid #f0f0f0; border-radius: 4px; }
  .xm-conf-pagina table.xm-tabela { width: 100%; border-collapse: collapse; }
  .xm-conf-pagina .xm-tabela th { position: sticky; top: 0; background: #fafafa; color: #333; font-weight: 500; text-align: left; padding: 10px 16px; border-bottom: 1px solid #e8e8e8; white-space: nowrap; z-index: 1; }
  .xm-conf-pagina .xm-tabela td { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  .xm-conf-pagina .xm-tabela tr:hover td { background: #fafafa; }
  .xm-conf-pagina .xm-tabela .xm-cod { white-space: nowrap; }
  .xm-conf-pagina [hidden] { display: none !important; }
  `;

  function colocarEstilo() {
    if (document.getElementById('xm-conf-estilo')) return;
    const s = document.createElement('style');
    s.id = 'xm-conf-estilo';
    s.textContent = CSS;
    (document.head || document.documentElement).append(s);
  }

  // ── menu lateral ──────────────────────────────────────────────────────────────
  const ICONE = 'M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z';
  const SETA = 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z';
  const SVG = 'http://www.w3.org/2000/svg';
  const GRUPO = { titulo: 'Conferência', paginas: [{ chave: 'vapt', titulo: 'Vapt Vupt' }] };
  let li = null;
  let aberta = false;
  let atual = null;
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

  // Grupos que não são daqui (os do SPX e o da XM - Ativos Shopee): o modelo é sempre um do SPX.
  const SELETOR_GRUPO_SPX = `li.ssc-menu-submenu:not(.${CLASSE_GRUPO}):not(.xm-grupo)`;

  function montarGrupo(menu) {
    const modelo = menu.querySelector(SELETOR_GRUPO_SPX);
    const itemModelo = menu.querySelector(`a.ssc-menu-item:not(.${CLASSE_ITEM}):not(.xm-ativos-item)`);
    const vLi = dataV(modelo);
    const vTitulo = dataV(modelo && modelo.querySelector('.sub-menu-title'));
    const vIcone = dataV(modelo && modelo.querySelector('svg.title-icon'));
    const vItem = dataV(itemModelo);
    const vCaixa = dataV(itemModelo && itemModelo.parentElement);

    const novo = comDataV(document.createElement('li'), vLi);
    novo.id = ID_GRUPO;
    novo.className = `submenu ssc-menu-submenu ${CLASSE_GRUPO}`;
    novo.style.cssText = 'color: rgba(255, 255, 255, 0.7); border-top: 1px solid transparent; border-bottom: 1px solid transparent;';

    const titulo = document.createElement('div');
    titulo.className = 'ssc-menu-submenu-title';
    const nome = comDataV(document.createElement('span'), vTitulo);
    nome.className = 'sub-menu-title';
    nome.textContent = GRUPO.titulo;
    const seta = document.createElement('span');
    seta.className = 'ssc-menu-submenu-title-icon';
    seta.append(svg(SETA, 'submenu-icon', []));
    titulo.append(svg(ICONE, 'title-icon', vIcone), ' ', nome, ' ', seta);

    const ul = document.createElement('ul');
    ul.className = 'ssc-menu';
    ul.style.cssText = 'color: rgba(255, 255, 255, 0.7); display: none;';
    for (const p of GRUPO.paginas) {
      const caixa = comDataV(document.createElement('div'), vCaixa);
      const item = comDataV(document.createElement('a'), vItem);
      item.className = `submenu-item ssc-menu-item ${CLASSE_ITEM}`;
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
    novo.append(titulo, ul);

    // Um grupo aberto por vez: abrir este fecha os outros abertos (do SPX ou da XM - Ativos
    // Shopee), pelo clique no título deles, para cada um fechar do seu jeito.
    titulo.addEventListener('click', () => {
      const abrir = !novo.classList.contains('ssc-menu-opened');
      if (abrir) fecharOsOutros();
      abrirGrupo(abrir);
    });
    // O realce ao passar o mouse do SPX vem de script deles: a mesma cor, aplicada aqui.
    titulo.addEventListener('mouseenter', () => {
      if (novo.classList.contains('ssc-menu-opened')) return;
      titulo.style.background = HOVER_MENU;
      titulo.style.color = 'rgb(255, 255, 255)';
    });
    titulo.addEventListener('mouseleave', () => {
      if (novo.classList.contains('ssc-menu-opened')) return;
      titulo.style.background = '';
      titulo.style.color = '';
    });
    return novo;
  }

  // Só os grupos de cima do menu. Clicar no título de um subgrupo aberto (ex.: Painel >
  // Entrega/Devolução) faz o SPX reabrir o grupo pai, e ficavam dois abertos (23/11/2026). Se o SPX
  // reabrir um grupo logo depois (o da tela atual), confere mais uma vez.
  const outrosAbertosDeCima = () => [...document.querySelectorAll(`.sidebar-container li.ssc-menu-submenu.ssc-menu-opened:not(.${CLASSE_GRUPO})`)]
    .filter((x) => !x.parentElement.closest('li.ssc-menu-submenu'));
  function fecharOsOutros(conferindo = false) {
    const abertos = outrosAbertosDeCima();
    abertos.forEach((x) => { const t = x.querySelector(':scope > .ssc-menu-submenu-title'); if (t) t.click(); });
    if (!conferindo && abertos.length) setTimeout(() => { if (li && li.classList.contains('ssc-menu-opened') && outrosAbertosDeCima().length) fecharOsOutros(true); }, 400);
  }

  function abrirGrupo(abrir) {
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
    if (li) {
      li.querySelectorAll(`a.${CLASSE_ITEM}`).forEach((item) => {
        const sel = item.dataset.pagina === chave;
        const cursor = item.querySelector('.ssc-menu-item-cursor');
        ['ssc-menu-item-active', 'ssc-menu-item-selected'].forEach((c) => item.classList.toggle(c, sel));
        item.style.fontWeight = sel ? 'bold' : '';
        item.style.color = sel ? 'rgb(255, 255, 255)' : '';
        cursor.style.background = sel ? LARANJA : '';
      });
      ['ssc-menu-item-active', 'ssc-menu-child-item-active'].forEach((c) => li.classList.toggle(c, !!chave));
    }
    document.body.classList.toggle('xm-conf-aberto', !!chave);
  }

  function colocarMenu() {
    const menu = document.querySelector('.sidebar-container .ssc-menu-vertical');
    if (!menu) return;
    if (li && menu.contains(li)) return;
    const lista = (menu.querySelector(SELETOR_GRUPO_SPX) || {}).parentElement || menu;
    const reabrir = li && li.classList.contains('ssc-menu-opened');
    li = montarGrupo(menu);
    // Depois do grupo Ativos (XM - Ativos Shopee), se houver; senão depois do grupo dos pedidos
    // (achado pelo link do Order Tracking: o nome muda com o idioma).
    const ativos = document.getElementById(ID_GRUPO_ATIVOS);
    const pedidos = [...lista.children].find((x) => !x.classList.contains(CLASSE_GRUPO) && x.querySelector('a[href="#/orderTracking"]'));
    const anterior = (ativos && lista.contains(ativos)) ? ativos : pedidos;
    if (anterior) anterior.after(li); else lista.append(li);
    if (reabrir || aberta) abrirGrupo(true);
    if (aberta) marcarItem(atual);
  }

  // ── entrar e sair da pagina ───────────────────────────────────────────────────
  let escondidos = [];
  let migalha = null;

  function areaPrincipal() { return document.querySelector('.content-container .layout-main'); }

  // Esconde o que está na área principal, menos a página daqui. A página de outra extensão XM
  // (data-xm-pagina) já foi fechada por ela mesma ao clicarmos no nosso item.
  function esconderDoSpx(main) {
    for (const c of main.children) {
      if (c.dataset.xmConfPagina || c.dataset.xmConfEscondido) continue;
      escondidos.push([c, c.style.display]);
      c.dataset.xmConfEscondido = '1';
      c.style.display = 'none';
    }
  }

  // O que a página do Vapt Vupt usa daqui.
  const ctx = {
    R, esc, numero, dormir, LARANJA,
    pedirAoFundo: (...a) => pedirAoFundo(...a),
    pedirAoSpx: (...a) => pedirAoSpx(...a),
    blocoLogin: (...a) => blocoLogin(...a),
    aoEntrar: () => {},
  };
  const MODULOS = { vapt: () => self.XMConfVapt };

  function elementoDa(chave) {
    if (!elementos[chave]) {
      const el = MODULOS[chave]().montar(ctx);
      el.dataset.xmConfPagina = chave;
      elementos[chave] = el;
    }
    return elementos[chave];
  }

  function mostrarPagina(chave) {
    const main = areaPrincipal();
    if (!main) return;
    if (atual && atual !== chave) { MODULOS[atual]().aoSair(); elementos[atual].remove(); }
    atual = chave;
    aberta = true;
    esconderDoSpx(main);
    const el = elementoDa(chave);
    if (el.parentElement !== main) main.append(el);
    const bc = document.querySelector('.header-container .ssc-breadcrumb');
    if (bc && !migalha) {
      [...bc.children].forEach((s) => { s.dataset.xmConfDisplay = s.style.display; s.style.display = 'none'; });
      const modelo = bc.querySelector('.ssc-breadcrumb-item');
      migalha = document.createElement('span');
      migalha.className = modelo ? modelo.className : 'ssc-breadcrumb-item';
      bc.append(migalha);
    }
    if (migalha) migalha.textContent = `${GRUPO.titulo}  /  ${GRUPO.paginas.find((p) => p.chave === chave).titulo}`;
    // Um grupo aberto por vez também quando a página abre sem passar pelo título.
    if (li && !li.classList.contains('ssc-menu-opened')) fecharOsOutros();
    abrirGrupo(true);
    marcarItem(chave);
    MODULOS[chave]().aoMostrar();
  }

  function fecharPagina() {
    if (!aberta) return;
    aberta = false;
    if (atual) MODULOS[atual]().aoSair();
    if (elementos[atual]) elementos[atual].remove();
    atual = null;
    escondidos.forEach(([c, d]) => { c.style.display = d; delete c.dataset.xmConfEscondido; });
    escondidos = [];
    const bc = document.querySelector('.header-container .ssc-breadcrumb');
    if (migalha) migalha.remove();
    migalha = null;
    if (bc) [...bc.children].forEach((s) => { if ('xmConfDisplay' in s.dataset) { s.style.display = s.dataset.xmConfDisplay; delete s.dataset.xmConfDisplay; } });
    marcarItem(null);
  }

  // Abrir outro grupo (do SPX ou da XM - Ativos Shopee) fecha o daqui.
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('.sidebar-container .ssc-menu-submenu-title');
    if (!t || t.closest(`li.${CLASSE_GRUPO}`)) return;
    const outro = t.closest('li.ssc-menu-submenu');
    if (outro && !outro.classList.contains('ssc-menu-opened')) abrirGrupo(false);
  }, true);

  // Outro item do menu (do SPX ou da outra extensão) ou outro endereço: volta para a tela do SPX.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.ssc-menu-item');
    if (a && !a.classList.contains(CLASSE_ITEM)) fecharPagina();
  }, true);
  window.addEventListener('hashchange', fecharPagina);

  // O SPX redesenha o menu e o conteúdo: recoloca o grupo e mantém a tela dele escondida.
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

  /** Formulário de login. aoEntrar(r) depois de entrar. */
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

  /** Pede ao spx.js (mundo da página) e espera a resposta final; o andamento vai para aviso. */
  function pedirAoSpx(tipo, dados, aviso = () => {}) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        if (!e.data.fim) { aviso(String(e.data.andamento || ''), e.data); return; }
        window.removeEventListener('message', ouvir);
        if (e.data.erro) reject(new Error(e.data.erro)); else resolve(e.data);
      };
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: tipo, id, ...dados }, location.origin);
    });
  }

  colocarEstilo();
  colocarMenu();
})();
