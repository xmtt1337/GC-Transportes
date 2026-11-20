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
  atribuicoes: (l, t) => JSON.stringify(_pvAtribuicoes(l, t)),
  // Data montada dentro do vm (o Date de fora é de outro "mundo" pro toLocaleDateString).
  diaDaRota: (a, m, d, h) => JSON.stringify(_pvDiaDaRota(new Date(a, m - 1, d, h || 0))),
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

test("a rota impressa é a do dia seguinte, com o dia da semana", () => {
  // Quinta 19/11/2026 → sexta 20/11/2026, a qualquer hora do dia.
  const p = carregar();
  assert.deepStrictEqual(JSON.parse(p.diaDaRota(2026, 11, 19, 8)), { longo: "sexta-feira, 20/11/2026", curto: "20-11-2026" });
  assert.deepStrictEqual(JSON.parse(p.diaDaRota(2026, 11, 19, 23)), { longo: "sexta-feira, 20/11/2026", curto: "20-11-2026" });
});

test("o dia seguinte vira o mês e o ano", () => {
  const p = carregar();
  assert.strictEqual(JSON.parse(p.diaDaRota(2026, 11, 30)).curto, "01-12-2026");
  assert.strictEqual(JSON.parse(p.diaDaRota(2026, 12, 31)).curto, "01-01-2027");
  assert.strictEqual(JSON.parse(p.diaDaRota(2028, 2, 28)).curto, "29-02-2028");
});

test("a folha mostra o dia da rota em destaque e no nome do arquivo", () => {
  const html = carregar().folha(LINHAS, "Caçador", "19/11/2026 17:30", "",
    { longo: "sexta-feira, 20/11/2026", curto: "20-11-2026" });
  assert.match(html, /<div class="dia">Rota de sexta-feira, 20\/11\/2026<\/div>/);
  assert.match(html, /<title>Rota Caçador 20-11-2026<\/title>/);
  assert.match(html, /Impresso em 19\/11\/2026 17:30/);
});

// ───── Planejamento por transportadora (Videira) ─────

const TRANSPS = [
  { chave: "shopee", rotulo: "Shopee" }, { chave: "imile", rotulo: "Imile" }, { chave: "anjun", rotulo: "Anjun" },
  { chave: "loggi", rotulo: "Loggi" }, { chave: "total_express", rotulo: "Total Express" },
];
const vazias = () => ({ shopee: "", imile: "", anjun: "", loggi: "", total_express: "" });

test("sem lista de transportadoras (Caçador) as linhas passam como vieram", () => {
  assert.deepStrictEqual(JSON.parse(carregar().atribuicoes(LINHAS, null)), LINHAS);
});

test("bairro com troca em duas transportadoras vira 'menos' pra todas e 'só' pro outro", () => {
  const linhas = [{ linha: 2, bairro: "Centro TESTE", sigla: "V-01", entregador: "Ana Teste",
    transportadoras: { ...vazias(), loggi: "Bruno Teste", imile: "Bruno Teste" } }];
  const itens = JSON.parse(carregar().atribuicoes(linhas, TRANSPS));
  assert.deepStrictEqual(itens.map((i) => [i.entregador, i.escopo, i.transp || null]), [
    ["Bruno Teste", "só Imile, Loggi", ["imile", "loggi"]],
    ["Ana Teste", "menos Imile, Loggi", null],
  ]);
});

test("transportadora com o mesmo nome da 'todas' não conta como troca", () => {
  const linhas = [{ linha: 2, bairro: "Centro TESTE", sigla: "V-01", entregador: "Ana Teste",
    transportadoras: { ...vazias(), shopee: "Ana Teste" } }];
  const itens = JSON.parse(carregar().atribuicoes(linhas, TRANSPS));
  assert.strictEqual(itens.length, 1);
  assert.strictEqual(itens[0].escopo, undefined);
});

test("as cinco com dono próprio: a 'todas' não sobra pra ninguém", () => {
  const t = { shopee: "B", imile: "B", anjun: "C", loggi: "C", total_express: "C" };
  const itens = JSON.parse(carregar().atribuicoes([{ linha: 2, bairro: "X", sigla: "V-01", entregador: "Ana Teste", transportadoras: t }], TRANSPS));
  assert.deepStrictEqual(itens.map((i) => i.entregador).sort(), ["B", "C"]);
});

test("bairro sem 'todas' mas com uma transportadora: o resto fica pendente", () => {
  const itens = JSON.parse(carregar().atribuicoes([{ linha: 2, bairro: "X", sigla: "V-01", entregador: "",
    transportadoras: { ...vazias(), shopee: "Bruno Teste" } }], TRANSPS));
  assert.deepStrictEqual(itens.map((i) => [i.entregador, i.escopo]), [
    ["Bruno Teste", "só Shopee"],
    ["", "menos Shopee"],
  ]);
});

test("a folha conta bairros (não itens) e mostra em quais transportadoras", () => {
  const p = carregar();
  const linhas = [{ linha: 2, bairro: "Centro TESTE", sigla: "V-01", entregador: "Ana Teste",
    transportadoras: { ...vazias(), loggi: "Bruno Teste" } }];
  // O itens volta do vm como texto e é reconstruído aqui fora (outro protótipo).
  const html = p.folha(JSON.parse(p.atribuicoes(linhas, TRANSPS)), "Videira", "20/11/2026 10:00", "");
  assert.match(html, /1 bairro · 2 entregadores/);
  assert.match(html, /Centro TESTE <span class="esc">\(só Loggi\)<\/span>/);
  assert.match(html, /Centro TESTE <span class="esc">\(menos Loggi\)<\/span>/);
});
