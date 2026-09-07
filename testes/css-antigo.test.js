// Testes da chave de teste do CSS (?css=antigo).
//
// Ela existe por um motivo específico: o dono relata que o celular fica "todo
// bugado" e eu não reproduzo o defeito em navegador nenhum, nem em aparelho
// emulado. Já gastei quatro palpites errados. Em vez de um quinto, esta chave
// carrega o style.css de 27/08 e responde de uma vez: é o CSS ou não é?
//
// O risco que estes testes cobrem é o de sempre com código de depuração: ele
// vazar pra quem não pediu. Se disparar sem o parâmetro, todo mundo passa a
// rodar CSS de duas semanas atrás sem saber — e aí o "bug" vira outro.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");

test("o CSS de 27/08 existe e e mesmo o antigo", () => {
    const antigo = fs.readFileSync(path.join(raiz, "style-20260827.css"), "utf8");
    // Marcadores do que entrou DEPOIS: se aparecerem, o arquivo não é o de 27/08.
    assert.doesNotMatch(antigo, /atd-launcher/,
        "o CSS do atendimento entrou em 02/09 — não pode estar na cópia de 27/08");
    assert.doesNotMatch(antigo, /overscroll-behavior/,
        "overscroll-behavior é mudança minha de 04/09");
    assert.ok(antigo.length > 150000, "arquivo truncado; a cópia não serve pra comparar");
});

test("a chave so dispara com ?css=antigo na URL", () => {
    const bloco = html.slice(html.indexOf("CHAVE DE TESTE DO CSS"),
                             html.indexOf("AUTOVERIFICAÇÃO DE VERSÃO"));
    assert.match(bloco, /css=antigo\/\.test\(location\.search\)/,
        "tem que checar a query string antes de trocar qualquer coisa");
    // A guarda precisa vir ANTES da troca do href — não basta existir.
    const guarda = bloco.indexOf("return;");
    const troca  = bloco.indexOf("style-20260827.css");
    assert.ok(guarda !== -1 && guarda < troca,
        "sem o parâmetro a função tem que sair antes de tocar no href");
});

test("quem abre normal continua no CSS atual", () => {
    // O <link> estático é o do CSS de hoje. A troca é feita por JS e só depois
    // da checagem acima — nunca ao contrário.
    const link = /<link rel="stylesheet" href="(style\.css\?v=[^"]+)">/.exec(html);
    assert.ok(link, "o <link> do CSS atual sumiu do index.html");
    const posLink = html.indexOf(link[0]);
    const posTroca = html.indexOf("style-20260827.css");
    assert.ok(posLink < posTroca,
        "o link do CSS atual tem que vir ANTES da troca, senão o padrão vira o antigo");
});

test("o modo de teste se anuncia na tela", () => {
    const bloco = html.slice(html.indexOf("CHAVE DE TESTE DO CSS"),
                             html.indexOf("AUTOVERIFICAÇÃO DE VERSÃO"));
    assert.match(bloco, /CSS DE TESTE/,
        "sem aviso visível é fácil testar, esquecer, e concluir errado depois");
});
