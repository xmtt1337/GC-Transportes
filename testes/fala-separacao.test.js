/**
 * Testes da fala da separação: rota + entregador a cada bipe (js/nav.js e js/bipagens.js).
 *
 * Por que isto tem teste: quem separa ouve em vez de olhar. Número da rota errado
 * (ex. "VID-05" falado "cinco" ou "VID 15" sem número) manda o pacote pra pilha
 * errada; voz robótica escolhida quando havia uma natural foi a reclamação que
 * gerou isto; e em rajada a fala velha tem que ser cortada pela nova.
 *
 * Navegador falso, nomes inventados.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");

function carregar(vozes) {
    const falas = [];
    const timers = [];
    let cancelou = 0;
    const synth = {
        getVoices: () => vozes || [],
        cancel: () => { cancelou++; },
        speak: (u) => falas.push(u),
    };
    const sb = {
        console,
        document: {},
        window: { speechSynthesis: synth },
        SpeechSynthesisUtterance: function (t) { this.text = t; },
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(ler("nav.js"), sb, { filename: "nav.js" });
    vm.runInContext(ler("bipagens.js"), sb, { filename: "bipagens.js" });
    const rodarTimers = () => { timers.splice(0).forEach(fn => fn && fn()); };
    return { sb, falas, rodarTimers, cancelou: () => cancelou };
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

test("texto falado: número e nome em sequência", () => {
    const { sb } = carregar();
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-15", entregador: "Fulano Teste" }), "15, Fulano Teste");
    assert.strictEqual(sb._bipTextoFala({ sigla: null, entregador: "Fulano Teste" }), "Fulano Teste");
    assert.strictEqual(sb._bipTextoFala({ sigla: "VID-3", entregador: null }), "3, sem entregador");
});

test("voz: prefere a natural feminina pt-BR e evita a Maria robótica", () => {
    const { sb } = carregar();
    const lista = [
        voz("Microsoft Maria - Portuguese (Brazil)"),
        voz("Google português do Brasil"),
        voz("Microsoft Francisca Online (Natural) - Portuguese (Brazil)"),
        voz("Microsoft Ava Online (Natural)", "en-US"),
    ];
    assert.match(sb._gcEscolherVoz(lista).name, /Francisca/);
    assert.match(sb._gcEscolherVoz(lista.filter(v => !/Francisca/.test(v.name))).name, /Google/);
    // Só a Maria disponível: melhor ela do que nenhuma.
    assert.match(sb._gcEscolherVoz([voz("Microsoft Maria - Portuguese (Brazil)")]).name, /Maria/);
    assert.strictEqual(sb._gcEscolherVoz([voz("Ava", "en-US")]), null);
});

test("fala sai depois do bipe, com a voz escolhida", () => {
    const { sb, falas, rodarTimers } = carregar([voz("Google português do Brasil")]);
    sb._gcFalar("15, Fulano Teste");
    assert.strictEqual(falas.length, 0, "não fala por cima do bipe");
    rodarTimers();
    assert.strictEqual(falas.length, 1);
    assert.strictEqual(falas[0].text, "15, Fulano Teste");
    assert.strictEqual(falas[0].lang, "pt-BR");
    assert.match(falas[0].voice.name, /Google/);
});

test("bipe novo corta a fala anterior (só o último pacote é falado)", () => {
    const { sb, falas, rodarTimers, cancelou } = carregar([voz("Google português do Brasil")]);
    sb._gcFalar("1, Primeiro");
    sb._gcFalar("2, Segundo");
    rodarTimers();
    assert.deepStrictEqual(falas.map(f => f.text), ["2, Segundo"]);
    assert.strictEqual(cancelou(), 2);
});
