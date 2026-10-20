// Testes da leitura da resposta do SPX pro codigo do Colador - Criar AT (rede.js, mundo da pagina).
//
//   node --test automacao/alimentacao/testes/test_rede_resposta.test.js
//
// O que se protege (20/10/2026: o codigo nao entrava na AT e mesmo assim a AT ia pro entregador):
//   - resposta "ok" (retcode 0) que lista o codigo como falha (fail_list etc.) e RECUSA, com o motivo;
//   - retcode diferente de 0 e recusa com a mensagem do SPX;
//   - resposta limpa e aceite;
//   - so a chamada que leva o codigo escutado e lida.
//
// rede.js roda de verdade num contexto isolado com window, fetch e XHR falsos. Dados de TESTE.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'extensao-macros-spx', 'rede.js'), 'utf8');

function carregar(respostaTexto, status = 200) {
  const postados = [];
  const ouvintes = [];
  const window = {
    location: { origin: 'https://spx.shopee.com.br' },
    addEventListener: (tipo, f) => { if (tipo === 'message') ouvintes.push(f); },
    postMessage: (dados) => postados.push(dados),
    fetch: async () => ({ status, clone: () => ({ text: async () => respostaTexto }) }),
  };
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function () {};
  XMLHttpRequest.prototype.send = function () {};
  const ctx = { window, XMLHttpRequest, Date, JSON, console };
  vm.createContext(ctx);
  vm.runInContext(FONTE, ctx);
  const escutar = (codigo) => ouvintes.forEach((f) => f({ source: window, data: { __xmMacroEscutar: codigo } }));
  const respostas = () => postados.filter((p) => p.__xmMacroResposta);
  return { window, escutar, respostas };
}

const esperar = () => new Promise((r) => setTimeout(r, 10));

async function enviar(r, corpo) {
  await r.window.fetch('https://spx.shopee.com.br/api/x', { method: 'POST', body: JSON.stringify(corpo) });
  await esperar();
  return r.respostas();
}

test('retcode 0 mas o codigo na lista de falhas: recusa com o motivo do SPX', async () => {
  const r = carregar(JSON.stringify({ retcode: 0, message: 'success', data: { fail_list: [{ fleet_order_id: 'BR1', reason: 'order already in another task' }] } }));
  r.escutar('BR1');
  const [x] = await enviar(r, { fleet_order_id: 'BR1' });
  assert.strictEqual(x.ok, false);
  assert.strictEqual(x.mensagem, 'order already in another task');
});

test('contador de falha maior que zero tambem recusa', async () => {
  const r = carregar(JSON.stringify({ retcode: 0, data: { success_count: 0, fail_count: 1 } }));
  r.escutar('BR1');
  const [x] = await enviar(r, { fleet_order_id: 'BR1' });
  assert.strictEqual(x.ok, false);
  assert.match(x.mensagem, /fail_count: 1/);
});

test('retcode diferente de 0: recusa com a mensagem do SPX', async () => {
  const r = carregar(JSON.stringify({ retcode: 1301, message: 'BR1 Fleet order not found' }));
  r.escutar('BR1');
  const [x] = await enviar(r, { fleet_order_id: 'BR1' });
  assert.strictEqual(x.ok, false);
  assert.strictEqual(x.mensagem, 'BR1 Fleet order not found');
});

test('resposta limpa (sem falha listada, contadores zerados) aceita', async () => {
  const r = carregar(JSON.stringify({ retcode: 0, message: 'success', data: { fail_list: [], fail_count: 0, error_msg: '' } }));
  r.escutar('BR1');
  const [x] = await enviar(r, { fleet_order_id: 'BR1' });
  assert.strictEqual(x.ok, true);
});

test('chamada que nao leva o codigo escutado nao e lida', async () => {
  const r = carregar(JSON.stringify({ retcode: 5, message: 'outra coisa' }));
  r.escutar('BR1');
  assert.deepStrictEqual(await enviar(r, { fleet_order_id: 'BR2' }), []);
});
