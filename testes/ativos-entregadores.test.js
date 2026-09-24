// Testes da aba "Entregadores" em Ativos > Conversas: as conversas com os entregadores (o aviso
// de rota incompleta, automático ou pelo botão Alertar, e o que eles respondem).
//
// O que se protege:
//   - é conversa como as outras: um card POR ENTREGADOR (não por pedido, não por data), com o
//     mesmo chat. O servidor marca a conversa com tem_entregador, e isso tem que vencer o
//     resto da classificação — o aviso automático não tem autor nem cargo, e sem a marca ele
//     cairia em "Acareações", que é onde vai quem não tem cargo;
//   - os cards saem dos dados JÁ carregados das conversas: trocar pra aba não faz requisição
//     nenhuma (antes havia um endpoint e um registro por data à parte, que saíram);
//   - o nome do entregador nunca vira HTML;
//   - no chat, o nome dele vai no topo e some o "Marcar respondido" (não tem pedido pra
//     resolver) — e as conversas de cliente continuam exatamente como eram;
//   - a busca acha por nome e leva pra aba dele, como nas outras abas.
//
// Script carregado sozinho num contexto isolado, com DOM e fetch de mentira. Dados de
// TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "whatsapp-conversa.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// whatsapp-conversa.js espera estes globais de whatsapp-teste.js (mapa de transportadora por
// template). Vazios bastam: nenhuma conversa aqui vem de um disparo com transportadora.
const STUBS = `
const WA_TRANSPORTADORAS = {};
const WA_TRANSPORTADORAS_ORDEM = [];
function _waTransportadoraDe() { return null; }`;

const ACESSOR = `
;globalThis.__w = {
  set aba(v) { _wacAba = v; },
  get aba() { return _wacAba; },
  set dados(v) { _wacDados = v; },
  trocarAba: (a) => _wacTrocarAba(a),
  rotaLista: () => _wacRotaLista(),
  abaDe: (c) => _wacAbaDe(c),
  semTransp: (a) => _wacSemTransp(a),
  rotaDaConversa: (c, n, p) => _wacRotaDaConversa(c, n, p),
  get chatEntregador() { return _wacChatEntregador; },
  atualizarBarra: () => _wacAtualizarBarraSelecao(),
  abrirConversa: (n, p, r) => _wacAbrirConversa(n, p, r),
};`;

const esperar = () => new Promise((r) => setImmediate(r));
const esperarVarias = async () => { for (let i = 0; i < 6; i++) await esperar(); };

function criarElemento() {
  const o = {
    innerHTML: "", style: {}, value: "", setAttribute() {}, querySelectorAll: () => [],
    querySelector: () => null,
  };
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = String(v); }, get() { return o.innerHTML; } });
  return o;
}

// O que document.createElement devolve: como no navegador, atribuir innerText grava o texto
// ESCAPADO em innerHTML. É o que _wacEscapar usa pra o nome de um entregador nunca virar HTML.
const escapar = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function criarElementoDom() {
  const o = { innerHTML: "", style: {} };
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = escapar(v); }, get() { return o.innerHTML; } });
  return o;
}

function carregar() {
  const els = {};
  const el = (id) => els[id] || (els[id] = Object.assign(criarElemento(), { id }));
  const chamadas = { fetch: [] };

  // O botão "Marcar respondido" da barra de seleção: só o que o código mexe nele (style).
  const botaoMarcar = { style: {} };
  el("wac-selecao-barra").querySelector = () => botaoMarcar;

  const ctx = vm.createContext({
    console, API: "", token: "",
    fetch: async (url) => { chamadas.fetch.push(url); return { ok: true, json: async () => [] }; },
    window: { _gcUser: { role: "sac" } },
    document: { getElementById: el, createElement: () => criarElementoDom(), querySelectorAll: () => [] },
    CSS: { escape: (s) => s },
    setInterval: () => 1, clearInterval() {},
    gcConfirm() {}, gcAlert() {},
    skMostrar() {}, skFim(elemento, msg) { elemento.innerHTML = msg; }, mostrarTela() {},
    _rotaAtualizarUrl() {},
  });
  vm.runInContext(STUBS, ctx);
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "whatsapp-conversa.js" });

  return { ctx, els, chamadas, botaoMarcar, w: ctx.__w };
}

const AGORA = "2026-09-23T20:00:00";
const CLIENTE   = { pedido: "PC1", numero: "5549991110001", primeiro_envio: AGORA, enviado_por_role: "sac", nao_lidas: 0, ultima: AGORA };
const CHAMOU    = { pedido: "", numero: "5549992220001", primeiro_envio: null, nao_lidas: 1, ultima: AGORA };
const RESPONDEU = { pedido: "", numero: "5549994440001", primeiro_envio: AGORA, enviado_por_role: null, tem_entregador: true,
                    nome_cliente: "Fulano <Entregador>", tem_resposta_nova: true, nao_lidas: 2, ultima: AGORA };
const SO_AVISO  = { pedido: "", numero: "5549994440002", primeiro_envio: AGORA, enviado_por_role: null, tem_entregador: true,
                    nome_cliente: "Ciclano", tem_resposta_nova: false, nao_lidas: 0, ultima: AGORA };
const todas = () => [CLIENTE, CHAMOU, RESPONDEU, SO_AVISO].map((c) => ({ ...c }));

// ── classificação ─────────────────────────────────────────────────────────
test("conversa com entregador vai pra aba Entregadores mesmo sem cargo nem autor", () => {
  const a = carregar();
  assert.strictEqual(a.w.abaDe(RESPONDEU), "entregadores",
    "o aviso automatico nao tem cargo - sem a marca cairia em acareacao");
});

test("as conversas de cliente continuam nas abas de sempre", () => {
  const a = carregar();
  assert.strictEqual(a.w.abaDe(CLIENTE), "acareacao");
  assert.strictEqual(a.w.abaDe(CHAMOU), "chamaram");
  assert.strictEqual(a.w.abaDe({ ...CLIENTE, enviado_por_role: "admin" }), "outros");
});

test("Entregadores nao tem transportadora, como Nos chamaram", () => {
  const a = carregar();
  assert.strictEqual(a.w.semTransp("entregadores"), true);
  assert.strictEqual(a.w.semTransp("chamaram"), true);
  assert.strictEqual(a.w.semTransp("acareacao"), false);
});

// ── a lista ───────────────────────────────────────────────────────────────
test("trocar pra Entregadores nao busca nada: os cards saem das conversas ja carregadas", async () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.trocarAba("entregadores");
  await esperarVarias();

  assert.deepStrictEqual(a.chamadas.fetch, []);
  assert.match(a.els["wac-lista-entregadores"].innerHTML, /Ciclano/);
});

test("lista so conversas de entregador, um card por entregador, com o nome sem virar HTML", () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.aba = "entregadores";
  a.ctx._wacRenderizar();

  const html = a.els["wac-lista-entregadores"].innerHTML;
  assert.ok(html.includes("Fulano &lt;Entregador&gt;"), "nome escapado");
  assert.ok(html.includes("Ciclano"));
  assert.ok(!html.includes("PC1"), "conversa de cliente nao aparece aqui");
  assert.strictEqual(html.split("wac-card-avatar").length - 1, 2, "dois entregadores, dois cards");
});

test("quem respondeu depois do aviso mostra Respondeu; quem so recebeu mostra Aviso enviado", () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.aba = "entregadores";
  a.ctx._wacRenderizar();

  const html = a.els["wac-lista-entregadores"].innerHTML;
  assert.match(html, /Respondeu/);
  assert.match(html, /Aviso enviado/);
});

test("o card leva o selo de nao lidas e abre o chat pelo numero, sem pedido", () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.aba = "entregadores";
  a.ctx._wacRenderizar();

  const html = a.els["wac-lista-entregadores"].innerHTML;
  assert.ok(html.includes("wac-card-naolidas"));
  assert.ok(html.includes("_wacAbrirConversa('5549994440001','',false)"));
});

test("a view de Entregadores aparece e a das outras abas some", () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.aba = "entregadores";
  a.ctx._wacRenderizar();
  assert.strictEqual(a.els["wac-visao-entregadores"].style.display, "");
  assert.strictEqual(a.els["wac-lista-resultado"].style.display, "none");
});

test("sem nenhuma conversa de entregador, a mensagem explica de onde elas vem", () => {
  const a = carregar();
  a.w.dados = [{ ...CLIENTE }];
  a.w.aba = "entregadores";
  a.ctx._wacRenderizar();
  assert.match(a.els["wac-lista-entregadores"].innerHTML, /aviso de rota incompleta/);
});

// ── busca ─────────────────────────────────────────────────────────────────
test("busca filtra por nome do entregador, sem arrastar pra outra aba", () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.aba = "entregadores";
  a.els["wac-busca"] = Object.assign(criarElemento(), { value: "ciclano" });
  a.ctx._wacFiltrar();

  const html = a.els["wac-lista-entregadores"].innerHTML;
  assert.match(html, /Ciclano/);
  assert.doesNotMatch(html, /Fulano/);
  assert.strictEqual(a.w.aba, "entregadores");
});

test("buscar o nome de um entregador estando em outra aba leva pra aba dele", () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.aba = "acareacao";
  a.els["wac-busca"] = Object.assign(criarElemento(), { value: "ciclano" });
  a.ctx._wacFiltrar();

  assert.strictEqual(a.w.aba, "entregadores", "a busca pula pra onde o resultado esta");
  assert.match(a.els["wac-lista-entregadores"].innerHTML, /Ciclano/);
});

test("busca sem nenhum resultado diz que nao achou, em vez de explicar de onde as conversas vem", () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.aba = "entregadores";
  a.els["wac-busca"] = Object.assign(criarElemento(), { value: "ninguem-com-esse-nome" });
  a.ctx._wacFiltrar();
  assert.match(a.els["wac-lista-entregadores"].innerHTML, /Nenhum entregador encontrado/);
});

// ── URL / rota ────────────────────────────────────────────────────────────
test("a rota da lista de Entregadores nunca leva transportadora", () => {
  const a = carregar();
  a.w.aba = "entregadores";
  assert.strictEqual(a.w.rotaLista(), "Ativos/Conversas/Entregadores");
});

test("o link direto da conversa com entregador identifica pelo numero", () => {
  const a = carregar();
  assert.strictEqual(a.w.rotaDaConversa(RESPONDEU, RESPONDEU.numero, ""),
    "Ativos/Conversas/Entregadores/Outras/5549994440001");
});

test("trocar de Entregadores pra Outros ativos nao quebra (cada aba cuida do proprio desenho)", async () => {
  const a = carregar();
  a.w.dados = todas();
  a.w.trocarAba("entregadores");
  await esperarVarias();
  a.w.trocarAba("outros");
  await esperarVarias();
  assert.strictEqual(a.els["wac-visao-entregadores"].style.display, "none");
});

// ── o chat ────────────────────────────────────────────────────────────────
const ENTREGADOR_NO_CHAT = { pedido: "", numero: "5549994440001", primeiro_envio: AGORA, tem_entregador: true,
                             nome_cliente: "Fulano Entregador", ultima: AGORA };

test("abrir conversa com entregador: o nome vai no topo e o numero embaixo", async () => {
  const a = carregar();
  a.w.dados = [{ ...ENTREGADOR_NO_CHAT }, { ...CLIENTE }];
  a.w.abrirConversa("5549994440001", "", false);
  await esperarVarias();

  assert.strictEqual(a.els["wac-chat-nome"].innerHTML, "Fulano Entregador");
  assert.strictEqual(a.els["wac-chat-numero"].innerHTML, "+55 49 99444-0001");
  assert.strictEqual(a.w.chatEntregador, true);
});

test("conversa de cliente continua mostrando so o numero, como print de prova", async () => {
  const a = carregar();
  a.w.dados = [{ ...ENTREGADOR_NO_CHAT }, { ...CLIENTE }];
  a.w.abrirConversa("5549991110001", "PC1", false);
  await esperarVarias();

  assert.strictEqual(a.els["wac-chat-nome"].innerHTML, "+55 49 99111-0001");
  assert.strictEqual(a.els["wac-chat-numero"].innerHTML, "");
  assert.strictEqual(a.w.chatEntregador, false);
});

test("conversa com entregador nao tem Marcar respondido (nao ha pedido); a de cliente tem", async () => {
  const a = carregar();
  a.w.dados = [{ ...ENTREGADOR_NO_CHAT }, { ...CLIENTE }];

  a.w.abrirConversa("5549994440001", "", false);
  await esperarVarias();
  a.w.atualizarBarra();
  assert.strictEqual(a.botaoMarcar.style.display, "none");

  a.w.abrirConversa("5549991110001", "PC1", false);
  await esperarVarias();
  a.w.atualizarBarra();
  assert.strictEqual(a.botaoMarcar.style.display, "", "o botao volta nas conversas de cliente");
});

// ── o que saiu ────────────────────────────────────────────────────────────
// Decisão do usuário (24/09/2026): o registro de avisos por data, o seletor de dia e os
// botões "Disparar 19:05/22:05 agora" não fazem mais parte da aba.
test("a aba nao tem mais registro por data, seletor de dia nem botoes de disparar rodada", () => {
  for (const marca of ["wac-ent-registro", "wac-ent-dia", "wac-ent-manual", "wac-ent-lista",
    "Disparar 19:05", "Disparar 22:05", "_wacEntDispararManual", "Registro de avisos"]) {
    assert.ok(!indexHtml.includes(marca), `index.html ainda tem: ${marca}`);
  }
  for (const marca of ["_wacEntCarregar", "_wacEntRenderizar", "_wacEntDispararManual", "/admin/avisos-entregador/rodada"]) {
    assert.ok(!fonte.includes(marca), `whatsapp-conversa.js ainda tem: ${marca}`);
  }
});
