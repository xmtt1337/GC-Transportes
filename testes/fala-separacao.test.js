/**
 * Testes da fala da separação: rota + entregador a cada bipe (js/nav.js e js/bipagens.js).
 *
 * Por que isto tem teste: quem separa ouve em vez de olhar. Número da rota errado
 * (ex. "VID-05" falado "cinco" ou "VID 15" sem número) manda o pacote pra pilha
 * errada; a voz tem que ser a Francisca do servidor (a do navegador pode ser a robótica)
 * e só cair na do navegador se o servidor falhar; em rajada, só o último pacote fala;
 * e não tem mais bipe de sucesso na frente da fala.
 *
 * Navegador e servidor falsos, nomes inventados.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
const esperar = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };

function carregar(opcoes) {
    const o = opcoes || {};
    const tocou = [];      // falas do servidor tocadas (texto do buffer)
    const paradas = [];
    const navegador = [];  // falas pela voz do navegador (reserva)
    const pedidos = [];    // URLs pedidas ao servidor
    const pendentes = [];  // respostas seguradas pra simular demora
    class Ctx {
        constructor() { this.currentTime = 0; this.destination = {}; }
        resume() { return Promise.resolve(); }
        createOscillator() { return { connect() {}, frequency: { setValueAtTime() {} }, start() { tocou.push("bipe"); }, stop() {} }; }
        createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
        createBufferSource() {
            return { connect() {}, start() { tocou.push(this.buffer.texto); }, stop() { paradas.push(this.buffer.texto); } };
        }
        decodeAudioData(b, ok) { ok({ texto: Buffer.from(b).toString() }); }
    }
    const responder = (url) => {
        const texto = decodeURIComponent(url.split("texto=")[1]);
        if (o.servidorFalha) return { ok: false, status: 502 };
        return { ok: true, arrayBuffer: () => Promise.resolve(Uint8Array.from(Buffer.from(texto)).buffer) };
    };
    const sb = {
        console,
        document: {},
        API: "https://api.teste",
        token: "tk",
        window: {
            AudioContext: Ctx,
            speechSynthesis: { getVoices: () => o.vozes || [], cancel() {}, speak: (u) => navegador.push(u) },
        },
        SpeechSynthesisUtterance: function (t) { this.text = t; },
        fetch: (url, init) => {
            pedidos.push({ url, auth: init && init.headers && init.headers.Authorization });
            if (o.segurar) return new Promise(r => pendentes.push(() => r(responder(url))));
            return Promise.resolve(responder(url));
        },
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(ler("nav.js"), sb, { filename: "nav.js" });
    vm.runInContext(ler("bipagens.js"), sb, { filename: "bipagens.js" });
    return { sb, tocou, paradas, navegador, pedidos, pendentes };
}

const voz = (name, lang) => ({ name, lang: lang || "pt-BR" });

test("número da sigla: VID-15 vira 15", () => {
    const { sb } = carregar();
    assert.strictEqual(sb._gcNumeroDaSigla("VID-15"), "15");
    assert.strictEqual(sb._gcNumeroDaSigla("VID-05"), "5");
    assert.strictEqual(sb._gcNumeroDaSigla("CFC 7"), "7");
    assert.strictEqual(sb._gcNumeroDaSigla("VID"), "");
    assert.strictEqual(sb._gcNumeroDaSigla(null), "");
});

test("texto falado: número e os dois primeiros nomes, parando no traço", () => {
    const { sb } = carregar();
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-15", entregador: "Fulano Beltrano de Tal" }), "15, Fulano Beltrano");
    assert.strictEqual(sb._bipTextoFala({ sigla: null, entregador: "  Fulano   Teste" }), "Fulano Teste");
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-7", entregador: "Fulano - Cidadeteste" }), "7, Fulano");
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-7", entregador: "Fulano – Cidadeteste" }), "7, Fulano");
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-7", entregador: "Fulano" }), "7, Fulano");
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-3", entregador: null }), "3, sem entregador");
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-3", entregador: "   " }), "3, sem entregador");
});

test("fala vem do servidor (Francisca), com token, e toca sem bipe na frente", async () => {
    const { sb, tocou, pedidos, navegador } = carregar();
    sb._gcFalar("15, Fulano Teste");
    await esperar();
    assert.deepStrictEqual(tocou, ["15, Fulano Teste"]);
    assert.strictEqual(pedidos.length, 1);
    assert.match(pedidos[0].url, /^https:\/\/api\.teste\/fala\?texto=15%2C%20Fulano%20Teste$/);
    assert.strictEqual(pedidos[0].auth, "Bearer tk");
    assert.strictEqual(navegador.length, 0);
});

test("frase repetida sai do cache, sem ir ao servidor de novo", async () => {
    const { sb, tocou, pedidos } = carregar();
    sb._gcFalar("15, Fulano Teste");
    await esperar();
    sb._gcFalar("15, FULANO TESTE");
    await esperar();
    assert.strictEqual(pedidos.length, 1);
    assert.strictEqual(tocou.length, 2);
});

test("bipe novo corta a fala que está tocando", async () => {
    const { sb, tocou, paradas } = carregar();
    sb._gcFalar("1, Primeiro");
    await esperar();
    sb._gcFalar("2, Segundo");
    await esperar();
    assert.deepStrictEqual(tocou, ["1, Primeiro", "2, Segundo"]);
    assert.deepStrictEqual(paradas, ["1, Primeiro"]);
});

test("resposta atrasada de um bipe velho não toca por cima do novo", async () => {
    const { sb, tocou, pendentes } = carregar({ segurar: true });
    sb._gcFalar("1, Primeiro");
    sb._gcFalar("2, Segundo");
    pendentes[1](); await esperar();
    pendentes[0](); await esperar();
    assert.deepStrictEqual(tocou, ["2, Segundo"]);
});

test("servidor fora: cai na voz do navegador (nunca mudo), preferindo a natural", async () => {
    const { sb, tocou, navegador } = carregar({
        servidorFalha: true,
        vozes: [voz("Microsoft Maria - Portuguese (Brazil)"), voz("Google português do Brasil")],
    });
    sb._gcFalar("15, Fulano Teste");
    await esperar();
    assert.deepStrictEqual(tocou, []);
    assert.strictEqual(navegador.length, 1);
    assert.strictEqual(navegador[0].text, "15, Fulano Teste");
    assert.match(navegador[0].voice.name, /Google/);
});

test("voz de reserva: prefere a natural e só usa a Maria se for a única", () => {
    const { sb } = carregar();
    const lista = [
        voz("Microsoft Maria - Portuguese (Brazil)"),
        voz("Google português do Brasil"),
        voz("Microsoft Francisca Online (Natural) - Portuguese (Brazil)"),
        voz("Microsoft Ava Online (Natural)", "en-US"),
    ];
    assert.match(sb._gcEscolherVoz(lista).name, /Francisca/);
    assert.match(sb._gcEscolherVoz([voz("Microsoft Maria - Portuguese (Brazil)")]).name, /Maria/);
    assert.strictEqual(sb._gcEscolherVoz([voz("Ava", "en-US")]), null);
});

test("separação: registrar o pacote não toca mais o bipe de sucesso", () => {
    const fonte = ler("bipagens.js");
    const corpo = fonte.slice(fonte.indexOf("function _bipRegistrar"), fonte.indexOf("function _bipSelecionarInput"));
    assert.ok(!/_gcBeepSucesso\s*\(/.test(corpo));
    assert.match(fonte, /_gcFalar\(_bipTextoFala\(data\)\)/);
});
