// Baixas da Total Express oculta: nenhum cargo vê o menu nem o card da tela inicial,
// mas a tela continua abrindo pela URL (link salvo não quebra e o histórico segue lá).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ler = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");

test("nenhum cargo mostra o menu de Baixas", () => {
    const core = ler("js", "core.js");
    assert.ok(!core.includes('show("menu-baixas")'));
    assert.ok(!core.includes('show("submenu-baixas")'));
});

test("o menu nasce escondido", () => {
    assert.match(ler("index.html"), /id="menu-baixas"[^>]*style="display:none"/);
});

test("a tela inicial não oferece a Baixas", () => {
    assert.ok(!ler("js", "admin.js").includes("abrirBaixaTotalExpress"));
});

test("a rota continua abrindo a tela", () => {
    assert.ok(ler("js", "router.js").includes('"Baixas/TotalExpress":           () => abrirBaixaTotalExpress()'));
});
