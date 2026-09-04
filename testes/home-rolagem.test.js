// Testes da rolagem da tela inicial (#tela-home).
//
// A home é a única tela que não é .tela-full: ela não tem um corpo rolável por
// dentro, então quem rola é o próprio #tela-home. Um `overflow: hidden` nessa
// regra já custou caro — no celular o entregador via os cartões cortados no meio
// e não conseguia chegar no último nem no aviso de Nota Fiscal, sem nenhuma
// barra de rolagem pra indicar que faltava conteúdo. Dava a impressão de site
// quebrado, e é o tipo de coisa que volta sozinha numa refatoração de CSS.
//
// Estes testes leem o CSS como texto, sem navegador: o que importa é a regra
// declarada, não o render.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

/** Corpo do primeiro bloco `seletor { ... }` encontrado, sem aninhamento. */
function bloco(seletor) {
    const i = css.indexOf(seletor + " {");
    assert.notStrictEqual(i, -1, `bloco "${seletor}" sumiu do style.css`);
    const abre = css.indexOf("{", i);
    const fecha = css.indexOf("}", abre);
    return css.slice(abre + 1, fecha);
}

test("#tela-home rola na vertical", () => {
    const regra = bloco("#tela-home");
    assert.match(regra, /overflow-y:\s*auto/,
        "#tela-home precisa de overflow-y: auto — é ele que rola, não há corpo interno");
});

test("#tela-home nao volta pro overflow: hidden", () => {
    const regra = bloco("#tela-home");
    assert.doesNotMatch(regra, /(^|[;{\s])overflow:\s*hidden/,
        "overflow: hidden aqui corta os cartões da home no celular sem deixar rolar");
});

test("#tela-home nao rola na horizontal", () => {
    const regra = bloco("#tela-home");
    assert.match(regra, /overflow-x:\s*hidden/,
        "sem overflow-x: hidden a home ganha rolagem lateral no celular");
});

test("as telas .tela-full seguem com corpo proprio, sem rolagem na casca", () => {
    // A home é a exceção. As demais telas continuam com overflow: hidden na
    // casca de propósito — quem rola nelas é .fech-body. Se isso mudar, o
    // cabeçalho fixo (period-row, quinzenas) sai rolando junto.
    const regra = bloco(".tela-full.active-view");
    assert.match(regra, /overflow:\s*hidden/,
        ".tela-full.active-view precisa prender a rolagem no corpo interno");
});
