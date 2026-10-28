// Fechamento › Acareações: tabela entregador × dia, filtro da tarifa mínima, pendências. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DADOS = {
    limite: 2,
    arquivos: [{ envio_id: "e1", transportadora: "Imile", arquivo: "pnr.xlsx", total: 4 }],
    dias: [
        { driver: "Fulano de Teste - Vila", dia: "2026-09-21", acareacoes: 3, por_transportadora: { Imile: 2, Loggi: 1 }, tarifa_minima: true, valor_dia: 1.5, pacotes: 10, total: 15, na_regra: true },
        { driver: "Beltrano Exemplo - Vila", dia: "2026-09-22", acareacoes: 1, por_transportadora: { Imile: 1 }, tarifa_minima: false, valor_dia: 2.5, pacotes: 4, total: 10, na_regra: true },
    ],
    lista: [{ driver: "Fulano de Teste - Vila", dia: "2026-09-21", codigo: "IM1", transportadora: "Imile", hora: "09:00" }],
    sem_conversao: [{ usuario: "pessoa.sem.nome", transportadoras: ["Loggi"], acareacoes: 2 }],
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: "", value: "", checked: false, style: {} }); return els.get(id); };
    const ctx = { console, API: "", token: "t", document: { getElementById: el } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-acareacoes.js"), "utf8") + "\n;this._set = (d) => { _acDados = d; };", ctx);
    return { ctx, el };
}

test("tabela: tarifa mínima em destaque, transportadoras do dia e pendência de usuário", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._acRender();
    assert.match(el("ac-lista").innerHTML, /pessoa\.sem\.nome/);
    assert.match(el("ac-lista").innerHTML, /pnr\.xlsx/);
    const tb = el("ac-tbody").innerHTML;
    assert.match(tb, /Tarifa mínima/);
    assert.match(tb, /Imile 2 · Loggi 1/);
    assert.match(tb, /Beltrano Exemplo/);
});

test("filtro só tarifa mínima e abrir o dia mostra os códigos", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._acRender();
    el("ac-so-minima").checked = true;
    ctx._acRenderTabela();
    assert.doesNotMatch(el("ac-tbody").innerHTML, /Beltrano/);
    ctx._acAlternar("Fulano de Teste - Vila|2026-09-21");
    assert.match(el("ac-tbody").innerHTML, /IM1<\/b> · aberta no dia seguinte às 09:00/);
});

test("valor fixo: resumo das regras (só leitura) e dia do fixo marcado com o desconto", () => {
    const { ctx, el } = carregar();
    ctx._set({ ...DADOS, regra_fixo: { fator: 0.01, desconto_pct: 40 },
        dias: DADOS.dias.concat([{ driver: "Ciclano Fixo - Vila", dia: "2026-09-23", acareacoes: 1, por_transportadora: { Loggi: 1 },
            fixo: true, tarifa_minima: true, valor_dia: 1.8, pacotes: 20, total: 36, na_regra: true }]) });
    ctx._acRender();
    const html = el("ac-lista").innerHTML;
    assert.match(html, /baixas do dia × <b>0,01<\/b> \(1\.000 baixas × 0,01 = mais de 10\) → fixo com <b>40% a menos/);
    assert.match(html, /abrirRegrasFechamento\(\)/);
    assert.doesNotMatch(html, /ac-fixo-limite/);
    assert.match(el("ac-tbody").innerHTML, /Fixo −40%/);
});

test("por transportadora: contagem de cada uma e filtro da tabela", () => {
    const { ctx, el } = carregar();
    ctx._set({ ...DADOS, lista: DADOS.lista.concat([{ driver: "Beltrano Exemplo - Vila", dia: "2026-09-22", codigo: "IM9", transportadora: "Imile" },
        { driver: "Fulano de Teste - Vila", dia: "2026-09-21", codigo: "LG1", transportadora: "Loggi" }]) });
    ctx._acRender();
    assert.match(el("ac-lista").innerHTML, /<option value="Loggi">Loggi<\/option>/);
    assert.match(el("ac-lista").innerHTML, /cft-kpi-valor">2<\/div><div class="cft-kpi-rotulo">Imile/);
    el("ac-transp").value = "Loggi";
    ctx._acRenderTabela();
    assert.match(el("ac-tbody").innerHTML, /Fulano de Teste/);
    assert.doesNotMatch(el("ac-tbody").innerHTML, /Beltrano/);
});

test("um espaço por transportadora: anexado ou falta; dia de uma só transportadora mostra só o nome", () => {
    const { ctx, el } = carregar();
    ctx._set({ ...DADOS, transportadoras: [
        { chave: "shopee", nome: "Shopee", arquivos: 0, pnr: 0 }, { chave: "imile", nome: "Imile", arquivos: 1, pnr: 4 },
        { chave: "anjun", nome: "Anjun", arquivos: 0, pnr: 0 }, { chave: "loggi", nome: "Loggi", arquivos: 0, pnr: 0 }] });
    ctx._acRender();
    const html = el("ac-lista").innerHTML;
    assert.strictEqual((html.match(/Falta anexar/g) || []).length, 3);
    assert.match(html, /Anexado<\/span> <span class="cft-ajuda">· 4 PNR/);
    assert.match(html, /data-t="loggi" onchange="_acArquivos\(this, this\.dataset\.t\)"/);
    const tb = el("ac-tbody").innerHTML;
    assert.match(tb, /<td class="cft-ajuda">Imile<\/td>/, "Beltrano só tem Imile: sem número");
    assert.match(tb, /Imile 2 · Loggi 1/, "mais de uma: com número");
});

test("mais de 2 PNR sem pacote no dia: mostra 'sem entrega no dia'; com pacote e sem tarifa: 'falta recalcular'", () => {
    const { ctx, el } = carregar();
    ctx._set({ ...DADOS, dias: [
        { driver: "Pessoa Folga - Vila", dia: "2026-10-15", acareacoes: 3, maior_usuario: 3, por_transportadora: { Shopee: 3 }, tarifa_minima: false, pacotes: 0, na_regra: false },
        { driver: "Pessoa Velha - Vila", dia: "2026-10-14", acareacoes: 3, maior_usuario: 3, por_transportadora: { Shopee: 3 }, tarifa_minima: false, pacotes: 5, total: 12.5, valor_dia: 2.5, na_regra: true }] });
    ctx._acRender();
    const tb = el("ac-tbody").innerHTML;
    assert.match(tb, /sem entrega no dia/);
    assert.match(tb, /falta recalcular/);
    assert.doesNotMatch(tb, /fora da regra/);
});
