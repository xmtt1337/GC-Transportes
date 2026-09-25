// Testes do gancho do painel do macro que conta ao sistema como o macro TERMINOU.
//
//   node --test automacao/alimentacao/testes/test_painel_eventos.test.js
//
// Antes, "o macro falhou" ficava so na janelinha da aba do SPX - que ninguem estava olhando quando
// o macro quebrou de madrugada. Agora todo ok/erro do painel vai pro sistema (por service worker
// -> vigia). O que se protege:
//   - cada macro conta com o NOME dele (a tela mostra o problema na linha certa);
//   - "parado por voce" e aviso, nao erro (foi a pessoa que apertou Parar);
//   - contar e ACESSORIO: se a mensagem falhar, o painel continua funcionando igual;
//   - so os passos finais contam (ok/erro) - passo e nota nao enchem o sistema de evento.
//
// painel.js roda de verdade, com um DOM de mentira. Dados de TESTE.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PASTA = path.join(__dirname, '..', 'extensao-macros-spx');
const L = require('../extensao-macros-spx/logica.js');

function elemento() {
  const buscas = {};
  const o = {
    children: [], style: {}, textContent: '', innerHTML: '', className: '', id: '', scrollTop: 0, scrollHeight: 0,
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { o.children.push(c); return c; },
    append(...c) { o.children.push(...c); },
    remove() {}, addEventListener() {}, attachShadow() { return elemento(); },
    querySelector(sel) { return buscas[sel] || (buscas[sel] = elemento()); },
  };
  return o;
}

function carregar({ enviar } = {}) {
  const mensagens = [];
  const ctx = vm.createContext({
    console: { log() {}, error() {}, warn() {} },
    document: { createElement: elemento, documentElement: elemento(), getElementById: () => null },
    setInterval: () => 1, clearInterval() {},
    chrome: { runtime: { sendMessage: (m) => { mensagens.push(m); return enviar ? enviar(m) : Promise.resolve({ ok: true }); } } },
  });
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'logica.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'painel.js'), 'utf8'), ctx, { filename: 'painel.js' });
  return { P: ctx.XMMacro.painel, mensagens };
}

const plano = (x) => JSON.parse(JSON.stringify(x));

// ── o painel ──────────────────────────────────────────────────────────────
test('o macro que termina bem conta ok, com o nome do macro', () => {
  const { P, mensagens } = carregar();
  P.abrir('AT Exportada', () => {});
  P.ok('baixado: Br AT Romaneio V2');
  assert.deepStrictEqual(plano(mensagens), [{ xmEvento: {
    macro: 'alimentacao', nivel: 'ok', texto: 'baixado: Br AT Romaneio V2' } }]);
});

test('cada macro conta com o proprio nome', () => {
  for (const [titulo, macro] of [['AT Exportada', 'alimentacao'], ['Pedidos Pesquisados', 'pedidos'], ['Backlog', 'backlog']]) {
    const { P, mensagens } = carregar();
    P.abrir(titulo, () => {});
    P.erro('deu ruim');
    assert.strictEqual(mensagens[0].xmEvento.macro, macro, titulo);
    assert.strictEqual(mensagens[0].xmEvento.nivel, 'erro');
  }
});

test('o erro do macro leva o motivo inteiro (e o que a pessoa precisa pra agir)', () => {
  const { P, mensagens } = carregar();
  P.abrir('Backlog', () => {});
  P.erro('o ícone de baixar do "Backlog" ainda não foi ensinado — abra o popup e clique em "Ensinar o Backlog"');
  assert.match(mensagens[0].xmEvento.texto, /ainda não foi ensinado/);
});

test('"parado por voce" e aviso, nao erro', () => {
  const { P, mensagens } = carregar();
  P.abrir('Pedidos Pesquisados', () => {});
  P.erro('parado por você');
  assert.strictEqual(mensagens[0].xmEvento.nivel, 'aviso');
});

test('passo e nota nao contam nada - so o desfecho', () => {
  const { P, mensagens } = carregar();
  P.abrir('AT Exportada', () => {});
  P.passo('1/5 · filtrando o dia');
  P.nota('tela aberta');
  assert.strictEqual(mensagens.length, 0);
});

test('macro que nao esta no catalogo (titulo desconhecido) nao conta', () => {
  const { P, mensagens } = carregar();
  P.abrir('Outro Macro Qualquer', () => {});
  P.ok('feito');
  P.erro('falhou');
  assert.strictEqual(mensagens.length, 0);
});

test('ok/erro sem ter aberto o painel nao contam (sem titulo, sem macro)', () => {
  const { P, mensagens } = carregar();
  P.ok('x');
  P.erro('y');
  assert.strictEqual(mensagens.length, 0);
});

test('mensagem que falha NAO atrapalha o painel (contar e acessorio)', async () => {
  const { P } = carregar({ enviar: () => Promise.reject(new Error('extensao recarregada')) });
  P.abrir('AT Exportada', () => {});
  assert.doesNotThrow(() => P.ok('baixado'));
  assert.doesNotThrow(() => P.erro('falhou'));
  await new Promise((r) => setImmediate(r));   // a rejeicao engolida nao pode virar erro do processo
});

test('sendMessage que ESTOURA na hora (contexto da extensao invalidado) tambem nao atrapalha', () => {
  const { P } = carregar({ enviar: () => { throw new Error('Extension context invalidated'); } });
  P.abrir('Backlog', () => {});
  assert.doesNotThrow(() => P.ok('feito'));
});

test('sem chrome.runtime (fora da extensao) nada estoura', () => {
  const ctx = vm.createContext({
    console: { log() {}, error() {} },
    document: { createElement: elemento, documentElement: elemento(), getElementById: () => null },
    setInterval: () => 1, clearInterval() {},
  });
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'logica.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'painel.js'), 'utf8'), ctx);
  ctx.XMMacro.painel.abrir('AT Exportada', () => {});
  assert.doesNotThrow(() => ctx.XMMacro.painel.ok('x'));
});

// ── a conta pura ──────────────────────────────────────────────────────────
test('eventoDoPainel: ok, erro, aviso e o que ignora', () => {
  assert.deepStrictEqual(L.eventoDoPainel('Backlog', 'ok', ' feito '), { macro: 'backlog', nivel: 'ok', texto: 'feito' });
  assert.strictEqual(L.eventoDoPainel('Backlog', 'erro', 'x').nivel, 'erro');
  assert.strictEqual(L.eventoDoPainel('Backlog', 'erro', 'Parado por você').nivel, 'aviso', 'sem depender da caixa');
  assert.strictEqual(L.eventoDoPainel('Backlog', 'erro', 'ok, parado por você aqui').nivel, 'erro', 'so vale no comeco');
  assert.strictEqual(L.eventoDoPainel('Backlog', 'ok', ''), null);
  assert.strictEqual(L.eventoDoPainel('Backlog', 'ok', '   '), null);
  assert.strictEqual(L.eventoDoPainel('Backlog', 'ok', null), null);
  assert.strictEqual(L.eventoDoPainel('Nao existe', 'ok', 'x'), null);
});

test('eventoDoPainel: titulo que e propriedade do objeto nao vira macro', () => {
  for (const titulo of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.strictEqual(L.eventoDoPainel(titulo, 'ok', 'x'), null, titulo);
  }
});

test('os titulos do catalogo sao os que os macros realmente usam', () => {
  // Se um macro mudar o titulo do painel sem mudar o catalogo, ele deixa de contar - em silencio.
  const usados = ['alimentacao.js', 'pedidos.js', 'backlog.js'].map((f) =>
    /P\.abrir\('([^']+)'/.exec(fs.readFileSync(path.join(PASTA, f), 'utf8'))[1]);
  assert.deepStrictEqual(usados.sort(), Object.keys(L.MACRO_DO_PAINEL).sort());
});
