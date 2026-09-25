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
    window: { addEventListener() {}, removeEventListener() {}, innerHeight: 800, innerWidth: 1200 },
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

// ── a linha de cada macro ─────────────────────────────────────────────────
test("cada macro do SPX tem o botao Rodar", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes(TRES());
  for (const q of ["alimentacao", "pedidos", "backlog"]) assert.ok(html.includes(`_macRodar('${q}'`), q);
});

test("AT e Backlog tem Configurar e interruptor; Pedidos so tem o Rodar", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes(TRES());
  assert.ok(linha(html, "alimentacao").includes("_macAbrirConfigurarSpx('alimentacao')"));
  assert.ok(linha(html, "backlog").includes("_macAbrirConfigurarSpx('backlog')"));
  assert.ok(linha(html, "alimentacao").includes("_macAlternarAtivo('spx_alimentacao'"));
  const pedidos = linha(html, "pedidos");
  assert.ok(!pedidos.includes("_macAbrirConfigurarSpx"));
  assert.ok(!pedidos.includes("_macAlternarAtivo"), "pedidos e encadeado depois da AT: nao tem o que ligar");
  assert.ok(pedidos.includes("Roda sozinho depois de cada AT"));
});

test("macro nunca configurado por aqui: sem interruptor, resumo apagado, Configurar disponivel", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([macro("alimentacao", { configurado: false, resumo: "Ainda na agenda da extensão" }),
    macro("pedidos"), macro("backlog")]);
  const l = linha(html, "alimentacao");
  assert.ok(!l.includes("_macAlternarAtivo"));
  assert.ok(l.includes("mac-agenda-mudo"));
  assert.ok(l.includes("_macAbrirConfigurarSpx('alimentacao')"));
});

test("macro desligado mostra Desligado", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([macro("alimentacao", { ativo: false, resumo: "Desligado" }), macro("pedidos"), macro("backlog")]);
  assert.ok(linha(html, "alimentacao").includes(">Desligado<"));
});

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

test("sem nenhuma carga, diz isso", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([macro("alimentacao", { ultima_carga: null }), macro("pedidos"), macro("backlog")]);
  assert.ok(linha(html, "alimentacao").includes("Nenhuma carga ainda"));
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

test("texto do servidor (erro, quem pediu) nunca vira HTML", () => {
  const a = carregar();
  a.m.vigia = ONLINE;
  const perigoso = '<img src=x onerror=alert(1)>';
  const html = a.ctx._macHtmlSecoes([
    macro("alimentacao", { comando: cmd("erro", { erro: perigoso }) }), macro("pedidos"), macro("backlog")]);
  assert.ok(!html.includes("<img"), "o erro foi escapado");
  assert.ok(html.includes("&lt;img"));
  const html2 = a.ctx._macHtmlSecoes([
    macro("alimentacao", { comando: cmd("iniciado", { criado_por: perigoso }) }), macro("pedidos"), macro("backlog")]);
  assert.ok(!html2.includes("<img"));
});

test("Rodar fica apagado enquanto o pedido esta em andamento, e volta depois", () => {
  const a = carregar();
  a.m.vigia = ONLINE;
  const desabilitado = (estado) => {
    const html = a.ctx._macHtmlSecoes([macro("alimentacao", { comando: estado ? cmd(estado) : null }), macro("pedidos"), macro("backlog")]);
    return /class="mac-rodar"[^>]*\bdisabled\b/.test(linha(html, "alimentacao"));
  };
  assert.strictEqual(desabilitado("aguardando"), true);
  assert.strictEqual(desabilitado("entregue"), true);
  for (const e of ["iniciado", "erro", "expirado", "sem_confirmacao", null]) {
    assert.strictEqual(desabilitado(e), false, String(e));
  }
});

// ── em QUAL computador os macros executam ────────────────────────────────
const UMA = { online: true, visto_ha_s: 3, maquinas: [{ nome: "AVELL-LEANDRO", visto_ha_s: 3, online: true }] };
const DUAS = { online: true, visto_ha_s: 3, maquinas: [
  { nome: "CASA", visto_ha_s: 3, online: true }, { nome: "GALPAO", visto_ha_s: 20, online: true }] };
const NENHUMA = { online: false, visto_ha_s: 400, maquinas: [{ nome: "CASA", visto_ha_s: 400, online: false }] };
const secaoMacros = (a) => a.ctx._macHtmlSecoes(TRES());
const opcoesDo = (html) => [...html.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)]
  .map((m) => ({ valor: m[1], selecionada: !!m[2], rotulo: m[3] }));

test("o cabecalho tem o seletor 'Executa em' com 'Qualquer computador' e cada computador conhecido", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  const html = secaoMacros(a);
  assert.ok(html.includes("Executa em"));
  assert.deepStrictEqual(opcoesDo(html).map((o) => o.valor), ["", "CASA", "GALPAO"]);
  assert.strictEqual(opcoesDo(html)[0].rotulo, "Qualquer computador");
});

test("sem escolha, 'Qualquer computador' vem marcado", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  const marcadas = opcoesDo(secaoMacros(a)).filter((o) => o.selecionada);
  assert.deepStrictEqual(marcadas.map((o) => o.valor), [""]);
});

test("com escolha, o escolhido vem marcado", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  a.m.computador = "GALPAO";
  assert.deepStrictEqual(opcoesDo(secaoMacros(a)).filter((o) => o.selecionada).map((o) => o.valor), ["GALPAO"]);
});

test("a escolha vale mesmo com outra caixa de letra (o Windows guarda em maiuscula)", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  a.m.computador = "galpao";
  assert.deepStrictEqual(opcoesDo(secaoMacros(a)).filter((o) => o.selecionada).map((o) => o.valor), ["GALPAO"]);
});

test("computador desconectado aparece na lista marcado como desconectado", () => {
  const a = carregar();
  a.m.vigia = { online: true, visto_ha_s: 3, maquinas: [
    { nome: "CASA", visto_ha_s: 3, online: true }, { nome: "GALPAO", visto_ha_s: 900, online: false }] };
  const o = opcoesDo(secaoMacros(a));
  assert.strictEqual(o.find((x) => x.valor === "GALPAO").rotulo, "GALPAO — desconectado");
  assert.strictEqual(o.find((x) => x.valor === "CASA").rotulo, "CASA");
});

test("o escolhido que nunca consultou (servidor reiniciou) continua na lista, desconectado", () => {
  const a = carregar();
  a.m.vigia = { online: false, visto_ha_s: null, maquinas: [] };
  a.m.computador = "GALPAO";
  const o = opcoesDo(secaoMacros(a));
  assert.deepStrictEqual(o.map((x) => x.valor), ["", "GALPAO"]);
  assert.ok(o[1].selecionada && o[1].rotulo.includes("desconectado"));
});

test("vigia antigo (sem nome) nao pode ser escolhido - nome vazio significaria 'qualquer um'", () => {
  const a = carregar();
  a.m.vigia = { online: true, visto_ha_s: 2, maquinas: [{ nome: "", visto_ha_s: 2, online: true }] };
  assert.deepStrictEqual(opcoesDo(secaoMacros(a)).map((o) => o.valor), [""]);
});

test("nome de computador com HTML nao vira HTML (nem na lista nem no aviso)", () => {
  const a = carregar();
  a.m.vigia = { online: true, visto_ha_s: 1, maquinas: [{ nome: '<b onclick="x">m</b>', visto_ha_s: 1, online: true }] };
  a.m.computador = '<i>nao</i>';
  const html = secaoMacros(a);
  assert.ok(!html.includes("<b onclick") && !html.includes("<i>nao"));
});

test("sem a informacao do vigia (servidor antigo), o seletor nem aparece", () => {
  const a = carregar();
  a.m.vigia = null;
  assert.ok(!secaoMacros(a).includes("mac-computador"));
});

test("o seletor so aparece na secao dos macros, uma vez", () => {
  const a = carregar();
  a.m.vigia = UMA;
  assert.strictEqual(secaoMacros(a).split('id="mac-computador-sel"').length - 1, 1);
});

// ── o pontinho e o aviso: so quando ha algo a dizer ───────────────────────
const aviso = (html) => { const m = /<div class="mac-geral"><div class="mac-sit mac-sit-aviso">[\s\S]*?<span>([^<]*)<\/span>/.exec(html); return m && m[1]; };
const tomDoPonto = (html) => /mac-vigia mac-vigia-(\w+)/.exec(html)[1];

test("um computador ouvindo e nenhuma escolha: sem aviso, ponto verde (nao ha ambiguidade)", () => {
  const a = carregar();
  a.m.vigia = UMA;
  const html = secaoMacros(a);
  assert.strictEqual(aviso(html), null);
  assert.strictEqual(tomDoPonto(html), "on");
});

test("dois computadores conectados sem escolha: avisa pra escolher, e diz o que acontece sem escolha", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  const t = aviso(secaoMacros(a));
  assert.ok(t.includes("2 computadores conectados (CASA, GALPAO)"));
  assert.ok(t.includes("escolha acima em qual os macros rodam"));
  assert.ok(t.includes("o horário roda em todos"));
});

test("dois conectados COM escolha: sem aviso (o outro fica parado, e esta tudo certo)", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  a.m.computador = "CASA";
  const html = secaoMacros(a);
  assert.strictEqual(aviso(html), null);
  assert.strictEqual(tomDoPonto(html), "on");
});

test("o escolhido desconectado: avisa QUAL e ha quanto tempo, com o que fazer", () => {
  const a = carregar();
  a.m.vigia = { online: true, visto_ha_s: 3, maquinas: [
    { nome: "CASA", visto_ha_s: 3, online: true }, { nome: "GALPAO", visto_ha_s: 900, online: false }] };
  a.m.computador = "GALPAO";
  const html = secaoMacros(a);
  assert.ok(aviso(html).includes("GALPAO não está conectado (visto há 15 min)"));
  assert.ok(aviso(html).includes("ou escolha outro computador"));
  assert.strictEqual(tomDoPonto(html), "off");
});

test("outro computador conectado NAO conta como o escolhido estar conectado", () => {
  const a = carregar();
  a.m.vigia = UMA;                       // so o AVELL-LEANDRO esta ouvindo
  a.m.computador = "GALPAO";
  assert.ok(aviso(secaoMacros(a)).includes("GALPAO não está conectado"));
});

test("o escolhido que o servidor nunca viu: avisa sem inventar 'visto ha X'", () => {
  const a = carregar();
  a.m.vigia = { online: false, visto_ha_s: null, maquinas: [] };
  a.m.computador = "GALPAO";
  const t = aviso(secaoMacros(a));
  assert.ok(t.includes("GALPAO não está conectado —"));
  assert.ok(!t.includes("visto"));
});

test("ninguem conectado e sem escolha: diz ha quanto tempo e o que abrir", () => {
  const a = carregar();
  a.m.vigia = NENHUMA;
  const t = aviso(secaoMacros(a));
  assert.ok(t.includes("Nenhum computador conectado (visto há 6 min)"));
  assert.ok(t.includes("abra o Chrome (com a extensão) e o XM Vigia"));
});

test("nunca teve contato: nao inventa 'visto ha X'", () => {
  const a = carregar();
  a.m.vigia = { online: false, visto_ha_s: null, maquinas: [] };
  const t = aviso(secaoMacros(a));
  assert.ok(t.includes("Nenhum computador conectado —") && !t.includes("visto"));
});

test("servidor antigo (sem a lista de maquinas) continua funcionando pelo online", () => {
  const a = carregar();
  a.m.vigia = { online: true, visto_ha_s: 2 };
  assert.strictEqual(aviso(secaoMacros(a)), null);
  a.m.vigia = { online: false, visto_ha_s: 500 };
  assert.ok(aviso(secaoMacros(a)).includes("Nenhum computador conectado (visto há 8 min)"));
});

test("o aviso do computador so aparece na secao dos macros, uma vez", () => {
  const a = carregar();
  a.m.vigia = DUAS;
  assert.strictEqual(secaoMacros(a).split("computadores conectados").length - 1, 1);
});

// ── escolher o computador ─────────────────────────────────────────────────
const ROTA_PC = "PUT /admin/macros/spx/computador";

test("escolher manda o nome ao servidor e a tela ja mostra a escolha", async () => {
  const a = carregar({ rotas: { [ROTA_PC]: { corpo: { ok: true, computador: "GALPAO" } } } });
  a.m.vigia = DUAS;
  a.m.lista = TRES();
  a.ctx._macEscolherComputador("GALPAO");
  assert.strictEqual(a.m.computador, "GALPAO", "troca na hora, antes da resposta");
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].metodo, "PUT");
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/spx/computador");
  assert.deepStrictEqual(a.chamadas[0].corpo, { maquina: "GALPAO" });
});

test("'Qualquer computador' manda null (solta a escolha)", async () => {
  const a = carregar({ rotas: { [ROTA_PC]: { corpo: { ok: true, computador: null } } } });
  a.m.vigia = DUAS; a.m.lista = TRES(); a.m.computador = "GALPAO";
  a.ctx._macEscolherComputador("");
  assert.strictEqual(a.m.computador, null);
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.chamadas[0].corpo, { maquina: null });
});

test("servidor recusou: volta pra escolha de antes e avisa", async () => {
  const a = carregar({ rotas: { [ROTA_PC]: { status: 403, corpo: { error: "Acesso negado" } } } });
  a.m.vigia = DUAS; a.m.lista = TRES(); a.m.computador = "CASA";
  a.ctx._macEscolherComputador("GALPAO");
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.computador, "CASA");
  assert.deepStrictEqual(a.alertas, ["Acesso negado"]);
});

test("sem rede: volta pra escolha de antes e avisa", async () => {
  const a = carregar({ rotas: { [ROTA_PC]: new TypeError("failed to fetch") } });
  a.m.vigia = DUAS; a.m.lista = TRES(); a.m.computador = "CASA";
  a.ctx._macEscolherComputador("GALPAO");
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.computador, "CASA");
  assert.deepStrictEqual(a.alertas, ["Erro ao conectar com o servidor."]);
});

test("a lista carrega a escolha que o servidor guardou", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES(), vigia: DUAS, computador: "GALPAO" } },
  } });
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.computador, "GALPAO");
});

test("sem escolha guardada, a lista deixa 'qualquer computador'", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES(), vigia: DUAS, computador: null } },
  } });
  a.m.computador = "RESTO";
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.computador, null);
});

// ── o pedido sabe pra onde vai ────────────────────────────────────────────
test("o Rodar diz no tooltip em qual computador vai rodar", () => {
  const a = carregar();
  a.m.vigia = DUAS; a.m.computador = "GALPAO";
  assert.ok(linha(secaoMacros(a), "backlog").includes('title="Rodar agora em GALPAO"'));
  a.m.computador = null;
  assert.ok(linha(secaoMacros(a), "backlog").includes('title="Rodar agora"'));
});

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

test("junta os macros de aviso com os do SPX e guarda o estado do vigia", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES(), vigia: ONLINE } },
  } });
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.lista.length, 4);
  assert.strictEqual(a.m.vigia.online, true);
  assert.ok(a.el("mac-lista").innerHTML.includes("_macRodar('backlog'"));
});

test("a rota dos macros do SPX falhando NAO derruba o resto da tela", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": new TypeError("failed to fetch"),
  } });
  a.ctx._macCarregarLista();
  await a.esperar(); await a.esperar();
  const html = a.el("mac-lista").innerHTML;
  assert.ok(html.includes("_macAbrirConfigurar('avisos_entregador')"), "o aviso segue funcionando");
  assert.strictEqual(html.split("Indisponível no momento").length - 1, 3);
});

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

test("recarga silenciosa nao apaga a lista nem mostra o esqueleto", async () => {
  const a = carregar({ rotas: {
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES(), vigia: ONLINE } },
  } });
  a.el("mac-lista").innerHTML = "<div>antes</div>";
  a.ctx._macCarregarLista(true);
  assert.strictEqual(a.el("mac-lista").innerHTML, "<div>antes</div>", "ainda la enquanto carrega");
  await a.esperar(); await a.esperar();
  assert.ok(a.el("mac-lista").innerHTML.includes("_macRodar"));
});

// ── Rodar agora ───────────────────────────────────────────────────────────
const ROTA_RODAR = "POST /admin/macros/spx/alimentacao/rodar";

test("Rodar pede ao servidor, mostra o pedido e passa a acompanhar", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { corpo: { ok: true, comando: cmd("aguardando"), vigia: ONLINE } } } });
  a.m.lista = TRES();
  const botao = { disabled: false };
  a.ctx._macRodar("alimentacao", botao);
  assert.strictEqual(botao.disabled, true, "desabilita na hora, antes da resposta");
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].metodo, "POST");
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/spx/alimentacao/rodar");
  assert.strictEqual(a.m.lista[0].comando.estado, "aguardando");
  assert.ok(a.el("mac-lista").innerHTML.includes("aguardando o computador dos macros"));
  assert.ok(a.m.poll, "ficou acompanhando");
});

test("clicar num macro ja em andamento nao faz pedido nenhum", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { comando: cmd("entregue") })];
  a.ctx._macRodar("alimentacao", { disabled: false });
  assert.strictEqual(a.chamadas.length, 0);
});

test("409 (ja foi pedido) avisa e mostra o pedido que ja existe", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { status: 409, corpo: { error: "já foi pedido — aguarde.", comando: cmd("entregue") } } } });
  a.m.lista = TRES();
  a.ctx._macRodar("alimentacao", { disabled: false });
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.alertas, ["já foi pedido — aguarde."]);
  assert.strictEqual(a.m.lista[0].comando.estado, "entregue");
});

test("erro do servidor devolve o botao e avisa", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { status: 403, corpo: { error: "Acesso negado" } } } });
  a.m.lista = TRES();
  const botao = { disabled: false };
  a.ctx._macRodar("alimentacao", botao);
  await a.esperar(); await a.esperar();
  assert.strictEqual(botao.disabled, false);
  assert.deepStrictEqual(a.alertas, ["Acesso negado"]);
  assert.strictEqual(a.m.lista[0].comando, null);
});

test("sem rede devolve o botao e avisa", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: new TypeError("failed to fetch") } });
  a.m.lista = TRES();
  const botao = { disabled: false };
  a.ctx._macRodar("alimentacao", botao);
  await a.esperar(); await a.esperar();
  assert.strictEqual(botao.disabled, false);
  assert.deepStrictEqual(a.alertas, ["Erro ao conectar com o servidor."]);
});

// ── acompanhar ────────────────────────────────────────────────────────────
const ROTA_ESTADO = "GET /admin/macros/spx/estado";

test("o acompanhamento atualiza o andamento e PARA quando o pedido sai de andamento", async () => {
  let estado = "entregue";
  const a = carregar({ rotas: { [ROTA_ESTADO]: () => ({ corpo: { comandos: { alimentacao: cmd(estado) }, vigia: ONLINE } }) } });
  a.m.lista = [macro("alimentacao", { comando: cmd("aguardando") })];
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanhar();
  assert.strictEqual(a.timers.length, 1, "agendou a primeira volta");

  await a.timers.shift()(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.lista[0].comando.estado, "entregue");
  assert.ok(a.el("mac-lista").innerHTML.includes("Recebido pela extensão"));
  assert.strictEqual(a.timers.length, 1, "ainda em andamento: marcou a proxima volta");

  estado = "iniciado";
  await a.timers.shift()(); await a.esperar(); await a.esperar();
  assert.ok(a.el("mac-lista").innerHTML.includes("Iniciado às 14:32"));
  await a.timers.shift()();   // a volta seguinte ve que nao ha mais o que acompanhar
  assert.strictEqual(a.timers.length, 0);
  assert.strictEqual(a.m.poll, null);
});

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

test("uma volta sem resposta nao mata o acompanhamento", async () => {
  const a = carregar({ rotas: { [ROTA_ESTADO]: new TypeError("failed to fetch") } });
  a.m.lista = [macro("alimentacao", { comando: cmd("aguardando") })];
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanhar();
  await a.timers.shift()(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.timers.length, 1, "tenta de novo");
});

test("nao abre dois acompanhamentos ao mesmo tempo", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { comando: cmd("aguardando") })];
  a.ctx._macAcompanhar();
  a.ctx._macAcompanhar();
  assert.strictEqual(a.timers.length, 1);
});

// ── ligar / desligar ──────────────────────────────────────────────────────
test("o interruptor de um macro do SPX usa a rota do SPX e recarrega o resumo", async () => {
  const a = carregar({ rotas: {
    "PUT /admin/macros/spx/alimentacao/ativo": { corpo: { ok: true, ativo: false } },
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES(), vigia: ONLINE } },
  } });
  a.m.lista = TRES();
  a.ctx._macAlternarAtivo("spx_alimentacao", {});
  await a.esperar(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/spx/alimentacao/ativo");
  assert.deepStrictEqual(a.chamadas[0].corpo, { ativo: false });
  assert.ok(a.chamadas.some((c) => c.caminho === "/admin/macros/spx"), "recarregou o resumo");
});

test("o interruptor do aviso continua na rota de sempre", async () => {
  const a = carregar({ rotas: { "PUT /admin/macros/avisos-entregador/ativo": { corpo: { ok: true } } } });
  a.m.lista = [AVISO];
  a.ctx._macAlternarAtivo("avisos_entregador", {});
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/avisos-entregador/ativo");
  assert.strictEqual(a.chamadas.length, 1, "o aviso nao recarrega a lista");
});

test("recusa do servidor desfaz o interruptor", async () => {
  const a = carregar({ rotas: { "PUT /admin/macros/spx/backlog/ativo": { status: 409, corpo: { error: "Configure o horário antes." } } } });
  a.m.lista = TRES();
  a.ctx._macAlternarAtivo("spx_backlog", {});
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.lista[2].ativo, true, "voltou");
  assert.deepStrictEqual(a.alertas, ["Configure o horário antes."]);
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

// ── o modal ───────────────────────────────────────────────────────────────
test("abrir o modal copia a agenda (editar nao mexe na lista da tela)", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { agenda: { modo: "horarios", minutos: 60, horarios: [{ hora: 8, minuto: 0 }] } })];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.m.agenda.horarios[0].hora = 15;
  a.m.agenda.horarios.push({ hora: 20, minuto: 0 });
  assert.strictEqual(a.m.lista[0].agenda.horarios[0].hora, 8);
  assert.strictEqual(a.m.lista[0].agenda.horarios.length, 1);
  assert.deepStrictEqual(a.modais.abertos, ["modal-macro-agenda"]);
});

test("o modal mostra o nome, o minimo do macro e a explicacao", () => {
  const a = carregar();
  a.m.lista = [macro("backlog", { nome: "Backlog" })];
  a.ctx._macAbrirConfigurarSpx("backlog");
  assert.strictEqual(a.el("mac-ag-titulo").innerHTML, "Backlog");
  assert.strictEqual(a.el("mac-ag-dica-minimo").innerHTML, "Mínimo de 30 minutos.");
  assert.match(a.el("mac-ag-descricao").innerHTML, /retrato inteiro/);
});

test("macro nunca configurado abre ligado; configurado e desligado abre desligado", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { configurado: false, ativo: true })];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  assert.strictEqual(a.el("mac-ag-ativo").checked, true);
  a.m.lista = [macro("alimentacao", { configurado: true, ativo: false })];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  assert.strictEqual(a.el("mac-ag-ativo").checked, false);
});

test("a parte que nao esta valendo fica apagada, e o radio acompanha o modo", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao")];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  assert.strictEqual(a.el("mac-ag-modo-intervalo").checked, true);
  assert.strictEqual(a.el("mac-ag-bloco-horarios").classList.contains("mac-ag-apagado"), true);
  assert.strictEqual(a.el("mac-ag-bloco-intervalo").classList.contains("mac-ag-apagado"), false);
  a.ctx._macMudarModo("horarios");
  assert.strictEqual(a.el("mac-ag-modo-horarios").checked, true);
  assert.strictEqual(a.el("mac-ag-bloco-intervalo").classList.contains("mac-ag-apagado"), true);
});

test("adicionar horario: comeca em 08:00, depois sugere uma hora a mais, e passa pra modo horarios", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao")];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macAdicionarHorario();
  a.ctx._macAdicionarHorario();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.m.agenda.horarios)),
    [{ hora: 8, minuto: 0 }, { hora: 9, minuto: 0 }]);
  assert.strictEqual(a.m.agenda.modo, "horarios");
});

test("a sugestao de horario nao passa de 23", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { agenda: { modo: "horarios", minutos: 60, horarios: [{ hora: 23, minuto: 30 }] } })];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macAdicionarHorario();
  assert.strictEqual(a.m.agenda.horarios[1].hora, 23);
});

test("remover horario tira o certo e a lista vazia diz isso", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { agenda: { modo: "horarios", minutos: 60,
    horarios: [{ hora: 8, minuto: 0 }, { hora: 12, minuto: 0 }, { hora: 16, minuto: 0 }] } })];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macRemoverHorario(1);
  assert.deepStrictEqual(a.m.agenda.horarios.map((h) => h.hora), [8, 16]);
  a.ctx._macRemoverHorario(0); a.ctx._macRemoverHorario(0);
  assert.ok(a.el("mac-ag-horarios").innerHTML.includes("Nenhum horário ainda"));
});

test("o campo de minutos guarda numero, e vazio fica vazio (nao vira 0)", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao")];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macMudarMinutos("45");
  assert.strictEqual(a.m.agenda.minutos, 45);
  a.ctx._macMudarMinutos("");
  assert.strictEqual(a.m.agenda.minutos, "");
});

// ── o relogio serve aos dois modais ───────────────────────────────────────
test("com o modal de horario aberto, o relogio edita os HORARIOS do macro (nao as rodadas do aviso)", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.m.lista = [macro("alimentacao", { agenda: { modo: "horarios", minutos: 60, horarios: [{ hora: 8, minuto: 0 }] } })];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  assert.strictEqual(a.m.fonte, "agenda");
  a.ctx._macMudarHorario(0, "09:45");
  assert.strictEqual(a.m.agenda.horarios[0].hora, 9);
  assert.strictEqual(a.m.agenda.horarios[0].minuto, 45);
  assert.strictEqual(a.m.rodadas[0].hora, 19, "as rodadas do aviso ficaram intactas");
  assert.strictEqual(a.m.rodadas[0].minuto, 5);
});

test("escolher na lista de hora/minuto tambem vai pra lista certa", () => {
  const a = carregar();
  a.m.lista = [macro("alimentacao", { agenda: { modo: "horarios", minutos: 60, horarios: [{ hora: 8, minuto: 0 }] } })];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macEscolherHm(0, "hora", 17);
  a.ctx._macEscolherHm(0, "minuto", 30);
  assert.strictEqual(a.m.agenda.horarios[0].hora, 17);
  assert.strictEqual(a.m.agenda.horarios[0].minuto, 30);
});

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

// ── salvar ────────────────────────────────────────────────────────────────
test("salvar manda ativo e agenda, fecha o modal e recarrega a lista por baixo", async () => {
  const a = carregar({ rotas: {
    "PUT /admin/macros/spx/alimentacao": { corpo: { ok: true } },
    "GET /admin/macros": { corpo: { macros: [AVISO] } },
    "GET /admin/macros/spx": { corpo: { macros: TRES(), vigia: ONLINE } },
  } });
  a.m.lista = [macro("alimentacao")];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macMudarMinutos("40");
  a.el("mac-ag-ativo").checked = true;
  a.ctx._macSalvarAgenda();
  await a.esperar(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas[0].metodo, "PUT");
  assert.strictEqual(a.chamadas[0].caminho, "/admin/macros/spx/alimentacao");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.chamadas[0].corpo)),
    { ativo: true, agenda: { modo: "intervalo", horarios: [], minutos: 40 } });
  assert.deepStrictEqual(a.modais.fechados, ["modal-macro-agenda"]);
  assert.ok(a.chamadas.some((c) => c.caminho === "/admin/macros/spx" && c.metodo === "GET"));
});

test("agenda invalida nem sai do navegador: a mensagem aparece na hora", () => {
  const a = carregar();
  a.m.lista = [macro("backlog")];
  a.ctx._macAbrirConfigurarSpx("backlog");
  a.ctx._macMudarMinutos("10");
  a.ctx._macSalvarAgenda();
  assert.strictEqual(a.chamadas.length, 0);
  assert.match(a.el("mac-ag-erro").innerHTML, /30 a 1440/);
  assert.deepStrictEqual(a.modais.fechados, []);
});

test("recusa do servidor mostra o motivo no modal e devolve o botao", async () => {
  const a = carregar({ rotas: { "PUT /admin/macros/spx/alimentacao": { status: 400, corpo: { error: "O intervalo tem que ser de 20 a 1440 minutos." } } } });
  a.m.lista = [macro("alimentacao")];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macSalvarAgenda();
  await a.esperar(); await a.esperar();
  assert.match(a.el("mac-ag-erro").innerHTML, /20 a 1440/);
  assert.strictEqual(a.el("mac-ag-salvar").disabled, false);
  assert.strictEqual(a.el("mac-ag-salvar").textContent, "Salvar");
  assert.deepStrictEqual(a.modais.fechados, []);
});

test("sem rede ao salvar: avisa no modal e devolve o botao", async () => {
  const a = carregar({ rotas: { "PUT /admin/macros/spx/alimentacao": new TypeError("failed to fetch") } });
  a.m.lista = [macro("alimentacao")];
  a.ctx._macAbrirConfigurarSpx("alimentacao");
  a.ctx._macSalvarAgenda();
  await a.esperar(); await a.esperar();
  assert.match(a.el("mac-ag-erro").innerHTML, /Erro ao conectar/);
  assert.strictEqual(a.el("mac-ag-salvar").disabled, false);
});

// ── o redesenho: uma linha de texto, controles a direita ──────────────────
test("a linha e enxuta: nome, UMA linha 'quando roda · ultima carga', e os controles", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes(TRES());
  const l = linha(html, "alimentacao");
  assert.ok(l.includes('class="mac-spx-texto"'));
  assert.ok(l.includes('class="mac-spx-controles"'));
  assert.strictEqual(l.split("mac-spx-meta").length - 1, 1, "so uma linha de meta");
  assert.match(l, /A cada 1 h<\/span> · Última carga hoje 14:32/);
});

test("a explicacao do macro vai no tooltip do nome, nao na tela", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes(TRES());
  assert.ok(html.includes('title="Exporta e baixa a AT do dia"'));
  assert.ok(!html.includes('class="mac-item-detalhe">Exporta'), "nao aparece como linha de texto");
});

test("o horario e um botao de engrenagem com nome acessivel (nao um 'Configurar' de texto)", () => {
  const a = carregar();
  const l = linha(a.ctx._macHtmlSecoes(TRES()), "alimentacao");
  assert.ok(/class="mac-icone"[^>]*aria-label="Configurar o horário/.test(l));
  assert.ok(!l.includes(">Configurar<"));
});

test("o interruptor nao carrega mais o rotulo 'Ativo' ao lado (o resumo ja diz 'Desligado')", () => {
  const a = carregar();
  const l = linha(a.ctx._macHtmlSecoes(TRES()), "alimentacao");
  assert.ok(!l.includes(">Ativo<"));
  assert.ok(l.includes('role="switch"'));
});

test("Rodar fica depois do interruptor e antes da engrenagem, sempre na mesma ordem", () => {
  const a = carregar();
  const l = linha(a.ctx._macHtmlSecoes(TRES()), "alimentacao");
  const pos = ["gc-toggle", "mac-rodar", "mac-icone"].map((c) => l.indexOf(c));
  assert.deepStrictEqual([...pos].sort((x, y) => x - y), pos);
});

// ── a linha de situacao: uma so, e so quando importa ──────────────────────
const problema = (extra = {}) => ({ macro: "backlog", origem: "vigia", nivel: "erro", texto: "Login recusado ao enviar backlogs.xlsx",
  maquina: "CASA", arquivo: "backlogs.xlsx", quando: `${hojeBrasilia()} 09:40:00`, segundos_atras: 720, ...extra });
const linhaBacklog = (a, extra) => linha(a.ctx._macHtmlSecoes([macro("alimentacao"), macro("pedidos"), macro("backlog", extra)]), "backlog");

test("sem nada a dizer, a linha de situacao nem existe", () => {
  const a = carregar();
  assert.ok(!linhaBacklog(a, {}).includes("mac-sit"));
});

test("problema contado pelo vigia aparece com o computador, ha quanto tempo e o motivo", () => {
  const a = carregar();
  const l = linhaBacklog(a, { problema: problema() });
  assert.ok(l.includes("mac-sit-erro"));
  assert.ok(l.includes("<b>Falhou</b> há 12 min · CASA — Login recusado ao enviar backlogs.xlsx"));
});

test("aviso (nao erro) usa 'Atencao' e o tom de aviso", () => {
  const a = carregar();
  const l = linhaBacklog(a, { problema: problema({ nivel: "aviso", texto: "Já estava gravado" }) });
  assert.ok(l.includes("mac-sit-aviso"));
  assert.ok(l.includes("<b>Atenção</b>"));
});

test("o problema tem 'Detalhes' que abre o historico DAQUELE macro", () => {
  const a = carregar();
  assert.ok(linhaBacklog(a, { problema: problema() }).includes("_macAbrirHistorico('backlog')"));
});

test("problema sem nome de computador nao deixa ' ·' sobrando", () => {
  const a = carregar();
  const l = linhaBacklog(a, { problema: problema({ maquina: null }) });
  assert.ok(l.includes("<b>Falhou</b> há 12 min — Login"));
});

test("texto do problema (vem de outro computador) nunca vira HTML", () => {
  const a = carregar();
  const l = linhaBacklog(a, { problema: problema({ texto: "<img src=x onerror=alert(1)>", maquina: "<script>" }) });
  assert.ok(!l.includes("<img") && !l.includes("<script>"));
  assert.ok(l.includes("&lt;img"));
});

test("pedido em andamento tem prioridade sobre o problema antigo (uma linha so)", () => {
  const a = carregar();
  a.m.vigia = UMA;
  const l = linhaBacklog(a, { problema: problema(), comando: cmd("aguardando", { qual: "backlog" }) });
  assert.strictEqual(l.split("mac-sit ").length - 1, 1);
  assert.ok(l.includes("aguardando o computador"));
  assert.ok(!l.includes("Falhou"));
});

test("'Iniciado' aparece so nos primeiros minutos; depois a tela volta ao normal", () => {
  const a = carregar();
  a.m.vigia = UMA;
  assert.ok(linhaBacklog(a, { comando: cmd("iniciado", { qual: "backlog", idade_s: 60 }) }).includes("Iniciado às"));
  assert.ok(!linhaBacklog(a, { comando: cmd("iniciado", { qual: "backlog", idade_s: 900 }) }).includes("mac-sit"));
});

test("pedido que deu erro continua visivel ate o proximo", () => {
  const a = carregar();
  a.m.vigia = UMA;
  const l = linhaBacklog(a, { comando: cmd("erro", { qual: "backlog", erro: "já está rodando", idade_s: 4000 }) });
  assert.ok(l.includes("Não rodou: já está rodando"));
});

test("depois que o pedido acaba bem, o problema antigo do vigia volta a aparecer", () => {
  const a = carregar();
  a.m.vigia = UMA;
  const l = linhaBacklog(a, { problema: problema(), comando: cmd("iniciado", { qual: "backlog", idade_s: 4000 }) });
  assert.ok(l.includes("<b>Falhou</b>"));
});

// ── problema geral (sem macro) ────────────────────────────────────────────
test("erro do vigia sem macro (inesperado) aparece uma vez, sob o titulo da secao", () => {
  const a = carregar();
  a.m.vigia = UMA;
  a.m.geral = problema({ macro: "geral", texto: "Erro inesperado ao processar x.csv: KeyError" });
  const html = a.ctx._macHtmlSecoes(TRES());
  assert.strictEqual(html.split("mac-geral").length - 1, 1);
  assert.ok(html.includes("Erro inesperado ao processar x.csv"));
  a.m.geral = null;
  assert.ok(!a.ctx._macHtmlSecoes(TRES()).includes("mac-geral"));
});

test("o problema geral so aparece na secao dos macros, nao na dos avisos", () => {
  const a = carregar();
  a.m.geral = problema({ macro: "geral", texto: "so aqui" });
  const html = a.ctx._macHtmlSecoes([AVISO]);
  assert.strictEqual(html.split("so aqui").length - 1, 1);
  assert.ok(html.indexOf("so aqui") > html.indexOf(">Macros<"));
});

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

// ── cabecalho da secao ────────────────────────────────────────────────────
test("o titulo da secao dos macros leva, na mesma linha, o seletor de computador e o Historico", () => {
  const a = carregar();
  a.m.vigia = UMA;
  const html = a.ctx._macHtmlSecoes(TRES());
  const cab = /<div class="mac-secao-cab">([\s\S]*?)<\/div><\/div>/.exec(html)[1];
  assert.ok(cab.includes(">Macros<") && cab.includes("Executa em") && cab.includes("_macAbrirHistorico()"));
});

test("a secao dos avisos segue com o titulo simples (sem historico)", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([AVISO]);
  assert.strictEqual(html.split("_macAbrirHistorico()").length - 1, 1, "so na secao dos macros");
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

// ── o Rodar no mesmo lugar em todas as linhas ─────────────────────────────
test("onde falta interruptor ou engrenagem fica um espaco do mesmo tamanho (o Rodar nao pula)", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([macro("alimentacao"), macro("pedidos"), macro("backlog", { configurado: false })]);
  const at = linha(html, "alimentacao");
  assert.ok(!at.includes("mac-slot"), "AT tem interruptor e engrenagem");
  const pedidos = linha(html, "pedidos");
  assert.ok(pedidos.includes("mac-slot-toggle") && pedidos.includes("mac-slot-icone"), "pedidos nao tem nenhum dos dois");
  const backlogSemAgenda = linha(html, "backlog");
  assert.ok(backlogSemAgenda.includes("mac-slot-toggle"), "sem agenda configurada, sem interruptor");
  assert.ok(!backlogSemAgenda.includes("mac-slot-icone"), "mas tem engrenagem");
});

test("em toda linha os tres controles existem, nessa ordem: interruptor, Rodar, engrenagem", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes(TRES());
  for (const q of ["alimentacao", "pedidos", "backlog"]) {
    const l = linha(html, q);
    const pos = [/gc-toggle |mac-slot-toggle/, /mac-rodar/, /mac-icone|mac-slot-icone/].map((r) => l.search(r));
    assert.ok(pos.every((p) => p >= 0), q);
    assert.deepStrictEqual([...pos].sort((x, y) => x - y), pos, q);
  }
});
