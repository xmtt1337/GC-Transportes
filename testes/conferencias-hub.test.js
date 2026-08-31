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
    "\n;globalThis.__chub = { _CHUB_TRANSP, _CHUB_SUBS, _CHUB_TELAS, _chubHtml, _chubCardHtml," +
    " _chubInfo, _chubTemAlimentar, _chubQuando, _chubEsc };";

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

test("toda tela do mapa aponta pra uma sub-aba que existe", () => {
    // Sub-aba inventada no mapa = nenhuma aba marcada, e a pessoa não sabe onde
    // está. É o erro mais fácil de cometer ao adicionar tela nova.
    Object.entries(api._CHUB_TELAS).forEach(([tela, conf]) => {
        if (conf.alimentar) return;
        const transp = conf.transp || "shopee";
        const subs = api._CHUB_SUBS[transp] || [];
        if (!subs.length) return;
        assert.ok(subs.some(s => s.chave === conf.sub),
            `${tela}: sub "${conf.sub}" nao existe em ${transp}`);
    });
});

test("toda transportadora tem cor propria", () => {
    const cores = api._CHUB_TRANSP.map(t => t.cor);
    assert.strictEqual(new Set(cores).size, cores.length, "duas transportadoras com a mesma cor");
    api._CHUB_TRANSP.forEach(t => assert.match(t.cor, /^#[0-9A-Fa-f]{6}$/));
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

    // Nas outras a linha de baixo nem existe, em vez de nascer vazia.
    const imile = api._chubHtml("imile", { sub: "arquivo" });
    assert.ok(!imile.includes("chub-subs"));
});

test("a conferencia por arquivo da Shopee continua alcancavel", () => {
    // Ela existia no menu antigo; se sumisse da barra, ninguem chegaria mais na
    // tela de comparar arquivo da Shopee.
    assert.ok(api._CHUB_SUBS.shopee.some(s => s.chave === "arquivo"));
});

test('o botao "Alimentar" so aparece em quem tem arquivo pra alimentar', () => {
    assert.match(api._chubHtml("shopee", { transp: "shopee", sub: "linehaul" }), /chub-alimentar/);
    assert.ok(!api._chubHtml("anjun", { sub: "arquivo" }).includes("chub-alimentar"));
    assert.strictEqual(api._chubTemAlimentar("shopee"), true);
    assert.strictEqual(api._chubTemAlimentar("loggi"), false);
});

test("na tela de alimentar nenhuma sub-aba fica marcada", () => {
    // Alimentar nao e uma conferencia: marcar Line Haul ali diria que a pessoa
    // esta conferindo quando ela esta carregando arquivo.
    const html = api._chubHtml("shopee", { alimentar: true });
    assert.ok(!html.includes('class="chub-sub active"'));
    assert.match(html, /class="chub-alimentar active"/);
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
