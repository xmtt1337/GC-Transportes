// Acréscimos e Descontos: quinzenas oferecidas e o que vai pro servidor. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, value: "", innerHTML: "", innerText: "", style: {} }); return els.get(id); };
    let tipo = null;
    const ctx = { console, API: "https://api.teste", token: "tok", mostrarTela() {}, gcAlert() {}, gcConfirm() {},
        document: { getElementById: el, querySelector: () => (tipo ? { value: tipo } : null) } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-ajustes.js"), "utf8"), ctx);
    return { ctx, el, marcar: (t) => { tipo = t; } };
}

test("quinzenas: começa uma à frente, marca a atual, vira o ano", () => {
    const { ctx } = carregar();
    const l = JSON.parse(JSON.stringify(ctx._ajQuinzenas(new Date(2026, 0, 10))));
    assert.deepStrictEqual(l.slice(0, 3).map(q => q.valor), ["2026-1-2", "2026-1-1", "2025-12-2"]);
    assert.strictEqual(l.find(q => q.atual).valor, "2026-1-1");
    assert.match(l[0].rotulo, /^Q2Jan · 16 – fim de Jan\/2026$/);
    assert.strictEqual(l.length, 14);
});

test("lançar manda quinzena, entregador, valor, tipo e descrição; sem tipo não manda", async () => {
    const { ctx, el, marcar } = carregar();
    el("aj-quinzena").value = "2026-9-2";
    el("aj-driver").value = "Fulano de Teste - Vila Teste";
    el("aj-valor").value = "25,50";
    el("aj-descricao").value = "ajuda de custo";
    const chamadas = [];
    ctx.fetch = async (u, o) => { chamadas.push([u, o && o.body ? JSON.parse(o.body) : null]); return { ok: true, json: async () => ({ success: true, linhas: [] }) }; };
    await ctx._ajSalvar();
    assert.strictEqual(chamadas.length, 0);
    assert.match(el("aj-status").innerText, /acréscimo ou desconto/);
    marcar("desconto");
    await ctx._ajSalvar();
    assert.deepStrictEqual(chamadas[0], ["https://api.teste/admin/fechamento-transportadoras/ajustes",
        { mes: 9, ano: 2026, quinzena: 2, driver: "Fulano de Teste - Vila Teste", valor: "25,50", tipo: "desconto", descricao: "ajuda de custo" }]);
    assert.strictEqual(el("aj-valor").value, "", "limpa o formulário");
});
