// Testes da tela Torre de Controle > Na Rua > Shopee (js/shopee-na-rua.js).
//
// A tela é toda montada por template string, então o erro típico não dá exceção:
// um nome com aspas quebra o atributo e a linha para de abrir; o filtro compara
// com um texto que a legenda nunca mostra e a lista sai sempre vazia; o JS
// pede um id que o index.html deixou de ter e o painel fica em branco.
// Nada disso aparece a olho nu até alguém clicar — é o que estes testes travam.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const arquivo = path.join(__dirname, "..", "js", "shopee-na-rua.js");
const fonteJs = fs.readFileSync(arquivo, "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

// `let`/`const` do topo do arquivo não viram propriedade do contexto: por isso a
// ponte é anexada ao PRÓPRIO script, onde elas estão visíveis.
const ponte = `
;globalThis.__snr = {
    _snrSegmentosBarra, _snrEncurtarNome, _snrPendentes, _snrRenderLista, _snrPintarStatusLista,
    _snrBucketStatus, _snrRelativo, _snrRenderUltima,
    setLista: v => { _snrLista = v; },
    setTodos: v => { _snrTodos = v; },
    setStatusClicado: v => { _snrStatusClicado = v; },
};`;

/** Um "elemento" de mentira: só guarda o que a tela escreve nele. */
function elementoFalso() {
    return { innerHTML: "", innerText: "", className: "", style: {}, classList: { toggle() {} } };
}

function carregar() {
    const elementos = {};
    const documento = {
        getElementById: id => (elementos[id] ||= elementoFalso()),
        querySelectorAll: () => [],
        querySelector: () => null,
    };
    const contexto = vm.createContext({ console, Date, document: documento });
    contexto.globalThis = contexto;
    vm.runInContext(fonteJs + ponte, contexto, { filename: "shopee-na-rua.js" });
    return { api: contexto.__snr, elementos };
}

// status = [[nome, total], ...] no mesmo formato que /shopee-na-rua/entregadores devolve
const ent = (nome, status) => {
    const lista = status.map(([s, total]) => ({ status: s, total }));
    const total = lista.reduce((s, x) => s + x.total, 0);
    const entregues = lista.filter(x => /delivered/i.test(x.status)).reduce((s, x) => s + x.total, 0);
    return { nome, total, entregues, status: lista };
};

// ── barra de andamento ───────────────────────────────────────────────────

test("barra de andamento: uma fatia por status que existe, na ordem entregue → na rua → onhold → resto", () => {
    const { api } = carregar();
    const seg = api._snrSegmentosBarra(ent("Fulano", [
        ["Hub_Assigned", 3], ["OnHold", 2], ["Delivering", 41], ["Delivered", 12],
    ]));
    assert.strictEqual(seg.map(s => s.nome).join(","), "Delivered,Delivering,OnHold,Outros");
    assert.strictEqual(seg.map(s => s.total).join(","), "12,41,2,3");
});

test("barra de andamento: status zerado não reserva espaço na barra", () => {
    const { api } = carregar();
    const seg = api._snrSegmentosBarra(ent("Fulano", [["Delivered", 20]]));
    assert.strictEqual(seg.length, 1);
    assert.strictEqual(seg[0].nome, "Delivered");
});

test("barra de andamento: status desconhecido ou vazio cai em 'Outros', não some", () => {
    const { api } = carregar();
    const seg = api._snrSegmentosBarra(ent("Fulano", [["", 2], ["Coisa_Nova", 1]]));
    assert.strictEqual(seg.length, 1);
    assert.strictEqual(seg[0].nome, "Outros");
    assert.strictEqual(seg[0].total, 3);
});

test("barra de andamento: entregador sem status devolve lista vazia", () => {
    const { api } = carregar();
    assert.strictEqual(api._snrSegmentosBarra({ nome: "X", total: 0, entregues: 0 }).length, 0);
});

// ── nome curto do gráfico ────────────────────────────────────────────────

test("nome curto: até 20 letras fica inteiro", () => {
    const { api } = carregar();
    assert.strictEqual(api._snrEncurtarNome("Carlos Eduardo Martins"), "Carlos E.");
    assert.strictEqual(api._snrEncurtarNome("Anderson Luiz"), "Anderson Luiz");
    assert.strictEqual(api._snrEncurtarNome("Fernanda Lima Souza"), "Fernanda Lima Souza");
});

test("nome curto: palavra única e comprida é cortada com reticências", () => {
    const { api } = carregar();
    // 19 letras + "…" = 20, o mesmo teto do nome que cabe inteiro
    assert.strictEqual(api._snrEncurtarNome("Anastacioalexandrinopolis"), "Anastacioalexandrin…");
});

// ── lista de entregadores ────────────────────────────────────────────────

const ordemDaLista = html => [...html.matchAll(/data-nome="([^"]*)"/g)].map(m => m[1]);

test("lista: quem tem mais pedido na rua vem primeiro, não quem tem mais pedido no total", () => {
    const { api, elementos } = carregar();
    api.setLista([
        ent("Muito Total", [["Delivered", 90], ["Delivering", 2]]),
        ent("Muita Rua", [["Delivered", 5], ["Delivering", 30]]),
    ]);
    api._snrRenderLista();
    assert.deepStrictEqual(ordemDaLista(elementos["snr-entregadores"].innerHTML), ["Muita Rua", "Muito Total"]);
});

test("lista: aspas no nome não quebram o atributo (o nome viaja escapado em data-nome)", () => {
    const { api, elementos } = carregar();
    api.setLista([ent('Zé "Cabeça" D\'Ávila', [["Delivering", 4]])]);
    api._snrRenderLista();
    const html = elementos["snr-entregadores"].innerHTML;
    assert.ok(html.includes('data-nome="Zé &quot;Cabeça&quot; D\'Ávila"'), html);
    // nenhum handler recebe o nome dentro do próprio onclick
    assert.ok(!/onclick="[^"]*Cabeça/.test(html));
});

test("lista: 'Sem entregador' não tem botão Alertar (não há telefone pra avisar)", () => {
    const { api, elementos } = carregar();
    api.setLista([ent("Sem entregador", [["Hub_Assigned", 6]]), ent("Bruno", [["Delivering", 1]])]);
    api._snrRenderLista();
    const html = elementos["snr-entregadores"].innerHTML;
    assert.strictEqual((html.match(/_snrAlertar\(/g) || []).length, 1);
});

test("lista: Alertar fica quieto só quando não há nada na rua — mas continua no lugar", () => {
    const { api, elementos } = carregar();
    api.setLista([ent("Com Rua", [["Delivering", 3]]), ent("Sem Rua", [["Delivered", 10]])]);
    api._snrRenderLista();
    const html = elementos["snr-entregadores"].innerHTML;
    assert.strictEqual((html.match(/snr-alerta quieto/g) || []).length, 1);
    assert.strictEqual((html.match(/_snrAlertar\(/g) || []).length, 2);
});

test("lista: percentual concluído é Delivered sobre o total do dia", () => {
    const { api, elementos } = carregar();
    api.setLista([ent("Meio a Meio", [["Delivered", 5], ["Delivering", 5]])]);
    api._snrRenderLista();
    assert.ok(elementos["snr-entregadores"].innerHTML.includes(">50,0%<"));
});

// ── lista de pedidos de um status ────────────────────────────────────────

test("pedidos de um status: 'sem status' na legenda acha os pedidos que chegam com status vazio", () => {
    const { api, elementos } = carregar();
    api.setTodos([
        { codigo: "AAA1", status: "", entregador: "Fulano", endereco: "Rua A, 10", bairro: "Centro" },
        { codigo: "BBB2", status: "Delivering", entregador: "Ciclano", endereco: "Rua B, 20", bairro: "" },
    ]);
    api.setStatusClicado("(sem status)");
    api._snrPintarStatusLista();
    const html = elementos["snr-ger-status-lista"].innerHTML;
    assert.ok(html.includes("AAA1"));
    assert.ok(!html.includes("BBB2"));
    assert.ok(elementos["snr-ger-status-lista-titulo"].innerText.endsWith("· 1"));
});

test("pedidos de um status: sem nenhum, avisa em vez de deixar o painel em branco", () => {
    const { api, elementos } = carregar();
    api.setTodos([{ codigo: "AAA1", status: "Delivered", entregador: "F", endereco: "", bairro: "" }]);
    api.setStatusClicado("OnHold");
    api._snrPintarStatusLista();
    assert.ok(elementos["snr-ger-status-lista"].innerHTML.includes("Nenhum pedido com esse status."));
});

// ── "Atualizado" ─────────────────────────────────────────────────────────

test("atualizado: mostra a data em texto, sem passar por fuso do navegador", () => {
    const { api, elementos } = carregar();
    api._snrRenderUltima({ importado_em: "2026-09-23 15:42:10.123", segundos_atras: 420 });
    const html = elementos["snr-ultima"].innerHTML;
    assert.ok(html.includes("<b>23/09 15:42</b>"));
    assert.ok(html.includes("há 7 min"));
});

test("atualizado: sem importação nenhuma, diz isso (e não fica em 'Carregando...')", () => {
    const { api, elementos } = carregar();
    api._snrRenderUltima(null);
    assert.ok(elementos["snr-ultima"].innerHTML.includes("nenhuma importação"));
    assert.ok(elementos["snr-ultima"].className.includes("vazia"));
});

// ── markup × JS ──────────────────────────────────────────────────────────

test("todo id que o JS da tela procura existe no index.html", () => {
    const pedidos = new Set([...fonteJs.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]));
    assert.ok(pedidos.size > 15, "a varredura achou poucos ids — a regex quebrou?");
    const faltando = [...pedidos].filter(id => !indexHtml.includes(`id="${id}"`));
    assert.deepStrictEqual(faltando, [], `ids que o JS pede e o index.html não tem: ${faltando.join(", ")}`);
});

test("a tela não depende mais das classes dos cards compartilhados (nr-grafico-*, shr-ultima, adm-usr-action)", () => {
    // Se voltarem, é porque alguém copiou markup antigo: o visual próprio (snr-*) some.
    const ini = indexHtml.indexOf('<div id="nr-shopee-wrap"');
    const fim = indexHtml.indexOf("<!-- /tela-torre-na-rua -->");
    const markup = indexHtml.slice(ini, fim);
    for (const velha of ["nr-grafico-card", "nr-grafico-titulo", "shr-ultima", "shr-export-btn", "adm-usr-action"]) {
        assert.ok(!markup.includes(velha), `markup da Shopee voltou a usar ${velha}`);
        assert.ok(!fonteJs.includes(velha), `shopee-na-rua.js voltou a usar ${velha}`);
    }
});
