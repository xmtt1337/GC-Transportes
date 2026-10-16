// Criar Fechamento: o que a tela manda pro backend no upload.
//
// O relatório da Shopee tem dezenas de colunas e dezenas de milhares de linhas; a tela
// manda só as colunas que o backend sabe ler (lista vinda de GET /config). Se o filtro
// comparar nome de coluna diferente do backend (acento, caixa), a coluna some no caminho
// e o upload falha com "coluna não encontrada" mesmo o arquivo tendo ela.
// Dados de teste inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const ctx = { console, API: "https://api.teste", token: "tok" };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-criar.js"), "utf8"), ctx);
    return ctx;
}

test("filtro de colunas ignora acento e caixa, como o backend", () => {
    const ctx = carregar();
    const grid = [
        ["Código", "Lixo", "USUÁRIO", "Data Atribuição"],
        ["P1", "x", "fulano", "2026-10-01"],
    ];
    const r = ctx._cfSoColunasUteis(grid, ["Codigo", "Usuario", "Data atribuicao"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.posicoes)), [0, 2, 3]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.grid)), [
        ["Código", "USUÁRIO", "Data Atribuição"],
        ["P1", "fulano", "2026-10-01"],
    ]);
});

test("linha mais curta que o cabeçalho não vira undefined", () => {
    const ctx = carregar();
    const r = ctx._cfSoColunasUteis([["Codigo", "Usuario"], ["P1"]], ["Codigo", "Usuario"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.grid[1])), ["P1", ""]);
});

test("as 5 transportadoras da planilha de precificação têm card", () => {
    const ctx = carregar();
    assert.deepStrictEqual(
        JSON.parse(vm.runInContext("JSON.stringify(_CF_TRANSPORTADORAS.map(t => t.label))", ctx)),
        ["Shopee Xpress", "Loggi", "Anjun", "Imile", "Total Express"]);
});

test("coluna pela letra (#S, #AG) entra mesmo sem nome reconhecido", () => {
    const ctx = carregar();
    const cab = Array.from({ length: 34 }, (_, i) => "X" + i);
    cab[0] = "Waybill No";
    const r = ctx._cfSoColunasUteis([cab], ["Waybill No", "#S", "#AG"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.posicoes)), [0, 18, 32]);
});
