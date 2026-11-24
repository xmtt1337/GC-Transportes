// node --test testes/*.test.js  (dados inventados)
// XM - Conferências no DS da iMile: a busca do dia (todas as páginas), o que sai de cada pacote e a
// convivência com o módulo "Ativos" da XM - Ativos na barra do DS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../extensao/imile/imile.js');

const EXT = path.join(__dirname, '../extensao');

// Um resultado como o da searchDispatchWaybill (campos de contato vêm, mas não podem sair).
const resultado = (n, extra = {}) => ({
  waybillNo: `330000000000${n}`, courier: n % 2 ? 'Entregador Teste' : '', courierCode: n % 2 ? 'C-TESTE' : '',
  consigneeCity: 'Cidade Teste', dispatchStation: 'DS TESTE', receiveTime: '2026-01-01 08:00:00', arrivalTime: null,
  dsUnloadingTime: null, lastScanStatus: 'Recebido no DS', consignee: 'Pessoa Teste', consigneeMobile: '49900000000',
  consigneeAddress: 'Rua Teste 1', consigneeTaxIdNo: '00000000000', consigneeLatitude: '-1', sku: 'Produto Teste', ...extra,
});

test('corpo da busca: o da própria tela, recebimento no hub no dia', () => {
  const c = I.corpoDaBusca('2026-01-01', 3, 100);
  assert.strictEqual(c.dateSearchType, 'receive');
  assert.strictEqual(c.startTime, '2026-01-01 00:00:00');
  assert.strictEqual(c.endTime, '2026-01-01 23:59:59');
  assert.strictEqual(c.currentPage, 3);
  assert.strictEqual(c.showCount, 100);
  assert.deepStrictEqual(c.lastScanStatus, []);
});

test('paraPacote: só o que a conferência usa (nada de nome, telefone, endereço, documento ou produto)', () => {
  const p = I.paraPacote(resultado(1, { arrivalTime: '2026-01-01 09:00:00' }));
  assert.deepStrictEqual(p, {
    waybill: '3300000000001', entregador: 'Entregador Teste', cidade: 'Cidade Teste', ponto: 'DS TESTE',
    entrada: '2026-01-01 08:00:00', chegada: '2026-01-01 09:00:00', status: 'Recebido no DS',
  });
  assert.strictEqual(I.paraPacote(resultado(2)).entregador, '');
  assert.strictEqual(I.paraPacote(resultado(3, { courier: '', courierCode: 'C-TESTE' })).entregador, 'C-TESTE');
});

test('buscarDoDia: lê todas as páginas, com pausa entre elas', async () => {
  const pedidos = [];
  const post = async (rota, corpo) => {
    assert.strictEqual(rota, '/saastms/v1/biz/waybillInfo/searchDispatchWaybill');
    pedidos.push([corpo.currentPage, corpo.showCount]);
    const base = (corpo.currentPage - 1) * 2;
    const results = corpo.currentPage <= 3 ? [resultado(base + 1), resultado(base + 2)].slice(0, corpo.currentPage === 3 ? 1 : 2) : [];
    return { status: 'success', resultObject: { results, pagination: { totalPage: 3, totalResult: 5, currentPage: corpo.currentPage } } };
  };
  const pausas = [];
  const avisos = [];
  const r = await I.buscarDoDia(post, '2026-01-01', (a) => avisos.push(a), async (ms) => { pausas.push(ms); });
  assert.deepStrictEqual(pedidos, [[1, 100], [2, 100], [3, 100]]);
  assert.strictEqual(r.total, 5);
  assert.strictEqual(r.pacotes.length, 5);
  assert.strictEqual(pausas.length, 2);
  assert.ok(avisos.at(-1).includes('3 de 3'));
  assert.ok(!JSON.stringify(r).includes('Pessoa Teste') && !JSON.stringify(r).includes('49900000000'));
});

test('buscarDoDia: se a iMile recusar 100 por página, usa 20 (o da tela); recusando de novo, para', async () => {
  const pedidos = [];
  const post = async (rota, corpo) => {
    pedidos.push(corpo.showCount);
    if (corpo.showCount > 20) return { status: 'fail', message: 'showCount' };
    return { status: 'success', resultObject: { results: [resultado(1)], pagination: { totalPage: 1, totalResult: 1 } } };
  };
  const r = await I.buscarDoDia(post, '2026-01-01', () => {}, async () => {});
  assert.deepStrictEqual(pedidos, [100, 20]);
  assert.strictEqual(r.pacotes.length, 1);
  await assert.rejects(I.buscarDoDia(async () => ({ status: 'fail', message: 'sessão expirada' }), '2026-01-01', () => {}, async () => {}), /recusou a busca: sessão expirada/);
});

test('hoje: data no horário do Brasil', () => {
  assert.strictEqual(I.hoje(new Date('2026-01-02T02:00:00Z')), '2026-01-01');
  assert.strictEqual(I.hoje(new Date('2026-01-02T03:00:00Z')), '2026-01-02');
});

test('imile.js: Front-Sec não é copiado; canal próprio, longe do da XM - Ativos', () => {
  const fonte = fs.readFileSync(path.join(EXT, 'imile/imile.js'), 'utf8');
  assert.ok(!I.HEADERS_DO_SITE.some((h) => /front-sec/i.test(h)));
  assert.strictEqual(I.CANAL, 'xmConfImile');
  assert.ok(!/xmAtivosImile['"]/.test(fonte.replace(/\/\/.*$/gm, '')));
  assert.ok(!/getDesensitizationInfo/.test(fonte), 'o olho (cota) fica só na XM - Ativos');
});

test('conferencia.js (iMile): grupo Conferências no módulo XMTT, xmtt-modulo.js igual ao da XM - Ativos', () => {
  const conf = fs.readFileSync(path.join(EXT, 'imile/conferencia.js'), 'utf8');
  const modulo = fs.readFileSync(path.join(EXT, 'imile/xmtt-modulo.js'), 'utf8');
  assert.ok(conf.includes("const CANAL = 'xmConfImile';"));
  assert.ok(conf.includes("const ROTA = '/macros/imile-conferencia';"));
  assert.ok(conf.includes("dono: 'conferencias', ordem: 1, titulo: 'Conferências'"));
  assert.ok(!/ID_MODULO|AsideMenu1-root/.test(conf), 'sem ícone próprio na barra: um só, o XMTT');
  const daAtivos = path.join(__dirname, '../../xm-ativos/extensao/imile/xmtt-modulo.js');
  if (fs.existsSync(daAtivos)) assert.strictEqual(modulo, fs.readFileSync(daAtivos, 'utf8'), 'os dois xmtt-modulo.js precisam ser iguais');
});
