// Testes das colunas "Conferente" / "Última conferência do entregador" do Backlog.
//
// O servidor já resolve tudo (modules/stuck-backlog/conferencia-entregador.js): traduz o
// "Último usuário" do arquivo da Shopee pro nome_sistema e devolve o CONFERENTE
// (conferencia_por) e a ÚLTIMA conferência (conferencia_em) daquele entregador, de QUALQUER
// pedido — aqui só se desenha. Sem "Sim/Não" de propósito: é redundante com "Última
// conferência" já dizer se há data ou não (pedido do usuário, 30/09/2026).
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

test("linha com conferência: o nome do conferente e a data, em Brasília", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1", { latest_user_name: "Ana", conferencia_por: "Ana da Silva - Caçador", conferencia_em: "2026-09-28T12:00:00.000Z" })];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(/data-label="Conferente"><span title="[^"]*">Ana da Silva - Caçador<\/span>/.test(tbody), tbody);
    assert.ok(/data-label="Última conferência do entregador"><span title="[^"]*">28\/09 09:00<\/span>/.test(tbody), tbody);
});

test("célula deixa claro que a data é do ENTREGADOR (nomeado no tooltip), não deste pedido", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1", { latest_user_name: "Ana da Silva", conferencia_por: "Ana da Silva - Caçador", conferencia_em: "2026-09-28T12:00:00.000Z" })];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(tbody.includes('title="Conferência de Ana da Silva — em qualquer pedido dele, não só este"'), tbody);
});

test("linha sem conferência nenhuma: as duas colunas mostram o traço apagado, não um nome/data vazia", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("A1")]; // sem conferencia_por/conferencia_em
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(/data-label="Conferente"><span class="sstb-resp-vazio">—<\/span><\/td>/.test(tbody), tbody);
    assert.ok(/data-label="Última conferência do entregador"><span class="sstb-resp-vazio">—<\/span><\/td>/.test(tbody), tbody);
});

test("duas linhas do MESMO entregador mostram o mesmo conferente e a mesma última conferência", () => {
    const { b, els, ctx } = carregar();
    b.regs = [
        reg("A1", { latest_user_name: "ana", conferencia_por: "Ana da Silva - Caçador", conferencia_em: "2026-09-28T12:00:00.000Z" }),
        reg("A2", { latest_user_name: "ana", conferencia_por: "Ana da Silva - Caçador", conferencia_em: "2026-09-28T12:00:00.000Z" }),
    ];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.strictEqual((tbody.match(/Ana da Silva - Caçador/g) || []).length, 2);
    assert.strictEqual((tbody.match(/28\/09 09:00/g) || []).length, 2);
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

test("cabeçalho: nenhuma coluna de Sim/Não — é redundante com 'Última conferência' já ter data ou não", () => {
    const tela = html.slice(html.indexOf('id="tela-shopee-stuck-backlog"'));
    const cab = tela.slice(tela.indexOf("<thead>"), tela.indexOf("</thead>"));
    assert.ok(!cab.includes("Conferência do entregador"), "essa coluna foi substituída por 'Conferente'");
});

test("cabeçalho: o tooltip de 'Última conferência do entregador' deixa claro que é do ENTREGADOR, não do pedido", () => {
    const tela = html.slice(html.indexOf('id="tela-shopee-stuck-backlog"'));
    const cab = tela.slice(tela.indexOf("<thead>"), tela.indexOf("</thead>"));
    assert.match(cab, /title="[^"]*ENTREGADOR[^"]*"[^>]*>Última conferência do entregador/);
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
