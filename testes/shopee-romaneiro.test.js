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
    _shlExportarPeriodo, _shlAbrirExportar, _shlCalClick,
    SHL_COLUNAS_EXPORTAR,
    _shlCodigosDoTexto, _shlPesquisar, _shlBaixarPesquisa, _shlLimparPesquisa, _shlLinhasPesquisa,
    SHL_COLUNAS_PESQUISA,
    envios: () => _shlEnvios,
};`;

function elementoFalso() {
    return { innerHTML: "", innerText: "", className: "", style: {}, classList: { add() {}, remove() {}, toggle() {} } };
}

// Monta o contexto com fetch, XLSX e alertas de mentira. `respostas` é a lista de corpos
// que o fetch devolve, na ordem.
function carregar(respostas) {
    const elementos = {};
    const chamadas = { fetch: [], corpos: [], planilhas: [], alertas: [], modais: [] };
    const fila = [...respostas];
    const contexto = vm.createContext({
        console, Date, URLSearchParams, Promise,
        document: { getElementById: id => (elementos[id] ||= elementoFalso()) },
        window: { _gcUser: { role: "operador" } },
        API: "https://api.teste", token: "tk",
        skMostrar() {}, skFim() {},
        gcAlert: m => chamadas.alertas.push(m),
        _abrirModal: id => chamadas.modais.push("abrir:" + id),
        _fecharModal: id => chamadas.modais.push("fechar:" + id),
        fetch: (url, op) => {
            chamadas.fetch.push(url);
            chamadas.corpos.push(op && op.body ? JSON.parse(op.body) : null);
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
        "Arquivo", "Data do envio ao XM", "Hora do envio ao XM", "Enviado ao XM por",
    ]);
    const [linha, semCarimbo] = api._shlLinhasPlanilha([{
        horario_entrega: "08:00", pedido_tn: "BRTESTE01", origem: "SOC_T", destino: "XPT_T",
        numero_to: "TO-T1", rota_lh: "LH-T", arquivo: "a.xlsx", importado_por: "Fulano Teste",
        importado_em: "2026-10-20T13:05:09.000Z",
    }, { pedido_tn: "BRTESTE02", importado_em: null }]);
    assert.strictEqual(linha["Pedido (TN)"], "BRTESTE01");
    // 13:05 UTC = 10:05 em Brasília
    assert.strictEqual(linha["Data do envio ao XM"], "20/10/2026");
    assert.strictEqual(linha["Hora do envio ao XM"], "10:05:09");
    assert.strictEqual(linha["Enviado ao XM por"], "Fulano Teste");
    assert.strictEqual(semCarimbo["Data do envio ao XM"], "");
});

test("exportar abre com hoje marcado, como o do Recebimento", () => {
    const { api, elementos, chamadas } = carregar([]);
    api._shlAbrirExportar();
    assert.deepStrictEqual(chamadas.modais, ["abrir:modal-shl-exportar"]);
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    assert.match(elementos["shl-cal"].innerHTML, /intervalo-unico/);
    assert.match(elementos["shl-cal"].innerHTML, new RegExp(`_shlCalClick\\('${hoje}'\\)`));
});

test("calendario: dois cliques marcam o periodo e o download pede de/ate e fecha o modal", async () => {
    const { api, chamadas } = carregar([{ pedidos: [{ pedido_tn: "BRTESTE01" }] }]);
    api._shlAbrirExportar();
    api._shlCalClick("2026-10-01"); // intervalo fechado (hoje-hoje) → começa seleção nova
    api._shlCalClick("2026-10-20");
    api._shlExportarPeriodo();
    await espera();
    assert.strictEqual(chamadas.fetch[0], "https://api.teste/shopee/lh/pedidos?de=2026-10-01&ate=2026-10-20");
    assert.strictEqual(chamadas.planilhas[0].nome, "romaneiro_2026-10-01_a_2026-10-20.xlsx");
    assert.deepStrictEqual(chamadas.modais, ["abrir:modal-shl-exportar", "fechar:modal-shl-exportar"]);
});

test("calendario: clicar antes do inicio inverte as pontas", async () => {
    const { api, chamadas } = carregar([{ pedidos: [{ pedido_tn: "BRTESTE01" }] }]);
    api._shlAbrirExportar();
    api._shlCalClick("2026-10-20");
    api._shlCalClick("2026-10-01");
    api._shlExportarPeriodo();
    await espera();
    assert.strictEqual(chamadas.fetch[0], "https://api.teste/shopee/lh/pedidos?de=2026-10-01&ate=2026-10-20");
});

test("calendario: uma data so baixa aquele dia", async () => {
    const { api, chamadas } = carregar([{ pedidos: [{ pedido_tn: "BRTESTE01" }] }]);
    api._shlAbrirExportar();
    api._shlCalClick("2026-10-05");
    api._shlExportarPeriodo();
    await espera();
    assert.strictEqual(chamadas.fetch[0], "https://api.teste/shopee/lh/pedidos?de=2026-10-05&ate=2026-10-05");
    assert.strictEqual(chamadas.planilhas[0].nome, "romaneiro_2026-10-05.xlsx");
});

test("periodo sem pedido avisa dentro do modal e ele continua aberto", async () => {
    const { api, elementos, chamadas } = carregar([{ pedidos: [] }]);
    api._shlAbrirExportar();
    api._shlExportarPeriodo();
    await espera();
    assert.strictEqual(elementos["shl-exp-erro"].innerText, "Nenhum pedido enviado nesse período.");
    assert.strictEqual(chamadas.alertas.length, 0);
    assert.deepStrictEqual(chamadas.modais, ["abrir:modal-shl-exportar"]);
});

test("index.html: botao Exportar abre o modal, que tem o calendario e o Baixar", () => {
    assert.match(indexHtml, /onclick="_shlAbrirExportar\(\)"/);
    assert.match(indexHtml, /id="modal-shl-exportar"/);
    assert.match(indexHtml, /<div class="shr-cal" id="shl-cal"><\/div>/);
    assert.match(indexHtml, /id="shl-exp-btn" onclick="_shlExportarPeriodo\(\)"/);
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

// ── pesquisar pedidos ────────────────────────────────────────────────────

const achado = {
    codigo: "BRTESTE0000001", horario_entrega: "2026-10-20 08:00", rota_lh: "LH-TESTE",
    numero_to: "TO-TESTE-1", origem: "SOC_TESTE", destino: "XPT_TESTE",
    recebido_em: "20/10/2026, 14:02:11", recebido_por: "Fulano Teste", recebido_xpt: "XPT_CFC",
};
const semNada = { codigo: "BRTESTE0000009", horario_entrega: null, rota_lh: null, numero_to: null,
    origem: null, destino: null, recebido_em: null };
const soNoRomaneiro = { ...achado, codigo: "BRTESTE0000002", recebido_em: null };

test("codigos do texto: linha, espaco, virgula e ponto e virgula; maiusculas e sem repetir", () => {
    const { api } = carregar([]);
    assert.deepStrictEqual([...api._shlCodigosDoTexto("brteste0000001\nBRTESTE0000002, BRTESTE0000003;  brteste0000001\r\n\t")],
        ["BRTESTE0000001", "BRTESTE0000002", "BRTESTE0000003"]);
    assert.strictEqual(api._shlCodigosDoTexto("   ").length, 0);
});

test("pesquisar manda os codigos no corpo e mostra a tabela com o resumo", async () => {
    const { api, elementos, chamadas } = carregar([{ pedidos: [achado, soNoRomaneiro, semNada] }]);
    elementos["shl-busca"] = { value: "brteste0000001\nBRTESTE0000002\nBRTESTE0000009" };
    api._shlPesquisar();
    await espera();
    assert.strictEqual(chamadas.fetch[0], "https://api.teste/shopee/lh/pesquisar");
    assert.deepStrictEqual(chamadas.corpos[0], { codigos: ["BRTESTE0000001", "BRTESTE0000002", "BRTESTE0000009"] });
    assert.strictEqual(elementos["shl-busca-resumo"].innerText,
        "3 pedidos pesquisados · 2 no romaneiro · 1 recebido no XM");
    const html = elementos["shl-busca-tbody"].innerHTML;
    assert.match(html, /20\/10\/2026, 14:02:11/);
    assert.match(html, /Não está no romaneiro/);
    assert.strictEqual((html.match(/Não recebido/g) || []).length, 2);
    assert.strictEqual(elementos["shl-busca-resultado"].style.display, "");
});

test("pesquisar sem codigo avisa e nao chama o servidor", () => {
    const { api, elementos, chamadas } = carregar([]);
    elementos["shl-busca"] = { value: " \n " };
    api._shlPesquisar();
    assert.strictEqual(chamadas.fetch.length, 0);
    assert.strictEqual(chamadas.alertas.length, 1);
});

test("planilha da pesquisa: colunas na ordem pedida e o motivo no lugar do vazio", async () => {
    const { api, elementos, chamadas } = carregar([{ pedidos: [achado, semNada] }]);
    assert.deepStrictEqual([...api.SHL_COLUNAS_PESQUISA.map(c => c.label)], [
        "Código", "Data Saída LH", "Data Recebimento no XM", "Rota de LH", "Número da TO", "Origem", "Destino",
    ]);
    elementos["shl-busca"] = { value: "BRTESTE0000001 BRTESTE0000009" };
    api._shlPesquisar();
    await espera();
    api._shlBaixarPesquisa();
    const { wb, nome } = chamadas.planilhas[0];
    assert.match(nome, /^romaneiro_pesquisa_\d{4}-\d{2}-\d{2}\.xlsx$/);
    const [l1, l2] = wb.abas[0].ws.linhas;
    assert.strictEqual(l1["Data Saída LH"], "2026-10-20 08:00");
    assert.strictEqual(l1["Data Recebimento no XM"], "20/10/2026, 14:02:11");
    assert.strictEqual(l1["Número da TO"], "TO-TESTE-1");
    assert.strictEqual(l2["Data Saída LH"], "Não está no romaneiro");
    assert.strictEqual(l2["Data Recebimento no XM"], "Não recebido");
});

test("limpar apaga a lista e esconde o resultado; baixar depois avisa", async () => {
    const { api, elementos, chamadas } = carregar([{ pedidos: [achado] }]);
    elementos["shl-busca"] = { value: "BRTESTE0000001" };
    api._shlPesquisar();
    await espera();
    api._shlLimparPesquisa();
    assert.strictEqual(elementos["shl-busca"].value, "");
    assert.strictEqual(elementos["shl-busca-resultado"].style.display, "none");
    api._shlBaixarPesquisa();
    assert.strictEqual(chamadas.planilhas.length, 0);
    assert.strictEqual(chamadas.alertas.length, 1);
});

test("index.html: caixa de pesquisa, botoes e tabela de resultado", () => {
    assert.match(indexHtml, /<textarea id="shl-busca"/);
    assert.match(indexHtml, /id="shl-busca-btn" onclick="_shlPesquisar\(\)"/);
    assert.match(indexHtml, /onclick="_shlBaixarPesquisa\(\)"/);
    assert.match(indexHtml, /<tbody id="shl-busca-tbody"><\/tbody>/);
});
