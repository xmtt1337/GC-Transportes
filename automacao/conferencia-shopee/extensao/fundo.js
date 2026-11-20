// XM - Conferencia Shopee: o que precisa da extensao (e nao da pagina do SPX).
//
// - O token do sistema mora em storage.session, que a pagina do SPX nao alcanca. A senha nunca e
//   guardada. Do sistema so vem o login (a conta precisa poder usar as extensoes: /macros/acesso).
// - O CSV do export de pedidos do SPX e baixado e lido aqui (o link assinado aponta para
//   *.susercontent.com): comprador, CEP, motorista e sort code voltam para a pagina. Nada vai ao
//   sistema nem para a pasta Downloads.

importScripts('regras.js');

const R = self.XMConf;

/** Baixa o CSV do export do SPX (link assinado, só do servidor de arquivos da Shopee). */
async function baixarExport(url) {
  let destino;
  try { destino = new URL(url); } catch { throw new Error('Link do export inválido.'); }
  if (destino.protocol !== 'https:' || !/\.susercontent\.com$/.test(destino.hostname)) throw new Error('Link do export fora da Shopee.');
  const r = await fetch(destino.href);
  if (!r.ok) throw new Error(`Não deu para baixar o export do SPX (HTTP ${r.status}).`);
  return r.text();
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
  // O export de pedidos da viagem, lido aqui e devolvido à página.
  async pedidosConferencia({ url }) {
    return { pedidos: R.pedidosDoExport(await baixarExport(String(url || ''))) };
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
