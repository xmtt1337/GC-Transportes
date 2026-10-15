// Quem vê o balãozinho da Central de Atendimento.
//
// Ele ficou desligado pra todo mundo (set/2026) enquanto era suspeito do glitch
// no celular; a causa real eram overlays com blur (gpu-camadas-fechadas). Agora a
// regra é: todo cargo vê o balão, menos dev — e a conta do suporte vê o menu.
//
// O que se protege: religar não pode esquecer de ninguém (o role user ficou sem
// suporte nenhum enquanto o balão estava desligado), o dev não ganha o relógio de
// minuto em minuto à toa, e o suporte continua com o menu dele.
//
// atendimento.js roda num contexto vm com um DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "atendimento.js"), "utf8");
const esperar = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

async function iniciar(role, suporte = false) {
  const els = {};
  const el = (id) => (els[id] ||= { id, style: { display: "none" }, innerText: "" });
  let relogios = 0;
  const ctx = {
    console, API: "http://teste", token: "tk",
    window: { _gcUser: { role } },
    document: { getElementById: el },
    setInterval: () => { relogios++; return 1; },
    clearInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ suporte, nao_lidas: 0 }) }),
  };
  vm.createContext(ctx);
  vm.runInContext(fonte, ctx);
  ctx.atdIniciar();
  await esperar();
  const visivel = (id) => el(id).style.display !== "none";
  return { balao: visivel("atd-launcher"), menu: visivel("menu-atendimento"), relogios };
}

test("todo cargo que não é dev vê o balão", async () => {
  for (const role of ["user", "admin", "sac", "finance", "entregador", "motorista"]) {
    const r = await iniciar(role);
    assert.strictEqual(r.balao, true, role);
    assert.strictEqual(r.menu, false, role);
    assert.strictEqual(r.relogios, 1, role);
  }
});

test("dev não vê o balão nem consulta de minuto em minuto", async () => {
  const r = await iniciar("dev");
  assert.strictEqual(r.balao, false);
  assert.strictEqual(r.relogios, 0);
});

test("a conta do suporte vê o menu, não o balão — mesmo sendo dev", async () => {
  const r = await iniciar("dev", true);
  assert.strictEqual(r.menu, true);
  assert.strictEqual(r.balao, false);
});
