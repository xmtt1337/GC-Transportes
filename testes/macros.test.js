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

// ── seletores de hora e minuto da rodada ────────────────────────────────────
// Eram dois number de 54px (o "19" saía cortado, os minutos sem o zero) e depois um campo
// type="time", cuja lista do Chrome dá a volta (depois do 59 vem o 00) e parecia rolar sem
// fim. Agora são dois seletores comuns: hora 00–23 e minuto 00–59, com lista que termina.
const seletor = (html, rotulo) => {
  const ini = html.indexOf(`aria-label="${rotulo}"`);
  assert.notStrictEqual(ini, -1, `sem o seletor de ${rotulo}`);
  return html.slice(ini, html.indexOf("</select>", ini));
};
const opcoes = (bloco) => bloco.split("<option value=").length - 1;
const RODADA = { hora: 19, minuto: 3, tipo: "delivering_pendente", parametro: 0 };

test("a hora vai de 00 a 23, com dois digitos, e a lista termina no 23", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const hora = seletor(a.ctx._macLinhaRodada(RODADA, 0), "Hora");
  assert.strictEqual(opcoes(hora), 24);
  assert.ok(hora.includes(">00</option>"));
  assert.ok(hora.includes(">23</option>"));
  assert.ok(!hora.includes(">24</option>"), "nao existe hora 24");
});

test("o minuto vai de 00 a 59, com dois digitos, e a lista termina no 59", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const minuto = seletor(a.ctx._macLinhaRodada(RODADA, 0), "Minuto");
  assert.strictEqual(opcoes(minuto), 60);
  assert.ok(minuto.includes(">00</option>"));
  assert.ok(minuto.includes(">59</option>"));
  assert.ok(!minuto.includes(">60</option>"), "nao existe minuto 60");
});

test("hora e minuto da rodada vem marcados, com zero na frente: 19 e 03", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada(RODADA, 0);
  assert.ok(seletor(html, "Hora").includes('<option value="19" selected>19</option>'));
  assert.ok(seletor(html, "Minuto").includes('<option value="3" selected>03</option>'),
    "o rotulo e 03 (dois digitos), mesmo que o valor guardado seja o numero 3");
});

test("meia-noite e um horario valido: 00:00 vem marcado, nao vazio", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada({ ...RODADA, hora: 0, minuto: 0 }, 0);
  assert.ok(seletor(html, "Hora").includes('<option value="0" selected>00</option>'));
  assert.ok(seletor(html, "Minuto").includes('<option value="0" selected>00</option>'));
  assert.ok(!html.includes(">--</option>"));
});

test("hora ou minuto vazios/invalidos mostram -- marcado, em vez de escolher 00 sozinho", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  // (24 e 60 ficam de fora: 24 e um MINUTO valido, e 60 uma hora valida - teste proprio abaixo.)
  for (const invalido of ["", null, undefined, "abc", -1, 1.5]) {
    const html = a.ctx._macLinhaRodada({ ...RODADA, hora: invalido, minuto: invalido }, 0);
    assert.ok(seletor(html, "Hora").includes('<option value="" selected>--</option>'), String(invalido));
    assert.ok(seletor(html, "Minuto").includes('<option value="" selected>--</option>'), String(invalido));
  }
});

test("minuto 60 ou hora 24 tambem sao invalidos", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada({ ...RODADA, hora: 24, minuto: 60 }, 0);
  assert.ok(seletor(html, "Hora").includes(">--</option>"));
  assert.ok(seletor(html, "Minuto").includes(">--</option>"));
});

test("escolher no seletor grava numero, e 0 (meia-noite) nao vira vazio", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarCampo(0, "hora", "7");
  a.ctx._macMudarCampo(0, "minuto", "0");
  assert.strictEqual(a.m.rodadas[0].hora, 7);
  assert.strictEqual(a.m.rodadas[0].minuto, 0);
  assert.strictEqual(typeof a.m.rodadas[0].hora, "number");
});

test("os seletores gravam na rodada certa, hora e minuto cada um no seu campo", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada(RODADA, 2);
  assert.ok(seletor(html, "Hora").includes("_macMudarCampo(2,'hora',this.value)"));
  assert.ok(seletor(html, "Minuto").includes("_macMudarCampo(2,'minuto',this.value)"));
});

test("nao usa o campo de horario do navegador (a lista dele da a volta e parece infinita)", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  assert.ok(!a.ctx._macLinhaRodada(RODADA, 0).includes('type="time"'));
});

test("a linha da rodada leva o criterio marcado e o rotulo do numero em letra normal", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada(RODADA, 0);
  assert.ok(html.includes('<option value="delivering_pendente" selected>'));
  assert.ok(html.includes(">Pacotes em Delivering<"));
  assert.ok(html.includes("_macRemoverRodada(0)"));
});

test("o criterio inteiro vai no title (o campo pode cortar o texto comprido)", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  assert.ok(a.ctx._macLinhaRodada(RODADA, 0).includes('title="Mais de X pacotes em Delivering"'));
});

test("rotulo de criterio com HTML nao vira HTML na linha da rodada", () => {
  const a = carregar();
  a.m.tipos = [{ id: "x", rotulo: "<b>x</b>", parametroRotulo: "<i>y</i>", parametroPadrao: 0 }];
  const html = a.ctx._macLinhaRodada({ hora: 1, minuto: 2, tipo: "x", parametro: 0 }, 0);
  assert.ok(!html.includes("<b>x</b>") && !html.includes("<i>y</i>"));
});
