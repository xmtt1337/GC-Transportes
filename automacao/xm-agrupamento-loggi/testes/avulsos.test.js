// Pacotes sem grupo pela própria Loggi (Distribuir > Grupos: Estação Recebimento + Sem tentativa).
// Respostas no formato da Loggi, com dados de TESTE, inventados.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../extensao/regras.js');
const L = require('../extensao/loggi.js');

const BASE = { codigo: 'TST', centro: '9', empresa: 'empresa-teste' };
const AGORA = Date.UTC(2026, 10, 25, 15, 0);

test('chamadas iguais às da tela Distribuir > Grupos: estação Recebimento (COL), qualquer status', () => {
  assert.strictEqual(L.urlGrupos(BASE), 'https://leve.loggi.com/api/v1/last_mile/empresa-teste:9/unit_load');
  assert.strictEqual(L.URL_PACOTES, 'https://leve.loggi.com/api/v2/last_mile/packages/filter_search');
  const g = L.corpoGrupos(BASE, 'TIPO');
  assert.deepStrictEqual([g.stationFilter, g.aggregatedField, g.view, g.distribution_center_id, g.last_mile_company_id, g.routing_code, g.lastMileCompanyType],
    [['COL'], 'unit_load', 'base', 9, 'empresa-teste', 'TST', 'TIPO']);
  // o que chegou hoje está "Transferência finalizada", não "Sem tentativa": sem filtro de status
  assert.strictEqual(g.statusFilters, undefined);
  const a = L.corpoAvulsos(BASE, 'TIPO', 'PLACA-TESTE', 3);
  assert.deepStrictEqual([a.unitLoadFilter, a.unitLoadLicensePlateFilter, a.page, a.itemsPerPage, a.stationFilter, a.statusFilters],
    ['LICENSE_PLATE', 'PLACA-TESTE', 3, 100, ['COL'], undefined]);
});

test('lê os grupos e os pacotes sem nome, endereço nem placa de pessoa', () => {
  assert.deepStrictEqual(L.lerGrupos({ data: [{ licensePlate: 'PLACA-TESTE', station: 'Recebimento', quantityPackages: 2 }], totalPackages: 2 }), { placas: ['PLACA-TESTE'], total: 2 });
  const r = L.lerAvulsos({ hits: { total: { value: 2 }, hits: [
    { _source: { package: { id: '1', tracking_key: 'RASTRO1' }, package_integration_info: { barcode: 'BARRA1' }, destination: { city: 'Cidade A', address_st: 'Rua Teste' }, recipient: { name: 'Pessoa Teste' }, status: { code: 89 } } },
    { _source: { package: { id: '2', tracking_key: 'RASTRO2' }, destination: { city: 'Cidade B' }, status: { code: 89 } } },
  ] } });
  assert.deepStrictEqual(r, { total: 2, pacotes: [
    { codigo: 'BARRA1', rastreio: 'RASTRO1', id: '1', cidade: 'Cidade A', status: 89 },
    { codigo: 'RASTRO2', rastreio: 'RASTRO2', id: '2', cidade: 'Cidade B', status: 89 },
  ] });
  assert.ok(!JSON.stringify(r).includes('Pessoa Teste') && !JSON.stringify(r).includes('Rua Teste'));
  assert.deepStrictEqual(L.lerAvulsos({}), { pacotes: [], total: 0 });
});

test('não agrupados = chegaram hoje, das cidades, e estão nos avulsos da Loggi (qualquer computador)', () => {
  const alvo = R.montarAlvo({ escolha: { tipo: 'cidades', chaves: ['cidadea'] } }, [{ codigo: 'CITY_SC_CIDADE_A', nome: 'Cidade A' }], []);
  const hoje = '2026-11-25T12:00:00Z';
  const linhas = [
    { codigo: 'BARRA1', id: '', cidade: 'Cidade A', chegou: hoje }, // avulso
    { codigo: 'BARRA2', id: '', cidade: 'Cidade A', chegou: hoje }, // já está num grupo (feito em outro computador)
    { codigo: '', id: '3', cidade: 'Cidade A', chegou: hoje }, // avulso, casa pelo ID
    { codigo: 'BARRA4', id: '', cidade: 'Cidade A', chegou: hoje }, // avulso, mas está na lista agora
  ];
  const avulsos = R.codigosAvulsos([{ codigo: 'BARRA1', rastreio: 'R1', id: '1' }, { codigo: 'X', rastreio: 'R3', id: '3' }, { codigo: 'BARRA4' }]);
  const r = R.faltantes(linhas, alvo, {}, ['barra4'], { soHoje: true, agora: AGORA, avulsos }).map((p) => p.codigo || p.id);
  assert.deepStrictEqual(r, ['BARRA1', '3']);
  // sem os avulsos (a Loggi não respondeu): vale o cache deste navegador
  assert.deepStrictEqual(R.faltantes(linhas, alvo, { BARRA2: '2026-11-25' }, ['barra4'], { soHoje: true, agora: AGORA }).map((p) => p.codigo || p.id), ['BARRA1', '3']);
});

test('nome padrão das cidades: a grafia mais completa que apareceu, com caixa de nome próprio', () => {
  assert.strictEqual(R.formatarNome('SAO CRISTOVAO DO SUL'), 'Sao Cristovao do Sul');
  assert.strictEqual(R.formatarNome("herval d'oeste"), "Herval d'Oeste");
  assert.strictEqual(R.formatarNome('Ponte Alta Do Norte'), 'Ponte Alta do Norte');
  R.aprenderNomes(['CIDADE TESTE ACENTO', 'Cidade Teste Acentó', 'cidade teste acento']);
  for (const v of ['CIDADE TESTE ACENTO', 'Cidade Teste Acento', 'CITY_SC_CIDADE_TESTE_ACENTO']) assert.strictEqual(R.bonito(v), 'Cidade Teste Acentó', v);
  assert.strictEqual(R.bonito(Buffer.from('Cidade Teste Acentó', 'utf8').toString('latin1')), 'Cidade Teste Acentó'); // quebrada também
  assert.strictEqual(R.bonito('OUTRA CIDADE'), 'Outra Cidade'); // sem grafia melhor: só a caixa
  assert.strictEqual(R.bonito(''), '');
});
