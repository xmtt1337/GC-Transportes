const estado = document.getElementById('estado');
const campo = document.getElementById('chave');

async function atualizar() {
  const { chave } = await chrome.storage.local.get('chave');
  if (!chave) {
    estado.textContent = 'Cole a chave que aparece no programa XM Consulta.';
    return;
  }
  const r = await chrome.runtime.sendMessage({ tipo: 'estado' });
  estado.textContent = r && r.ligado ? 'Ligado ao programa.' : 'Programa fechado ou chave diferente.';
  estado.className = r && r.ligado ? 'ligado' : '';
}

document.getElementById('salvar').addEventListener('click', async () => {
  const chave = campo.value.trim();
  if (!chave) return;
  await chrome.storage.local.set({ chave });
  campo.value = '';
  setTimeout(atualizar, 500);
});

atualizar();
