/**
 * Testes da voz "Cluster errado" (js/nav.js) e de quem a chama nas conferências.
 *
 * Por que isto tem teste: quem bipa em rajada não olha a tela, separa pelo som.
 * Pacote de outro cluster e pacote sem dados pedem ações diferentes, então o som
 * tem que ser diferente — e o "sem dados" precisa continuar no bipe de erro de
 * sempre. Se a voz não carregou, cair no bipe é melhor que ficar em silêncio.
 *
 * Navegador e servidor são falsos; nenhum dado real entra aqui.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");

/** nav.js num AudioContext de mentira que anota o que tocou. */
function carregarNav(opcoes) {
    const o = opcoes || {};
    const tocou = [];
    class AudioCtxFalso {
        constructor() { this.currentTime = 0; this.destination = {}; }
        resume() { return { then: (fn) => fn() }; } // síncrono pra o teste não esperar
        createOscillator() {
            return { connect() {}, frequency: { setValueAtTime() {} }, start() { tocou.push("bipe"); }, stop() {} };
        }
        createGain() {
            return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
        }
        createBufferSource() {
            return { connect() {}, start() { tocou.push("voz:" + this.buffer.nome); } };
        }
        decodeAudioData(_b, ok, falha) { o.decodeFalha ? falha(new Error("x")) : ok({ nome: "cluster" }); }
    }
    const sandbox = {
        window: { AudioContext: AudioCtxFalso },
        fetch: () => o.fetchFalha
            ? Promise.reject(new Error("offline"))
            : Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }),
        console,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(ler("nav.js"), sandbox, { filename: "nav.js" });
    return { sb: sandbox, tocou };
}

const esperar = () => new Promise(r => setImmediate(r));

test("antes de carregar a voz, cluster errado cai no bipe de erro (nunca silêncio)", () => {
    const { sb, tocou } = carregarNav();
    sb._gcVozClusterErrado();
    assert.ok(tocou.length > 0 && tocou.every(t => t === "bipe"));
});

test("com a voz carregada, cluster errado fala em vez de apitar", async () => {
    const { sb, tocou } = carregarNav();
    await sb._gcCarregarVozCluster();
    sb._gcVozClusterErrado();
    assert.deepStrictEqual(tocou, ["voz:cluster"]);
});

test("falha ao baixar a voz: segue no bipe e tenta de novo depois", async () => {
    const { sb, tocou } = carregarNav({ fetchFalha: true });
    await sb._gcCarregarVozCluster();
    await esperar();
    sb._gcVozClusterErrado();
    assert.ok(tocou.includes("bipe"));
    assert.ok(!tocou.some(t => t.startsWith("voz")));
    // Não ficou travado num carregamento morto: chamar de novo dispara outro fetch.
    assert.ok(sb._gcCarregarVozCluster());
});

test("o bipe de erro continua igual (sem dados não mudou)", () => {
    const { sb, tocou } = carregarNav();
    sb._gcBeepErro();
    assert.deepStrictEqual(tocou, ["bipe", "bipe"]);
});

test("o áudio da voz existe no site", () => {
    const mp3 = path.join(__dirname, "..", "sons", "cluster-errado.mp3");
    assert.ok(fs.statSync(mp3).size > 1000);
});

// ── conferência do entregador: _cenResposta decide o som
function carregarEntregador() {
    const sons = [];
    const sb = { console, document: {} };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(ler("entregador-conferencia.js"), sb, { filename: "entregador-conferencia.js" });
    sb._gcBeepSucesso = () => sons.push("ok");
    sb._gcBeepErro = () => sons.push("erro");
    sb._gcVozClusterErrado = () => sons.push("voz");
    sb._cenFlash = () => {};
    sb._cenMsg = () => {};
    sb._cenEscaneando = () => false;
    return { sb, sons };
}

test("entregador: outra rota fala, sem dados apita, ok confirma", () => {
    const { sb, sons } = carregarEntregador();
    sb._cenResposta("x", "erro", true);
    sb._cenResposta("x", "erro", false);
    sb._cenResposta("x", "ok");
    assert.deepStrictEqual(sons, ["voz", "erro", "ok"]);
});

// ── conferência de atribuições: o tom que sai do resultado
test("atribuições: divergente vira tom próprio, o resto é sem dado", () => {
    const sb = { console, document: {} };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(ler("shopee-atribuicoes.js"), sb, { filename: "shopee-atribuicoes.js" });
    assert.strictEqual(sb._scaTomDoBipe({ resultado: "divergente" }), "divergente");
    assert.strictEqual(sb._scaTomDoBipe({ resultado: "nao_encontrado" }), "sem_dado");
    assert.strictEqual(sb._scaTomDoBipe({ resultado: "ok" }), "ok");
});
