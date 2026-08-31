// Testes do calendário dos dias do romaneiro (Line Haul).
//
// Calendário erra de um jeito que ninguém vê de relance: o dia cai na coluna
// errada do dia da semana, ou o mês vira e o ano fica pra trás. A pessoa clica
// numa data achando que é sexta e abre a carga de sábado — sem erro nenhum na
// tela. É isso que os testes abaixo travam.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ── carrega o módulo do navegador num contexto isolado
//
// Mesmo caminho dos outros testes de tela: o arquivo só declara funções e
// variáveis no topo, não toca em `document` até alguém navegar.
const arquivo = path.join(__dirname, "..", "js", "shopee-linehaul.js");
const fonte = fs.readFileSync(arquivo, "utf8") +
    "\n;globalThis.__slh = { _slhCalGrade, _slhMesVizinho, _slhMesDe, _slhBr };";

const contexto = vm.createContext({ globalThis: undefined, console, Date });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "shopee-linehaul.js" });
const api = contexto.__slh;

// Arrays devolvidos pelo módulo nascem DENTRO do vm, com outro Array.prototype:
// assert.deepStrictEqual reprovaria por realm, não por conteúdo. Por isso as
// listas são comparadas pelo conteúdo (join) ou pelo tamanho.

/** Dias com romaneiro, no formato que o servidor devolve. */
function dias() {
    return [
        { dia: "2026-08-31", tos: 33 },
        { dia: "2026-08-30", tos: 102 },
        { dia: "2026-08-24", tos: 63 },
    ];
}

const soDias = (g) => g.filter((c) => !c.vazio);

test("o mes comeca na coluna do dia da semana certo", () => {
    // 01/08/2026 é sábado (dow 6): seis células vazias antes do dia 1. Errar
    // isso desloca o mês inteiro e a pessoa clica na data errada.
    const grade = api._slhCalGrade("2026-08", dias(), "2026-08-31", "2026-08-30");
    assert.strictEqual(grade.filter((c) => c.vazio).length, 6);
    assert.strictEqual(grade[6].numero, 1);
    assert.strictEqual(grade[6].dia, "2026-08-01");
});

test("o mes tem a quantidade certa de dias", () => {
    assert.strictEqual(soDias(api._slhCalGrade("2026-08", [], "", "")).length, 31);
    assert.strictEqual(soDias(api._slhCalGrade("2026-04", [], "", "")).length, 30);
    assert.strictEqual(soDias(api._slhCalGrade("2026-02", [], "", "")).length, 28);
    // Ano bissexto: 2028 tem 29 de fevereiro.
    assert.strictEqual(soDias(api._slhCalGrade("2028-02", [], "", "")).length, 29);
});

test("so os dias com romaneiro ficam clicaveis", () => {
    const grade = soDias(api._slhCalGrade("2026-08", dias(), "2026-08-31", ""));
    const comRomaneiro = grade.filter((c) => c.tem).map((c) => c.dia).join(" ");
    assert.strictEqual(comRomaneiro, "2026-08-24 2026-08-30 2026-08-31");
});

test("a contagem de TOs acompanha o dia", () => {
    // É o dado que a fita antiga mostrava; se sumir, o calendário vira um passo
    // a mais sem nada em troca.
    const grade = soDias(api._slhCalGrade("2026-08", dias(), "", ""));
    assert.strictEqual(grade.find((c) => c.dia === "2026-08-30").tos, 102);
    assert.strictEqual(grade.find((c) => c.dia === "2026-08-24").tos, 63);
});

test("dia sem romaneiro vem zerado e marcado como sem", () => {
    const grade = soDias(api._slhCalGrade("2026-08", dias(), "", ""));
    const vinte = grade.find((c) => c.dia === "2026-08-20");
    assert.strictEqual(vinte.tem, false);
    assert.strictEqual(vinte.tos, 0);
});

test("hoje e o dia escolhido sao marcados separadamente", () => {
    // São coisas diferentes: hoje é referência, escolhido é o que está aberto.
    const grade = soDias(api._slhCalGrade("2026-08", dias(), "2026-08-31", "2026-08-30"));
    const hoje = grade.find((c) => c.hoje);
    const sel  = grade.find((c) => c.selecionado);
    assert.strictEqual(hoje.dia, "2026-08-31");
    assert.strictEqual(sel.dia, "2026-08-30");
    assert.strictEqual(grade.filter((c) => c.hoje).length, 1);
    assert.strictEqual(grade.filter((c) => c.selecionado).length, 1);
});

test("dia com romaneiro que caia num mes zero-padded nao se perde", () => {
    // "2026-09-05" tem que casar com o dia 5, nao com "2026-09-5".
    const grade = soDias(api._slhCalGrade("2026-09", [{ dia: "2026-09-05", tos: 7 }], "", ""));
    assert.strictEqual(grade.find((c) => c.numero === 5).tos, 7);
});

test("mes invalido devolve grade vazia em vez de quebrar", () => {
    assert.strictEqual(api._slhCalGrade("", dias(), "", "").length, 0);
    assert.strictEqual(api._slhCalGrade("2026", dias(), "", "").length, 0);
    assert.strictEqual(api._slhCalGrade(undefined, dias(), "", "").length, 0);
});

test("sem dias com romaneiro o mes ainda desenha", () => {
    const grade = soDias(api._slhCalGrade("2026-08", [], "", ""));
    assert.strictEqual(grade.length, 31);
    assert.ok(grade.every((c) => !c.tem));
    assert.strictEqual(soDias(api._slhCalGrade("2026-08", undefined, "", "")).length, 31);
});

test("navegar entre meses vira o ano nos dois sentidos", () => {
    assert.strictEqual(api._slhMesVizinho("2026-08", 1), "2026-09");
    assert.strictEqual(api._slhMesVizinho("2026-08", -1), "2026-07");
    assert.strictEqual(api._slhMesVizinho("2026-12", 1), "2027-01");
    assert.strictEqual(api._slhMesVizinho("2026-01", -1), "2025-12");
});

test("navegar muitos meses de uma vez nao desalinha", () => {
    assert.strictEqual(api._slhMesVizinho("2026-08", 12), "2027-08");
    assert.strictEqual(api._slhMesVizinho("2026-08", -12), "2025-08");
    assert.strictEqual(api._slhMesVizinho("2026-03", -5), "2025-10");
});

test("mes invalido na navegacao volta como veio", () => {
    assert.strictEqual(api._slhMesVizinho("", 1), "");
    assert.strictEqual(api._slhMesVizinho("abc", 1), "abc");
});

test("o calendario abre no mes do dia escolhido", () => {
    assert.strictEqual(api._slhMesDe("2026-03-14", "2026-08-31"), "2026-03");
});

test("sem dia escolhido, abre no mes de hoje", () => {
    // Acontece em "Todos os romaneiros", que nao tem dia.
    assert.strictEqual(api._slhMesDe("todas", "2026-08-31"), "2026-08");
    assert.strictEqual(api._slhMesDe("", "2026-08-31"), "2026-08");
    assert.strictEqual(api._slhMesDe(null, "2026-08-31"), "2026-08");
});

test("a data aparece no formato brasileiro", () => {
    assert.strictEqual(api._slhBr("2026-08-30"), "30/08/2026");
    assert.strictEqual(api._slhBr(""), "");
});
