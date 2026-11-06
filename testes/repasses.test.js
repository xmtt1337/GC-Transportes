// Tela Repasse para a equipe (js/repasses.js). O servidor decide tudo; aqui se protege que a
// tela não injeta HTML com nome vindo do banco, esconde o formulário em quinzena paga, só
// mostra o menu quando o servidor libera e não manda valor torto. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "repasses.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function carregar(extra = {}) {
    const els = {};
    const el = (id) => els[id] || (els[id] = { id, innerHTML: "", value: "", textContent: "", style: { display: "none" }, disabled: false,
        classList: { remove() {}, toggle() {} }, insertAdjacentHTML() {} });
    const chamadas = [];
    const ctx = {
        API: "https://api.teste", token: "t", document: { getElementById: el },
        fetch: (url, o) => { chamadas.push({ url, o }); return Promise.resolve({ ok: true, json: () => Promise.resolve(extra.resposta || {}) }); },
        gcConfirm: (msg, ok) => { chamadas.push({ confirm: msg }); ok(); }, gcAlert: () => {}, mostrarTela: () => {},
        Date, Number, String, isNaN, Promise, encodeURIComponent, parseInt,
    };
    vm.createContext(ctx);
    vm.runInContext(fonte, ctx);
    return { ctx, el, chamadas };
}

const DADOS = { liquido: 1000, antecipado: 0, repassado: 100, saldo: 900, fechada: false, pagamento: "2026-11-29",
    equipe: ["Beltrano - Exemplo", "<img src=x onerror=alert(1)> - Exemplo"],
    repasses: [{ id: 1, para_driver: "<b>Ciclano</b> - Exemplo", valor: 100, criado_em: "2026-11-06T12:00:00Z", cancelado_em: null }] };

test("nomes do banco vão escapados (sem HTML injetado)", () => {
    const { ctx, el } = carregar();
    ctx._rpDados = DADOS;
    vm.runInContext("_rpDados = " + JSON.stringify(DADOS) + "; _rpDesenhar();", ctx);
    const h = el("rp-conteudo").innerHTML;
    assert.doesNotMatch(h, /<img src=x|<b>Ciclano/);
    assert.match(h, /&lt;img src=x/);
    assert.match(h, /Disponível pra repassar: R\$ 900,00/);
    assert.match(h, /rpCancelar\(1\)/);
});

test("quinzena paga: sem formulário e sem cancelar", () => {
    const { ctx, el } = carregar();
    vm.runInContext("_rpDados = " + JSON.stringify({ ...DADOS, fechada: true }) + "; _rpDesenhar();", ctx);
    const h = el("rp-conteudo").innerHTML;
    assert.match(h, /já foi paga \(29\/11\/2026\)/);
    assert.doesNotMatch(h, /rp-enviar|rpCancelar/);
});

test("valor torto não sai da tela; valor certo vai pro servidor como digitado", () => {
    const { ctx, el, chamadas } = carregar();
    vm.runInContext("_rpDados = " + JSON.stringify(DADOS) + "; _rpQuinzena = 2;", ctx);
    el("rp-para").value = "Beltrano - Exemplo";
    for (const v of ["abc", "-5", "10,555", "1e3"]) {
        el("rp-valor").value = v;
        ctx.rpEnviar();
        assert.match(el("rp-msg").textContent, /Valor inválido/, v);
    }
    assert.ok(!chamadas.some((c) => c.o && c.o.method === "POST"));
    el("rp-valor").value = "150,00";
    ctx.rpEnviar();
    const post = chamadas.find((c) => c.o && c.o.method === "POST");
    assert.deepStrictEqual(JSON.parse(post.o.body).valor, "150,00");
    assert.strictEqual(JSON.parse(post.o.body).para, "Beltrano - Exemplo");
});

test("menu: escondido no HTML e só aparece quando o servidor libera", async () => {
    assert.match(html, /<li id="menu-ent-repasse" style="display:none">/);
    assert.match(html, /js\/repasses\.js\?v=/);
    for (const [pode, esperado] of [[true, ""], [false, "none"]]) {
        const { ctx, el } = carregar({ resposta: { pode } });
        el("menu-ent-repasse").style.display = "x";
        ctx.rpCarregarMenu();
        await new Promise((r) => setTimeout(r, 5));
        assert.strictEqual(el("menu-ent-repasse").style.display, esperado);
    }
});
