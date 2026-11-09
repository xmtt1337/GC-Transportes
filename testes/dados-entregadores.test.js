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
  assert.deepStrictEqual(rotulos, ["ID", "Usuarios", "Telefone", "Nome", "Documento", "CPF", "CNPJ", "Chave Pix", "Tipo Chave Pix", "E-mail", "Origem"]);
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

test("linha: texto comprido corta com o valor inteiro no title; tipo da planilha em maiúsculas vira o rótulo", () => {
  const c = carregar();
  const html = c.deHtmlLinha({ usuarios: "Nome Bem Comprido Teste - Cidade", chave_pix: "chave-aleatoria-teste", tipo_chave_pix: "ALEATORIA" });
  assert.match(html, /class="cad-nome de-corta" data-rotulo="Usuarios" title="Nome Bem Comprido Teste - Cidade"/);
  assert.match(html, /data-rotulo="Chave Pix" title="chave-aleatoria-teste"/);
  assert.match(html, />Aleatória</);
  assert.match(c.deHtmlLinha({ usuarios: "X Teste", tipo_chave_pix: "TELEFONE" }), />Telefone</);
});

test("novos dados: e-mail copiado do login aparece com essa origem; importação conta os e-mails", () => {
  const c = carregar();
  const html = c.deHtmlHistorico({ tipo: "atualizado", origem: "usuario", usuarios: "Maria Teste", quem: "E-mail do login",
    campos: [{ campo: "email", antes: null, depois: "maria@exemplo.com" }] }, { email: "E-mail" });
  assert.match(html, /copiado do login/);
  assert.match(html, /E-mail:<\/span> maria@exemplo\.com/);
  assert.match(c.deTextoImportacao({ linhas_planilha: 1, novos: 0, atualizados: 0, sem_mudanca: 1, emails_do_login: 3 }), /3 e-mails copiados do login/);
});

test("CPF em coluna própria, com máscara; correção do sistema aparece com essa origem", () => {
  const c = carregar();
  assert.match(c.deHtmlLinha({ usuarios: "X Teste", documento: "11222333000181", cpf: "12345678909" }),
    /data-rotulo="Documento">11\.222\.333\/0001-81<\/td>\s*<td class="cad-num" data-rotulo="CPF">123\.456\.789-09/);
  const h = c.deHtmlHistorico({ tipo: "atualizado", origem: "sistema", usuarios: "X Teste", quem: "Correção: CPF separado do Documento",
    campos: [{ campo: "cpf", antes: null, depois: "12345678909" }] }, { cpf: "CPF" });
  assert.match(h, /correção do sistema/);
  assert.match(h, /CPF:<\/span> 123\.456\.789-09/);
});

// ── Exportar no modelo Trampay ──

test("modelo Trampay: Nome Sobrenome, documento e telefone com máscara, praça fixa, ID dos Dados entregadores", () => {
  const c = carregar();
  const linhas = c.deLinhasTrampay([
    { dado_id: 1, id_interno: "175", usuarios: "Maria Teste", atual_nome: "MARIA DA SILVA teste",
      atual_cpf: "1234567890", atual_cnpj: "11.222.333/0001-81", atual_telefone: "(49) 99999-0000", atual_email: "Maria@Exemplo.com",
      atual_chave_pix: "11.222.333/0001-81", atual_tipo_chave_pix: "CNPJ", atual_documento: "11222333000181" },
    // Registro mais antigo da mesma pessoa: não duplica.
    { dado_id: 1, id_interno: "175", atual_nome: "Outro" },
    // Solicitação ainda não aprovada (sem Documento gravado): documento pela regra.
    { dado_id: 2, id_interno: "", atual_nome: "joão d'ávila", atual_cpf: "98765432100", atual_documento: null,
      atual_telefone: "5549988887777", atual_chave_pix: "+55 (49) 98888-7777", atual_tipo_chave_pix: "Celular" },
    { dado_id: null, atual_nome: "Sem linha" },
  ]);
  assert.strictEqual(linhas.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(linhas[0])), {
    nome: "Maria da Silva Teste", documento: "11.222.333/0001-81", telefone: "(49) 99999-0000",
    email: "maria@exemplo.com", praca: "MeioOeste - SC", chave_pix_tipo: "cnpj", chave_pix: "11222333000181",
    identificador: "175", entregador: "Maria Teste",
  });
  assert.strictEqual(linhas[1].nome, "João D'Ávila");
  assert.strictEqual(linhas[1].documento, "987.654.321-00", "chave não é CNPJ: documento é o CPF");
  assert.strictEqual(linhas[1].telefone, "(49) 98888-7777");
  assert.strictEqual(linhas[1].chave_pix, "49988887777");
  assert.strictEqual(linhas[1].chave_pix_tipo, "telefone");
});
test("modelo Trampay: CSV com as colunas exatamente com esses nomes e nessa ordem", () => {
  const c = carregar();
  const csv = c.deCsvTrampay([{ nome: "Maria da Silva", documento: "123.456.789-09", telefone: "(11) 99999-9999",
    email: "maria@email.com", praca: "MeioOeste - SC", chave_pix_tipo: "email", chave_pix: "maria@email.com", identificador: "175" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  const [cab, linha] = csv.slice(1).split("\r\n");
  assert.strictEqual(cab, "nome;documento;telefone;email;praca;chave_pix_tipo;chave_pix;identificador");
  assert.strictEqual(linha, '"Maria da Silva";"123.456.789-09";"(11) 99999-9999";"maria@email.com";"MeioOeste - SC";"email";"maria@email.com";"175"');
});
// ── Exportação: filtros, dias marcados e só linhas completas ──

const COMPLETO = { atual_nome: "Maria Teste", atual_cpf: "12345678909", atual_telefone: "49999990000",
  atual_chave_pix: "maria@exemplo.com", atual_tipo_chave_pix: "email", atual_email: "maria@exemplo.com" };
const DIAS = [
  { dia: "2026-11-09", dado_id: 1, tipo: "atualizado", quem: "Maria Teste - Caçador", usuarios: "Maria Teste", id_interno: "175", ...COMPLETO },
  { dia: "2026-11-08", dado_id: 2, tipo: "novo", quem: "Suporte Teste", usuarios: "Joao Teste", id_interno: "",
    atual_nome: "Joao", atual_cpf: "", atual_telefone: "49988880000", atual_chave_pix: "x", atual_tipo_chave_pix: "aleatorio" },
  { dia: "2026-11-08", dado_id: 1, tipo: "novo", quem: "Maria Teste - Caçador", usuarios: "Maria Teste", id_interno: "175", ...COMPLETO },
  { dia: "2026-10-01", dado_id: 3, tipo: "novo", quem: "Suporte Teste", usuarios: "Ana Teste", id_interno: "9", ...COMPLETO },
];

test("filtros da exportação: entregador (nome ou ID), tipo e quem", () => {
  const c = carregar();
  const ids = (f) => c.deFiltrarHistorico(DIAS, f).map((d) => d.dado_id).join(",");
  assert.strictEqual(ids({ entregador: "joao" }), "2");
  assert.strictEqual(ids({ entregador: "175" }), "1,1");
  assert.strictEqual(ids({ quem: "Suporte Teste" }), "2,3");
  assert.strictEqual(ids({ tipo: "novo", quem: "Maria Teste - Caçador" }), "1");
});

test("calendário marca os dias com edição de acordo com o filtro", () => {
  const c = carregar();
  const todos = c.deContarDias(DIAS, {});
  assert.strictEqual(todos.get("2026-11-08"), 2);
  assert.strictEqual(todos.get("2026-11-09"), 1);
  const soSuporte = c.deContarDias(DIAS, { quem: "Suporte Teste" });
  assert.strictEqual(soSuporte.get("2026-11-09"), undefined, "Maria não editou pelo suporte");
  assert.strictEqual(soSuporte.get("2026-11-08"), 1);
});

test("o que falta pro modelo Trampay: todas as colunas", () => {
  const c = carregar();
  assert.deepStrictEqual([...c.deFaltandoTrampay({ nome: "Maria Teste", documento: "123.456.789-09", telefone: "(49) 99999-0000",
    email: "x@exemplo.com", praca: "MeioOeste - SC", chave_pix_tipo: "email", chave_pix: "x@exemplo.com", identificador: "175" })], []);
  assert.deepStrictEqual([...c.deFaltandoTrampay({ nome: "Joao", documento: "", telefone: "123", email: "sem-arroba", praca: "", chave_pix_tipo: "", chave_pix: "", identificador: "" })],
    ["nome", "documento", "telefone", "email", "praca", "chave_pix_tipo", "chave_pix", "identificador"]);
});
test("exportação: só linhas completas no arquivo; as incompletas saem listadas com o que falta", () => {
  const c = carregar();
  const p = c.dePrepararExportacao(DIAS, {}, "2026-11-08", "2026-11-09");
  assert.deepStrictEqual([...p.completas.map((l) => l.identificador)], ["175"], "Maria uma vez só; Ana fora do intervalo");
  assert.strictEqual(p.incompletas.length, 1);
  assert.strictEqual(p.incompletas[0].entregador, "Joao Teste");
  assert.deepStrictEqual([...p.incompletas[0].falta], ["nome", "documento", "email", "identificador"]);
});

test("tela: cada registro mostra o modelo Trampay completo; obrigatório vazio aparece como falta", () => {
  const c = carregar();
  const html = c.deHtmlTrampay({ dado_id: 1, id_interno: "175", ...COMPLETO });
  const rotulos = [...html.matchAll(/data-rotulo="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(rotulos, ["nome", "documento", "telefone", "email", "praca", "chave_pix_tipo", "chave_pix", "identificador"]);
  assert.match(html, /data-rotulo="documento">123\.456\.789-09</);
  assert.match(html, /data-rotulo="praca">MeioOeste - SC</);
  assert.doesNotMatch(html, /falta/);
  assert.match(c.deHtmlTrampay({ dado_id: 2, ...COMPLETO, id_interno: "" }), /data-rotulo="identificador"><span class="de-pendente">falta/);
});
test("exportação: hora da edição junto com as datas (das X do 1º dia até Y do último)", () => {
  const c = carregar();
  const dias = [
    { dia: "2026-11-08", hora: "09:30", dado_id: 1, tipo: "novo", usuarios: "Maria Teste", id_interno: "175", ...COMPLETO },
    { dia: "2026-11-08", hora: "15:10", dado_id: 3, tipo: "novo", usuarios: "Ana Teste", id_interno: "9", ...COMPLETO },
    { dia: "2026-11-09", hora: "11:00", dado_id: 4, tipo: "novo", usuarios: "Bia Teste", id_interno: "10", ...COMPLETO },
  ];
  const ids = (p) => [...p.completas.map((l) => l.identificador)].join(",");
  assert.strictEqual(ids(c.dePrepararExportacao(dias, {}, "2026-11-08", "2026-11-09", "14:00", "10:30")), "9");
  assert.strictEqual(ids(c.dePrepararExportacao(dias, {}, "2026-11-08", "2026-11-09", "", "")), "175,9,10", "sem hora: o dia inteiro");
});

// ── Status (aprovado / pendente / recusado) e "Quem" que se adapta ──

const COM_STATUS = [
  { dia: "2026-11-09", dado_id: 1, tipo: "novo", status: "pendente", quem: "Maria Teste - Caçador", usuarios: "Maria Teste", id_interno: "175", user_id: 3, solicitacao_id: 7, ...COMPLETO },
  { dia: "2026-11-09", dado_id: null, tipo: "novo", status: "recusado", quem: "Joao Teste - Videira", usuarios: "Joao Teste", user_id: 4, solicitacao_id: 8, ...COMPLETO },
  { dia: "2026-11-08", dado_id: 2, tipo: "novo", quem: "Ana Teste - Caçador", usuarios: "Ana Teste", id_interno: "9", ...COMPLETO },
  { dia: "2026-11-08", dado_id: 5, tipo: "atualizado", quem: "Suporte Teste", usuarios: "Bia Teste", id_interno: "10", ...COMPLETO },
];

test("filtro de status: o que está no histórico conta como aprovado", () => {
  const c = carregar();
  const quem = (f) => c.deFiltrarHistorico(COM_STATUS, f).map((d) => d.usuarios).join(",");
  assert.strictEqual(quem({ status: "pendente" }), "Maria Teste");
  assert.strictEqual(quem({ status: "recusado" }), "Joao Teste");
  assert.strictEqual(quem({ tipo: "novo", status: "aprovado" }), "Ana Teste");
});

test("'Quem' mostra só quem passa pelos outros filtros (e pelo intervalo)", () => {
  const c = carregar();
  assert.deepStrictEqual([...c.deOpcoesFiltro(COM_STATUS, { tipo: "novo", status: "pendente" }, "quem")], ["Maria Teste - Caçador"]);
  assert.deepStrictEqual([...c.deOpcoesFiltro(COM_STATUS, { tipo: "atualizado" }, "quem")], ["Suporte Teste"]);
  assert.deepStrictEqual([...c.deOpcoesFiltro(COM_STATUS, {}, "quem", "2026-11-09", "2026-11-09")], ["Joao Teste - Videira", "Maria Teste - Caçador"]);
  assert.strictEqual(c.deOpcoesFiltro(COM_STATUS, { quem: "Suporte Teste" }, "quem").length, 4, "o próprio filtro de quem não restringe as opções dele");
});

test("linha da tela mostra o status; solicitação sem linha na tabela ainda mostra o modelo Trampay", () => {
  const c = carregar();
  assert.match(c.deHtmlHistorico({ ...COM_STATUS[0], campos: [] }, {}), /de-status-pendente">Pendente/);
  assert.match(c.deHtmlHistorico({ ...COM_STATUS[1], decidido_por: "Suporte Teste", campos: [] }, {}), /title="Recusado por Suporte Teste">Recusado/);
  assert.match(c.deHtmlHistorico({ ...COM_STATUS[2], origem: "entregador", campos: [] }, {}), /de-status-aprovado">Aprovado/);
  assert.match(c.deHtmlTrampay(COM_STATUS[1]), /data-rotulo="documento">123\.456\.789-09</);
  const linhas = c.deLinhasTrampay(COM_STATUS);
  assert.strictEqual(linhas.length, 4, "solicitação sem linha conta pelo login");
});
