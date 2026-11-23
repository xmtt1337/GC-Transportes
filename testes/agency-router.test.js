// Testes de js/agency-router.js — a tela do que a SPX manda pelo Agency Router.
//
// O que se protege: serviço, campo e valor de status vêm do payload da Shopee,
// não de nós. Têm que sair escapados no HTML, e o clique de filtro passa o
// ÍNDICE da linha, nunca o texto (uma aspa no valor quebraria o onclick).
// Também: a query da lista leva o filtro certo — serviço vazio é filtro de
// verdade ("sem serviço"), valor só vai junto com o campo.
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "agency-router.js"), "utf8");

const ACESSOR = `
;globalThis.__a = {
  estado: _ar,
  query: (e) => _arQuery(e),
  html: () => _htmlAgencyRouter(),
  lista: () => _htmlLista(),
};`;

function carregar() {
  const ctx = vm.createContext({
    console, URLSearchParams,
    API: "https://api.exemplo",
    document: { getElementById: () => ({ innerHTML: "", scrollIntoView() {} }) },
    _esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    _fmtData: (d) => (d ? String(d) : "—"),
    skLogo: () => "",
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "agency-router.js" });
  return ctx.__a;
}

const MALDADE = `x'"><img src=x onerror=alert(1)>`;

function preencher(a) {
  Object.assign(a.estado, {
    situacao: { segredo_configurado: true, agency_id: "123", endpoint: "/e",
                recebidos: 10, recusas_7_dias: [], recusas_total: 0 },
    resumo: {
      periodo: "hoje", total: 3,
      por_servico: [{ data_type: 3, servico: MALDADE, disparos: 3, itens: 9 }],
      status: [{ data_type: 3, servico: MALDADE, campo: MALDADE, valor: MALDADE,
                 ocorrencias: 9, disparos: 3 }],
    },
    lista: {
      total: 1, pagina: 1, limite: 50,
      itens: [{ id: "7", data_type: 3, servico: MALDADE, recebido_em: "2026-01-01",
                itens: 2, referencia: MALDADE, referencia_campo: MALDADE,
                status: [{ campo: MALDADE, valor: MALDADE, n: 2 }] }],
    },
  });
}

test("texto vindo da SPX sai escapado na tela inteira", () => {
  const a = carregar();
  preencher(a);
  const html = a.html();
  assert.ok(!html.includes("<img"), "nenhuma tag do payload pode virar HTML");
  assert.ok(html.includes("&lt;img"), "o texto aparece, escapado");
});

test("filtro por clique passa o índice, nunca o valor do payload", () => {
  const a = carregar();
  preencher(a);
  const html = a.html();
  assert.ok(html.includes("_arFiltrarServico(0)"));
  assert.ok(html.includes("_arFiltrarStatus(0)"));
  const onclicks = html.match(/onclick="[^"]*"/g) || [];
  for (const o of onclicks) assert.ok(!o.includes("onerror"), o);
});

test("query: sem filtro, só o período", () => {
  const a = carregar();
  assert.strictEqual(a.query({ pagina: 1 }), "periodo=hoje&pagina=1");
});

test("query: serviço vazio vai como filtro (é o 'sem serviço')", () => {
  const a = carregar();
  Object.assign(a.estado, { tipo: 1, servico: "" });
  const q = new URLSearchParams(a.query());
  assert.strictEqual(q.get("tipo"), "1");
  assert.strictEqual(q.get("servico"), "");
  assert.ok(!q.has("campo"));
});

test("query: valor do status só vai junto com o campo", () => {
  const a = carregar();
  Object.assign(a.estado, { tipo: null, servico: null, campo: null, valor: "Delivered" });
  assert.ok(!new URLSearchParams(a.query()).has("valor"));
  Object.assign(a.estado, { campo: "order_status", valor: "Delivered" });
  const q = new URLSearchParams(a.query());
  assert.strictEqual(q.get("campo"), "order_status");
  assert.strictEqual(q.get("valor"), "Delivered");
});

test("paginação: 'Próximos' desliga na última página", () => {
  const a = carregar();
  preencher(a);
  a.estado.lista = { total: 60, pagina: 2, limite: 50,
    itens: Array.from({ length: 10 }, (_, i) => ({ id: String(i), data_type: 2, servico: "trip_info",
      itens: 1, status: [], referencia: "LT" + i })) };
  const html = a.lista();
  assert.ok(html.includes("51–60 de 60"));
  assert.match(html, /_arPagina\(1\)" disabled/);
  assert.doesNotMatch(html, /_arPagina\(-1\)" disabled/);
});
