// Testes do filtro do seletor de entregador (atribuições da Shopee).
//
// A lista tem ~300 nomes no formato "Nome Completo - Cidade" e quem usa digita
// do jeito que lembra: só o primeiro nome, só o sobrenome, a cidade sem cedilha,
// ou pedaços fora de ordem. O filtro precisa achar em todos esses casos — se
// falhar, a pessoa conclui que o entregador não está cadastrado.
//
// A fixture é sintética. Nenhum nome real entra em teste.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ── carrega o módulo do navegador num contexto isolado
//
// Mesmo caminho do teste do DACTE: o arquivo só declara funções e variáveis no
// topo, não toca em `document` até alguém clicar. Assim dá pra testar a parte
// pura sem duplicar o filtro só para o teste.
const arquivo = path.join(__dirname, "..", "js", "shopee-atribuicoes.js");
const fonte = fs.readFileSync(arquivo, "utf8") +
    "\n;globalThis.__sca = { _scaFiltrarEntregadores, _scaChave };";

const contexto = vm.createContext({ globalThis: undefined, console });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "shopee-atribuicoes.js" });
const api = contexto.__sca;

/** Nomes no mesmo formato do seletor: "Nome - Cidade". */
function lista() {
    return [
        { id: "ana.teste", nome: "Ana Teste da Silva - Videira" },
        { id: "bruno.teste", nome: "Bruno Teste Souza - Caçador" },
        { id: "carla.teste", nome: "Carla Teste Lima - Fraiburgo" },
        { id: "diego.teste", nome: "Diego Teste Gavazzo - Caçador" },
        { id: "eva.teste", nome: "Eva Teste Moreira - Rio das Antas" },
    ];
}

const nomes = (r) => r.map((e) => e.nome);

test("sem filtro devolve a lista inteira", () => {
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "").length, 5);
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "   ").length, 5);
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), null).length, 5);
});

test("acha por pedaço do nome, em qualquer posição", () => {
    // Ninguém digita do começo: quem procura "Gavazzo" lembra do sobrenome.
    assert.deepStrictEqual(nomes(api._scaFiltrarEntregadores(lista(), "gavazzo")),
        ["Diego Teste Gavazzo - Caçador"]);
    assert.deepStrictEqual(nomes(api._scaFiltrarEntregadores(lista(), "souza")),
        ["Bruno Teste Souza - Caçador"]);
});

test("ignora acento dos dois lados", () => {
    // Quem digita rápido escreve "cacador", nunca "Caçador".
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "cacador").length, 2);
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "Caçador").length, 2);
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "CAÇADOR").length, 2);
});

test("ignora caixa", () => {
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "ANA").length, 1);
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "aNa").length, 1);
});

test("varias palavras casam em qualquer ordem", () => {
    // O ganho é filtrar cidade + pessoa junto, sem depender da ordem que
    // aparece no nome exibido.
    assert.deepStrictEqual(nomes(api._scaFiltrarEntregadores(lista(), "diego cacador")),
        ["Diego Teste Gavazzo - Caçador"]);
    assert.deepStrictEqual(nomes(api._scaFiltrarEntregadores(lista(), "cacador diego")),
        ["Diego Teste Gavazzo - Caçador"]);
    assert.deepStrictEqual(nomes(api._scaFiltrarEntregadores(lista(), "gavazzo diego teste")),
        ["Diego Teste Gavazzo - Caçador"]);
});

test("filtrar pela cidade lista todo mundo dela", () => {
    assert.deepStrictEqual(nomes(api._scaFiltrarEntregadores(lista(), "videira")),
        ["Ana Teste da Silva - Videira"]);
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "rio das antas").length, 1);
});

test("uma palavra que nao bate zera o resultado", () => {
    // Todas as palavras precisam aparecer: senão "diego videira" traria o Diego
    // de Caçador e a pessoa atribuiria a cidade errada.
    assert.deepStrictEqual(api._scaFiltrarEntregadores(lista(), "diego videira"), []);
    assert.deepStrictEqual(api._scaFiltrarEntregadores(lista(), "fulano"), []);
});

test("espaço sobrando nao atrapalha", () => {
    assert.strictEqual(api._scaFiltrarEntregadores(lista(), "  ana   silva  ").length, 1);
});

test("lista vazia ou ausente nao quebra", () => {
    // Conferido pelo tamanho, nao por deepStrictEqual: quando a entrada e
    // undefined o array vazio nasce DENTRO do vm, com outro Array.prototype, e
    // a comparacao estrita reprovaria por realm, nao por conteudo.
    assert.strictEqual(api._scaFiltrarEntregadores([], "ana").length, 0);
    assert.strictEqual(api._scaFiltrarEntregadores(undefined, "ana").length, 0);
    assert.strictEqual(api._scaFiltrarEntregadores(undefined, "").length, 0);
});

test("nao mexe na lista original", () => {
    // O resultado alimenta o <select>; se fosse a mesma referência, um filtro
    // seguinte partiria da lista já reduzida.
    const original = lista();
    const filtrada = api._scaFiltrarEntregadores(original, "ana");
    assert.strictEqual(original.length, 5);
    assert.notStrictEqual(filtrada, original);
    assert.strictEqual(api._scaFiltrarEntregadores(original, "").length, 5);
});
