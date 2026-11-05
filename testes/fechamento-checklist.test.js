// Fechamento › Check List: botão "Criar login" no entregador sem login. Nomes inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const chamadas = [];
    const ctx = {
        console, API: "http://api", token: "t",
        gcConfirm: (msg, ok) => { chamadas.push(["confirm", msg]); ok(); },
        gcAlert: (msg) => chamadas.push(["alert", msg]),
        gcSenhaGerada: (dados, titulo, texto) => { chamadas.push(["senha", dados, titulo, texto]); return Promise.resolve(); },
        fetch: (url, op) => { chamadas.push(["fetch", url, JSON.parse(op.body)]); return Promise.resolve({ json: () => ctx._resposta }); },
        document: { getElementById: () => ({ value: "1" }) },
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-checklist.js"), "utf8"), ctx);
    ctx._ckCarregar = () => chamadas.push(["recarregou"]);
    return { ctx, chamadas };
}
const D = { codigo_quinzena: "Q1Out", pendencias: 2, grupos: [
    { chave: "sem_cadastro", titulo: "Entregador do fechamento sem login no sistema", onde: "x", colunas: ["Entregador", "Situação"],
      itens: [["Fulano Teste - Vila Teste", "sem login de entregador"], ["Beltrano Teste - Morro", "login \"GC1\" desativado"]] },
    { chave: "sem_cidade", titulo: "Pacote sem cidade", onde: "y", colunas: ["Login"], itens: [["abc"]] },
] };

test("botão só em quem não tem login, e só no grupo sem cadastro", () => {
    const { ctx } = carregar();
    const html = ctx._ckHtml(D);
    assert.strictEqual((html.match(/Criar login/g) || []).length, 1);
    assert.match(html, /_ckCriarLogin\(0, this\)/);
});

test("cria com o nome do fechamento (já com a cidade) e mostra o card de usuário e senha", async () => {
    const { ctx, chamadas } = carregar();
    ctx._ckHtml(D);
    ctx._resposta = { username: "GC1234567", name: "Fulano Teste - Vila Teste", senha_temporaria: "abc123" };
    ctx._ckCriarLogin(0, { disabled: false, textContent: "" });
    await new Promise(r => setTimeout(r, 10));
    const f = chamadas.find(c => c[0] === "fetch");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(f[2])), { name: "Fulano Teste - Vila Teste", role: "entregador" });
    const s = chamadas.find(c => c[0] === "senha");
    assert.strictEqual(s[1].username, "GC1234567");
    assert.strictEqual(s[1].senha_temporaria, "abc123");
    // Copiar leva a mensagem pronta: primeiro nome, link do Meus Fechamentos, usuário e senha
    assert.strictEqual(s[3], "Olá, Fulano! Seu usuário para acessar o portal de fechamentos está pronto.\nAcesse: https://xmtt.com.br/Fechamentos/Meus\n\nUsuário: GC1234567\nSenha: abc123");
    assert.ok(chamadas.some(c => c[0] === "recarregou"));
});

test("nome já existente avisa o login que já tem", async () => {
    const { ctx, chamadas } = carregar();
    ctx._ckHtml(D);
    ctx._resposta = { duplicate: true, existing_username: "GC7654321", error: "Já existe" };
    ctx._ckCriarLogin(0, { disabled: false, textContent: "" });
    await new Promise(r => setTimeout(r, 10));
    assert.ok(chamadas.some(c => c[0] === "alert" && /GC7654321/.test(c[1])));
    assert.ok(!chamadas.some(c => c[0] === "senha"));
});
