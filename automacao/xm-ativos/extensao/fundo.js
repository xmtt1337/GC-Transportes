// XM - Ativos: o que precisa da extensao (e nao da pagina do portal: SPX, DS da iMile ou Anjun).
//
// - O token do sistema mora em storage.session, que as paginas dos portais nao alcancam. A senha nunca
//   e guardada.
// - O CSV do export do SPX e baixado e lido aqui (o link assinado aponta para *.susercontent.com).
//   Dele so sai, por BR, o nome do destinatario. Nada vai para a pasta Downloads.
// - O disparo vai ao sistema (/macros/whatsapp/enviar), que manda pelo WABA e grava a conversa:
//   ela aparece no sistema como qualquer ativo.

// O login e o disparo sao os mesmos nas tres transportadoras; as regras da Shopee (que tambem le
// o CSV do export do SPX) servem para todas.
importScripts('shopee/regras.js');

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
    if (e instanceof R.ErroDeConta) await chrome.storage.session.remove(['token', 'nome', 'papel']);
    throw e;
  }
}

/** Baixa o CSV do export do SPX (link assinado, só do servidor de arquivos da Shopee). */
async function baixarExport(url) {
  let destino;
  try { destino = new URL(url); } catch { throw new Error('Link do export inválido.'); }
  if (destino.protocol !== 'https:' || !/\.susercontent\.com$/.test(destino.hostname)) throw new Error('Link do export fora da Shopee.');
  const r = await fetch(destino.href);
  if (!r.ok) throw new Error(`Não deu para baixar o export do SPX (HTTP ${r.status}).`);
  return r.text();
}

async function lerContatos(url) {
  return R.contatosDoExport(await baixarExport(url));
}

const tratar = {
  async estado() {
    const { token: t, nome, papel } = await chrome.storage.session.get(['token', 'nome', 'papel']);
    // Quem entrou antes de a extensão guardar o cargo: ele está no próprio token.
    return { logado: !!t, nome: nome || '', papel: papel || (t ? R.papelDoToken(t) : '') };
  },
  async entrar({ usuario, senha }) {
    const { token: t, nome, papel } = await R.entrar(String(usuario || '').trim(), String(senha || ''));
    await chrome.storage.session.set({ token: t, nome, papel });
    return { logado: true, nome, papel };
  },
  // "Configurar" nas páginas: a página de opções (quais menus aparecem no SPX).
  async abrirOpcoes() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  },
  async sair() {
    await chrome.storage.session.remove(['token', 'nome', 'papel']);
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
  // Conversas (/macros/whatsapp/...): so esse prefixo passa; o servidor decide o que a conta ve e
  // pode fazer.
  async sistema({ metodo, caminho, corpo }) {
    const m = String(metodo || 'GET').toUpperCase();
    const c = String(caminho || '');
    if (!['GET', 'POST'].includes(m) || !c.startsWith('/macros/whatsapp/') || c.includes('..')) throw new Error('Caminho não permitido.');
    return { dados: await chamarSistema(m, c, m === 'POST' ? (corpo || {}) : undefined) };
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
