// Testes do custo de quadro das animacoes infinitas.
//
// Uma animacao infinita que mexe em propriedade NAO composta (background-position,
// box-shadow, width, top...) obriga o navegador a repintar o elemento a cada
// quadro, pra sempre. No desktop isso passa batido. No celular do entregador nao:
// o rasterizador nao acompanha e a tela sai desenhada pela metade — o "piscando".
//
// Foi exatamente o que aconteceu com o esqueleto de carregamento: skTabela(7)
// monta 40 elementos .sk, e o brilho andava por background-position sobre um
// gradiente de 1200px. Medido com a CPU 20x mais lenta: ~20fps, com quadros de
// ate 600ms. Trocado por transform: ~57fps, quase nenhum quadro longo.
//
// transform e opacity sao resolvidos pelo compositor, sem repintar. O resto nao.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
const semComentario = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Propriedades que forcam repaint/reflow a cada quadro. */
const CARAS = [
    "background-position", "background-size", "background-image", "background",
    "box-shadow", "width", "height", "top", "left", "right", "bottom",
    "margin", "padding", "filter", "border-width", "border-color", "color",
];

/**
 * Animacoes infinitas ja conhecidas que ainda mexem em propriedade cara, com o
 * motivo de terem ficado. Entrar aqui e decisao consciente, nao descuido.
 */
const TOLERADAS = {
    // Fantasma de arrastar do painel Videira: um unico elemento, so enquanto o
    // dedo esta arrastando, numa tela que entregador nao abre. Repintar uma
    // sombra sozinha nao chega perto de 40 elementos repintando gradiente.
    "pv-chip-pulse": "so o fantasma de arrastar do Videira, 1 elemento",
};

/** Corpo do bloco `@keyframes nome { ... }`, respeitando o aninhamento. */
function keyframes(nome) {
    // Busca literal de proposito: montar regex com o nome dentro exigiria
    // escapar o "-" e ja custou um teste verde por engano.
    const marca = "@keyframes " + nome;
    const de = semComentario.indexOf(marca);
    if (de === -1) return null;
    const abre = semComentario.indexOf("{", de);
    if (abre === -1) return null;
    let nivel = 0, i = abre;
    for (; i < semComentario.length; i++) {
        if (semComentario[i] === "{") nivel++;
        else if (semComentario[i] === "}" && --nivel === 0) break;
    }
    return semComentario.slice(abre + 1, i);
}

/** Nomes de animacao declaradas com `infinite`. */
function infinitas() {
    return [...new Set(
        [...semComentario.matchAll(/animation:\s*([A-Za-z0-9_-]+)[^;]*infinite/g)].map(m => m[1])
    )];
}

test("nenhuma animacao infinita nova repinta a cada quadro", () => {
    const culpadas = [];
    for (const nome of infinitas()) {
        if (nome in TOLERADAS) continue;
        const corpo = keyframes(nome);
        assert.ok(corpo !== null, `@keyframes ${nome} nao encontrado`);
        // So o que esta a esquerda de ":" conta como propriedade animada.
        const props = [...corpo.matchAll(/(?:^|[{;\s])([a-z-]+)\s*:/g)].map(m => m[1]);
        const caras = [...new Set(props.filter(p => CARAS.includes(p)))];
        if (caras.length) culpadas.push(`${nome} anima ${caras.join(", ")}`);
    }
    assert.deepStrictEqual(culpadas, [],
        "use transform/opacity: sao os unicos que o compositor resolve sem repintar");
});

test("a logo do carregando quica so com transform e opacity", () => {
    // O skeleton cinza saiu (04/11/2026); no lugar, a logo XM quicando. Ela aparece
    // em quase toda tela que busca dado, inclusive no celular do entregador.
    const corpo = keyframes("xm-quica");
    assert.ok(corpo, "@keyframes xm-quica sumiu");
    const props = [...new Set([...corpo.matchAll(/(?:^|[{;\s])([a-z-]+)\s*:/g)].map(m => m[1]))];
    assert.deepStrictEqual(props.filter(p => p !== "transform" && p !== "opacity"), []);
});

test("a imagem do carregando vem do CSS, que funciona em qualquer URL funda", () => {
    // Um <img src="img/..."> criado depois que a URL vira /Operacao/Shopee/... iria
    // buscar /Operacao/Shopee/img/...; o url() do CSS conta a partir do style.css.
    assert.match(semComentario, /\.xm-carregando::before\s*\{[^}]*url\("img\/xm-carregando\.png"\)/);
    assert.ok(fs.existsSync(path.join(__dirname, "..", "img", "xm-carregando.png")));
});

test("skMostrar e os nomes antigos do esqueleto mostram a logo", () => {
    const vm = require("node:vm");
    const core = fs.readFileSync(path.join(__dirname, "..", "js", "core.js"), "utf8");
    const ini = core.indexOf("function skLogo");
    const ctx = {};
    vm.runInNewContext(core.slice(ini, core.indexOf("function skFim", ini)), ctx);
    ["skTabela", "skCards", "skDash", "skHTML"].forEach(f =>
        assert.match(ctx[f](7), /class="xm-carregando"/, f));
    assert.match(ctx.skLinhas(3), /class="xm-carregando xm-carregando-p"/);
    const classes = new Set();
    const el = { classList: { add: c => classes.add(c) }, style: {}, innerHTML: "" };
    ctx.skMostrar(el, "dash");
    assert.ok(classes.has("sk-mode"));
    assert.match(el.innerHTML, /xm-carregando/);
    assert.doesNotMatch(el.innerHTML, /class="sk/);
});
