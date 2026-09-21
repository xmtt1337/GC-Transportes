// Testes de quando a Conferência de Atribuições trata um bipe como ERRO.
//
// Regra: só pacote com status de RETORNO é erro. A tela chegou a apitar erro (e a
// pintar em amarelo) para qualquer status que não fosse Hub_Received — pacote de
// rota normal, em trânsito ou já atribuído, parando a esteira à toa.
//
// A decisão é uma função pura (_scaTomDoBipe), então dá pra exercitar sem DOM: o
// arquivo só declara funções e variáveis no topo. Fixture sintética — nenhum
// código real entra em teste.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const arquivo = path.join(__dirname, "..", "js", "shopee-atribuicoes.js");
const fonte = fs.readFileSync(arquivo, "utf8") +
    "\n;globalThis.__sca = { _scaTomDoBipe, _scaEhRetorno, _scaErroDoBipe };";

const contexto = vm.createContext({ globalThis: undefined, console });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "shopee-atribuicoes.js" });
const api = contexto.__sca;

/** Resposta de um bipe, no formato que o servidor devolve. */
function bipe(sobre) {
    return Object.assign({
        codigo: "BR0000000000001", resultado: "ok", esperado: "C-01", encontrado: "C-01",
        status_pedido: "Hub_Received", status_ok: true, interceptar: false,
    }, sobre);
}

test("status de retorno é erro, mesmo com o cluster certo", () => {
    // Ele pode estar na rota certa e ainda assim não poder subir na carga.
    const d = bipe({ status_pedido: "Return_Hub_Received", status_ok: false, interceptar: true });
    assert.strictEqual(api._scaTomDoBipe(d), "retorno");
});

test("retorno vence divergência e falta de dado", () => {
    assert.strictEqual(api._scaTomDoBipe(bipe({ resultado: "divergente", interceptar: true })), "retorno");
    assert.strictEqual(api._scaTomDoBipe(bipe({ resultado: "sem_pedido", interceptar: true })), "retorno");
});

test("status que não é Hub_Received nem retorno NÃO é erro", () => {
    // O bug: status_ok=false (não é Hub_Received) apitava erro em amarelo.
    for (const s of ["Delivering", "In_Transit", "On_Hold", "Processed", "Assigned"]) {
        const d = bipe({ status_pedido: s, status_ok: false, interceptar: false });
        assert.strictEqual(api._scaTomDoBipe(d), "ok", `status ${s} deveria conferir normalmente`);
    }
});

test("sem status conhecido também confere normalmente", () => {
    const d = bipe({ status_pedido: null, status_ok: null, interceptar: false });
    assert.strictEqual(api._scaTomDoBipe(d), "ok");
});

test("Hub_Received confere normalmente", () => {
    assert.strictEqual(api._scaTomDoBipe(bipe()), "ok");
});

test("grupo errado continua sendo divergente", () => {
    assert.strictEqual(api._scaTomDoBipe(bipe({ resultado: "divergente", encontrado: "C-02" })), "divergente");
});

test("sem cadastro continua sendo 'sem dado'", () => {
    for (const r of ["sem_pedido", "sem_cluster", "sem_cep", "sem_cidade"]) {
        assert.strictEqual(api._scaTomDoBipe(bipe({ resultado: r })), "sem_dado", r);
    }
});

test("_scaEhRetorno só olha interceptar, nunca status_ok", () => {
    assert.strictEqual(api._scaEhRetorno({ interceptar: true }), true);
    assert.strictEqual(api._scaEhRetorno({ interceptar: false, status_ok: false }), false);
    assert.strictEqual(api._scaEhRetorno({ status_ok: false }), false);
    assert.strictEqual(api._scaEhRetorno(null), false);
    assert.strictEqual(api._scaEhRetorno(undefined), false);
});

test("bipe recusado por retorno vira erro vermelho com o motivo do servidor", () => {
    const d = { pedido_retido: true, status: "Return_Hub_Received",
        error: "Pedido retido (Return_Hub_Received) — favor não expedir. Separe e registre em Retidos → Interceptar." };
    const r = api._scaErroDoBipe("BR0000000000001", d);
    assert.strictEqual(r.tipo, "erro");
    assert.ok(r.html.startsWith("⛔"), "começa com o ⛔");
    assert.ok(r.html.includes("BR0000000000001"));
    assert.ok(r.html.includes("favor não expedir"));
    assert.ok(r.html.includes("Retidos"));
});

test("já bipado continua sendo só aviso; erro comum mostra a mensagem do servidor", () => {
    assert.strictEqual(api._scaErroDoBipe("BR1", { ja_bipado: true }).tipo, "aviso");
    const comum = api._scaErroDoBipe("BR1", { error: "Sessão não encontrada." });
    assert.strictEqual(comum.tipo, "erro");
    assert.strictEqual(comum.html, "Sessão não encontrada.");
    assert.strictEqual(api._scaErroDoBipe("BR1", {}).html, "Erro ao bipar.");
});

test("a mensagem do servidor é escapada (nada de HTML solto na tela)", () => {
    const r = api._scaErroDoBipe("BR1", { pedido_retido: true, error: "<img src=x onerror=alert(1)>" });
    assert.ok(!r.html.includes("<img"));
});
