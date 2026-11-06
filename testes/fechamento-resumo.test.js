// Resumo da Quinzena: filtro, ordem e planilha exportada. Dados inventados.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const DADOS = {
    transportadoras: { shopee_cfc: { nome: "Shopee Caçador", enviado: true, pacotes: 100, valor: 250 },
        imile: { nome: "Imile", enviado: true, pacotes: 50, valor: 120 }, total: { nome: "Total Express", enviado: false, pacotes: 0, valor: 0 } },
    linhas: [
        { entregador: "Fulano de Teste - Vila Teste", polo: "Caçador", sem_conversao: false, por_transp: { shopee_cfc: { pacotes: 100, valor: 250 }, imile: { pacotes: 50, valor: 120 } },
            pacotes: 150, bruto: 370, ticketlog: 80, extravios: 20, acrescimos: 10, descontos: 5, liquido: 275, ticketlog_divergencias: 0 },
        { entregador: "Beltrano Exemplo - Morro", polo: "Videira", sem_conversao: false, por_transp: { imile: { pacotes: 5, valor: 15 } },
            pacotes: 5, bruto: 15, ticketlog: 0, liquido: 15, ticketlog_divergencias: 0 },
        { entregador: "usuario.sem", polo: null, sem_conversao: true, por_transp: { imile: { pacotes: 1, valor: 3 } },
            pacotes: 1, bruto: 3, ticketlog: 0, liquido: 3, ticketlog_divergencias: 0 },
    ],
    opcoes: { polos: ["Caçador", "Videira"], entregadores: ["Fulano de Teste - Vila Teste"], cidades: ["Vila Teste"] },
    totais: { entregadores: 2, pacotes: 156, bruto: 388, ticketlog: 80, liquido: 308, sem_conversao: { linhas: 1, valor: 3 }, ticketlog_sem_nome: 0 },
    ticketlog_arquivos: 1,
    extravios_linhas: [{ driver: "Fulano de Teste - Vila Teste", responsavel: "FULANO DE TESTE", status: "Extravio", transportadora: "Imile",
        data: "20/09/2026", codigo: "C1", valor: 20, causa: "", data_desconto: "Q2Set", sem_conversao: false },
        { driver: "Fora do Arquivo", responsavel: "x", status: "Multa", valor: 1, sem_conversao: true }],
    ajustes_linhas: [{ id: 1, driver: "Fulano de Teste - Vila Teste", tipo: "acrescimo", valor: 10, descricao: "ajuda" }],
};

function carregar() {
    const els = new Map();
    const el = (id) => { if (!els.has(id)) els.set(id, { id, value: "", innerHTML: "", innerText: "", style: {}, classList: { toggle() {} } }); return els.get(id); };
    const caixas = [];
    const ctx = { console, API: "https://api.teste", token: "tok", document: { getElementById: el, querySelectorAll: () => caixas }, mostrarTela() {} };
    vm.createContext(ctx);
    // As colunas do detalhado vêm do Criar Fechamento (os dois scripts estão na página).
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-criar.js"), "utf8"), ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "fechamento-resumo.js"), "utf8"), ctx);
    vm.runInContext("_rqDados = " + JSON.stringify(DADOS), ctx);
    // A tela abre no "Do cheio ao líquido" (busca no servidor); estes testes olham a aba de valores, que segue lá (oculta).
    vm.runInContext("var skLogo = () => ''; var _chCarregar = () => {}; _rqAba = 'valores';", ctx);
    return { ctx, el, caixas };
}

test("só aparecem colunas das transportadoras que subiram; sem conversão fica no fim", () => {
    const { ctx, el } = carregar();
    ctx._rqRender();
    const head = el("rq-thead").innerHTML;
    assert.match(head, /Shopee Caçador/);
    assert.doesNotMatch(head, /Total Express/);
    assert.match(el("rq-conteudo").innerHTML, /Sem relatório nesta quinzena: Total Express/);
    ctx._rqOrdenar("liquido");
    const corpo = el("rq-tbody").innerHTML;
    assert.ok(corpo.indexOf("Fulano") < corpo.indexOf("Beltrano") && corpo.indexOf("Beltrano") < corpo.indexOf("usuario.sem"));
});

const PAC = [
    { transportadora: "Imile", driver: "Fulano de Teste - Vila Teste", usuario: "f", polo: "Caçador", cidade: "Vila Teste", valor_motorista: 3, codigo: "I1" },
    { transportadora: "Shopee Caçador", driver: "Fulano de Teste - Vila Teste", usuario: "f", polo: "Caçador", cidade: "Vila Teste", valor_motorista: 2.5, codigo: "S1" },
    { transportadora: "Imile", driver: null, usuario: "usuario.sem", polo: null, cidade: "Morro", valor_motorista: 3, codigo: "I2" },
];

test("detalhado: uma aba por transportadora com as colunas do Criar Fechamento, Performance e Resumo no fim", () => {
    const { ctx } = carregar();
    const perf = [{ driver: "Fulano de Teste - Vila Teste", dia: "2026-09-21", shopee: 1, onholds: 0, outras_prazo: 1, outras_atraso: 0, pct: 100, valor: 2.5, pacotes_pagos: 2, total: 5 },
        { driver: "Outro Fora - X", dia: "2026-09-21", shopee: 1, onholds: 0, outras_prazo: 0, outras_atraso: 0, pct: 100, valor: 2.5, pacotes_pagos: 1, total: 2.5 }];
    const ins = [{ driver: "Fulano de Teste - Vila Teste", dia: "2026-09-21", tipo: "Onhold", transportadora: "Shopee Caçador", codigo: "BRX", motivo: "Cliente ausente" },
        { driver: "Fulano de Teste - Vila Teste", dia: "2026-09-21", tipo: "Atrasado", transportadora: "Imile", codigo: "I9", deveria: "2026-09-21", entregue: "2026-09-22",
          ocorrencia: "2026-09-22" }];
    ins[0].ocorrencia = "2026-09-21"; ins[0].ocorrencia_hora = "14:40";
    const abas = JSON.parse(JSON.stringify(ctx._rqMontarAbas(PAC, { polo: "", driver: "", cidade: "", transportadora: "" }, perf, ins)));
    assert.deepStrictEqual(abas.map(a => a.nome), ["Todas as transportadoras", "Performance", "Insucessos", "Extravios", "Acréscimos e descontos", "Resumo"]);
    // todas juntas: os 3 pacotes numa aba, com as colunas completas
    assert.strictEqual(abas[0].linhas.length, 4);
    assert.ok(abas[0].linhas[0].includes("Deve ser entregue"));
    // performance: linha do dia + 2 insucessos agrupados (nível 1, escondidos), "+" em cima
    const p = abas[1];
    assert.deepStrictEqual(p.linhas.slice(1, 4).map(l => l[1]), ["Fulano de Teste - Vila Teste", "   ↳ Onhold", "   ↳ Atrasado"]);
    assert.deepStrictEqual(p.rows.slice(1, 4), [{}, { level: 1, hidden: true }, { level: 1, hidden: true }]);
    assert.deepStrictEqual(p.outline, { above: true });
    assert.strictEqual(p.rows.filter(r => !r.level).length, 2, "performance só de quem está no arquivo (cabeçalho + 1 dia)");
    // insucessos com a data da ocorrência (onhold com a hora)
    assert.deepStrictEqual(abas[2].linhas[1].slice(2, 4), ["Onhold", "21/09/26 14:40"]);
    assert.deepStrictEqual(abas[2].linhas[2].slice(2, 8), ["Atrasado", "22/09/26", "Imile", "I9", "21/09/26", "22/09/26"]);
    assert.deepStrictEqual(abas[3].linhas[1].slice(0, 3), ["Fulano de Teste - Vila Teste", "FULANO DE TESTE", "Extravio"]);
    assert.deepStrictEqual(abas[4].linhas[1], ["Fulano de Teste - Vila Teste", "Acréscimo", 10, "ajuda"]);
    assert.deepStrictEqual(abas[5].linhas, [
        ["Entregador", "Polo", "Imile (R$)", "Shopee Caçador (R$)", "Pacotes", "Bruto", "Acréscimos", "Deslocamento", "Ticketlog", "Extravios", "Descontos", "Líquido"],
        ["Fulano de Teste - Vila Teste", "Caçador", 3, 2.5, 2, 5.5, 10, 0, 80, 20, 5, -89.5],
        ["usuario.sem (sem conversão)", "", 3, 0, 1, 3, 0, 0, 0, 0, 0, 3],
    ]);
});

test("resumo sem Ticketlog quando filtra cidade ou transportadora (desconto é do entregador inteiro)", () => {
    const { ctx } = carregar();
    const cab = (f) => JSON.parse(JSON.stringify(ctx._rqAbaResumo(PAC.slice(0, 2), f)))[0];
    assert.deepStrictEqual(cab({ cidades: ["Vila Teste"] }), ["Entregador", "Polo", "Imile (R$)", "Shopee Caçador (R$)", "Pacotes", "Bruto"]);
    assert.strictEqual(cab({ parcialTransp: true }).includes("Ticketlog"), false);
    assert.strictEqual(cab({ cidades: [] }).includes("Ticketlog"), true);
});

test("cidades: colar lista casa sem acento/caixa/UF, não repete, avisa as que não existem", () => {
    const { ctx, el } = carregar();
    vm.runInContext(`_rqDados.opcoes = { cidades: ["Caçador", "Vila Teste", "São José"] }`, ctx);
    ctx._rqAddCidades("CACADOR\nvila teste - SC; Lugar Nenhum,  , São José/SC\ncaçador");
    const nomes = () => vm.runInContext("_rqXCidades.map(c => c.nome).join('|')", ctx);
    assert.strictEqual(nomes(), "Caçador|Vila Teste|São José");
    assert.deepStrictEqual([...vm.runInContext("_rqXNaoAchadas", ctx)], ["Lugar Nenhum"]);
    assert.match(el("rq-x-cidades").innerHTML, /3 cidade\(s\)/);
    assert.match(el("rq-x-cidades").innerHTML, /Sem pacote nesta quinzena:<\/span> Lugar Nenhum/);
    ctx._rqTirarCidade(0);
    assert.strictEqual(nomes(), "Vila Teste|São José");
});

test("cidades: uma escolha pega todas as grafias da quinzena (Joaçaba, JOACABA, Joacaba...)", () => {
    const { ctx, el } = carregar();
    vm.runInContext(`_rqDados.opcoes = { cidades: ["JOACABA", "Joacaba", "Joaçaba", "joaçaba", "Herval D'Oeste", "HERVAL DOESTE", "Luzerna"] }`, ctx);
    const grupos = JSON.parse(JSON.stringify(ctx._rqGruposCidades()));
    assert.deepStrictEqual(grupos.map(g => [g.nome, g.variantes.length]), [["Herval D'Oeste", 2], ["Joaçaba", 4], ["Luzerna", 1]]);
    ctx._rqAddCidades("joacaba");
    ctx._rqAddCidades("Herval d oeste");
    assert.strictEqual(vm.runInContext("_rqXCidades.flatMap(c => c.variantes).join('|')", ctx), "JOACABA|Joacaba|Joaçaba|joaçaba|Herval D'Oeste|HERVAL DOESTE");
    assert.match(el("rq-x-cidades").innerHTML, /Joaçaba <span class="cft-ajuda">\+3<\/span>/);
});

test("baixar manda transportadoras marcadas, polo, entregador e as cidades", async () => {
    const { ctx, el, caixas } = carregar();
    ctx._rqRender();
    caixas.push({ value: "shopee_cfc", checked: false }, { value: "imile", checked: true });
    vm.runInContext(`_rqMes = 9; _rqAno = 2026; _rqQuinzena = 2;
        _rqXCidades = [{ chave: "vilateste", nome: "Vila Teste", variantes: ["Vila Teste"] }, { chave: "cacador", nome: "Caçador", variantes: ["Caçador", "CACADOR"] }];`, ctx);
    const urls = [];
    let gravado = null;
    ctx.fetch = async (u) => { urls.push(u); return { ok: true, json: async () => (u.includes("/performance") ? { linhas: [] } : { pacotes: PAC.slice(0, 1) }) }; };
    ctx.XLSX = { utils: { book_new: () => ({ abas: [] }), aoa_to_sheet: (a) => a, book_append_sheet: (wb, ws, n) => wb.abas.push(n) },
        writeFile: (wb, nome) => { gravado = [wb.abas, nome]; } };
    el("rq-x-polo").value = "Caçador"; el("rq-x-driver").value = "";
    await ctx._rqBaixar();
    assert.match(urls[0], /resumo-quinzena\/pacotes\?mes=9&ano=2026&quinzena=2&transportadoras=imile&polo=Ca%C3%A7ador&driver=&cidades=Vila%20Teste%7CCa%C3%A7ador%7CCACADOR$/);
    assert.strictEqual(urls.length, 1, "sem Shopee no arquivo não busca performance");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(gravado)), [["Todas as transportadoras", "Resumo"], "fechamento_2q_09-2026_Imile_Caçador_2-cidades.xlsx"]);

    // nenhuma marcada: não baixa
    caixas[1].checked = false;
    urls.length = 0;
    await ctx._rqBaixar();
    assert.strictEqual(urls.length, 0);
    assert.match(el("rq-x-status").innerText, /ao menos uma/);
});

// Aba Performance por entregador: soma dos dias da performance consolidada. Dados inventados.
const PERF = [
    { driver: "Fulano de Teste - Vila Teste", dia: "2026-09-16", polo: "Caçador", shopee: 90, onholds: 10, outras_prazo: 0, outras_atraso: 0, pct: 90, valor: 1.5, pacotes_pagos: 90, total: 135 },
    { driver: "Fulano de Teste - Vila Teste", dia: "2026-09-17", polo: "Caçador", shopee: 99, onholds: 0, outras_prazo: 0, outras_atraso: 1, pct: 99, valor: 2.5, pacotes_pagos: 99, total: 247.5 },
    { driver: "Beltrano Exemplo - Morro", dia: "2026-09-16", polo: "Videira", shopee: 100, onholds: 0, outras_prazo: 0, outras_atraso: 0, pct: 100, valor: 2.5, pacotes_pagos: 100, total: 250 },
];

test("performance: soma por entregador com performance da quinzena, pior dia e dias abaixo de 98%", () => {
    const { ctx } = carregar();
    const r = JSON.parse(JSON.stringify(ctx._rqPerfPorEntregador(PERF)));
    const f = r.find(x => x.entregador.startsWith("Fulano"));
    assert.strictEqual(f.dias_n, 2);
    assert.strictEqual(f.sucessos, 189);
    assert.strictEqual(f.onholds, 10);
    assert.strictEqual(f.atrasos, 1);
    assert.strictEqual(f.pct, 94.5);           // 189 ÷ 200
    assert.strictEqual(f.pior.dia, "2026-09-16");
    assert.strictEqual(f.abaixo, 1);
    assert.strictEqual(f.acima, f.dias_n - 1);
    assert.strictEqual(f.total, 382.5);
    assert.strictEqual(f.por_pacote, 2.02);
});

test("performance: aba lista o pior primeiro e respeita o funil de entregador", () => {
    const { ctx, el } = carregar();
    ctx._rqRender();
    vm.runInContext(`_rqPerf = { chave: "x", entregadores: _rqPerfPorEntregador(${JSON.stringify(PERF)}) }; _rqAba = "performance";`, ctx);
    ctx._rqRenderPerf();
    let html = el("rq-painel-performance").innerHTML;
    assert.ok(html.indexOf("Fulano") < html.indexOf("Beltrano"));
    assert.match(html, /94,50%/);
    vm.runInContext(`_rqColFiltros = { entregador: _rqDadosVisao().linhas.filter(l => /Beltrano/.test(l.entregador)).map(l => l.entregador) };`, ctx);
    ctx._rqRenderTabela();
    html = el("rq-painel-performance").innerHTML;
    assert.doesNotMatch(html, /Fulano/);
    assert.match(html, /Beltrano/);
});

test("card do entregador: pedidos do dia com situação, os que afetaram primeiro; planilhas", () => {
    const { ctx } = carregar();
    const pacotes = [
        { transportadora: "Imile", codigo: "I1", cidade: "Vila Teste", perf_dia: "21/09/2026", deve_ser_entregue: "21/09/2026", data_entrega: "21/09/2026", dentro_prazo: "Sim", valor_motorista: 2.5,
            usuario: "fulano.imile", destinatario: "Cliente Teste", endereco: "Rua Teste, 10", cep: "00000-000", data_atribuicao: "20/09/2026", peso_kg: 1.2, valor_entrega: 2, incentivo: 0.5, adicional_peso: 0, desconto: 0 },
        { transportadora: "Imile", codigo: "I2", cidade: "Vila Teste", perf_dia: "21/09/2026", deve_ser_entregue: "21/09/2026", data_entrega: "23/09/2026", dentro_prazo: "Não", valor_motorista: 2.5 },
        { transportadora: "Loggi", codigo: "L1", cidade: "Vila Teste", perf_dia: "21/09/2026", deve_ser_entregue: "21/09/2026", data_entrega: null, dentro_prazo: null, valor_motorista: 0 },
        { transportadora: "Shopee Caçador", codigo: "BR1", perf_dia: "21/09/2026", data_entrega: "21/09/2026", valor_motorista: 2.5 },
        { transportadora: "Anjun", codigo: "A1", perf_dia: null, deve_ser_entregue: "14/09/2026", data_entrega: "16/09/2026", dentro_prazo: "Não", valor_motorista: 3 },
    ];
    const onholds = [{ dia: "2026-09-21", tipo: "Onhold", transportadora: "Shopee Caçador", codigo: "BRX", motivo: "Cliente ausente" },
        { dia: "2026-09-21", tipo: "Acareação", transportadora: "Shopee", codigo: "BRP", ocorrencia: "2026-09-22", ocorrencia_hora: "10:00", usuario: "fulano.login" }];
    const ped = JSON.parse(JSON.stringify(ctx._rqPedidosDoDia("2026-09-21", pacotes, onholds)));
    assert.deepStrictEqual(ped.map(x => [x.situacao, x.codigo]), [["Atrasado", "I2"], ["Não entregue", "L1"], ["Onhold", "BRX"], ["PNR", "BRP"],
        ["Entregue (Shopee)", "BR1"], ["No prazo", "I1"]]);
    assert.strictEqual(ped[0].deveria, "21/09/2026");
    vm.runInContext(`_rqMes = 9; _rqAno = 2026; _rqQuinzena = 2; _rqCard = { r: { entregador: "Fulano de Teste - Vila Teste",
        dias: [{ dia: "2026-09-21", shopee: 1, outras_prazo: 1, onholds: 1, outras_atraso: 2, pct: 40, valor: 1.5, pacotes_pagos: 3, total: 4.5,
            acareacoes: 3, tarifa_minima: true, pacotes_minima: 1, usuarios_minima: "fulano.login" }] },
        pacotes: ${JSON.stringify(pacotes)}, onholds: ${JSON.stringify(onholds)}, abertos: new Set() };`, ctx);
    const abas = JSON.parse(JSON.stringify(ctx._rqAbasEntregador()));
    assert.deepStrictEqual(abas.map(a => a.nome), ["Dias", "O que afetou", "PNR", "Todos os pedidos"]);
    assert.deepStrictEqual(abas[0].linhas[1].slice(5, 8), [3, 1, "fulano.login"], "Dias: PNR, pacotes na mínima, usuário");
    assert.deepStrictEqual(abas[1].linhas.slice(1).map(l => [l[3], l[7]]), [["Atrasado", "I2"], ["Não entregue", "L1"], ["Onhold", "BRX"], ["PNR", "BRP"]]);
    assert.deepStrictEqual(abas[1].linhas[1].slice(1, 3), [40, 1.5], "% e R$/pacote do dia em cada pedido");
    assert.match(abas[1].linhas[4][12], /usuário fulano\.login/);
    assert.strictEqual(abas[2].linhas[1][4], "fulano.login");
    assert.strictEqual(abas[3].linhas.length, 1 + 6 + 1, "dia inteiro + o que ficou fora da conta");
    assert.deepStrictEqual(abas[3].linhas.slice(1, 7).map(l => l[7]), ["BR1", "BRP", "BRX", "I1", "I2", "L1"], "todos na ordem do pedido, não os que afetaram primeiro");
    assert.strictEqual(abas[3].linhas[7][3], "Fora da conta");
    assert.deepStrictEqual(abas[3].linhas[0].slice(13), ["Entregador", "Usuário (login)", "Cliente", "Endereço", "CEP", "Data de atribuição", "Peso (kg)", "Valor da entrega", "Incentivo", "Adicional de peso", "Desconto"]);
    assert.ok(abas[3].linhas.every(l => l.length === 24), "toda linha com as colunas do pacote");
    const i1 = abas[3].linhas.find(l => l[7] === "I1");
    assert.deepStrictEqual(i1.slice(13), ["Fulano de Teste - Vila Teste", "fulano.imile", "Cliente Teste", "Rua Teste, 10", "00000-000", "20/09/2026", 1.2, 2, 0.5, 0, 0]);
    assert.deepStrictEqual(abas[3].linhas.find(l => l[7] === "BRX").slice(15), ["", "", "", "", "", "", "", "", ""], "onhold sem pacote: em branco");
    assert.deepStrictEqual(abas[3].linhas.find(l => l[7] === "BRP").slice(13, 15), ["Fulano de Teste - Vila Teste", "fulano.login"], "PNR: login da acareação");
    assert.strictEqual(abas[1].linhas[0].length, 13, "O que afetou continua igual");
    assert.strictEqual(ctx._rqNomeArquivo(""), "performance_Fulano-de-Teste-Vila-Teste_2q_09-2026.xlsx");
});

test("entregador do Resumo: o dia guarda tarifa mínima e POD (card e planilha leem daqui)", () => {
    const { ctx, el } = carregar();
    const [r] = JSON.parse(JSON.stringify(ctx._rqPerfPorEntregador([{ driver: "Fulano de Teste - Vila Teste", dia: "2026-09-21", pct: 100, valor: 2.5, shopee: 10, onholds: 0,
        outras_prazo: 0, outras_atraso: 0, pacotes_pagos: 10, total: 23, acareacoes: 3, tarifa_minima: true, pacotes_minima: 2, usuarios_minima: "Pessoa Teste",
        pod_pacotes: 10, pod_desconto: 2, pod_usuarios: "fulano.login" }])));
    const d = r.dias[0];
    assert.deepStrictEqual([d.pacotes_minima, d.usuarios_minima, d.pod_pacotes, d.pod_desconto, d.pod_usuarios], [2, "Pessoa Teste", 10, 2, "fulano.login"]);
});

test("R$/pacote do dia: com tarifa mínima ou POD vale o que foi pago, não o da performance", () => {
    const { ctx } = carregar();
    assert.strictEqual(ctx._rqValorPago({ valor: 2.6, pacotes_pagos: 113, total: 203.4, pacotes_minima: 113 }), 1.8);
    assert.strictEqual(ctx._rqValorPago({ valor: 2.5, pacotes_pagos: 10, total: 23, pod_pacotes: 10 }), 2.3);
    assert.strictEqual(ctx._rqValorPago({ valor: 2.5, pacotes_pagos: 10, total: 25 }), 2.5, "dia normal");
    assert.strictEqual(ctx._rqValorPago({ valor: 2.5, pacotes_pagos: 0, total: 0, pacotes_minima: 1 }), 2.5, "sem pacote pago");
});

test("valores: funil em todas as colunas; filtra por texto do valor (número formatado) e soma só o que sobrou", () => {
    const { ctx, el } = carregar();
    ctx._rqRender();
    const head = el("rq-thead").innerHTML;
    const funis = (head.match(/_rqAbrirFiltro\(this, '/g) || []).length;
    assert.strictEqual(funis, (head.match(/<th/g) || []).length, "todas as colunas têm funil");
    assert.doesNotMatch(el("rq-conteudo").innerHTML, /id="rq-busca"|Todos os polos<\/option><\/select>\s*<\/span>/);
    const linhas = vm.runInContext("_rqDadosVisao().linhas", ctx);
    const alvo = linhas.find(l => !l.sem_conversao);
    vm.runInContext(`_rqColFiltros = { liquido: [_rqValorCol(_rqDadosVisao().linhas.find(l => !l.sem_conversao), "liquido").txt] };`, ctx);
    ctx._rqRenderTabela();
    const filtradas = JSON.parse(JSON.stringify(ctx._rqFiltradas()));
    assert.ok(filtradas.length >= 1 && filtradas.every(l => l.liquido === alvo.liquido));
    assert.match(el("rq-tfoot").innerHTML, new RegExp(filtradas.length + " linha\\(s\\)"));
    ctx._rqLimparFiltros();
    assert.strictEqual(JSON.parse(JSON.stringify(ctx._rqFiltradas())).length, linhas.length);
});

test("resumos: escolhe um ou mais; entregadores + interno somam linhas e totais; sempre fica um", () => {
    const { ctx } = carregar();
    const base = vm.runInContext("_rqDadosVisao().linhas.length", ctx);
    vm.runInContext(`_rqDados.interno = { linhas: [{ entregador: "GC Interno - Vila", polo: null, por_transp: {}, pacotes: 2, bruto: 5, acrescimos: 0,
        deslocamento: 0, ticketlog: 0, extravios: 0, descontos: 0, liquido: 5 }], transportadoras: {},
        totais: { entregadores: 1, pacotes: 2, bruto: 5, ticketlog: 0, extravios: 0, acrescimos: 0, deslocamento: 0, descontos: 0, liquido: 5 } };`, ctx);
    ctx._rqAlternarResumo("interno");
    assert.strictEqual(vm.runInContext("_rqDadosVisao().linhas.length", ctx), base + 1);
    assert.strictEqual(vm.runInContext("_rqDaVisao('GC Interno - Vila') && _rqDaVisao('Fulano de Teste - Vila Teste')", ctx), true);
    ctx._rqAlternarResumo("entregadores");
    assert.strictEqual(vm.runInContext("_rqDadosVisao().linhas.length", ctx), 1);
    ctx._rqAlternarResumo("interno");
    assert.deepStrictEqual(JSON.parse(vm.runInContext("JSON.stringify(_rqResumos)", ctx)), ["interno"], "o último não sai");
});
