// O que falta agrupar: relatório Na base x agrupados guardados x lista de agora. Dados de TESTE, inventados.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/regras.js');

const AGORA = Date.UTC(2026, 10, 25, 15, 0); // 25/11/2026 12:00 em São Paulo
const CSV = [
  'Status,Código de barras,ID do pacote,Para,Endereço completo,Cidade,CEP,Prazo,Chegou em',
  'Sem tentativa,TESTE001,ID-1,Pessoa Teste,"Rua Teste, 1",Cidade A,00000-000,até 26 nov,2026-11-25T11:10:00Z',
  'Sem tentativa,TESTE002,ID-2,Pessoa Teste,"Rua Teste, 2",CIDADE A,00000-000,até 26 nov,25/11/2026 09:00',
  'Sem tentativa,TESTE003,ID-3,Pessoa Teste,"Rua Teste, 3",Cidade B,00000-000,até 26 nov,2026-11-25T12:00:00Z',
  'Sem tentativa,TESTE004,ID-4,Pessoa Teste,"Rua Teste, 4",Cidade A,00000-000,até 20 nov,2026-11-20T12:00:00Z',
  'Sem tentativa,,ID-5,Pessoa Teste,"Rua Teste, 5",Cidade A,00000-000,até 26 nov,2026-11-25T13:00:00Z',
].join('\r\n');

const ALVO = R.montarAlvo({ escolha: { tipo: 'cidades', chaves: ['cidadea'] } }, [{ codigo: 'CITY_SC_CIDADE_A', nome: 'Cidade A' }, { codigo: 'CITY_SC_CIDADE_B', nome: 'Cidade B' }], []);

test('relatório Na base: só código, ID, cidade, prazo, chegada e status (nome e endereço ficam de fora)', () => {
  const l = R.linhasNaBase(`﻿${CSV}`);
  assert.strictEqual(l.length, 5);
  assert.deepStrictEqual(l[0], { codigo: 'TESTE001', id: 'ID-1', cidade: 'Cidade A', prazo: 'até 26 nov', chegou: '2026-11-25T11:10:00Z', status: 'Sem tentativa' });
  assert.ok(!JSON.stringify(l).includes('Pessoa Teste') && !JSON.stringify(l).includes('Rua Teste'));
  assert.throws(() => R.linhasNaBase('a,b\n1,2'), /sem as colunas/);
  // acentuação quebrada da Loggi também é consertada aqui
  const quebrada = Buffer.from('Joaçaba', 'utf8').toString('latin1');
  assert.strictEqual(R.linhasNaBase(`Código de barras,Cidade\nTESTE9,${quebrada}`)[0].cidade, 'Joaçaba');
});

test('datas: dia e hora de São Paulo', () => {
  assert.strictEqual(R.hoje(AGORA), '2026-11-25');
  assert.strictEqual(R.diaDe('2026-11-25T02:30:00Z'), '2026-11-24'); // 23:30 do dia 24 em SP
  assert.strictEqual(R.diaDe('25/11/2026 09:00'), '2026-11-25');
  assert.strictEqual(R.diaDe(''), '');
  assert.strictEqual(R.horaDe('2026-11-25T11:10:00Z'), '08:10');
  assert.strictEqual(R.horaDe('25/11/2026 9:05'), '09:05');
});

test('"Chegou em" nos jeitos que a Loggi pode mandar', () => {
  for (const v of ['2026-11-25T11:10:00Z', '2026-11-25T08:10:00', '2026-11-25 08:10', '25/11/2026 08:10', '25/11/26', '25/11 08:10', '25 nov', '25 nov, 08:10', '25 de nov. de 2026', 'Hoje, 08:10', 'hoje'])
    assert.strictEqual(R.diaDe(v, AGORA), '2026-11-25', v);
  assert.strictEqual(R.diaDe('Ontem 18:00', AGORA), '2026-11-24');
  assert.strictEqual(R.diaDe('28 dez', Date.UTC(2027, 0, 5, 15)), '2026-12-28'); // dezembro lido em janeiro: ano passado
  assert.strictEqual(R.diaDe('sem data', AGORA), '');
  assert.deepStrictEqual(R.resumoNaBase([{ chegou: '25 nov, 08:10' }, { chegou: '20 nov' }, { chegou: '?' }], AGORA), { total: 3, hoje: 1, semData: 1, exemplo: '25 nov, 08:10' });
});

test('faltam: das cidades escolhidas, sem os agrupados nem os que estão na lista agora; hoje x toda a base', () => {
  const linhas = R.linhasNaBase(CSV);
  const hoje = R.faltantes(linhas, ALVO, {}, [], { soHoje: true, agora: AGORA }).map((p) => p.codigo || p.id);
  assert.deepStrictEqual(hoje.sort(), ['ID-5', 'TESTE001', 'TESTE002']); // Cidade B é de fora; TESTE004 chegou dia 20
  assert.deepStrictEqual(R.faltantes(linhas, ALVO, {}, [], { soHoje: false, agora: AGORA }).length, 4);
  // TESTE001 já foi num grupo (guardado), TESTE002 está na lista agora, ID-5 casa pelo ID
  const agrupados = { TESTE001: '2026-11-25', 'ID-5': '2026-11-25' };
  assert.deepStrictEqual(R.faltantes(linhas, ALVO, agrupados, ['teste002'], { soHoje: true, agora: AGORA }), []);
  // nada escolhido: não há o que mostrar
  assert.deepStrictEqual(R.faltantes(linhas, R.montarAlvo(R.cfgVazia(), [], []), {}, [], { agora: AGORA }), []);
});

test('agrupados guardados: só hoje e ontem; grupo novo soma', () => {
  const r = R.somarAgrupados({ VELHO: '2026-11-20', ONTEM: '2026-11-24' }, ['teste001', 'TESTE002'], AGORA);
  assert.deepStrictEqual(r, { ONTEM: '2026-11-24', TESTE001: '2026-11-25', TESTE002: '2026-11-25' });
  assert.deepStrictEqual(R.agrupadosValidos(r, AGORA + 2 * 86400000), {});
});

test('lista de agora e o link do relatório', () => {
  const bipes = new Map([['TESTE001', 'Cidade A'], ['TESTE002', 'Cidade A']]);
  assert.deepStrictEqual(R.naListaAgora(bipes, 'lista: teste002'), ['TESTE002']);
  assert.ok(R.linkDoRelatorio('https://leve.loggi.com/api/v1/last_mile/empresa-teste/packages/report?view=x&token=T'));
  assert.ok(!R.linkDoRelatorio('https://outro.site.com/api/v1/last_mile/empresa-teste/packages/report'));
  assert.ok(!R.linkDoRelatorio('https://leve.loggi.com/api/v1/outra-coisa'));
  assert.strictEqual(new URL(R.relatorioDaBase('https://leve.loggi.com/api/v1/last_mile/e/packages/report?view=tomorrow&token=T')).searchParams.get('view'), 'base');
});

test('fundo.js: só busca o link do relatório da Loggi e não guarda nada', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '../extensao/fundo.js'), 'utf8');
  assert.ok(fonte.includes('R.linkDoRelatorio(url)'));
  assert.ok(!/storage\.(local|session|sync)\.set/.test(fonte), 'o link (com a sessão da conta) não é guardado');
  assert.ok(!/onrender\.com|xmtt/i.test(fonte));
});
