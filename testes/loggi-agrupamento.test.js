// Operação › Loggi › Agrupamento: está no menu, tem rota e a % nunca arredonda para 100% com
// pacote faltando. Dados de TESTE, inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.join(__dirname, "..");
const ler = f => fs.readFileSync(path.join(raiz, f), "utf8");

test("a Conferência da Loggi é a tela do Agrupamento e o link antigo ainda abre", () => {
    const menu = ler("index.html");
    const grupo = menu.slice(menu.indexOf('id="grupo-op-loggi"'), menu.indexOf("</ul>", menu.indexOf('id="grupo-op-loggi"')));
    assert.ok(grupo.includes('data-rota="Conferencias/Loggi" onclick="abrirLoggiAgrupamento(event)">Conferência<'));
    assert.ok(!grupo.includes("abrirConfExpedicao"), "a conferência de expedição saiu do menu da Loggi");
    assert.ok(!grupo.includes(">Agrupamento<"));
    assert.ok(menu.includes('id="tela-loggi-agrupamento"'));
    assert.match(menu, /js\/loggi-agrupamento\.js\?v=\d{8}[a-z]/);
    const router = ler("js/router.js");
    assert.ok(router.includes('"Conferencias/Loggi":            () => abrirLoggiAgrupamento()'));
    assert.ok(router.includes('"Conferencias/Loggi":              "Operacao/Loggi/Conferencia"'));
    assert.ok(router.includes('_ROTAS_INTERNAS["Operacao/Loggi/Agrupamento"] = "Conferencias/Loggi"'));
});

test("porcentagem arredonda para baixo e filtro por cidade e busca", () => {
    const ctx = { document: { getElementById: () => ({ value: "0002" }) } };
    vm.createContext(ctx);
    vm.runInContext(ler("js/loggi-agrupamento.js") + "\nthis._lagPct=_lagPct;this._lagFiltrados=_lagFiltrados;this.definir=(d,c)=>{_lagDados=d;_lagCidade=c;};", ctx);
    assert.strictEqual(ctx._lagPct(2499, 2500), "99,96%");
    assert.strictEqual(ctx._lagPct(29, 100), "29,00%");      // sem erro de vírgula flutuante (0,29 × 100)
    assert.strictEqual(ctx._lagPct(99999, 100000), "99,99%"); // nunca 100,00% com pacote faltando
    assert.strictEqual(ctx._lagPct(0, 0), "—");
    ctx.definir({ bases: [{ pendentes: [
        { codigo: "TESTE0001", cidade: "Cidade A" },
        { codigo: "TESTE0002", cidade: "Cidade A" },
        { codigo: "TESTE0002B", cidade: "Cidade B" },
    ] }] }, "Cidade A");
    assert.deepStrictEqual(ctx._lagFiltrados().map(p => p.codigo), ["TESTE0002"]);
});
