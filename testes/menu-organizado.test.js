// A barra lateral por area de trabalho, com a transportadora como aba
// (js/conferencias-hub.js). O que quebraria em silencio aqui e um link que sumiu ou
// uma rota antiga que parou de abrir: favorito e material de treinamento dependem dela.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ler = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
const html = ler("index.html");
const router = ler("js", "router.js");
const core = ler("js", "core.js");
const menu = html.slice(html.indexOf('<ul class="menu">'), html.indexOf('class="sidebar-footer"'));

const rotulosDoMenu = [...menu.matchAll(/<span class="label">([^<]+)<\/span>/g)].map(m => m[1]);

test("a equipe ve os menus por area", () => {
    ["Transportadoras", "Galpão", "Acompanhamento", "Fechamento", "Financeiro e Fiscal", "Cadastros", "Sistema"]
        .forEach(r => assert.ok(rotulosDoMenu.includes(r), r));
});

test("o entregador ve tres menus por assunto", () => {
    ["Minha rota", "Meu desempenho", "Meus pagamentos"].forEach(r => assert.ok(rotulosDoMenu.includes(r), r));
});

test("a Separacao continua geral, no Galpao", () => {
    const galpao = menu.slice(menu.indexOf('id="submenu-operacao"'), menu.indexOf('id="menu-ent-rota"'));
    assert.match(galpao, /data-rota="Operacao\/Bipagem"/);
});

test("transportadora nao vira item de menu", () => {
    ["Shopee", "Loggi", "Anjun", "Imile", "J&amp;T"].forEach(r => assert.ok(!rotulosDoMenu.includes(r), r));
});

test("o fechamento antigo continua no menu", () => {
    ["Fechamento/CacadorAlimentar", "Fechamento/CacadorPesquisar", "Fechamento/CacadorDashboard",
     "Videira/AlimentarFechamento", "Videira/MeuFechamento", "Fechamentos/NotasFiscais"]
        .forEach(r => assert.ok(menu.includes(`data-rota="${r}"`), r));
});

test("as telas 'Em breve' sairam do menu", () => {
    assert.ok(!menu.includes("_emBreve"));
});

test("as rotas antigas continuam abrindo", () => {
    ["Shopee/Recebimento", "Shopee/Romaneiro", "Shopee/AT", "Shopee/Pedidos", "Shopee/LineHaul",
     "Shopee/Atribuicoes", "Shopee/ItemAvariado", "Shopee/Stuck", "Shopee/Stuck/Backlog",
     "Operacao/AlimentarLoggi", "Operacao/AlimentarTotalExpress", "TorreControle/NaRua",
     "Conferencias/Loggi", "Conferencias/TotalExpress"]
        .forEach(r => assert.ok(router.includes(`"${r}":`), r));
});

test("todo id que o core.js mostra existe na pagina", () => {
    const ids = [...core.matchAll(/\b(?:show|_showSistema)\("([^"]+)"\)/g)].map(m => m[1]);
    assert.ok(ids.length > 20);
    ids.forEach(id => assert.ok(html.includes(`id="${id}"`), id));
});

test("admin ve so a Consulta de NFs em Financeiro e Fiscal", () => {
    assert.strictEqual((menu.match(/class="subgroup-header fin-restrito"/g) || []).length, 3);
    assert.match(core, /#submenu-financeiro \.fin-restrito/);
    const direto = menu.slice(menu.indexOf('id="submenu-financeiro"'), menu.indexOf('id="menu-cadastros"'));
    assert.match(direto, /<li><a href="#" data-rota="ConsultaNFs"/);
});

test("as abas proprias do Na Rua ficam escondidas: quem troca e a barra", () => {
    assert.match(html, /id="nr-transp-tabs" style="display:none"/);
});
