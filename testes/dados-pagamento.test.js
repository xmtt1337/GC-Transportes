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
    _gcBtnOkStyle: '', _gcOverlayStyle: '',
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

test("card do perfil: atalho Configurações de pagamento com a chave", () => {
  const html = cardDoPerfil("entregador", { aplica: true, completo: true, dados: DADOS });
  assert.match(html, /Pagamento/);
  assert.match(html, /class="dpg-perfil-link" data-pc="pagamento"/);
  assert.match(html, /Configurações de pagamento/);
  assert.match(html, /Telefone · \(49\) 99999-0000/);
});

test("card do perfil: entregador sem dados vê Pendente", () => {
  const html = cardDoPerfil("entregador", { aplica: true, completo: false, dados: null });
  assert.match(html, /Pendente/);
  assert.match(html, /data-pc="pagamento"/);
});

test("card do perfil: tem chave mas falta dado — mostra a chave e o que falta (não 'Pendente')", () => {
  const html = cardDoPerfil("entregador", { aplica: true, completo: false, dados: { ...DADOS, email: "" } });
  assert.match(html, /Telefone · \(49\) 99999-0000/);
  assert.doesNotMatch(html, /Pendente/);
  assert.match(html, /Falta o e-mail\./);
});

test("card do perfil: solicitação em análise aparece no atalho", () => {
  const html = cardDoPerfil("entregador", { aplica: true, completo: true, dados: DADOS, solicitacao: { status: "pendente", mudancas: [] } });
  assert.match(html, /Alteração aguardando aprovação/);
});

const MUDANCAS = [
  { campo: "tipo_pix", rotulo: "Tipo da chave", antes: "cpf", depois: "telefone" },
  { campo: "chave_pix", rotulo: "Chave Pix", antes: "12345678909", depois: "49999990000" },
];

test("configurações: dados atuais, e botão Solicitar alteração", () => {
  const c = contexto();
  const html = c.dpgHtmlConfig({ aplica: true, completo: true, dados: DADOS, solicitacao: null });
  assert.match(html, /Dados atuais/);
  assert.match(html, /123\.456\.789-09/);
  assert.match(html, /\(49\) 99999-0000/);
  assert.match(html, /CNPJ \(opcional\)<\/div><div class="cpg-valor"><span class="cad-vazio">—/, "opcional vazio fica neutro");
  assert.match(c.dpgHtmlConfig({ aplica: true, completo: false, dados: { ...DADOS, email: "" } }),
    /E-mail<\/div><div class="cpg-valor"><span class="cpg-vazio">não informado/, "obrigatório vazio em âmbar");
  assert.match(html, /data-cpg="alterar">Solicitar alteração</);
  assert.doesNotMatch(html, /cpg-status/);
});

test("configurações: sem dados → Preencher; pendente → status âmbar com antes → depois e Mudar a solicitação", () => {
  const c = contexto();
  assert.match(c.dpgHtmlConfig({ aplica: true, completo: false, dados: null }), />Preencher meus dados</);
  const html = c.dpgHtmlConfig({ aplica: true, completo: true, dados: DADOS,
    solicitacao: { status: "pendente", criado_em: "2026-11-05T15:00:00Z", mudancas: MUDANCAS } });
  assert.match(html, /cpg-status-pendente/);
  assert.match(html, /aguardando aprovação/);
  assert.match(html, /só mudam depois de aprovados/);
  assert.match(html, /Tipo da chave:<\/span> <span class="cpg-antes">CPF<\/span> → Telefone/);
  assert.match(html, /Chave Pix:<\/span> <span class="cpg-antes">123\.456\.789-09<\/span> → \(49\) 99999-0000/, "chave com a máscara do tipo de cada lado");
  assert.match(html, />Mudar a solicitação</);
});

test("configurações: aprovada em verde, recusada em vermelho dizendo que nada mudou", () => {
  const c = contexto();
  assert.match(c.dpgHtmlStatusSolicitacao({ status: "aprovado", decidido_em: "2026-11-05T16:00:00Z", mudancas: MUDANCAS }), /cpg-status-aprovado[\s\S]*Alteração aprovada/);
  const rec = c.dpgHtmlStatusSolicitacao({ status: "recusado", decidido_em: "2026-11-05T16:00:00Z", mudancas: MUDANCAS });
  assert.match(rec, /cpg-status-recusado/);
  assert.match(rec, /continuam como estavam/);
  assert.strictEqual(c.dpgHtmlStatusSolicitacao({ status: "substituido" }), "");
  assert.strictEqual(c.dpgHtmlStatusSolicitacao(null), "");
});

test("o que falta: um, vários, ou nada vazio (dado inválido)", () => {
  const c = contexto();
  assert.strictEqual(c.dpgTextoFaltando({ ...DADOS, chave_pix: "" }), "Falta a chave Pix.");
  assert.strictEqual(c.dpgTextoFaltando({ ...DADOS, cpf: "", email: "", whatsapp: "" }), "Faltam CPF, WhatsApp e e-mail.");
  assert.strictEqual(c.dpgTextoFaltando(DADOS), "Confira seus dados.");
  assert.match(c.dpgHtmlAviso({ aplica: true, completo: false, dados: { ...DADOS, email: "" } }), /Falta o e-mail\./);
});

test("card do perfil: sem resposta ou outro cargo, a seção não aparece", () => {
  assert.doesNotMatch(cardDoPerfil("entregador", null), /data-pc="pagamento"/);
  assert.doesNotMatch(cardDoPerfil("user", { aplica: false }), /data-pc="pagamento"/);
});

// ── Bloqueio de quem não tem chave Pix ──

test("bloqueio: só entregador sem chave e sem solicitação pendente", () => {
  const c = contexto();
  assert.strictEqual(c.dpgPrecisaBloquear({ aplica: true, completo: false, dados: null }), true);
  assert.strictEqual(c.dpgPrecisaBloquear({ aplica: true, completo: false, dados: { ...DADOS, chave_pix: "" } }), true);
  assert.strictEqual(c.dpgPrecisaBloquear({ aplica: true, completo: false, dados: { ...DADOS, email: "" } }), false, "tem chave: só o aviso");
  assert.strictEqual(c.dpgPrecisaBloquear({ aplica: true, dados: null, solicitacao: { status: "pendente" } }), false, "já mandou, aguarda aprovação");
  assert.strictEqual(c.dpgPrecisaBloquear({ aplica: true, dados: null, solicitacao: { status: "recusado" } }), true);
  assert.strictEqual(c.dpgPrecisaBloquear({ aplica: false }), false, "outro cargo");
  assert.strictEqual(c.dpgPrecisaBloquear(null), false, "sem resposta do servidor não trava ninguém");
});

test("bloqueio: aparece sem fechar, e some quando a chave chega", () => {
  const c = contexto();
  c._gcBtnOkStyle = c._gcOverlayStyle = "";
  const corpo = [];
  const criado = () => {
    const el = { id: "", innerHTML: "", ouvintes: {}, setAttribute() {},
      remove() { corpo.splice(corpo.indexOf(el), 1); },
      querySelector: (sel) => ({ addEventListener: (ev, fn) => { el.ouvintes[sel] = fn; } }) };
    return el;
  };
  c.document = {
    getElementById: (id) => corpo.find((e) => e.id === id) || null,
    createElement: criado,
    body: { appendChild: (e) => corpo.push(e) },
    addEventListener() {}, removeEventListener() {},
  };
  const estado = (e) => { c.__e = e; vm.runInContext("_dpgEstado = __e", c); };
  estado({ aplica: true, completo: false, dados: null });
  c._dpgDesenharAviso();
  assert.strictEqual(corpo.length, 1);
  assert.match(corpo[0].innerHTML, /Cadastre sua chave Pix para continuar/);
  assert.match(corpo[0].innerHTML, /data-dpg="preencher"/);
  assert.match(corpo[0].innerHTML, /data-dpg="sair"/, "dá pra sair da conta");
  assert.doesNotMatch(corpo[0].innerHTML, /Cancelar|Fechar/);
  c._dpgDesenharAviso();
  assert.strictEqual(corpo.length, 1, "não empilha dois");

  estado({ aplica: true, completo: true, dados: DADOS });
  c._dpgDesenharAviso();
  assert.strictEqual(corpo.length, 0, "salvou a chave: libera");
});
