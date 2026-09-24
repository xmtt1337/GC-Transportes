// Testes das listas de Cadastros (Entregadores, Motoristas, Usuários, Trampay) depois do
// redesenho: o que se protege é o conteúdo que a tela precisa mostrar — quem está inativo,
// senha pendente, as liberações do entregador, as ações do menu Editar — e que texto vindo
// do servidor nunca vira HTML. O desenho em si é do CSS.
//
// Scripts carregados num contexto isolado, com DOM e fetch de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");

function carregar({ role = "dev", resposta = [] } = {}) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: "", textContent: "" });
  const ctx = vm.createContext({
    console,
    API: "https://api.teste",
    token: "tk",
    localStorage: { getItem: () => "tk" },
    window: { _gcUser: { role } },
    document: { getElementById: el, addEventListener() {}, querySelectorAll: () => [] },
    skMostrar() {},
    skFim(e, t) { e.textContent = t; },
    mostrarTela() {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(resposta) }),
  });
  for (const f of ["usuarios.js", "motoristas.js", "usuarios-gc.js", "trampay.js"]) {
    vm.runInContext(ler(f), ctx, { filename: f });
  }
  return { ctx, els };
}
const esperar = () => new Promise((resolve) => setImmediate(resolve));

// ── peças comuns ────────────────────────────────────────────────────────────
test("pessoa: nome em cima, login embaixo, sem bolinha de iniciais", () => {
  const { ctx } = carregar();
  const html = ctx._cadPessoaHtml({ name: "Maria Teste", username: "maria.t" });
  assert.ok(html.includes('<div class="cad-nome">Maria Teste</div>'));
  assert.ok(html.includes('<div class="cad-login">maria.t</div>'));
  assert.ok(!html.includes("adm-usr-avatar"));
});

test("pessoa: o login pode ser trocado (Usuarios esconde o de dev/finance/sac)", () => {
  const { ctx } = carregar();
  const html = ctx._cadPessoaHtml({ name: "X", username: "segredo" }, "••••••");
  assert.ok(html.includes("••••••") && !html.includes("segredo"));
});

test("pessoa: nome e login com HTML nao viram HTML", () => {
  const { ctx } = carregar();
  const html = ctx._cadPessoaHtml({ name: "<b>n</b>", username: "<i>u</i>" });
  assert.ok(!html.includes("<b>n</b>") && !html.includes("<i>u</i>"));
});

test("situacao: Ativo/Inativo em texto, e senha pendente embaixo so quando tem", () => {
  const { ctx } = carregar();
  assert.ok(ctx._cadStatusHtml({ active: true }).includes(">Ativo<"));
  assert.ok(ctx._cadStatusHtml({ active: false }).includes(">Inativo<"));
  assert.ok(!ctx._cadStatusHtml({ active: true }).includes("Senha pendente"));
  assert.ok(ctx._cadStatusHtml({ active: true, senha_temporaria: true }).includes("Senha pendente"));
});

test("contagem do cabecalho: total e ativos, no singular e no plural", () => {
  const { ctx, els } = carregar();
  ctx._cadContagem("c", [{ active: true }, { active: false }, { active: true }], "entregador", "entregadores");
  assert.strictEqual(els.c.textContent, "3 entregadores · 2 ativos");
  ctx._cadContagem("c", [{ active: true }], "motorista", "motoristas");
  assert.strictEqual(els.c.textContent, "1 motorista · 1 ativo");
});

// ── Entregadores ────────────────────────────────────────────────────────────
const ENTREGADORES = [
  { id: 1, name: "Entregador Um", username: "ent.um", active: true, isento_nf: true, faz_motorista: true },
  { id: 2, name: "Entregador Dois", username: "ent.dois", active: false, senha_temporaria: true },
];

test("entregadores: liberacoes em texto corrido, e traco quando nao tem nenhuma", async () => {
  const { ctx, els } = carregar({ resposta: ENTREGADORES });
  ctx._carregarUsuarios();
  await esperar();
  const html = els["adm-usr-tbody"].innerHTML;
  assert.ok(/Sem trava de NF<\/span> · <span[^>]*>Também motorista/.test(html));
  assert.ok(html.includes('<span class="cad-vazio">—</span>'), "o segundo nao tem liberacao nenhuma");
  assert.ok(!html.includes("adm-usr-badge"), "nada de selo colorido");
  assert.strictEqual(els["adm-usr-contagem"].textContent, "2 entregadores · 1 ativo");
});

test("entregadores: linha de quem esta inativo vem marcada, e o menu oferece Ativar", async () => {
  const { ctx, els } = carregar({ resposta: ENTREGADORES });
  ctx._carregarUsuarios();
  await esperar();
  const html = els["adm-usr-tbody"].innerHTML;
  assert.strictEqual(html.split('class="cad-inativo"').length - 1, 1);
  assert.ok(html.includes("_toggleAtivoUsuario(2,true)\">Ativar<"));
  assert.ok(html.includes("_toggleAtivoUsuario(1,false)\">Inativar<"));
});

// ── Motoristas ──────────────────────────────────────────────────────────────
test("motoristas: mesma linha simples, com contagem e menu Editar", async () => {
  const { ctx, els } = carregar({ resposta: [{ id: 5, name: "Motorista Um", username: "mot.um", active: true }] });
  ctx._carregarMotoristas();
  await esperar();
  const html = els["adm-mot-tbody"].innerHTML;
  assert.ok(html.includes('<div class="cad-nome">Motorista Um</div>'));
  assert.ok(html.includes("_toggleMenuMotorista(event,5)"));
  assert.strictEqual(els["adm-mot-contagem"].textContent, "1 motorista · 1 ativo");
});

// ── Usuários ────────────────────────────────────────────────────────────────
const USUARIOS = [
  { id: 7, name: "Admin Teste", username: "admin.t", role: "admin", polo: "cacador", active: true },
  { id: 8, name: "Fin Teste", username: "fin.t", role: "finance", polo: null, active: false },
  { id: 9, name: "Entregador", username: "ent", role: "entregador", active: true },
];

test("usuarios: as quatro acoes num menu Editar so, com Deletar por ultimo", async () => {
  const { ctx, els } = carregar({ resposta: USUARIOS });
  ctx._carregarUsuariosGC();
  await esperar();
  const html = els["gc-usr-tbody"].innerHTML;
  assert.ok(html.includes("_toggleMenuGC(event,7)"));
  const menu = html.slice(html.indexOf('id="gc-usr-menu-7"'));
  const ordem = ["Mudar cargo", "Inativar", "Resetar senha", "Deletar"].map((t) => menu.indexOf(t));
  ordem.forEach((pos) => assert.ok(pos >= 0));
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.ok(html.includes('class="adm-usr-editar-item perigo"'));
});

test("usuarios: cargo em texto (sem selo colorido), login escondido de finance, entregador fora", async () => {
  const { ctx, els } = carregar({ resposta: USUARIOS });
  ctx._carregarUsuariosGC();
  await esperar();
  const html = els["gc-usr-tbody"].innerHTML;
  assert.ok(html.includes('<td class="cad-cargo cargo-admin">Administrador</td>'));
  assert.ok(html.includes('<td class="cad-cargo cargo-finance">Financeiro</td>'));
  assert.ok(!html.includes('<div class="cad-login">fin.t</div>'), "login do financeiro nao aparece na tela");
  assert.ok(html.includes('<div class="cad-login">admin.t</div>'));
  assert.ok(!html.includes("border-radius:20px"), "nada de pilula colorida");
  assert.ok(!html.includes("Entregador</div>"), "entregador nao entra em Usuarios");
  assert.strictEqual(els["gc-usr-contagem"].textContent, "2 usuários · 1 ativo");
});

test("usuarios: polo em texto na linha (sem seletor solto), e Sem polo quando nao tem", async () => {
  const { ctx, els } = carregar({ resposta: USUARIOS });
  ctx._carregarUsuariosGC();
  await esperar();
  const html = els["gc-usr-tbody"].innerHTML;
  assert.ok(!html.includes("<select"), "trocar polo e pelo menu Editar");
  assert.ok(html.includes('data-rotulo="Polo">Caçador</td>'));
  assert.ok(html.includes('<span class="cad-vazio">Sem polo</span>'));
});

test("usuarios: Mudar polo fica no menu Editar, com o polo atual", async () => {
  const { ctx, els } = carregar({ resposta: USUARIOS });
  ctx._carregarUsuariosGC();
  await esperar();
  const html = els["gc-usr-tbody"].innerHTML;
  assert.ok(html.includes("_abrirEditarPoloGC(7,'cacador','Admin Teste')\">Mudar polo<"));
  assert.ok(html.includes("_abrirEditarPoloGC(8,'','Fin Teste')"));
});

test("usuarios: salvar o polo manda PATCH so com o polo (vazio vira null) e recarrega", async () => {
  const chamadas = [];
  const { ctx, els } = carregar({ resposta: USUARIOS });
  ctx.fetch = (url, op) => { chamadas.push({ url, op }); return Promise.resolve({ ok: true, json: () => Promise.resolve(op ? { ok: true } : USUARIOS) }); };
  ctx._abrirModal = () => {};
  ctx._fecharModal = (id) => { chamadas.push({ fechou: id }); };
  ctx._abrirEditarPoloGC(8, "", "Fin Teste");
  assert.strictEqual(els["epg-polo"].value, "");
  els["epg-polo"].value = "videira";
  ctx._salvarPoloGC();
  assert.strictEqual(chamadas[0].url, "https://api.teste/admin/usuarios/8");
  assert.strictEqual(chamadas[0].op.method, "PATCH");
  assert.strictEqual(chamadas[0].op.body, JSON.stringify({ polo: "videira" }));
  await esperar();
  assert.ok(chamadas.some((c) => c.fechou === "modal-editar-polo-gc"));

  chamadas.length = 0;
  ctx._abrirEditarPoloGC(8, "videira", "Fin Teste");
  els["epg-polo"].value = "";
  ctx._salvarPoloGC();
  assert.strictEqual(chamadas[0].op.body, JSON.stringify({ polo: null }));
});

test("usuarios: se o servidor recusa o polo, mostra o erro e nao fecha", async () => {
  const { ctx, els } = carregar();
  let fechou = false;
  ctx.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "Polo inválido" }) });
  ctx._abrirModal = () => {};
  ctx._fecharModal = () => { fechou = true; };
  ctx._abrirEditarPoloGC(8, "", "Fin Teste");
  ctx._salvarPoloGC();
  await esperar();
  assert.strictEqual(els["epg-erro"].innerText, "Polo inválido");
  assert.strictEqual(fechou, false);
});

// ── Trampay ─────────────────────────────────────────────────────────────────
test("trampay: tipo da chave PIX ao lado dela, em texto; vazio vira traco", async () => {
  const { ctx, els } = carregar({ resposta: [
    { nome: "Pessoa Um", documento: "000.000.000-00", id_externo: "TP-1", chave_pix: "a@b.c", tipo_pix: "email", data_criacao: "01/01/2026", last_import: "2026-01-02T10:00:00" },
    { nome: "Pessoa Dois", documento: "", id_externo: "TP-2", chave_pix: "", tipo_pix: "", data_criacao: "" },
  ] });
  ctx._carregarEntregadoresTrampay();
  await esperar();
  const html = els["trampay-ent-tbody"].innerHTML;
  assert.ok(html.includes('a@b.c <span class="cad-pix-tipo">email</span>'));
  assert.ok(!html.includes("pag-pix-badge"));
  assert.ok(html.includes('data-rotulo="PIX"><span class="cad-vazio">—</span>'));
  assert.ok(els["trampay-ent-counter"].textContent.startsWith("2 entregadores · última importação em "));
});

test("trampay: dados do CSV com HTML nao viram HTML", async () => {
  const { ctx, els } = carregar({ resposta: [{ nome: "<b>x</b>", documento: "<i>d</i>", chave_pix: "<s>p</s>", tipo_pix: "<u>t</u>" }] });
  ctx._carregarEntregadoresTrampay();
  await esperar();
  const html = els["trampay-ent-tbody"].innerHTML;
  for (const tag of ["<b>", "<i>", "<s>", "<u>"]) assert.ok(!html.includes(tag), tag);
});

// ── último acesso ───────────────────────────────────────────────────────────
// Vem do servidor em segundos (calculado no banco); até 5 min é "Online agora".
test("ultimo acesso: textos por faixa de tempo", () => {
  const { ctx } = carregar();
  const casos = [
    [null, "Nunca acessou"], [undefined, "Nunca acessou"],
    [0, "Online agora"], [300, "Online agora"],
    [301, "há 5 min"], [25 * 60, "há 25 min"],
    [2 * 3600, "há 2h"], [23 * 3600, "há 23h"],
    [30 * 3600, "ontem"], [3 * 86400, "há 3 dias"],
    [35 * 86400, "há 1 mês"], [75 * 86400, "há 3 meses"],
    [400 * 86400, "há 1 ano"],
  ];
  for (const [seg, texto] of casos) assert.strictEqual(ctx._cadTextoAcesso(seg), texto, String(seg));
});

test("ultimo acesso: online ganha a classe do destaque; nunca acessou fica apagado", () => {
  const { ctx } = carregar();
  assert.ok(ctx._cadAcessoHtml({ segundos_desde_acesso: 60 }).includes('class="cad-acesso online"'));
  assert.ok(ctx._cadAcessoHtml({ segundos_desde_acesso: null }).includes('class="cad-acesso nunca"'));
  assert.ok(ctx._cadAcessoHtml({ segundos_desde_acesso: 90000 }).includes('class="cad-acesso "'));
});

test("ultimo acesso aparece em entregadores, motoristas e usuarios", async () => {
  const lista = [{ id: 1, name: "A", username: "a", role: "admin", active: true, segundos_desde_acesso: 60 }];
  for (const [carregarLista, tbody] of [["_carregarUsuarios", "adm-usr-tbody"], ["_carregarMotoristas", "adm-mot-tbody"], ["_carregarUsuariosGC", "gc-usr-tbody"]]) {
    const { ctx, els } = carregar({ resposta: lista });
    ctx[carregarLista]();
    await esperar();
    assert.ok(els[tbody].innerHTML.includes(">Online agora</span>"), tbody);
  }
});

test("o aparelho usado nao aparece mais em lugar nenhum", async () => {
  const { ctx, els } = carregar({ resposta: [{ id: 1, name: "A", username: "a", role: "entregador", active: true, ultimo_aparelho: "Samsung Teste" }] });
  ctx._carregarUsuarios();
  await esperar();
  assert.ok(!els["adm-usr-tbody"].innerHTML.includes("Samsung Teste"));
});
