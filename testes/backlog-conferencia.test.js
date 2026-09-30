// Testes das colunas "Conferência" / "Última conferência" do Backlog.
//
// O servidor já resolve tudo (modules/stuck-backlog/conferencia-entregador.js): traduz o
// "Último usuário" do arquivo da Shopee pro nome_sistema e devolve a ÚLTIMA conferência
// daquele entregador, de QUALQUER pedido — aqui só se desenha `r.conferencia_em`. O que se
// protege é a tela não inventar informação que o servidor não mandou: sem `conferencia_em`,
// nenhuma das duas colunas pode afirmar "Sim" nem uma data.
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
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const ACESSOR = `;globalThis.__b = { set regs(v) { _sstbRegistros = v; } };`;

function carregar() {
    const els = {};
    const el = (id) => els[id] || (els[id] = {
        id, innerHTML: "", innerText: "", value: "", style: {},
        classList: { add() {}, remove() {}, toggle() {} },
    });
    const ctx = vm.createContext({
        console,
        window: {},
        document: { getElementById: el },
        gcAlert() {}, skMostrar() {}, skFim() {}, mostrarTela() {},
        fetch: () => new Promise(() => {}),
        API: "", token: "",
    });
    vm.runInContext(fonteWhatsapp + fonteAtivo + fonte + ACESSOR, ctx, { filename: "shopee-stuck-backlog.js" });
    return { ctx, els, b: ctx.__b };
}

const reg = (id, extra = {}) => ({ shipment_id: id, dias: 2, latest_status: "Hub_Assigned", latest_user_name: "u", resposta: "sem_ativo", ...extra });

test("linha com conferência: 'Sim' e a data em Brasília", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1", { conferencia_em: "2026-09-28T12:00:00.000Z" })];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(/data-label="Conferência">Sim</.test(tbody));
    assert.ok(/data-label="Última conferência">28\/09 09:00</.test(tbody), tbody);
});

test("linha sem conferência nenhuma: as duas colunas mostram o traço apagado, não 'Não'/data vazia", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1")]; // sem conferencia_em
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(/data-label="Conferência"><span class="sstb-resp-vazio">—<\/span><\/td>/.test(tbody), tbody);
    assert.ok(/data-label="Última conferência"><span class="sstb-resp-vazio">—<\/span><\/td>/.test(tbody), tbody);
});

test("duas linhas do MESMO entregador mostram a mesma última conferência", () => {
    const { b, els, ctx } = carregar();
    b.regs = [
        reg("A1", { latest_user_name: "ana", conferencia_em: "2026-09-28T12:00:00.000Z" }),
        reg("A2", { latest_user_name: "ana", conferencia_em: "2026-09-28T12:00:00.000Z" }),
    ];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.strictEqual((tbody.match(/28\/09 09:00/g) || []).length, 2);
});

test("cabeçalho: 'Conferência' e 'Última conferência' ficam entre 'Último usuário' e 'Resposta do cliente'", () => {
    const tela = html.slice(html.indexOf('id="tela-shopee-stuck-backlog"'));
    const cab = tela.slice(tela.indexOf("<thead>"), tela.indexOf("</thead>"));
    const usuario = cab.indexOf("Último usuário");
    const conferencia = cab.indexOf(">Conferência<");
    const quando = cab.indexOf("Última conferência");
    const resposta = cab.indexOf("Resposta do cliente");
    assert.ok(usuario < conferencia && conferencia < quando && quando < resposta, cab);
});

test("relatório: Sim/Não e a data em Brasília, na mesma posição das outras colunas de contexto", () => {
    const { ctx } = carregar();
    const registros = [
        reg("A1", { conferencia_em: "2026-09-28T12:00:00.000Z" }),
        reg("A2"),
    ];
    const { pedidos } = ctx._sstbMontarRelatorio(registros);
    const a1 = pedidos.find((p) => p["Pedido"] === "A1");
    const a2 = pedidos.find((p) => p["Pedido"] === "A2");
    assert.strictEqual(a1["Conferência"], "Sim");
    assert.strictEqual(a1["Última conferência"], "28/09/2026, 09:00");
    assert.strictEqual(a2["Conferência"], "Não");
    assert.strictEqual(a2["Última conferência"], "", "sem conferência, sem data - vazio, não 'Invalid Date'");
});
