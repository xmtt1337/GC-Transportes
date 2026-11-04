// Operação › Jadlog › Anotações: lista e o que vai pro servidor. Dados inventados.
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

test("lista: só quem tem anotação no dia e quem foi escolhido agora; o resto fica no Adicionar, sem repetir", () => {
    const ctx = carregar();
    const d = { entregadores: ["Ciclano - Vila", "Beltrano - Morro", "fulano de teste - vila teste"],
        anotacoes: [{ entregador: "Fulano de Teste - Vila Teste", quantidade: 4 }, { entregador: "Antigo - Vila", quantidade: 1 }] };
    const l = ctx._jadLinhas(d, ["Ciclano - Vila", "fulano de teste - vila teste"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(l.map(x => [x.entregador, x.anotacao ? x.anotacao.quantidade : null]))),
        [["Antigo - Vila", 1], ["Fulano de Teste - Vila Teste", 4], ["Ciclano - Vila", null]]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx._jadDisponiveis(d, l))), ["Beltrano - Morro"]);
});

test("salvar manda só o que mudou, com vazio pra apagar", () => {
    const ctx = carregar();
    vm.runInContext(`_jadValores = { "Fulano - Vila": "12", "Beltrano - Morro": " " };`, ctx);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx._jadItens())), [{ entregador: "Fulano - Vila", quantidade: "12" }, { entregador: "Beltrano - Morro", quantidade: "" }]);
});

test("tela tem o dia, a busca e um campo por entregador", () => {
    const ctx = carregar();
    const html = ctx._jadHtml({ dia: "2026-11-04", total: 4, entregadores: ["Ciclano - Vila"], anotacoes: [] });
    assert.match(html, /type="date"[^>]*value="2026-11-04"/);
    assert.match(html, /Adicionar entregador/);
    assert.match(html, /<option value="Ciclano - Vila">/);
    assert.doesNotMatch(html, /data-entregador="Ciclano - Vila"/, "não lista todo mundo");
    assert.match(html, /Nenhuma anotação neste dia/);
    assert.match(html, /4 pacote\(s\) anotados no dia/);
});
