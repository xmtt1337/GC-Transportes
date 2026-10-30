// Consulta da Anjun, sem rede. Dados de TESTE, inventados.
//
//   node --test automacao/xm-consulta/testes/test_anjun.test.js

const test = require('node:test');
const assert = require('node:assert');
const { criarConsulta, criarPost } = require('../extensao/anjun.js');

function postFalso(respostas) {
  const chamadas = [];
  const post = async (url, corpo) => {
    chamadas.push({ url, corpo });
    return respostas(url, corpo);
  };
  return { post, chamadas };
}

const pacote = {
  packageStatusName: 'Pacote com problemas',
  receiveName: '{$nome$}',
  receiveMobile: 'celular',
  receivePhone: null,
  receiveMail: '{$email$}',
  receiveAddress: '{$endereco$}',
};

test('pede packageInfoLimit e abre so nome e telefones', async () => {
  const { post, chamadas } = postFalso((url) => (url.endsWith('packageInfoLimit')
    ? pacote
    : { field0: 'Fulano de Tal', field1: '49900000000' }));

  const r = await criarConsulta(post)('AJ100000000000001');

  assert.deepStrictEqual(r, { status: 'Pacote com problemas', nome: 'Fulano de Tal', telefone: '49900000000' });
  assert.deepStrictEqual(chamadas[0], {
    url: '/admin/package/packageInfoLimit',
    corpo: { waybillNumber: 'AJ100000000000001' },
  });
  assert.deepStrictEqual(chamadas[1].corpo, { data: { field0: '{$nome$}', field1: '{$celular$}' } });
});

test('sem celular usa o telefone fixo', async () => {
  const { post } = postFalso((url) => (url.endsWith('packageInfoLimit')
    ? { ...pacote, receivePhone: 'fixo' }
    : { field0: 'Fulano', field2: '4933333333' }));
  const r = await criarConsulta(post)('AJ1');
  assert.strictEqual(r.telefone, '4933333333');
});

test('pacote inexistente nao abre nada', async () => {
  const { post, chamadas } = postFalso(() => null);
  const r = await criarConsulta(post)('AJ1');
  assert.strictEqual(r.status, 'nao encontrado');
  assert.strictEqual(chamadas.length, 1);
});

test('post manda o token do site e recusa code diferente de 200', async () => {
  let pedido;
  const ok = criarPost(() => ({ token: 'TOKEN-FALSO' }), async (url, o) => {
    pedido = o;
    return { ok: true, status: 200, json: async () => ({ code: 200, data: { a: 1 } }) };
  });
  assert.deepStrictEqual(await ok('/x', {}), { a: 1 });
  assert.strictEqual(pedido.headers.token, 'TOKEN-FALSO');

  const recusado = criarPost(() => ({}), async () => (
    { ok: true, status: 200, json: async () => ({ code: 429, msg: 'limite' }) }));
  await assert.rejects(recusado('/x', {}), /code 429.*limite/);

  const html = criarPost(() => ({}), async () => (
    { ok: false, status: 502, json: async () => { throw new Error('html'); } }));
  await assert.rejects(html('/x', {}), /HTTP 502/);
});
