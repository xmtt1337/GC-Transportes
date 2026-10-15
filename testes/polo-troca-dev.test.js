// Testes da troca de polo pelo dev, no card do perfil (gcPoloTrocar, em shopee-polo.js).
//
// O que se protege: só dev troca (a tela nem tenta pelos outros — o servidor recusa de
// qualquer jeito), clicar no polo em que já está não faz nada, a troca que deu certo
// recarrega a página (cada tela guardou dados do polo antigo) e a que falhou NÃO recarrega
// e mostra o motivo.
//
// O arquivo roda num contexto vm só com o que ele pede. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "shopee-polo.js"), "utf8");
const esperar = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

function criarContexto(role, { poloAtual = "cacador", resposta = { ok: true, corpo: { polo: "videira" } } } = {}) {
  const envios = [];
  const confirmacoes = [];
  let recarregou = 0;
  const ctx = {
    console,
    API: "http://teste", token: "tk",
    window: { _gcUser: { role }, location: { reload: () => { recarregou++; } } },
    document: { getElementById: () => null },
    gcConfirm: (msg, onOk) => { confirmacoes.push(msg); onOk(); },
    fetch: async (url, opts) => {
      if (url.endsWith("/shopee/meu-xpt")) return { ok: true, json: async () => ({ polo: poloAtual }) };
      envios.push({ url, corpo: JSON.parse(opts.body) });
      if (resposta === "rede") throw new Error("sem rede");
      return { ok: resposta.ok, json: async () => resposta.corpo };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx);
  return { ctx, envios, confirmacoes, recarregou: () => recarregou };
}

test("dev troca de polo: confirma, grava e recarrega", async () => {
  const t = criarContexto("dev");
  await t.ctx.gcPoloCarregar(true);
  t.ctx.gcPoloTrocar("videira");
  await esperar();
  assert.strictEqual(t.confirmacoes.length, 1);
  assert.match(t.confirmacoes[0], /Videira \(XPT_VIA\)/);
  assert.deepStrictEqual(t.envios.map((e) => e.corpo), [{ polo: "videira" }]);
  assert.strictEqual(t.recarregou(), 1);
});

test("quem não é dev não troca pela tela", async () => {
  for (const role of ["user", "sac", "admin"]) {
    const t = criarContexto(role);
    await t.ctx.gcPoloCarregar(true);
    t.ctx.gcPoloTrocar("videira");
    await esperar();
    assert.strictEqual(t.envios.length, 0, role);
    assert.strictEqual(t.confirmacoes.length, 0, role);
  }
});

test("clicar no polo em que já está não faz nada", async () => {
  const t = criarContexto("dev", { poloAtual: "videira" });
  await t.ctx.gcPoloCarregar(true);
  t.ctx.gcPoloTrocar("videira");
  await esperar();
  assert.strictEqual(t.confirmacoes.length, 0);
  assert.strictEqual(t.envios.length, 0);
});

test("recusa do servidor mostra o motivo e não recarrega", async () => {
  const t = criarContexto("dev", { resposta: { ok: false, corpo: { error: "Polo inválido." } } });
  await t.ctx.gcPoloCarregar(true);
  let erro = null;
  t.ctx.gcPoloTrocar("videira", (e) => { erro = e; });
  await esperar();
  assert.strictEqual(erro, "Polo inválido.");
  assert.strictEqual(t.recarregou(), 0);
});

test("queda de conexão avisa e não recarrega", async () => {
  const t = criarContexto("dev", { resposta: "rede" });
  await t.ctx.gcPoloCarregar(true);
  let erro = null;
  t.ctx.gcPoloTrocar("joacaba", (e) => { erro = e; });
  await esperar();
  assert.match(erro, /conexão/);
  assert.strictEqual(t.recarregou(), 0);
});
