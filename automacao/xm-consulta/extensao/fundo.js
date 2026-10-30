// O elo entre o programa XM Consulta (127.0.0.1) e a aba da transportadora.
//
// Mora no service worker, nao na aba: assim a conexao nao depende de a pagina
// estar aberta (quem abre a aba e este arquivo) e nao passa pela origem do site.
//
// A porta local e alcancavel por qualquer programa da maquina, entao os dois
// lados provam que conhecem a chave ANTES de qualquer codigo ou contato passar:
//   programa -> {tipo:"desafio", nonce}
//   extensao -> {tipo:"ola", nonce, prova}   prova = HMAC(chave, "cliente|n1|n2")
//   programa -> {tipo:"aceito", prova}       prova = HMAC(chave, "servidor|n1|n2")
// A chave em si nunca viaja. Sem "aceito" valido a extensao nao atende nada.

const PORTA = 49741;
const ESPERA_ABA_MS = 20000;

const TRANSPORTADORAS = {
  anjun: {
    abas: 'https://newsupplier.anjunexpress.com/*',
    url: 'https://newsupplier.anjunexpress.com/#/views/packageCenter/packageQuery',
  },
};

let conexao = null;
let autenticado = false;
let chaveAtual = null;
let desafio = null;

async function assinar(chave, texto) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', k, enc.encode(texto));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function nonceNovo() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function perguntarAba(idAba, pedido) {
  try {
    return await chrome.tabs.sendMessage(idAba, pedido);
  } catch {
    return null; // aba sem o content script: aberta antes de instalar a extensao
  }
}

async function abaPronta(t) {
  const abas = await chrome.tabs.query({ url: t.abas });
  for (const aba of abas) {
    const status = await perguntarAba(aba.id, { tipo: 'status' });
    if (status && status.pronto) return aba.id;
  }
  return null;
}

async function preparar(transportadora) {
  const t = TRANSPORTADORAS[transportadora];
  if (!t) return { ok: false, erro: 'Transportadora ainda nao disponivel.' };

  let id = await abaPronta(t);
  if (id !== null) return { ok: true };

  const abertas = await chrome.tabs.query({ url: t.abas });
  if (!abertas.length) await chrome.tabs.create({ url: t.url, active: true });

  const limite = Date.now() + ESPERA_ABA_MS;
  while (Date.now() < limite) {
    await esperar(500);
    id = await abaPronta(t);
    if (id !== null) return { ok: true };
  }
  return {
    ok: false,
    erro: 'A aba nao esta pronta. Entre no site, atualize com F5, clique em Buscar e tente de novo.',
  };
}

async function consultar(transportadora, codigo) {
  const t = TRANSPORTADORAS[transportadora];
  if (!t) return { ok: false, erro: 'Transportadora ainda nao disponivel.' };
  const id = await abaPronta(t);
  if (id === null) return { ok: false, erro: 'A aba da transportadora fechou ou perdeu a sessao.' };
  const r = await perguntarAba(id, { tipo: 'consultar', codigo });
  return r || { ok: false, erro: 'A aba nao respondeu.' };
}

async function tratar(ws, msg) {
  if (msg.tipo === 'desafio') {
    desafio = { servidor: String(msg.nonce), cliente: nonceNovo() };
    const prova = await assinar(chaveAtual, `cliente|${desafio.servidor}|${desafio.cliente}`);
    ws.send(JSON.stringify({ tipo: 'ola', nonce: desafio.cliente, prova }));
    return;
  }
  if (msg.tipo === 'aceito') {
    const esperada = desafio
      ? await assinar(chaveAtual, `servidor|${desafio.servidor}|${desafio.cliente}`)
      : null;
    if (!esperada || msg.prova !== esperada) return ws.close();
    autenticado = true;
    return;
  }
  if (!autenticado) return ws.close();

  if (msg.tipo === 'ping') {
    ws.send(JSON.stringify({ tipo: 'pong' }));
  } else if (msg.tipo === 'preparar') {
    ws.send(JSON.stringify({ id: msg.id, ...(await preparar(msg.transportadora)) }));
  } else if (msg.tipo === 'consultar') {
    ws.send(JSON.stringify({ id: msg.id, ...(await consultar(msg.transportadora, msg.codigo)) }));
  }
}

async function conectar() {
  if (conexao && conexao.readyState <= 1) return;
  const { chave } = await chrome.storage.local.get('chave');
  if (!chave) return;
  chaveAtual = chave;
  autenticado = false;
  desafio = null;

  const ws = new WebSocket(`ws://127.0.0.1:${PORTA}`);
  conexao = ws;
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return ws.close();
    }
    tratar(ws, msg).catch(() => ws.close());
  };
  ws.onclose = () => {
    if (conexao === ws) {
      conexao = null;
      autenticado = false;
    }
  };
  ws.onerror = () => {};
}

chrome.runtime.onInstalled.addListener(conectar);
chrome.runtime.onStartup.addListener(conectar);
chrome.alarms.create('xm-consulta-reconectar', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(conectar);
// Service worker dorme: abrir o site tambem acorda, sem esperar o proximo alarme.
chrome.tabs.onUpdated.addListener((_, mudou) => {
  if (mudou.status === 'loading') conectar();
});

chrome.storage.onChanged.addListener((mudou) => {
  if (!mudou.chave) return;
  if (conexao) conexao.close();
  conexao = null;
  conectar();
});

chrome.runtime.onMessage.addListener((pedido, _, responder) => {
  if (pedido.tipo !== 'estado') return false;
  conectar().finally(() => setTimeout(() => responder({ ligado: autenticado }), 400));
  return true;
});

conectar();
