// Testes das colunas do relatório do Backlog sobre pedido registrado como faltante.
//
// O servidor já resolve tudo (modules/stuck-backlog/faltante.js): casa o pedido com
// pacotes_faltantes pelo código e devolve quem registrou e quando — aqui só se desenha
// `r.faltante_por`/`r.faltante_em`. É só no RELATÓRIO (baixável), não na tabela da tela.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonteWhatsapp = fs.readFileSync(path.join(__dirname, "..", "js", "whatsapp-teste.js"), "utf8");
const fonteAtivo = fs.readFileSync(path.join(__dirname, "..", "js", "stuck-ativo.js"), "utf8");
const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "shopee-stuck-backlog.js"), "utf8");

function carregar() {
    const ctx = vm.createContext({
        console,
        window: {},
        document: { getElementById: () => ({ innerHTML: "", innerText: "", value: "", style: {}, classList: { add() {}, remove() {}, toggle() {} } }) },
        gcAlert() {}, skMostrar() {}, skFim() {}, mostrarTela() {},
        fetch: () => new Promise(() => {}),
        API: "", token: "",
    });
    vm.runInContext(fonteWhatsapp + fonteAtivo + fonte, ctx, { filename: "shopee-stuck-backlog.js" });
    return { ctx };
}

const reg = (id, extra = {}) => ({ shipment_id: id, dias: 2, latest_status: "Hub_Assigned", latest_user_name: "u", resposta: "sem_ativo", ...extra });

test("pedido registrado como faltante: Sim, quem registrou e quando, em Brasília", () => {
    const { ctx } = carregar();
    const registros = [reg("A1", { faltante_por: "Patricia Dias Martins Ribeiro", faltante_em: "2026-09-23T19:18:46.000Z" })];
    const { pedidos } = ctx._sstbMontarRelatorio(registros);
    const a1 = pedidos[0];
    assert.strictEqual(a1["Registrado como faltante"], "Sim");
    assert.strictEqual(a1["Faltante registrado por"], "Patricia Dias Martins Ribeiro");
    assert.strictEqual(a1["Faltante registrado em"], "23/09/2026, 16:18");
});

test("pedido nunca registrado como faltante: Não, e os outros dois campos vazios (não 'null')", () => {
    const { ctx } = carregar();
    const { pedidos } = ctx._sstbMontarRelatorio([reg("A1")]);
    assert.strictEqual(pedidos[0]["Registrado como faltante"], "Não");
    assert.strictEqual(pedidos[0]["Faltante registrado por"], "");
    assert.strictEqual(pedidos[0]["Faltante registrado em"], "");
});
