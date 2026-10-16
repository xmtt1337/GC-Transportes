// Filtro de coluna (col-filtro.js): o popover é fixo na janela e fecha quando a página
// rola — se nascer pra fora da tela, não tem como alcançar o OK (foi o que aconteceu na
// tabela do Criar Fechamento, com o funil perto do pé da tela). Números de janela
// inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "col-filtro.js"), "utf8"), ctx);
    return ctx;
}
const pos = (ctx, ...a) => JSON.parse(JSON.stringify(ctx.colfPosicao(...a)));
const JANELA = { w: 1900, h: 1000 };

test("cabe embaixo: abre embaixo do funil, sem rolagem", () => {
    const ctx = carregar();
    assert.deepStrictEqual(pos(ctx, { top: 100, bottom: 120, left: 500 }, 330, 240, JANELA), { top: 126, left: 500, maxHeight: null });
});

test("funil perto do pé da tela: abre pra cima, inteiro", () => {
    const ctx = carregar();
    const p = pos(ctx, { top: 920, bottom: 940, left: 540 }, 330, 240, JANELA);
    assert.strictEqual(p.top, 920 - 6 - 330);
    assert.strictEqual(p.maxHeight, null);
    assert.ok(p.top + 330 <= JANELA.h, "não passa do fim da tela");
});

test("não cabe em lugar nenhum: fica no lado maior, dentro da tela, com rolagem", () => {
    const ctx = carregar();
    // Mais espaço embaixo (funil alto na tela): desce, com rolagem até o pé.
    let p = pos(ctx, { top: 200, bottom: 220, left: 10 }, 500, 240, { w: 800, h: 600 });
    assert.strictEqual(p.top, 226);
    assert.strictEqual(p.maxHeight, 600 - 220 - 6 - 8);
    assert.ok(p.top + p.maxHeight <= 600);
    // Mais espaço em cima: sobe a partir do topo, sem cobrir o funil.
    p = pos(ctx, { top: 400, bottom: 420, left: 10 }, 500, 240, { w: 800, h: 600 });
    assert.strictEqual(p.top, 8);
    assert.strictEqual(p.maxHeight, 400 - 6 - 8);
    assert.ok(p.top + p.maxHeight <= 400);
});

test("funil na borda direita: não sai pela lateral", () => {
    const ctx = carregar();
    assert.strictEqual(pos(ctx, { top: 100, bottom: 120, left: 1850 }, 300, 240, JANELA).left, 1900 - 240 - 8);
});
