// Teste da parte de "quantas rodadas" do macro de Pedidos Pesquisados.
//
//   node --test automacao/testes/test_macro_pedidos.test.js
//
// Contexto do porque isso existe (23/09/2026): o pendente empacou em ~12 mil
// por 5 dias porque o macro so tentava um lote gigante (10 mil) de uma vez so,
// e nenhuma das 8 tentativas completou. O conserto foi lote menor (2000) mais
// varias rodadas automaticas dentro do mesmo clique - e "quando repetir, e
// quando parar" e exatamente o tipo de conta que erra em silencio (o macro
// simplesmente para cedo demais, ou fica girando pra sempre, e so se percebe
// olhando o banco dias depois). So dela que este arquivo testa: nao ha tela
// nem rede aqui, do mesmo jeito que test_macro_alimentacao.test.js.

const { test } = require('node:test');
const assert = require('node:assert');

const Pedidos = require('../extensao-macros-spx/pedidos.js');

test('pede mais uma rodada quando sobrou pendente fora do lote', () => {
  // 12248 no total, so 2000 pegos nesta rodada -> sobrou 10248 la fora.
  assert.ok(Pedidos.precisaMaisUmaRodada(12248, 2000, 1));
});

test('nao pede mais rodada quando o lote pegou tudo que tinha', () => {
  // ultimo pedaco: sobrou exatamente 248, e essa rodada pegou os 248.
  assert.ok(!Pedidos.precisaMaisUmaRodada(248, 248, 3));
});

test('nao pede mais rodada quando o lote pegou MAIS do que o total informado', () => {
  // nao deveria acontecer, mas total <= pegos e sempre "acabou", nunca "sobrou".
  assert.ok(!Pedidos.precisaMaisUmaRodada(100, 2000, 1));
});

test('respeita o teto de rodadas mesmo com pendente sobrando', () => {
  // Isso e o que evita girar pra sempre se algo estiver quebrado de verdade -
  // mesmo com uma pilha enorme de pendente, para na rodada de numero 8.
  assert.ok(!Pedidos.precisaMaisUmaRodada(999999, 2000, 8));
  assert.ok(!Pedidos.precisaMaisUmaRodada(999999, 2000, 9));
});

test('ainda libera a rodada logo antes do teto', () => {
  assert.ok(Pedidos.precisaMaisUmaRodada(999999, 2000, 7));
});

test('aguenta total/pegos vindo como texto (json de ida e volta)', () => {
  assert.ok(Pedidos.precisaMaisUmaRodada('12248', '2000', 1));
  assert.ok(!Pedidos.precisaMaisUmaRodada('248', '248', 3));
});

test('um backlog de 12248 com lote de 2000 cabe dentro do teto de 8 rodadas', () => {
  // A conta que motivou o teto escolhido: com MAX_POR_VEZ=2000 (constante do
  // proprio pedidos.js), o backlog real de 23/09/2026 precisa de 7 rodadas
  // (6 cheias de 2000 + 1 de 248) - o teto de 8 sobra uma de folga.
  const MAX_POR_VEZ = 2000;
  let restante = 12248;
  let rodadas = 0;
  while (restante > 0) {
    rodadas++;
    const pegos = Math.min(MAX_POR_VEZ, restante);
    const totalAntes = restante;
    restante -= pegos;
    if (!Pedidos.precisaMaisUmaRodada(totalAntes, pegos, rodadas)) break;
  }
  assert.strictEqual(rodadas, 7);
  assert.strictEqual(restante, 0);
});
