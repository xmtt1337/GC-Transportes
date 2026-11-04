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

test("lista: quem já tem anotação no dia primeiro; nome anotado que não está na lista também aparece; sem repetir", () => {
    const ctx = carregar();
    const l = ctx._jadLinhas({ entregadores: ["Ciclano - Vila", "Beltrano - Morro", "fulano de teste - vila teste"],
        anotacoes: [{ entregador: "Fulano de Teste - Vila Teste", quantidade: 4 }, { entregador: "Antigo - Vila", quantidade: 1 }] });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(l.map(x => [x.entregador, x.anotacao ? x.anotacao.quantidade : null]))),
        [["Antigo - Vila", 1], ["fulano de teste - vila teste", 4], ["Beltrano - Morro", null], ["Ciclano - Vila", null]]);
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
    assert.match(html, /Buscar entregador/);
    assert.match(html, /data-entregador="Ciclano - Vila"/);
    assert.match(html, /4 pacote\(s\) anotados no dia/);
});
