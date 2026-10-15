// Botões de aprovar/recusar em mensagem do atendimento (pedido de troca de polo).
//
// O que se protege: só o lado do suporte vê os botões, e só enquanto o pedido está
// pendente; quem pediu vê o status; decidido, os dois veem o resultado e quem decidiu;
// mensagem comum não ganha rodapé nenhum; e o nome de quem decidiu sai escapado.
//
// atendimento.js roda num contexto vm sem DOM. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "atendimento.js"), "utf8");
const ctx = vm.createContext({ console });
vm.runInContext(fonte, ctx);

const quando = new Date(2026, 9, 15, 10, 30).toISOString();
const pedido = (acao) => ({ id: 77, de: "usuario", autor: "Usuário Teste", texto: "📍 Pedido de troca de polo", criado_em: quando, acao });
const html = (m, lado) => ctx._atdHtmlConversa([m], lado);

test("suporte vê Aprovar e Recusar no pedido pendente", () => {
  const h = html(pedido({ tipo: "troca_polo", polo: "videira", status: "pendente" }), "suporte");
  assert.match(h, /_atdaDecidir\(77, true\)">Aprovar/);
  assert.match(h, /_atdaDecidir\(77, false\)">Recusar/);
});

test("quem pediu vê só o status, sem botão", () => {
  const h = html(pedido({ tipo: "troca_polo", polo: "videira", status: "pendente" }), "usuario");
  assert.doesNotMatch(h, /_atdaDecidir/);
  assert.match(h, /Aguardando o suporte/);
});

test("decidido: os dois lados veem o resultado e quem decidiu, sem botão", () => {
  for (const lado of ["suporte", "usuario"]) {
    const h = html(pedido({ tipo: "troca_polo", status: "aprovado", decidido_por: "Suporte Teste" }), lado);
    assert.doesNotMatch(h, /_atdaDecidir/, lado);
    assert.match(h, /atd-acao-status aprovado">Aprovado · Suporte Teste/, lado);
  }
  assert.match(html(pedido({ tipo: "troca_polo", status: "recusado" }), "suporte"), /Recusado/);
  assert.match(html(pedido({ tipo: "troca_polo", status: "substituido" }), "suporte"), /pedido mais novo/);
});

test("mensagem comum não tem rodapé", () => {
  assert.doesNotMatch(html(pedido(null), "suporte"), /atd-acao/);
});

test("nome de quem decidiu sai escapado", () => {
  const h = html(pedido({ tipo: "troca_polo", status: "recusado", decidido_por: "<img src=x>" }), "usuario");
  assert.doesNotMatch(h, /<img src=x>/);
});
