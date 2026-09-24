// Testes da conta de agenda (logica.js): a agenda que vem do sistema x a do popup.
//
//   node --test automacao/alimentacao/testes/test_agenda_site.test.js
//
// Agenda errada = macro rodando na hora errada num Chrome que ninguem olha, e o
// erro so aparece no dia seguinte, no registro. O que se protege:
//   - o sistema manda quando mandou, e o popup no resto, macro por macro;
//   - os pisos de minutos valem tambem AQUI (a ultima barreira antes do alarme);
//   - horario em minuto do dia (08:30 = 510) casa com o relogio de Brasilia;
//   - so os tres macros conhecidos viram comando.
//
// Dados de TESTE, inventados.

const { test } = require('node:test');
const assert = require('node:assert');

const L = require('../extensao-macros-spx/logica.js');

const sistema = (extra) => ({ ativo: true, modo: 'intervalo', minutos: 60, horarios: [], ...extra });
const OFF = { modo: 'off', minutos: 60, horarios: [] };

// ── minutosAteProximoHorario ──────────────────────────────────────────────
test('proximo horario com minuto quebrado: 08:30 as 08:00 falta meia hora', () => {
  assert.strictEqual(L.minutosAteProximoHorario([8 * 60 + 30], 8 * 60), 30);
});

test('escolhe o mais proximo da lista e vira o dia quando todos passaram', () => {
  assert.strictEqual(L.minutosAteProximoHorario([480, 900], 14 * 60), 60);
  assert.strictEqual(L.minutosAteProximoHorario([480, 900], 16 * 60), 16 * 60);
});

test('nao remarca pra agora mesmo (o disparo das 08:30 nao roda duas vezes)', () => {
  assert.strictEqual(L.minutosAteProximoHorario([510], 510), 24 * 60);
});

test('lista vazia ou com lixo nao agenda nada', () => {
  assert.strictEqual(L.minutosAteProximoHorario([], 600), null);
  assert.strictEqual(L.minutosAteProximoHorario(null, 600), null);
  assert.strictEqual(L.minutosAteProximoHorario([-5, 1440, 2000, 1.5, 'x'], 600), null);
});

test('a conta em horas inteiras (popup) continua igual', () => {
  assert.strictEqual(L.minutosAteProximaHora([8, 12, 16], 9 * 60 + 30), 150);
  assert.strictEqual(L.minutosAteProximaHora([8, 12, 16], 18 * 60), 14 * 60);
  assert.strictEqual(L.minutosAteProximaHora([], 600), null);
});

// ── agendaDoSistema ───────────────────────────────────────────────────────
test('macro desligado no sistema vira off, mesmo com intervalo preenchido', () => {
  assert.deepStrictEqual(L.agendaDoSistema(sistema({ ativo: false }), 20), OFF);
  assert.deepStrictEqual(L.agendaDoSistema(null, 20), OFF);
});

test('intervalo do sistema respeita o piso do macro', () => {
  assert.strictEqual(L.agendaDoSistema(sistema({ minutos: 5 }), L.MINIMO_MINUTOS).minutos, 20);
  assert.strictEqual(L.agendaDoSistema(sistema({ minutos: 5 }), L.MINIMO_MINUTOS_BACKLOG).minutos, 30);
  assert.strictEqual(L.agendaDoSistema(sistema({ minutos: 45 }), 20).minutos, 45);
});

test('intervalo acima de 24h e cortado em 24h', () => {
  assert.strictEqual(L.agendaDoSistema(sistema({ minutos: 99999 }), 20).minutos, 1440);
});

test('minutos ausente ou torto cai em 60', () => {
  assert.strictEqual(L.agendaDoSistema(sistema({ minutos: undefined }), 20).minutos, 60);
  assert.strictEqual(L.agendaDoSistema(sistema({ minutos: 'abc' }), 20).minutos, 60);
});

test('horarios: tira repetido, lixo e fora da faixa, e ordena', () => {
  const r = L.agendaDoSistema(sistema({ modo: 'horarios', horarios: [900, 480, 900, -1, 1440, 'x', 510.5] }), 20);
  assert.deepStrictEqual(r.horarios, [480, 900]);
  assert.strictEqual(r.modo, 'horarios');
});

test('modo horarios sem nenhum horario valido vira desligado (nao ha o que agendar)', () => {
  assert.deepStrictEqual(L.agendaDoSistema(sistema({ modo: 'horarios', horarios: [] }), 20), OFF);
  assert.deepStrictEqual(L.agendaDoSistema(sistema({ modo: 'horarios', horarios: ['x'] }), 20), OFF);
});

// ── agendaDoPopup ─────────────────────────────────────────────────────────
test('popup: horas viram minutos do dia e o intervalo respeita o piso', () => {
  const r = L.agendaDoPopup({ modo: 'horarios', minutos: 1, horarios: [16, 8] });
  assert.deepStrictEqual(r.horarios, [480, 960]);
  assert.strictEqual(r.minutos, 20);
});

test('popup: o campo antigo em horas ainda e lido', () => {
  assert.strictEqual(L.agendaDoPopup({ modo: 'intervalo', horas: 2 }).minutos, 120);
});

test('popup vazio ou desconhecido e desligado', () => {
  assert.strictEqual(L.agendaDoPopup(undefined).modo, 'off');
  assert.strictEqual(L.agendaDoPopup({ modo: 'sempre' }).modo, 'off');
});

// ── agendaEfetiva ─────────────────────────────────────────────────────────
test('sem nada do sistema, e o popup: AT por intervalo -> Backlog de hora em hora', () => {
  const e = L.agendaEfetiva({ modo: 'intervalo', minutos: 45 }, null);
  assert.strictEqual(e.at.modo, 'intervalo');
  assert.strictEqual(e.at.minutos, 45);
  assert.deepStrictEqual(e.backlog, { modo: 'intervalo', minutos: 60, horarios: [] });
});

test('sem nada do sistema, AT em horarios -> Backlog vai junto', () => {
  const e = L.agendaEfetiva({ modo: 'horarios', horarios: [8, 16] }, null);
  assert.strictEqual(e.backlog.modo, 'junto');
});

test('sem nada do sistema, popup desligado -> tudo desligado', () => {
  const e = L.agendaEfetiva({ modo: 'off' }, null);
  assert.strictEqual(e.at.modo, 'off');
  assert.strictEqual(e.backlog.modo, 'off');
});

test('o sistema manda sobre o popup na AT, mesmo com o popup desligado', () => {
  const e = L.agendaEfetiva({ modo: 'off' }, { alimentacao: sistema({ minutos: 40 }) });
  assert.strictEqual(e.at.modo, 'intervalo');
  assert.strictEqual(e.at.minutos, 40);
});

test('so a AT vem do sistema: o Backlog herda o modo dela', () => {
  const porIntervalo = L.agendaEfetiva({ modo: 'off' }, { alimentacao: sistema() });
  assert.strictEqual(porIntervalo.backlog.modo, 'intervalo');
  const porHorarios = L.agendaEfetiva({ modo: 'off' }, { alimentacao: sistema({ modo: 'horarios', horarios: [480] }) });
  assert.strictEqual(porHorarios.backlog.modo, 'junto');
  const desligada = L.agendaEfetiva({ modo: 'intervalo' }, { alimentacao: sistema({ ativo: false }) });
  assert.strictEqual(desligada.backlog.modo, 'off');
});

test('Backlog do sistema tem agenda propria, independente da AT', () => {
  const e = L.agendaEfetiva({ modo: 'intervalo', minutos: 45 }, { backlog: sistema({ modo: 'horarios', horarios: [600] }) });
  assert.strictEqual(e.at.minutos, 45, 'a AT segue o popup');
  assert.deepStrictEqual(e.backlog, { modo: 'horarios', minutos: 60, horarios: [600] });
});

test('Backlog desligado no sistema nao roda nem quando a AT roda', () => {
  const e = L.agendaEfetiva({ modo: 'horarios', horarios: [8] }, { backlog: sistema({ ativo: false }) });
  assert.strictEqual(e.backlog.modo, 'off');
});

test('Backlog do sistema tem piso de 30 minutos', () => {
  const e = L.agendaEfetiva({}, { backlog: sistema({ minutos: 10 }) });
  assert.strictEqual(e.backlog.minutos, 30);
});

// ── minutosParaProximoBacklog ─────────────────────────────────────────────
const MIN = 60000;

test('backlog que nunca rodou roda ja, no proximo minuto', () => {
  assert.strictEqual(L.minutosParaProximoBacklog(60, undefined, 1e9), 1);
});

test('conta da ultima vez que rodou', () => {
  assert.strictEqual(L.minutosParaProximoBacklog(60, 1e9 - 50 * MIN, 1e9), 10);
});

test('atrasado nunca da zero ou negativo: no minimo 1 minuto', () => {
  assert.strictEqual(L.minutosParaProximoBacklog(60, 1e9 - 300 * MIN, 1e9), 1);
});

test('vale pro intervalo que o sistema escolheu, nao so pra 60', () => {
  assert.strictEqual(L.minutosParaProximoBacklog(90, 1e9 - 30 * MIN, 1e9), 60);
});

// ── comandoValido ─────────────────────────────────────────────────────────
test('so os tres macros da tela viram comando', () => {
  for (const qual of ['alimentacao', 'pedidos', 'backlog']) {
    assert.ok(L.comandoValido({ id: 'abc', qual }), qual);
  }
  assert.deepStrictEqual(L.MACROS_DA_TELA, ['alimentacao', 'pedidos', 'backlog']);
});

test('comando torto e recusado', () => {
  for (const c of [null, undefined, 'backlog', {}, { qual: 'backlog' }, { id: '', qual: 'backlog' },
    { id: 7, qual: 'backlog' }, { id: 'a'.repeat(65), qual: 'backlog' },
    { id: 'abc', qual: 'apagar' }, { id: 'abc', qual: '__proto__' }, { id: 'abc', qual: 'constructor' }]) {
    assert.ok(!L.comandoValido(c), JSON.stringify(c));
  }
});

// ── decidirAgendaDoSite ───────────────────────────────────────────────────
test('ausente: mantem (o servidor nao soube responder)', () => {
  assert.strictEqual(L.decidirAgendaDoSite(undefined, 'v1'), 'manter');
  assert.strictEqual(L.decidirAgendaDoSite(undefined, undefined), 'manter');
});

test('null: limpa se havia agenda do sistema, senao nao ha o que limpar', () => {
  assert.strictEqual(L.decidirAgendaDoSite(null, 'v1'), 'limpar');
  assert.strictEqual(L.decidirAgendaDoSite(null, undefined), 'manter');
});

test('versao nova aplica, a mesma mantem', () => {
  assert.strictEqual(L.decidirAgendaDoSite({ versao: 'v2' }, 'v1'), 'aplicar');
  assert.strictEqual(L.decidirAgendaDoSite({ versao: 'v1' }, 'v1'), 'manter');
  assert.strictEqual(L.decidirAgendaDoSite({ versao: 'v1' }, undefined), 'aplicar');
});

test('agenda sem versao, ou que nao e objeto, nunca e aplicada', () => {
  for (const a of [{}, { versao: '' }, { versao: 5 }, 'texto', 42, true]) {
    assert.strictEqual(L.decidirAgendaDoSite(a, 'v1'), 'manter', JSON.stringify(a));
  }
});
