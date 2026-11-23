// node --test testes/  (dados inventados)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/shopee/regras.js');
const { exportarPedidos, buscarTelefone } = require('../extensao/shopee/spx.js');

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
});

test('api: só a sessão vencida derruba o login; 403 é "sem acesso a esta parte"', async () => {
  const resp = (status, j) => async () => ({ status, ok: status < 400, json: async () => j });
  await assert.rejects(R.api('T', 'GET', '/x', undefined, resp(401, {})), (e) => e instanceof R.ErroDeConta);
  await assert.rejects(R.api('T', 'GET', '/x', undefined, resp(403, { error: 'Acesso negado' })),
    (e) => !(e instanceof R.ErroDeConta) && e.semAcesso && /não tem acesso/.test(e.message));
  await assert.rejects(R.api('T', 'GET', '/x', undefined, resp(403, { error: 'A seleção tem mensagem de outro polo.' })),
    (e) => !(e instanceof R.ErroDeConta) && /outro polo/.test(e.message));
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

test('manifest: uma extensão só (XM - Ativos) para as três transportadoras, sem popup, id da antiga Ativos Shopee', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../extensao/manifest.json'), 'utf8'));
  assert.strictEqual(m.name, 'XM - Ativos');
  assert.strictEqual(m.action, undefined);
  // O "key" é o da antiga XM - Ativos Shopee: o id (igjjbomfhibdcfngjclomdomhkpgcedo) já está liberado no CORS.
  assert.ok(m.key.startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAiNE+1KkUKZdLMUr9'));
  assert.deepStrictEqual(m.host_permissions, ['https://spx.shopee.com.br/*', 'https://*.susercontent.com/*', 'https://ds.imile.com/*',
    'https://newsupplier.anjunexpress.com/*', 'https://sistema-backend-i4uh.onrender.com/*']);
  for (const cs of m.content_scripts) for (const f of cs.js) assert.ok(fs.existsSync(path.join(__dirname, '../extensao', f)), f);
  const doSpx = m.content_scripts.filter((cs) => cs.matches.includes('https://spx.shopee.com.br/*'));
  assert.deepStrictEqual(doSpx.map((cs) => cs.js), [['shopee/spx.js'], ['shopee/regras.js', 'shopee/conversas.js', 'shopee/ativos.js']]);
  // O fundo.js usa as regras da Shopee (login, envio e o CSV do export) para todas.
  assert.ok(fs.readFileSync(path.join(__dirname, '../extensao/fundo.js'), 'utf8').includes("importScripts('shopee/regras.js')"));
});

test('conversas: só as da Shopee (sem Nos chamaram), aba e coluna iguais às do sistema', () => {
  const agora = new Date('2026-11-18T15:00:00Z');
  const base = { numero: '5549900000001', primeiro_envio: '2026-11-18T12:00:00Z', ultima: '2026-11-18T12:00:00Z' };
  const lista = [
    { ...base, pedido: 'BRTESTE1', transportadora: 'shopee', enviado_por_role: 'sac', prazo_horas: 24 },
    { ...base, pedido: 'BRTESTE2', transportadora: 'shopee', enviado_por_role: 'admin', tipo: 'outros', nao_lidas: 2, ultima: '2026-11-18T14:00:00Z' },
    { ...base, pedido: 'JTTESTE3', transportadora: 'jt', enviado_por_role: 'sac' },
    { ...base, pedido: 'BRTESTE4', template_inicial: 'confirmacao_entrega', enviado_por_role: 'dev', tipo: 'outros', respondido: true, resultado: 'recebeu' },
    { numero: '5549900000009', primeiro_envio: null, ultima: '2026-11-18T13:00:00Z' },
    { ...base, pedido: '', transportadora: 'shopee', tem_entregador: true },
  ];
  const vis = R.conversasDaShopee(lista);
  // mais recente primeiro; o "Nos chamaram" (5549900000009), a J&T e o entregador ficam de fora
  assert.deepStrictEqual(vis.map((c) => c.pedido || c.numero), ['BRTESTE2', 'BRTESTE1', 'BRTESTE4']);
  assert.deepStrictEqual(vis.map((c) => R.abaDe(c)), ['outros', 'acareacao', 'outros']);
  assert.strictEqual(R.abaDe(lista[4]), 'chamaram');
  assert.strictEqual(R.statusPrazo(lista[0], agora), 'vencendo_hoje'); // vence 12h+24h = amanhã 12h, faltam 21h
  assert.strictEqual(R.statusPrazo({ ...lista[0], prazo_horas: 2 }, agora), 'vencidos');
  assert.strictEqual(R.statusPrazo({ ...lista[0], prazo_horas: 72 }, agora), 'mais_24h');
  assert.strictEqual(R.colunaDesfecho(lista[1]), 'novas_respostas');
  assert.strictEqual(R.colunaDesfecho(lista[3]), 'entregue');
  assert.strictEqual(R.colunaDesfecho({ respondido: true, resultado: 'nao_recebeu', nao_lidas: 3 }), 'nao_entregue'); // desfecho vence a leitura
  assert.strictEqual(R.tempoRestante(new Date('2026-11-18T21:10:00Z'), agora), 'faltam 6h 10min');
  assert.strictEqual(R.tempoRestante(new Date('2026-11-18T12:00:00Z'), agora), 'venceu há 3h 0min');
  assert.strictEqual(R.formatarNumero('5549999276131'), '+55 49 99927-6131');
});

test('papelDoToken: lê o cargo do token (só para a aba inicial)', () => {
  const corpo = Buffer.from(JSON.stringify({ id: 1, role: 'sac' })).toString('base64').replace(/=+$/, '');
  assert.strictEqual(R.papelDoToken(`x.${corpo}.y`), 'sac');
  assert.strictEqual(R.papelDoToken('lixo'), '');
});

test('opções: página registrada no manifest e um liga/desliga para cada menu', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '../extensao/manifest.json'), 'utf8'));
  assert.deepStrictEqual(m.options_ui, { page: 'opcoes.html', open_in_tab: true });
  const html = fs.readFileSync(path.join(__dirname, '../extensao/opcoes.html'), 'utf8');
  const chaves = [...html.matchAll(/data-menu="([a-z]+)"/g)].map((x) => x[1]);
  assert.deepStrictEqual(chaves, ['disparar', 'conversas', 'aviso']);
  // as chaves são as mesmas páginas do menu (ativos.js)
  const ativos = fs.readFileSync(path.join(__dirname, '../extensao/shopee/ativos.js'), 'utf8');
  ['disparar', 'conversas'].forEach((k) => assert.ok(ativos.includes(`chave: '${k}'`), k));
  // a Conferência é outra extensão (XM - Conferência Shopee)
  assert.ok(!ativos.includes("chave: 'vapt'"));
});
