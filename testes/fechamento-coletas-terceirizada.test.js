// Fechamento › Coletas e Terceirizada Videira: o que a tela mostra. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar(arquivo) {
    const ctx = { console, API: "https://api.teste", token: "tok" };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", arquivo), "utf8"), ctx);
    return ctx;
}

test("Coletas: valor que vem preenchido é o do entregador, senão o padrão; tabela com total", () => {
    const ctx = carregar("fechamento-coletas.js");
    const d = { valor_padrao: 2, valores: [{ driver: "Fulano de Teste - Vila", valor: 3.5 }],
        linhas: [{ driver: "Fulano de Teste - Vila", quantidade: 4, valor: 3.5, total: 14 }], total: 14 };
    assert.strictEqual(ctx._coValorDe(d, "fulano de teste - vila"), 3.5);
    assert.strictEqual(ctx._coValorDe(d, "Beltrano - Morro"), 2);
    const html = ctx._coHtml(d, ["Beltrano - Morro", "Fulano de Teste - Vila"]);
    assert.match(html, /<option value="Beltrano - Morro">/);
    assert.match(html, /R\$\s*14,00/);
    assert.match(html, /Valor padrão por coleta/);
    assert.match(ctx._coHtml({ valor_padrao: 0, valores: [], linhas: [], total: 0 }, []), /Nenhuma coleta nesta quinzena/);
});

test("Terceirizada: cidades × transportadoras, cidades da regra marcadas e planilha com resumo", () => {
    const ctx = carregar("fechamento-terceirizada.js");
    const d = { nome: "Terceirizada - Expedição Videira", valor_pacote: 0.48, pacotes: 15, bruto: 7.2, extravios: 2, acrescimos: 0, descontos: 0, liquido: 5.2,
        por_transportadora: { Jadlog: 5, Anjun: 10 },
        cidades: [{ cidade: "Videira", pacotes: 15, valor: 7.2, por_transportadora: { Anjun: 10, Jadlog: 5 } }, { cidade: "Ibiam", pacotes: 0, valor: 0, por_transportadora: {} }],
        extravios_linhas: [{ data: "02/10/2026", transportadora: "Anjun", codigo: "AJ1", status: "Extravio", valor: 2 }], ajustes_linhas: [],
        regra: { valor: 0.48, cidades: ["Videira", "Ibiam"] }, cidades_quinzena: ["Videira", "Vila Fora"] };
    const html = ctx._tvHtml(d);
    assert.match(html, /<th>Anjun<\/th><th>Jadlog<\/th>/, "mais pacotes primeiro");
    assert.match(html, /value="Videira" checked/);
    assert.match(html, /value="Vila Fora">/);
    assert.match(html, /AJ1/);
    const abas = JSON.parse(JSON.stringify(ctx._tvAbas(d)));
    assert.deepStrictEqual(abas.map(a => a.nome), ["Cidades", "Extravios", "Resumo"]);
    assert.deepStrictEqual(abas[0].linhas[1], ["Videira", 10, 5, 15, 7.2]);
});
