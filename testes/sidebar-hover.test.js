// Barra lateral no computador: sempre aberta, encostada na tela, sem abrir pelo mouse.
// O botão do rodapé minimiza (escolha salva). Minimizada, clicar num ícone abre até o
// mouse sair. No celular o botão só abre e fecha.
//
// O mouse saindo confere a largura a cada evento, não só ao carregar: página aberta larga
// e depois estreitada ficava com o hover ligado, o mouse saía da barra aberta pelo menu do
// celular, ela fechava e o fundo escuro continuava (só fecharSidebar tira os dois juntos).

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
    const classes = new Set();
    const corpo = new Set();
    const ouvintes = {};
    const botao = { title: "" };
    const sidebar = {
        classList: classList(classes),
        addEventListener: (ev, fn) => { ouvintes[ev] = fn; },
        querySelector: () => botao,
        style: {},
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

const MINIMIZADA = { gc_sidebar_minimizada: "1" };

test("no computador a barra já nasce aberta e o mouse saindo não recolhe", () => {
    const { classes, corpo, ouvintes, rodarTimers, botao } = carregar(true);
    assert.ok(corpo.has("sidebar-fixa") && classes.has("expanded"));
    assert.strictEqual(botao.title, "Minimizar a barra");
    ouvintes.mouseleave();
    rodarTimers();
    assert.ok(classes.has("expanded"));
});

test("passar o mouse não abre mais a barra", () => {
    const { ouvintes } = carregar(true, MINIMIZADA);
    assert.strictEqual(ouvintes.mouseenter, undefined);
});

test("o botão minimiza e abre de novo, e a escolha fica salva", () => {
    const { classes, corpo, ctx, guardado, botao } = carregar(true);
    ctx.toggleSidebar();
    assert.ok(!corpo.has("sidebar-fixa") && !classes.has("expanded"));
    assert.strictEqual(guardado.gc_sidebar_minimizada, "1");
    assert.strictEqual(botao.title, "Abrir a barra");
    ctx.toggleSidebar();
    assert.ok(corpo.has("sidebar-fixa") && classes.has("expanded"));
    assert.strictEqual(guardado.gc_sidebar_minimizada, "0");
});

test("minimizada continua minimizada ao recarregar a página", () => {
    const { classes, corpo } = carregar(true, MINIMIZADA);
    assert.ok(!corpo.has("sidebar-fixa") && !classes.has("expanded"));
});

test("aberta no computador, a tela anda pro lado sem animar a margem", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
    const ini = css.indexOf("@media screen and (min-width: 681px)");
    const bloco = css.slice(ini, css.indexOf("\n}\n", ini));
    assert.match(bloco, /body:has\(> \.sidebar\.expanded\) \.content \{ margin-left: 272px; \}/);
    assert.doesNotMatch(css.slice(css.indexOf("\n.content {"), css.indexOf("}", css.indexOf("\n.content {"))), /transition/);
});

test("no celular a barra nasce fechada e o botão só abre e fecha", () => {
    const { classes, corpo, ctx } = carregar(false);
    assert.ok(!corpo.has("sidebar-fixa") && !classes.has("expanded"));
    ctx.toggleSidebar();
    assert.ok(classes.has("expanded") && !corpo.has("sidebar-fixa"));
});

test("minimizada, aberta por um ícone, recolhe quando o mouse sai", () => {
    const { classes, ouvintes, rodarTimers } = carregar(true, MINIMIZADA);
    classes.add("expanded");
    ouvintes.mouseleave();
    rodarTimers();
    assert.ok(!classes.has("expanded"));
});

test("pagina aberta larga e depois estreitada nao fecha a barra pelo mouse", () => {
    const { classes, ouvintes, media, rodarTimers } = carregar(true, MINIMIZADA);
    classes.add("expanded");
    media.matches = false;
    ouvintes.mouseleave();
    rodarTimers();
    assert.ok(classes.has("expanded"), "fecharia a barra deixando o fundo escuro ativo");
});
