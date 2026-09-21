// Testes da separação dos Ativos por polo, no navegador.
//
// O servidor devolve só as conversas do polo de quem pede, e quem ainda não escolheu o
// seu recebe polo_pendente em vez de lista. O que se protege aqui é o caminho de volta:
// a tela perguntar o polo de novo e, depois da escolha, recarregar sozinha. Errar isso
// não dá erro nenhum — só uma tela que diz "escolha o seu polo" e nunca mais mostra
// nada, mesmo com o polo já escolhido.
//
// O detalhe que pega: a pergunta pode já estar aberta, vinda do clique no menu Ativos, e
// aí um callback passado a gcPoloPerguntar() nem seria guardado. Quem espera a escolha
// entra por gcPoloQuandoEscolher().
//
// Os dois scripts são carregados no MESMO contexto, como no navegador, com um DOM de
// mentira que só sabe o que eles pedem. Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (nome) => fs.readFileSync(path.join(__dirname, "..", "js", nome), "utf8");
const fontePolo = ler("shopee-polo.js");
const fonteConversa = ler("whatsapp-conversa.js");

// Só o que os arquivos precisam de modals.js: as strings de estilo da pergunta.
const ESTILOS = `
const _gcOverlayStyle = "", _gcCardStyle = "", _gcTitleStyle = "", _gcMsgStyle = "";`;

// O estado de conversa é `let` no topo do arquivo: não vira propriedade do contexto.
const ACESSOR = `
;globalThis.__w = {
  set numero(v) { _wacNumeroAtual = v; },
};`;

const esperar = () => new Promise((r) => setImmediate(r));
const esperarVarias = async () => { for (let i = 0; i < 6; i++) await esperar(); };

/** Pergunta de polo de mentira: os botões saem do innerHTML, como o DOM faria. */
function criarElemento() {
  const o = {
    removido: false, innerHTML: "", style: {},
    setAttribute() {}, _botoes: null,
    querySelectorAll() {
      if (!o._botoes) {
        o._botoes = [...o.innerHTML.matchAll(/data-polo="(\w+)"/g)].map((m) => ({
          dataset: { polo: m[1] }, disabled: false, clique: null,
          addEventListener(_, fn) { this.clique = fn; },
        }));
      }
      return o._botoes;
    },
    querySelector() { return { style: {}, innerText: "" }; },
    remove() { o.removido = true; },
  };
  // Escapar um texto passa por innerText -> innerHTML.
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = String(v); }, get() { return o.innerHTML; } });
  return o;
}

/**
 * @param {Object} opcoes
 * @param {?string} opcoes.polo Polo já gravado no servidor.
 * @param {Function=} opcoes.conversas (numeroDaChamada, polo) => corpo de /admin/whatsapp/conversas.
 */
function carregar({ polo = null, conversas } = {}) {
  const overlays = [];
  const els = {};
  const el = (id) => els[id] || (els[id] = Object.assign(criarElemento(), { id }));
  const chamadas = { meuXpt: 0, conversas: 0, salvos: [], vazios: [], detalhe: [] };
  const servidor = { polo };
  const resposta = conversas || ((n, p) => (p ? [] : { error: "Escolha o seu polo antes de usar os Ativos.", polo_pendente: true }));

  const fetch = async (url, opts = {}) => {
    if (url.endsWith("/shopee/meu-xpt")) {
      chamadas.meuXpt++;
      return { ok: true, json: async () => ({ polo: servidor.polo, polo_label: null, xpt: null }) };
    }
    if (url.endsWith("/shopee/meu-polo")) {
      servidor.polo = JSON.parse(opts.body).polo;
      chamadas.salvos.push(servidor.polo);
      return { ok: true, json: async () => ({ success: true, polo: servidor.polo }) };
    }
    if (url.endsWith("/admin/whatsapp/conversas")) {
      const corpo = resposta(chamadas.conversas++, servidor.polo);
      return { ok: true, json: async () => corpo };
    }
    if (url.includes("/admin/whatsapp/conversa/")) {
      return { ok: false, json: async () => ({ error: "Essa conversa é de outro polo." }) };
    }
    throw new Error("fetch inesperado: " + url);
  };

  const document = {
    getElementById: (id) => (id === "gc-polo-overlay" ? (overlays.find((o) => !o.removido) || null) : el(id)),
    createElement: () => criarElemento(),
    body: { appendChild: (o) => overlays.push(o) },
    querySelectorAll: () => [],
  };

  const ctx = vm.createContext({
    console, document, fetch, API: "", token: "",
    gcConfirm: (msg, ok) => ok(),   // o "Sim, é esse" já vem clicado
    gcAlert() {},
    skMostrar() {}, skFim: (_, msg) => chamadas.vazios.push(msg), mostrarTela() {},
  });
  vm.runInContext(ESTILOS, ctx);
  vm.runInContext(fontePolo, ctx, { filename: "shopee-polo.js" });
  vm.runInContext(fonteConversa + ACESSOR, ctx, { filename: "whatsapp-conversa.js" });

  const perguntaAberta = () => overlays.find((o) => !o.removido) || null;
  const escolher = async (chave) => {
    perguntaAberta().querySelectorAll().find((b) => b.dataset.polo === chave).clique();
    await esperarVarias();
  };
  // Declaração const no topo de um script não vira propriedade do contexto (no navegador
  // ela é global do mesmo jeito): quem precisa dela lê pelo escopo do script.
  const global = (nome) => vm.runInContext(nome, ctx);
  return { ctx, els, chamadas, servidor, overlays, perguntaAberta, escolher, global, w: ctx.__w };
}

// ── shopee-polo.js ───────────────────────────────────────────────────────
test("gcPoloInvalidar faz a proxima leitura ir de novo ao servidor", async () => {
  const a = carregar({ polo: "cacador" });
  await a.ctx.gcPoloCarregar();
  await a.ctx.gcPoloCarregar();
  assert.strictEqual(a.chamadas.meuXpt, 1, "a segunda leitura vem do que ficou guardado");

  a.global("gcPoloInvalidar")();
  await a.ctx.gcPoloCarregar();
  assert.strictEqual(a.chamadas.meuXpt, 2);
});

test("quem espera a escolha e chamado, mesmo com a pergunta aberta por outro caminho", async () => {
  const a = carregar({ polo: null });
  // Aberta pelo clique no menu: sem callback nenhum.
  await a.ctx.gcPoloGarantir();
  assert.ok(a.perguntaAberta(), "sem polo, a pergunta abre");

  const recebidos = [];
  a.global("gcPoloQuandoEscolher")((info) => recebidos.push(info.polo));
  await a.escolher("videira");

  assert.deepStrictEqual(a.chamadas.salvos, ["videira"]);
  assert.deepStrictEqual(recebidos, ["videira"]);
  assert.strictEqual(a.perguntaAberta(), null, "a pergunta fecha depois de escolher");
});

test("quem espera a escolha e chamado uma vez so", async () => {
  const a = carregar({ polo: null });
  await a.ctx.gcPoloGarantir();
  let vezes = 0;
  a.global("gcPoloQuandoEscolher")(() => { vezes++; });
  await a.escolher("cacador");
  assert.strictEqual(vezes, 1);
});

test("o callback de gcPoloGarantir continua sendo chamado ao escolher", async () => {
  const a = carregar({ polo: null });
  const recebidos = [];
  await a.ctx.gcPoloGarantir((info) => recebidos.push(info.polo));
  await a.escolher("cacador");
  assert.deepStrictEqual(recebidos, ["cacador"]);
});

test("com o polo ja escolhido a pergunta nao abre", async () => {
  const a = carregar({ polo: "videira" });
  await a.ctx.gcPoloGarantir();
  assert.strictEqual(a.perguntaAberta(), null);
});

// ── lista de conversas ───────────────────────────────────────────────────
test("polo pendente: a lista avisa, pergunta o polo e recarrega sozinha depois da escolha", async () => {
  const a = carregar({ polo: null });
  a.ctx._wacCarregarLista();
  await esperarVarias();

  assert.ok(a.chamadas.vazios.includes("Escolha o seu polo para ver as conversas."));
  assert.ok(a.perguntaAberta(), "a pergunta do polo abriu");
  assert.strictEqual(a.chamadas.conversas, 1);

  await a.escolher("cacador");
  assert.strictEqual(a.chamadas.conversas, 2, "recarregou a lista depois de escolher");
  assert.ok(a.chamadas.vazios.includes("Nenhuma conversa registrada ainda."), "e agora veio a lista do polo");
});

test("polo pendente com a pergunta ja aberta pelo menu: a lista recarrega do mesmo jeito", async () => {
  const a = carregar({ polo: null });
  await a.ctx.gcPoloGarantir();            // clique no menu Ativos
  a.ctx._wacCarregarLista();               // e a tela pede a lista logo em seguida
  await esperarVarias();
  assert.strictEqual(a.chamadas.conversas, 1);

  await a.escolher("videira");
  assert.strictEqual(a.chamadas.conversas, 2);
});

test("se o servidor seguir dizendo polo pendente depois da escolha, nao vira laco", async () => {
  const sempre = () => ({ error: "Escolha o seu polo antes de usar os Ativos.", polo_pendente: true });
  const a = carregar({ polo: null, conversas: sempre });
  a.ctx._wacCarregarLista();
  await esperarVarias();
  await a.escolher("cacador");
  await esperarVarias();

  assert.strictEqual(a.chamadas.conversas, 2, "uma tentativa de recarga, e para");
});

test("polo removido no meio da sessao: a lista descobre e pergunta de novo", async () => {
  const a = carregar({ polo: "cacador" });
  await a.ctx.gcPoloCarregar();            // o navegador guardou o polo antigo
  a.servidor.polo = null;                  // um administrador tirou o polo
  a.ctx._wacCarregarLista();
  await esperarVarias();

  assert.ok(a.perguntaAberta(), "sem polo no servidor, a pergunta volta");
});

test("lista normal nao pergunta nada nem consulta o polo", async () => {
  const a = carregar({ polo: "cacador" });
  a.ctx._wacCarregarLista();
  await esperarVarias();

  assert.strictEqual(a.chamadas.meuXpt, 0);
  assert.strictEqual(a.perguntaAberta(), null);
  assert.strictEqual(a.chamadas.conversas, 1);
});

// ── conversa recusada ────────────────────────────────────────────────────
test("conversa de outro polo mostra o motivo do servidor, nao 'nenhuma mensagem'", async () => {
  const a = carregar({ polo: "cacador" });
  a.w.numero = "5549991110002";
  a.ctx._wacCarregarConversa();
  await esperarVarias();

  const corpo = a.els["wac-chat-body"].innerHTML;
  assert.match(corpo, /Essa conversa é de outro polo\./);
  assert.doesNotMatch(corpo, /Nenhuma mensagem/);
});

// ── o menu ───────────────────────────────────────────────────────────────
test("o menu Ativos pergunta o polo no clique, como o da Shopee", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const menu = html.match(/<li[^>]*id="menu-ativos"[^>]*>/)[0];
  assert.match(menu, /onclick="toggleMenu\(this\); gcPoloGarantir\(\)"/);
});
