// Testes da câmera dentro da página (js/xm-camera.js).
//
// O <input type="file" capture> abre o app de câmera do celular, e o Android pode
// matar a aba do Chrome enquanto ele está na frente. Ao confirmar a foto a página
// recarrega, a rota devolve a mesma tela vazia e a foto some — o entregador via a
// devolução "voltar pra tela sem anexar". As telas de foto passaram a usar a
// câmera dentro da página; estes testes travam isso pra não voltar.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

/** Corpo da função `nome` (até a próxima declaração no topo do arquivo). */
function corpo(js, nome) {
    const ini = js.indexOf(`function ${nome}(`);
    assert.notStrictEqual(ini, -1, `${nome} sumiu`);
    const resto = js.slice(ini + 1);
    const fim = resto.search(/\n(?:function|const|let|\/\/)/);
    return fim === -1 ? resto : resto.slice(0, fim);
}

const TELAS = [
    ["js/devolucoes.js",     "_devTirarFoto"],
    ["js/baixas.js",         "_bteTirarFoto"],
    ["js/viagens.js",        "_vfTirarFoto"],
    ["js/transferencias.js", "_trfTirarFoto"],
];

for (const [arquivo, fn] of TELAS) {
    test(`${fn} usa a camera da pagina, nao o app de camera`, () => {
        const f = corpo(ler(arquivo), fn);
        assert.match(f, /xmCameraFoto\(/, "tem que abrir a câmera dentro da página");
        assert.doesNotMatch(f, /\.click\(\)/,
            "clicar direto no input abre o app de câmera — é o que perdia a foto");
    });
}

test("sem getUserMedia a reserva abre antes de qualquer espera", () => {
    // Depois de um await o navegador já não considera o toque e recusa abrir o
    // seletor de arquivo — a reserva precisa sair no mesmo tique do clique.
    const js = ler("js/xm-camera.js");
    const guarda  = js.indexOf("!navigator.mediaDevices");
    const chamada = js.indexOf("navigator.mediaDevices.getUserMedia(");
    assert.ok(guarda !== -1 && guarda < chamada, "a guarda precisa vir antes da chamada");
    assert.match(js.slice(guarda, chamada), /_xmCamUsarReserva\(\)/);
});

test("fechar a camera desliga o video", () => {
    // Câmera esquecida ligada gasta bateria e deixa a luz acesa no celular.
    assert.match(corpo(ler("js/xm-camera.js"), "_xmCamFechar"), /getTracks\(\)\.forEach\(t => t\.stop\(\)\)/);
});

test("xm-camera.js carrega antes das telas que usam", () => {
    const html = ler("index.html");
    const cam = html.indexOf('src="js/xm-camera.js');
    assert.notStrictEqual(cam, -1, "index.html não carrega o xm-camera.js");
    for (const [arquivo] of TELAS) {
        const pos = html.indexOf(`src="${arquivo}`);
        assert.ok(pos > cam, `${arquivo} carrega antes do xm-camera.js`);
    }
});
