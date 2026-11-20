// Testes da Alimentação por polo (js/alimentar.js).
// O que se protege: cada polo vê e troca só a própria carga — antes o envio de Caçador
// apagava a de Videira e quem bipava lá parava de achar pacote (20/11/2026).
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "alimentar.js"), "utf8");

function carregar() {
  const ctx = vm.createContext({
    console,
    localStorage: { getItem() { return null; }, setItem() {} },
    document: { getElementById: () => ({}) },
  });
  vm.runInContext(fonte + `;globalThis.__a = {
    doPolo: (l, p) => JSON.stringify(_alimentarDoPolo(l, p)),
    poloAtual: (info, sel) => { _alimentarPoloInfo = info; _alimentarPoloSel = sel; return _alimentarPoloAtual(); },
  };`, ctx, { filename: "alimentar.js" });
  return ctx.__a;
}

const ARQUIVOS = [
  { id: 1, polo: "cacador", atual: true },
  { id: 2, polo: "cacador", atual: false },
  { id: 3, polo: "videira", atual: true },
  { id: 4, polo: null, atual: false },
];

test("cada polo lista só os próprios envios", () => {
  const a = carregar();
  assert.deepStrictEqual(JSON.parse(a.doPolo(ARQUIVOS, "cacador")).doPolo.map((x) => x.id), [1, 2]);
  assert.deepStrictEqual(JSON.parse(a.doPolo(ARQUIVOS, "videira")).doPolo.map((x) => x.id), [3]);
});

test("envio de antes da divisão só aparece enquanto ainda vale", () => {
  const a = carregar();
  assert.strictEqual(JSON.parse(a.doPolo(ARQUIVOS, "videira")).semPolo, null);
  const soAntigo = [{ id: 9, polo: null, atual: true }];
  assert.strictEqual(JSON.parse(a.doPolo(soAntigo, "videira")).semPolo.id, 9);
});

test("polo da tela: o escolhido só pra dev/admin; os outros ficam no do cadastro", () => {
  const a = carregar();
  assert.strictEqual(a.poloAtual({ polo: "cacador", ve_tudo: true, polos: [] }, "videira"), "videira");
  assert.strictEqual(a.poloAtual({ polo: "cacador", ve_tudo: false, polos: [] }, "videira"), "cacador");
  assert.strictEqual(a.poloAtual({ polo: null, ve_tudo: false, polos: [] }, null), null);
});
