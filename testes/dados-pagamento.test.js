// Testes dos dados de pagamento do entregador: o aviso da tela inicial, o formulário e a
// seção do card do perfil.
//
// O que se protege: o aviso só aparece pro entregador sem dados completos (e muda o texto
// quando a chave da Trampay já existe); o formulário volta preenchido e escapado; as
// máscaras não comem dígito nem a letra do CNPJ novo; a chave sugerida segue o tipo; e o
// card do perfil mostra "Pendente"/"Editar" no lugar certo.
//
// dados-pagamento.js e nav.js rodam num contexto vm. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (nome) => fs.readFileSync(path.join(__dirname, "..", "js", nome), "utf8");

const ESC = `function _gcEsc(t) { return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }`;

function contexto(role = "entregador") {
  const ctx = {
    console,
    window: { _gcUser: { role, username: "usr.teste", name: "Usuário Teste", displayName: "Usuário Teste" } },
    document: { getElementById: () => null, addEventListener() {}, removeEventListener() {} },
    SHOPEE_POLOS: [{ chave: "cacador", label: "Caçador", xpt: "XPT_CFC" }],
  };
  vm.createContext(ctx);
  vm.runInContext(ESC + "\n" + ler("dados-pagamento.js") + "\n" + ler("nav.js"), ctx);
  return ctx;
}

const DADOS = {
  nome: "Maria Teste da Silva", cpf: "12345678909", cnpj: "", whatsapp: "49999990000",
  email: "maria.teste@exemplo.com", tipo_pix: "telefone", chave_pix: "49999990000",
};

test("máscaras: CPF, telefone (com e sem 55) e CNPJ com letra", () => {
  const c = contexto();
  assert.strictEqual(c.dpgMascaraCpf("12345678909"), "123.456.789-09");
  assert.strictEqual(c.dpgMascaraCpf("1234"), "123.4");
  assert.strictEqual(c.dpgMascaraTelefone("49999990000"), "(49) 99999-0000");
  assert.strictEqual(c.dpgMascaraTelefone("+55 49 99999-0000"), "(49) 99999-0000");
  assert.strictEqual(c.dpgMascaraTelefone("4935550000"), "(49) 3555-0000");
  assert.strictEqual(c.dpgMascaraCnpj("11222333000181"), "11.222.333/0001-81");
  assert.strictEqual(c.dpgMascaraCnpj("12abc34501de35"), "12.ABC.345/01DE-35");
});

test("aviso: só pro entregador sem dados completos", () => {
  const c = contexto();
  assert.strictEqual(c.dpgHtmlAviso(null), "");
  assert.strictEqual(c.dpgHtmlAviso({ aplica: false }), "");
  assert.strictEqual(c.dpgHtmlAviso({ aplica: true, completo: true, dados: DADOS }), "");

  const sem = c.dpgHtmlAviso({ aplica: true, completo: false, dados: null });
  assert.match(sem, /não temos seus dados de pagamento/);
  assert.match(sem, /Preencher meus dados/);
  assert.match(sem, /dpgAbrirFormulario\(\)/);

  const soChave = c.dpgHtmlAviso({ aplica: true, completo: false, dados: { chave_pix: "12345678909", tipo_pix: "cpf" } });
  assert.match(soChave, /já está com a gente/);
  assert.match(soChave, /Conferir e completar/);
});

test("formulário volta preenchido, com máscara, tipo marcado e texto escapado", () => {
  const c = contexto();
  const html = c.dpgHtmlFormulario({ ...DADOS, nome: 'Maria "Teste" <b>' });
  assert.ok(html.includes('value="Maria &quot;Teste&quot; &lt;b&gt;"'));
  assert.ok(html.includes('value="123.456.789-09"'));
  assert.ok(html.includes('value="(49) 99999-0000"'));
  assert.match(html, /<option value="telefone" selected>Telefone<\/option>/);
  for (const t of ["cpf", "telefone", "aleatorio", "email", "cnpj"]) assert.ok(html.includes(`value="${t}"`), t);
  assert.match(html, /CNPJ \(opcional\)/);
});

test("formulário vazio não quebra", () => {
  const c = contexto();
  const html = c.dpgHtmlFormulario(null);
  assert.match(html, /<option value="">Escolha\.\.\.<\/option>/);
  assert.doesNotMatch(html, /selected/);
});

test("chave sugerida segue o tipo escolhido", () => {
  const c = contexto();
  const v = { cpf: "123.456.789-09", cnpj: "11.222.333/0001-81", whatsapp: "(49) 99999-0000", email: "a@exemplo.com" };
  assert.strictEqual(c.dpgSugestaoChave("cpf", v), v.cpf);
  assert.strictEqual(c.dpgSugestaoChave("cnpj", v), v.cnpj);
  assert.strictEqual(c.dpgSugestaoChave("telefone", v), v.whatsapp);
  assert.strictEqual(c.dpgSugestaoChave("email", v), v.email);
  assert.strictEqual(c.dpgSugestaoChave("aleatorio", v), "");
});

function cardDoPerfil(role, pagamento) {
  const c = contexto(role);
  const card = { innerHTML: "", querySelectorAll: () => [] };
  c._renderPerfilCard(card, { conta: { email: null, foto: null }, pagamento });
  return card.innerHTML;
}

test("card do perfil: entregador com dados vê a chave e Editar", () => {
  const html = cardDoPerfil("entregador", { aplica: true, completo: true, dados: DADOS });
  assert.match(html, /Pagamento/);
  assert.match(html, /Telefone · \(49\) 99999-0000/);
  assert.match(html, /data-pc="pagamento">Editar/);
});

test("card do perfil: entregador sem dados vê Pendente e Preencher", () => {
  const html = cardDoPerfil("entregador", { aplica: true, completo: false, dados: null });
  assert.match(html, /Pendente/);
  assert.match(html, /data-pc="pagamento">Preencher/);
});

test("card do perfil: sem resposta ou outro cargo, a seção não aparece", () => {
  assert.doesNotMatch(cardDoPerfil("entregador", null), /data-pc="pagamento"/);
  assert.doesNotMatch(cardDoPerfil("user", { aplica: false }), /data-pc="pagamento"/);
});
