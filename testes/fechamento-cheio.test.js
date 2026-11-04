// Resumo › Do cheio ao líquido: soma e filtros. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-cheio.js"), "utf8"), ctx);
    vm.runInContext("var _rqEsc = (t) => String(t ?? ''); var _rqNum = (n) => Number(n).toFixed(2);", ctx);
    return ctx;
}
const DADOS = {
    grupos: [
        { entregador: "Fulano - Vila", transportadora: "Anjun", cidade: "Vila Teste", polo: "Polo A", pacotes: 10, bruto: 20, fora_prazo: 3, ocorrencias: 0, pod: 0, pnr: 1 },
        { entregador: "Fulano - Vila", transportadora: "Shopee Caçador", cidade: "Morro Falso", polo: "Polo A", pacotes: 5, bruto: 10, fora_prazo: 0, ocorrencias: 2, pod: 1, pnr: 0 },
        { entregador: "Beltrano - Morro", transportadora: "Anjun", cidade: "Morro Falso", polo: "Polo B", pacotes: 4, bruto: 8, fora_prazo: 0, ocorrencias: 0, pod: 0, pnr: 0 },
    ],
    entregadores: [
        { entregador: "Fulano - Vila", polo: "Polo A", coletas: 5, acrescimos: 1, viagens: 2, ticketlog: 4, extravios: 3, descontos: 1 },
        { entregador: "Beltrano - Morro", polo: "Polo B", coletas: 0, acrescimos: 0, viagens: 0, ticketlog: 0, extravios: 0, descontos: 0 },
    ],
};
const json = (x) => JSON.parse(JSON.stringify(x));

test("sem filtro: cheio = bruto + perdas; líquido = bruto + adicionais − descontos", () => {
    const ctx = carregar();
    const r = json(ctx._chAgregar(DADOS, {}));
    const f = r.linhas.find(l => l.entregador === "Fulano - Vila");
    assert.deepStrictEqual([f.bruto, f.cheio, f.liquido], [30, 37, 30]);
    assert.deepStrictEqual([r.total.cheio, r.total.bruto, r.total.liquido, r.total.pacotes], [45, 38, 38, 19]);
    assert.strictEqual(r.comAjustes, true);
});

test("filtro de cidade: só os pacotes dela, sem a parte do entregador; filtro de polo mantém a parte de quem é do polo", () => {
    const ctx = carregar();
    let r = json(ctx._chAgregar(DADOS, { cidade: ["Morro Falso"] }));
    assert.deepStrictEqual(r.linhas.map(l => [l.entregador, l.bruto, l.ocorrencias, l.coletas]), [["Beltrano - Morro", 8, 0, 0], ["Fulano - Vila", 10, 2, 0]]);
    assert.strictEqual(r.comAjustes, false);
    r = json(ctx._chAgregar(DADOS, { polo: ["Polo A"] }));
    assert.deepStrictEqual(r.linhas.map(l => [l.entregador, l.bruto, l.coletas, l.liquido]), [["Fulano - Vila", 30, 5, 30]]);
    r = json(ctx._chAgregar(DADOS, { transportadora: ["Anjun"] }));
    assert.deepStrictEqual(r.total.bruto, 28);
});

test("tela: cascata com cada linha, aviso de recalcular e de ajustes fora com filtro", () => {
    const ctx = carregar();
    let html = ctx._chHtml({ ...DADOS, sem_conta: 3 }, { transportadora: null, cidade: ["Vila Teste"], polo: null });
    assert.match(html, /Valor cheio/);
    assert.match(html, /PNR acima do limite/);
    assert.match(html, /3 pacote\(s\) foram calculados antes/);
    assert.match(html, /ficam de fora/);
    html = ctx._chHtml(DADOS, { transportadora: null, cidade: null, polo: null });
    assert.doesNotMatch(html, /ficam de fora/);
});
