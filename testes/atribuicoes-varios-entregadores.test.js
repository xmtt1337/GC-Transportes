// Shopee > Atribuições: mais de um entregador no mesmo cluster (desde 26/11/2026).
//
// O servidor manda, por cluster, a LISTA de quem está nele; a célula da visão geral mostra
// todos (um por linha, sem cortar o segundo) e o "+ atribuir" só aparece com a lista vazia.
// Resposta de servidor antigo (um objeto só) continua sendo lida.
//
// Nomes inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const arquivo = path.join(__dirname, "..", "js", "shopee-atribuicoes.js");
const fonte = fs.readFileSync(arquivo, "utf8") +
    "\n;globalThis.__sca = { _scaCelulaEntregador, _scaEntDoCluster," +
    " definir: (v, retrato) => { _scaEntregadores = v; _scaVisaoRetrato = !!retrato; } };";

const contexto = vm.createContext({ globalThis: undefined, console });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "shopee-atribuicoes.js" });
const api = contexto.__sca;

test("dois entregadores no cluster: a célula mostra os dois, um por linha", () => {
    api.definir({ "c-01": [{ id: "1", nome: "Fulano TESTE" }, { id: "2", nome: "Ciclano TESTE" }] });
    const celula = api._scaCelulaEntregador("C-01", "C-01");
    assert.ok(celula.includes("Fulano TESTE<br>Ciclano TESTE"));
    assert.ok(celula.includes("varios"), "precisa da classe que deixa quebrar linha");
    assert.ok(!celula.includes("+ atribuir"));
});

test("um só continua sem a classe de vários", () => {
    api.definir({ "c-01": [{ id: "1", nome: "Fulano TESTE" }] });
    const celula = api._scaCelulaEntregador("C-01", "C-01");
    assert.ok(celula.includes("Fulano TESTE"));
    assert.ok(!celula.includes("varios"));
});

test("lista vazia oferece + atribuir", () => {
    api.definir({ "c-01": [] });
    assert.ok(api._scaCelulaEntregador("C-01", "C-01").includes("+ atribuir"));
});

test("dia fechado mostra todos, sem botão", () => {
    api.definir({ "c-01": [{ id: "1", nome: "Fulano TESTE" }, { id: "2", nome: "Ciclano TESTE" }] }, true);
    const celula = api._scaCelulaEntregador("C-01", "C-01");
    assert.ok(celula.includes("Fulano TESTE<br>Ciclano TESTE"));
    assert.ok(!celula.includes("button"));
});

test("resposta antiga (um objeto por cluster) ainda é lida", () => {
    api.definir({ "c-01": { id: "1", nome: "Fulano TESTE" } });
    assert.strictEqual(api._scaEntDoCluster("C-01").map(e => e.nome).join("|"), "Fulano TESTE");
});

test("nome com HTML é escapado", () => {
    api.definir({ "c-01": [{ id: "1", nome: "<b>x</b>" }] });
    assert.ok(!api._scaCelulaEntregador("C-01", "C-01").includes("<b>x</b>"));
});
