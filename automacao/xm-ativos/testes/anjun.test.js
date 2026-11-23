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

test('montarEnvio: confirmacao_anjun com {{1}} nome, {{2}} quem dispara, {{3}} remetente (a loja), {{4}} pedido', () => {
  const { corpo } = R.montarEnvio({ codigo: 'AJ0000000000001', nome: 'Pessoa Teste', telefone: '49999990000', remetente: 'Loja Teste', atendente: 'Atendente Teste' });
  assert.deepStrictEqual(corpo.parametros, ['Pessoa Teste', 'Atendente Teste', 'Loja Teste', 'AJ0000000000001']);
  assert.strictEqual(corpo.template, 'confirmacao_anjun');
  assert.strictEqual(corpo.transportadora, 'anjun');
  assert.strictEqual(corpo.destino, 'outros');
  assert.strictEqual(corpo.prazo_horas, null);
  assert.strictEqual(corpo.numero, '5549999990000');
  assert.strictEqual(corpo.pedido, 'AJ0000000000001');
  // O texto aprovado na Meta (o que o usuário passou), com Remetente antes do Pedido.
  assert.strictEqual(corpo.texto, `Olá, Pessoa Teste! Tudo bem?
Me chamo Atendente Teste e faço parte do time de SAC da Anjun Express.
Gostaria de confirmar se você recebeu seu pedido:
Remetente: Loja Teste
Pedido: AJ0000000000001

Você recebeu o pedido?
Por favor, responda com SIM ou NÃO.`);
  // Remetente vazio não pode ir vazio para a Meta.
  assert.strictEqual(R.montarEnvio({ codigo: 'AJ1', nome: 'A', telefone: '49999990000', remetente: '', atendente: 'B' }).corpo.parametros[2], 'não informado');
  assert.strictEqual(R.montarEnvio({ codigo: 'AJ1', nome: '', telefone: '49999990000', atendente: 'B' }).erro, 'Sem nome na Anjun.');
  assert.strictEqual(R.montarEnvio({ codigo: 'AJ1', nome: 'A', telefone: '', atendente: 'B' }).erro, 'Sem telefone na Anjun.');
  assert.match(R.montarEnvio({ codigo: 'AJ1', nome: 'A', telefone: '49999990000', atendente: '' }).erro, /quem dispara/);
});

test('lojaUnica: o nome único da loja (do Nome do comerciante), nunca o código do Nome do cliente', () => {
  // razão social com a marca entre parênteses vira só a marca (o "szanjun" do cliente não importa)
  assert.strictEqual(R.lojaUnica('EXEMPLO SHINE PTE.LTD.(SHEIN)-INTERNACIONAL', 'szanjun'), 'Shein');
  // loja comum fica como está; o cliente (temud2d, tiktok logistics...) é ignorado
  assert.strictEqual(R.lojaUnica('Loja Exemplo Fashion', 'temud2d'), 'Loja Exemplo Fashion');
  assert.strictEqual(R.lojaUnica('MODA TESTE', 'tiktok logistics brazil ltda'), 'MODA TESTE');
  assert.strictEqual(R.lojaUnica('Casa Home', 'sheind2d'), 'Casa Home'); // "Home" não perde o "me"
  assert.strictEqual(R.lojaUnica('XY 001', 'temud2d'), 'XY 001');
  // sufixos de razão social no fim saem
  assert.strictEqual(R.lojaUnica('MODA EXEMPLO COMERCIO LTDA', ''), 'MODA EXEMPLO COMERCIO');
  assert.strictEqual(R.lojaUnica('Exemplo Trading Co., Ltd.', ''), 'Exemplo Trading');
  assert.strictEqual(R.lojaUnica('LOJA EXEMPLO (FILIAL 2)', ''), 'LOJA EXEMPLO');
  assert.strictEqual(R.lojaUnica('EXEMPLO HOLDINGS LIMITED (LOJA BOA)', ''), 'LOJA BOA');
  // só a marca escrita do jeito conhecido
  assert.strictEqual(R.lojaUnica('SHEIN', ''), 'Shein');
  // sem comerciante: a marca do cliente (szanjun e sheind2d = Shein, temud2d = Temu, tiktok logistics = TikTok); senão vazio (a mensagem leva "não informado")
  assert.strictEqual(R.lojaUnica('', 'temud2d'), 'Temu');
  assert.strictEqual(R.lojaUnica('', 'sheind2d'), 'Shein');
  assert.strictEqual(R.lojaUnica('', 'szanjun'), 'Shein');
  assert.strictEqual(R.lojaUnica('  ', ''), '');
  // nome em chinês ou com cara de código: vale a marca do cliente (ou nada)
  assert.strictEqual(R.lojaUnica('厦门测试电子商务有限公司', 'szanjun'), 'Shein');
  assert.strictEqual(R.lojaUnica('厦门测试电子商务有限公司', 'sheind2d'), 'Shein');
  assert.strictEqual(R.lojaUnica("J123456'shop", 'temud2d'), 'Temu');
  assert.strictEqual(R.lojaUnica('X9 001', 'temuxborder'), 'X9 001');
  assert.strictEqual(R.lojaUnica('', 'temuxborder'), 'Temu');
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
    if (rota === '/admin/package/packageInfoLimit') return { receiveName: '{$n$}', receiveMobile: 'm', receivePhone: '', receiveAddress: '{$a$}', customerName: 'temud2d', merchantName: 'Loja Teste' };
    return { field0: 'Pessoa Teste', field1: '49999990000' };
  };
  const r = await A.revelar(post, 'AJ0000000000001');
  assert.deepStrictEqual(r, { nome: 'Pessoa Teste', telefone: '49999990000', cliente: 'temud2d', comerciante: 'Loja Teste' });
  assert.deepStrictEqual(chamadas[0], ['/admin/package/packageInfoLimit', { waybillNumber: 'AJ0000000000001' }]);
  assert.deepStrictEqual(chamadas[1], ['/user/sensitive/viewPlaintext', { data: { field0: '{$n$}', field1: '{$m$}' } }]);
  assert.deepStrictEqual(await A.revelar(async () => null, 'AJ1'), { nome: '', telefone: '', cliente: '', comerciante: '', semPacote: true });
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

test('clientes da Anjun que viram marca: szanjun = Shein, temud2d = Temu, tiktok logistics = TikTok', () => {
  assert.strictEqual(R.lojaUnica('', 'szanjun'), 'Shein');
  assert.strictEqual(R.lojaUnica('', 'temud2d'), 'Temu');
  assert.strictEqual(R.lojaUnica('', 'tiktok logistics brazil ltda'), 'TikTok');
  assert.strictEqual(R.lojaUnica('', 'loja desconhecida xyz'), '');
});
