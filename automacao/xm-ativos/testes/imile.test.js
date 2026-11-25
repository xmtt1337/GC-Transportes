// node --test testes/*.test.js  (dados inventados)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/imile/regras.js');
const I = require('../extensao/imile/imile.js');

const EXT = path.join(__dirname, '../extensao');

test('lerCodigos: waybills só de dígitos, sem repetir; o resto vai para ignorados', () => {
  assert.deepStrictEqual(R.lerCodigos('6012345678901\n6012345678902, 6012345678901;BR123 abc'),
    { codigos: ['6012345678901', '6012345678902'], ignorados: ['BR123', 'abc'] });
  assert.deepStrictEqual(R.lerCodigos(''), { codigos: [], ignorados: [] });
});

test('validarTelefone: mesma regra do sistema', () => {
  assert.deepStrictEqual(R.validarTelefone('+55 49 99999-0000'), { ok: true, e164: '5549999990000' });
  assert.deepStrictEqual(R.validarTelefone('4933330000'), { ok: true, e164: '554933330000' });
  assert.strictEqual(R.validarTelefone('').erro, 'Sem telefone na iMile.');
  assert.strictEqual(R.validarTelefone('49 9999').erro, 'Telefone incompleto.');
  assert.match(R.validarTelefone('49 89999 0000').erro, /9 dígitos/);
  assert.strictEqual(R.telefoneLegivel('5549999990000'), '(49) 9 9999-0000');
});

test('montarEnvio: confirmacao_imile com {{1}} nome, {{2}} quem dispara, {{3}} produto, {{4}} pedido', () => {
  const { corpo } = R.montarEnvio({ codigo: '6012345678901', nome: 'Pessoa Teste', telefone: '49999990000', produto: 'Produto Teste', atendente: 'Atendente Teste' });
  assert.deepStrictEqual(corpo.parametros, ['Pessoa Teste', 'Atendente Teste', 'Produto Teste', '6012345678901']);
  assert.strictEqual(corpo.template, 'confirmacao_imile');
  assert.strictEqual(corpo.transportadora, 'imile');
  assert.strictEqual(corpo.destino, 'outros');
  assert.strictEqual(corpo.prazo_horas, null);
  assert.strictEqual(corpo.numero, '5549999990000');
  assert.strictEqual(corpo.pedido, '6012345678901');
  assert.strictEqual(corpo.texto, `Olá, Pessoa Teste! Tudo bem?
Me chamo Atendente Teste e faço parte do time de SAC da iMile Delivery.
Gostaria de confirmar se você recebeu seu pedido:
Pedido: 6012345678901
Produto: Produto Teste

Você recebeu o pedido?
Por favor, responda com SIM ou NÃO.`);
  // Produto vazio não pode ir vazio para a Meta.
  assert.strictEqual(R.montarEnvio({ codigo: '1', nome: 'A', telefone: '49999990000', produto: '', atendente: 'B' }).corpo.parametros[2], 'não informado');
  assert.strictEqual(R.montarEnvio({ codigo: '1', nome: '', telefone: '49999990000', atendente: 'B' }).erro, 'Sem nome na iMile.');
  assert.match(R.montarEnvio({ codigo: '1', nome: 'A', telefone: '49999990000', atendente: '' }).erro, /quem dispara/);
});

test('entrar: login com canal vigia e confere o acesso (/macros/acesso)', async () => {
  const chamadas = [];
  const buscar = async (url, op) => {
    chamadas.push([url.replace(R.BACKEND, ''), op.method, JSON.parse(op.body || 'null')]);
    if (url.endsWith('/login')) return { status: 200, ok: true, json: async () => ({ success: true, token: 'T', name: 'Pessoa Teste' }) };
    return { status: 200, ok: true, json: async () => ({ ok: true }) };
  };
  assert.deepStrictEqual(await R.entrar('pessoa', 'segredo', buscar), { token: 'T', nome: 'Pessoa Teste', papel: '' });
  assert.strictEqual(chamadas[0][2].canal, 'vigia');
  assert.deepStrictEqual(chamadas[1], ['/macros/acesso', 'GET', null]);
});

test('buscarPedidos: busca normal (sem cota); remetente e não achados', async () => {
  const rotas = [];
  const post = async (rota, corpo) => {
    rotas.push([rota, corpo.searchValue]);
    return corpo.searchValue === '2' ? { status: 'fail', message: 'não existe' } : { status: 'success', resultObject: { consignorinfo: { consignor: 'Loja Teste' } } };
  };
  const r = await I.buscarPedidos(post, ['1', '2'], () => {}, async () => {});
  assert.deepStrictEqual(r, [{ codigo: '1', achado: true, remetente: 'Loja Teste' }, { codigo: '2', achado: false, motivo: 'não existe' }]);
  assert.ok(rotas.every(([rota]) => rota === '/saastms/v1/biz/track/query'));
});

test('buscarPedidos: "system is busy" não vira "não achado"; espera, tenta de novo e segue mais devagar', async () => {
  const busy = { status: 'fail', message: 'The system is busy,please try again later' };
  const ok = { status: 'success', resultObject: { consignorinfo: { consignor: 'Loja Teste' } } };
  // o 2o pede calma 2 vezes e depois responde
  let vezes = 0;
  const esperas = [];
  const avisos = [];
  const post = async (rota, corpo) => (corpo.searchValue === '2' && vezes++ < 2 ? busy : ok);
  const r = await I.buscarPedidos(post, ['1', '2', '3'], (n, t, texto) => avisos.push(texto || ''), async (ms) => { esperas.push(ms); });
  assert.deepStrictEqual(r.map((p) => p.achado), [true, true, true]);
  assert.deepStrictEqual(esperas, [I.PAUSA_BUSCA_MS, I.ESPERAS_OCUPADO_MS[0], I.ESPERAS_OCUPADO_MS[1], 1500]);
  assert.ok(avisos.some((a) => /mais devagar: esperando 3 s/.test(a)));
  // continua recusando: para, e o resto fica "não buscado" (nunca "não achado")
  const sempre = await I.buscarPedidos(async (rota, corpo) => (corpo.searchValue === '1' ? ok : busy), ['1', '2', '3'], () => {}, async () => {});
  assert.deepStrictEqual(sempre.map((p) => [p.codigo, p.achado, !!p.naoBuscado]), [['1', true, false], ['2', false, true], ['3', false, true]]);
  // "não existe" de verdade continua sendo não achado, sem esperar
  const esp2 = [];
  const nao = await I.buscarPedidos(async () => ({ status: 'fail', message: 'waybill not exist' }), ['9'], () => {}, async (ms) => esp2.push(ms));
  assert.deepStrictEqual([nao[0].achado, !!nao[0].naoBuscado, esp2.length], [false, false, 0]);
});

test('revelar: nome, telefone, produto e a cota; para com a reserva e quando a iMile recusa', async () => {
  const resposta = (atual) => async () => ({ status: 'success', resultObject: {
    infoResult: { consigneeContact: 'Pessoa Teste', consigneeMobile: '5549999990000', sku: 'Produto Teste' },
    config: { maxCount: 700, currentCount: atual } } });
  const r = await I.revelar(resposta(100), '1');
  assert.deepStrictEqual([r.nome, r.telefone, r.produto, r.cota.restam, r.parar], ['Pessoa Teste', '5549999990000', 'Produto Teste', 600, '']);
  assert.match((await I.revelar(resposta(680), '1')).parar, /não esgotar a cota/);
  await assert.rejects(I.revelar(async () => ({ status: 'fail', message: 'sem sessão' }), '1'), (e) => e.parar && /recusou o olho/.test(e.message));
  await assert.rejects(I.revelar(async () => ({ status: 'success', resultObject: { config: { limit: true } } }), '1'), /cota/);
});

test('menu: um módulo só, "XMTT" (logo XM), dividido com a XM - Conferências pelo xmtt-modulo.js igual', () => {
  const fonte = fs.readFileSync(path.join(EXT, 'imile/ativos.js'), 'utf8');
  const modulo = fs.readFileSync(path.join(EXT, 'imile/xmtt-modulo.js'), 'utf8');
  const daConf = path.join(__dirname, '../../xm-conferencias/extensao/imile/xmtt-modulo.js');
  if (fs.existsSync(daConf)) assert.strictEqual(modulo, fs.readFileSync(daConf, 'utf8'), 'os dois xmtt-modulo.js precisam ser iguais');
  assert.ok(modulo.includes("const TITULO = 'XMTT';") && modulo.includes('.ImileSMN-AsideMenu-scoller'), 'entra na barra de ícones');
  assert.ok(fonte.includes("dono: 'ativos', ordem: 2, titulo: 'Ativos'"), 'grupo Ativos, depois de Conferências');
  assert.ok(!/ID_MODULO|AsideMenu1-root/.test(fonte), 'o módulo próprio "Ativos" saiu');
  // A logo cabe no 24 x 24 do ícone: 240 x 127 vezes a escala, a partir do deslocamento.
  const [, dx, dy, k] = modulo.match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/).map(Number);
  assert.ok(dx >= 0 && dy >= 0 && dx + 240 * k <= 24 && dy + 127 * k <= 24);
});

test('manifest: o DS da iMile roda os scripts da pasta imile; canal próprio', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const daImile = m.content_scripts.filter((cs) => cs.matches.includes('https://ds.imile.com/*'));
  assert.deepStrictEqual(daImile.map((cs) => cs.js), [['imile/imile.js'], ['imile/xmtt-modulo.js', 'imile/regras.js', 'imile/ativos.js']]);
  assert.strictEqual(daImile[0].world, 'MAIN');
  assert.strictEqual(I.CANAL, 'xmAtivosImile');
  assert.ok(fs.readFileSync(path.join(EXT, 'imile/ativos.js'), 'utf8').includes("const CANAL = 'xmAtivosImile'"));
  assert.ok(!/Front-Sec['"]?\s*[:=]/i.test(fs.readFileSync(path.join(EXT, 'imile/imile.js'), 'utf8')), 'nunca copiar a assinatura Front-Sec');
});
