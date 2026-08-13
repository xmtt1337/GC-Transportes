// Content script só entra em página carregada DEPOIS da instalação. Sem isso,
// quem já estava com o SPX aberto instala a extensão e nada acontece, sem
// nenhum erro na tela — some só depois de um F5 que ninguém adivinha.
// Aqui a gente injeta na mão nas abas do SPX que já estiverem abertas.

async function injetarNasAbasAbertas() {
  const abas = await chrome.tabs.query({ url: 'https://spx.shopee.com.br/*' });
  for (const aba of abas) {
    try {
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

chrome.runtime.onInstalled.addListener(injetarNasAbasAbertas);
chrome.runtime.onStartup.addListener(injetarNasAbasAbertas);
