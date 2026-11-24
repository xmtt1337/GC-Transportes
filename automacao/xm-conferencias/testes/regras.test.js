// node --test testes/*.test.js  (dados inventados)
// XM - Conferência Shopee: login no sistema, leitura do export, chamadas do SPX e o manifest.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/regras.js');
const S = require('../extensao/shopee/spx.js');

const EXT = path.join(__dirname, '../extensao');

test('entrar: login com canal vigia e confere o acesso à extensão (/macros/acesso)', async () => {
  const chamadas = [];
  const buscar = async (url, op) => {
    chamadas.push([url.replace(R.BACKEND, ''), op.method, JSON.parse(op.body || 'null')]);
    if (url.endsWith('/login')) return { status: 200, ok: true, json: async () => ({ success: true, token: 'T', name: 'Pessoa Teste' }) };
    return { status: 200, ok: true, json: async () => ({ ok: true }) };
  };
  assert.deepStrictEqual(await R.entrar('pessoa', 'segredo', buscar), { token: 'T', nome: 'Pessoa Teste', papel: '' });
  assert.strictEqual(chamadas[0][2].canal, 'vigia');
  assert.deepStrictEqual(chamadas[1], ['/macros/acesso', 'GET', null]);
  const negado = async (url) => (url.endsWith('/login')
    ? { status: 200, ok: true, json: async () => ({ success: true, token: 'T' }) }
    : { status: 403, ok: false, json: async () => ({ error: 'Acesso negado' }) });
  await assert.rejects(R.entrar('a', 'b', negado), (e) => e instanceof R.ErroDeConta && /extensão/.test(e.message));
  await assert.rejects(R.entrar('a', 'b', async () => ({ status: 200, ok: true, json: async () => ({ success: false }) })), /não confere/);
});

test('papelDoToken: lê o cargo do token', () => {
  const corpo = Buffer.from(JSON.stringify({ id: 1, role: 'user' })).toString('base64').replace(/=+$/, '');
  assert.strictEqual(R.papelDoToken(`x.${corpo}.y`), 'user');
  assert.strictEqual(R.papelDoToken('lixo'), '');
});

test('pedidosDoExport: comprador, CEP, motorista e sort code (sem telefone nem endereço)', () => {
  const csv = '﻿Order ID,Sort Code Name,Zipcode Name,Buyer Name,Buyer Phone,Postal Code,Driver Name,Buyer Address\r\n'
    + 'brteste1,,89000000,"Pessoa, Teste",,89000-000,Motorista Teste,Rua Teste 1\r\nBRTESTE2,CA-1,,Outra Pessoa,,89000-001,,Rua Teste 2\r\n';
  assert.deepStrictEqual(R.pedidosDoExport(csv), [
    { codigo: 'BRTESTE1', comprador: 'Pessoa, Teste', cep: '89000000', motorista: 'Motorista Teste', sort_code: '' },
    { codigo: 'BRTESTE2', comprador: 'Outra Pessoa', cep: '89000-001', motorista: '', sort_code: 'CA-1' },
  ]);
  assert.throws(() => R.pedidosDoExport('a,b\n1,2'), /Order ID/);
});

test('pesquisa em lote divide o lote recusado e lista as ATs do dia', async () => {
  const lotes = [];
  const post = async (rota, corpo) => {
    if (rota.includes('tracking_list')) {
      lotes.push(corpo.search_id_list.length);
      if (corpo.search_id_list.length > 300) throw new Error('grande demais');
      return { list: corpo.search_id_list.map((c) => ({ shipment_id: c, current_station_received_time: 1, current_station_name: 'XPT_TESTE' })) };
    }
    return { total: 2, list: corpo.pageno === 1 ? [{ assignment_task_id: 'ATTESTE1', shipment_id: 'BR1, BR2', city: 'Cidade A' }, { assignment_task_id: 'ATTESTE2', shipment_id: 'BR3' }] : [] };
  };
  const codigos = Array.from({ length: 600 }, (_, i) => `BRTESTE${i}`);
  const r = await S.rastrear(post, codigos);
  assert.strictEqual(r.length, 600);
  assert.ok(lotes.includes(500) && lotes.includes(250));
  const ats = await S.listarAts(post, '2026-11-19', () => {}, async () => {});
  assert.deepStrictEqual(ats.map((a) => [a.at, a.codigos]), [['ATTESTE1', ['BR1', 'BR2']], ['ATTESTE2', ['BR3']]]);
  assert.strictEqual(S.faixaDoDia('2026-11-19'), `${Date.parse('2026-11-19T03:00:00Z') / 1000},${Date.parse('2026-11-19T03:00:00Z') / 1000 + 86399}`);
});

test('exportarPedidos: cria o export, espera ficar pronto e devolve o link', async () => {
  let vezes = 0;
  const chamar = async (metodo, rota, corpo) => {
    if (rota.endsWith('/return/export')) { assert.deepStrictEqual(corpo, { search_id_list: ['BRTESTE00001'], searched_tag: 1 }); return { task_id: 7 }; }
    if (rota.includes('list_for_portal')) { vezes += 1; return { task_list: [{ task_id: 7, export_status: vezes < 3 ? 0 : 2 }] }; }
    if (rota.includes('get_signed_download_url')) return { download_url: 'https://teste.susercontent.com/f' };
    throw new Error(rota);
  };
  assert.strictEqual(await S.exportarPedidos(chamar, ['BRTESTE00001'], () => {}, async () => {}), 'https://teste.susercontent.com/f');
  assert.strictEqual(vezes, 3);
});

test('spx.js: só as rotas da viagem passam, e sem o "olho" do telefone', () => {
  assert.ok(S.rotaDaViagem('/mgmt/api/pc/dashboard/lm/linehaul_trips'));
  assert.ok(S.rotaDaViagem('/api/admin/transportation/trip/list_v2?station_type=7&pageno=1'));
  assert.ok(S.rotaDaViagem('/api/admin/transportation/trip/history/list?mtime=1,2'));
  assert.ok(S.rotaDaViagem('/api/admin/transportation/agency/email/attachments/get?trip_id=1'));
  assert.ok(!S.rotaDaViagem('/api/fleet_order/order/detail/show_sensitive_data?shipment_id=BR1'));
  assert.ok(!S.rotaDaViagem('/api/admin/transportation/trip/delete'));
  const fonte = fs.readFileSync(path.join(EXT, 'shopee/spx.js'), 'utf8');
  assert.ok(!fonte.includes('show_sensitive_data'), 'o olho do telefone fica só na XM - Ativos Shopee');
  // Canal próprio: a XM - Ativos Shopee responde em "xmAtivos"; aqui é "xmConf".
  assert.strictEqual(S.CANAL, 'xmConf');
  assert.ok(!/xmAtivos/.test(fonte.replace(/\/\/.*$/gm, '')));
  assert.ok(fs.readFileSync(path.join(EXT, 'shopee/menu.js'), 'utf8').includes("const CANAL = 'xmConf'"));
});

test('manifest: XM - Conferências (SPX e Anjun), sem popup, id da antiga Conferência Shopee; arquivos existem', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.name, 'XM - Conferências');
  assert.strictEqual(m.action, undefined);
  // id ccldgbajagfjmdcgofjmcglcboojndcm, já liberado no CORS do sistema
  const hash = require('node:crypto').createHash('sha256').update(Buffer.from(m.key, 'base64')).digest('hex').slice(0, 32);
  assert.strictEqual([...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join(''), 'ccldgbajagfjmdcgofjmcglcboojndcm');
  assert.deepStrictEqual(m.host_permissions, ['https://spx.shopee.com.br/*', 'https://*.susercontent.com/*', 'https://newsupplier.anjunexpress.com/*', 'https://ds.imile.com/*', 'https://sistema-backend-i4uh.onrender.com/*']);
  for (const cs of m.content_scripts) for (const f of cs.js) assert.ok(fs.existsSync(path.join(EXT, f)), f);
  assert.ok(fs.existsSync(path.join(EXT, m.background.service_worker)));
  const daAnjun = m.content_scripts.filter((cs) => cs.matches.includes('https://newsupplier.anjunexpress.com/*'));
  assert.deepStrictEqual(daAnjun.map((cs) => cs.js), [['anjun/anjun.js'], ['anjun/xmtt-menu.js', 'anjun/conferencia.js']]);
  assert.strictEqual(daAnjun[0].world, 'MAIN');
  const daImile = m.content_scripts.filter((cs) => cs.matches.includes('https://ds.imile.com/*'));
  assert.deepStrictEqual(daImile.map((cs) => cs.js), [['imile/imile.js'], ['imile/conferencia.js']]);
  assert.strictEqual(daImile[0].world, 'MAIN');
});

test('menu XMTT na Anjun: o xmtt-menu.js é igual ao da XM - Ativos; Conferências vem antes de Ativos', () => {
  const nosso = fs.readFileSync(path.join(EXT, 'anjun/xmtt-menu.js'), 'utf8');
  const daAtivos = path.join(__dirname, '../../xm-ativos/extensao/anjun/xmtt-menu.js');
  if (fs.existsSync(daAtivos)) assert.strictEqual(nosso, fs.readFileSync(daAtivos, 'utf8'), 'os dois xmtt-menu.js precisam ser iguais');
  assert.ok(nosso.includes("const TITULO = 'XMTT'"));
  const conf = fs.readFileSync(path.join(EXT, 'anjun/conferencia.js'), 'utf8');
  assert.ok(conf.includes('const ORDEM = 1;') && conf.includes("const DONO = 'conferencias';"));
  assert.ok(conf.includes("const CANAL = 'xmConfAnjun';"));
  assert.ok(conf.includes('xmtt-pagina'), 'a página entra na regra de uma página por vez');
});

test('fundo.js: o canal "sistema" só deixa passar as conferências da Anjun e da iMile', () => {
  const fundo = fs.readFileSync(path.join(EXT, 'fundo.js'), 'utf8');
  assert.ok(fundo.includes("['/macros/anjun-conferencia', '/macros/imile-conferencia'].some((p) => c.startsWith(p))"));
  assert.ok(fundo.includes("c.includes('..')"));
});

test('menu.js e vapt.js: classes próprias (xm-conf-*), sem esbarrar nas da XM - Ativos Shopee', () => {
  const menu = fs.readFileSync(path.join(EXT, 'shopee/menu.js'), 'utf8');
  const vapt = fs.readFileSync(path.join(EXT, 'shopee/vapt.js'), 'utf8');
  assert.ok(menu.includes("const CLASSE_ITEM = 'xm-conf-item'") && menu.includes("const CLASSE_GRUPO = 'xm-conf-grupo'"));
  assert.ok(!/xm-ativos-pagina|XMAtivos/.test(vapt));
  assert.ok(vapt.includes('self.XMConfVapt'));
});
