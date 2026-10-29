// Fechamento › Conversões: aba Usuário → Usuário principal. Nomes inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DADOS = {
    sem_principal: 2,
    entregadores: [
        { entregador: "Andre Teste - Vila", sem_principal: 1, usuarios: [
            { usuario: "andre.teste", transportadoras: ["Shopee Caçador"], principal: null, id: null },
            { usuario: "luana.t", transportadoras: ["Shopee Caçador"], principal: "Luana Teste", id: 4 }] },
        { entregador: "Tudo Certo - Vila", sem_principal: 0, usuarios: [{ usuario: "certo.login", transportadoras: ["Loggi"], principal: "Certo Pessoa", id: 5 }] },
        { entregador: "Outro Teste - Vila", sem_principal: 1, usuarios: [{ usuario: "outro.login", transportadoras: ["Imile"], principal: null, id: null }] },
    ],
    principais: [{ principal: "Luana Teste", usuarios: ["luana.t"], entregadores: ["Andre Teste - Vila"] }],
    conflitos: [{ principal: "Pessoa Dupla", usuarios: ["a", "b"], entregadores: ["Andre Teste - Vila", "Outro Teste - Vila"] }],
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: "", value: "", checked: true, style: {}, focus() {}, setSelectionRange() {} }); return els.get(id); };
    const ctx = { console, API: "", token: "t", window: {}, document: { getElementById: el, querySelectorAll: () => [] } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "conversoes.js"), "utf8") + "\n;this._set = (d) => { _cvDados = d; };", ctx);
    return { ctx, el };
}

test("principal: só entregador com login sem principal, conflito em destaque e lista de principais", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._cvRender();
    const html = el("cv-principal").innerHTML;
    assert.match(html, /Andre Teste - Vila/);
    assert.match(html, /Outro Teste - Vila/);
    assert.doesNotMatch(html, /Tudo Certo - Vila/, "quem já está completo some com o filtro ligado");
    assert.match(html, /Usuário principal em mais de um entregador \(1\)/);
    assert.match(html, /Luana Teste <a href="#"[^>]*>|Luana Teste\s*<a/);
    assert.match(html, /_cvRemover\(4\)/);
    assert.match(html, /<option value="Luana Teste">/);
    assert.match(html, /2 login\(s\) sem usuário principal/);
});

test("principal: sem o filtro mostra todos; busca pelo login", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    el("cv-so-falta").checked = false;
    el("cv-busca").value = "certo.login";
    ctx._cvRender();
    const html = el("cv-lista").innerHTML || el("cv-principal").innerHTML;
    assert.match(el("cv-principal").innerHTML, /Tudo Certo - Vila/);
    assert.doesNotMatch(el("cv-principal").innerHTML, /outro.login/, "busca filtra a lista");
});
