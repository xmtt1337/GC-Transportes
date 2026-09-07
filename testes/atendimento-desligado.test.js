// Teste da chave de desligar do atendimento.
//
// Ela existe pra isolar um bug: o dono relatou que o app fica "todo bugado,
// parecendo glitch" no celular dos entregadores, e lembrou que começou no dia
// em que o atendimento entrou. Desligar e ver se para é o jeito de responder
// isso sem adivinhar — e foi adivinhando que eu errei quatro vezes antes.
//
// O que o teste protege: desligar não pode derrubar a conta do SUPORTE junto.
// Quem some é o balãozinho de quem pede ajuda (presente em toda tela, de todo
// cargo); o menu "Atendimento" do suporte continua.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Normaliza a quebra de linha: o repo grava CRLF no Windows, e uma busca por
// quebra simples passaria batido nesses arquivos — teste verde sem olhar nada.
const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "atendimento.js"), "utf8")
    .split(String.fromCharCode(13) + String.fromCharCode(10)).join(String.fromCharCode(10));

test("a chave existe e esta declarada como constante", () => {
    assert.match(fonte, /const _ATD_DESLIGADO = (true|false);/,
        "a chave precisa ser uma linha só, fácil de achar e de virar");
});

test("desligado, atdIniciar sai antes de criar o relogio do balaozinho", () => {
    const corpo = fonte.slice(fonte.indexOf("function atdIniciar()"),
                              fonte.indexOf("function _atdConferirBadge"));
    const guarda = corpo.indexOf("if (_ATD_DESLIGADO)");
    const timer  = corpo.indexOf("_atdTimerBadge = setInterval");
    assert.notStrictEqual(guarda, -1, "atdIniciar precisa checar a chave");
    assert.ok(guarda < timer,
        "a checagem tem que vir ANTES do setInterval, senão o fetch de minuto em minuto continua");
});

test("desligado, o suporte nao perde o menu dele", () => {
    const corpo = fonte.slice(fonte.indexOf("if (_ATD_DESLIGADO)"),
                              fonte.indexOf("function _atdConferirBadge"));
    const ramo = corpo.slice(0, corpo.indexOf("return;\n    }"));
    assert.match(ramo, /menu-atendimento/,
        "mesmo desligado, a conta do suporte precisa continuar vendo o menu Atendimento");
    assert.doesNotMatch(ramo, /atd-launcher/,
        "o balãozinho é justamente o que deve sumir — ele é o que está em toda tela");
});

test("o balaozinho so aparece pelo caminho de quem NAO e suporte", () => {
    // Guarda contra alguém religar por engano deixando o launcher aparecer no
    // ramo desligado: aí o teste acima passaria e o bug voltaria calado.
    const atdIniciar = fonte.slice(fonte.indexOf("function atdIniciar()"),
                                   fonte.indexOf("function _atdConferirBadge"));
    const ocorrencias = (atdIniciar.match(/atd-launcher/g) || []).length;
    assert.strictEqual(ocorrencias, 1,
        "só o caminho normal (chave em false) pode mostrar o balãozinho");
});
