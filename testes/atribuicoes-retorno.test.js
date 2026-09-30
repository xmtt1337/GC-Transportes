// Testes de como a Conferência de Atribuições trata pacote em RETORNO e os clusters forçados
// "Interceptados <dia>" — um por dia (modules/conferencia/interceptados.js no backend).
//
// Regras: só o RESULTADO do grupo decide o apito (status "não recebido no hub" que não seja
// retorno NÃO é erro); pacote em retorno é recusado pelo servidor (409) com a instrução de
// bipar no cluster do dia certo; esses clusters não são rota de ninguém, então não ganham
// "+ atribuir" nem contam como cluster sem entregador; e o nome bruto ("Interceptados
// 2026-09-27", como o servidor grava e compara) vira "Interceptados 27/09" em qualquer lugar
// que a tela mostra pra pessoa.
//
// A decisão é função pura, então dá pra exercitar sem DOM: o arquivo só declara funções e
// variáveis no topo. Fixture sintética — nenhum código real entra em teste.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const arquivo = path.join(__dirname, "..", "js", "shopee-atribuicoes.js");
const fonte = fs.readFileSync(arquivo, "utf8") +
    "\n;globalThis.__sca = { _scaTomDoBipe, _scaErroDoBipe, _scaEhInterceptados, _scaCelulaEntregador, _scaRotuloGrupo, _scaRotuloAlvo };";

const contexto = vm.createContext({ globalThis: undefined, console });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "shopee-atribuicoes.js" });
const api = contexto.__sca;

/** Resposta de um bipe, no formato que o servidor devolve. */
function bipe(sobre) {
    return Object.assign({
        codigo: "BR0000000000001", resultado: "ok", esperado: "C-01", encontrado: "C-01",
        status_pedido: "Hub_Received", status_ok: true,
    }, sobre);
}

// ───── tom do bipe ─────

test("status que não é Hub_Received NÃO é erro", () => {
    // O bug: status_ok=false (não é Hub_Received) apitava erro em amarelo.
    for (const s of ["Delivering", "In_Transit", "On_Hold", "Processed", "Assigned"]) {
        const d = bipe({ status_pedido: s, status_ok: false });
        assert.strictEqual(api._scaTomDoBipe(d), "ok", `status ${s} deveria conferir normalmente`);
    }
});

test("sem status conhecido também confere normalmente", () => {
    assert.strictEqual(api._scaTomDoBipe(bipe({ status_pedido: null, status_ok: null })), "ok");
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

// ───── bipe recusado pelo servidor ─────

test("bipe recusado por retorno vira erro vermelho com a instrução do servidor", () => {
    // O servidor já manda o rótulo pronto (DD/MM) dentro do texto de erro — a tela só exibe.
    const d = { pedido_retido: true, status: "Return_Hub_Received",
        error: "Pedido retido (Return_Hub_Received) — favor não expedir. Bipe na conferência do cluster Interceptados 27/09." };
    const r = api._scaErroDoBipe("BR0000000000001", d);
    assert.strictEqual(r.tipo, "erro");
    assert.ok(r.html.startsWith("⛔"), "começa com o ⛔");
    assert.ok(r.html.includes("BR0000000000001"));
    assert.ok(r.html.includes("favor não expedir"));
    assert.ok(r.html.includes("Interceptados 27/09"));
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

// ───── clusters forçados Interceptados <dia> ─────

test("reconhece um grupo Interceptados <dia>, em qualquer caixa", () => {
    assert.strictEqual(api._scaEhInterceptados("Interceptados 2026-09-27"), true);
    assert.strictEqual(api._scaEhInterceptados("  INTERCEPTADOS 2026-09-27 "), true);
    assert.strictEqual(api._scaEhInterceptados("interceptados 2026-09-27"), true);
    assert.strictEqual(api._scaEhInterceptados("C-01"), false);
    assert.strictEqual(api._scaEhInterceptados("Interceptados"), false, "sem o dia não é um grupo válido");
    assert.strictEqual(api._scaEhInterceptados(""), false);
    assert.strictEqual(api._scaEhInterceptados(null), false);
});

test("rótulo troca o ISO por DD/MM", () => {
    assert.strictEqual(api._scaRotuloGrupo("Interceptados 2026-09-27"), "Interceptados 27/09");
    assert.strictEqual(api._scaRotuloGrupo("Interceptados 2026-01-05"), "Interceptados 05/01");
    assert.strictEqual(api._scaRotuloGrupo("C-01"), "C-01", "nome comum passa direto");
});

test("rótulo de alvo formata cada nome de uma lista junta por vírgula", () => {
    assert.strictEqual(
        api._scaRotuloAlvo("C-02, Interceptados 2026-09-27, Interceptados 2026-09-30"),
        "C-02, Interceptados 27/09, Interceptados 30/09"
    );
    assert.strictEqual(api._scaRotuloAlvo("C-01"), "C-01");
    assert.strictEqual(api._scaRotuloAlvo(""), "");
});

test("o Interceptados não tem botão de atribuir entregador", () => {
    const celula = api._scaCelulaEntregador("Interceptados 2026-09-27", "Interceptados 2026-09-27");
    assert.ok(!celula.includes("atribuir"), "não pode oferecer '+ atribuir'");
    assert.ok(!celula.includes("button"), "não pode ter botão nenhum");
});

test("um cluster comum continua com o botão de atribuir", () => {
    const celula = api._scaCelulaEntregador("C-01", "C-01");
    assert.ok(celula.includes("atribuir"));
});
