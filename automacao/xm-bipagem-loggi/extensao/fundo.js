// Envia o registro dos bipes ao sistema (tabela loggi_bipagem_registros).
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
  } catch {
    // Sem internet, servidor dormindo ou sessao vencida: fica na fila para a proxima.
  } finally {
    enviando = false;
  }
}

chrome.runtime.onMessage.addListener((pedido) => {
  if (pedido && pedido.tipo === 'bipes' && Array.isArray(pedido.itens)) {
    enfileirar(pedido.itens).then(enviar);
  }
});

chrome.storage.onChanged.addListener((mudou, area) => {
  if (area === 'session' && mudou.token && mudou.token.newValue) enviar();
});

chrome.alarms.create('xm-bipagem-enviar', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(enviar);
chrome.runtime.onStartup.addListener(enviar);
