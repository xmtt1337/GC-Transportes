// A janelinha que aparece na tela enquanto o macro roda.
//
// Ela existe porque o popup da extensao fecha assim que o usuario clica em
// qualquer lugar - e o macro leva minutos. Sem um lugar fixo pra olhar, a
// unica forma de saber se travou seria abrir o F12.
//
// Vive dentro de um shadow root: o CSS do SPX nao entra, e o nosso nao vaza
// pra tela dele.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});

  const ESTILO = `
    :host { all: initial; }
    .caixa {
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      width: 330px; box-sizing: border-box;
      font: 13px/1.45 "Segoe UI", system-ui, sans-serif; color: #e8edf5;
      background: #16202e; border-radius: 10px;
      /* tarja a esquerda: canto reto desse lado, arredondado so do outro */
      border-left: 5px solid #ee4d2d;
      border-top-left-radius: 0; border-bottom-left-radius: 0;
      box-shadow: 0 10px 30px rgba(0,0,0,.45);
      overflow: hidden;
    }
    .topo { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
            background: #1e2b3d; }
    .topo > div { flex: 1; min-width: 0; }
    .titulo { font-weight: 600; font-size: 13px; }
    .marca { font-size: 10px; letter-spacing: .08em; color: #8fa3bd;
             text-transform: uppercase; }
    .passos { margin: 0; padding: 8px 12px 10px; list-style: none;
              max-height: 320px; overflow-y: auto; }
    .passo { display: flex; gap: 8px; padding: 3px 0; color: #b9c6d8; }
    .passo .bolinha { width: 14px; flex: none; text-align: center; }
    .passo.fazendo { color: #fff; }
    .passo.fazendo .bolinha { color: #f8a13f; }
    .passo.pronto .bolinha { color: #2ecc71; }
    .passo.ruim { color: #ff9c8a; }
    .passo.ruim .bolinha { color: #ff5f45; }
    .rodape { display: flex; gap: 8px; padding: 9px 12px; background: #11192400;
              border-top: 1px solid #24344a; }
    button { font: inherit; font-size: 12px; padding: 5px 12px; cursor: pointer;
             border-radius: 5px; border: 1px solid #3a4c68; background: #22304a;
             color: #dbe5f2; }
    button:hover { background: #2c3e5e; }
    button.parar { border-color: #7a3328; background: #4a2019; color: #ffd9d1; }
    .cronometro { margin-left: auto; align-self: center; font-size: 11px;
                  color: #7f92ab; font-variant-numeric: tabular-nums; }
  `;

  let raizSombra = null;
  let listaEl = null;
  let cronoEl = null;
  let botaoEl = null;
  let passoAtual = null;
  let inicio = 0;
  let relogio = null;
  let aoParar = null;
  let tituloAtual = '';

  // Conta ao sistema (pelo service worker -> vigia) como o macro terminou. ACESSORIO: se nao
  // der, o painel continua igual - nada aqui pode atrapalhar o macro.
  function contarAoSistema(tipo, texto) {
    try {
      const ev = G.logica && G.logica.eventoDoPainel(tituloAtual, tipo, texto);
      if (ev && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const r = chrome.runtime.sendMessage({ xmEvento: ev });
        if (r && typeof r.catch === 'function') r.catch(() => {});
      }
    } catch (e) { /* ver acima */ }
  }

  function montar(titulo) {
    desmontar();
    const host = document.createElement('div');
    host.id = 'xm-macro-painel';
    document.documentElement.appendChild(host);
    raizSombra = host.attachShadow({ mode: 'open' });

    const estilo = document.createElement('style');
    estilo.textContent = ESTILO;

    const caixa = document.createElement('div');
    caixa.className = 'caixa';
    caixa.innerHTML = `
      <div class="topo">
        <div>
          <div class="marca">XM Macros</div>
          <div class="titulo"></div>
        </div>
      </div>
      <ul class="passos"></ul>
      <div class="rodape">
        <button class="parar">Parar</button>
        <span class="cronometro">0:00</span>
      </div>`;
    caixa.querySelector('.titulo').textContent = titulo;

    raizSombra.append(estilo, caixa);
    listaEl = caixa.querySelector('.passos');
    cronoEl = caixa.querySelector('.cronometro');
    botaoEl = caixa.querySelector('.parar');
    botaoEl.addEventListener('click', () => { if (aoParar) aoParar(); });

    inicio = Date.now();
    relogio = setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      cronoEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  }

  function desmontar() {
    if (relogio) clearInterval(relogio);
    relogio = null;
    const antigo = document.getElementById('xm-macro-painel');
    if (antigo) antigo.remove();
    raizSombra = listaEl = cronoEl = botaoEl = passoAtual = null;
  }

  function linha(classe, bolinha, texto) {
    const li = document.createElement('li');
    li.className = `passo ${classe}`;
    li.innerHTML = '<span class="bolinha"></span><span class="texto"></span>';
    li.querySelector('.bolinha').textContent = bolinha;
    li.querySelector('.texto').textContent = texto;
    listaEl.appendChild(li);
    listaEl.scrollTop = listaEl.scrollHeight;
    return li;
  }

  function fecharAnterior() {
    if (passoAtual && passoAtual.classList.contains('fazendo')) {
      passoAtual.classList.remove('fazendo');
      passoAtual.classList.add('pronto');
      passoAtual.querySelector('.bolinha').textContent = '✔';
    }
  }

  const painel = {
    abrir(titulo, quandoParar) {
      aoParar = quandoParar;
      tituloAtual = titulo;
      montar(titulo);
      console.log(`[XM Macros] ${titulo}: comecou`);
    },

    passo(texto) {
      if (!listaEl) return;
      fecharAnterior();
      passoAtual = linha('fazendo', '▸', texto);
      console.log(`[XM Macros] ${texto}`);
    },

    nota(texto) {
      if (!listaEl) return;
      linha('', '·', texto);
      console.log(`[XM Macros]   ${texto}`);
    },

    ok(texto) {
      contarAoSistema('ok', texto);
      if (!listaEl) return;
      fecharAnterior();
      passoAtual = null;
      linha('pronto', '✔', texto);
      if (botaoEl) { botaoEl.textContent = 'Fechar'; botaoEl.classList.remove('parar'); }
      aoParar = desmontar;
      console.log(`[XM Macros] ${texto}`);
    },

    erro(texto) {
      contarAoSistema('erro', texto);
      if (!listaEl) return;
      if (passoAtual) {
        passoAtual.classList.remove('fazendo');
        passoAtual.classList.add('ruim');
        passoAtual.querySelector('.bolinha').textContent = '✕';
      }
      passoAtual = null;
      linha('ruim', '✕', texto);
      if (botaoEl) { botaoEl.textContent = 'Fechar'; botaoEl.classList.remove('parar'); }
      aoParar = desmontar;
      console.error(`[XM Macros] ${texto}`);
    },

    fechar: desmontar,
    aberto: () => !!raizSombra,
  };

  G.painel = painel;
})(typeof window !== 'undefined' ? window : globalThis);
