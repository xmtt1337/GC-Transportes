// node --test testes/*.test.js  (dados inventados)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/anjun/regras.js');
const A = require('../extensao/anjun/anjun.js');

const EXT = path.join(__dirname, '../extensao');

test('lerCodigos: waybills AJ (maiúsculos, sem repetir); o resto vai para ignorados', () => {
  assert.deepStrictEqual(R.lerCodigos('AJ0000000000001\naj0000000000002, AJ0000000000001;BR123 AJ12'),
    { codigos: ['AJ0000000000001', 'AJ0000000000002'], ignorados: ['BR123', 'AJ12'] });
  assert.deepStrictEqual(R.lerCodigos(''), { codigos: [], ignorados: [] });
});

test('montarEnvio: reclamacao_anjun com {{1}} nome, {{2}} pedido, {{3}} plataforma (o Cliente da Anjun)', () => {
  const { corpo } = R.montarEnvio({ codigo: 'AJ0000000000001', nome: 'Pessoa Teste', telefone: '49999990000', plataforma: 'Plataforma Teste' });
  assert.deepStrictEqual(corpo.parametros, ['Pessoa Teste', 'AJ0000000000001', 'Plataforma Teste']);
  assert.strictEqual(corpo.template, 'reclamacao_anjun');
  assert.strictEqual(corpo.transportadora, 'anjun');
  assert.strictEqual(corpo.destino, 'outros');
  assert.strictEqual(corpo.prazo_horas, null);
  assert.strictEqual(corpo.numero, '5549999990000');
  assert.strictEqual(corpo.pedido, 'AJ0000000000001');
  // Plataforma vazia não pode ir vazia para a Meta.
  assert.strictEqual(R.montarEnvio({ codigo: 'AJ1', nome: 'A', telefone: '49999990000', plataforma: '' }).corpo.parametros[2], 'não informada');
  assert.strictEqual(R.montarEnvio({ codigo: 'AJ1', nome: '', telefone: '49999990000' }).erro, 'Sem nome na Anjun.');
  assert.strictEqual(R.montarEnvio({ codigo: 'AJ1', nome: 'A', telefone: '' }).erro, 'Sem telefone na Anjun.');
});

test('texto da mensagem é o mesmo do sistema (meusite/js/whatsapp-teste.js)', () => {
  const site = path.join(__dirname, '../../../meusite/js/whatsapp-teste.js');
  if (!fs.existsSync(site)) return;
  const fonte = fs.readFileSync(site, 'utf8').replace(/\r\n/g, '\n');
  const trecho = fonte.slice(fonte.indexOf('template: "reclamacao_anjun"'));
  const modelo = trecho.slice(trecho.indexOf('montar: v => `') + 'montar: v => `'.length, trecho.indexOf('`,'));
  const esperado = modelo.replace('${v.nome_cliente || "___"}', 'Pessoa Teste')
    .replace('${v.numero_pedido || "___"}', 'AJ0000000000001').replace('${v.plataforma || "___"}', 'Plataforma Teste');
  assert.strictEqual(R.montarTexto({ nome: 'Pessoa Teste', pedido: 'AJ0000000000001', plataforma: 'Plataforma Teste' }), esperado);
  // e os parâmetros na mesma ordem do sistema
  assert.ok(trecho.includes('parametros: v => [v.nome_cliente, v.numero_pedido, v.plataforma]'));
});

test('buscarPedidos: a Consulta de pacotes por waybill, em partes; cliente, comerciante, status e não achados', async () => {
  const corpos = [];
  const post = async (rota, corpo) => {
    corpos.push([rota, corpo]);
    return { records: corpo.params.waybillNumberList.filter((c) => !c.endsWith('9')).map((c) => ({ waybillNumber: c, customerName: 'Plataforma Teste', merchantName: 'Loja Teste', packageStatusName: 'Em trânsito' })) };
  };
  const codigos = Array.from({ length: A.POR_BUSCA + 1 }, (_, i) => `AJ${String(i).padStart(13, '0')}`);
  const r = await A.buscarPedidos(post, codigos, () => {}, async () => {});
  assert.strictEqual(corpos.length, 2);
  assert.ok(corpos.every(([rota]) => rota === '/admin/package/pageQuery'));
  const p = corpos[0][1].params;
  assert.strictEqual(p.type, 0);
  assert.strictEqual(p.waybillNumberList.length, A.POR_BUSCA);
  assert.strictEqual(p.number, p.waybillNumberList.join('\n'));
  assert.ok(!('storageStartTime' in p), 'sem filtro de data: busca pelo número');
  assert.deepStrictEqual(r[0], { codigo: codigos[0], achado: true, cliente: 'Plataforma Teste', comerciante: 'Loja Teste', status: 'Em trânsito' });
  assert.strictEqual(r[9].achado, false);
  assert.strictEqual(r.length, codigos.length);
});

test('revelar: packageInfoLimit + viewPlaintext só com nome e telefones (nada de endereço)', async () => {
  const chamadas = [];
  const post = async (rota, corpo) => {
    chamadas.push([rota, corpo]);
    if (rota === '/admin/package/packageInfoLimit') return { receiveName: '{$n$}', receiveMobile: 'm', receivePhone: '', receiveAddress: '{$a$}', customerName: 'Plataforma Teste' };
    return { field0: 'Pessoa Teste', field1: '49999990000' };
  };
  const r = await A.revelar(post, 'AJ0000000000001');
  assert.deepStrictEqual(r, { nome: 'Pessoa Teste', telefone: '49999990000', cliente: 'Plataforma Teste' });
  assert.deepStrictEqual(chamadas[0], ['/admin/package/packageInfoLimit', { waybillNumber: 'AJ0000000000001' }]);
  assert.deepStrictEqual(chamadas[1], ['/user/sensitive/viewPlaintext', { data: { field0: '{$n$}', field1: '{$m$}' } }]);
  assert.deepStrictEqual(await A.revelar(async () => null, 'AJ1'), { nome: '', telefone: '', cliente: '', semPacote: true });
});

test('lerResposta e bloqueio: a recusa da Anjun vira erro com a mensagem; "frequente" para por 30 min', () => {
  assert.deepStrictEqual(A.lerResposta(200, '{"code":200,"data":{"x":1}}'), { x: 1 });
  assert.throws(() => A.lerResposta(200, '{"code":500,"msg":"Operações muito frequentes"}'), (e) => R.eBloqueio(e.msgAnjun));
  assert.throws(() => A.lerResposta(401, 'lixo'), /HTTP 401/);
  assert.ok(!R.eBloqueio('token inválido'));
  assert.strictEqual(R.RITMO_OLHO_MS, 3000);
  assert.strictEqual(R.BLOQUEIO_MS, 30 * 60 * 1000);
});

test('manifest e menu: o portal da Anjun roda os scripts da pasta anjun; seção própria "XM"; canal próprio', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  const daAnjun = m.content_scripts.filter((cs) => cs.matches.includes('https://newsupplier.anjunexpress.com/*'));
  assert.deepStrictEqual(daAnjun.map((cs) => cs.js), [['anjun/anjun.js'], ['anjun/regras.js', 'anjun/ativos.js']]);
  assert.strictEqual(daAnjun[0].world, 'MAIN');
  const ativos = fs.readFileSync(path.join(EXT, 'anjun/ativos.js'), 'utf8');
  assert.strictEqual(A.CANAL, 'xmAtivosAnjun');
  assert.ok(ativos.includes("const CANAL = 'xmAtivosAnjun'"));
  assert.ok(ativos.includes("titulo.textContent = 'XM'"), 'seção XM acima de Principais funções');
  // a limpeza dos ids do clone não pode apagar o id da própria seção
  assert.ok(ativos.lastIndexOf('s.id = ID_SECAO') > ativos.indexOf('limparClone(s)'));
});
