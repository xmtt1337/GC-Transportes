// Testes do Relatório do período (Shopee › Conferências dos entregadores,
// js/shopee-conf-entregadores-relatorio.js).
//
// O que se protege:
//   - pede o período certo ao servidor e preenche o filtro de entregador;
//   - o resumo soma deveria bipar / bipou / não bipou / outra rota / a mais;
//   - o filtro de entregador restringe resumo, planilha e impressão;
//   - a impressão tem uma página por entregador por dia, inclusive de quem não abriu;
//   - a planilha sai com as abas Resumo, Geral, Outra rota e A mais.
//
// Dados inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = f => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
const fonte = ler("shopee-conf-entregadores.js") + "\n" + ler("shopee-conf-entregadores-relatorio.js") +
    "\n;globalThis.__rel = { _sceRelGerar, _sceRelRender, _sceRelPlanilha, _sceRelImprimir, _sceRelQuinzenaAnterior };";

const RESPOSTA = {
    de: "2026-11-01", ate: "2026-11-15", xpt: "XPT_TESTE", polo_label: "Base TESTE",
    rotas: [
        { dia: "2026-11-03", nome: "Entregador Um TESTE", clusters: ["CL A"], situacao: "encerrada", total: 3, bipados: 2, nao_bipados: 1,
          pacotes: [{ codigo: "BRT1", cluster: "CL A", bipado: false, hora: "" }, { codigo: "BRT2", cluster: "CL A", bipado: true, hora: "08:00:00" }, { codigo: "BRT3", cluster: "CL A", bipado: true, hora: "08:01:00" }],
          fora_rota: [{ codigo: "BRT9", cluster: "CL B", hora: "08:02:00" }], a_mais: [{ codigo: "BRT8", resultado: "sem_pedido", hora: "08:03:00" }] },
        { dia: "2026-11-03", nome: "Entregador Dois TESTE", clusters: ["CL B"], situacao: "nao_comecou", total: 2, bipados: 0, nao_bipados: 2,
          pacotes: [{ codigo: "BRT9", cluster: "CL B", bipado: false, hora: "" }, { codigo: "BRT10", cluster: "CL B", bipado: false, hora: "" }],
          fora_rota: [], a_mais: [] },
    ],
};

function el() { return { innerHTML: "", innerText: "", value: "", style: {}, classList: { toggle() {} } }; }

function carregar() {
    const els = {};
    const chamadas = [];
    const escrito = [];
    const abas = [];
    const ctx = vm.createContext({
        console, setTimeout: () => 0, Date,
        API: "https://api.teste", token: "tk",
        document: { getElementById: id => (els[id] = els[id] || el()), querySelectorAll: () => [] },
        gcConfirm() {}, gcAlert() {}, skMostrar() {}, skFim() {}, mostrarTela() {}, gcCalMontar() {},
        fetch: (url) => { chamadas.push(url); return Promise.resolve({ json: () => Promise.resolve(RESPOSTA) }); },
        XLSX: {
            utils: {
                book_new: () => ({}), aoa_to_sheet: d => ({ d }), encode_range: () => "A1",
                book_append_sheet: (wb, ws, nome) => abas.push({ nome, linhas: ws.d.length }),
            },
            writeFile() {},
        },
    });
    ctx.globalThis = ctx;
    ctx.window = { open: () => ({ document: { write: h => escrito.push(h), close() {} } }) };
    vm.runInContext(fonte, ctx);
    return { api: ctx.__rel, els, chamadas, escrito, abas };
}
const espera = () => new Promise(r => setImmediate(r));

test("gera o período pedido, soma o resumo e preenche o filtro", async () => {
    const t = carregar();
    t.els["sce-rel-de"] = Object.assign(el(), { value: "2026-11-01" });
    t.els["sce-rel-ate"] = Object.assign(el(), { value: "2026-11-15" });
    t.api._sceRelGerar();
    await espera(); await espera();
    assert.strictEqual(t.chamadas[0], "https://api.teste/shopee/conferencia/entregadores/relatorio?de=2026-11-01&ate=2026-11-15");
    const resumo = t.els["sce-rel-resumo"].innerHTML;
    assert.match(resumo, /Deveria bipar<\/div><div class="paj-value">5</);
    assert.match(resumo, />2<\/div><\/div>\s*<div class="paj-card"><div class="paj-label">Não bipou<\/div><div class="paj-value"[^>]*>3</);
    assert.match(t.els["sce-rel-ent"].innerHTML, /Entregador Dois TESTE/);
    assert.match(t.els["sce-rel-tbody"].innerHTML, /\(1 sem abrir\)/);
});

test("impressão: uma página por entregador por dia, inclusive quem não abriu", async () => {
    const t = carregar();
    t.els["sce-rel-de"] = Object.assign(el(), { value: "2026-11-01" });
    t.els["sce-rel-ate"] = Object.assign(el(), { value: "2026-11-15" });
    t.api._sceRelGerar();
    await espera(); await espera();
    t.api._sceRelImprimir();
    const html = t.escrito.join("");
    assert.strictEqual((html.match(/<section class="pag">/g) || []).length, 2);
    assert.match(html, /Não abriu a conferência/);
    assert.match(html, /Bipou de outra rota \(1\)/);
});

test("filtro de entregador restringe planilha e impressão", async () => {
    const t = carregar();
    t.els["sce-rel-de"] = Object.assign(el(), { value: "2026-11-01" });
    t.els["sce-rel-ate"] = Object.assign(el(), { value: "2026-11-15" });
    t.api._sceRelGerar();
    await espera(); await espera();
    t.els["sce-rel-ent"].value = "Entregador Um TESTE";
    t.api._sceRelPlanilha();
    assert.deepStrictEqual(t.abas, [
        { nome: "Resumo", linhas: 2 }, { nome: "Geral", linhas: 4 }, { nome: "Outra rota", linhas: 2 }, { nome: "A mais", linhas: 2 },
    ]);
    t.api._sceRelImprimir();
    assert.strictEqual((t.escrito.join("").match(/<section class="pag">/g) || []).length, 1);
});

test("quinzena anterior sugerida tem início e fim válidos", () => {
    const [de, ate] = carregar().api._sceRelQuinzenaAnterior();
    assert.match(de, /^\d{4}-\d{2}-(01|16)$/);
    assert.match(ate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(de < ate);
});
