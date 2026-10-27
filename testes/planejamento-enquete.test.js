// Testes de js/planejamento-enquete.js — a leitura do relatório de fixos e de extras.
// O que se protege: achar a coluna pelo cabeçalho (com título antes da tabela, acento
// e caixa diferentes), cair na ordem das colunas quando não há cabeçalho, e casar o
// nome do extra com a lista do planejamento mesmo com " - Cidade" de um lado só.
//
// Script carregado sozinho num contexto isolado. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "planejamento-enquete.js"), "utf8");

function carregar() {
  const ctx = vm.createContext({ console });
  vm.runInContext(fonte + `;globalThis.__p = {
    fixos: _peFixosDoRelatorio, nomes: _peNomesDoRelatorio, casar: _peCasarNomes };`, ctx, { filename: "planejamento-enquete.js" });
  return ctx.__p;
}

const json = (v) => JSON.parse(JSON.stringify(v));

test("fixos: acha Entregador/Bairro pelo cabeçalho, mesmo com título antes e colunas fora de ordem", () => {
  const p = carregar();
  const linhas = [
    ["Rotas fixas TESTE"],
    [],
    ["Sigla", "BAIRRO", "Entregador "],
    ["CTR", "Centro TESTE", "Ana Teste da Silva"],
    ["", "", ""],
    ["ALT", " Alto  TESTE ", "Bruno Teste Souza"],
  ];
  assert.deepStrictEqual(json(p.fixos(linhas)), ["Ana Teste da Silva;Centro TESTE", "Bruno Teste Souza;Alto TESTE"]);
});

test("fixos: sem cabeçalho vale a ordem (entregador, bairro)", () => {
  const p = carregar();
  assert.deepStrictEqual(json(p.fixos([["Ana Teste da Silva", "Centro TESTE"]])), ["Ana Teste da Silva;Centro TESTE"]);
});

test("extras: coluna pelo cabeçalho, sem repetir; sem cabeçalho usa a 1ª coluna", () => {
  const p = carregar();
  assert.deepStrictEqual(json(p.nomes([["Cidade", "Usuários"], ["X", "Carla Teste Lima"], ["X", "carla teste lima"], ["X", "Diego Teste Rocha"]])),
    ["Carla Teste Lima", "Diego Teste Rocha"]);
  assert.deepStrictEqual(json(p.nomes([["Carla Teste Lima"], [""], ["Diego Teste Rocha"]])), ["Carla Teste Lima", "Diego Teste Rocha"]);
});

test("extras: casa com a lista ignorando caixa, acento e cidade; separa quem não está nela", () => {
  const p = carregar();
  const lista = ["Carla Teste Lima - Caçador", "Diego Teste Rocha"];
  const r = json(p.casar(["CARLA TESTE LIMA", "Diego Teste Rocha - Cacador", "Fulano Teste Fora"], lista));
  assert.deepStrictEqual(r, { achados: ["Carla Teste Lima - Caçador", "Diego Teste Rocha"], faltando: ["Fulano Teste Fora"] });
});
