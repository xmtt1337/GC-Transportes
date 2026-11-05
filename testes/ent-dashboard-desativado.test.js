// Dashboard do entregador desativado (05/11/2026): some do menu e do Início; link antigo abre o Meus Fechamentos.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ler = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("menu e atalho do Início não abrem mais o dashboard do entregador", () => {
    assert.doesNotMatch(ler("index.html"), /onclick="abrirEntDashboard/);
    assert.doesNotMatch(ler("js/admin.js"), /fn: "abrirEntDashboard\(\)"/);
});

test("link antigo /Fechamentos/Dashboard cai no Meus Fechamentos", () => {
    assert.match(ler("js/router.js"), /"Fechamentos\/Dashboard":\s*\(\) => abrirFechamentos\(\)/);
});
