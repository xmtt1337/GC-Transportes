// Conferencia Anjun (anjun/anjun.js da XM - Conferencias; veio da XM - Operacao), sem rede e sem Chrome. Dados de TESTE, inventados.
//
//   node --test testes/*.test.js

const test = require('node:test');
const assert = require('node:assert');
const { corpoDaBusca, enxugar, buscarDia, hojeSP } = require('../extensao/anjun/anjun.js');

test('a busca e a da tela: entrada no ponto do dia inteiro, pagina e tamanho', () => {
  const c = corpoDaBusca('2026-01-02', 3, 200);
  assert.strictEqual(c.pageNumber, 3);
  assert.strictEqual(c.pageSize, 200);
  assert.strictEqual(c.params.searchTimeType, 1);
  assert.strictEqual(c.params.storageStartTime, '2026-01-02 00:00:00');
  assert.strictEqual(c.params.storageEndTime, '2026-01-02 23:59:59');
  assert.deepStrictEqual(c.params.siteIdList, []);
});

test('enxugar deixa so os campos da conferencia (nada do destinatario)', () => {
  const p = enxugar({
    waybillNumber: 'AJTESTE0001', packageNumber: 'AJTESTE0001', delivererName: 'Login.Teste', receiveCity: 'Cidade Teste',
    siteName: 'SC-W-D026', storageTime: '2026-01-02 08:00:00', customerName: 'cliente teste', declaredValue: 10.5,
    packageStatusName: 'Em rota', receiveName: '{$cifrado$}', receiveAddress: 'Rua Teste', receiveMobile: '000', receiveZipcode: '00000000',
  });
  assert.deepStrictEqual(p, {
    waybill: 'AJTESTE0001', entregador: 'Login.Teste', cidade: 'Cidade Teste', ponto: 'SC-W-D026',
    entrada: '2026-01-02 08:00:00', cliente: 'cliente teste', valor: 10.5, status: 'Em rota',
  });
});

test('buscarDia le todas as paginas ate o total e para', async () => {
  const total = 450;
  const pedidos = [];
  const post = async (corpo) => {
    pedidos.push(corpo.pageNumber);
    const ini = (corpo.pageNumber - 1) * corpo.pageSize;
    const n = Math.max(0, Math.min(corpo.pageSize, total - ini));
    return { total, records: Array.from({ length: n }, (_, i) => ({ waybillNumber: `T${ini + i}` })) };
  };
  const avisos = [];
  const r = await buscarDia(post, '2026-01-02', (n, t) => avisos.push(`${n}/${t}`), async () => {});
  assert.strictEqual(r.pacotes.length, 450);
  assert.strictEqual(r.total, 450);
  assert.deepStrictEqual(pedidos, [1, 2, 3]);
  assert.deepStrictEqual(avisos, ['200/450', '400/450', '450/450']);
});

test('buscarDia com dia vazio faz uma chamada so', async () => {
  let chamadas = 0;
  const r = await buscarDia(async () => { chamadas += 1; return { total: 0, records: [] }; }, '2026-01-02', () => {}, async () => {});
  assert.strictEqual(r.pacotes.length, 0);
  assert.strictEqual(chamadas, 1);
});

test('hojeSP usa o dia de Sao Paulo', () => {
  assert.strictEqual(hojeSP(new Date('2026-01-02T02:30:00Z')), '2026-01-01');
});
