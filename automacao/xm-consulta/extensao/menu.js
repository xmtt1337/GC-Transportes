// Menu flutuante dentro do site da transportadora.
//
// O painel e a pagina da extensao num iframe, e nao HTML solto no site: assim o
// site nao le a senha nem o token, e o CSS dele nao mexe na tela. Minimizar so
// esconde o iframe, entao a consulta continua rodando.

(() => {
  const NOME = 'XM - Consultas de telefone';
  const MARGEM = 8;

  function limitar(valor, maximo) {
    return Math.min(Math.max(MARGEM, valor), Math.max(MARGEM, maximo));
  }

  if (typeof module !== 'undefined') {
    module.exports = { limitar };
    return;
  }

  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      .menu { position: fixed; z-index: 2147483647; font: 13px system-ui, sans-serif; }
      .botao { display: flex; align-items: center; justify-content: center; min-width: 56px; height: 56px; padding: 0 10px;
        color: #30475a; background: #fff; border: 1px solid #c9ced6; border-radius: 28px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, .35); font: 700 14px system-ui, sans-serif; cursor: grab; touch-action: none; }
      .botao:hover { border-color: #30475a; }
      .botao img { width: 36px; pointer-events: none; }
      .botao span:empty { display: none; }
      .botao span:not(:empty) + img { display: none; }
      .marca { display: flex; align-items: center; gap: 10px; }
      .marca img { width: 30px; pointer-events: none; }
      .painel { display: none; width: 420px; height: min(640px, calc(100vh - 16px)); flex-direction: column;
        background: #16181d; border: 1px solid #3a3f4a; border-radius: 8px; overflow: hidden;
        box-shadow: 0 8px 28px rgba(0, 0, 0, .45); }
      .aberto .painel { display: flex; }
      .aberto .botao { display: none; }
      .cabecalho { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
        color: #e8eaed; font-weight: 700; border-bottom: 1px solid #3a3f4a; cursor: grab; touch-action: none; user-select: none; }
      .cabecalho button { padding: 0; color: #6ea8fe; background: none; border: 0; font: inherit; font-weight: 600; cursor: pointer; }
      .cabecalho button:hover { text-decoration: underline; }
      iframe { flex: 1; width: 100%; border: 0; }
    </style>
    <div class="menu">
      <button class="botao" type="button" title="${NOME}">
        <span></span><img alt="XM" src="${chrome.runtime.getURL('img/logo.png')}">
      </button>
      <div class="painel">
        <div class="cabecalho">
          <span class="marca"><img alt="" src="${chrome.runtime.getURL('img/logo-claro.png')}">${NOME}</span>
          <button type="button">Minimizar</button>
        </div>
      </div>
    </div>`;

  const menu = sombra.querySelector('.menu');
  const botao = sombra.querySelector('.botao');
  const painel = sombra.querySelector('.painel');
  const cabecalho = sombra.querySelector('.cabecalho');
  let quadro = null;
  let posicao = { direita: 20, baixo: 20 };

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

  function arrastar(alvo, aoClicar) {
    let inicio = null;
    let moveu = false;
    alvo.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') && e.target !== botao) return;
      inicio = { x: e.clientX, y: e.clientY, direita: posicao.direita, baixo: posicao.baixo };
      moveu = false;
      alvo.setPointerCapture(e.pointerId);
      if (quadro) quadro.style.pointerEvents = 'none'; // senao o iframe engole o movimento
    });
    alvo.addEventListener('pointermove', (e) => {
      if (!inicio) return;
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      if (!moveu && Math.hypot(dx, dy) < 4) return;
      moveu = true;
      posicao.direita = inicio.direita - dx;
      posicao.baixo = inicio.baixo - dy;
      aplicarPosicao();
    });
    alvo.addEventListener('pointerup', () => {
      if (!inicio) return;
      inicio = null;
      if (quadro) quadro.style.pointerEvents = '';
      if (moveu) chrome.storage.local.set({ posicao });
      else if (aoClicar) aoClicar();
    });
  }

  arrastar(botao, abrir);
  arrastar(cabecalho);
  cabecalho.querySelector('button').addEventListener('click', minimizar);
  window.addEventListener('resize', aplicarPosicao);

  // Progresso no botao: da para minimizar e acompanhar sem abrir o painel.
  window.addEventListener('message', (e) => {
    if (!quadro || e.source !== quadro.contentWindow || !e.data || e.data.xmConsulta !== 'progresso') return;
    botao.querySelector('span').textContent = e.data.pct === null ? '' : `${e.data.pct}%`;
  });

  chrome.runtime.onMessage.addListener((pedido) => {
    if (pedido.tipo !== 'alternar') return;
    if (menu.classList.contains('aberto')) minimizar();
    else abrir();
  });

  document.documentElement.append(hospedeiro);
  aplicarPosicao();
  chrome.storage.local.get(['posicao', 'abrirMenu']).then((salvo) => {
    if (salvo.posicao) posicao = salvo.posicao;
    aplicarPosicao();
    if (salvo.abrirMenu) {
      chrome.storage.local.remove('abrirMenu');
      abrir();
    }
  });
})();
