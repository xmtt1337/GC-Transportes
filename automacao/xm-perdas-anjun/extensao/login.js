// Login no sistema XMTT, dentro de um iframe da extensao no painel da Anjun: o site da Anjun
// nao le a senha nem o token. Mesmo acesso das outras extensoes (canal 'vigia', que so abre
// as rotas /macros/ e nao derruba a sessao do site). A senha nao e guardada; o token vai
// para storage.session e o painel so fica sabendo o nome da conta.

const BACKEND = 'https://sistema-backend-i4uh.onrender.com';
const ANJUN = 'https://newsupplier.anjunexpress.com';

const $ = (id) => document.getElementById(id);

function mensagem(texto, erro = false) {
  $('msg').className = erro ? 'erro' : '';
  $('msg').textContent = texto;
}

async function entrar(usuario, senha) {
  let corpo;
  try {
    const r = await fetch(`${BACKEND}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: usuario, password: senha, canal: 'vigia' }),
    });
    corpo = await r.json();
  } catch {
    throw new Error('Não alcancei o sistema. Tente de novo em instantes.');
  }
  if (corpo.inativo) throw new Error('Esse usuário está inativo.');
  if (!corpo.success) throw new Error('Usuário ou senha não confere.');
  if (corpo.require_password_change) throw new Error('A senha é temporária. Entre no site e troque.');
  if (!corpo.token) throw new Error('O login passou, mas não veio token.');

  // Entregador entra na conta, mas nao usa as ferramentas da operacao.
  const acesso = await fetch(`${BACKEND}/macros/acesso`, { headers: { Authorization: `Bearer ${corpo.token}` } })
    .catch(() => null);
  if (!acesso) throw new Error('Não alcancei o sistema. Tente de novo em instantes.');
  if (acesso.status === 401 || acesso.status === 403) throw new Error('Essa conta não tem acesso a esta ferramenta.');
  if (!acesso.ok) throw new Error(`O sistema respondeu ${acesso.status}.`);
  return { token: corpo.token, nome: corpo.name || corpo.username || usuario };
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('entrar').disabled = true;
  mensagem('Entrando... (o sistema pode levar até 1 minuto para acordar)');
  try {
    const { token, nome } = await entrar($('usuario').value.trim(), $('senha').value);
    await chrome.storage.session.set({ token, nome });
    $('senha').value = '';
    mensagem(`Conectado como ${nome}.`);
    const destino = (location.ancestorOrigins && location.ancestorOrigins[0]) || ANJUN;
    window.parent.postMessage({ xmPerdas: 'conta', nome }, destino);
  } catch (erro) {
    mensagem(erro.message, true);
  } finally {
    $('entrar').disabled = false;
  }
});
