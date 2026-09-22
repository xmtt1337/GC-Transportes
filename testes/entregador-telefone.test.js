// Testes de js/entregador-telefone.js — máscara/formatação de telefone e a linha da tabela.
//
// A validação "de verdade" (rejeitar DDD inválido etc.) mora no servidor
// (modules/entregador-telefone/testes/validacao.test.js), já que é ele quem decide se
// grava. Aqui só o que é específico do navegador: a máscara que a pessoa vê digitando, e
// formatar o e164 salvo de volta pra tela.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "entregador-telefone.js"), "utf8");
const ctx = vm.createContext({ console });
vm.runInContext(fonte + "\n;globalThis.__etf = { digitos: _etfDigitosLocais, mascara: _etfFormatarDigitando, formatar: _etfFormatarNumero };", ctx, { filename: "entregador-telefone.js" });
const api = ctx.__etf;

// ── _etfDigitosLocais ────────────────────────────────────────────────────
test("tira mascara e o +55 da frente", () => {
  assert.strictEqual(api.digitos("+55 49 9 9927-6131"), "49999276131");
});

test("nao mexe em numero sem prefixo 55 explicito, mas ainda tira se sobrar cara de local", () => {
  assert.strictEqual(api.digitos("5549999276131"), "49999276131");
});

// ── _etfFormatarDigitando (o que a pessoa ve enquanto digita) ────────────
test("vai formatando conforme os digitos chegam", () => {
  assert.strictEqual(api.mascara("4"), "+55 4");
  assert.strictEqual(api.mascara("49"), "+55 49");
  assert.strictEqual(api.mascara("4999"), "+55 49 99");
  assert.strictEqual(api.mascara("499992"), "+55 49 9992");
  assert.strictEqual(api.mascara("49999276"), "+55 49 9992-76");
  assert.strictEqual(api.mascara("4999927613"), "+55 49 9992-7613");
  assert.strictEqual(api.mascara("49999276131"), "+55 49 9 9927-6131");
});

test("campo vazio fica vazio, nao mostra so o +55", () => {
  assert.strictEqual(api.mascara(""), "");
});

// ── _etfFormatarNumero (o e164 salvo, de volta pra leitura) ──────────────
test("formata celular de 11 digitos salvo", () => {
  assert.strictEqual(api.formatar("5549999276131"), "+55 49 9 9927-6131");
});

test("formata fixo de 10 digitos salvo", () => {
  assert.strictEqual(api.formatar("554933334444"), "+55 49 3333-4444");
});

test("vazio ou nulo vira travessao", () => {
  assert.strictEqual(api.formatar(""), "—");
  assert.strictEqual(api.formatar(null), "—");
});

test("numero fora do padrao brasileiro conhecido ainda mostra alguma coisa, nao quebra", () => {
  assert.strictEqual(api.formatar("12025550100"), "+12025550100");
});
