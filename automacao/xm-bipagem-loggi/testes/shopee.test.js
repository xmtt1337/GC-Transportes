// Conferencia Shopee (shopee.js), sem rede e sem Chrome. Dados de TESTE, inventados.
//
//   node --test automacao/xm-bipagem-loggi/testes/

const test = require('node:test');
const assert = require('node:assert');
const { faixaDoDia, enxugarRastreio, enxugarAt, rastrear, listarAts } = require('../extensao/shopee.js');

test('faixa do dia em segundos, de 00:00 a 23:59:59 de Sao Paulo', () => {
  // 18/11/2026 00:00 em Sao Paulo = 03:00 UTC
  assert.strictEqual(faixaDoDia('2026-11-18'), `${Date.UTC(2026, 10, 18, 3) / 1000},${Date.UTC(2026, 10, 18, 3) / 1000 + 86399}`);
});

test('rastreio enxuto: so horarios, motorista, status e estacao (nada do destinatario)', () => {
  const r = enxugarRastreio({
    shipment_id: 'BRTESTE1', current_station_received_time: 100, delivering_time: 200, delivered_time: 0,
    driver_name: 'Motorista Teste', order_status: 2, current_station_name: 'XPT_TESTE',
    buyer_address: 'Rua Teste', buyer_addr_city: 'Cidade Teste', receive_time: 50,
  });
  assert.deepStrictEqual(r, { codigo: 'BRTESTE1', recebido_em: 100, saiu_em: 200, entregue_em: 0, motorista: 'Motorista Teste', status: 2, estacao: 'XPT_TESTE' });
});

test('AT enxuta: BR da AT separados, cidade, bairro, cluster, criacao', () => {
  const a = enxugarAt({ assignment_task_id: 'ATTESTE1', shipment_id: 'BRTESTE1, BRTESTE2,', driver_name: 'Motorista Teste',
    city: 'Cidade A', neighborhood: 'Centro', cluster: 'CA-1', ctime: 123, operator_email: 'nao@vai' });
  assert.deepStrictEqual(a, { at: 'ATTESTE1', codigos: ['BRTESTE1', 'BRTESTE2'], motorista: 'Motorista Teste', cidade: 'Cidade A', bairro: 'Centro', cluster: 'CA-1', criada_em: 123 });
});

test('rastrear manda 50 BR por vez', async () => {
  const codigos = Array.from({ length: 120 }, (_, i) => `BR${i}`);
  const lotes = [];
  const post = async (rota, corpo) => { lotes.push(corpo.search_id_list.length); return { list: corpo.search_id_list.map((c) => ({ shipment_id: c })) }; };
  const r = await rastrear(post, codigos, () => {}, async () => {});
  assert.deepStrictEqual(lotes, [50, 50, 20]);
  assert.strictEqual(r.length, 120);
});

test('listarAts le todas as paginas do dia', async () => {
  const total = 120;
  const paginas = [];
  const post = async (rota, corpo) => {
    paginas.push(corpo.pageno);
    assert.match(rota, /assignment_task\/search\/v2/);
    assert.strictEqual(corpo.search_type, 0);
    const ini = (corpo.pageno - 1) * corpo.count;
    const n = Math.max(0, Math.min(corpo.count, total - ini));
    return { total, list: Array.from({ length: n }, (_, i) => ({ assignment_task_id: `AT${ini + i}`, shipment_id: '' })) };
  };
  const r = await listarAts(post, '2026-11-18', () => {}, async () => {});
  assert.strictEqual(r.length, 120);
  assert.deepStrictEqual(paginas, [1, 2, 3]);
});
