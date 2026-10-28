// Meus Fechamentos (fechamento do sistema): o que o entregador vê. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const D = {
    fonte: "sistema", codigo_quinzena: "Q2Set",
    transportadoras: [{ nome: "Shopee Caçador", pacotes: 110, valor: 275, por_pacote: 2.5 }, { nome: "Imile", pacotes: 50, valor: 120, por_pacote: 2.4 }],
    conta: { bruto: 395, acrescimos: 0, deslocamento: 30, ticketlog: 80, extravios: 0, descontos: 0, liquido: 345 },
    deslocamento: { dias: 2, valor_dia: 15, valor: 30 },
    performance: { pct: 98.67, dias: [
        { dia: "2026-09-21", shopee: 100, outras_prazo: 48, onholds: 1, outras_atraso: 2, pct: 98.03, valor: 2.5, total: 375 },
        { dia: "2026-09-22", shopee: 10, outras_prazo: 0, onholds: 0, outras_atraso: 0, pct: 100, valor: 2.5, total: 25 }] },
    por_dia: [
        { transportadora: "Shopee Caçador", dia: "2026-09-21", pacotes: 100, entregues: 100, atrasados: 0, nao_entregues: 0, valor: 250 },
        { transportadora: "Shopee Caçador", dia: "2026-09-22", pacotes: 10, entregues: 10, atrasados: 0, nao_entregues: 0, valor: 25 },
        { transportadora: "Imile", dia: "2026-09-21", pacotes: 50, entregues: 49, atrasados: 1, nao_entregues: 1, valor: 120 }],
    insucessos: [
        { dia: "2026-09-21", tipo: "Onhold", transportadora: "Shopee Caçador", codigo: "BRX", motivo: "Cliente ausente", ocorrencia_hora: "14:40" },
        { dia: "2026-09-21", tipo: "Atrasado", transportadora: "Imile", codigo: "I9", deveria: "2026-09-21", entregue: "2026-09-23" },
        { dia: "2026-09-21", tipo: "Não entregue", transportadora: "Imile", codigo: "I10", deveria: "2026-09-21", entregue: null }],
    extravios: [], ajustes: [],
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: "", style: {}, remove() {} }); return els.get(id); };
    const modal = { innerHTML: "" };
    const ctx = { console, document: {
        getElementById: el, querySelector: () => modal,
        createElement: () => ({ addEventListener() {}, set innerHTML(v) {}, remove() {} }),
        body: { appendChild() {} },
    } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-entregador.js"), "utf8"), ctx);
    return { ctx, el, modal };
}

test("cards como antes: transportadoras com valor/entregues/por pacote, adicionais e descontos", () => {
    const { ctx, el } = carregar();
    ctx._fsRender(D);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /pt-card pt-card-shopee fs-clicavel/);
    assert.match(html, /Shopee Caçador/);
    assert.match(html, /R\$ 2,40/);              // Imile por pacote
    assert.match(html, /2 × R\$ 15,00/);          // deslocamento
    assert.match(html, /Ticket Log/);
    assert.doesNotMatch(html, /Performance do dia/, "sem o texto da performance");
});

test("card da transportadora: dias; Shopee mostra a % e conta as ocorrências de todas as transportadoras", () => {
    const { ctx, modal } = carregar();
    ctx._fsRender(D);
    ctx._fsMostrarTransp(0);
    assert.match(modal.innerHTML, /98,03%/);
    assert.match(modal.innerHTML, /3 ocorrência\(s\)/);   // 1 onhold + 2 das outras
    assert.doesNotMatch(modal.innerHTML, /_fsMostrarDia\(0, '2026-09-22'\)/, "dia sem ocorrência não abre");
    ctx._fsMostrarTransp(1);
    assert.match(modal.innerHTML, /2 ocorrência\(s\)/);   // Imile: 1 atrasado + 1 não entregue
});

test("tocar no dia mostra os pedidos que afetaram, com quando deveriam ser entregues", () => {
    const { ctx, modal } = carregar();
    ctx._fsRender(D);
    ctx._fsMostrarDia(1, "2026-09-21");   // Imile: só os dela
    assert.match(modal.innerHTML, /Deveria ser entregue 21\/09 · entregue 23\/09/);
    assert.match(modal.innerHTML, /I10/);
    assert.doesNotMatch(modal.innerHTML, /BRX/);
    ctx._fsMostrarDia(0, "2026-09-21");   // Shopee: tudo que derrubou o dia
    assert.match(modal.innerHTML, /BRX/);
    assert.match(modal.innerHTML, /Cliente ausente · às 14:40/);
    assert.match(modal.innerHTML, /I9/);
});

test("dia com mais de 2 acareações: card mostra tarifa mínima e o dia lista as acareações de todas as transportadoras", () => {
    const { ctx, modal } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.performance.dias[1] = { ...D2.performance.dias[1], acareacoes: 3, tarifa_minima: true, valor: 2.5, pacotes_minima: 4, usuarios_minima: "fulano.login" };
    D2.insucessos.push(
        { dia: "2026-09-22", tipo: "Acareação", transportadora: "Imile", codigo: "PNR1", motivo: "PNR aberta" },
        { dia: "2026-09-22", tipo: "Acareação", transportadora: "Loggi", codigo: "PNR2", motivo: "PNR aberta" },
        { dia: "2026-09-22", tipo: "Acareação", transportadora: "Loggi", codigo: "PNR3", motivo: "PNR aberta" });
    ctx._fsRender(D2);
    ctx._fsMostrarTransp(0);
    assert.match(modal.innerHTML, /Tarifa mínima em 4 pct · 3 PNR/);
    assert.match(modal.innerHTML, /_fsMostrarDia\(0, '2026-09-22'\)/, "dia na tarifa mínima abre");
    ctx._fsMostrarDia(0, "2026-09-22");
    assert.match(modal.innerHTML, /usuário fulano\.login: 4 entrega\(s\) desse usuário ficaram na tarifa mínima/);
    assert.match(modal.innerHTML, /PNR1/);
    assert.match(modal.innerHTML, /PNR3/);
});

test("Performance por dia: resumo, só os dias com ocorrência, PNR em pacotes e em reais; tocando abre o dia com tudo", () => {
    const { ctx, el, modal } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.faixas = { semana: [{ ate: 90, valor: 1.5 }, { ate: 100, valor: 2.5 }], domingo: [{ ate: 100, valor: 1.8 }, { ate: null, valor: 2.8 }] };
    D2.performance.dias[0] = { ...D2.performance.dias[0], valor: 2.3, acareacoes: 4, tarifa_minima: true, pacotes_minima: 40, usuarios_minima: "fulano.login" };
    D2.insucessos.push({ dia: "2026-09-21", tipo: "Acareação", transportadora: "Loggi", codigo: "PNR9", motivo: "PNR aberta no dia seguinte" });
    ctx._fsRender(D2);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /Performance por dia/);
    assert.match(html, /Dias com ocorrência<\/span><b>1 de 2<\/b>/);
    assert.match(html, /Pacotes na tarifa mínima<\/span><b class="fs-neg">40<\/b>/);
    assert.match(html, /Perdido com PNR<\/span><b class="fs-neg">−R\$ 32,00<\/b>/, "40 × (2,30 − 1,50)");
    assert.match(html, /_fsAbrirDia\('2026-09-21'\)/);
    assert.doesNotMatch(html, /_fsAbrirDia\('2026-09-22'\)/, "dia sem ocorrência não aparece");
    assert.match(html, /40 pacote\(s\) na tarifa mínima \(R\$ 1,50\)/);
    assert.match(html, /\(−R\$ 0,20\)/, "abaixo do valor de 100%");
    ctx._fsAbrirDia("2026-09-21");
    assert.match(modal.innerHTML, /Com 100% de performance seria R\$ 2,50 por pacote/);
    assert.match(modal.innerHTML, /PNR · Loggi/);
    assert.match(modal.innerHTML, /Atrasado · Imile/, "de todas as transportadoras");
    assert.doesNotMatch(modal.innerHTML, /_fsMostrarTransp/, "sem voltar pra transportadora");
});
