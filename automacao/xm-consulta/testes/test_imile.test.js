// Consulta do DS da iMile, sem rede. Dados de TESTE, inventados.
//
//   node --test automacao/xm-consulta/testes/test_imile.test.js

const test = require('node:test');
const assert = require('node:assert');
const { criarConsulta, lerResposta, HEADERS_DO_SITE, RESERVA_DA_COTA } = require('../extensao/imile.js');

const resposta = (cota, info = {}) => ({
  status: 'success',
  message: 'Successful operation!',
  resultObject: {
    infoResult: { consigneeContact: 'Fulano de Tal', consigneeMobile: '+5549900000000', consignee: '', ...info },
    config: { limit: false, maxCount: 700, currentCount: 50, model: 'TRACK', ...cota },
  },
});

test('uma revelacao traz nome e telefone', async () => {
  const chamadas = [];
  const r = await criarConsulta(async (url, corpo) => { chamadas.push({ url, corpo }); return resposta(); })('3320000000001');
  assert.deepStrictEqual(r, { status: '', nome: 'Fulano de Tal', telefone: '+5549900000000' });
  assert.strictEqual(chamadas.length, 1);
  assert.strictEqual(chamadas[0].url, '/saastms/v1/biz/track/getDesensitizationInfoV1');
  assert.deepStrictEqual(chamadas[0].corpo, { waybillNo: '3320000000001', keyName: 'consigneeContact', model: 'TRACK' });
});

test('sem celular usa o telefone fixo', async () => {
  const r = await criarConsulta(async () => resposta({}, { consigneeMobile: '', consigneePhone: '4933333333' }))('1');
  assert.strictEqual(r.telefone, '4933333333');
});

test('para antes de a cota acabar, guardando o pedido que ja veio', async () => {
  const r = await criarConsulta(async () => resposta({ currentCount: 700 - RESERVA_DA_COTA }))('1');
  assert.strictEqual(r.nome, 'Fulano de Tal');
  assert.match(r.parar, /cota da iMile.*670 de 700/);
});

test('com folga na cota, segue', async () => {
  const r = await criarConsulta(async () => resposta({ currentCount: 600 }))('1');
  assert.strictEqual(r.parar, undefined);
});

test('cota esgotada ou recusa param a consulta', async () => {
  await assert.rejects(criarConsulta(async () => resposta({ limit: true }))('1'), /cota/);
  await assert.rejects(criarConsulta(async () => ({ status: 'fail', message: 'sem permissao' }))('1'), /sem permissao/);
  assert.throws(() => lerResposta(401, '{}'), /HTTP 401/);
  assert.throws(() => lerResposta(200, '<html>'), /HTTP 200/);
});

test('nao copia a assinatura de seguranca do site', () => {
  assert.ok(!HEADERS_DO_SITE.some((h) => /sec/i.test(h)));
});
