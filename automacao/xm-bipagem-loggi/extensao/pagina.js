// O painel. As regras moram em regras.js; o alerta e o registro dos bipes, no menu.js e
// no fundo.js.
//
// A senha nao e guardada. O token fica em storage.session: nao chega aos scripts do site
// e some quando o Chrome fecha. A selecao e o alvo ficam em storage.local, que e de onde o
// menu.js le para conferir cada bipe. Os circulos ficam no sistema (todos veem os mesmos).
//
// Na aba Bipar vale UM circulo OU cidades soltas, nunca os dois.

const R = self.XMBipagem;
const $ = (id) => document.getElementById(id);

let token = null;
let cidades = [];
let conversao = {};
let grupos = [];
let selecao = { grupos: [], cidades: [] };
let editando = null;
let modo = 'grupos'; // o que a lista da aba Bipar mostra: 'grupos' (circulos) ou 'cidades'

function dizer(texto, erro = false) {
  $('mensagem').textContent = texto;
  $('mensagem').className = erro ? 'mensagem erro' : 'mensagem';
}

// Avisa o menu.js (no site) que o login mudou: ele pergunta ao fundo.js e trava ou destrava.
const avisarSessao = () => chrome.storage.local.set({ sessaoMudou: Date.now() });

// ── telas e temas ──────────────────────────────────────────────────────────
// Login e inicio no tema do sistema XMTT; a tela de uma transportadora, no tema dela.
// A ultima tela aberta volta quando o painel abre de novo.
const TELAS = {
  login: 'xm',
  inicio: 'xm',
  // O usuario achou estranho sair do tema do sistema para o da Loggi: fica tudo no do sistema.
  'conferencia-loggi': 'xm',
  'relatorio-loggi': 'xm',
};
const TRANSPORTADORAS = [
  { id: 'loggi', nome: 'Loggi', ativa: true },
  { id: 'anjun', nome: 'Anjun' },
  { id: 'imile', nome: 'iMile' },
  { id: 'shopee', nome: 'Shopee' },
  { id: 'total', nome: 'Total Express' },
];

function irPara(tela) {
  const destino = TELAS[tela] ? tela : 'inicio';
  Object.keys(TELAS).forEach((t) => { $(`tela-${t}`).hidden = t !== destino; });
  const tema = TELAS[destino];
  document.body.className = `tema-${tema}`;
  // A moldura (cabecalho do painel, no menu.js) acompanha o tema.
  window.parent.postMessage({ xmOperacao: 'tema', tema }, '*');
  if (destino !== 'login') chrome.storage.local.set({ tela: destino });
  if (destino !== 'login' && destino !== 'inicio') { telaAtual = destino; desenharMenu(); }
}

// Menu como a barra lateral do sistema: area (Conferencias / Baixar relatorios) abre e
// fecha; dentro, as transportadoras. Quais areas estao abertas fica guardado.
let areasAbertas = []; // comecam fechadas
let telaAtual = '';

function desenharMenu() {
  const montar = (caixa, secao) => {
    $(caixa).replaceChildren(...TRANSPORTADORAS.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = !t.ativa;
      b.classList.toggle('atual', telaAtual === `${secao}-${t.id}`);
      const nome = document.createElement('span');
      nome.textContent = t.nome;
      b.append(nome);
      if (!t.ativa) {
        const breve = document.createElement('small');
        breve.textContent = 'em breve';
        b.append(breve);
      } else {
        b.addEventListener('click', () => irPara(`${secao}-${t.id}`));
      }
      return b;
    }));
  };
  montar('menu-conferencia', 'conferencia');
  montar('menu-relatorio', 'relatorio');
  document.querySelectorAll('.area').forEach((a) => {
    const aberta = areasAbertas.includes(a.dataset.area);
    a.classList.toggle('aberta', aberta);
    a.classList.toggle('ativa', telaAtual.startsWith(`${a.dataset.area}-`));
    $(`menu-${a.dataset.area}`).hidden = !aberta;
  });
}

document.querySelectorAll('.area').forEach((a) => a.addEventListener('click', () => {
  const id = a.dataset.area;
  // Igual o sistema: abrir uma area fecha a outra.
  areasAbertas = areasAbertas.includes(id) ? [] : [id];
  chrome.storage.local.set({ areasAbertas });
  desenharMenu();
}));

function mostrarLogin(aviso = '') {
  irPara('login');
  $('aviso-login').textContent = aviso;
  $('senha').value = '';
  verSenha(false);
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
      avisarSessao();
      mostrarLogin(e.message);
    }
    throw e;
  }
}

/** Uma linha da lista: [caixa] nome (com um detalhe embaixo, se houver) ... contagem. */
function item(rotulo, { tipo = 'checkbox', marcado = false, detalhe = '', conta = '' } = {}) {
  const l = document.createElement('label');
  l.className = 'item';
  l.dataset.busca = R.chaveCidade(rotulo);
  const c = document.createElement('input');
  c.type = tipo;
  if (tipo === 'radio') c.name = 'circulo';
  c.checked = marcado;
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = rotulo;
  nome.title = detalhe ? `${rotulo}: ${detalhe}` : rotulo;
  if (detalhe) {
    const s = document.createElement('small');
    s.textContent = detalhe;
    nome.append(s);
  }
  const n = document.createElement('span');
  n.className = 'conta';
  n.textContent = conta;
  l.append(c, nome, n);
  return { l, c };
}

function vazia(texto) {
  const p = document.createElement('div');
  p.className = 'vazia';
  p.textContent = texto;
  return p;
}

// Lupa: esconde o que nao casa, sem tirar da tela (o marcado continua marcado).
function filtrar(campo, lista) {
  const termo = R.chaveCidade(campo.value);
  lista.querySelectorAll('label').forEach((l) => {
    l.hidden = !!termo && !l.dataset.busca.includes(termo);
  });
}

const qtd = (n) => `${n} ${n === 1 ? 'cidade' : 'cidades'}`;
const marcadas = (n) => `${n} marcada${n === 1 ? '' : 's'}`;

// ── selecao e alvo ─────────────────────────────────────────────────────────
async function salvarSelecao() {
  const ids = new Set(grupos.map((g) => g.id));
  // Um circulo so (selecao antiga com varios fica com o primeiro).
  selecao.grupos = selecao.grupos.filter((id) => ids.has(id)).slice(0, 1);
  selecao.cidades = selecao.cidades.filter((c) => cidades.includes(c));
  const alvo = { ...R.montarAlvo(selecao, grupos), conversao };
  await chrome.storage.local.set({ selecao, alvo });
  desenharAlvo(alvo);
}

function desenharAlvo(alvo) {
  const el = $('alvo');
  el.replaceChildren();
  const linha = (tag, cls, texto) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.textContent = texto;
    el.append(e);
  };
  if (!alvo.chaves.length) {
    el.className = 'alvo vazio';
    linha('span', 'rotulo', 'Alerta desligado');
    linha('strong', '', 'Nada marcado');
    linha('small', '', 'Escolha um círculo ou marque as cidades abaixo.');
    return;
  }
  el.className = 'alvo';
  linha('span', 'rotulo', `Conferindo · ${qtd(alvo.cidades.length)}`);
  linha('strong', '', alvo.rotulo);
  linha('small', '', alvo.tipo === 'circulo' ? alvo.cidades.join(', ') : 'Pacote de outra cidade toca o alarme.');
}

function trocarModo(novo) {
  modo = novo;
  document.querySelectorAll('.modo button').forEach((b) => b.classList.toggle('ativa', b.dataset.modo === modo));
  $('busca').placeholder = modo === 'grupos' ? 'Pesquisar círculo' : 'Pesquisar cidade';
  $('busca').value = '';
  desenharSelecao();
}

// Um circulo OU cidades: escolher um desmarca o outro.
function marcarCirculo(id) {
  const tinha = selecao.cidades.length;
  selecao = { grupos: [id], cidades: [] };
  dizer(tinha ? 'Círculo escolhido: as cidades marcadas foram desmarcadas.' : '');
  salvarSelecao();
}

function marcarCidade(cidade, ligado) {
  const tinha = selecao.grupos.length;
  const lista = ligado ? [...selecao.cidades, cidade] : selecao.cidades.filter((c) => c !== cidade);
  selecao = { grupos: [], cidades: lista };
  dizer(tinha && ligado ? 'Cidade marcada: o círculo foi desmarcado.' : '');
  salvarSelecao();
}

function desenharSelecao() {
  const box = $('lista');
  box.replaceChildren();
  if (modo === 'grupos') {
    $('titulo-lista').textContent = 'Escolha um círculo';
    if (!grupos.length) box.append(vazia('Nenhum círculo ainda. Crie na aba Círculos.'));
    grupos.forEach((g) => {
      const { l, c } = item(g.nome, {
        tipo: 'radio',
        marcado: selecao.grupos.includes(g.id),
        detalhe: g.cidades.join(', '),
        conta: String(g.cidades.length),
      });
      // Radio nao desmarca sozinho: clicar de novo no circulo escolhido tira a escolha.
      c.addEventListener('click', () => {
        if (selecao.grupos[0] === g.id) {
          c.checked = false;
          selecao = { grupos: [], cidades: [] };
          salvarSelecao();
          dizer('Círculo desmarcado: o alerta está desligado.');
        } else {
          marcarCirculo(g.id);
        }
      });
      box.append(l);
    });
  } else {
    $('titulo-lista').textContent = selecao.cidades.length ? `Cidades · ${marcadas(selecao.cidades.length)}` : 'Marque as cidades';
    if (!cidades.length) box.append(vazia('Nenhuma cidade da Loggi cadastrada na Conferência de expedição.'));
    cidades.forEach((cidade) => {
      const { l, c } = item(cidade, { marcado: selecao.cidades.includes(cidade) });
      c.addEventListener('change', () => {
        marcarCidade(cidade, c.checked);
        $('titulo-lista').textContent = selecao.cidades.length ? `Cidades · ${marcadas(selecao.cidades.length)}` : 'Marque as cidades';
      });
      box.append(l);
    });
  }
  filtrar($('busca'), box);
}

// ── circulos ───────────────────────────────────────────────────────────────
function desenharGrupos() {
  const box = $('grupos');
  box.replaceChildren();
  if (!grupos.length) box.append(vazia('Nenhum círculo criado.'));
  grupos.forEach((g) => {
    const linha = document.createElement('div');
    linha.className = 'circulo';
    const info = document.createElement('div');
    const nome = document.createElement('strong');
    nome.textContent = g.nome;
    const detalhe = document.createElement('small');
    detalhe.textContent = `${qtd(g.cidades.length)}: ${g.cidades.join(', ')}`;
    info.append(nome, detalhe);
    const acoes = document.createElement('div');
    acoes.className = 'acoes-linha';
    const botao = (texto, fazer) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = texto;
      b.addEventListener('click', fazer);
      acoes.append(b);
    };
    botao('Editar', () => abrirForm(g));
    botao('Apagar', () => apagarGrupo(g));
    linha.append(info, acoes);
    box.append(linha);
  });
}

function contarForm() {
  const n = $('cidades-grupo').querySelectorAll('input:checked').length;
  $('conta-form').textContent = n ? marcadas(n) : '';
}

function abrirForm(grupo) {
  editando = grupo || null;
  $('titulo-form').textContent = grupo ? 'Editar círculo' : 'Novo círculo';
  $('nome-grupo').value = grupo ? grupo.nome : '';
  $('busca-form').value = '';
  const box = $('cidades-grupo');
  box.replaceChildren();
  cidades.forEach((cidade) => {
    const { l, c } = item(cidade, { marcado: !!grupo && grupo.cidades.includes(cidade) });
    c.addEventListener('change', contarForm);
    box.append(l);
  });
  contarForm();
  $('lista-circulos').hidden = true;
  $('form-grupo').hidden = false;
  $('nome-grupo').focus();
}

function fecharForm() {
  $('form-grupo').hidden = true;
  $('lista-circulos').hidden = false;
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
  const escolhidas = [...$('cidades-grupo').querySelectorAll('label')]
    .filter((l) => l.querySelector('input').checked)
    .map((l) => l.querySelector('.nome').firstChild.textContent);
  const corpo = { nome: $('nome-grupo').value, cidades: escolhidas };
  try {
    if (editando) await chamar('PUT', `/grupos/${editando.id}`, corpo);
    else await chamar('POST', '/grupos', corpo);
    dizer(`Círculo "${corpo.nome.trim()}" salvo.`);
    fecharForm();
    await carregar();
  } catch (err) { if (!(err instanceof R.ErroDeConta)) dizer(err.message, true); }
});

$('cancelar').addEventListener('click', fecharForm);
$('novo').addEventListener('click', () => abrirForm(null));
$('atualizar').addEventListener('click', () => carregar().then(() => dizer('Atualizado.')));
$('busca').addEventListener('input', () => filtrar($('busca'), $('lista')));
$('busca-form').addEventListener('input', () => filtrar($('busca-form'), $('cidades-grupo')));
document.querySelectorAll('.modo button').forEach((b) => b.addEventListener('click', () => trocarModo(b.dataset.modo)));
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
  fecharForm();
  dizer('');
}));

// ── login e carga ──────────────────────────────────────────────────────────
async function carregar() {
  const [c, g] = await Promise.all([chamar('GET', '/cidades'), chamar('GET', '/grupos')]);
  cidades = c.cidades || [];
  conversao = c.conversao || {};
  grupos = g.grupos || [];
  await salvarSelecao();
  desenharSelecao();
  desenharGrupos();
}

async function mostrarPrincipal(nome) {
  document.querySelectorAll('.logado').forEach((e) => { e.textContent = `Logado como ${nome}`; });
  const { tela } = await chrome.storage.local.get('tela');
  irPara(tela && tela !== 'login' ? tela : 'inicio');
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
    avisarSessao();
    $('senha').value = '';
    await mostrarPrincipal(r.nome);
  } catch (erro) {
    mostrarLogin(erro.message);
  }
  $('entrar').disabled = false;
  $('entrar').textContent = 'Entrar';
});

// Olho da senha: mostra/esconde. Volta a esconder ao mostrar o login de novo.
function verSenha(mostrar) {
  $('senha').type = mostrar ? 'text' : 'password';
  $('ver-senha').querySelector('.risco').style.display = mostrar ? '' : 'none';
  const t = mostrar ? 'Esconder senha' : 'Mostrar senha';
  $('ver-senha').title = t;
  $('ver-senha').setAttribute('aria-label', t);
}
$('ver-senha').addEventListener('click', () => {
  verSenha($('senha').type === 'password');
  $('senha').focus();
});

document.querySelectorAll('.sair').forEach((b) => b.addEventListener('click', async () => {
  await chrome.storage.session.clear();
  avisarSessao();
  token = null;
  mostrarLogin();
}));
document.querySelectorAll('.voltar').forEach((b) => b.addEventListener('click', () => irPara('inicio')));

// ── relatorios ─────────────────────────────────────────────────────────────
// Quem aperta o botao da Loggi e o menu.js (esta pagina esta num iframe e nao mexe no Arco).
$('baixar-relatorio').addEventListener('click', () => {
  $('baixar-relatorio').disabled = true;
  relatorio('Pedindo ao Arco...');
  window.parent.postMessage({ xmOperacao: 'baixarNaBase' }, '*');
});

function relatorio(texto, erro = false, fim = false) {
  $('status-relatorio').textContent = texto;
  $('status-relatorio').className = erro ? 'mensagem erro' : 'mensagem';
  if (fim) $('baixar-relatorio').disabled = false;
}

window.addEventListener('message', (e) => {
  if (e.source !== window.parent || !e.data || e.data.xmOperacao !== 'statusRelatorio') return;
  relatorio(String(e.data.texto || ''), !!e.data.erro, !!e.data.fim);
});

async function comecar() {
  const guardado = await chrome.storage.local.get(['areasAbertas', 'tela']);
  if (Array.isArray(guardado.areasAbertas)) areasAbertas = guardado.areasAbertas;
  if (guardado.tela && guardado.tela !== 'inicio') telaAtual = guardado.tela;
  desenharMenu();
  const salvo = await chrome.storage.local.get('selecao');
  if (salvo.selecao) selecao = { grupos: salvo.selecao.grupos || [], cidades: salvo.selecao.cidades || [] };
  // Abre a lista do que esta valendo.
  if (selecao.cidades.length && !selecao.grupos.length) trocarModo('cidades');
  const s = await chrome.storage.session.get(['token', 'nome']);
  if (!s.token) return mostrarLogin();
  token = s.token;
  mostrarPrincipal(s.nome);
}

comecar();
