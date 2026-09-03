// Ponte do lado do navegador: recebe codigos do colador (Python local) e
// escreve no campo do SPX.
//
// Roda como content script de extensao, e nao colado no console, por dois
// motivos: sobrevive ao F5, e content script pode abrir WebSocket pra
// localhost a partir de uma pagina HTTPS - codigo do console nem sempre pode.

(() => {
  'use strict';

  // O script entra por dois caminhos: o normal do manifest e a injeção do
  // background nas abas que já estavam abertas. Sem esta trava, a aba abriria
  // duas conexões e o colador derrubaria uma com a outra sem parar.
  if (window.__gcColadorAtivo) {
    console.log('[GC Colador] já estava rodando nesta aba');
    return;
  }
  window.__gcColadorAtivo = true;

  // Cada colador aberto ocupa uma porta. A aba varre todas e fica com o
  // colador que disser que ela é dele — é assim que o recebimento e o AT
  // Cluster rodam juntos sem trocar os códigos.
  const PORTAS = [9876, 9877, 9878, 9879, 9880, 9881, 9882, 9883, 9884, 9885];
  const RECONECTAR_MS = 3000;
  // Quanto esperar por um sinal de que o SPX processou. Se ele não sinalizar
  // nada nesse tempo, seguimos — esperar mais não traz informação nenhuma.
  const ESPERA_MAX_MS = 500;

  // O campo do SPX nao tem id, name nem classe: o placeholder e o que sobra.
  // Cada tela usa um texto - e nem todas estao traduzidas. Se a Shopee mudar
  // esses textos, e aqui que quebra primeiro.
  const SELETORES = [
    'input[placeholder="Por favor, insira"]',      // Entrada > Recebimento
    'input[placeholder="Please Scan or Input"]',   // Entrega > Sorting Task (AT Cluster)
    'input[placeholder*="insira"]',
    'input[placeholder*="Scan"]',
    'input[placeholder*="rastreamento"]',
  ];

  let ws = null;
  let ligado = true;

  // --- achar o campo ----------------------------------------------------
  // Guarda o ultimo encontrado: procurar de novo a cada 30ms custa caro, porque
  // offsetParent forca o navegador a recalcular layout numa pagina pesada.
  let campoEmCache = null;

  function acharCampo() {
    if (campoEmCache && campoEmCache.isConnected &&
        (campoEmCache.offsetParent !== null || campoEmCache === document.activeElement)) {
      return campoEmCache;
    }
    for (const sel of SELETORES) {
      // Ignora o que esta escondido: o SPX mantem campos de abas inativas no DOM.
      for (const el of document.querySelectorAll(sel)) {
        if (el.offsetParent !== null || el === document.activeElement) {
          campoEmCache = el;
          return el;
        }
      }
    }
    campoEmCache = null;
    return null;
  }

  // O SPX desabilita o campo enquanto processa o codigo anterior. Escrever
  // nesse intervalo joga o codigo fora - por isso esperamos ele voltar.
  //
  // Desiste por TEMPO **e** por numero de tentativas, nao so por relogio: numa
  // aba em segundo plano o Chrome estica setTimeout pra 1x/s (e 1x/min depois
  // de 5 min oculta), entao os 15s de relogio passavam com duas ou tres olhadas
  // no campo e a gente devolvia "campo preso desabilitado" com o SPX bipando
  // normal. Contar tentativas nao muda nada no caso normal - a 100ms, 15s ja
  // sao 150 olhadas.
  const MIN_TENTATIVAS = 30;

  function esperarCampoLivre(limiteMs = 15000) {
    return new Promise((resolve) => {
      const fim = Date.now() + limiteMs;
      let tentativas = 0;
      (function tentar() {
        tentativas++;
        const campo = acharCampo();
        if (campo && !campo.disabled && !campo.readOnly) return resolve(campo);
        if (Date.now() > fim && tentativas >= MIN_TENTATIVAS) return resolve(null);
        setTimeout(tentar, 100);
      })();
    });
  }

  // --- escrever de um jeito que o React enxergue ------------------------
  function escrever(campo, texto) {
    const proto = campo.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;

    campo.focus();
    setter.call(campo, '');
    campo.dispatchEvent(new Event('input', { bubbles: true }));

    setter.call(campo, texto);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function apertarEnter(campo) {
    for (const tipo of ['keydown', 'keypress', 'keyup']) {
      campo.dispatchEvent(new KeyboardEvent(tipo, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true,
      }));
    }
  }

  async function colar(codigo) {
    // Cronometra cada fase: sem isso, "esta lento" nao diz se a espera e do
    // SPX processando ou do campo demorando a liberar.
    const t0 = Date.now();

    const campo = await esperarCampoLivre();
    const tCampo = Date.now() - t0;
    if (!campo) return { ok: false, motivo: 'campo nao encontrado ou preso desabilitado' };

    escrever(campo, codigo);

    // Confere que o valor realmente ficou: se o React rejeitou, nao adianta
    // dar Enter e dizer que deu certo.
    if (campo.value !== codigo) {
      return { ok: false, motivo: `o campo ficou com "${campo.value}"` };
    }

    const t1 = Date.now();
    apertarEnter(campo);
    const detalhe = await esperarProcessar(campo, codigo);
    const tProcesso = Date.now() - t1;
    const total = Date.now() - t0;

    console.log(`[GC Colador] ${codigo}  total ${total}ms` +
                `  (campo livre ${tCampo}ms + SPX ${tProcesso}ms)  ${detalhe}`);
    return { ok: true, ms: total };   // o SPX mostra na tela o erro dele, se houver
  }

  // Espera o SPX terminar de processar o codigo.
  //
  // O sinal confiavel e o campo TRAVAR e destravar. Antes esperavamos o valor
  // mudar, mas o SPX deixa o codigo escrito (so seleciona o texto pro proximo
  // bipe sobrescrever) - a condicao nunca acontecia e cada codigo comia os 15s
  // inteiros de timeout.
  async function esperarProcessar(campo, codigo) {
    const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
    const olhar = () => acharCampo() || campo;

    // O SPX nao trava o campo nem limpa o valor: ele SELECIONA o texto, pro
    // proximo bipe sobrescrever. Essa selecao e o sinal de que terminou, e
    // chega em poucos centenas de ms. Antes esperavamos uma trava que nunca
    // vinha e cada codigo levava ~1,9s de espera vazia.
    const selecionou = (a) =>
      a.value === codigo && a.selectionStart === 0 && a.selectionEnd === codigo.length;

    let travou = false;
    const limite = Date.now() + ESPERA_MAX_MS;
    while (Date.now() < limite) {
      await dorme(20);
      const atual = olhar();
      if (atual.disabled) { travou = true; break; }
      if (atual.value !== codigo) return 'campo limpou';
      try {
        if (selecionou(atual)) return 'texto selecionado';
      } catch (e) { /* selectionStart nao existe em todo tipo de input */ }
    }

    // Se travou, a espera passa a ser do SPX de verdade - aí vale esperar.
    if (!travou) return `sem sinal em ${ESPERA_MAX_MS}ms`;
    const limiteFim = Date.now() + 15000;
    while (Date.now() < limiteFim) {
      await dorme(20);
      if (!olhar().disabled) return 'destravou';
    }
    return 'ESTOUROU 15s travado';
  }

  // --- a AT vinda do interceptador --------------------------------------
  // O interceptador roda no mundo da pagina e nao alcanca o WebSocket daqui;
  // postMessage e a unica ponte entre os dois mundos.
  //
  // A AT ESPERA o colador voltar. Antes ela era jogada fora quando o socket nao
  // estava aberto, e era exatamente o que acontecia: a conexao cai e reconecta
  // a cada poucos segundos, e a AT nasce num desses buracos - capturada no
  // console, perdida no caminho. Reenviar e seguro: o UPDATE no Neon so grava
  // se at_numero ainda estiver vazio.
  const atsPendentes = [];
  const MAX_PENDENTES = 200;   // teto de memoria; o normal e ficar em zero

  function mandarAt(codigo, at) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify({ tipo: 'at', codigo, at }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function guardarAt(codigo, at) {
    if (atsPendentes.some(p => p.codigo === codigo && p.at === at)) return;
    atsPendentes.push({ codigo, at });
    if (atsPendentes.length > MAX_PENDENTES) atsPendentes.shift();
    console.log(`[GC Colador] AT na espera do colador (${atsPendentes.length}):`, codigo, at);
  }

  function drenarAts() {
    while (atsPendentes.length) {
      const p = atsPendentes[0];
      if (!mandarAt(p.codigo, p.at)) return;   // caiu de novo: fica pra proxima
      atsPendentes.shift();
      console.log('[GC Colador] AT atrasada entregue:', p.codigo, p.at);
    }
  }

  window.addEventListener('message', (evento) => {
    if (evento.source !== window) return;
    if (evento.origin !== location.origin) return;
    const d = evento.data;
    if (!d || d.__gcColadorAt !== true) return;
    if (!mandarAt(d.codigo, d.at)) guardarAt(d.codigo, d.at);
  });

  // --- conexao com o Python --------------------------------------------
  // Tenta uma porta: resolve com o socket se o colador aceitar esta pagina,
  // ou com null se recusar / nao houver ninguem ouvindo.
  function tentarPorta(porta) {
    return new Promise((resolve) => {
      let socket;
      try {
        socket = new WebSocket(`ws://127.0.0.1:${porta}`);
      } catch (e) {
        return resolve(null);
      }

      const desistir = setTimeout(() => {
        try { socket.close(); } catch {}
        resolve(null);
      }, 2000);

      socket.onopen = () => {
        socket.send(JSON.stringify({ tipo: 'ola', pagina: location.href }));
      };

      socket.onmessage = (evento) => {
        let msg;
        try { msg = JSON.parse(evento.data); } catch { return; }

        if (msg.tipo === 'aceito') {
          clearTimeout(desistir);
          socket.onmessage = null;
          console.log(`[GC Colador] conectado na porta ${porta}` +
                      (msg.papel ? ` (${msg.papel})` : ''));
          return resolve(socket);
        }
        if (msg.tipo === 'recusado') {
          clearTimeout(desistir);
          try { socket.close(); } catch {}
          return resolve(null);
        }
      };

      socket.onerror = () => { clearTimeout(desistir); resolve(null); };
      socket.onclose = () => { clearTimeout(desistir); resolve(null); };
    });
  }

  function escutar(socket) {
    ws = socket;
    // O que ficou esperando durante a queda vai agora, antes de qualquer coisa.
    drenarAts();
    ws.onmessage = async (evento) => {
      let msg;
      try { msg = JSON.parse(evento.data); } catch { return; }

      if (msg.tipo === 'ping') {
        ws.send(JSON.stringify({ tipo: 'pong' }));
        return;
      }
      if (msg.tipo !== 'colar') return;

      try {
        const r = await colar(msg.codigo);
        ws.send(JSON.stringify(r.ok
          ? { tipo: 'ok', id: msg.id }
          : { tipo: 'erro', id: msg.id, motivo: r.motivo }));
      } catch (e) {
        ws.send(JSON.stringify({ tipo: 'erro', id: msg.id, motivo: String(e).slice(0, 80) }));
      }
    };
    ws.onclose = () => {
      ws = null;
      console.log('[GC Colador] colador desconectou');
      if (ligado) setTimeout(procurarColador, RECONECTAR_MS);
    };
    ws.onerror = () => { if (ws) ws.close(); };
  }

  async function procurarColador() {
    if (!ligado || ws) return;
    for (const porta of PORTAS) {
      const socket = await tentarPorta(porta);
      if (socket) return escutar(socket);
    }
    setTimeout(procurarColador, RECONECTAR_MS);
  }

  procurarColador();
})();
