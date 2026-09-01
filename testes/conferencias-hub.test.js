// Testes da barra de abas das conferências.
//
// A barra é montada como string e injetada na tela, então o que quebra em
// silêncio é o destaque: aba marcada errada faz a pessoa achar que está numa
// transportadora e estar em outra — e conferir a rota errada não dá erro
// nenhum, só um resultado que não bate.
//
// Dados de TESTE. Nenhum nome real entra aqui.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ── carrega o módulo do navegador num contexto isolado
//
// Mesmo caminho dos testes do DACTE e do filtro de entregadores: o arquivo só
// declara constantes e funções no topo, não toca em `document` até alguém
// navegar.
const arquivo = path.join(__dirname, "..", "js", "conferencias-hub.js");
const fonte = fs.readFileSync(arquivo, "utf8") +
    "\n;globalThis.__chub = { _CHUB_TRANSP, _CHUB_SUBS, _CHUB_ACOES, _CHUB_TELAS, _chubHtml," +
    " _chubCardHtml, _chubInfo, _chubTemAlimentar, _chubQuando, _chubEsc };";

const contexto = vm.createContext({ globalThis: undefined, console });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "conferencias-hub.js" });
const api = contexto.__chub;

/** Uma fonte do painel Alimentar, no formato que o servidor devolve. */
function fonteTeste(extra) {
    return Object.assign({
        chave: "at",
        rotulo: "AT Exportada",
        rota: "Shopee/AT",
        acumula: false,
        sustenta: "As atribuições.",
        descricao: "Os pacotes de cada cluster.",
        importado_em: "2026-08-28T12:00:00.000Z",
        importado_por: "Fulano de Teste",
        arquivo: "at.xlsx",
        total: 1234,
        situacao: "hoje",
    }, extra);
}

test("toda tela do mapa aponta pra uma sub-aba ou acao que existe", () => {
    // Chave inventada no mapa = nenhuma aba marcada, e a pessoa nao sabe onde
    // esta. E o erro mais facil de cometer ao adicionar tela nova.
    Object.entries(api._CHUB_TELAS).forEach(([tela, conf]) => {
        if (conf.alimentar) return;
        if (conf.acao) {
            assert.ok(api._CHUB_ACOES.some(a => a.chave === conf.acao),
                `${tela}: acao "${conf.acao}" nao existe`);
            return;
        }
        // Tela pode legitimamente nao pertencer a sub-aba nenhuma (a de arquivo,
        // por exemplo, atende cinco transportadoras). O que nao pode e apontar
        // pra uma sub que nao existe.
        if (!conf.sub) return;
        const transp = conf.transp || "shopee";
        const subs = api._CHUB_SUBS[transp] || [];
        if (!subs.length) return;
        assert.ok(subs.some(s => s.chave === conf.sub),
            `${tela}: sub "${conf.sub}" nao existe em ${transp}`);
    });
});

test("a barra nao pinta cor por transportadora", () => {
    // Cor aqui competiria com as cores que ja significam estado nas telas de
    // baixo (progresso, situacao do pacote). A aba aberta se distingue pelo
    // preenchimento, nao pela cor da transportadora.
    api._CHUB_TRANSP.forEach(t => assert.strictEqual(t.cor, undefined));
    const html = api._chubHtml("shopee", { transp: "shopee", sub: "linehaul" });
    assert.ok(!html.includes("--chub-c"), "sobrou variavel de cor por transportadora");
    assert.ok(!/#[0-9A-Fa-f]{6}/.test(html), "sobrou cor fixa no HTML da barra");
});

test('"Entregadores" e acao, nao sub-aba da Shopee', () => {
    // A conferencia do entregador pega a rota inteira - os pacotes das varias
    // transportadoras que ele leva no mesmo carro. Dentro da Shopee, dizia que
    // a coisa era da Shopee.
    assert.ok(!api._CHUB_SUBS.shopee.some(s => s.chave === "entregadores"));
    assert.ok(api._CHUB_ACOES.some(a => a.chave === "entregadores"));
    const html = api._chubHtml("shopee", { transp: "shopee", sub: "linehaul" });
    assert.match(html, /class="chub-acao"[^>]*onclick="_chubAcao\('entregadores'\)"/);
});

test("tela transversal nao marca aba de transportadora nenhuma", () => {
    // Marcar uma diria que a pessoa esta dentro daquela transportadora.
    ["tela-shopee-conf-entregadores", "tela-painel-alimentar"].forEach(tela => {
        const html = api._chubHtml("shopee", api._CHUB_TELAS[tela]);
        assert.ok(!html.includes('class="chub-tab active"'), tela + " marcou aba");
    });
    assert.match(api._chubHtml("shopee", api._CHUB_TELAS["tela-shopee-conf-entregadores"]),
        /class="chub-acao active"[^>]*onclick="_chubAcao\('entregadores'\)"/);
});

test("a aba da transportadora aberta vem marcada, e so ela", () => {
    const html = api._chubHtml("imile", { sub: "arquivo" });
    const marcadas = html.match(/class="chub-tab active"/g) || [];
    assert.strictEqual(marcadas.length, 1);
    assert.match(html, /class="chub-tab active"[^>]*onclick="_chubIr\('imile'\)"/);
});

test("todas as transportadoras aparecem na barra, sempre", () => {
    // A barra é a navegação inteira: faltar uma transportadora ali é deixá-la
    // inalcançável, porque não existe mais link de menu pra ela.
    const html = api._chubHtml("loggi", { sub: "arquivo" });
    api._CHUB_TRANSP.forEach(t => {
        assert.ok(html.includes(`_chubIr('${t.chave}')`), `${t.chave} sumiu da barra`);
    });
});

test("so a Shopee mostra sub-abas", () => {
    const shopee = api._chubHtml("shopee", { transp: "shopee", sub: "linehaul" });
    assert.match(shopee, /chub-subs/);
    assert.match(shopee, /class="chub-sub active"[^>]*onclick="_chubIrSub\('linehaul'\)"/);
    // Duas sub-abas: "Entregadores" virou acao e "Por arquivo" saiu.
    assert.strictEqual(api._CHUB_SUBS.shopee.length, 2);

    // Nas outras a linha de baixo nem existe, em vez de nascer vazia.
    const imile = api._chubHtml("imile", { sub: "arquivo" });
    assert.ok(!imile.includes("chub-subs"));
});

test("a Shopee nao oferece conferencia por arquivo", () => {
    // A conferencia dela e Line Haul e Atribuicoes, que saem dos dados que ela
    // exporta. A por arquivo e o recurso de quem nao exporta nada.
    assert.deepEqual(api._CHUB_SUBS.shopee.map(s => s.chave), ["linehaul", "atribuicoes"]);
});

test('o botao "Alimentar" so aparece em quem tem arquivo pra alimentar', () => {
    assert.match(api._chubHtml("shopee", { transp: "shopee", sub: "linehaul" }), /Alimentar</);
    assert.ok(!api._chubHtml("anjun", { sub: "arquivo" }).includes("Alimentar<"));
    assert.strictEqual(api._chubTemAlimentar("shopee"), true);
    assert.strictEqual(api._chubTemAlimentar("loggi"), false);
});

test("na tela de alimentar nenhuma sub-aba fica marcada", () => {
    // Alimentar nao e uma conferencia: marcar Line Haul ali diria que a pessoa
    // esta conferindo quando ela esta carregando arquivo.
    const html = api._chubHtml("shopee", { alimentar: true });
    assert.ok(!html.includes('class="chub-sub active"'));
    assert.match(html, /class="chub-acao active"[^>]*onclick="abrirPainelAlimentar/);
});

test("transportadora desconhecida cai na primeira, sem quebrar", () => {
    assert.strictEqual(api._chubInfo("correios").chave, api._CHUB_TRANSP[0].chave);
    assert.doesNotThrow(() => api._chubHtml("correios", { sub: "arquivo" }));
});

test("o cartao mostra a situacao da carga", () => {
    assert.match(api._chubCardHtml(fonteTeste({ situacao: "hoje" })),   /Alimentado hoje/);
    assert.match(api._chubCardHtml(fonteTeste({ situacao: "antiga" })), /Carga de outro dia/);
    assert.match(api._chubCardHtml(fonteTeste({ situacao: "nunca" })),  /Nunca alimentado/);
});

test("situacao desconhecida cai no estado mais grave", () => {
    // Errar pra "nunca alimentado" faz alguem conferir; errar pra "alimentado
    // hoje" faz a carga faltar o dia inteiro sem ninguem perceber.
    assert.match(api._chubCardHtml(fonteTeste({ situacao: "??" })), /Nunca alimentado/);
});

test("o cartao diz se o envio soma ou substitui", () => {
    // E a duvida que mais aparece: reenviar o romaneiro soma, reenviar a AT
    // reescreve. Errar isso duplica romaneio ou apaga AT boa.
    assert.match(api._chubCardHtml(fonteTeste({ acumula: true })),  /SOMA ao que já está lá/);
    assert.match(api._chubCardHtml(fonteTeste({ acumula: false })), /SUBSTITUI a carga inteira/);
});

test("carga que nunca aconteceu nao inventa data nem autor", () => {
    const html = api._chubCardHtml(fonteTeste({ importado_em: null, importado_por: null, total: 0 }));
    assert.match(html, /Última carga: <strong>—<\/strong>/);
    assert.ok(!html.includes("por "), "nao deve citar autor que nao existe");
    assert.match(html, /0 linhas no sistema/);
});

test("uma linha so nao vira 'linhas'", () => {
    assert.match(api._chubCardHtml(fonteTeste({ total: 1 })), /1 linha no sistema/);
});

test("a data sai no fuso de Brasilia", () => {
    // 01:30 UTC do dia 28 e 22:30 do dia 27 em Brasilia. Mostrar 28 faria a
    // carga da noite parecer de hoje.
    assert.match(api._chubQuando("2026-08-28T01:30:00.000Z"), /^27\/08\/2026/);
});

test("data invalida vira travessao, nao 'Invalid Date'", () => {
    assert.strictEqual(api._chubQuando("nao e data"), "—");
});

test("texto vindo do servidor e escapado no cartao", () => {
    const html = api._chubCardHtml(fonteTeste({ importado_por: '<img src=x onerror=alert(1)>' }));
    assert.ok(!html.includes("<img"));
    assert.match(html, /&lt;img/);
});
