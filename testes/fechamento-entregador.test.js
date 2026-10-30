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
    assert.match(html, /<div class="pt-card pt-card-shopee">/, "card da transportadora é só resumo, não abre");
    assert.doesNotMatch(html, /_fsAbrirTransp/);
    assert.match(html, /<div class="pt-header">Shopee<\/div>/);
    assert.doesNotMatch(html, /Shopee Caçador/, "sem a XPT pro entregador");
    assert.match(html, /R\$ 2,40/);              // Imile por pacote
    assert.match(html, /2 × R\$ 15,00/);          // deslocamento
    assert.match(html, /Ticket Log/);
    assert.doesNotMatch(html, /Performance do dia/, "sem o texto da performance");
});

test("tocar no dia mostra os pedidos que afetaram, com quando deveriam ser entregues", () => {
    const { ctx, modal } = carregar();
    ctx._fsRender(D);
    ctx._fsMostrarDia("2026-09-21", "atrasados");
    assert.match(modal.innerHTML, /Deveria ser entregue 21\/09 · entregue 23\/09/);
    assert.match(modal.innerHTML, /I10/);
    assert.match(modal.innerHTML, /Entregues<\/span><b>149<\/b>/, "todas as transportadoras");
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
    ctx._fsMostrarDia("2026-09-22", "pnr");
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
    assert.match(html, /Dias com perda<\/span><b>1 de 2<\/b>/);
    assert.match(html, /Pacotes na tarifa mínima<\/span><b class="fs-neg">40<\/b>/);
    assert.match(html, /Perdido com PNR<\/span><b class="fs-neg">−R\$ 32,00<\/b>/, "40 × (2,30 − 1,50)");
    assert.match(html, /_fsAbrirDia\('2026-09-21'\)/);
    assert.match(html, /fs-dia fs-clicavel" onclick="_fsAbrirDia\('2026-09-22'\)/, "dia sem perda aparece, sem destaque");
    assert.match(html, /fs-dia fs-clicavel fs-dia-alerta" onclick="_fsAbrirDia\('2026-09-21'\)/);
    assert.doesNotMatch(html, /Performance da quinzena/, "sem a média da quinzena");
    assert.match(html, /40 pacote\(s\) na tarifa mínima \(R\$ 1,50\)/);
    assert.match(html, /\(−R\$ 0,20\)/, "abaixo do valor de 100%");
    ctx._fsAbrirDia("2026-09-21");
    assert.match(modal.innerHTML, /Com 100% de performance seria R\$ 2,50 por pacote/);
    ctx._fsMostrarDia("2026-09-21", "pnr");
    assert.match(modal.innerHTML, /PNR · Loggi/);
    ctx._fsMostrarDia("2026-09-21", "atrasados");
    assert.match(modal.innerHTML, /Atrasado · Imile/, "de todas as transportadoras");
});

test("painel: dia com ocorrência mas no valor cheio aparece como 'Valor cheio'; PNR sem 'dia seguinte' nem hora", () => {
    const { ctx, el, modal } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.faixas = { semana: [{ ate: 98, valor: 2 }, { ate: 100, valor: 2.5 }], domingo: [{ ate: 100, valor: 2.6 }] };
    D2.performance.dias = [{ dia: "2026-09-21", pct: 98.17, valor: 2.5, onholds: 0, outras_atraso: 4, acareacoes: 1, pacotes_pagos: 200, total: 500 }];
    D2.insucessos = [{ dia: "2026-09-21", tipo: "Acareação", transportadora: "Shopee", codigo: "BRP", motivo: "PNR aberta no dia seguinte", ocorrencia_hora: "14:29" }];
    ctx._fsRender(D2);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /Dias com perda<\/span><b>0 de 1<\/b>/);
    assert.match(html, /fs-dia fs-clicavel" onclick="_fsAbrirDia\('2026-09-21'\)/, "sem destaque");
    assert.match(html, /<div class="fs-dia-linha fs-pos">Valor cheio<\/div>/);
    assert.match(html, /Nenhum dia com perda nesta quinzena/);
    ctx._fsMostrarDia("2026-09-21", "pnr");
    assert.doesNotMatch(modal.innerHTML, /dia seguinte/);
    assert.doesNotMatch(modal.innerHTML, /14:29/);
    assert.match(modal.innerHTML, /PNR · Shopee/);
});

test("deslocamento: card mostra os km por dia (asfalto e chão)", () => {
    const { ctx, el } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.deslocamento = { dias: 2, km_asfalto: 32.5, km_chao: 8, valor_dia: 15, valor: 30 };
    ctx._fsRender(D2);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /Asfalto por dia<\/span><span>32,5 km/);
    assert.match(html, /Chão por dia<\/span><span>8 km/);
});

test("Shopee das duas XPTs vira um card só 'Shopee', com pacotes, valor e dias somados", () => {
    const { ctx, el, modal } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.transportadoras.push({ nome: "Shopee Videira", pacotes: 40, valor: 100, por_pacote: 2.5 });
    D2.por_dia.push({ transportadora: "Shopee Videira", dia: "2026-09-21", pacotes: 40, entregues: 40, atrasados: 0, nao_entregues: 0, valor: 100 });
    ctx._fsRender(D2);
    const html = el("fech-sistema").innerHTML;
    assert.strictEqual((html.match(/<div class="pt-header">Shopee<\/div>/g) || []).length, 1);
    assert.match(html, /150 pacotes/, "110 + 40");
    assert.match(html, /R\$ 375,00/, "275 + 100");
    ctx._fsMostrarDia("2026-09-21");
    assert.match(modal.innerHTML, /Entregues<\/span><b>189<\/b>/, "100 + 40 da Shopee + 49 da Imile");
});

test("baixar relatório: pede os pedidos dele e gera a planilha com as abas do Resumo", async () => {
    const { ctx, el } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.insucessos.push({ dia: "2026-09-21", tipo: "Acareação", transportadora: "Loggi", codigo: "PNR1" });
    ctx._fsRender(D2);
    assert.match(el("fech-sistema").innerHTML, /Baixar relatório detalhado/);
    const pedidos = [], planilhas = [];
    let card = null;
    Object.assign(ctx, {
        API: "", token: "t", _fMes: 9, _fAno: 2026, _fQuinzena: 2,
        fetch: async (url) => { pedidos.push(url); return { ok: true, json: async () => ({ pacotes: [{ transportadora: "Shopee Caçador", codigo: "BR1" }, { transportadora: "Imile", codigo: "I1" }] }) }; },
        _rqAbasEntregador: (c) => { card = c; return [{ nome: "Dias", linhas: [["Dia"]] }]; },
        XLSX: { utils: { book_new: () => ({}), aoa_to_sheet: (l) => l, book_append_sheet: (wb, l, n) => planilhas.push(n) }, writeFile: (wb, nome) => planilhas.push(nome) },
    });
    el("fs-baixar").textContent = "Baixar relatório detalhado";
    await ctx._fsBaixarRelatorio();
    assert.deepStrictEqual(pedidos, ["/painel/fechamento-pedidos?mes=9&ano=2026&quinzena=2"]);
    assert.deepStrictEqual(planilhas, ["Dias", "fechamento_Q2Set.xlsx"]);
    assert.deepStrictEqual(card.pacotes.map(p => p.transportadora), ["Shopee", "Imile"], "Shopee sem a XPT, como no resto do painel");
    assert.deepStrictEqual(card.onholds.map(o => o.tipo), ["Onhold", "Acareação"], "atrasos vêm dos pacotes, não repetem");
    assert.strictEqual(el("fs-baixar").textContent, "Baixar relatório detalhado", "volta o texto do link");
});

test("abas do dia: entregues (busca os pedidos uma vez), atrasados e onholds, PNR abertas", async () => {
    const { ctx, modal } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.insucessos.push({ dia: "2026-09-21", tipo: "Acareação", transportadora: "Loggi", codigo: "PNR1" });
    ctx._fsRender(D2);
    let buscas = 0;
    Object.assign(ctx, { API: "", token: "t", _fMes: 9, _fAno: 2026, _fQuinzena: 2,
        fetch: async () => { buscas++; return { ok: true, json: async () => ({ pacotes: [
            { transportadora: "Shopee Caçador", codigo: "BR1", cidade: "Vila A", data_entrega: "21/09/2026", perf_dia: "21/09/2026" },
            { transportadora: "Imile", codigo: "I2", data_entrega: "23/09/2026", perf_dia: "21/09/2026", deve_ser_entregue: "21/09/2026", dentro_prazo: "Não" },
            { transportadora: "Imile", codigo: "I10", data_entrega: null, perf_dia: "21/09/2026" },
            { transportadora: "Shopee Caçador", codigo: "BR2", data_entrega: "22/09/2026", perf_dia: "22/09/2026" }] }) }; } });
    ctx._fsMostrarDia("2026-09-21");
    assert.match(modal.innerHTML, /Carregando os pedidos/);
    assert.match(modal.innerHTML, /Entregues 149<\/button>/);
    assert.match(modal.innerHTML, /Atrasados e onholds 3<\/button>/);
    assert.match(modal.innerHTML, /PNR abertas 1<\/button>/);
    await new Promise(r => setImmediate(r));
    assert.match(modal.innerHTML, /BR1/);
    assert.match(modal.innerHTML, /Shopee<\/span>/, "Shopee sem a XPT");
    assert.match(modal.innerHTML, /Entregue 23\/09 · deveria ser entregue 21\/09/);
    assert.doesNotMatch(modal.innerHTML, /I10/, "não entregue fica fora de Entregues");
    assert.doesNotMatch(modal.innerHTML, /BR2/, "pedido de outro dia");
    ctx._fsMostrarDia("2026-09-21", "atrasados");
    assert.match(modal.innerHTML, /Cliente ausente/);
    assert.doesNotMatch(modal.innerHTML, /PNR1/);
    ctx._fsMostrarDia("2026-09-21", "pnr");
    assert.match(modal.innerHTML, /PNR1/);
    assert.doesNotMatch(modal.innerHTML, /BRX/);
    ctx._fsMostrarDia("2026-09-21");
    assert.strictEqual(buscas, 1, "não busca de novo");
});

test("abas do dia: dia fechado antes da resposta não reabre", async () => {
    const { ctx, modal } = carregar();
    ctx._fsRender(D);
    Object.assign(ctx, { API: "", token: "t", _fMes: 9, _fAno: 2026, _fQuinzena: 2,
        fetch: async () => ({ ok: true, json: async () => ({ pacotes: [{ transportadora: "Imile", codigo: "I2", data_entrega: "21/09/2026" }] }) }) });
    ctx._fsMostrarDia("2026-09-21");
    ctx._fsFechar();
    modal.innerHTML = "fechado";
    await new Promise(r => setImmediate(r));
    assert.strictEqual(modal.innerHTML, "fechado");
});
