// Deslocamentos: o que a tela manda e mostra. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, value: "", innerHTML: "", innerText: "", style: {} }); return els.get(id); };
    const ctx = { console, API: "https://api.teste", token: "tok", mostrarTela() {}, gcAlert() {}, gcConfirm() {},
        document: { getElementById: el, activeElement: null } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-deslocamentos.js"), "utf8"), ctx);
    return { ctx, el };
}

test("salvar manda entregador, km de asfalto e de chão; valores por km vão no PUT", async () => {
    const { ctx, el } = carregar();
    const chamadas = [];
    ctx.fetch = async (u, o) => { chamadas.push([u, o && o.method, o && o.body ? JSON.parse(o.body) : null]); return { ok: true, json: async () => ({ success: true, linhas: [], valores: {} }) }; };
    el("ds-q").value = "2"; el("ds-mes").value = "9"; el("ds-ano").value = "2026";
    el("ds-driver").value = "Fulano de Teste - Vila Teste"; el("ds-km-asfalto").value = "20"; el("ds-km-chao").value = "5,5";
    await ctx._dsSalvar();
    assert.deepStrictEqual(chamadas[0], ["https://api.teste/admin/fechamento-transportadoras/deslocamentos", "POST",
        { driver: "Fulano de Teste - Vila Teste", km_asfalto: "20", km_chao: "5,5", observacao: "" }]);
    el("ds-v-asfalto").value = "0,5"; el("ds-v-chao").value = "1";
    await ctx._dsSalvarValores();
    assert.deepStrictEqual(chamadas.find(c => c[1] === "PUT").slice(1), ["PUT", { asfalto: "0,5", chao: "1" }]);
});

test("lista mostra dias com entrega e o valor; avisa valor por km zerado", () => {
    const { ctx, el } = carregar();
    vm.runInContext(`_dsLinhas = [{ id: 1, driver: "Fulano de Teste - Vila Teste", km_asfalto: 20, km_chao: 5, valor_dia: 15, dias: 12, valor: 180, observacao: "" }]`, ctx);
    ctx._dsRender({ asfalto: 0, chao: 0 });
    const html = el("ds-lista").innerHTML;
    assert.match(html, /Valor por km ainda zerado/);
    assert.match(html, /180,00/);
    assert.match(html, />12</);
});
