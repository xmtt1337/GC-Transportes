// Testes da paginação da tabela do Backlog (50 pedidos por página).
//
// O que se protege aqui:
//
//   - só a TABELA pagina. Cards, filtros, gráfico e relatório continuam contando
//     o backlog inteiro: se trocar de página mudasse o "Total", a pessoa
//     deixaria de confiar no número — e um relatório de 50 linhas por engano é
//     do tipo de erro que só aparece quando alguém confere o Excel;
//   - todo recorte novo (busca, card, pílula, filtro de coluna, recarregar)
//     volta pra página 1. Ficar na página 4 de uma lista que encolheu pra 30
//     linhas mostraria uma tabela vazia, sem erro nenhum na tela;
//   - o rodapé some quando tudo cabe numa página, igual à tela de Devoluções.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "shopee-stuck-backlog.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const ACESSOR = `
;globalThis.__b = {
  set regs(v) { _sstbRegistros = v; },
  get pagina() { return _sstbPagina; },
  set pagina(v) { _sstbPagina = v; },
  get porPagina() { return SSTB_POR_PAGINA; },
};`;

function carregar() {
    const els = {};
    const el = (id) => els[id] || (els[id] = {
        id, innerHTML: "", innerText: "", value: "", style: {}, disabled: false, rolou: 0,
        classList: { add() {}, remove() {}, toggle() {} },
        scrollIntoView() { this.rolou++; },
    });
    const chamadas = { alertas: [], planilhas: [], grafico: null, filtroColuna: null };

    const XLSX = {
        utils: {
            book_new: () => ({ abas: [] }),
            json_to_sheet: (linhas) => ({ linhas }),
            aoa_to_sheet: (linhas) => ({ linhas }),
            book_append_sheet: (wb, aba, nome) => wb.abas.push({ nome, aba }),
        },
        writeFile: (wb) => { chamadas.planilhas = wb.abas; },
    };

    const ctx = vm.createContext({
        console, XLSX,
        document: { getElementById: el },
        gcAlert: (m) => chamadas.alertas.push(m),
        skMostrar() {}, skFim() {}, mostrarTela() {},
        colfAbrir: (btn, opcoes) => { chamadas.filtroColuna = opcoes; },
        colfCompara: () => 0,
        fetch: () => new Promise(() => {}),
        API: "", token: "",
    });
    vm.runInContext(fonte + ACESSOR, ctx, { filename: "shopee-stuck-backlog.js" });
    // O gráfico recebe a lista que a tela decidiu: espia em vez de montar Chart.js.
    ctx._sstbGraficar = (lista) => { chamadas.grafico = lista.length; };
    return { ctx, els, chamadas, b: ctx.__b };
}

/** n pedidos P001..Pn, na ordem do servidor (mais parado primeiro), alternando respostas. */
function pedidos(n, resposta = null) {
    const ciclo = ["sem_ativo", "recebeu", "nao_recebeu", "sem_resposta"];
    return Array.from({ length: n }, (_, i) => ({
        shipment_id: "P" + String(i + 1).padStart(3, "0"),
        dias: 40 - i * 0.02,
        latest_status: i % 2 ? "Hub_Assigned" : "Delivering",
        latest_user_name: "u",
        resposta: resposta || ciclo[i % 4],
    }));
}

const linhas = (els) => (els["sstb-tbody"].innerHTML.match(/<tr>/g) || []).length;
const ids = (els) => [...els["sstb-tbody"].innerHTML.matchAll(/>(P\d{3})</g)].map((m) => m[1]);
const info = (els) => els["sstb-pag-info"].innerText;
const contagens = (h) => [...h.matchAll(/<b>([\d.]+)<\/b>/g)].map((m) => Number(m[1].replace(/\./g, "")));
const valores = (h) => [...h.matchAll(/nr-tile-valor">([\d.]+)</g)].map((m) => Number(m[1].replace(/\./g, "")));

// ── o tamanho e a divisão ────────────────────────────────────────────────
test("a página tem 50 pedidos", () => {
    const { b } = carregar();
    assert.strictEqual(b.porPagina, 50);
});

test("120 pedidos: a primeira página desenha 50, com o rodapé '1–50 de 120'", () => {
    const { b, els, ctx } = carregar();
    b.regs = pedidos(120);
    ctx._sstbRenderizar();
    assert.strictEqual(linhas(els), 50);
    assert.strictEqual(els["sstb-paginacao"].style.display, "", "rodapé visível");
    assert.strictEqual(info(els), "1–50 de 120");
    assert.strictEqual(els["sstb-pag-ant"].disabled, true, "não há página antes da primeira");
    assert.strictEqual(els["sstb-pag-prox"].disabled, false);
});

test("as páginas seguem a ordem do servidor, sem pular nem repetir pedido", () => {
    const { b, els, ctx } = carregar();
    b.regs = pedidos(120);
    ctx._sstbRenderizar();
    const p1 = ids(els);
    ctx._sstbTrocarPagina(1);
    const p2 = ids(els);
    ctx._sstbTrocarPagina(1);
    const p3 = ids(els);

    assert.strictEqual(p1[0] + p1[49], "P001P050");
    assert.strictEqual(p2[0] + p2[49], "P051P100");
    assert.strictEqual(p3[0] + p3[19], "P101P120");
    assert.strictEqual(new Set([...p1, ...p2, ...p3]).size, 120, "os 120, cada um uma vez");
});

test("a segunda e a última página mostram o intervalo certo e travam o botão do fim", () => {
    const { b, els, ctx } = carregar();
    b.regs = pedidos(120);
    ctx._sstbRenderizar();
    ctx._sstbTrocarPagina(1);
    assert.strictEqual(info(els), "51–100 de 120");
    assert.strictEqual(els["sstb-pag-ant"].disabled, false);
    assert.strictEqual(els["sstb-pag-prox"].disabled, false);

    ctx._sstbTrocarPagina(1);
    assert.strictEqual(linhas(els), 20);
    assert.strictEqual(info(els), "101–120 de 120");
    assert.strictEqual(els["sstb-pag-prox"].disabled, true);

    ctx._sstbTrocarPagina(-1);
    assert.strictEqual(info(els), "51–100 de 120", "e dá pra voltar");
});

test("exatamente 50 cabem numa página: sem rodapé; 51 já viram duas", () => {
    const { b, els, ctx } = carregar();
    b.regs = pedidos(50);
    ctx._sstbRenderizar();
    assert.strictEqual(linhas(els), 50);
    assert.strictEqual(els["sstb-paginacao"].style.display, "none");

    b.regs = pedidos(51);
    ctx._sstbRenderizar();
    assert.strictEqual(linhas(els), 50);
    assert.strictEqual(els["sstb-paginacao"].style.display, "");
    ctx._sstbTrocarPagina(1);
    assert.strictEqual(linhas(els), 1, "o 51º sozinho na segunda página");
    assert.strictEqual(info(els), "51–51 de 51");
});

test("milhar no total do rodapé usa ponto, como o resto da tela", () => {
    const { b, els, ctx } = carregar();
    b.regs = pedidos(1234);
    ctx._sstbRenderizar();
    assert.strictEqual(info(els), "1–50 de 1.234");
});

test("trocar de página sobe até a faixa de filtros (o topo da tabela)", () => {
    const { b, els, ctx } = carregar();
    b.regs = pedidos(120);
    ctx._sstbRenderizar();
    ctx._sstbTrocarPagina(1);
    assert.strictEqual(els["sstb-resp-filtro"].rolou, 1);
});

// ── só a tabela pagina ───────────────────────────────────────────────────
test("cards, pílulas e gráfico contam a lista INTEIRA, não a página", () => {
    const { b, els, ctx, chamadas } = carregar();
    b.regs = pedidos(120);
    ctx._sstbRenderizar();
    assert.strictEqual(valores(els["sstb-tiles"].innerHTML)[0], 120, "o Total não é 50");
    assert.strictEqual(contagens(els["sstb-resp-filtro"].innerHTML).reduce((a, n) => a + n, 0), 120);
    assert.strictEqual(chamadas.grafico, 120, "o gráfico de status recebe os 120");

    ctx._sstbTrocarPagina(1);
    assert.strictEqual(valores(els["sstb-tiles"].innerHTML)[0], 120, "e trocar de página não muda o número");
    assert.strictEqual(chamadas.grafico, 120);
});

test("o relatório leva o backlog inteiro, esteja a tela na página que estiver", () => {
    const { b, ctx, chamadas } = carregar();
    b.regs = pedidos(120);
    ctx._sstbRenderizar();
    ctx._sstbTrocarPagina(2);
    ctx._sstbBaixar();
    const aba = chamadas.planilhas.find((a) => a.nome === "Pedidos").aba.linhas;
    assert.strictEqual(aba.length, 120, "não são só os 20 da terceira página");
});

// ── todo recorte novo volta pra página 1 ─────────────────────────────────
// 400 pedidos, e os recortes abaixo deixam mais de uma página: com lista curta o
// "clamp" (puxar a página pra última que existe) esconderia um reset esquecido.
function naPagina3() {
    const t = carregar();
    t.b.regs = pedidos(400);
    t.ctx._sstbRenderizar();
    t.ctx._sstbTrocarPagina(1);
    t.ctx._sstbTrocarPagina(1);
    assert.strictEqual(t.b.pagina, 3, "preparo: começa na página 3");
    return t;
}

test("busca por pedido volta pra página 1", () => {
    const { b, els, ctx } = naPagina3();
    els["sstb-busca"] = { value: "P1" };   // P100..P199: 100 pedidos, 2 páginas
    ctx._sstbFiltrar();
    assert.strictEqual(b.pagina, 1);
    assert.strictEqual(info(els), "1–50 de 100");
});

test("clicar num card de dias (ou no Total) volta pra página 1", () => {
    const a = naPagina3();
    a.ctx._sstbClicarFaixa("d6");
    assert.strictEqual(a.b.pagina, 1);

    const c = naPagina3();
    c.ctx._sstbClicarTotal();
    assert.strictEqual(c.b.pagina, 1);
});

test("clicar numa pílula de resposta volta pra página 1", () => {
    const { b, els, ctx } = naPagina3();
    ctx._sstbClicarResposta("recebeu");   // 1 a cada 4: 100 pedidos, 2 páginas
    assert.strictEqual(b.pagina, 1);
    assert.strictEqual(info(els), "1–50 de 100");
});

test("aplicar filtro de coluna (Status ou Último usuário) volta pra página 1", () => {
    const s = naPagina3();
    s.ctx._sstbAbrirFiltroStatus({ classList: { toggle() {} } });
    s.chamadas.filtroColuna.aoAplicar(new Set(["Hub_Assigned"]), null);
    assert.strictEqual(s.b.pagina, 1);

    const u = naPagina3();
    u.ctx._sstbAbrirFiltroUsuario({ classList: { toggle() {} } });
    u.chamadas.filtroColuna.aoAplicar(new Set(["u"]), null);
    assert.strictEqual(u.b.pagina, 1);
});

test("recarregar o backlog volta pra página 1", async () => {
    const { b, els, ctx } = naPagina3();
    ctx.fetch = () => Promise.resolve({
        ok: true, json: async () => ({ estacao: "XPT", registros: pedidos(120), importado_em: null }),
    });
    ctx._sstbCarregar();
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(b.pagina, 1);
    assert.strictEqual(info(els), "1–50 de 120");
});

test("sair e voltar pra tela começa na página 1", () => {
    const { b, ctx } = naPagina3();
    ctx.abrirShopeeStuckBacklog();
    assert.strictEqual(b.pagina, 1);
});

test("página que deixou de existir é puxada pra última - nunca tabela vazia", () => {
    const { b, els, ctx } = carregar();
    b.regs = pedidos(200);
    ctx._sstbRenderizar();
    b.pagina = 4;
    b.regs = pedidos(30);          // a lista encolheu por baixo
    ctx._sstbRenderizar();
    assert.strictEqual(b.pagina, 1);
    assert.strictEqual(linhas(els), 30);
    assert.strictEqual(els["sstb-paginacao"].style.display, "none");
});

// ── o HTML ───────────────────────────────────────────────────────────────
test("o rodapé existe uma vez, usa as classes da tela de Devoluções e fica depois da tabela", () => {
    for (const id of ["sstb-paginacao", "sstb-pag-ant", "sstb-pag-info", "sstb-pag-prox"]) {
        const n = (html.match(new RegExp(`id="${id}"`, "g")) || []).length;
        assert.strictEqual(n, 1, `id="${id}" precisa existir uma vez (achei ${n})`);
    }
    assert.ok(html.includes('onclick="_sstbTrocarPagina(-1)"') && html.includes('onclick="_sstbTrocarPagina(1)"'));

    const rodape = html.slice(html.indexOf('id="sstb-paginacao"') - 40, html.indexOf('id="sstb-pag-prox"') + 120);
    assert.ok(rodape.includes("shr-paginacao") && rodape.includes("shr-pag-btn") && rodape.includes("shr-pag-info"),
        "mesmo visual do rodapé de Devoluções");
    assert.ok(html.indexOf('id="sstb-tbody"') < html.indexOf('id="sstb-paginacao"'), "o rodapé vem depois da tabela");
    assert.ok(html.slice(html.indexOf('id="sstb-paginacao"')).includes('style="display:none"') ||
              /id="sstb-paginacao" style="display:none"/.test(html), "nasce escondido");
});
