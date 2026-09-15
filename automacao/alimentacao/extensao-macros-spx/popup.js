'use strict';

const estado = document.getElementById('estado');

function dizer(texto, ruim) {
  estado.textContent = texto;
  estado.classList.toggle('ruim', !!ruim);
}

async function abaDoSpx() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba || !/^https:\/\/spx\.shopee\.com\.br\//.test(aba.url || '')) return null;
  return aba;
}

async function mandar(xmMacro) {
  const aba = await abaDoSpx();
  if (!aba) { dizer('abra a aba do SPX primeiro', true); return null; }
  try {
    return await chrome.tabs.sendMessage(aba.id, { xmMacro });
  } catch (e) {
    // Erro sempre igual: a aba estava aberta antes da extensao entrar.
    dizer('dê F5 na aba do SPX e tente de novo', true);
    return null;
  }
}

document.getElementById('rodar').addEventListener('click', async () => {
  dizer('');
  const r = await mandar('alimentacao');
  if (r && r.ok) { dizer('rodando — veja na tela do SPX'); setTimeout(() => window.close(), 900); }
});

document.getElementById('diagnostico').addEventListener('click', async () => {
  dizer('');
  const r = await mandar('diagnostico');
  if (!r || !r.texto) return;
  await navigator.clipboard.writeText(r.texto);
  dizer('copiado — é só colar');
});
