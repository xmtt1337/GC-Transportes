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

/**
 * A regra `body { ... }` de dentro do @media do celular.
 *
 * Tem varios blocos `@media (max-width: 680px)` no style.css, entao nao dá pra
 * pegar o primeiro. E o seletor tem que ser `body` sozinho: procurar só por
 * "body {" casaria com ".fech-body {" e o teste passaria olhando a regra errada.
 */
function regraDoBody() {
    const marca = "@media (max-width: 680px) {";
    const soBody = /(?:^|\n)\s*body\s*\{([^}]*)\}/;
    let de = 0;
    for (;;) {
        const i = css.indexOf(marca, de);
        assert.notStrictEqual(i, -1, "nenhum @media (max-width: 680px) declara o body");
        let nivel = 0, j = i + marca.length - 1;
        for (; j < css.length; j++) {
            if (css[j] === "{") nivel++;
            else if (css[j] === "}" && --nivel === 0) break;
        }
        const achou = soBody.exec(css.slice(i + marca.length, j));
        if (achou) return achou[1];
        de = j;
    }
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

// ── Altura da casca no celular ──────────────────────────────────────────────
//
// Estes sao os testes do "tela tremendo". A casca inteira (body > .content >
// .main > tela) e medida a partir da altura do body. Se essa altura for viva —
// dvh — ela muda sozinha quando a barra de endereco do Chrome no Android
// desliza pra fora, e o app inteiro se redimensiona no meio da rolagem.

test("body no celular usa svh, nunca dvh", () => {
    const decl = regraDoBody();
    assert.match(decl, /height:\s*100svh/,
        "a altura da casca precisa ser 100svh — fixa, com a barra do navegador contada");
    assert.doesNotMatch(decl, /height:\s*100dvh/,
        "100dvh redimensiona o app a cada centimetro de barra do navegador: a tela treme");
});

test("body mantem fallback pra quem nao conhece svh", () => {
    assert.match(regraDoBody(), /height:\s*100vh;\s*height:\s*100svh/,
        "o 100vh antes do 100svh e o fallback; sem ele navegador antigo fica sem altura");
});

test("as areas rolaveis nao encadeiam a rolagem no documento", () => {
    // O encadeamento e o gatilho: ao chegar no fim da lista, o arrasto passa pro
    // documento, o navegador mexe na barra de endereco e o laco comeca.
    for (const sel of ["#tela-home", ".fech-body"]) {
        assert.match(bloco(sel), /overscroll-behavior:\s*contain/,
            `${sel} precisa de overscroll-behavior: contain`);
    }
});
