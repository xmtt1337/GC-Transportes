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
// Em que site o painel abriu (o menu.js manda ?site=anjun|loggi): decide a tela de entrada.
const TELA_DO_SITE = { anjun: 'conferencia-anjun', loggi: 'conferencia-loggi', shopee: 'conferencia-shopee' }[new URLSearchParams(location.search).get('site')] || '';
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
  'conferencia-anjun': 'xm',
  'conferencia-shopee': 'xm',
};
const TRANSPORTADORAS = [
  { id: 'loggi', nome: 'Loggi', ativa: true },
  { id: 'anjun', nome: 'Anjun', ativa: true },
  { id: 'imile', nome: 'iMile' },
  { id: 'shopee', nome: 'Shopee', ativa: true },
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
  if (destino === 'conferencia-loggi') carregarAgrupamento();
  if (destino === 'conferencia-anjun') carregarAnjun();
  if (destino === 'conferencia-shopee') carregarShopee();
}

// Menu como a barra lateral do sistema: area (Conferencias; Baixar relatorios saiu na 2.9) abre e
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

function mostrarAba(aba, carregarDados = true) {
  document.querySelectorAll('.abas button').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === aba));
  ['bipar', 'circulos', 'agrupamento'].forEach((a) => { $(`aba-${a}`).hidden = a !== aba; });
  if (aba === 'agrupamento' && carregarDados) carregarAgrupamento();
  fecharForm();
  dizer('');
}
document.querySelectorAll('.abas button').forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));

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
  // No site de uma transportadora, abre a conferencia dela; fora disso, a ultima tela usada.
  const { tela } = await chrome.storage.local.get('tela');
  irPara(TELA_DO_SITE || (tela && tela !== 'login' ? tela : 'inicio'));
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

// ── Agrupamento de hoje (aba no canto direito da Conferencia Loggi) ─────────
// "Conferir agora": o menu.js pega o link do Baixar relatorio da tela Na base e o fundo.js le
// o CSV sem baixar; o sistema guarda os recebidos hoje e cruza os "Sem tentativa" com os bipes
// do dia. Ao abrir a Conferencia, a % aparece ao lado do nome da aba (ultima leitura de hoje,
// recalculada com os bipes de agora). Quem fala com o Arco e o menu.js: esta pagina e um iframe.
let pendentesAg = [];
const MAX_BARRAS = 8;

window.addEventListener('message', (e) => {
  if (e.source !== window.parent || !e.data || e.data.xmOperacao !== 'statusRelatorio' || !e.data.ler) return;
  // O Conferir agora pode ter trocado a pagina (foi para o Na base): volta para esta aba.
  if ($('aba-agrupamento').hidden && !$('tela-conferencia-loggi').hidden) mostrarAba('agrupamento', false);
  agrupamento(String(e.data.texto || ''), !!e.data.erro, !!e.data.fim);
  if (e.data.resumo) mostrarAgrupamento(e.data.resumo);
});

$('ler-na-base').addEventListener('click', () => {
  $('ler-na-base').disabled = true;
  agrupamento('Pedindo ao Arco...');
  window.parent.postMessage({ xmOperacao: 'lerNaBase' }, '*');
});

function agrupamento(texto, erro = false, fim = false) {
  $('status-agrupamento').textContent = texto;
  $('status-agrupamento').className = erro ? 'mensagem erro' : 'mensagem';
  if (fim) $('ler-na-base').disabled = false;
}

const dataCurta = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '';
};
const horaDe = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
const DUAS_CASAS = { minimumFractionDigits: 2, maximumFractionDigits: 2 }; // sempre 99,78% (pedido do usuário)
const pctTexto = (r) => `${Number(r.porcentagem || 0).toLocaleString('pt-BR', DUAS_CASAS)}%`;

function semLeitura() {
  $('agrupamento').hidden = true;
  $('ag-mini').textContent = '';
  $('ag-pizza').className = 'pizza vazia';
  $('ag-porcentagem').textContent = '—';
  $('ag-conta').textContent = 'Ainda não conferido hoje';
  $('ag-lido').textContent = 'Recebidos hoje no Na base x bipes de hoje.';
}

/** Barras: as cidades onde mais falta, agrupado em azul e o que falta em ambar. */
function desenharBarras(porCidade) {
  const comFalta = (porCidade || []).filter((c) => c.total > c.agrupados).slice(0, MAX_BARRAS);
  const caixa = $('ag-barras');
  if (!comFalta.length) {
    const v = document.createElement('div');
    v.className = 'vazia';
    v.textContent = 'Nenhuma cidade com pacote faltando.';
    return caixa.replaceChildren(v);
  }
  const maior = Math.max(...comFalta.map((c) => c.total));
  caixa.replaceChildren(...comFalta.map((c) => {
    const l = document.createElement('div');
    l.className = 'barra-cidade';
    l.title = `${c.cidade}: ${numero(c.agrupados)} de ${numero(c.total)} agrupados`;
    const nome = document.createElement('span');
    nome.textContent = c.cidade;
    const trilho = document.createElement('div');
    trilho.className = 'trilho';
    const ok = document.createElement('i');
    ok.className = 'cor-ok';
    ok.style.width = `${(c.agrupados / maior) * 100}%`;
    const falta = document.createElement('i');
    falta.className = 'cor-falta';
    falta.style.width = `${((c.total - c.agrupados) / maior) * 100}%`;
    trilho.append(ok, falta);
    const n = document.createElement('em');
    n.textContent = numero(c.total - c.agrupados);
    const tirar = document.createElement('button');
    tirar.type = 'button';
    tirar.className = 'tirar';
    tirar.textContent = 'tirar';
    tirar.title = `Tirar ${c.cidade} da conta (para todos)`;
    tirar.addEventListener('click', () => ignorarCidade(c.cidade, true));
    l.append(nome, trilho, n, tirar);
    return l;
  }));
}

/** "Fora da conta: Cidade (3) voltar · ..." */
function desenharFora(ignoradas) {
  const caixa = $('ag-fora');
  caixa.hidden = !(ignoradas && ignoradas.length);
  if (caixa.hidden) return caixa.replaceChildren();
  const partes = [document.createTextNode('Fora da conta: ')];
  ignoradas.forEach((c, i) => {
    if (i) partes.push(document.createTextNode(' · '));
    partes.push(document.createTextNode(`${c.cidade} (${numero(c.total)}) `));
    const voltar = document.createElement('button');
    voltar.type = 'button';
    voltar.textContent = 'voltar';
    voltar.addEventListener('click', () => ignorarCidade(c.cidade, false));
    partes.push(voltar);
  });
  caixa.replaceChildren(...partes);
}

// Tirar/voltar vale para todos (fica no sistema), entao refaz a conta pelo sistema.
async function ignorarCidade(cidade, ignorar) {
  try {
    await chamar('POST', '/na-base/ignorar', { cidade, ignorar });
    await carregarAgrupamento();
  } catch (e) {
    if (!(e instanceof R.ErroDeConta)) agrupamento(e.message, true);
  }
}

function mostrarAgrupamento(r) {
  $('agrupamento').hidden = false;
  const completo = r.total > 0 && r.faltam === 0;
  $('ag-mini').textContent = r.total ? pctTexto(r) : '';
  $('ag-mini').classList.toggle('completo', completo);
  const pizza = $('ag-pizza');
  pizza.className = `pizza${completo ? ' completo' : ''}${r.total ? '' : ' vazia'}`;
  pizza.style.setProperty('--pct', Math.min(100, Number(r.porcentagem) || 0));
  $('ag-porcentagem').textContent = r.total ? pctTexto(r) : '—';
  $('ag-conta').textContent = r.total
    ? `${numero(r.agrupados)} de ${numero(r.total)} agrupados${r.faltam ? ` · faltam ${numero(r.faltam)}` : ''}`
    : 'Nenhum recebido hoje "Sem tentativa"';
  $('ag-lido').textContent = r.lido_em
    ? `${numero(r.recebidos)} recebidos hoje · lido às ${horaDe(r.lido_em)}${r.usuario ? ` por ${r.usuario}` : ''}` : '';
  desenharBarras(r.porCidade);
  desenharFora(r.ignoradas);
  pendentesAg = r.pendentes || [];
  const lista = $('ag-lista');
  if (!pendentesAg.length) {
    const v = document.createElement('div');
    v.className = 'vazia';
    v.textContent = r.total ? 'Todos os recebidos hoje foram agrupados.' : 'Nada para agrupar.';
    lista.replaceChildren(v);
    return;
  }
  lista.replaceChildren(...pendentesAg.slice(0, 300).map((p) => {
    const l = document.createElement('div');
    l.className = 'pendente';
    const cod = document.createElement('span');
    cod.textContent = p.codigo || p.id;
    const cid = document.createElement('small');
    cid.textContent = p.cidade || '(sem cidade)';
    cod.append(cid);
    const prazo = document.createElement('em');
    prazo.textContent = dataCurta(p.prazo) ? `prazo ${dataCurta(p.prazo)}` : '';
    l.append(cod, prazo);
    return l;
  }));
  if (pendentesAg.length > 300) {
    const mais = document.createElement('div');
    mais.className = 'vazia';
    mais.textContent = `Mostrando 300 de ${numero(pendentesAg.length)}. "Copiar códigos" leva todos.`;
    lista.append(mais);
  }
}

$('ag-copiar').addEventListener('click', () => {
  const codigos = pendentesAg.map((p) => p.codigo || p.id);
  if (!codigos.length) return agrupamento('Nada para copiar.');
  copiarTexto(codigos.join('\n'))
    .then(() => agrupamento(`${numero(codigos.length)} código(s) copiado(s).`))
    .catch(() => agrupamento('Não deu para copiar.', true));
});

/** A ultima leitura de hoje, com os bipes de agora. */
async function carregarAgrupamento() {
  if (!token) return;
  try {
    const j = await chamar('GET', '/na-base');
    const hoje = j.dia && j.dia === j.hoje && j.bases && j.bases[0];
    if (hoje) mostrarAgrupamento(hoje);
    else semLeitura();
  } catch (e) {
    if (!(e instanceof R.ErroDeConta)) agrupamento(e.message, true);
  }
}

// ── Conferencia Anjun ──────────────────────────────────────────────────────
// "Conferir agora": o anjun.js (no portal) faz a busca da Consulta de pacotes com entrada no
// ponto = hoje, o fundo.js manda ao sistema e o sistema confere (expedido, certo, fora de
// abrangencia) contra a lista login → cidades. Ao abrir a tela, mostra a ultima conta de hoje.
const ROTA_ANJUN = '/macros/anjun-conferencia';
const NOMES_POLO = { cacador: 'Caçador', videira: 'Videira', joacaba: 'Joaçaba' };
const ROTULO_ANJUN = {
  sem_entregador: 'Sem entregador', cidade_errada: 'Cidade errada', usuario_sem_cidade: 'Login sem cidade',
  sem_cidade: 'Sem cidade', fora_abrangencia: 'Fora de abrangência',
};
let pendentesAnjun = [];

async function chamarAbs(metodo, caminho, corpo) {
  try {
    return await R.api(token, metodo, caminho, corpo, fetch, true);
  } catch (e) {
    if (e instanceof R.ErroDeConta) {
      await chrome.storage.session.clear();
      avisarSessao();
      mostrarLogin(e.message);
    }
    throw e;
  }
}

function statusAnjun(texto, erro = false, fim = false) {
  $('an-status').textContent = texto;
  $('an-status').className = erro ? 'mensagem erro' : 'mensagem';
  if (fim) $('an-conferir').disabled = false;
}

$('an-conferir').addEventListener('click', () => {
  $('an-conferir').disabled = true;
  statusAnjun('Pedindo ao portal da Anjun...');
  window.parent.postMessage({ xmOperacao: 'conferirAnjun' }, '*');
});

window.addEventListener('message', (e) => {
  if (e.source !== window.parent || !e.data || e.data.xmOperacao !== 'statusRelatorio' || !e.data.anjun) return;
  statusAnjun(String(e.data.texto || ''), !!e.data.erro, !!e.data.fim);
  // A leitura volta com a visao padrao (todos, para dev/admin); com um polo escolhido, refaz no polo.
  if (e.data.resumo) { if (poloAnjun) carregarAnjun(); else mostrarAnjun(e.data.resumo); }
});

// Dev e admin escolhem o polo (o sistema so aceita deles); a escolha fica guardada neste navegador.
let poloAnjun = '';
chrome.storage.local.get('poloAnjun').then(({ poloAnjun: p }) => { poloAnjun = p || ''; $('an-polo').value = poloAnjun; });
$('an-polo').addEventListener('change', () => {
  poloAnjun = $('an-polo').value;
  chrome.storage.local.set({ poloAnjun });
  carregarAnjun();
});

function anjunVazio(msg) {
  $('an-resultado').hidden = true;
  $('an-pizza').className = 'pizza vazia';
  $('an-porcentagem').textContent = '—';
  $('an-conta').textContent = msg || 'Ainda não conferido hoje';
  $('an-lido').textContent = 'Recebidos no ponto hoje: expedido, certo e fora de abrangência.';
}

/** Barra por cidade: certo (azul), sem entregador (ambar), cidade errada (laranja). */
function barrasAnjun(porCidade) {
  const comPendencia = (porCidade || []).filter((c) => c.total > c.certos).slice(0, MAX_BARRAS);
  const caixa = $('an-barras');
  if (!comPendencia.length) {
    const v = document.createElement('div');
    v.className = 'vazia';
    v.textContent = 'Nenhuma cidade com pendência.';
    return caixa.replaceChildren(v);
  }
  const maior = Math.max(...comPendencia.map((c) => c.total));
  caixa.replaceChildren(...comPendencia.map((c) => {
    const sem = c.total - c.expedidos;
    const outras = c.expedidos - c.certos;
    const l = document.createElement('div');
    l.className = 'barra-cidade';
    l.title = `${c.cidade}: ${numero(c.certos)} certos, ${numero(sem)} sem entregador, ${numero(outras)} com outro problema (de ${numero(c.total)})`;
    const nome = document.createElement('span');
    nome.textContent = c.cidade;
    const trilho = document.createElement('div');
    trilho.className = 'trilho';
    [['cor-ok', c.certos], ['cor-falta', sem], ['cor-errada', outras]].forEach(([cls, n]) => {
      const i = document.createElement('i');
      i.className = cls;
      i.style.width = `${(n / maior) * 100}%`;
      trilho.append(i);
    });
    const n = document.createElement('em');
    n.textContent = numero(sem + outras);
    const tirar = document.createElement('button');
    tirar.type = 'button';
    tirar.className = 'tirar';
    tirar.textContent = 'tirar';
    tirar.title = `Tirar ${c.cidade} da conta (para todos)`;
    tirar.addEventListener('click', () => ignorarAnjun(c.cidade, true));
    l.append(nome, trilho, n, tirar);
    return l;
  }));
}

function foraDaContaAnjun(ignoradas) {
  const caixa = $('an-fora-conta');
  caixa.hidden = !(ignoradas && ignoradas.length);
  if (caixa.hidden) return caixa.replaceChildren();
  const partes = [document.createTextNode('Fora da conta: ')];
  ignoradas.forEach((c, i) => {
    if (i) partes.push(document.createTextNode(' · '));
    partes.push(document.createTextNode(`${c.cidade} (${numero(c.total)}) `));
    const voltar = document.createElement('button');
    voltar.type = 'button';
    voltar.textContent = 'voltar';
    voltar.addEventListener('click', () => ignorarAnjun(c.cidade, false));
    partes.push(voltar);
  });
  caixa.replaceChildren(...partes);
}

async function ignorarAnjun(cidade, ignorar) {
  try {
    await chamarAbs('POST', `${ROTA_ANJUN}/ignorar`, { cidade, ignorar });
    await carregarAnjun();
  } catch (e) {
    if (!(e instanceof R.ErroDeConta)) statusAnjun(e.message, true);
  }
}

function linhaSimples(principal, detalhe, direita, classeDireita = '') {
  const l = document.createElement('div');
  l.className = 'pendente';
  const a = document.createElement('span');
  a.textContent = principal;
  const s = document.createElement('small');
  s.textContent = detalhe;
  a.append(s);
  const d = document.createElement('em');
  d.className = classeDireita;
  d.textContent = direita;
  l.append(a, d);
  return l;
}

function mostrarAnjun(r) {
  if (!r || !r.total) return anjunVazio(r && r.dia ? 'Nenhum pacote recebido hoje neste polo.' : '');
  $('an-resultado').hidden = false;
  const completo = r.nossos > 0 && r.expedidos === r.nossos;
  const pizza = $('an-pizza');
  pizza.className = `pizza${completo ? ' completo' : ''}${r.nossos ? '' : ' vazia'}`;
  pizza.style.setProperty('--pct', Math.min(100, Number(r.pct_expedido) || 0));
  $('an-porcentagem').textContent = `${Number(r.pct_expedido || 0).toLocaleString('pt-BR', DUAS_CASAS)}%`;
  const falta = r.nossos - r.expedidos;
  $('an-conta').textContent = `${numero(r.expedidos)} de ${numero(r.nossos)} expedidos${falta ? ` · faltam ${numero(falta)}` : ''}`;
  const lido = r.leitura;
  $('an-lido').textContent = `${numero(r.total)} recebidos hoje${r.polo ? ` · ${NOMES_POLO[r.polo] || r.polo}` : ' (todos os polos)'}`
    + (lido && lido.lido_em ? ` · lido às ${horaDe(lido.lido_em)}${lido.usuario ? ` por ${lido.usuario}` : ''}` : '');
  const certo = $('an-certo');
  certo.textContent = r.expedidos ? `${Number(r.pct_certo || 0).toLocaleString('pt-BR', DUAS_CASAS)}%` : '—';
  certo.className = r.expedidos && r.certos === r.expedidos ? 'completo' : '';
  const fora = $('an-fora');
  fora.textContent = numero(r.contagem ? r.contagem.fora_abrangencia : 0);
  fora.className = r.contagem && r.contagem.fora_abrangencia ? 'alerta' : 'completo';
  barrasAnjun(r.porCidade);
  foraDaContaAnjun(r.ignoradas);
  $('an-logins-caixa').hidden = !(r.porLogin && r.porLogin.length);
  $('an-logins').replaceChildren(...(r.porLogin || []).map((l) => linhaSimples(l.usuario,
    l.sem_cadastro && !l.erradas ? 'login sem cidade cadastrada' : 'pacote de cidade que ele não faz',
    numero(l.erradas + l.sem_cadastro), 'situacao cidade_errada')));
  pendentesAnjun = r.pendentes || [];
  const lista = $('an-lista');
  if (!pendentesAnjun.length) {
    const v = document.createElement('div');
    v.className = 'vazia';
    v.textContent = 'Nada pendente. Tudo expedido certo.';
    return lista.replaceChildren(v);
  }
  lista.replaceChildren(...pendentesAnjun.slice(0, 300).map((p) => linhaSimples(p.waybill,
    [p.cidade, p.entregador].filter(Boolean).join(' · '), ROTULO_ANJUN[p.status] || p.status, `situacao ${p.status}`)));
  if (pendentesAnjun.length > 300) {
    const mais = document.createElement('div');
    mais.className = 'vazia';
    mais.textContent = `Mostrando 300 de ${numero(pendentesAnjun.length)}. "Copiar waybills" leva todos.`;
    lista.append(mais);
  }
}

$('an-copiar').addEventListener('click', () => {
  const codigos = pendentesAnjun.map((p) => p.waybill);
  if (!codigos.length) return statusAnjun('Nada para copiar.');
  copiarTexto(codigos.join('\n'))
    .then(() => statusAnjun(`${numero(codigos.length)} waybill(s) copiado(s).`))
    .catch(() => statusAnjun('Não deu para copiar.', true));
});

/** A ultima conta de hoje (refeita no sistema com a lista de cidades atual). */
async function carregarAnjun() {
  if (!token) return;
  try {
    const j = await chamarAbs('GET', `${ROTA_ANJUN}${poloAnjun ? `?polo=${encodeURIComponent(poloAnjun)}` : ''}`);
    $('an-polo').hidden = !j.ve_tudo;
    if (j.dia && j.dia === j.hoje) mostrarAnjun(j);
    else anjunVazio();
  } catch (e) {
    if (!(e instanceof R.ErroDeConta)) statusAnjun(e.message, true);
  }
}

// ── Conferencia Shopee ─────────────────────────────────────────────────────
// "Conferir agora" no SPX: o sistema manda os BR do romaneio de hoje (do polo), o shopee.js
// pesquisa esses BR e lista as ATs de hoje no proprio SPX, e o sistema faz a conta. Ao abrir a
// tela, mostra a ultima conta de hoje. Dev/admin escolhem o polo (os outros veem o do cadastro).
const ROTA_SHOPEE = '/macros/shopee-conferencia';
let poloShopee = '';
let dadosShopee = null;
let listaShopee = 'sem_at'; // o que a lista mostra: 'sem_at' | 'nao_recebido' (com ou sem AT)
const LISTAS_SHOPEE = { sem_at: ['recebido_sem_at', 'Recebido - Sem AT'], nao_recebido: ['nao_recebido', 'Enviado - Não recebido'] };
chrome.storage.local.get('poloShopee').then(({ poloShopee: p }) => { poloShopee = p || ''; $('sh-polo').value = poloShopee; });
$('sh-polo').addEventListener('change', () => {
  poloShopee = $('sh-polo').value;
  chrome.storage.local.set({ poloShopee });
  carregarShopee();
});

function statusShopee(texto, erro = false, fim = false) {
  $('sh-status').textContent = texto;
  $('sh-status').className = erro ? 'mensagem erro' : 'mensagem';
  if (fim) $('sh-conferir').disabled = false;
}

$('sh-conferir').addEventListener('click', () => {
  $('sh-conferir').disabled = true;
  statusShopee('Começando...');
  window.parent.postMessage({ xmOperacao: 'conferirShopee', polo: poloShopee }, '*');
});

window.addEventListener('message', (e) => {
  if (e.source !== window.parent || !e.data || e.data.xmOperacao !== 'statusRelatorio' || !e.data.shopee) return;
  statusShopee(String(e.data.texto || ''), !!e.data.erro, !!e.data.fim);
  if (e.data.resumo) mostrarShopee(e.data.resumo);
});

const pct2 = (v) => `${Number(v || 0).toLocaleString('pt-BR', DUAS_CASAS)}%`;
const horaCurta = (seg) => (seg ? new Date(seg * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');

function shopeeVazio(msg) {
  $('sh-resultado').hidden = true;
  $('sh-pizza').className = 'pizza vazia';
  $('sh-porcentagem').textContent = '—';
  $('sh-conta').textContent = msg || 'Ainda não conferido hoje';
  $('sh-lido').textContent = 'Romaneio de hoje x SPX: AT vinculada, recebidos e divergências.';
}

/** Uma linha de barra simples: nome, trilho, numero (e um extra no fim). */
function barraSimples(nome, partes, maior, numeroTexto, aoClicar, extra) {
  const l = document.createElement('div');
  l.className = `barra-cidade${aoClicar ? ' clicavel' : ''}`;
  const n = document.createElement('span');
  n.textContent = nome;
  if (extra) { const t = document.createElement('em'); t.className = 'fora-tag'; t.textContent = extra; n.append(t); }
  const trilho = document.createElement('div');
  trilho.className = 'trilho';
  partes.forEach(([cls, v]) => { const i = document.createElement('i'); i.className = cls; i.style.width = `${(v / maior) * 100}%`; trilho.append(i); });
  const num = document.createElement('em');
  num.textContent = numeroTexto;
  const fim = document.createElement('span');
  l.append(n, trilho, num, fim);
  if (aoClicar) l.addEventListener('click', aoClicar);
  return l;
}

function fluxoShopee(f) {
  const caixa = $('sh-fluxo');
  if (!f || !f.horas.length) { caixa.textContent = 'Sem horários ainda.'; return; }
  // Tudo no laranja da Shopee (cor da transportadora): o nome da linha já diz a etapa.
  const SHOPEE_RGB = '249, 115, 22';
  const linhas = [['Recebimento', f.recebimento, SHOPEE_RGB], ['Atribuição', f.atribuicao, SHOPEE_RGB], ['Expedição', f.expedicao, SHOPEE_RGB]];
  const maior = Math.max(1, ...linhas.flatMap(([, v]) => v));
  const tabela = document.createElement('table');
  const cab = document.createElement('tr');
  cab.append(document.createElement('th'));
  let diaAnterior = '';
  f.horas.forEach((h) => {
    const th = document.createElement('th');
    const [dia, hora] = h.split(' ');
    th.textContent = `${dia !== diaAnterior ? `${dia.slice(8, 10)}/${dia.slice(5, 7)} ` : ''}${hora}h`;
    diaAnterior = dia;
    cab.append(th);
  });
  const thTotal = document.createElement('th');
  thTotal.textContent = 'Total';
  cab.append(thTotal);
  tabela.append(cab);
  linhas.forEach(([nome, valores, rgb]) => {
    const tr = document.createElement('tr');
    const etapa = document.createElement('td');
    etapa.className = 'etapa';
    etapa.textContent = nome;
    tr.append(etapa);
    valores.forEach((v) => {
      const td = document.createElement('td');
      td.textContent = numero(v);
      td.style.background = v ? `rgba(${rgb}, ${0.15 + 0.75 * (v / maior)})` : 'var(--campo)';
      tr.append(td);
    });
    const tot = document.createElement('td');
    tot.className = 'total';
    tot.textContent = numero(valores.reduce((a, b) => a + b, 0));
    tr.append(tot);
    tabela.append(tr);
  });
  caixa.replaceChildren(tabela);
}

function listaDivergenciasShopee() {
  const r = dadosShopee || {};
  const semAt = listaShopee === 'sem_at';
  const [campo, titulo] = LISTAS_SHOPEE[listaShopee];
  const itens = r[campo] || [];
  $('sh-lista-titulo').textContent = titulo;
  const lista = $('sh-lista');
  if (!itens.length) {
    const v = document.createElement('div');
    v.className = 'vazia';
    v.textContent = 'Nenhum.';
    return lista.replaceChildren(v);
  }
  lista.replaceChildren(...itens.slice(0, 300).map((p) => linhaSimples(p.codigo,
    semAt ? `recebido às ${horaCurta(p.recebido_em)}${p.motorista ? ` · ${p.motorista}` : ''}` : (p.achado_no_spx ? (p.estacao ? `está em ${p.estacao}` : 'no SPX, sem recebimento') : 'não achado no SPX') + (p.at ? ` · na ${p.at}` : ''),
    '', '')));
  if (itens.length > 300) {
    const mais = document.createElement('div');
    mais.className = 'vazia';
    mais.textContent = `Mostrando 300 de ${numero(itens.length)}. "Copiar BR" leva todos.`;
    lista.append(mais);
  }
}

function mostrarShopee(r) {
  dadosShopee = r;
  if (!r || !r.total) return shopeeVazio(r && r.dia ? 'Nenhum BR no romaneio deste dia/polo.' : '');
  $('sh-resultado').hidden = false;
  const completo = r.em_at === r.total;
  const pizza = $('sh-pizza');
  pizza.className = `pizza${completo ? ' completo' : ''}`;
  pizza.style.setProperty('--pct', Math.min(100, Number(r.pct_at) || 0));
  $('sh-porcentagem').textContent = pct2(r.pct_at);
  $('sh-conta').textContent = `${numero(r.em_at)} de ${numero(r.total)} com AT${r.total - r.em_at ? ` · faltam ${numero(r.total - r.em_at)}` : ''}`;
  const lido = r.leitura;
  $('sh-lido').textContent = `% AT vinculada${r.polo ? ` · ${NOMES_POLO[r.polo] || r.polo}` : ' (todos os polos)'}`
    + (lido && lido.lido_em ? ` · lido às ${horaDe(lido.lido_em)}${lido.usuario ? ` por ${lido.usuario}` : ''}` : '');
  $('sh-total').textContent = numero(r.total);
  $('sh-recebidos').textContent = numero(r.recebidos);
  $('sh-recebidos-pct').textContent = `recebidos · ${pct2(r.pct_recebidos)} do romaneio`;
  const div = $('sh-divergencias');
  div.textContent = numero(r.divergencias);
  div.className = r.divergencias ? 'alerta' : 'completo';
  const fora = $('sh-fora');
  fora.textContent = numero(r.fora_abrangencia);
  fora.className = r.fora_abrangencia ? 'alerta' : 'completo';
  $('sh-fora-txt').textContent = r.fora_abrangencia
    ? `fora de abrangência · ${(r.fora || []).slice(0, 2).map((f) => f.cidade).join(', ')}` : 'fora de abrangência · nenhum';
  // Divergencias por tipo (clicar troca a lista de baixo).
  const tipos = [['sem_at', 'Recebido - Sem AT', (r.recebido_sem_at || []).length], ['nao_recebido', 'Enviado - Não recebido', (r.nao_recebido || []).length]];
  const maiorTipo = Math.max(1, ...tipos.map(([, , n]) => n));
  $('sh-tipos').replaceChildren(...tipos.map(([k, nome, n]) => barraSimples(nome, [['cor-falta', n]], maiorTipo,
    `${numero(n)}`, () => { listaShopee = k; listaDivergenciasShopee(); }, r.divergencias ? `${Math.floor((n * 100) / r.divergencias)}%` : '')));
  // Cidades nas ATs (as que tem mais pacotes); fora de abrangencia marcada.
  const cidades = (r.porCidade || []).slice(0, MAX_BARRAS);
  const maiorCidade = Math.max(1, ...cidades.map((c) => c.total));
  $('sh-cidades').replaceChildren(...(cidades.length ? cidades.map((c) => barraSimples(c.cidade, [[c.fora ? 'cor-falta' : 'cor-ok', c.total]], maiorCidade,
    numero(c.total), null, c.fora ? 'fora' : '')) : [Object.assign(document.createElement('div'), { className: 'vazia', textContent: 'Nenhuma AT de hoje com BR do romaneio.' })]));
  fluxoShopee(r.fluxo);
  listaDivergenciasShopee();
}

// Relatório de divergências com as mesmas colunas do da Shopee (pedido do usuário, 18/11/2026).
// Gerado aqui com o que a tela já tem: nada é baixado do SPX.
const XPT_DO_POLO = { cacador: 'XPT_SC_Caçador', videira: 'XPT_SC_Videira', joacaba: 'XPT_SC_Joaçaba' };
const celulaCsv = (v) => { const t = String(v == null || v === '' ? '—' : v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

function csvDivergenciasShopee(r) {
  const manifesto = XPT_DO_POLO[r.polo] || 'Todos os polos';
  const cab = ['Manifesto/Operação', 'Tracking Number', 'Número da TO', 'Comprador', 'Cidade', 'Bairro', 'Cluster', 'Motorista', 'AT (rota)', 'Localização atual', 'Status'];
  const linhas = [
    ...(r.recebido_sem_at || []).map((p) => [manifesto, p.codigo, p.to, p.comprador, p.cidade, p.bairro, p.cluster, p.motorista, '', p.estacao, 'Recebido - Sem AT']),
    ...(r.nao_recebido || []).map((p) => [manifesto, p.codigo, p.to, p.comprador, p.cidade, p.bairro, p.cluster, p.motorista, p.at,
      p.achado_no_spx ? p.estacao : 'não achado no SPX', /^soc/i.test(p.estacao || '') ? 'Enviado SOC - Não recebido' : 'Enviado - Não recebido']),
  ];
  return String.fromCharCode(0xfeff) + [cab.join(';'), ...linhas.map((l) => l.map(celulaCsv).join(';'))].join('\r\n');
}

$('sh-baixar').addEventListener('click', () => {
  const r = dadosShopee || {};
  if (!r.divergencias) return statusShopee('Nenhuma divergência para baixar.');
  const [ano, mes, dia] = String(r.dia || '').split('-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csvDivergenciasShopee(r)], { type: 'text/csv;charset=utf-8' }));
  a.download = `${dia}-${mes}-${ano}_${XPT_DO_POLO[r.polo] || 'Todos'}_Divergências.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  statusShopee(`Relatório com ${numero(r.divergencias)} divergência(s) baixado.`);
});

$('sh-copiar').addEventListener('click', () => {
  const r = dadosShopee || {};
  const codigos = (r[LISTAS_SHOPEE[listaShopee][0]] || []).map((p) => p.codigo);
  if (!codigos.length) return statusShopee('Nada para copiar.');
  copiarTexto(codigos.join('\n'))
    .then(() => statusShopee(`${numero(codigos.length)} BR copiado(s).`))
    .catch(() => statusShopee('Não deu para copiar.', true));
});

async function carregarShopee() {
  if (!token) return;
  try {
    const j = await chamarAbs('GET', `${ROTA_SHOPEE}${poloShopee ? `?polo=${encodeURIComponent(poloShopee)}` : ''}`);
    $('sh-polo').hidden = !j.ve_tudo;
    if (j.dia && j.dia === j.hoje) mostrarShopee(j);
    else shopeeVazio();
  } catch (e) {
    if (!(e instanceof R.ErroDeConta)) statusShopee(e.message, true);
  }
}

/**
 * Copia para a area de transferencia. O painel roda num quadro dentro do site da transportadora:
 * o clipboard moderno pode ser barrado ali, entao cai no jeito antigo (textarea + copy).
 */
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return;
  } catch { /* tenta o jeito antigo */ }
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.append(campo);
  campo.select();
  const ok = document.execCommand('copy');
  campo.remove();
  if (!ok) throw new Error('nao copiou');
}

async function comecar() {
  const guardado = await chrome.storage.local.get(['areasAbertas', 'tela']);
  if (Array.isArray(guardado.areasAbertas)) areasAbertas = guardado.areasAbertas;
  if (TELA_DO_SITE) telaAtual = TELA_DO_SITE;
  else if (guardado.tela && guardado.tela !== 'inicio') telaAtual = guardado.tela;
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
