// Testes de js/macros-execucao.js — a tela "Em execução" dos Macros.
//
// O que se protege:
//   - os "há X" andando sozinhos NÃO redesenham a tela (redesenhar a cada 4s fechava/rolava o
//     log que a pessoa está lendo): a assinatura ignora os tempos e muda com o que importa;
//   - admin só enxerga o Colador (o servidor já filtra; a tela não oferece o resto no filtro);
//   - texto que vem das máquinas nunca vira HTML;
//   - o computador com vigia mas sem relatório aparece pedindo pra atualizar a extensão.
//
// Script carregado num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "macros-execucao.js"), "utf8");

const ACESSOR = `
;globalThis.__m = {
  assinatura: (d) => _mexAssinatura(d),
  duracao: (s) => _mexDuracao(s),
  quando: (q) => _mexQuando(q),
  visiveis: () => _mexMacrosVisiveis(),
  cartao: (a) => _mexCartaoHtml(a),
  set dados(v) { _mexDados = v; _mexRecebidoEm = Date.now(); },
  computadoresHtml: () => _mexComputadoresHtml(),
  filtrosHtml: (r) => _mexFiltrosHtml(r),
  ativos: (abas) => _mexAtivos(abas),
  secaoAtivos: (l) => _mexSecaoAtivosHtml(l),
  proximoHorario: (r, ms) => _mexProximoHorario(r, ms),
  falta: (s) => _mexFalta(s),
  set avisos(v) { _mexAvisos = v; },
};`;

function carregar(role = "dev") {
  const ctx = vm.createContext({
    console, window: { _gcUser: { role } },
    document: { getElementById: () => null, querySelectorAll: () => [] },
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros-execucao.js" });
  return ctx.__m;
}

const ABA = (extra = {}) => Object.assign({
  aba: "7", maquina: "PC1", macro: "pedidos", estado: "rodando", passo: "2/5", xpt: "XPT_CFC",
  rodando_ha_s: 30, linhas: [{ em: 1, tipo: "passo", texto: "2/5" }],
}, extra);

test("assinatura ignora os tempos que andam sozinhos", () => {
  const m = carregar();
  const a = { abas: [ABA({ rodando_ha_s: 30 })], maquinas: [{ nome: "PC1", online: true, visto_ha_s: 3 }], alertas: [] };
  const b = { abas: [ABA({ rodando_ha_s: 34 })], maquinas: [{ nome: "PC1", online: true, visto_ha_s: 7 }], alertas: [] };
  assert.strictEqual(m.assinatura(a), m.assinatura(b));
});

test("assinatura muda com passo novo, linha nova ou maquina caindo", () => {
  const m = carregar();
  const base = { abas: [ABA()], maquinas: [{ nome: "PC1", online: true }], alertas: [] };
  const passo = { ...base, abas: [ABA({ passo: "3/5" })] };
  const linha = { ...base, abas: [ABA({ linhas: [{ em: 1, tipo: "passo", texto: "2/5" }, { em: 2, tipo: "nota", texto: "x" }] })] };
  const caiu = { ...base, maquinas: [{ nome: "PC1", online: false }] };
  for (const outro of [passo, linha, caiu]) assert.notStrictEqual(m.assinatura(base), m.assinatura(outro));
});

test("duracao e data no jeito que se le", () => {
  const m = carregar();
  assert.strictEqual(m.duracao(42), "42s");
  assert.strictEqual(m.duracao(97), "1min 37s");
  assert.strictEqual(m.duracao(3725), "1h 02min");
  assert.strictEqual(m.quando("2026-10-19 15:02:08.284"), "19/10 · 15:02");
});

test("admin so ve o Colador no filtro; dev ve tudo", () => {
  assert.deepStrictEqual([...carregar("admin").visiveis()], ["recebimento", "at_cluster"]);
  assert.strictEqual(carregar("dev").visiveis().length, 5);
  assert.ok(!carregar("admin").filtrosHtml([]).includes("Backlog"));
});

test("texto vindo da maquina nunca vira HTML", () => {
  const m = carregar();
  const html = m.cartao(ABA({ passo: "<img src=x onerror=alert(1)>", maquina: "<b>PC</b>",
    linhas: [{ em: 1, tipo: "nota", texto: "<script>x</script>" }] }));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<b>PC</b>"));
});

test("computador com vigia mas sem relatorio pede pra atualizar a extensao", () => {
  const m = carregar();
  m.dados = { abas: [], maquinas: [], alertas: [], ouvindo: [{ nome: "LEANDROXM", online: true, visto_ha_s: 10 }] };
  assert.match(m.computadoresHtml(), /LEANDROXM[\s\S]*atualize pra 3\.36/);
});

test("rodando sem XPT aparece como XPT desconhecido", () => {
  const m = carregar();
  assert.match(m.cartao(ABA({ xpt: null })), /XPT desconhecido/);
});

// ── ativos: o que esta executando + o que espera a proxima rodada ──
test("AT agendada aparece como ativa esperando, com a contagem e a ultima rodada", () => {
  const m = carregar();
  m.dados = { abas: [], maquinas: [], alertas: [], ativos: [
    { macro: "alimentacao", maquina: "PC1", online: true, xpt: "XPT_CFC", rodando: false, modo: "intervalo", minutos: 30,
      proxima_em: Date.now() + 720000, proxima_em_s: 720, ultimo: { estado: "ok", passo: "baixado", terminou_ha_s: 1080 } },
  ] };
  const lista = m.ativos([]);
  const html = m.secaoAtivos(lista);
  assert.match(html, /Ativos agora · 1/);
  assert.match(html, /Ativo, aguardando · PC1 · a cada 30 min/);
  assert.match(html, /Próxima rodada em <b data-mex-falta="720">12min 00s<\/b>/);
  assert.match(html, /Última: <b>Concluído<\/b>/);
});

test("o que esta executando vem antes, no cartao com o log", () => {
  const m = carregar();
  const aba = { aba: "4", maquina: "PC1", macro: "backlog", estado: "rodando", passo: "baixando", xpt: "XPT_CFC", rodando_ha_s: 10, linhas: [] };
  m.dados = { abas: [aba], maquinas: [], alertas: [], ativos: [
    { macro: "alimentacao", maquina: "PC1", online: true, rodando: false, proxima_em_s: 60 },
    { macro: "backlog", maquina: "PC1", online: true, rodando: true, aba: "4" },
  ] };
  const lista = m.ativos([aba]);
  assert.strictEqual(lista[0].macro, "backlog");
  assert.match(m.secaoAtivos(lista), /Log completo/);
});

test("extensao antiga (sem ativos) ainda mostra o que esta rodando", () => {
  const m = carregar();
  const aba = { aba: "1", maquina: "PC1", macro: "recebimento", estado: "rodando", xpt: "XPT_VIA", linhas: [] };
  m.dados = { abas: [aba], maquinas: [], alertas: [] };
  assert.deepStrictEqual([...m.ativos([aba]).map((a) => a.macro)], ["recebimento"]);
});

test("aviso de rota ligado entra nos ativos com a proxima pelo horario das rodadas", () => {
  const m = carregar();
  m.dados = { abas: [], maquinas: [], alertas: [], ativos: [] };
  m.avisos = [{ chave: "avisos_entregador", nome: "Shopee XPT_CFC", ativo: true, resumo: "19:05 Abaixo de 90% · 22:05 Mais de 1" },
              { chave: "outro", nome: "Desligado", ativo: false, resumo: "08:00 x" }];
  const lista = m.ativos([]);
  assert.strictEqual(lista.length, 1);
  assert.match(m.secaoAtivos(lista), /Aviso de rota · Shopee XPT_CFC/);
});

test("proximo horario das rodadas: o seguinte hoje, ou o primeiro de amanha", () => {
  const m = carregar();
  // 18:00 em Brasilia = 21:00 UTC
  const as18 = Date.UTC(2026, 9, 19, 21, 0, 0);
  assert.strictEqual(m.proximoHorario("19:05 x · 22:05 y", as18), 65 * 60);
  const as23 = Date.UTC(2026, 9, 20, 2, 0, 0);
  assert.strictEqual(m.proximoHorario("19:05 x · 22:05 y", as23), (20 * 60 + 5) * 60);
  assert.strictEqual(m.proximoHorario("sem rodada", as18), null);
});

test("passou da hora: diz que deve comecar a qualquer momento, nao numero negativo", () => {
  const m = carregar();
  assert.match(m.falta(-30), /qualquer momento/);
  assert.strictEqual(m.falta(90), "1min 30s");
});
