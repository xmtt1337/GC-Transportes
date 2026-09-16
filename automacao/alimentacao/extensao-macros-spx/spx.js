// Ferramentas pra mexer na tela do SPX.
//
// Tudo aqui existe por um motivo so: a tela e React e nao tem id, name nem
// classe estavel em quase nada. Sobra o texto que o usuario le - e ate isso
// muda de lingua. Entao: acha por texto normalizado, clica como o mouse
// clicaria, e confere o resultado antes de seguir.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;

  class Parado extends Error {}

  const spx = {
    Parado,
    parar: false,
  };

  // ── esperar ────────────────────────────────────────────────────────────
  function dormir(ms) {
    return new Promise((resolve, reject) => {
      setTimeout(() => (spx.parar ? reject(new Parado('parado por voce')) : resolve()), ms);
    });
  }

  // Espera algo virar verdade. Devolve o valor - assim quem chama ja usa o
  // elemento que a condicao achou, sem procurar de novo e correr o risco de
  // pegar outro depois de um re-render.
  async function esperar(condicao, opcoes) {
    const o = opcoes || {};
    const limite = o.limite || 15000;
    const intervalo = o.intervalo || 200;
    const fim = Date.now() + limite;
    for (;;) {
      let valor = null;
      try { valor = await condicao(); } catch (e) { if (e instanceof Parado) throw e; }
      if (valor) return valor;
      if (Date.now() > fim) {
        throw new Error(`nao apareceu a tempo: ${o.oque || 'condicao'} (${Math.round(limite / 1000)}s)`);
      }
      await dormir(intervalo);
    }
  }

  // ── achar ──────────────────────────────────────────────────────────────
  // checkVisibility olha a linhagem inteira; a conta na mao so olhava o
  // proprio elemento. A diferenca apareceu no menu do SPX: o popup fechado
  // continua no DOM, com caixa e tudo, e quem carrega o "escondido" e um pai.
  function visivel(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    if (!el.getClientRects().length) return false;
    const e = getComputedStyle(el);
    return e.visibility !== 'hidden' && e.opacity !== '0';
  }

  // So olha o proprio elemento e os dois pais mais proximos: um `closest` solto
  // sobe a arvore inteira e ai qualquer container com "disabled" no nome faz o
  // botao liberado parecer travado.
  function desabilitado(el) {
    if (!el) return true;
    let n = el;
    for (let i = 0; i < 3 && n; i++, n = n.parentElement) {
      if (n.disabled) return true;
      if (n.getAttribute && n.getAttribute('aria-disabled') === 'true') return true;
      const classe = typeof n.className === 'string' ? n.className : '';
      if (/disabled/i.test(classe)) return true;
    }
    return false;
  }

  // Elementos-folha com exatamente este texto. Folha porque qualquer caixa
  // grande "contem" o texto tambem, e clicar na caixa grande nao faz nada.
  function folhasComTexto(texto, dentro) {
    const alvo = L.chave(texto);
    const saida = [];
    for (const el of (dentro || document).querySelectorAll('*')) {
      if (el.children.length) continue;
      if (L.chave(el.textContent) === alvo) saida.push(el);
    }
    return saida;
  }

  function folhaVisivelComTexto(texto, dentro) {
    return folhasComTexto(texto, dentro).find(visivel) || null;
  }

  const CLICAVEIS = 'button, [role="button"], a, [class*="btn"], [class*="button"], li, [role="menuitem"], [class*="item"]';

  // O menor clicavel visivel cujo texto bate. Menor porque o botao verdadeiro
  // esta sempre dentro de uma barra que tambem "contem" aquele texto.
  function acharBotao(texto, opcoes) {
    const o = opcoes || {};
    const alvo = L.chave(texto);
    const achados = [];
    for (const el of (o.dentro || document).querySelectorAll(CLICAVEIS)) {
      if (!visivel(el)) continue;
      const t = L.chave(el.textContent);
      if (o.comeca ? t.startsWith(alvo) : t === alvo) achados.push(el);
    }
    achados.sort((a, b) => L.normalizar(a.textContent).length - L.normalizar(b.textContent).length);
    return achados[0] || null;
  }

  // ── agir ───────────────────────────────────────────────────────────────
  function clicar(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* nao impede o clique */ }
    const r = el.getBoundingClientRect();
    const onde = {
      bubbles: true, cancelable: true, composed: true, button: 0,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    };
    // A sequencia inteira, e nao so o click: parte dos componentes do SPX
    // (o abre-menu do cabecalho, por exemplo) reage no mousedown e ignora
    // um click solto.
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      const Evento = tipo.startsWith('pointer') && raiz.PointerEvent ? raiz.PointerEvent : MouseEvent;
      el.dispatchEvent(new Evento(tipo, onde));
    }
    // .click() nativo quando existe: e o que dispara o download de um <a>.
    // SVG nao tem .click(), dai o evento sintetico.
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', onde));
    return true;
  }

  // Passar o mouse por cima, sem clicar.
  //
  // Existe porque nem todo menu abre no clique: dropdown desse tipo costuma
  // abrir no HOVER, e ai o clique sozinho nao faz nada - o menu nunca aparece
  // e o macro conclui que o item nao existe.
  function passarMouse(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const onde = {
      bubbles: true, cancelable: true, composed: true,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
    };
    for (const tipo of ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'mousemove']) {
      const Evento = tipo.startsWith('pointer') && raiz.PointerEvent ? raiz.PointerEvent : MouseEvent;
      // enter nao borbulha de verdade; mandar com bubbles false imita melhor
      const opcoes = tipo.endsWith('enter') ? { ...onde, bubbles: false } : onde;
      el.dispatchEvent(new Evento(tipo, opcoes));
    }
    return true;
  }

  // Escrever de um jeito que o React enxergue: mexer no .value direto nao
  // avisa o estado dele, e o valor some no proximo render.
  function escrever(campo, texto) {
    const proto = campo.tagName === 'TEXTAREA'
      ? raiz.HTMLTextAreaElement.prototype
      : raiz.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    campo.focus();
    setter.call(campo, '');
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(campo, texto);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function tecla(el, nome, codigo) {
    for (const tipo of ['keydown', 'keypress', 'keyup']) {
      (el || document.activeElement || document.body).dispatchEvent(new KeyboardEvent(tipo, {
        key: nome, code: nome, keyCode: codigo, which: codigo,
        bubbles: true, cancelable: true,
      }));
    }
  }

  const apertarEnter = (el) => tecla(el, 'Enter', 13);
  const apertarEsc = (el) => tecla(el, 'Escape', 27);

  // ── rede ───────────────────────────────────────────────────────────────
  // rede.js (mundo da pagina) conta as chamadas em voo e avisa por postMessage.
  // Sem isso, cada espera vira um sleep chutado: curto demais clica na tabela
  // velha, longo demais faz o macro levar o dobro do tempo.
  const rede = { ativas: 0, viu: false, mudou: Date.now() };

  // Quantas vezes o navegador barrou a janela do download, e se rede.js
  // conseguiu contornar. Sem esse recado o macro dizia "baixado" com a pasta
  // de downloads vazia.
  const download = { bloqueados: 0, contornados: 0 };

  raiz.addEventListener('message', (evento) => {
    if (evento.source !== raiz) return;
    const d = evento.data;
    if (!d) return;
    if (d.__xmMacroDownload === true) {
      download.bloqueados++;
      if (d.contornado) download.contornados++;
      return;
    }
    if (d.__xmMacroRede !== true) return;
    rede.ativas = d.ativas;
    rede.viu = true;
    rede.mudou = Date.now();
  });

  // Espera as chamadas voltarem ao nivel de antes da acao.
  //
  // "Ao nivel de antes", e nao "a zero": o SPX deixa chamada pendurada (fica
  // esperando aviso do servidor). Exigir zero faria toda espera bater no limite
  // e o macro levar minutos a mais em cada passo.
  async function esperarRede(opcoes) {
    const o = opcoes || {};
    const calma = o.calma || 700;
    const limite = o.limite || 60000;
    const base = o.base || 0;
    // Sem o espiao (mundo MAIN bloqueado, pagina antiga) sobra o relogio.
    if (!rede.viu) { await dormir(o.semEspiao || 2500); return; }
    const fim = Date.now() + limite;
    let calmoDesde = null;
    for (;;) {
      if (rede.ativas <= base) {
        if (calmoDesde === null) calmoDesde = Date.now();
        if (Date.now() - calmoDesde >= calma) return;
      } else {
        calmoDesde = null;
      }
      if (Date.now() > fim) return;
      await dormir(120);
    }
  }

  // ── ir pra tela certa ──────────────────────────────────────────────────
  // Troca so o hash, sem recarregar a pagina. Um F5 de verdade mataria o macro
  // no meio: o content script e recarregado junto e o que estava rodando some.
  //
  // Quem diz que chegou NAO e a URL, e sim achar na tela um elemento que so
  // existe la. URL de SPA muda na hora; o conteudo demora - e agir no meio do
  // caminho e clicar no que ainda esta na tela anterior.
  async function irParaTela(hashAlvo, reconhecer, nomeDaTela) {
    if (!/(^|\.)spx\.shopee\.com\.br$/i.test(raiz.location.hostname)) {
      throw new Error('esta aba não é do SPX');
    }
    const jaEstava = !!reconhecer();
    if (!jaEstava) {
      const base = rede.ativas;
      raiz.location.hash = hashAlvo;
      await dormir(1200);
      await esperarRede({ base, limite: 60000 });
    }
    await esperar(reconhecer, {
      oque: `a tela ${nomeDaTela} carregar`, limite: 45000, intervalo: 400 });
    return !jaEstava;
  }

  Object.assign(spx, {
    dormir, esperar, visivel, desabilitado, irParaTela,
    folhasComTexto, folhaVisivelComTexto, acharBotao,
    clicar, passarMouse, escrever, apertarEnter, apertarEsc, tecla,
    rede, esperarRede, download,
  });

  G.spx = spx;
})(typeof window !== 'undefined' ? window : globalThis);
