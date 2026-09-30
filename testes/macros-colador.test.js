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

test("recebidos_hoje aparece na linha do Recebimento quando vem do servidor", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecaoColador([colador("recebimento", { recebidos_hoje: 42 })]);
  assert.ok(html.includes("42 recebido"));
});

test("sem recebidos_hoje (servidor antigo, ou item que nao e o Recebimento), nada aparece", () => {
  const a = carregar();
  const semCampo = a.ctx._macHtmlSecaoColador([colador("at_cluster")]);
  assert.ok(!semCampo.includes("recebido(s) hoje"));
  const nulo = a.ctx._macHtmlSecaoColador([colador("recebimento", { recebidos_hoje: null })]);
  assert.ok(!nulo.includes("recebido(s) hoje"));
});

// ── quem acessa (admin também, não só dev) ──────────────────────────────────
// _macRedesenhar é quem decide isso (só ela olha window._gcUser.role) — chamada direto, com o
// DOM de mentira já populado, pra não depender do fetch inteiro de _macCarregarLista.
// _macHtmlSecoes sempre desenha o catálogo fixo (_MAC_SECOES) — "Avisos de rota incompleta" e
// "Shopee XPT_CFC" são texto ESTÁTICO dele, então nem precisa de uma _macLista real pra testar
// se a seção aparece ou não.
test("_macRedesenhar: dev ve avisos/SPX E o Colador", () => {
  const a = carregar();
  a.ctx.window._gcUser = { role: "dev" };
  a.m.lista = [];
  a.m.coladores = DOIS();
  a.ctx._macRedesenhar();
  const html = a.el("mac-lista").innerHTML;
  assert.ok(html.includes("Avisos de rota incompleta"), "avisos aparecem");
  assert.ok(html.includes("Colador — Recebimento"), "o Colador aparece");
});

test("_macRedesenhar: admin ve SÓ o Colador, nao os avisos/SPX", () => {
  const a = carregar();
  a.ctx.window._gcUser = { role: "admin" };
  a.m.lista = [];
  a.m.coladores = DOIS();
  a.ctx._macRedesenhar();
  const html = a.el("mac-lista").innerHTML;
  assert.ok(!html.includes("Avisos de rota incompleta"), "avisos NAO aparecem pra admin");
  assert.ok(html.includes("Colador — Recebimento"), "o Colador continua aparecendo");
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

test("Rodar fica apagado com pedido 'aguardando' ou 'entregue'; outros estados liberam de novo", () => {
  const a = carregar();
  const desabilitado = (estado) => {
    const html = a.ctx._macHtmlSecaoColador([colador("recebimento", { comandos: estado ? [cmd(estado)] : [] })]);
    return /class="mac-rodar"[^>]*\bdisabled\b/.test(linha(html, "recebimento"));
  };
  assert.strictEqual(desabilitado("aguardando"), true);
  assert.strictEqual(desabilitado("entregue"), true);
  for (const e of ["iniciado", "erro", "cancelado", "expirado", "sem_confirmacao", null]) {
    assert.strictEqual(desabilitado(e), false, String(e));
  }
});

// Alvo diferente do que já está aguardando/entregue não conflita - é o que deixa pedir pra uma
// SEGUNDA máquina enquanto a primeira ainda não foi buscada.
test("Rodar continua liberado pra uma máquina DIFERENTE da que já está aguardando", () => {
  const a = carregar();
  a.ctx._macColadorMudarAlvo("recebimento", "VIDEIRA");
  const html = a.ctx._macHtmlSecaoColador([colador("recebimento", { comandos: [cmd("aguardando", { alvo: "CACADOR" })] })]);
  assert.ok(!/class="mac-rodar"[^>]*\bdisabled\b/.test(linha(html, "recebimento")));
});

test("Rodar fica apagado pra MESMA máquina que já está aguardando", () => {
  const a = carregar();
  a.ctx._macColadorMudarAlvo("recebimento", "CACADOR");
  const html = a.ctx._macHtmlSecaoColador([colador("recebimento", { comandos: [cmd("aguardando", { alvo: "CACADOR" })] })]);
  assert.ok(/class="mac-rodar"[^>]*\bdisabled\b/.test(linha(html, "recebimento")));
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

test("sem comandos, a linha de situação nem aparece", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macSituacaoColadorHtml("recebimento", []), "");
  assert.strictEqual(a.ctx._macSituacaoColadorHtml("recebimento", null), "");
});

test("iniciado aparece com o botão 'parar'; com parar já pedido, some o botão", () => {
  const a = carregar();
  const semParar = a.ctx._macSituacaoColadorHtml("recebimento", [cmd("iniciado")]);
  assert.ok(semParar.includes("_macPararColador('recebimento', 'c1'"));
  const jaPedido = a.ctx._macSituacaoColadorHtml("recebimento", [cmd("iniciado", { parar_pedido: true })]);
  assert.ok(!jaPedido.includes("_macPararColador"));
});

test("aguardando/entregue aparecem com o botão 'cancelar'", () => {
  const a = carregar();
  for (const estado of ["aguardando", "entregue"]) {
    const html = a.ctx._macSituacaoColadorHtml("recebimento", [cmd(estado)]);
    assert.ok(html.includes("_macCancelarColador('recebimento', 'c1'"), estado);
  }
});

test("erro/cancelado/expirado nao tem botao nenhum", () => {
  const a = carregar();
  for (const estado of ["erro", "cancelado", "expirado", "sem_confirmacao"]) {
    const html = a.ctx._macSituacaoColadorHtml("recebimento", [cmd(estado)]);
    assert.ok(!html.includes("_macCancelarColador") && !html.includes("_macPararColador"), estado);
  }
});

test("duas máquinas rodando o mesmo colador aparecem em DUAS linhas", () => {
  const a = carregar();
  const html = a.ctx._macSituacaoColadorHtml("recebimento", [
    cmd("iniciado", { id: "c1", alvo: "CACADOR" }),
    cmd("aguardando", { id: "c2", alvo: "VIDEIRA" }),
  ]);
  assert.match(html, /por Dev em CACADOR/);
  assert.match(html, /Pedido enviado em VIDEIRA/);
});

test("erro do comando (texto de outro computador) nunca vira HTML", () => {
  const a = carregar();
  const html = a.ctx._macSituacaoColadorHtml("recebimento", [cmd("erro", { erro: "<img src=x onerror=1>" })]);
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
  assert.strictEqual(a.m.coladores[0].comandos[0].estado, "aguardando");
  assert.deepStrictEqual(a.alertas, []);
});

test("Rodar sem ninguém conectado avisa (mas o pedido continua valendo)", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { corpo: { ok: true, comando: { id: 1, estado: "aguardando" }, algum_conectado: false } } } });
  a.m.coladores = DOIS();
  a.ctx._macRodarColador("recebimento", {});
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.alertas.length, 1);
  assert.match(a.alertas[0], /nenhum computador está com o Chrome\/XM Vigia conectado/);
  assert.strictEqual(a.m.coladores[0].comandos[0].estado, "aguardando", "o pedido nao e descartado so por avisar");
});

test("Rodar pra duas máquinas diferentes guarda os DOIS comandos, sem um apagar o outro", async () => {
  let pedidos = 0;
  const a = carregar({ rotas: { [ROTA_RODAR]: () => {
    pedidos++;
    return { corpo: { ok: true, comando: { id: "c" + pedidos, estado: "aguardando", alvo: pedidos === 1 ? "CACADOR" : "VIDEIRA" }, algum_conectado: true } };
  } } });
  a.m.coladores = DOIS();
  a.ctx._macColadorMudarAlvo("recebimento", "CACADOR");
  a.ctx._macRodarColador("recebimento", {});
  await a.esperar(); await a.esperar();
  a.ctx._macColadorMudarAlvo("recebimento", "VIDEIRA");
  a.ctx._macRodarColador("recebimento", {});
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.m.coladores[0].comandos.map((c) => c.alvo).sort(), ["CACADOR", "VIDEIRA"]);
});

// ── alvo por clique (não persistente — 30/09/2026) ──────────────────────────
test("Rodar sem escolher computador manda maquina null", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { corpo: { ok: true, comando: { id: 1, estado: "aguardando" }, algum_conectado: true } } } });
  a.m.coladores = DOIS();
  a.ctx._macRodarColador("recebimento", {});
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.chamadas[0].corpo, { maquina: null });
});

test("Rodar manda o computador escolhido no seletor daquele colador", async () => {
  const a = carregar({ rotas: { [ROTA_RODAR]: { corpo: { ok: true, comando: { id: 1, estado: "aguardando" }, algum_conectado: true } } } });
  a.m.coladores = DOIS();
  a.ctx._macColadorMudarAlvo("recebimento", "PC-CACADOR");
  a.ctx._macRodarColador("recebimento", {});
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.chamadas[0].corpo, { maquina: "PC-CACADOR" });
});

test("escolher o alvo de um colador não afeta o outro", async () => {
  const a = carregar({ rotas: {
    [ROTA_RODAR]: { corpo: { ok: true, comando: { id: 1, estado: "aguardando" }, algum_conectado: true } },
    "POST /admin/macros/colador/at_cluster/rodar": { corpo: { ok: true, comando: { id: 2, estado: "aguardando" }, algum_conectado: true } },
  } });
  a.m.coladores = DOIS();
  a.ctx._macColadorMudarAlvo("recebimento", "PC-CACADOR");
  a.ctx._macRodarColador("at_cluster", {});
  await a.esperar(); await a.esperar();
  assert.deepStrictEqual(a.chamadas[0].corpo, { maquina: null });
});

test("o seletor lista os computadores que o vigia ja viu, com o escolhido marcado", () => {
  const a = carregar();
  a.ctx._macColadorMudarAlvo("recebimento", "PC-VIDEIRA");
  const item = colador("recebimento", {
    computadores: [{ nome: "PC-CACADOR", online: true }, { nome: "PC-VIDEIRA", online: false }],
  });
  const html = a.ctx._macHtmlAlvoColador(item);
  assert.ok(html.includes('<option value="PC-CACADOR"'));
  assert.ok(html.includes('<option value="PC-VIDEIRA" selected'));
  assert.ok(html.includes("PC-VIDEIRA — desconectado"));
});

test("sem nada escolhido, 'Qualquer computador' vem marcado", () => {
  const a = carregar();
  const html = a.ctx._macHtmlAlvoColador(colador("recebimento", { computadores: [] }));
  assert.match(html, /<option value=""\s+selected>Qualquer computador/);
});

test("o alvo do comando aparece na situação 'aguardando'", () => {
  const a = carregar();
  const html = a.ctx._macSituacaoColadorHtml("recebimento", [cmd("aguardando", { alvo: "PC-CACADOR" })]);
  assert.match(html, /em PC-CACADOR/);
});

test("sem alvo no comando, a situação não fala em computador nenhum", () => {
  const a = carregar();
  const html = a.ctx._macSituacaoColadorHtml("recebimento", [cmd("aguardando", { alvo: null })]);
  assert.ok(!html.includes(" em "));
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

test("parar marca parar_pedido no comando certo, sem mudar o estado", async () => {
  const a = carregar({ rotas: { "POST /admin/macros/colador/comandos/c1/parar": { corpo: { ok: true } } } });
  a.m.coladores = [colador("recebimento", { comandos: [cmd("iniciado", { alvo: "CACADOR" })] })];
  a.ctx._macPararColador("recebimento", "c1", {});
  await a.esperar(); await a.esperar();
  assert.strictEqual(a.m.coladores[0].comandos[0].estado, "iniciado");
  assert.strictEqual(a.m.coladores[0].comandos[0].parar_pedido, true);
});

test("parar um que nao esta rodando (409) avisa e devolve o botao", async () => {
  const a = carregar({ rotas: { "POST /admin/macros/colador/comandos/c1/parar": { status: 409, corpo: { error: "Não está rodando (aguardando)." } } } });
  a.m.coladores = [colador("recebimento", { comandos: [cmd("aguardando")] })];
  const botao = { disabled: false };
  a.ctx._macPararColador("recebimento", "c1", botao);
  await a.esperar(); await a.esperar();
  assert.strictEqual(botao.disabled, false);
  assert.deepStrictEqual(a.alertas, ["Não está rodando (aguardando)."]);
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

test("acompanhar continua enquanto o estado for 'entregue' (nao so 'aguardando')", async () => {
  const a = carregar({ rotas: { "GET /admin/macros/colador": { corpo: { coladores: [colador("recebimento", { comandos: [cmd("entregue")] })] } } } });
  a.m.coladores = [colador("recebimento", { comandos: [cmd("entregue")] })];
  a.el("tela-macros").classList.add("active-view");
  a.ctx._macAcompanharColador();
  assert.strictEqual(a.timers.length, 1);
  await a.timers.shift()(); await a.esperar(); await a.esperar();
  assert.strictEqual(a.chamadas.length, 1, "chegou a perguntar de novo ao servidor");
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
