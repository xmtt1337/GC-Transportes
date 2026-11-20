// node --test testes/  (dados inventados: BRTESTE..., estações e viagens de teste)
// Vapt Vupt 3.0: romaneio da viagem do SPX (anexo xlsx) e a conta feita na extensão.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../extensao/conferencia.js');

const PLANILHA = fs.readFileSync(path.join(__dirname, 'romaneio-sintetico.xlsx'));

test('lerXlsx: lê o anexo da viagem (zip + XML), com acento e entidades', async () => {
  const linhas = await C.lerXlsx(PLANILHA);
  assert.deepStrictEqual(linhas[0], ['Horario de entrega', 'Pedido (TN)', 'Origem', 'Destino', 'Número da TO', 'Rota de LH']);
  assert.strictEqual(linhas[1][3], 'XPT_SC_Caçador');
  assert.strictEqual(linhas[5][1], 'BRTESTE0000X & <A>');
  assert.strictEqual(linhas.length, 6);
});

test('lerXlsx: arquivo que não é xlsx dá erro claro', async () => {
  await assert.rejects(C.lerXlsx(new TextEncoder().encode('{"retcode":1,"message":"x"}')), /não é uma planilha xlsx/);
});

test('linhasDaAba: texto em linha, número e coluna pulada', () => {
  const xml = '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Pedido (TN)</t></is></c><c r="C1" t="s"><v>0</v></c></row>'
    + '<row r="2"><c r="A2" t="str"><v>BR&amp;1</v></c><c r="B2"/><c r="C2"><v>42</v></c></row></sheetData>';
  assert.deepStrictEqual(C.linhasDaAba(xml, ['Destino']), [['Pedido (TN)', '', 'Destino'], ['BR&1', '', '42']]);
});

test('romaneioDaPlanilha: só os BR que vêm para a estação, sem repetir, com a TO', async () => {
  const linhas = await C.lerXlsx(PLANILHA);
  const r = C.romaneioDaPlanilha(linhas, 'XPT_SC_Caçador');
  assert.deepStrictEqual(r.itens.map((x) => x.codigo), ['BRTESTE00001', 'BRTESTE00002', 'BRTESTE0000X & <A>']);
  assert.strictEqual(r.itens[0].to, 'TOTESTE0001');
  assert.strictEqual(r.outras_estacoes, 1);
  // Sem estação (ou sem coluna Destino): todos.
  assert.strictEqual(C.romaneioDaPlanilha(linhas, '').itens.length, 4);
  assert.throws(() => C.romaneioDaPlanilha([['a', 'b'], ['1', '2']], 'X'), /Pedido \(TN\)/);
});

test('viagensDoPainel: acha a lista dentro do data e marca as que chegam na estação', () => {
  const resposta = { retcode: 0, message: 'ok', data: { trips: [
    { trip_number: 'LTTESTE00001', station_name: 'XPT_SC_Teste', station_id: 1, arrived_station_name: 'XPT_SC_Teste',
      departed_station_name: 'SoC_PR_Teste', trip_order_qty_td: 6547, trip_status: 3, trip_ata: 1795149030, trip_eta: 1795150919 },
    { trip_number: 'LTTESTE00002', station_name: 'XPT_SC_Teste', arrived_station_name: 'SoC_PR_Teste', trip_order_qty_td: 200 },
    { trip_number: 'LTTESTE00001', station_name: 'XPT_SC_Teste' },
  ] } };
  const v = C.viagensDoPainel(resposta);
  assert.deepStrictEqual(v.map((x) => [x.numero, x.chega_aqui, x.pedidos]), [['LTTESTE00001', true, 6547], ['LTTESTE00002', false, 200]]);
  assert.strictEqual(v[0].estacao, 'XPT_SC_Teste');
  assert.strictEqual(v[0].ata, 1795149030);
  assert.deepStrictEqual(C.viagensDoPainel({ data: null }), []);
});

test('idDaViagem e endereços das listas do SPX', () => {
  const dados = { pageno: 1, total: 2, list: [{ id: 111, trip_number: 'LTTESTE00009' }, { id: 4417809, trip_number: 'LTTESTE00001' }] };
  assert.strictEqual(C.idDaViagem(dados, 'lttESTE00001'), 4417809);
  assert.strictEqual(C.idDaViagem(dados, 'LTNADA'), null);
  assert.strictEqual(C.idDaViagem(null, 'X'), null);
  const agora = new Date('2026-11-20T12:00:00-03:00');
  assert.strictEqual(C.faixa(7, agora), '1794538800,1795229999'); // 13/11 00:00 a 20/11 23:59:59, como a tela
  assert.strictEqual(C.urlPendentes(2, agora),
    '/api/admin/transportation/trip/list_v2?station_type=7,2,3,12&pageno=2&count=24&query_type=1&tab_type=1&display_range=1794538800,1795229999');
  assert.match(C.urlFinalizadas(1, agora), /^\/api\/admin\/transportation\/trip\/history\/list\?mtime=\d+,1795229999&pageno=1&count=24$/);
  assert.strictEqual(C.urlAnexo(4417809), '/api/admin/transportation/agency/email/attachments/get?trip_id=4417809');
});

const H = (hhmm) => Math.floor(Date.parse(`2026-11-20T${hhmm}:00-03:00`) / 1000);
const XPT = 'XPT_SC_Teste';

test('faltaConsultar e juntarRastreio: só pesquisa de novo o que pode mudar', () => {
  const guardado = [
    { codigo: 'BRTESTE00001', recebido_em: H('03:00'), saiu_em: H('08:00'), estacao: XPT },
    { codigo: 'BRTESTE00002', recebido_em: H('03:00'), estacao: XPT },
  ];
  assert.deepStrictEqual(C.faltaConsultar(['BRTESTE00001', 'BRTESTE00002', 'BRTESTE00003'], guardado), ['BRTESTE00002', 'BRTESTE00003']);
  const junto = C.juntarRastreio(guardado, [{ codigo: 'brteste00002', recebido_em: H('03:00'), saiu_em: H('09:00'), estacao: XPT }]);
  assert.strictEqual(junto.length, 2);
  assert.strictEqual(junto.find((r) => r.codigo === 'BRTESTE00002').saiu_em, H('09:00'));
});

test('contar: % AT, recebidos, divergências com TO, comprador e lugar emprestado pelo CEP', () => {
  const romaneio = ['1', '2', '3', '4', '5'].map((n) => ({ codigo: `BRTESTE0000${n}`, to: `TOTESTE000${n}` }));
  const rastreio = [
    { codigo: 'BRTESTE00001', recebido_em: H('03:10'), saiu_em: H('08:30'), estacao: XPT },
    { codigo: 'BRTESTE00002', recebido_em: H('03:20'), estacao: XPT }, // recebido, sem AT
    { codigo: 'BRTESTE00003', recebido_em: H('01:00'), estacao: 'SoC_PR_Teste' }, // ainda no SoC
    { codigo: 'BRTESTE00005', recebido_em: H('03:40'), estacao: XPT },
  ];
  const ats = [
    { at: 'AT1', codigos: ['BRTESTE00001', 'BRTESTE00009'], cidade: 'Cidade A', bairro: 'Centro', cluster: 'CL1', motorista: 'Motorista Teste', criada_em: H('02:00') },
    { at: 'AT2', codigos: ['BRTESTE00005'], cidade: '', bairro: '', cluster: '', criada_em: H('04:00') }, // AT sem cidade
  ];
  const pedidos = [
    { codigo: 'BRTESTE00001', comprador: 'Comprador Um', cep: '89500-000' },
    { codigo: 'BRTESTE00009', comprador: 'Comprador Nove', cep: '89500000' },
    { codigo: 'BRTESTE00002', comprador: 'Comprador Dois', cep: '89500000', sort_code: 'SC-X' },
    { codigo: 'BRTESTE00005', comprador: 'Comprador Cinco', cep: '89500000' },
  ];
  const c = C.contar({ romaneio, rastreio, ats, pedidos });
  assert.strictEqual(c.total, 5);
  assert.strictEqual(c.em_at, 2);
  assert.strictEqual(c.pct_at, 40);
  assert.strictEqual(c.recebidos, 3);
  assert.deepStrictEqual(c.recebido_sem_at.map((d) => d.codigo), ['BRTESTE00002']);
  assert.deepStrictEqual(c.nao_recebido.map((d) => d.codigo), ['BRTESTE00003', 'BRTESTE00004']);
  assert.strictEqual(c.divergencias, 3);
  const dois = c.recebido_sem_at[0];
  assert.deepStrictEqual([dois.to, dois.comprador, dois.cidade, dois.bairro, dois.cluster], ['TOTESTE0002', 'Comprador Dois', 'Cidade A', 'Centro', 'CL1']);
  const tres = c.nao_recebido[0];
  assert.strictEqual(tres.achado_no_spx, true);
  assert.strictEqual(tres.estacao, 'SoC_PR_Teste');
  assert.strictEqual(c.nao_recebido[1].achado_no_spx, false);
  // A AT2 veio sem cidade: o pacote empresta "Cidade A" pelo CEP.
  assert.strictEqual(c.at_sem_cidade, 1);
  assert.deepStrictEqual(c.porCidade.map((x) => [x.cidade, x.total]), [['Cidade A', 2]]);
  assert.strictEqual(c.processamento.inicio, H('03:10'));
  assert.strictEqual(c.completado.nos_pedidos, 1);

  // Sem o export: a conta é a mesma, só sem comprador nem empréstimo.
  const s = C.contar({ romaneio, rastreio, ats });
  assert.strictEqual(s.divergencias, 3);
  assert.strictEqual(s.recebido_sem_at[0].comprador, '');
  assert.strictEqual(s.recebido_sem_at[0].to, 'TOTESTE0002');
  assert.deepStrictEqual(s.porCidade.map((x) => x.cidade).sort(), ['(sem cidade)', 'Cidade A']);
});

test('guardarNoHistorico: por estação, guarda só os últimos dias', () => {
  let h = {};
  for (const d of ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']) h = C.guardarNoHistorico(h, XPT, d, { dia: d }, 3);
  h = C.guardarNoHistorico(h, 'XPT_SC_Outra', '2026-11-18', { dia: '2026-11-18' }, 3);
  assert.deepStrictEqual(Object.keys(h[XPT]).sort(), ['2026-11-16', '2026-11-17', '2026-11-18']);
  assert.deepStrictEqual(Object.keys(h.XPT_SC_Outra), ['2026-11-18']);
  // Conferir de novo no mesmo dia substitui.
  h = C.guardarNoHistorico(h, XPT, '2026-11-18', { dia: '2026-11-18', v: 2 }, 3);
  assert.strictEqual(h[XPT]['2026-11-18'].v, 2);
});
