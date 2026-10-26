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
    ctx._rqOrdenar("liquido"); // maior primeiro
    const nomes = [...ctx._rqLinhasExportar().map(l => l.Entregador)];
    assert.deepStrictEqual(nomes, ["Fulano de Teste - Vila Teste", "Beltrano Exemplo - Morro", "usuario.sem (sem conversão)"]);
});

test("busca ignora acento e polo filtra; planilha leva pacotes e R$ por transportadora", () => {
    const { ctx, el } = carregar();
    ctx._rqRender();
    el("rq-polo").value = "Videira";
    const linhas = ctx._rqLinhasExportar();
    assert.strictEqual(linhas.length, 1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(linhas[0])), { Entregador: "Beltrano Exemplo - Morro", Polo: "Videira",
        "Shopee Caçador (pacotes)": 0, "Shopee Caçador (R$)": 0, "Imile (pacotes)": 5, "Imile (R$)": 15,
        Pacotes: 5, Bruto: 15, Ticketlog: 0, "Líquido": 15 });
    el("rq-polo").value = "";
    el("rq-busca").value = "FULANO";
    assert.strictEqual(ctx._rqLinhasExportar().length, 1);
});
