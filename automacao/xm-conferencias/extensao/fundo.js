// XM - Conferencias: o que precisa da extensao (e nao da pagina do portal: SPX, Anjun ou DS da iMile).
//
// - O token do sistema mora em storage.session, que as paginas dos portais nao alcancam. A senha
//   nunca e guardada. A conta precisa poder usar as extensoes (/macros/acesso).
// - Shopee (Vapt Vupt): do sistema so vem o login; a conta e toda feita na extensao.
// - Anjun e iMile: a conferencia e a do sistema (/macros/anjun-conferencia e /macros/imile-conferencia):
//   a leitura do portal vai e a conta volta. So esses dois prefixos passam pelo canal "sistema".
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
  // Conferências da Anjun e da iMile no sistema: só esses dois prefixos passam.
  async sistema({ metodo, caminho, corpo }) {
    const m = String(metodo || 'GET').toUpperCase();
    const c = String(caminho || '');
    const permitido = ['/macros/anjun-conferencia', '/macros/imile-conferencia'].some((p) => c.startsWith(p));
    if (!['GET', 'POST'].includes(m) || !permitido || c.includes('..')) throw new Error('Caminho não permitido.');
    const { token: t } = await chrome.storage.session.get('token');
    if (!t) throw new R.ErroDeConta('Entre com sua conta do sistema.');
    try {
      return { dados: await R.api(t, m, c, m === 'POST' ? (corpo || {}) : undefined) };
    } catch (e) {
      if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome', 'papel']);
      throw e;
    }
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
