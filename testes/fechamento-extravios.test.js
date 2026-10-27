// Fechamento de Extravios: filtros por situação e planilha. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DADOS = {
    codigo_quinzena: "Q2Set", tem_relatorios: true,
    linhas: [
        { driver: "Fulano de Teste - Vila Teste", responsavel: "FULANO DE TESTE", status: "Extravio", transportadora: "Imile", data: "20/09/2026", codigo: "C1", valor: 40, causa: "", data_desconto: "Q2Set", para_desconto: "Sim", sem_conversao: false, tem_fechamento: true },
        { driver: "Beltrano Exemplo - Morro", responsavel: "Beltrano", status: "Multa", transportadora: "Loggi", data: "18/09/2026", codigo: "C2", valor: 10, causa: "", data_desconto: "Q2Set", para_desconto: "Sim", sem_conversao: false, tem_fechamento: false },
        { driver: "quem.sera", responsavel: "quem.sera", status: "Extravio", transportadora: "Anjun", data: "17/09/2026", codigo: "C3", valor: 5, causa: "", data_desconto: "Q2Set", para_desconto: "", sem_conversao: true, tem_fechamento: false },
    ],
    por_entregador: [
        { entregador: "Beltrano Exemplo - Morro", sem_conversao: false, tem_fechamento: false, extravios: 0, multas: 1, qtd: 1, total: 10, responsaveis: ["Beltrano"] },
        { entregador: "Fulano de Teste - Vila Teste", sem_conversao: false, tem_fechamento: true, extravios: 1, multas: 0, qtd: 1, total: 40, responsaveis: ["FULANO DE TESTE"] },
        { entregador: "quem.sera", sem_conversao: true, tem_fechamento: false, extravios: 1, multas: 0, qtd: 1, total: 5, responsaveis: ["quem.sera"] },
    ],
    totais: { linhas: 3, entregadores: 3, total: 55, sem_fechamento: { entregadores: 1, total: 10 }, sem_conversao: { entregadores: 1, total: 5 } },
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, value: "", innerHTML: "", innerText: "", style: {}, classList: { toggle() {} } }); return els.get(id); };
    const ctx = { console, API: "https://api.teste", token: "tok", mostrarTela() {}, document: { getElementById: el } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-extravios.js"), "utf8"), ctx);
    vm.runInContext("_fxDados = " + JSON.stringify(DADOS), ctx);
    return { ctx, el };
}

test("sem fechamento: só quem tem desconto e nenhum pacote na quinzena", () => {
    const { ctx, el } = carregar();
    ctx._fxMudarCategoria("entregador");
    ctx._fxMudarFiltro("sem_fechamento");
    assert.match(el("fx-tbody-ent").innerHTML, /Beltrano Exemplo/);
    assert.doesNotMatch(el("fx-tbody-ent").innerHTML, /Fulano/);
    const abas = JSON.parse(JSON.stringify(ctx._fxAbas()));
    assert.deepStrictEqual(abas[1].linhas.slice(1).map(l => [l[1], l[2], l[8]]), [["Beltrano Exemplo - Morro", "Sem fechamento na quinzena", 10]]);
    assert.match(el("fx-conteudo").innerHTML, /1 · 10,00/);
});

test("busca por código ou responsável; Todos mostra as 3 situações", () => {
    const { ctx, el } = carregar();
    ctx._fxMudarFiltro("");
    el("fx-busca").value = "c3";
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx._fxAbas()))[1].linhas.slice(1).map(l => l[7]), ["C3"]);
    el("fx-busca").value = "";
    ctx._fxRenderTabelas();
    const html = el("fx-tbody-ent").innerHTML;
    assert.match(html, /Sem fechamento na quinzena/);
    assert.match(html, /Responsável sem entregador/);
    assert.match(html, /No fechamento/);
});

test("categorias: GC Interno e Terceirizada separados, cada responsável por si", () => {
    const { ctx, el } = carregar();
    vm.runInContext(`_fxDados.linhas.push({ driver: "GC Interno - Caçador", responsavel: "GC Interno - Caçador", categoria: "gc_interno", status: "Lost", valor: 10, codigo: "G1" },
        { driver: "GC Interno - Videira", responsavel: "GC Interno - Videira", categoria: "gc_interno", status: "Lost", valor: 20, codigo: "G2" });
      _fxDados.por_entregador.push({ entregador: "GC Interno - Caçador", categoria: "gc_interno", extravios: 1, multas: 0, qtd: 1, total: 10, responsaveis: ["GC Interno - Caçador"] },
        { entregador: "GC Interno - Videira", categoria: "gc_interno", extravios: 1, multas: 0, qtd: 1, total: 20, responsaveis: ["GC Interno - Videira"] });`, ctx);
    ctx._fxMudarCategoria("gc_interno");
    const html = el("fx-tbody-ent").innerHTML;
    assert.match(html, /GC Interno - Caçador/);
    assert.match(html, /GC Interno - Videira/);
    assert.doesNotMatch(html, /Fulano|Beltrano/);
    assert.doesNotMatch(html, /Sem fechamento/);
    const abas = JSON.parse(JSON.stringify(ctx._fxAbas()));
    assert.deepStrictEqual(abas[0].linhas.slice(1).map(l => [l[0], l[1], l[5]]), [["GC Interno", "GC Interno - Caçador", 10], ["GC Interno", "GC Interno - Videira", 20]]);
});
