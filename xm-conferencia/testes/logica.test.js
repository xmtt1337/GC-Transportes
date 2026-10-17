// Lógica pura do app de conferência. Fixture sintético — nenhum código de pacote real.
const test = require("node:test");
const assert = require("node:assert/strict");
const XM = require("../www/js/logica.js");

test("pctTexto: 0 e 100 sem casas, o resto com vírgula", () => {
    assert.equal(XM.pctTexto(0), "0%");
    assert.equal(XM.pctTexto(100), "100%");
    assert.equal(XM.pctTexto(120), "100%");
    assert.equal(XM.pctTexto(33.3333), "33,33%");
    assert.equal(XM.pctTexto(null), "—");
    assert.equal(XM.pctTexto(NaN), "—");
});

test("larguraBarra: 1% mínimo quando já tem bipe, teto em 100", () => {
    assert.equal(XM.larguraBarra(0, 0), 0);
    assert.equal(XM.larguraBarra(1, 0.4), 1);
    assert.equal(XM.larguraBarra(5, 50), 50);
    assert.equal(XM.larguraBarra(5, 130), 100);
});

test("diaTexto: hoje, ontem (inclusive na virada do mês) e data comum", () => {
    assert.equal(XM.diaTexto("2026-10-17", "2026-10-17"), "Hoje · 17/10/2026");
    assert.equal(XM.diaTexto("2026-10-16", "2026-10-17"), "Ontem · 16/10/2026");
    assert.equal(XM.diaTexto("2026-09-30", "2026-10-01"), "Ontem · 30/09/2026");
    assert.equal(XM.diaTexto("2026-10-10", "2026-10-17"), "10/10/2026");
    assert.equal(XM.diaTexto(null, "2026-10-17"), "Sem data");
});

test("textoResultado: interceptar vence até resultado ok", () => {
    const t = XM.textoResultado({ resultado: "ok", interceptar: true, detalhe: "Pedido cancelado." });
    assert.match(t, /^NÃO LEVE — Pedido cancelado\. Entregue ao responsável\./);
    assert.equal(XM.tipoResposta({ resultado: "ok", interceptar: true }), "erro");
});

test("textoResultado: outra rota diz de qual cluster", () => {
    const d = { resultado: "divergente", encontrado: "C-99" };
    assert.equal(XM.textoResultado(d), "Esse pacote é do C-99 — não é da sua rota");
    assert.equal(XM.tipoResposta(d), "outra_rota");
});

test("textoResultado: ok com status fora do hub avisa sem virar erro", () => {
    const d = { resultado: "ok", status_ok: false, status_pedido: "Created" };
    assert.match(XM.textoResultado(d), /status é Created/);
    assert.equal(XM.tipoResposta(d), "ok");
});

test("textoResultado: repetido e sem cadastro", () => {
    assert.equal(XM.textoResultado({ resultado: "ok", repetido: true }), "Já estava conferido");
    assert.equal(
        XM.textoResultado({ resultado: "sem_pedido", esperado: "C-01" }),
        "Não encontrado — conferir manualmente se a rota é de C-01"
    );
    assert.equal(XM.tipoResposta({ resultado: "sem_cep" }), "erro");
});

test("resumo: a mais soma outra rota e sem cadastro", () => {
    const r = XM.resumo(
        [{ resultado: "ok" }, { resultado: "ok" }, { resultado: "divergente" }, { resultado: "sem_pedido" }],
        [{ codigo: "TESTE001" }]
    );
    assert.deepEqual(r, { ok: 2, outra: 1, semDado: 1, aMais: 2, faltam: 1 });
});

test("textoFaltantes: cabeçalho e um código por linha", () => {
    assert.equal(XM.textoFaltantes([{ codigo: "TESTE001" }, { codigo: "TESTE002" }]),
        "Pedidos faltantes:\nTESTE001\nTESTE002");
});

test("maisCentral: entre dois códigos vale o do centro da tela", () => {
    const caixa = (cx, cy) => [[cx - 10, cy - 5], [cx + 10, cy - 5], [cx + 10, cy + 5], [cx - 10, cy + 5]];
    const codigos = [
        { rawValue: "QR-DO-TOPO", cornerPoints: caixa(500, 200) },
        { rawValue: "TESTE-CENTRO", cornerPoints: caixa(540, 1150) },
    ];
    assert.equal(XM.maisCentral(codigos, 1080, 2340), "TESTE-CENTRO");
});

test("maisCentral: sem cantos ou com texto vazio", () => {
    assert.equal(XM.maisCentral([{ rawValue: "  " }, { rawValue: "TESTE1" }], 100, 100), "TESTE1");
    assert.equal(XM.maisCentral([], 100, 100), null);
    assert.equal(XM.maisCentral([{ displayValue: "TESTE2" }], 100, 100), "TESTE2");
});

test("filtro de repetição: o mesmo código parado na câmera não vira vários bipes", () => {
    const aceitar = XM.criarFiltroRepeticao(2500);
    assert.equal(aceitar("A", 0), true);
    assert.equal(aceitar("A", 100), false);
    assert.equal(aceitar("A", 2400), false);   // segue na frente: a janela estica
    assert.equal(aceitar("A", 4800), false);
    assert.equal(aceitar("B", 4900), true);    // outro pacote passa na hora
    assert.equal(aceitar("A", 5000), true);    // voltou depois de outro: vale
    assert.equal(aceitar("A", 8000), true);    // tirou da frente e passou de novo
    assert.equal(aceitar("", 9000), false);
});

test("esc: escapa HTML, inclusive aspas simples", () => {
    assert.equal(XM.esc(`<b a="1">'x'&</b>`), "&lt;b a=&quot;1&quot;&gt;&#39;x&#39;&amp;&lt;/b&gt;");
    assert.equal(XM.esc(null), "");
});
