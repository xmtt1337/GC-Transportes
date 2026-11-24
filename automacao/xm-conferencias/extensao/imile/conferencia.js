// XM - Conferencias no DS da iMile: o grupo "Conferencias" (Conferencia do dia) dentro do modulo
// "XMTT" (logo XM) da barra de icones do DS, junto com o grupo "Ativos" da XM - Ativos. O modulo, o
// painel e o entrar/sair sao do imile/xmtt-modulo.js (arquivo igual nas duas extensoes); aqui fica a
// pagina da conferencia, no tema do proprio DS.
//
// O resultado e a TELA PADRAO das conferencias (padrao/conferencia-padrao.js, igual no sistema):
// numeros do dia (com "A caminho do DS"), abas Por cidade / Por entregador / Atribuidos errado /
// Na base / Certos e o "Visualizar" com os pedidos. Aqui so o login, os botoes, o polo e as cores do DS.
//
// Fluxo: "Conferir agora" -> o imile.js le no DS os recebidos no hub hoje (todas as paginas) -> o
// fundo.js manda ao sistema (/macros/imile-conferencia/leitura), que separa os que ainda estao a
// caminho e confere o resto contra a lista login -> cidades da iMile: expedido, cidade certa e fora
// de abrangencia.

(() => {
  const CANAL = 'xmConfImile'; // o mesmo do imile.js
  const ROTA = '/macros/imile-conferencia';
  const AZUL = '#2546ff'; // a cor de destaque do DS
  const PAGINAS = [{ chave: 'dia', titulo: 'Conferência do dia' }];
  const NOMES_POLO = { cacador: 'Caçador', videira: 'Videira', joacaba: 'Joaçaba' };
  // As cores da tela padrao no tema do DS.
  const TEMA = {
    '--xcp-texto': '#1d2129', '--xcp-sub': '#86909c', '--xcp-borda': '#e4e5ed', '--xcp-cartao': '#fff', '--xcp-janela': '#fff',
    '--xcp-cabecalho': '#f6f7fa', '--xcp-linha': '#f0f1f5', '--xcp-hover': '#f8f9fc', '--xcp-destaque': AZUL,
    '--xcp-ok': '#00b42a', '--xcp-base': '#d25f00', '--xcp-erro': '#f53f3f', '--xcp-trilho': '#f2f3f5', '--xcp-campo': '#fff',
    '--xcp-veu': 'rgba(29, 33, 41, .45)', '--xcp-raio': '8px', '--xcp-sombra': 'none',
  };

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const horaDe = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  // ── estilo (a pagina; o menu usa as classes do proprio DS) ───────────────────
  const CSS = `
  .xm-ic-pagina { padding: 16px 20px 32px; color: #1d2129; font-size: 14px; line-height: 1.5; box-sizing: border-box; min-width: 0; }
  .xm-ic-pagina * { box-sizing: border-box; }
  .xm-ic-pagina [hidden] { display: none !important; }
  .xm-ic-pagina .xm-cartao { background: #fff; border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; border: 1px solid #e4e5ed; }
  .xm-ic-pagina .xm-topo { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .xm-ic-pagina .xm-titulo { font-size: 18px; font-weight: 600; margin: 0 0 4px; display: flex; align-items: center; gap: 12px; }
  .xm-ic-pagina .xm-sub { color: #86909c; font-size: 13px; margin: 0 0 16px; }
  .xm-ic-pagina .xm-conta { color: #4e5969; font-size: 13px; }
  .xm-ic-pagina .xm-rotulo { display: block; color: #4e5969; font-size: 13px; margin: 0 0 6px; }
  .xm-ic-pagina .xm-campo { width: 100%; height: 34px; padding: 0 12px; border: 1px solid #e4e5ed; border-radius: 6px; font: inherit; color: #1d2129; background: #fff; outline: none; }
  .xm-ic-pagina .xm-campo:focus { border-color: ${AZUL}; }
  .xm-ic-pagina select.xm-polo { height: 30px; border: 1px solid #e4e5ed; border-radius: 6px; padding: 0 8px; font: inherit; font-size: 13px; font-weight: 400; color: #4e5969; background: #fff; }
  .xm-ic-pagina .xm-linha { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .xm-ic-pagina .xm-linha > label { flex: 1 1 200px; max-width: 280px; }
  .xm-ic-pagina .xm-acoes { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .xm-ic-pagina .xm-btn { height: 34px; padding: 0 16px; border: 1px solid #e4e5ed; border-radius: 6px; background: #fff; color: #1d2129; font: inherit; cursor: pointer; white-space: nowrap; }
  .xm-ic-pagina .xm-btn:hover:not(:disabled) { color: ${AZUL}; border-color: ${AZUL}; }
  .xm-ic-pagina .xm-btn-primario { background: ${AZUL}; border-color: ${AZUL}; color: #fff; }
  .xm-ic-pagina .xm-btn-primario:hover:not(:disabled) { background: #1a37d6; border-color: #1a37d6; color: #fff; }
  .xm-ic-pagina .xm-btn:disabled { opacity: .5; cursor: not-allowed; }
  .xm-ic-pagina .xm-link { background: none; border: 0; padding: 0; color: ${AZUL}; font: inherit; font-size: 12px; cursor: pointer; }
  .xm-ic-pagina .xm-link:hover { text-decoration: underline; }
  .xm-ic-pagina .xm-status { color: #4e5969; font-size: 13px; margin: 12px 0 0; }
  .xm-ic-pagina .xm-status:empty { display: none; }
  .xm-ic-pagina .xm-status.xm-erro { color: #f53f3f; }
  `;

  function colocarEstilo() {
    if (document.getElementById('xm-ic-estilo')) return;
    const s = document.createElement('style');
    s.id = 'xm-ic-estilo';
    s.textContent = CSS;
    (document.head || document.documentElement).append(s);
  }

  let pagina = null;

  // ── conversa com o fundo.js e com o imile.js ──────────────────────────────────
  function pedirAoFundo(tipo, dados = {}) {
    if (!chrome.runtime || !chrome.runtime.id) return Promise.reject(new Error('A extensão foi atualizada. Aperte F5 nesta página.'));
    return chrome.runtime.sendMessage({ tipo, ...dados }).then((r) => {
      if (!r) throw new Error('A extensão não respondeu. Aperte F5 nesta página.');
      if (r.erro) { const e = new Error(r.erro); e.conta = !!r.conta; throw e; }
      return r;
    });
  }

  const sistema = (metodo, caminho, corpo) => pedirAoFundo('sistema', { metodo, caminho, corpo }).then((r) => r.dados);

  function pedirAoDs(tipo, dados, aviso = () => {}) {
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
  const $ = (id) => pagina.querySelector(`#xm-ic-${id}`);

  function montarPagina() {
    const p = document.createElement('div');
    p.className = 'xm-ic-pagina';
    p.innerHTML = `
      <div class="xm-cartao">
        <div class="xm-topo">
          <h2 class="xm-titulo">Conferência do dia
            <select class="xm-polo" id="xm-ic-polo" hidden title="Polo (só dev e admin escolhem)">
              <option value="">Todos os polos</option><option value="cacador">Caçador</option><option value="videira">Videira</option><option value="joacaba">Joaçaba</option>
            </select></h2>
          <span class="xm-conta" id="xm-ic-conta"></span>
        </div>
        <p class="xm-sub">Recebidos no hub hoje que já chegaram no DS: todos precisam estar na rua, com o entregador da cidade certa. Os que ainda estão a caminho ficam fora da conta.</p>
        <div id="xm-ic-login" hidden>
          <div class="xm-linha">
            <label><span class="xm-rotulo">Usuário do sistema</span><input class="xm-campo" id="xm-ic-usuario" autocomplete="username"></label>
            <label><span class="xm-rotulo">Senha</span><input class="xm-campo" id="xm-ic-senha" type="password" autocomplete="current-password"></label>
            <button class="xm-btn xm-btn-primario" id="xm-ic-entrar" type="button">Entrar</button>
          </div>
        </div>
        <div class="xm-acoes" id="xm-ic-botoes" hidden>
          <button class="xm-btn xm-btn-primario" id="xm-ic-conferir" type="button">Conferir agora</button>
          <button class="xm-btn" id="xm-ic-atualizar" type="button">Atualizar</button>
        </div>
        <p class="xm-status" id="xm-ic-status"></p>
      </div>
      <div id="xm-ic-resultado" hidden></div>`;
    p.querySelector('#xm-ic-entrar').addEventListener('click', entrar);
    p.querySelector('#xm-ic-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    p.querySelector('#xm-ic-conferir').addEventListener('click', conferir);
    p.querySelector('#xm-ic-atualizar').addEventListener('click', carregar);
    p.querySelector('#xm-ic-polo').addEventListener('change', (e) => {
      estado.polo = e.target.value;
      chrome.storage.local.set({ poloImile: estado.polo }).catch(() => {});
      carregar();
    });
    vista = self.XMConfPadrao.criar(p.querySelector('#xm-ic-resultado'), {
      tema: TEMA,
      extras: [{ campo: 'status_pacote', titulo: 'Last Scan Status' }, { campo: 'entrada', titulo: 'Recebido no hub', formato: 'hora' }],
      rotulos: { aCaminho: 'A caminho do DS' },
      info: infoDoDia,
      aoIgnorar: ignorar,
    });
    chrome.storage.local.get('poloImile').then(({ poloImile }) => { estado.polo = poloImile || ''; p.querySelector('#xm-ic-polo').value = estado.polo; }).catch(() => {});
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
    $('botoes').hidden = !logado;
    $('conta').innerHTML = logado ? `${esc(estado.nome)} · <button class="xm-link" id="xm-ic-sair" type="button">Sair</button>` : '';
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
    $('conferir').disabled = true;
    status('Pedindo ao DS os pacotes recebidos no hub hoje...');
    try {
      const { pacotes } = await pedirAoDs('buscar', {}, status);
      status(`Mandando ${numero(pacotes.length)} pacote(s) ao sistema...`);
      const r = await sistema('POST', `${ROTA}/leitura`, { pacotes });
      status('');
      if (estado.polo) await carregar(); else mostrar(r);
    } catch (e) {
      erroDeConta(e);
    } finally {
      estado.ocupado = false;
      $('conferir').disabled = false;
    }
  }

  function vazio(msg) {
    $('resultado').hidden = true;
    status(msg || 'Ainda não conferido hoje. Clique em Conferir agora.');
  }

  /** Recebidos no hub, ja no DS, polo e quem leu (a linha embaixo dos numeros). */
  function infoDoDia(r) {
    const lido = r.leitura;
    return `${numero(r.recebidos_hub)} recebidos no hub hoje, ${numero(r.total)} já no DS${r.polo ? ` · ${NOMES_POLO[r.polo] || r.polo}` : ' (todos os polos)'}`
      + (r.ve_tudo && !r.polo && r.sem_polo ? ` · ${numero(r.sem_polo)} de station sem polo` : '')
      + (lido && lido.lido_em ? ` · lido às ${horaDe(lido.lido_em)}${lido.usuario ? ` por ${lido.usuario}` : ''}` : '')
      + '. As leituras do dia se somam.';
  }

  function mostrar(r) {
    if (!r || !r.recebidos_hub) return vazio(r && r.dia ? 'Nenhum pacote recebido no hub hoje neste polo.' : '');
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
  self.XMTTDs.registrar({
    dono: 'conferencias', ordem: 1, titulo: 'Conferências', itens: PAGINAS,
    montarPagina: () => (pagina = montarPagina()),
    aoMostrar: () => atualizarConta(),
    aoEsconder: () => { if (vista) vista.fecharJanela(); },
  });
})();
