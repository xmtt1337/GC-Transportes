// Testes do tomador em js/nota-fiscal.js — a GC reconhecida pelo CNPJ de qualquer
// filial, não só o da matriz. Texto de nota INVENTADO (nomes e números fictícios,
// exceto o CNPJ da própria GC, que é o que está sendo testado).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "nota-fiscal.js"), "utf8");

function extrair(texto) {
  const ctx = vm.createContext({ console: { log() {}, warn() {} } });
  vm.runInContext(fonte, ctx);
  return ctx._extrairCamposNota(texto);
}

// Nome do tomador ilegível (embaralhado) — só o CNPJ pode salvar a leitura.
const nota = (cnpjTomador) => [
  "DANFSe v2.0 Documento Auxiliar da NFS-e",
  "PRESTADOR / FORNECEDOR CNPJ / CPF / NIF 11.222.333/0001-81",
  "Nome / Nome Empresarial 11.222.333 FULANO DE TAL",
  `TOMADOR / ADQUIRENTE CNPJ / CPF / NIF ${cnpjTomador} ###`,
  "SERVIÇO PRESTADO Entrega de mercadorias",
  "VALOR LÍQUIDO DA NFS-e R$ 123,45",
].join("\n");

test("filial da GC (0003-70) conta como tomador GC", () => {
  assert.match(extrair(nota("40.595.873/0003-70")).tomador, /gc.*transport/i);
});

test("matriz da GC (0001-09) continua contando", () => {
  assert.match(extrair(nota("40.595.873/0001-09")).tomador, /gc.*transport/i);
});

test("CNPJ de outra empresa não vira GC", () => {
  assert.doesNotMatch(extrair(nota("99.888.777/0001-66")).tomador, /gc.*transport/i);
});
