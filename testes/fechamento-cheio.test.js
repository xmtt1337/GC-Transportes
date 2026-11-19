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

test("resumos: só os blocos escolhidos; pacotes da terceirizada não somam de novo, o valor dela sim", () => {
    const ctx = carregar();
    const D = { grupos: DADOS.grupos.concat([
        { entregador: "GC Interno - Vila", bloco: "interno", transportadora: "Anjun", cidade: "Vila Teste", polo: "Polo A", pacotes: 2, bruto: 4, fora_prazo: 0, ocorrencias: 0, pod: 0, pnr: 0 },
        { entregador: "Terceirizada - Expedição Videira", bloco: "terceirizada", transportadora: "Anjun", cidade: "Vila Teste", polo: null, pacotes: 10, bruto: 5, fora_prazo: 0, ocorrencias: 0, pod: 0, pnr: 0 }]),
        entregadores: DADOS.entregadores.concat([{ entregador: "Terceirizada - Expedição Videira", bloco: "terceirizada", polo: null, coletas: 3, acrescimos: 0, viagens: 0, ticketlog: 0, extravios: 1, descontos: 0 }]) };
    let r = json(ctx._chAgregar(D, {}, ["entregadores"]));
    assert.deepStrictEqual([r.total.pacotes, r.total.bruto], [19, 38]);
    r = json(ctx._chAgregar(D, {}, ["entregadores", "interno", "terceirizada"]));
    assert.deepStrictEqual([r.total.pacotes, r.total.pacotes_terceirizada, r.total.bruto, r.total.liquido], [21, 10, 47, 38 + 4 + 5 + 3 - 1]);
    const topo = ctx._chHtmlTopo(D, ["entregadores", "terceirizada"], "Q1Out");
    assert.match(topo, /terceirizada sobre <b>10<\/b>/);
});

test("Copiar resumo da quinzena: a conta fecha — cheio − descontos (com Ticketlog) + adicionais = líquido", () => {
    const ctx = carregar();
    // bruto = 1000 − 13,75 = 986,25; líquido = 986,25 + 5 + 55 + 20 − 99 − 36,25 − 77 = 854
    const t = { pacotes: 160000, entregadores: 90, cheio: 1000, bruto: 986.25, liquido: 854, fora_prazo: 10, ocorrencias: 2.5, pod: 0, pnr: 1.25,
        extravios: 36.25, ticketlog: 99, coletas: 5, viagens: 20, acrescimos: 55, descontos: 77 };
    const txt = ctx._chTextoResumo(t, { mes: 11, ano: 2026, quinzena: 1 });
    assert.match(txt, /^\*Resumo da quinzena Q1 de novembro\/2026\*/);
    assert.match(txt, /\*160\.000 pacotes\* que estamos pagando aos entregadores terceirizados \(90 entregadores\)/);
    assert.doesNotMatch(txt, /[\u{1F300}-\u{1FAFF}]/u, "sem emoji");
    assert.match(txt, /\(líquido\): R\$\s854,00\*/);
    assert.match(txt, /Valor cheio .*: R\$\s1\.000,00/);
    assert.match(txt, /• Fora do prazo: R\$\s10,00/);
    assert.match(txt, /• Extravios: R\$\s36,25/);
    assert.match(txt, /• Ticketlog: R\$\s99,00/);
    assert.doesNotMatch(txt, /POD/, "desconto zerado não aparece");
    assert.match(txt, /Total de descontos: R\$\s149,00\* \(14,90% do valor cheio\)/);
    assert.match(txt, /• Coletas: R\$\s5,00/);
    assert.match(txt, /• Deslocamento \(viagens\): R\$\s20,00/);
    assert.match(txt, /• Acréscimos menos descontos lançados: −R\$\s22,00/, "lançados viram uma linha só, o saldo");
    assert.match(txt, /Total de adicionais: R\$\s3,00/);
    assert.match(txt, /Conta: R\$\s1\.000,00 − R\$\s149,00 \+ R\$\s3,00 = R\$\s854,00$/);
});

test("Copiar resumo da quinzena: adicionais negativos tiram na conta; sem adicionais, a seção some", () => {
    const ctx = carregar();
    const neg = ctx._chTextoResumo({ pacotes: 1, entregadores: 1, cheio: 100, liquido: 80, fora_prazo: 10, descontos: 10 }, { mes: 1, ano: 2026, quinzena: 2 });
    assert.match(neg, /Conta: R\$\s100,00 − R\$\s10,00 − R\$\s10,00 = R\$\s80,00$/);
    const sem = ctx._chTextoResumo({ pacotes: 1, entregadores: 1, cheio: 100, liquido: 90, fora_prazo: 10 }, { mes: 1, ano: 2026, quinzena: 2 });
    assert.doesNotMatch(sem, /Adicionais/);
    assert.match(sem, /Conta: R\$\s100,00 − R\$\s10,00 = R\$\s90,00$/);
});

test("Copiar resumo da Terceirizada Videira: pacotes por cidade × R$ por pacote, adicionais, descontos e líquido, sem emoji", () => {
    const ctx = carregar();
    const dados = {
        grupos: [
            { entregador: "Terceirizada Teste", bloco: "terceirizada", transportadora: "Anjun", cidade: "Cidade A", pacotes: 100, bruto: 48 },
            { entregador: "Terceirizada Teste", bloco: "terceirizada", transportadora: "Imile", cidade: "Cidade A", pacotes: 50, bruto: 24 },
            { entregador: "Terceirizada Teste", bloco: "terceirizada", transportadora: "Anjun", cidade: "Cidade B", pacotes: 200, bruto: 96 },
            { entregador: "Fulano - Vila", bloco: "entregadores", transportadora: "Anjun", cidade: "Cidade A", pacotes: 999, bruto: 999 },
        ],
        entregadores: [{ entregador: "Terceirizada Teste", bloco: "terceirizada", coletas: 10, acrescimos: 0, extravios: 5.5, extravios_qtd: 3, descontos: 2 }],
    };
    const txt = ctx._chTextoTerceirizada(dados, { mes: 10, ano: 2026, quinzena: 2 });
    assert.match(txt, /^\*Resumo da quinzena Q2 de outubro\/2026 — Terceirizada Expedição Videira\*/);
    assert.match(txt, /\*350 pacotes\* nas cidades da terceirizada × R\$\s0,48 = \*R\$\s168,00\*/);
    assert.ok(txt.indexOf("• Cidade B: 200") < txt.indexOf("• Cidade A: 150"), "cidade com mais pacotes primeiro");
    assert.match(txt, /• Coletas: R\$\s10,00/);
    assert.doesNotMatch(txt, /Acréscimos/, "zerado não aparece");
    assert.match(txt, /• Extravios: 3 pedidos — R\$\s5,50/);
    assert.match(txt, /• Descontos: R\$\s2,00/);
    assert.match(txt, /\(líquido\): R\$\s170,50\*/);
    assert.match(txt, /Conta: R\$\s168,00 \+ R\$\s10,00 − R\$\s7,50 = R\$\s170,50$/);
    assert.doesNotMatch(txt, /[\u{1F300}-\u{1FAFF}]/u);
    // Um extravio só: singular; sem a quantidade (backend antigo), só o valor.
    dados.entregadores[0].extravios_qtd = 1;
    assert.match(ctx._chTextoTerceirizada(dados, { mes: 10, ano: 2026, quinzena: 2 }), /• Extravios: 1 pedido — R\$\s5,50/);
    delete dados.entregadores[0].extravios_qtd;
    assert.match(ctx._chTextoTerceirizada(dados, { mes: 10, ano: 2026, quinzena: 2 }), /• Extravios: R\$\s5,50/);
});
