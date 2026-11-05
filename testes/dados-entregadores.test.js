// Testes da tela Cadastros > Dados entregadores.
//
// O que se protege: a busca ignora acento e procura em todas as colunas; os filtros "só quem
// preencheu" e "só sem chave Pix" funcionam; a linha mostra as colunas nos nomes da planilha,
// escapadas; a Origem diz se veio da planilha ou do entregador (e avisa quando a cópia pra
// planilha falhou); e o resumo da importação fala o que aconteceu.
//
// dados-entregadores.js roda num contexto vm. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
  const ctx = { console, window: {}, document: { getElementById: () => null } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "dados-entregadores.js"), "utf8"), ctx);
  return ctx;
}

const LINHAS = [
  { id_interno: "T001", usuarios: "João Teste", nome: "João Teste Souza", telefone: "(49) 98888-0000", chave_pix: "12345678909", preenchido_em: null, linha_planilha: 3 },
  { usuarios: "Maria Teste", nome: "Maria Teste da Silva", telefone: "49999990000", chave_pix: "maria@exemplo.com", email: "maria@exemplo.com", preenchido_em: "2026-11-05T15:00:00Z" },
  { usuarios: "Ana Teste", nome: "Ana Teste", telefone: "", chave_pix: null, preenchido_em: null },
];

const nomes = (ls) => ls.map((l) => l.usuarios).join(",");

test("busca sem acento e em qualquer coluna", () => {
  const c = carregar();
  assert.strictEqual(nomes(c.deFiltrarLinhas(LINHAS, { busca: "joao" })), "João Teste");
  assert.strictEqual(nomes(c.deFiltrarLinhas(LINHAS, { busca: "exemplo.com" })), "Maria Teste");
  assert.strictEqual(nomes(c.deFiltrarLinhas(LINHAS, { busca: "t001" })), "João Teste", "busca pelo ID");
  assert.strictEqual(c.deFiltrarLinhas(LINHAS, { busca: "" }).length, 3);
});

test("filtros: só quem preencheu e só sem chave Pix", () => {
  const c = carregar();
  assert.strictEqual(nomes(c.deFiltrarLinhas(LINHAS, { soRespostas: true })), "Maria Teste");
  assert.strictEqual(nomes(c.deFiltrarLinhas(LINHAS, { soSemPix: true })), "Ana Teste");
});

test("linha: ID primeiro, colunas na ordem da planilha, texto escapado, sem chave em âmbar", () => {
  const c = carregar();
  const html = c.deHtmlLinha({ ...LINHAS[2], usuarios: "<b>Ana</b>" });
  assert.ok(html.includes("&lt;b&gt;Ana&lt;/b&gt;"));
  assert.match(html, /sem chave/);
  assert.match(c.deHtmlLinha(LINHAS[0]), /data-rotulo="ID">T001</);
  const rotulos = [...html.matchAll(/data-rotulo="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(rotulos, ["ID", "Usuarios", "Telefone", "Nome", "Documento", "CNPJ", "Chave Pix", "Tipo Chave Pix", "E-mail", "Origem"]);
});

test("origem: planilha com a linha, entregador com a data e aviso se não copiou", () => {
  const c = carregar();
  assert.match(c.deHtmlOrigem(LINHAS[0]), /Planilha · linha 3/);
  const ent = c.deHtmlOrigem({ ...LINHAS[1], planilha_erro: "sem permissão" });
  assert.match(ent, /Entregador/);
  assert.match(ent, /não copiado pra planilha/);
  assert.doesNotMatch(c.deHtmlOrigem(LINHAS[1]), /não copiado/);
});

test("resumo da importação", () => {
  const c = carregar();
  const txt = c.deTextoImportacao({
    linhas_planilha: 90, novos: 1, atualizados: 4, sem_mudanca: 85, preservados: 2,
    cabecalho: ["Usuarios", "Telefone", "", "Nome"],
  });
  assert.match(txt, /90 linhas lidas da planilha: 1 novo, 4 atualizados, 85 sem mudança\./);
  assert.match(txt, /2 já preenchidos pelo entregador/);
  assert.match(txt, /Colunas da planilha: Usuarios, Telefone, Nome\./);
});

test("número puro ganha máscara; o que já veio formatado fica como está", () => {
  const c = carregar();
  assert.strictEqual(c.deFormatar("telefone", "49999990000"), "(49) 99999-0000");
  assert.strictEqual(c.deFormatar("telefone", "(49) 3555-0000"), "(49) 3555-0000");
  assert.strictEqual(c.deFormatar("documento", "12345678909"), "123.456.789-09");
  assert.strictEqual(c.deFormatar("documento", "11222333000181"), "11.222.333/0001-81");
  assert.strictEqual(c.deFormatar("cnpj", "11222333000181"), "11.222.333/0001-81");
  assert.strictEqual(c.deFormatar("telefone", null), "");
  assert.match(c.deHtmlLinha({ usuarios: "X Teste", tipo_chave_pix: "email" }), />E-mail</);
});

// ── Novos dados (histórico) ──

const ROTULOS = { chave_pix: "Chave Pix", telefone: "Telefone", tipo_chave_pix: "Tipo Chave Pix", documento: "Documento" };
const HIST = [
  { tipo: "novo", origem: "entregador", usuarios: "Maria Teste", quem: "Maria Teste - Caçador", criado_em: "2026-11-05T15:00:00Z",
    campos: [{ campo: "chave_pix", antes: null, depois: "maria@exemplo.com" }, { campo: "tipo_chave_pix", antes: null, depois: "email" }] },
  { tipo: "atualizado", origem: "planilha", usuarios: "João Teste", quem: "Financeiro Teste", id_interno: "T001", criado_em: "2026-11-05T16:00:00Z",
    campos: [{ campo: "telefone", antes: "49988880000", depois: "49977770000" }] },
  { tipo: "atualizado", origem: "entregador", usuarios: "Ana Teste", quem: "Ana Teste - Videira", campos: [] },
];

test("novos dados: filtro por tipo e busca por entregador, quem ou ID", () => {
  const c = carregar();
  assert.strictEqual(nomes(c.deFiltrarHistorico(HIST, { tipo: "novo" })), "Maria Teste");
  assert.strictEqual(nomes(c.deFiltrarHistorico(HIST, { tipo: "atualizado" })), "João Teste,Ana Teste");
  assert.strictEqual(nomes(c.deFiltrarHistorico(HIST, { busca: "financeiro" })), "João Teste");
  assert.strictEqual(nomes(c.deFiltrarHistorico(HIST, { busca: "joao" })), "João Teste");
  assert.strictEqual(nomes(c.deFiltrarHistorico(HIST, { busca: "t001" })), "João Teste");
});

test("novos dados: novo mostra o valor; atualizado mostra antes riscado → depois, com máscara", () => {
  const c = carregar();
  const novo = c.deHtmlMudancas(HIST[0], ROTULOS);
  assert.match(novo, /Chave Pix:<\/span> maria@exemplo\.com/);
  assert.match(novo, /Tipo Chave Pix:<\/span> E-mail/);
  const at = c.deHtmlMudancas(HIST[1], ROTULOS);
  assert.match(at, /de-mud-antes">\(49\) 98888-0000<\/span> → \(49\) 97777-0000/);
  assert.match(c.deHtmlMudancas(HIST[2], ROTULOS), /detalhe não guardado/);
});

test("novos dados: linha com tipo, quem e de onde veio, escapada", () => {
  const c = carregar();
  const html = c.deHtmlHistorico({ ...HIST[1], quem: "<b>X</b>" }, ROTULOS);
  assert.match(html, /de-tipo-atualizado">Atualizado/);
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt;/);
  assert.match(html, /importação da planilha/);
  assert.match(html, /ID T001/);
  assert.match(c.deHtmlHistorico(HIST[0], ROTULOS), /de-tipo-novo">Novo[\s\S]*pelo formulário/);
});
