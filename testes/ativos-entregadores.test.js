// Testes da aba "Entregadores" em Ativos > Conversas — o registro do aviso automático de
// rota incompleta (modules/avisos-entregador no backend), não uma conversa de cliente.
//
// O que se protege: essa aba usa endpoint e dado PRÓPRIOS (/admin/avisos-entregador), sem
// nada a ver com _wacDados (as conversas) — trocar pra essa aba não pode arrastar a busca
// pra outra aba (_wacIrOndeEsta não se aplica aqui) nem tentar montar URL com
// transportadora (essa aba não tem). E o botão de disparo manual só existe pra dev.
//
// Script carregado sozinho num contexto isolado, com DOM e fetch de mentira. Dados de
// TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "whatsapp-conversa.js"), "utf8");

// whatsapp-conversa.js espera estes dois globais de whatsapp-teste.js (mapa de
// transportadora por template). Só o teste "trocar de Entregadores pra Outros ativos"
// chega nesse código; um mapa vazio basta pra não travar sem precisar carregar o arquivo
// inteiro.
const STUBS = `
const WA_TRANSPORTADORAS = {};
const WA_TRANSPORTADORAS_ORDEM = [];`;

const ACESSOR = `
;globalThis.__w = {
  set aba(v) { _wacAba = v; },
  get aba() { return _wacAba; },
  trocarAba: (a) => _wacTrocarAba(a),
  rotaLista: () => _wacRotaLista(),
};`;

const esperar = () => new Promise((r) => setImmediate(r));
const esperarVarias = async () => { for (let i = 0; i < 6; i++) await esperar(); };

function criarElemento() {
  const o = { innerHTML: "", style: {}, value: "", setAttribute() {}, querySelectorAll: () => [] };
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = String(v); }, get() { return o.innerHTML; } });
  return o;
}

/**
 * @param {Object} opcoes
 * @param {string} opcoes.role window._gcUser.role
 * @param {Function=} opcoes.getResposta (url) => corpo do GET /admin/avisos-entregador
 */
function carregar({ role = "sac", getResposta } = {}) {
  const els = {};
  const el = (id) => els[id] || (els[id] = Object.assign(criarElemento(), { id }));
  const chamadas = { fetch: [], confirmado: false, alertas: [] };

  const respostaPadrao = () => ({
    linhas: [
      { nome_entregador: "Thalisson Diego Rizzo", rodada: "19:05", criterio: "abaixo_90", sucesso: true, erro: null, criado_em: "2026-09-22T19:05:00" },
      { nome_entregador: "Maria Oliveira", rodada: "22:05", criterio: "delivering_mais_1", sucesso: false, erro: "telefone não encontrado na planilha", criado_em: "2026-09-22T22:05:00" },
    ],
    dias: ["2026-09-22", "2026-09-21"],
  });

  const fetchFalso = async (url, opts = {}) => {
    chamadas.fetch.push({ url, metodo: (opts && opts.method) || "GET" });
    if (url.includes("/admin/avisos-entregador/rodada")) {
      return { ok: true, json: async () => ({ disparou: true, avaliados: 2 }) };
    }
    if (url.includes("/admin/avisos-entregador")) {
      return { ok: true, json: async () => (getResposta ? getResposta(url) : respostaPadrao()) };
    }
    throw new Error("fetch inesperado: " + url);
  };

  const ctx = vm.createContext({
    console, fetch: fetchFalso, API: "", token: "",
    window: { _gcUser: { role } },
    document: {
      getElementById: el,
      createElement: () => criarElemento(),
      querySelectorAll: () => [],
    },
    gcConfirm: (msg, ok) => { chamadas.confirmado = true; ok(); },
    gcAlert: (msg) => chamadas.alertas.push(msg),
    skMostrar() {}, skFim(elemento, msg) { elemento.innerHTML = msg; }, mostrarTela() {},
    _rotaAtualizarUrl() {},
  });
  vm.runInContext(STUBS, ctx);
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "whatsapp-conversa.js" });

  return { ctx, els, chamadas, w: ctx.__w };
}

// ── carregamento e filtro ──────────────────────────────────────────────
test("trocar pra Entregadores busca do endpoint proprio e lista os dois avisos", async () => {
  const a = carregar({ role: "sac" });
  a.w.trocarAba("entregadores");
  await esperarVarias();

  assert.ok(a.chamadas.fetch.some((f) => f.url.includes("/admin/avisos-entregador") && f.metodo === "GET"));
  const html = a.els["wac-ent-lista"].innerHTML;
  assert.match(html, /Thalisson Diego Rizzo/);
  assert.match(html, /Maria Oliveira/);
});

test("aviso com sucesso mostra Enviado; aviso com erro mostra o motivo", async () => {
  const a = carregar({ role: "sac" });
  a.w.trocarAba("entregadores");
  await esperarVarias();

  const html = a.els["wac-ent-lista"].innerHTML;
  assert.match(html, /Enviado/);
  assert.match(html, /telefone não encontrado na planilha/);
});

test("busca filtra por nome do entregador, sem afetar outra aba", async () => {
  const a = carregar({ role: "sac" });
  a.w.trocarAba("entregadores");
  await esperarVarias();

  a.els["wac-busca"].value = "maria";
  a.ctx._wacFiltrar();
  const html = a.els["wac-ent-lista"].innerHTML;
  assert.match(html, /Maria Oliveira/);
  assert.doesNotMatch(html, /Thalisson/);
  assert.strictEqual(a.w.aba, "entregadores", "a busca nao deve arrastar pra outra aba");
});

test("busca sem nenhum resultado mostra mensagem de busca, nao 'nada registrado'", async () => {
  const a = carregar({ role: "sac" });
  a.w.trocarAba("entregadores");
  await esperarVarias();

  a.els["wac-busca"].value = "ninguem-com-esse-nome";
  a.ctx._wacFiltrar();
  assert.match(a.els["wac-ent-lista"].innerHTML, /Nenhum entregador encontrado/);
});

test("dia sem nenhum aviso mostra 'nenhum aviso registrado'", async () => {
  const a = carregar({ role: "sac", getResposta: () => ({ linhas: [], dias: [] }) });
  a.w.trocarAba("entregadores");
  await esperarVarias();
  assert.match(a.els["wac-ent-lista"].innerHTML, /Nenhum aviso registrado ainda/);
});

// ── so dev dispara manual ────────────────────────────────────────────────
test("sac nao ve os botoes de disparo manual", async () => {
  const a = carregar({ role: "sac" });
  a.w.trocarAba("entregadores");
  await esperarVarias();
  assert.strictEqual(a.els["wac-ent-manual"].style.display, "none");
});

test("dev ve os botoes de disparo manual", async () => {
  const a = carregar({ role: "dev" });
  a.w.trocarAba("entregadores");
  await esperarVarias();
  assert.strictEqual(a.els["wac-ent-manual"].style.display, "flex");
});

test("disparo manual confirma antes, chama o endpoint com a rodada certa e recarrega", async () => {
  const a = carregar({ role: "dev" });
  a.w.trocarAba("entregadores");
  await esperarVarias();
  a.chamadas.fetch.length = 0;

  a.ctx._wacEntDispararManual("22:05");
  await esperarVarias();

  assert.strictEqual(a.chamadas.confirmado, true);
  const post = a.chamadas.fetch.find((f) => f.metodo === "POST");
  assert.ok(post, "chamou POST /admin/avisos-entregador/rodada");
  assert.ok(a.chamadas.fetch.some((f) => f.metodo === "GET"), "recarrega a lista depois de disparar");
  assert.strictEqual(a.chamadas.alertas.length, 1);
});

// ── URL / rota ────────────────────────────────────────────────────────────
test("a rota de Entregadores nunca leva transportadora, mesmo com uma selecionada", async () => {
  const a = carregar({ role: "sac" });
  a.w.aba = "entregadores";
  assert.strictEqual(a.w.rotaLista(), "Ativos/Conversas/Entregadores");
});

test("trocar de aba pra Entregadores e depois pra Outros ativos nao quebra (cada uma cuida do proprio dado)", async () => {
  const a = carregar({ role: "sac" });
  a.w.trocarAba("entregadores");
  await esperarVarias();
  a.w.trocarAba("outros");
  await esperarVarias();
  assert.strictEqual(a.els["wac-visao-entregadores"].style.display, "none");
});
