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
const TRANSPORTADORAS = ["shopee", "loggi", "anjun", "imile", "total_express"];

/** Os links de uma transportadora em Operação ("op") ou Torre de Controle ("torre"). */
function grupo(area, chave) {
    const ini = menu.indexOf(`id="grupo-${area}-${chave}"`);
    assert.ok(ini > 0, `${area} ${chave}`);
    return menu.slice(ini, menu.indexOf("</ul>", ini));
}

const area = id => menu.slice(menu.indexOf(`id="submenu-${id}"`), menu.indexOf("</ul>\n\n", menu.indexOf(`id="submenu-${id}"`)));

test("transportadora não é menu do primeiro nível", () => {
    ["Shopee", "Loggi", "Anjun", "Imile", "Total Express", "Transportadoras"]
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

test("Separação é um grupo com Bipagens e Alimentações", () => {
    const ini = menu.indexOf('id="subgroup-separacao"');
    assert.ok(ini > 0);
    const sep = menu.slice(ini, menu.indexOf("</ul>", ini));
    assert.match(sep, /data-rota="Operacao\/Bipagem"[^>]*>Bipagens<\/a>/);
    assert.match(sep, /data-rota="Operacao\/Alimentacoes" onclick="abrirAlimentacoes\(event\)">Alimentações<\/a>/);
    assert.ok(menu.slice(0, ini).split("<li").pop().includes("Separação"), "título do grupo");
});

test("Alimentações tem aba pra toda transportadora que a Separação procura", () => {
    // A Separação acha o pacote só pelo arquivo do Alimentar; o "Subir relatório" da
    // Conferência Anjun grava só pra conferência. Sem a aba, Anjun bipada dá "não encontrado".
    const js = ler("js", "alimentar.js");
    ["loggi", "anjun", "imile", "total_express"].forEach(t => assert.match(js, new RegExp(`k: '${t}'`), t));
    assert.ok(!/k: 'jt'/.test(js), "J&T sem aba");
});

test("links antigos do Alimentar continuam abrindo", () => {
    ["Operacao/AlimentarLoggi", "Operacao/AlimentarAnjun", "Operacao/AlimentarImile",
     "Operacao/AlimentarTotalExpress", "Operacao/Alimentacoes"].forEach(r => assert.ok(router.includes(`"${r}":`), r));
    ["Operacao/Separacao", "Operacao/Anjun/Alimentar", "Operacao/TotalExpress/Alimentar"]
        .forEach(r => assert.ok(router.includes(`_ROTAS_INTERNAS["${r}"]`), r));
});

test("a Operação de cada uma tem sua conferência, e o Alimentar mora na Separação", () => {
    ["loggi", "anjun", "imile", "total_express"].forEach(t => {
        assert.ok(grupo("op", t).includes(">Conferência</a>"), `${t}: Conferência`);
        assert.ok(!grupo("op", t).includes(">Alimentar</a>"), `${t}: Alimentar fica em Separação`);
    });
    ["Recebimento", "Alimentar", "Line Haul", "Atribuições", "Item Avariado"]
        .forEach(i => assert.ok(grupo("op", "shopee").includes(`>${i}</a>`), i));
});

test("Item Avariado é da Operação (bipa e retém o item), não da Torre", () => {
    assert.ok(!grupo("torre", "shopee").includes(">Item Avariado</a>"));
    assert.match(router, /"Shopee\/ItemAvariado":\s*"Operacao\/Shopee\/ItemAvariado"/);
    // O endereço da Torre foi público antes: link salvo ainda abre a tela.
    assert.match(router, /_ROTAS_INTERNAS\["TorreControle\/Shopee\/ItemAvariado"\] = "Shopee\/ItemAvariado"/);
});

test("a Torre de cada uma tem Na Rua, Faltantes e Extravios", () => {
    TRANSPORTADORAS.forEach(t => {
        ["Na Rua", "Pacotes Faltantes", "Extravios"].forEach(i => assert.ok(grupo("torre", t).includes(`>${i}</a>`), `${t}: ${i}`));
    });
    ["POD", "Stuck — Backlog", "Stuck — Planilha Andre"]
        .forEach(i => assert.ok(grupo("torre", "shopee").includes(`>${i}</a>`), i));
});

test("Loggi e Total não oferecem Ativos, porque não têm modelo", () => {
    ["loggi", "total_express"].forEach(t => assert.ok(!grupo("torre", t).includes(">Ativos</a>"), t));
    ["shopee", "anjun", "imile"].forEach(t => assert.ok(grupo("torre", t).includes(">Ativos</a>"), t));
});

test("J&T saiu do menu, mas os links antigos continuam abrindo", () => {
    assert.ok(!menu.includes("J&amp;T"));
    assert.ok(!menu.includes('id="grupo-op-jt"'));
    assert.ok(!menu.includes('id="grupo-torre-jt"'));
    ["Operacao/AlimentarJT", "Conferencias/JT", "TorreControle/NaRua/JT"].forEach(r => assert.ok(router.includes(`"${r}"`), r));
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
    assert.strictEqual(rotas.length, 5);
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

test("todo nível no caminho da tela atual tem a barrinha azul", () => {
    // Área, títulos do meio (ex.: Fechamento > Videira) e a tela: sem a barra num deles,
    // o caminho parece parar no meio.
    const css = ler("style.css");
    const regra = sel => css.match(new RegExp(sel.replace(/\./g, "\.") + "[^{]*\{([^}]*)\}"))[1];
    assert.match(regra(".menu-item.active"), /inset \dpx 0 0 #3a86ff/);
    assert.match(regra(".subgroup-header-2.active"), /inset 2px 0 0 #3a86ff/);
    assert.match(regra(".submenu a.active"), /inset 2px 0 0 #3a86ff/);
});
