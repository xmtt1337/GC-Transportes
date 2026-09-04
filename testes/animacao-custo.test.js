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

test("o brilho do esqueleto anda por transform", () => {
    const corpo = keyframes("sk-shimmer");
    assert.ok(corpo, "@keyframes sk-shimmer sumiu");
    assert.match(corpo, /transform:\s*translateX/,
        "o brilho precisa andar por transform");
    assert.doesNotMatch(corpo, /background-position/,
        "background-position aqui repinta 40 gradientes por quadro no celular");
});

test("o .sk recorta o brilho em vez de pintar gradiente no proprio fundo", () => {
    // O gradiente vive num ::after que desliza; sem overflow: hidden no pai ele
    // vazaria por cima do que estiver ao lado.
    const m = /(?:^|\n)\.sk\s*\{([^}]*)\}/.exec(semComentario);
    assert.ok(m, "regra .sk sumiu do style.css");
    assert.match(m[1], /overflow:\s*hidden/, ".sk precisa recortar o brilho");
    assert.match(m[1], /position:\s*relative/, ".sk precisa ancorar o ::after");
});
