// Testes de Performance > Por dia, no app do entregador (js/entregador-performance.js).
//
// O que se protege: a tela é exclusividade (o menu nasce escondido e só o
// entregador liberado vê); o dia da semana sai do calendário puro, sem fuso; e
// os cinco pontos que ligam uma tela ao site (tela, título, rota, menu, script)
// continuam todos lá — faltando um, ela abre em branco ou o link direto morre.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
const fonteNaRua = ler("js", "entregador-na-rua.js");
const fontePerf = ler("js", "entregador-performance.js");
const indexHtml = ler("index.html");
const coreJs = ler("js", "core.js");
const navJs = ler("js", "nav.js");
const routerJs = ler("js", "router.js");

const ponte = `
;globalThis.__epf = {
    _epfDia, _epfContagem, _epfRender, _epfAlternarDia, _epfCarregar, abrirEntPerformance,
    setDados: v => { _epfDados = v; },
};`;

function carregar(fetchFalso) {
    const el = { innerHTML: "" };
    const telas = [];
    const contexto = vm.createContext({
        console, Date, isFinite, API: "http://api.teste",
        document: { getElementById: id => (id === "epf-conteudo" ? el : null) },
        localStorage: { getItem: () => "tok" },
        mostrarTela: id => telas.push(id),
        fetch: fetchFalso || (() => Promise.reject(new Error("sem rede"))),
    });
    contexto.globalThis = contexto;
    vm.runInContext(fonteNaRua, contexto, { filename: "entregador-na-rua.js" });
    vm.runInContext(fontePerf + ponte, contexto, { filename: "entregador-performance.js" });
    return { api: contexto.__epf, el, telas };
}

const quem = (nome, entregues, insucessos, na_rua, performance) =>
    ({ nome, total: entregues + insucessos + na_rua, entregues, insucessos, na_rua, aguardando: 0, performance });

const dia = (d, entregadores, performance) => {
    const soma = c => entregadores.reduce((s, e) => s + e[c], 0);
    return { dia: d, total: soma("total"), entregues: soma("entregues"), insucessos: soma("insucessos"),
             na_rua: soma("na_rua"), aguardando: 0, performance, entregadores };
};

const resposta = dias => ({
    hoje: "2026-10-05", de: "2026-09-06", periodo_dias: 30, dias,
    resumo: { dias: dias.length, total: 150, entregues: 135, na_rua: 5, insucessos: 10, aguardando: 0, performance: 90 },
});

const espera = () => new Promise(r => setTimeout(r, 0));

// ── o que liga a tela ao resto do site ───────────────────────────────────

test("a tela, o menu, o titulo, a rota e o script existem", () => {
    assert.ok(indexHtml.includes('id="tela-ent-performance"'));
    assert.ok(indexHtml.includes('id="epf-conteudo"'));
    assert.match(indexHtml, /<script src="js\/entregador-performance\.js\?v=\d{8}[a-z]"><\/script>/);
    assert.ok(indexHtml.includes('data-rota="Performance/PorDia" onclick="abrirEntPerformance(event)"'));
    assert.ok(navJs.includes('"tela-ent-performance"'));
    assert.ok(routerJs.includes('"Performance/PorDia":'));
    assert.ok(routerJs.includes('"tela-ent-performance":      "Performance/PorDia"'));
});

test("carrega depois de entregador-na-rua.js, de quem usa os helpers", () => {
    assert.ok(indexHtml.indexOf("js/entregador-na-rua.js") < indexHtml.indexOf("js/entregador-performance.js"));
});

test("o menu nasce escondido e so a liberacao mostra", () => {
    assert.match(indexHtml, /id="menu-ent-performance"[^>]*style="display:none"/);
    assert.match(indexHtml, /id="submenu-ent-performance"[^>]*style="display:none"/);
    assert.match(coreJs, /if \(data\.usuario\.pode_ver_na_rua\) \{\s*show\("menu-ent-performance"\);\s*show\("submenu-ent-performance"\);/);
    assert.strictEqual((coreJs.match(/menu-ent-performance/g) || []).length, 2);
});

// ── texto ────────────────────────────────────────────────────────────────

test("o dia sai com o dia da semana do calendario", () => {
    const { api } = carregar();
    assert.strictEqual(api._epfDia("2026-10-05"), "Seg, 05/10");
    assert.strictEqual(api._epfDia("2026-10-04"), "Dom, 04/10");
    assert.strictEqual(api._epfDia("2026-01-01"), "Qui, 01/01");
});

test("a contagem so cita o que aconteceu", () => {
    const { api } = carregar();
    assert.strictEqual(api._epfContagem({ entregues: 150, insucessos: 0, na_rua: 0, aguardando: 0 }), "150 entregues");
    assert.strictEqual(api._epfContagem({ entregues: 1, insucessos: 1, na_rua: 4, aguardando: 2 }),
        "1 entregue · 1 insucesso · 4 na rua · 2 não saíram");
});

// ── desenho ──────────────────────────────────────────────────────────────

test("mostra o resumo do periodo e um dia por linha, com a porcentagem", () => {
    const { api, el } = carregar();
    api.setDados(resposta([
        dia("2026-10-05", [quem("Ajudante Um", 45, 3, 2, 90)], 90),
        dia("2026-10-04", [quem("Ajudante Um", 30, 10, 0, 75)], 75),
    ]));
    api._epfRender();
    assert.ok(el.innerHTML.includes("Performance dos últimos 30 dias"));
    assert.ok(el.innerHTML.includes("135 entregues de 150 que saíram"));
    assert.ok(el.innerHTML.includes("2 dias com rota"));
    assert.ok(el.innerHTML.includes("Seg, 05/10"));
    assert.ok(el.innerHTML.includes(">hoje<"));
    assert.ok(el.innerHTML.includes("75,0%"));
    assert.ok(el.innerHTML.includes("30 entregues · 10 insucessos"));
});

test("dia com um entregador so nao abre; com mais de um, abre a quebra por entregador", () => {
    const { api, el } = carregar();
    api.setDados(resposta([
        dia("2026-10-05", [quem("Ajudante Um", 45, 3, 2, 90)], 90),
        dia("2026-10-04", [quem("Ajudante Um", 40, 0, 0, 100), quem(`Zé "Bala" <b>`, 10, 10, 0, 50)], 83.3),
    ]));
    api._epfRender();
    assert.strictEqual((el.innerHTML.match(/_epfAlternarDia/g) || []).length, 1);
    assert.ok(el.innerHTML.includes("2 entregadores"));
    assert.ok(!el.innerHTML.includes("Ajudante Um"));

    api._epfAlternarDia("2026-10-04");
    assert.ok(el.innerHTML.includes("Ajudante Um"));
    assert.ok(el.innerHTML.includes("50,0%"));
    assert.ok(el.innerHTML.includes("Zé &quot;Bala&quot; &lt;b&gt;"));
});

test("sem rota no periodo, diz isso em vez de ficar em branco", () => {
    const { api, el } = carregar();
    api.setDados(resposta([]));
    api._epfRender();
    assert.ok(el.innerHTML.includes("Nenhuma rota da Shopee no seu nome nos últimos 30 dias."));
});

// ── carga ────────────────────────────────────────────────────────────────

test("abrir mostra a tela e carrega do historico, sem mandar nome nem periodo", async () => {
    const pedidos = [];
    const { api, el, telas } = carregar((url, opt) => {
        pedidos.push({ url, opt });
        return Promise.resolve({ json: () => Promise.resolve(resposta([dia("2026-10-05", [quem("Ajudante Um", 45, 3, 2, 90)], 90)])) });
    });
    api.abrirEntPerformance();
    assert.ok(el.innerHTML.includes("Carregando"));
    await espera();
    assert.strictEqual(telas.join(), "tela-ent-performance");
    assert.strictEqual(pedidos[0].url, "http://api.teste/entregador/na-rua/historico");
    assert.strictEqual(pedidos[0].opt.headers.Authorization, "Bearer tok");
    assert.ok(el.innerHTML.includes("Seg, 05/10"));
});

test("falha mostra o motivo e o botao de tentar de novo", async () => {
    const { api, el } = carregar(() => Promise.resolve({ json: () => Promise.resolve({ error: "Acesso negado" }) }));
    api._epfCarregar();
    await espera();
    assert.ok(el.innerHTML.includes("Não deu pra carregar: Acesso negado"));
    assert.ok(el.innerHTML.includes("Tentar de novo"));
});
