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
  const ICONE = 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 11H7v-2h10v2zm0-3H7V8h10v2z';
  const SETA = 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z';
  const SVG = 'http://www.w3.org/2000/svg';
  let grupo = null;
  let aberta = false;

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

  // As paginas do grupo, na ordem do menu. "conversas" vem do conversas.js (self.XMAtivosConversas).
  const PAGINAS = [
    { chave: 'disparar', titulo: 'Disparar ativos' },
    { chave: 'conversas', titulo: 'Conversas' },
  ];
  let atual = null; // chave da pagina aberta
  const elementos = {};

  function montarGrupo(menu) {
    const modelo = menu.querySelector('li.ssc-menu-submenu');
    const itemModelo = menu.querySelector('a.ssc-menu-item');
    const vLi = dataV(modelo);
    const vTitulo = dataV(modelo && modelo.querySelector('.sub-menu-title'));
    const vIcone = dataV(modelo && modelo.querySelector('svg.title-icon'));
    const vItem = dataV(itemModelo);
    const vCaixa = dataV(itemModelo && itemModelo.parentElement);

    const li = comDataV(document.createElement('li'), vLi);
    li.id = ID_GRUPO;
    li.className = 'submenu ssc-menu-submenu';
    li.style.cssText = 'color: rgba(255, 255, 255, 0.7); border-top: 1px solid transparent; border-bottom: 1px solid transparent;';

    const titulo = document.createElement('div');
    titulo.className = 'ssc-menu-submenu-title';
    const nome = comDataV(document.createElement('span'), vTitulo);
    nome.className = 'sub-menu-title';
    nome.textContent = 'Ativos Shopee';
    const seta = document.createElement('span');
    seta.className = 'ssc-menu-submenu-title-icon';
    seta.append(svg(SETA, 'submenu-icon', []));
    titulo.append(svg(ICONE, 'title-icon', vIcone), ' ', nome, ' ', seta);

    const ul = document.createElement('ul');
    ul.className = 'ssc-menu';
    ul.style.cssText = 'color: rgba(255, 255, 255, 0.7); display: none;';
    for (const p of PAGINAS) {
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
      caixa.append(item);
      ul.append(caixa);
    }
    li.append(titulo, ul);

    // Um grupo aberto por vez, como o menu do SPX: abrir o nosso fecha o deles (pelo clique no
    // título deles, para o próprio SPX fechar e ficar coerente).
    titulo.addEventListener('click', () => {
      const abrir = !li.classList.contains('ssc-menu-opened');
      if (abrir) fecharOsDoSpx();
      abrirGrupo(abrir);
    });
    return li;
  }

  function fecharOsDoSpx() {
    document.querySelectorAll(`.sidebar-container li.ssc-menu-submenu.ssc-menu-opened:not(#${ID_GRUPO}) > .ssc-menu-submenu-title`)
      .forEach((t) => t.click());
  }

  function abrirGrupo(abrir) {
    if (!grupo) return;
    const titulo = grupo.querySelector('.ssc-menu-submenu-title');
    const ul = grupo.querySelector('ul.ssc-menu');
    grupo.classList.toggle('ssc-menu-opened', abrir);
    ul.style.display = abrir ? '' : 'none';
    ul.style.background = abrir ? FUNDO_ABERTO : '';
    grupo.style.background = abrir ? FUNDO_ABERTO : '';
    titulo.style.color = abrir ? 'rgb(255, 255, 255)' : '';
    titulo.style.background = abrir ? FUNDO_ABERTO : '';
  }

  /** Marca o item da pagina aberta (null = nenhum). */
  function marcarItem(chave) {
    if (!grupo) return;
    grupo.querySelectorAll('a.xm-ativos-item').forEach((item) => {
      const sel = item.dataset.pagina === chave;
      const cursor = item.querySelector('.ssc-menu-item-cursor');
      ['ssc-menu-item-active', 'ssc-menu-item-selected'].forEach((c) => item.classList.toggle(c, sel));
      item.style.fontWeight = sel ? 'bold' : '';
      item.style.color = sel ? 'rgb(255, 255, 255)' : '';
      cursor.style.background = sel ? LARANJA : '';
    });
    ['ssc-menu-item-active', 'ssc-menu-child-item-active'].forEach((c) => grupo.classList.toggle(c, !!chave));
    document.body.classList.toggle('xm-ativos-aberto', !!chave);
  }

  function colocarMenu() {
    const menu = document.querySelector('.sidebar-container .ssc-menu-vertical');
    if (!menu) return;
    if (grupo && menu.contains(grupo)) return;
    const lista = (menu.querySelector('li.ssc-menu-submenu') || {}).parentElement || menu;
    const reabrir = grupo && grupo.classList.contains('ssc-menu-opened');
    grupo = montarGrupo(menu);
    // Logo depois do grupo dos pedidos (achado pelo link do Order Tracking: o nome muda com o
    // idioma, "Pedidos" em português). No fim do menu ficava cortado pela barra de baixo.
    const pedidos = [...lista.children].find((li) => li !== grupo && li.querySelector('a[href="#/orderTracking"]'));
    if (pedidos) pedidos.after(grupo); else lista.append(grupo);
    if (reabrir || aberta) abrirGrupo(true);
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

  // O que a pagina de Conversas usa daqui.
  const ctx = {
    R, esc, numero, dormir, LARANJA,
    pedirAoFundo: (...a) => pedirAoFundo(...a),
    blocoLogin: (...a) => blocoLogin(...a),
  };

  function elementoDa(chave) {
    if (!elementos[chave]) {
      const el = chave === 'disparar' ? (pagina = montarPagina()) : self.XMAtivosConversas.montar(ctx);
      el.dataset.xmPagina = chave;
      elementos[chave] = el;
    }
    return elementos[chave];
  }

  function aoSair(chave) {
    if (chave === 'conversas' && self.XMAtivosConversas) self.XMAtivosConversas.aoSair();
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
    if (migalha) migalha.textContent = `Ativos Shopee  /  ${PAGINAS.find((p) => p.chave === chave).titulo}`;
    abrirGrupo(true);
    marcarItem(chave);
    if (chave === 'disparar') atualizarConta();
    else self.XMAtivosConversas.aoMostrar();
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

  // Abrir um grupo do SPX fecha o nosso (um aberto por vez, como o menu deles).
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('.sidebar-container .ssc-menu-submenu-title');
    if (!t || !grupo || grupo.contains(t)) return;
    const li = t.closest('li.ssc-menu-submenu');
    if (li && !li.classList.contains('ssc-menu-opened')) abrirGrupo(false);
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
    $('conta').innerHTML = logado ? `${esc(estado.nome)} · <button class="xm-link" id="xm-sair" type="button">Sair</button>` : '';
    const sair = $('sair');
    if (sair) sair.addEventListener('click', () => pedirAoFundo('sair').then(() => { mostrarLogin(false); status(''); }));
  }

  function atualizarConta() {
    pedirAoFundo('estado').then((r) => mostrarLogin(r.logado, r.nome)).catch((e) => status(e.message, true));
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

  colocarEstilo();
  colocarMenu();
})();
