// Abrir uma tela deixava o menu fechado: quem reabria a barra não via onde estava.
// Agora fica aberto o caminho até o link (Torre > Transportadoras > Loggi > Na Rua),
// e o que foi aberto só pra olhar volta pra esse caminho quando a barra recolhe.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");

// DOM mínimo: só o que sidebar.js e _marcarSubmenuAtivo usam.
function el(classe, pai, attrs = {}) {
    const classes = new Set(classe.split(" ").filter(Boolean));
    const e = {
        classes, filhos: [], parentElement: pai, dataset: attrs, offsetParent: {},
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            contains: c => classes.has(c),
        },
        closest(sel) {
            const opcoes = sel.split(",").map(s => s.trim().slice(1));
            for (let n = this; n; n = n.parentElement) if (opcoes.some(o => n.classes.has(o))) return n;
            return null;
        },
        get previousElementSibling() {
            if (!pai) return null;
            const i = pai.filhos.indexOf(this);
            return i > 0 ? pai.filhos[i - 1] : null;
        },
        get nextElementSibling() {
            return pai ? pai.filhos[pai.filhos.indexOf(this) + 1] || null : null;
        },
    };
    if (pai) pai.filhos.push(e);
    return e;
}

function montar() {
    const raiz = el("menu", null);
    const todos = [];
    const novo = (c, p, a) => { const e = el(c, p, a); todos.push(e); return e; };

    const op = novo("menu-item", raiz);
    const subOp = novo("submenu", raiz);
    const separacao = novo("", subOp, { rota: "Operacao/Separacao" });
    separacao.classes.add("link");
    const alimentacoes = novo("", subOp, { rota: "Operacao/Alimentacoes" });
    alimentacoes.classes.add("link");

    const torre = novo("menu-item", raiz);
    const subTorre = novo("submenu", raiz);
    const transp = novo("subgroup-header", subTorre);
    const grupoTransp = novo("sub-submenu", subTorre);
    const loggi = novo("subgroup-header-2", grupoTransp);
    const grupoLoggi = novo("sub-sub-submenu", grupoTransp);
    const naRua = novo("", grupoLoggi, { rota: "TorreControle/NaRua/Loggi" });
    naRua.classes.add("link");
    const imile = novo("subgroup-header-2", grupoTransp);
    const grupoImile = novo("sub-sub-submenu", grupoTransp);
    const ativosImile = novo("", grupoImile, { rota: "Ativos/Conversas" });
    ativosImile.classes.add("link");
    const anjun = novo("subgroup-header-2", grupoTransp);
    const grupoAnjun = novo("sub-sub-submenu", grupoTransp);
    const ativosAnjun = novo("", grupoAnjun, { rota: "Ativos/Conversas" });
    ativosAnjun.classes.add("link");

    // Seletores que o código usa, resolvidos sobre a lista.
    const tem = c => todos.filter(e => e.classes.has(c));
    const consultas = {
        ".submenu": () => tem("submenu"),
        ".sub-submenu": () => tem("sub-submenu"),
        ".sub-sub-submenu": () => tem("sub-sub-submenu"),
        ".subgroup-header, .subgroup-header-2": () => [...tem("subgroup-header"), ...tem("subgroup-header-2")],
        ".menu-item": () => tem("menu-item"),
        ".submenu a": () => tem("link"),
        ".submenu a, .subgroup-header, .subgroup-header-2": () => [...tem("link"), ...tem("subgroup-header"), ...tem("subgroup-header-2")],
        ".submenu a.active": () => tem("link").filter(e => e.classes.has("active")),
    };
    const qsa = sel => {
        const rota = sel.match(/^\.submenu a\[data-rota="(.+)"\]$/);
        if (rota) return tem("link").filter(e => e.dataset.rota === rota[1]);
        if (/^\.menu-item\[data-rota=/.test(sel)) return [];
        if (!consultas[sel]) throw new Error("seletor sem stub: " + sel);
        return consultas[sel]();
    };
    const ctx = {
        window: { matchMedia: () => ({ matches: true }) },
        document: {
            addEventListener: () => {},
            getElementById: () => el("", null),
            querySelectorAll: qsa,
            querySelector: sel => qsa(sel)[0] || null,
        },
        setTimeout: () => 0, clearTimeout: () => {},
    };
    vm.createContext(ctx);
    vm.runInContext(ler("js", "sidebar.js"), ctx);
    const router = ler("js", "router.js");
    const ini = router.indexOf("function _marcarSubmenuAtivo");
    const iniMapa = router.indexOf("const _ROTA_DO_MENU");
    vm.runInContext(router.slice(iniMapa, router.indexOf("};", iniMapa) + 2).replace("const ", "var "), ctx);
    vm.runInContext(router.slice(ini, router.indexOf("\n}\n", ini) + 3), ctx);
    return { ctx, op, subOp, separacao, alimentacoes, torre, subTorre, transp, grupoTransp, loggi, grupoLoggi, naRua,
             imile, grupoImile, ativosImile, anjun, grupoAnjun, ativosAnjun };
}

const aberto = e => e.classes.has("open");

test("clicar num link deixa aberto o caminho inteiro até ele", () => {
    const m = montar();
    m.ctx._abrirCaminhoAte(m.naRua);
    assert.ok(m.naRua.classes.has("active"));
    [m.grupoLoggi, m.loggi, m.grupoTransp, m.transp, m.subTorre, m.torre].forEach((e, i) => assert.ok(aberto(e), "nível " + i));
    assert.ok(m.torre.classes.has("active"), "menu da área marcado");
    assert.ok(!aberto(m.subOp) && !aberto(m.grupoImile), "o resto fecha");
});

test("todo título no caminho fica marcado, os de fora não", () => {
    const m = montar();
    m.ctx._abrirCaminhoAte(m.naRua);
    [m.torre, m.transp, m.loggi].forEach((e, i) => assert.ok(e.classes.has("active"), "nível " + i));
    m.ctx._abrirCaminhoAte(m.ativosAnjun);
    assert.ok(m.anjun.classes.has("active") && !m.loggi.classes.has("active"));
});

test("abrir outra área pra olhar não tira a marca da área atual", () => {
    const m = montar();
    m.ctx._abrirCaminhoAte(m.naRua);
    m.ctx.toggleMenu(m.op);
    assert.ok(m.torre.classes.has("active"), "Torre segue marcada");
    assert.ok(!m.op.classes.has("active") && m.op.classes.has("open"), "Operação só aberta");
});

test("trocar de tela troca o caminho aberto", () => {
    const m = montar();
    m.ctx._abrirCaminhoAte(m.naRua);
    m.ctx._abrirCaminhoAte(m.separacao);
    assert.ok(aberto(m.subOp) && m.op.classes.has("active"));
    assert.ok(!aberto(m.subTorre) && !aberto(m.grupoLoggi) && !m.naRua.classes.has("active"));
});

test("recolher a barra volta pro caminho da tela atual", () => {
    const m = montar();
    m.ctx._abrirCaminhoAte(m.naRua);
    // Olhou a Operação sem escolher nada.
    m.ctx.toggleMenu(m.op);
    assert.ok(aberto(m.subOp) && !aberto(m.subTorre));
    m.ctx.fecharSidebar();
    assert.ok(aberto(m.subTorre) && aberto(m.grupoLoggi) && !aberto(m.subOp));
});

test("rota repetida em várias transportadoras mantém a que foi clicada", () => {
    const m = montar();
    m.ctx._abrirCaminhoAte(m.ativosAnjun);
    m.ctx._marcarSubmenuAtivo("Ativos/Conversas");
    assert.ok(aberto(m.grupoAnjun) && m.ativosAnjun.classes.has("active"));
    assert.ok(!aberto(m.grupoImile));
});

test("Alimentações de qualquer transportadora acende o link único do menu", () => {
    // A rota guarda a transportadora (Operacao/AlimentarAnjun), o menu tem um link só.
    ["Operacao/AlimentarAnjun", "Operacao/AlimentarTotalExpress"].forEach(r => {
        const m = montar();
        m.ctx._marcarSubmenuAtivo(r);
        assert.ok(m.alimentacoes.classes.has("active") && aberto(m.subOp), r);
    });
});

test("rota aberta por endereço acha o link e abre o caminho", () => {
    const m = montar();
    m.ctx._marcarSubmenuAtivo("TorreControle/NaRua/Loggi");
    assert.ok(m.naRua.classes.has("active") && aberto(m.grupoLoggi) && aberto(m.subTorre));
});

test("área aberta e tela atual em faixa azul de canto reto, sem bolinhas nem caixa cinza", () => {
    const css = ler("style.css");
    assert.match(css, /\.sidebar\.expanded \.menu-item\.active \{[^}]*rgba\(58,134,255/);
    assert.match(css, /\.submenu a\.active \{[^}]*inset 2px 0 0 #3a86ff/);
    const regra = sel => css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
    ["\n.submenu a {", ".sidebar.expanded .menu-item {", "\n.subgroup-header-2 {"].forEach(s =>
        assert.doesNotMatch(regra(s), /border-radius/, s));
    assert.doesNotMatch(css, /\.submenu a::before/);
    assert.doesNotMatch(css, /\.sub-submenu\.open,\s*\.sub-sub-submenu\.open \{\s*background:/, "caixa cinza do grupo aberto saiu");
});

test("trocar de tela não fecha mais o menu", () => {
    const nav = ler("js", "nav.js");
    const corpo = nav.slice(nav.indexOf("function mostrarTela"), nav.indexOf("\n}\n", nav.indexOf("function mostrarTela")));
    assert.doesNotMatch(corpo, /\.submenu"\)\.forEach\(m => m\.classList\.remove\("open"\)\)/);
    assert.match(corpo, /_marcarSubmenuAtivo\(rotaFinal\)/);
});
