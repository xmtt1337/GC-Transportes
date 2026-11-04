// Consulta do DS da iMile, sem rede. Dados de TESTE, inventados.
//
//   node --test automacao/xm-consulta/testes/test_imile.test.js

const test = require('node:test');
const assert = require('node:assert');
const { criarConsulta, lerResposta, HEADERS_DO_SITE, RESERVA_DA_COTA } = require('../extensao/imile.js');

const BUSCA = {
  status: 'success',
  resultObject: { consignorinfo: { consignor: 'Loja Teste', consignorContact: 'Contato Teste' } },
};

// Busca (remetente, sem gastar cota) e depois uma revelacao (nome, telefone e produto).
const postFalso = (rev, busca = BUSCA, chamadas = []) => async (url, corpo) => {
  chamadas.push({ url, corpo });
  return url.endsWith('/track/query') ? busca : rev;
};

const resposta = (cota, info = {}) => ({
  status: 'success',
  message: 'Successful operation!',
  resultObject: {
    infoResult: { consigneeContact: 'Fulano de Tal', consigneeMobile: '+5549900000000', consignee: '', sku: 'Produto Teste', ...info },
    config: { limit: false, maxCount: 700, currentCount: 50, model: 'TRACK', ...cota },
  },
});

test('busca o remetente e revela nome, telefone e produto numa chamada so', async () => {
  const chamadas = [];
  const r = await criarConsulta(postFalso(resposta(), BUSCA, chamadas))('3320000000001');
  assert.deepStrictEqual(r, {
    status: '', nome: 'Fulano de Tal', telefone: '+5549900000000', remetente: 'Loja Teste', produto: 'Produto Teste',
  });
  assert.strictEqual(chamadas.length, 2);
  assert.deepStrictEqual(chamadas[0], {
    url: '/saastms/v1/biz/track/query', corpo: { searchType: 'waybillNo', searchValue: '3320000000001' },
  });
  assert.strictEqual(chamadas[1].url, '/saastms/v1/biz/track/getDesensitizationInfoV1');
  assert.deepStrictEqual(chamadas[1].corpo, { waybillNo: '3320000000001', keyName: 'consigneeContact', model: 'TRACK' });
});

test('sem celular usa o telefone fixo', async () => {
  const r = await criarConsulta(postFalso(resposta({}, { consigneeMobile: '', consigneePhone: '4933333333' })))('1');
  assert.strictEqual(r.telefone, '4933333333');
});

test('para antes de a cota acabar, guardando o pedido que ja veio', async () => {
  const r = await criarConsulta(postFalso(resposta({ currentCount: 700 - RESERVA_DA_COTA })))('1');
  assert.strictEqual(r.nome, 'Fulano de Tal');
  assert.match(r.parar, /cota da iMile.*670 de 700/);
});

test('com folga na cota, segue', async () => {
  const r = await criarConsulta(postFalso(resposta({ currentCount: 600 })))('1');
  assert.strictEqual(r.parar, undefined);
});

test('cota esgotada ou recusa param a consulta', async () => {
  await assert.rejects(criarConsulta(postFalso(resposta({ limit: true })))('1'), /cota/);
  await assert.rejects(criarConsulta(postFalso({ status: 'fail', message: 'sem permissao' }))('1'), /sem permissao/);
  assert.throws(() => lerResposta(401, '{}'), /HTTP 401/);
  assert.throws(() => lerResposta(200, '<html>'), /HTTP 200/);
});

test('nao copia a assinatura de seguranca do site', () => {
  assert.ok(!HEADERS_DO_SITE.some((h) => /sec/i.test(h)));
});

test('busca recusada para antes de gastar a cota', async () => {
  const chamadas = [];
  await assert.rejects(
    criarConsulta(postFalso(resposta(), { status: 'fail', message: 'sem permissao' }, chamadas))('1'),
    /busca.*sem permissao/,
  );
  assert.strictEqual(chamadas.length, 1);
});
