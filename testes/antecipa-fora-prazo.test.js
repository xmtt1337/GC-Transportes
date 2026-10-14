// Testes da liberação "Antecipa fora do prazo" (users.antecipa_fora_prazo).
//
// Depois da data limite o card de "prazo encerrado" esconde o form. Pro entregador que o
// dev liberou, o form tem que aparecer — senão a liberação existe no banco e não serve de
// nada. Também protege que o botão do menu é só de dev e manda o campo certo no PATCH.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonteJs = fs.readFileSync(path.join(__dirname, "..", "js", "antecipacoes.js"), "utf8");
const coreJs = fs.readFileSync(path.join(__dirname, "..", "js", "core.js"), "utf8");
const usuariosJs = fs.readFileSync(path.join(__dirname, "..", "js", "usuarios.js"), "utf8");

function renderizar(gcUser) {
    const card = { innerHTML: "" };
    const form = { style: { display: "none" } };
    const ctx = {
        window: { _gcUser: gcUser },
        document: { getElementById: id => ({ "ant-status-card": card, "ant-form-wrap": form }[id] || null) },
        moedaJS: v => String(v),
        Date, Math, String, parseFloat,
    };
    vm.createContext(ctx);
    vm.runInContext(fonteJs + "\n;globalThis.__render = _antRenderStatusCard;", ctx);
    // Junho/2026 2ª quinzena: limite foi 28/07/2026 — hoje (out/2026) já passou.
    ctx.__render(6, 2026, 2, "2026-07-01", false, 0, null, false);
    return { card, form };
}

test("sem liberação: prazo encerrado esconde o form", () => {
    const { card, form } = renderizar({ role: "entregador" });
    assert.match(card.innerHTML, /Prazo de antecipação encerrado/);
    assert.strictEqual(form.style.display, "none");
});

test("com liberação: form aparece com aviso de fora do prazo", () => {
    const { card, form } = renderizar({ role: "entregador", antecipaForaPrazo: true });
    assert.match(card.innerHTML, /liberada fora do prazo/);
    assert.match(card.innerHTML, /28\/07\/2026/);
    assert.strictEqual(form.style.display, "");
});

test("core.js guarda a flag do /perfil no _gcUser", () => {
    assert.match(coreJs, /antecipaForaPrazo: !!data\.usuario\.antecipa_fora_prazo/);
});

test("menu de Cadastros: só dev vê e o PATCH manda antecipa_fora_prazo", () => {
    assert.match(usuariosJs, /const podeForaPrazo = podeAnotar;/);
    assert.ok(usuariosJs.includes("JSON.stringify({ antecipa_fora_prazo: valor })"));
    assert.ok(usuariosJs.includes("_toggleAntecipaForaPrazo(${u.id},${!u.antecipa_fora_prazo},this.dataset.nome)"));
});
