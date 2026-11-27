// Fundo da XM - Coletas Loggi: o icone liga e desliga. Nada mais para configurar.
//   ligado    -> selo "ON" no icone
//   desligado -> sem selo
// O estado fica em chrome.storage.local "ligado" (padrao: ligado). A tela (coletas.js) ouve a
// mudanca na hora, sem precisar dar F5.

const COR = '#00BAFF';

async function mostrar(ligado) {
  await chrome.action.setBadgeText({ text: ligado ? 'ON' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: COR });
  await chrome.action.setTitle({ title: `XM - Coletas Loggi: ${ligado ? 'ligado (clique para desligar)' : 'desligado (clique para ligar)'}` });
}

async function estado() {
  const { ligado } = await chrome.storage.local.get('ligado');
  return ligado !== false;
}

chrome.action.onClicked.addListener(async () => {
  const novo = !(await estado());
  await chrome.storage.local.set({ ligado: novo });
  await mostrar(novo);
});

chrome.runtime.onInstalled.addListener(async () => mostrar(await estado()));
chrome.runtime.onStartup.addListener(async () => mostrar(await estado()));
