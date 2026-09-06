// Teste do drawer do menu no celular pintando pela metade.
//
// Um entregador mandou print: o menu abria, mas o fundo escuro parava logo
// depois de "Baixas" — "Devoluções", "Ocorrências" e o rodapé "Atualizar"
// sumiam, e no lugar aparecia a própria home, sem nenhum escurecimento. Esses
// itens existem no DOM o tempo todo (Devoluções é show() incondicional pra
// quem é entregador, em core.js) — não é questão de permissão. O que sumiu foi
// a PINTURA daquela metade do menu, não os elementos.
//
// .sidebar no celular é position: fixed + transition: transform. É um layer
// grande (260px de largura, a tela inteira de altura) sendo promovido bem na
// hora que a transição começa. Num aparelho fraco, o rasterizador não sempre
// termina a tempo do primeiro quadro — e o pedaço não pintado ainda mostra o
// quadro de ANTES do menu abrir, isto é, a home sem escurecer. É a mesma
// família do bug do shimmer do esqueleto (repintura demais, celular fraco).
//
// will-change avisa o navegador ANTES da animação começar, pra promover e
// rasterizar a camada com antecedência em vez de correr contra o primeiro
// quadro. Não dá pra medir isso do jeito que medi o shimmer (não há CPU
// throttling que force um layer a nascer incompleto de propósito) — mas é a
// causa raiz mais provável e a correção recomendada pela documentação do
// próprio Chrome pra exatamente este sintoma num drawer fixed+transform.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

/** Corpo do bloco `seletor { ... }` de dentro do @media (max-width: 680px), sem aninhamento. */
function bloco680(seletor) {
    const marca = "@media (max-width: 680px) {";
    const marcaSel = seletor + " {";
    let de = 0;
    for (;;) {
        const i = css.indexOf(marca, de);
        assert.notStrictEqual(i, -1, `nenhum @media (max-width: 680px) contém ${seletor}`);
        let nivel = 0, fimMedia = i + marca.length - 1;
        for (; fimMedia < css.length; fimMedia++) {
            if (css[fimMedia] === "{") nivel++;
            else if (css[fimMedia] === "}" && --nivel === 0) break;
        }
        const corpoMedia = css.slice(i + marca.length, fimMedia);
        const j = corpoMedia.indexOf(marcaSel);
        if (j !== -1) {
            const abre = j + marcaSel.length - 1;
            const fecha = corpoMedia.indexOf("}", abre);
            return corpoMedia.slice(abre + 1, fecha);
        }
        de = fimMedia;
    }
}

test("o drawer avisa o navegador que vai animar, antes de animar", () => {
    const regra = bloco680(".sidebar");
    assert.match(regra, /will-change:\s*transform/,
        "sem will-change, o layer so e criado quando a transicao ja comecou — " +
        "e no celular fraco a parte de baixo pode sobrar sem pintar no primeiro quadro");
});

test("o fundo escuro por tras do menu tambem avisa", () => {
    const regra = bloco680(".sidebar-backdrop");
    assert.match(regra, /will-change:\s*opacity/,
        "o escurecimento tem que promover a camada com a mesma antecedencia que o drawer");
});

test("Devolucoes continua incondicional pro entregador — nao e bug de permissao", () => {
    // Ancora a premissa do teste acima: se isto um dia virar condicional, o
    // sumico de "Devolucoes" deixa de ser so pintura e passa a ser esperado,
    // e o teste de will-change perde a razao de escrito do jeito que esta.
    const nucleo = fs.readFileSync(path.join(__dirname, "..", "js", "core.js"), "utf8");
    const bloco = nucleo.slice(nucleo.indexOf('role === "entregador"'), nucleo.indexOf('role === "motorista"'));
    assert.match(bloco, /show\("menu-devolucoes"\);/);
    assert.doesNotMatch(bloco.slice(0, bloco.indexOf('show("menu-devolucoes")')), /if\s*\(/,
        "Devolucoes tem que ficar fora de qualquer if — do contrario o teste acima vira falso positivo");
});
