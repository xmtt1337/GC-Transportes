// Testes do padrao embutido do que se ENSINA na extensao (aprender.js).
//
//   node --test automacao/alimentacao/testes/test_aprender_padrao.test.js
//
// O que fica ensinado mora no armazenamento do Chrome de cada computador, nao na pasta da
// extensao. Levar a extensao pra outro computador (o HD XM) comecava sem nada ensinado, e o
// Backlog parava com "o icone de baixar ainda nao foi ensinado" (25/09/2026). O padrao embutido
// e o que estava ensinado e funcionando no computador principal.
//
// O que se protege:
//   - maquina sem nada ensinado acha o icone/setinha/item pelo padrao;
//   - o que a pessoa ENSINAR sempre ganha do padrao (a Shopee muda o layout: "ensina de novo");
//   - o padrao tambem aguenta a troca do sufixo de build do CSS Modules (seletor tolerante);
//   - o padrao do "item" bate com o texto que a extensao exige - senao ele se apagaria sozinho;
//   - o padrao nao inventa macro que nao existe.
//
// aprender.js roda de verdade, num contexto isolado, com document e chrome falsos.
// Dados de TESTE, inventados.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PASTA = path.join(__dirname, '..', 'extensao-macros-spx');

function carregar({ armazenado = {}, pagina = {} } = {}) {
  const guardado = { ...armazenado };
  const consultas = [];
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    chrome: { storage: { local: {
      async get(chave) { return chave in guardado ? { [chave]: guardado[chave] } : {}; },
      async set(o) { Object.assign(guardado, o); },
    } } },
    // `pagina`: seletor -> elementos que ele acha. Seletor fora do mapa nao acha nada.
    document: { querySelectorAll(seletor) { consultas.push(seletor); return pagina[seletor] || []; } },
  });
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'logica.js'), 'utf8'), ctx);
  ctx.XMMacro.spx = {};   // aprender.js so usa o spx dentro de funcoes que estes testes nao chamam
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'aprender.js'), 'utf8'), ctx, { filename: 'aprender.js' });
  return { A: ctx.XMMacro.aprender, guardado, consultas };
}

const el = (texto = '') => ({ textContent: texto });
// Array criado dentro do vm tem outro prototipo: converte antes de comparar.
const achar = (A, qual) => Array.from(A.elementosEnsinados(qual));

const PADRAO_BACKLOG = 'div.index_download-action-icon__2izcz svg path';
const PADRAO_SETA = 'span.ssc-react-icon.ssc-react-icon-down-outline.ssc-react-table-selection-menu-icon svg';
const PADRAO_ITEM = 'div.ssc-react-popup.ssc-react-table-selection-menu-popup ' +
                    'div.ssc-react-popup-main div.ssc-react-table-selection-menu-item';

test('maquina sem nada ensinado acha o icone do Backlog pelo padrao', async () => {
  const icone = el();
  const { A } = carregar({ pagina: { [PADRAO_BACKLOG]: [icone] } });
  await A.carregar();
  assert.deepStrictEqual(achar(A, 'backlog'), [icone]);
});

test('maquina sem nada ensinado acha a setinha e o item da AT pelo padrao', async () => {
  const seta = el();
  const item = el('Select All in All Pages');
  const { A } = carregar({ pagina: { [PADRAO_SETA]: [seta], [PADRAO_ITEM]: [item] } });
  await A.carregar();
  assert.deepStrictEqual(achar(A, 'seta'), [seta]);
  assert.deepStrictEqual(achar(A, 'item'), [item]);
});

test('o que foi ensinado GANHA do padrao', async () => {
  const doPadrao = el();
  const ensinado = el();
  const { A, consultas } = carregar({
    armazenado: { ensinados: { backlog: { seletor: 'button.ensinado-por-mim', texto: '' } } },
    pagina: { [PADRAO_BACKLOG]: [doPadrao], 'button.ensinado-por-mim': [ensinado] },
  });
  await A.carregar();
  assert.deepStrictEqual(achar(A, 'backlog'), [ensinado]);
  assert.ok(!consultas.includes(PADRAO_BACKLOG), 'nem olhou o padrao');
});

test('ensinar um macro nao apaga o padrao dos outros', async () => {
  const seta = el();
  const { A } = carregar({
    armazenado: { ensinados: { backlog: { seletor: 'button.x', texto: '' } } },
    pagina: { [PADRAO_SETA]: [seta] },
  });
  await A.carregar();
  assert.deepStrictEqual(achar(A, 'seta'), [seta], 'a setinha segue no padrao');
});

test('o padrao aguenta a troca do sufixo de build da Shopee (seletor tolerante)', async () => {
  const icone = el();
  // A Shopee trocou "2izcz" por outro hash: o seletor exato nao acha, o tolerante acha.
  const { A } = carregar({ pagina: { 'div[class*="index_download-action-icon"] svg path': [icone] } });
  await A.carregar();
  assert.deepStrictEqual(achar(A, 'backlog'), [icone]);
});

test('tela sem o icone (outra tela) nao acha nada - nao chuta outro elemento', async () => {
  const { A } = carregar({ pagina: { 'button.qualquer': [el()] } });
  await A.carregar();
  assert.deepStrictEqual(achar(A, 'backlog'), []);
});

test('o texto do padrao do item e o que a extensao exige (senao ele se apagaria sozinho)', async () => {
  const errado = el('Select All in Current Page');
  const { A } = carregar({ pagina: { [PADRAO_ITEM]: [errado] } });
  await A.carregar();
  // "Select All in Current Page" tem o MESMO seletor e nao pode ser escolhido.
  assert.deepStrictEqual(achar(A, 'item'), []);
  assert.strictEqual(A.padrao.item.texto, 'Select All in All Pages');
});

test('macro que nao existe nao tem padrao', async () => {
  const { A } = carregar();
  await A.carregar();
  assert.deepStrictEqual(achar(A, 'qualquer-outro'), []);
  assert.strictEqual(A.seletorDe('qualquer-outro'), null);
});

test('so existem padroes para os tres macros conhecidos', () => {
  const { A } = carregar();
  assert.deepStrictEqual(Object.keys(A.padrao).sort(), ['backlog', 'item', 'seta']);
});

test('seletorDe e textoDe passam a enxergar o padrao (o diagnostico mostra o que vale)', async () => {
  const { A } = carregar();
  await A.carregar();
  assert.strictEqual(A.seletorDe('backlog'), PADRAO_BACKLOG);
  assert.strictEqual(A.textoDe('item'), 'Select All in All Pages');
});
