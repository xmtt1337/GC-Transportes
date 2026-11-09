// Solicitar Antecipação: entre escolher a quinzena e a nota/painel voltarem, a tela
// seguia dizendo "Selecione o mês, ano e quinzena" — o entregador achava que travou.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const skLogoFonte = require("./_sk-logo");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "antecipacoes.js"), "utf8");

function montar() {
    const els = {};
    const el = id => els[id] || (els[id] = {
        id, style: {}, innerHTML: "", value: id === "ant-mes" ? "10" : id === "ant-ano" ? "2026" : "",
        classList: { toggle() {}, remove() {}, add() {} },
    });
    let soltar;
    const resposta = new Promise(r => { soltar = r; });
    const ctx = {
        console, API: "", token: "t",
        document: { getElementById: el },
        fetch: () => resposta.then(() => ({ ok: false, json: async () => null })),
        moedaJS: v => String(v),
    };
    vm.createContext(ctx);
    vm.runInContext(skLogoFonte, ctx);
    vm.runInContext(fonte + "\n;globalThis.__ant = { selecionarQuinzenaAnt };"
        + "\n_antRenderStatusCard = () => {}; _antLimparFormMsg = () => {};", ctx);
    return { ctx, el, soltar };
}

test("escolher a quinzena mostra o Carregando no lugar do 'Selecione'", () => {
    const m = montar();
    m.ctx.__ant.selecionarQuinzenaAnt(1);
    assert.strictEqual(m.el("ant-empty").style.display, "none");
    assert.strictEqual(m.el("ant-carregando").style.display, "");
    assert.match(m.el("ant-carregando").innerHTML, /xm-carregando/);
});

test("quando a nota e o painel voltam, o Carregando sai e o conteúdo aparece", async () => {
    const m = montar();
    m.ctx.__ant.selecionarQuinzenaAnt(2);
    m.soltar();
    await new Promise(r => setImmediate(r));
    assert.strictEqual(m.el("ant-carregando").style.display, "none");
    assert.strictEqual(m.el("ant-carregando").innerHTML, "");
    assert.strictEqual(m.el("ant-content").style.display, "");
});
