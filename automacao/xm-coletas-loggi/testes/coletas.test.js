// XM - Coletas Loggi, sem rede e sem Chrome. Dados de TESTE, inventados.
//   node --test testes/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../extensao/abrangencia.js');

const aqui = (...p) => path.join(__dirname, '..', 'extensao', ...p);
const daAgrupamento = (...p) => path.join(__dirname, '..', '..', 'xm-agrupamento-loggi', 'extensao', ...p);

test('abrangência = cidades de todos os círculos; com nome da lista de cidades quando tem', () => {
  const circulos = [{ id: '1', cidades: ['CITY_SC_CIDADE_ALFA', 'CITY_SC_VILA_BETA'] }, { id: '2', cidades: ['CITY_SC_CIDADE_ALFA', 'CITY_SC_SAO_GAMA'] }];
  const abr = A.montarAbrangencia(circulos, [{ codigo: 'CITY_SC_SAO_GAMA', nome: 'São Gama' }]);
  assert.strictEqual(abr.origem, 'circulos');
  assert.deepStrictEqual([...abr.chaves].sort(), ['cidadealfa', 'saogama', 'vilabeta']);
  assert.strictEqual(abr.nomes.get('saogama'), 'São Gama');
});

test('sem círculo nenhum: vale a lista de cidades da base; sem nada: nada é nosso', () => {
  const abr = A.montarAbrangencia([], [{ codigo: 'CITY_SC_CIDADE_ALFA', nome: 'Cidade Alfa' }]);
  assert.strictEqual(abr.origem, 'cidades');
  assert.ok(A.daAbrangencia('CIDADE ALFA', abr));
  const vazio = A.montarAbrangencia([], []);
  assert.strictEqual(vazio.origem, 'nada');
  assert.strictEqual(A.daAbrangencia('Cidade Alfa', vazio), false);
});

test('bipe: nossa cidade em qualquer grafia apita; outra cidade do Brasil não', () => {
  const abr = A.montarAbrangencia([{ cidades: ['CITY_SC_SAO_GAMA', 'CITY_SC_HERVAL_TESTE'] }], []);
  for (const c of ['São Gama', 'SAO GAMA - SC', 'Sao Gama (SC)', 'SÃ£o Gama', 'S?o Gama', "Herval Teste"]) assert.ok(A.daAbrangencia(c, abr), c);
  for (const c of ['Cidade Longe', 'Sao Gamaliel', '', 'São Paulo']) assert.strictEqual(A.daAbrangencia(c, abr), false, c);
});

test('guarda e volta do chrome.storage sem perder nada', () => {
  const abr = A.montarAbrangencia([{ cidades: ['CITY_SC_CIDADE_ALFA'] }], []);
  const volta = A.deGuardado(JSON.parse(JSON.stringify(A.guardavel(abr))));
  assert.deepStrictEqual([...volta.chaves], [...abr.chaves]);
  assert.strictEqual(volta.origem, 'circulos');
  assert.ok(A.daAbrangencia('Cidade Alfa', volta));
});

test('regras.js igual ao da XM - Agrupamento Loggi; loggi.js igual, só com outro canal', () => {
  assert.strictEqual(fs.readFileSync(aqui('regras.js'), 'utf8'), fs.readFileSync(daAgrupamento('regras.js'), 'utf8'));
  const tirarCabecalho = (t) => t.replace(/^(\/\/.*\r?\n)+/, '');
  const nosso = tirarCabecalho(fs.readFileSync(aqui('loggi.js'), 'utf8'));
  const dela = tirarCabecalho(fs.readFileSync(daAgrupamento('loggi.js'), 'utf8'));
  assert.ok(nosso.includes("const CANAL = 'xmColetas';"));
  assert.strictEqual(nosso.replace("const CANAL = 'xmColetas';", "const CANAL = 'xmAgrup';"), dela);
});
