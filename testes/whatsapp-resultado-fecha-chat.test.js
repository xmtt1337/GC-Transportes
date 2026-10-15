// Testes do modal "Resposta do cliente" dentro do chat de um pedido.
//
// Escolher "Recebeu o pedido" / "Não recebeu" resolve o pedido — não sobra nada pra
// fazer naquela conversa, então o chat fecha e volta pra lista. Pelo card do funil
// (fora do chat) não há chat pra fechar: só recarrega a lista. E se o servidor recusar,
// o chat fica aberto pra pessoa tentar de novo.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "whatsapp-conversa.js"), "utf8");

const ACESSOR = `
;globalThis.__w = {
  set alvo(v) { _wacResultadoAlvo = v; },
  get resolvido() { return _wacResolvidoAtual; },
};`;

function carregar({ ok = true } = {}) {
    const chamadas = { voltar: 0, lista: 0, alertas: [] };
    const overlay = { style: { display: "" }, querySelector: () => null };
    const ctx = {
        console, setTimeout, clearTimeout, setInterval, clearInterval,
        API: "http://teste", token: "t",
        document: {
            getElementById: () => overlay,
            querySelectorAll: () => [],
        },
        fetch: async () => ({ ok, json: async () => (ok ? {} : { error: "recusado" }) }),
        gcAlert: m => chamadas.alertas.push(m),
    };
    vm.createContext(ctx);
    vm.runInContext(fonte + ACESSOR, ctx);
    ctx._wacVoltarParaLista = () => { chamadas.voltar++; };
    ctx._wacCarregarLista = () => { chamadas.lista++; };
    return { ctx, chamadas, overlay };
}

const espera = () => new Promise(r => setTimeout(r, 0));

for (const resultado of ["recebido", "nao_recebido"]) {
    test(`pelo chat: "${resultado}" fecha o chat e volta pra lista`, async () => {
        const { ctx, chamadas, overlay } = carregar();
        ctx.__w.alvo = { pedido: "AJ000000000000001", numero: "5549900000000", mensagem_ids: ["r1"], noChat: true };
        ctx._wacConfirmarResultado(resultado);
        await espera(); await espera(); await espera();
        assert.strictEqual(chamadas.voltar, 1);
        assert.strictEqual(ctx.__w.resolvido, true);
        assert.strictEqual(overlay.style.display, "none");
    });
}

test("pelo card do funil: só recarrega a lista, não mexe em chat", async () => {
    const { ctx, chamadas } = carregar();
    ctx.__w.alvo = { pedido: "AJ000000000000002", numero: "5549900000001", mensagem_ids: [], noChat: false };
    ctx._wacConfirmarResultado("recebido");
    await espera(); await espera(); await espera();
    assert.strictEqual(chamadas.voltar, 0);
    assert.strictEqual(chamadas.lista, 1);
});

test("servidor recusou: chat continua aberto", async () => {
    const { ctx, chamadas } = carregar({ ok: false });
    ctx.__w.alvo = { pedido: "AJ000000000000003", numero: "5549900000002", mensagem_ids: ["r2"], noChat: true };
    ctx._wacConfirmarResultado("nao_recebido");
    await espera(); await espera(); await espera();
    assert.strictEqual(chamadas.voltar, 0);
    assert.deepStrictEqual(chamadas.alertas, ["recusado"]);
});
