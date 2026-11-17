// Menu flutuante e alerta no site da Loggi.
//
// O painel e a pagina da extensao num iframe: o site nao le senha nem token. O alerta
// (tarja vermelha e som) mora aqui, fora do iframe, para aparecer mesmo com o painel
// minimizado. A conferencia usa o "alvo" que o painel grava no storage.
//
// No arco.loggi.com, sem login na extensao, a tela fica travada (nada de clique nem tecla
// chega a Loggi). Quem diz se ha login e o fundo.js: o token nao vem para ca.
// Clique na lixeira de uma linha com pacote bipado: se o pacote some da lista, vai para o
// sistema como "removido".

(() => {
  const NOME = 'XM - Operação';
  const MARGEM = 8;

  function limitar(valor, maximo) {
    return Math.min(Math.max(MARGEM, valor), Math.max(MARGEM, maximo));
  }

  if (typeof module !== 'undefined') {
    module.exports = { limitar };
    return;
  }

  const R = self.XMBipagem;
  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      .menu { position: fixed; z-index: 2147483646; font: 13px system-ui, sans-serif; } /* alerta fica na frente */
      .botao { display: flex; align-items: center; justify-content: center; min-width: 56px; height: 56px; padding: 0 10px;
        color: #30475a; background: #fff; border: 1px solid #c9ced6; border-radius: 28px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, .35); font: 700 14px system-ui, sans-serif; cursor: grab; touch-action: none; }
      .botao:hover { border-color: #30475a; }
      .botao img { width: 36px; pointer-events: none; }
      .marca { display: flex; align-items: center; gap: 10px; }
      .marca img { width: 30px; pointer-events: none; }
      .painel { display: none; width: 420px; height: min(680px, calc(100vh - 16px)); flex-direction: column;
        background: #080c13; border: 1px solid #1c2533; border-radius: 12px; overflow: hidden;
        box-shadow: 0 10px 30px rgba(0, 0, 0, .35); }
      .aberto .painel { display: flex; }
      .aberto .botao { display: none; }
      .cabecalho { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
        color: #fff; font-weight: 700; background: #080c13; border-bottom: 1px solid rgba(255, 255, 255, .06);
        cursor: grab; touch-action: none; user-select: none; }
      /* Tela de transportadora aberta: a moldura pega o tema dela (Loggi = Arco). */
      .painel.tema-loggi { background: #fff; border-color: #dde3ea; box-shadow: 0 10px 30px rgba(0, 40, 90, .22); }
      .painel.tema-loggi .cabecalho { background: linear-gradient(90deg, #00baff, #006aff); border-bottom: 0; }
      .cabecalho button { color: #fff !important; }
      .cabecalho button, .tarja button { padding: 0; color: #6ea8fe; background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
      .cabecalho button:hover, .tarja button:hover { text-decoration: underline; }
      iframe { flex: 1; width: 100%; border: 0; }
      /* Aparece na hora, fica 2,5 s (TARJA_MS) e some devagar em 0,5 s. */
      .tarja { display: flex; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
        padding: 18px 24px; background: #dc2626; color: #fff; font: 600 18px system-ui, sans-serif;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .4); align-items: center; justify-content: space-between; gap: 16px;
        opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .5s ease, visibility 0s linear .5s; }
      .tarja.ver { opacity: 1; visibility: visible; pointer-events: auto; transition: none; }
      .tarja strong { display: block; font-size: 26px; letter-spacing: .5px; }
      .tarja button { color: #fff; text-decoration: underline; }
      .fundo { display: none; position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, .55);
        align-items: center; justify-content: center; font: 15px system-ui, sans-serif; }
      .fundo.ver { display: flex; }
      .card { width: min(720px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; background: #dc2626;
        color: #fff; border-radius: 10px; padding: 26px 30px; box-shadow: 0 16px 40px rgba(0, 0, 0, .5); }
      .card h2 { margin: 0 0 8px; font-size: 26px; }
      .card p { margin: 0 0 16px; font-size: 17px; line-height: 1.45; }
      .card ul { margin: 0 0 18px; padding: 0; list-style: none; background: rgba(0, 0, 0, .15); border-radius: 6px; }
      .card li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; border-bottom: 1px solid rgba(255, 255, 255, .2); }
      .card li:last-child { border-bottom: 0; }
      .card li span:first-child { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
      .card li span:last-child { font-weight: 700; }
      /* Sem login: fundo escuro e o painel no meio da tela, so com o login. */
      .trava { display: none; position: fixed; inset: 0; z-index: 2147483645; background: rgba(15, 17, 21, .9); }
      .trava.ver { display: block; }
      .trava p { position: absolute; left: 50%; top: calc(50% - 250px); transform: translateX(-50%); margin: 0;
        width: min(420px, calc(100vw - 32px)); text-align: center; color: #e8eaed; font: 15px/1.45 system-ui, sans-serif; }
      .menu.travado { left: 50% !important; top: 50% !important; right: auto !important; bottom: auto !important;
        transform: translate(-50%, -50%); }
      .menu.travado .painel { height: min(430px, calc(100vh - 16px)); }
      .menu.travado .cabecalho { cursor: default; }
      .menu.travado .cabecalho button { display: none; }
      .card button { padding: 0; background: none; border: 0; color: #fff; text-decoration: underline; font: 700 16px system-ui, sans-serif; cursor: pointer; }
    </style>
    <div class="fundo" role="alertdialog" aria-modal="true">
      <div class="card">
        <h2>Pacotes bipados errado</h2>
        <p class="explica"></p>
        <ul></ul>
        <button type="button">Entendi, vou verificar</button>
      </div>
    </div>
    <div class="trava" role="alertdialog" aria-modal="true">
      <p class="motivo">Para usar a Loggi, entre com o seu login do sistema XMTT.</p>
    </div>
    <div class="tarja" role="alert">
      <div><strong>GRUPO ERRADO</strong><span class="texto"></span></div>
      <button type="button">Fechar</button>
    </div>
    <div class="menu">
      <button class="botao" type="button" title="${NOME}">
        <img alt="XM" src="${chrome.runtime.getURL('img/logo.png')}">
      </button>
      <div class="painel">
        <div class="cabecalho">
          <span class="marca"><img alt="XM" src="${chrome.runtime.getURL('img/logo-claro.png')}">- Operação</span>
          <button type="button">Minimizar</button>
        </div>
      </div>
    </div>`;

  const menu = sombra.querySelector('.menu');
  const botao = sombra.querySelector('.botao');
  const painel = sombra.querySelector('.painel');
  const cabecalho = sombra.querySelector('.cabecalho');
  const tarja = sombra.querySelector('.tarja');
  let quadro = null;
  let posicao = { direita: 20, baixo: 20 };
  let alvo = null;

  function aplicarPosicao() {
    const r = menu.getBoundingClientRect();
    posicao.direita = limitar(posicao.direita, window.innerWidth - r.width - MARGEM);
    posicao.baixo = limitar(posicao.baixo, window.innerHeight - r.height - MARGEM);
    menu.style.right = `${posicao.direita}px`;
    menu.style.bottom = `${posicao.baixo}px`;
  }

  // Abrir e minimizar mudam o tamanho: fica parado o canto que esta mais perto da borda da
  // tela (painel arrastado para a esquerda minimiza para a esquerda, e assim por diante).
  function trocarTamanho(mudar) {
    const antes = menu.getBoundingClientRect();
    mudar();
    const depois = menu.getBoundingClientRect();
    if (antes.width && !menu.classList.contains('travado')) {
      if (antes.left + antes.width / 2 < window.innerWidth / 2) posicao.direita = window.innerWidth - antes.left - depois.width;
      if (antes.top + antes.height / 2 < window.innerHeight / 2) posicao.baixo = window.innerHeight - antes.top - depois.height;
    }
    aplicarPosicao();
    chrome.storage.local.set({ posicao });
  }

  function abrir() {
    if (menu.classList.contains('aberto')) return;
    if (!quadro) {
      quadro = document.createElement('iframe');
      quadro.title = NOME;
      quadro.src = chrome.runtime.getURL('pagina.html');
      painel.append(quadro);
    }
    trocarTamanho(() => menu.classList.add('aberto'));
  }

  function minimizar() {
    trocarTamanho(() => menu.classList.remove('aberto'));
  }

  function arrastar(elemento, aoClicar) {
    let inicio = null;
    let moveu = false;
    elemento.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') && e.target !== botao) return;
      if (menu.classList.contains('travado')) return; // no meio da tela, parado
      inicio = { x: e.clientX, y: e.clientY, direita: posicao.direita, baixo: posicao.baixo };
      moveu = false;
      elemento.setPointerCapture(e.pointerId);
      if (quadro) quadro.style.pointerEvents = 'none'; // senao o iframe engole o movimento
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
      if (quadro) quadro.style.pointerEvents = '';
      if (moveu) chrome.storage.local.set({ posicao });
      else if (aoClicar) aoClicar();
    });
  }

  // ── alerta ───────────────────────────────────────────────────────────────
  let audio = null;
  function tocarErro() {
    try {
      audio = audio || new AudioContext();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      for (let i = 0; i < 3; i++) {
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

  const TARJA_MS = 2500;
  let somirTarja = null;
  function mostrarTarja(codigo, cidade) {
    tarja.querySelector('.texto').textContent = `${codigo} é de ${cidade}, não é ${alvo.frase}`;
    tarja.classList.add('ver');
    // Outro bipe errado no meio recomeça a contagem.
    clearTimeout(somirTarja);
    somirTarja = setTimeout(() => tarja.classList.remove('ver'), TARJA_MS);
  }

  // Registro no sistema (loggi_bipagem_registros), pelo fundo.js, que tem o token.
  function registrar(conferidos, acao = 'bipe') {
    const itens = conferidos.map((i) => ({
      id: crypto.randomUUID(),
      acao,
      codigo: i.codigo,
      cidade: i.cidade,
      certo: i.ok === null ? null : i.ok,
      esperado: (alvo && alvo.rotulo) || null,
      esperadoCidades: (alvo && alvo.cidades) || [],
      quando: Date.now(),
    }));
    try {
      chrome.runtime.sendMessage({ tipo: 'bipes', itens }).catch(() => {});
    } catch { /* extensao recarregada: esta aba precisa de F5 */ }
  }

  // ── conferencia do grupo inteiro no "Continuar" ──────────────────────────
  // Codigo → cidade de cada bipe desde que a pagina abriu. Pacote tirado na lixeira some da
  // tela, e e o texto da tela que diz quem ainda esta no grupo (regras.pendentes).
  const bipes = new Map();
  const fundo = sombra.querySelector('.fundo');

  function mostrarPendentes(errados) {
    fundo.querySelector('.explica').textContent = errados.length === 1
      ? `Este pacote não é ${alvo.frase}. Verifique o pacote que você bipou errado e remova para continuar.`
      : `Estes pacotes não são ${alvo.frase}. Verifique os pacotes que você bipou errado e remova para continuar.`;
    const ul = fundo.querySelector('ul');
    ul.replaceChildren(...errados.map((e) => {
      const li = document.createElement('li');
      const cod = document.createElement('span');
      cod.textContent = e.codigo;
      const cid = document.createElement('span');
      cid.textContent = e.cidade;
      li.append(cod, cid);
      return li;
    }));
    fundo.classList.add('ver');
    tocarErro();
  }

  // Com pendencia, o clique nao chega a Loggi: a tela fica na lista, que e onde se retira o
  // pacote. Fase de captura no window, antes do React da pagina.
  window.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b.textContent.replace(/\s+/g, ' ').trim().toLowerCase() !== 'continuar') return;
    const errados = R.pendentes(bipes, document.body.innerText, alvo, alvo && alvo.conversao);
    if (!errados.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    mostrarPendentes(errados);
  }, true);

  fundo.querySelector('button').addEventListener('click', () => fundo.classList.remove('ver'));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fundo.classList.contains('ver')) fundo.classList.remove('ver');
  }, true);

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.xmBipagem !== 'bipe' || !Array.isArray(e.data.itens)) return;
    e.data.itens.forEach((i) => bipes.set(String(i.codigo), String(i.cidade)));
    const conferidos = e.data.itens.map((i) => ({
      codigo: String(i.codigo), cidade: String(i.cidade),
      ok: R.conferirBipe(i.cidade, alvo, alvo && alvo.conversao).ok,
    }));
    const errado = conferidos.find((i) => i.ok === false);
    if (errado) {
      mostrarTarja(errado.codigo, errado.cidade);
      tocarErro();
    } else if (conferidos.some((i) => i.ok)) {
      tarja.classList.remove('ver');
    }
    registrar(conferidos);
  });

  // ── lixeira ──────────────────────────────────────────────────────────────
  // A lixeira da Loggi nao chama servidor nenhum: so tira a linha da tela. Entao: clique num
  // botao de icone (sem texto) numa linha com um pacote bipado arma aquele codigo; se ele sumir
  // da tela em ate 30 s (da tempo de confirmar, se a Loggi perguntar), foi removido.
  const ARMADO_MS = 30000;
  const armados = new Map(); // codigo → ate quando vale
  let conferirDepois = null;

  function ehBotaoDeIcone(el) {
    const b = el && el.closest && (el.closest('button, [role="button"]') || el.closest('svg'));
    return !!b && b.textContent.replace(/\s+/g, '').length <= 2;
  }

  function verRemocoes() {
    conferirDepois = null;
    if (!armados.size) return;
    const tela = document.body.innerText.toUpperCase();
    const agora = Date.now();
    const removidos = [];
    for (const [codigo, ate] of armados) {
      if (!tela.includes(codigo)) {
        removidos.push(codigo);
        armados.delete(codigo);
      } else if (agora > ate) {
        armados.delete(codigo);
      }
    }
    if (!removidos.length) return;
    const porCodigo = new Map([...bipes].map(([c, cid]) => [c.toUpperCase(), [c, cid]]));
    registrar(removidos.map((k) => {
      const [codigo, cidade] = porCodigo.get(k) || [k, ''];
      bipes.delete(codigo);
      return { codigo, cidade, ok: cidade ? R.conferirBipe(cidade, alvo, alvo && alvo.conversao).ok : null };
    }), 'removido');
  }

  function agendarVerRemocoes() {
    if (armados.size && !conferirDepois) conferirDepois = setTimeout(verRemocoes, 300);
  }

  window.addEventListener('click', (e) => {
    if (travado || !bipes.size || e.target === hospedeiro || !ehBotaoDeIcone(e.target)) return;
    const textos = [];
    for (let el = e.target instanceof Element ? e.target : null; el && el !== document.body && textos.length < 12; el = el.parentElement) {
      textos.push(el.innerText || el.textContent || '');
    }
    const codigo = R.codigoDaLinha(textos, bipes.keys());
    if (!codigo) return;
    armados.set(codigo, Date.now() + ARMADO_MS);
    agendarVerRemocoes();
  }, true);

  new MutationObserver(agendarVerRemocoes).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(() => { if (armados.size) verRemocoes(); }, 2000);

  // ── trava sem login (arco.loggi.com) ───────────────────────────────────────
  const trava = sombra.querySelector('.trava');
  let travado = R.precisaTravar(location.hostname, false); // comeca travado ate o fundo responder

  let estavaTravado = null;
  function aplicarTrava(motivo) {
    trava.classList.toggle('ver', travado);
    menu.classList.toggle('travado', travado);
    if (motivo) trava.querySelector('.motivo').textContent = motivo;
    // So na hora que trava: tira o foco do campo da Loggi. Nunca do hospedeiro, que e onde
    // fica o foco quando se digita no login do painel (antes isso roubava o foco a cada 3 s).
    if (travado && estavaTravado !== true) {
      const ativo = document.activeElement;
      if (ativo && ativo !== document.body && ativo !== hospedeiro) ativo.blur();
      abrir();
    }
    estavaTravado = travado;
  }

  async function consultarLogin() {
    if (!R.precisaTravar(location.hostname, false)) return; // so nos sites da lista
    try {
      const r = await chrome.runtime.sendMessage({ tipo: 'estado' });
      travado = R.precisaTravar(location.hostname, !!(r && r.logado));
      aplicarTrava();
    } catch {
      // Extensao recarregada ou atualizada: este script ficou orfao. So o aviso, sem o
      // painel (o painel de um script orfao nao funciona e parecia tela quebrada).
      travado = true;
      menu.style.display = 'none';
      aplicarTrava('A extensão foi atualizada. Aperte F5 nesta página.');
      trava.querySelector('.motivo').style.top = '50%';
    }
  }

  // Com a trava na tela, nada chega a Loggi: nem clique (a trava cobre tudo) nem tecla (o
  // leitor de codigo digita como teclado). O que vem do menu XM tem como alvo o hospedeiro.
  ['keydown', 'keypress', 'keyup', 'paste', 'beforeinput', 'input', 'submit', 'mousedown', 'pointerdown', 'click', 'touchstart']
    .forEach((tipo) => window.addEventListener(tipo, (e) => {
      if (!travado || e.target === hospedeiro) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true));

  setInterval(consultarLogin, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) consultarLogin(); });

  arrastar(botao, abrir);
  arrastar(cabecalho);
  cabecalho.querySelector('button').addEventListener('click', minimizar);
  tarja.querySelector('button').addEventListener('click', () => tarja.classList.remove('ver'));
  window.addEventListener('resize', aplicarPosicao);

  chrome.storage.onChanged.addListener((mudou, area) => {
    if (area === 'local' && mudou.alvo) alvo = mudou.alvo.newValue || null;
    if (area === 'local' && mudou.sessaoMudou) consultarLogin();
  });

  // ── conversa com o painel (iframe) ─────────────────────────────────────────
  const ORIGEM_PAINEL = new URL(chrome.runtime.getURL('')).origin;
  const avisarPainel = (dados) => { if (quadro) quadro.contentWindow.postMessage({ xmOperacao: 'statusRelatorio', ...dados }, ORIGEM_PAINEL); };

  window.addEventListener('message', (e) => {
    if (e.origin !== ORIGEM_PAINEL || !quadro || e.source !== quadro.contentWindow || !e.data) return;
    if (e.data.xmOperacao === 'tema') painel.classList.toggle('tema-loggi', e.data.tema === 'loggi');
    if (e.data.xmOperacao === 'baixarNaBase' && !travado) baixarNaBase('baixar');
    if (e.data.xmOperacao === 'lerNaBase' && !travado) baixarNaBase('ler');
  });

  // ── Baixar relatorio (Na base) ─────────────────────────────────────────────
  // So aperta o botao do proprio Arco: o "Baixar relatorio" ao lado de "Agrupar" na tela Na base
  // (baixa listagem_na_base_<base>.csv). Em outra tela do Arco, vai antes para /<base>/na-base;
  // como isso recarrega a pagina, o pedido fica no storage e continua quando ela abrir.
  const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visivel = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /** O elemento visivel mais "de dentro" cujo texto e exatamente esse, subindo ate o clicavel. */
  function acharTexto(texto) {
    const alvoTexto = normal(texto);
    const achados = [...document.body.querySelectorAll('a, button, [role="button"], [role="menuitem"], [role="option"], [role="tab"], li, span, p, div')]
      .filter((el) => visivel(el) && normal(el.textContent) === alvoTexto);
    const maisDentro = achados.find((el) => !achados.some((o) => o !== el && el.contains(o)));
    return maisDentro ? (maisDentro.closest('a, button, [role="button"], [role="menuitem"], [role="option"], li') || maisDentro) : null;
  }

  async function esperar(achar, ms) {
    for (const fim = Date.now() + ms; Date.now() < fim; await dormir(250)) {
      const r = achar();
      if (r) return r;
    }
    return null;
  }

  function clicarDeVerdade(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  }

  const naTelaNaBase = () => /\/na-base(\/|$)/i.test(location.pathname)
    || [...document.querySelectorAll('h1, h2')].some((h) => visivel(h) && normal(h.textContent) === 'na base');

  // acao 'baixar': aperta o "Baixar relatório" (o arquivo baixa).
  // acao 'ler': pega o link desse botao e pede ao fundo.js para ler o relatorio sem baixar e
  // cruzar com os bipes do dia no sistema (Agrupamento de hoje). O link tem o token da conta
  // Loggi: so passa daqui para o fundo.js, que usa e esquece.
  async function baixarNaBase(acao, continuacao = false) {
    const ler = acao === 'ler';
    const avisar = (dados) => avisarPainel({ ...dados, ler });
    try {
      const base = location.pathname.split('/').filter(Boolean)[0];
      if (!naTelaNaBase()) {
        if (continuacao) throw new Error('A tela Na base não abriu. Abra ela e clique de novo.');
        if (!base) throw new Error('Abra a tela Na base do Arco e clique de novo.');
        avisar({ texto: 'Indo para a tela Na base...' });
        await chrome.storage.local.set({ pendenteNaBase: { quando: Date.now(), acao } });
        location.assign(`/${encodeURIComponent(base)}/na-base/colecoes`);
        return;
      }
      await chrome.storage.local.remove('pendenteNaBase');
      avisar({ texto: ler ? 'Lendo o relatório Na base...' : 'Apertando o "Baixar relatório"...' });
      const botaoRel = await esperar(() => acharTexto('Baixar relatório'), 15000);
      if (!botaoRel) throw new Error('Não achei o botão "Baixar relatório" na tela Na base.');
      if (!ler) {
        clicarDeVerdade(botaoRel);
        avisar({ texto: 'Pronto: o download do relatório Na base começou.', fim: true });
        return;
      }
      const link = botaoRel.closest('a[href]');
      if (!link) throw new Error('O "Baixar relatório" não tem link. Use o Baixar relatório (Na base).');
      const r = await chrome.runtime.sendMessage({ tipo: 'naBase', url: link.href, base });
      if (!r || r.erro) throw new Error((r && r.erro) || 'Não deu certo.');
      avisar({ texto: '', fim: true, resumo: r.resumo });
    } catch (e) {
      await chrome.storage.local.remove('pendenteNaBase');
      avisar({ texto: /context invalidated/i.test(e.message) ? 'A extensão foi atualizada. Aperte F5 nesta página.' : e.message, erro: true, fim: true });
    }
  }

  // Pedido que ficou no meio da troca de tela (menos de 1 minuto atras). Antes da 2.7 era so a hora.
  chrome.storage.local.get('pendenteNaBase').then(({ pendenteNaBase: p }) => {
    const quando = typeof p === 'number' ? p : p && p.quando;
    if (quando && Date.now() - quando < 60000) {
      esperar(naTelaNaBase, 15000).then(() => baixarNaBase((p && p.acao) || 'baixar', true));
    }
  });

  document.documentElement.append(hospedeiro);
  aplicarPosicao();
  aplicarTrava();
  consultarLogin();
  chrome.storage.local.get(['posicao', 'alvo']).then((salvo) => {
    if (salvo.posicao) posicao = salvo.posicao;
    alvo = salvo.alvo || null;
    aplicarPosicao();
  });
})();
