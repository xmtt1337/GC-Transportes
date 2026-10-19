// Quais macros estao agendados nesta maquina, e quando roda o proximo (logica.js).
//
//   node --test automacao/alimentacao/testes/test_agendados.test.js
//
// O que se protege: a tela "Em execucao" mostra todo macro ATIVO, nao so o que esta rodando no
// segundo exato - e a hora da proxima rodada sai do alarme que o Chrome tem de verdade. O Pedidos
// nao tem alarme proprio (vai encadeado na AT) e o Backlog "junto" roda com ela.

const test = require('node:test');
const assert = require('node:assert');
const L = require('../extensao-macros-spx/logica.js');

const AGENDA = {
  at: { modo: 'intervalo', minutos: 30, horarios: [] },
  backlog: { modo: 'horarios', minutos: 60, horarios: [{ hora: 8, minuto: 0 }, { hora: 15, minuto: 0 }] },
};

test('a AT agendada traz a hora do alarme e a cadencia; o Pedidos vem encadeado nela', () => {
  const r = L.agendadosDosAlarmes([{ name: 'alimentacao', scheduledTime: 1000 }, { name: 'comandos', scheduledTime: 5 }], AGENDA);
  assert.deepStrictEqual(r, [
    { macro: 'alimentacao', proxima_em: 1000, modo: 'intervalo', minutos: 30 },
    { macro: 'pedidos', proxima_em: 1000, modo: 'encadeado' },
  ]);
});

test('o Backlog com alarme proprio traz a hora dele e quantos horarios tem', () => {
  const r = L.agendadosDosAlarmes([{ name: 'backlog', scheduledTime: 2000 }], AGENDA);
  assert.deepStrictEqual(r, [{ macro: 'backlog', proxima_em: 2000, modo: 'horarios', horarios: 2 }]);
});

test('Backlog "junto" roda com a AT, na hora dela', () => {
  const r = L.agendadosDosAlarmes([{ name: 'alimentacao', scheduledTime: 1000 }], { ...AGENDA, backlog: { modo: 'junto' } });
  assert.deepStrictEqual(r.find((x) => x.macro === 'backlog'), { macro: 'backlog', proxima_em: 1000, modo: 'junto' });
});

test('sem alarme nenhum (agenda desligada ou outra maquina escolhida), nada agendado', () => {
  assert.deepStrictEqual(L.agendadosDosAlarmes([{ name: 'comandos', scheduledTime: 1 }], AGENDA), []);
  assert.deepStrictEqual(L.agendadosDosAlarmes(null, null), []);
});

test('ultimoDoMacro guarda so o desfecho, nunca o "rodando"', () => {
  assert.strictEqual(L.ultimoDoMacro({ macro: 'backlog', estado: 'rodando' }), null);
  assert.deepStrictEqual(L.ultimoDoMacro({ macro: 'backlog', estado: 'ok', passo: 'baixado', terminou_em: 9, xpt: 'XPT_CFC', linhas: [] }),
    { estado: 'ok', passo: 'baixado', terminou_em: 9, xpt: 'XPT_CFC' });
});
