// Desempenho: uma fonte por vez (abas) e foto de perfil nos avatares.
//
// O que se protege: a aba escolhida mostra SÓ aquela fonte (antes as três vinham
// empilhadas); trocar de aba não vai ao servidor; o filtro de transportadora some fora
// das bipagens; e a foto entra no avatar de quem tem, uma busca por nome na sessão.
//
// Os arquivos rodam num contexto vm com um DOM de mentira. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (nome) => fs.readFileSync(path.join(__dirname, "..", "js", nome), "utf8");
const ESC = `function _gcEsc(t) { return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }`;
const esperar = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

function contexto({ fotos = {} } = {}) {
  const els = {};
  const el = (id) => (els[id] ||= { id, style: {}, innerHTML: "", value: "todas", dataset: {}, querySelectorAll: () => [] });
  const tabs = ["bipagens", "recebimento", "conferencia"].map((tipo) => ({
    dataset: { tipo }, ativo: false, classList: { toggle(_, sim) { this._o.ativo = sim; } },
  }));
  tabs.forEach((t) => { t.classList._o = t; });
  const pedidosFoto = [];
  const ctx = {
    console, API: "http://teste", token: "tk",
    window: { _gcUser: { role: "admin" } },
    document: {
      getElementById: el,
      querySelectorAll: (sel) => (sel.includes("desemp-tipos") ? tabs : []),
    },
    skFim(e, msg) { e.innerHTML = msg; },
    fetch: async (url, opts) => {
      pedidosFoto.push(JSON.parse(opts.body).nomes);
      return { ok: true, json: async () => ({ fotos }) };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(ESC + "\n" + ler("perfil-conta.js") + "\n" + ler("desempenho-bip.js"), ctx);
  return { ctx, el, tabs, pedidosFoto };
}

const DADOS = {
  polo: "cacador",
  bipagens: [{ usuario_nome: "Ana Teste", total: 9, loggi: 9 }],
  recebimento: [{ usuario_nome: "Bia Teste", total: 80 }],
  conferencia: [],
};

test("cada aba mostra só a sua fonte, sem ir ao servidor", () => {
  const t = contexto();
  t.ctx._desempRenderizar(DADOS, "Caçador · Outubro 2026");
  assert.match(t.el("desemp-ranking").innerHTML, /Ana Teste/);
  assert.doesNotMatch(t.el("desemp-ranking").innerHTML, /Bia Teste/);

  vm.runInContext("_desempDados = " + JSON.stringify(DADOS), t.ctx);
  t.ctx._desempEscolherTipo("recebimento");
  assert.match(t.el("desemp-ranking").innerHTML, /Bia Teste/);
  assert.doesNotMatch(t.el("desemp-ranking").innerHTML, /Ana Teste/);
  assert.strictEqual(t.el("desemp-transp").style.display, "none", "transportadora só vale nas bipagens");
  assert.ok(t.tabs.find((b) => b.dataset.tipo === "recebimento").ativo);
});

test("aba sem ninguém avisa em vez de sumir com a tela", () => {
  const t = contexto();
  vm.runInContext("_desempTipo = 'conferencia'", t.ctx);
  t.ctx._desempRenderizar(DADOS, "Caçador · Outubro 2026");
  assert.match(t.el("desemp-empty").innerHTML, /Nenhum registro de conferências/);
});

test("foto de perfil entra no avatar de quem tem, buscada uma vez por nome", async () => {
  const foto = "data:image/jpeg;base64,/9j/4AAQ";
  const t = contexto({ fotos: { "Ana Teste": foto } });
  const avatar = (nome) => ({ dataset: { fotoNome: nome }, innerHTML: "AT", isConnected: true, classList: { add() {} } });
  const ana = avatar("Ana Teste"), bia = avatar("Bia Teste");
  const container = { querySelectorAll: () => [ana, bia] };

  await t.ctx.gcAplicarFotos(container);
  assert.strictEqual(ana.innerHTML, `<img src="${foto}" alt="">`);
  assert.strictEqual(bia.innerHTML, "AT", "sem foto, ficam as iniciais");

  await t.ctx.gcAplicarFotos(container);
  await esperar();
  assert.strictEqual(t.pedidosFoto.length, 1, "o redesenho do timer não pode pedir a foto de novo");
});
