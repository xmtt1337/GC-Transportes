// XM - Conferencias no DS da iMile: o grupo "Conferencias" (Conferencia do dia) dentro do modulo
// "XMTT" (logo XM) da barra de icones do DS, junto com o grupo "Ativos" da XM - Ativos. O modulo, o
// painel e o entrar/sair sao do imile/xmtt-modulo.js (arquivo igual nas duas extensoes); aqui fica a
// pagina da conferencia, no tema do proprio DS.
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
  const MAX_LISTA = 300;
  const NOMES_POLO = { cacador: 'Caçador', videira: 'Videira', joacaba: 'Joaçaba' };
  const ROTULO = {
    sem_entregador: ['Na base, sem entregador', 'aviso'], cidade_errada: ['Cidade errada', 'erro'],
    usuario_sem_cidade: ['Entregador sem cidade', 'erro'], sem_cidade: ['Sem cidade', 'erro'],
    fora_abrangencia: ['Fora de abrangência', 'pronto'],
  };

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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
  .xm-ic-pagina .xm-numeros { display: grid; grid-template-columns: auto repeat(4, minmax(0, 1fr)); gap: 24px; align-items: center; }
  @media (max-width: 1000px) { .xm-ic-pagina .xm-numeros { grid-template-columns: 1fr 1fr; } }
  .xm-ic-pagina .xm-pizza { --pct: 0; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(#00b42a calc(var(--pct) * 1%), #ffe4ba 0); }
  .xm-ic-pagina .xm-pizza::before { content: ''; grid-area: 1 / 1; width: 70px; height: 70px; border-radius: 50%; background: #fff; }
  .xm-ic-pagina .xm-pizza b { grid-area: 1 / 1; z-index: 1; font-size: 15px; }
  .xm-ic-pagina .xm-pizza.xm-vazia { background: #f2f3f5; }
  .xm-ic-pagina .xm-numero small { display: block; color: #86909c; font-size: 12px; }
  .xm-ic-pagina .xm-numero strong { font-size: 22px; font-weight: 600; }
  .xm-ic-pagina .xm-bom { color: #00b42a; }
  .xm-ic-pagina .xm-alerta { color: #d25f00; }
  .xm-ic-pagina .xm-lido { color: #86909c; font-size: 12px; margin-top: 12px; }
  .xm-ic-pagina .xm-secao { font-size: 15px; font-weight: 600; margin: 0 0 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .xm-ic-pagina .xm-legenda { display: flex; gap: 14px; font-size: 12px; font-weight: 400; color: #86909c; }
  .xm-ic-pagina .xm-legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .xm-ic-pagina .xm-barra { display: grid; grid-template-columns: 180px 1fr 48px 44px; gap: 12px; align-items: center; padding: 6px 0; font-size: 13px; }
  .xm-ic-pagina .xm-barra > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .xm-ic-pagina .xm-trilho { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: #f2f3f5; }
  .xm-ic-pagina .xm-ok { background: #00b42a; }
  .xm-ic-pagina .xm-falta { background: #ff7d00; }
  .xm-ic-pagina .xm-errada { background: #f53f3f; }
  .xm-ic-pagina .xm-barra em { font-style: normal; text-align: right; font-variant-numeric: tabular-nums; }
  .xm-ic-pagina .xm-nota { margin-top: 10px; font-size: 12px; color: #86909c; }
  .xm-ic-pagina .xm-vazio { color: #86909c; font-size: 13px; padding: 8px 0; }
  .xm-ic-pagina .xm-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid #e4e5ed; border-radius: 6px; }
  .xm-ic-pagina table.xm-tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
  .xm-ic-pagina .xm-tabela th { position: sticky; top: 0; z-index: 1; background: #f6f7fa; color: #4e5969; font-weight: 500; text-align: left; padding: 10px 14px; border-bottom: 1px solid #e4e5ed; white-space: nowrap; }
  .xm-ic-pagina .xm-tabela td { padding: 9px 14px; border-bottom: 1px solid #f0f1f5; color: #4e5969; }
  .xm-ic-pagina .xm-tabela tr:hover td { background: #f8f9fc; }
  .xm-ic-pagina .xm-cod { white-space: nowrap; font-variant-numeric: tabular-nums; color: #1d2129; }
  .xm-ic-pagina .xm-tag { display: inline-block; padding: 0 8px; border-radius: 4px; font-size: 12px; line-height: 22px; white-space: nowrap; }
  .xm-ic-pagina .xm-tag-pronto { background: #f2f3f5; color: #4e5969; }
  .xm-ic-pagina .xm-tag-aviso { background: #fff7e8; color: #d25f00; }
  .xm-ic-pagina .xm-tag-erro { background: #ffece8; color: #f53f3f; }
  .xm-ic-pagina .xm-mais { color: #86909c; font-size: 12px; margin-top: 8px; }
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
  const estado = { logado: false, nome: '', ocupado: false, polo: '', pendentes: [] };
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
      <div id="xm-ic-resultado" hidden>
        <div class="xm-cartao">
          <div class="xm-numeros">
            <div class="xm-pizza" id="xm-ic-pizza"><b id="xm-ic-pct">—</b></div>
            <div class="xm-numero"><small>Na rua</small><strong id="xm-ic-expedidos">—</strong><small id="xm-ic-falta"></small></div>
            <div class="xm-numero"><small>Na cidade certa</small><strong id="xm-ic-certo">—</strong><small>dos que estão na rua</small></div>
            <div class="xm-numero"><small>Fora de abrangência</small><strong id="xm-ic-fora-abr">—</strong><small>cidade que nenhum entregador faz</small></div>
            <div class="xm-numero"><small>A caminho do DS</small><strong id="xm-ic-caminho">—</strong><small>fora da conta</small></div>
          </div>
          <div class="xm-lido" id="xm-ic-lido"></div>
          <div class="xm-nota" id="xm-ic-caminho-status" hidden></div>
        </div>
        <div class="xm-cartao">
          <div class="xm-secao">Cidades com pendência
            <span class="xm-legenda"><span><i class="xm-ok"></i>certo</span><span><i class="xm-falta"></i>na base</span><span><i class="xm-errada"></i>outro problema</span></span></div>
          <div id="xm-ic-barras"></div>
          <div class="xm-nota" id="xm-ic-fora-conta" hidden></div>
        </div>
        <div class="xm-cartao" id="xm-ic-logins-caixa" hidden>
          <div class="xm-secao">Entregadores com problema</div>
          <div class="xm-tabela-caixa"><table class="xm-tabela"><thead><tr><th>Entregador</th><th>Problema</th><th>Pacotes</th></tr></thead><tbody id="xm-ic-logins"></tbody></table></div>
        </div>
        <div class="xm-cartao">
          <div class="xm-secao"><span id="xm-ic-pend-titulo">Pendentes</span><button class="xm-btn" id="xm-ic-copiar" type="button">Copiar waybills</button></div>
          <div id="xm-ic-lista"></div>
        </div>
      </div>`;
    p.querySelector('#xm-ic-entrar').addEventListener('click', entrar);
    p.querySelector('#xm-ic-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
    p.querySelector('#xm-ic-conferir').addEventListener('click', conferir);
    p.querySelector('#xm-ic-atualizar').addEventListener('click', carregar);
    p.querySelector('#xm-ic-copiar').addEventListener('click', copiar);
    p.querySelector('#xm-ic-polo').addEventListener('change', (e) => {
      estado.polo = e.target.value;
      chrome.storage.local.set({ poloImile: estado.polo }).catch(() => {});
      carregar();
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

  function mostrar(r) {
    if (!r || !r.recebidos_hub) return vazio(r && r.dia ? 'Nenhum pacote recebido no hub hoje neste polo.' : '');
    $('resultado').hidden = false;
    const pizza = $('pizza');
    pizza.classList.toggle('xm-vazia', !r.nossos);
    pizza.style.setProperty('--pct', Math.min(100, Number(r.pct_expedido) || 0));
    $('pct').textContent = r.nossos ? pct(r.pct_expedido) : '—';
    $('expedidos').textContent = `${numero(r.expedidos)} de ${numero(r.nossos)}`;
    const falta = r.nossos - r.expedidos;
    $('expedidos').className = falta ? '' : 'xm-bom';
    $('falta').textContent = falta ? `${numero(falta)} na base sem entregador` : 'todos na rua';
    $('certo').textContent = r.expedidos ? pct(r.pct_certo) : '—';
    $('certo').className = r.expedidos && r.certos === r.expedidos ? 'xm-bom' : '';
    const fora = r.contagem ? r.contagem.fora_abrangencia : 0;
    $('fora-abr').textContent = numero(fora);
    $('fora-abr').className = fora ? 'xm-alerta' : 'xm-bom';
    const caminho = r.a_caminho || { total: 0, porStatus: [] };
    $('caminho').textContent = numero(caminho.total);
    const notaCaminho = $('caminho-status');
    notaCaminho.hidden = !caminho.total;
    notaCaminho.textContent = caminho.total ? `A caminho (ainda não chegaram no DS): ${caminho.porStatus.map((s) => `${s.status} (${numero(s.qtd)})`).join(' · ')}` : '';
    const lido = r.leitura;
    $('lido').textContent = `${numero(r.recebidos_hub)} recebidos no hub hoje, ${numero(r.total)} já no DS${r.polo ? ` · ${NOMES_POLO[r.polo] || r.polo}` : ' (todos os polos)'}`
      + (r.ve_tudo && !r.polo && r.sem_polo ? ` · ${numero(r.sem_polo)} de station sem polo` : '')
      + (lido && lido.lido_em ? ` · lido às ${horaDe(lido.lido_em)}${lido.usuario ? ` por ${lido.usuario}` : ''}` : '');
    desenharBarras(r.porCidade);
    desenharForaDaConta(r.ignoradas);
    const logins = r.porLogin || [];
    $('logins-caixa').hidden = !logins.length;
    $('logins').innerHTML = logins.map((l) => `<tr><td class="xm-cod">${esc(l.usuario)}</td>
      <td>${esc(l.sem_cadastro && !l.erradas ? 'sem cidade cadastrada no sistema' : 'pacote de cidade que ele não faz')}</td>
      <td>${numero(l.erradas + l.sem_cadastro)}</td></tr>`).join('');
    desenharPendentes(r.pendentes || []);
  }

  function desenharBarras(porCidade) {
    const comPendencia = (porCidade || []).filter((c) => c.total > c.certos);
    const caixa = $('barras');
    if (!comPendencia.length) { caixa.innerHTML = '<div class="xm-vazio">Nenhuma cidade com pendência.</div>'; return; }
    const maior = Math.max(...comPendencia.map((c) => c.total));
    caixa.innerHTML = comPendencia.map((c, i) => {
      const sem = c.total - c.expedidos;
      const outras = c.expedidos - c.certos;
      const parte = (cls, n) => `<i class="${cls}" style="width:${(n / maior) * 100}%"></i>`;
      return `<div class="xm-barra" title="${esc(`${c.cidade}: ${numero(c.certos)} certos, ${numero(sem)} na base, ${numero(outras)} com outro problema (de ${numero(c.total)})`)}">
        <span>${esc(c.cidade)}</span>
        <div class="xm-trilho">${parte('xm-ok', c.certos)}${parte('xm-falta', sem)}${parte('xm-errada', outras)}</div>
        <em>${numero(sem + outras)}</em>
        <button class="xm-link" type="button" data-tirar="${i}" title="Tirar ${esc(c.cidade)} da conta (para todos)">tirar</button>
      </div>`;
    }).join('');
    caixa.querySelectorAll('[data-tirar]').forEach((b) => b.addEventListener('click', () => ignorar(comPendencia[Number(b.dataset.tirar)].cidade, true)));
  }

  function desenharForaDaConta(ignoradas) {
    const caixa = $('fora-conta');
    caixa.hidden = !(ignoradas && ignoradas.length);
    if (caixa.hidden) { caixa.innerHTML = ''; return; }
    caixa.innerHTML = `Fora da conta: ${ignoradas.map((c, i) => `${esc(c.cidade)} (${numero(c.total)}) <button class="xm-link" type="button" data-voltar="${i}">voltar</button>`).join(' · ')}`;
    caixa.querySelectorAll('[data-voltar]').forEach((b) => b.addEventListener('click', () => ignorar(ignoradas[Number(b.dataset.voltar)].cidade, false)));
  }

  async function ignorar(cidade, sim) {
    try {
      await sistema('POST', `${ROTA}/ignorar`, { cidade, ignorar: sim });
      await carregar();
    } catch (e) { erroDeConta(e); }
  }

  const etiqueta = (s) => {
    const [texto, tipo] = ROTULO[s] || [s, 'pronto'];
    return `<span class="xm-tag xm-tag-${tipo}">${esc(texto)}</span>`;
  };

  function desenharPendentes(pendentes) {
    estado.pendentes = pendentes;
    $('pend-titulo').textContent = `Pendentes (${numero(pendentes.length)})`;
    const lista = $('lista');
    if (!pendentes.length) { lista.innerHTML = '<div class="xm-vazio">Nada pendente. Tudo na rua, na cidade certa.</div>'; return; }
    lista.innerHTML = `<div class="xm-tabela-caixa"><table class="xm-tabela"><thead><tr><th>Waybill</th><th>Cidade</th><th>Entregador</th><th>Last Scan Status</th><th>Situação</th></tr></thead><tbody>
      ${pendentes.slice(0, MAX_LISTA).map((p) => `<tr><td class="xm-cod">${esc(p.waybill)}</td><td>${esc(p.cidade || '—')}</td><td>${esc(p.entregador || '—')}</td><td>${esc(p.status_pacote || '—')}</td><td>${etiqueta(p.status)}</td></tr>`).join('')}
      </tbody></table></div>${pendentes.length > MAX_LISTA ? `<div class="xm-mais">Mostrando ${numero(MAX_LISTA)} de ${numero(pendentes.length)}. "Copiar waybills" leva todos.</div>` : ''}`;
  }

  async function copiar() {
    const codigos = estado.pendentes.map((p) => p.waybill);
    if (!codigos.length) return status('Nada para copiar.');
    try {
      await navigator.clipboard.writeText(codigos.join('\n'));
      $('copiar').textContent = `Copiado (${numero(codigos.length)})`;
      setTimeout(() => { if (pagina) $('copiar').textContent = 'Copiar waybills'; }, 2500);
    } catch { status('Não deu para copiar.', true); }
  }

  colocarEstilo();
  self.XMTTDs.registrar({
    dono: 'conferencias', ordem: 1, titulo: 'Conferências', itens: PAGINAS,
    montarPagina: () => (pagina = montarPagina()),
    aoMostrar: () => atualizarConta(),
  });
})();
