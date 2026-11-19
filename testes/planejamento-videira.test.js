// Testes de js/planejamento-videira.js — o aviso de formato do "Inserir Entregador",
// o agrupamento da visão "Por Entregador" e a folha do "Imprimir rota".
// O que se protege: o aviso enquanto digita tem que concordar com a regra do servidor
// (modules/planejamento/usuarios.js no backend). Se a tela disser "Formato certo." pra
// algo que o servidor recusa — ou o contrário — quem planeja fica sem entender o porquê.
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "planejamento-videira.js"), "utf8");

const ACESSOR = `
;globalThis.__p = {
  modelo: (t) => _PV_RE_MODELO.test(t.replace(/\\s+/g, " ").trim()),
  porTransportadora: _PV_POR_TRANSPORTADORA,
  transportadora: _pvTransportadora,
  agrupar: (l) => JSON.stringify(_pvAgrupar(l)),
  folha: _pvHtmlImpressao,
};`;

function carregar() {
  const ctx = vm.createContext({
    console,
    window: { addEventListener() {} },
    document: { addEventListener() {}, getElementById: () => ({ style: {} }) },
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "planejamento-videira.js" });
  return ctx.__p;
}

test("o planejamento abre no geral, com o por transportadora desligado", () => {
  const p = carregar();
  assert.strictEqual(p.porTransportadora, false);
  assert.strictEqual(p.transportadora, "geral");
});

test("aceita o modelo Nome Sobrenome - Cidade, com o que é só digitação", () => {
  const p = carregar();
  for (const nome of [
    "Ana Teste - Videira",
    "ana teste da silva - rio das antas",
    "Ana Teste-Videira",
    "  Ana   Teste  -  Videira ",
    "João D'Ávila Teste - Caçador",
  ]) {
    assert.ok(p.modelo(nome), JSON.stringify(nome) + " deveria passar");
  }
});

test("recusa o que o servidor também recusa", () => {
  const p = carregar();
  for (const nome of [
    "Ana Teste",
    "Ana - Videira",
    "Ana Teste 2 - Videira",
    "Ana Teste - Videira 1",
    "Ana Teste - Videira - SC",
    "Ana Teste -",
  ]) {
    assert.ok(!p.modelo(nome), JSON.stringify(nome) + " deveria ser recusado");
  }
});

// ───── Por Entregador e Imprimir rota ─────

const LINHAS = [
  { linha: 2, bairro: "Centro TESTE", sigla: "C-10", entregador: "Bruno Teste" },
  { linha: 3, bairro: "Vila TESTE", sigla: "C-2", entregador: "Bruno Teste" },
  { linha: 4, bairro: "Sem Sigla TESTE", sigla: "", entregador: "Bruno Teste" },
  { linha: 5, bairro: "Alto TESTE", sigla: "C-01", entregador: "Ana Teste" },
  { linha: 6, bairro: "Rural TESTE", sigla: "C-05", entregador: "" },
];

test("agrupa por entregador em ordem alfabética, e os bairros pela sigla (C-2 antes de C-10)", () => {
  // Volta como texto: objeto criado dentro do vm tem outro protótipo e o deepStrictEqual recusa.
  const { grupos, vazios } = JSON.parse(carregar().agrupar(LINHAS));
  assert.deepStrictEqual(grupos.map((g) => g.nome), ["Ana Teste", "Bruno Teste"]);
  // Sigla numérica em ordem de número; bairro sem sigla vai pro fim.
  assert.deepStrictEqual(grupos[1].itens.map((i) => i.bairro), ["Vila TESTE", "Centro TESTE", "Sem Sigla TESTE"]);
  assert.deepStrictEqual(vazios.map((i) => i.bairro), ["Rural TESTE"]);
});

test("a folha tem um bloco por entregador, com o pendente no fim", () => {
  const html = carregar().folha(LINHAS, "Caçador", "19/11/2026 10:00", "");
  assert.match(html, /Planejamento de Rotas — Caçador/);
  assert.match(html, /5 bairros · 2 entregadores · 1 sem entregador/);
  assert.strictEqual((html.match(/<tbody/g) || []).length, 3);
  assert.ok(html.indexOf("Bruno Teste") < html.indexOf("Sem entregador"));
  // O nome ocupa todas as linhas do bloco dele.
  assert.match(html, /rowspan="3"><b>Bruno Teste<\/b><small>3 bairros<\/small>/);
  assert.match(html, /@page \{ size: A4 portrait/);
});

test("a folha diz o filtro quando imprime só parte", () => {
  const html = carregar().folha(LINHAS.slice(0, 1), "Videira", "19/11/2026 10:00", "centro");
  assert.match(html, /1 bairro · 1 entregador · filtro: “centro”/);
});

test("nome vindo da planilha nunca vira HTML na folha", () => {
  const html = carregar().folha([{ linha: 2, bairro: "<b>x</b>", sigla: "C-1", entregador: "<img src=x onerror=alert(1)>" }],
    "Caçador", "19/11/2026 10:00", "");
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});
