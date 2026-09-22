// Testes de js/entregador-telefone.js — formatação do telefone lido da planilha.
//
// A tela é só leitura (o telefone vem ao vivo do servidor, que já lê a planilha "Dados
// entregadores/CLT's" e valida o número — ver modules/entregador-telefone/testes/). Aqui
// só o que é do navegador: formatar o e164 que chegou pra exibição.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "entregador-telefone.js"), "utf8");
const ctx = vm.createContext({ console });
vm.runInContext(fonte + "\n;globalThis.__etf = { formatar: _etfFormatarNumero };", ctx, { filename: "entregador-telefone.js" });
const api = ctx.__etf;

test("formata celular de 11 digitos", () => {
  assert.strictEqual(api.formatar("5549999276131"), "+55 49 9 9927-6131");
});

test("formata fixo de 10 digitos", () => {
  assert.strictEqual(api.formatar("554933334444"), "+55 49 3333-4444");
});

test("vazio ou nulo vira travessao", () => {
  assert.strictEqual(api.formatar(""), "—");
  assert.strictEqual(api.formatar(null), "—");
});

test("numero fora do padrao brasileiro conhecido ainda mostra alguma coisa, nao quebra", () => {
  assert.strictEqual(api.formatar("12025550100"), "+12025550100");
});
