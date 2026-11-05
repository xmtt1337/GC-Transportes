// Operação › Jadlog › Atribuir: sugestões, agrupamento e calendário. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const ctx = { console, API: "https://api.teste", token: "tok" };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "jadlog-atribuir.js"), "utf8"), ctx);
    return ctx;
}
const json = (x) => JSON.parse(JSON.stringify(x));

test("lupa: sem busca mostra quem já recebeu Jadlog; com busca procura em todos, sem acento", () => {
    const ctx = carregar();
    const d = { habituais: ["Fulano - Vila"], entregadores: ["José Teste - Morro", "Fulano - Vila", "Beltrano - Vila"] };
    assert.deepStrictEqual(json(ctx._jatSugestoes(d, "")), ["Fulano - Vila"]);
    assert.deepStrictEqual(json(ctx._jatSugestoes(d, "jose")), ["José Teste - Morro"]);
});

test("lista do dia agrupada por entregador, quem tem mais primeiro", () => {
    const ctx = carregar();
    const g = json(ctx._jatGrupos([{ id: 1, codigo: "JD1", entregador: "Beltrano - Vila" }, { id: 2, codigo: "JD2", entregador: "Fulano - Vila" },
        { id: 3, codigo: "JD3", entregador: "Fulano - Vila" }]));
    assert.deepStrictEqual(g.map(x => [x.entregador, x.itens.length]), [["Fulano - Vila", 2], ["Beltrano - Vila", 1]]);
    const html = ctx._jatHtmlLista({ atribuicoes: [{ id: 2, codigo: "JD2", entregador: "Fulano - Vila" }] });
    assert.match(html, /JD2/);
    assert.match(html, /Bipar pra ele/);
});

test("calendário só a partir de 01/11/2026, com o total bipado no dia", () => {
    const ctx = carregar();
    const dias = json(ctx._jatDiasDoCalendario([{ dia: "2026-11-04", total: 37 }], "2026-11-05"));
    assert.deepStrictEqual(dias.map(d => d.dia), ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    assert.strictEqual(dias[3].sub, "37");
});
