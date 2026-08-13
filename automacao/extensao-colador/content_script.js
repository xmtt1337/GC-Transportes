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

  // O campo do SPX nao tem id, name nem classe: o placeholder e o que sobra.
  // Se a Shopee mudar esse texto, e aqui que quebra primeiro.
  const SELETORES = [
    'input[placeholder="Por favor, insira"]',
    'input[placeholder*="insira"]',
    'input[placeholder*="rastreamento"]',
  ];

  let ws = null;
  let ligado = true;

  // --- achar o campo ----------------------------------------------------
  function acharCampo() {
    for (const sel of SELETORES) {
      // Ignora o que esta escondido: o SPX mantem campos de abas inativas no DOM.
      for (const el of document.querySelectorAll(sel)) {
        if (el.offsetParent !== null || el === document.activeElement) return el;
      }
    }
    return null;
  }

  // O SPX desabilita o campo enquanto processa o codigo anterior. Escrever
  // nesse intervalo joga o codigo fora - por isso esperamos ele voltar.
  function esperarCampoLivre(limiteMs = 15000) {
    return new Promise((resolve) => {
      const fim = Date.now() + limiteMs;
      (function tentar() {
        const campo = acharCampo();
        if (campo && !campo.disabled && !campo.readOnly) return resolve(campo);
        if (Date.now() > fim) return resolve(null);
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
    const campo = await esperarCampoLivre();
    if (!campo) return { ok: false, motivo: 'campo nao encontrado ou preso desabilitado' };

    escrever(campo, codigo);

    // Confere que o valor realmente ficou: se o React rejeitou, nao adianta
    // dar Enter e dizer que deu certo.
    if (campo.value !== codigo) {
      return { ok: false, motivo: `o campo ficou com "${campo.value}"` };
    }

    apertarEnter(campo);

    // Espera o SPX processar. Ele desabilita o campo enquanto trabalha; quando
    // reabilita (ou quando limpa o valor), terminou.
    const fim = Date.now() + 15000;
    while (Date.now() < fim) {
      await new Promise(r => setTimeout(r, 100));
      const atual = acharCampo();
      if (!atual) break;
      if (!atual.disabled && atual.value !== codigo) return { ok: true };
    }
    return { ok: true };   // seguiu em frente; o SPX mostra o erro dele na tela
  }

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
