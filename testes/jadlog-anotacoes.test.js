// Operação › Jadlog › Anotações: lista, busca e o que vai pro servidor. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const ctx = { console, API: "https://api.teste", token: "tok" };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "jadlog-anotacoes.js"), "utf8"), ctx);
    return ctx;
}
const json = (x) => JSON.parse(JSON.stringify(x));

test("lista: anotados no dia primeiro, depois quem já foi anotado em outro dia e quem veio da busca, sem repetir", () => {
    const ctx = carregar();
    const d = { entregadores: ["Ciclano - Vila", "Beltrano - Morro"], habituais: ["Antigo - Vila", "fulano de teste - vila teste"],
        anotacoes: [{ entregador: "Fulano de Teste - Vila Teste", quantidade: 4 }] };
    const l = ctx._jadLinhas(d, ["Ciclano - Vila"]);
    assert.deepStrictEqual(json(l.map(x => [x.entregador, x.anotacao ? x.anotacao.quantidade : null])),
        [["Fulano de Teste - Vila Teste", 4], ["Antigo - Vila", null], ["Ciclano - Vila", null]]);
});

test("lupa sugere só quem não está na lista, sem acento/caixa, até 8", () => {
    const ctx = carregar();
    const d = { entregadores: ["José Teste - Vila", "Josefa Teste - Morro", "Beltrano - Morro"], habituais: ["José Teste - Vila"], anotacoes: [] };
    const l = ctx._jadLinhas(d, []);
    assert.deepStrictEqual(json(ctx._jadSugestoes(d, l, "jose")), ["Josefa Teste - Morro"]);
    assert.deepStrictEqual(json(ctx._jadSugestoes(d, l, "")), []);
});

test("calendário: até 31/10/2026 (de novembro em diante é Atribuir), total anotado embaixo do dia", () => {
    const ctx = carregar();
    const dias = ctx._jadDiasDoCalendario([{ dia: "2026-10-30", total: 12 }], "2026-11-04");
    assert.strictEqual(dias[dias.length - 1].dia, "2026-10-31");
    assert.deepStrictEqual(json(dias.find(d => d.dia === "2026-10-30")), { dia: "2026-10-30", sub: "12", resumo: "12 pacote(s) Jadlog" });
});

test("salvar manda só o que mudou, com vazio pra apagar", () => {
    const ctx = carregar();
    vm.runInContext(`_jadValores = { "Fulano - Vila": "12", "Beltrano - Morro": " " };`, ctx);
    assert.deepStrictEqual(json(ctx._jadItens()), [{ entregador: "Fulano - Vila", quantidade: "12" }, { entregador: "Beltrano - Morro", quantidade: "" }]);
});

test("lista vazia orienta a usar a lupa; linha traz o campo do entregador", () => {
    const ctx = carregar();
    assert.match(ctx._jadHtmlLista({ anotacoes: [], habituais: [] }), /Pesquise o entregador na lupa/);
    assert.match(ctx._jadHtmlLista({ anotacoes: [], habituais: ["Ciclano - Vila"] }), /data-entregador="Ciclano - Vila"/);
});
