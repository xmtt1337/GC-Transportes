// Meus Fechamentos (fechamento do sistema): o que o entregador vê. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SK_LOGO = require("./_sk-logo");

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
    vm.runInContext(SK_LOGO, ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-entregador.js"), "utf8")
        + "\n;this._fsPessoasTeste = (n) => _fsPessoas.findIndex(p => p.nome === n);", ctx);
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

const PESSOAS = {
    insucessos: [
        { dia: "2026-09-21", tipo: "Onhold", transportadora: "Shopee Caçador", codigo: "BRX", pessoa: "Ana Pessoa" },
        { dia: "2026-09-21", tipo: "Atrasado", transportadora: "Imile", codigo: "I9", pessoa: "Bia Pessoa" },
        { dia: "2026-09-21", tipo: "Acareação", transportadora: "Loggi", codigo: "PNR1", pessoa: "Ana Pessoa" }],
    pacotes: [
        { transportadora: "Shopee Caçador", codigo: "BR1", data_entrega: "21/09/2026", perf_dia: "21/09/2026", valor_motorista: 2.5, pessoa: "Ana Pessoa" },
        { transportadora: "Shopee Caçador", codigo: "BR2", data_entrega: "22/09/2026", perf_dia: "22/09/2026", valor_motorista: 2.5, pessoa: "Ana Pessoa" },
        { transportadora: "Imile", codigo: "I2", data_entrega: "21/09/2026", perf_dia: "21/09/2026", valor_motorista: 2, pessoa: "Bia Pessoa" },
        { transportadora: "Imile", codigo: "I3", data_entrega: "21/09/2026", perf_dia: "21/09/2026", valor_motorista: 1, pessoa: null }],
};
function porUsuario(ctx, extra) {
    const D2 = { ...JSON.parse(JSON.stringify(D)), insucessos: PESSOAS.insucessos, ...extra };
    ctx._fsRender(D2);
    Object.assign(ctx, { API: "", token: "t", _fMes: 9, _fAno: 2026, _fQuinzena: 2,
        fetch: async () => ({ ok: true, json: async () => ({ pacotes: PESSOAS.pacotes }) }) });
}

test("Geral e Por usuário: a tela vira o fechamento das pessoas marcadas", async () => {
    const { ctx, el, modal } = carregar();
    porUsuario(ctx);
    const tela = () => el("fech-sistema").innerHTML;
    assert.match(tela(), /class="active" onclick="_fsTrocarVisao\('geral'\)"/);
    assert.match(tela(), /Ticket Log/, "Geral é o fechamento do entregador");
    assert.doesNotMatch(tela(), /_fsMarcarPessoa/);

    ctx._fsTrocarVisao("usuario");
    assert.match(tela(), /Carregando os pedidos/);
    await new Promise(r => setImmediate(r));
    assert.doesNotMatch(tela(), /Ticket Log/, "descontos são do entregador");
    assert.match(tela(), /veja em Geral/);
    const linha = (nome) => tela().replace(/\s+/g, " ").match(new RegExp(nome + '</td> <td class="num">([^<]+)</td><td class="num">([^<]+)</td><td class="num">([^<]+)</td> <td class="num">([^<]+)</td><td class="num">([^<]+)</td>')).slice(1).join(" | ").replace(/\u00a0/g, " ");
    assert.strictEqual(linha("Ana Pessoa"), "2 | R$ 5,00 | R$ 2,50 | 1 | 1");
    assert.strictEqual(linha("Bia Pessoa"), "1 | R$ 2,00 | R$ 2,00 | 1 | 0");
    assert.strictEqual(linha("Sem usuário"), "1 | R$ 1,00 | R$ 1,00 | 0 | 0");
    assert.ok(tela().indexOf("Ana Pessoa") < tela().indexOf("Bia Pessoa"), "quem mais recebeu vem primeiro");
    assert.match(tela(), /Valor<\/span><b>R\$ 8,00<\/b>/, "ninguém marcado: todos");

    ctx._fsMarcarPessoa(1);   // Bia
    assert.match(tela(), /Valor<\/span><b>R\$ 2,00<\/b>/);
    assert.match(tela(), /<div class="pt-header">Imile<\/div>/);
    assert.doesNotMatch(tela(), /<div class="pt-header">Shopee<\/div>/, "só as transportadoras dela");
    assert.doesNotMatch(tela(), /_fsAbrirDia\('2026-09-22'\)/, "só os dias dela");
    assert.match(tela(), /_fsAbrirDia\('2026-09-21'\)/);
    ctx._fsMarcarPessoa(0);   // Ana junto
    assert.match(tela(), /Valor<\/span><b>R\$ 7,00<\/b>/);
    assert.match(tela(), /_fsAbrirDia\('2026-09-22'\)/);

    ctx._fsMarcarPessoa(1);   // só a Ana
    ctx._fsAbrirDia("2026-09-21");
    assert.match(modal.innerHTML, /21\/09 seg · Ana Pessoa/);
    assert.match(modal.innerHTML, /Valor<\/span><b>R\$ 2,50<\/b>/, "o dia dela");
    assert.match(modal.innerHTML, /Entregues 1<\/button>/);
    assert.match(modal.innerHTML, /BR1/);
    assert.doesNotMatch(modal.innerHTML, /I2/);
    ctx._fsMostrarDia("2026-09-21", "atrasados");
    assert.match(modal.innerHTML, /BRX/);
    assert.doesNotMatch(modal.innerHTML, /I9/);
    ctx._fsMostrarDia("2026-09-21", "pnr");
    assert.match(modal.innerHTML, /PNR1/);

    ctx._fsTrocarVisao("geral");
    ctx._fsAbrirDia("2026-09-21");
    assert.match(modal.innerHTML, /Entregues 149<\/button>/, "Geral ignora a seleção");
    assert.match(modal.innerHTML, /<span>Performance<\/span>/);
});

test("Por usuário: tarifa mínima por PNR só no dia de quem passou; quinzena nova volta pro Geral", async () => {
    const { ctx, el } = carregar();
    const perf = JSON.parse(JSON.stringify(D.performance));
    perf.dias[0] = { ...perf.dias[0], tarifa_minima: true, pacotes_minima: 1, usuarios_minima: "Bia Pessoa" };
    porUsuario(ctx, { performance: perf });
    ctx._fsTrocarVisao("usuario");
    await new Promise(r => setImmediate(r));
    assert.match(el("fech-sistema").innerHTML, /Tarifa mínima por PNR/);
    ctx._fsMarcarPessoa(0);   // Ana não passou
    assert.doesNotMatch(el("fech-sistema").innerHTML, /Tarifa mínima por PNR/);
    ctx._fsRender(D);
    assert.match(el("fech-sistema").innerHTML, /Ticket Log/);
});

test("Por usuário: erro ao buscar os pedidos aparece e dá pra tentar de novo", async () => {
    const { ctx, el } = carregar();
    porUsuario(ctx);
    let falha = true;
    const ok = ctx.fetch;
    ctx.fetch = async (...a) => { if (falha) return { ok: false, json: async () => ({ error: "Sem NF" }) }; return ok(...a); };
    ctx._fsTrocarVisao("usuario");
    await new Promise(r => setImmediate(r));
    assert.strictEqual(el("fs-usuario").innerHTML, "Sem NF");
    falha = false;
    ctx._fsTrocarVisao("geral");
    ctx._fsTrocarVisao("usuario");
    await new Promise(r => setImmediate(r));
    assert.match(el("fech-sistema").innerHTML, /Ana Pessoa/);
});

test("POD: dia com desconto aparece como perda, com o valor e o usuário", () => {
    const { ctx, el, modal } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.faixas = { semana: [{ ate: 100, valor: 2.5 }], domingo: [{ ate: 100, valor: 2.6 }] };
    Object.assign(D2.performance.dias[1], { pod_pacotes: 10, pod_desconto: 2, pod_usuarios: "fulano.login" });
    ctx._fsRender(D2);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /fs-dia-alerta" onclick="_fsAbrirDia\('2026-09-22'\)/);
    assert.match(html, /−R\$\s2,00 com POD/);
    ctx._fsMostrarDia("2026-09-22", "atrasados");
    assert.match(modal.innerHTML, /Perdido com POD/);
    assert.match(modal.innerHTML, /10 entrega\(s\) Shopee com desconto \(fulano\.login\)/);
});

test("POD: na visão Por usuário só aparece no dia de quem teve desconto", async () => {
    const { ctx, el } = carregar();
    porUsuario(ctx);
    ctx.fetch = async () => ({ ok: true, json: async () => ({ pacotes: [
        { transportadora: "Shopee", codigo: "BR1", data_entrega: "21/09/2026", perf_dia: "21/09/2026", valor_motorista: 2.3, desconto_pod: 0.2, pessoa: "Ana Pessoa" },
        { transportadora: "Imile", codigo: "I2", data_entrega: "21/09/2026", perf_dia: "21/09/2026", valor_motorista: 2.5, desconto_pod: 0, pessoa: "Bia Pessoa" }] }) });
    ctx._fsTrocarVisao("usuario");
    await new Promise(r => setImmediate(r));
    assert.match(el("fech-sistema").innerHTML, /−R\$\s0,20 com POD/);
    ctx._fsMarcarPessoa(0);   // quem mais recebeu: Bia, sem POD
    assert.doesNotMatch(el("fech-sistema").innerHTML, /com POD/);
});

test("POD: mostra a semana, o Good Pod e quanto saiu; na visão Por usuário só das pessoas marcadas", async () => {
    const { ctx, el } = carregar();
    const pod = { meta: 80, semanas: [
        { semana_inicio: "2026-10-19", semana_fim: "2026-10-25", usuario: "ana.login", cidade: "Vila A", good: 72.5, pacotes: 100, valor: 20, pessoa: "Ana Pessoa" },
        { semana_inicio: "2026-10-19", semana_fim: "2026-10-25", usuario: "bia.login", cidade: "Vila B", good: 60, pacotes: 10, valor: 2, pessoa: "Bia Pessoa" }] };
    porUsuario(ctx, { pod });
    const tela = () => el("fech-sistema").innerHTML;
    assert.match(tela(), /Desconto por POD/);
    assert.match(tela(), /Semana de 19\/10 a 25\/10/);
    assert.match(tela(), /72,50%<\/b> \(meta 80,00%\) · Vila A · 100 entrega\(s\) Shopee/);
    ctx._fsTrocarVisao("usuario");
    await new Promise(r => setImmediate(r));
    ctx._fsMarcarPessoa(ctx._fsPessoasTeste("Bia Pessoa"));
    assert.match(tela(), /bia\.login/);
    assert.doesNotMatch(tela(), /ana\.login/);
});

test("POD: sem desconto na quinzena não mostra o bloco", () => {
    const { ctx, el } = carregar();
    ctx._fsRender(D);
    assert.doesNotMatch(el("fech-sistema").innerHTML, /Desconto por POD/);
});

test("Ticket Log: cada abastecimento com data, hora, posto, litros, R$/litro, cartão e aviso; planilha com a aba", () => {
    const { ctx, el } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.ticketlog = [
        { data: "2026-09-21", hora: "08:46", posto: "POSTO TESTE", cidade: "VILA TESTE - SC", servico: "GASOLINA COMUM", litros: 10, valor_litro: 6.39,
          valor: 63.9, km: 1000, placa: "AAA0001", matricula: "12", cartao_final: "0001", aviso: null },
        { data: "2026-09-22", hora: null, posto: null, cidade: null, servico: null, litros: null, valor_litro: null,
          valor: 16.1, km: null, placa: null, matricula: null, cartao_final: null, aviso: "Abastecido com o seu cartão, mas com a matrícula de outra pessoa." }];
    ctx._fsRender(D2);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /Abastecimentos Ticket Log/);
    assert.match(html, /2 abastecimentos · 10,00 L · R\$ 80,00/);
    assert.match(html, /21\/09\/2026 às 08:46/);
    assert.match(html, /GASOLINA COMUM · 10,00 L · R\$ 6,39\/L · VILA TESTE - SC/);
    assert.match(html, /Cartão final 0001 · Placa AAA0001 · Matrícula 12 · Km 1\.000/);
    assert.match(html, /matrícula de outra pessoa/);
    const aba = ctx._fsAbaTicketlog(D2.ticketlog);
    assert.strictEqual(aba.length, 3);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(aba[1].slice(0, 8))), ["21/09/2026", "08:46", "POSTO TESTE", "VILA TESTE - SC", "GASOLINA COMUM", 10, 6.39, 63.9]);
    ctx._fsRender(D);
    assert.doesNotMatch(el("fech-sistema").innerHTML, /Abastecimentos Ticket Log/, "sem abastecimento, sem bloco");
});

test("fora do prazo pela cidade: conta do pacote (cidade − 40% = recebeu), dias de atraso, não entregue e cidade sem parceiro", () => {
    const { ctx, el } = carregar();
    const D2 = JSON.parse(JSON.stringify(D));
    D2.fora_prazo_cidade = [
        { transportadora: "Imile", codigo: "I9", cidade: "Vila Teste", deveria: "2026-09-21", entregue: "2026-09-23",
          valor_cidade: 3, desconto: 1.2, adicional_peso: 0, recebeu: 1.8, parceiro: true, desconto_pct: 40 },
        { transportadora: "Anjun", codigo: "A1", cidade: "Morro Falso", deveria: "2026-09-21", entregue: "2026-09-22",
          valor_cidade: 2.5, desconto: 0, adicional_peso: 1, recebeu: 3.5, parceiro: false, desconto_pct: 40 },
        { transportadora: "Imile", codigo: "I10", cidade: "Vila Teste", deveria: "2026-09-21", entregue: null,
          valor_cidade: 0, desconto: 0, adicional_peso: 0, recebeu: 0, parceiro: true, desconto_pct: 40 }];
    ctx._fsRender(D2);
    const html = el("fech-sistema").innerHTML;
    assert.match(html, /Entregas fora do prazo \(valor pela cidade\)/);
    assert.match(html, /3 pacotes fora do prazo \(1 não entregue\)/);
    assert.match(html, /R\$ 1,20<\/b> de desconto/);
    assert.match(html, /Prazo 21\/09\/2026 · entregue 23\/09\/2026 \(2 dias depois\)/);
    assert.match(html, /Cidade R\$ 3,00<\/span>\s*<span class="fs-neg">− 40% atraso R\$ 1,20<\/span>[\s\S]*?= <b>R\$ 1,80<\/b>/);
    assert.match(html, /sem desconto \(cidade sem parceiro\)[\s\S]*?\+ peso R\$ 1,00[\s\S]*?= <b>R\$ 3,50<\/b>/);
    assert.match(html, /Prazo 21\/09\/2026 · não entregue[\s\S]*?Não pago/);
    ctx._fsRender(D);
    assert.doesNotMatch(el("fech-sistema").innerHTML, /Entregas fora do prazo/, "sem pacote, sem bloco");
});
