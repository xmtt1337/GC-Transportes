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

test("parcelas: prévia mostra valor da parcela e de qual a qual quinzena, virando o ano", () => {
    const { ctx, el } = carregar();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx._ajHoje(new Date(2026, 9, 20)))), { mes: 10, ano: 2026, quinzena: 2 });
    el("aj-q").value = "1"; el("aj-mes").value = "10"; el("aj-ano").value = "2026";
    el("aj-valor").value = "1.941,12"; el("aj-parcelas").value = "6";
    ctx._ajTextoParcelas();
    assert.strictEqual(el("aj-previa").innerText, "6 × R$ 323,52 · Q1Out/2026 até Q2Dez/2026");
    el("aj-valor").value = "100"; el("aj-parcelas").value = "3"; el("aj-mes").value = "12"; el("aj-q").value = "2";
    ctx._ajTextoParcelas();
    assert.strictEqual(el("aj-previa").innerText, "3 × R$ 33,33 (última R$ 33,34) · Q2Dez/2026 até Q2Jan/2027");
});

test("lançar manda quinzena, entregador, valor, tipo e descrição; sem tipo não manda", async () => {
    const { ctx, el, marcar } = carregar();
    el("aj-q").value = "2"; el("aj-mes").value = "9"; el("aj-ano").value = "2027";
    el("aj-parcelas").value = "6";
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
        { mes: 9, ano: 2027, quinzena: 2, driver: "Fulano de Teste - Vila Teste", valor: "25,50", tipo: "desconto", descricao: "ajuda de custo", parcelas: "6" }]);
    assert.strictEqual(el("aj-valor").value, "", "limpa o formulário");
});
