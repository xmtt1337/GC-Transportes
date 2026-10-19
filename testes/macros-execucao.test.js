// Testes de js/macros-execucao.js — a tela "Em execução" dos Macros.
//
// O que se protege:
//   - os "há X" andando sozinhos NÃO redesenham a tela (redesenhar a cada 4s fechava/rolava o
//     log que a pessoa está lendo): a assinatura ignora os tempos e muda com o que importa;
//   - admin só enxerga o Colador (o servidor já filtra; a tela não oferece o resto no filtro);
//   - texto que vem das máquinas nunca vira HTML;
//   - o computador com vigia mas sem relatório aparece pedindo pra atualizar a extensão.
//
// Script carregado num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "macros-execucao.js"), "utf8");

const ACESSOR = `
;globalThis.__m = {
  assinatura: (d) => _mexAssinatura(d),
  duracao: (s) => _mexDuracao(s),
  quando: (q) => _mexQuando(q),
  visiveis: () => _mexMacrosVisiveis(),
  cartao: (a) => _mexCartaoHtml(a),
  set dados(v) { _mexDados = v; _mexRecebidoEm = Date.now(); },
  computadoresHtml: () => _mexComputadoresHtml(),
  filtrosHtml: (r) => _mexFiltrosHtml(r),
};`;

function carregar(role = "dev") {
  const ctx = vm.createContext({
    console, window: { _gcUser: { role } },
    document: { getElementById: () => null, querySelectorAll: () => [] },
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros-execucao.js" });
  return ctx.__m;
}

const ABA = (extra = {}) => Object.assign({
  aba: "7", maquina: "PC1", macro: "pedidos", estado: "rodando", passo: "2/5", xpt: "XPT_CFC",
  rodando_ha_s: 30, linhas: [{ em: 1, tipo: "passo", texto: "2/5" }],
}, extra);

test("assinatura ignora os tempos que andam sozinhos", () => {
  const m = carregar();
  const a = { abas: [ABA({ rodando_ha_s: 30 })], maquinas: [{ nome: "PC1", online: true, visto_ha_s: 3 }], alertas: [] };
  const b = { abas: [ABA({ rodando_ha_s: 34 })], maquinas: [{ nome: "PC1", online: true, visto_ha_s: 7 }], alertas: [] };
  assert.strictEqual(m.assinatura(a), m.assinatura(b));
});

test("assinatura muda com passo novo, linha nova ou maquina caindo", () => {
  const m = carregar();
  const base = { abas: [ABA()], maquinas: [{ nome: "PC1", online: true }], alertas: [] };
  const passo = { ...base, abas: [ABA({ passo: "3/5" })] };
  const linha = { ...base, abas: [ABA({ linhas: [{ em: 1, tipo: "passo", texto: "2/5" }, { em: 2, tipo: "nota", texto: "x" }] })] };
  const caiu = { ...base, maquinas: [{ nome: "PC1", online: false }] };
  for (const outro of [passo, linha, caiu]) assert.notStrictEqual(m.assinatura(base), m.assinatura(outro));
});

test("duracao e data no jeito que se le", () => {
  const m = carregar();
  assert.strictEqual(m.duracao(42), "42s");
  assert.strictEqual(m.duracao(97), "1min 37s");
  assert.strictEqual(m.duracao(3725), "1h 02min");
  assert.strictEqual(m.quando("2026-10-19 15:02:08.284"), "19/10 · 15:02");
});

test("admin so ve o Colador no filtro; dev ve tudo", () => {
  assert.deepStrictEqual([...carregar("admin").visiveis()], ["recebimento", "at_cluster"]);
  assert.strictEqual(carregar("dev").visiveis().length, 5);
  assert.ok(!carregar("admin").filtrosHtml([]).includes("Backlog"));
});

test("texto vindo da maquina nunca vira HTML", () => {
  const m = carregar();
  const html = m.cartao(ABA({ passo: "<img src=x onerror=alert(1)>", maquina: "<b>PC</b>",
    linhas: [{ em: 1, tipo: "nota", texto: "<script>x</script>" }] }));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<b>PC</b>"));
});

test("computador com vigia mas sem relatorio pede pra atualizar a extensao", () => {
  const m = carregar();
  m.dados = { abas: [], maquinas: [], alertas: [], ouvindo: [{ nome: "LEANDROXM", online: true, visto_ha_s: 10 }] };
  assert.match(m.computadoresHtml(), /LEANDROXM[\s\S]*atualize pra 3\.36/);
});

test("rodando sem XPT aparece como XPT desconhecido", () => {
  const m = carregar();
  assert.match(m.cartao(ABA({ xpt: null })), /XPT desconhecido/);
});
