// Fechamento › Perdas por desempenho: abas, filtros e totais. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DADOS = {
    dias: [
        { driver: "Fulano Teste - Vila A", cidade: "Vila A", polo: "Caçador", dia: "2026-10-05", pct: 95, valor: 2, valor_maximo: 2.5, fixo: false, pacotes: 100,
            onholds: 3, atrasos: 1, pnr: 0, tarifa_minima: false, pacotes_minima: 0, perda_performance: 50, perda_pnr: 0, total: 50 },
        { driver: "Fulano Teste - Vila A", cidade: "Vila A", polo: "Caçador", dia: "2026-10-06", pct: 100, valor: 2.5, valor_maximo: 2.5, fixo: false, pacotes: 80,
            onholds: 0, atrasos: 0, pnr: 4, tarifa_minima: true, pacotes_minima: 40, perda_performance: 0, perda_pnr: 40, total: 40 },
        { driver: "Beltrano Teste - Vila B", cidade: "Vila B", polo: "Videira", dia: "2026-10-05", pct: 100, valor: 2.5, valor_maximo: 2.5, fixo: false, pacotes: 60,
            onholds: 0, atrasos: 0, pnr: 0, tarifa_minima: false, pacotes_minima: 0, perda_performance: 0, perda_pnr: 0, total: 0 },
    ],
    ocorrencias: [
        { driver: "Fulano Teste - Vila A", cidade: "Vila A", polo: "Caçador", dia: "2026-10-05", tipo: "Onhold", transportadora: "Shopee Caçador", codigo: "BR1", motivo: "Cliente ausente", valor_perdido: 12.5 },
        { driver: "Fulano Teste - Vila A", cidade: "Vila A", polo: "Caçador", dia: "2026-10-05", tipo: "Atrasado", transportadora: "Imile", codigo: "IM1", deveria: "2026-10-05", entregue: "2026-10-07", valor_perdido: 12.5 },
        { driver: "Fulano Teste - Vila A", cidade: "Vila A", polo: "Caçador", dia: "2026-10-06", tipo: "PNR", transportadora: "Shopee", codigo: "P1", ocorrencia: "2026-10-07", hora: "10:00", valor_perdido: 10 },
    ],
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: "", value: "" }); return els.get(id); };
    const ctx = { console, API: "", token: "t", document: { getElementById: el } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-perdas.js"), "utf8") + "\n;this._set = (d) => { _pdDados = d; };", ctx);
    return { ctx, el };
}

test("resumo: total perdido, só quem perdeu, performance e PNR separados", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._pdOpcoes();
    ctx._pdRender();
    const html = el("pd-lista").innerHTML;
    assert.match(html, /R\$ 90,00<\/div><div class="cft-kpi-rotulo">Deixaram de receber/);
    assert.match(html, /1 de 2<\/div><div class="cft-kpi-rotulo">Entregadores com perda/);
    assert.match(html, /Fulano Teste - Vila A/);
    assert.doesNotMatch(html, /<td>Beltrano Teste/, "sem perda não aparece no resumo");
    assert.match(el("pd-polo").innerHTML, /<option value="Videira">/);
    assert.match(el("pd-cidade").innerHTML, /<option value="Vila B">/);
});

test("abas: fora do prazo, onhold e PNR com o que deixou de receber no dia (uma vez por dia)", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._pdAbrirAba("prazo");
    assert.match(el("pd-lista").innerHTML, /IM1<\/td><td>05\/10<\/td><td>07\/10<\/td>\s*<td class="num cft-neg">−50,00/);
    ctx._pdAbrirAba("onhold");
    assert.match(el("pd-lista").innerHTML, /Cliente ausente/);
    assert.doesNotMatch(el("pd-lista").innerHTML, /IM1/);
    ctx._pdAbrirAba("pnr");
    assert.match(el("pd-lista").innerHTML, /07\/10 às 10:00/);
    assert.match(el("pd-lista").innerHTML, /−40,00/);
});

test("filtros: polo e cidade", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._pdAbrirAba("resumo");
    el("pd-polo").value = "Videira";
    ctx._pdRender();
    assert.match(el("pd-lista").innerHTML, /R\$ 0,00<\/div><div class="cft-kpi-rotulo">Deixaram de receber/);
    el("pd-polo").value = "";
    el("pd-cidade").value = "Vila A";
    ctx._pdAbrirAba("dias");
    assert.match(el("pd-lista").innerHTML, /\(40 na mínima\)/);
    assert.match(el("pd-lista").innerHTML, /2,00 <span class="cft-ajuda">de 2,50/);
});

test("por dia: com entregas na tarifa mínima, R$/pacote é a média do dia com a divisão embaixo", () => {
    const { ctx, el } = carregar();
    ctx._set({ dias: [{ driver: "Interno Teste", cidade: null, polo: "Caçador", dia: "2026-10-01", pct: 99.23, valor: 2.5, valor_maximo: 2.5, valor_minima: 1.5,
        valor_medio: 2.31, total_pago: 300, fixo: false, pacotes: 130, onholds: 0, atrasos: 1, pnr: 4, tarifa_minima: true, pacotes_minima: 25,
        perda_performance: 0, perda_pnr: 25, total: 25 }], ocorrencias: [] });
    ctx._pdAbrirAba("dias");
    const html = el("pd-lista").innerHTML;
    assert.match(html, />2,31<\/span> <span class="cft-ajuda">de 2,50/);
    assert.match(html, /105 a 2,50 · 25 a 1,50/);
});

test("PNR que não custou nada mostra o motivo e o usuário", () => {
    const { ctx, el } = carregar();
    ctx._set({ dias: DADOS.dias, ocorrencias: [{ driver: "Fulano Teste - Vila A", cidade: "Vila A", polo: "Caçador", dia: "2026-10-05", tipo: "PNR",
        transportadora: "Shopee", codigo: "P9", usuario: "FULANO LOGIN", ocorrencia: "2026-10-06", hora: "09:00", valor_perdido: 0, situacao: "não passou do limite no dia" }] });
    ctx._pdAbrirAba("pnr");
    const html = el("pd-lista").innerHTML;
    assert.match(html, /<td class="cft-ajuda">FULANO LOGIN<\/td>/);
    assert.match(html, /<span class="cft-ajuda">não passou do limite no dia<\/span>/);
});

test("mesmo dia com várias ocorrências: o valor do dia aparece só na 1ª linha e o total conta o dia uma vez", () => {
    const { ctx, el } = carregar();
    const o = (codigo) => ({ driver: "Fulano Teste - Vila A", cidade: "Vila A", polo: "Caçador", dia: "2026-10-05", tipo: "Onhold", transportadora: "Shopee", codigo, valor_perdido: 16.67 });
    ctx._set({ dias: DADOS.dias, ocorrencias: [o("BR1"), o("BR2"), o("BR3")] });
    ctx._pdAbrirAba("onhold");
    const html = el("pd-lista").innerHTML;
    assert.strictEqual((html.match(/−50,00/g) || []).length, 2, "1ª linha + total");
    assert.match(html, /Deixou de receber no dia/);
});
