// Operação › Anjun / iMile › Conferência: o padrão das conferências (js/conferencia-dia.js +
// js/conferencia-padrao.js). Menu, rota, o arquivo padrão igual ao das extensões e o cartão do login.
// Dados de TESTE, inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const ler = f => fs.readFileSync(path.join(raiz, f), "utf8");
const grupoDoMenu = (menu, id) => { const ini = menu.indexOf(`id="${id}"`); return menu.slice(ini, menu.indexOf("</ul>", ini)); };

test("Anjun e iMile abrem a conferência do dia no padrão; o upload antigo da iMile saiu do menu", () => {
    const menu = ler("index.html");
    assert.ok(grupoDoMenu(menu, "grupo-op-anjun").includes('data-rota="Conferencias/Anjun" onclick="abrirAnjunConferencia(event)">Conferência<'));
    const imile = grupoDoMenu(menu, "grupo-op-imile");
    assert.ok(imile.includes('data-rota="Conferencias/Imile" onclick="abrirImileConferencia(event)">Conferência<'));
    assert.ok(!imile.includes("abrirConferencias"));
    for (const id of ["tela-anjun-conferencia", "tela-imile-conferencia", "anc-resultado", "imc-resultado", "anc-barra", "imc-barra"]) assert.ok(menu.includes(`id="${id}"`), id);
    assert.match(menu, /js\/conferencia-padrao\.js\?v=\d{8}[a-z]/);
    assert.match(menu, /js\/conferencia-dia\.js\?v=\d{8}[a-z]/);
    assert.ok(menu.indexOf('<script src="js/conferencia-padrao.js') < menu.indexOf('<script src="js/conferencia-dia.js'), "o padrão carrega antes");
    assert.ok(!menu.includes("js/anjun-conferencia.js"));
    const router = ler("js/router.js");
    assert.ok(router.includes('"Conferencias/Anjun":            () => abrirAnjunConferencia()'));
    assert.ok(router.includes('"Conferencias/Imile":            () => abrirImileConferencia()'));
    assert.ok(router.includes('"tela-imile-conferencia":    "Conferencias/Imile"'));
    // O upload antigo continua no código (só sem link).
    assert.ok(ler("js/conferencias.js").includes("function abrirConferencias"));
});

test("js/conferencia-padrao.js é o mesmo arquivo das extensões (XMTT)", () => {
    const daExtensao = path.join(raiz, "../automacao/xm-conferencias/extensao/padrao/conferencia-padrao.js");
    if (fs.existsSync(daExtensao)) assert.strictEqual(ler("js/conferencia-padrao.js"), fs.readFileSync(daExtensao, "utf8"));
    const dia = ler("js/conferencia-dia.js");
    assert.ok(dia.includes("XMConfPadrao.criar("));
    assert.ok(dia.includes('api: "anjun-conferencia"') && dia.includes('api: "imile-conferencia"'));
});

function carregar(fetchLinhas) {
    let html = "";
    const corpo = { appendChild: () => {} };
    const ctx = {
        API: "http://x", token: "T", console,
        fetch: async () => ({ ok: true, json: async () => ({ linhas: fetchLinhas }) }),
        document: {
            body: corpo,
            getElementById: () => null,
            createElement: () => ({ addEventListener: () => {}, set innerHTML(v) { html = v; }, get innerHTML() { return html; } }),
        },
    };
    vm.createContext(ctx);
    vm.runInContext(ler("js/conferencia-padrao.js"), ctx);
    vm.runInContext(ler("js/conferencia-dia.js") + "\nthis._cdAbrirLogin=_cdAbrirLogin;this.definir=(t,d)=>{_cdEst(t).dados=d;_cdAtual=t;};", ctx);
    return { ctx, html: () => html };
}

test("cartão do login: mostra as cadastradas e oferece só as cidades de hoje que faltam", async () => {
    const { ctx, html } = carregar([
        { id: 1, usuario: "Login.Teste2", cidade: "Cidade A" },
        { id: 2, usuario: "Outro.Login", cidade: "Cidade B" },
    ]);
    ctx.definir("anjun", { pacotes: [
        { waybill: "AJTESTE1", entregador: "login.teste2", cidade: "Cidade B", status: "cidade_errada" },
        { waybill: "AJTESTE2", entregador: "Login.Teste2", cidade: "Cidade B", status: "cidade_errada" },
        { waybill: "AJTESTE3", entregador: "Login.Teste2", cidade: "Cidade A", status: "ok" },
        { waybill: "AJTESTE4", entregador: "Outro.Login", cidade: "Cidade C", status: "cidade_errada" },
    ] });
    await ctx._cdAbrirLogin("Login.Teste2");
    assert.match(html(), /Cidades de <span[^>]*>Login\.Teste2<\/span> na Anjun/);
    assert.match(html(), /cft-tag">Cidade A/);                        // cadastrada, com o × pra tirar
    assert.match(html(), /value="Cidade B"> Cidade B <span class="cft-ajuda">2 pedido/); // dele hoje, falta na lista
    assert.ok(!html().includes('class="cd-marca" value="Cidade A"'));  // já cadastrada: não oferece de novo
    assert.ok(!html().includes('class="cd-marca" value="Cidade C"'));  // é de outro login
});

test("cartão do entregador da iMile: lista da iMile; resposta antiga (só pendências) também serve", async () => {
    const { ctx, html } = carregar([]);
    ctx.definir("imile", { pendentes: [{ waybill: "33TESTE1", entregador: "Entregador Teste", cidade: "Cidade D", status: "usuario_sem_cidade" }] });
    await ctx._cdAbrirLogin("Entregador Teste");
    assert.match(html(), /na iMile<\/div>/);
    assert.match(html(), /Nenhuma: os pedidos dele aparecem como "Entregador sem cidade cadastrada"/);
    assert.match(html(), /value="Cidade D"> Cidade D/);
});
