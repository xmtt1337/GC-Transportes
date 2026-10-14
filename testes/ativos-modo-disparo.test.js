// Testes da escolha entre disparo unitário e em massa na tela de Ativos.
//
// Dev faz acareação como o SAC, mas também dispara outros ativos. Antes ele herdava a
// trava do SAC (prazo obrigatório e sem massa); agora escolhe o modo. O que se protege:
// SAC continua sem massa, admin continua com os dois juntos, e o lote do dev sai SEM
// prazo — um prazo ali criaria vencimento de acareação pra mensagem que não é.
//
// O arquivo roda num contexto vm com um DOM de mentira que só sabe o que ele pede.
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "whatsapp-teste.js"), "utf8");

const ACESSOR = `
;globalThis.__w = {
  set linhas(v) { _waBulkLinhas = v; },
};`;

function criarContexto(role) {
  const els = {};
  const el = (id) => (els[id] ||= { id, style: {}, innerText: "", innerHTML: "", value: "", textContent: "", disabled: false, classList: { toggle() {} } });
  el("wa-bulk-area").style.display = "none";
  const tabs = ["unitario", "massa"].map((modo) => ({
    dataset: { modo }, ativo: false,
    classList: { toggle(_, sim) { tabs.find((t) => t.dataset.modo === modo).ativo = sim; } },
  }));
  const envios = [];
  const ctx = {
    console, setTimeout: (fn) => fn(), URL, Blob,
    window: { _gcUser: { role, name: "Teste" } },
    document: {
      getElementById: el,
      querySelectorAll: (sel) => (sel.includes("wa-modo-tabs") ? tabs : []),
    },
    API: "http://teste", token: "tk",
    gcAlert() {}, mostrarTela() {}, gcPoloGarantir() {},
    fetch: async (url, opts) => {
      envios.push({ url, corpo: opts && opts.body ? JSON.parse(opts.body) : null });
      return { ok: true, json: async () => ({ id: "x", configurado: false }) };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fonte + ACESSOR, ctx);
  return { ctx, el, tabs, envios, visivel: (id) => el(id).style.display !== "none" };
}

test("SAC: só unitário, com prazo e sem massa nem escolha de modo", () => {
  const t = criarContexto("sac");
  t.ctx.abrirWhatsappTeste();
  assert.strictEqual(t.visivel("wa-modo-tabs"), false);
  assert.strictEqual(t.visivel("wa-unitario"), true);
  assert.strictEqual(t.visivel("wa-campo-prazo"), true);
  assert.strictEqual(t.visivel("wa-bulk-bloco"), false);
});

test("admin: sem escolha de modo, unitário e massa juntos, sem prazo", () => {
  const t = criarContexto("admin");
  t.ctx.abrirWhatsappTeste();
  assert.strictEqual(t.visivel("wa-modo-tabs"), false);
  assert.strictEqual(t.visivel("wa-unitario"), true);
  assert.strictEqual(t.visivel("wa-campo-prazo"), false);
  assert.strictEqual(t.visivel("wa-bulk-bloco"), true);
  assert.strictEqual(t.visivel("wa-bulk-toggle"), true);
});

test("dev: abre no unitário com prazo, igual ao SAC", () => {
  const t = criarContexto("dev");
  t.ctx.abrirWhatsappTeste();
  assert.strictEqual(t.visivel("wa-modo-tabs"), true);
  assert.strictEqual(t.visivel("wa-unitario"), true);
  assert.strictEqual(t.visivel("wa-campo-prazo"), true);
  assert.strictEqual(t.visivel("wa-bulk-bloco"), false);
  assert.ok(t.tabs.find((b) => b.dataset.modo === "unitario").ativo);
});

test("dev em massa: some o unitário, a área do CSV já vem aberta e dá pra voltar", () => {
  const t = criarContexto("dev");
  t.ctx.abrirWhatsappTeste();
  t.ctx._waModoEscolher("massa");
  assert.strictEqual(t.visivel("wa-unitario"), false);
  assert.strictEqual(t.visivel("wa-bulk-bloco"), true);
  assert.strictEqual(t.visivel("wa-bulk-toggle"), false);
  assert.strictEqual(t.visivel("wa-bulk-area"), true);
  assert.ok(t.tabs.find((b) => b.dataset.modo === "massa").ativo);

  t.ctx._waModoEscolher("unitario");
  assert.strictEqual(t.visivel("wa-unitario"), true);
  assert.strictEqual(t.visivel("wa-bulk-bloco"), false);
});

test("lote do dev sai sem prazo e com a transportadora", async () => {
  const t = criarContexto("dev");
  t.ctx.abrirWhatsappTeste();
  t.ctx._waModoEscolher("massa");
  t.ctx._waRecEscolher("shopee");
  t.el("wa-rec-prazo").value = "48"; // sobra do unitário: não pode vazar pro lote
  t.ctx.__w.linhas = [
    { numero: "49 9 9000-0001", valores: { nome_cliente: "Cliente Um", codigo_pedido: "BR000001" }, status: "aguardando" },
    { numero: "123", valores: { nome_cliente: "Cliente Dois", codigo_pedido: "BR000002" }, status: "aguardando" },
  ];
  await t.ctx._waBulkEnviar();

  const disparos = t.envios.filter((e) => e.url.endsWith("/admin/whatsapp/enviar"));
  assert.strictEqual(disparos.length, 1, "número inválido não chega no servidor");
  assert.strictEqual(disparos[0].corpo.prazo_horas, null);
  assert.strictEqual(disparos[0].corpo.transportadora, "shopee");
  assert.strictEqual(disparos[0].corpo.numero, "5549990000001");
});
