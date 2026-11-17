// Envia o registro dos bipes ao sistema (tabela loggi_bipagem_registros) e diz ao site se
// ha login (no arco.loggi.com, sem login a tela fica travada; o menu.js pergunta aqui).
//
// Fica aqui, e nao no menu.js, porque o token mora em storage.session, que os scripts do
// site nao alcancam. O bipe entra numa fila no storage.local e sai em lote; sem internet
// ou sem login, espera e tenta de novo (a cada minuto, e logo depois do login). Cada bipe
// tem um id proprio: reenviar nao grava duas vezes.

importScripts('regras.js');

const R = self.XMBipagem;
const LOTE = 100;
const FILA_MAX = 5000;
let enviando = false;

async function enfileirar(itens) {
  const { fila = [] } = await chrome.storage.local.get('fila');
  await chrome.storage.local.set({ fila: [...fila, ...itens].slice(-FILA_MAX) });
}

async function enviar() {
  if (enviando) return;
  enviando = true;
  try {
    const { token } = await chrome.storage.session.get('token');
    if (!token) return;
    for (;;) {
      const { fila = [] } = await chrome.storage.local.get('fila');
      if (!fila.length) return;
      const lote = fila.slice(0, LOTE);
      await R.api(token, 'POST', '/bipes', { bipes: lote });
      const ids = new Set(lote.map((b) => b.id));
      const { fila: atual = [] } = await chrome.storage.local.get('fila');
      await chrome.storage.local.set({ fila: atual.filter((b) => !ids.has(b.id)) });
    }
  } catch (e) {
    // Sem internet ou servidor dormindo: fica na fila para a proxima. Sessao vencida: sai do
    // login (a fila espera o proximo), e a tela da Loggi volta a travar.
    if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome']);
  } finally {
    enviando = false;
  }
}

// Agrupamento do dia: le o relatorio Na base sem baixar. O link do "Baixar relatorio" do Arco
// traz o token da conta Loggi na URL: ele e usado so nesta busca, nunca guardado nem enviado
// ao sistema. Do CSV so sai codigo, ID, cidade, prazo, chegou em e status (o sistema escolhe
// os que chegaram hoje e estao "Sem tentativa").
const linkDoRelatorio = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'loggi.com' || u.hostname.endsWith('.loggi.com'))
      && /\/packages\/report/.test(u.pathname);
  } catch { return false; }
};

async function lerNaBase(url, base) {
  const { token } = await chrome.storage.session.get('token');
  if (!token) throw new Error('Entre na extensão primeiro.');
  if (!linkDoRelatorio(url)) throw new Error('O link do relatório não é o da Loggi.');
  let texto;
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error();
    texto = await r.text();
  } catch {
    throw new Error('A Loggi não entregou o relatório. Dê F5 no Arco e tente de novo.');
  }
  const pacotes = R.linhasNaBase(texto);
  try {
    return await R.api(token, 'POST', '/na-base', { base, pacotes });
  } catch (e) {
    if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome']);
    throw e;
  }
}

// Conferencia Anjun: os pacotes de hoje (ja enxutos pelo anjun.js) vao ao sistema.
async function lerAnjun(pacotes) {
  const { token } = await chrome.storage.session.get('token');
  if (!token) throw new Error('Entre na extensão primeiro.');
  try {
    return await R.api(token, 'POST', '/macros/anjun-conferencia/leitura', { pacotes }, fetch, true);
  } catch (e) {
    if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome']);
    throw e;
  }
}

chrome.runtime.onMessage.addListener((pedido, _quem, responder) => {
  if (pedido && pedido.tipo === 'anjunLeitura' && Array.isArray(pedido.pacotes)) {
    lerAnjun(pedido.pacotes)
      .then((resumo) => responder({ resumo }))
      .catch((e) => responder({ erro: e.message || 'Não deu certo.' }));
    return true;
  }
  if (pedido && pedido.tipo === 'naBase') {
    lerNaBase(String(pedido.url || ''), String(pedido.base || ''))
      .then((resumo) => responder({ resumo }))
      .catch((e) => responder({ erro: e.message || 'Não deu certo.' }));
    return true;
  }
  if (pedido && pedido.tipo === 'bipes' && Array.isArray(pedido.itens)) {
    enfileirar(pedido.itens).then(enviar);
  }
  // So sim ou nao: o token nunca sai daqui para a pagina.
  if (pedido && pedido.tipo === 'estado') {
    chrome.storage.session.get(['token', 'nome']).then((s) => responder({ logado: !!s.token, nome: s.nome || '' }));
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((mudou, area) => {
  if (area === 'session' && mudou.token && mudou.token.newValue) enviar();
});

chrome.alarms.create('xm-bipagem-enviar', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(enviar);
chrome.runtime.onStartup.addListener(enviar);
