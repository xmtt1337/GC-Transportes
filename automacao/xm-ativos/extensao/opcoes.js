// Configuração da XM - Ativos (página de opções da extensão; por enquanto, só os menus do SPX).
// Liga e desliga os menus que a extensão põe no SPX. Fica em chrome.storage.local ("menus"); o
// ativos.js ouve a mudança e mostra ou esconde na hora, sem F5. Sem nada salvo, tudo aparece.

const PADRAO = { disparar: true, conversas: true, aviso: true };
let tempoSalvo = null;

async function carregar() {
  const { menus } = await chrome.storage.local.get('menus');
  const atual = { ...PADRAO, ...(menus || {}) };
  document.querySelectorAll('input[data-menu]').forEach((c) => { c.checked = atual[c.dataset.menu] !== false; });
}

async function salvar() {
  const menus = {};
  document.querySelectorAll('input[data-menu]').forEach((c) => { menus[c.dataset.menu] = c.checked; });
  await chrome.storage.local.set({ menus });
  const aviso = document.getElementById('salvo');
  aviso.textContent = 'Salvo. Já vale no SPX aberto.';
  clearTimeout(tempoSalvo);
  tempoSalvo = setTimeout(() => { aviso.textContent = ''; }, 2500);
}

document.querySelectorAll('input[data-menu]').forEach((c) => c.addEventListener('change', salvar));
carregar();
