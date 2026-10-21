// Testes da tela Shopee > Alimentar > Romaneiro (js/shopee-romaneiro.js), parte de exportar.
//
// O que se trava aqui: cada envio do histórico tem "Baixar" e cada dia tem "Baixar o dia";
// o botão de um envio aponta pelo índice, então nome de arquivo com aspas não quebra o
// onclick; a planilha sai com as colunas do romaneiro na ordem da prévia; e o pedido ao
// servidor leva o recorte certo (dia ou envio).
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonteJs = fs.readFileSync(path.join(__dirname, "..", "js", "shopee-romaneiro.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const ponte = `
;globalThis.__shl = {
    _shlCarregarHistorico, _shlLinhasPlanilha, _shlNomeEnvio, _shlExportarDia, _shlExportarEnvio,
    SHL_COLUNAS_EXPORTAR,
    envios: () => _shlEnvios,
};`;

function elementoFalso() {
    return { innerHTML: "", innerText: "", className: "", style: {}, classList: { add() {}, remove() {}, toggle() {} } };
}

// Monta o contexto com fetch, XLSX e alertas de mentira. `respostas` é a lista de corpos
// que o fetch devolve, na ordem.
function carregar(respostas) {
    const elementos = {};
    const chamadas = { fetch: [], planilhas: [], alertas: [] };
    const fila = [...respostas];
    const contexto = vm.createContext({
        console, Date, URLSearchParams, Promise,
        document: { getElementById: id => (elementos[id] ||= elementoFalso()) },
        window: { _gcUser: { role: "operador" } },
        API: "https://api.teste", token: "tk",
        skMostrar() {}, skFim() {},
        gcAlert: m => chamadas.alertas.push(m),
        fetch: url => {
            chamadas.fetch.push(url);
            const corpo = fila.shift();
            return Promise.resolve({ ok: !corpo.error, json: () => Promise.resolve(corpo) });
        },
        XLSX: {
            utils: {
                json_to_sheet: (linhas, op) => ({ linhas, header: op.header }),
                book_new: () => ({ abas: [] }),
                book_append_sheet: (wb, ws, nome) => wb.abas.push({ ws, nome }),
            },
            writeFile: (wb, nome) => chamadas.planilhas.push({ wb, nome }),
        },
    });
    contexto.globalThis = contexto;
    vm.runInContext(fonteJs + ponte, contexto, { filename: "shopee-romaneiro.js" });
    return { api: contexto.__shl, elementos, chamadas };
}

const espera = () => new Promise(r => setImmediate(r));

const historico = {
    importacoes: [
        { importado_em: "2026-10-20T14:00:00.001Z", dia: "2026-10-20", arquivo: "carga 'manha'.xlsx", importado_por: "Fulano Teste", linhas: 3 },
        { importado_em: "2026-10-20T14:00:00.000Z", dia: "2026-10-20", arquivo: "carga_tarde.csv", importado_por: "Fulano Teste", linhas: 2 },
    ],
    dias: [{ dia: "2026-10-20", linhas: 5, envios: 2 }],
    total: 5,
};

const btnFalso = () => ({ disabled: false, textContent: "Baixar" });

test("historico: um Baixar por envio e um Baixar o dia por dia, apontando pelo indice", async () => {
    const { api, elementos } = carregar([historico]);
    api._shlCarregarHistorico();
    await espera();
    const html = elementos["shl-hist-tbody"].innerHTML;
    assert.strictEqual((html.match(/_shlExportarEnvio\(this,\d+\)/g) || []).length, 2);
    assert.match(html, /_shlExportarEnvio\(this,0\)/);
    assert.match(html, /_shlExportarEnvio\(this,1\)/);
    assert.match(html, /_shlExportarDia\(this,'2026-10-20'\)/);
    // operador não remove
    assert.ok(!html.includes("_shlRemover("));
});

test("index.html: coluna de acao do historico visivel pra todos e a funcao existe na tela", () => {
    assert.match(indexHtml, /<th id="shl-th-acao"><\/th>/);
});

test("planilha sai com as colunas do romaneiro na ordem da previa e depois a origem da linha", () => {
    const { api } = carregar([]);
    // [...] traz o array pro contexto do teste: o do vm tem outro protótipo e o deepStrictEqual recusa.
    assert.deepStrictEqual([...api.SHL_COLUNAS_EXPORTAR.map(c => c.label)], [
        "Horário de entrega", "Pedido (TN)", "Origem", "Destino", "Número da TO", "Rota de LH",
        "Arquivo", "Enviado por", "Enviado em",
    ]);
    const [linha] = api._shlLinhasPlanilha([{
        horario_entrega: "08:00", pedido_tn: "BRTESTE01", origem: "SOC_T", destino: "XPT_T",
        numero_to: "TO-T1", rota_lh: "LH-T", arquivo: "a.xlsx", importado_por: "Fulano Teste",
        importado_em: null,
    }]);
    assert.strictEqual(linha["Pedido (TN)"], "BRTESTE01");
    assert.strictEqual(linha["Enviado em"], "");
});

test("nome do arquivo baixado tira a extensao do original", () => {
    const { api } = carregar([]);
    assert.strictEqual(api._shlNomeEnvio({ arquivo: "Carga LH.XLSX" }), "romaneiro_Carga LH");
    assert.strictEqual(api._shlNomeEnvio({ arquivo: null, dia: "2026-10-20" }), "romaneiro_2026-10-20");
});

test("baixar envio pede so aquele envio e grava a planilha com o nome dele", async () => {
    const pedido = { pedido_tn: "BRTESTE01", importado_em: "2026-10-20T14:00:00.000Z" };
    const { api, chamadas } = carregar([historico, { pedidos: [pedido] }]);
    api._shlCarregarHistorico();
    await espera();
    const btn = btnFalso();
    api._shlExportarEnvio(btn, 0);
    assert.strictEqual(btn.textContent, "Gerando...");
    await espera();
    assert.strictEqual(chamadas.fetch[1],
        "https://api.teste/shopee/lh/pedidos?importado_em=2026-10-20T14%3A00%3A00.001Z");
    assert.strictEqual(chamadas.planilhas.length, 1);
    assert.strictEqual(chamadas.planilhas[0].nome, "romaneiro_carga 'manha'.xlsx");
    assert.strictEqual(btn.textContent, "Baixar");
    assert.strictEqual(btn.disabled, false);
});

test("baixar o dia pede pelo dia", async () => {
    const { api, chamadas } = carregar([{ pedidos: [{ pedido_tn: "BRTESTE01" }] }]);
    api._shlExportarDia(btnFalso(), "2026-10-20");
    await espera();
    assert.strictEqual(chamadas.fetch[0], "https://api.teste/shopee/lh/pedidos?dia=2026-10-20");
    assert.strictEqual(chamadas.planilhas[0].nome, "romaneiro_2026-10-20.xlsx");
});

test("erro do servidor vira aviso e nao gera planilha", async () => {
    const { api, chamadas } = carregar([{ error: "Mais de 200.000 linhas — exporte por envio." }]);
    api._shlExportarDia(btnFalso(), "2026-10-20");
    await espera();
    assert.strictEqual(chamadas.planilhas.length, 0);
    assert.deepStrictEqual(chamadas.alertas, ["Mais de 200.000 linhas — exporte por envio."]);
});
