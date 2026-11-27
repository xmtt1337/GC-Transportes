// XM - Coletas Loggi, na tela do Arco.
//
// Nas coletas, o Agrupar recebe pacote do Brasil inteiro. Ligado (icone da extensao), cada bipe
// de pacote de uma cidade da NOSSA abrangencia (circulos da base) apita e mostra uma faixa escura
// (#2E3545, a cor do texto do Arco, para nao sumir na barra azul) no alto da tela com a cidade e o codigo, para separar. Pacote de fora: nada acontece.
// Desligado: nada acontece. Nao ha nada para configurar.
//
// Ligado, marca <html data-xm-coletas="1">: a XM - Agrupamento Loggi, se estiver instalada
// tambem, nao abre a escolha de circulo/cidades nem alerta "de fora" durante a coleta.
// As cidades vem da propria Loggi (loggi.js, sessao da pagina) e ficam guardadas 6 h por base.

(() => {
  const R = self.XMAgrupamento;
  const A = self.XMColetas;
  const CANAL = 'xmColetas';
  const VALIDADE_MS = 6 * 60 * 60 * 1000;
  const FAIXA_MS = 5000;
  const codigoBase = (location.pathname.split('/').filter(Boolean)[0] || '').toUpperCase();

  let ligado = false;
  let abr = null; // { chaves, nomes, origem }
  let carregando = null; // Promise enquanto busca na Loggi
  let pendentes = []; // bipes que chegaram antes de saber as cidades

  // ── faixa (no padrao do Arco: Open Sans, azul da Loggi) ────────────────────
  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      :host { all: initial; }
      .faixa { display: flex; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; gap: 20px; align-items: center; padding: 18px 28px;
        color: #fff; background: #2e3545; font: 400 18px/1.4 'Open Sans', sans-serif;
        box-shadow: 0 6px 20px rgba(0, 0, 0, .3); -webkit-font-smoothing: antialiased;
        opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .5s ease, visibility 0s linear .5s; }
      .faixa.ver { opacity: 1; visibility: visible; pointer-events: auto; transition: none; }
      .faixa.aviso { font-size: 15px; }
      .texto { flex: 1; min-width: 0; }
      .titulo { display: block; font: 700 14px/1.2 'Open Sans', sans-serif; letter-spacing: .04em; text-transform: uppercase; color: #00baff; }
      .cidade { font: 700 30px/1.25 'Montserrat', 'Open Sans', sans-serif; }
      .codigo { margin-left: 12px; font-family: ui-monospace, Consolas, monospace; font-size: 16px; opacity: .9; word-break: break-all; }
      .mais { display: block; font-size: 14px; opacity: .9; }
      button { flex: none; padding: 0 24px; min-height: 48px; color: #fff; background: transparent; border: 1px solid #fff; border-radius: 24px;
        font: 600 15px 'Open Sans', sans-serif; cursor: pointer; }
      button:hover { background: rgba(255, 255, 255, .12); }
    </style>
    <div class="faixa" role="alert">
      <div class="texto"></div>
      <button type="button">Ok</button>
    </div>`;
  const faixa = sombra.querySelector('.faixa');
  const texto = sombra.querySelector('.texto');
  sombra.querySelector('button').addEventListener('click', () => faixa.classList.remove('ver'));
  const el = (tag, classe, t) => { const e = document.createElement(tag); e.className = classe; e.textContent = t; return e; };

  let sumir = null;
  function mostrar(nos, aviso = false, ms = FAIXA_MS) {
    texto.replaceChildren(...nos);
    faixa.classList.toggle('aviso', aviso);
    faixa.classList.add('ver');
    clearTimeout(sumir);
    sumir = setTimeout(() => faixa.classList.remove('ver'), ms);
  }

  function mostrarNossos(nossos) {
    const [p] = nossos;
    const nos = [el('span', 'titulo', 'Nossa abrangência · separar'), el('span', 'cidade', R.bonito(p.cidade)), el('span', 'codigo', p.codigo)];
    if (nossos.length > 1) nos.push(el('span', 'mais', `e mais ${nossos.length - 1}: ${nossos.slice(1).map((x) => `${x.codigo} (${R.bonito(x.cidade)})`).join(', ')}`));
    mostrar(nos);
  }

  // ── apito (diferente do erro da XM - Agrupamento: agudo e curto) ───────────
  let audio = null;
  const prepararAudio = () => {
    try { audio = audio || new AudioContext(); if (audio.state === 'suspended') audio.resume(); } catch { /* sem audio */ }
  };
  // o leitor de codigo "digita": a primeira tecla ja libera o som do navegador
  window.addEventListener('keydown', prepararAudio, true);
  window.addEventListener('pointerdown', prepararAudio, true);

  function apitar() {
    try {
      prepararAudio();
      const t0 = audio.currentTime;
      for (let i = 0; i < 3; i += 1) {
        const osc = audio.createOscillator();
        const vol = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = 1046;
        vol.gain.setValueAtTime(0.3, t0 + i * 0.15);
        vol.gain.setValueAtTime(0, t0 + i * 0.15 + 0.1);
        osc.connect(vol).connect(audio.destination);
        osc.start(t0 + i * 0.15);
        osc.stop(t0 + i * 0.15 + 0.11);
      }
    } catch { /* sem audio, a faixa ainda aparece */ }
  }

  // ── cidades da base (pelo loggi.js) ───────────────────────────────────────
  function pedirALoggi(tipo) {
    return new Promise((ok, nao) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        window.removeEventListener('message', ouvir);
        clearTimeout(limite);
        if (e.data.erro) nao(new Error(e.data.erro)); else ok(e.data);
      };
      const limite = setTimeout(() => { window.removeEventListener('message', ouvir); nao(new Error('A Loggi demorou para responder.')); }, 30000);
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: 'pedir', id, tipo }, location.origin);
    });
  }

  const chaveGuardada = () => `abr:${codigoBase || 'sem-base'}`;

  async function carregarAbrangencia(silencioso = false) {
    if (abr) return abr;
    if (carregando) return carregando;
    carregando = (async () => {
      try {
        const salvo = (await chrome.storage.local.get(chaveGuardada()))[chaveGuardada()];
        if (salvo && Date.now() - salvo.em < VALIDADE_MS && salvo.abr && salvo.abr.chaves.length) {
          abr = A.deGuardado(salvo.abr);
          R.aprenderNomes([...abr.nomes.values()]);
          return abr;
        }
        const c = await pedirALoggi('circulos');
        const circulos = c.circulos || [];
        // sem circulo nenhum: a lista de cidades da base
        const cidades = circulos.some((x) => (x.cidades || []).length) ? [] : (await pedirALoggi('cidades')).cidades || [];
        const novo = A.montarAbrangencia(circulos, cidades);
        if (!novo.chaves.size) throw new Error('A Loggi não trouxe as cidades da base.');
        R.aprenderNomes([...novo.nomes.values()]);
        abr = novo;
        await chrome.storage.local.set({ [chaveGuardada()]: { em: Date.now(), abr: A.guardavel(novo) } });
        return abr;
      } catch (e) {
        // usa a lista velha se tiver; senao avisa e tenta de novo no proximo bipe
        const salvo = (await chrome.storage.local.get(chaveGuardada()).catch(() => ({})))[chaveGuardada()];
        if (salvo && salvo.abr && salvo.abr.chaves.length) { abr = A.deGuardado(salvo.abr); R.aprenderNomes([...abr.nomes.values()]); return abr; }
        if (!silencioso) mostrar([el('span', '', `Coletas: não deu para ler as cidades da base na Loggi (${e.message}). Abra outra tela do Arco e bipe de novo.`)], true, 8000);
        return null;
      } finally {
        carregando = null;
      }
    })();
    return carregando;
  }

  function conferir(itens) {
    const nossos = itens.filter((i) => A.daAbrangencia(i.cidade, abr));
    if (!nossos.length) return;
    apitar();
    mostrarNossos(nossos);
  }

  window.addEventListener('message', async (e) => {
    if (!ligado || e.source !== window || !e.data || e.data[CANAL] !== 'bipe' || !Array.isArray(e.data.itens)) return;
    const itens = e.data.itens.map((i) => ({ codigo: String(i.codigo), cidade: R.consertarTexto(String(i.cidade)) }));
    if (abr) { conferir(itens); return; }
    pendentes.push(...itens);
    await carregarAbrangencia();
    const agora = pendentes;
    pendentes = [];
    if (abr && ligado) conferir(agora);
  });

  // ── ligar / desligar (icone da extensao) ──────────────────────────────────
  function aplicar(valor) {
    ligado = valor !== false;
    if (ligado) document.documentElement.setAttribute('data-xm-coletas', '1');
    else { document.documentElement.removeAttribute('data-xm-coletas'); faixa.classList.remove('ver'); }
    if (ligado && /(^|\.)arco\.loggi\.com$/.test(location.hostname)) carregarAbrangencia(true); // ja deixa pronto; erro so aparece num bipe
  }
  chrome.storage.local.get('ligado').then((s) => aplicar(s.ligado));
  chrome.storage.onChanged.addListener((m, area) => { if (area === 'local' && m.ligado) aplicar(m.ligado.newValue); });

  document.documentElement.append(hospedeiro);
})();
