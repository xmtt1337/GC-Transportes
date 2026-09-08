// Testes da defesa contra o Modo Escuro Automatico do Chrome no Android.
//
// O bug que quebrava o layout so no Chrome (e nao no Firefox) era o auto-dark:
// o Chrome aplica um FILTRO por cima de paginas que nao se declaram escuras. Um
// filter num ancestral vira bloco de contencao pra position: fixed -- e a
// sidebar do celular, que e fixed, deixava de cobrir a tela e aparecia cortada.
// getComputedStyle ainda dizia "fixed", por isso a sonda nao pegava; mas
// renderizava quebrado. Firefox nao tem auto-dark, entao nunca bugou la.
//
// A defesa e declarar que o site ja e escuro. A meta no <head> e a peca
// principal (vale mesmo se o CSS falhar, porque esta no HTML, nao no CSS); o
// color-scheme no :root reforca e acerta os controles nativos.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const ler = (r) => fs.readFileSync(path.join(raiz, r), "utf8");

const PAGINAS = ["index.html", "login.html", "redefinir-senha.html", "404.html"];

for (const pg of PAGINAS) {
    test(`${pg} declara color-scheme dark no <head>`, () => {
        const html = ler(pg);
        assert.match(html, /<meta\s+name="color-scheme"\s+content="[^"]*dark[^"]*">/i,
            `${pg} precisa da meta color-scheme dark pra desligar o auto-dark do Chrome`);
    });
}

test("a meta vem cedo, antes do CSS (o auto-dark decide no inicio do parse)", () => {
    const html = ler("index.html");
    const meta = html.indexOf('name="color-scheme"');
    const css = html.indexOf('rel="stylesheet"');
    assert.ok(meta !== -1 && meta < css,
        "a meta color-scheme tem que vir antes do <link> do CSS");
});

test("o :root declara color-scheme: dark", () => {
    const css = ler("style.css");
    const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
    assert.match(root, /color-scheme:\s*dark/,
        "reforco no :root pros controles nativos (campos, selects, scrollbar)");
});
