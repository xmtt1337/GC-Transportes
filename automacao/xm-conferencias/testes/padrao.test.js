// node --test testes/*.test.js  (dados inventados)
// A tela padrão das conferências (padrao/conferencia-padrao.js): como agrupa e conta os pedidos,
// o texto de cada situação, a busca, e que o arquivo é o mesmo do sistema (meusite/js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../extensao/padrao/conferencia-padrao.js');

const EXT = path.join(__dirname, '../extensao');

// Uma resposta do sistema, no formato da conta padrão (sistema-backend/modules/conferencia-padrao).
const RESUMO = {
  pacotes: [
    { waybill: 'T1', cidade: 'Cidade A', entregador: 'Entregador A', status: 'ok' },
    { waybill: 'T2', cidade: 'Cidade A', entregador: 'Entregador A', status: 'ok' },
    { waybill: 'T3', cidade: 'Cidade B', entregador: 'Entregador A', status: 'cidade_errada' },
    { waybill: 'T4', cidade: 'Cidade A', status: 'sem_entregador', status_pacote: 'Recebido no DS' },
    { waybill: 'T5', cidade: 'Cidade B', entregador: 'Entregador C', status: 'usuario_sem_cidade' },
    { waybill: 'T6', cidade: 'Cidade Longe', entregador: 'Entregador B', status: 'fora_abrangencia' },
    { waybill: 'T7', cidade: 'Cidade B', entregador: 'Entregador B', status: 'ok' },
  ],
  entregadores: [
    { usuario: 'Entregador A', cidades: ['Cidade A'] },
    { usuario: 'Entregador B', cidades: ['Cidade B'] },
    { usuario: 'Entregador C', cidades: [] },
  ],
  quemFaz: { 'Cidade A': ['Entregador A'], 'Cidade B': ['Entregador B'] },
};

test('grupos e contagem: certo, errado, na base, fora', () => {
  assert.deepStrictEqual(P.contar(RESUMO.pacotes), { todos: 7, certo: 3, errado: 2, base: 1, fora: 1, caminho: 0 });
  assert.strictEqual(P.grupoDe({ status: 'a_caminho' }), 'caminho');
  // resposta antiga (sem "pacotes"): usa as pendências
  assert.deepStrictEqual(P.pacotesDe({ pendentes: [{ waybill: 'X' }] }), [{ waybill: 'X' }]);
});

test('por cidade: sem os fora de abrangência, pendência primeiro', () => {
  assert.deepStrictEqual(P.porCidade(RESUMO.pacotes), [
    { cidade: 'Cidade B', total: 3, certo: 1, errado: 2, base: 0 },
    { cidade: 'Cidade A', total: 3, certo: 2, errado: 0, base: 1 },
  ]);
  assert.deepStrictEqual(P.foraPorCidade(RESUMO.pacotes), [{ cidade: 'Cidade Longe', total: 1 }]);
});

test('por entregador: com as cidades do cadastro; errados primeiro', () => {
  const l = P.porEntregador(RESUMO.pacotes, RESUMO);
  assert.deepStrictEqual(l.map((e) => [e.entregador, e.total, e.certo, e.errado, e.cidades]), [
    ['Entregador A', 3, 2, 1, ['Cidade A']],
    ['Entregador C', 1, 0, 1, []],
    ['Entregador B', 2, 1, 0, ['Cidade B']],
  ]);
});

test('atribuídos errado agrupados por entregador; situação diz o que ele faz', () => {
  const g = P.erradosPorEntregador(RESUMO.pacotes);
  assert.deepStrictEqual(g.map((x) => [x.entregador, x.pacotes.map((p) => p.waybill)]), [['Entregador A', ['T3']], ['Entregador C', ['T5']]]);
  assert.deepStrictEqual(P.situacao(RESUMO.pacotes[2], RESUMO), { texto: 'Errado · ele faz Cidade A', tipo: 'errado' });
  assert.deepStrictEqual(P.situacao(RESUMO.pacotes[4], RESUMO), { texto: 'Entregador sem cidade cadastrada', tipo: 'errado' });
  assert.deepStrictEqual(P.situacao(RESUMO.pacotes[3], RESUMO), { texto: 'Na base, sem entregador', tipo: 'base' });
  assert.deepStrictEqual(P.situacao({ status: 'a_caminho', status_pacote: 'Em trânsito' }, RESUMO), { texto: 'A caminho', tipo: 'fora' });
  assert.deepStrictEqual(P.quemFaz(RESUMO, 'Cidade B'), ['Entregador B']);
});

test('busca: waybill, cidade, entregador e campos extras, sem acento nem caixa', () => {
  const extras = [{ campo: 'status_pacote' }];
  assert.deepStrictEqual(P.buscar(RESUMO.pacotes, 'cidade longe').map((p) => p.waybill), ['T6']);
  assert.deepStrictEqual(P.buscar(RESUMO.pacotes, 'recebido no ds', extras).map((p) => p.waybill), ['T4']);
  assert.strictEqual(P.buscar(RESUMO.pacotes, '').length, 7);
  assert.strictEqual(P.formatar('2026-01-01 08:05:09', 'hora'), '08:05');
  assert.strictEqual(P.formatar(71.1, 'moeda'), '71,10');
  assert.strictEqual(P.pctDe(1999, 2000), 99.95);
});

test('o arquivo é o mesmo nas extensões e no sistema (meusite/js/conferencia-padrao.js)', () => {
  const nosso = fs.readFileSync(path.join(EXT, 'padrao/conferencia-padrao.js'), 'utf8');
  const doSite = path.join(__dirname, '../../../meusite/js/conferencia-padrao.js');
  if (fs.existsSync(doSite)) assert.strictEqual(nosso, fs.readFileSync(doSite, 'utf8'), 'copie o padrao/conferencia-padrao.js para meusite/js');
  assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}|\(\d{2}\)\s?\d{4,5}-\d{4}/.test(nosso), 'nada de dado real: o site é público');
});

test('as duas páginas (Anjun e iMile) usam a tela padrão', () => {
  for (const f of ['anjun/conferencia.js', 'imile/conferencia.js']) {
    const fonte = fs.readFileSync(path.join(EXT, f), 'utf8');
    assert.ok(fonte.includes('self.XMConfPadrao.criar('), f);
    assert.ok(!/desenharPendentes|desenharBarras/.test(fonte), `${f}: o desenho antigo saiu`);
  }
});
