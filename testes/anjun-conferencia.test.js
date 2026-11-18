// Operação › Anjun › Conferência pela extensão: menu, rota e filtro da tabela.
// Dados de TESTE, inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const ler = f => fs.readFileSync(path.join(raiz, f), "utf8");

test("a Conferência da Anjun abre a tela da extensão; o upload saiu do menu", () => {
    const menu = ler("index.html");
    const ini = menu.indexOf('id="grupo-op-anjun"');
    const grupo = menu.slice(ini, menu.indexOf("</ul>", ini));
    assert.ok(grupo.includes('data-rota="Conferencias/Anjun" onclick="abrirAnjunConferencia(event)">Conferência<'));
    assert.ok(!grupo.includes("abrirConfExpedicao"));
    assert.ok(menu.includes('id="tela-anjun-conferencia"'));
    assert.match(menu, /js\/anjun-conferencia\.js\?v=\d{8}[a-z]/);
    const router = ler("js/router.js");
    assert.ok(router.includes('"Conferencias/Anjun":            () => abrirAnjunConferencia()'));
    assert.ok(router.includes('"tela-anjun-conferencia":    "Conferencias/Anjun"'));
    // O upload antigo continua no código (só sem link).
    assert.ok(ler("js/conferencia-expedicao.js").includes("function abrirConfExpedicao"));
});

test("filtro da tabela por situação, cidade e busca", () => {
    const ctx = { document: { getElementById: () => ({ value: "teste2" }) } };
    vm.createContext(ctx);
    vm.runInContext(ler("js/anjun-conferencia.js") + "\nthis._ancFiltrados=_ancFiltrados;this.definir=(d,f,c)=>{_ancDados=d;_ancFiltro=f;_ancCidade=c;};", ctx);
    const pendentes = [
        { waybill: "AJTESTE1", entregador: "", cidade: "Cidade A", status: "sem_entregador" },
        { waybill: "AJTESTE2", entregador: "Login.Teste2", cidade: "Cidade A", status: "cidade_errada" },
        { waybill: "AJTESTE3", entregador: "Login.Teste2", cidade: "Cidade B", status: "cidade_errada" },
    ];
    ctx.definir({ pendentes }, "cidade_errada", "Cidade A");
    assert.deepStrictEqual(ctx._ancFiltrados().map(p => p.waybill), ["AJTESTE2"]);
    ctx.definir({ pendentes }, "", "");
    assert.deepStrictEqual(ctx._ancFiltrados().map(p => p.waybill), ["AJTESTE2", "AJTESTE3"]);
});

test("cartão do login: mostra as cadastradas e oferece só as cidades de hoje que faltam", async () => {
    let html = "";
    const corpo = { appendChild: () => {} };
    const ctx = {
        API: "http://x", token: "T", body: corpo, console,
        fetch: async () => ({ ok: true, json: async () => ({ linhas: [
            { id: 1, usuario: "Login.Teste2", cidade: "Cidade A" },
            { id: 2, usuario: "Outro.Login", cidade: "Cidade B" },
        ] }) }),
        document: {
            body: corpo,
            getElementById: () => null,
            createElement: () => ({ addEventListener: () => {}, set innerHTML(v) { html = v; }, get innerHTML() { return html; } }),
        },
    };
    vm.createContext(ctx);
    vm.runInContext(ler("js/anjun-conferencia.js") + "\nthis._ancAbrirLogin=_ancAbrirLogin;this.definir=d=>{_ancDados=d;};", ctx);
    ctx.definir({ pendentes: [
        { waybill: "AJTESTE1", entregador: "login.teste2", cidade: "Cidade B", status: "cidade_errada" },
        { waybill: "AJTESTE2", entregador: "Login.Teste2", cidade: "Cidade B", status: "cidade_errada" },
        { waybill: "AJTESTE3", entregador: "Login.Teste2", cidade: "Cidade A", status: "sem_cidade" },
        { waybill: "AJTESTE4", entregador: "Outro.Login", cidade: "Cidade C", status: "cidade_errada" },
    ] });
    await ctx._ancAbrirLogin("Login.Teste2");
    assert.match(html, /Cidades de <span[^>]*>Login\.Teste2<\/span>/);
    assert.match(html, /cft-tag">Cidade A/);                       // cadastrada, com o × pra tirar
    assert.match(html, /value="Cidade B"> Cidade B <span class="cft-ajuda">2 pacote/); // dele hoje, falta na lista
    assert.ok(!html.includes('class="anc-marca" value="Cidade A"')); // já cadastrada: não oferece de novo
    assert.ok(!html.includes('class="anc-marca" value="Cidade C"')); // é de outro login
});
