// Consulta do SPX, sem rede. Dados de TESTE, inventados.
//
//   node --test automacao/xm-consulta/testes/test_shopee.test.js

const test = require('node:test');
const assert = require('node:assert');
const { criarConsulta, lerResposta, HEADERS_DO_SITE } = require('../extensao/shopee.js');

const semPausa = async () => {};
const valores = { buyer_name: 'Fulano de Tal', buyer_contact: '5549900000000', seller_name: 'Loja Teste' };

function getFalso(resposta) {
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    return resposta(url);
  };
  return { get, urls };
}

test('abre nome, telefone e remetente, um campo por chamada', async () => {
  const { get, urls } = getFalso((url) => ({
    retcode: 0, data: { data_detail: valores[new URL(url, 'https://x').searchParams.get('data_field')] },
  }));
  const r = await criarConsulta(get, semPausa)('BR262117646755X');
  assert.deepStrictEqual(r, { status: '', nome: 'Fulano de Tal', telefone: '5549900000000', remetente: 'Loja Teste' });
  assert.strictEqual(urls.length, 3);
  assert.ok(urls.every((u) => u.startsWith('/api/fleet_order/order/detail/show_sensitive_data?shipment_id=BR262117646755X&data_field=')));
});

test('pausa entre os campos, como quem clica', async () => {
  const pausas = [];
  const { get } = getFalso(() => ({ retcode: 0, data: { data_detail: 'x' } }));
  await criarConsulta(get, async (ms) => pausas.push(ms))('BR1');
  assert.strictEqual(pausas.length, 2);
  assert.ok(pausas.every((ms) => ms >= 300));
});

test('pedido de outra estacao marca e nao interrompe a lista', async () => {
  const { get, urls } = getFalso(() => ({ retcode: 200301007, message: 'cannot be found', data: null }));
  const r = await criarConsulta(get, semPausa)('BR1');
  assert.strictEqual(r.status, 'nao e desta estacao');
  assert.strictEqual(urls.length, 1);
});

test('qualquer outra recusa para a consulta', async () => {
  const { get } = getFalso(() => ({ retcode: 200301003, message: 'sem permissao', data: null }));
  await assert.rejects(criarConsulta(get, semPausa)('BR1'), /retcode 200301003.*sem permissao/);
});

test('resposta que nao e JSON, ou HTTP de erro, e recusa', () => {
  assert.throws(() => lerResposta(403, '{}'), /HTTP 403/);
  assert.throws(() => lerResposta(200, '<html>'), /HTTP 200/);
  assert.deepStrictEqual(lerResposta(200, '{"retcode":0}'), { retcode: 0 });
});

test('nao copia a protecao anti-robo do site', () => {
  assert.ok(!HEADERS_DO_SITE.some((h) => /sap/i.test(h)));
});
