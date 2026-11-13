// Fechamento › Precificação (js/precificacao.js): busca, o que o modal manda pro servidor e
// o histórico legível. Cidades e valores inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ctx = vm.createContext({ console, API: "https://api.teste", token: "tok", window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "precificacao.js"), "utf8"), ctx);
const plano = (v) => JSON.parse(JSON.stringify(v));

test("busca ignora acento e caixa, por cidade, polo ou motoristas", () => {
    const linhas = [{ cidade: "Caçador Teste", polo: "Polo A" }, { cidade: "Vila Teste", polo: "Polo B", motoristas: "Fulano Teste" }];
    assert.deepStrictEqual(plano(ctx._prFiltrar(linhas, "cacador")).map(l => l.cidade), ["Caçador Teste"]);
    assert.deepStrictEqual(plano(ctx._prFiltrar(linhas, "fulano")).map(l => l.cidade), ["Vila Teste"]);
    assert.strictEqual(ctx._prFiltrar(linhas, "").length, 2);
});

test("modal → corpo: valores por tipo, Direto/Parceiro como booleano", () => {
    const c = plano(ctx._prCorpoLinha({ cidade: "Vila Teste", parceiro: "true", "valor:NORMAL": "3,20", "incentivo:NORMAL": "0,50" }, ["NORMAL"]));
    assert.deepStrictEqual(c, { valores: { NORMAL: { valor: "3,20", incentivo: "0,50" } }, cidade: "Vila Teste", parceiro: true });
    const tot = plano(ctx._prCorpoLinha({ cidade: "X", parceiro: "false", "valor:EXPRESSO": "5" }, ["EXPRESSO", "CARD NORMAL"]));
    assert.deepStrictEqual(tot.valores, { EXPRESSO: { valor: "5" }, "CARD NORMAL": {} });
    assert.strictEqual(tot.parceiro, false);
});

test("histórico mostra antes → depois de cada campo", () => {
    const h = ctx._prHtmlHistorico([
        { acao: "alterou", cidade: "Vila Teste", quem: "Gestor Teste", em: "2026-11-13T10:00:00Z", mudancas: [{ campo: "Valor", antes: 3, depois: 3.2 }, { campo: "Direto/Parceiro", antes: false, depois: true }] },
        { acao: "importou", em: "2026-11-13T09:00:00Z", depois: { linhas: 40, substituiu: 0 } },
    ]);
    assert.ok(h.includes("Valor: 3 → 3,2"));
    assert.ok(h.includes("Direto/Parceiro: Direto → Parceiro"));
    assert.ok(h.includes("40 linhas"));
});
