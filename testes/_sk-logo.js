// O skLogo de verdade (core.js), pra rodar no vm dos testes que carregam só a tela.
// Sem ele, toda tela que mostra o carregando quebra com "skLogo is not defined".
const fs = require("node:fs");
const path = require("node:path");

const core = fs.readFileSync(path.join(__dirname, "..", "js", "core.js"), "utf8");
const ini = core.indexOf("function skLogo");
const fim = core.slice(ini).search(/\r?\n\}\r?\n/);
module.exports = core.slice(ini, ini + fim) + "\n}\n";
