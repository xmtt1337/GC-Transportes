// Testes do aviso de pedido de AT recusado, na tela do entregador.
//
// Quando o macro não consegue criar a AT, o pedido volta com status "erro" e o motivo.
// O que se protege aqui: o entregador ser avisado na hora (bipe + mensagem em cima), só
// pelo pedido que ACABOU de ser recusado - não por recusas antigas ao abrir a tela - e,
// quando o código não existe no SPX, a orientação ser conferir o código, não bipar de novo.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "solicitar-at.js"), "utf8");

function carregar() {
    const msg = { style: {}, innerHTML: "" };
    const bipes = [];
    // Relógio falso: o aviso some sozinho depois de alguns segundos.
    const timers = [];
    const ctx = {
        document: { getElementById: (id) => (id === "solat-msg" ? msg : { style: {} }) },
        setTimeout: (fn, ms) => { timers.push({ fn, ms, ativo: true }); return timers.length; },
        clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].ativo = false; },
        _gcBeepErro: () => bipes.push("erro"),
        _gcBeepSucesso: () => bipes.push("ok"),
        console,
    };
    vm.createContext(ctx);
    vm.runInContext(fonte, ctx);
    return { ctx, msg, bipes, timers };
}

const NAO_EXISTE = "Código não existe no SPX";

test("pedido que estava criando e voltou recusado: bipa e mostra o motivo", () => {
    const { ctx, msg, bipes } = carregar();
    ctx._solatAvisarRecusas(
        [{ id: 1, codigo: "BR000000000001X", status: "criando" }],
        [{ id: 1, codigo: "BR000000000001X", status: "erro", erro: NAO_EXISTE }],
    );
    assert.deepStrictEqual(bipes, ["erro"]);
    assert.match(msg.innerHTML, /BR000000000001X/);
    assert.match(msg.innerHTML, /Código não existe no SPX\. Confira o código\./);
});

test("recusa antiga (ja estava em erro ao abrir a tela) nao bipa", () => {
    const { ctx, bipes } = carregar();
    ctx._solatAvisarRecusas([], [{ id: 1, codigo: "BR000000000001X", status: "erro", erro: NAO_EXISTE }]);
    ctx._solatAvisarRecusas(
        [{ id: 1, codigo: "BR000000000001X", status: "erro", erro: NAO_EXISTE }],
        [{ id: 1, codigo: "BR000000000001X", status: "erro", erro: NAO_EXISTE }],
    );
    assert.deepStrictEqual(bipes, []);
});

test("criada nao avisa recusa", () => {
    const { ctx, bipes } = carregar();
    ctx._solatAvisarRecusas(
        [{ id: 1, codigo: "BR000000000001X", status: "criando" }],
        [{ id: 1, codigo: "BR000000000001X", status: "criada", at: "AT20261020TESTE" }],
    );
    assert.deepStrictEqual(bipes, []);
});

test("outra recusa do SPX continua orientando a bipar de novo", () => {
    const { ctx } = carregar();
    assert.strictEqual(
        ctx._solatTextoErro({ erro: "o SPX recusou o código na AT20261020TESTE: pedido já está em outra AT" }),
        "o SPX recusou o código na AT20261020TESTE: pedido já está em outra AT. Bipe de novo pra tentar outra vez.",
    );
    assert.strictEqual(ctx._solatTextoErro({}), "o SPX recusou o código. Bipe de novo pra tentar outra vez.");
});

test("pedido entregue ou ja na rua: mostra so o resumo, sem pedir pra bipar de novo", () => {
    const { ctx } = carregar();
    assert.strictEqual(ctx._solatTextoErro({ erro: 'Pedido com o status "entregue"' }), 'Pedido com o status "entregue"');
    assert.strictEqual(ctx._solatTextoErro({ erro: "Pedido já está na rua (em rota de entrega)" }), "Pedido já está na rua (em rota de entrega)");
    assert.strictEqual(ctx._solatTextoErro({ erro: "Esse pedido já está em uma AT" }), "Esse pedido já está em uma AT");
});

test("pedido de outra estacao: mostra o aviso e o atalho pra pedir a troca de polo", () => {
    const { ctx, msg } = carregar();
    const erro = "Esse pedido é de uma estação diferente da sua. Confirme o seu polo — se estiver errado, peça a troca de polo";
    vm.runInContext('_solatPolo = { polo: "videira", polo_label: "Videira", xpt: "XPT_VIA" };', ctx);
    ctx._solatAvisarRecusas(
        [{ id: 1, codigo: "BR000000000001X", status: "criando" }],
        [{ id: 1, codigo: "BR000000000001X", status: "erro", erro }],
    );
    assert.ok(msg.innerHTML.includes("estação diferente da sua"));
    assert.doesNotMatch(msg.innerHTML, /Bipe de novo/);
    assert.match(msg.innerHTML, /onclick="pcSolicitarPolo\(_solatPolo\.polo\)">Solicitar troca de polo/);
});

test("o aviso do cartao de bipagem some sozinho em 7 segundos", () => {
    const { ctx, msg, timers } = carregar();
    ctx._solatMsg("BR000000000001X na fila.", "ok");
    assert.strictEqual(msg.style.display, "");
    const ativos = timers.filter(t => t.ativo);
    assert.strictEqual(ativos.length, 1);
    assert.strictEqual(ativos[0].ms, 7000);
    ativos[0].fn();
    assert.strictEqual(msg.style.display, "none");
    assert.strictEqual(msg.innerHTML, "");
});

test("aviso novo reinicia a contagem: o anterior nao apaga o novo", () => {
    const { ctx, timers } = carregar();
    ctx._solatMsg("primeiro", "ok");
    ctx._solatMsg("segundo", "ok");
    assert.strictEqual(timers.filter(t => t.ativo).length, 1);
    assert.strictEqual(timers[0].ativo, false);
});

test("hora de criacao da AT sai no horario de Brasilia; sem hora, nada", () => {
    const { ctx } = carregar();
    assert.strictEqual(ctx._solatHora("2026-10-20T20:22:41Z"), "17:22");
    assert.strictEqual(ctx._solatHora(null), "");
    assert.strictEqual(ctx._solatHora("lixo"), "");
});
