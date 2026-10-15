// Testes dos links diretos para um passo dentro das telas da Shopee (js/router.js).
//
// O que se protege:
//   - xmtt.com.br/Shopee/Atribuicoes/VariosClusters abre Atribuições já com a seleção
//     de vários clusters aberta;
//   - xmtt.com.br/Shopee/Recebimento/Exportar abre o Recebimento e só abre o Exportar
//     depois que o polo carrega (e só se o polo recebe Shopee);
//   - nesses dois, o menu lateral destaca a tela-mãe (o link que existe no menu);
//   - as rotas que já existiam continuam iguais.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const routerJs = fs.readFileSync(path.join(__dirname, "..", "js", "router.js"), "utf8");

function carregar(caminho, poloInfo) {
    const chamadas = [];
    const marcados = [];
    const ctx = vm.createContext({
        console,
        location: { hostname: "xmtt.com.br", pathname: "/" + caminho },
        window: { addEventListener() {} },
        history: { pushState() {}, replaceState() {} },
        document: { querySelectorAll: () => [] },
        abrirShopeeAtribuicoes: () => chamadas.push("atribuicoes"),
        _scaAlternarSelecao: v => chamadas.push("selecao:" + v),
        abrirShopeeReceber: () => chamadas.push("receber"),
        _shrAbrirExportar: () => chamadas.push("exportar"),
        gcPoloGarantir: fn => { chamadas.push("polo"); fn(poloInfo); return Promise.resolve(poloInfo); },
    });
    vm.runInContext(routerJs + "\n;globalThis.__r = { _rotaAbrirAtual, set marcar(f) { _marcarSubmenuAtivo = f; } };", ctx);
    ctx.__r.marcar = c => marcados.push(c);
    ctx.__r._rotaAbrirAtual();
    return { chamadas, marcados };
}

test("VariosClusters abre Atribuições com a seleção aberta e marca Atribuições no menu", () => {
    const { chamadas, marcados } = carregar("Shopee/Atribuicoes/VariosClusters");
    assert.deepStrictEqual(chamadas, ["atribuicoes", "selecao:true"]);
    assert.deepStrictEqual(marcados, ["Shopee/Atribuicoes"]);
});

test("Exportar abre o Recebimento e o modal depois do polo", () => {
    const { chamadas, marcados } = carregar("Shopee/Recebimento/Exportar", { polo: "cacador", xpt: "XPT_CFC" });
    assert.deepStrictEqual(chamadas, ["receber", "polo", "exportar"]);
    assert.deepStrictEqual(marcados, ["Shopee/Recebimento"]);
});

test("Exportar não abre o modal se o polo não recebe Shopee", () => {
    const { chamadas } = carregar("Shopee/Recebimento/Exportar", { polo: "joacaba", xpt: null });
    assert.deepStrictEqual(chamadas, ["receber", "polo"]);
});

test("rotas que já existiam continuam iguais", () => {
    const { chamadas, marcados } = carregar("Shopee/Atribuicoes");
    assert.deepStrictEqual(chamadas, ["atribuicoes"]);
    assert.deepStrictEqual(marcados, ["Shopee/Atribuicoes"]);
    assert.deepStrictEqual(carregar("Shopee/Recebimento").chamadas, ["receber"]);
});
