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

  // ── o andamento pra tela "Em execução" do sistema ──────────────────────
  // Uma foto do painel desta aba (passo atual, últimas linhas, estação logada) vai pro service
  // worker, que junta a de todas as abas e manda ao vigia -> sistema, só em memória lá. Tudo
  // aqui é ACESSÓRIO: falhar não pode atrapalhar o macro.
  let atividade = null;
  let envioMarcado = null;
  const INTERVALO_ENVIO_MS = 1500;

  function estacaoDaPagina() {
    try { return G.logica.estacaoNoTexto(document.body && document.body.innerText); }
    catch (e) { return null; }
  }

  function enviarAtividade() {
    envioMarcado = null;
    try {
      if (!atividade || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
      const r = chrome.runtime.sendMessage({ xmAtividade: G.logica.atividadeDoPainel(atividade) });
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) { /* ver acima */ }
  }

  // Junta as mudanças de 1,5s num envio só (um macro solta várias notas por segundo); o fim do
  // macro sai na hora.
  function registrar(tipo, texto, opcoes) {
    try { anotar(tipo, texto, opcoes || {}); } catch (e) { /* acessorio: nunca derruba o macro */ }
  }

  // A janela deste Chrome ficou escondida (minimizada ou coberta por outra) em algum momento do
  // macro? Com dois Chromes, um atrás do outro, o de trás para de desenhar a página e os cliques
  // não pegam (19/10/2026) - o erro final passa a dizer isso, senão parece defeito do macro.
  let viuEscondida = false;
  const janelaEscondida = () => typeof document !== 'undefined' && !!document.hidden;

  function comAvisoDeJanela(texto) {
    const t = String(texto == null ? '' : texto);
    if (!viuEscondida || /escondida/i.test(t) || /^parado por voc/i.test(t)) return t;
    return `${t} — a janela deste Chrome estava escondida (minimizada ou coberta); deixe as janelas lado a lado ou abra pelo atalho XM`;
  }

  function anotar(tipo, texto, { estado, passo, imediato }) {
    if (janelaEscondida()) viuEscondida = true;
    if (!atividade) return;
    // Aberto antes de a página desenhar a estação: tenta de novo a cada anotação.
    if (!atividade.estacao) atividade.estacao = estacaoDaPagina();
    atividade.linhas.push({ em: Date.now(), tipo, texto: String(texto == null ? '' : texto) });
    if (atividade.linhas.length > 60) atividade.linhas.splice(0, atividade.linhas.length - 60);
    if (passo !== undefined) atividade.passo = passo;
    if (estado) {
      atividade.estado = estado;
      if (estado !== 'rodando') atividade.terminouEm = Date.now();
    }
    if (imediato) {
      if (envioMarcado) clearTimeout(envioMarcado);
      enviarAtividade();
    } else if (!envioMarcado) {
      envioMarcado = setTimeout(enviarAtividade, INTERVALO_ENVIO_MS);
    }
  }

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
      viuEscondida = janelaEscondida();
      atividade = { titulo, estado: 'rodando', passo: '', estacao: estacaoDaPagina(),
                    comecouEm: Date.now(), terminouEm: null, linhas: [] };
      registrar('passo', 'começou', { imediato: true });
      montar(titulo);
      console.log(`[XM Macros] ${titulo}: comecou`);
    },

    passo(texto) {
      registrar('passo', texto, { passo: texto });
      if (!listaEl) return;
      fecharAnterior();
      passoAtual = linha('fazendo', '▸', texto);
      console.log(`[XM Macros] ${texto}`);
    },

    // O polo em que o macro está trabalhando (o Colador sabe, mesmo antes de a página mostrar a
    // estação): é o que põe a sessão na linha certa do sistema, e não em "polo ?".
    polo(xpt) {
      if (!atividade || !xpt) return;
      atividade.xpt = xpt;
      registrar('nota', `polo ${xpt}`, { imediato: true });
    },

    nota(texto) {
      registrar('nota', texto);
      if (!listaEl) return;
      linha('', '·', texto);
      console.log(`[XM Macros]   ${texto}`);
    },

    ok(texto) {
      contarAoSistema('ok', texto);
      registrar('ok', texto, { estado: 'ok', passo: texto, imediato: true });
      if (!listaEl) return;
      fecharAnterior();
      passoAtual = null;
      linha('pronto', '✔', texto);
      if (botaoEl) { botaoEl.textContent = 'Fechar'; botaoEl.classList.remove('parar'); }
      aoParar = desmontar;
      console.log(`[XM Macros] ${texto}`);
    },

    // Terminou sem fazer nada, mas sem defeito: no historico entra amarelo, nao vermelho.
    aviso(texto) {
      contarAoSistema('aviso', texto);
      registrar('aviso', texto, { estado: 'aviso', passo: texto, imediato: true });
      if (!listaEl) return;
      fecharAnterior();
      passoAtual = null;
      linha('pronto', '!', texto);
      if (botaoEl) { botaoEl.textContent = 'Fechar'; botaoEl.classList.remove('parar'); }
      aoParar = desmontar;
      console.log(`[XM Macros] ${texto}`);
    },

    erro(textoOriginal) {
      if (janelaEscondida()) viuEscondida = true;
      const texto = comAvisoDeJanela(textoOriginal);
      contarAoSistema('erro', texto);
      registrar('erro', texto, { estado: /^parado por voc/i.test(String(texto)) ? 'parado' : 'erro',
                                 passo: texto, imediato: true });
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
