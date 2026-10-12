// Testes da troca rápida de quinzena.
//
// Cada tela com os botões "1ª Quinzena / 2ª Quinzena" dispara um fetch a cada
// clique. Quem clica na 1ª e logo em seguida na 2ª tem dois pedidos no ar, e
// nada garante que voltem na ordem: se o da 1ª chega por último, ele pinta a
// tela por cima — e o botão marcado continua sendo o da 2ª. A pessoa lê os
// valores de uma quinzena achando que são da outra, numa tela onde se confere
// nota fiscal e se marca pagamento.
//
// A proteção é um contador por tela: cada busca guarda o número dela e, quando
// a resposta chega, só pinta se ainda for a busca mais recente.
//
// Aqui cada arquivo roda num contexto isolado, com document e fetch de mentira.
// O fetch não responde sozinho: o teste decide a ordem. A fixture é sintética —
// nenhum nome ou valor real — e cada quinzena devolve uma marca própria
// (MARCA-Q1 / MARCA-Q2) pra dar pra ver qual delas ficou na tela.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/** Elemento de mentira: aceita qualquer coisa e guarda o que escreveram nele. */
function fazerElemento(id) {
    const classes = new Set();
    const el = {
        id, value: "10", innerHTML: "", innerText: "", textContent: "", className: "",
        style: {}, options: [], childNodes: [], checked: false, disabled: false,
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            toggle: (c, on) => { (on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c); },
            contains: (c) => classes.has(c),
        },
        appendChild() {}, prepend() {}, remove() {}, focus() {}, addEventListener() {},
        setAttribute() {}, getAttribute: () => null,
        querySelector: () => null, querySelectorAll: () => [],
    };
    el.parentNode = { insertBefore() {} };
    return el;
}

/**
 * Carrega os arquivos da tela e devolve como dirigir o teste: `clicar(q)`,
 * `responder(q)` (solta os pedidos daquela quinzena, na ordem que o teste
 * quiser) e `tela()` (tudo que está escrito nos elementos).
 */
function montar({ arquivos, selecionar, resposta }) {
    const elementos = new Map();
    const pendentes = [];
    const pegar = (id) => {
        if (!elementos.has(id)) elementos.set(id, fazerElemento(id));
        return elementos.get(id);
    };
    const ctx = {
        console, URL, Promise, setTimeout, clearTimeout,
        API: "https://api.teste", token: "tok",
        localStorage: { getItem: () => "tok", setItem() {} },
        document: {
            getElementById: pegar,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => fazerElemento("novo"),
            addEventListener() {},
        },
        window: { addEventListener() {} },
        fetch(url) {
            return new Promise((resolve) => {
                const q = Number((/quinzena=(\d)/.exec(url) || [])[1] || 0);
                pendentes.push({ url, q, resolve });
            });
        },
        // Só o que as telas chamam de fora do próprio arquivo.
        skMostrar(el) { el.classList.add("sk-mode"); el.innerHTML = "<esqueleto>"; },
        skFim(el, texto) { el.classList.remove("sk-mode"); if (texto !== undefined) el.innerText = texto; },
        moedaJS: (n) => "R$ " + n,
        gcAlert() {}, gcConfirm() {}, mostrarTela() {},
        cfgRotuloAnotacoes: (c) => String(c),
        MESES: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
        _admPainelReqId: 0,
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    for (const nome of arquivos) {
        const fonte = fs.readFileSync(path.join(__dirname, "..", "js", nome), "utf8");
        vm.runInContext(fonte, ctx, { filename: nome });
    }

    const assentar = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
    return {
        clicar: (q) => vm.runInContext(`${selecionar}(${q})`, ctx),
        rodar: (codigo) => vm.runInContext(codigo, ctx),
        async responder(q) {
            const meus = pendentes.filter((p) => p.q === q);
            assert.ok(meus.length, `nenhum pedido pendente da quinzena ${q}`);
            for (const p of meus) {
                pendentes.splice(pendentes.indexOf(p), 1);
                const corpo = resposta(q, p.url);
                p.resolve({ ok: true, json: () => Promise.resolve(corpo) });
            }
            await assentar();
        },
        tela() {
            return [...elementos.values()]
                .map((e) => `${e.innerHTML} ${e.innerText} ${e.textContent} ${e.value}`).join("\n");
        },
        elemento: pegar,
    };
}

const marca = (q) => `MARCA-Q${q}`;

// Uma entrada por tela com botão de quinzena. `resposta` devolve o corpo que o
// backend daria, sempre com a marca da quinzena num campo que vai parar na tela.
const TELAS = [
    {
        nome: "Pagamentos",
        arquivos: ["pagamentos.js"],
        selecionar: "selecionarQuinzenaPag",
        resposta: (q, url) => url.includes("/pagamentos/quinzena")
            ? { status: "pendente" }
            : [{ nome: marca(q), total: "R$ 1,00", total_num: 1, emitiu_nf: false }],
    },
    {
        nome: "Conferência NF",
        arquivos: ["conf-nf.js"],
        selecionar: "selecionarQuinzenaConf",
        resposta: (q) => [{ nome: marca(q), user_name: marca(q), entregador: marca(q), emitiu_nf: false }],
    },
    {
        nome: "Fechamentos (admin)",
        arquivos: ["admin.js", "notas-fiscais.js"],
        selecionar: "selecionarQuinzenaAdmin",
        resposta: (q, url) => url.includes("/admin/usuarios")
            ? []
            : { entregadores: [{ nome: marca(q), entregador: marca(q), total_receber: "R$ 1,00", total_receber_num: 1, total_entregues: "1" }] },
    },
    {
        nome: "Antecipações (admin)",
        arquivos: ["antecipacoes-admin.js"],
        selecionar: "selecionarQuinzenaAntAdmin",
        resposta: (q) => [{ id: q, usuario_nome: marca(q), quinzena: q, mes: 10, ano: 2026, status: "pendente", valor_antecipado: "1" }],
    },
    {
        nome: "Antecipação (entregador)",
        arquivos: ["antecipacoes.js"],
        selecionar: "selecionarQuinzenaAnt",
        resposta: (q, url) => url.includes("/nota?")
            ? { id: q, valor: "10,00", numero_nf: marca(q), tomador: "GC Transportes" }
            : { total_receber_num: 10, planilha_uploaded_at: null },
    },
    {
        nome: "Fechamento Videira",
        arquivos: ["videira.js"],
        selecionar: "selecionarQuinzenaVideira",
        resposta: (q) => ({ valor_total_liquido: marca(q), valor_total_liquido_num: 1, cidades: [] }),
    },
    {
        nome: "Criar Fechamento",
        arquivos: ["fechamento-criar.js"],
        selecionar: "_cfSelecionarQuinzena",
        resposta: (q) => [{ transportadora: marca(q), total: 1 }],
    },
    {
        nome: "Relatório de Anotações",
        arquivos: ["anotacoes-relatorio.js"],
        selecionar: "_arSelecionarQuinzena",
        resposta: (q) => ({
            linhas: [{ entregador: marca(q), rotulo: "Teste", quantidade_total: 1, valor_estimado: 1 }],
            total: { quantidade_total: 1, valor_estimado: 1 },
        }),
    },
    {
        nome: "Anotações > Quinzenas",
        arquivos: ["anotacoes-entregador.js"],
        selecionar: "_aqQSelecionarQuinzena",
        resposta: (q, url) => url.includes("/lancamentos")
            ? { lancamentos: [] }
            : { total: { valor_estimado: 1, quantidade_total: 1 },
                transportadoras: [{ rotulo: marca(q), quantidade_total: 1, valor_estimado: 1 }] },
    },
];

for (const cfg of TELAS) {
    test(`${cfg.nome}: resposta atrasada da 1ª nao pinta por cima da 2ª`, async () => {
        const t = montar(cfg);
        t.clicar(1);
        t.clicar(2);
        await t.responder(2);
        assert.match(t.tela(), /MARCA-Q2/, "a quinzena clicada por último precisa aparecer");
        await t.responder(1); // chegou depois, mas é de um clique que já ficou pra trás
        assert.doesNotMatch(t.tela(), /MARCA-Q1/,
            "a tela mostra a 1ª quinzena com o botão da 2ª marcado");
        assert.match(t.tela(), /MARCA-Q2/);
    });

    test(`${cfg.nome}: na ordem normal a ultima clicada continua valendo`, async () => {
        const t = montar(cfg);
        t.clicar(1);
        t.clicar(2);
        await t.responder(1);
        assert.doesNotMatch(t.tela(), /MARCA-Q1/,
            "enquanto a 2ª não chega a tela fica carregando, não mostra a 1ª");
        await t.responder(2);
        assert.match(t.tela(), /MARCA-Q2/);
    });

    test(`${cfg.nome}: um clique so carrega normalmente`, async () => {
        // A proteção não pode engolir a resposta de quem clicou uma vez só.
        const t = montar(cfg);
        t.clicar(1);
        await t.responder(1);
        assert.match(t.tela(), /MARCA-Q1/);
    });
}

test("Pagamentos: o status Pago de uma quinzena nao vaza pra outra", async () => {
    // O status vem num segundo pedido, disparado depois da tabela. Se o da 1ª
    // (paga) chega depois da 2ª (pendente) já estar na tela, o botão "Pagar"
    // some e aparece "Pago" — em cima dos valores de uma quinzena não paga.
    const cfg = TELAS[0];
    const t = montar({
        ...cfg,
        resposta: (q, url) => url.includes("/pagamentos/quinzena")
            ? { status: q === 1 ? "pago" : "pendente", data_pagamento: "2026-10-01" }
            : cfg.resposta(q, url),
    });
    t.clicar(1);
    await t.responder(1);          // tabela da 1ª chegou; o status dela fica no ar
    t.clicar(2);
    await t.responder(2);          // tabela da 2ª
    await t.responder(2);          // status da 2ª: pendente
    await t.responder(1);          // status da 1ª, atrasado: pago
    assert.strictEqual(t.elemento("pag-status-pago").style.display, "none",
        "a 2ª quinzena está pendente; o selo Pago é da 1ª");
    assert.strictEqual(t.elemento("pag-pagar-btn").style.display, "");
});

test("Fechamentos (admin): reabrir a tela descarta a busca que ficou no ar", async () => {
    // Reabrir zera a quinzena e desmarca os botões. A resposta antiga chegando
    // depois mostraria a lista de um período sem nenhum botão marcado.
    const t = montar(TELAS[2]);
    t.clicar(1);
    t.rodar("abrirAdminFechamentos({ preventDefault() {} })");
    await t.responder(1);
    assert.doesNotMatch(t.tela(), /MARCA-Q1/);
});
