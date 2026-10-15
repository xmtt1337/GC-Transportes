// Testes do cartão da busca por CEP na Separação (js/bipagens.js).
// O que se protege: desde o planejamento geral, o servidor devolve o CEP com
// transportadora "geral" — o cartão tem que dizer "Geral", e não mostrar a chave
// crua nem a cor de uma transportadora qualquer.
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "bipagens.js"), "utf8");

function carregar() {
  const nada = () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} });
  const ctx = vm.createContext({
    console,
    window: { addEventListener() {} },
    document: { addEventListener() {}, getElementById: nada, querySelector: nada, querySelectorAll: () => [] },
    setTimeout, clearTimeout,
  });
  vm.runInContext(fonte + ";globalThis.__render = _bipRenderCepCards;", ctx, { filename: "bipagens.js" });
  return ctx.__render;
}

test("CEP do planejamento geral vira um cartão 'Geral'", () => {
  const html = carregar()([{
    entregador: "Ana Teste da Silva - Videira", cidade: "Videira", bairro: "Centro TESTE",
    rua: "Rua A", sigla: "C-01", transportadora: "geral",
  }]);
  assert.match(html, />Geral</);
  assert.match(html, /Ana Teste da Silva - Videira/);
  assert.match(html, /#3a86ff/);
  assert.strictEqual((html.match(/bip-result-card/g) || []).length, 1);
});

test("cartão por transportadora continua com o nome dela", () => {
  const html = carregar()([{ entregador: "Bruno Teste", transportadora: "loggi" }]);
  assert.match(html, />Loggi</);
});
