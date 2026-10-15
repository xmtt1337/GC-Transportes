// Testes do card do perfil (clicar no próprio nome): o que aparece pra cada cargo.
//
// O que se protege: todo cargo vê foto, e-mail e senha; só o role user vê nível e o
// "Pedir troca" de polo; só o dev vê os botões de trocar polo na hora; e o e-mail
// cadastrado aparece (escapado — ele vem do banco, mas é texto digitado por alguém).
//
// nav.js roda num contexto vm só com o que o card pede. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (nome) => fs.readFileSync(path.join(__dirname, "..", "js", nome), "utf8");

const ESC = `function _gcEsc(t) { return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }`;

function renderizar(role, conta, extras = {}) {
  const ctx = {
    console,
    window: { _gcUser: { role, username: "usr.teste", name: "Usuário Teste", displayName: "Usuário Teste" } },
    document: { getElementById: () => null, addEventListener() {}, removeEventListener() {} },
    SHOPEE_POLOS: [
      { chave: "cacador", label: "Caçador", xpt: "XPT_CFC" },
      { chave: "videira", label: "Videira", xpt: "XPT_VIA" },
      { chave: "joacaba", label: "Joaçaba", xpt: null },
    ],
  };
  vm.createContext(ctx);
  vm.runInContext(ESC + "\n" + ler("nav.js"), ctx);
  const card = { innerHTML: "", querySelectorAll: () => [] };
  ctx._renderPerfilCard(card, { conta, ...extras });
  return card.innerHTML;
}

const CONTA = { email: "teste@exemplo.com", foto: null, polo: "cacador", polo_label: "Caçador", pode_solicitar_polo: false };
const DESEMPENHO = { nivel: 3, progresso: 40, totalBipagens: 120, mes: 10, mensal: { total: 12 }, proxNivel: 4, faltam: 30 };

test("todo cargo vê foto, e-mail e senha", () => {
  for (const role of ["user", "admin", "dev", "finance", "sac", "entregador", "motorista"]) {
    const html = renderizar(role, CONTA);
    assert.match(html, /data-pc="foto"/, role);
    assert.match(html, /teste@exemplo\.com/, role);
    assert.match(html, /data-pc="email"/, role);
    assert.match(html, /data-pc="senha"/, role);
    assert.doesNotMatch(html, /Esqueci minha senha/, role);
  }
});

test("sem e-mail cadastrado: avisa e o botão vira Cadastrar", () => {
  const html = renderizar("sac", { ...CONTA, email: null });
  assert.match(html, /Nenhum cadastrado/);
  assert.match(html, /data-pc="email">Cadastrar/);
});

test("com foto: mostra a imagem e oferece remover", () => {
  const foto = "data:image/jpeg;base64,/9j/4AAQ";
  const html = renderizar("admin", { ...CONTA, foto });
  assert.ok(html.includes(`<img src="${foto}"`));
  assert.match(html, /data-pc="remover-foto"/);
  assert.doesNotMatch(renderizar("admin", CONTA), /remover-foto/);
});

test("role user: nível e pedido de troca de polo, sem trocar na hora", () => {
  const html = renderizar("user", { ...CONTA, pode_solicitar_polo: true }, { desempenho: DESEMPENHO });
  assert.match(html, /Nv 3/);
  assert.match(html, /data-pc="polo">Pedir troca/);
  assert.doesNotMatch(html, /pc-polo-btn/);
});

test("dev: troca o polo na hora, sem pedido", () => {
  const html = renderizar("dev", CONTA, { polo: { polo: "videira" } });
  assert.match(html, /pc-polo-btn ativo" data-polo="videira"/);
  assert.doesNotMatch(html, /data-pc="polo"/);
  assert.doesNotMatch(html, /Nv \d/);
});

test("outros cargos não veem polo nenhum no card", () => {
  for (const role of ["admin", "sac", "finance"]) {
    const html = renderizar(role, CONTA);
    assert.doesNotMatch(html, /pc-polo-btn|data-pc="polo"/, role);
  }
});

test("e-mail e nome vão escapados", () => {
  const html = renderizar("sac", { ...CONTA, email: '"><img src=x onerror=alert(1)>@x.com' });
  assert.doesNotMatch(html, /<img src=x/);
});
