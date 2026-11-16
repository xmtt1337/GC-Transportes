// O painel. As regras moram em regras.js; o alerta, no menu.js.
//
// A senha nao e guardada. O token fica em storage.session: nao chega aos scripts do site
// e some quando o Chrome fecha. A selecao e o alvo ficam em storage.local, que e de onde o
// menu.js le para conferir cada bipe.

const R = self.XMBipagem;
const $ = (id) => document.getElementById(id);

let token = null;
let cidades = [];
let conversao = {};
let grupos = [];
let selecao = { grupos: [], cidades: [] };
let editando = null;

function dizer(texto, erro = false) {
  $('mensagem').textContent = texto;
  $('mensagem').className = erro ? 'suave erro' : 'suave';
}

function mostrarLogin(aviso = '') {
  $('tela-principal').hidden = true;
  $('tela-login').hidden = false;
  $('aviso-login').textContent = aviso;
  $('senha').value = '';
  chrome.storage.local.get('usuario').then(({ usuario }) => {
    if (usuario && !$('usuario').value) $('usuario').value = usuario;
    $(usuario ? 'senha' : 'usuario').focus();
  });
}

async function chamar(metodo, caminho, corpo) {
  try {
    return await R.api(token, metodo, caminho, corpo);
  } catch (e) {
    if (e instanceof R.ErroDeConta) {
      await chrome.storage.session.clear();
      mostrarLogin(e.message);
    }
    throw e;
  }
}

function caixa(rotulo, marcado, extra = '') {
  const l = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = marcado;
  l.append(c, document.createTextNode(` ${rotulo}`));
  if (extra) {
    const s = document.createElement('small');
    s.textContent = extra;
    l.append(s);
  }
  return { l, c };
}

// ── selecao e alvo ─────────────────────────────────────────────────────────
async function salvarSelecao() {
  const ids = new Set(grupos.map((g) => g.id));
  selecao.grupos = selecao.grupos.filter((id) => ids.has(id));
  selecao.cidades = selecao.cidades.filter((c) => cidades.includes(c));
  const alvo = { ...R.montarAlvo(selecao, grupos), conversao };
  await chrome.storage.local.set({ selecao, alvo });
  desenharAlvo(alvo);
}

function desenharAlvo(alvo) {
  const el = $('alvo');
  if (!alvo.chaves.length) {
    el.className = 'alvo vazio';
    el.textContent = 'Nada marcado: o alerta está desligado. Marque grupos ou cidades.';
    return;
  }
  el.className = 'alvo';
  el.textContent = `Conferindo: ${alvo.rotulo} (${alvo.cidades.length} ${alvo.cidades.length === 1 ? 'cidade' : 'cidades'}). Pacote de outra cidade toca o alarme.`;
}

function desenharSelecao() {
  const g = $('sel-grupos');
  g.replaceChildren();
  if (!grupos.length) g.textContent = 'Nenhum grupo ainda. Crie na aba Grupos.';
  grupos.forEach((grupo) => {
    const { l, c } = caixa(grupo.nome, selecao.grupos.includes(grupo.id), ` · ${grupo.cidades.length} cidades`);
    c.addEventListener('change', () => {
      selecao.grupos = c.checked ? [...selecao.grupos, grupo.id] : selecao.grupos.filter((id) => id !== grupo.id);
      salvarSelecao();
    });
    g.append(l);
  });

  const cl = $('sel-cidades');
  cl.replaceChildren();
  if (!cidades.length) cl.textContent = 'Nenhuma cidade da Loggi cadastrada na Conferência de expedição.';
  cidades.forEach((cidade) => {
    const { l, c } = caixa(cidade, selecao.cidades.includes(cidade));
    c.addEventListener('change', () => {
      selecao.cidades = c.checked ? [...selecao.cidades, cidade] : selecao.cidades.filter((x) => x !== cidade);
      salvarSelecao();
    });
    cl.append(l);
  });
}

function desenharHistorico(historico = []) {
  const ul = $('historico');
  ul.replaceChildren();
  if (!historico.length) {
    const li = document.createElement('li');
    li.textContent = 'Nenhum bipe ainda.';
    li.className = 'suave';
    ul.append(li);
  }
  historico.slice(0, 15).forEach((h) => {
    const li = document.createElement('li');
    const cod = document.createElement('span');
    cod.className = 'codigo';
    cod.textContent = h.codigo;
    const res = document.createElement('span');
    if (h.ok === false) { res.className = 'errado'; res.textContent = `${h.cidade} · errado`; }
    else if (h.ok) { res.className = 'certo'; res.textContent = h.cidade; }
    else res.textContent = `${h.cidade} · sem conferência`;
    li.append(cod, res);
    ul.append(li);
  });
}

// ── grupos ─────────────────────────────────────────────────────────────────
function desenharGrupos() {
  const box = $('grupos');
  box.replaceChildren();
  if (!grupos.length) box.textContent = 'Nenhum grupo criado.';
  grupos.forEach((g) => {
    const linha = document.createElement('div');
    linha.className = 'grupo';
    const info = document.createElement('div');
    const nome = document.createElement('strong');
    nome.textContent = g.nome;
    const detalhe = document.createElement('small');
    detalhe.textContent = g.cidades.join(', ');
    info.append(nome, detalhe);
    const acoes = document.createElement('div');
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.textContent = 'Editar';
    editar.addEventListener('click', () => abrirForm(g));
    const apagar = document.createElement('button');
    apagar.type = 'button';
    apagar.textContent = 'Apagar';
    apagar.addEventListener('click', () => apagarGrupo(g));
    acoes.append(editar, apagar);
    linha.append(info, acoes);
    box.append(linha);
  });
}

function abrirForm(grupo) {
  editando = grupo || null;
  $('titulo-form').textContent = grupo ? `Editar ${grupo.nome}` : 'Novo grupo';
  $('nome-grupo').value = grupo ? grupo.nome : '';
  const box = $('cidades-grupo');
  box.replaceChildren();
  cidades.forEach((cidade) => box.append(caixa(cidade, !!grupo && grupo.cidades.includes(cidade)).l));
  $('form-grupo').hidden = false;
  $('nome-grupo').focus();
}

async function apagarGrupo(g) {
  if (!confirm(`Apagar o grupo "${g.nome}"? Isso vale para todos que usam a extensão.`)) return;
  try {
    await chamar('DELETE', `/grupos/${g.id}`);
    dizer(`Grupo "${g.nome}" apagado.`);
    await carregar();
  } catch (e) { if (!(e instanceof R.ErroDeConta)) dizer(e.message, true); }
}

$('form-grupo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const marcadas = [...$('cidades-grupo').querySelectorAll('label')]
    .filter((l) => l.querySelector('input').checked).map((l) => l.textContent.trim());
  const corpo = { nome: $('nome-grupo').value, cidades: marcadas };
  try {
    if (editando) await chamar('PUT', `/grupos/${editando.id}`, corpo);
    else await chamar('POST', '/grupos', corpo);
    dizer(`Grupo "${corpo.nome.trim()}" salvo.`);
    $('form-grupo').hidden = true;
    await carregar();
  } catch (err) { if (!(err instanceof R.ErroDeConta)) dizer(err.message, true); }
});

$('cancelar').addEventListener('click', () => { $('form-grupo').hidden = true; });
$('novo').addEventListener('click', () => abrirForm(null));
$('atualizar').addEventListener('click', () => carregar().then(() => dizer('Atualizado.')));
$('limpar').addEventListener('click', () => {
  selecao = { grupos: [], cidades: [] };
  desenharSelecao();
  salvarSelecao();
});

document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.abas button').forEach((x) => x.classList.toggle('ativa', x === b));
  $('aba-bipar').hidden = b.dataset.aba !== 'bipar';
  $('aba-grupos').hidden = b.dataset.aba !== 'grupos';
  dizer('');
}));

// ── login e carga ──────────────────────────────────────────────────────────
async function carregar() {
  const [c, g] = await Promise.all([chamar('GET', '/cidades'), chamar('GET', '/grupos')]);
  cidades = c.cidades || [];
  conversao = c.conversao || {};
  grupos = g.grupos || [];
  desenharSelecao();
  desenharGrupos();
  await salvarSelecao();
}

async function mostrarPrincipal(nome) {
  $('tela-login').hidden = true;
  $('tela-principal').hidden = false;
  $('logado').textContent = `Logado como ${nome}`;
  dizer('Carregando grupos...');
  try {
    await carregar();
    dizer('');
  } catch (e) { if (!(e instanceof R.ErroDeConta)) dizer(e.message, true); }
}

$('tela-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('usuario').value.trim();
  $('entrar').disabled = true;
  $('entrar').textContent = 'Entrando...';
  try {
    const r = await R.entrar(usuario, $('senha').value);
    token = r.token;
    await chrome.storage.session.set({ token: r.token, nome: r.nome });
    await chrome.storage.local.set({ usuario });
    $('senha').value = '';
    await mostrarPrincipal(r.nome);
  } catch (erro) {
    mostrarLogin(erro.message);
  }
  $('entrar').disabled = false;
  $('entrar').textContent = 'Entrar';
});

$('sair').addEventListener('click', async () => {
  await chrome.storage.session.clear();
  token = null;
  mostrarLogin();
});

chrome.storage.onChanged.addListener((mudou, area) => {
  if (area === 'local' && mudou.historico) desenharHistorico(mudou.historico.newValue);
});

async function comecar() {
  const salvo = await chrome.storage.local.get(['selecao', 'historico']);
  if (salvo.selecao) selecao = { grupos: salvo.selecao.grupos || [], cidades: salvo.selecao.cidades || [] };
  desenharHistorico(salvo.historico);
  const s = await chrome.storage.session.get(['token', 'nome']);
  if (!s.token) return mostrarLogin();
  token = s.token;
  mostrarPrincipal(s.nome);
}

comecar();
