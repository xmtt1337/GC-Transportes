// XM - Conferencias na Anjun: o grupo "Conferencias" (Conferencia do dia) na secao "XMTT" do menu
// lateral do portal, ao lado do grupo "Ativos" da XM - Ativos, e a pagina da conferencia no tema do
// proprio portal (classes do Element Plus deles; pega ate o modo escuro).
//
// E a mesma conferencia do sistema (Operacao > Anjun > Conferencia), que antes ficava na janela
// flutuante da XM - Operacao: "Conferir agora" -> o anjun.js faz a busca da Consulta de pacotes com
// entrada no ponto = hoje (so waybill, entregador, cidade, ponto, entrada, cliente, valor e status;
// nada do destinatario) -> o fundo.js manda ao sistema (/macros/anjun-conferencia/leitura), que
// confere contra a lista login -> cidades: expedido, cidade certa, fora de abrangencia. Ao abrir,
// mostra a ultima conta de hoje (refeita no sistema com a lista de cidades atual).
//
// Menu e "uma pagina por vez": xmtt-menu.js (arquivo igual nas duas extensoes).

(() => {
  const M = self.XMTTMenu;
  const CANAL = 'xmConfAnjun'; // o mesmo do anjun.js
  const DONO = 'conferencias';
  const ID_GRUPO = 'xmtt-conferencias';
  const ORDEM = 1; // antes de Ativos
  const ROTA = '/macros/anjun-conferencia';
  const PAGINAS = [{ chave: 'dia', titulo: 'Conferência do dia' }];
  const ICONE_GRUPO = 'M352 192H224v704h576V192H672 M384 128h256v128H384Z M384 576l96 96 192-192'; // prancheta com check
  const ICONE_CONFERIR = 'M192 224h640v608H192Z M192 384h640 M352 160v128 M672 160v128 M400 608l80 80 160-160'; // calendario com check (do dia)
  const MAX_LISTA = 300;
  const NOMES_POLO = { cacador: 'Caçador', videira: 'Videira', joacaba: 'Joaçaba' };
  const ROTULO = {
    sem_entregador: ['Sem entregador', 'warning'], cidade_errada: ['Cidade errada', 'danger'],
    usuario_sem_cidade: ['Login sem cidade', 'danger'], sem_cidade: ['Sem cidade', 'danger'],
    fora_abrangencia: ['Fora de abrangência', 'info'],
  };

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const horaDe = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  // ── estilo (a pagina usa as classes do Element Plus do portal; aqui so o que falta) ──
  const CSS = `
  #xmtt-secao .xmtt-item, #xmtt-secao .el-sub-menu__title { cursor: pointer; }
  .xm-cf-pagina { color: var(--el-text-color-primary, #303133); font-size: 14px; line-height: 1.5; min-width: 0; }
  .xm-cf-pagina * { box-sizing: border-box; }
  .xm-cf-pagina [hidden] { display: none !important; }
  .xm-cf-pagina .el-card { margin-bottom: 12px; }
  .xm-cf-pagina .xm-cf-topo { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .xm-cf-pagina .xm-cf-titulo { font-size: 18px; font-weight: 600; margin: 0 0 4px; display: flex; align-items: center; gap: 12px; }
  .xm-cf-pagina .xm-cf-sub { color: var(--el-text-color-secondary, #909399); font-size: 13px; margin: 0 0 16px; }
  .xm-cf-pagina .xm-cf-conta { color: var(--el-text-color-regular, #606266); font-size: 13px; }
  .xm-cf-pagina .xm-cf-rotulo { display: block; color: var(--el-text-color-regular, #606266); font-size: 13px; margin: 0 0 6px; }
  .xm-cf-pagina .xm-cf-linha { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .xm-cf-pagina .xm-cf-linha > label { flex: 1 1 200px; max-width: 280px; }
  .xm-cf-pagina .xm-cf-acoes { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .xm-cf-pagina .xm-cf-acoes .el-button + .el-button { margin-left: 0; }
  .xm-cf-pagina select.xm-cf-polo { height: 30px; border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; padding: 0 8px; font: inherit; font-size: 13px; font-weight: 400; color: var(--el-text-color-regular, #606266); background: var(--el-fill-color-blank, #fff); }
  .xm-cf-pagina .xm-cf-status { color: var(--el-text-color-regular, #606266); font-size: 13px; margin: 12px 0 0; }
  .xm-cf-pagina .xm-cf-status.xm-cf-erro { color: var(--el-color-danger, #f56c6c); }
  .xm-cf-pagina .xm-cf-status:empty { display: none; }
  .xm-cf-pagina .xm-cf-numeros { display: grid; grid-template-columns: auto repeat(3, minmax(0, 1fr)); gap: 24px; align-items: center; }
  @media (max-width: 900px) { .xm-cf-pagina .xm-cf-numeros { grid-template-columns: 1fr 1fr; } }
  .xm-cf-pagina .xm-cf-pizza { --pct: 0; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center;
    background: conic-gradient(var(--el-color-primary, #00a551) calc(var(--pct) * 1%), var(--el-color-warning-light-7, #f8e3c5) 0); }
  .xm-cf-pagina .xm-cf-pizza::before { content: ''; grid-area: 1 / 1; width: 70px; height: 70px; border-radius: 50%; background: var(--el-bg-color, #fff); }
  .xm-cf-pagina .xm-cf-pizza b { grid-area: 1 / 1; z-index: 1; font-size: 15px; }
  .xm-cf-pagina .xm-cf-pizza.xm-cf-vazia { background: var(--el-fill-color, #f0f2f5); }
  .xm-cf-pagina .xm-cf-numero small { display: block; color: var(--el-text-color-secondary, #909399); font-size: 12px; }
  .xm-cf-pagina .xm-cf-numero strong { font-size: 22px; font-weight: 600; }
  .xm-cf-pagina .xm-cf-numero .xm-cf-bom { color: var(--el-color-primary, #00a551); }
  .xm-cf-pagina .xm-cf-numero .xm-cf-alerta { color: var(--el-color-warning, #e6a23c); }
  .xm-cf-pagina .xm-cf-lido { color: var(--el-text-color-secondary, #909399); font-size: 12px; margin-top: 12px; }
  .xm-cf-pagina .xm-cf-secao { font-size: 15px; font-weight: 600; margin: 0 0 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .xm-cf-pagina .xm-cf-legenda { display: flex; gap: 14px; font-size: 12px; font-weight: 400; color: var(--el-text-color-secondary, #909399); }
  .xm-cf-pagina .xm-cf-legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .xm-cf-pagina .xm-cf-barra { display: grid; grid-template-columns: 180px 1fr 48px 44px; gap: 12px; align-items: center; padding: 6px 0; font-size: 13px; }
  .xm-cf-pagina .xm-cf-barra > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .xm-cf-pagina .xm-cf-trilho { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--el-fill-color, #f0f2f5); }
  .xm-cf-pagina .xm-cf-ok { background: var(--el-color-primary, #00a551); }
  .xm-cf-pagina .xm-cf-falta { background: var(--el-color-warning, #e6a23c); }
  .xm-cf-pagina .xm-cf-errada { background: var(--el-color-danger, #f56c6c); }
  .xm-cf-pagina .xm-cf-barra em { font-style: normal; text-align: right; font-variant-numeric: tabular-nums; }
  .xm-cf-pagina .xm-cf-link { background: none; border: 0; padding: 0; color: var(--el-color-primary, #00a551); font: inherit; font-size: 12px; cursor: pointer; }
  .xm-cf-pagina .xm-cf-link:hover { text-decoration: underline; }
  .xm-cf-pagina .xm-cf-fora { margin-top: 10px; font-size: 12px; color: var(--el-text-color-secondary, #909399); }
  .xm-cf-pagina .xm-cf-vazio { color: var(--el-text-color-secondary, #909399); font-size: 13px; padding: 8px 0; }
  .xm-cf-pagina .xm-cf-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid var(--el-border-color-lighter, #ebeef5); border-radius: 6px; }
  .xm-cf-pagina table.xm-cf-tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
  .xm-cf-pagina .xm-cf-tabela th { position: sticky; top: 0; z-index: 1; background: var(--el-fill-color-light, #f5f7fa); color: var(--el-text-color-secondary, #909399); font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5); white-space: nowrap; }
  .xm-cf-pagina .xm-cf-tabela td { padding: 9px 12px; border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5); color: var(--el-text-color-regular, #606266); }
  .xm-cf-pagina .xm-cf-tabela tr:hover td { background: var(--el-fill-color-lighter, #fafafa); }
  .xm-cf-pagina .xm-cf-tabela .xm-cf-cod { white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--el-text-color-primary, #303133); }
  .xm-cf-pagina .xm-cf-mais { color: var(--el-text-color-secondary, #909399); font-size: 12px; margin-top: 8px; }
  `;

  function colocarEstilo() {
    if (document.getElementById('xm-cf-estilo')) return;
    const s = document.createElement('style');
    s.id = 'xm-cf-estilo';
    s.textContent = CSS;
    (document.head || document.documentElement).append(s);
  }

  // ── o grupo "Conferencias" na secao XMTT ──────────────────────────────────────
  let grupo = null;
  let aberta = false;
  let atual = null;
  let pagina = null;
  let escondidos = [];
  let tirados = [];

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

  function colocarMenu() {
    if (!grupo || !grupo.isConnected) {
      const novo = M.montarGrupo({
        id: ID_GRUPO, ordem: ORDEM, titulo: 'Conferências', caminhoIcone: ICONE_GRUPO, aoTitulo,
        itens: PAGINAS.map((p) => ({ chave: p.chave, titulo: p.titulo, caminhoIcone: ICONE_CONFERIR, aoClicar: () => mostrarPagina(p.chave) })),
      });
      if (!novo) return;
      const abertoAntes = !!(grupo && grupo.classList.contains('is-opened'));
      grupo = novo;
      if (!M.colocarGrupo(grupo)) { grupo = null; return; }
      M.abrirGrupo(grupo, abertoAntes || aberta, true);
      marcarItem(aberta ? atual : null);
    } else {
      M.colocarGrupo(grupo);
    }
    M.sincronizar();
  }

  // ── entrar e sair da pagina ───────────────────────────────────────────────────
  const areaPrincipal = () => document.querySelector('main.el-main');

  function esconderDoPortal(main) {
    for (const c of main.children) {
      if (c === pagina || c.dataset.xmCfEscondido || c.classList.contains('xmtt-pagina')) continue;
      escondidos.push([c, c.style.display]);
      c.dataset.xmCfEscondido = '1';
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
    M.anunciarPagina(DONO); // a XM - Ativos fecha a pagina dela antes
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
    escondidos.forEach(([c, d]) => { c.style.display = d; delete c.dataset.xmCfEscondido; });
    escondidos = [];
    if (!M.ativosDeles().length) tirados.forEach((el) => { if (el.isConnected) el.classList.add('is-active'); });
    tirados = [];
    marcarItem(null);
  }

  M.aoAbrirOutra(DONO, fecharPagina);

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

  const sistema = (metodo, caminho, corpo) => pedirAoFundo('sistema', { metodo, caminho, corpo }).then((r) => r.dados);

  function pedirAoPortal(tipo, dados, aviso = () => {}) {
    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        if (!e.data.fim) { aviso(String(e.data.andamento || '')); return; }
        window.removeEventListener('message', ouvir);
        if (e.data.erro) reject(new Error(e.data.erro)); else resolve(e.data);
      };
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: tipo, id, ...dados }, location.origin);
    });
  }

  // ── a pagina ──────────────────────────────────────────────────────────────────
  const estado = { logado: false, nome: '', ocupado: false, polo: '', pendentes: [] };
  const $ = (id) => pagina.querySelector(`#xm-cf-${id}`);
  const botao = (id, texto, primario) => `<button class="el-button${primario ? ' el-button--primary' : ''}" id="xm-cf-${id}" type="button"><span>${texto}</span></button>`;

  function montarPagina() {
    const p = document.createElement('div');
    p.className = 'xm-cf-pagina xmtt-pagina';
    p.innerHTML = `
      <div class="el-card is-always-shadow"><div class="el-card__body">
        <div class="xm-cf-topo">
          <h2 class="xm-cf-titulo">Conferência do dia
            <select class="xm-cf-polo" id="xm-cf-polo" hidden title="Polo (só dev e admin escolhem)">
              <option value="">Todos os polos</option><option value="cacador">Caçador</option><option value="videira">Videira</option><option value="joacaba">Joaçaba</option>
            </select></h2>
          <span class="xm-cf-conta" id="xm-cf-conta"></span>
        </div>
        <p class="xm-cf-sub">Recebidos no ponto hoje: expedidos, na cidade certa do entregador e fora de abrangência. A mesma conferência do sistema (Operação › Anjun › Conferência).</p>
        <div id="xm-cf-login" hidden>
          <div class="xm-cf-linha">
            <label><span class="xm-cf-rotulo">Usuário do sistema</span><div class="el-input"><div class="el-input__wrapper"><input class="el-input__inner" id="xm-cf-usuario" autocomplete="username"></div></div></label>
            <label><span class="xm-cf-rotulo">Senha</span><div class="el-input"><div class="el-input__wrapper"><input class="el-input__inner" id="xm-cf-senha" type="password" autocomplete="current-password"></div></div></label>
            ${botao('entrar', 'Entrar', true)}
          </div>
        </div>
        <div class="xm-cf-acoes" id="xm-cf-botoes" hidden>${botao('conferir', 'Conferir agora', true)}${botao('atualizar', 'Atualizar', false)}</div>
        <p class="xm-cf-status" id="xm-cf-status"></p>
      </div></div>
      <div id="xm-cf-resultado" hidden>
        <div class="el-card is-always-shadow"><div class="el-card__body">
          <div class="xm-cf-numeros">
            <div class="xm-cf-pizza" id="xm-cf-pizza"><b id="xm-cf-pct">—</b></div>
            <div class="xm-cf-numero"><small>Expedidos</small><strong id="xm-cf-expedidos">—</strong><small id="xm-cf-falta"></small></div>
            <div class="xm-cf-numero"><small>Na cidade certa</small><strong id="xm-cf-certo">—</strong><small>dos expedidos</small></div>
            <div class="xm-cf-numero"><small>Fora de abrangência</small><strong id="xm-cf-fora-abr">—</strong><small>cidade que nenhum login faz</small></div>
          </div>
          <div class="xm-cf-lido" id="xm-cf-lido"></div>
        </div></div>
        <div class="el-card is-always-shadow"><div class="el-card__body">
          <div class="xm-cf-secao">Cidades com pendência
            <span class="xm-cf-legenda"><span><i class="xm-cf-ok"></i>certo</span><span><i class="xm-cf-falta"></i>sem entregador</span><span><i class="xm-cf-errada"></i>outro problema</span></span></div>
          <div id="xm-cf-barras"></div>
          <div class="xm-cf-fora" id="xm-cf-fora-conta" hidden></div>
        </div></div>
        <div class="el-card is-always-shadow" id="xm-cf-logins-caixa" hidden><div class="el-card__body">
          <div class="xm-cf-secao">Logins com problema</div>
          <div class="xm-cf-tabela-caixa"><table class="xm-cf-tabela"><thead><tr><th>Login</th><th>Problema</th><th>Pacotes</th></tr></thead><tbody id="xm-cf-logins"></tbody></table></div>
        </div></div>
        <div class="el-card is-always-shadow"><div class="el-card__body">
          <div class="xm-cf-secao"><span id="xm-cf-pend-titulo">Pendentes</span>${botao('copiar', 'Copiar waybills', false)}</div>
          <div id="xm-cf-lista"></div>
        </div></div>
      </div>`;
    p.addEventListener('focusin', (e) => { const w = e.target.closest && e.target.closest('.el-input__wrapper'); if (w) w.classList.add('is-focus'); });
    p.addEventListener('focusout', (e) => { const w = e.target.closest && e.target.closest('.el-input__wrapper'); if (w) w.classList.remove('is-focus'); });
    p.querySelector('#xm-cf-entrar').addEventListener('click', entrar);
    p.querySelector('#xm-cf-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    p.querySelector('#xm-cf-conferir').addEventListener('click', conferir);
    p.querySelector('#xm-cf-atualizar').addEventListener('click', carregar);
    p.querySelector('#xm-cf-copiar').addEventListener('click', copiar);
    p.querySelector('#xm-cf-polo').addEventListener('change', (e) => {
      estado.polo = e.target.value;
      chrome.storage.local.set({ poloAnjun: estado.polo }).catch(() => {});
      carregar();
    });
    chrome.storage.local.get('poloAnjun').then(({ poloAnjun }) => { estado.polo = poloAnjun || ''; p.querySelector('#xm-cf-polo').value = estado.polo; }).catch(() => {});
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
    $('status').className = `xm-cf-status${erro ? ' xm-cf-erro' : ''}`;
  }

  function mostrarLogin(logado, nome) {
    estado.logado = logado;
    estado.nome = nome || '';
    $('login').hidden = logado;
    $('botoes').hidden = !logado;
    $('conta').innerHTML = logado ? `${esc(estado.nome)} · <button class="el-button el-button--primary is-link" id="xm-cf-sair" type="button"><span>Sair</span></button>` : '';
    const sair = $('sair');
    if (sair) sair.addEventListener('click', () => pedirAoFundo('sair').then(() => { mostrarLogin(false); $('resultado').hidden = true; status(''); }));
  }

  function atualizarConta() {
    pedirAoFundo('estado').then((r) => { mostrarLogin(r.logado, r.nome); if (r.logado) carregar(); })
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
      mostrarLogin(true, r.nome);
      status('');
      carregar();
    } catch (e) { status(e.message, true); }
  }

  /** A ultima conta de hoje (refeita no sistema com a lista de cidades atual). */
  async function carregar() {
    if (!estado.logado) return;
    try {
      const r = await sistema('GET', `${ROTA}${estado.polo ? `?polo=${encodeURIComponent(estado.polo)}` : ''}`);
      $('polo').hidden = !r.ve_tudo;
      if (r.dia && r.dia === r.hoje) mostrar(r); else vazio();
    } catch (e) { erroDeConta(e); }
  }

  async function conferir() {
    if (estado.ocupado) return;
    estado.ocupado = true;
    travar('conferir', true);
    status('Pedindo ao portal os pacotes que entraram no ponto hoje...');
    try {
      const { pacotes } = await pedirAoPortal('buscar', {}, status);
      status(`Mandando ${numero(pacotes.length)} pacote(s) ao sistema...`);
      const r = await sistema('POST', `${ROTA}/leitura`, { pacotes });
      status('');
      // A leitura volta com a visao padrao (todos, para dev/admin); com um polo escolhido, refaz no polo.
      if (estado.polo || !r.resumo) await carregar(); else mostrar(r.resumo);
    } catch (e) {
      erroDeConta(e);
    } finally {
      estado.ocupado = false;
      travar('conferir', false);
    }
  }

  function vazio(msg) {
    $('resultado').hidden = true;
    status(msg || 'Ainda não conferido hoje. Clique em Conferir agora.');
  }

  function mostrar(r) {
    if (!r || !r.total) return vazio(r && r.dia ? 'Nenhum pacote recebido hoje neste polo.' : '');
    $('resultado').hidden = false;
    const pizza = $('pizza');
    pizza.classList.toggle('xm-cf-vazia', !r.nossos);
    pizza.style.setProperty('--pct', Math.min(100, Number(r.pct_expedido) || 0));
    $('pct').textContent = pct(r.pct_expedido);
    $('expedidos').textContent = `${numero(r.expedidos)} de ${numero(r.nossos)}`;
    const falta = r.nossos - r.expedidos;
    $('expedidos').className = falta ? '' : 'xm-cf-bom';
    $('falta').textContent = falta ? `faltam ${numero(falta)}` : 'todos expedidos';
    $('certo').textContent = r.expedidos ? pct(r.pct_certo) : '—';
    $('certo').className = r.expedidos && r.certos === r.expedidos ? 'xm-cf-bom' : '';
    const fora = r.contagem ? r.contagem.fora_abrangencia : 0;
    $('fora-abr').textContent = numero(fora);
    $('fora-abr').className = fora ? 'xm-cf-alerta' : 'xm-cf-bom';
    const lido = r.leitura;
    $('lido').textContent = `${numero(r.total)} recebidos hoje${r.polo ? ` · ${NOMES_POLO[r.polo] || r.polo}` : ' (todos os polos)'}`
      + (lido && lido.lido_em ? ` · lido às ${horaDe(lido.lido_em)}${lido.usuario ? ` por ${lido.usuario}` : ''}` : '');
    desenharBarras(r.porCidade);
    desenharForaDaConta(r.ignoradas);
    const logins = r.porLogin || [];
    $('logins-caixa').hidden = !logins.length;
    $('logins').innerHTML = logins.map((l) => `<tr><td class="xm-cf-cod">${esc(l.usuario)}</td>
      <td>${esc(l.sem_cadastro && !l.erradas ? 'login sem cidade cadastrada' : 'pacote de cidade que ele não faz')}</td>
      <td>${numero(l.erradas + l.sem_cadastro)}</td></tr>`).join('');
    desenharPendentes(r.pendentes || []);
  }

  function desenharBarras(porCidade) {
    const comPendencia = (porCidade || []).filter((c) => c.total > c.certos);
    const caixa = $('barras');
    if (!comPendencia.length) { caixa.innerHTML = '<div class="xm-cf-vazio">Nenhuma cidade com pendência.</div>'; return; }
    const maior = Math.max(...comPendencia.map((c) => c.total));
    caixa.innerHTML = comPendencia.map((c, i) => {
      const sem = c.total - c.expedidos;
      const outras = c.expedidos - c.certos;
      const parte = (cls, n) => `<i class="${cls}" style="width:${(n / maior) * 100}%"></i>`;
      return `<div class="xm-cf-barra" title="${esc(`${c.cidade}: ${numero(c.certos)} certos, ${numero(sem)} sem entregador, ${numero(outras)} com outro problema (de ${numero(c.total)})`)}">
        <span>${esc(c.cidade)}</span>
        <div class="xm-cf-trilho">${parte('xm-cf-ok', c.certos)}${parte('xm-cf-falta', sem)}${parte('xm-cf-errada', outras)}</div>
        <em>${numero(sem + outras)}</em>
        <button class="xm-cf-link" type="button" data-tirar="${i}" title="Tirar ${esc(c.cidade)} da conta (para todos)">tirar</button>
      </div>`;
    }).join('');
    caixa.querySelectorAll('[data-tirar]').forEach((b) => b.addEventListener('click', () => ignorar(comPendencia[Number(b.dataset.tirar)].cidade, true)));
  }

  function desenharForaDaConta(ignoradas) {
    const caixa = $('fora-conta');
    caixa.hidden = !(ignoradas && ignoradas.length);
    if (caixa.hidden) { caixa.innerHTML = ''; return; }
    caixa.innerHTML = `Fora da conta: ${ignoradas.map((c, i) => `${esc(c.cidade)} (${numero(c.total)}) <button class="xm-cf-link" type="button" data-voltar="${i}">voltar</button>`).join(' · ')}`;
    caixa.querySelectorAll('[data-voltar]').forEach((b) => b.addEventListener('click', () => ignorar(ignoradas[Number(b.dataset.voltar)].cidade, false)));
  }

  async function ignorar(cidade, sim) {
    try {
      await sistema('POST', `${ROTA}/ignorar`, { cidade, ignorar: sim });
      await carregar();
    } catch (e) { erroDeConta(e); }
  }

  const etiqueta = (status) => {
    const [texto, tipo] = ROTULO[status] || [status, 'info'];
    return `<span class="el-tag el-tag--${tipo} el-tag--light"><span class="el-tag__content">${esc(texto)}</span></span>`;
  };

  function desenharPendentes(pendentes) {
    estado.pendentes = pendentes;
    $('pend-titulo').textContent = `Pendentes (${numero(pendentes.length)})`;
    const lista = $('lista');
    if (!pendentes.length) { lista.innerHTML = '<div class="xm-cf-vazio">Nada pendente. Tudo expedido na cidade certa.</div>'; return; }
    lista.innerHTML = `<div class="xm-cf-tabela-caixa"><table class="xm-cf-tabela"><thead><tr><th>Waybill</th><th>Cidade</th><th>Entregador</th><th>Situação</th></tr></thead><tbody>
      ${pendentes.slice(0, MAX_LISTA).map((p) => `<tr><td class="xm-cf-cod">${esc(p.waybill)}</td><td>${esc(p.cidade || '—')}</td><td>${esc(p.entregador || '—')}</td><td>${etiqueta(p.status)}</td></tr>`).join('')}
      </tbody></table></div>${pendentes.length > MAX_LISTA ? `<div class="xm-cf-mais">Mostrando ${numero(MAX_LISTA)} de ${numero(pendentes.length)}. "Copiar waybills" leva todos.</div>` : ''}`;
  }

  async function copiar() {
    const codigos = estado.pendentes.map((p) => p.waybill);
    if (!codigos.length) return status('Nada para copiar.');
    try {
      await navigator.clipboard.writeText(codigos.join('\n'));
      $('copiar').querySelector('span').textContent = `Copiado (${numero(codigos.length)})`;
      setTimeout(() => { if (pagina) $('copiar').querySelector('span').textContent = 'Copiar waybills'; }, 2500);
    } catch { status('Não deu para copiar.', true); }
  }

  colocarEstilo();
  colocarMenu();
})();
