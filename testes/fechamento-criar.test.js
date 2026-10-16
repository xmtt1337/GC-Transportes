// Criar Fechamento: o que a tela manda pro backend no upload.
//
// O relatório da Shopee tem dezenas de colunas e dezenas de milhares de linhas; a tela
// manda só as colunas que o backend sabe ler (lista vinda de GET /config). Se o filtro
// comparar nome de coluna diferente do backend (acento, caixa), a coluna some no caminho
// e o upload falha com "coluna não encontrada" mesmo o arquivo tendo ela.
// Dados de teste inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const ctx = { console, API: "https://api.teste", token: "tok" };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-criar.js"), "utf8"), ctx);
    return ctx;
}

test("filtro de colunas ignora acento e caixa, como o backend", () => {
    const ctx = carregar();
    const grid = [
        ["Código", "Lixo", "USUÁRIO", "Data Atribuição"],
        ["P1", "x", "fulano", "2026-10-01"],
    ];
    const r = ctx._cfSoColunasUteis(grid, ["Codigo", "Usuario", "Data atribuicao"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.posicoes)), [0, 2, 3]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.grid)), [
        ["Código", "USUÁRIO", "Data Atribuição"],
        ["P1", "fulano", "2026-10-01"],
    ]);
});

test("linha mais curta que o cabeçalho não vira undefined", () => {
    const ctx = carregar();
    const r = ctx._cfSoColunasUteis([["Codigo", "Usuario"], ["P1"]], ["Codigo", "Usuario"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.grid[1])), ["P1", ""]);
});

test("as 5 transportadoras da planilha de precificação têm card", () => {
    const ctx = carregar();
    assert.deepStrictEqual(
        JSON.parse(vm.runInContext("JSON.stringify(_CF_TRANSPORTADORAS.map(t => t.label))", ctx)),
        ["Shopee Xpress", "Loggi", "Anjun", "Imile", "Total Express"]);
});

test("coluna pela letra (#S, #AG) entra mesmo sem nome reconhecido", () => {
    const ctx = carregar();
    const cab = Array.from({ length: 34 }, (_, i) => "X" + i);
    cab[0] = "Waybill No";
    const r = ctx._cfSoColunasUteis([cab], ["Waybill No", "#S", "#AG"]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.posicoes)), [0, 18, 32]);
});

// ── Card de conversão de nome (clique no nome em "Usuário sem conversão de nome") ──
function carregarComDom(respostaFetch) {
    const els = new Map();
    const el = (id) => {
        if (!els.has(id)) els.set(id, { id, value: "", innerText: "", innerHTML: "", disabled: false, remove() { els.delete(id); } });
        return els.get(id);
    };
    const chamadas = [];
    const ctx = {
        console, API: "https://api.teste", token: "tok", setTimeout, clearTimeout,
        document: { getElementById: (id) => (els.has(id) ? els.get(id) : null) },
        fetch: async (url, opts) => { chamadas.push({ url, opts }); return respostaFetch(url); },
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-criar.js"), "utf8"), ctx);
    return { ctx, el, chamadas };
}

async function salvarCom(status) {
    const t = carregarComDom(async () => ({ ok: status === 200, status, json: async () => ({ error: "x" }) }));
    vm.runInContext(`_cfNomesPend = [{ nome: "fulano.teste", qtd: 3, feito: null }]`, t.ctx);
    t.el("cf-conv").value = "";
    t.el("cf-conv-input").value = "  Fulano de Teste - Vila Teste ";
    t.el("cf-conv-status"); t.el("cf-conv-salvar"); t.el("cf-nomes-pend"); t.el("cf-acao-status");
    t.ctx._cfSalvarConversao(0);
    await new Promise((r) => setTimeout(r, 10));
    return t;
}

test("salvar conversão manda o par pro endpoint da Conversão de nomes e marca o nome como feito", async () => {
    const t = await salvarCom(200);
    assert.strictEqual(t.chamadas.length, 1);
    assert.strictEqual(t.chamadas[0].url, "https://api.teste/admin/nomes-padrao");
    assert.strictEqual(t.chamadas[0].opts.method, "POST");
    assert.deepStrictEqual(JSON.parse(t.chamadas[0].opts.body), { nome_origem: "fulano.teste", nome_sistema: "Fulano de Teste - Vila Teste" });
    assert.strictEqual(vm.runInContext("_cfNomesPend[0].feito", t.ctx), "Fulano de Teste - Vila Teste");
    assert.match(t.el("cf-nomes-pend").innerHTML, /cft-tag-ok/);
});

test("par que já existia (409) conta como salvo; sem permissão (403) explica e não marca", async () => {
    const a = await salvarCom(409);
    assert.ok(vm.runInContext("_cfNomesPend[0].feito", a.ctx));
    const b = await salvarCom(403);
    assert.strictEqual(vm.runInContext("_cfNomesPend[0].feito", b.ctx), null);
    assert.match(b.el("cf-conv-status").innerText, /dev/);
});

test("nome vindo do relatório não vira HTML na tag clicável", () => {
    const ctx = carregar();
    vm.runInContext(`_cfNomesPend = [{ nome: "<img src=x onerror=alert(1)>", qtd: 1, feito: null }]`, ctx);
    const html = vm.runInContext("_cfHtmlNomesPend()", ctx);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /onclick="_cfAbrirConversao\(0\)"/);
});

test("cadastrar novo entregador: manda o nome, entra na lista e já fica escolhido", async () => {
    const t = carregarComDom(async () => ({ ok: true, status: 200, json: async () => ({ success: true, nome: "Pessoa Nova - Vila Teste" }) }));
    vm.runInContext(`_cfEntregadores = { nomes: ["Fulano de Teste - Vila Teste"], aviso: null }`, t.ctx);
    t.el("cf-novo-nome").value = " pessoa nova - vila teste ";
    t.el("cf-novo-btn"); t.el("cf-novo-status"); t.el("cf-conv-novo"); t.el("cf-conv-input"); t.el("cf-conv-sugestoes");
    t.el("cf-conv-input").focus = () => {};
    t.ctx._cfCadastrarEntregador();
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(t.chamadas[0].url, "https://api.teste/admin/fechamento-transportadoras/entregadores");
    assert.deepStrictEqual(JSON.parse(t.chamadas[0].opts.body), { nome: "pessoa nova - vila teste" });
    assert.deepStrictEqual(JSON.parse(vm.runInContext("JSON.stringify(_cfEntregadores.nomes)", t.ctx)),
        ["Fulano de Teste - Vila Teste", "Pessoa Nova - Vila Teste"]);
    assert.strictEqual(t.el("cf-conv-input").value, "Pessoa Nova - Vila Teste");
});

test("filtro de coluna: vai junto na busca de pacotes e marca o funil da coluna filtrada", () => {
    const ctx = carregar();
    vm.runInContext(`_cfTranspAtual = "anjun"; _cfColFiltros = { cidade: ["Vila Teste"] }; _cfOrdem = { coluna: "data_entrega", dir: "desc" };`, ctx);
    const p = JSON.parse(vm.runInContext("JSON.stringify(_cfParamsFiltro())", ctx));
    assert.deepStrictEqual(JSON.parse(p.filtros), { cidade: ["Vila Teste"] });
    assert.match(vm.runInContext(`_cfTh("Cidade", "cidade")`, ctx), /colf-btn ativo/);
    assert.match(vm.runInContext(`_cfTh("Entrega", "data_entrega")`, ctx), /colf-btn ativo/, "ordenada também conta como ativa");
    assert.doesNotMatch(vm.runInContext(`_cfTh("Polo", "polo")`, ctx), /ativo/);
    vm.runInContext(`_cfColFiltros = {}`, ctx);
    assert.strictEqual(JSON.parse(vm.runInContext("JSON.stringify(_cfParamsFiltro())", ctx)).filtros, undefined);
});
