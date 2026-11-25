// XM - Agrupamento Loggi, sem rede e sem Chrome. Dados de TESTE, inventados.
//   node --test testes/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/regras.js');
const L = require('../extensao/loggi.js');
const { limitar } = require('../extensao/menu.js');

const EXT = path.join(__dirname, '../extensao');

// Como a Loggi manda (aggregated city_enum e circle/list), já lido pelo loggi.js.
const CIDADES = [
  { codigo: 'CITY_SC_CIDADE_A', nome: 'Cidade A', pacotes: 900 },
  { codigo: 'CITY_SC_CIDADE_B', nome: 'Cidade B', pacotes: 300 },
  { codigo: 'CITY_SC_HERVAL_DOESTE', nome: 'Herval Doeste', pacotes: 50 },
  { codigo: 'CITY_SC_LONGE', nome: 'Longe', pacotes: 3 },
];
const CIRCULOS = [
  { id: 'c1', nome: 'CIRCULO TESTE', cidades: ['CITY_SC_CIDADE_B', 'CITY_SC_HERVAL_DOESTE'] },
];

test('chave iguala o código da Loggi, o nome do bipe e variações', () => {
  for (const v of ['CITY_SC_HERVAL_DOESTE', "Herval d'Oeste", 'HERVAL D OESTE - SC', 'Herval d’Oeste (SC)']) assert.strictEqual(R.chave(v), 'hervaldoeste', v);
  assert.strictEqual(R.chave('Caçador'), R.chave('CITY_SC_CACADOR'));
  assert.strictEqual(R.chave('São José do Cerrito'), R.chave('CITY_SC_SAO_JOSE_DO_CERRITO'));
  assert.strictEqual(R.nomeDoCodigo('CITY_SC_LINDOIA_DO_SUL'), 'Lindoia Do Sul');
});

test('acentuação quebrada (UTF-8 lido como Latin-1/Windows-1252) volta ao certo', () => {
  // monta o erro do jeito que ele acontece: bytes UTF-8 lidos como Latin-1, uma e duas vezes
  const quebrar = (t) => Buffer.from(t, 'utf8').toString('latin1');
  for (const certo of ['Caçador', 'Joaçaba', 'São José do Cerrito', 'Lindóia do Sul', 'Tangará', 'Iomerê', 'Ibiá']) {
    assert.strictEqual(R.consertarTexto(quebrar(certo)), certo, certo);
    assert.strictEqual(R.consertarTexto(quebrar(quebrar(certo))), certo, `${certo} (duas vezes)`);
    assert.strictEqual(R.chave(quebrar(certo)), R.chave(certo), certo);
  }
  // maiúsculas passam por Windows-1252 (Ç = Ã‡, Ã = Ãƒ)
  assert.strictEqual(R.consertarTexto('JOAÃ‡ABA'), 'JOAÇABA');
  assert.strictEqual(R.consertarTexto('SÃƒO JOSÃ‰'), 'SÃO JOSÉ');
  assert.strictEqual(R.chave('CAÃ‡ADOR - SC'), R.chave('CITY_SC_CACADOR'));
  // texto certo não mexe
  for (const t of ['São', 'SÃO PAULO', 'Caçador', 'Cidade A', '']) assert.strictEqual(R.consertarTexto(t), t);
});

test('letra perdida (? ou �), letra repetida e sinal solto ainda acham a cidade', () => {
  const alvo = R.montarAlvo({ escolha: { tipo: 'cidades', chaves: ['cacador', 'tangara'] } }, [{ codigo: 'CITY_SC_CACADOR', nome: 'Cacador' }, { codigo: 'CITY_SC_TANGARA', nome: 'Tangara' }], []);
  assert.deepStrictEqual(R.conferirBipe('Ca?ador', alvo), { ok: true });
  assert.deepStrictEqual(R.conferirBipe('Ca��ador', alvo), { ok: true });
  assert.deepStrictEqual(R.conferirBipe('Tangaraa', alvo), { ok: true });
  assert.deepStrictEqual(R.conferirBipe('Tanga~ra', alvo), { ok: true });
  assert.deepStrictEqual(R.conferirBipe('Tangará^', alvo), { ok: true });
  assert.deepStrictEqual(R.conferirBipe('Ou?ra Cidade', alvo), { ok: false }); // curinga não inventa cidade
  assert.deepStrictEqual(R.conferirBipe('??', alvo), { ok: false });
  // nome da Loggi quebrado aparece consertado na lista
  const lista = R.listaDaBase([{ codigo: 'CITY_SC_JOACABA', nome: Buffer.from('Joaçaba', 'utf8').toString('latin1') }], R.cfgVazia());
  assert.strictEqual(lista[0].nome, 'Joaçaba');
});

test('começa sem nada escolhido (não confere); marcar cidades, Limpar e migração da 1.1', () => {
  let cfg = R.cfgVazia();
  let alvo = R.montarAlvo(cfg, CIDADES, CIRCULOS);
  assert.strictEqual(alvo.tipo, 'nada');
  assert.deepStrictEqual(R.conferirBipe('Cidade A', alvo), { ok: null });
  // a lista da base continua toda lá, para marcar
  assert.deepStrictEqual(R.listaDaBase(CIDADES, cfg).map((c) => c.nome), ['Cidade A', 'Cidade B', 'Herval Doeste', 'Longe']);

  cfg = R.alternarCidade(cfg, R.chave('Cidade A'));
  cfg = R.alternarCidade(cfg, R.chave('Herval Doeste'));
  alvo = R.montarAlvo(cfg, CIDADES, CIRCULOS);
  assert.strictEqual(alvo.tipo, 'cidades');
  assert.strictEqual(alvo.rotulo, 'Cidade A e Herval Doeste');
  assert.deepStrictEqual(R.conferirBipe("HERVAL D'OESTE", alvo), { ok: true });
  assert.deepStrictEqual(R.conferirBipe('Cidade B', alvo), { ok: false });
  assert.strictEqual(alvo.fora, 'fora das cidades marcadas');
  // desmarcar todas = nada escolhido
  assert.strictEqual(R.montarAlvo(R.alternarCidade(R.alternarCidade(cfg, 'cidadea'), 'hervaldoeste'), CIDADES, CIRCULOS).tipo, 'nada');
  // uma só: "não é de X"; muitas: "A, B e mais N"
  assert.strictEqual(R.montarAlvo(R.alternarCidade(R.cfgVazia(), 'longe'), CIDADES, CIRCULOS).fora, 'não é de Longe');
  const todas = CIDADES.reduce((c, x) => R.alternarCidade(c, R.chave(x.codigo)), R.cfgVazia());
  assert.strictEqual(R.montarAlvo(todas, CIDADES, CIRCULOS).rotulo, 'Cidade A, Cidade B e mais 2');
  // Limpar
  assert.strictEqual(R.montarAlvo(R.limpar(cfg), CIDADES, CIRCULOS).tipo, 'nada');
  // configuração da 1.1 ("Base toda" com desligadas) vira nada escolhido
  assert.deepStrictEqual(R.normalizarCfg({ escolha: { tipo: 'base' }, desligadas: ['longe'], adicionadas: ['X'] }), { adicionadas: ['X'], extrasCirculo: {}, escolha: null });
});

test('contagem só do que está na lista agora: tirou o pacote de fora, sai da conta', () => {
  const alvo = R.montarAlvo({ escolha: { tipo: 'circulo', id: 'c1' } }, CIDADES, CIRCULOS);
  const bipes = new Map([['TESTE001', 'Cidade B'], ['TESTE002', 'Cidade A'], ['TESTE003', 'Herval Doeste']]);
  assert.deepStrictEqual(R.contarNaLista(bipes, 'TESTE001 TESTE002 TESTE003', alvo), { certos: 2, deFora: 1 });
  assert.deepStrictEqual(R.contarNaLista(bipes, 'teste001 teste003', alvo), { certos: 2, deFora: 0 }); // TESTE002 foi para a lixeira
  assert.deepStrictEqual(R.contarNaLista(bipes, 'Sua lista ainda está vazia', alvo), { certos: 0, deFora: 0 }); // grupo criado
  assert.deepStrictEqual(R.contarNaLista(bipes, 'TESTE002', R.montarAlvo(R.cfgVazia(), CIDADES, CIRCULOS)), { certos: 0, deFora: 0 }); // nada escolhido
});

test('cidades e círculos em ordem alfabética, sem olhar acento nem maiúscula', () => {
  const cidades = [{ codigo: 'CITY_SC_VIDEIRA', nome: 'Videira' }, { codigo: 'CITY_SC_CACADOR', nome: 'Cacador' }, { codigo: 'CITY_SC_AGUA_DOCE', nome: 'Agua Doce' }, { codigo: 'CITY_SC_ZORTEA', nome: 'Zortea' }];
  const cfg = { adicionadas: ['Água Branca', 'beta'] };
  assert.deepStrictEqual(R.listaDaBase(cidades, cfg).map((c) => c.nome), ['Agua Doce', 'Água Branca', 'Beta', 'Cacador', 'Videira', 'Zortea'].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })));
  assert.deepStrictEqual(R.listaDaBase(cidades, {}).map((c) => c.nome), ['Agua Doce', 'Cacador', 'Videira', 'Zortea']);
  assert.deepStrictEqual(R.listaDoCirculo({ id: 'x', cidades: ['CITY_SC_ZORTEA', 'CITY_SC_CACADOR'] }, cidades, {}).map((c) => c.nome), ['Cacador', 'Zortea']);
  assert.deepStrictEqual(R.ordenarCirculos([{ nome: 'LUANA - VIDEIRA' }, { nome: 'Base Joaçaba' }, { nome: 'DIDIO - CONCORDIA' }]).map((c) => c.nome), ['Base Joaçaba', 'DIDIO - CONCORDIA', 'LUANA - VIDEIRA']);
});

test('adicionar cidade: sem círculo entra na lista e já marcada; repetida avisa; tirar desmarca', () => {
  let r = R.adicionarCidade(R.cfgVazia(), '  Micro   Cidade ', CIDADES, CIRCULOS);
  assert.ok(!r.erro);
  let alvo = R.montarAlvo(r.cfg, CIDADES, CIRCULOS);
  assert.deepStrictEqual(alvo.cidades.map((c) => [c.nome, c.origem]), [['Micro Cidade', 'adicionada']]);
  assert.deepStrictEqual(R.conferirBipe('MICRO CIDADE', alvo), { ok: true });
  // cidade que já é da Loggi: só marca, não duplica na lista
  r = R.adicionarCidade(r.cfg, 'cidade b', CIDADES, CIRCULOS);
  assert.deepStrictEqual(r.cfg.adicionadas, ['Micro Cidade']);
  assert.deepStrictEqual(R.montarAlvo(r.cfg, CIDADES, CIRCULOS).chaves, ['cidadeb', 'microcidade']);
  assert.match(R.adicionarCidade(r.cfg, 'Cidade B', CIDADES, CIRCULOS).erro, /já está marcada/);
  assert.match(R.adicionarCidade(r.cfg, '   ', CIDADES, CIRCULOS).erro, /Escreva/);
  const sem = R.tirarAdicionada(r.cfg, R.chave('Micro Cidade'), CIDADES, CIRCULOS);
  assert.deepStrictEqual(sem.adicionadas, []);
  assert.deepStrictEqual(R.montarAlvo(sem, CIDADES, CIRCULOS).chaves, ['cidadeb']);
});

test('círculo: só as cidades dele (nome da Loggi); clicar de novo desmarca; adicionar vale só nele', () => {
  let cfg = R.escolherCirculo(R.cfgVazia(), 'c1');
  let alvo = R.montarAlvo(cfg, CIDADES, CIRCULOS);
  assert.strictEqual(alvo.tipo, 'circulo');
  assert.deepStrictEqual(alvo.cidades.map((c) => c.nome), ['Cidade B', 'Herval Doeste']);
  assert.deepStrictEqual(R.conferirBipe('Cidade A', alvo), { ok: false });
  assert.strictEqual(alvo.fora, 'fora do círculo CIRCULO TESTE');
  assert.strictEqual(R.montarAlvo(R.escolherCirculo(cfg, 'c1'), CIDADES, CIRCULOS).tipo, 'nada');
  cfg = R.adicionarCidade(cfg, 'Distrito Teste', CIDADES, CIRCULOS).cfg;
  assert.deepStrictEqual(R.conferirBipe('Distrito Teste', R.montarAlvo(cfg, CIDADES, CIRCULOS)), { ok: true });
  assert.deepStrictEqual(cfg.adicionadas, []); // não foi para a lista da base
  assert.match(R.adicionarCidade(cfg, 'Cidade B', CIDADES, CIRCULOS).erro, /já está no círculo/);
  // marcar uma cidade troca o círculo pelas cidades
  assert.strictEqual(R.montarAlvo(R.alternarCidade(cfg, 'cidadea'), CIDADES, CIRCULOS).tipo, 'cidades');
  // círculo que sumiu da Loggi: nada escolhido
  assert.strictEqual(R.montarAlvo({ escolha: { tipo: 'circulo', id: 'sumiu' } }, CIDADES, CIRCULOS).tipo, 'nada');
});

test('pendentes do Continuar só os de fora ainda na tela; sugestões; busca; botão Agrupar', () => {
  const alvo = R.montarAlvo({ escolha: { tipo: 'circulo', id: 'c1' } }, CIDADES, CIRCULOS);
  const bipes = new Map([['TESTE001', 'Cidade B'], ['TESTE002', 'Cidade A'], ['TESTE003', 'Longe'], ['TESTE004', 'Cidade A']]);
  const tela = 'Pacotes do grupo TESTE001 TESTE002 TESTE003'; // TESTE004 foi tirado na lixeira
  assert.deepStrictEqual(R.pendentes(bipes, tela, alvo), [{ codigo: 'TESTE002', cidade: 'Cidade A' }, { codigo: 'TESTE003', cidade: 'Longe' }]);
  assert.deepStrictEqual(R.sugestoes(bipes, alvo), ['Cidade A', 'Longe']);
  assert.deepStrictEqual(R.filtrar(alvo.cidades, 'herval').map((c) => c.nome), ['Herval Doeste']);
  assert.deepStrictEqual(R.filtrar(CIRCULOS, 'teste').map((c) => c.id), ['c1']);
  for (const t of ['Agrupar', ' agrupar ', 'Agrupar pacotes', 'AGRUPAR']) assert.ok(R.ehAgrupar(t), t);
  for (const t of ['Agrupamento', 'Desagrupar', 'Agrupar e sair', '']) assert.ok(!R.ehAgrupar(t), t);
});

test('loggi.js: lê o bipe, a base, as cidades e os círculos; monta as chamadas', () => {
  const bipe = L.extrairBipes({ TESTE001: { destination: { city: 'Cidade A' } }, TESTE002: { loggiAddress: { correiosAddress: { cidade: 'Cidade B' } } }, X: null });
  assert.deepStrictEqual(bipe, [{ codigo: 'TESTE001', cidade: 'Cidade A' }, { codigo: 'TESTE002', cidade: 'Cidade B' }]);
  assert.ok(L.ROTA_BIPE.test('https://x.loggi.com/api/v1/group_packages/retrieve_and_validate_packages_by_barcode'));

  const base = { codigo: 'TST' };
  L.lerBase('https://leve.loggi.com/api/v2/x?distribution_center_id=9&last_mile_company_id=empresa-teste&routing_code=TST', null, base);
  assert.ok(L.baseCompleta(base));
  L.lerBase('https://leve.loggi.com/api/v2/last_mile/packages/aggregated', JSON.stringify({ aggregatedField: 'city_enum', lastMileCompanyType: 'OUTRO' }), base);
  assert.strictEqual(base.tipo, 'OUTRO');
  const corpo = L.corpoCidades(base);
  assert.deepStrictEqual([corpo.aggregatedField, corpo.distribution_center_id, corpo.last_mile_company_id, corpo.routing_code, corpo.lastMileCompanyType, corpo.view],
    ['city_enum', 9, 'empresa-teste', 'TST', 'OUTRO', 'annotation_for_base']);
  assert.strictEqual(L.urlCirculos(base), 'https://leve.loggi.com/api/v1/empresa-teste:9/circle/list?distribution_center_id=9&last_mile_company_id=empresa-teste&routing_code=TST');

  assert.deepStrictEqual(L.lerCidades({ data: [{ label: 'Cidade A', id: 'CITY_SC_CIDADE_A', value: 10 }, { label: 'sem id' }] }),
    [{ codigo: 'CITY_SC_CIDADE_A', nome: 'Cidade A', pacotes: 10 }]);
  // do círculo só vão nome e cidades (entregadores e operadores ficam na página)
  assert.deepStrictEqual(L.lerCirculos({ circles: [{ id: '1', name: 'C', cities: ['CITY_SC_A'], drivers: [1, 2], operators: ['x'] }] }),
    [{ id: '1', nome: 'C', cidades: ['CITY_SC_A'] }]);
});

test('manifesto: só a Loggi; nada de servidor nem dado real', () => {
  const m = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  assert.strictEqual(m.name, 'XM - Agrupamento Loggi');
  assert.deepStrictEqual(m.host_permissions, ['https://*.loggi.com/*']);
  assert.ok(m.content_scripts[0].world === 'MAIN' && m.content_scripts[0].js[0] === 'loggi.js');
  for (const f of ['loggi.js', 'regras.js', 'menu.js']) {
    const fonte = fs.readFileSync(path.join(EXT, f), 'utf8');
    assert.ok(!/onrender\.com|xmtt/i.test(fonte), `${f}: não depende do sistema XMTT`);
    assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(fonte), `${f}: sem CPF`);
  }
  assert.strictEqual(limitar(-5, 100), 8);
});
