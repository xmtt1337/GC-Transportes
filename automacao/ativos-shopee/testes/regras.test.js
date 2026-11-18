// node --test testes/  (dados inventados)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/regras.js');
const { exportarPedidos, buscarTelefone } = require('../extensao/spx.js');

test('buscarTelefone: o olho do telefone, outra estação e recusa', async () => {
  const urls = [];
  const get = async (u) => { urls.push(u); return { retcode: 0, data: { data_detail: '49912345678' } }; };
  assert.deepStrictEqual(await buscarTelefone(get, 'BRTESTE00001'), { outraEstacao: false, telefone: '49912345678' });
  assert.strictEqual(urls[0], '/api/fleet_order/order/detail/show_sensitive_data?shipment_id=BRTESTE00001&data_field=buyer_contact');
  assert.deepStrictEqual(await buscarTelefone(async () => ({ retcode: 200301007 }), 'BR1'), { outraEstacao: true, telefone: '' });
  await assert.rejects(buscarTelefone(async () => ({ retcode: 5, message: 'limite' }), 'BR1'), /recusou o telefone.*limite/);
});

test('lerCodigos: BR em linhas, espaços ou vírgulas, sem repetir e em maiúsculas', () => {
  assert.deepStrictEqual(R.lerCodigos('BRTESTE00001\nbrteste00002, BRTESTE00001;BRTESTE0000X  lixo 123'), ['BRTESTE00001', 'BRTESTE00002', 'BRTESTE0000X']);
  assert.deepStrictEqual(R.lerCodigos(''), []);
});

test('contatosDoExport: só código, nome (sem o "_" do fim) e telefone', () => {
  const csv = '﻿Order ID,SLS Tracking Number,Buyer Name,Buyer Phone,Buyer Address\r\n'
    + 'brteste00001,X,"Pessoa Teste_",5549900000000,Rua Teste 1\r\n'
    + 'BRTESTE00002,X,"Outra, Pessoa",,\r\n';
  assert.deepStrictEqual(R.contatosDoExport(csv), [
    { codigo: 'BRTESTE00001', nome: 'Pessoa Teste', telefone: '5549900000000' },
    { codigo: 'BRTESTE00002', nome: 'Outra, Pessoa', telefone: '' },
  ]);
  // o export real vem sem telefone: tudo bem, ele sai pelo olho
  assert.deepStrictEqual(R.contatosDoExport('Order ID,Buyer Name\r\nbr1,A_\r\n'), [{ codigo: 'BR1', nome: 'A', telefone: '' }]);
  assert.throws(() => R.contatosDoExport('Buyer Name\r\nA'), /Order ID/);
});

test('validarTelefone: mesma regra do sistema', () => {
  assert.deepStrictEqual(R.validarTelefone('5549912345678'), { ok: true, e164: '5549912345678' });
  assert.deepStrictEqual(R.validarTelefone('(49) 9 1234-5678'), { ok: true, e164: '5549912345678' });
  assert.deepStrictEqual(R.validarTelefone('4933334444'), { ok: true, e164: '554933334444' });
  assert.strictEqual(R.validarTelefone('').ok, false);
  assert.strictEqual(R.validarTelefone('49812345678').ok, false); // 11 dígitos sem o 9
  assert.strictEqual(R.telefoneLegivel('5549912345678'), '(49) 9 1234-5678');
});

test('montarEnvio: corpo igual ao do disparo em massa do sistema (confirmacao_entrega, sem prazo)', () => {
  const { corpo } = R.montarEnvio({ codigo: 'BRTESTE00001', nome: 'Pessoa Teste', telefone: '5549912345678' });
  assert.deepStrictEqual(corpo.parametros, ['Pessoa Teste', 'BRTESTE00001']);
  assert.strictEqual(corpo.template, 'confirmacao_entrega');
  assert.strictEqual(corpo.numero, '5549912345678');
  assert.strictEqual(corpo.prazo_horas, null);
  assert.strictEqual(corpo.transportadora, 'shopee');
  assert.strictEqual(corpo.destino, 'outros');
  assert.match(corpo.texto, /^Olá, Pessoa Teste!\nAqui é da GCTRANSPORTES, parceira da SHOPEE .*pedido BRTESTE00001\./);
  assert.strictEqual(R.montarEnvio({ codigo: 'BR1', nome: 'X', telefone: '' }).erro, 'Sem telefone no SPX.');
  assert.strictEqual(R.montarEnvio({ codigo: 'BR1', nome: '', telefone: '5549912345678' }).erro, 'Sem nome no SPX.');
});

test('texto da mensagem é o mesmo do sistema (meusite/js/whatsapp-teste.js)', () => {
  const site = path.join(__dirname, '../../../meusite/js/whatsapp-teste.js');
  if (!fs.existsSync(site)) return;
  const fonte = fs.readFileSync(site, 'utf8').replace(/\r\n/g, '\n');
  const trecho = fonte.slice(fonte.indexOf('template: "confirmacao_entrega"'));
  const modelo = trecho.slice(trecho.indexOf('montar: v => `') + 'montar: v => `'.length, trecho.indexOf('`,'));
  const esperado = modelo.replace('${v.nome_cliente || "___"}', 'Pessoa Teste').replace('${v.codigo_pedido || "___"}', 'BRTESTE00001');
  assert.strictEqual(R.montarTexto('Pessoa Teste', 'BRTESTE00001'), esperado);
});

test('entrar: login com canal vigia e confere o acesso aos ativos', async () => {
  const chamadas = [];
  const buscar = async (url, op) => {
    chamadas.push([url.replace(R.BACKEND, ''), op.method, JSON.parse(op.body || 'null')]);
    if (url.endsWith('/login')) return { status: 200, ok: true, json: async () => ({ success: true, token: 'T', name: 'Pessoa Teste' }) };
    return { status: 200, ok: true, json: async () => ({ estados: {} }) };
  };
  assert.deepStrictEqual(await R.entrar('pessoa', 'segredo', buscar), { token: 'T', nome: 'Pessoa Teste' });
  assert.strictEqual(chamadas[0][2].canal, 'vigia');
  assert.deepStrictEqual(chamadas[1], ['/macros/whatsapp/ativos-status', 'POST', { pedidos: [] }]);
  const negado = async (url) => (url.endsWith('/login')
    ? { status: 200, ok: true, json: async () => ({ success: true, token: 'T' }) }
    : { status: 403, ok: false, json: async () => ({ error: 'Acesso negado' }) });
  await assert.rejects(R.entrar('a', 'b', negado), (e) => e instanceof R.ErroDeConta && /SAC/.test(e.message));
});

test('exportarPedidos: cria o export, espera ficar pronto e devolve o link', async () => {
  let vezes = 0;
  const chamar = async (metodo, rota, corpo) => {
    if (rota.endsWith('/return/export')) { assert.deepStrictEqual(corpo, { search_id_list: ['BRTESTE00001'], searched_tag: 1 }); return { task_id: 7 }; }
    if (rota.includes('list_for_portal')) { vezes += 1; return { task_list: [{ task_id: 7, export_status: vezes < 3 ? 0 : 2 }] }; }
    if (rota.includes('get_signed_download_url')) return { download_url: 'https://teste.susercontent.com/f' };
    throw new Error(rota);
  };
  assert.strictEqual(await exportarPedidos(chamar, ['BRTESTE00001'], () => {}, async () => {}), 'https://teste.susercontent.com/f');
  assert.strictEqual(vezes, 3);
});

test('manifest: sem popup, só SPX, arquivos do export e o sistema', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../extensao/manifest.json'), 'utf8'));
  assert.strictEqual(m.action, undefined);
  assert.deepStrictEqual(m.host_permissions, ['https://spx.shopee.com.br/*', 'https://*.susercontent.com/*', 'https://sistema-backend-i4uh.onrender.com/*']);
  for (const cs of m.content_scripts) for (const f of cs.js) assert.ok(fs.existsSync(path.join(__dirname, '../extensao', f)), f);
});
