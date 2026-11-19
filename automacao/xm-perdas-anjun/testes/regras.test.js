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

test('resumo agrupa pelo entregador responsável (vários logins viram uma linha)', () => {
  const itens = [
    { codigo: 'AJ1', situacao: 'ok', tipo: 'entregador', culpado: 'Entregador.A', responsavel: 'Fulano Teste' },
    { codigo: 'AJ2', situacao: 'ok', tipo: 'base', culpado: 'Base SC-W-D073', responsavel: 'Terceirizado Joaçaba' },
    { codigo: 'AJ3', situacao: 'ok', tipo: 'entregador', culpado: 'Entregador.A2', responsavel: 'Fulano Teste' },
    { codigo: 'AJ4', situacao: 'ok', tipo: 'entregador', culpado: 'Sem.Conversao', responsavel: '' },
    { codigo: 'AJ5', situacao: 'erro', tipo: 'erro', culpado: '', erro: 'x' },
  ];
  assert.deepStrictEqual(R.resumir(itens), [
    { tipo: 'entregador', nome: 'Fulano Teste', culpados: ['Entregador.A', 'Entregador.A2'], pedidos: ['AJ1', 'AJ3'] },
    { tipo: 'entregador', nome: 'Sem.Conversao', culpados: ['Sem.Conversao'], pedidos: ['AJ4'] },
    { tipo: 'base', nome: 'Terceirizado Joaçaba', culpados: ['Base SC-W-D073'], pedidos: ['AJ2'] },
  ]);
  const resumo = R.montarCsvResumo(itens).split('\r\n');
  assert.strictEqual(resumo[0], '"Entregador responsável";"Tipo";"Quantidade";"Culpado no rastreio";"Pedidos"');
  assert.strictEqual(resumo[1], '"Fulano Teste";"Entregador";"2";"Entregador.A, Entregador.A2";"AJ1, AJ3"');
});

test('base vira a unidade: D073 Joaçaba, D026 Caçador, D047 Videira', () => {
  assert.strictEqual(R.unidadeDaBase('SC-W-D073'), 'Terceirizado Joaçaba');
  assert.strictEqual(R.unidadeDaBase('SC-W-D026'), 'Caçador');
  assert.strictEqual(R.unidadeDaBase('sc-w-d047 '), 'Terceirizada Videira');
  assert.strictEqual(R.unidadeDaBase('XX-W-D001'), '');
  assert.strictEqual(R.unidadeDaBase(''), '');

  const recebido = ev('29-09-2026 06:02:57', 'O pacote já recebido pelo ponto de entrega[SC-W-D073] , Digitalizar pessoas[Conferente Teste]');
  const base = R.analisar([FAKE_DELIVERY[0], recebido]);
  assert.strictEqual(base.culpado, 'Base SC-W-D073');
  assert.strictEqual(base.responsavel, 'Terceirizado Joaçaba');
  const entregador = R.analisar([FAKE_DELIVERY[0], FAKE_DELIVERY[2], recebido]);
  assert.strictEqual(entregador.unidade, 'Terceirizado Joaçaba');
  assert.strictEqual(entregador.responsavel, ''); // vem do sistema
});

test('conversão de login: pergunta pelo dia da saída e aplica a resposta', () => {
  assert.strictEqual(R.diaIso('14-10-2026 10:07:15'), '2026-10-14');
  assert.strictEqual(R.diaIso('ontem'), null);
  const itens = [
    { codigo: 'AJ1', ...R.analisar(FAKE_DELIVERY) }, // Entregador.B, saiu 14-10-2026
    { codigo: 'AJ2', ...R.analisar([FAKE_DELIVERY[0], ev('20-10-2026 09:00:00', 'Objeto saiu para entrega ao destinatário, Entregador[Duplo.Login]')]) },
    { codigo: 'AJ3', ...R.analisar([FAKE_DELIVERY[0], ev('21-10-2026 09:00:00', 'Objeto saiu para entrega ao destinatário, Entregador[Sem.Conversao]')]) },
    { codigo: 'AJ4', ...R.analisar([FAKE_DELIVERY[0], ev('21-10-2026 09:00:00', 'Objeto saiu para entrega ao destinatário')]) },
    { codigo: 'AJ5', ...R.analisar([FAKE_DELIVERY[0], FAKE_DELIVERY[4]]) }, // base
    { codigo: 'AJ6', ...R.analisar(FAKE_DELIVERY) }, // mesmo login e dia do AJ1: pergunta uma vez só
  ];
  assert.deepStrictEqual(R.pedidosDeConversao(itens), [
    { login: 'Entregador.B', dia: '2026-10-14' },
    { login: 'Duplo.Login', dia: '2026-10-20' },
    { login: 'Sem.Conversao', dia: '2026-10-21' },
  ]);

  R.aplicarConversao(itens, null); // sem conta no sistema
  assert.strictEqual(itens[0].semResponsavel, 'sem_login');
  assert.match(R.observacao(itens[0]), /entre no sistema/);

  R.aplicarConversao(itens, [
    { login: 'Entregador.B', dia: '2026-10-14', entregador: 'Fulano Teste - Caçador', ambiguo: false },
    { login: 'Duplo.Login', dia: '2026-10-20', entregador: null, ambiguo: true },
    { login: 'Sem.Conversao', dia: '2026-10-21', entregador: null, ambiguo: false },
  ]);
  assert.deepStrictEqual(itens.map((i) => i.responsavel), ['Fulano Teste - Caçador', '', '', '', '', 'Fulano Teste - Caçador']);
  assert.strictEqual(itens[0].semResponsavel, undefined);
  assert.strictEqual(itens[1].semResponsavel, 'ambiguo');
  assert.strictEqual(itens[2].semResponsavel, 'sem_conversao');
  assert.match(R.observacao(itens[2]), /Login sem conversão/);
  assert.strictEqual(itens[3].semResponsavel, undefined); // sem nome no rastreio: nada a perguntar
  assert.match(R.observacao(itens[4]), /Base sem unidade/);
});

test('dividirEmLotes e tempoEstimado', () => {
  const lista = Array.from({ length: 120 }, (_, i) => i);
  assert.deepStrictEqual(R.dividirEmLotes(lista, 50).map((l) => l.length), [50, 50, 20]);
  assert.deepStrictEqual(R.dividirEmLotes([1, 2], 0), [[1], [2]]); // lote invalido vira 1
  assert.deepStrictEqual(R.dividirEmLotes([], 50), []);
  assert.strictEqual(R.tempoEstimado(0, 50, 1500), '');
  assert.strictEqual(R.tempoEstimado(1000, 50, 1500), 'menos de 1 min'); // 20 lotes x 1,5 s = 30 s
  assert.strictEqual(R.tempoEstimado(100, 1, 1500), 'uns 3 min');
});

test('relatorio CSV: uma linha por pedido, com aspas escapadas', () => {
  const a = { codigo: 'AJ100000000000001', ...R.analisar(FAKE_DELIVERY) };
  const erro = { codigo: 'AJ100000000000002', situacao: 'erro', tipo: 'erro', culpado: '', erro: 'disse "não"' };
  const linhas = R.montarCsv([a, erro]).split('\r\n');
  assert.strictEqual(linhas.length, 3);
  assert.match(linhas[0], /^"Pedido";"Culpado";"Entregador responsável";"Tipo";"Base"/);
  assert.match(linhas[1], /^"AJ100000000000001";"Entregador.B";"";"Entregador";"XX-W-D001";"Objeto saiu para entrega/);
  assert.match(linhas[1], /"Perda confirmada-Fake delivery";"03-11-2026 10:59:44";"";"Entregador.B";"Entregador.B, Entregador.A";""$/);
  assert.strictEqual(linhas[2], '"AJ100000000000002";"";"";"Erro";"";"";"";"";"";"";"";"";"Erro: disse ""não"""');
  const comResponsavel = { ...a, responsavel: 'Fulano Teste', base: 'SC-W-D026', unidade: 'Caçador' };
  assert.match(R.montarCsv([comResponsavel]).split('\r\n')[1], /^"AJ100000000000001";"Entregador.B";"Fulano Teste";"Entregador";"SC-W-D026 \(Caçador\)";/);
});
