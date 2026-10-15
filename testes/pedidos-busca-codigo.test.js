// Testes da busca por código no Histórico de pedidos.
//
// O bug: com o seletor em "Registrado como faltante", buscar um código que
// também tinha sido conferido mostrava SÓ o faltante. O filtro local achava a
// linha carregada e parava ali, sem perguntar ao servidor pelo rastro inteiro.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "pedidos.js"), "utf8");

function elemento() {
    return { innerHTML: "", innerText: "", value: "", style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} } };
}

function carregar(respostaServidor) {
    const els = {};
    const chamadas = [];
    const timers = [];
    const ctx = vm.createContext({
        console,
        window: {},
        document: {
            getElementById: (id) => (els[id] = els[id] || elemento()),
            querySelectorAll: () => [],
            addEventListener() {},
        },
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout() {},
        fetch: (url) => {
            chamadas.push(url);
            return Promise.resolve({ ok: respostaServidor.ok, json: () => Promise.resolve(respostaServidor.corpo) });
        },
        gcAlert() {}, skMostrar() {}, skFim() {}, mostrarTela() {},
        API: "", token: "",
    });
    vm.runInContext(fonte, ctx, { filename: "pedidos.js" });
    return { ctx, els, chamadas, timers };
}

const faltante = { codigo: "BR0000000000001", etapa: "faltante", etapa_rotulo: "Registrado como faltante", detalhe: "Shopee", usuario: "Fulano", quando: "2026-01-02T10:00:00Z" };
const conferido = { codigo: "BR0000000000001", etapa: "conferencia_operacao", etapa_rotulo: "Conferência da operação", detalhe: "Conferido em XYZ C-01", usuario: "Ciclano", quando: "2026-01-02T07:53:00Z" };

async function digitarEsperar(h, termo) {
    h.els["ped-filtro-input"] = Object.assign(elemento(), { value: termo });
    h.ctx._pedFiltrarLocal();
    for (const fn of h.timers.splice(0)) fn();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
}

test("código achado no carregado ainda busca o rastro inteiro no servidor", async () => {
    const h = carregar({ ok: true, corpo: [faltante, conferido] });
    vm.runInContext("_pedDados = " + JSON.stringify([faltante]), h.ctx);
    await digitarEsperar(h, "BR0000000000001");
    assert.strictEqual(h.chamadas.length, 1);
    assert.match(h.chamadas[0], /pedidos\/buscar\?codigo=BR0000000000001/);
    assert.match(h.els["ped-counter"].innerText, /^2 registros/);
});

test("pedaço de código que o servidor não acha mantém o que o filtro local achou", async () => {
    const h = carregar({ ok: false, corpo: { error: "nunca bipado" } });
    vm.runInContext("_pedDados = " + JSON.stringify([faltante]), h.ctx);
    await digitarEsperar(h, "000000000000");
    assert.strictEqual(h.chamadas.length, 1);
    assert.doesNotMatch(h.els["ped-counter"].innerText, /Nada encontrado/);
});

test("nome de pessoa (com espaço) filtra só na tela, sem ir ao servidor", async () => {
    const h = carregar({ ok: true, corpo: [] });
    vm.runInContext("_pedDados = " + JSON.stringify([faltante]), h.ctx);
    await digitarEsperar(h, "Fulano de Tal");
    assert.strictEqual(h.chamadas.length, 0);
});
