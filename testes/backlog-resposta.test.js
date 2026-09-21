// Testes do Backlog: card de Total, filtro de resposta do cliente e o relatório.
//
// O que se protege aqui é o número que a tela mostra. Cada card conta um recorte
// diferente e os recortes se cruzam: com "6 dias +" marcado, os cards de resposta
// têm que contar só os de 6+; marcando "Não recebeu", os OUTROS três cards não
// podem zerar (senão a pessoa perde a visão geral no meio da análise). Erro aqui
// não derruba nada — só faz a tela dizer que 13 clientes não responderam quando
// são 40, e quem decide quem cobrar confia no número.
//
// A resposta do cliente é uma faixa fina de filtros, NÃO uma fileira de cards: a
// primeira versão pôs quatro cards grandes a mais, com título e texto, e um
// selo colorido em toda linha — e a tela ficou suja. Os testes abaixo travam o
// desenho enxuto pra ele não voltar sem alguém decidir isso de propósito.
//
// E o relatório: sempre o backlog INTEIRO, todos os dias juntos, mesmo com filtro
// marcado na tela. Um download que muda conforme o card que ficou marcado é uma
// armadilha que só aparece quando alguém confere o Excel contra a tela.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "shopee-stuck-backlog.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// As variáveis de estado são `let` no topo do arquivo: não viram propriedade do
// contexto, então quem testa entra por um acessor anexado ao mesmo script.
const ACESSOR = `
;globalThis.__b = {
  set regs(v) { _sstbRegistros = v; },
  set busca(v) { _sstbFiltro = v; },
  get dias() { return _sstbDiasSel; },
  get resp() { return _sstbRespSel; },
  set resp(v) { _sstbRespSel = v; },
};`;

/** Um contexto novo por teste: o estado do arquivo é global, e não pode vazar. */
function carregar() {
    const els = {};
    const el = (id) => els[id] || (els[id] = {
        id, innerHTML: "", innerText: "", value: "", style: {},
        classList: { add() {}, remove() {}, toggle() {} },
    });
    const chamadas = { alertas: [], planilhas: [], arquivo: null };

    const XLSX = {
        utils: {
            book_new: () => ({ abas: [] }),
            json_to_sheet: (linhas) => ({ tipo: "json", linhas }),
            aoa_to_sheet: (linhas) => ({ tipo: "aoa", linhas }),
            book_append_sheet: (wb, aba, nome) => wb.abas.push({ nome, aba }),
        },
        writeFile: (wb, nome) => { chamadas.arquivo = nome; chamadas.planilhas = wb.abas; },
    };

    const ctx = vm.createContext({
        console, XLSX,
        document: { getElementById: el },
        gcAlert: (m) => chamadas.alertas.push(m),
        skMostrar() {}, skFim() {}, mostrarTela() {},
        fetch: () => new Promise(() => {}),   // a tela não termina de carregar: só o estado interessa
        API: "", token: "",
    });
    vm.runInContext(fonte + ACESSOR, ctx, { filename: "shopee-stuck-backlog.js" });
    return { ctx, els, chamadas, b: ctx.__b };
}

const reg = (id, dias, resposta, extra = {}) => ({
    shipment_id: id, dias, latest_status: "Hub_Assigned", latest_user_name: "u", resposta, ...extra,
});

/** 7 pedidos: 2 de 1 dia, 1 de 2, 1 de 3, 3 de 6+ — e as 4 respostas. */
function fixture() {
    return [
        reg("A1", 1.2, "sem_ativo"), reg("A2", 1.9, "recebeu"), reg("B1", 2.4, "sem_resposta"),
        reg("C1", 3.0, "nao_recebeu"),
        reg("D1", 6.5, "nao_recebeu", {
            ativo_em: "2026-09-21T13:00:00.000Z", ativo_por: "Bia",
            respondido_em: "2026-09-21T15:30:00.000Z", respondido_por: "Caio",
        }),
        reg("D2", 28.3, "sem_ativo"), reg("D3", 12.0, "recebeu"),
    ];
}

/** Os números dos cards, na ordem em que aparecem na tela. */
const valores = (html) => [...html.matchAll(/nr-tile-valor">([\d.]+)</g)].map((m) => Number(m[1].replace(/\./g, "")));
/** As contagens da faixa de filtros, na ordem em que aparecem (`<b>` de cada pílula). */
const contagens = (html) => [...html.matchAll(/<b>([\d.]+)<\/b>/g)].map((m) => Number(m[1].replace(/\./g, "")));
const marcados = (html) => (html.match(/nr-tile-selecionada/g) || []).length;
const linhas = (html) => (html.match(/<tr>/g) || []).length;

// ── card de Total ────────────────────────────────────────────────────────
test("o Total soma todos os dias, de 1 a 6+, e vem antes das faixas", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbRenderizar();
    // Total, 1 dia, 2 dias, 3 dias, 4 dias, 5 dias, 6 dias +
    assert.strictEqual(JSON.stringify(valores(els["sstb-tiles"].innerHTML)), "[7,2,1,1,0,0,3]");
});

test("o Total fica marcado enquanto nenhuma faixa recorta", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbRenderizar();
    assert.strictEqual(marcados(els["sstb-tiles"].innerHTML), 1);
    assert.ok(/nr-tile-selecionada[^>]*onclick="_sstbClicarTotal\(\)"/.test(els["sstb-tiles"].innerHTML),
        "o marcado é o Total, não uma faixa");
});

test("clicar numa faixa desmarca o Total; clicar no Total tira o recorte", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbClicarFaixa("d6");
    assert.strictEqual(marcados(els["sstb-tiles"].innerHTML), 1);
    assert.ok(!/nr-tile-selecionada[^>]*_sstbClicarTotal/.test(els["sstb-tiles"].innerHTML));
    assert.strictEqual(valores(els["sstb-tiles"].innerHTML)[0], 7, "o Total continua sendo a soma dos dias");

    ctx._sstbClicarTotal();
    assert.strictEqual(b.dias, null);
    assert.strictEqual(linhas(els["sstb-tbody"].innerHTML), 7);
});

// ── cards de resposta do cliente ─────────────────────────────────────────
test("as quatro pílulas contam cada resposta, na ordem sem resposta / recebeu / não recebeu / sem ativo", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbRenderizar();
    assert.strictEqual(JSON.stringify(contagens(els["sstb-resp-filtro"].innerHTML)), "[1,2,2,2]");
    const rotulos = [...els["sstb-resp-filtro"].innerHTML.matchAll(/<\/i>([^<]+)<b>/g)].map((m) => m[1]);
    assert.strictEqual(JSON.stringify(rotulos), JSON.stringify(["Sem resposta", "Recebeu", "Não recebeu", "Sem ativo"]));
});

test("com uma faixa marcada, as pílulas de resposta contam só aquela faixa", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbClicarFaixa("d6");   // D1 não recebeu, D2 sem ativo, D3 recebeu
    assert.strictEqual(JSON.stringify(contagens(els["sstb-resp-filtro"].innerHTML)), "[0,1,1,1]");
});

test("marcar uma resposta não zera as outras pílulas", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbClicarResposta("nao_recebeu");
    assert.strictEqual(JSON.stringify(contagens(els["sstb-resp-filtro"].innerHTML)), "[1,2,2,2]",
        "cada grupo ignora o PRÓPRIO filtro");
    assert.strictEqual(linhas(els["sstb-tbody"].innerHTML), 2, "a tabela recorta: só os 2 não recebeu");
});

test("as faixas respeitam o filtro de resposta", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbClicarResposta("nao_recebeu");   // C1 (3 dias) e D1 (6+)
    assert.strictEqual(JSON.stringify(valores(els["sstb-tiles"].innerHTML)), "[2,0,0,1,0,0,1]");
});

test("clicar de novo na mesma pílula volta ao normal", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbClicarResposta("recebeu");
    assert.strictEqual(linhas(els["sstb-tbody"].innerHTML), 2);
    ctx._sstbClicarResposta("recebeu");
    assert.strictEqual(b.resp, null);
    assert.strictEqual(linhas(els["sstb-tbody"].innerHTML), 7);
});

test("a busca por pedido recorta os cards e as pílulas também", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    b.busca = "d";   // D1 D2 D3
    ctx._sstbRenderizar();
    assert.strictEqual(valores(els["sstb-tiles"].innerHTML)[0], 3);
    assert.strictEqual(JSON.stringify(contagens(els["sstb-resp-filtro"].innerHTML)), "[0,1,1,1]");
});

test("pedido sem resposta classificada não quebra a tela nem entra em nenhuma pílula", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("X1", 2.0, undefined), reg("X2", 2.0, "recebeu")];
    ctx._sstbRenderizar();
    assert.strictEqual(JSON.stringify(contagens(els["sstb-resp-filtro"].innerHTML)), "[0,1,0,0]");
    assert.strictEqual(linhas(els["sstb-tbody"].innerHTML), 2);
});

test("sair e voltar pra tela limpa o filtro de resposta", () => {
    const { b, ctx } = carregar();
    b.resp = new Set(["nao_recebeu"]);
    ctx.abrirShopeeStuckBacklog();
    assert.strictEqual(b.resp, null, "um filtro esquecido esconderia pedido sem ninguém entender por quê");
});

test("a pílula marcada fica com a classe de selecionada, só ela", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbClicarResposta("recebeu");
    const marcadas = els["sstb-resp-filtro"].innerHTML.match(/sstb-pill sel"[^>]*onclick="_sstbClicarResposta\('([a-z_]+)'\)/g) || [];
    assert.strictEqual(marcadas.length, 1);
    assert.ok(marcadas[0].includes("'recebeu'"));
});

// ── o desenho enxuto ─────────────────────────────────────────────────────
test("a resposta do cliente NÃO é uma fileira de cards: só o Total e as 6 faixas são cards", () => {
    const { b, els, ctx } = carregar();
    b.regs = fixture();
    ctx._sstbRenderizar();
    assert.ok(!html.includes('id="sstb-tiles-resp"'), "de volta os quatro cards grandes");
    assert.ok(!html.includes("sstb-secao-titulo") && !html.includes("sstb-secao-sub"),
        "de volta o título e o parágrafo explicativo em cima dos filtros");
    assert.strictEqual((els["sstb-tiles"].innerHTML.match(/class="nr-tile /g) || []).length, 7,
        "Total + 6 faixas, e mais nenhum card");
    assert.ok(!els["sstb-resp-filtro"].innerHTML.includes("nr-tile"), "a faixa de filtros não usa card");
});

test("a faixa de filtros fica em cima da tabela, não em cima dos gráficos", () => {
    const tela = html.slice(html.indexOf('id="tela-shopee-stuck-backlog"'));
    const faixa = tela.indexOf('id="sstb-resp-filtro"');
    const graficos = tela.indexOf('class="nr-graficos"');
    const tabela = tela.indexOf('id="sstb-tbody"');
    assert.ok(graficos < faixa && faixa < tabela, "cards -> gráficos -> filtros da resposta -> tabela");
});

test("'sem ativo', que é a maioria, não repete selo em toda linha da tabela", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("S1", 4.0, "sem_ativo"), reg("S2", 5.0, "sem_ativo"), reg("N1", 6.0, "nao_recebeu")];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.strictEqual((tbody.match(/sstb-resp-vazio/g) || []).length, 2, "sem ativo vira traço apagado");
    assert.strictEqual((tbody.match(/class="sstb-resp"/g) || []).length, 1, "só a linha com resposta fala");
    assert.ok(!/Sem ativo</.test(tbody), "o texto 'Sem ativo' não aparece nas linhas (fica no tooltip e no filtro)");
});

test("o texto da resposta na tabela fica na cor normal - só o pontinho é colorido", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("N1", 6.0, "nao_recebeu")];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(!/class="sstb-resp" style="color/.test(tbody), "texto colorido de volta");
    assert.ok(/<i style="background:#ef4444"><\/i>Não recebeu/.test(tbody));
});

// ── a tabela ─────────────────────────────────────────────────────────────
test("cada linha mostra a resposta do cliente com o rótulo certo", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("N1", 4.0, "nao_recebeu"), reg("S1", 4.0, "sem_resposta")];
    ctx._sstbRenderizar();
    const tbody = els["sstb-tbody"].innerHTML;
    assert.ok(/N1[\s\S]*?Não recebeu[\s\S]*?S1/.test(tbody));
    assert.ok(/S1[\s\S]*?Sem resposta/.test(tbody));
});

test("a linha tem uma célula por coluna do cabeçalho - a tabela não desalinha", () => {
    const { b, els, ctx } = carregar();
    b.regs = [reg("N1", 4.0, "recebeu")];
    ctx._sstbRenderizar();
    const linha = els["sstb-tbody"].innerHTML;
    const celulas = (linha.match(/<td[ >]/g) || []).length;

    const tela = html.slice(html.indexOf('id="tela-shopee-stuck-backlog"'));
    const cab = tela.slice(tela.indexOf("<thead>"), tela.indexOf("</thead>"));
    // `<th[ >]` e nao `<th`: senao casa tambem o proprio <thead>.
    const colunas = (cab.match(/<th[ >]/g) || []).length;
    assert.strictEqual(celulas, colunas);
});

// ── o HTML que o JS pressupõe ────────────────────────────────────────────
test("os elementos que o JS escreve existem no HTML, uma vez cada", () => {
    for (const id of ["sstb-tiles", "sstb-resp-filtro", "sstb-btn-baixar", "sstb-tbody"]) {
        const n = (html.match(new RegExp(`id="${id}"`, "g")) || []).length;
        assert.strictEqual(n, 1, `id="${id}" tem que existir exatamente uma vez (achei ${n})`);
    }
    assert.ok(html.includes('onclick="_sstbBaixar()"'), "o botão precisa chamar _sstbBaixar");
});

// ── o relatório ──────────────────────────────────────────────────────────
test("o relatório traz o backlog INTEIRO mesmo com filtros marcados na tela", () => {
    const { b, ctx, chamadas } = carregar();
    b.regs = fixture();
    ctx._sstbClicarFaixa("d1");
    ctx._sstbClicarResposta("recebeu");
    ctx._sstbBaixar();

    const pedidos = chamadas.planilhas.find((a) => a.nome === "Pedidos").aba.linhas;
    assert.strictEqual(pedidos.length, 7);
});

test("duas abas, Pedidos e Resumo, e o arquivo leva a base e o dia no nome", () => {
    const { b, els, ctx, chamadas } = carregar();
    b.regs = fixture();
    els["sstb-estacao"] = { innerText: "XPT_SC_Cacador" };
    ctx._sstbBaixar();
    assert.strictEqual(JSON.stringify(chamadas.planilhas.map((a) => a.nome)), '["Pedidos","Resumo"]');
    assert.ok(/^backlog_resposta_cliente_XPT_SC_Cacador_\d{4}-\d{2}-\d{2}\.xlsx$/.test(chamadas.arquivo), chamadas.arquivo);
});

test("os pedidos saem do mais parado pro menos, com dias inteiros e a faixa", () => {
    const { b, ctx } = carregar();
    b.regs = fixture();
    const { pedidos } = ctx._sstbMontarRelatorio(fixture());
    assert.strictEqual(JSON.stringify(pedidos.map((p) => p["Pedido"])), '["D2","D3","D1","C1","B1","A2","A1"]');
    const d1 = pedidos.find((p) => p["Pedido"] === "D1");
    assert.strictEqual(d1["Dias parado"], 6, "6.5 dias é '6 dias', como a tela mostra");
    assert.strictEqual(d1["Faixa"], "6 dias +");
});

test("cada pedido leva a resposta, quem mandou o ativo e quem registrou a resposta", () => {
    const { ctx } = carregar();
    const { pedidos } = ctx._sstbMontarRelatorio(fixture());
    const d1 = pedidos.find((p) => p["Pedido"] === "D1");
    assert.strictEqual(d1["Resposta do cliente"], "Não recebeu");
    assert.strictEqual(d1["Ativo enviado por"], "Bia");
    assert.strictEqual(d1["Resposta registrada por"], "Caio");
    const a1 = pedidos.find((p) => p["Pedido"] === "A1");
    assert.strictEqual(a1["Resposta do cliente"], "Sem ativo");
    assert.strictEqual(a1["Ativo enviado em"], "", "sem ativo, sem data - vazio, não 'Invalid Date'");
});

test("os horários saem em Brasília, não em UTC", () => {
    const { ctx } = carregar();
    const { pedidos } = ctx._sstbMontarRelatorio(fixture());
    const d1 = pedidos.find((p) => p["Pedido"] === "D1");
    // 13:00Z e 15:30Z são 10:00 e 12:30 em Brasília
    assert.strictEqual(d1["Ativo enviado em"], "21/09/2026, 10:00");
    assert.strictEqual(d1["Resposta registrada em"], "21/09/2026, 12:30");
});

test("o relatório não leva telefone nem nome do cliente", () => {
    const { ctx } = carregar();
    const { pedidos } = ctx._sstbMontarRelatorio(fixture());
    const colunas = Object.keys(pedidos[0]).join("|").toLowerCase();
    assert.ok(!/telefone|numero|número|cliente,|nome do cliente|cpf/.test(colunas.replace("resposta do cliente", "")),
        "o relatório circula por e-mail e planilha: o código do pedido basta");
});

test("o Resumo cruza dias parado x resposta e fecha com o total de todos os dias", () => {
    const { ctx } = carregar();
    const { resumo } = ctx._sstbMontarRelatorio(fixture());
    assert.strictEqual(JSON.stringify(resumo[0]), '["Dias parado","Sem resposta","Recebeu","Não recebeu","Sem ativo","Total"]');
    assert.strictEqual(JSON.stringify(resumo[1]), '["1 dia",0,1,0,1,2]');
    assert.strictEqual(JSON.stringify(resumo[6]), '["6 dias +",0,1,1,1,3]');
    assert.strictEqual(JSON.stringify(resumo[7]), '["Total (todos os dias)",1,2,2,2,7]');
});

test("sem backlog carregado o botão avisa e não gera arquivo", () => {
    const { b, ctx, chamadas } = carregar();
    b.regs = [];
    ctx._sstbBaixar();
    assert.strictEqual(chamadas.alertas.length, 1);
    assert.strictEqual(chamadas.arquivo, null);
});
