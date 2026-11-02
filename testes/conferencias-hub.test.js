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
    " _chubCardHtml, _chubInfo, _chubTemAlimentar, _chubQuando, _chubEsc, _chubPode };";

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
        if (conf.acao) {
            assert.ok(api._CHUB_ACOES.some(a => a.chave === conf.acao),
                `${tela}: acao "${conf.acao}" nao existe`);
            return;
        }
        // Tela sem transportadora fixa atende varias: basta a sub existir em alguma.
        const transps = conf.transp ? [conf.transp] : Object.keys(api._CHUB_SUBS);
        assert.ok(transps.some(t => api._CHUB_SUBS[t].some(s => s.chave === conf.sub)),
            `${tela}: sub "${conf.sub}" nao existe`);
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
    const html = api._chubHtml("shopee", api._CHUB_TELAS["tela-shopee-conf-entregadores"]);
    assert.ok(!html.includes('class="chub-tab active"'), "marcou aba");
    assert.match(api._chubHtml("shopee", api._CHUB_TELAS["tela-shopee-conf-entregadores"]),
        /class="chub-acao active"[^>]*onclick="_chubAcao\('entregadores'\)"/);
});

test("a aba da transportadora aberta vem marcada, e so ela", () => {
    const html = api._chubHtml("imile", { sub: "conferencia" });
    const marcadas = html.match(/class="chub-tab active"/g) || [];
    assert.strictEqual(marcadas.length, 1);
    assert.match(html, /class="chub-tab active"[^>]*onclick="_chubIr\('imile'\)"/);
});

test("todas as transportadoras aparecem na barra, sempre", () => {
    // A barra é a navegação inteira: faltar uma transportadora ali é deixá-la
    // inalcançável, porque não existe mais link de menu pra ela.
    const html = api._chubHtml("loggi", { sub: "conferencia" });
    api._CHUB_TRANSP.forEach(t => {
        assert.ok(html.includes(`_chubIr('${t.chave}')`), `${t.chave} sumiu da barra`);
    });
});

/** O que aparece na linha de funções pra um cargo. */
function funcoes(transp, role) {
    contexto.window = { _gcUser: { role } };
    const html = api._chubHtml(transp, { sub: "conferencia" });
    contexto.window = undefined;
    return [...html.matchAll(/_chubIrSub\('([a-z]+)'\)/g)].map(m => m[1]);
}

const CHAVES = t => api._CHUB_SUBS[t].map(s => s.chave);

test("cada transportadora tem uma de cada coisa, na mesma ordem", () => {
    const lista = ["alimentar", "conferencia", "narua", "etiquetas", "faltantes", "extravios"];
    ["anjun", "imile", "jt"].forEach(t => {
        assert.deepEqual([...CHAVES(t)], [...lista, "ativos"], t);
    });
    // Sem modelo de ativo no WhatsApp: o item nem aparece, em vez de abrir vazio.
    ["loggi", "total_express"].forEach(t => assert.deepEqual([...CHAVES(t)], lista, t));
});

test("Loggi e Total nao oferecem Ativos, porque nao tem modelo", () => {
    assert.ok(!funcoes("total_express", "dev").includes("ativos"));
    assert.ok(funcoes("anjun", "dev").includes("ativos"));
});

test("a Total Express tem conferencia", () => {
    assert.ok(CHAVES("total_express").includes("conferencia"));
    assert.ok(api._CHUB_TRANSP.some(t => t.chave === "total_express"));
});

test("a Separacao e geral: nao e funcao de transportadora nenhuma", () => {
    Object.values(api._CHUB_SUBS).forEach(subs => {
        assert.ok(!subs.some(s => /separa|bip/i.test(s.chave + s.rotulo)));
    });
});

test("a Shopee nao oferece conferencia por arquivo", () => {
    // A conferencia dela e Line Haul e Atribuicoes, que saem dos dados que ela
    // exporta. A por arquivo e o recurso de quem nao exporta nada.
    assert.ok(!CHAVES("shopee").includes("conferencia"));
    assert.ok(CHAVES("shopee").includes("linehaul") && CHAVES("shopee").includes("atribuicoes"));
});

test("toda transportadora abre em uma conferencia", () => {
    Object.entries(api._CHUB_SUBS).forEach(([t, subs]) => {
        const inicio = subs.filter(s => s.inicio);
        assert.strictEqual(inicio.length, 1, t);
        assert.match(inicio[0].chave, /conferencia|linehaul/);
    });
});

test("a barra mostra so o que o cargo pode ver", () => {
    const user = funcoes("loggi", "user");
    assert.deepEqual(user, ["alimentar", "conferencia", "etiquetas", "faltantes"]);
    const sac = funcoes("anjun", "sac");
    assert.ok(!sac.includes("etiquetas"), "etiquetas e so do pessoal operacional");
    assert.ok(sac.includes("narua") && sac.includes("ativos"));
    assert.ok(!funcoes("anjun", "finance").includes("ativos"));
    assert.ok(!funcoes("shopee", "admin").includes("pod"));
    assert.ok(funcoes("shopee", "dev").includes("pod"));
});

test("toda aba abre em algo que o cargo pode ver", () => {
    ["user", "admin", "finance", "dev", "sac"].forEach(role => {
        contexto.window = { _gcUser: { role } };
        Object.values(api._CHUB_SUBS).forEach(subs => {
            assert.ok(subs.filter(api._chubPode).some(s => s.inicio), role);
        });
    });
    contexto.window = undefined;
});

test("o numero de cargas atrasadas fica no Alimentar, so na Shopee", () => {
    assert.match(api._chubHtml("shopee", { transp: "shopee", sub: "linehaul" }), /Alimentar<span class="chub-badge"/);
    assert.ok(!api._chubHtml("anjun", { sub: "conferencia" }).includes("chub-badge"));
    assert.strictEqual(api._chubTemAlimentar("shopee"), true);
    assert.strictEqual(api._chubTemAlimentar("loggi"), false);
});

test("as telas de envio da Shopee marcam o Alimentar, nao uma conferencia", () => {
    // Marcar Line Haul ali diria que a pessoa esta conferindo quando ela esta
    // carregando arquivo.
    ["tela-painel-alimentar", "tela-shopee-romaneiro", "tela-shopee-at", "tela-shopee-pedidos"].forEach(tela => {
        const html = api._chubHtml("shopee", api._CHUB_TELAS[tela]);
        assert.match(html, /class="chub-sub active"[^>]*onclick="_chubIrSub\('alimentar'\)"/, tela);
    });
});

test("tela que tambem abre fora da barra nao fica presa numa transportadora", () => {
    // Etiquetas no Galpao valem pra todas: com a barra, pareceriam de uma so.
    ["tela-etiquetas", "tela-pacotes-faltantes", "tela-torre-pacotes-faltantes",
     "tela-extravios-registros", "tela-whatsapp-conversas", "tela-pod-semanal"].forEach(tela => {
        assert.strictEqual(api._CHUB_TELAS[tela].soPelaBarra, true, tela);
    });
});

test("a grafia da planilha de extravios cai na transportadora certa", () => {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const achar = (chave, valor) => api._chubInfo(chave).extravio.test(norm(valor));
    assert.ok(achar("jt", "J&T Express"));
    assert.ok(achar("jt", "JT"));
    assert.ok(achar("shopee", "SPX"));
    assert.ok(achar("total_express", "TOTAL"));
    assert.ok(!achar("loggi", "J&T Express"));
});

test("transportadora desconhecida cai na primeira, sem quebrar", () => {
    assert.strictEqual(api._chubInfo("correios").chave, api._CHUB_TRANSP[0].chave);
    assert.doesNotThrow(() => api._chubHtml("correios", { sub: "conferencia" }));
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
