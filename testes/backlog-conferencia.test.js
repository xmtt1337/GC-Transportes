// Testes das colunas "Conferente" / "Última conferência do entregador" do Backlog.
//
// O servidor já resolve tudo (modules/stuck-backlog/conferencia-entregador.js): devolve
// quem conferiu ESTE pedido como entregador (conferencia_por) e quando (conferencia_em) —
// o mesmo evento "Conferência do entregador" que já aparece no Histórico do pedido. Aqui só
// se desenha. NÃO é a última conferência do entregador em qualquer pacote — essa era a
// versão anterior e o dado mentia (achado em produção: "Samuel Mendes Guimaraes" bipou vinte
// OUTROS pacotes e a coluna passou a mostrar a hora desses, não a do pedido que estava aberto).
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

test("pedido conferido: o nome do conferente e a data, em Brasília", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1", { conferencia_por: "Ana da Silva - Caçador", conferencia_em: "2026-09-28T12:00:00.000Z" })];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(/data-label="Conferente"><span title="[^"]*">Ana da Silva - Caçador<\/span>/.test(tbody), tbody);
    assert.ok(/data-label="Última conferência do entregador"><span title="[^"]*">28\/09 09:00<\/span>/.test(tbody), tbody);
});

test("célula: o tooltip fala do PEDIDO (não menciona 'qualquer pedido')", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1", { conferencia_por: "Ana da Silva - Caçador", conferencia_em: "2026-09-28T12:00:00.000Z" })];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(tbody.includes('title="Ana da Silva - Caçador conferiu este pedido como entregador"'), tbody);
    assert.ok(!tbody.includes("qualquer pedido"), "não pode mais sugerir que a data é de outro pacote");
});

test("pedido nunca conferido por entregador: as duas colunas mostram o traço apagado", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1")]; // sem conferencia_por/conferencia_em
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(/data-label="Conferente"><span class="sstb-resp-vazio">—<\/span><\/td>/.test(tbody), tbody);
    assert.ok(/data-label="Última conferência do entregador"><span class="sstb-resp-vazio">—<\/span><\/td>/.test(tbody), tbody);
});

test("dois pedidos do MESMO 'Último usuário' podem mostrar conferências DIFERENTES (é por pedido, não por entregador)", () => {
    // Era exatamente o inverso disso que causava o bug: a versão anterior fazia as duas
    // linhas mostrarem a MESMA data (a última do entregador em qualquer pacote).
    const { b, els, ctx } = carregar();
    b.regs = [
        reg("A1", { latest_user_name: "Samuel", conferencia_por: "Samuel - Caçador", conferencia_em: "2026-09-09T13:23:27.000Z" }),
        reg("A2", { latest_user_name: "Samuel" }), // mesmo entregador, mas este pedido nunca foi conferido por ele
    ];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.strictEqual((tbody.match(/09\/09 10:23/g) || []).length, 1, "só o A1 tem a data");
    const linhaA2 = tbody.slice(tbody.indexOf('data-codigo="A2"'));
    assert.ok(/data-label="Conferente"><span class="sstb-resp-vazio">—<\/span>/.test(linhaA2), "A2 não herda o conferente do A1");
    assert.ok(/data-label="Última conferência do entregador"><span class="sstb-resp-vazio">—<\/span>/.test(linhaA2), "A2 não herda a data do A1");
});

test("cabeçalho: 'Conferente' e 'Última conferência do entregador' ficam entre 'Último usuário' e 'Resposta do cliente'", () => {
    const tela = html.slice(html.indexOf('id="tela-shopee-stuck-backlog"'));
    const cab = tela.slice(tela.indexOf("<thead>"), tela.indexOf("</thead>"));
    const usuario = cab.indexOf("Último usuário");
    const conferente = cab.indexOf(">Conferente<");
    const quando = cab.indexOf("Última conferência do entregador");
    const resposta = cab.indexOf("Resposta do cliente");
    assert.ok(usuario < conferente && conferente < quando && quando < resposta, cab);
});

test("cabeçalho: o tooltip fala do PEDIDO, mesmo evento do Histórico — não de 'qualquer pedido dele'", () => {
    const tela = html.slice(html.indexOf('id="tela-shopee-stuck-backlog"'));
    const cab = tela.slice(tela.indexOf("<thead>"), tela.indexOf("</thead>"));
    assert.match(cab, /title="[^"]*ESTE pedido[^"]*Histórico[^"]*"[^>]*>Conferente/);
    assert.match(cab, /title="[^"]*ESTE pedido[^"]*Histórico[^"]*"[^>]*>Última conferência do entregador/);
    assert.ok(!cab.includes("qualquer pedido"), "não pode mais sugerir que a data é de outro pacote");
});

test("relatório: o nome do conferente e a data em Brasília, vazios (não 'Invalid Date') sem conferência", () => {
    const { ctx } = carregar();
    const registros = [
        reg("A1", { conferencia_por: "Ana da Silva - Caçador", conferencia_em: "2026-09-28T12:00:00.000Z" }),
        reg("A2"),
    ];
    const { pedidos } = ctx._sstbMontarRelatorio(registros);
    const a1 = pedidos.find((p) => p["Pedido"] === "A1");
    const a2 = pedidos.find((p) => p["Pedido"] === "A2");
    assert.strictEqual(a1["Conferente"], "Ana da Silva - Caçador");
    assert.strictEqual(a1["Última conferência do entregador"], "28/09/2026, 09:00");
    assert.strictEqual(a2["Conferente"], "");
    assert.strictEqual(a2["Última conferência do entregador"], "");
});
