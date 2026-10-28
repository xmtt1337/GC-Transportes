// Fechamento › Regras e configurações: blocos, exceções, histórico. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DADOS = {
    performance: { polos: ["Caçador"], polos_disponiveis: ["Caçador", "Videira", "Outro Polo"], faixas: null },
    pnr: { limite_usuario: 2, regra_fixo: { fator: 0.01, desconto_pct: 40 } },
    ticketlog: { percentual: 50 },
    deslocamento: { asfalto: 0.5, chao: 0.8 },
    extravios: { planilha: null, aba: null },
    excecoes: [{ id: 7, entregador: "Fulano de Teste - Vila", tipo: "pnr_nao_conta", descricao: "Fulano de Teste - Vila: PNR não conta", observacao: "combinado" }],
    tipos_excecao: { pnr_nao_conta: { nome: "PNR não conta", comValor: false }, pnr_limite: { nome: "Limite de PNR próprio", comValor: true } },
    historico: [
        { id: 2, chave: "excecao", rotulo: "Exceção por entregador", detalhe: "Fulano de Teste - Vila", valor_antes: null, valor_depois: "Fulano de Teste - Vila: PNR não conta", quem: "Gestor Teste", alterado_em: "2026-10-28T12:00:00Z" },
        { id: 1, chave: "acareacao_limite_usuario", rotulo: "PNR: limite por usuário no dia", detalhe: null, valor_antes: "2", valor_depois: "3", quem: null, alterado_em: "2026-10-28T11:00:00Z" },
    ],
};

function carregar(user) {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, innerHTML: "", value: "", checked: false, style: {} }); return els.get(id); };
    const ctx = { console, API: "", token: "t", window: { _gcUser: user || { role: "gestor" } }, document: { getElementById: el, querySelectorAll: () => [] } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-regras.js"), "utf8") + "\n;this._set = (d) => { _rgDados = d; };", ctx);
    return { ctx, el };
}

test("blocos: PNR com os valores atuais, polos marcados, exceção e histórico", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._rgRender();
    const html = el("rg-conteudo").innerHTML + el("rg-conteudo2").innerHTML;
    assert.match(html, /id="rg-pnr-limite" value="2"/);
    assert.match(html, /id="rg-pnr-fixo-limite" value="0,01"/);
    assert.match(html, /id="rg-pnr-fixo-desconto" value="40"/);
    assert.match(html, /value="Caçador" checked/);
    assert.doesNotMatch(html, /value="Videira" checked/);
    assert.match(html, /Fulano de Teste - Vila: PNR não conta/);
    assert.match(html, /_rgRemoverExcecao\(7\)/);
    assert.match(html, /id="rg-ds-asfalto" value="0,50"/);
    const hist = el("rg-historico").innerHTML;
    assert.match(hist, /PNR: limite por usuário no dia/);
    assert.match(hist, /Gestor Teste/);
    assert.match(hist, /<td class="cft-ajuda">2<\/td>\s*<td>3<\/td>/);
});

test("Ticketlog: só dev edita o percentual", () => {
    let { ctx, el } = carregar({ role: "gestor" });
    ctx._set(DADOS);
    ctx._rgRender();
    assert.match((el("rg-conteudo").innerHTML + el("rg-conteudo2").innerHTML), /id="rg-tl-pct"[^>]* disabled/);
    ({ ctx, el } = carregar({ role: "dev" }));
    ctx._set(DADOS);
    ctx._rgRender();
    assert.doesNotMatch((el("rg-conteudo").innerHTML + el("rg-conteudo2").innerHTML), /id="rg-tl-pct"[^>]* disabled/);
    assert.match((el("rg-conteudo").innerHTML + el("rg-conteudo2").innerHTML), /_rgSalvarTicketlog/);
});

test("exceção 'Limite de PNR próprio' mostra o campo do número", () => {
    const { ctx, el } = carregar();
    ctx._set(DADOS);
    ctx._rgRender();
    el("rg-exc-tipo").value = "pnr_limite";
    ctx._rgTipoExcecao();
    assert.strictEqual(el("rg-exc-valor").style.display, "");
    el("rg-exc-tipo").value = "pnr_nao_conta";
    ctx._rgTipoExcecao();
    assert.strictEqual(el("rg-exc-valor").style.display, "none");
});
