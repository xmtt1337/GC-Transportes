// Camadas de tela inteira que ficam no DOM fechadas nao podem pesar na GPU.
//
// O index tem ~29 .usr-modal-overlay, todos position: fixed de tela inteira,
// que ficavam fechados so com opacity 0 -- e com backdrop-filter: blur ligado.
// O Chrome do Android compoe cada um mesmo invisivel; na densidade de celular
// (~2.8x) isso estoura a memoria de GPU e a tela inteira passa a ser pintada aos
// pedacos (o "glitch" que so dava no Chrome do celular; Firefox e "modo
// computador", que pinta com bem menos pixels, nao bugavam).
//
// Regra: fechado = visibility: hidden e sem blur; o blur so no estado aberto.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

// Corpo da primeira regra cujo seletor e exatamente `seletor` (com a indentacao
// que tiver, dentro ou fora de @media a partir de `desde`).
function regra(seletor, desde = 0) {
    const esc = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(^|\\n)\\s*" + esc + "\\s*\\{([^}]*)\\}", "g");
    re.lastIndex = desde;
    const m = re.exec(css);
    assert.ok(m, `regra ${seletor} nao encontrada`);
    return m[2];
}

const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test(".usr-modal-overlay fechado nao tem blur e fica visibility: hidden", () => {
    const corpo = semComentario(regra(".usr-modal-overlay"));
    assert.doesNotMatch(corpo, /backdrop-filter/, "blur no overlay fechado pesa na GPU mesmo invisivel");
    assert.match(corpo, /visibility:\s*hidden/);
});

test(".usr-modal-overlay.open tem o blur e fica visivel", () => {
    const corpo = regra(".usr-modal-overlay.open");
    assert.match(corpo, /backdrop-filter:\s*blur/);
    assert.match(corpo, /visibility:\s*visible/);
});

test("o fade de fechar continua: visibility so some depois da opacidade", () => {
    const corpo = semComentario(regra(".usr-modal-overlay"));
    assert.match(corpo, /transition:[^;]*opacity[^;]*visibility 0s linear 0\.22s/);
});

test("nenhuma outra regra poe backdrop-filter em .usr-modal-overlay fechado", () => {
    const limpo = semComentario(css);
    const re = /([^{}]*\.usr-modal-overlay[^{}]*)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(limpo))) {
        const sel = m[1].trim();
        if (/\.open\b/.test(sel) || !/backdrop-filter/.test(m[2])) continue;
        assert.fail(`"${sel}" poe blur no overlay sem ser o estado .open`);
    }
});

test("sidebar-backdrop do celular fica visibility: hidden quando fechado", () => {
    const inicioMobile = css.lastIndexOf("\n", css.indexOf(".sidebar-backdrop {", css.indexOf("body { height: 100dvh; }")));
    assert.ok(inicioMobile > 0);
    const corpo = semComentario(regra(".sidebar-backdrop", inicioMobile));
    assert.match(corpo, /visibility:\s*hidden/);
    assert.match(semComentario(regra(".sidebar-backdrop.active", inicioMobile)), /visibility:\s*visible/);
});
