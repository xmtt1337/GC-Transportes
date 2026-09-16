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

// O relatorio da AT e o Romaneio (L.NOME_RELATORIO = 'Br AT Romaneio V2'), nao
// o "Br Assignment Task" - esse e do OUTRO botao ("Exportar AT", que nao
// usamos), e o macro tem que ignorar ele do mesmo jeito que ignora o Return
// Order do macro de pedidos pesquisados.
const ANTES = [
  { nome: 'Br Assignment Task', quando: '2026-09-15 11:56:01' },
  { nome: 'Br AT Romaneio V2', quando: '2026-09-15 11:54:42' },
  { nome: 'Br AT Romaneio V2', quando: '2026-09-15 10:41:43' },
];

test('escolherTarefaNova pega o relatorio que nasceu depois do clique', () => {
  const agora = [{ nome: 'Br AT Romaneio V2', quando: '2026-09-15 12:07:50' }, ...ANTES];
  const alvo = L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO);
  assert.strictEqual(alvo.quando, '2026-09-15 12:07:50');
});

test('escolherTarefaNova nao devolve o relatorio da rodada anterior', () => {
  assert.strictEqual(L.escolherTarefaNova(ANTES, ANTES, L.NOME_RELATORIO), null);
});

test('escolherTarefaNova ignora o Br Assignment Task, que nasce do outro botao', () => {
  const agora = [{ nome: 'Br Assignment Task', quando: '2026-09-15 12:07:50' }, ...ANTES];
  assert.strictEqual(L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO), null);
});

test('escolherTarefaNova fica com a mais recente quando nascem duas', () => {
  const agora = [
    { nome: 'Br AT Romaneio V2', quando: '2026-09-15 12:07:50' },
    { nome: 'Br AT Romaneio V2', quando: '2026-09-15 12:09:11' },
    ...ANTES,
  ];
  const alvo = L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO);
  assert.strictEqual(alvo.quando, '2026-09-15 12:09:11');
});

test('escolherTarefaNova acompanha o carimbo que muda quando fica pronto', () => {
  // Visto na tela real: a linha nasce com a hora do pedido (18:38:21) e passa
  // pra hora em que terminou (18:38:23). Por isso quem espera precisa
  // reprocurar a cada volta - guardar a linha achada na primeira e ficar
  // esperando por ela e esperar por algo que deixa de existir.
  const nascendo = [{ nome: 'Br AT Romaneio V2', quando: '2026-09-15 18:38:21' }, ...ANTES];
  const pronta = [{ nome: 'Br AT Romaneio V2', quando: '2026-09-15 18:38:23' }, ...ANTES];
  assert.strictEqual(L.escolherTarefaNova(ANTES, nascendo, L.NOME_RELATORIO).quando, '2026-09-15 18:38:21');
  assert.strictEqual(L.escolherTarefaNova(ANTES, pronta, L.NOME_RELATORIO).quando, '2026-09-15 18:38:23');
});

test('cada macro so aceita o relatorio DELE', () => {
  // Os dois macros podem estar rodando ao mesmo tempo, e o painel de tarefas e
  // o mesmo. Sem o nome, o de pedidos pesquisados pegava o "Br AT Romaneio V2"
  // que o outro tinha acabado de pedir e baixava o arquivo errado - dois
  // macros clicando no mesmo botao Baixar, dois arquivos identicos.
  const agora = [
    { nome: 'Br AT Romaneio V2', quando: '2026-09-16 10:25:46' },
    { nome: 'Return Order', quando: '2026-09-16 10:25:41' },
    ...ANTES,
  ];
  assert.strictEqual(
    L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO).nome, 'Br AT Romaneio V2');
  assert.strictEqual(
    L.escolherTarefaNova(ANTES, agora, L.NOME_PESQUISADOS).nome, 'Return Order');
});

test('o relatorio da AT exportada se chama Br AT Romaneio V2', () => {
  // Nome real: vem do botao "Exportar Romaneio", nao do "Exportar AT" (esse
  // gera "Br Assignment Task", em ingles, que nao usamos mais).
  assert.strictEqual(L.NOME_RELATORIO, 'Br AT Romaneio V2');
});

test('o relatorio de pedidos pesquisados se chama Return Order', () => {
  // Nome real, visto no painel: o export do botao "Exportar pedidos
  // pesquisados" nasce com esse nome, que nao da pra adivinhar.
  assert.strictEqual(L.NOME_PESQUISADOS, 'Return Order');
});

test('escolherTarefaNova com nome null serve qualquer tarefa nova', () => {
  // O macro de pedidos pesquisados nao sabe como o SPX batiza o relatorio
  // dele. A regra que importa continua valendo: nao estava la antes do clique.
  const agora = [{ nome: 'Um Nome Qualquer', quando: '2026-09-15 12:07:50' }, ...ANTES];
  const alvo = L.escolherTarefaNova(ANTES, agora, null);
  assert.strictEqual(alvo.nome, 'Um Nome Qualquer');
});

test('escolherTarefaNova com nome null ainda ignora o que ja estava la', () => {
  assert.strictEqual(L.escolherTarefaNova(ANTES, ANTES, null), null);
});

test('escolherTarefaNova aguenta espaco sobrando no nome lido da tela', () => {
  const agora = [{ nome: '  Br AT Romaneio V2 ', quando: '2026-09-15 12:07:50' }, ...ANTES];
  const alvo = L.escolherTarefaNova(ANTES, agora, L.NOME_RELATORIO);
  assert.ok(alvo);
  assert.strictEqual(alvo.quando, '2026-09-15 12:07:50');
});

test('lerHorarios entende o que a pessoa escreveu do jeito dela', () => {
  assert.deepStrictEqual(L.lerHorarios('8, 12, 16'), [8, 12, 16]);
  assert.deepStrictEqual(L.lerHorarios('8 12 16'), [8, 12, 16]);
  assert.deepStrictEqual(L.lerHorarios('8h, 12h e 16h'), [8, 12, 16]);
  assert.deepStrictEqual(L.lerHorarios('16, 8, 12'), [8, 12, 16], 'ordena');
  assert.deepStrictEqual(L.lerHorarios('8, 8, 12'), [8, 12], 'sem repetir');
});

test('lerHorarios joga fora hora que nao existe', () => {
  assert.deepStrictEqual(L.lerHorarios('25, 40, 12'), [12]);
  assert.deepStrictEqual(L.lerHorarios(''), []);
  assert.deepStrictEqual(L.lerHorarios('toda hora'), []);
});

test('minutosAteProximaHora pega a proxima do dia', () => {
  const noveEMeia = 9 * 60 + 30;
  // 9:30 -> proxima e 12:00, daqui a 2h30
  assert.strictEqual(L.minutosAteProximaHora([8, 12, 16], noveEMeia), 150);
});

test('minutosAteProximaHora vira o dia quando todas ja passaram', () => {
  const dezoitoHoras = 18 * 60;
  // 18:00 -> a proxima e as 8 de amanha, daqui a 14h
  assert.strictEqual(L.minutosAteProximaHora([8, 12, 16], dezoitoHoras), 14 * 60);
});

test('minutosAteProximaHora nao remarca pra agora mesmo', () => {
  // Disparou as 8:00 em ponto: sem folga, o proximo alarme seria daqui a zero
  // minuto e a alimentacao rodaria duas vezes seguidas.
  assert.strictEqual(L.minutosAteProximaHora([8, 12, 16], 8 * 60), 4 * 60);
});

test('minutosAteProximaHora sem horario nenhum nao agenda nada', () => {
  assert.strictEqual(L.minutosAteProximaHora([], 600), null);
});

test('EH_MOMENTO so casa com a linha inteira do carimbo', () => {
  assert.ok(L.EH_MOMENTO.test('2026-09-15 12:07:50'));
  assert.ok(!L.EH_MOMENTO.test('Br Assignment Task 2026-09-15 12:07:50'));
});
