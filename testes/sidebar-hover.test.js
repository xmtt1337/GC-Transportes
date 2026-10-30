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

function carregar(larga) {
    const classes = new Set(["expanded"]);
    const ouvintes = {};
    const sidebar = {
        classList: { add: c => classes.add(c), remove: c => classes.delete(c) },
        addEventListener: (ev, fn) => { ouvintes[ev] = fn; },
    };
    const media = { matches: larga };
    const timers = [];
    let aoCarregar;
    const ctx = {
        window: { matchMedia: () => media },
        document: {
            addEventListener: (_, fn) => { aoCarregar = fn; },
            getElementById: () => sidebar,
        },
        setTimeout: fn => { timers.push(fn); return timers.length; },
        clearTimeout: id => { timers[id - 1] = () => {}; },
    };
    vm.runInNewContext(codigo, ctx);
    aoCarregar();
    const rodarTimers = () => timers.splice(0).forEach(fn => fn());
    return { classes, ouvintes, media, rodarTimers };
}

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
