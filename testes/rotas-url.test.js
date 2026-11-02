// A URL que aparece na barra segue o menu; o código continua com os nomes internos.
// O que quebraria em silêncio: link antigo parar de abrir, ou o "voltar" do navegador
// ficar preso entre o endereço antigo e o novo.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
const routerJs = ler("js", "router.js");
const html = ler("index.html");
const menu = html.slice(html.indexOf('<ul class="menu">'), html.indexOf('class="sidebar-footer"'));

/** Carrega o router num contexto com a URL dada; toda função abrirX só anota a chamada. */
function carregar(url) {
    const u = new URL(url);
    const local = { hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash };
    const historico = [];
    const abertos = [];
    const contexto = vm.createContext({
        console, location: local, RegExp,
        window: { addEventListener() {} },
        document: { querySelectorAll: () => [], querySelector: () => null },
        history: {
            pushState: (s, t, d) => { historico.push(["push", d]); local.pathname = d; },
            replaceState: (s, t, d) => { historico.push(["replace", d]); local.pathname = d.split(/[?#]/)[0]; },
        },
    });
    vm.runInContext(`${routerJs}
        ;globalThis.__r = { _ROTAS, _ROTAS_URL, _ROTAS_INTERNAS, _TELA_ROTAS, _rotaPublica, _rotaInterna, _rotaAbrirAtual, _rotaAtualizarUrl };`,
        contexto, { filename: "router.js" });
    // Toda rota vira uma anotação, em vez de abrir tela de verdade.
    Object.keys(contexto.__r._ROTAS).forEach(k => {
        contexto.__r._ROTAS[k] = () => {
            abertos.push(k);
            contexto.__r._rotaAtualizarUrl(k); // é o que mostrarTela faz
        };
    });
    return { ...contexto.__r, historico, abertos, local };
}

const r = carregar("https://xmtt.com.br/");

test("cada endereço novo abre uma rota que existe", () => {
    Object.entries(r._ROTAS_INTERNAS).forEach(([publica, interna]) => {
        assert.ok(r._ROTAS[interna], `${publica} -> ${interna}`);
    });
});

test("toda rota interna traduzida existe", () => {
    Object.keys(r._ROTAS_URL).forEach(i => assert.ok(r._ROTAS[i], i));
});

test("duas telas diferentes não dividem o mesmo endereço", () => {
    // Só nome antigo pode repetir: ele abre a mesma tela que o nome atual.
    const antigos = new Set(["Conferencias", "Operacao/ShopeeRecebimento", "Operacao/ShopeeReceber", "Operacao/ShopeeRomaneiro",
        "Operacao/ShopeeAT", "Operacao/ShopeePedidos", "Operacao/ShopeeLineHaul", "Operacao/ShopeeAtribuicoes",
        "Atribuicoes/SolicitarAT", "Cadastros/TodosUsuarios"]);
    const vistos = new Map();
    Object.entries(r._ROTAS_URL).forEach(([interna, publica]) => {
        if (antigos.has(interna)) return;
        assert.ok(!vistos.has(publica), `${publica}: ${vistos.get(publica)} e ${interna}`);
        vistos.set(publica, interna);
    });
});

test("endereço novo não colide com outra rota", () => {
    Object.entries(r._ROTAS_URL).forEach(([interna, publica]) => {
        if (publica === interna) return;
        const dona = Object.keys(r._ROTAS).find(k => k === publica);
        if (dona) assert.ok(r._ROTAS_URL[dona] === publica || !r._ROTAS_URL[dona] && dona === r._rotaInterna(publica), publica);
    });
});

test("todo link do menu abre", () => {
    const rotas = [...menu.matchAll(/data-rota="([^"]+)"/g)].map(m => m[1]);
    assert.ok(rotas.length > 90);
    rotas.forEach(rota => assert.ok(r._ROTAS[rota], rota));
});

test("toda tela com rota padrão abre por URL", () => {
    Object.entries(r._TELA_ROTAS).forEach(([tela, rota]) => {
        if (rota) assert.ok(r._ROTAS[rota], `${tela}: ${rota}`);
    });
});

test("as telas que não tinham endereço agora têm", () => {
    assert.strictEqual(r._TELA_ROTAS["tela-fiscal-acompanhamento"], "Fiscal/Acompanhamento");
    assert.strictEqual(r._TELA_ROTAS["tela-faturas"], "Financeiro/Faturas");
    assert.strictEqual(r._TELA_ROTAS["tela-pacotes-faltantes-registro"], "Operacao/PacotesFaltantes/MeusRegistros");
});

test("endereço antigo abre e troca a barra sem empilhar", () => {
    const a = carregar("https://xmtt.com.br/Shopee/AT");
    a._rotaAbrirAtual();
    assert.deepEqual([...a.abertos], ["Shopee/AT"]);
    assert.deepEqual(a.historico.map(h => [...h]), [["replace", "/Operacao/Shopee/Alimentar/AT"]]);
});

test("endereço novo abre a mesma tela, sem mexer na barra", () => {
    const a = carregar("https://xmtt.com.br/Operacao/Shopee/Alimentar/AT");
    a._rotaAbrirAtual();
    assert.deepEqual([...a.abertos], ["Shopee/AT"]);
    assert.strictEqual(a.historico.length, 0);
});

test("rota antiga de rota antiga também chega ao endereço de hoje", () => {
    const a = carregar("https://xmtt.com.br/Operacao/ShopeeAT");
    a._rotaAbrirAtual();
    assert.deepEqual([...a.abertos], ["Operacao/ShopeeAT"]);
    assert.strictEqual(a.local.pathname, "/Operacao/Shopee/Alimentar/AT");
    assert.ok(!a.historico.some(h => h[0] === "push"), "empilhou e prenderia o voltar");
});

test("a busca na URL não se perde ao trocar o endereço", () => {
    const a = carregar("https://xmtt.com.br/Pedidos/Pesquisar?busca=ABC");
    a._rotaAbrirAtual();
    assert.strictEqual(a.historico[0][1], "/Operacao/HistoricoPedidos?busca=ABC");
});

test("conversa de Ativos vai por prefixo, nos dois sentidos", () => {
    const interna = "Ativos/Conversas/Ativos/Shopee/BR0000000000";
    assert.strictEqual(r._rotaPublica(interna), "TorreControle/Ativos/Conversas/Ativos/Shopee/BR0000000000");
    assert.strictEqual(r._rotaInterna(r._rotaPublica(interna)), interna);
    assert.strictEqual(r._rotaPublica("Ativos/ConversasX"), "Ativos/ConversasX");
});

test("no ambiente local a barra não é tocada", () => {
    const a = carregar("http://localhost:5500/Shopee/AT");
    a._rotaAbrirAtual();
    assert.strictEqual(a.historico.length, 0);
});

test("o site no github.io mantém o prefixo", () => {
    const a = carregar("https://xmtt1337.github.io/GC-Transportes/Shopee/AT");
    a._rotaAbrirAtual();
    assert.strictEqual(a.local.pathname, "/GC-Transportes/Operacao/Shopee/Alimentar/AT");
});

test("Torre de cada transportadora guarda o filtro na URL", () => {
    ["Shopee", "Loggi", "Anjun", "Imile", "JT", "TotalExpress"].forEach(t => {
        assert.ok(r._ROTAS[`TorreControle/${t}/Extravios`], t);
        assert.ok(r._ROTAS[`TorreControle/${t}/PacotesFaltantes`], t);
    });
});
