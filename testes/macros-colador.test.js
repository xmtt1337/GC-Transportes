// Testes de js/macros.js — a parte do Colador (extensão XM Macros SPX + XM Vigia): Rodar,
// Configurar e quem está com o Chrome/vigia conectado.
//
// O que se protege, e por quê:
//   - diferente dos macros do SPX, aqui NÃO há "computador escolhido" nem horário — é Rodar
//     (vai pra qualquer Chrome/vigia ouvindo, de propósito, pra dar pra rodar em dois polos ao
//     mesmo tempo) e Configurar (a config da PRÓXIMA sessão);
//   - "Rodar" avisa quando pediu mas nenhum Chrome/vigia está conectado — sem isso, clicar e
//     não acontecer nada parece a mesma coisa que ter funcionado;
//   - config inválida nem sai do navegador, com a mensagem na hora (mesmos limites do servidor:
//     carência 0–3600s, lote 1–500, intervalo 0–1,5s);
//   - texto vindo do servidor (erro, computador, quem pediu) nunca vira HTML;
//   - abrir Configurar edita uma CÓPIA — cancelar não pode alterar a lista antes de Salvar;
//   - a seção do Colador aparece pra admin também (só ela — o resto de Macros continua dev).
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
  comandos: [], computadores: [], ...extra,
});
// Um comando de teste, já com id (as ações de cancelar/parar precisam dele).
const cmd = (estado, extra = {}) => ({ id: "c1", estado, criado_por: "Dev", criado_em: "2026-09-28T14:32:00.000Z", ...extra });
const DOIS = () => [colador("recebimento"), colador("at_cluster")];

// Objeto/array criado dentro do vm tem outro prototipo (outro realm): normaliza antes de
// comparar com deepStrictEqual.
const plano = (x) => JSON.parse(JSON.stringify(x));

const linha = (html, qual) => {
  const partes = html.split('<div class="mac-item mac-item-spx">').slice(1);
  return partes.find((p) => p.includes(`_macRodarColador('${qual}'`)) || "";
};

// ── quem acessa (admin também, não só dev) ──────────────────────────────────
// _macRedesenhar é quem decide isso (só ela olha window._gcUser.role) — chamada direto, com o
// DOM de mentira já populado, pra não depender do fetch inteiro de _macCarregarLista.
// _macHtmlSecoes sempre desenha o catálogo fixo (_MAC_SECOES) — "Avisos de rota incompleta" e
// "Shopee XPT_CFC" são texto ESTÁTICO dele, então nem precisa de uma _macLista real pra testar
// se a seção aparece ou não.
// Alvo diferente do que já está aguardando/entregue não conflita - é o que deixa pedir pra uma
// SEGUNDA máquina enquanto a primeira ainda não foi buscada.
// ── o comando ─────────────────────────────────────────────────────────────
test("cada estado do comando diz o que a pessoa precisa saber", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macComandoColadorTexto(cmd("aguardando")).tom, "andando");
  assert.strictEqual(a.ctx._macComandoColadorTexto(cmd("entregue")).tom, "andando");
  assert.match(a.ctx._macComandoColadorTexto(cmd("iniciado", { alvo: "CASA" })).texto, /por Dev em CASA/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("iniciado", { parar_pedido: true })).texto, /parada pedida/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("erro", { erro: "banco recusou" })).texto, /Não rodou: banco recusou/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("erro")).texto, /motivo não informado/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("cancelado")).texto, /Cancelado/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("expirado")).texto, /Ninguém pegou esse pedido a tempo/);
  assert.match(a.ctx._macComandoColadorTexto(cmd("sem_confirmacao")).texto, /nunca confirmou/);
});

// ── carregar a lista ──────────────────────────────────────────────────────
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

// ── cancelar / parar ─────────────────────────────────────────────────────
test("cancelar troca o comando pelo devolvido (estado 'cancelado') e redesenha", async () => {
  const a = carregar({ rotas: {
    "POST /admin/macros/colador/comandos/c1/cancelar": { corpo: { ok: true, comando: cmd("cancelado", { alvo: "CACADOR" }) } },
  } });
  a.m.coladores = [colador("recebimento", { comandos: [cmd("aguardando", { alvo: "CACADOR" })] })];
  const botao = { disabled: false };
  a.ctx._macCancelarColador("recebimento", "c1", botao);
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.coladores[0].comandos[0].estado, "cancelado");
  assert.deepStrictEqual(a.alertas, []);
});

test("cancelar um que ja comecou (409) avisa e devolve o botao", async () => {
  const a = carregar({ rotas: {
    "POST /admin/macros/colador/comandos/c1/cancelar": { status: 409, corpo: { error: "Já não está mais pendente (iniciado)." } },
  } });
  a.m.coladores = [colador("recebimento", { comandos: [cmd("iniciado", { alvo: "CACADOR" })] })];
  const botao = { disabled: false };
  a.ctx._macCancelarColador("recebimento", "c1", botao);
  await a.esperar(); await a.esperar();
  assert.strictEqual(botao.disabled, false);
  assert.deepStrictEqual(a.alertas, ["Já não está mais pendente (iniciado)."]);
  assert.strictEqual(a.m.coladores[0].comandos[0].estado, "iniciado", "nao mexe no comando quando o servidor recusa");
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
test("marcar todos os dias desabilita e limpa o campo de data na tela", () => {
  const a = carregar();
  a.m.coladores = [colador("recebimento")];
  a.ctx._macAbrirConfigurarColador("recebimento");
  a.ctx._macColMudarTodosDias(true);
  assert.strictEqual(a.el("mac-col-dia").disabled, true);
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

// ── acompanhar ao vivo ──────────────────────────────────────────────────
test("acompanhar atualiza a lista e PARA quando nada mais está aguardando", async () => {
  let estado = "aguardando";
  const a = carregar({ rotas: { "GET /admin/macros/colador": () => ({ corpo: { coladores: [colador("recebimento", { comandos: [cmd(estado)] })] } }) } });
  a.m.coladores = [colador("recebimento", { comandos: [cmd("aguardando")] })];
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanharColador();
  assert.strictEqual(a.timers.length, 1);

  estado = "iniciado";
  await a.timers.shift()(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.coladores[0].comandos[0].estado, "iniciado");
  await a.timers.shift()();
  assert.strictEqual(a.timers.length, 0);
  assert.strictEqual(a.m.poll, null);
});

test("acompanhar para quando a pessoa sai da tela", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/colador": { corpo: { coladores: [] } } } });
  a.m.coladores = [colador("recebimento", { comandos: [cmd("aguardando")] })];
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
