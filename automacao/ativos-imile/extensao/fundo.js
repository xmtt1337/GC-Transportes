// XM - Ativos iMile: o que precisa da extensao (e nao da pagina do DS).
//
// - O token do sistema mora em storage.session, que a pagina do DS nao alcanca. A senha nunca e
//   guardada.
// - O disparo vai ao sistema (/macros/whatsapp/enviar), que manda pelo WABA e grava a conversa:
//   ela aparece no sistema como qualquer ativo.

importScripts('regras.js');

const R = self.XMAtivosImile;

async function token() {
  const { token: t } = await chrome.storage.session.get('token');
  if (!t) throw new R.ErroDeConta('Entre com sua conta do sistema.');
  return t;
}

async function chamarSistema(metodo, caminho, corpo) {
  try {
    return await R.api(await token(), metodo, caminho, corpo);
  } catch (e) {
    if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome', 'papel']);
    throw e;
  }
}

const tratar = {
  async estado() {
    const { token: t, nome, papel } = await chrome.storage.session.get(['token', 'nome', 'papel']);
    return { logado: !!t, nome: nome || '', papel: papel || (t ? R.papelDoToken(t) : '') };
  },
  async entrar({ usuario, senha }) {
    const { token: t, nome, papel } = await R.entrar(String(usuario || '').trim(), String(senha || ''));
    await chrome.storage.session.set({ token: t, nome, papel });
    return { logado: true, nome, papel };
  },
  async sair() {
    await chrome.storage.session.remove(['token', 'nome', 'papel']);
    return { logado: false };
  },
  // Quem já recebeu ativo (qualquer modelo, pelo número do pedido).
  async situacao({ pedidos }) {
    const lista = Array.isArray(pedidos) ? pedidos.slice(0, R.MAX_CODIGOS) : [];
    const estados = {};
    for (let i = 0; i < lista.length; i += 500) {
      const r = await chamarSistema('POST', R.ROTA_SITUACAO, { pedidos: lista.slice(i, i + 500) });
      Object.assign(estados, r.estados || {});
    }
    return { estados };
  },
  async enviar({ corpo }) {
    const r = await chamarSistema('POST', R.ROTA_ENVIAR, corpo);
    return { ok: true, id: r.id || null };
  },
};

chrome.runtime.onMessage.addListener((pedido, _quem, responder) => {
  const f = pedido && tratar[pedido.tipo];
  if (!f) return false;
  f(pedido)
    .then((r) => responder(r))
    .catch((e) => responder({ erro: e.message || 'Não deu certo.', conta: e instanceof R.ErroDeConta }));
  return true;
});
