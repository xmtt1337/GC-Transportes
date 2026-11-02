// O icone do Chrome. Na aba de uma transportadora, abre ou minimiza o menu ali.
// Em qualquer outra, pergunta em qual ir, em vez de escolher pelo usuario.

const X = self.XMConsulta;
const ativas = X.TRANSPORTADORAS.filter((t) => t.ativa);

async function pedirMenu(aba, tipo) {
  try {
    await chrome.tabs.sendMessage(aba.id, { tipo });
  } catch {
    // Aba aberta antes de instalar a extensao: so entra script depois de recarregar.
    await chrome.storage.local.set({ abrirMenu: true });
    await chrome.tabs.reload(aba.id);
  }
}

async function ir(t) {
  const [aba] = await chrome.tabs.query({ url: t.abas });
  if (!aba) {
    await chrome.storage.local.set({ abrirMenu: true });
    await chrome.tabs.create({ url: t.url });
  } else {
    await chrome.tabs.update(aba.id, { active: true });
    await chrome.windows.update(aba.windowId, { focused: true });
    await pedirMenu(aba, 'abrir');
  }
  window.close();
}

async function comecar() {
  const [aqui] = await chrome.tabs.query({ url: ativas.map((t) => t.abas), active: true, currentWindow: true });
  if (aqui) {
    await pedirMenu(aqui, 'alternar');
    window.close();
    return;
  }
  for (const t of X.TRANSPORTADORAS) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = t.ativa ? t.nome : `${t.nome} (em breve)`;
    botao.disabled = !t.ativa;
    botao.addEventListener('click', () => ir(t));
    document.getElementById('lista').append(botao);
  }
  document.getElementById('lista').hidden = false;
}

comecar();
