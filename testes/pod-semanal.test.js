// Testes de POD Shopee > Semanal e do bloco na tela inicial (js/pod-semanal.js).
//
// O que se protege: o texto vem da planilha (nome com aspas não pode quebrar o HTML); a data
// chega pronta em Brasília e não passa por `new Date`; Bad Pod acima de zero em vermelho; a
// home só mostra a semana do próprio entregador; o index/core/router não perdem os ganchos.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const ler = f => fs.readFileSync(path.join(raiz, f), "utf8");
const fonteEnr = ler("js/entregador-na-rua.js");
const fonte = ler("js/pod-semanal.js");

const ponte = `
;globalThis.__pds = { _pdsQuando, _pdsPeriodo, _pdsClasse, _pdsRender, _pdsHome, _pdsAlternar, _pdsBuscar, _pdsLinhaHtml, _pdsDetalhe, _pdsSemanasFechadas, _pdsAnexoHtml,
    setDados: v => { _pdsDados = v; }, abrir: s => _pdsAbertas.add(s) };`;

function carregar() {
    const els = { "pds-conteudo": { innerHTML: "" }, "home-pod": { innerHTML: "" } };
    const ctx = vm.createContext({
        console, API: "http://api.teste", localStorage: { getItem: () => "tok" },
        document: { getElementById: id => els[id] || null, querySelector: () => null },
        fetch: () => Promise.reject(new Error("sem rede")),
    });
    ctx.globalThis = ctx;
    vm.runInContext(fonteEnr + "\n" + fonte + ponte, ctx);
    return { api: ctx.__pds, els };
}

const SEMANA = {
    semana_inicio: "2026-10-19", semana_fim: "2026-10-25", aba: "04 - POD por Driver - 27/10",
    cabecalho: ["Good Pod", "Bad Pod"],
    edicoes: ["2026-10-27 09:10", "2026-10-27 14:32"],
    linhas: [{ entregador: 'FULANO "TESTE"', station: "XPT_SC_Caçador", cidade: "Cidade A", polo: "Caçador", valores: ["80,00%", "20,00%"] }],
};

test("datas: texto puro, sem fuso", () => {
    const { api } = carregar();
    assert.strictEqual(api._pdsQuando("2026-10-27 14:32"), "27/10 às 14:32");
    assert.strictEqual(api._pdsPeriodo(SEMANA), "19/10 a 25/10");
});

test("meta do Good Pod: 80% ou mais verde, 79,99% pra baixo vermelho; o resto sem cor", () => {
    const { api } = carregar();
    assert.strictEqual(api._pdsClasse("Good Pod", "80,00%"), "bom");
    assert.strictEqual(api._pdsClasse("Good Pod", "100,00%"), "bom");
    assert.strictEqual(api._pdsClasse("Good Pod", "79,99%"), "ruim");
    assert.strictEqual(api._pdsClasse("Good Pod", "0,00%"), "ruim");
    assert.strictEqual(api._pdsClasse("Good Pod", ""), "");
    assert.strictEqual(api._pdsClasse("Bad Pod", "32,48%"), "");
    assert.strictEqual(api._pdsClasse("Qualidade", "10,00%"), "");
});

test("tela do entregador: semana aberta, nome escapado, edicoes listadas", () => {
    const { api, els } = carregar();
    api.setDados({ todos: false, semanas: [SEMANA] });
    api.abrir(SEMANA.semana_inicio);
    api._pdsRender();
    const h = els["pds-conteudo"].innerHTML;
    assert.ok(h.includes("Atualizado em 27/10 às 14:32"));
    assert.ok(h.includes("27/10 às 09:10 · 27/10 às 14:32"));
    assert.ok(h.includes('class="pds-princ-val ruim">80,00%') === false);
    assert.ok(h.includes('class="pds-princ-val bom">80,00%'));
    assert.ok(h.includes("meta 80%"));
    // o título é o usuário (escapado); a cidade vai embaixo
    assert.ok(h.includes('pds-linha-nome">FULANO &quot;TESTE&quot;'));
    assert.ok(h.includes('pds-linha-cidade">Cidade A'));
    assert.ok(!h.includes("pds-filtros"));
});

test("mais de um login na semana: cada cartao mostra o nome, escapado", () => {
    const { api, els } = carregar();
    const outro = { ...SEMANA.linhas[0], entregador: "AJUDANTE <TESTE>", cidade: "Cidade B" };
    api.setDados({ todos: false, semanas: [{ ...SEMANA, linhas: [...SEMANA.linhas, outro] }] });
    api.abrir(SEMANA.semana_inicio);
    api._pdsRender();
    const h = els["pds-conteudo"].innerHTML;
    assert.ok(h.includes("FULANO &quot;TESTE&quot;"));
    assert.ok(!h.includes('FULANO "TESTE"'));
    assert.ok(h.includes("AJUDANTE &lt;TESTE&gt;"));
});

test("cartoes em ordem alfabetica e busca sem acento so nos cartoes da tela", () => {
    const { api, els } = carregar();
    const base = SEMANA.linhas[0];
    const linhas = [
        { ...base, entregador: "ZECA TESTE", cidade: "Cidade Z" },
        { ...base, entregador: "ÁLVARO TESTE", cidade: "Cidade Á" },
        { ...base, entregador: "maria teste", cidade: "Cidade M" },
    ];
    api.setDados({ todos: false, semanas: [{ ...SEMANA, linhas }] });
    api.abrir(SEMANA.semana_inicio);
    api._pdsRender();
    let h = els["pds-conteudo"].innerHTML;
    assert.ok(h.includes("pds-busca"));
    const pos = n => h.indexOf(n);
    assert.ok(pos("ÁLVARO") < pos("maria") && pos("maria") < pos("ZECA"));
    assert.ok(!h.includes("pds-linha-polo"));

    api._pdsBuscar("alvaro");
    h = els["pds-conteudo"].innerHTML;
    assert.ok(h.includes("ÁLVARO TESTE") && !h.includes("ZECA TESTE") && !h.includes("maria teste"));
    api._pdsBuscar("ninguem");
    assert.ok(els["pds-conteudo"].innerHTML.includes("Ninguém com esse nome"));

    // a home ignora a busca da tela
    api._pdsHome();
    assert.ok(els["home-pod"].innerHTML.includes("ZECA TESTE"));
});

test("cartao fechado so com Good/Bad Pod; tocar abre as outras notas", () => {
    const { api } = carregar();
    const l = { entregador: "FULANO TESTE", cidade: "Cidade A", valores: ["90,00%", "5,00%", "99,00%"] };
    const h = api._pdsLinhaHtml(["Good Pod", "Bad Pod", "Qualidade"], l);
    assert.ok(h.includes('class="pds-linha pds-abre"'));
    assert.ok(h.includes('aria-expanded="false"'));
    assert.ok(h.includes("pds-outros"));
    // so as principais: nada pra abrir
    assert.ok(!api._pdsLinhaHtml(["Good Pod", "Bad Pod"], l).includes("pds-abre"));

    const cls = new Set();
    const attrs = {};
    const el = { classList: { toggle: c => (cls.has(c) ? (cls.delete(c), false) : (cls.add(c), true)) },
        setAttribute: (k, v) => { attrs[k] = v; } };
    api._pdsDetalhe(el);
    assert.strictEqual(attrs["aria-expanded"], "true");
    api._pdsDetalhe(el);
    assert.strictEqual(attrs["aria-expanded"], "false");
});

test("anexar: so semanas ja fechadas, de segunda a domingo; so o dev ve", () => {
    const { api, els } = carregar();
    // quinta 29/10/2026 às 12h em Brasília
    const ws = api._pdsSemanasFechadas(new Date("2026-10-29T15:00:00Z"));
    assert.strictEqual(`${ws[0].semana_inicio} ${ws[0].semana_fim}`, "2026-10-19 2026-10-25");
    assert.ok(ws.some(w => w.semana_inicio === "2026-10-05" && w.semana_fim === "2026-10-11"));
    assert.ok(ws.some(w => w.semana_inicio === "2026-10-12"));
    assert.ok(api._pdsAnexoHtml().includes("pds-anexo-arquivo"));

    api.setDados({ todos: false, semanas: [SEMANA] });
    api._pdsRender();
    assert.ok(!els["pds-conteudo"].innerHTML.includes("Anexar semana"));
    api.setDados({ todos: true, semanas: [{ ...SEMANA, origem: "anexo" }] });
    api._pdsRender();
    assert.ok(els["pds-conteudo"].innerHTML.includes("Anexar semana"));
    assert.ok(els["pds-conteudo"].innerHTML.includes("Anexada em"));
});

test("home: semana mais recente do entregador; dev nao ganha bloco", () => {
    const { api, els } = carregar();
    api.setDados({ todos: false, semanas: [SEMANA] });
    api._pdsHome();
    assert.ok(els["home-pod"].innerHTML.includes("Semana 19/10 a 25/10 · atualizado em 27/10 às 14:32"));
    api.setDados({ todos: true, semanas: [SEMANA] });
    api._pdsHome();
    assert.strictEqual(els["home-pod"].innerHTML, "");
});

test("ganchos no index, core e router", () => {
    const index = ler("index.html");
    assert.ok(index.includes('id="home-pod"'));
    assert.ok(index.includes('id="tela-pod-semanal"'));
    assert.ok(index.includes('id="menu-pod-shopee"'));
    assert.ok(/js\/pod-semanal\.js\?v=\d{8}[a-z]/.test(index));
    const core = ler("js/core.js");
    assert.ok(core.includes('show("menu-pod-shopee")'));
    assert.ok(core.includes("_pdsCarregarHome()"));
    assert.ok(ler("js/router.js").includes('"PODShopee/Semanal"'));
});
