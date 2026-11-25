// Tela da XM - Agrupamento Loggi no Arco, no tema da Loggi.
//
// Ao clicar em "Agrupar" (em qualquer tela do Arco; todas levam a mesma tela de agrupar) abre a
// janela de escolha: UM circulo da Loggi ou as cidades marcadas (comeca vazio; "Limpar" desfaz).
// O botao XM no canto reabre a janela; ao lado dele, o que esta valendo e a contagem.
// Cada bipe de fora: tarja vermelha + som. No "Continuar" com pacote de fora ainda na lista, o
// clique nao chega a Loggi e um cartao diz quais tirar.
// A configuracao fica no chrome.storage.local, uma por base (ex.: "base:CCR").

(() => {
  const NOME = 'XM - Agrupamento Loggi';
  const MARGEM = 8;
  const VALIDADE_MS = 6 * 60 * 60 * 1000; // lista da Loggi guardada vale 6 h; depois busca de novo
  const TARJA_MS = 2500;
  const PEDIDO_MS = 20000; // "Agrupar" que recarregou a pagina: a janela abre se a tela nova vier em ate 20 s

  function limitar(valor, maximo) {
    return Math.min(Math.max(MARGEM, valor), Math.max(MARGEM, maximo));
  }

  if (typeof module !== 'undefined') {
    module.exports = { limitar, VALIDADE_MS, PEDIDO_MS };
    return;
  }

  const R = self.XMAgrupamento;
  const CANAL = 'xmAgrup';
  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .raiz { --azul: #12a5e8; --texto: #2e2e2e; --forte: #1f1f1f; --suave: #6b6b6b;
        --linha: #e6e6e6; --campo: #cfd6dd; --claro: #f7f9fa; --verde: #13a14b; --vermelho: #e5484d;
        font: 14px/1.45 'Open Sans', system-ui, sans-serif; color: var(--texto); }
      button { font: inherit; cursor: pointer; }
      .link { padding: 0; color: var(--azul); background: none; border: 0; font-weight: 600; white-space: nowrap; }
      .link:hover { text-decoration: underline; }
      .pilula { padding: 7px 20px; color: var(--azul); background: #fff; border: 1px solid var(--azul); border-radius: 999px; font-weight: 600; }
      .pilula:hover { background: rgba(18, 165, 232, .06); }
      .pilula.ativa { color: #fff; background: var(--azul); }
      .cheia { padding: 9px 28px; color: #fff; background: var(--azul); border: 1px solid var(--azul); border-radius: 999px; font-weight: 700; }
      .cheia:hover { background: #0e93d0; }

      /* canto: botao XM + o que esta valendo */
      .canto { position: fixed; z-index: 2147483646; display: flex; align-items: center; gap: 10px; }
      .botao { width: 56px; height: 56px; padding: 0; display: flex; align-items: center; justify-content: center; flex: none;
        background: #fff; border: 1px solid #c9ced6; border-radius: 28px; box-shadow: 0 4px 14px rgba(0, 40, 90, .25); cursor: grab; touch-action: none; }
      .botao:hover { border-color: var(--azul); }
      .botao img { width: 36px; pointer-events: none; }
      .resumo { display: flex; align-items: center; gap: 12px; max-width: 360px; padding: 8px 16px; background: #fff; border: 1px solid var(--azul);
        border-radius: 999px; box-shadow: 0 4px 14px rgba(0, 40, 90, .18); color: var(--texto); }
      .resumo .qual { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
      .resumo .nada { color: #b45309; }
      .resumo .ok, .resumo .fora { white-space: nowrap; }
      .resumo .ok b { color: var(--verde); }
      .resumo .fora b { color: var(--vermelho); }

      /* janela de escolha */
      .fundo-janela { display: none; position: fixed; inset: 0; z-index: 2147483646; background: rgba(15, 30, 50, .45);
        align-items: center; justify-content: center; }
      .fundo-janela.ver { display: flex; }
      .fundo-janela.ver ~ .canto { display: none; } /* janela aberta: o resumo do canto nao fica por cima */
      .janela { width: min(620px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column;
        background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 18px 50px rgba(0, 40, 90, .35); }
      .topo { display: flex; justify-content: space-between; align-items: center; padding: 16px 22px; color: #fff;
        background: linear-gradient(90deg, #00baff, #006aff); }
      .topo .marca { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; }
      .topo img { width: 30px; }
      .topo .fechar { padding: 0; color: #fff; background: none; border: 0; font-size: 28px; line-height: 1; }
      .miolo { flex: 1; overflow: auto; padding: 18px 22px 8px; display: flex; flex-direction: column; gap: 14px; }
      .alvo { padding: 12px 16px; border: 1px solid var(--linha); border-radius: 4px; }
      .alvo .rotulo { display: block; font-size: 12px; font-weight: 600; color: var(--verde); }
      .alvo strong { display: block; font-size: 16px; font-weight: 600; color: var(--forte); }
      .alvo small { display: block; color: var(--suave); margin-top: 2px; }
      .alvo.vazio .rotulo { color: #b45309; }
      .linha-modo { display: flex; align-items: center; gap: 10px; }
      .linha-modo .link { margin-left: auto; }
      .busca { position: relative; }
      .busca svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; fill: none; stroke: var(--suave); stroke-width: 1.8; }
      input[type="text"] { width: 100%; padding: 10px 12px; color: var(--texto); background: #fff; border: 1px solid var(--campo); border-radius: 4px; font: inherit; outline: none; }
      .busca input { padding-left: 36px; }
      input[type="text"]:focus { border-color: var(--azul); }
      .cab-lista { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      .cab-lista h3 { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--suave); }
      .lista { max-height: 36vh; overflow: auto; border: 1px solid var(--linha); border-radius: 4px; }
      .item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: center; column-gap: 12px; padding: 10px 14px;
        border-bottom: 1px solid var(--linha); cursor: pointer; }
      .item:last-child { border-bottom: 0; }
      .item:hover { background: var(--claro); }
      .item input { margin: 0; width: 16px; height: 16px; accent-color: var(--azul); cursor: pointer; }
      .item .nome { min-width: 0; color: var(--forte); }
      .item .nome small { display: block; color: var(--suave); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .item .conta { color: var(--suave); font-size: 12px; white-space: nowrap; }
      .vazia { padding: 12px 14px; color: var(--suave); }
      .adicionar { display: flex; gap: 10px; }
      .adicionar .pilula { flex: none; }
      .sugestoes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .sugestoes:empty { display: none; }
      .sugestoes button { padding: 4px 12px; color: var(--azul); background: #fff; border: 1px dashed var(--azul); border-radius: 999px; font-size: 13px; }
      .rodape { display: flex; align-items: center; gap: 16px; padding: 14px 22px 18px; border-top: 1px solid var(--linha); }
      .aviso { flex: 1; color: var(--suave); font-size: 13px; }
      .aviso.erro { color: var(--vermelho); }

      /* alerta e trava (vermelho, igual em qualquer tema) */
      .tarja { display: flex; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; padding: 18px 24px;
        background: #dc2626; color: #fff; font: 600 18px system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.4);
        align-items: center; justify-content: space-between; gap: 16px; opacity: 0; visibility: hidden; pointer-events: none;
        transition: opacity .5s ease, visibility 0s linear .5s; }
      .tarja.ver { opacity: 1; visibility: visible; pointer-events: auto; transition: none; }
      .tarja strong { display: block; font-size: 26px; letter-spacing: .5px; }
      .tarja button { padding: 0; color: #fff; background: none; border: 0; text-decoration: underline; }
      .fundo { display: none; position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.55);
        align-items: center; justify-content: center; font: 15px system-ui, sans-serif; }
      .fundo.ver { display: flex; }
      .card { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; background: #dc2626; color: #fff;
        border-radius: 10px; padding: 26px 30px; box-shadow: 0 16px 40px rgba(0,0,0,.5); }
      .card h2 { margin: 0 0 8px; font-size: 26px; }
      .card p { margin: 0 0 16px; font-size: 17px; line-height: 1.45; }
      .card ul { margin: 0 0 18px; padding: 0; list-style: none; background: rgba(0,0,0,.15); border-radius: 6px; }
      .card li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.2); font-weight: 700; }
      .card li:last-child { border-bottom: 0; }
      .card li span:first-child { font-family: ui-monospace, Consolas, monospace; }
      .card button { padding: 0; background: none; border: 0; color: #fff; text-decoration: underline; font: 700 16px system-ui, sans-serif; }
    </style>
    <div class="raiz">
      <div class="fundo" role="alertdialog" aria-modal="true">
        <div class="card">
          <h2>Pacotes de fora neste grupo</h2>
          <p class="explica"></p>
          <ul></ul>
          <button type="button">Entendi, vou tirar</button>
        </div>
      </div>
      <div class="tarja" role="alert">
        <div><strong>GRUPO ERRADO</strong><span class="texto"></span></div>
        <button type="button">Fechar</button>
      </div>

      <div class="fundo-janela" role="dialog" aria-modal="true" aria-label="Escolha do agrupamento">
        <div class="janela">
          <div class="topo">
            <span class="marca"><img alt="XM" src="${chrome.runtime.getURL('img/logo-claro.png')}">O que você vai agrupar?</span>
            <button type="button" class="fechar" title="Fechar (Esc)" aria-label="Fechar">×</button>
          </div>
          <div class="miolo">
            <div class="alvo"></div>
            <div class="linha-modo">
              <button type="button" class="pilula" data-modo="circulos">Círculo</button>
              <button type="button" class="pilula" data-modo="cidades">Cidades</button>
              <button type="button" class="link atualizar">Atualizar da Loggi</button>
            </div>
            <div class="busca">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
              <input type="text" class="filtro" autocomplete="off">
            </div>
            <div>
              <div class="cab-lista"><h3 class="titulo-lista"></h3><button type="button" class="link limpar">Limpar</button></div>
              <div class="lista"></div>
            </div>
            <div class="bloco-adicionar">
              <div class="cab-lista"><h3 class="titulo-adicionar">Adicionar cidade</h3></div>
              <form class="adicionar">
                <input type="text" class="nova" placeholder="Cidade que não está na lista (ex.: micro cidade)" autocomplete="off">
                <button type="submit" class="pilula">Adicionar</button>
              </form>
              <div class="sugestoes"></div>
            </div>
          </div>
          <div class="rodape">
            <span class="aviso"></span>
            <button type="button" class="cheia pronto">Pronto</button>
          </div>
        </div>
      </div>

      <div class="canto">
        <button type="button" class="resumo" hidden></button>
        <button class="botao" type="button" title="${NOME}: escolher círculo ou cidades"><img alt="XM" src="${chrome.runtime.getURL('img/logo.png')}"></button>
      </div>
    </div>`;

  const $ = (s) => sombra.querySelector(s);
  const canto = $('.canto');
  const botao = $('.botao');
  const resumo = $('.resumo');
  const janela = $('.fundo-janela');
  const tarja = $('.tarja');
  const fundo = $('.fundo');
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const el = (tag, classe, texto) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; };

  // ── estado ────────────────────────────────────────────────────────────────
  let codigoBase = (location.pathname.split('/').filter(Boolean)[0] || '').toUpperCase();
  let cfg = R.cfgVazia();
  let cidadesLoggi = [];
  let circulos = [];
  let alvo = R.montarAlvo(cfg, [], []);
  let modo = 'circulos';
  const bipes = new Map(); // codigo -> cidade, desde que a pagina abriu
  let certos = 0;
  let deFora = 0;
  let posicao = { direita: 20, baixo: 90 }; // acima do botao de outras extensoes XM, que fica no canto

  const chaveDaBase = () => `base:${codigoBase || 'sem-base'}`;
  async function guardar() {
    await chrome.storage.local.set({ [chaveDaBase()]: { ...cfg, cache: { cidades: cidadesLoggi, circulos, em: Date.now() } } });
  }

  function aviso(texto, erro = false) {
    $('.aviso').textContent = texto || '';
    $('.aviso').classList.toggle('erro', !!erro);
  }

  function mudar(novo) {
    cfg = novo;
    guardar();
    desenhar();
  }

  // ── desenhar ──────────────────────────────────────────────────────────────
  function desenharAlvo() {
    const caixa = $('.alvo');
    caixa.classList.toggle('vazio', alvo.tipo === 'nada');
    caixa.replaceChildren();
    if (alvo.tipo === 'nada') {
      caixa.append(el('span', 'rotulo', 'Nada escolhido'), el('strong', '', 'Os bipes não estão sendo conferidos'),
        el('small', '', 'Escolha um círculo ou marque as cidades deste agrupamento.'));
      return;
    }
    caixa.append(el('span', 'rotulo', 'Conferindo'), el('strong', '', alvo.rotulo),
      el('small', '', `${numero(alvo.cidades.length)} cidade(s): ${alvo.cidades.slice(0, 8).map((c) => c.nome).join(', ')}${alvo.cidades.length > 8 ? '...' : ''}`));
  }

  function itemLista({ marcado, nome, detalhe, conta, aoClicar, tirar }) {
    const linha = el('label', 'item');
    const caixa = el('input');
    caixa.type = 'checkbox';
    caixa.checked = marcado;
    caixa.addEventListener('change', aoClicar);
    const n = el('span', 'nome', nome);
    if (detalhe) n.append(el('small', '', detalhe));
    linha.append(caixa, n);
    if (tirar) {
      const b = el('button', 'link', 'Tirar');
      b.type = 'button';
      b.addEventListener('click', (e) => { e.preventDefault(); tirar(); });
      linha.append(b);
    } else linha.append(el('span', 'conta', conta || ''));
    return linha;
  }

  function desenharLista() {
    const busca = $('.filtro').value;
    const lista = $('.lista');
    sombra.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('ativa', b.dataset.modo === modo));
    $('.filtro').placeholder = modo === 'circulos' ? 'Pesquisar círculo' : 'Pesquisar cidade';
    let itens;
    if (modo === 'circulos') {
      $('.titulo-lista').textContent = 'Escolha um círculo';
      itens = R.filtrar(circulos, busca).map((c) => {
        const cidades = R.listaDoCirculo(c, cidadesLoggi, cfg);
        return itemLista({
          marcado: alvo.tipo === 'circulo' && alvo.id === c.id,
          nome: c.nome,
          detalhe: cidades.map((x) => x.nome).join(', '),
          conta: `${numero(cidades.length)} cidade(s)`,
          aoClicar: () => mudar(R.escolherCirculo(cfg, c.id)),
        });
      });
      if (!circulos.length) itens = [el('div', 'vazia', 'A Loggi não trouxe círculos desta base. Use "Cidades" ou clique em "Atualizar da Loggi".')];
    } else {
      $('.titulo-lista').textContent = 'Marque as cidades';
      const marcadas = new Set(alvo.tipo === 'cidades' ? alvo.chaves : []);
      itens = R.filtrar(R.listaDaBase(cidadesLoggi, cfg), busca).map((c) => itemLista({
        marcado: marcadas.has(c.chave),
        nome: c.nome,
        detalhe: c.origem === 'adicionada' ? 'adicionada por você' : '',
        conta: c.pacotes ? `${numero(c.pacotes)} pacotes` : '',
        aoClicar: () => mudar(R.alternarCidade(cfg, c.chave)),
        tirar: c.origem === 'adicionada' ? () => mudar(R.tirarAdicionada(cfg, c.chave, cidadesLoggi, circulos)) : null,
      }));
      if (!cidadesLoggi.length && !itens.length) itens = [el('div', 'vazia', 'Nenhuma cidade ainda. Clique em "Atualizar da Loggi".')];
    }
    if (!itens.length) itens = [el('div', 'vazia', 'Nada com esse nome.')];
    lista.replaceChildren(...itens);

    // Adicionar: no circulo escolhido, ou na lista de cidades (ja marcada).
    const noCirculo = alvo.tipo === 'circulo';
    $('.bloco-adicionar').hidden = modo === 'circulos' && !noCirculo;
    $('.titulo-adicionar').textContent = noCirculo ? `Adicionar cidade no círculo ${alvo.nome}` : 'Adicionar cidade';
    $('.sugestoes').replaceChildren(...R.sugestoes(bipes, alvo).map((cidade) => {
      const b = el('button', '', `+ ${cidade}`);
      b.type = 'button';
      b.title = 'Bipada aqui e de fora. Clique para adicionar.';
      b.addEventListener('click', () => adicionar(cidade));
      return b;
    }));
  }

  function desenharResumo() {
    resumo.hidden = false;
    resumo.replaceChildren();
    if (alvo.tipo === 'nada') {
      resumo.append(el('span', 'qual nada', 'Escolher círculo ou cidades'));
    } else {
      resumo.append(el('span', 'qual', alvo.rotulo));
      const ok = el('span', 'ok');
      ok.append(el('b', '', numero(certos)), ' certos');
      const fora = el('span', 'fora');
      fora.append(el('b', '', numero(deFora)), ' de fora');
      resumo.append(ok, fora);
    }
    aplicarPosicao();
  }

  function desenhar() {
    alvo = R.montarAlvo(cfg, cidadesLoggi, circulos);
    desenharAlvo();
    desenharLista();
    desenharResumo();
  }

  function adicionar(nome) {
    const r = R.adicionarCidade(cfg, nome, cidadesLoggi, circulos);
    if (r.erro) return aviso(r.erro, true);
    $('.nova').value = '';
    aviso(`${String(nome).trim()} adicionada.`);
    if (r.cfg.escolha && r.cfg.escolha.tipo === 'cidades') modo = 'cidades';
    mudar(r.cfg);
  }

  // ── janela ────────────────────────────────────────────────────────────────
  function abrirJanela() {
    if (!chrome.runtime || !chrome.runtime.id) {
      window.alert(`A extensão ${NOME} foi atualizada. Aperte F5 nesta página.`);
      return;
    }
    chrome.storage.local.remove('pedirEscolha');
    modo = alvo.tipo === 'cidades' || !circulos.length ? 'cidades' : 'circulos';
    $('.filtro').value = '';
    desenhar();
    janela.classList.add('ver');
    setTimeout(() => $('.filtro').focus(), 50);
  }
  const fecharJanela = () => janela.classList.remove('ver');

  // "Agrupar" em qualquer tela do Arco: a janela abre (o clique segue para a Loggi normalmente).
  // Ja bipando nesta tela, nao abre de novo.
  window.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, a, [role="button"]');
    if (!b || e.composedPath().includes(hospedeiro) || !R.ehAgrupar(b.textContent) || bipes.size) return;
    chrome.storage.local.set({ pedirEscolha: Date.now() }); // se a pagina recarregar, abre na nova
    setTimeout(abrirJanela, 400);
  }, true);

  // ── buscar na Loggi (pelo loggi.js, com a sessao da propria pagina) ─────────
  function pedirALoggi(tipo) {
    return new Promise((ok, nao) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        window.removeEventListener('message', ouvir);
        clearTimeout(limite);
        if (e.data.erro) nao(new Error(e.data.erro)); else ok(e.data);
      };
      const limite = setTimeout(() => { window.removeEventListener('message', ouvir); nao(new Error('A Loggi demorou para responder. Tente de novo.')); }, 30000);
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: 'pedir', id, tipo }, location.origin);
    });
  }

  let buscando = false;
  async function atualizarDaLoggi() {
    if (buscando) return;
    buscando = true;
    aviso('Buscando os círculos e as cidades na Loggi...');
    try {
      const c = await pedirALoggi('cidades');
      if (c.base && c.base.codigo && c.base.codigo !== codigoBase) { codigoBase = c.base.codigo; await carregarCfg(false); }
      cidadesLoggi = c.cidades;
      let erro = '';
      try { circulos = (await pedirALoggi('circulos')).circulos; } catch (e) { erro = `As cidades vieram, mas os círculos não: ${e.message}`; }
      await guardar();
      aviso(erro || `Base ${codigoBase}: ${numero(circulos.length)} círculo(s) e ${numero(cidadesLoggi.length)} cidades da Loggi.`, !!erro);
    } catch (e) {
      aviso(cidadesLoggi.length ? `Usando a lista guardada. ${e.message}` : e.message, true);
    } finally {
      buscando = false;
      desenhar();
    }
  }

  async function carregarCfg(buscarSeVelho = true) {
    const salvo = (await chrome.storage.local.get(chaveDaBase()))[chaveDaBase()];
    cfg = R.normalizarCfg(salvo);
    const cache = salvo && salvo.cache;
    cidadesLoggi = (cache && cache.cidades) || [];
    circulos = (cache && cache.circulos) || [];
    desenhar();
    if (buscarSeVelho && (!cache || Date.now() - cache.em > VALIDADE_MS || !cidadesLoggi.length)) atualizarDaLoggi();
  }

  // ── alerta ────────────────────────────────────────────────────────────────
  let audio = null;
  function tocarErro() {
    try {
      audio = audio || new AudioContext();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      for (let i = 0; i < 3; i += 1) {
        const osc = audio.createOscillator();
        const vol = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = 330;
        vol.gain.setValueAtTime(0.25, t0 + i * 0.22);
        vol.gain.setValueAtTime(0, t0 + i * 0.22 + 0.16);
        osc.connect(vol).connect(audio.destination);
        osc.start(t0 + i * 0.22);
        osc.stop(t0 + i * 0.22 + 0.17);
      }
    } catch { /* sem audio, a tarja ainda aparece */ }
  }

  let sumirTarja = null;
  function mostrarTarja(codigo, cidade) {
    tarja.querySelector('.texto').textContent = `${codigo} é de ${cidade}: ${alvo.fora}`;
    tarja.classList.add('ver');
    clearTimeout(sumirTarja);
    sumirTarja = setTimeout(() => tarja.classList.remove('ver'), TARJA_MS);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== 'bipe' || !Array.isArray(e.data.itens)) return;
    let errado = null;
    let algumCerto = false;
    for (const i of e.data.itens) {
      const codigo = String(i.codigo);
      const cidade = R.consertarTexto(String(i.cidade)); // "CaÃ§ador" aparece como "Caçador"
      const novo = !bipes.has(codigo);
      bipes.set(codigo, cidade);
      const { ok } = R.conferirBipe(cidade, alvo);
      if (ok === false) { errado = errado || { codigo, cidade }; if (novo) deFora += 1; }
      if (ok === true) { algumCerto = true; if (novo) certos += 1; }
    }
    if (errado) { mostrarTarja(errado.codigo, errado.cidade); tocarErro(); } else if (algumCerto) tarja.classList.remove('ver');
    desenhar();
  });

  // ── trava do "Continuar" ──────────────────────────────────────────────────
  function mostrarPendentes(errados) {
    const onde = alvo.fora.replace(/^não é de/, 'fora de');
    fundo.querySelector('.explica').textContent = errados.length === 1
      ? `Este pacote está ${onde}. Tire ele do grupo para continuar.`
      : `Estes ${errados.length} pacotes estão ${onde}. Tire eles do grupo para continuar.`;
    fundo.querySelector('ul').replaceChildren(...errados.map((x) => {
      const li = el('li');
      li.append(el('span', '', x.codigo), el('span', '', x.cidade));
      return li;
    }));
    fundo.classList.add('ver');
    tocarErro();
  }

  // Fase de captura no window: o clique para aqui antes do React do Arco.
  window.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b.textContent.replace(/\s+/g, ' ').trim().toLowerCase() !== 'continuar') return;
    const errados = R.pendentes(bipes, document.body.innerText, alvo);
    if (!errados.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    mostrarPendentes(errados);
  }, true);
  fundo.querySelector('button').addEventListener('click', () => fundo.classList.remove('ver'));
  tarja.querySelector('button').addEventListener('click', () => tarja.classList.remove('ver'));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (fundo.classList.contains('ver')) fundo.classList.remove('ver'); else if (janela.classList.contains('ver')) fecharJanela();
  }, true);

  // ── canto: posicao e arrastar ─────────────────────────────────────────────
  function aplicarPosicao() {
    const r = canto.getBoundingClientRect();
    posicao.direita = limitar(posicao.direita, window.innerWidth - r.width - MARGEM);
    posicao.baixo = limitar(posicao.baixo, window.innerHeight - r.height - MARGEM);
    canto.style.right = `${posicao.direita}px`;
    canto.style.bottom = `${posicao.baixo}px`;
  }

  function arrastar(elemento, aoClicar) {
    let inicio = null;
    let moveu = false;
    elemento.addEventListener('pointerdown', (e) => {
      inicio = { x: e.clientX, y: e.clientY, direita: posicao.direita, baixo: posicao.baixo };
      moveu = false;
      elemento.setPointerCapture(e.pointerId);
    });
    elemento.addEventListener('pointermove', (e) => {
      if (!inicio) return;
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      if (!moveu && Math.hypot(dx, dy) < 4) return;
      moveu = true;
      posicao.direita = inicio.direita - dx;
      posicao.baixo = inicio.baixo - dy;
      aplicarPosicao();
    });
    elemento.addEventListener('pointerup', () => {
      if (!inicio) return;
      inicio = null;
      if (moveu) chrome.storage.local.set({ posicao }); else if (aoClicar) aoClicar();
    });
  }

  arrastar(botao, abrirJanela);
  resumo.addEventListener('click', abrirJanela);
  $('.fechar').addEventListener('click', fecharJanela);
  $('.pronto').addEventListener('click', fecharJanela);
  janela.addEventListener('click', (e) => { if (e.target === janela) fecharJanela(); });
  sombra.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; $('.filtro').value = ''; desenharLista(); }));
  $('.atualizar').addEventListener('click', atualizarDaLoggi);
  $('.limpar').addEventListener('click', () => { mudar(R.limpar(cfg)); aviso('Escolha limpa: nada está sendo conferido.'); });
  $('.filtro').addEventListener('input', desenharLista);
  $('.adicionar').addEventListener('submit', (e) => { e.preventDefault(); adicionar($('.nova').value); });
  // O leitor de codigo digita como teclado: o que se digita na janela nao vai para o Arco.
  ['keydown', 'keypress', 'keyup'].forEach((t) => hospedeiro.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); }));
  window.addEventListener('resize', aplicarPosicao);

  document.documentElement.append(hospedeiro);
  chrome.storage.local.get(['posicao', 'pedirEscolha']).then((s) => {
    if (s.posicao) posicao = s.posicao;
    aplicarPosicao();
    if (s.pedirEscolha && Date.now() - s.pedirEscolha < PEDIDO_MS) setTimeout(abrirJanela, 300);
  });
  carregarCfg();
})();
