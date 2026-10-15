// Testes de js/planejamento-videira.js — o aviso de formato do "Inserir Entregador".
// O que se protege: o aviso enquanto digita tem que concordar com a regra do servidor
// (modules/planejamento/usuarios.js no backend). Se a tela disser "Formato certo." pra
// algo que o servidor recusa — ou o contrário — quem planeja fica sem entender o porquê.
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "planejamento-videira.js"), "utf8");

const ACESSOR = `
;globalThis.__p = {
  modelo: (t) => _PV_RE_MODELO.test(t.replace(/\\s+/g, " ").trim()),
  porTransportadora: _PV_POR_TRANSPORTADORA,
  transportadora: _pvTransportadora,
};`;

function carregar() {
  const ctx = vm.createContext({
    console,
    window: { addEventListener() {} },
    document: { addEventListener() {}, getElementById: () => ({ style: {} }) },
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "planejamento-videira.js" });
  return ctx.__p;
}

test("o planejamento abre no geral, com o por transportadora desligado", () => {
  const p = carregar();
  assert.strictEqual(p.porTransportadora, false);
  assert.strictEqual(p.transportadora, "geral");
});

test("aceita o modelo Nome Sobrenome - Cidade, com o que é só digitação", () => {
  const p = carregar();
  for (const nome of [
    "Ana Teste - Videira",
    "ana teste da silva - rio das antas",
    "Ana Teste-Videira",
    "  Ana   Teste  -  Videira ",
    "João D'Ávila Teste - Caçador",
  ]) {
    assert.ok(p.modelo(nome), JSON.stringify(nome) + " deveria passar");
  }
});

test("recusa o que o servidor também recusa", () => {
  const p = carregar();
  for (const nome of [
    "Ana Teste",
    "Ana - Videira",
    "Ana Teste 2 - Videira",
    "Ana Teste - Videira 1",
    "Ana Teste - Videira - SC",
    "Ana Teste -",
  ]) {
    assert.ok(!p.modelo(nome), JSON.stringify(nome) + " deveria ser recusado");
  }
});
