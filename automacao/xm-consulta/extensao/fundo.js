// O icone abre ou minimiza o menu flutuante na aba da transportadora. Sem aba
// aberta, abre o site e deixa o aviso para o menu nascer aberto.

const ANJUN = {
  abas: 'https://newsupplier.anjunexpress.com/*',
  url: 'https://newsupplier.anjunexpress.com/#/views/packageCenter/packageQuery',
};

chrome.action.onClicked.addListener(async () => {
  const [aba] = await chrome.tabs.query({ url: ANJUN.abas });
  if (!aba) {
    await chrome.storage.local.set({ abrirMenu: true });
    await chrome.tabs.create({ url: ANJUN.url });
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
