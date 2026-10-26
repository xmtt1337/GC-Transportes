// Resumo da Quinzena: filtro, ordem e planilha exportada. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DADOS = {
    transportadoras: { shopee_cfc: { nome: "Shopee Caçador", enviado: true, pacotes: 100, valor: 250 },
        imile: { nome: "Imile", enviado: true, pacotes: 50, valor: 120 }, total: { nome: "Total Express", enviado: false, pacotes: 0, valor: 0 } },
    linhas: [
        { entregador: "Fulano de Teste - Vila Teste", polo: "Caçador", sem_conversao: false, por_transp: { shopee_cfc: { pacotes: 100, valor: 250 }, imile: { pacotes: 50, valor: 120 } },
            pacotes: 150, bruto: 370, ticketlog: 80, extravios: 20, acrescimos: 10, descontos: 5, liquido: 275, ticketlog_divergencias: 0 },
        { entregador: "Beltrano Exemplo - Morro", polo: "Videira", sem_conversao: false, por_transp: { imile: { pacotes: 5, valor: 15 } },
            pacotes: 5, bruto: 15, ticketlog: 0, liquido: 15, ticketlog_divergencias: 0 },
        { entregador: "usuario.sem", polo: null, sem_conversao: true, por_transp: { imile: { pacotes: 1, valor: 3 } },
            pacotes: 1, bruto: 3, ticketlog: 0, liquido: 3, ticketlog_divergencias: 0 },
    ],
    opcoes: { polos: ["Caçador", "Videira"], entregadores: ["Fulano de Teste - Vila Teste"], cidades: ["Vila Teste"] },
    totais: { entregadores: 2, pacotes: 156, bruto: 388, ticketlog: 80, liquido: 308, sem_conversao: { linhas: 1, valor: 3 }, ticketlog_sem_nome: 0 },
    ticketlog_arquivos: 1,
    extravios_linhas: [{ driver: "Fulano de Teste - Vila Teste", responsavel: "FULANO DE TESTE", status: "Extravio", transportadora: "Imile",
        data: "20/09/2026", codigo: "C1", valor: 20, causa: "", data_desconto: "Q2Set", sem_conversao: false },
        { driver: "Fora do Arquivo", responsavel: "x", status: "Multa", valor: 1, sem_conversao: true }],
    ajustes_linhas: [{ id: 1, driver: "Fulano de Teste - Vila Teste", tipo: "acrescimo", valor: 10, descricao: "ajuda" }],
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, value: "", innerHTML: "", innerText: "", style: {}, classList: { toggle() {} } }); return els.get(id); };
    const caixas = [];
    const ctx = { console, API: "https://api.teste", token: "tok", document: { getElementById: el, querySelectorAll: () => caixas }, mostrarTela() {} };
    vm.createContext(ctx);
    // As colunas do detalhado vêm do Criar Fechamento (os dois scripts estão na página).
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-criar.js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-resumo.js"), "utf8"), ctx);
    vm.runInContext("_rqDados = " + JSON.stringify(DADOS), ctx);
    return { ctx, el, caixas };
}

test("só aparecem colunas das transportadoras que subiram; sem conversão fica no fim", () => {
    const { ctx, el } = carregar();
    ctx._rqRender();
    const head = el("rq-thead").innerHTML;
    assert.match(head, /Shopee Caçador/);
    assert.doesNotMatch(head, /Total Express/);
    assert.match(el("rq-conteudo").innerHTML, /Sem relatório nesta quinzena: Total Express/);
    ctx._rqOrdenar("liquido");
    const corpo = el("rq-tbody").innerHTML;
    assert.ok(corpo.indexOf("Fulano") < corpo.indexOf("Beltrano") && corpo.indexOf("Beltrano") < corpo.indexOf("usuario.sem"));
});

const PAC = [
    { transportadora: "Imile", driver: "Fulano de Teste - Vila Teste", usuario: "f", polo: "Caçador", cidade: "Vila Teste", valor_motorista: 3, codigo: "I1" },
    { transportadora: "Shopee Caçador", driver: "Fulano de Teste - Vila Teste", usuario: "f", polo: "Caçador", cidade: "Vila Teste", valor_motorista: 2.5, codigo: "S1" },
    { transportadora: "Imile", driver: null, usuario: "usuario.sem", polo: null, cidade: "Morro", valor_motorista: 3, codigo: "I2" },
];

test("detalhado: uma aba por transportadora com as colunas do Criar Fechamento, Performance e Resumo no fim", () => {
    const { ctx } = carregar();
    const perf = [{ driver: "Fulano de Teste - Vila Teste", dia: "2026-09-21", shopee: 1, onholds: 0, outras_prazo: 1, outras_atraso: 0, pct: 100, valor: 2.5, pacotes_pagos: 2, total: 5 },
        { driver: "Outro Fora - X", dia: "2026-09-21", shopee: 1, onholds: 0, outras_prazo: 0, outras_atraso: 0, pct: 100, valor: 2.5, pacotes_pagos: 1, total: 2.5 }];
    const abas = JSON.parse(JSON.stringify(ctx._rqMontarAbas(PAC, { polo: "", driver: "", cidade: "", transportadora: "" }, perf)));
    assert.deepStrictEqual(abas.map(a => a.nome), ["Shopee Caçador", "Imile", "Performance", "Extravios", "Acréscimos e descontos", "Resumo"]);
    assert.deepStrictEqual(abas[3].linhas[1].slice(0, 3), ["Fulano de Teste - Vila Teste", "FULANO DE TESTE", "Extravio"]);
    assert.deepStrictEqual(abas[4].linhas[1], ["Fulano de Teste - Vila Teste", "Acréscimo", 10, "ajuda"]);
    const imile = abas[1].linhas;
    assert.deepStrictEqual(imile[0].slice(0, 5), ["Transportadora", "Tipo de Produto", "Driver", "Usuario", "Codigo"]);
    assert.strictEqual(imile.length, 3);
    assert.deepStrictEqual(abas[0].linhas[0], ["Transportadora", "Driver", "Usuario", "Codigo", "Cidade", "Polo", "Zipcode Name", "Data entrega", "Valor motorista"]);
    assert.strictEqual(abas[2].linhas.length, 2, "performance só de quem está no arquivo");
    assert.deepStrictEqual(abas[5].linhas, [
        ["Entregador", "Polo", "Imile (R$)", "Shopee Caçador (R$)", "Pacotes", "Bruto", "Acréscimos", "Ticketlog", "Extravios", "Descontos", "Líquido"],
        ["Fulano de Teste - Vila Teste", "Caçador", 3, 2.5, 2, 5.5, 10, 80, 20, 5, -89.5],
        ["usuario.sem (sem conversão)", "", 3, 0, 1, 3, 0, 0, 0, 0, 3],
    ]);
});

test("resumo sem Ticketlog quando filtra cidade ou transportadora (desconto é do entregador inteiro)", () => {
    const { ctx } = carregar();
    const cab = (f) => JSON.parse(JSON.stringify(ctx._rqAbaResumo(PAC.slice(0, 2), f)))[0];
    assert.deepStrictEqual(cab({ cidades: ["Vila Teste"] }), ["Entregador", "Polo", "Imile (R$)", "Shopee Caçador (R$)", "Pacotes", "Bruto"]);
    assert.strictEqual(cab({ parcialTransp: true }).includes("Ticketlog"), false);
    assert.strictEqual(cab({ cidades: [] }).includes("Ticketlog"), true);
});

test("cidades: colar lista casa sem acento/caixa/UF, não repete, avisa as que não existem", () => {
    const { ctx, el } = carregar();
    vm.runInContext(`_rqDados.opcoes = { cidades: ["Caçador", "Vila Teste", "São José"] }`, ctx);
    ctx._rqAddCidades("CACADOR\nvila teste - SC; Lugar Nenhum,  , São José/SC\ncaçador");
    const nomes = () => vm.runInContext("_rqXCidades.map(c => c.nome).join('|')", ctx);
    assert.strictEqual(nomes(), "Caçador|Vila Teste|São José");
    assert.deepStrictEqual([...vm.runInContext("_rqXNaoAchadas", ctx)], ["Lugar Nenhum"]);
    assert.match(el("rq-x-cidades").innerHTML, /3 cidade\(s\)/);
    assert.match(el("rq-x-cidades").innerHTML, /Sem pacote nesta quinzena:<\/span> Lugar Nenhum/);
    ctx._rqTirarCidade(0);
    assert.strictEqual(nomes(), "Vila Teste|São José");
});

test("cidades: uma escolha pega todas as grafias da quinzena (Joaçaba, JOACABA, Joacaba...)", () => {
    const { ctx, el } = carregar();
    vm.runInContext(`_rqDados.opcoes = { cidades: ["JOACABA", "Joacaba", "Joaçaba", "joaçaba", "Herval D'Oeste", "HERVAL DOESTE", "Luzerna"] }`, ctx);
    const grupos = JSON.parse(JSON.stringify(ctx._rqGruposCidades()));
    assert.deepStrictEqual(grupos.map(g => [g.nome, g.variantes.length]), [["Herval D'Oeste", 2], ["Joaçaba", 4], ["Luzerna", 1]]);
    ctx._rqAddCidades("joacaba");
    ctx._rqAddCidades("Herval d oeste");
    assert.strictEqual(vm.runInContext("_rqXCidades.flatMap(c => c.variantes).join('|')", ctx), "JOACABA|Joacaba|Joaçaba|joaçaba|Herval D'Oeste|HERVAL DOESTE");
    assert.match(el("rq-x-cidades").innerHTML, /Joaçaba <span class="cft-ajuda">\+3<\/span>/);
});

test("baixar manda transportadoras marcadas, polo, entregador e as cidades", async () => {
    const { ctx, el, caixas } = carregar();
    ctx._rqRender();
    caixas.push({ value: "shopee_cfc", checked: false }, { value: "imile", checked: true });
    vm.runInContext(`_rqMes = 9; _rqAno = 2026; _rqQuinzena = 2;
        _rqXCidades = [{ chave: "vilateste", nome: "Vila Teste", variantes: ["Vila Teste"] }, { chave: "cacador", nome: "Caçador", variantes: ["Caçador", "CACADOR"] }];`, ctx);
    const urls = [];
    let gravado = null;
    ctx.fetch = async (u) => { urls.push(u); return { ok: true, json: async () => (u.includes("/performance") ? { linhas: [] } : { pacotes: PAC.slice(0, 1) }) }; };
    ctx.XLSX = { utils: { book_new: () => ({ abas: [] }), aoa_to_sheet: (a) => a, book_append_sheet: (wb, ws, n) => wb.abas.push(n) },
        writeFile: (wb, nome) => { gravado = [wb.abas, nome]; } };
    el("rq-x-polo").value = "Caçador"; el("rq-x-driver").value = "";
    await ctx._rqBaixar();
    assert.match(urls[0], /resumo-quinzena\/pacotes\?mes=9&ano=2026&quinzena=2&transportadoras=imile&polo=Ca%C3%A7ador&driver=&cidades=Vila%20Teste%7CCa%C3%A7ador%7CCACADOR$/);
    assert.strictEqual(urls.length, 1, "sem Shopee no arquivo não busca performance");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(gravado)), [["Imile", "Resumo"], "fechamento_2q_09-2026_Imile_Caçador_2-cidades.xlsx"]);

    // nenhuma marcada: não baixa
    caixas[1].checked = false;
    urls.length = 0;
    await ctx._rqBaixar();
    assert.strictEqual(urls.length, 0);
    assert.match(el("rq-x-status").innerText, /ao menos uma/);
});
