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
            pacotes: 150, bruto: 370, ticketlog: 80, liquido: 290, ticketlog_divergencias: 0 },
        { entregador: "Beltrano Exemplo - Morro", polo: "Videira", sem_conversao: false, por_transp: { imile: { pacotes: 5, valor: 15 } },
            pacotes: 5, bruto: 15, ticketlog: 0, liquido: 15, ticketlog_divergencias: 0 },
        { entregador: "usuario.sem", polo: null, sem_conversao: true, por_transp: { imile: { pacotes: 1, valor: 3 } },
            pacotes: 1, bruto: 3, ticketlog: 0, liquido: 3, ticketlog_divergencias: 0 },
    ],
    opcoes: { polos: ["Caçador", "Videira"], entregadores: ["Fulano de Teste - Vila Teste"], cidades: ["Vila Teste"] },
    totais: { entregadores: 2, pacotes: 156, bruto: 388, ticketlog: 80, liquido: 308, sem_conversao: { linhas: 1, valor: 3 }, ticketlog_sem_nome: 0 },
    ticketlog_arquivos: 1,
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, value: "", innerHTML: "", innerText: "", style: {}, classList: { toggle() {} } }); return els.get(id); };
    const ctx = { console, API: "https://api.teste", token: "tok", document: { getElementById: el }, mostrarTela() {} };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-resumo.js"), "utf8"), ctx);
    vm.runInContext("_rqDados = " + JSON.stringify(DADOS), ctx);
    return { ctx, el };
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

test("planilha: resumo por entregador com Ticketlog e líquido; aba de pacotes com todas as colunas", () => {
    const { ctx } = carregar();
    const p = JSON.parse(JSON.stringify(ctx._rqMontarPlanilha(PAC, { polo: "", driver: "", cidade: "" })));
    assert.deepStrictEqual(p.resumo, [
        ["Entregador", "Polo", "Imile (R$)", "Shopee Caçador (R$)", "Pacotes", "Bruto", "Ticketlog", "Líquido"],
        ["Fulano de Teste - Vila Teste", "Caçador", 3, 2.5, 2, 5.5, 80, -74.5],
        ["usuario.sem (sem conversão)", "", 3, 0, 1, 3, 0, 3],
    ]);
    assert.strictEqual(p.pacotes.length, 4);
    assert.strictEqual(p.pacotes[1][3], "I1");
});

test("planilha: com filtro de cidade não leva Ticketlog (desconto é do entregador, não da cidade)", () => {
    const { ctx } = carregar();
    const p = JSON.parse(JSON.stringify(ctx._rqMontarPlanilha(PAC.slice(0, 2), { cidade: "Vila Teste" })));
    assert.deepStrictEqual(p.resumo[0], ["Entregador", "Polo", "Imile (R$)", "Shopee Caçador (R$)", "Pacotes", "Bruto"]);
});

test("baixar manda polo, entregador e cidade escolhidos", async () => {
    const { ctx, el } = carregar();
    ctx._rqRender();
    vm.runInContext("_rqMes = 9; _rqAno = 2026; _rqQuinzena = 2;", ctx);
    let url = null, gravado = null;
    ctx.fetch = async (u) => { url = u; return { ok: true, json: async () => ({ pacotes: PAC }) }; };
    ctx.XLSX = { utils: { book_new: () => ({ abas: [] }), aoa_to_sheet: (a) => a, book_append_sheet: (wb, ws, n) => wb.abas.push(n) },
        writeFile: (wb, nome) => { gravado = [wb.abas, nome]; } };
    el("rq-x-polo").value = "Caçador"; el("rq-x-driver").value = ""; el("rq-x-cidade").value = "Vila Teste";
    await ctx._rqBaixar();
    assert.match(url, /resumo-quinzena\/pacotes\?mes=9&ano=2026&quinzena=2&polo=Ca%C3%A7ador&driver=&cidade=Vila%20Teste$/);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(gravado)), [["Resumo", "Pacotes"], "fechamento_2q_09-2026_Caçador_Vila-Teste.xlsx"]);
});
