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
  #${ID_PAGINA} { padding: 16px 24px 32px; color: #333; font-size: 14px; line-height: 1.5; box-sizing: border-box; }
  #${ID_PAGINA} * { box-sizing: border-box; }
  #${ID_PAGINA} .xm-cartao { background: #fff; border-radius: 4px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  #${ID_PAGINA} .xm-titulo { font-size: 18px; font-weight: 500; color: #333; margin: 0 0 4px; }
  #${ID_PAGINA} .xm-sub { color: #999; font-size: 13px; margin: 0 0 16px; }
  #${ID_PAGINA} .xm-rotulo { display: block; color: #666; font-size: 13px; margin: 0 0 6px; }
  #${ID_PAGINA} .xm-campo, #${ID_PAGINA} .xm-area { width: 100%; border: 1px solid #e5e5e5; border-radius: 4px; font: inherit; color: #333; background: #fff; outline: none; }
  #${ID_PAGINA} .xm-campo { height: 32px; padding: 0 12px; }
  #${ID_PAGINA} .xm-area { min-height: 120px; padding: 8px 12px; resize: vertical; font-family: inherit; }
  #${ID_PAGINA} .xm-campo:focus, #${ID_PAGINA} .xm-area:focus { border-color: ${LARANJA}; }
  #${ID_PAGINA} .xm-linha { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  #${ID_PAGINA} .xm-linha > label { flex: 1 1 200px; max-width: 280px; }
  #${ID_PAGINA} .xm-acoes { display: flex; gap: 8px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
  #${ID_PAGINA} .xm-btn { height: 32px; padding: 0 16px; border: 1px solid #e5e5e5; border-radius: 4px; background: #fff; color: #333; font: inherit; cursor: pointer; white-space: nowrap; }
  #${ID_PAGINA} .xm-btn:hover:not(:disabled) { color: ${LARANJA}; border-color: ${LARANJA}; }
  #${ID_PAGINA} .xm-btn-primario { background: ${LARANJA}; border-color: ${LARANJA}; color: #fff; }
  #${ID_PAGINA} .xm-btn-primario:hover:not(:disabled) { background: #d73211; border-color: #d73211; color: #fff; }
  #${ID_PAGINA} .xm-btn:disabled { opacity: .5; cursor: not-allowed; }
  #${ID_PAGINA} .xm-link { background: none; border: 0; padding: 0; color: #2673dd; font: inherit; cursor: pointer; }
  #${ID_PAGINA} .xm-link:hover { text-decoration: underline; }
  #${ID_PAGINA} .xm-status { color: #666; font-size: 13px; }
  #${ID_PAGINA} .xm-status.xm-erro { color: #d0021b; }
  #${ID_PAGINA} .xm-conta { color: #666; font-size: 13px; float: right; }
  #${ID_PAGINA} .xm-cabecalho { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  #${ID_PAGINA} .xm-contas { color: #666; font-size: 13px; }
  #${ID_PAGINA} .xm-contas b { color: #333; }
  #${ID_PAGINA} .xm-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid #f0f0f0; border-radius: 4px; }
  #${ID_PAGINA} table.xm-tabela { width: 100%; border-collapse: collapse; }
  #${ID_PAGINA} .xm-tabela th { position: sticky; top: 0; background: #fafafa; color: #333; font-weight: 500; text-align: left; padding: 10px 16px; border-bottom: 1px solid #e8e8e8; white-space: nowrap; z-index: 1; }
  #${ID_PAGINA} .xm-tabela td { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  #${ID_PAGINA} .xm-tabela tr:hover td { background: #fafafa; }
  #${ID_PAGINA} .xm-tabela .xm-cod { white-space: nowrap; }
  #${ID_PAGINA} .xm-tabela input[type=checkbox] { width: 16px; height: 16px; accent-color: ${LARANJA}; cursor: pointer; }
  #${ID_PAGINA} .xm-tag { display: inline-block; padding: 0 8px; border-radius: 2px; font-size: 12px; line-height: 20px; white-space: nowrap; }
  #${ID_PAGINA} .xm-tag-pronto { background: #f5f5f5; color: #666; }
  #${ID_PAGINA} .xm-tag-ok { background: #e7f6ec; color: #1a8f43; }
  #${ID_PAGINA} .xm-tag-aviso { background: #fff5e6; color: #b26a00; }
  #${ID_PAGINA} .xm-tag-erro { background: #fdecee; color: #d0021b; }
  #${ID_PAGINA} .xm-previa { white-space: pre-wrap; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 4px; padding: 12px 16px; color: #333; font-size: 13px; margin-top: 12px; }
  #${ID_PAGINA} details summary { cursor: pointer; color: #666; font-size: 13px; margin-top: 12px; }
  #${ID_PAGINA} [hidden] { display: none !important; }
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
    const caixa = comDataV(document.createElement('div'), vCaixa);
    const item = comDataV(document.createElement('a'), vItem);
    item.className = 'submenu-item ssc-menu-item xm-ativos-item';
    item.title = 'Disparar ativos';
    item.setAttribute('data-active-background', '#ee4d2d');
    item.style.paddingLeft = '44px';
    const cursor = document.createElement('span');
    cursor.className = 'ssc-menu-item-cursor';
    item.append(cursor, ' Disparar ativos ');
    caixa.append(item);
    ul.append(caixa);
    li.append(titulo, ul);

    titulo.addEventListener('click', () => abrirGrupo(!li.classList.contains('ssc-menu-opened')));
    item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); mostrarPagina(); });
    return li;
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

  function marcarItem(sel) {
    if (!grupo) return;
    const item = grupo.querySelector('a.xm-ativos-item');
    const cursor = item.querySelector('.ssc-menu-item-cursor');
    ['ssc-menu-item-active', 'ssc-menu-item-selected'].forEach((c) => item.classList.toggle(c, sel));
    ['ssc-menu-item-active', 'ssc-menu-child-item-active'].forEach((c) => grupo.classList.toggle(c, sel));
    item.style.fontWeight = sel ? 'bold' : '';
    item.style.color = sel ? 'rgb(255, 255, 255)' : '';
    cursor.style.background = sel ? LARANJA : '';
    document.body.classList.toggle('xm-ativos-aberto', sel);
  }

  function colocarMenu() {
    const menu = document.querySelector('.sidebar-container .ssc-menu-vertical');
    if (!menu) return;
    if (grupo && menu.contains(grupo)) return;
    const lista = (menu.querySelector('li.ssc-menu-submenu') || {}).parentElement || menu;
    const reabrir = grupo && grupo.classList.contains('ssc-menu-opened');
    grupo = montarGrupo(menu);
    // Logo depois de "Order Management" (onde estão os pedidos); no fim do menu ficava cortado
    // pela barra de baixo. Se o SPX mudar o nome do grupo, vai para o fim.
    const pedidos = [...lista.children].find((li) => /order management/i.test((li.querySelector('.sub-menu-title') || {}).textContent || ''));
    if (pedidos) pedidos.after(grupo); else lista.append(grupo);
    if (reabrir || aberta) abrirGrupo(true);
    if (aberta) marcarItem(true);
  }

  // ── entrar e sair da pagina ───────────────────────────────────────────────────
  let pagina = null;
  let escondidos = [];
  let migalha = null;

  function areaPrincipal() { return document.querySelector('.content-container .layout-main'); }

  function esconderDoSpx(main) {
    for (const c of main.children) {
      if (c === pagina || c.dataset.xmEscondido) continue;
      escondidos.push([c, c.style.display]);
      c.dataset.xmEscondido = '1';
      c.style.display = 'none';
    }
  }

  function mostrarPagina() {
    const main = areaPrincipal();
    if (!main) return;
    if (!pagina) pagina = montarPagina();
    aberta = true;
    esconderDoSpx(main);
    if (pagina.parentElement !== main) main.append(pagina);
    const bc = document.querySelector('.header-container .ssc-breadcrumb');
    if (bc && !migalha) {
      [...bc.children].forEach((s) => { s.dataset.xmDisplay = s.style.display; s.style.display = 'none'; });
      const modelo = bc.querySelector('.ssc-breadcrumb-item');
      migalha = document.createElement('span');
      migalha.className = modelo ? modelo.className : 'ssc-breadcrumb-item';
      migalha.textContent = 'Ativos Shopee  /  Disparar ativos';
      bc.append(migalha);
    }
    abrirGrupo(true);
    marcarItem(true);
    atualizarConta();
  }

  function fecharPagina() {
    if (!aberta) return;
    aberta = false;
    if (pagina) pagina.remove();
    escondidos.forEach(([c, d]) => { c.style.display = d; delete c.dataset.xmEscondido; });
    escondidos = [];
    const bc = document.querySelector('.header-container .ssc-breadcrumb');
    if (migalha) migalha.remove();
    migalha = null;
    if (bc) [...bc.children].forEach((s) => { if ('xmDisplay' in s.dataset) { s.style.display = s.dataset.xmDisplay; delete s.dataset.xmDisplay; } });
    marcarItem(false);
  }

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
      if (aberta) { const main = areaPrincipal(); if (main) { esconderDoSpx(main); if (pagina.parentElement !== main) main.append(pagina); } }
    }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── conversa com o fundo.js e com o spx.js ────────────────────────────────────
  function pedirAoFundo(tipo, dados = {}) {
    if (!chrome.runtime || !chrome.runtime.id) return Promise.reject(new Error('A extensão foi atualizada. Aperte F5 nesta página.'));
    return chrome.runtime.sendMessage({ tipo, ...dados }).then((r) => {
      if (!r) throw new Error('A extensão não respondeu. Aperte F5 nesta página.');
      if (r.erro) { const e = new Error(r.erro); e.conta = !!r.conta; throw e; }
      return r;
    });
  }

  function pedirExport(codigos, aviso) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data.xmAtivos !== 'resposta' || e.data.id !== id) return;
        if (!e.data.fim) { aviso(String(e.data.andamento || '')); return; }
        window.removeEventListener('message', ouvir);
        if (e.data.erro) reject(new Error(e.data.erro)); else resolve(e.data.url);
      };
      window.addEventListener('message', ouvir);
      window.postMessage({ xmAtivos: 'exportar', id, codigos }, location.origin);
    });
  }

  // ── a pagina ──────────────────────────────────────────────────────────────────
  const estado = { linhas: [], ocupado: false, logado: false, nome: '' };
  const $ = (id) => pagina.querySelector(`#xm-${id}`);

  function montarPagina() {
    const p = document.createElement('div');
    p.id = ID_PAGINA;
    p.innerHTML = `
      <div class="xm-cartao">
        <span class="xm-conta" id="xm-conta"></span>
        <h2 class="xm-titulo">Disparar ativos</h2>
        <p class="xm-sub">Mensagem "confirmação de entrega" da Shopee pelo WhatsApp da GC. Nome e telefone saem do export de pedidos do SPX, sem usar o olho. A conversa aparece no sistema.</p>
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
            <button class="xm-btn xm-btn-primario" id="xm-buscar" type="button">Buscar nome e telefone</button>
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
  const podeMarcar = (l) => l.envio && !l.envio.erro && l.situacao_envio !== 'enviado';

  function situacaoTexto(l) {
    if (l.situacao_envio === 'enviando') return ['Enviando...', 'pronto'];
    if (l.situacao_envio === 'enviado') return ['Enviado', 'ok'];
    if (l.situacao_envio === 'erro') return [`Não enviou: ${l.erro}`, 'erro'];
    if (!l.achado) return ['Não achado no SPX', 'erro'];
    if (l.envio.erro) return [l.envio.erro, 'erro'];
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
    const semContato = ls.filter((l) => !l.achado || (l.envio && l.envio.erro)).length;
    const jaTem = ls.filter((l) => l.ativo).length;
    const enviados = ls.filter((l) => l.situacao_envio === 'enviado').length;
    $('contas').innerHTML = `<b>${numero(ls.length)}</b> pedido(s) · ${numero(prontos)} com nome e telefone · ${numero(semContato)} sem contato`
      + ` · ${numero(jaTem)} já receberam ativo${enviados ? ` · <b>${numero(enviados)}</b> enviado(s) agora` : ''}`;
    const btn = $('disparar');
    btn.textContent = `Disparar ${numero(marcados)} ativo(s)`;
    btn.disabled = estado.ocupado || !marcados;
    const todos = $('todos');
    todos.checked = prontos > 0 && marcados === prontos;
    todos.disabled = estado.ocupado;
    const primeiro = ls.find((l) => l.marcado && podeMarcar(l)) || ls.find((l) => podeMarcar(l));
    $('previa').textContent = primeiro ? primeiro.envio.corpo.texto : 'Nenhum pedido com nome e telefone.';
  }

  function desenhar() {
    $('resultado').hidden = !estado.linhas.length;
    $('linhas').innerHTML = estado.linhas.map((l) => {
      const [txt, tipo] = situacaoTexto(l);
      const tel = l.envio && l.envio.corpo ? R.telefoneLegivel(l.envio.corpo.numero) : (l.telefone || '—');
      return `<tr>
        <td><input type="checkbox" data-cod="${esc(l.codigo)}" ${l.marcado ? 'checked' : ''} ${podeMarcar(l) && !estado.ocupado ? '' : 'disabled'}></td>
        <td class="xm-cod">${esc(l.codigo)}</td>
        <td>${esc(l.nome || '—')}</td>
        <td style="white-space:nowrap">${esc(tel)}</td>
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
      const url = await pedirExport(codigos, status);
      status('Lendo nome e telefone...');
      const { contatos } = await pedirAoFundo('contatos', { url });
      status('Vendo no sistema quem já recebeu ativo...');
      const { estados } = await pedirAoFundo('situacao', { pedidos: codigos });
      const deCodigo = new Map(contatos.map((c) => [c.codigo, c]));
      estado.linhas = codigos.map((codigo) => {
        const c = deCodigo.get(codigo);
        const envio = c ? R.montarEnvio(c) : null;
        const ativo = (estados || {})[codigo] || null;
        const l = { codigo, achado: !!c, nome: c ? c.nome : '', telefone: c ? c.telefone : '', envio, ativo, marcado: false };
        l.marcado = podeMarcar(l) && !ativo; // quem já recebeu ativo fica desmarcado
        return l;
      });
      const faltam = estado.linhas.filter((l) => !l.achado).length;
      status(faltam ? `${numero(faltam)} BR não vieram no export do SPX (de outra estação ou código errado).` : '');
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
    if (!window.confirm(`Disparar ${numero(fila.length)} ativo(s) pelo WhatsApp da GC?`)) return;
    estado.ocupado = true;
    let ok = 0;
    let falha = 0;
    try {
      for (let i = 0; i < fila.length; i += 1) {
        const l = fila[i];
        status(`Enviando ${numero(i + 1)} de ${numero(fila.length)}... (${numero(ok)} ok, ${numero(falha)} falha(s))`);
        l.situacao_envio = 'enviando';
        desenhar();
        try {
          await pedirAoFundo('enviar', { corpo: l.envio.corpo });
          l.situacao_envio = 'enviado';
          l.marcado = false;
          ok += 1;
        } catch (e) {
          l.situacao_envio = 'erro';
          l.erro = e.message;
          falha += 1;
          if (e.conta) { erroDeConta(e); break; }
        }
        desenhar();
        if (i < fila.length - 1) await dormir(PAUSA_ENVIO_MS);
      }
      status(`Concluído: ${numero(ok)} enviado(s), ${numero(falha)} falha(s).`, falha > 0 && ok === 0);
    } finally {
      estado.ocupado = false;
      desenhar();
    }
  }

  colocarEstilo();
  colocarMenu();
})();
