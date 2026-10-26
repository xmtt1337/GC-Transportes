// TicketLog › Informações (só dev): o que a tela manda pro servidor. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar(resposta) {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, value: "", innerHTML: "", innerText: "", style: {} }); return els.get(id); };
    const chamadas = [];
    const ctx = {
        console, API: "https://api.teste", token: "tok",
        document: { getElementById: el, querySelectorAll: () => [] },
        fetch: async (url, opts) => { chamadas.push({ url, opts }); return { ok: true, status: 200, json: async () => resposta }; },
        gcAlert() {}, gcConfirm() {}, mostrarTela() {},
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "ticketlog-info.js"), "utf8"), ctx);
    ctx._tliCarregar = () => {};
    return { ctx, el, chamadas };
}

test("colar cartões: separa por tab e ignora linha vazia", async () => {
    const t = carregar({ success: true, gravados: 2, erros: [] });
    t.el("tli-colar").value = "Fulano - Vila\t0000000000000001\t12\tAAA0001\n\t\t\t\nBeltrano - Morro\t0000000000000002\t13\tAAA0002";
    await t.ctx._tliImportar();
    assert.deepStrictEqual(JSON.parse(t.chamadas[0].opts.body).linhas, [
        ["Fulano - Vila", "0000000000000001", "12", "AAA0001"], ["Beltrano - Morro", "0000000000000002", "13", "AAA0002"]]);
});

test("percentual vai pro servidor como digitado; adicionar manda os 4 campos", async () => {
    const t = carregar({ success: true, percentual: 40 });
    t.el("tli-pct").value = "40";
    await t.ctx._tliSalvarPct();
    assert.ok(t.chamadas[0].url.endsWith("/ticketlog-config"));
    assert.deepStrictEqual(JSON.parse(t.chamadas[0].opts.body), { percentual: "40" });
    for (const [k, v] of Object.entries({ driver: "Fulano - Vila", numero: "0000000000000001", matricula: "12", placa: "AAA0001" })) t.el("tli-novo-" + k).value = v;
    await t.ctx._tliAdicionar();
    assert.deepStrictEqual(JSON.parse(t.chamadas[1].opts.body), { driver: "Fulano - Vila", numero: "0000000000000001", matricula: "12", placa: "AAA0001" });
});
