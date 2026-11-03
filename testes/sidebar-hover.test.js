// Hover da sidebar so vale com mouse em tela larga, conferido a cada evento.
//
// A checagem rodava uma vez, ao carregar. Pagina aberta larga e depois estreitada
// ficava com o hover ligado: o mouse saia da barra aberta pelo menu do celular, ela
// fechava e o fundo escuro continuava na tela (so fecharSidebar tira os dois juntos).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const codigo = fs.readFileSync(path.join(__dirname, "..", "js", "sidebar.js"), "utf8");

function classList(set) {
    return {
        add: (...c) => c.forEach(x => set.add(x)),
        remove: (...c) => c.forEach(x => set.delete(x)),
        contains: c => set.has(c),
        toggle: (c, f) => { const v = f === undefined ? !set.has(c) : f; v ? set.add(c) : set.delete(c); return v; },
    };
}

function carregar(larga, salvo = {}) {
    const classes = new Set(["expanded"]);
    const corpo = new Set();
    const ouvintes = {};
    const botao = { title: "" };
    const sidebar = {
        classList: classList(classes),
        addEventListener: (ev, fn) => { ouvintes[ev] = fn; },
        querySelector: () => botao,
    };
    const media = { matches: larga };
    const timers = [];
    const guardado = { ...salvo };
    let aoCarregar;
    const ctx = {
        window: { matchMedia: () => media },
        localStorage: { getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = v; } },
        document: {
            addEventListener: (_, fn) => { aoCarregar = fn; },
            getElementById: () => sidebar,
            querySelector: () => null,
            querySelectorAll: () => [],
            body: { classList: classList(corpo) },
        },
        setTimeout: fn => { timers.push(fn); return timers.length; },
        clearTimeout: id => { timers[id - 1] = () => {}; },
    };
    vm.runInNewContext(codigo, ctx);
    aoCarregar();
    const rodarTimers = () => timers.splice(0).forEach(fn => fn());
    return { classes, corpo, ouvintes, media, rodarTimers, ctx, guardado, botao };
}

test("no computador o botão fixa a barra: mouse saindo não recolhe e a escolha fica salva", () => {
    const { classes, corpo, ouvintes, rodarTimers, ctx, guardado, botao } = carregar(true);
    ctx.toggleSidebar();
    assert.ok(corpo.has("sidebar-fixa") && classes.has("expanded"));
    assert.strictEqual(guardado.gc_sidebar_fixa, "1");
    assert.strictEqual(botao.title, "Soltar a barra");
    ouvintes.mouseleave();
    rodarTimers();
    assert.ok(classes.has("expanded"), "fixa não recolhe no hover");
    ctx.toggleSidebar();
    assert.ok(!corpo.has("sidebar-fixa") && !classes.has("expanded"));
    assert.strictEqual(guardado.gc_sidebar_fixa, "0");
});

test("barra fixa volta fixa ao recarregar a página", () => {
    const { classes, corpo } = carregar(true, { gc_sidebar_fixa: "1" });
    assert.ok(corpo.has("sidebar-fixa") && classes.has("expanded"));
});

test("no celular o botão só abre e fecha, nunca fixa", () => {
    const { corpo, ctx } = carregar(false, { gc_sidebar_fixa: "1" });
    assert.ok(!corpo.has("sidebar-fixa"), "salvo do computador não vale no celular");
    ctx.toggleSidebar();
    assert.ok(!corpo.has("sidebar-fixa"));
});

test("em tela larga com mouse, sair da barra recolhe", () => {
    const { classes, ouvintes, rodarTimers } = carregar(true);
    ouvintes.mouseleave();
    rodarTimers();
    assert.ok(!classes.has("expanded"));
});

test("pagina aberta larga e depois estreitada nao fecha a barra pelo hover", () => {
    const { classes, ouvintes, media, rodarTimers } = carregar(true);
    media.matches = false;
    ouvintes.mouseleave();
    rodarTimers();
    assert.ok(classes.has("expanded"), "fecharia a barra deixando o fundo escuro ativo");
});

test("pagina aberta estreita e depois alargada passa a ter hover", () => {
    const { classes, ouvintes, media, rodarTimers } = carregar(false);
    media.matches = true;
    ouvintes.mouseleave();
    rodarTimers();
    assert.ok(!classes.has("expanded"));
});

test("estreitar com o recolhimento pendente nao fecha a barra", () => {
    const { classes, ouvintes, media, rodarTimers } = carregar(true);
    ouvintes.mouseleave();
    media.matches = false;
    ouvintes.mouseenter();
    rodarTimers();
    assert.ok(classes.has("expanded"));
});
