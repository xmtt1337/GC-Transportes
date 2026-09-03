// Content script só entra em página carregada DEPOIS da instalação. Sem isso,
// quem já estava com o SPX aberto instala a extensão e nada acontece, sem
// nenhum erro na tela — some só depois de um F5 que ninguém adivinha.
// Aqui a gente injeta na mão nas abas do SPX que já estiverem abertas.

const SPX = 'https://spx.shopee.com.br/*';

async function injetarNasAbasAbertas() {
  const abas = await chrome.tabs.query({ url: SPX });
  for (const aba of abas) {
    protegerDoDescarte(aba.id);
    try {
      // O interceptador vai no mundo da pagina; o content_script no isolado.
      // Injetar so um dos dois deixa a captura da AT pela metade.
      await chrome.scripting.executeScript({
        target: { tabId: aba.id },
        files: ['interceptador.js'],
        world: 'MAIN',
      });
      await chrome.scripting.executeScript({
        target: { tabId: aba.id },
        files: ['content_script.js'],
      });
      console.log('[GC Colador] injetado na aba', aba.id);
    } catch (e) {
      // Aba em tela de erro ou ainda carregando: o content_script normal pega depois.
      console.log('[GC Colador] não deu pra injetar na aba', aba.id, e.message);
    }
  }
}

// O Chrome descarta aba de segundo plano pra liberar memória (Economia de
// memória). Quando isso acontece a página inteira morre - o content script
// vai junto, o WebSocket cai e o colador fica sem aba no meio da madrugada,
// sem ninguém pra clicar na aba e trazer ela de volta. Marcar a aba como
// autoDiscardable=false é o que impede o descarte.
function protegerDoDescarte(tabId) {
  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
}

// Prevenir é o principal, mas se a aba for descartada mesmo assim (falta de
// memória de verdade, o Chrome descarta apesar da marca), recarregar traz o
// content script de volta sozinho. Sem isso a aba fica morta ate alguem
// clicar nela.
function recuperarSeDescartada(tabId, aba) {
  if (!aba || !aba.discarded) return;
  console.log('[GC Colador] aba', tabId, 'foi descartada - recarregando');
  chrome.tabs.reload(tabId).catch(() => {});
}

chrome.runtime.onInstalled.addListener(injetarNasAbasAbertas);
chrome.runtime.onStartup.addListener(injetarNasAbasAbertas);

chrome.tabs.onUpdated.addListener((tabId, mudou, aba) => {
  if (!aba.url || !aba.url.startsWith('https://spx.shopee.com.br/')) return;
  if (mudou.discarded !== undefined) return recuperarSeDescartada(tabId, aba);
  if (aba.autoDiscardable !== false) protegerDoDescarte(tabId);
});
