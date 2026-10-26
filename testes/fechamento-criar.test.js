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

test("transportadoras com card (Shopee por XPT)", () => {
    const ctx = carregar();
    assert.deepStrictEqual(
        JSON.parse(vm.runInContext("JSON.stringify(_CF_TRANSPORTADORAS.map(t => t.label))", ctx)),
        ["Shopee Caçador", "Shopee Videira", "Loggi", "Anjun", "Imile", "Total Express"]);
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

test("toda coluna da tabela tem funil", () => {
    const ctx = carregar();
    const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-criar.js"), "utf8");
    for (const c of ["driver", "usuario", "codigo", "tipo_produto", "cidade", "polo", "data_atribuicao", "data_entrega",
        "deve_ser_entregue", "dentro_prazo", "peso_kg", "valor_entrega", "incentivo", "desconto", "adicional_peso", "valor_motorista"]) {
        assert.match(fonte, new RegExp(`_cfTh\\((?:"[^"]+"|sp \\? "[^"]+" : "[^"]+"), "${c}"\\)`), c);
    }
    assert.doesNotMatch(fonte, /<th>(Código|Peso|Valor|Incentivo|Desconto|Adic|Motorista)/, "nenhum <th> sem funil");
    assert.ok(ctx);
});

test("regras de prazo: salvar manda o tipo (polo/cidade) de cada linha", async () => {
    const t = carregarComDom(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    vm.runInContext(`_cfQuinzena = null; _cfRegras = [
        { tipo: "geral", escopo: "geral", t: { loggi: { sab: true, dom: true } } },
        { tipo: "polo", escopo: "Polo B", t: { anjun: { sab: false, dom: true } } },
        { tipo: "cidade", escopo: "Vila Teste", t: { anjun: { sab: true, dom: false }, imile: { sab: false, dom: false } } },
    ];`, t.ctx);
    t.el("cf-regras-salvar"); t.el("cf-regras-status");
    await t.ctx._cfSalvarRegras();
    assert.strictEqual(t.chamadas[0].opts.method, "PUT");
    assert.deepStrictEqual(JSON.parse(t.chamadas[0].opts.body).regras, [
        { tipo: "geral", escopo: "geral", transportadora: "loggi", ignorar_sabado: true, ignorar_domingo: true },
        { tipo: "polo", escopo: "Polo B", transportadora: "anjun", ignorar_sabado: false, ignorar_domingo: true },
        { tipo: "cidade", escopo: "Vila Teste", transportadora: "anjun", ignorar_sabado: true, ignorar_domingo: false },
    ]);
});

test("colunas dos relatórios: salvar manda a lista de cada campo, na ordem", async () => {
    const t = carregarComDom(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    vm.runInContext(`_cfColCfg = { transp: "imile", campos: [
        { campo: "usuario", rotulo: "Usuario", obrigatorio: "sim", nomes: ["Delivery Associate"], padrao: true },
        { campo: "data_atribuicao", rotulo: "Data", obrigatorio: "sim", nomes: ["Arrival Time", "Delivery Time"], padrao: false },
    ] }; _cfColunas = { imile: [] };`, t.ctx);
    t.el("cf-col-salvar"); t.el("cf-col-status"); t.el("cf-colunas").style = {};
    vm.runInContext("_cfColMover(1, 1)", Object.assign(t.ctx, { _cfRenderColunas() {} }));
    t.ctx._cfColSalvar();
    await new Promise((r) => setTimeout(r, 10));
    const put = t.chamadas.find((c) => c.opts && c.opts.method === "PUT");
    assert.ok(put.url.endsWith("/admin/fechamento-transportadoras/colunas"));
    assert.deepStrictEqual(JSON.parse(put.opts.body), { transportadora: "imile",
        campos: { usuario: ["Delivery Associate"], data_atribuicao: ["Delivery Time", "Arrival Time"] } });
    assert.strictEqual(vm.runInContext("_cfColunas", t.ctx), null, "upload relê a lista de colunas");
});

test("acento quebrado do relatório (CÃ³digo) volta a ser Código; texto certo não muda", () => {
    const ctx = carregar();
    ctx.TextDecoder = TextDecoder;
    assert.strictEqual(ctx._cfConsertarAcento("CÃ³digo de Barras"), "Código de Barras");
    assert.strictEqual(ctx._cfConsertarAcento("Nome do DestinatÃ¡rio"), "Nome do Destinatário");
    assert.strictEqual(ctx._cfConsertarAcento("Código de Barras"), "Código de Barras");
    assert.strictEqual(ctx._cfConsertarAcento("São José"), "São José");
});

test("ligar colunas: escolhida vai pra frente da lista; 'não tem' tira as desse arquivo", () => {
    const ctx = carregar();
    const m = {
        cabecalho: ["Código de Barras", "Pessoas", "Entregador correto", "Cidade"],
        campos: [
            { campo: "usuario", nomes: ["Entregador correto", "Usuario", "Driver"] },
            { campo: "codigo", nomes: ["Código de Barras", "Codigo"] },
            { campo: "peso_kg", nomes: ["Peso Cubado", "Peso"] },
            { campo: "cidade", nomes: ["Cidade"] },
        ],
        escolha: { usuario: "Pessoas", codigo: "Código de Barras", peso_kg: "", cidade: "" },
    };
    const r = JSON.parse(JSON.stringify(ctx._cfMapaListas(m)));
    assert.deepStrictEqual(r.usuario, ["Pessoas", "Entregador correto", "Usuario", "Driver"]);
    assert.deepStrictEqual(r.codigo, ["Código de Barras", "Codigo"], "não duplica");
    assert.deepStrictEqual(r.peso_kg, ["Peso Cubado", "Peso"], "nada desse arquivo: lista fica igual");
    assert.deepStrictEqual(r.cidade, [], "'não tem' tira a coluna que existe no arquivo");
});

test("cidade certa: só aceita cidade da planilha e grava errada → correta da Loggi", async () => {
    const t = carregarComDom(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    vm.runInContext(`_cfTranspAtual = "loggi"; _cfCidadesPend = [{ nome: "VL TESTE", qtd: 3, feito: null, tipo: "preco" }];
        _cfCidadesPlan = ["Morro Falso", "Vila Teste"]; _cfFecharConversao = () => {};`, t.ctx);
    t.el("cf-conv-status"); t.el("cf-conv-salvar"); t.el("cf-cidades-pend"); t.el("cf-acao-status");
    t.el("cf-conv-input").value = "Cidade Inventada";
    t.ctx._cfSalvarCidadeCerta(0);
    assert.strictEqual(t.chamadas.length, 0, "cidade fora da planilha não grava");
    assert.match(t.el("cf-conv-status").innerText, /planilha/);

    t.el("cf-conv-input").value = "vila teste";
    t.ctx._cfSalvarCidadeCerta(0);
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(t.chamadas[0].url.endsWith("/admin/fechamento-transportadoras/cidades-conversao"));
    assert.deepStrictEqual(JSON.parse(t.chamadas[0].opts.body), { transportadora: "loggi", cidade_errada: "VL TESTE", cidade_correta: "Vila Teste" });
    assert.strictEqual(vm.runInContext("_cfCidadesPend[0].feito", t.ctx), "Vila Teste");
    assert.match(t.el("cf-cidades-pend").innerHTML, /cft-tag-ok/);
});

test("cidade sem preço só é clicável na Loggi", () => {
    const ctx = carregar();
    const resumo = { total: 1, dentro_prazo: 0, fora_prazo: 0, valor_motorista: 0, sem_data_entrega: 0, sem_data_atribuicao: 0,
        cidades_sem_preco: [{ nome: "VL TESTE", qtd: 1 }], tipos_sem_preco: [], nomes_sem_conversao: [] };
    ctx.moedaJS = (n) => "R$ " + n;
    vm.runInContext(`_cfTranspAtual = "loggi"`, ctx);
    assert.match(ctx._cfHtmlResumo(resumo), /_cfAbrirCidadeCerta\(0\)/);
    vm.runInContext(`_cfTranspAtual = "anjun"`, ctx);
    assert.doesNotMatch(ctx._cfHtmlResumo(resumo), /_cfAbrirCidadeCerta/);
});

test("Loggi: cidade sem conversão aparece em grupo próprio, clicável", () => {
    const ctx = carregar();
    ctx.moedaJS = (n) => "R$ " + n;
    const resumo = { total: 2, dentro_prazo: 0, fora_prazo: 0, valor_motorista: 0, sem_data_entrega: 0, sem_data_atribuicao: 0,
        cidades_sem_preco: [{ nome: "VL TESTE", qtd: 1 }], cidades_sem_conversao: [{ nome: "Morro Falso", qtd: 4 }],
        tipos_sem_preco: [], nomes_sem_conversao: [] };
    vm.runInContext(`_cfTranspAtual = "loggi"`, ctx);
    const html = ctx._cfHtmlResumo(resumo);
    assert.match(html, /Cidade sem conversão/);
    assert.match(html, /_cfAbrirCidadeCerta\(0\)">VL TESTE/);
    assert.match(html, /_cfAbrirCidadeCerta\(1\)">Morro Falso/);
    vm.runInContext(`_cfTranspAtual = "anjun"`, ctx);
    assert.doesNotMatch(ctx._cfHtmlResumo(resumo), /Cidade sem conversão/);
});

test("importar cidades: mensagem explica linhas juntadas e mostra conflito (escapado)", () => {
    const ctx = carregar();
    const html = ctx._cfMsgImportCidades(8, { gravados: 4, ignorados: 1, juntadas: 3,
        conflitos: [{ erradas: ["Caçador - Centro", "<b>x</b>"], corretas: ["Caçador", "Rio das Antas"], ficou: "Rio das Antas" }] });
    assert.match(html, /8 linhas no arquivo → 4 conversões gravadas/);
    assert.match(html, /3 linhas eram a mesma cidade/);
    assert.match(html, /1 linha sem Cidade Errada/);
    assert.match(html, /ficou <b>Rio das Antas<\/b>/);
    assert.doesNotMatch(html, /<b>x<\/b>/);
});

test("conversão de cidades: lista mostra todas as grafias e a busca acha por qualquer uma", () => {
    const ctx = carregar();
    const l = { id: 1, cidade_errada: "Caçador", cidade_correta: "Caçador", variantes: ["CACADOR - SC", "Caçador"] };
    assert.match(ctx._cfLinhasConvCidades([l]), /Caçador · CACADOR - SC/);
    assert.strictEqual(ctx._cfBateConvCidade(l, "cacador - sc"), true);
    assert.strictEqual(ctx._cfBateConvCidade(l, "videira"), false);
});

test("cidade com várias grafias: tag única mostra quantas grafias e lista no title", () => {
    const ctx = carregar();
    vm.runInContext(`_cfCidadesPend = [{ nome: "Caçador", qtd: 431, variantes: ["Caçador", "Cacador", "CACADOR"], feito: null, tipo: "conv" }]`, ctx);
    const html = ctx._cfHtmlCidadesPend("conv");
    assert.match(html, /\+2 grafias/);
    assert.match(html, /title="Grafias no relatório: Caçador · Cacador · CACADOR"/);
    assert.match(html, /<b>431<\/b>/);
});

test("Shopee: KPIs de performance no lugar do prazo", () => {
    const ctx = carregar();
    ctx.moedaJS = (n) => "R$ " + n;
    const resumo = { total: 10, dentro_prazo: 0, fora_prazo: 0, valor_motorista: 20, sem_data_entrega: 0, sem_data_atribuicao: 0,
        cidades_sem_preco: [], tipos_sem_preco: [], nomes_sem_conversao: [], ceps_sem_cidade: [{ nome: "11111111", qtd: 2 }],
        performance: { entregues: 10, onholds: 1, pct: 90.91, onholds_total: 2, onholds_sem_entregador: 1 } };
    vm.runInContext(`_cfTranspAtual = "shopee_via"`, ctx);
    const html = ctx._cfHtmlResumo(resumo);
    assert.match(html, /Performance geral/);
    assert.match(html, /90,91%/);
    assert.match(html, /1 sem entregador/);
    assert.match(html, /CEP sem cidade/);
    assert.doesNotMatch(html, /Fora do prazo/);
    vm.runInContext(`_cfTranspAtual = "anjun"`, ctx);
    assert.match(ctx._cfHtmlResumo(resumo), /Fora do prazo/);
});
