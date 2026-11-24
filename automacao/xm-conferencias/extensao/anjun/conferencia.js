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
// O resultado e a TELA PADRAO das conferencias (padrao/conferencia-padrao.js, igual no sistema):
// numeros do dia, abas Por cidade / Por entregador / Atribuidos errado / Na base / Certos e o
// "Visualizar" com os pedidos. Aqui so o login, os botoes, o polo e as cores do Element Plus.
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
  const NOMES_POLO = { cacador: 'Caçador', videira: 'Videira', joacaba: 'Joaçaba' };
  // As cores da tela padrao no tema do portal (Element Plus; pega ate o modo escuro).
  const TEMA = {
    '--xcp-texto': 'var(--el-text-color-primary, #303133)', '--xcp-sub': 'var(--el-text-color-secondary, #909399)',
    '--xcp-borda': 'var(--el-border-color-lighter, #ebeef5)', '--xcp-cartao': 'var(--el-bg-color, #fff)',
    '--xcp-janela': 'var(--el-bg-color-overlay, #fff)', '--xcp-cabecalho': 'var(--el-fill-color-light, #f5f7fa)',
    '--xcp-linha': 'var(--el-border-color-extra-light, #f2f6fc)', '--xcp-hover': 'var(--el-fill-color-lighter, #fafafa)',
    '--xcp-destaque': 'var(--el-color-primary, #00a551)', '--xcp-ok': 'var(--el-color-success, #67c23a)',
    '--xcp-base': 'var(--el-color-warning, #e6a23c)', '--xcp-erro': 'var(--el-color-danger, #f56c6c)',
    '--xcp-trilho': 'var(--el-fill-color, #f0f2f5)', '--xcp-campo': 'var(--el-fill-color-blank, #fff)',
    '--xcp-veu': 'var(--el-overlay-color-lighter, rgba(0, 0, 0, .5))', '--xcp-raio': 'var(--el-card-border-radius, 4px)',
    '--xcp-sombra': 'var(--el-box-shadow-light, 0 0 12px rgba(0, 0, 0, .12))',
  };

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
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
    if (vista) vista.fecharJanela();
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
  const estado = { logado: false, nome: '', ocupado: false, polo: '' };
  let vista = null; // a tela padrao (XMConfPadrao.criar)
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
      <div id="xm-cf-resultado" hidden></div>`;
    p.addEventListener('focusin', (e) => { const w = e.target.closest && e.target.closest('.el-input__wrapper'); if (w) w.classList.add('is-focus'); });
    p.addEventListener('focusout', (e) => { const w = e.target.closest && e.target.closest('.el-input__wrapper'); if (w) w.classList.remove('is-focus'); });
    p.querySelector('#xm-cf-entrar').addEventListener('click', entrar);
    p.querySelector('#xm-cf-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    p.querySelector('#xm-cf-conferir').addEventListener('click', conferir);
    p.querySelector('#xm-cf-atualizar').addEventListener('click', carregar);
    p.querySelector('#xm-cf-polo').addEventListener('change', (e) => {
      estado.polo = e.target.value;
      chrome.storage.local.set({ poloAnjun: estado.polo }).catch(() => {});
      carregar();
    });
    vista = self.XMConfPadrao.criar(p.querySelector('#xm-cf-resultado'), {
      tema: TEMA,
      extras: [{ campo: 'cliente', titulo: 'Cliente' }, { campo: 'entrada', titulo: 'Entrada no ponto', formato: 'hora' }],
      info: infoDoDia,
      aoIgnorar: ignorar,
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

  /** Recebidos no ponto, polo e quem leu (a linha embaixo dos numeros). */
  function infoDoDia(r) {
    const lido = r.leitura;
    return `${numero(r.total)} recebidos no ponto hoje${r.polo ? ` · ${NOMES_POLO[r.polo] || r.polo}` : ' (todos os polos)'}`
      + (r.ve_tudo && !r.polo && r.sem_polo ? ` · ${numero(r.sem_polo)} de ponto desconhecido` : '')
      + (lido && lido.lido_em ? ` · lido às ${horaDe(lido.lido_em)}${lido.usuario ? ` por ${lido.usuario}` : ''}` : '')
      + '. As leituras do dia se somam.';
  }

  function mostrar(r) {
    if (!r || !(r.total || (r.ignoradas || []).length)) return vazio(r && r.dia ? 'Nenhum pacote recebido hoje neste polo.' : '');
    $('resultado').hidden = false;
    vista.mostrar(r);
  }

  async function ignorar(cidade, sim) {
    try {
      await sistema('POST', `${ROTA}/ignorar`, { cidade, ignorar: sim });
      await carregar();
    } catch (e) { erroDeConta(e); }
  }

  colocarEstilo();
  colocarMenu();
})();
