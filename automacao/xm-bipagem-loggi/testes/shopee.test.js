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

test('rastrear manda 500 BR por vez, 2 ao mesmo tempo', async () => {
  const codigos = Array.from({ length: 1200 }, (_, i) => `BR${i}`);
  const lotes = [];
  let emVoo = 0, maxEmVoo = 0;
  const post = async (rota, corpo) => {
    emVoo += 1; maxEmVoo = Math.max(maxEmVoo, emVoo);
    await new Promise((r) => setTimeout(r, 5));
    emVoo -= 1;
    lotes.push(corpo.search_id_list.length);
    return { list: corpo.search_id_list.map((c) => ({ shipment_id: c })) };
  };
  const r = await rastrear(post, codigos);
  assert.deepStrictEqual(lotes.sort((a, b) => b - a), [500, 500, 200]);
  assert.strictEqual(maxEmVoo, 2);
  assert.strictEqual(new Set(r.map((x) => x.codigo)).size, 1200);
});

test('lote grande recusado pelo SPX: divide ao meio e tenta de novo', async () => {
  const codigos = Array.from({ length: 500 }, (_, i) => `BR${i}`);
  const tamanhos = [];
  const post = async (rota, corpo) => {
    tamanhos.push(corpo.search_id_list.length);
    if (corpo.search_id_list.length > 200) throw new Error('A Shopee recusou (retcode 1): lista grande demais');
    return { list: corpo.search_id_list.map((c) => ({ shipment_id: c })) };
  };
  const r = await rastrear(post, codigos);
  assert.strictEqual(r.length, 500);
  assert.deepStrictEqual(tamanhos, [500, 250, 125, 125, 250, 125, 125]);
});

test('recusa de verdade (lote pequeno) para', async () => {
  const post = async () => { throw new Error('A Shopee recusou (retcode 9)'); };
  await assert.rejects(rastrear(post, Array.from({ length: 40 }, (_, i) => `BR${i}`)), /retcode 9/);
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

test('exportarPedidos: cria o export, espera export_status 2 e devolve o link', async () => {
  const { exportarPedidos } = require('../extensao/shopee.js');
  const chamadas = [];
  let vezes = 0;
  const chamar = async (metodo, rota, corpo) => {
    chamadas.push([metodo, rota.split('?')[0], corpo]);
    if (rota.endsWith('/return/export')) return { task_id: 123 };
    if (rota.includes('list_for_portal')) { vezes += 1; return { task_list: [{ task_id: 123, export_status: vezes < 2 ? 0 : 2, failed_reason: '' }] }; }
    if (rota.includes('get_signed_download_url')) return { download_url: 'https://teste.susercontent.com/arquivo' };
    throw new Error('rota inesperada ' + rota);
  };
  const url = await exportarPedidos(chamar, ['BRTESTE1'], () => {}, async () => {}, () => 1795000000000);
  assert.strictEqual(url, 'https://teste.susercontent.com/arquivo');
  assert.deepStrictEqual(chamadas[0], ['POST', '/api/admin/tracking/am_hub/return/export', { search_id_list: ['BRTESTE1'], searched_tag: 1 }]);
  assert.strictEqual(vezes, 2);
});

test('exportarPedidos: falha do SPX vira erro', async () => {
  const { exportarPedidos } = require('../extensao/shopee.js');
  const chamar = async (metodo, rota) => (rota.endsWith('/return/export') ? { task_id: 9 } : { task_list: [{ task_id: 9, export_status: 3, failed_reason: 'sem dados' }] });
  await assert.rejects(exportarPedidos(chamar, ['BRTESTE1'], () => {}, async () => {}), /sem dados/);
});
