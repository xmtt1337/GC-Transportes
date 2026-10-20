// Testes de js/macros.js — a lista de macros com as instâncias (computador + polo) embaixo e o
// detalhe do escolhido ao lado.
//
// O que se protege, e por quê:
//   - cada um vê só o que pode (admin: só o Colador) e nada some da lista;
//   - cada relatório mostra uma linha por instância (computador + polo), com o estado certo:
//     rodando, pedido enviado, pausado, falhou, próxima rodada; o Pedidos segue as instâncias da AT;
//   - Iniciar/Pausar/Cancelar/Rodar/Reiniciar/Parar mandam o pedido certo, pro Chrome certo,
//     e voltam atrás (ou avisam) se o servidor recusar;
//   - o Rodar trava enquanto o pedido daquele Chrome anda (clique duplo = pedido em dobro);
//   - nova instância só oferece computador + polo que ainda não existem, e cria com o horário;
//   - o horário: intervalo mínimo, horários recolhidos quando não estão em uso, relógio na lista certa;
//   - texto que vem de fora nunca vira HTML;
//   - o que muda sozinho (atividade, andamento) nunca redesenha o formulário.
//
// Script carregado num contexto isolado, com DOM, fetch e timers de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "macros.js"), "utf8");

const ACESSOR = `
;globalThis.__m = {
  get lista() { return _macLista; }, set lista(v) { _macLista = v; },
  get instancias() { return _macInstancias; }, set instancias(v) { _macInstancias = v; },
  get coladores() { return _macColadores; }, set coladores(v) { _macColadores = v; },
  get vigia() { return _macVigia; }, set vigia(v) { _macVigia = v; },
  get atividade() { return _macAtividade; }, set atividade(v) { _macAtividade = v; },
  get selecionado() { return _macSelecionado; }, set selecionado(v) { _macSelecionado = v; },
  get agenda() { return _macAgenda; },
  get nova() { return _macNova; },
  get rodadas() { return _macRodadas; },
  get poll() { return _macPoll; },
};`;

function escapar(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function criarElemento(id) {
  const classes = new Set();
  const o = {
    id, innerHTML: "", style: {}, value: "", checked: false, disabled: false, textContent: "", min: "",
    setAttribute() {}, querySelector() { return null; },
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, f) => { (f === undefined ? !classes.has(c) : f) ? classes.add(c) : classes.delete(c); },
    },
  };
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = escapar(v); }, get() { return o.innerHTML; } });
  return o;
}

// Um elemento só "existe" se já foi criado ou se algum innerHTML o desenhou (id="...").
function carregar({ role = "dev", rotas = {}, guardado = null } = {}) {
  const els = {};
  const existe = (id) => {
    if (els[id]) return els[id];
    if (Object.values(els).some((e) => String(e.innerHTML).includes(`id="${id}"`))) return (els[id] = criarElemento(id));
    return null;
  };
  for (const id of ["mac-lista", "mac-empty", "tela-macros"]) els[id] = criarElemento(id);
  els["tela-macros"].classList.add("active-view");

  const chamadas = [];
  const alertas = [];
  const confirmacoes = [];
  const timers = [];
  const storage = guardado ? { "gc-macros-selecionado": guardado } : {};
  const fetchFalso = async (url, opcoes = {}) => {
    const metodo = opcoes.method || "GET";
    const caminho = url.replace("http://api.test", "");
    chamadas.push({ metodo, caminho, corpo: opcoes.body ? JSON.parse(opcoes.body) : undefined });
    const r = rotas[`${metodo} ${caminho}`];
    if (r === undefined) throw new TypeError("sem rota: " + metodo + " " + caminho);
    if (r instanceof Error) throw r;
    const { status = 200, corpo = {} } = typeof r === "function" ? r() : r;
    return { ok: status < 400, status, json: async () => corpo };
  };
  const ctx = vm.createContext({
    console, Date, Intl, Promise, JSON, Set, Map, Math, Number, String, Array, Object,
    document: { getElementById: existe, hidden: false, addEventListener() {}, removeEventListener() {} },
    API: "http://api.test", token: "tok",
    fetch: fetchFalso,
    gcAlert: (m) => alertas.push(m),
    gcConfirm: (msg, ok) => { confirmacoes.push(msg); ok(); },
    _abrirModal() {}, _fecharModal() {}, skMostrar() {}, skFim() {},
    localStorage: { getItem: (k) => storage[k] || null, setItem: (k, v) => { storage[k] = v; } },
    window: { addEventListener() {}, removeEventListener() {}, innerHeight: 800, innerWidth: 1400, _gcUser: { role } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros.js" });
  const esperar = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
  return { ctx, m: ctx.__m, el: existe, chamadas, alertas, confirmacoes, timers, storage, esperar };
}

const SPX = (qual, extra = {}) => ({
  chave: `spx_${qual}`, qual, nome: qual, agendavel: qual !== "pedidos", minutos_minimo: qual === "backlog" ? 30 : 20,
  ultima_carga: { quando: "2026-10-19 14:32:07.123", segundos_atras: 720 }, comandos: [], problema: null, ...extra,
});
const TRES = () => [SPX("alimentacao"), SPX("pedidos"), SPX("backlog")];
const AVISO = { chave: "avisos_entregador", nome: "Avisos", ativo: true, resumo: "19:05 Abaixo de 90% concluído" };
const INST = (qual, maquina, xpt, extra = {}) => ({
  id: `spx_inst:${qual}:${maquina.toLowerCase()}:${xpt}`, qual, maquina, xpt, ativo: true,
  agenda: { modo: "intervalo", minutos: 30, horarios: [] }, resumo: "A cada 30 min", ...extra,
});
const COLADOR = (qual, extra = {}) => ({
  qual, chave: `colador_${qual}`, nome: `Colador ${qual}`, configurado: true, resumo: "XPT_CFC · lote 20",
  config: { xpt: "XPT_CFC", todos_dias: true, dia: null, carencia: 60, lote: 20, intervalo: 0.5, continuo: true },
  comandos: [], computadores: [], ...extra,
});
const AT_CFC = INST("alimentacao", "NOTE", "XPT_CFC");
const AT_VIA = INST("alimentacao", "NOTE", "XPT_VIA");

function montar(a, { lista = [AVISO, ...TRES()], instancias = [AT_CFC, AT_VIA], coladores = [COLADOR("recebimento")], abrir, atividade } = {}) {
  // Cópias: as ações mexem nos objetos da tela, e os exemplos são compartilhados entre testes.
  const copia = (x) => JSON.parse(JSON.stringify(x));
  a.m.lista = copia(lista);
  a.m.instancias = copia(instancias);
  a.m.coladores = copia(coladores);
  a.m.vigia = { online: true, visto_ha_s: 5, maquinas: [{ nome: "NOTE", online: true, visto_ha_s: 5 }] };
  if (atividade) a.m.atividade = atividade;
  if (abrir) a.m.selecionado = abrir;
  a.ctx._macRedesenhar();
  const html = (id) => (a.el(id) ? a.el(id).innerHTML : "");
  return {
    nav: () => html("macl-nav"),
    det: () => ["macl-detalhe", "macd-cab", "macd-vivo", "macd-config"].map(html).join("\n"),
    vivo: () => html("macd-vivo"), config: () => html("macd-config"), cab: () => html("macd-cab"),
  };
}

const HIST = (macro) => ({ [`GET /admin/macros/spx/historico?limite=40&macro=${macro}`]: { corpo: { eventos: [] } } });
const idDe = (i) => `inst:${i.id}`;
const enc = (i) => encodeURIComponent(i.id);
const botaoAntes = (html, chamada) => html.split(chamada)[0].split("<button").pop();
const linhaDe = (bloco, onde) => bloco.split(onde)[1].split("</button>")[0];

// ── a lista ──────────────────────────────────────────────────────────────
test("a lista: cada relatorio com uma linha por instancia (computador + polo), na ordem", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { instancias: [AT_VIA, AT_CFC, INST("backlog", "NOTE", "XPT_CFC")] });
  const nav = t.nav();
  const ordem = ["Alimentar AT exportada", "NOTE · <b>XPT_CFC</b>", "NOTE · <b>XPT_VIA</b>", "Pedidos pesquisados",
    "Backlog", "Colador", "Avisos de rota incompleta", "Shopee XPT_VIA"];
  let pos = -1;
  for (const s of ordem) { const p = nav.indexOf(s, pos + 1); assert.ok(p > pos, s); pos = p; }
});

test("a lista: o Pedidos tem uma linha por instancia da AT (vai junto dela)", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a);
  const ped = t.nav().split("Pedidos pesquisados")[1].split("Backlog")[0];
  assert.strictEqual((ped.match(/class="macl-inst( sel)?"/g) || []).length, 2);
  assert.ok(ped.includes("_macSelecionar('ped:NOTE|XPT_CFC')"));
});

test("a lista: relatorio sem instancia diz como abrir; AT e Backlog tem o +, o Pedidos nao", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { instancias: [] });
  assert.match(t.nav(), /nenhuma instância — clique pra abrir/);
  assert.ok(t.nav().includes("_macSelecionar('novo:alimentacao')"));
  assert.ok(t.nav().includes("_macSelecionar('novo:backlog')"));
  assert.ok(!t.nav().includes("novo:pedidos"));
});

test("a lista: admin so ve o Colador", () => {
  const a = carregar({ role: "admin", rotas: HIST("recebimento") });
  const t = montar(a);
  assert.ok(t.nav().includes("Colador recebimento"));
  assert.ok(!t.nav().includes("Relatórios do SPX"));
  assert.ok(!t.nav().includes("Avisos de rota"));
});

test("a lista: o estado de cada linha — rodando, pedido enviado, pausado, falhou, proxima", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const prox = Date.UTC(2026, 9, 19, 21, 10, 0); // 18:10 em Brasilia
  const t = montar(a, {
    lista: [AVISO, SPX("alimentacao", { comandos: [{ id: "1", estado: "aguardando", alvo: "PC2", config: { xpt: "XPT_CFC" } }] }), SPX("pedidos"), SPX("backlog")],
    instancias: [AT_CFC, AT_VIA, INST("alimentacao", "PC2", "XPT_CFC"), INST("backlog", "NOTE", "XPT_CFC", { ativo: false }),
      INST("backlog", "NOTE", "XPT_VIA")],
    atividade: {
      abas: [{ macro: "alimentacao", estado: "rodando", maquina: "NOTE", xpt: "XPT_VIA", aba: "1" }],
      ativos: [
        { macro: "alimentacao", maquina: "NOTE", xpt: "XPT_CFC", proxima_em: prox, proxima_em_s: 600, ultimo: { estado: "ok" } },
        { macro: "backlog", maquina: "NOTE", xpt: "XPT_VIA", proxima_em: prox, proxima_em_s: 600, ultimo: { estado: "erro" } },
      ],
      maquinas: [{ nome: "NOTE", online: true, xpt: "XPT_CFC" }, { nome: "NOTE", online: true, xpt: "XPT_VIA" }],
    },
  });
  const at = t.nav().split("Alimentar AT exportada")[1].split("Pedidos pesquisados")[0];
  assert.match(linhaDe(at, "NOTE · <b>XPT_CFC</b>"), /próx\. 18:10/);
  assert.match(linhaDe(at, "NOTE · <b>XPT_VIA</b>"), /rodando agora/);
  assert.match(linhaDe(at, "PC2 · <b>XPT_CFC</b>"), /pedido enviado/);
  const bk = t.nav().split("Backlog")[1];
  assert.match(linhaDe(bk, "NOTE · <b>XPT_CFC</b>"), /pausado/);
  assert.match(linhaDe(bk, "NOTE · <b>XPT_VIA</b>"), /falhou · próx\. 18:10/);
});

test("a lista: nome de computador vindo de fora nao vira HTML", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { instancias: [INST("alimentacao", "<img src=x>", "XPT_CFC")] });
  assert.ok(!t.nav().includes("<img"));
  assert.ok(t.nav().includes("&lt;img src=x&gt;"));
});

// ── abrir ────────────────────────────────────────────────────────────────
test("abrir: sem escolha lembrada abre a primeira instancia; a escolha fica lembrada", () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"), ...HIST("backlog") } });
  montar(a);
  assert.strictEqual(a.m.selecionado, idDe(AT_CFC));
  a.ctx._macSelecionar("novo:backlog");
  assert.strictEqual(a.storage["gc-macros-selecionado"], "novo:backlog");
});

test("abrir: a instancia mostra computador + polo, situacao, Chrome, ultima rodada e os botoes", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { abrir: idDe(AT_CFC), atividade: { abas: [], ativos: [
    { macro: "alimentacao", maquina: "NOTE", xpt: "XPT_CFC", ultimo: { estado: "erro", passo: "<b>x</b> deu ruim", terminou_ha_s: 600 } }],
    maquinas: [{ nome: "NOTE", online: true, xpt: "XPT_CFC" }] } });
  const d = t.det();
  assert.match(t.cab(), /NOTE · XPT_CFC · Caçador/);
  for (const s of ["Situação", "Próxima rodada", "Chrome", "conectado", "Última rodada", "Falhou", "Pausar", "Rodar agora", "Cancelar instância", "Salvar horário"]) {
    assert.ok(d.includes(s), s);
  }
  assert.ok(!d.includes("<b>x</b>"), "passo vindo da extensao escapado");
});

test("abrir: Chrome daquele polo fechado aparece assim", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { abrir: idDe(AT_VIA), atividade: { abas: [], ativos: [], maquinas: [{ nome: "NOTE", online: true, xpt: "XPT_CFC" }] } });
  assert.match(t.vivo(), /fechado ou sem a extensão/);
});

// ── acoes ────────────────────────────────────────────────────────────────
test("pausar manda so o ativo pra instancia certa, e lista e botoes acompanham", async () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"),
    [`PUT /admin/macros/spx/instancias/${enc(AT_CFC)}`]: () => ({ corpo: { ok: true, instancia: { ...AT_CFC, ativo: false, resumo: "Desligado" } } }) } });
  const t = montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macInstAtivo(AT_CFC.id, false, null);
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.metodo === "PUT").corpo, { ativo: false });
  assert.match(linhaDe(t.nav(), "NOTE · <b>XPT_CFC</b>"), /pausado/);
  assert.match(t.vivo(), /Iniciar/);
});

test("pausar recusado pelo servidor avisa e nao muda nada", async () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"),
    [`PUT /admin/macros/spx/instancias/${enc(AT_CFC)}`]: { status: 500, corpo: { error: "banco fora" } } } });
  montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macInstAtivo(AT_CFC.id, false, null);
  await a.esperar();
  assert.deepStrictEqual([...a.alertas], ["banco fora"]);
  assert.strictEqual(a.m.instancias.find((i) => i.id === AT_CFC.id).ativo, true);
});

test("cancelar pede confirmacao, apaga e volta pra abrir uma nova", async () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"), [`DELETE /admin/macros/spx/instancias/${enc(AT_CFC)}`]: { corpo: { ok: true } } } });
  montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macCancelarInstancia(AT_CFC.id, null);
  await a.esperar();
  assert.strictEqual(a.confirmacoes.length, 1);
  assert.match(a.confirmacoes[0], /NOTE · XPT_CFC/);
  assert.deepStrictEqual(a.m.instancias.map((i) => i.id), [AT_VIA.id]);
  assert.strictEqual(a.m.selecionado, "novo:alimentacao");
});

test("rodar agora vai pro Chrome certo (computador + polo) e o botao trava enquanto o pedido anda", async () => {
  const cmd = { id: "c1", estado: "aguardando", alvo: "NOTE", config: { xpt: "XPT_CFC" }, criado_em: new Date().toISOString(), criado_por: "Dev" };
  const a = carregar({ rotas: { ...HIST("alimentacao"), "POST /admin/macros/spx/alimentacao/rodar": { corpo: { ok: true, comando: cmd, vigia: { online: true, maquinas: [] } } } } });
  const t = montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macRodarChrome("alimentacao", "NOTE", "XPT_CFC", false, null);
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.metodo === "POST").corpo, { maquina: "NOTE", xpt: "XPT_CFC", reiniciar: false });
  assert.ok(botaoAntes(t.vivo(), "_macRodarChrome(").includes("disabled"));
  assert.ok(a.m.poll, "passou a acompanhar");
  a.ctx._macSelecionar(idDe(AT_VIA));
  assert.ok(!botaoAntes(t.vivo(), "_macRodarChrome(").includes("disabled"), "o outro polo nao trava");
});

test("rodando agora: o botao vira Reiniciar (com reiniciar: true) e aparece o Parar", async () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"),
    "POST /admin/macros/spx/alimentacao/rodar": { corpo: { ok: true, comando: { id: "c", estado: "aguardando", alvo: "NOTE", config: { xpt: "XPT_VIA" } } } },
    "POST /admin/macros/spx/alimentacao/parar": { corpo: { ok: true } } } });
  const t = montar(a, { abrir: idDe(AT_VIA), atividade: { abas: [{ macro: "alimentacao", estado: "rodando", maquina: "NOTE", xpt: "XPT_VIA", aba: "4", linhas: [] }], ativos: [] } });
  assert.match(t.vivo(), /Reiniciar/);
  assert.match(t.vivo(), /Parar/);
  a.ctx._macPararChrome("alimentacao", "NOTE", "XPT_VIA", null);
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.caminho.endsWith("/parar")).corpo, { maquina: "NOTE", xpt: "XPT_VIA" });
  a.ctx._macRodarChrome("alimentacao", "NOTE", "XPT_VIA", true, null);
  await a.esperar();
  assert.strictEqual(a.chamadas.find((c) => c.caminho.endsWith("/rodar")).corpo.reiniciar, true);
});

test("rodar recusado (409, ja pedido) avisa e mostra o pedido que ja existe", async () => {
  const cmd = { id: "c1", estado: "entregue", alvo: "NOTE", config: { xpt: "XPT_CFC" } };
  const a = carregar({ rotas: { ...HIST("alimentacao"), "POST /admin/macros/spx/alimentacao/rodar": { status: 409, corpo: { error: "já foi pedido", comando: cmd } } } });
  const t = montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macRodarChrome("alimentacao", "NOTE", "XPT_CFC", false, null);
  await a.esperar();
  assert.deepStrictEqual([...a.alertas], ["já foi pedido"]);
  assert.ok(botaoAntes(t.vivo(), "_macRodarChrome(").includes("disabled"));
});

test("Pedidos: segue a AT do mesmo Chrome — sem Pausar/Cancelar proprios, com Rodar", () => {
  const a = carregar({ rotas: HIST("pedidos") });
  const t = montar(a, { abrir: "ped:NOTE|XPT_CFC" });
  assert.match(t.vivo(), /Liga e pausa junto da AT/);
  assert.ok(t.vivo().includes("_macRodarChrome('pedidos','NOTE','XPT_CFC', false"));
  assert.ok(!t.vivo().includes("Cancelar instância"));
  assert.strictEqual(t.config(), "", "sem horario proprio");
});

// ── nova instancia ───────────────────────────────────────────────────────
test("nova instancia: computador + polo ja usados aparecem desabilitados", () => {
  const a = carregar();
  const t = montar(a, { abrir: "novo:alimentacao" });
  a.ctx._macNovaCampo("maquina", "NOTE");
  assert.match(t.vivo(), /<option value="XPT_CFC" disabled>XPT_CFC · Caçador — já existe/);
  a.ctx._macNovaCampo("maquina", "OUTRO");
  assert.ok(!t.vivo().includes("já existe"));
});

test("nova instancia: criar manda computador, polo, ligada e horario; depois abre a criada", async () => {
  const nova = INST("backlog", "NOTE", "XPT_VIA", { agenda: { modo: "intervalo", minutos: 45, horarios: [] } });
  const a = carregar({ rotas: { ...HIST("backlog"), "POST /admin/macros/spx/instancias": { corpo: { ok: true, instancia: nova } } } });
  montar(a, { abrir: "novo:backlog" });
  a.ctx._macNovaCampo("maquina", "NOTE");
  a.ctx._macNovaCampo("xpt", "XPT_VIA");
  a.ctx._macMudarMinutos("45");
  a.ctx._macSalvarAgenda();
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.metodo === "POST").corpo,
    { qual: "backlog", maquina: "NOTE", xpt: "XPT_VIA", ativo: true, agenda: { modo: "intervalo", horarios: [], minutos: 45 } });
  assert.strictEqual(a.m.selecionado, idDe(nova));
  assert.ok(a.m.instancias.some((i) => i.id === nova.id));
});

test("nova instancia: sem computador ou polo nem sai do navegador", () => {
  const a = carregar();
  montar(a, { abrir: "novo:alimentacao" });
  a.ctx._macSalvarAgenda();
  assert.match(a.el("mac-ag-erro").innerHTML, /Escolha o computador e o polo/);
  assert.ok(!a.chamadas.some((c) => c.metodo === "POST"));
});

// ── horario ──────────────────────────────────────────────────────────────
test("horario: a instancia abre com a agenda dela; intervalo abaixo do minimo nem sai do navegador", () => {
  const a = carregar({ rotas: HIST("backlog") });
  const bk = INST("backlog", "NOTE", "XPT_CFC", { agenda: { modo: "intervalo", minutos: 60, horarios: [] } });
  montar(a, { instancias: [bk], abrir: idDe(bk) });
  assert.strictEqual(a.m.agenda.instId, bk.id);
  assert.strictEqual(a.m.agenda.minimo, 30);
  a.ctx._macMudarMinutos("10");
  a.ctx._macSalvarAgenda();
  assert.match(a.el("mac-ag-erro").innerHTML, /de 30 a 1440/);
  assert.ok(!a.chamadas.some((c) => c.metodo === "PUT"));
});

test("horario: salvar manda so a agenda pra instancia e mostra Salvo", async () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"),
    [`PUT /admin/macros/spx/instancias/${enc(AT_CFC)}`]: { corpo: { ok: true, instancia: { ...AT_CFC, agenda: { modo: "intervalo", minutos: 40, horarios: [] }, resumo: "A cada 40 min" } } } } });
  montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macMudarMinutos("40");
  a.ctx._macSalvarAgenda();
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.metodo === "PUT").corpo, { agenda: { modo: "intervalo", horarios: [], minutos: 40 } });
  assert.match(a.el("mac-ag-erro").innerHTML, /Salvo/);
  assert.strictEqual(a.m.instancias.find((i) => i.id === AT_CFC.id).resumo, "A cada 40 min");
});

test("horario: 'Todo dia, nestes horarios' fica recolhido quando vale o intervalo, e abre ao escolher", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const at = INST("alimentacao", "NOTE", "XPT_CFC", { agenda: { modo: "intervalo", minutos: 30, horarios: [{ hora: 18, minuto: 45 }, { hora: 21, minuto: 15 }] } });
  montar(a, { instancias: [at], abrir: idDe(at) });
  assert.strictEqual(a.el("mac-ag-horarios-corpo").style.display, "none");
  assert.match(a.el("mac-ag-recolhido").innerHTML, /2 horários guardados · mostrar/);
  a.ctx._macMudarModo("horarios");
  assert.strictEqual(a.el("mac-ag-horarios-corpo").style.display, "");
  assert.strictEqual(a.el("mac-ag-recolhido").innerHTML, "");
});

test("horario: adicionar sugere uma hora depois da ultima e passa pra horarios; remover tira o certo", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macAdicionarHorario();
  a.ctx._macAdicionarHorario();
  assert.strictEqual(a.m.agenda.modo, "horarios");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.m.agenda.horarios)), [{ hora: 8, minuto: 0 }, { hora: 9, minuto: 0 }]);
  a.ctx._macRemoverHorario(0);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.m.agenda.horarios)), [{ hora: 9, minuto: 0 }]);
});

test("horario: o relogio edita os horarios da instancia (nao as rodadas do aviso)", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  montar(a, { abrir: idDe(AT_CFC) });
  a.ctx._macAdicionarHorario();
  a.ctx._macEscolherHm(0, "hora", 14);
  assert.strictEqual(a.m.agenda.horarios[0].hora, 14);
  assert.strictEqual(a.m.rodadas.length, 0);
});

// ── o que muda sozinho nao mexe no formulario ────────────────────────────
test("redesenhar (atividade, andamento) atualiza lista e vivo, mas NUNCA o formulario", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { abrir: idDe(AT_CFC) });
  const form = a.el("macd-config");
  form.innerHTML = "FORMULARIO-COM-O-QUE-A-PESSOA-DIGITOU";
  a.m.atividade = { abas: [{ macro: "alimentacao", estado: "rodando", maquina: "NOTE", xpt: "XPT_CFC", aba: "9", linhas: [] }], ativos: [] };
  a.ctx._macRedesenhar();
  assert.strictEqual(form.innerHTML, "FORMULARIO-COM-O-QUE-A-PESSOA-DIGITOU");
  assert.match(t.vivo(), /Rodando agora/);
});

test("atividade igual a anterior nao redesenha nada", async () => {
  const ativ = { abas: [], maquinas: [], alertas: [] };
  const a = carregar({ rotas: { ...HIST("alimentacao"), "GET /admin/macros/atividade": { corpo: ativ } } });
  const t = montar(a);
  a.m.atividade = JSON.parse(JSON.stringify(ativ));
  a.el("macl-nav").innerHTML = "INTACTO";
  await a.ctx._macCarregarAtividade();
  assert.strictEqual(t.nav(), "INTACTO");
});

// ── Colador: sessoes por Chrome ──────────────────────────────────────────
test("Colador: uma linha por sessao (computador + polo), da atividade e dos pedidos", () => {
  const a = carregar({ rotas: HIST("recebimento") });
  const t = montar(a, {
    coladores: [COLADOR("recebimento", { comandos: [{ id: "x", estado: "aguardando", alvo: "PC2", config: { xpt: "XPT_VIA" } }] })],
    atividade: { abas: [{ macro: "recebimento", estado: "rodando", maquina: "NOTE", xpt: "XPT_CFC", aba: "1" }], ativos: [] },
  });
  const col = t.nav().split("Colador recebimento")[1];
  assert.match(linhaDe(col, "NOTE · <b>XPT_CFC</b>"), /rodando agora/);
  assert.match(linhaDe(col, "PC2 · <b>XPT_VIA</b>"), /pedido enviado/);
});

test("Colador: abrir sessao manda computador e polo; Parar vai pro Chrome certo", async () => {
  const cmd = { id: "c", estado: "aguardando", alvo: "NOTE", config: { xpt: "XPT_VIA" } };
  const a = carregar({ rotas: { ...HIST("recebimento"),
    "POST /admin/macros/colador/recebimento/rodar": { corpo: { ok: true, algum_conectado: true, comando: cmd } },
    "POST /admin/macros/colador/recebimento/parar": { corpo: { ok: true } } } });
  montar(a, { abrir: "colcfg:recebimento" });
  a.ctx._macNovaCampo("maquina", "NOTE");
  a.ctx._macNovaCampo("xpt", "XPT_VIA");
  a.ctx._macAbrirSessao("recebimento", null);
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.caminho.endsWith("/rodar")).corpo, { maquina: "NOTE", xpt: "XPT_VIA", reiniciar: false });
  assert.strictEqual(a.m.selecionado, "col:recebimento|NOTE|XPT_VIA");
  a.ctx._macSessaoParar("recebimento", "NOTE", "XPT_VIA", null);
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.caminho.endsWith("/parar")).corpo, { maquina: "NOTE", xpt: "XPT_VIA" });
});

test("Colador: erro do pedido (texto de outro computador) nunca vira HTML", () => {
  const a = carregar({ rotas: HIST("recebimento") });
  const t = montar(a, { coladores: [COLADOR("recebimento", { comandos: [{ id: "x", estado: "erro", erro: "<script>x</script>", alvo: "NOTE", config: { xpt: "XPT_CFC" } }] })],
    abrir: "col:recebimento|NOTE|XPT_CFC" });
  assert.ok(t.vivo().length > 0);
  assert.ok(!t.vivo().includes("<script>"));
});

// ── aviso ────────────────────────────────────────────────────────────────
test("Aviso: roda no servidor, polo fixo, rodadas no formulario e interruptor no topo", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/avisos-entregador": { corpo: {
    ativo: true, tipos: [{ id: "p", rotulo: "Percentual", parametroRotulo: "%", parametroPadrao: 90 }],
    rodadas: [{ hora: 19, minuto: 5, tipo: "p", parametro: 90 }] } } } });
  const t = montar(a, { abrir: "av:avisos_entregador" });
  await a.esperar();
  assert.match(t.vivo(), /No servidor/);
  assert.match(t.vivo(), /XPT_CFC<\/b> · Caçador/);
  assert.match(a.el("mac-rodadas-lista").innerHTML, /19:05/);
  assert.ok(t.cab().includes("_macAlternarAtivo('avisos_entregador'"));
});

test("Aviso: o interruptor desliga na hora e volta se o servidor recusar", async () => {
  let status = 200;
  const a = carregar({ rotas: {
    "GET /admin/macros/avisos-entregador": { corpo: { tipos: [], rodadas: [] } },
    "PUT /admin/macros/avisos-entregador/ativo": () => ({ status, corpo: status === 200 ? { ok: true } : { error: "não" } }) } });
  const t = montar(a, { abrir: "av:avisos_entregador" });
  a.ctx._macAlternarAtivo("avisos_entregador", null);
  assert.strictEqual(a.m.lista[0].ativo, false);
  assert.match(t.nav(), /Desligado/);
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.metodo === "PUT").corpo, { ativo: false });
  status = 400;
  a.ctx._macAlternarAtivo("avisos_entregador", null);
  await a.esperar();
  assert.strictEqual(a.m.lista[0].ativo, false, "voltou");
  assert.deepStrictEqual([...a.alertas], ["não"]);
});

test("Ainda nao integrado: explica e nao tem acao nenhuma", () => {
  const a = carregar();
  const t = montar(a, { abrir: "av:pendente_via" });
  assert.match(t.det(), /Ainda não integrado/);
  assert.ok(!t.det().includes("_macRodar"));
  assert.ok(!t.det().includes("Salvar"));
});

// 20/10/2026: fechar a sessão pelo X da lista, sem abrir a tela dela.
test("Colador: X na linha rodando para a sessao daquele Chrome; linha parada nao tem X", async () => {
  const a = carregar({ rotas: { ...HIST("recebimento"), "POST /admin/macros/colador/recebimento/parar": { corpo: { ok: true } } } });
  const t = montar(a, {
    coladores: [COLADOR("recebimento", { comandos: [{ id: "x", estado: "concluido", alvo: "PC2", config: { xpt: "XPT_VIA" } }] })],
    atividade: { abas: [{ macro: "recebimento", estado: "rodando", maquina: "NOTE", xpt: "XPT_CFC", aba: "1" }], ativos: [] },
  });
  const col = t.nav().split("Colador recebimento")[1];
  const noteCfc = col.split("NOTE · <b>XPT_CFC</b>")[1].split("macl-inst-linha")[0];
  assert.match(noteCfc, /class="macl-fechar"[^>]*onclick="_macSessaoParar\('recebimento','NOTE','XPT_CFC', this\)"/);
  const pc2 = col.split("PC2 · <b>XPT_VIA</b>")[1].split("macl-inst-linha")[0];
  assert.doesNotMatch(pc2, /macl-fechar/);
  a.ctx._macSessaoParar("recebimento", "NOTE", "XPT_CFC", null);
  await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.caminho.endsWith("/parar")).corpo, { maquina: "NOTE", xpt: "XPT_CFC" });
});

test("Colador: X na linha de pedido ainda nao comecado cancela o pedido", () => {
  const a = carregar({ rotas: HIST("recebimento") });
  const t = montar(a, {
    coladores: [COLADOR("recebimento", { comandos: [{ id: "c9", estado: "aguardando", alvo: "PC2", config: { xpt: "XPT_VIA" } }] })],
  });
  const pc2 = t.nav().split("PC2 · <b>XPT_VIA</b>")[1].split("macl-inst-linha")[0];
  assert.match(pc2, /onclick="_macCancelarColador\('recebimento', 'c9', this\)"/);
});

test("relatorio: X na linha da instancia cancela a instancia (com confirmacao)", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a);
  assert.ok(t.nav().includes(`onclick="_macCancelarInstancia('${AT_CFC.id}', this)"`));
});

// 20/10/2026: Iniciar liga a sessão no servidor; ela fica rodando até alguém parar.
test("Colador: sessao ligada aparece na lista mesmo sem estar rodando, com X e Parar", async () => {
  const a = carregar({ rotas: { ...HIST("criar_at"),
    "POST /admin/macros/colador/criar_at/parar": { corpo: { ok: true } } } });
  const t = montar(a, {
    coladores: [COLADOR("criar_at", { sessoes: [{ qual: "criar_at", maquina: "NOTE", xpt: "XPT_CFC" }] })],
    abrir: "col:criar_at|NOTE|XPT_CFC",
  });
  const linha = t.nav().split("Colador criar_at")[1].split("NOTE · <b>XPT_CFC</b>")[1].split("macl-inst-linha")[0];
  assert.match(linha, /ligada · Chrome desse polo fechado/, "sem atividade do Chrome: avisa que esta fechado");
  assert.match(linha, /macl-fechar/);
  assert.match(t.vivo(), /<b>Ligada<\/b>/);
  assert.match(t.vivo(), />Parar</);
  assert.doesNotMatch(t.vivo(), />Iniciar</);
  a.ctx._macSessaoParar("criar_at", "NOTE", "XPT_CFC", null);
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.m.coladores[0].sessoes, [], "some da lista ao parar");
});

test("Colador: Iniciar que volta com sessao (servidor novo) marca ligada, sem comando", async () => {
  const sessao = { qual: "criar_at", maquina: "NOTE", xpt: "XPT_VIA" };
  const a = carregar({ rotas: { ...HIST("criar_at"),
    "POST /admin/macros/colador/criar_at/rodar": { corpo: { ok: true, sessao, algum_conectado: true } } } });
  montar(a, { coladores: [COLADOR("criar_at")], abrir: "colcfg:criar_at" });
  a.ctx._macSessaoRodar("criar_at", "NOTE", "XPT_VIA", false, null);
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.m.coladores[0].sessoes)), [sessao]);
  assert.deepStrictEqual(a.alertas, []);
});
