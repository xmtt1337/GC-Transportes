// Testes de js/macros.js — a parte dos macros do SPX (AT Exportada, Pedidos Pesquisados,
// Backlog): "Rodar agora", andamento, última carga e o modal de horário.
//
// O que se protege, e por quê:
//   - o botão Rodar some/apaga quando o macro já está em andamento (clique duplo = pedido em
//     dobro) e cada estado do pedido diz o que a pessoa precisa saber — principalmente quando
//     NÃO rodou (Chrome fechado, macro já rodando);
//   - texto que vem do servidor (erro da extensão, nome de quem pediu) nunca vira HTML;
//   - a hora da "última carga" sai do texto de Brasília, sem passar por Date (no navegador de
//     quem estiver em outro fuso, o Date deslocaria a hora);
//   - o relógio de hora/minuto edita a lista CERTA (rodadas do aviso x horários do macro): os
//     dois modais dividem as mesmas funções;
//   - agenda inválida nem sai do navegador, com a mensagem na hora;
//   - o acompanhamento ao vivo para sozinho (não fica perguntando pra sempre).
//
// Script carregado sozinho num contexto isolado, com DOM, fetch e timers de mentira.
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "macros.js"), "utf8");

// let/const do script não viram propriedade do contexto: este trecho as expõe.
const ACESSOR = `
;globalThis.__m = {
  get lista() { return _macLista; }, set lista(v) { _macLista = v; },
  get vigia() { return _macVigia; }, set vigia(v) { _macVigia = v; },
  get agenda() { return _macAgenda; }, set agenda(v) { _macAgenda = v; },
  get rodadas() { return _macRodadas; }, set rodadas(v) { _macRodadas = v; },
  get fonte() { return _macFonte; }, set fonte(v) { _macFonte = v; },
  get poll() { return _macPoll; },
  get geral() { return _macGeral; }, set geral(v) { _macGeral = v; },
  get computador() { return _macComputador; }, set computador(v) { _macComputador = v; },
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
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, forca) => { (forca === undefined ? !classes.has(c) : forca) ? classes.add(c) : classes.delete(c); },
    },
  };
  // Como o navegador: innerText escapa HTML ao virar innerHTML.
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = escapar(v); }, get() { return o.innerHTML; } });
  return o;
}

// `rotas`: "METODO /caminho" -> { status, corpo } (ou função). Tudo que sair é registrado.
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
    console, Date, Intl, Promise, JSON, Set, Math, Number, String, Array, Object,
    document: { getElementById: el },
    API: "http://api.test", token: "tok",
    fetch: fetchFalso,
    gcAlert: (m) => alertas.push(m),
    _abrirModal: (id) => modais.abertos.push(id),
    _fecharModal: (id) => modais.fechados.push(id),
    skMostrar() {}, skFim() {},
    // _macRedesenhar so mostra a secao de avisos/SPX pra role "dev" - estes testes verificam
    // exatamente essa secao, entao precisam desse papel (o Colador, unico que admin tambem ve,
    // tem seus proprios testes em macros-colador.test.js).
    window: { addEventListener() {}, removeEventListener() {}, innerHeight: 800, innerWidth: 1200, _gcUser: { role: "dev" } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros.js" });
  const esperar = () => new Promise((r) => setImmediate(r));
  return { ctx, m: ctx.__m, els, el, chamadas, alertas, modais, timers, esperar };
}

// Mesma conta da tela: o "hoje" é o de Brasília.
const hojeBrasilia = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const macro = (qual, extra = {}) => ({
  chave: `spx_${qual}`, qual, nome: qual, agendavel: qual !== "pedidos", minutos_minimo: qual === "backlog" ? 30 : 20,
  configurado: true, ativo: true,
  agenda: qual === "pedidos" ? null : { modo: "intervalo", minutos: 60, horarios: [] },
  resumo: qual === "pedidos" ? "Roda sozinho depois de cada AT" : "A cada 1 h",
  ultima_carga: { quando: `${hojeBrasilia()} 14:32:07.123`, segundos_atras: 720 },
  comando: null,
  ...extra,
});

const TRES = () => [macro("alimentacao"), macro("pedidos"), macro("backlog")];
const linha = (html, qual) => {
  // A linha (mac-item-spx) que contém _macRodar('<qual>')
  const partes = html.split('<div class="mac-item mac-item-spx">').slice(1);
  return partes.find((p) => p.includes(`_macRodar('${qual}'`)) || "";
};

// ── última carga ──────────────────────────────────────────────────────────
test("a ultima carga mostra a hora do texto de Brasilia, sem passar por Date", () => {
  const a = carregar();
  const t = a.ctx._macCargaTexto({ quando: `${hojeBrasilia()} 14:32:07.123`, segundos_atras: 720 });
  assert.strictEqual(t, "hoje 14:32 (há 12 min)");
});

test("carga de outro dia mostra dia/mes em vez de hoje", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macCargaTexto({ quando: "2026-09-23 22:05:00", segundos_atras: 3600 * 20 }),
    "23/09 22:05 (há 20 h)");
});

test("_macHa: instantes, minutos, horas, dias", () => {
  const a = carregar();
  const ha = a.ctx._macHa;
  assert.strictEqual(ha(5), "há instantes");
  assert.strictEqual(ha(59), "há instantes");
  assert.strictEqual(ha(60), "há 1 min");
  assert.strictEqual(ha(59 * 60 + 59), "há 59 min");
  assert.strictEqual(ha(3600), "há 1 h");
  assert.strictEqual(ha(47 * 3600), "há 47 h");
  assert.strictEqual(ha(48 * 3600), "há 2 dias");
  assert.strictEqual(ha(-10), "há instantes");
  assert.strictEqual(ha(undefined), "há instantes");
});

// ── o andamento do pedido ─────────────────────────────────────────────────
const cmd = (estado, extra = {}) => ({
  id: "c1", qual: "alimentacao", estado, erro: null, criado_por: "Dev Teste",
  criado_em: "2026-09-24T17:32:00.000Z", idade_s: 5, ...extra,
});
const ONLINE = { online: true, visto_ha_s: 3 };
const OFFLINE = { online: false, visto_ha_s: 400 };

test("cada estado do pedido diz o que a pessoa precisa saber", () => {
  const a = carregar();
  const t = (e, v = ONLINE, extra) => a.ctx._macComandoTexto(cmd(e, extra), v);
  assert.strictEqual(t("aguardando").tom, "andando");
  assert.match(t("aguardando").texto, /aguardando o computador/);
  assert.strictEqual(t("entregue").tom, "andando");
  assert.strictEqual(t("iniciado").tom, "ok");
  assert.strictEqual(t("erro", ONLINE, { erro: "já está rodando" }).tom, "erro");
  assert.match(t("erro", ONLINE, { erro: "já está rodando" }).texto, /Não rodou: já está rodando/);
  assert.strictEqual(t("expirado").tom, "aviso");
  assert.match(t("expirado").texto, /Chrome ou o XM Vigia estão fechados/);
  assert.strictEqual(t("sem_confirmacao").tom, "aviso");
});

test("aguardando com o vigia sem responder avisa o que conferir, em vez de so 'aguardando'", () => {
  const a = carregar();
  const r = a.ctx._macComandoTexto(cmd("aguardando"), OFFLINE);
  assert.strictEqual(r.tom, "aviso");
  assert.match(r.texto, /nenhum computador responde/);
  assert.match(r.texto, /Chrome e o XM Vigia estão abertos/);
});

test("iniciado mostra a hora de Brasilia e quem pediu", () => {
  const a = carregar();
  // 17:32 UTC = 14:32 em Brasilia
  assert.strictEqual(a.ctx._macComandoTexto(cmd("iniciado"), ONLINE).texto, "Iniciado às 14:32 por Dev Teste");
});

test("erro sem motivo nao fica em branco", () => {
  const a = carregar();
  assert.match(a.ctx._macComandoTexto(cmd("erro"), ONLINE).texto, /motivo não informado/);
});

// ── em QUAL computador os macros executam ────────────────────────────────
const UMA = { online: true, visto_ha_s: 3, maquinas: [{ nome: "AVELL-LEANDRO", visto_ha_s: 3, online: true }] };
const DUAS = { online: true, visto_ha_s: 3, maquinas: [
  { nome: "CASA", visto_ha_s: 3, online: true }, { nome: "GALPAO", visto_ha_s: 20, online: true }] };

// ── o pontinho e o aviso: so quando ha algo a dizer ───────────────────────
const aviso = (html) => { const m = /<div class="mac-geral"><div class="mac-sit mac-sit-aviso">[\s\S]*?<span>([^<]*)<\/span>/.exec(html); return m && m[1]; };

// ── o pedido sabe pra onde vai ────────────────────────────────────────────
test("pedido aguardando um computador desconectado diz QUAL e o que fazer", () => {
  const a = carregar();
  const soCasa = { online: true, visto_ha_s: 3, maquinas: [
    { nome: "CASA", visto_ha_s: 3, online: true }, { nome: "GALPAO", visto_ha_s: 900, online: false }] };
  const r = a.ctx._macComandoTexto(cmd("aguardando", { alvo: "GALPAO" }), soCasa);
  assert.strictEqual(r.tom, "aviso");
  assert.match(r.texto, /GALPAO não está conectado/);
  assert.match(r.texto, /ou escolha outro computador/);
});

test("pedido aguardando com o destino conectado anda normalmente", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  const r = a.ctx._macComandoTexto(cmd("aguardando", { alvo: "CASA" }), DUAS);
  assert.strictEqual(r.tom, "andando");
  assert.match(r.texto, /aguardando CASA/);
});

test("pedido com destino: outro computador conectado nao serve", () => {
  const a = carregar();
  a.m.vigia = UMA;
  const r = a.ctx._macComandoTexto(cmd("aguardando", { alvo: "GALPAO" }), UMA);
  assert.strictEqual(r.tom, "aviso");
});

test("expirado e iniciado tambem citam o destino", () => {
  const a = carregar();
  assert.match(a.ctx._macComandoTexto(cmd("expirado", { alvo: "GALPAO" }), UMA).texto, /GALPAO está com o Chrome e o XM Vigia abertos/);
  assert.match(a.ctx._macComandoTexto(cmd("iniciado", { alvo: "CASA" }), UMA).texto, /por Dev Teste em CASA$/);
  assert.ok(!/ em /.test(a.ctx._macComandoTexto(cmd("iniciado"), UMA).texto), "sem destino, como antes");
});

// ── carregar a lista ──────────────────────────────────────────────────────
const AVISO = { chave: "avisos_entregador", nome: "Aviso", descricao: "", ativo: true, resumo: "19:05 Abaixo de 90% concluído" };

test("rota dos macros do SPX respondendo erro (nao dev, servidor antigo) tambem nao derruba", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { status: 404, corpo: { error: "nao existe" } },
  } });
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.lista.length, 1);
  assert.strictEqual(a.m.vigia, null);
});

// ── acompanhar ────────────────────────────────────────────────────────────
const ROTA_ESTADO = "GET /admin/macros/spx/estado";

test("o acompanhamento para quando a pessoa sai da tela", async () => {
  const a = carregar({ rotas: { [ROTA_ESTADO]: { corpo: { comandos: {}, vigia: ONLINE } } } });
  a.m.lista = [macro("alimentacao", { comando: cmd("aguardando") })];
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanhar();
  a.el("tela-macros").classList.remove("active-view");
  await a.timers.shift()();
  assert.strictEqual(a.chamadas.length, 0, "nao pergunta mais ao servidor");
  assert.strictEqual(a.m.poll, null);
});

test("sem nada em andamento nem comeca a perguntar", async () => {
  const a = carregar();
  a.m.lista = TRES();
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanhar();
  await a.timers.shift()();
  assert.strictEqual(a.chamadas.length, 0);
});

test("nao abre dois acompanhamentos ao mesmo tempo", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { comando: cmd("aguardando") })];
  a.ctx._macAcompanhar();
  a.ctx._macAcompanhar();
  assert.strictEqual(a.timers.length, 1);
});

// ── ligar / desligar ──────────────────────────────────────────────────────
test("o interruptor do aviso continua na rota de sempre", async () => {
  const a = carregar({ rotas: { "PUT /admin/macros/avisos-entregador/ativo": { corpo: { ok: true } } } });
  a.m.lista = [AVISO];
  a.ctx._macAlternarAtivo("avisos_entregador", {});
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/avisos-entregador/ativo");
  assert.strictEqual(a.chamadas.length, 1, "o aviso nao recarrega a lista");
});

// ── validacao da agenda ───────────────────────────────────────────────────
const ag = (extra) => ({ qual: "alimentacao", modo: "intervalo", minutos: 60, minimo: 20, horarios: [], ...extra });

test("intervalo valido segue como esta", () => {
  const a = carregar();
  assert.strictEqual(JSON.stringify(a.ctx._macMontarAgenda(ag({ minutos: 45 }))),
    JSON.stringify({ agenda: { modo: "intervalo", horarios: [], minutos: 45 } }));
});

test("intervalo abaixo do minimo do macro e recusado, com o numero na mensagem", () => {
  const a = carregar();
  assert.match(a.ctx._macMontarAgenda(ag({ minutos: 19 })).erro, /20 a 1440/);
  assert.match(a.ctx._macMontarAgenda(ag({ minutos: 29, minimo: 30 })).erro, /30 a 1440/);
  assert.ok(a.ctx._macMontarAgenda(ag({ minutos: 20 })).agenda);
});

test("intervalo em branco, decimal, acima de 24h ou texto e recusado", () => {
  const a = carregar();
  for (const minutos of ["", 45.5, 1441, "abc", NaN]) {
    assert.ok(a.ctx._macMontarAgenda(ag({ minutos })).erro, String(minutos));
  }
  assert.ok(a.ctx._macMontarAgenda(ag({ minutos: 1440 })).agenda);
});

test("modo horarios sem nenhum horario e recusado", () => {
  const a = carregar();
  assert.match(a.ctx._macMontarAgenda(ag({ modo: "horarios" })).erro, /pelo menos um horário/);
});

test("horario em branco ou fora da faixa e recusado (o campo vazio vira '')", () => {
  const a = carregar();
  const com = (h) => a.ctx._macMontarAgenda(ag({ modo: "horarios", horarios: [h] }));
  assert.match(com({ hora: "", minuto: "" }).erro, /em branco ou inválido/);
  assert.match(com({ hora: 24, minuto: 0 }).erro, /em branco ou inválido/);
  assert.match(com({ hora: 8, minuto: 60 }).erro, /em branco ou inválido/);
  assert.ok(com({ hora: 23, minuto: 59 }).agenda);
  assert.ok(com({ hora: 0, minuto: 0 }).agenda);
});

test("em modo horarios, um intervalo invalido que nao esta em uso NAO impede de salvar", () => {
  const a = carregar();
  const r = a.ctx._macMontarAgenda(ag({ modo: "horarios", minutos: 3, horarios: [{ hora: 8, minuto: 30 }] }));
  assert.strictEqual(r.erro, undefined);
  assert.ok(!("minutos" in r.agenda), "fica de fora - o servidor guarda o padrao");
});

test("os dois jeitos seguem juntos: trocar de modo nao joga fora o outro", () => {
  const a = carregar();
  const r = a.ctx._macMontarAgenda(ag({ modo: "intervalo", minutos: 40, horarios: [{ hora: 9, minuto: 0 }] }));
  assert.strictEqual(r.agenda.minutos, 40);
  assert.strictEqual(r.agenda.horarios.length, 1);
});

// ── o relogio serve aos dois modais ───────────────────────────────────────
test("abrindo o modal do aviso, o relogio volta a editar as rodadas", () => {
  const a = carregar({ rotas: { "GET /admin/macros/avisos-entregador": { corpo: { ativo: true, rodadas: [], tipos: [] } } } });
  a.m.fonte = "agenda";
  a.m.agenda = { qual: "alimentacao", modo: "horarios", minutos: 60, minimo: 20, horarios: [{ hora: 8, minuto: 0 }] };
  a.m.lista = [AVISO];
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macAbrirConfigurar("avisos_entregador");
  assert.strictEqual(a.m.fonte, "rodadas");
  a.ctx._macMudarHorario(0, "21:10");
  assert.strictEqual(a.m.rodadas[0].hora, 21);
  assert.strictEqual(a.m.agenda.horarios[0].hora, 8, "os horarios do macro do SPX ficaram intactos");
});

// ── a linha de situacao: uma so, e so quando importa ──────────────────────
const problema = (extra = {}) => ({ macro: "backlog", origem: "vigia", nivel: "erro", texto: "Login recusado ao enviar backlogs.xlsx",
  maquina: "CASA", arquivo: "backlogs.xlsx", quando: `${hojeBrasilia()} 09:40:00`, segundos_atras: 720, ...extra });

// ── problema geral (sem macro) ────────────────────────────────────────────
test("a lista carrega o problema geral do servidor", async () => {
  const geral = problema({ macro: "geral", texto: "erro geral" });
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES(), vigia: UMA, geral } },
  } });
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.geral.texto, "erro geral");
});

// ── historico ─────────────────────────────────────────────────────────────
const EVENTOS = [
  { id: 2, macro: "backlog", origem: "vigia", nivel: "erro", texto: "Login recusado", maquina: "CASA",
    arquivo: "backlogs.xlsx", quando: `${hojeBrasilia()} 09:40:00.1`, segundos_atras: 60 },
  { id: 1, macro: "alimentacao", origem: "extensao", nivel: "ok", texto: "baixado", maquina: "GALPAO",
    arquivo: null, quando: "2026-09-24 20:07:00", segundos_atras: 90000 },
];

test("abrir o historico de um macro filtra por ele e titula com o nome", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/spx/historico?limite=80&macro=backlog": { corpo: { eventos: EVENTOS } } } });
  a.ctx._macAbrirHistorico("backlog");
  assert.strictEqual(a.el("mac-hist-titulo").innerHTML, "Histórico — Backlog");
  assert.deepStrictEqual(a.modais.abertos, ["modal-macro-historico"]);
  await a.esperar(); await a.esperar();
  const html = a.el("mac-hist-lista").innerHTML;
  assert.ok(html.includes("hoje 09:40") && html.includes("24/09 20:07"));
  assert.ok(html.includes("CASA · vigia · backlogs.xlsx"));
  assert.ok(html.includes("GALPAO · extensão"), "extensao com acento, sem arquivo");
});

test("sem macro, o historico e de todos e nao leva filtro", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/spx/historico?limite=80": { corpo: { eventos: EVENTOS } } } });
  a.ctx._macAbrirHistorico();
  assert.strictEqual(a.el("mac-hist-titulo").innerHTML, "Histórico dos macros");
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/spx/historico?limite=80");
});

test("o historico mostra cada linha com o nome curto do macro e o nivel", () => {
  const a = carregar();
  const html = a.ctx._macHistoricoHtml(EVENTOS);
  assert.ok(html.includes("mac-hist-erro") && html.includes("mac-hist-ok"));
  assert.ok(html.includes("<b>Backlog</b>") && html.includes("<b>AT</b>"));
});

test("historico vazio, com erro do servidor e sem rede dizem o que houve", async () => {
  assert.ok(carregar().ctx._macHistoricoHtml([]).includes("Nada registrado ainda"));
  const a = carregar({ rotas: { "GET /admin/macros/spx/historico?limite=80": { status: 403, corpo: { error: "Acesso negado" } } } });
  a.ctx._macAbrirHistorico();
  await a.esperar(); await a.esperar();
  assert.ok(a.el("mac-hist-lista").innerHTML.includes("Acesso negado"));
  const b = carregar({ rotas: { "GET /admin/macros/spx/historico?limite=80": new TypeError("failed to fetch") } });
  b.ctx._macAbrirHistorico();
  await b.esperar(); await b.esperar();
  assert.ok(b.el("mac-hist-lista").innerHTML.includes("Erro ao conectar"));
});

test("historico: texto, computador e arquivo (vem de outro computador) nunca viram HTML", () => {
  const a = carregar();
  const html = a.ctx._macHistoricoHtml([{ ...EVENTOS[0], texto: "<img src=x onerror=1>", maquina: "<i>m</i>", arquivo: "<u>a</u>" }]);
  assert.ok(!html.includes("<img") && !html.includes("<i>m") && !html.includes("<u>a"));
});

test("macro que nao e do catalogo no historico aparece com o nome que veio", () => {
  const a = carregar();
  assert.ok(a.ctx._macHistoricoHtml([{ ...EVENTOS[0], macro: "novo" }]).includes("<b>novo</b>"));
});

test("_macQuandoTexto: hoje ou dia/mes, sempre com a hora do proprio texto", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macQuandoTexto(`${hojeBrasilia()} 09:40:00.1`), "hoje 09:40");
  assert.strictEqual(a.ctx._macQuandoTexto("2026-09-24 20:07:11"), "24/09 20:07");
  assert.doesNotThrow(() => a.ctx._macQuandoTexto(null));
});
