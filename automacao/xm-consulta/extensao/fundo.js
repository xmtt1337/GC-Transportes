// O icone abre ou minimiza o menu flutuante na aba da transportadora: a que esta
// na frente, se for uma delas. Sem nenhuma aberta, abre a Anjun e deixa o aviso
// para o menu nascer aberto.

const ABAS = ['https://newsupplier.anjunexpress.com/*', 'https://spx.shopee.com.br/*'];
const PADRAO = 'https://newsupplier.anjunexpress.com/#/views/packageCenter/packageQuery';

chrome.action.onClicked.addListener(async () => {
  const [frente] = await chrome.tabs.query({ url: ABAS, active: true, currentWindow: true });
  const [qualquer] = await chrome.tabs.query({ url: ABAS });
  const aba = frente || qualquer;
  if (!aba) {
    await chrome.storage.local.set({ abrirMenu: true });
    await chrome.tabs.create({ url: PADRAO });
    return;
  }
  await chrome.tabs.update(aba.id, { active: true });
  await chrome.windows.update(aba.windowId, { focused: true });
  try {
    await chrome.tabs.sendMessage(aba.id, { tipo: 'alternar' });
  } catch {
    // Aba aberta antes de instalar a extensao: so entra script depois de recarregar.
    await chrome.storage.local.set({ abrirMenu: true });
    await chrome.tabs.reload(aba.id);
  }
});
