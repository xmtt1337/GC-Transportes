// Painel, tarja e trava do "Continuar" no Arco da Loggi (XM - Agrupamento Loggi).
//
// O painel escolhe contra o que conferir (base toda ou um circulo da Loggi) e mostra as cidades,
// com liga/desliga e "Adicionar cidade". Cada bipe de fora: tarja vermelha + som. No "Continuar"
// com pacote de fora ainda na lista, o clique nao chega a Loggi e um cartao diz quais tirar.
// A configuracao fica no chrome.storage.local, uma por base (ex.: "base:CCR").

(() => {
  const NOME = 'XM - Agrupamento Loggi';
  const MARGEM = 8;
  const VALIDADE_MS = 6 * 60 * 60 * 1000; // lista da Loggi guardada vale 6 h; depois busca de novo
  const TARJA_MS = 2500;

  function limitar(valor, maximo) {
    return Math.min(Math.max(MARGEM, valor), Math.max(MARGEM, maximo));
  }

  if (typeof module !== 'undefined') {
    module.exports = { limitar, VALIDADE_MS };
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
      .menu { position: fixed; z-index: 2147483646; font: 13px/1.4 system-ui, sans-serif; color: #e8eaed; }
      .botao { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px;
        background: #fff; border: 1px solid #c9ced6; border-radius: 28px; box-shadow: 0 4px 14px rgba(0,0,0,.35);
        cursor: grab; touch-action: none; padding: 0; }
      .botao:hover { border-color: #30475a; }
      .botao img { width: 36px; pointer-events: none; }
      .aberto .botao { display: none; }
      .painel { display: none; width: 380px; height: min(640px, calc(100vh - 16px)); flex-direction: column;
        background: #080c13; border: 1px solid #1c2533; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
      .aberto .painel { display: flex; }
      .cabecalho { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
        font-weight: 700; color: #fff; border-bottom: 1px solid rgba(255,255,255,.06); cursor: grab; touch-action: none; user-select: none; }
      .marca { display: flex; align-items: center; gap: 8px; }
      .marca img { width: 28px; pointer-events: none; }
      button.link { padding: 0; color: #6ea8fe; background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
      button.link:hover { text-decoration: underline; }
      .cabecalho button.link { color: #fff; }
      .corpo { flex: 1; overflow: auto; padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 14px; }
      .aviso { color: #9aa4b2; font-size: 12px; min-height: 16px; }
      .aviso.erro { color: #f87171; }
      .rotulo { color: #9aa4b2; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 6px; }
      .escolhas { display: flex; flex-direction: column; gap: 4px; }
      .escolha { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px;
        border: 1px solid #1c2533; border-radius: 8px; cursor: pointer; background: #0d131d; color: #e8eaed; font: inherit; text-align: left; width: 100%; }
      .escolha:hover { border-color: #2c3a4f; }
      .escolha.atual { border-color: #3a86ff; }
      .escolha small { color: #9aa4b2; white-space: nowrap; }
      .placar { display: flex; gap: 18px; font-size: 14px; }
      .placar b { font-size: 20px; }
      .certos b { color: #22c55e; }
      .errados b { color: #ef4444; }
      .topo-secao { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
      .topo-secao .link { white-space: nowrap; }
      input[type="text"] { width: 100%; padding: 8px 10px; color: #e8eaed; background: #0d131d; border: 1px solid #1c2533;
        border-radius: 8px; font: inherit; outline: none; }
      input[type="text"]:focus { border-color: #3a86ff; }
      .cidades { list-style: none; margin: 6px 0 0; padding: 0; border: 1px solid #1c2533; border-radius: 8px; max-height: 240px; overflow: auto; }
      .cidades li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; border-bottom: 1px solid #121a26; }
      .cidades li:last-child { border-bottom: 0; }
      .cidades li.desligada .nome { color: #5d6776; text-decoration: line-through; }
      .cidades .info { display: flex; flex-direction: column; }
      .cidades small { color: #6b7685; font-size: 11px; }
      .vazio { padding: 10px; color: #6b7685; }
      .chave { position: relative; width: 34px; height: 18px; flex: none; }
      .chave input { opacity: 0; width: 0; height: 0; }
      .chave span { position: absolute; inset: 0; background: #2a3443; border-radius: 9px; cursor: pointer; transition: background .15s; }
      .chave span::after { content: ''; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; background: #fff; border-radius: 50%; transition: transform .15s; }
      .chave input:checked + span { background: #3a86ff; }
      .chave input:checked + span::after { transform: translateX(16px); }
      .adicionar { display: flex; gap: 8px; margin-top: 6px; }
      .adicionar button { flex: none; padding: 0 12px; color: #fff; background: #3a86ff; border: 0; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; }
      .sugestoes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
      .sugestoes button { padding: 4px 10px; color: #e8eaed; background: #0d131d; border: 1px solid #2c3a4f; border-radius: 14px; font: inherit; font-size: 12px; cursor: pointer; }
      .sugestoes button:hover { border-color: #3a86ff; }
      .tarja { display: flex; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; padding: 18px 24px;
        background: #dc2626; color: #fff; font: 600 18px system-ui, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.4);
        align-items: center; justify-content: space-between; gap: 16px; opacity: 0; visibility: hidden; pointer-events: none;
        transition: opacity .5s ease, visibility 0s linear .5s; }
      .tarja.ver { opacity: 1; visibility: visible; pointer-events: auto; transition: none; }
      .tarja strong { display: block; font-size: 26px; letter-spacing: .5px; }
      .tarja button { padding: 0; color: #fff; background: none; border: 0; font: inherit; text-decoration: underline; cursor: pointer; }
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
      .card button { padding: 0; background: none; border: 0; color: #fff; text-decoration: underline; font: 700 16px system-ui, sans-serif; cursor: pointer; }
    </style>
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
    <div class="menu">
      <button class="botao" type="button" title="${NOME}"><img alt="XM" src="${chrome.runtime.getURL('img/logo.png')}"></button>
      <div class="painel">
        <div class="cabecalho">
          <span class="marca"><img alt="XM" src="${chrome.runtime.getURL('img/logo-claro.png')}">Agrupamento</span>
          <button type="button" class="link minimizar">Minimizar</button>
        </div>
        <div class="corpo">
          <div class="aviso"></div>
          <div>
            <div class="rotulo">Conferir contra</div>
            <div class="escolhas"></div>
          </div>
          <div class="placar">
            <span class="certos"><b>0</b> certos</span>
            <span class="errados"><b>0</b> de fora</span>
          </div>
          <div>
            <div class="topo-secao">
              <div class="rotulo titulo-cidades">Cidades</div>
              <button type="button" class="link atualizar">Atualizar da Loggi</button>
            </div>
            <input type="text" class="filtro" placeholder="Buscar cidade" autocomplete="off">
            <ul class="cidades"></ul>
          </div>
          <div>
            <div class="rotulo titulo-adicionar">Adicionar cidade</div>
            <div class="sugestoes"></div>
            <form class="adicionar">
              <input type="text" class="nova" placeholder="Nome da cidade (ex.: micro cidade)" autocomplete="off">
              <button type="submit">Adicionar</button>
            </form>
          </div>
        </div>
      </div>
    </div>`;

  const $ = (s) => sombra.querySelector(s);
  const menu = $('.menu');
  const botao = $('.botao');
  const cabecalho = $('.cabecalho');
  const tarja = $('.tarja');
  const fundo = $('.fundo');
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');

  // ── estado ────────────────────────────────────────────────────────────────
  let codigoBase = (location.pathname.split('/').filter(Boolean)[0] || '').toUpperCase();
  let cfg = R.cfgVazia();
  let cidadesLoggi = [];
  let circulos = [];
  let alvo = null;
  const bipes = new Map(); // codigo -> cidade, desde que a pagina abriu
  let certos = 0;
  let deFora = 0;
  let posicao = { direita: 20, baixo: 90 }; // acima do botão de outras extensões XM, que fica no canto

  const chaveDaBase = () => `base:${codigoBase || 'sem-base'}`;
  async function guardar() {
    await chrome.storage.local.set({ [chaveDaBase()]: { ...cfg, cache: { cidades: cidadesLoggi, circulos, em: Date.now() } } });
  }

  function aviso(texto, erro = false) {
    $('.aviso').textContent = texto || '';
    $('.aviso').classList.toggle('erro', !!erro);
  }

  // ── desenhar ──────────────────────────────────────────────────────────────
  function desenhar() {
    alvo = R.montarAlvo(cfg, cidadesLoggi, circulos);
    const ligadas = R.listaDaBase(cidadesLoggi, cfg).filter((c) => c.ligada).length;
    const opcoes = [{ id: '', nome: 'Base toda', qtd: ligadas }, ...circulos.map((c) => ({ id: c.id, nome: c.nome, qtd: R.listaDoCirculo(c, cidadesLoggi, cfg).length }))];
    $('.escolhas').replaceChildren(...opcoes.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `escolha${(o.id ? alvo.tipo === 'circulo' && alvo.id === o.id : alvo.tipo === 'base') ? ' atual' : ''}`;
      const nome = document.createElement('span');
      nome.textContent = o.id ? o.nome : 'Base toda';
      const qtd = document.createElement('small');
      qtd.textContent = `${numero(o.qtd)} cidade(s)`;
      b.append(nome, qtd);
      b.addEventListener('click', () => {
        cfg = { ...cfg, escolha: o.id ? { tipo: 'circulo', id: o.id } : { tipo: 'base' } };
        guardar();
        desenhar();
      });
      return b;
    }));

    $('.titulo-cidades').textContent = alvo.tipo === 'circulo' ? `Cidades do círculo ${alvo.nome}` : 'Cidades da base';
    $('.titulo-adicionar').textContent = alvo.tipo === 'circulo' ? `Adicionar cidade neste círculo` : 'Adicionar cidade na base';
    const lista = R.filtrar(alvo.cidades, $('.filtro').value);
    const ul = $('.cidades');
    if (!lista.length) {
      const li = document.createElement('li');
      li.className = 'vazio';
      li.textContent = alvo.cidades.length ? 'Nenhuma cidade com esse nome.' : 'Nenhuma cidade ainda. Clique em "Atualizar da Loggi".';
      ul.replaceChildren(li);
    } else {
      ul.replaceChildren(...lista.map((c) => {
        const li = document.createElement('li');
        if (!c.ligada) li.className = 'desligada';
        const info = document.createElement('span');
        info.className = 'info';
        const nome = document.createElement('span');
        nome.className = 'nome';
        nome.textContent = c.nome;
        const det = document.createElement('small');
        det.textContent = c.origem === 'adicionada' ? 'adicionada por você' : c.pacotes ? `${numero(c.pacotes)} pacotes na Loggi` : 'da Loggi';
        info.append(nome, det);
        li.append(info);
        if (c.origem === 'adicionada') {
          const tirar = document.createElement('button');
          tirar.type = 'button';
          tirar.className = 'link';
          tirar.textContent = 'Tirar';
          tirar.addEventListener('click', () => { cfg = R.tirarAdicionada(cfg, c.chave, cidadesLoggi, circulos); guardar(); desenhar(); });
          li.append(tirar);
        } else if (alvo.tipo === 'base') {
          const chaveEl = document.createElement('label');
          chaveEl.className = 'chave';
          chaveEl.title = c.ligada ? 'Atendida pela base (desligue se não atende)' : 'Desligada: bipe dela dá alerta';
          const caixa = document.createElement('input');
          caixa.type = 'checkbox';
          caixa.checked = c.ligada;
          caixa.addEventListener('change', () => { cfg = R.alternarCidade(cfg, c.chave); guardar(); desenhar(); });
          chaveEl.append(caixa, document.createElement('span'));
          li.append(chaveEl);
        }
        return li;
      }));
    }

    const sug = R.sugestoes(bipes, alvo);
    $('.sugestoes').replaceChildren(...sug.map((cidade) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = 'Bipada aqui e de fora. Clique para adicionar.';
      b.textContent = `+ ${cidade}`;
      b.addEventListener('click', () => adicionar(cidade));
      return b;
    }));
    $('.certos b').textContent = numero(certos);
    $('.errados b').textContent = numero(deFora);
  }

  function adicionar(nome) {
    const r = R.adicionarCidade(cfg, nome, cidadesLoggi, circulos);
    if (r.erro) return aviso(r.erro, true);
    cfg = r.cfg;
    $('.nova').value = '';
    aviso(`${String(nome).trim()} adicionada.`);
    guardar();
    desenhar();
  }

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
    aviso('Buscando as cidades e os círculos na Loggi...');
    try {
      const c = await pedirALoggi('cidades');
      if (c.base && c.base.codigo && c.base.codigo !== codigoBase) { codigoBase = c.base.codigo; await carregarCfg(false); }
      cidadesLoggi = c.cidades;
      try { circulos = (await pedirALoggi('circulos')).circulos; } catch (e) { aviso(`Cidades ok, mas os círculos não vieram: ${e.message}`, true); }
      await guardar();
      if (!$('.aviso').classList.contains('erro')) aviso(`Base ${codigoBase}: ${numero(cidadesLoggi.length)} cidades e ${numero(circulos.length)} círculo(s) da Loggi.`);
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
      const cidade = String(i.cidade);
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
    fundo.querySelector('.explica').textContent = errados.length === 1
      ? `Este pacote está ${alvo.fora}. Tire ele do grupo para continuar.`
      : `Estes ${errados.length} pacotes estão ${alvo.fora}. Tire eles do grupo para continuar.`;
    fundo.querySelector('ul').replaceChildren(...errados.map((x) => {
      const li = document.createElement('li');
      const cod = document.createElement('span');
      cod.textContent = x.codigo;
      const cid = document.createElement('span');
      cid.textContent = x.cidade;
      li.append(cod, cid);
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
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fundo.classList.contains('ver')) fundo.classList.remove('ver'); }, true);
  tarja.querySelector('button').addEventListener('click', () => tarja.classList.remove('ver'));

  // ── painel: abrir, minimizar, arrastar ────────────────────────────────────
  function aplicarPosicao() {
    const r = menu.getBoundingClientRect();
    posicao.direita = limitar(posicao.direita, window.innerWidth - r.width - MARGEM);
    posicao.baixo = limitar(posicao.baixo, window.innerHeight - r.height - MARGEM);
    menu.style.right = `${posicao.direita}px`;
    menu.style.bottom = `${posicao.baixo}px`;
  }

  function abrir() {
    if (!chrome.runtime || !chrome.runtime.id) {
      window.alert(`A extensão ${NOME} foi atualizada. Aperte F5 nesta página.`);
      return;
    }
    menu.classList.add('aberto');
    aplicarPosicao();
    chrome.storage.local.set({ aberto: true });
  }

  function minimizar() {
    menu.classList.remove('aberto');
    aplicarPosicao();
    chrome.storage.local.set({ aberto: false });
  }

  function arrastar(elemento, aoClicar) {
    let inicio = null;
    let moveu = false;
    elemento.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') && e.target !== botao) return;
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

  arrastar(botao, abrir);
  arrastar(cabecalho);
  $('.minimizar').addEventListener('click', minimizar);
  $('.atualizar').addEventListener('click', atualizarDaLoggi);
  $('.filtro').addEventListener('input', desenhar);
  $('.adicionar').addEventListener('submit', (e) => { e.preventDefault(); adicionar($('.nova').value); });
  // O leitor de codigo digita como teclado: o que se digita no painel nao vai para o Arco.
  ['keydown', 'keypress', 'keyup'].forEach((t) => hospedeiro.addEventListener(t, (e) => e.stopPropagation()));
  window.addEventListener('resize', aplicarPosicao);

  document.documentElement.append(hospedeiro);
  chrome.storage.local.get(['posicao', 'aberto']).then((s) => {
    if (s.posicao) posicao = s.posicao;
    if (s.aberto) menu.classList.add('aberto');
    aplicarPosicao();
  });
  carregarCfg();
})();
