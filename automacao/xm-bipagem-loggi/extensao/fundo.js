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

// Conferencia Shopee: o romaneio de hoje (BR do polo) e a leitura do SPX vao e vem do sistema.
async function chamarSistema(metodo, caminho, corpo) {
  const { token } = await chrome.storage.session.get('token');
  if (!token) throw new Error('Entre na extensão primeiro.');
  try {
    return await R.api(token, metodo, caminho, corpo, fetch, true);
  } catch (e) {
    if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome']);
    throw e;
  }
}
// Export de pedidos do SPX: o link assinado aponta para o servidor de arquivos da Shopee
// (*.susercontent.com). Só esse endereço é aceito; o arquivo é lido aqui e não vai para os Downloads.
// Do arquivo só sai, por BR, comprador, CEP, motorista e sort code (regras.js pedidosDoExport);
// ao sistema vão completos só os BR com divergência, e dos outros só o CEP.
async function lerExportPedidos(url, polo, divergentes) {
  let destino;
  try { destino = new URL(url); } catch { throw new Error('Link do export inválido.'); }
  if (destino.protocol !== 'https:' || !/\.susercontent\.com$/.test(destino.hostname)) throw new Error('Link do export fora da Shopee.');
  const r = await fetch(destino.href);
  if (!r.ok) throw new Error(`Não deu para baixar o export do SPX (HTTP ${r.status}).`);
  const todos = R.pedidosDoExport(await r.text());
  const quer = new Set(divergentes.map((c) => String(c).toUpperCase()));
  const pedidos = todos.filter((p) => quer.has(p.codigo)); // sem divergência, nenhum: só os CEPs
  const ceps = todos.filter((p) => p.cep).map((p) => ({ codigo: p.codigo, cep: p.cep }));
  return chamarSistema('POST', comPolo('/macros/shopee-conferencia/pedidos', polo), { pedidos, ceps });
}

const comPolo = (caminho, polo) => (polo ? `${caminho}?polo=${encodeURIComponent(polo)}` : caminho);

chrome.runtime.onMessage.addListener((pedido, _quem, responder) => {
  if (pedido && pedido.tipo === 'shopeeRomaneio') {
    chamarSistema('GET', comPolo('/macros/shopee-conferencia/romaneio', pedido.polo))
      .then((r) => responder({ codigos: r.codigos || [], consultar: r.consultar || r.codigos || [] }))
      .catch((e) => responder({ erro: e.message || 'Não deu certo.' }));
    return true;
  }
  if (pedido && pedido.tipo === 'shopeeLeitura' && Array.isArray(pedido.rastreio) && Array.isArray(pedido.ats)) {
    chamarSistema('POST', comPolo('/macros/shopee-conferencia/leitura', pedido.polo), { rastreio: pedido.rastreio, ats: pedido.ats })
      .then((resumo) => responder({ resumo }))
      .catch((e) => responder({ erro: e.message || 'Não deu certo.' }));
    return true;
  }
  if (pedido && pedido.tipo === 'shopeePedidos') {
    lerExportPedidos(String(pedido.url || ''), pedido.polo, Array.isArray(pedido.divergentes) ? pedido.divergentes : [])
      .then((resumo) => responder({ resumo }))
      .catch((e) => responder({ erro: e.message || 'Não deu certo.' }));
    return true;
  }
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
