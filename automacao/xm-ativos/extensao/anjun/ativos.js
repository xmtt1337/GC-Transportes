// XM - Ativos na Anjun: o grupo "Ativos" (Disparar ativos) na secao "XMTT" do menu lateral do
// portal (acima de "Principais funcoes"), ao lado do grupo "Conferencias" da XM - Conferencias, e a
// pagina de disparo no tema do proprio portal (sem painel flutuante). Mesmo fluxo da Shopee e da iMile.
//
// Menu: xmtt-menu.js (arquivo igual nas duas extensoes) monta a secao com clones do Element Plus do
// portal e cuida de um grupo aberto por vez e de uma pagina por vez entre as extensoes. Fica FORA da
// lista do Vue, entao o portal nunca mexe nela. Recolhido, clicar no icone abre a pagina direto.
//
// Pagina: entra em main.el-main, escondendo (display:none) o que o portal mostra ali. Enquanto ela
// esta aberta, o item deles marcado perde o "is-active" (devolvido ao sair, se o portal nao marcou
// outro nesse meio tempo). Clicar num item do menu deles ou trocar de endereco volta para o portal.
//
// Fluxo: cola os waybills (AJ) -> a busca da Consulta de pacotes (sem dado sensivel: cliente,
// comerciante, status; a plataforma do cliente vira o Remetente) -> o sistema diz quem ja recebeu ativo
// -> "Disparar": para cada marcado, abre nome e telefone (packageInfoLimit + viewPlaintext, 1 pedido
// a cada 3 s) e envia pelo WABA do sistema (modelo confirmacao_anjun).

(() => {
  const R = self.XMAtivosAnjun;
  const CANAL = 'xmAtivosAnjun'; // o mesmo do anjun.js
  const PAUSA_ENVIO_MS = 500;
  const PAGINAS = [{ chave: 'disparar', titulo: 'Disparar ativos' }];
  const NOME_GRUPO = 'Ativos';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // ── estilo (a pagina usa as classes do Element Plus do portal; aqui so o que falta) ──
  const CSS = `
  #xmtt-secao .xmtt-item, #xmtt-secao .el-sub-menu__title { cursor: pointer; }
  .xm-aj-pagina { color: var(--el-text-color-primary, #303133); font-size: 14px; line-height: 1.5; min-width: 0; }
  .xm-aj-pagina * { box-sizing: border-box; }
  .xm-aj-pagina [hidden] { display: none !important; }
  .xm-aj-pagina .el-card { margin-bottom: 12px; }
  .xm-aj-pagina .xm-aj-topo { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .xm-aj-pagina .xm-aj-titulo { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
  .xm-aj-pagina .xm-aj-sub { color: var(--el-text-color-secondary, #909399); font-size: 13px; margin: 0 0 16px; }
  .xm-aj-pagina .xm-aj-conta { color: var(--el-text-color-regular, #606266); font-size: 13px; }
  .xm-aj-pagina .xm-aj-rotulo { display: block; color: var(--el-text-color-regular, #606266); font-size: 13px; margin: 0 0 6px; }
  .xm-aj-pagina .xm-aj-linha { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .xm-aj-pagina .xm-aj-linha > label { flex: 1 1 200px; max-width: 280px; }
  .xm-aj-pagina .xm-aj-acoes { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
  .xm-aj-pagina .xm-aj-acoes .el-button + .el-button { margin-left: 0; }
  .xm-aj-pagina textarea.el-textarea__inner { min-height: 120px; resize: vertical; font-family: inherit; }
  .xm-aj-pagina .xm-aj-status { color: var(--el-text-color-regular, #606266); font-size: 13px; margin: 12px 0 0; }
  .xm-aj-pagina .xm-aj-status.xm-aj-erro { color: var(--el-color-danger, #f56c6c); }
  .xm-aj-pagina .xm-aj-status:empty { display: none; }
  .xm-aj-pagina .xm-aj-cabecalho { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .xm-aj-pagina .xm-aj-contas { color: var(--el-text-color-regular, #606266); font-size: 13px; }
  .xm-aj-pagina .xm-aj-contas b { color: var(--el-text-color-primary, #303133); }
  .xm-aj-pagina .xm-aj-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 6px; }
  .xm-aj-pagina table.xm-aj-tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
  .xm-aj-pagina .xm-aj-tabela th { position: sticky; top: 0; z-index: 1; background: var(--el-fill-color-light, #f5f7fa); color: var(--el-text-color-secondary, #909399); font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5); white-space: nowrap; }
  .xm-aj-pagina .xm-aj-tabela td { padding: 10px 12px; border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5); vertical-align: middle; color: var(--el-text-color-regular, #606266); }
  .xm-aj-pagina .xm-aj-tabela tr:hover td { background: var(--el-fill-color-lighter, #fafafa); }
  .xm-aj-pagina .xm-aj-tabela .xm-aj-cod { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--el-text-color-primary, #303133); }
  .xm-aj-pagina .xm-aj-tabela .xm-aj-apagado { color: var(--el-text-color-placeholder, #a8abb2); }
  .xm-aj-pagina .xm-aj-tabela input[type=checkbox] { width: 14px; height: 14px; accent-color: var(--el-color-primary, #00a551); cursor: pointer; }
  .xm-aj-pagina .xm-aj-previa { white-space: pre-wrap; background: var(--el-fill-color-light, #f5f7fa); border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 6px; padding: 12px 16px; font-size: 13px; margin-top: 12px; }
  .xm-aj-pagina details summary { cursor: pointer; color: var(--el-text-color-regular, #606266); font-size: 13px; margin-top: 12px; }
  `;

  function colocarEstilo() {
    if (document.getElementById('xm-aj-estilo')) return;
    const s = document.createElement('style');
    s.id = 'xm-aj-estilo';
    s.textContent = CSS;
    (document.head || document.documentElement).append(s);
  }

  // ── o grupo "Ativos" na secao XMTT (xmtt-menu.js, o mesmo da XM - Conferencias) ──
  const M = self.XMTTMenu;
  const DONO = 'ativos';
  const ID_GRUPO = 'xmtt-ativos';
  const ORDEM = 2; // depois de Conferencias
  const ICONE_GRUPO = 'M160 224h704v448H448L288 800V672H160Z M352 448h1 M512 448h1 M672 448h1'; // balao de conversa
  const ICONE_DISPARAR ='M112 464 912 112 656 912 512 592Z M512 592 912 112'; // aviao de papel
  let grupo = null;
  let papelAtual = null; // cargo da conta entrada (null = ninguém entrou ainda)
  let aberta = false; // a nossa pagina esta na tela
  let atual = null;
  let pagina = null;
  let escondidos = [];
  let tirados = []; // itens do menu deles que perderam o "is-active" enquanto a nossa pagina esta aberta

  function aoTitulo(li) {
    if (M.recolhido()) { mostrarPagina(atual || PAGINAS[0].chave); return; }
    const abrir = !li.classList.contains('is-opened');
    if (abrir) M.fecharOsOutros(li);
    M.abrirGrupo(li, abrir);
  }

  function marcarItem(chave) {
    if (!grupo) return;
    grupo.querySelectorAll('.xmtt-item').forEach((it) => it.classList.toggle('is-active', it.dataset.pagina === chave));
    grupo.classList.toggle('is-active', !!chave);
  }

  function aplicarPapel(papel) {
    papelAtual = papel;
    const pode = papel == null || R.ROLES_ATIVOS.includes(papel);
    if (grupo) grupo.style.display = pode ? '' : 'none';
    if (!pode) fecharPagina();
  }

  /** Recoloca o grupo (o portal redesenha o menu) e acompanha o recolher do menu deles. */
  function colocarMenu() {
    if (!grupo || !grupo.isConnected) {
      const novo = M.montarGrupo({
        id: ID_GRUPO, ordem: ORDEM, titulo: NOME_GRUPO, caminhoIcone: ICONE_GRUPO, aoTitulo,
        itens: PAGINAS.map((p) => ({ chave: p.chave, titulo: p.titulo, caminhoIcone: ICONE_DISPARAR, aoClicar: () => mostrarPagina(p.chave) })),
      });
      if (!novo) return;
      const abertoAntes = !!(grupo && grupo.classList.contains('is-opened'));
      grupo = novo;
      if (!M.colocarGrupo(grupo)) { grupo = null; return; }
      M.abrirGrupo(grupo, abertoAntes || aberta, true);
      marcarItem(aberta ? atual : null);
      aplicarPapel(papelAtual);
    } else {
      M.colocarGrupo(grupo);
    }
    M.sincronizar();
  }

  // ── entrar e sair da pagina ───────────────────────────────────────────────────
  const areaPrincipal = () => document.querySelector('main.el-main');

  function esconderDoPortal(main) {
    for (const c of main.children) {
      if (c === pagina || c.dataset.xmAjEscondido || c.classList.contains('xmtt-pagina')) continue;
      escondidos.push([c, c.style.display]);
      c.dataset.xmAjEscondido = '1';
      c.style.display = 'none';
    }
    if (pagina.parentElement !== main) main.append(pagina);
  }

  function tirarAtivoDeles() {
    M.ativosDeles().forEach((el) => {
      el.classList.remove('is-active');
      if (!tirados.includes(el)) tirados.push(el);
    });
  }

  function mostrarPagina(chave) {
    const main = areaPrincipal();
    if (!main) return;
    M.anunciarPagina(DONO); // a XM - Conferencias fecha a pagina dela antes
    atual = chave;
    aberta = true;
    if (!pagina) pagina = montarPagina();
    esconderDoPortal(main);
    tirarAtivoDeles();
    if (!M.recolhido()) { M.fecharOsOutros(grupo); M.abrirGrupo(grupo, true); }
    marcarItem(chave);
    atualizarConta();
  }

  function fecharPagina() {
    if (!aberta) return;
    aberta = false;
    atual = null;
    if (pagina) pagina.remove();
    escondidos.forEach(([c, d]) => { c.style.display = d; delete c.dataset.xmAjEscondido; });
    escondidos = [];
    // Devolve o "is-active" só se o portal não marcou outro nesse meio tempo (se marcou, ele já redesenhou).
    if (!M.ativosDeles().length) tirados.forEach((el) => { if (el.isConnected) el.classList.add('is-active'); });
    tirados = [];
    marcarItem(null);
  }

  M.aoAbrirOutra(DONO, fecharPagina);

  // Abrir um grupo deles fecha o nosso; clicar num item deles (ou trocar de endereco) volta ao portal.
  document.addEventListener('click', (e) => {
    const alvo = e.target && e.target.closest ? e.target : null;
    if (!alvo || M.eDoXmtt(alvo) || !alvo.closest('.aside-box')) return;
    const titulo = alvo.closest('.el-sub-menu__title');
    if (titulo) {
      const li = titulo.closest('li.el-sub-menu');
      if (li && !li.classList.contains('is-opened')) M.abrirGrupo(grupo, false);
      return;
    }
    if (alvo.closest('li.el-menu-item')) fecharPagina();
  }, true);
  window.addEventListener('hashchange', fecharPagina);
  window.addEventListener('popstate', fecharPagina);

  // O portal redesenha o menu e o conteúdo: recoloca o grupo e mantém a tela dele escondida.
  let agendado = false;
  new MutationObserver(() => {
    if (agendado) return;
    agendado = true;
    setTimeout(() => {
      agendado = false;
      colocarEstilo();
      colocarMenu();
      if (aberta && pagina) {
        const main = areaPrincipal();
        if (main) esconderDoPortal(main);
        tirarAtivoDeles();
      }
    }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── conversa com o fundo.js e com o anjun.js ──────────────────────────────────
  function pedirAoFundo(tipo, dados = {}) {
    if (!chrome.runtime || !chrome.runtime.id) return Promise.reject(new Error('A extensão foi atualizada. Aperte F5 nesta página.'));
    return chrome.runtime.sendMessage({ tipo, ...dados }).then((r) => {
      if (!r) throw new Error('A extensão não respondeu. Aperte F5 nesta página.');
      if (r.erro) { const e = new Error(r.erro); e.conta = !!r.conta; throw e; }
      return r;
    });
  }

  /** Pede ao anjun.js (mundo da página) e espera a resposta final; o andamento vai para aviso. */
  function pedirAoPortal(tipo, dados, aviso = () => {}) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        if (!e.data.fim) { aviso(String(e.data.andamento || ''), e.data); return; }
        window.removeEventListener('message', ouvir);
        if (e.data.erro) { const err = new Error(e.data.erro); err.msgAnjun = e.data.msgAnjun || ''; reject(err); } else resolve(e.data);
      };
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: tipo, id, ...dados }, location.origin);
    });
  }

  // Ritmo e bloqueio valem para todas as abas da Anjun (duas abas dobrariam o ritmo).
  const lerLocal = (chaves) => chrome.storage.local.get(chaves).catch(() => ({}));
  const gravarLocal = (obj) => chrome.storage.local.set(obj).catch(() => {});

  async function bloqueadoAte() {
    const { anjunBloqueioAte } = await lerLocal('anjunBloqueioAte');
    return Number(anjunBloqueioAte) > Date.now() ? Number(anjunBloqueioAte) : 0;
  }

  async function esperarRitmo() {
    const { anjunOlhoEm } = await lerLocal('anjunOlhoEm');
    const espera = R.RITMO_OLHO_MS - (Date.now() - Number(anjunOlhoEm || 0));
    if (espera > 0) await dormir(espera);
    await gravarLocal({ anjunOlhoEm: Date.now() });
  }

  // ── a pagina ──────────────────────────────────────────────────────────────────
  const estado = { linhas: [], ocupado: false, logado: false, nome: '' };
  const $ = (id) => pagina.querySelector(`#xm-aj-${id}`);

  const botao = (id, texto, primario) => `<button class="el-button${primario ? ' el-button--primary' : ''}" id="xm-aj-${id}" type="button"><span>${texto}</span></button>`;

  function montarPagina() {
    const p = document.createElement('div');
    p.className = 'xm-aj-pagina xmtt-pagina';
    p.innerHTML = `
      <div class="el-card is-always-shadow"><div class="el-card__body">
        <div class="xm-aj-topo">
          <h2 class="xm-aj-titulo">Disparar ativos</h2>
          <span class="xm-aj-conta" id="xm-aj-conta"></span>
        </div>
        <p class="xm-aj-sub">Mensagem de confirmação de recebimento da Anjun (modelo confirmacao_anjun) pelo WhatsApp da GC. A conversa aparece no sistema XMTT.</p>
        <div id="xm-aj-login" hidden>
          <div class="xm-aj-linha">
            <label><span class="xm-aj-rotulo">Usuário do sistema</span><div class="el-input"><div class="el-input__wrapper"><input class="el-input__inner" id="xm-aj-usuario" autocomplete="username"></div></div></label>
            <label><span class="xm-aj-rotulo">Senha</span><div class="el-input"><div class="el-input__wrapper"><input class="el-input__inner" id="xm-aj-senha" type="password" autocomplete="current-password"></div></div></label>
            ${botao('entrar', 'Entrar', true)}
          </div>
        </div>
        <div id="xm-aj-busca" hidden>
          <label class="xm-aj-rotulo" for="xm-aj-codigos">Waybill (um por linha, ou separados por espaço)</label>
          <div class="el-textarea"><textarea class="el-textarea__inner" id="xm-aj-codigos" placeholder="AJ..."></textarea></div>
          <div class="xm-aj-acoes">${botao('buscar', 'Buscar pedidos', true)}${botao('limpar', 'Redefinir', false)}</div>
        </div>
        <p class="xm-aj-status" id="xm-aj-status"></p>
      </div></div>
      <div class="el-card is-always-shadow" id="xm-aj-resultado" hidden><div class="el-card__body">
        <div class="xm-aj-cabecalho">
          <span class="xm-aj-contas" id="xm-aj-contas"></span>
          ${botao('disparar', 'Disparar', true)}
        </div>
        <div class="xm-aj-tabela-caixa">
          <table class="xm-aj-tabela">
            <thead><tr><th style="width:40px"><input type="checkbox" id="xm-aj-todos" title="Marcar todos os prontos"></th><th>Waybill</th><th title="A plataforma que vai na mensagem (pelo Nome do cliente da Anjun)">Remetente</th><th>Cliente</th><th>Status</th><th>Nome do cliente</th><th>Telefone</th><th>Situação</th></tr></thead>
            <tbody id="xm-aj-linhas"></tbody>
          </table>
        </div>
        <details><summary>Ver a mensagem</summary><div class="xm-aj-previa" id="xm-aj-previa"></div></details>
      </div></div>`;
    // O foco do campo, como o Element Plus faz (a borda verde vem da classe is-focus).
    p.addEventListener('focusin', (e) => { const w = e.target.closest && e.target.closest('.el-input__wrapper'); if (w) w.classList.add('is-focus'); });
    p.addEventListener('focusout', (e) => { const w = e.target.closest && e.target.closest('.el-input__wrapper'); if (w) w.classList.remove('is-focus'); });
    p.querySelector('#xm-aj-entrar').addEventListener('click', entrar);
    p.querySelector('#xm-aj-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    p.querySelector('#xm-aj-buscar').addEventListener('click', buscar);
    p.querySelector('#xm-aj-limpar').addEventListener('click', limpar);
    p.querySelector('#xm-aj-disparar').addEventListener('click', disparar);
    p.querySelector('#xm-aj-todos').addEventListener('change', (e) => {
      estado.linhas.forEach((l) => { if (podeMarcar(l)) l.marcado = e.target.checked; });
      desenhar();
    });
    p.querySelector('#xm-aj-linhas').addEventListener('change', (e) => {
      const cod = e.target && e.target.dataset && e.target.dataset.cod;
      const l = estado.linhas.find((x) => x.codigo === cod);
      if (l) { l.marcado = e.target.checked; desenharContas(); }
    });
    return p;
  }

  function travar(id, sim) {
    const b = $(id);
    b.disabled = !!sim;
    b.classList.toggle('is-disabled', !!sim);
  }

  function status(texto, erro = false) {
    if (!pagina) return;
    $('status').textContent = texto;
    $('status').className = `xm-aj-status${erro ? ' xm-aj-erro' : ''}`;
  }

  function mostrarLogin(logado, nome) {
    estado.logado = logado;
    estado.nome = nome || '';
    $('login').hidden = logado;
    $('busca').hidden = !logado;
    $('conta').innerHTML = logado ? `${esc(estado.nome)} · <button class="el-button el-button--primary is-link" id="xm-aj-sair" type="button"><span>Sair</span></button>` : '';
    const sair = $('sair');
    if (sair) sair.addEventListener('click', () => pedirAoFundo('sair').then(() => { aplicarPapel(null); mostrarLogin(false); status(''); }));
    desenharContas();
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
  // Nome e telefone só são abertos na hora do disparo. Já aberto sem nome ou telefone que sirva:
  // abrir de novo só repetiria a consulta.
  const semContato = (l) => l.revelado && (!l.nome || !R.validarTelefone(l.telefone).ok);
  const podeMarcar = (l) => l.achado && l.situacao_envio !== 'enviado' && !semContato(l);

  function situacaoTexto(l) {
    if (l.situacao_envio === 'olho') return ['Abrindo nome e telefone...', 'info'];
    if (l.situacao_envio === 'enviando') return ['Enviando...', 'info'];
    if (l.situacao_envio === 'enviado') return ['Enviado', 'success'];
    if (l.situacao_envio === 'erro') return [`Não enviou: ${l.erro}`, 'danger'];
    if (!l.achado) return [`Não achado${l.motivo ? `: ${l.motivo}` : ''}`, 'danger'];
    if (l.ativo) {
      const quando = l.ativo.enviado_em ? new Date(l.ativo.enviado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      const resposta = l.ativo.estado === 'recebeu' ? ' · respondeu: recebeu' : l.ativo.estado === 'nao_recebeu' ? ' · respondeu: não recebeu' : ' · sem resposta';
      return [`Já recebeu ativo${quando ? ` em ${quando}` : ''}${resposta}`, 'warning'];
    }
    return ['Pronto', 'info'];
  }

  const etiqueta = (texto, tipo) => `<span class="el-tag el-tag--${tipo} el-tag--light"><span class="el-tag__content">${esc(texto)}</span></span>`;

  function desenharContas() {
    if (!pagina) return;
    const ls = estado.linhas;
    const prontos = ls.filter((l) => podeMarcar(l)).length;
    const marcados = ls.filter((l) => l.marcado && podeMarcar(l)).length;
    const naoAchados = ls.filter((l) => !l.achado).length;
    const jaTem = ls.filter((l) => l.ativo).length;
    const enviados = ls.filter((l) => l.situacao_envio === 'enviado').length;
    $('contas').innerHTML = `<b>${numero(ls.length)}</b> pedido(s) · ${numero(ls.length - naoAchados)} achado(s) na Anjun · ${numero(naoAchados)} não achado(s)`
      + ` · ${numero(jaTem)} já receberam ativo${enviados ? ` · <b>${numero(enviados)}</b> enviado(s) agora` : ''}`;
    $('disparar').querySelector('span').textContent = `Disparar ${numero(marcados)} ativo(s)`;
    travar('disparar', estado.ocupado || !marcados || !estado.logado);
    const todos = $('todos');
    todos.checked = prontos > 0 && marcados === prontos;
    todos.disabled = estado.ocupado;
    const exemplo = ls.find((l) => l.nome) || ls.find((l) => l.marcado && podeMarcar(l)) || ls.find((l) => podeMarcar(l));
    $('previa').textContent = R.montarTexto({
      nome: exemplo && exemplo.nome ? exemplo.nome : '(nome do cliente)',
      atendente: estado.nome || '(seu nome)',
      remetente: exemplo && exemplo.remetente ? exemplo.remetente : '(loja)',
      pedido: exemplo ? exemplo.codigo : '(pedido)',
    });
  }

  function desenhar() {
    $('resultado').hidden = !estado.linhas.length;
    $('linhas').innerHTML = estado.linhas.map((l) => {
      const [txt, tipo] = situacaoTexto(l);
      const tel = l.e164 ? R.telefoneLegivel(l.e164) : (l.telefone || (podeMarcar(l) ? 'abre ao disparar' : '—'));
      return `<tr>
        <td><input type="checkbox" data-cod="${esc(l.codigo)}" ${l.marcado ? 'checked' : ''} ${podeMarcar(l) && !estado.ocupado ? '' : 'disabled'}></td>
        <td class="xm-aj-cod">${esc(l.codigo)}</td>
        <td title="${esc(l.comerciante ? `Na Anjun: ${l.comerciante}` : 'Sem comerciante na Anjun')}"${l.remetente ? '' : ' class="xm-aj-apagado"'}>${esc(l.remetente || '—')}</td>
        <td class="xm-aj-apagado">${esc(l.cliente || '—')}</td>
        <td style="white-space:nowrap">${esc(l.status || '—')}</td>
        <td${l.nome ? '' : ' class="xm-aj-apagado"'}>${esc(l.nome || (podeMarcar(l) ? 'abre ao disparar' : '—'))}</td>
        <td style="white-space:nowrap"${l.e164 ? '' : ' class="xm-aj-apagado"'}>${esc(tel)}</td>
        <td>${etiqueta(txt, tipo)}</td>
      </tr>`;
    }).join('');
    desenharContas();
  }

  // ── buscar e disparar ─────────────────────────────────────────────────────────
  async function buscar() {
    if (estado.ocupado) return;
    const { codigos, ignorados } = R.lerCodigos($('codigos').value);
    if (!codigos.length) return status('Cole pelo menos um waybill da Anjun (AJ seguido de números).', true);
    if (codigos.length > R.MAX_CODIGOS) return status(`São ${numero(codigos.length)} waybills; o limite por vez é ${numero(R.MAX_CODIGOS)}.`, true);
    estado.ocupado = true;
    travar('buscar', true);
    try {
      const { pedidos } = await pedirAoPortal('buscar', { codigos }, status);
      status('Vendo no sistema quem já recebeu ativo...');
      const { estados } = await pedirAoFundo('situacao', { pedidos: codigos });
      estado.linhas = pedidos.map((p) => {
        const ativo = (estados || {})[p.codigo] || null;
        const l = { ...p, remetente: p.achado ? R.remetente(p.cliente, p.comerciante) : '', nome: '', telefone: '', e164: '', ativo, marcado: false };
        l.marcado = podeMarcar(l) && !ativo; // quem já recebeu ativo fica desmarcado
        return l;
      });
      const faltam = estado.linhas.filter((l) => !l.achado).length;
      status([
        ignorados.length ? `${numero(ignorados.length)} item(ns) ignorado(s) por não parecer waybill (${ignorados.slice(0, 3).join(', ')}${ignorados.length > 3 ? '...' : ''}).` : '',
        faltam ? `${numero(faltam)} waybill(s) não achado(s) na Anjun.` : '',
        'Nome e telefone são abertos só na hora do disparo, 1 pedido a cada 3 segundos (o ritmo que a Anjun aceita).',
      ].filter(Boolean).join(' '));
    } catch (e) {
      erroDeConta(e);
    } finally {
      estado.ocupado = false;
      travar('buscar', false);
      desenhar();
    }
  }

  async function disparar() {
    if (estado.ocupado) return;
    const fila = estado.linhas.filter((l) => l.marcado && podeMarcar(l));
    if (!fila.length) return;
    const ate = await bloqueadoAte();
    if (ate) return status(`A Anjun pediu para ir mais devagar. Espere até ${hora(ate)} para disparar de novo.`, true);
    estado.ocupado = true;
    let ok = 0;
    let falha = 0;
    let parada = '';
    try {
      for (let i = 0; i < fila.length; i += 1) {
        const l = fila[i];
        status(`Pedido ${numero(i + 1)} de ${numero(fila.length)}... (${numero(ok)} enviado(s), ${numero(falha)} falha(s))`);
        try {
          if (!l.revelado) {
            l.situacao_envio = 'olho';
            desenhar();
            await esperarRitmo();
            const olho = await pedirAoPortal('revelar', { codigo: l.codigo });
            if (olho.semPacote) throw new Error('A Anjun não trouxe o pacote.');
            l.nome = olho.nome;
            l.telefone = olho.telefone;
            if (!l.cliente && olho.cliente) l.cliente = olho.cliente;
            if (!l.comerciante && olho.comerciante) l.comerciante = olho.comerciante;
            if (!l.remetente) l.remetente = R.remetente(l.cliente, l.comerciante);
            l.revelado = true;
          }
          const envio = R.montarEnvio({ codigo: l.codigo, nome: l.nome, telefone: l.telefone, remetente: l.remetente, atendente: estado.nome });
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
          if (semContato(l)) l.marcado = false;
          falha += 1;
          if (e.conta) { erroDeConta(e); parada = e.message; break; }
          if (R.eBloqueio(e.msgAnjun || e.message)) {
            const fim = Date.now() + R.BLOQUEIO_MS;
            await gravarLocal({ anjunBloqueioAte: fim });
            parada = `A Anjun pediu para ir mais devagar ("${e.msgAnjun || e.message}"). Parei; dá para disparar de novo a partir de ${hora(fim)}.`;
            break;
          }
          // A Anjun recusou (sessão, permissão): parar, não insistir.
          if (/A Anjun recusou|não respondeu|F5/.test(e.message)) { parada = e.message; break; }
        }
        desenhar();
        if (parada) break;
        if (i < fila.length - 1) await dormir(PAUSA_ENVIO_MS);
      }
      const resumo = `${numero(ok)} enviado(s), ${numero(falha)} falha(s).`;
      status(parada ? `${parada} ${resumo}` : `Concluído: ${resumo}`, !!parada || (falha > 0 && ok === 0));
    } finally {
      estado.ocupado = false;
      desenhar();
    }
  }

  colocarEstilo();
  colocarMenu();
  if (chrome.runtime && chrome.runtime.id) {
    pedirAoFundo('estado').then((r) => aplicarPapel(r.logado ? r.papel : null)).catch(() => {});
  }
})();
