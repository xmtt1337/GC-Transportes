// Testes dos botões de copiar da aba Faltam (Conferência › Shopee do entregador,
// js/entregador-conferencia.js).
//
// O que se protege:
//   - "Copiar os faltantes" leva tudo de uma vez, no formato que o entregador cola
//     no WhatsApp: "Pedidos faltantes:" e um código por linha;
//   - cada linha da aba Faltam tem o próprio botão, que copia só aquele código;
//   - o botão em massa só aparece na aba Faltam e com algo pra copiar;
//   - sem navigator.clipboard (celular antigo) ainda copia pelo caminho velho.
//
// Códigos inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "entregador-conferencia.js"), "utf8") +
    "\n;globalThis.__cen = { _cenTextoFaltantes, _cenCopiarFaltantes, _cenCopiarFaltante, _cenRenderizar," +
    " set faltantes(v) { _cenFaltantes = v; }, set filtro(v) { _cenFiltro = v; }, set total(v) { _cenTotalGrupo = v; } };";

function el() {
    return { innerHTML: "", innerText: "", style: {}, classList: { _c: new Set(), add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); }, contains(c) { return this._c.has(c); }, toggle() {} } };
}

function carregar({ clipboard = true } = {}) {
    const els = {};
    const copiados = [];
    const execs = [];
    const documento = {
        getElementById: id => (els[id] = els[id] || el()),
        querySelectorAll: () => [],
        createElement: () => ({ value: "", style: {}, setAttribute() {}, select() {}, remove() {} }),
        body: { appendChild() {} },
        execCommand: cmd => { execs.push(cmd); return true; },
    };
    const ctx = vm.createContext({
        console, setTimeout: () => 0, clearTimeout() {},
        document: documento,
        navigator: clipboard ? { clipboard: { writeText: t => { copiados.push(t); return Promise.resolve(); } } } : {},
    });
    ctx.globalThis = ctx;
    vm.runInContext(fonte, ctx, { filename: "entregador-conferencia.js" });
    return { api: ctx.__cen, els, copiados, execs };
}

const FALT = [{ codigo: "BR2222222222222A", cidade: "Caçador" }, { codigo: "BR3333333333333B", bairro: "Centro" }];
const espera = () => new Promise(r => setImmediate(r));

test("texto em massa: cabeçalho e um código por linha", () => {
    const { api } = carregar();
    assert.strictEqual(api._cenTextoFaltantes(FALT), "Pedidos faltantes:\nBR2222222222222A\nBR3333333333333B");
});

test("Copiar os faltantes leva a lista inteira pra área de transferência", async () => {
    const { api, copiados } = carregar();
    api.faltantes = FALT;
    const btn = el();
    api._cenCopiarFaltantes(btn);
    await espera();
    assert.deepStrictEqual(copiados, ["Pedidos faltantes:\nBR2222222222222A\nBR3333333333333B"]);
    assert.strictEqual(btn.innerText, "Copiado!");
});

test("o botão de cada linha copia só aquele código", async () => {
    const { api, copiados } = carregar();
    api.faltantes = FALT;
    api._cenCopiarFaltante(el(), 1);
    await espera();
    assert.deepStrictEqual(copiados, ["BR3333333333333B"]);
});

test("aba Faltam: cada linha tem botão e o botão em massa aparece com a contagem", () => {
    const { api, els } = carregar();
    api.faltantes = FALT;
    api.total = 10;
    api.filtro = "faltam";
    api._cenRenderizar();
    const corpo = els["cen-tbody-bip"].innerHTML;
    assert.strictEqual((corpo.match(/_cenCopiarFaltante\(this,/g) || []).length, 2);
    assert.strictEqual(els["cen-copiar-faltam"].style.display, "");
    assert.strictEqual(els["cen-copiar-faltam-btn"].innerText, "Copiar os 2 faltantes");
});

test("o botão em massa some fora da aba Faltam e quando não falta nada", () => {
    const a = carregar();
    a.api.faltantes = FALT; a.api.filtro = "todos"; a.api._cenRenderizar();
    assert.strictEqual(a.els["cen-copiar-faltam"].style.display, "none");
    const b = carregar();
    b.api.faltantes = []; b.api.filtro = "faltam"; b.api._cenRenderizar();
    assert.strictEqual(b.els["cen-copiar-faltam"].style.display, "none");
});

test("sem navigator.clipboard ainda copia pelo caminho velho", () => {
    const { api, execs } = carregar({ clipboard: false });
    api.faltantes = FALT;
    const btn = el();
    api._cenCopiarFaltantes(btn);
    assert.deepStrictEqual(execs, ["copy"]);
    assert.strictEqual(btn.innerText, "Copiado!");
});
