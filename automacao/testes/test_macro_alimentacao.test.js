// Testes da parte do macro de alimentacao que da pra errar em silencio.
//
//   node --test automacao/testes/test_macro_alimentacao.test.js
//
// Nao ha DOM aqui de proposito: o que precisa de teste nao e clicar num botao
// (isso falha na cara), e sim escolher o dia certo na grade e o relatorio certo
// no painel - erros que geram um arquivo que abre normalmente, com os numeros
// errados dentro.

const { test } = require('node:test');
const assert = require('node:assert');

const L = require('../extensao-macros-spx/logica.js');

const HOJE = L.partesDaData(new Date(2026, 8, 15));   // 15/09/2026, uma terca

test('partesDaData preenche com zero a esquerda', () => {
  const p = L.partesDaData(new Date(2026, 0, 5));
  assert.strictEqual(p.ano, '2026');
  assert.strictEqual(p.mes, '01');
  assert.strictEqual(p.dia, '05');
  assert.strictEqual(p.mesNumero, 1);
});

test('chave ignora acento, caixa e espaco repetido', () => {
  assert.strictEqual(L.chave('  Horário   de  CRIAÇÃO '), 'horario de criacao');
  assert.strictEqual(L.chave('Última tarefa'), L.chave('ultima  TAREFA'));
});

test('dataConfere aceita qualquer formato que traga os tres numeros', () => {
  for (const valor of ['2026-09-15', '15/09/2026', '2026/09/15', '15/09/2026 00:00:00']) {
    assert.ok(L.dataConfere(valor, HOJE), valor);
  }
});

test('dataConfere recusa data errada, vazia ou de outro dia', () => {
  assert.ok(!L.dataConfere('2026-09-14', HOJE));
  assert.ok(!L.dataConfere('2026-10-15', HOJE));
  assert.ok(!L.dataConfere('', HOJE));
  assert.ok(!L.dataConfere(null, HOJE));
});

test('indiceNaGrade acha o 15/09/2026 na terceira linha do calendario', () => {
  // A grade de setembro/2026 comeca no domingo 30/08:
  //   linha 1: 30 31 01 02 03 04 05
  //   linha 2: 06 .. 12
  //   linha 3: 13 14 15  <- indice 16
  assert.strictEqual(L.indiceNaGrade(2026, 9, 15, 0), 16);
});

test('indiceNaGrade acompanha a grade que comeca na segunda', () => {
  assert.strictEqual(L.indiceNaGrade(2026, 9, 15, 1), 15);
});

test('indiceNaGrade poe o dia 1 depois das celulas do mes anterior', () => {
  // 01/09/2026 e terca: duas celulas de agosto antes dele
  assert.strictEqual(L.indiceNaGrade(2026, 9, 1, 0), 2);
  // 01/02/2026 e domingo: a grade comeca exatamente nele
  assert.strictEqual(L.indiceNaGrade(2026, 2, 1, 0), 0);
});

test('mesCombina aceita o cabecalho em portugues, ingles e numero', () => {
  assert.ok(L.mesCombina('2026 Set', HOJE));
  assert.ok(L.mesCombina('Sep 2026', HOJE));
  assert.ok(L.mesCombina('2026-09', HOJE));
});

test('mesCombina recusa o painel do mes vizinho', () => {
  assert.ok(!L.mesCombina('2026 Out', HOJE));
  assert.ok(!L.mesCombina('2025 Set', HOJE));
});

test('mesCombina so vale pro cabecalho: com a grade junto ele erra', () => {
  // Este teste existe pra travar o motivo do cabecalho ser lido separado da
  // tabela em alimentacao.js: a grade de outubro tambem tem um "09" escrito
  // (o dia 9), e ai qualquer teste de mes acerta o painel errado.
  assert.ok(L.mesCombina('2026 Out 27 28 29 30 01 ... 09 10', HOJE));
});

test('momentoDaTarefa le o carimbo do painel e ordena', () => {
  const cedo = L.momentoDaTarefa('2026-09-15 10:41:43');
  const tarde = L.momentoDaTarefa('2026-09-15 12:07:50');
  assert.ok(tarde > cedo);
  assert.strictEqual(L.momentoDaTarefa('gerando…'), null);
});

const ANTES = [
  { nome: 'Br AT Romaneio V2', quando: '2026-09-15 11:56:01' },
  { nome: 'Br Assignment Task', quando: '2026-09-15 11:54:42' },
  { nome: 'Br Assignment Task', quando: '2026-09-15 10:41:43' },
];

test('escolherTarefaNova pega o relatorio que nasceu depois do clique', () => {
  const agora = [{ nome: 'Br Assignment Task', quando: '2026-09-15 12:07:50' }, ...ANTES];
  const alvo = L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO);
  assert.strictEqual(alvo.quando, '2026-09-15 12:07:50');
});

test('escolherTarefaNova nao devolve o relatorio da rodada anterior', () => {
  assert.strictEqual(L.escolherTarefaNova(ANTES, ANTES, L.NOME_RELATORIO), null);
});

test('escolherTarefaNova ignora o Romaneio, que nasce do outro botao', () => {
  const agora = [{ nome: 'Br AT Romaneio V2', quando: '2026-09-15 12:07:50' }, ...ANTES];
  assert.strictEqual(L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO), null);
});

test('escolherTarefaNova fica com a mais recente quando nascem duas', () => {
  const agora = [
    { nome: 'Br Assignment Task', quando: '2026-09-15 12:07:50' },
    { nome: 'Br Assignment Task', quando: '2026-09-15 12:09:11' },
    ...ANTES,
  ];
  const alvo = L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO);
  assert.strictEqual(alvo.quando, '2026-09-15 12:09:11');
});

test('escolherTarefaNova aguenta espaco sobrando no nome lido da tela', () => {
  const agora = [{ nome: '  Br Assignment Task ', quando: '2026-09-15 12:07:50' }, ...ANTES];
  const alvo = L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO);
  assert.ok(alvo);
  assert.strictEqual(alvo.quando, '2026-09-15 12:07:50');
});

test('EH_MOMENTO so casa com a linha inteira do carimbo', () => {
  assert.ok(L.EH_MOMENTO.test('2026-09-15 12:07:50'));
  assert.ok(!L.EH_MOMENTO.test('Br Assignment Task 2026-09-15 12:07:50'));
});
