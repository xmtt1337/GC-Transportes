// Estacao logada no SPX (embaixo da logo) -> XPT do sistema. logica.js.
//
//   node --test automacao/alimentacao/testes/test_estacao.test.js

const test = require('node:test');
const assert = require('node:assert');
const L = require('../extensao-macros-spx/logica.js');

test('estacaoNoTexto acha o nome da estacao no meio do texto da pagina', () => {
  assert.strictEqual(L.estacaoNoTexto('Shopee Xpress LIVE\nXPT_SC_Caçador\nBusca'), 'XPT_SC_Caçador');
  assert.strictEqual(L.estacaoNoTexto('XPT_SC_Videira'), 'XPT_SC_Videira');
});

test('estacaoNoTexto sem estacao devolve null', () => {
  assert.strictEqual(L.estacaoNoTexto('adm.xpt-cfc-01@shopeemobile-external.com'), null);
  assert.strictEqual(L.estacaoNoTexto(null), null);
});

test('xptDaEstacao: Caçador com ou sem cedilha e XPT_CFC; Videira e XPT_VIA', () => {
  assert.strictEqual(L.xptDaEstacao('XPT_SC_Caçador'), 'XPT_CFC');
  assert.strictEqual(L.xptDaEstacao('XPT_SC_Cacador'), 'XPT_CFC');
  assert.strictEqual(L.xptDaEstacao('xpt_sc_videira'), 'XPT_VIA');
});

test('xptDaEstacao: estacao que o sistema nao conhece devolve null', () => {
  assert.strictEqual(L.xptDaEstacao('XPT_SC_Joacaba'), null);
  assert.strictEqual(L.xptDaEstacao(null), null);
});
