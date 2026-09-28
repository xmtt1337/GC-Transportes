// Testes de js/macros.js — a parte do Colador (automacao/colador_neon.py): Rodar, Configurar
// e quem está com a janela aberta.
//
// O que se protege, e por quê:
//   - diferente dos macros do SPX, aqui NÃO há "computador escolhido" nem horário — é Rodar
//     (pega qualquer Colador aberto) e Configurar (a config da PRÓXIMA sessão);
//   - "Rodar" avisa quando pediu mas ninguém está com o Colador aberto — sem isso, clicar e
//     não acontecer nada parece a mesma coisa que ter funcionado;
//   - config inválida nem sai do navegador, com a mensagem na hora (mesmos limites do servidor:
//     carência 0–3600s, lote 1–500, intervalo 0–1,5s);
//   - texto vindo do servidor (erro, computador, quem pediu) nunca vira HTML;
//   - abrir Configurar edita uma CÓPIA — cancelar não pode alterar a lista antes de Salvar.
//
// Script carregado sozinho num contexto isolado, com DOM, fetch e timers de mentira.
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "macros.js"), "utf8");

const ACESSOR = `
;globalThis.__m = {
  get lista() { return _macLista; }, set lista(v) { _macLista = v; },
  get coladores() { return _macColadores; }, set coladores(v) { _macColadores = v; },
  get editando() { return _macColadorEditando; }, set editando(v) { _macColadorEditando = v; },
  get poll() { return _macPollColador; },
};`;

function escapar(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function criarElemento(id) {
  const classes = new Set();
  const o = {
    id, innerHTML: "", style: {}, value: "", checked: false, disabled: false, textContent: "", min: "", max: "",
    setAttribute() {}, querySelector() { return null; },
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, forca) => { (forca === undefined ? !classes.has(c) : forca) ? classes.add(c) : classes.delete(c); },
    },
  };
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = escapar(v); }, get() { return o.innerHTML; } });
  return o;
}

function carregar({ rotas = {} } = {}) {
  const els = {};
  const el = (id) => els[id] || (els[id] = criarElemento(id));
  const chamadas = [];
  const alertas = [];
  const modais = { abertos: [], fechados: [] };
  const timers = [];

  const fetchFalso = async (url, opcoes = {}) => {
    const metodo = opcoes.method || "GET";
    const caminho = url.replace("http://api.test", "");
    chamadas.push({ metodo, caminho, corpo: opcoes.body ? JSON.parse(opcoes.body) : undefined });
    const r = rotas[`${metodo} ${caminho}`];
    if (r === undefined) throw new TypeError("sem rota de teste: " + metodo + " " + caminho);
    if (r instanceof Error) throw r;
    const { status = 200, corpo = {} } = typeof r === "function" ? r() : r;
    return { ok: status < 400, status, json: async () => corpo };
  };

  const ctx = vm.createContext({
    console, Date, Intl, Promise, JSON, Set, Math, Number, String, Array, Object, RegExp,
    document: { getElementById: el },
    API: "http://api.test", token: "tok",
    fetch: fetchFalso,
    gcAlert: (m) => alertas.push(m),
    _abrirModal: (id) => modais.abertos.push(id),
    _fecharModal: (id) => modais.fechados.push(id),
    skMostrar() {}, skFim() {},
    window: { addEventListener() {}, removeEventListener() {}, innerHeight: 800, innerWidth: 1200 },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros.js" });
  const esperar = () => new Promise((r) => setImmediate(r));
  return { ctx, m: ctx.__m, els, el, chamadas, alertas, modais, timers, esperar };
}

const CFG = (extra = {}) => ({
  todos_dias: false, dia: "2026-09-28", xpt: "XPT_CFC", carencia: 60, lote: 20,
  intervalo: 0.5, continuo: true, pagina: "singleReceiveNew", ...extra,
});
const colador = (qual, extra = {}) => ({
  qual, chave: `colador_${qual}`, nome: qual === "recebimento" ? "Colador — Recebimento" : "Colador — AT Cluster",
  detalhe: "detalhe", configurado: true, config: CFG(), resumo: "XPT_CFC · 28/09",
  comando: null, computadores: [], ...extra,
});
const DOIS = () => [colador("recebimento"), colador("at_cluster")];

// Objeto/array criado dentro do vm tem outro prototipo (outro realm): normaliza antes de
// comparar com deepStrictEqual.
const plano = (x) => JSON.parse(JSON.stringify(x));

const linha = (html, qual) => {
  const partes = html.split('<div class="mac-item mac-item-spx">').slice(1);
  return partes.find((p) => p.includes(`_macRodarColador('${qual}'`)) || "";
};

// ── a linha de cada colador ────────────────────────────────────────────────
test("os dois coladores aparecem, cada um com Rodar e Configurar", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecaoColador(DOIS());
  for (const q of ["recebimento", "at_cluster"]) {
    assert.ok(html.includes(`_macRodarColador('${q}'`), q);
    assert.ok(html.includes(`_macAbrirConfigurarColador('${q}')`), q);
  }
  assert.ok(html.includes("Colador — Recebimento") && html.includes("Colador — AT Cluster"));
});

test("sem coladores (servidor antigo, rota indisponível), a seção nem aparece", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macHtmlSecaoColador([]), "");
  assert.strictEqual(a.ctx._macHtmlSecaoColador(null), "");
});

test("não configurado: resumo apagado, mas continua com Rodar e Configurar", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecaoColador([colador("recebimento", { configurado: false, resumo: "Ainda não configurado" })]);
  assert.ok(html.includes("mac-agenda-mudo"));
  assert.ok(html.includes("_macRodarColador"));
});

test("Rodar fica apagado só com pedido 'aguardando'; outros estados liberam de novo", () => {
  const a = carregar();
  const desabilitado = (estado) => {
    const html = a.ctx._macHtmlSecaoColador([colador("recebimento", { comando: estado ? { estado } : null })]);
    return /class="mac-rodar"[^>]*\bdisabled\b/.test(linha(html, "recebimento"));
  };
  assert.strictEqual(desabilitado("aguardando"), true);
  for (const e of ["iniciado", "erro", "expirado", null]) assert.strictEqual(desabilitado(e), false, String(e));
});

// ── presença ──────────────────────────────────────────────────────────────
test("presença: ninguém, um, e mais de um computador conectado", () => {
  const a = carregar();
  assert.match(a.ctx._macColadorPresencaHtml([]), /nenhum computador conectado/);
  assert.match(a.ctx._macColadorPresencaHtml([{ nome: "CASA", online: true }]), /CASA/);
  const dois = a.ctx._macColadorPresencaHtml([{ nome: "CASA", online: true }, { nome: "GALPAO", online: true }]);
  assert.match(dois, /2 computadores conectados/);
});

test("computador desconectado não conta na presença", () => {
  const a = carregar();
  const html = a.ctx._macColadorPresencaHtml([{ nome: "CASA", online: false }]);
  assert.match(html, /nenhum computador conectado/);
});

test("nome de computador nunca vira HTML", () => {
  const a = carregar();
  const html = a.ctx._macColadorPresencaHtml([{ nome: "<b>x</b>", online: true }]);
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});

// ── o comando ─────────────────────────────────────────────────────────────
test("cada estado do comando diz o que a pessoa precisa saber", () => {
  const a = carregar();
  const cmd = (estado, extra) => ({ estado, criado_por: "Dev", criado_em: "2026-09-28T14:32:00.000Z", ...extra });
  assert.strictEqual(a.ctx._macComandoColadorTexto(cmd("aguardando")).tom, "andando");
  assert.match(a.ctx._macComandoColadorTexto(cmd("iniciado", { maquina: "CASA" })).texto, /por Dev em CASA/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("erro", { erro: "banco recusou" })).texto, /Não rodou: banco recusou/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("erro")).texto, /motivo não informado/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("expirado")).texto, /Ninguém abriu o Colador/);
});

test("sem comando, ou já iniciado, a linha de situação nem aparece", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macSituacaoColadorHtml(null), "");
  assert.strictEqual(a.ctx._macSituacaoColadorHtml({ estado: "iniciado" }), "");
});

test("erro do comando (texto de outro computador) nunca vira HTML", () => {
  const a = carregar();
  const html = a.ctx._macSituacaoColadorHtml({ estado: "erro", erro: "<img src=x onerror=1>" });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

// ── carregar a lista ──────────────────────────────────────────────────────
test("a lista junta os coladores vindos do servidor", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [] } },
    "GET /admin/macros/spx": { corpo: { macros: [] } },
    "GET /admin/macros/colador": { corpo: { coladores: DOIS() } },
  } });
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.coladores.length, 2);
  assert.ok(a.el("mac-lista").innerHTML.includes("_macRodarColador"));
});

test("rota do colador fora do ar não derruba o resto da tela", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [] } },
    "GET /admin/macros/spx": { corpo: { macros: [] } },
    "GET /admin/macros/colador": new TypeError("falhou"),
  } });
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.coladores.length, 0);
});

// ── Rodar ─────────────────────────────────────────────────────────────────
const ROTA_RODAR = "POST /admin/macros/colador/recebimento/rodar";

test("Rodar pede ao servidor e mostra o pedido", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { corpo: { ok: true, comando: { id: 1, estado: "aguardando", criado_por: "Dev" }, algum_conectado: true } } } });
  a.m.coladores = DOIS();
  const botao = { disabled: false };
  a.ctx._macRodarColador("recebimento", botao);
  assert.strictEqual(botao.disabled, true);
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].metodo, "POST");
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/colador/recebimento/rodar");
  assert.strictEqual(a.m.coladores[0].comando.estado, "aguardando");
  assert.deepStrictEqual(a.alertas, []);
});

test("Rodar sem ninguém conectado avisa (mas o pedido continua valendo)", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { corpo: { ok: true, comando: { id: 1, estado: "aguardando" }, algum_conectado: false } } } });
  a.m.coladores = DOIS();
  a.ctx._macRodarColador("recebimento", {});
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.alertas.length, 1);
  assert.match(a.alertas[0], /nenhum computador está com o Colador aberto/);
  assert.strictEqual(a.m.coladores[0].comando.estado, "aguardando", "o pedido nao e descartado so por avisar");
});

test("erro do servidor devolve o botão e avisa", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { status: 500, corpo: { error: "Erro interno" } } } });
  a.m.coladores = DOIS();
  const botao = { disabled: false };
  a.ctx._macRodarColador("recebimento", botao);
  await a.esperar(); await a.esperar();
  assert.strictEqual(botao.disabled, false);
  assert.deepStrictEqual(a.alertas, ["Erro interno"]);
});

test("sem rede, devolve o botão e avisa", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: new TypeError("failed to fetch") } });
  a.m.coladores = DOIS();
  const botao = { disabled: false };
  a.ctx._macRodarColador("recebimento", botao);
  await a.esperar(); await a.esperar();
  assert.strictEqual(botao.disabled, false);
  assert.deepStrictEqual(a.alertas, ["Erro ao conectar com o servidor."]);
});

// ── validação da config (mesmas regras do servidor) ─────────────────────────
test("config válida passa", () => {
  const a = carregar();
  assert.deepStrictEqual(plano(a.ctx._macMontarConfigColador(CFG()).config), {
    todos_dias: false, dia: "2026-09-28", xpt: "XPT_CFC", carencia: 60, lote: 20, intervalo: 0.5, continuo: true,
  });
});

test("sem todos_dias, dia fora do formato é recusado", () => {
  const a = carregar();
  for (const dia of ["", "28/09/2026", "2026-9-28"]) {
    assert.match(a.ctx._macMontarConfigColador(CFG({ dia })).erro, /Informe o dia/, dia);
  }
});

test("todos_dias dispensa o dia", () => {
  const a = carregar();
  const r = a.ctx._macMontarConfigColador(CFG({ todos_dias: true, dia: "" }));
  assert.strictEqual(r.config.dia, null);
});

test("xpt vazio é recusado", () => {
  const a = carregar();
  assert.match(a.ctx._macMontarConfigColador(CFG({ xpt: "  " })).erro, /Escolha o XPT/);
});

test("carência, lote e intervalo respeitam os limites do servidor", () => {
  const a = carregar();
  assert.match(a.ctx._macMontarConfigColador(CFG({ carencia: 3601 })).erro, /Carência/);
  assert.match(a.ctx._macMontarConfigColador(CFG({ carencia: -1 })).erro, /Carência/);
  assert.match(a.ctx._macMontarConfigColador(CFG({ lote: 0 })).erro, /lote/);
  assert.match(a.ctx._macMontarConfigColador(CFG({ lote: 501 })).erro, /lote/);
  assert.match(a.ctx._macMontarConfigColador(CFG({ intervalo: 1.6 })).erro, /Intervalo/);
  assert.match(a.ctx._macMontarConfigColador(CFG({ intervalo: -0.1 })).erro, /Intervalo/);
  assert.ok(a.ctx._macMontarConfigColador(CFG({ carencia: 0, lote: 1, intervalo: 0 })).config);
  assert.ok(a.ctx._macMontarConfigColador(CFG({ carencia: 3600, lote: 500, intervalo: 1.5 })).config);
});

// ── abrir/editar/salvar ──────────────────────────────────────────────────
test("abrir Configurar copia a config — mexer nela não muda a lista antes de Salvar", () => {
  const a = carregar();
  a.m.coladores = [colador("recebimento")];
  a.ctx._macAbrirConfigurarColador("recebimento");
  a.m.editando.xpt = "XPT_VIA";
  assert.strictEqual(a.m.coladores[0].config.xpt, "XPT_CFC");
  assert.deepStrictEqual(a.modais.abertos, ["modal-macro-colador"]);
});

test("o modal mostra o nome do colador que foi aberto", () => {
  const a = carregar();
  a.m.coladores = [colador("at_cluster")];
  a.ctx._macAbrirConfigurarColador("at_cluster");
  assert.strictEqual(a.el("mac-col-titulo").innerHTML, "Colador — AT Cluster");
});

test("marcar todos os dias desabilita e limpa o campo de data na tela", () => {
  const a = carregar();
  a.m.coladores = [colador("recebimento")];
  a.ctx._macAbrirConfigurarColador("recebimento");
  a.ctx._macColMudarTodosDias(true);
  assert.strictEqual(a.el("mac-col-dia").disabled, true);
});

test("salvar manda a config normalizada, fecha o modal e recarrega por baixo", async () => {
  const a = carregar({ rotas: {
    "PUT /admin/macros/colador/recebimento": { corpo: { ok: true } },
    "GET /admin/macros": { corpo: { macros: [] } },
    "GET /admin/macros/spx": { corpo: { macros: [] } },
    "GET /admin/macros/colador": { corpo: { coladores: DOIS() } },
  } });
  a.m.coladores = [colador("recebimento")];
  a.ctx._macAbrirConfigurarColador("recebimento");
  a.ctx._macColMudarCampo("xpt", "XPT_VIA");
  a.ctx._macSalvarColador();
  await a.esperar(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].metodo, "PUT");
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/colador/recebimento");
  assert.strictEqual(a.chamadas[0].corpo.config.xpt, "XPT_VIA");
  assert.deepStrictEqual(a.modais.fechados, ["modal-macro-colador"]);
  assert.ok(a.chamadas.some((c) => c.caminho === "/admin/macros/colador" && c.metodo === "GET"));
});

test("config inválida nem sai do navegador: fica só no modal, sem fechar", () => {
  const a = carregar();
  a.m.coladores = [colador("recebimento")];
  a.ctx._macAbrirConfigurarColador("recebimento");
  a.ctx._macColMudarCampo("lote", 0);
  a.ctx._macSalvarColador();
  assert.strictEqual(a.chamadas.length, 0);
  assert.match(a.el("mac-col-erro").innerHTML, /lote/);
  assert.deepStrictEqual(a.modais.fechados, []);
});

test("recusa do servidor mostra o motivo e devolve o botão", async () => {
  const a = carregar({ rotas: { "PUT /admin/macros/colador/recebimento": { status: 400, corpo: { error: "Escolha o XPT." } } } });
  a.m.coladores = [colador("recebimento")];
  a.ctx._macAbrirConfigurarColador("recebimento");
  a.ctx._macSalvarColador();
  await a.esperar(); await a.esperar();
  assert.match(a.el("mac-col-erro").innerHTML, /Escolha o XPT/);
  assert.strictEqual(a.el("mac-col-salvar").disabled, false);
  assert.strictEqual(a.el("mac-col-salvar").textContent, "Salvar");
});

// ── acompanhar ao vivo ──────────────────────────────────────────────────
test("acompanhar atualiza a lista e PARA quando nada mais está aguardando", async () => {
  let estado = "aguardando";
  const a = carregar({ rotas: { "GET /admin/macros/colador": () => ({ corpo: { coladores: [colador("recebimento", { comando: { estado } })] } }) } });
  a.m.coladores = [colador("recebimento", { comando: { estado: "aguardando" } })];
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanharColador();
  assert.strictEqual(a.timers.length, 1);

  estado = "iniciado";
  await a.timers.shift()(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.coladores[0].comando.estado, "iniciado");
  await a.timers.shift()();
  assert.strictEqual(a.timers.length, 0);
  assert.strictEqual(a.m.poll, null);
});

test("acompanhar para quando a pessoa sai da tela", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/colador": { corpo: { coladores: [] } } } });
  a.m.coladores = [colador("recebimento", { comando: { estado: "aguardando" } })];
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanharColador();
  a.el("tela-macros").classList.remove("active-view");
  await a.timers.shift()();
  assert.strictEqual(a.chamadas.length, 0);
});

test("nada aguardando: nem começa a perguntar", async () => {
  const a = carregar();
  a.m.coladores = DOIS();
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanharColador();
  await a.timers.shift()();
  assert.strictEqual(a.chamadas.length, 0);
});
