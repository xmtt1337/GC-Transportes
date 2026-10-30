// O icone abre a tela numa aba, e nao num popup: popup fecha ao clicar fora, e
// isso mataria a consulta no meio. Aba ja aberta so volta para a frente.

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('pagina.html');
  const [aberta] = await chrome.tabs.query({ url });
  if (!aberta) {
    await chrome.tabs.create({ url });
    return;
  }
  await chrome.tabs.update(aberta.id, { active: true });
  await chrome.windows.update(aberta.windowId, { focused: true });
});
