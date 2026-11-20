// Testes da escolha de colunas da Alimentação (js/alimentar.js).
// O que se protege: o CEP de cada pacote sai daqui, e sem CEP a Separação não acha o
// entregador. Em 20/11/2026 o "Central waybill query" da Imile tinha "Intercept Status"
// antes de "Zipcode" — "inter-cep-t" contém "cep" e o arquivo inteiro subiu sem CEP.
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Cabeçalhos e CEPs
// de TESTE (só os nomes de coluna imitam os arquivos reais das transportadoras).

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
    detectar: (c) => JSON.stringify(_alimentarDetectarColunas(c)),
    cep: _alimentarColunaCep,
    temCep: _alimentarColunaTemCep,
  };`, ctx, { filename: "alimentar.js" });
  return ctx.__a;
}

test("Imile Central waybill query: pega Zipcode, não Intercept Status", () => {
  const cab = ["Waybill number", "Receive time", "Intercept Status", "Closed Status", "Recipient's name",
    "Destination city", "Zipcode", "Sender zipcode", "Return recipient postal code", "Return shipping postal code"];
  const col = JSON.parse(carregar().detectar(cab));
  assert.strictEqual(cab[col.cep], "Zipcode");
  assert.strictEqual(cab[col.bar], "Waybill number");
  assert.strictEqual(cab[col.cid], "Destination city");
});

test("palavra que só contém 'cep' no meio não é CEP", () => {
  const a = carregar();
  assert.strictEqual(a.cep(["Exception", "Intercept Status", "Reception time"]), -1);
  assert.strictEqual(a.cep(["Exception", "CEP"]), 1);
});

test("CEP de destino ganha; remetente e devolução ficam de fora", () => {
  const a = carregar();
  assert.strictEqual(a.cep(["CEP Remetente", "CEP Destinatário"]), 1);
  assert.strictEqual(a.cep(["Sender Zip Code", "Consignee Zip Code"]), 1);
  assert.strictEqual(a.cep(["Return recipient postal code", "Zipcode"]), 1);
  assert.strictEqual(a.cep(["Shipper postal", "CEP de entrega"]), 1);
  // Imile Dispatch waybill query (formato antigo)
  assert.strictEqual(a.cep(["Waybill No", "Destination Zipcode"]), 1);
});

test("nomes grudados ou com sublinhado continuam valendo", () => {
  const a = carregar();
  assert.strictEqual(a.cep(["Pedido", "CEPDestino"]), 1);
  assert.strictEqual(a.cep(["pedido", "cep_destino"]), 1);
  assert.strictEqual(a.cep(["Zipcode Name"]), 0);
});

test("só tem CEP de remetente: usa ele em vez de não achar nada", () => {
  // Melhor que travar: a conferência de conteúdo (temCep) e o seletor ainda pegam erro.
  assert.strictEqual(carregar().cep(["Codigo", "CEP Remetente"]), 1);
});

test("coluna sem título não desloca as outras", () => {
  // O índice é usado direto na linha do arquivo: tirar a vazia jogava o CEP pra vizinha.
  const col = JSON.parse(carregar().detectar(["Código de barras", "", "Cidade", "", "CEP"]));
  assert.deepStrictEqual([col.bar, col.cid, col.cep], [0, 2, 4]);
});

test("coluna com CEP de verdade passa; coluna de 'NO' não", () => {
  const a = carregar();
  const grid = [["Waybill number", "Intercept Status", "Zipcode"],
    ["TESTE1", "NO", "89500-000"], ["TESTE2", "NO", "89560000"], ["TESTE3", "NO", "8950000"], ["TESTE4", "NO", ""]];
  assert.strictEqual(a.temCep(grid, 2), true);
  assert.strictEqual(a.temCep(grid, 1), false);
  assert.strictEqual(a.temCep([["CEP"]], 0), false);
});
