// Testes de "Na rua hoje" na tela inicial do entregador (js/entregador-na-rua.js).
//
// A tela é montada por template string, e o que ela mostra é endereço e nome
// vindos de relatório — texto que ninguém do sistema digitou. O erro típico não
// dá exceção: um nome com aspas quebra o atributo e o toque para de abrir; a
// hora passa por `new Date` e sai 3h errada no aparelho de quem está fora do
// fuso; o index.html perde o id e o bloco some sem aviso.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonteJs = fs.readFileSync(path.join(__dirname, "..", "js", "entregador-na-rua.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const adminJs = fs.readFileSync(path.join(__dirname, "..", "js", "admin.js"), "utf8");

// `let`/`const` do topo não viram propriedade do contexto: a ponte vai no próprio script.
const ponte = `
;globalThis.__enr = {
    _enrHora, _enrRelativo, _enrComplemento, _enrRender, _enrAlternarTransp, _enrAlternarEntregador, _enrCarregar,
    setDados: v => { _enrDados = v; },
    abertos: () => [..._enrAbertos],
    transp: () => _enrTransp,
};`;

function carregar(fetchFalso) {
    const el = { innerHTML: "" };
    const documento = { getElementById: id => (id === "home-na-rua" ? el : null) };
    const contexto = vm.createContext({
        console, document: documento, API: "http://api.teste",
        localStorage: { getItem: () => "tok" },
        fetch: fetchFalso || (() => Promise.reject(new Error("sem rede"))),
    });
    contexto.globalThis = contexto;
    vm.runInContext(fonteJs + ponte, contexto, { filename: "entregador-na-rua.js" });
    return { api: contexto.__enr, el };
}

const ped = (codigo, situacao, extra = {}) => ({
    codigo, status: "Delivering", situacao, endereco: "Rua das Flores, 10", complemento: "",
    bairro: "Centro", cidade: "Cidade Um", atualizado_em: "2026-10-05 14:30:00.000", ...extra,
});

const ent = (nome, entregues, pedidos) => ({
    nome, total: entregues + pedidos.length, entregues, pendentes: pedidos.length,
    na_rua: pedidos.length, insucessos: 0, pedidos,
});

function resposta(entregadores) {
    const soma = c => entregadores.reduce((s, e) => s + e[c], 0);
    return {
        dia: "2026-10-05",
        atualizado: { importado_em: "2026-10-05 14:30:00.000", segundos_atras: 720 },
        transportadoras: [{
            chave: "shopee", rotulo: "Shopee", total: soma("total"), entregues: soma("entregues"),
            pendentes: soma("pendentes"), entregadores,
        }],
    };
}

// ── o que liga a tela ao resto do site ───────────────────────────────────

test("o index.html tem o lugar do bloco e carrega o script", () => {
    assert.ok(indexHtml.includes('id="home-na-rua"'));
    assert.match(indexHtml, /<script src="js\/entregador-na-rua\.js\?v=\d{8}[a-z]"><\/script>/);
});

test("a home do entregador chama a carga", () => {
    assert.match(adminJs, /role === "entregador"[^\n]*_enrCarregar\(\)/);
});

// ── hora ─────────────────────────────────────────────────────────────────

test("a hora sai do texto como veio, sem passar por Date", () => {
    const { api } = carregar();
    assert.strictEqual(api._enrHora("2026-10-05 14:30:00.000"), "14:30");
    assert.strictEqual(api._enrHora("2026-10-05 00:05:59"), "00:05");
    assert.strictEqual(api._enrHora(""), "");
    assert.ok(!/new Date/.test(fonteJs.replace(/\/\/.*$/gm, "")));
});

test("o tempo relativo vem dos segundos do servidor", () => {
    const { api } = carregar();
    assert.strictEqual(api._enrRelativo(20), "agora mesmo");
    assert.strictEqual(api._enrRelativo(720), "há 12 min");
    assert.strictEqual(api._enrRelativo(7300), "há 2h");
    assert.strictEqual(api._enrRelativo(null), "");
});

// ── desenho ──────────────────────────────────────────────────────────────

test("fechado mostra a transportadora com o total, sem entregador nem endereco", () => {
    const { api, el } = carregar();
    api.setDados(resposta([ent("Ajudante Um", 3, [ped("BR1", "na_rua")])]));
    api._enrRender();
    assert.ok(el.innerHTML.includes("Shopee"));
    assert.ok(el.innerHTML.includes("1 pendente"));
    assert.ok(el.innerHTML.includes("3 de 4 entregues"));
    assert.ok(el.innerHTML.includes("14:30"));
    assert.ok(el.innerHTML.includes("há 12 min"));
    assert.ok(!el.innerHTML.includes("Ajudante Um"));
    assert.ok(!el.innerHTML.includes("Rua das Flores"));
});

test("tocar na transportadora lista os entregadores; com mais de um, os pedidos seguem fechados", () => {
    const { api, el } = carregar();
    api.setDados(resposta([
        ent("Ajudante Um", 3, [ped("BR1", "na_rua")]),
        ent("Ajudante Dois", 0, [ped("BR2", "na_rua", { endereco: "Rua do Sol, 5" })]),
    ]));
    api._enrAlternarTransp("shopee");
    assert.ok(el.innerHTML.includes("Ajudante Um"));
    assert.ok(el.innerHTML.includes("Ajudante Dois"));
    assert.ok(el.innerHTML.includes("2 entregadores"));
    assert.ok(!el.innerHTML.includes("Rua do Sol"));

    api._enrAlternarEntregador("Ajudante Dois");
    assert.ok(el.innerHTML.includes("Rua do Sol, 5"));
    assert.ok(el.innerHTML.includes("BR2"));
    assert.ok(!el.innerHTML.includes("Rua das Flores"));
});

test("com um entregador so, tocar na transportadora ja abre a lista dele", () => {
    const { api, el } = carregar();
    api.setDados(resposta([ent("Ajudante Um", 0, [ped("BR1", "na_rua")])]));
    api._enrAlternarTransp("shopee");
    assert.ok(el.innerHTML.includes("Rua das Flores, 10"));
    assert.ok(el.innerHTML.includes("Centro · Cidade Um"));
});

test("tocar de novo na transportadora fecha", () => {
    const { api, el } = carregar();
    api.setDados(resposta([ent("Ajudante Um", 0, [ped("BR1", "na_rua")])]));
    api._enrAlternarTransp("shopee");
    api._enrAlternarTransp("shopee");
    assert.strictEqual(api.transp(), "");
    assert.ok(!el.innerHTML.includes("Ajudante Um"));
});

test("cada situacao tem o seu rotulo", () => {
    const { api, el } = carregar();
    api.setDados(resposta([ent("Ajudante Um", 0, [
        ped("BR1", "na_rua"), ped("BR2", "insucesso"), ped("BR3", "aguardando"),
    ])]));
    api._enrAlternarTransp("shopee");
    assert.ok(el.innerHTML.includes("Na rua"));
    assert.ok(el.innerHTML.includes("Insucesso"));
    assert.ok(el.innerHTML.includes("Ainda não saiu"));
});

test("complemento que o endereco ja traz nao repete", () => {
    const { api } = carregar();
    assert.strictEqual(api._enrComplemento({ endereco: "Rua X, 1, CASA 2", complemento: "casa 2" }), "");
    assert.strictEqual(api._enrComplemento({ endereco: "Rua X, 1", complemento: "Fundos" }), "Fundos");
});

test("sem pedido no nome dele a transportadora aparece parada, sem abrir", () => {
    const { api, el } = carregar();
    api.setDados(resposta([]));
    api._enrRender();
    assert.ok(el.innerHTML.includes("Nada na rua hoje"));
    assert.match(el.innerHTML, /class="enr-transp"[^>]*disabled/);
});

test("nome e endereco com aspas e tags nao quebram o HTML", () => {
    const { api, el } = carregar();
    const nome = `Zé "Bala" O'Neil <b>`;
    api.setDados(resposta([
        ent(nome, 0, [ped("BR1", "na_rua", { endereco: `Rua <script>alert(1)</script>, "7"` })]),
        ent("Ajudante Dois", 0, []),
    ]));
    api._enrAlternarTransp("shopee");
    api._enrAlternarEntregador(nome);
    assert.ok(!el.innerHTML.includes("<script>"));
    assert.ok(el.innerHTML.includes("O&#39;Neil &lt;b&gt;"));
    assert.ok(el.innerHTML.includes("&quot;Bala&quot;"));
    // O array nasce no contexto do vm: comparar por valor, não pelo protótipo.
    assert.strictEqual(api.abertos().join("|"), nome);
});

// ── carga ────────────────────────────────────────────────────────────────

const espera = () => new Promise(r => setTimeout(r, 0));

test("carrega de /entregador/na-rua com o token, sem mandar nome", async () => {
    const pedidos = [];
    const { api, el } = carregar((url, opt) => {
        pedidos.push({ url, opt });
        return Promise.resolve({ json: () => Promise.resolve(resposta([ent("Ajudante Um", 1, [ped("BR1", "na_rua")])])) });
    });
    api._enrCarregar();
    await espera();
    assert.strictEqual(pedidos[0].url, "http://api.teste/entregador/na-rua");
    assert.strictEqual(pedidos[0].opt.headers.Authorization, "Bearer tok");
    assert.ok(el.innerHTML.includes("Shopee"));
});

test("atualizar mantem aberto o que estava aberto", async () => {
    const dados = resposta([ent("Ajudante Um", 1, [ped("BR1", "na_rua")]), ent("Ajudante Dois", 0, [])]);
    const { api, el } = carregar(() => Promise.resolve({ json: () => Promise.resolve(dados) }));
    api.setDados(dados);
    api._enrAlternarTransp("shopee");
    api._enrAlternarEntregador("Ajudante Um");
    api._enrCarregar();
    await espera();
    assert.ok(el.innerHTML.includes("Rua das Flores, 10"));
    assert.ok(el.innerHTML.includes(">Atualizar<"));
});

test("falha na primeira carga deixa o bloco vazio, sem erro na home", async () => {
    const { api, el } = carregar(() => Promise.resolve({ json: () => Promise.resolve({ error: "Acesso negado" }) }));
    api._enrCarregar();
    await espera();
    assert.strictEqual(el.innerHTML, "");
});

test("falha ao atualizar mantem a lista que ja estava na tela", async () => {
    const { api, el } = carregar(() => Promise.reject(new Error("sem rede")));
    api.setDados(resposta([ent("Ajudante Um", 1, [ped("BR1", "na_rua")])]));
    api._enrCarregar();
    await espera();
    await espera();
    assert.ok(el.innerHTML.includes("Shopee"));
    assert.ok(el.innerHTML.includes(">Atualizar<"));
});
