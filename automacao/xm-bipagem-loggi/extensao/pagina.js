// O painel. As regras moram em regras.js; o alerta e o registro dos bipes, no menu.js e
// no fundo.js.
//
// A senha nao e guardada. O token fica em storage.session: nao chega aos scripts do site
// e some quando o Chrome fecha. A selecao e o alvo ficam em storage.local, que e de onde o
// menu.js le para conferir cada bipe. Os circulos ficam no sistema (todos veem os mesmos).

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
  l.dataset.busca = R.chaveCidade(rotulo);
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = marcado;
  const nome = document.createElement('span');
  nome.textContent = rotulo;
  l.append(c, nome);
  if (extra) {
    const s = document.createElement('small');
    s.textContent = extra;
    l.append(s);
  }
  return { l, c };
}

// Lupa: esconde o que nao casa, sem tirar da tela (o marcado continua marcado).
function filtrar(campo, ...listas) {
  const termo = R.chaveCidade(campo.value);
  listas.forEach((lista) => lista.querySelectorAll('label').forEach((l) => {
    l.hidden = !!termo && !l.dataset.busca.includes(termo);
  }));
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
    el.textContent = 'Nada marcado: o alerta está desligado. Marque círculos ou cidades.';
    return;
  }
  el.className = 'alvo';
  const n = alvo.cidades.length;
  el.textContent = `Conferindo: ${alvo.rotulo} (${n} ${n === 1 ? 'cidade' : 'cidades'}). Pacote de outra cidade toca o alarme.`;
}

// Circulo ou cidade, nunca os dois: marcar um tipo desmarca o outro.
function marcar(tipo, valor, ligado) {
  const outro = tipo === 'grupos' ? 'cidades' : 'grupos';
  if (ligado && selecao[outro].length) {
    selecao[outro] = [];
    dizer(tipo === 'grupos'
      ? 'Círculo marcado: as cidades soltas foram desmarcadas.'
      : 'Cidade marcada: os círculos foram desmarcados.');
  }
  selecao[tipo] = ligado ? [...selecao[tipo], valor] : selecao[tipo].filter((v) => v !== valor);
  desenharSelecao();
  salvarSelecao();
}

function desenharSelecao() {
  const g = $('sel-grupos');
  g.replaceChildren();
  if (!grupos.length) g.textContent = 'Nenhum círculo ainda. Crie na aba Círculos.';
  grupos.forEach((grupo) => {
    const { l, c } = caixa(grupo.nome, selecao.grupos.includes(grupo.id), ` · ${grupo.cidades.length} cidades`);
    c.addEventListener('change', () => marcar('grupos', grupo.id, c.checked));
    g.append(l);
  });

  const cl = $('sel-cidades');
  cl.replaceChildren();
  if (!cidades.length) cl.textContent = 'Nenhuma cidade da Loggi cadastrada na Conferência de expedição.';
  cidades.forEach((cidade) => {
    const { l, c } = caixa(cidade, selecao.cidades.includes(cidade));
    c.addEventListener('change', () => marcar('cidades', cidade, c.checked));
    cl.append(l);
  });
  filtrar($('busca'), g, cl);
}

// ── circulos ───────────────────────────────────────────────────────────────
function desenharGrupos() {
  const box = $('grupos');
  box.replaceChildren();
  if (!grupos.length) box.textContent = 'Nenhum círculo criado.';
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
  $('titulo-form').textContent = grupo ? `Editar ${grupo.nome}` : 'Novo círculo';
  $('nome-grupo').value = grupo ? grupo.nome : '';
  $('busca-form').value = '';
  const box = $('cidades-grupo');
  box.replaceChildren();
  cidades.forEach((cidade) => box.append(caixa(cidade, !!grupo && grupo.cidades.includes(cidade)).l));
  $('form-grupo').hidden = false;
  $('nome-grupo').focus();
}

async function apagarGrupo(g) {
  if (!confirm(`Apagar o círculo "${g.nome}"? Isso vale para todos que usam a extensão.`)) return;
  try {
    await chamar('DELETE', `/grupos/${g.id}`);
    dizer(`Círculo "${g.nome}" apagado.`);
    await carregar();
  } catch (e) { if (!(e instanceof R.ErroDeConta)) dizer(e.message, true); }
}

$('form-grupo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const marcadas = [...$('cidades-grupo').querySelectorAll('label')]
    .filter((l) => l.querySelector('input').checked).map((l) => l.querySelector('span').textContent);
  const corpo = { nome: $('nome-grupo').value, cidades: marcadas };
  try {
    if (editando) await chamar('PUT', `/grupos/${editando.id}`, corpo);
    else await chamar('POST', '/grupos', corpo);
    dizer(`Círculo "${corpo.nome.trim()}" salvo.`);
    $('form-grupo').hidden = true;
    await carregar();
  } catch (err) { if (!(err instanceof R.ErroDeConta)) dizer(err.message, true); }
});

$('cancelar').addEventListener('click', () => { $('form-grupo').hidden = true; });
$('novo').addEventListener('click', () => abrirForm(null));
$('atualizar').addEventListener('click', () => carregar().then(() => dizer('Atualizado.')));
$('busca').addEventListener('input', () => filtrar($('busca'), $('sel-grupos'), $('sel-cidades')));
$('busca-form').addEventListener('input', () => filtrar($('busca-form'), $('cidades-grupo')));
$('limpar').addEventListener('click', () => {
  selecao = { grupos: [], cidades: [] };
  desenharSelecao();
  salvarSelecao();
  dizer('Marcados removidos: o alerta está desligado.');
});

document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.abas button').forEach((x) => x.classList.toggle('ativa', x === b));
  $('aba-bipar').hidden = b.dataset.aba !== 'bipar';
  $('aba-circulos').hidden = b.dataset.aba !== 'circulos';
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
  dizer('Carregando círculos...');
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

async function comecar() {
  const salvo = await chrome.storage.local.get('selecao');
  if (salvo.selecao) selecao = { grupos: salvo.selecao.grupos || [], cidades: salvo.selecao.cidades || [] };
  const s = await chrome.storage.session.get(['token', 'nome']);
  if (!s.token) return mostrarLogin();
  token = s.token;
  mostrarPrincipal(s.nome);
}

comecar();
