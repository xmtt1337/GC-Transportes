// XM - Ativos Shopee: o que precisa da extensao (e nao da pagina do SPX).
//
// - O token do sistema mora em storage.session, que a pagina do SPX nao alcanca. A senha nunca
//   e guardada.
// - O CSV do export do SPX e baixado e lido aqui (o link assinado aponta para *.susercontent.com).
//   Dele so sai, por BR, o nome do destinatario. Nada vai para a pasta Downloads.
// - O disparo vai ao sistema (/macros/whatsapp/enviar), que manda pelo WABA e grava a conversa:
//   ela aparece no sistema como qualquer ativo.

importScripts('regras.js');

const R = self.XMAtivos;

async function token() {
  const { token: t } = await chrome.storage.session.get('token');
  if (!t) throw new R.ErroDeConta('Entre com sua conta do sistema.');
  return t;
}

async function chamarSistema(metodo, caminho, corpo) {
  try {
    return await R.api(await token(), metodo, caminho, corpo);
  } catch (e) {
    if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome']);
    throw e;
  }
}

async function lerContatos(url) {
  let destino;
  try { destino = new URL(url); } catch { throw new Error('Link do export inválido.'); }
  if (destino.protocol !== 'https:' || !/\.susercontent\.com$/.test(destino.hostname)) throw new Error('Link do export fora da Shopee.');
  const r = await fetch(destino.href);
  if (!r.ok) throw new Error(`Não deu para baixar o export do SPX (HTTP ${r.status}).`);
  return R.contatosDoExport(await r.text());
}

const tratar = {
  async estado() {
    const { token: t, nome } = await chrome.storage.session.get(['token', 'nome']);
    return { logado: !!t, nome: nome || '' };
  },
  async entrar({ usuario, senha }) {
    const { token: t, nome } = await R.entrar(String(usuario || '').trim(), String(senha || ''));
    await chrome.storage.session.set({ token: t, nome });
    return { logado: true, nome };
  },
  async sair() {
    await chrome.storage.session.remove(['token', 'nome']);
    return { logado: false };
  },
  async contatos({ url }) {
    return { contatos: await lerContatos(String(url || '')) };
  },
  async situacao({ pedidos }) {
    const lista = Array.isArray(pedidos) ? pedidos.slice(0, R.MAX_CODIGOS) : [];
    const estados = {};
    // O sistema aceita um tanto de pedidos por consulta: vai em partes.
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
