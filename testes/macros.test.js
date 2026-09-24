// Testes de js/macros.js — a parte de estado do formulário de rodadas (adicionar, remover,
// trocar tipo) e a conversão chave->rota. O que se protege: trocar o tipo de uma rodada
// tem que resetar o parâmetro pro padrão do tipo novo (senão sobra um "90" configurado pra
// um critério que espera "quantos pacotes", sem fazer sentido nenhum), e remover uma
// rodada do meio não pode bagunçar as outras.
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "macros.js"), "utf8");

const ACESSOR = `
;globalThis.__m = {
  get rodadas() { return _macRodadas; },
  set rodadas(v) { _macRodadas = v; },
  set tipos(v) { _macTipos = v; },
  rotaDaChave: (c) => _macRotaDaChave(c),
  rotuloParametro: (id) => _macRotuloParametro(id),
};`;

function criarElemento() {
  const o = { innerHTML: "", style: {}, value: "", checked: false, setAttribute() {} };
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = String(v); }, get() { return o.innerHTML; } });
  return o;
}

function carregar() {
  const els = {};
  const el = (id) => els[id] || (els[id] = Object.assign(criarElemento(), { id }));
  const ctx = vm.createContext({
    console,
    document: { getElementById: el },
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros.js" });
  return { ctx, els, m: ctx.__m };
}

const TIPOS = [
  { id: "abaixo_limite", rotulo: "Abaixo de X% concluído", parametroRotulo: "% de conclusão", parametroPadrao: 90 },
  { id: "delivering_pendente", rotulo: "Mais de X pacotes em Delivering", parametroRotulo: "pacotes em Delivering", parametroPadrao: 1 },
];

// ── _macRotaDaChave ──────────────────────────────────────────────────────
test("troca underline por traco, pra bater com a rota do servidor", () => {
  const a = carregar();
  assert.strictEqual(a.m.rotaDaChave("avisos_entregador"), "avisos-entregador");
});

test("chave sem underline nenhum fica igual", () => {
  const a = carregar();
  assert.strictEqual(a.m.rotaDaChave("simples"), "simples");
});

test("chave vazia ou nula nao quebra", () => {
  const a = carregar();
  assert.strictEqual(a.m.rotaDaChave(""), "");
  assert.strictEqual(a.m.rotaDaChave(null), "");
});

// ── _macRotuloParametro ──────────────────────────────────────────────────
test("acha o rotulo do parametro pelo tipo", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  assert.strictEqual(a.m.rotuloParametro("delivering_pendente"), "pacotes em Delivering");
});

test("tipo desconhecido cai num rotulo generico, nao quebra", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  assert.strictEqual(a.m.rotuloParametro("nao_existe"), "Parâmetro");
});

// ── adicionar / remover / trocar tipo ─────────────────────────────────────
test("adicionar rodada usa o primeiro tipo do catalogo como padrao", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [];
  a.ctx._macAdicionarRodada();
  assert.strictEqual(a.m.rodadas.length, 1);
  assert.strictEqual(a.m.rodadas[0].tipo, "abaixo_limite");
  assert.strictEqual(a.m.rodadas[0].parametro, 90);
  assert.strictEqual(a.m.rodadas[0].hora, 12); // valor inicial razoavel, pro dev so ajustar
});

test("trocar o tipo de uma rodada reseta o parametro pro padrao do tipo novo", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarTipo(0, "delivering_pendente");
  assert.strictEqual(a.m.rodadas[0].tipo, "delivering_pendente");
  assert.strictEqual(a.m.rodadas[0].parametro, 1); // nao ficou com o 90 do tipo anterior
  assert.strictEqual(a.m.rodadas[0].hora, 19); // horario nao mexe
});

test("mudar campo grava na rodada certa pelo indice, sem afetar as outras", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [
    { hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 },
    { hora: 22, minuto: 5, tipo: "delivering_pendente", parametro: 1 },
  ];
  a.ctx._macMudarCampo(1, "parametro", "3");
  assert.strictEqual(a.m.rodadas[1].parametro, 3);
  assert.strictEqual(a.m.rodadas[0].parametro, 90, "a primeira rodada nao pode mudar");
});

test("campo vazio durante a digitacao fica string vazia, nao NaN", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarCampo(0, "hora", "");
  assert.strictEqual(a.m.rodadas[0].hora, "");
});

test("remover uma rodada do meio nao embaralha as outras", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [
    { hora: 8, minuto: 0, tipo: "abaixo_limite", parametro: 50 },
    { hora: 12, minuto: 0, tipo: "abaixo_limite", parametro: 70 },
    { hora: 20, minuto: 0, tipo: "delivering_pendente", parametro: 2 },
  ];
  a.ctx._macRemoverRodada(1); // tira a do meio (12h)
  assert.strictEqual(a.m.rodadas.length, 2);
  assert.strictEqual(a.m.rodadas[0].hora, 8);
  assert.strictEqual(a.m.rodadas[1].hora, 20);
});

test("remover todas as rodadas deixa a lista vazia, sem quebrar", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 8, minuto: 0, tipo: "abaixo_limite", parametro: 50 }];
  a.ctx._macRemoverRodada(0);
  assert.deepStrictEqual(a.m.rodadas, []);
});

// ── campo de horário da rodada ──────────────────────────────────────────────
// Eram dois number de 54px: o "19" saía cortado e os minutos sem o zero ("3" em vez de "03").
// Agora é UM campo de horário do navegador (type=time), que devolve "HH:MM" em 24h.
test("o horario aparece sempre com dois digitos: 19:03, nunca 19:3", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 19, minuto: 3 }), "19:03");
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 8, minuto: 0 }), "08:00");
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 0, minuto: 0 }), "00:00", "meia-noite e um horario valido, nao vazio");
});

test("hora ou minuto apagados/invalidos viram campo vazio, nao NaN:NaN", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: "", minuto: "" }), "");
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: null, minuto: 5 }), "");
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: "abc", minuto: 5 }), "");
});

test("o valor do campo vira hora e minuto NUMEROS, que e o que o servidor guarda", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarHorario(0, "07:05");
  assert.strictEqual(a.m.rodadas[0].hora, 7);
  assert.strictEqual(a.m.rodadas[0].minuto, 5);
  a.ctx._macMudarHorario(0, "00:00");
  assert.strictEqual(a.m.rodadas[0].hora, 0, "00:00 nao pode virar vazio");
  assert.strictEqual(a.m.rodadas[0].minuto, 0);
});

test("campo apagado no meio da edicao fica vazio (o servidor recusa ao salvar, como antes)", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarHorario(0, "");
  assert.strictEqual(a.m.rodadas[0].hora, "");
  assert.strictEqual(a.m.rodadas[0].minuto, "");
});

test("mudar o horario nao mexe no resto da rodada", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarHorario(0, "20:15");
  assert.strictEqual(JSON.stringify(a.m.rodadas[0]),
    JSON.stringify({ hora: 20, minuto: 15, tipo: "abaixo_limite", parametro: 90 }));
});

test("a linha da rodada leva o horario certo, o criterio marcado e o rotulo do numero", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada({ hora: 19, minuto: 3, tipo: "delivering_pendente", parametro: 0 }, 0);
  assert.ok(html.includes('type="time"'));
  assert.ok(html.includes('value="19:03"'));
  assert.ok(html.includes('<option value="delivering_pendente" selected>'));
  assert.ok(html.includes(">Pacotes em Delivering<"), "rotulo em letra normal, com inicial maiuscula");
  assert.ok(html.includes("_macRemoverRodada(0)"));
});

test("o criterio inteiro vai no title (o campo pode cortar o texto comprido)", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada({ hora: 19, minuto: 3, tipo: "delivering_pendente", parametro: 0 }, 0);
  assert.ok(html.includes('title="Mais de X pacotes em Delivering"'));
});

test("rotulo de criterio com HTML nao vira HTML na linha da rodada", () => {
  const a = carregar();
  a.m.tipos = [{ id: "x", rotulo: "<b>x</b>", parametroRotulo: "<i>y</i>", parametroPadrao: 0 }];
  const html = a.ctx._macLinhaRodada({ hora: 1, minuto: 2, tipo: "x", parametro: 0 }, 0);
  assert.ok(!html.includes("<b>x</b>") && !html.includes("<i>y</i>"));
});
