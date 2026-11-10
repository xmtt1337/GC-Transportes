// Fechamento › Log de valores (js/fechamento-log.js): só dev; nomes escapados; por padrão só o
// líquido; cor pelo lado do entregador (desconto subir = vermelho). Dados de TESTE, inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-log.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const core = fs.readFileSync(path.join(__dirname, "..", "js", "core.js"), "utf8");

const D = {
    desde: "2026-11-09T10:00:00Z",
    campos: [["descontos", "Descontos"], ["liquido", "Líquido"]],
    linhas: [
        { entregador: "<b>Fulano</b> - Teste", campo: "descontos", antes: 0, depois: 10, acao: "Acréscimo/desconto", usuario: "Gestor Teste", em: "2026-11-09T12:00:00Z" },
        { entregador: "<b>Fulano</b> - Teste", campo: "liquido", antes: 100, depois: 90, acao: "Acréscimo/desconto", usuario: "Gestor Teste", em: "2026-11-09T12:00:00Z" },
        { entregador: "Beltrano - Teste", campo: "liquido", antes: 50, depois: 75.5, acao: "Recalculado", usuario: null, em: "2026-11-09T11:00:00Z" },
    ],
};

function carregar() {
    const els = {};
    const el = (id) => els[id] || (els[id] = { innerHTML: "", value: "", checked: false, style: {} });
    const ctx = { document: { getElementById: el }, Date, Number, Math, String, Object, Set, isNaN };
    vm.createContext(ctx);
    vm.runInContext(fonte, ctx);
    return { ctx, el };
}

test("só o líquido por padrão; nomes escapados; cor: líquido caiu vermelho, subiu verde", () => {
    const { ctx, el } = carregar();
    vm.runInContext("_lvDados = " + JSON.stringify(D) + "; _lvDesenhar();", ctx);
    const h = el("lv-lista").innerHTML;
    assert.doesNotMatch(h, /<b>Fulano/);
    assert.match(h, /&lt;b&gt;Fulano/);
    assert.doesNotMatch(h, />Descontos</, "sem 'todos os campos' só o líquido");
    assert.match(h, /cft-neg">-10,00/);
    assert.match(h, /fs-pos">\+25,50/);
    assert.match(h, /Registrando desde/);
});

test("todos os campos + filtro de entregador; desconto subir é vermelho", () => {
    const { ctx, el } = carregar();
    el("lv-todos").checked = true;
    el("lv-ent").value = "<b>Fulano</b> - Teste";
    vm.runInContext("_lvDados = " + JSON.stringify(D) + "; _lvDesenhar();", ctx);
    const h = el("lv-lista").innerHTML;
    assert.match(h, />Descontos</);
    assert.match(h, /cft-neg">\+10,00/);
    assert.doesNotMatch(h, /Beltrano/);
});

test("menu escondido e liberado só no bloco do dev", () => {
    assert.match(html, /<li id="menu-item-log-valores" style="display:none">/);
    const i = core.indexOf('show("menu-item-log-valores")');
    assert.ok(i > 0);
    assert.ok(core.lastIndexOf('if (role === "dev") {', i) > core.lastIndexOf('if (role === "finance") {', i), "dentro do if do dev");
});

test("aba Extravios: entrou/saiu/mudou com código, valores e detalhe; nome escapado; filtro de entregador", () => {
  const { ctx, el } = carregar();
  const ext = {
    conferido_em: "2026-11-10T12:00:00Z", rotulos: { valor: "Valor", data_desconto: "Data desconto" },
    linhas: [
      { tipo: "entrou", codigo: "BR0001", entregador: "<i>Fulano</i> - Teste", status: "Extraviado", transportadora: "Shopee", valor_antes: null, valor_depois: 49.9, campos: [], em: "2026-11-10T12:00:00Z" },
      { tipo: "mudou", codigo: "BR0002", entregador: "Beltrano - Teste", status: "Multa", transportadora: "Anjun", valor_antes: 10, valor_depois: 20,
        campos: [{ campo: "valor", antes: 10, depois: 20 }], em: "2026-11-10T12:00:00Z" },
      { tipo: "saiu", codigo: "BR0003", entregador: "Beltrano - Teste", status: "Extraviado", transportadora: "Imile", valor_antes: 5, valor_depois: null, campos: [], em: "2026-11-10T12:00:00Z" },
    ],
  };
  vm.runInContext("_lvAba = 'extravios'; _lvExt = " + JSON.stringify(ext) + "; _lvDesenhar();", ctx);
  let h = el("lv-lista").innerHTML;
  assert.doesNotMatch(h, /<i>Fulano/);
  assert.match(h, /&lt;i&gt;Fulano/);
  assert.match(h, /cft-neg">Entrou/);
  assert.match(h, /fs-pos">Saiu/);
  assert.match(h, /Valor: 10 → 20/);
  assert.match(h, /49,90/);
  assert.match(el("lv-abas").innerHTML, /cft-chip on" onclick="_lvTrocarAba\('extravios'\)/);
  el("lv-ent").value = "Beltrano - Teste";
  vm.runInContext("_lvDesenhar();", ctx);
  h = el("lv-lista").innerHTML;
  assert.doesNotMatch(h, /BR0001/);
  assert.match(h, /2 mudança/);
});
