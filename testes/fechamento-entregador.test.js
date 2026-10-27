// Meus Fechamentos (fechamento do sistema): o que o entregador vê. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const D = {
    fonte: "sistema", codigo_quinzena: "Q2Set",
    faixas: { semana: [{ ate: 95, valor: 1.5 }, { ate: 98, valor: 2 }, { ate: null, valor: 2.5 }], domingo: [{ ate: 90, valor: 1.8 }, { ate: 98, valor: 2.2 }, { ate: null, valor: 2.6 }] },
    transportadoras: [{ nome: "Shopee Caçador", pacotes: 100, valor: 250, por_pacote: 2.5 }, { nome: "Imile", pacotes: 50, valor: 120, por_pacote: 2.4 }],
    conta: { bruto: 370, acrescimos: 0, deslocamento: 30, ticketlog: 80, extravios: 0, descontos: 0, liquido: 320 },
    deslocamento: { dias: 2, valor_dia: 15, valor: 30 },
    performance: { pct: 98.67, dias: [
        { dia: "2026-09-21", shopee: 100, outras_prazo: 48, onholds: 0, outras_atraso: 2, pct: 98.67, valor: 2.5, total: 375 },
        { dia: "2026-09-22", shopee: 10, outras_prazo: 0, onholds: 0, outras_atraso: 0, pct: 100, valor: 2.5, total: 25 }] },
    insucessos: [{ dia: "2026-09-21", tipo: "Atrasado", transportadora: "Imile", codigo: "I9", deveria: "2026-09-21", entregue: "2026-09-23" },
        { dia: "2026-09-21", tipo: "Não entregue", transportadora: "Loggi", codigo: "L1", deveria: "2026-09-21", entregue: null }],
    extravios: [], ajustes: [],
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: "", style: {} }); return els.get(id); };
    const ctx = { console, document: { getElementById: el } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-entregador.js"), "utf8"), ctx);
    return { ctx, el };
}

test("mostra a conta, R$ por pacote por transportadora e a performance da quinzena", () => {
    const { ctx, el } = carregar();
    ctx._fsRender(D);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /Deslocamento \(2 dias × R\$ 15,00\)/);
    assert.match(html, /= Total a receber/);
    assert.match(html, /R\$ 320,00/);
    assert.match(html, /R\$ 2,40/);           // Imile por pacote
    assert.match(html, /98,67%<\/span> na quinzena/);
    assert.match(html, /98% ou mais: R\$ 2,50/);
    assert.doesNotMatch(html, /Acréscimos<\/span>/, "acréscimo zerado não aparece");
});

test("tocar no dia abre os pedidos que derrubaram, com quando deveriam ser entregues", () => {
    const { ctx, el } = carregar();
    ctx._fsRender(D);
    assert.doesNotMatch(el("fs-dias").innerHTML, /I9/);
    ctx._fsAlternarDia("2026-09-21");
    const html = el("fs-dias").innerHTML;
    assert.match(html, /Atrasado<\/span> · Imile · <b>I9<\/b>/);
    assert.match(html, /deveria ser entregue 21\/09, entregue 23\/09/);
    assert.match(html, /não entregue/);
    // dia sem insucesso não é clicável
    assert.doesNotMatch(html, /_fsAlternarDia\('2026-09-22'\)/);
});
