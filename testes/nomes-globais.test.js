// Guarda contra colisão de nome entre os arquivos de js/.
//
// Todos os scripts do site carregam no MESMO escopo global, um depois do outro.
// Duas declarações com o mesmo nome em arquivos diferentes não dão erro visível:
//
//   - duas `function X`  → a do arquivo que carrega por último vence, em
//     silêncio. Foi assim que "Alimentar separação > Loggi" passou a abrir o
//     painel de Alimentar das Conferências: os dois arquivos declaravam
//     `abrirAlimentar`, e o hub carregava depois.
//   - dois `const X`     → pior: o segundo script morre inteiro com
//     "Identifier 'X' has already been declared", e a tela que dependia dele
//     simplesmente não funciona.
//
// Nos dois casos o console fica limpo o suficiente pra ninguém ligar o defeito à
// causa. Este teste transforma isso em falha na hora de escrever.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "js");

/** Declarações no topo do arquivo (coluna 0) — as que vão parar no escopo global. */
function declaracoesGlobais(fonte) {
    const nomes = [];
    const re = /^(?:function|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
    let m;
    while ((m = re.exec(fonte)) !== null) nomes.push(m[1]);
    return nomes;
}

test("nenhum nome global e declarado em dois arquivos", () => {
    const porNome = new Map();
    for (const arquivo of fs.readdirSync(DIR).filter(a => a.endsWith(".js")).sort()) {
        const fonte = fs.readFileSync(path.join(DIR, arquivo), "utf8");
        for (const nome of new Set(declaracoesGlobais(fonte))) {
            if (!porNome.has(nome)) porNome.set(nome, []);
            porNome.get(nome).push(arquivo);
        }
    }

    const colisoes = [...porNome.entries()]
        .filter(([, arquivos]) => arquivos.length > 1)
        .map(([nome, arquivos]) => `${nome} — ${arquivos.join(", ")}`);

    assert.deepStrictEqual(colisoes, [],
        "mesmo nome declarado em mais de um arquivo:\n  " + colisoes.join("\n  "));
});

// O mesmo problema, uma camada abaixo: dois elementos com o mesmo id.
// getElementById devolve o PRIMEIRO do DOM, então a tela que declarou o id
// depois nunca aparece — e quem chama mostrarTela() com aquele id abre a outra.
// Foi assim que "Alimentar separação > Loggi" passou a abrir o painel das
// Conferências mesmo com a URL certa: os dois <div> se chamavam
// "tela-alimentar".
test("nenhum id se repete no index.html", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const vistos = new Map();
    const re = /\sid="([A-Za-z0-9_-]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        vistos.set(m[1], (vistos.get(m[1]) || 0) + 1);
    }
    const repetidos = [...vistos.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} (${n}x)`);
    assert.deepStrictEqual(repetidos, [], "id repetido no index.html: " + repetidos.join(", "));
});

test("o detector enxerga os dois tipos de declaracao", () => {
    // Sem isto, o teste acima poderia passar por não estar achando nada.
    const nomes = declaracoesGlobais([
        "function alfa() {}",
        "const beta = 1;",
        "let gama = 2;",
        "var delta = 3;",
        "    function indentada() {}",   // dentro de outro bloco: não é global
        "  const tambemDentro = 4;",
    ].join("\n"));
    assert.deepStrictEqual(nomes, ["alfa", "beta", "gama", "delta"]);
});
