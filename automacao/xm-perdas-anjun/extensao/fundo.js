// Service worker da XM - Perdas Anjun: fala com o sistema XMTT.
//
// O token do sistema fica em storage.session (some quando o Chrome fecha) e so este arquivo
// e a pagina de login enxergam. O painel na Anjun pede o entregador responsavel por mensagem
// e recebe so os nomes.

const BACKEND = 'https://sistema-backend-i4uh.onrender.com';

chrome.runtime.onMessage.addListener((pedido, _remetente, responder) => {
  atender(pedido || {}).then(responder, (e) => responder({ ok: false, erro: e.message }));
  return true;
});

async function atender(pedido) {
  if (pedido.tipo === 'conta') {
    const { token, nome } = await chrome.storage.session.get(['token', 'nome']);
    return { ok: true, nome: token ? (nome || 'conta do sistema') : null };
  }
  if (pedido.tipo === 'sair') {
    await chrome.storage.session.remove(['token', 'nome']);
    return { ok: true };
  }
  if (pedido.tipo === 'entregadores') return entregadores(pedido.logins);
  return { ok: false, erro: 'Pedido desconhecido.' };
}

// logins: [{ login, dia: 'AAAA-MM-DD' }] -> { ok, entregadores: [{ login, dia, entregador, ambiguo }] }
async function entregadores(logins) {
  const { token } = await chrome.storage.session.get('token');
  if (!token) return { ok: false, deslogado: true, erro: 'Entre no sistema para trazer o entregador responsável.' };
  let r;
  try {
    r = await fetch(`${BACKEND}/macros/perdas-anjun/entregadores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ logins: Array.isArray(logins) ? logins : [] }),
    });
  } catch {
    return { ok: false, erro: 'Não alcancei o sistema. Tente de novo em instantes.' };
  }
  if (r.status === 401 || r.status === 403) {
    await chrome.storage.session.remove(['token', 'nome']);
    return { ok: false, deslogado: true, erro: 'A sessão do sistema venceu ou a conta não tem acesso. Entre de novo.' };
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok || !corpo || !Array.isArray(corpo.entregadores)) {
    return { ok: false, erro: `O sistema respondeu ${r.status}${corpo && corpo.error ? `: ${corpo.error}` : ''}.` };
  }
  return { ok: true, entregadores: corpo.entregadores };
}
