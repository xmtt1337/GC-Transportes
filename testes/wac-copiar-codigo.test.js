// Testes do "Copiar código" na barra de seleção do chat de Ativos.
//
// Mensagem enviada copia o pedido dela; a recebida não tem pedido gravado e usa o do card que
// abriu a conversa. Sem código nenhum (chat de entregador) o botão nem aparece.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "whatsapp-conversa.js"), "utf8");

const ACESSOR = `
;globalThis.__w = {
  selecionar(ids) { _wacSelecionadas = new Set(ids); },
  set pedidoCard(v) { _wacPedidoAtual = v; },
  set pedidos(v) { _wacPedidoPorMsg = v; },
};`;

function carregar({ copiaFalha = false } = {}) {
    const copiados = [];
    const alertas = [];
    const temporizadores = [];
    const botao = { style: { display: "" }, innerText: "" };
    const contagem = { innerText: "" };
    const barra = {
        style: { display: "none" },
        querySelector: sel => (sel === ".wac-selecao-copiar" ? botao : null),
    };
    const ctx = {
        console, clearTimeout, setInterval, clearInterval,
        setTimeout: fn => temporizadores.push(fn),
        document: {
            getElementById: id => (id === "wac-selecao-barra" ? barra : contagem),
            querySelector: () => botao,
            querySelectorAll: () => [],
        },
        gcCopiar: t => {
            if (copiaFalha) return Promise.reject(new Error("bloqueado"));
            copiados.push(t);
            return Promise.resolve();
        },
        gcAlert: m => alertas.push(m),
    };
    vm.createContext(ctx);
    vm.runInContext(fonte + ACESSOR, ctx);
    return { ctx, botao, barra, copiados, alertas, temporizadores };
}

const espera = () => new Promise(r => setImmediate(r));

test("mensagem enviada copia o pedido dela, mesmo aberta por outro card", async () => {
    const { ctx, copiados } = carregar();
    ctx.__w.pedidoCard = "AJ000000000000001";
    ctx.__w.pedidos = { e1: "AJ000000000000002" };
    ctx.__w.selecionar(["e1"]);
    ctx._wacCopiarCodigos();
    await espera();
    assert.deepStrictEqual(copiados, ["AJ000000000000002"]);
});

test("mensagem recebida copia o pedido do card da conversa", async () => {
    const { ctx, copiados } = carregar();
    ctx.__w.pedidoCard = "AJ000000000000001";
    ctx.__w.pedidos = {};
    ctx.__w.selecionar(["r7"]);
    ctx._wacCopiarCodigos();
    await espera();
    assert.deepStrictEqual(copiados, ["AJ000000000000001"]);
});

test("várias mensagens: um código por linha, sem repetir", async () => {
    const { ctx, copiados } = carregar();
    ctx.__w.pedidoCard = "AJ000000000000001";
    ctx.__w.pedidos = { e1: "AJ000000000000001", e2: "AJ000000000000002" };
    ctx.__w.selecionar(["e1", "r3", "e2"]);
    ctx._wacCopiarCodigos();
    await espera();
    assert.deepStrictEqual(copiados, ["AJ000000000000001\nAJ000000000000002"]);
});

test("sem código nenhum o botão some e nada é copiado", async () => {
    const { ctx, botao, barra, copiados } = carregar();
    ctx.__w.pedidoCard = "";
    ctx.__w.pedidos = {};
    ctx.__w.selecionar(["r1"]);
    ctx._wacAtualizarBarraSelecao();
    assert.strictEqual(botao.style.display, "none");
    assert.strictEqual(barra.style.display, ""); // Excluir continua disponível
    ctx._wacCopiarCodigos();
    await espera();
    assert.deepStrictEqual(copiados, []);
});

test("rótulo acompanha a quantidade de códigos", () => {
    const { ctx, botao } = carregar();
    ctx.__w.pedidos = { e1: "AJ000000000000001", e2: "AJ000000000000002" };
    ctx.__w.selecionar(["e1"]);
    ctx._wacAtualizarBarraSelecao();
    assert.strictEqual(botao.innerText, "Copiar código");
    ctx.__w.selecionar(["e1", "e2"]);
    ctx._wacAtualizarBarraSelecao();
    assert.strictEqual(botao.innerText, "Copiar códigos");
});

test("mostra Copiado! e depois volta ao rótulo", async () => {
    const { ctx, botao, temporizadores } = carregar();
    ctx.__w.pedidos = { e1: "AJ000000000000001" };
    ctx.__w.selecionar(["e1"]);
    ctx._wacCopiarCodigos();
    await espera();
    assert.strictEqual(botao.innerText, "Copiado!");
    temporizadores.forEach(fn => fn());
    assert.strictEqual(botao.innerText, "Copiar código");
});

test("falha ao copiar avisa a pessoa", async () => {
    const { ctx, alertas } = carregar({ copiaFalha: true });
    ctx.__w.pedidos = { e1: "AJ000000000000001" };
    ctx.__w.selecionar(["e1"]);
    ctx._wacCopiarCodigos();
    await espera();
    assert.deepStrictEqual(alertas, ["Não consegui copiar o código."]);
});
