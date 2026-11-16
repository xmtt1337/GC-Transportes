// Menu flutuante e alerta no site da Loggi.
//
// O painel e a pagina da extensao num iframe: o site nao le senha nem token. O alerta
// (tarja vermelha e som) mora aqui, fora do iframe, para aparecer mesmo com o painel
// minimizado. A conferencia usa o "alvo" que o painel grava no storage.

(() => {
  const NOME = 'XM - Bipagem Loggi';
  const MARGEM = 8;
  const HISTORICO_MAX = 30;

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
        background: #16181d; border: 1px solid #3a3f4a; border-radius: 8px; overflow: hidden;
        box-shadow: 0 8px 28px rgba(0, 0, 0, .45); }
      .aberto .painel { display: flex; }
      .aberto .botao { display: none; }
      .cabecalho { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
        color: #e8eaed; font-weight: 700; border-bottom: 1px solid #3a3f4a; cursor: grab; touch-action: none; user-select: none; }
      .cabecalho button, .tarja button { padding: 0; color: #6ea8fe; background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
      .cabecalho button:hover, .tarja button:hover { text-decoration: underline; }
      iframe { flex: 1; width: 100%; border: 0; }
      .tarja { display: none; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
        padding: 18px 24px; background: #dc2626; color: #fff; font: 600 18px system-ui, sans-serif;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .4); align-items: center; justify-content: space-between; gap: 16px; }
      .tarja.ver { display: flex; }
      .tarja strong { display: block; font-size: 26px; letter-spacing: .5px; }
      .tarja button { color: #fff; text-decoration: underline; }
      .fundo { display: none; position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, .55);
        align-items: center; justify-content: center; font: 15px system-ui, sans-serif; }
      .fundo.ver { display: flex; }
      .card { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; background: #fff;
        color: #1f2933; border-left: 8px solid #dc2626; border-radius: 0 8px 8px 0; padding: 22px 24px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, .45); }
      .card h2 { margin: 0 0 6px; color: #b91c1c; font-size: 22px; }
      .card p { margin: 0 0 12px; color: #52606d; }
      .card ul { margin: 0 0 16px; padding: 0; list-style: none; }
      .card li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #e4e7eb; }
      .card li span:first-child { font-family: ui-monospace, Consolas, monospace; font-weight: 600; }
      .card li span:last-child { color: #b91c1c; font-weight: 600; }
      .card button { padding: 0; background: none; border: 0; color: #1d4ed8; font: 600 15px system-ui, sans-serif; cursor: pointer; }
      .card button:hover { text-decoration: underline; }
    </style>
    <div class="fundo" role="alertdialog" aria-modal="true">
      <div class="card">
        <h2>Retire estes pacotes do grupo</h2>
        <p class="explica"></p>
        <ul></ul>
        <button type="button">Entendi, vou retirar</button>
      </div>
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
          <span class="marca"><img alt="XM" src="${chrome.runtime.getURL('img/logo-claro.png')}">- Bipagem Loggi</span>
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

  function abrir() {
    if (!quadro) {
      quadro = document.createElement('iframe');
      quadro.title = NOME;
      quadro.src = chrome.runtime.getURL('pagina.html');
      painel.append(quadro);
    }
    menu.classList.add('aberto');
    aplicarPosicao();
  }

  function minimizar() {
    menu.classList.remove('aberto');
    aplicarPosicao();
  }

  function arrastar(elemento, aoClicar) {
    let inicio = null;
    let moveu = false;
    elemento.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') && e.target !== botao) return;
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

  function mostrarTarja(codigo, cidade) {
    tarja.querySelector('.texto').textContent =
      `${codigo} é de ${cidade}, fora de: ${alvo.rotulo || 'cidades marcadas'}`;
    tarja.classList.add('ver');
  }

  async function guardarHistorico(itens) {
    const { historico = [] } = await chrome.storage.local.get('historico');
    const novos = itens.map((i) => ({ ...i, quando: Date.now() }));
    await chrome.storage.local.set({ historico: [...novos.reverse(), ...historico].slice(0, HISTORICO_MAX) });
  }

  // ── conferencia do grupo inteiro no "Continuar" ──────────────────────────
  // Codigo → cidade de cada bipe desde que a pagina abriu. Pacote tirado na lixeira some da
  // tela, e e o texto da tela que diz quem ainda esta no grupo (regras.pendentes).
  const bipes = new Map();
  const fundo = sombra.querySelector('.fundo');

  function mostrarPendentes(errados) {
    fundo.querySelector('.explica').textContent =
      `${errados.length === 1 ? 'Este pacote não é' : 'Estes pacotes não são'} de ${alvo.rotulo || 'nenhuma cidade marcada'}. ` +
      'Tire da lista na lixeira e clique em Continuar de novo.';
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
    guardarHistorico(conferidos);
  });

  arrastar(botao, abrir);
  arrastar(cabecalho);
  cabecalho.querySelector('button').addEventListener('click', minimizar);
  tarja.querySelector('button').addEventListener('click', () => tarja.classList.remove('ver'));
  window.addEventListener('resize', aplicarPosicao);

  chrome.storage.onChanged.addListener((mudou, area) => {
    if (area === 'local' && mudou.alvo) alvo = mudou.alvo.newValue || null;
  });

  document.documentElement.append(hospedeiro);
  aplicarPosicao();
  chrome.storage.local.get(['posicao', 'alvo']).then((salvo) => {
    if (salvo.posicao) posicao = salvo.posicao;
    alvo = salvo.alvo || null;
    aplicarPosicao();
  });
})();
