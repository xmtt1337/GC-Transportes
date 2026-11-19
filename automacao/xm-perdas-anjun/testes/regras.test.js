// node --test automacao/xm-perdas-anjun/testes/regras.test.js
// Dados sinteticos: nomes, bases e codigos inventados.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../extensao/regras.js');

const ev = (dateTime, status) => ({ dateTime, dayOfWeek: '', status });

// Do mais novo para o mais antigo, como a Anjun devolve.
const FAKE_DELIVERY = [
  ev('03-11-2026 10:59:44', 'A entrega falhou, Perda confirmada-Fake delivery, Digitalizar pessoas[Analista Teste]'),
  ev('14-10-2026 21:41:24', 'O pacote foi assinado【Recebido e assinado pessoalmente】, Digitalizar pessoas[Entregador.B]'),
  ev('14-10-2026 10:07:15', 'Objeto saiu para entrega ao destinatário, Entregador[Entregador.B]'),
  ev('01-10-2026 07:48:41', 'Objeto saiu para entrega ao destinatário, Entregador[Entregador.A]'),
  ev('29-09-2026 06:02:57', 'O pacote já recebido pelo ponto de entrega[XX-W-D001] , Digitalizar pessoas[Conferente Teste]'),
  ev('28-09-2026 05:23:57', 'O pacote chegou ao Centro de Distribuição de [XX-Z-H001], Digitalizar pessoas[Outro Teste]'),
];

test('lerCodigos pega AJ sem repetir, em qualquer formato de lista', () => {
  assert.deepStrictEqual(R.lerCodigos('aj100000000000001\nAJ100000000000002; AJ100000000000001  x'), ['AJ100000000000001', 'AJ100000000000002']);
  assert.deepStrictEqual(R.lerCodigos(''), []);
});

test('classificar reconhece os eventos do rastreio', () => {
  assert.deepStrictEqual(R.classificar(FAKE_DELIVERY[0].status),
    { tipo: 'falha', motivo: 'Perda confirmada-Fake delivery', perda: true, pessoa: 'Analista Teste' });
  assert.deepStrictEqual(R.classificar(FAKE_DELIVERY[2].status), { tipo: 'saida', entregador: 'Entregador.B' });
  assert.deepStrictEqual(R.classificar(FAKE_DELIVERY[4].status), { tipo: 'recebido', base: 'XX-W-D001', pessoa: 'Conferente Teste' });
  assert.deepStrictEqual(R.classificar(FAKE_DELIVERY[1].status), { tipo: 'assinado', pessoa: 'Entregador.B' });
  assert.strictEqual(R.classificar(FAKE_DELIVERY[5].status).tipo, 'outro');
  assert.strictEqual(R.classificar('o pacote ja recebido pelo ponto de entrega[XX-W-D001]').tipo, 'recebido'); // sem acento
});

test('saiu para entrega antes da falha: culpado e o ultimo entregador', () => {
  const a = R.analisar(FAKE_DELIVERY);
  assert.strictEqual(a.situacao, 'ok');
  assert.strictEqual(a.tipo, 'entregador');
  assert.strictEqual(a.culpado, 'Entregador.B');
  assert.strictEqual(a.base, 'XX-W-D001');
  assert.strictEqual(a.assinadoPor, 'Entregador.B');
  assert.deepStrictEqual(a.falha, { data: '03-11-2026 10:59:44', motivo: 'Perda confirmada-Fake delivery' });
  assert.deepStrictEqual(a.evidencia, { data: '14-10-2026 10:07:15', texto: FAKE_DELIVERY[2].status });
  assert.deepStrictEqual(a.entregadores, ['Entregador.B', 'Entregador.A']);
  assert.strictEqual(a.depois, '');
});

test('recebido no ponto e logo acima a falha: culpado e a base', () => {
  const a = R.analisar([FAKE_DELIVERY[0], FAKE_DELIVERY[4], FAKE_DELIVERY[5]]);
  assert.strictEqual(a.tipo, 'base');
  assert.strictEqual(a.culpado, 'Base XX-W-D001');
  assert.strictEqual(a.base, 'XX-W-D001');
  assert.strictEqual(a.recebidoPor, 'Conferente Teste');
  assert.deepStrictEqual(a.entregadores, []);
});

test('saiu, falhou, voltou para o ponto e sumiu: culpado e a base', () => {
  const a = R.analisar([
    ev('05-11-2026 09:00:00', 'A entrega falhou, Perda confirmada, Digitalizar pessoas[Analista Teste]'),
    ev('02-11-2026 19:00:00', 'O pacote já recebido pelo ponto de entrega[XX-W-D001] , Digitalizar pessoas[Conferente Teste]'),
    ev('02-11-2026 15:00:00', 'A entrega falhou, Destinatário ausente, Digitalizar pessoas[Entregador.A]'),
    ev('02-11-2026 08:00:00', 'Objeto saiu para entrega ao destinatário, Entregador[Entregador.A]'),
    FAKE_DELIVERY[4],
  ]);
  assert.strictEqual(a.tipo, 'base');
  assert.strictEqual(a.culpado, 'Base XX-W-D001');
  assert.strictEqual(a.falha.motivo, 'Perda confirmada');
});

test('tentativa que falhou sem voltar para o ponto: culpado e o entregador', () => {
  const a = R.analisar([
    ev('05-11-2026 09:00:00', 'A entrega falhou, Perda confirmada, Digitalizar pessoas[Analista Teste]'),
    ev('02-11-2026 15:00:00', 'A entrega falhou, Destinatário ausente, Digitalizar pessoas[Entregador.A]'),
    ev('02-11-2026 08:00:00', 'Objeto saiu para entrega ao destinatário, Entregador[Entregador.A]'),
    FAKE_DELIVERY[4],
  ]);
  assert.strictEqual(a.tipo, 'entregador');
  assert.strictEqual(a.culpado, 'Entregador.A');
});

test('movimento depois da falha fica anotado', () => {
  const a = R.analisar([ev('06-11-2026 08:00:00', 'O pacote já recebido pelo ponto de entrega[XX-W-D001]'), ...FAKE_DELIVERY]);
  assert.strictEqual(a.culpado, 'Entregador.B');
  assert.match(a.depois, /^06-11-2026 08:00:00 O pacote já recebido/);
  assert.match(R.observacao(a), /Teve movimento depois da falha/);
});

test('sem falha, sem rastreio e sem posse', () => {
  const semFalha = R.analisar(FAKE_DELIVERY.slice(2));
  assert.strictEqual(semFalha.situacao, 'sem_falha');
  assert.strictEqual(semFalha.culpado, 'Entregador.B');
  assert.strictEqual(semFalha.falha, null);

  const vazio = R.analisar([]);
  assert.strictEqual(vazio.situacao, 'sem_rastreio');
  assert.strictEqual(vazio.culpado, '');

  const semPosse = R.analisar([FAKE_DELIVERY[0], FAKE_DELIVERY[5]]);
  assert.strictEqual(semPosse.situacao, 'nao_identificado');
  assert.strictEqual(semPosse.tipo, 'nao_identificado');
  assert.strictEqual(semPosse.culpado, '');
});

test('saida sem nome do entregador ainda culpa o entregador', () => {
  const a = R.analisar([FAKE_DELIVERY[0], ev('01-11-2026 08:00:00', 'Objeto saiu para entrega ao destinatário')]);
  assert.strictEqual(a.tipo, 'entregador');
  assert.strictEqual(a.culpado, '(sem nome no rastreio)');
});

test('resumo agrupa por culpado, do maior para o menor', () => {
  const itens = [
    { codigo: 'AJ1', situacao: 'ok', tipo: 'entregador', culpado: 'Entregador.A' },
    { codigo: 'AJ2', situacao: 'ok', tipo: 'base', culpado: 'Base XX-W-D001' },
    { codigo: 'AJ3', situacao: 'ok', tipo: 'entregador', culpado: 'Entregador.A' },
    { codigo: 'AJ4', situacao: 'erro', tipo: 'erro', culpado: '', erro: 'x' },
  ];
  assert.deepStrictEqual(R.resumir(itens), [
    { tipo: 'entregador', culpado: 'Entregador.A', pedidos: ['AJ1', 'AJ3'] },
    { tipo: 'base', culpado: 'Base XX-W-D001', pedidos: ['AJ2'] },
  ]);
  const resumo = R.montarCsvResumo(itens).split('\r\n');
  assert.strictEqual(resumo[0], '"Culpado";"Tipo";"Quantidade";"Pedidos"');
  assert.strictEqual(resumo[1], '"Entregador.A";"Entregador";"2";"AJ1, AJ3"');
});

test('relatorio CSV: uma linha por pedido, com aspas escapadas', () => {
  const a = { codigo: 'AJ100000000000001', ...R.analisar(FAKE_DELIVERY) };
  const erro = { codigo: 'AJ100000000000002', situacao: 'erro', tipo: 'erro', culpado: '', erro: 'disse "não"' };
  const linhas = R.montarCsv([a, erro]).split('\r\n');
  assert.strictEqual(linhas.length, 3);
  assert.match(linhas[0], /^"Pedido";"Culpado";"Tipo";"Base"/);
  assert.match(linhas[1], /^"AJ100000000000001";"Entregador.B";"Entregador";"XX-W-D001";"Objeto saiu para entrega/);
  assert.match(linhas[1], /"Perda confirmada-Fake delivery";"03-11-2026 10:59:44";"";"Entregador.B";"Entregador.B, Entregador.A";""$/);
  assert.strictEqual(linhas[2], '"AJ100000000000002";"";"Erro";"";"";"";"";"";"";"";"";"Erro: disse ""não"""');
});
