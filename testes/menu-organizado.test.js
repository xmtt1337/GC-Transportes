// A barra lateral: Operação e Torre de Controle trazem em cima o que vale pra todas e, embaixo,
// um grupo por transportadora. O que quebraria em silêncio aqui é um link que sumiu ou uma
// rota antiga que parou de abrir: favorito e material de treinamento dependem dela.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ler = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
const html = ler("index.html").replace(/\r\n/g, "\n");
const router = ler("js", "router.js");
const core = ler("js", "core.js");
const menu = html.slice(html.indexOf('<ul class="menu">'), html.indexOf('class="sidebar-footer"'));

const rotulosDoMenu = [...menu.matchAll(/<span class="label">([^<]+)<\/span>/g)].map(m => m[1]);
const TRANSPORTADORAS = ["shopee", "loggi", "anjun", "imile", "jt", "total_express"];

/** Os links de uma transportadora em Operação ("op") ou Torre de Controle ("torre"). */
function grupo(area, chave) {
    const ini = menu.indexOf(`id="grupo-${area}-${chave}"`);
    assert.ok(ini > 0, `${area} ${chave}`);
    return menu.slice(ini, menu.indexOf("</ul>", ini));
}

const area = id => menu.slice(menu.indexOf(`id="submenu-${id}"`), menu.indexOf("</ul>\n\n", menu.indexOf(`id="submenu-${id}"`)));

test("transportadora não é menu do primeiro nível", () => {
    ["Shopee", "Loggi", "Anjun", "Imile", "J&amp;T", "Total Express", "Transportadoras"]
        .forEach(r => assert.ok(!rotulosDoMenu.includes(r), r));
});

test("Operação e Torre de Controle continuam com esses nomes", () => {
    ["Operação", "Torre de Controle"].forEach(r => assert.ok(rotulosDoMenu.includes(r), r));
});

test("toda transportadora tem um grupo em Operação e outro na Torre", () => {
    TRANSPORTADORAS.forEach(t => {
        assert.ok(area("operacao").includes(`id="grupo-op-${t}"`), t);
        assert.ok(area("torrecontrole").includes(`id="grupo-torre-${t}"`), t);
    });
});

test("a Operação de cada uma tem Alimentar e sua conferência", () => {
    ["loggi", "anjun", "imile", "jt", "total_express"].forEach(t => {
        ["Alimentar", "Conferência"].forEach(i => assert.ok(grupo("op", t).includes(`>${i}</a>`), `${t}: ${i}`));
    });
    ["Recebimento", "Alimentar", "Line Haul", "Atribuições"]
        .forEach(i => assert.ok(grupo("op", "shopee").includes(`>${i}</a>`), i));
});

test("a Torre de cada uma tem Na Rua, Faltantes e Extravios", () => {
    TRANSPORTADORAS.forEach(t => {
        ["Na Rua", "Pacotes Faltantes", "Extravios"].forEach(i => assert.ok(grupo("torre", t).includes(`>${i}</a>`), `${t}: ${i}`));
    });
    ["Item Avariado", "POD", "Stuck — Backlog", "Stuck — Planilha Andre"]
        .forEach(i => assert.ok(grupo("torre", "shopee").includes(`>${i}</a>`), i));
});

test("Loggi e Total não oferecem Ativos, porque não têm modelo", () => {
    ["loggi", "total_express"].forEach(t => assert.ok(!grupo("torre", t).includes(">Ativos</a>"), t));
    ["shopee", "anjun", "imile", "jt"].forEach(t => assert.ok(grupo("torre", t).includes(">Ativos</a>"), t));
});

test("abrir a Shopee pergunta o polo, nos dois menus", () => {
    const antes = id => menu.slice(0, menu.indexOf(`id="${id}"`)).split("<li").pop();
    assert.match(antes("grupo-op-shopee"), /toggleSubSubGroup\(this\); gcPoloGarantir\(\)/);
    assert.match(antes("grupo-torre-shopee"), /toggleSubSubGroup\(this\); gcPoloGarantir\(\)/);
});

test("o que vale pra todas fica em cima, fora dos grupos", () => {
    const geral = area("operacao").split('id="grupo-op-shopee"')[0];
    ["Operacao/Bipagem", "Operacao/Etiquetas", "Custodia/Pacotes", "Pedidos/Pesquisar"]
        .forEach(r => assert.ok(geral.includes(`data-rota="${r}"`), r));
    const torre = area("torrecontrole").split('id="grupo-torre-shopee"')[0];
    ["TorreControle/Transferencias", "Ativos/Disparar", "Extravios/Dashboard", "Extravios/Pesquisar", "Planejamento/Cacador"]
        .forEach(r => assert.ok(torre.includes(`data-rota="${r}"`), r));
});

test("a Separação é geral: nenhuma transportadora tem a sua", () => {
    TRANSPORTADORAS.forEach(t => assert.ok(!grupo("op", t).includes("Bipagem"), t));
});

test("a barra de abas saiu", () => {
    assert.ok(!ler("js", "nav.js").includes("_chubPintar"));
    assert.ok(!ler("js", "conferencias-hub.js").includes("_CHUB_TRANSP"));
    assert.ok(!ler("style.css").includes(".chub-tab"));
});

test("o core.js aplica o limite por cargo", () => {
    assert.match(core, /#sidebar \[data-roles\]/);
    assert.match(grupo("torre", "shopee"), /<li data-roles="dev"><a[^>]*>POD</);
    assert.match(grupo("torre", "anjun"), /<li data-roles="sac dev admin"><a[^>]*>Ativos</);
});

test("o fechamento antigo continua no menu", () => {
    ["Fechamento/CacadorAlimentar", "Fechamento/CacadorPesquisar", "Fechamento/CacadorDashboard",
     "Videira/AlimentarFechamento", "Videira/MeuFechamento", "Fechamentos/NotasFiscais"]
        .forEach(r => assert.ok(menu.includes(`data-rota="${r}"`), r));
});

test("as telas 'Em breve' saíram do menu", () => {
    assert.ok(!menu.includes("_emBreve"));
});

test("as rotas antigas continuam abrindo", () => {
    ["Shopee/Recebimento", "Shopee/Romaneiro", "Shopee/AT", "Shopee/Pedidos", "Shopee/LineHaul",
     "Shopee/Atribuicoes", "Shopee/ItemAvariado", "Shopee/Stuck", "Shopee/Stuck/Backlog",
     "Operacao/AlimentarLoggi", "Operacao/AlimentarTotalExpress", "TorreControle/NaRua",
     "Conferencias", "Conferencias/Loggi", "Conferencias/TotalExpress"]
        .forEach(r => assert.ok(router.includes(`"${r}":`), r));
});

test("todo Na Rua do menu tem rota", () => {
    const rotas = [...menu.matchAll(/data-rota="(TorreControle\/NaRua\/[A-Za-z]+)"/g)].map(m => m[1]);
    assert.strictEqual(rotas.length, 6);
    rotas.forEach(r => assert.ok(router.includes(`"${r}":`), r));
});

test("todo id que o core.js mostra existe na página", () => {
    const ids = [...core.matchAll(/\b(?:show|_showSistema)\("([^"]+)"\)/g)].map(m => m[1]);
    assert.ok(ids.length > 20);
    ids.forEach(id => assert.ok(html.includes(`id="${id}"`), id));
});

test("admin vê só a Consulta de NFs em Financeiro e Fiscal", () => {
    assert.strictEqual((menu.match(/class="subgroup-header fin-restrito"/g) || []).length, 3);
    assert.match(core, /#submenu-financeiro \.fin-restrito/);
});

test("o submenu aberto não corta os grupos de transportadora", () => {
    // No celular o limite era 200px: a Operação parava em Devoluções e nenhuma
    // transportadora aparecia, sem erro nenhum.
    const css = ler("style.css");
    const limites = [...css.matchAll(/\.submenu\.open \{ max-height: (\d+)px/g)].map(m => Number(m[1]));
    assert.ok(limites.length >= 2);
    limites.forEach(px => assert.ok(px >= 1200, `limite de ${px}px`));
});

test("as transportadoras ficam guardadas no grupo Transportadoras", () => {
    ["op", "torre"].forEach(a => {
        const ini = menu.indexOf(`id="grupo-${a}-transportadoras"`);
        assert.ok(ini > 0, a);
        TRANSPORTADORAS.forEach(t => assert.ok(menu.indexOf(`id="grupo-${a}-${t}"`) > ini, `${a} ${t}`));
    });
    assert.strictEqual((menu.match(/>\s*Transportadoras <span/g) || []).length, 2);
});

test("os níveis abertos não cortam a lista da Shopee", () => {
    // 8 itens da Torre > Shopee a ~34px: limite por altura de tela cortaria no celular.
    const css = ler("style.css");
    const px = re => Number(css.match(re)[1]);
    assert.ok(px(/\.sub-sub-submenu\.open \{ max-height: (\d+)px/) >= 400);
    assert.ok(px(/\.sub-submenu\.open \{ max-height: (\d+)px/) >= 700);
});
