// Testes do botão "Reabrir conferência" (Shopee › Conferências dos entregadores,
// js/shopee-conf-entregadores.js).
//
// O que se protege:
//   - o botão só aparece pra admin e dev, e só em conferência encerrada;
//   - reabrir confirma antes e faz POST na rota da sessão certa;
//   - erro do servidor vira aviso, sem recarregar nada.
//
// Dados inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "shopee-conf-entregadores.js"), "utf8") +
    "\n;globalThis.__sce = { _sceRenderDetalhe, _sceReabrir, set det(v) { _sceDet = v; }, set lista(v) { _sceLista = v; } };";

function el() {
    return { innerHTML: "", innerText: "", style: {}, classList: { toggle() {} } };
}

function carregar({ role, resposta = { success: true } }) {
    const els = {};
    const chamadas = [];
    const avisos = [];
    const ctx = vm.createContext({
        console, setTimeout: () => 0,
        API: "https://api.teste", token: "tk",
        document: { getElementById: id => (els[id] = els[id] || el()), querySelectorAll: () => [] },
        gcConfirm: (msg, ok) => ok(),
        gcAlert: m => avisos.push(m),
        skMostrar() {}, skFim() {}, mostrarTela() {}, gcCalMontar() {},
        fetch: (url, op) => { chamadas.push({ url, op }); return Promise.resolve({ json: () => Promise.resolve(resposta) }); },
    });
    ctx.globalThis = ctx;
    ctx.window = { _gcUser: role ? { role } : null };
    vm.runInContext(fonte, ctx, { filename: "shopee-conf-entregadores.js" });
    return { api: ctx.__sce, els, chamadas, avisos };
}

const DET = (encerrada) => ({
    sessao: { id: 42, dia: "2026-10-18", alvos: ["CLUSTER TESTE"], entregador: "Entregador TESTE", encerrada_em: encerrada ? "2026-10-18T22:00:00Z" : null },
    bipagens: [], faltantes: [], total_grupo: 3,
});
const espera = () => new Promise(r => setImmediate(r));

for (const role of ["admin", "dev"]) {
    test(`${role} vê o botão em conferência encerrada`, () => {
        const { api, els } = carregar({ role });
        api.det = DET(true);
        api._sceRenderDetalhe();
        assert.strictEqual(els["sce-det-reabrir"].style.display, "");
    });
}

test("usuário comum não vê o botão", () => {
    const { api, els } = carregar({ role: "user" });
    api.det = DET(true);
    api._sceRenderDetalhe();
    assert.strictEqual(els["sce-det-reabrir"].style.display, "none");
});

test("conferência em andamento não mostra o botão nem pra dev", () => {
    const { api, els } = carregar({ role: "dev" });
    api.det = DET(false);
    api._sceRenderDetalhe();
    assert.strictEqual(els["sce-det-reabrir"].style.display, "none");
});

test("reabrir faz POST na sessão e recarrega", async () => {
    const { api, chamadas } = carregar({ role: "admin" });
    api.lista = [{ sessao_id: 42, nome: "Entregador TESTE" }];
    api.det = DET(true);
    api._sceReabrir();
    await espera(); await espera();
    assert.strictEqual(chamadas[0].url, "https://api.teste/shopee/conferencia/entregadores/sessao/42/reabrir");
    assert.strictEqual(chamadas[0].op.method, "POST");
    assert.ok(chamadas.length > 1, "recarrega detalhe e lista depois");
});

test("erro do servidor vira aviso e não recarrega", async () => {
    const { api, chamadas, avisos } = carregar({ role: "admin", resposta: { error: "Essa conferência já está aberta." } });
    api.det = DET(true);
    api._sceReabrir();
    await espera(); await espera();
    assert.deepStrictEqual(avisos, ["Essa conferência já está aberta."]);
    assert.strictEqual(chamadas.length, 1);
});
