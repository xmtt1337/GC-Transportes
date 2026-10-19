// Testes de js/macros.js — o layout de lista (à esquerda) + detalhe do escolhido (à direita).
//
// O que se protege, e por quê:
//   - cada um vê só o que pode (admin: só o Colador) e nada some da lista (o que o servidor não
//     mandou fica "Indisponível"; o que ainda não existe fica "Ainda não integrado");
//   - o detalhe traz tudo do macro num lugar: onde executa, polo, situação, Rodar e o formulário;
//   - o Rodar trava enquanto o pedido está em andamento (clique duplo = pedido em dobro);
//   - texto que vem de fora (servidor, outros computadores) nunca vira HTML;
//   - atualizar o que muda sozinho (andamento, atividade) NUNCA redesenha o formulário —
//     apagaria o que a pessoa está digitando;
//   - salvar não depende mais de modal: mostra "Salvo." e recarrega por baixo.
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
  get coladores() { return _macColadores; }, set coladores(v) { _macColadores = v; },
  get vigia() { return _macVigia; }, set vigia(v) { _macVigia = v; },
  get computador() { return _macComputador; }, set computador(v) { _macComputador = v; },
  get atividade() { return _macAtividade; }, set atividade(v) { _macAtividade = v; },
  get selecionado() { return _macSelecionado; }, set selecionado(v) { _macSelecionado = v; },
  get agenda() { return _macAgenda; },
  get colEditando() { return _macColadorEditando; },
  get rodadas() { return _macRodadas; },
  set alvo(v) { _macColadorAlvo = v; },
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

// Um elemento só "existe" se já foi criado ou se algum innerHTML o desenhou (id="..."): é isso
// que deixa o código distinguir "primeira montagem" de "só atualizar os pedaços".
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
  const timers = [];
  const storage = guardado ? { "gc-macros-selecionado": guardado } : {};
  const fetchFalso = async (url, opcoes = {}) => {
    const metodo = opcoes.method || "GET";
    const caminho = url.replace("http://api.test", "");
    chamadas.push({ metodo, caminho, corpo: opcoes.body ? JSON.parse(opcoes.body) : undefined });
    const r = rotas[`${metodo} ${caminho}`];
    if (r === undefined) throw new TypeError("sem rota: " + metodo + " " + caminho);
    const { status = 200, corpo = {} } = typeof r === "function" ? r() : r;
    return { ok: status < 400, status, json: async () => corpo };
  };
  const ctx = vm.createContext({
    console, Date, Intl, Promise, JSON, Set, Math, Number, String, Array, Object,
    document: { getElementById: existe, hidden: false },
    API: "http://api.test", token: "tok",
    fetch: fetchFalso,
    gcAlert: (m) => alertas.push(m),
    _abrirModal() {}, _fecharModal() {}, skMostrar() {}, skFim() {},
    localStorage: { getItem: (k) => storage[k] || null, setItem: (k, v) => { storage[k] = v; } },
    window: { addEventListener() {}, removeEventListener() {}, innerHeight: 800, innerWidth: 1400, _gcUser: { role } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros.js" });
  const esperar = () => new Promise((r) => setImmediate(r));
  return { ctx, m: ctx.__m, els, el: existe, chamadas, alertas, timers, storage, esperar };
}

const spx = (qual, extra = {}) => ({
  chave: `spx_${qual}`, qual, nome: qual, agendavel: qual !== "pedidos", minutos_minimo: 20,
  configurado: true, ativo: true,
  agenda: qual === "pedidos" ? null : { modo: "intervalo", minutos: 60, horarios: [] },
  resumo: qual === "pedidos" ? "Roda sozinho depois de cada AT" : "A cada 1 h",
  ultima_carga: { quando: "2026-10-19 14:32:07.123", segundos_atras: 720 }, comando: null, problema: null,
  ...extra,
});
const TRES = () => [spx("alimentacao"), spx("pedidos"), spx("backlog")];
const AVISO = { chave: "avisos_entregador", nome: "Avisos", ativo: true, resumo: "19:05 Abaixo de 90% concluído" };
const colador = (qual, extra = {}) => ({
  qual, chave: `colador_${qual}`, nome: `Colador ${qual}`, configurado: true, resumo: "XPT_CFC · lote 20",
  config: { xpt: "XPT_CFC", todos_dias: true, dia: null, carencia: 60, lote: 20, intervalo: 0.5, continuo: true },
  comandos: [], computadores: [{ nome: "LEANDROXM", online: true }], ...extra,
});

// Monta a tela com os dados e abre o item pedido.
function montar(a, { lista = [AVISO, ...TRES()], coladores = [colador("recebimento"), colador("at_cluster")], abrir } = {}) {
  a.m.lista = lista;
  a.m.coladores = coladores;
  a.m.vigia = { online: true, visto_ha_s: 5, maquinas: [{ nome: "LEANDROXM", online: true, visto_ha_s: 5 }] };
  if (abrir) a.m.selecionado = abrir;
  a.ctx._macRedesenhar();
  const html = (id) => (a.el(id) ? a.el(id).innerHTML : "");
  return { nav: () => html("macl-nav"),
           det: () => [html("macl-detalhe"), html("macd-cab-controle"), html("macd-vivo"), html("macd-config")].join("\n"),
           vivo: () => html("macd-vivo"), config: () => html("macd-config") };
}

const HIST = (macro) => ({ [`GET /admin/macros/spx/historico?limite=12&macro=${macro}`]: { corpo: { eventos: [] } } });

// ── a lista ──────────────────────────────────────────────────────────────
test("dev ve os tres grupos, na ordem, com todos os itens", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a);
  const nav = t.nav();
  const ordem = ["Relatórios do SPX", "Alimentar AT exportada", "Pedidos pesquisados", "Backlog",
    "Colador", "Colador — Recebimento", "Colador — AT Cluster", "Avisos de rota incompleta", "Shopee XPT_CFC", "Shopee XPT_VIA"];
  let pos = -1;
  for (const s of ordem) { const p = nav.indexOf(s, pos + 1); assert.ok(p > pos, s); pos = p; }
});

test("admin so ve o Colador", () => {
  const a = carregar({ role: "admin", rotas: HIST("recebimento") });
  const t = montar(a);
  assert.ok(t.nav().includes("Colador — Recebimento"));
  assert.ok(!t.nav().includes("Relatórios do SPX"));
  assert.ok(!t.nav().includes("Shopee XPT_CFC"));
  assert.strictEqual(a.m.selecionado, "col:recebimento");
});

test("o que o servidor nao mandou fica Indisponivel; o que nao existe fica Ainda nao integrado", () => {
  const a = carregar();
  const t = montar(a, { lista: [], coladores: [] });
  assert.ok(t.nav().includes("Indisponível no momento"));
  assert.ok(t.nav().includes("Ainda não integrado"));
  assert.ok(!t.nav().includes("Colador — Recebimento"), "colador sem dado do servidor nao aparece");
});

test("macro do servidor sem lugar na lista vai pra Outros", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { lista: [AVISO, ...TRES(), { chave: "novo", nome: "Novo macro", ativo: false, resumo: "" }] });
  assert.ok(t.nav().includes("Outros"));
  assert.ok(t.nav().includes("Novo macro"));
});

test("nome e resumo do servidor nao viram HTML na lista", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { lista: [AVISO, spx("alimentacao", { resumo: "<b>x</b>" }), spx("pedidos"), spx("backlog")],
    coladores: [] });
  assert.ok(!t.nav().includes("<b>x</b>"));
  assert.ok(t.nav().includes("&lt;b&gt;x&lt;/b&gt;"));
});

test("o resumo da linha diz o que importa: rodando, falhou, desligado", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  a.m.atividade = { abas: [{ macro: "pedidos", estado: "rodando", maquina: "LEANDROXM", aba: "1", xpt: "XPT_CFC" }] };
  const t = montar(a, { lista: [AVISO, spx("alimentacao", { problema: { nivel: "erro", segundos_atras: 600, texto: "x" } }),
    spx("pedidos"), spx("backlog", { ativo: false })] });
  assert.match(t.nav(), /Falhou há 10 min/);
  assert.match(t.nav(), /Rodando agora em LEANDROXM/);
  assert.match(t.nav(), /Horário desligado/);
});

// ── escolher ─────────────────────────────────────────────────────────────
test("sem escolha lembrada, abre o primeiro; a escolha fica lembrada", () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"), ...HIST("backlog") } });
  montar(a);
  assert.strictEqual(a.m.selecionado, "spx:alimentacao");
  a.ctx._macSelecionar("spx:backlog");
  assert.strictEqual(a.m.selecionado, "spx:backlog");
  assert.strictEqual(a.storage["gc-macros-selecionado"], "spx:backlog");
  assert.match(a.el("macl-detalhe").innerHTML, /Backlog/);
});

test("abre o lembrado da ultima vez", () => {
  const a = carregar({ guardado: "col:at_cluster", rotas: HIST("at_cluster") });
  montar(a);
  assert.strictEqual(a.m.selecionado, "col:at_cluster");
});

// ── detalhe de um relatorio do SPX ───────────────────────────────────────
test("SPX: o detalhe traz Executar em, Polo, ultima carga, Rodar e o horario", () => {
  const a = carregar({ rotas: HIST("backlog") });
  const t = montar(a, { abrir: "spx:backlog" });
  const d = t.det();
  for (const s of ["Executar em", "Polo (XPT)", "Última carga", "_macRodar('backlog'", "Salvar horário", "Histórico recente"]) {
    assert.ok(d.includes(s), s);
  }
});

test("SPX: Pedidos nao tem horario proprio nem interruptor", () => {
  const a = carregar({ rotas: HIST("pedidos") });
  const t = montar(a, { abrir: "spx:pedidos" });
  assert.ok(!t.det().includes("Salvar horário"));
  assert.ok(!t.det().includes("_macAlternarAtivo"));
  assert.ok(t.det().includes("_macRodar('pedidos'"));
});

test("SPX: nunca configurado por aqui nao tem interruptor e avisa que segue o popup", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { lista: [AVISO, spx("alimentacao", { configurado: false }), spx("pedidos"), spx("backlog")], abrir: "spx:alimentacao" });
  assert.ok(!t.det().includes("_macAlternarAtivo"));
  assert.match(t.config(), /popup da extensão/);
});

test("SPX: Rodar travado enquanto o pedido anda, e solto depois", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  for (const [estado, travado] of [["aguardando", true], ["entregue", true], ["iniciado", false], ["erro", false]]) {
    const t = montar(a, { lista: [AVISO, spx("alimentacao", { comando: { estado, criado_em: new Date().toISOString(), criado_por: "x", idade_s: 999 } }),
      spx("pedidos"), spx("backlog")], abrir: "spx:alimentacao" });
    const botao = t.vivo().split("_macRodar('alimentacao'")[0].split("<button").pop();
    assert.strictEqual(botao.includes("disabled"), travado, estado);
  }
});

test("SPX: Executar em lista os computadores, marca o escolhido (sem ligar pra caixa) e o desconectado", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  a.m.computador = "leandroxm";
  const t = montar(a);
  a.m.vigia = { online: true, maquinas: [{ nome: "LEANDROXM", online: true, visto_ha_s: 3 }, { nome: "<i>PC2</i>", online: false, visto_ha_s: 900 }] };
  a.ctx._macRedesenhar();
  const v = t.vivo();
  assert.match(v, /Qualquer computador/);
  assert.match(v, /value="LEANDROXM" selected/);
  assert.match(v, /&lt;i&gt;PC2&lt;\/i&gt; — desconectado/);
  assert.ok(!v.includes("<i>PC2</i>"));
});

test("SPX: o polo vem da estacao logada na aba (atividade); sem ela, diz que ainda nao viu", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a);
  assert.match(t.vivo(), /ainda não visto/);
  a.m.atividade = { abas: [{ macro: "alimentacao", estado: "ok", maquina: "LEANDROXM", aba: "3", xpt: "XPT_VIA" }] };
  a.ctx._macRedesenhar();
  assert.match(t.vivo(), /XPT_VIA<\/b> · Videira/);
});

test("SPX: problema do vigia aparece com computador e motivo escapado, e Detalhes do macro", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  const t = montar(a, { lista: [AVISO, spx("alimentacao", { problema: { nivel: "erro", segundos_atras: 120, maquina: "LEANDROXM", texto: "<script>x</script>" } }),
    spx("pedidos"), spx("backlog")] });
  const v = t.vivo();
  assert.match(v, /Falhou/);
  assert.match(v, /LEANDROXM/);
  assert.ok(!v.includes("<script>"));
  assert.ok(v.includes("_macAbrirHistorico('alimentacao')"));
});

test("SPX: o horario salvo vem pro formulario, e salvar nao abre modal: mostra Salvo e recarrega", async () => {
  const a = carregar({ rotas: {
    ...HIST("backlog"),
    "PUT /admin/macros/spx/backlog": { corpo: { ok: true } },
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES() } },
    "GET /admin/macros/colador": { corpo: { coladores: [] } },
    "GET /admin/macros/atividade": { corpo: { abas: [] } },
  } });
  montar(a, { abrir: "spx:backlog" });
  assert.strictEqual(a.m.agenda.qual, "backlog");
  assert.strictEqual(a.m.agenda.minutos, 60);
  a.m.agenda.minutos = 90;
  a.ctx._macSalvarAgenda();
  await a.esperar(); await a.esperar();
  const put = a.chamadas.find((c) => c.metodo === "PUT");
  assert.deepStrictEqual(put.corpo, { ativo: true, agenda: { modo: "intervalo", horarios: [], minutos: 90 } });
  assert.match(a.el("mac-ag-erro").innerHTML, /Salvo/);
  assert.ok(a.chamadas.some((c) => c.caminho === "/admin/macros/spx"), "recarregou por baixo");
});

test("SPX: salvar o horario de um nunca configurado sai ligado; de um desligado, continua desligado", async () => {
  for (const [extra, esperado] of [[{ configurado: false, ativo: false }, true], [{ configurado: true, ativo: false }, false]]) {
    const a = carregar({ rotas: { ...HIST("backlog"), "PUT /admin/macros/spx/backlog": { corpo: {} },
      "GET /admin/macros": { corpo: {} }, "GET /admin/macros/spx": { corpo: {} }, "GET /admin/macros/colador": { corpo: {} },
      "GET /admin/macros/atividade": { corpo: {} } } });
    montar(a, { lista: [spx("alimentacao"), spx("pedidos"), spx("backlog", extra)], abrir: "spx:backlog" });
    a.ctx._macSalvarAgenda();
    await a.esperar();
    assert.strictEqual(a.chamadas.find((c) => c.metodo === "PUT").corpo.ativo, esperado);
  }
});

// ── o que muda sozinho nao mexe no formulario ────────────────────────────
test("redesenhar (andamento, atividade) atualiza o vivo e a lista, mas NUNCA o formulario", () => {
  const a = carregar({ rotas: HIST("backlog") });
  const t = montar(a, { abrir: "spx:backlog" });
  const form = a.el("macd-config");
  form.innerHTML = "FORMULARIO-COM-O-QUE-A-PESSOA-DIGITOU";
  a.m.atividade = { abas: [{ macro: "backlog", estado: "rodando", maquina: "LEANDROXM", aba: "9", xpt: "XPT_CFC" }] };
  a.ctx._macRedesenhar();
  assert.strictEqual(form.innerHTML, "FORMULARIO-COM-O-QUE-A-PESSOA-DIGITOU");
  assert.match(t.nav(), /Rodando agora em LEANDROXM/);
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

test("Rodar pede ao servidor, mostra o pedido no detalhe e passa a acompanhar", async () => {
  const a = carregar({ rotas: { ...HIST("alimentacao"), "POST /admin/macros/spx/alimentacao/rodar": { corpo: {
    ok: true, comando: { id: "1", estado: "aguardando", criado_em: new Date().toISOString(), criado_por: "Dev" },
    vigia: { online: true, maquinas: [{ nome: "LEANDROXM", online: true }] } } } } });
  const t = montar(a);
  a.ctx._macRodar("alimentacao", null);
  await a.esperar(); await a.esperar();
  assert.match(t.vivo(), /aguardando o computador dos macros/);
  assert.ok(a.timers.length >= 1, "passou a acompanhar");
});

// ── detalhe do Colador ───────────────────────────────────────────────────
test("Colador: o polo salvo vem marcado no formulario e aparece no topo", () => {
  const a = carregar({ rotas: HIST("at_cluster") });
  const t = montar(a, { coladores: [colador("recebimento"), colador("at_cluster", { config: { ...colador("x").config, xpt: "XPT_VIA" } })], abrir: "col:at_cluster" });
  assert.strictEqual(a.el("mac-col-xpt").value, "XPT_VIA");
  assert.match(t.vivo(), /XPT_VIA<\/b> · Videira/);
  assert.match(t.config(), /<option value="XPT_CFC">XPT_CFC · Caçador<\/option>/);
});

test("Colador: Rodar manda o computador escolhido e trava so pra mesma maquina aguardando", async () => {
  const a = carregar({ rotas: { ...HIST("recebimento"), "POST /admin/macros/colador/recebimento/rodar": { corpo: {
    ok: true, algum_conectado: true, comando: { id: "c", estado: "aguardando", alvo: "LEANDROXM" } } } } });
  const t = montar(a, { abrir: "col:recebimento" });
  a.ctx._macColadorMudarAlvo("recebimento", "LEANDROXM");
  a.ctx._macRodarColador("recebimento", null);
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.chamadas.find((c) => c.metodo === "POST").corpo, { maquina: "LEANDROXM" });
  const travado = () => t.vivo().split("_macRodarColador('recebimento'")[0].split("<button").pop().includes("disabled");
  assert.strictEqual(travado(), true, "mesma maquina");
  a.ctx._macColadorMudarAlvo("recebimento", "OUTRO-PC");
  assert.strictEqual(travado(), false, "outra maquina pode");
});

test("Colador: recebidos de hoje so aparece quando o servidor manda", () => {
  const a = carregar({ rotas: { ...HIST("recebimento"), ...HIST("at_cluster") } });
  const t = montar(a, { coladores: [colador("recebimento", { recebidos_hoje: 42 }), colador("at_cluster")], abrir: "col:recebimento" });
  assert.match(t.vivo(), /42 recebido\(s\)/);
  a.ctx._macSelecionar("col:at_cluster");
  assert.ok(!t.vivo().includes("recebido(s)"));
});

test("Colador: salvar manda a config normalizada, mostra Salvo e recarrega", async () => {
  const a = carregar({ rotas: { ...HIST("recebimento"), "PUT /admin/macros/colador/recebimento": { corpo: { ok: true } },
    "GET /admin/macros": { corpo: {} }, "GET /admin/macros/spx": { corpo: {} },
    "GET /admin/macros/colador": { corpo: { coladores: [colador("recebimento")] } }, "GET /admin/macros/atividade": { corpo: {} } } });
  montar(a, { abrir: "col:recebimento" });
  a.ctx._macColMudarCampo("xpt", "XPT_VIA");
  a.ctx._macColMudarCampo("lote", "35");
  a.ctx._macSalvarColador();
  await a.esperar(); await a.esperar();
  const put = a.chamadas.find((c) => c.metodo === "PUT");
  assert.strictEqual(put.corpo.config.xpt, "XPT_VIA");
  assert.strictEqual(put.corpo.config.lote, 35);
  assert.match(a.el("mac-col-erro").innerHTML, /Salvo/);
  assert.strictEqual(a.m.coladores[0].config.xpt, "XPT_CFC", "a lista so muda com o que o servidor devolver");
});

// ── detalhe do aviso ─────────────────────────────────────────────────────
test("Aviso: roda no servidor, polo fixo, e as rodadas carregam no formulario", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/avisos-entregador": { corpo: {
    ativo: true, tipos: [{ id: "p", rotulo: "Percentual", parametroRotulo: "%", parametroPadrao: 90 }],
    rodadas: [{ hora: 19, minuto: 5, tipo: "p", parametro: 90 }] } } } });
  const t = montar(a, { abrir: "av:avisos_entregador" });
  await a.esperar(); await a.esperar();
  assert.match(t.vivo(), /No servidor/);
  assert.match(t.vivo(), /XPT_CFC<\/b> · Caçador/);
  assert.strictEqual(a.m.rodadas.length, 1);
  assert.match(a.el("mac-rodadas-lista").innerHTML, /19:05/);
  assert.ok(t.det().includes("_macAlternarAtivo('avisos_entregador'"), "liga/desliga no topo");
});

test("Aviso: salvar as rodadas mantem o ligado/desligado da lista", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/avisos-entregador": { corpo: { tipos: [], rodadas: [{ hora: 8, minuto: 0, tipo: "p", parametro: 1 }] } },
    "PUT /admin/macros/avisos-entregador": { corpo: { ok: true } },
    "GET /admin/macros": { corpo: {} }, "GET /admin/macros/spx": { corpo: {} }, "GET /admin/macros/colador": { corpo: {} },
    "GET /admin/macros/atividade": { corpo: {} } } });
  montar(a, { lista: [{ ...AVISO, ativo: false }], coladores: [], abrir: "av:avisos_entregador" });
  await a.esperar(); await a.esperar();
  a.ctx._macSalvar();
  await a.esperar();
  assert.strictEqual(a.chamadas.find((c) => c.metodo === "PUT").corpo.ativo, false);
});

test("Ainda nao integrado: o detalhe explica e nao tem acao nenhuma", () => {
  const a = carregar();
  const t = montar(a, { abrir: "av:pendente_via" });
  assert.match(t.det(), /Ainda não integrado/);
  assert.ok(!t.det().includes("_macRodar"));
  assert.ok(!t.det().includes("Salvar"));
});

test("SPX: a proxima rodada agendada aparece na lista e no detalhe", () => {
  const a = carregar({ rotas: HIST("alimentacao") });
  a.m.computador = "LEANDROXM";
  a.m.atividade = { abas: [], ativos: [{ macro: "alimentacao", maquina: "LEANDROXM", rodando: false,
    proxima_em: Date.UTC(2026, 9, 19, 18, 31, 0), proxima_em_s: 720 }] };
  const t = montar(a);
  assert.match(t.nav(), /Próxima às 15:31 \(em 12 min\)/);
  assert.match(t.vivo(), /Próxima rodada[\s\S]*15:31 \(em 12 min\)/);
});
