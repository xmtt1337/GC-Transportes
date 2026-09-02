// Testes da Central de Atendimento (balãozinho do rodapé + tela do suporte).
//
// O que se verifica aqui é o que quebraria em silêncio:
//
//   - o LADO da bolha. Trocar "minha" por "dele" faz a conversa inteira parecer
//     que quem falou foi o outro — e ninguém percebe olhando, porque continua
//     bonita.
//   - o ESCAPE do texto. É a única tela do sistema em que uma pessoa escreve
//     texto livre que outra vai ver; sem escapar, um "<img onerror=...>" digitado
//     por qualquer usuário roda na sessão de quem abrir a conversa.
//   - o separador de dia, que é o que dá contexto a uma conversa antiga.
//
// Datas montadas em hora LOCAL de propósito (new Date(ano, mês, dia, ...)): o
// código formata com toLocaleDateString, então um ISO com Z faria o teste passar
// ou falhar conforme o fuso da máquina que roda.
//
// Dados de TESTE. Nenhuma conversa real entra aqui.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ── carrega os dois arquivos do navegador no MESMO contexto isolado
//
// Juntos porque é assim que rodam no site: a tela do suporte reaproveita os
// ajudantes do balãozinho (mesmo escopo global). Nenhum dos dois toca em
// `document` ao carregar — só dentro das funções que a navegação chama.
const DIR = path.join(__dirname, "..", "js");
const fonte = fs.readFileSync(path.join(DIR, "atendimento.js"), "utf8")
    + "\n" + fs.readFileSync(path.join(DIR, "atendimento-admin.js"), "utf8")
    + "\n;globalThis.__atd = { _atdEscapar, _atdHora, _atdDiaSeparador, _atdQuandoCurto,"
    + " _atdBadgeTexto, _atdBlocos, _atdHtmlConversa, _atdaIniciais, _atdaCrachaRole };";

const contexto = vm.createContext({ globalThis: undefined, console });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "atendimento.js" });
const api = contexto.__atd;

/** Mensagem no formato que o servidor devolve. `quando` em hora local. */
function msg(de, quando, texto, autor) {
    return { id: 1, de, autor: autor || "Suporte", texto: texto || "oi", criado_em: quando };
}

const HOJE   = new Date(2026, 8, 2, 14, 32);  // 02/09/2026 14:32
const ONTEM  = new Date(2026, 8, 1, 9, 5);
const SEMANA = new Date(2026, 7, 28, 16, 0);  // 28/08/2026

// ───── escape ─────

test("texto do usuario nunca vira HTML", () => {
    // Quem digita é um usuário qualquer; quem lê é o suporte. Sem isto, um
    // "<img onerror>" digitado no balãozinho rodaria na sessão de quem abrisse.
    const perigoso = `<img src=x onerror="alert(1)">`;
    const saida = api._atdEscapar(perigoso);
    assert.ok(!saida.includes("<img"));
    assert.ok(saida.includes("&lt;img"));
    assert.ok(!saida.includes(`"`));
});

test("quebra de linha vira <br> e nada mais escapa errado", () => {
    assert.strictEqual(api._atdEscapar("a\nb"), "a<br>b");
    assert.strictEqual(api._atdEscapar("R&D"), "R&amp;D");
    assert.strictEqual(api._atdEscapar(null), "");
    assert.strictEqual(api._atdEscapar(undefined), "");
});

// ───── contador do balãozinho ─────

test("o contador some no zero e trava em 9+", () => {
    assert.strictEqual(api._atdBadgeTexto(0), "");
    assert.strictEqual(api._atdBadgeTexto(null), "");
    assert.strictEqual(api._atdBadgeTexto(undefined), "");
    assert.strictEqual(api._atdBadgeTexto(1), "1");
    assert.strictEqual(api._atdBadgeTexto(9), "9");
    // Passar de 9 não muda o que a pessoa faz (abrir e ler), e o círculo é pequeno.
    assert.strictEqual(api._atdBadgeTexto(10), "9+");
    assert.strictEqual(api._atdBadgeTexto(340), "9+");
});

// ───── datas ─────

test("a hora da bolha sai em 24h", () => {
    assert.strictEqual(api._atdHora(HOJE), "14:32");
});

test("data invalida nao imprime lixo na bolha", () => {
    assert.strictEqual(api._atdHora("nao e data"), "");
    assert.strictEqual(api._atdDiaSeparador("nao e data", HOJE), "");
    assert.strictEqual(api._atdQuandoCurto("nao e data", HOJE), "");
});

test("o separador de dia sempre acompanha a data", () => {
    // "Hoje" sozinho não diz nada pra quem rola a conversa uma semana depois.
    assert.strictEqual(api._atdDiaSeparador(HOJE, HOJE), "Hoje · 02/09/2026");
    assert.strictEqual(api._atdDiaSeparador(ONTEM, HOJE), "Ontem · 01/09/2026");
    assert.strictEqual(api._atdDiaSeparador(SEMANA, HOJE), "28/08/2026");
});

test("na lista do suporte: hora se e de hoje, senao o dia", () => {
    assert.strictEqual(api._atdQuandoCurto(HOJE, HOJE), "14:32");
    assert.strictEqual(api._atdQuandoCurto(ONTEM, HOJE), "Ontem");
    assert.strictEqual(api._atdQuandoCurto(SEMANA, HOJE), "28/08");
});

// ───── blocos da conversa ─────

test("um separador por virada de dia, nao um por mensagem", () => {
    const blocos = api._atdBlocos([
        msg("usuario", ONTEM), msg("suporte", ONTEM), msg("usuario", HOJE),
    ], HOJE);
    // Array.from: o vm devolve arrays de OUTRO realm, e deepStrictEqual compara
    // o prototype junto — sem isto o teste falha com as duas listas iguais na tela.
    assert.deepStrictEqual(Array.from(blocos, b => b.tipo), ["dia", "msg", "msg", "dia", "msg"]);
    assert.strictEqual(blocos[0].texto, "Ontem · 01/09/2026");
    assert.strictEqual(blocos[3].texto, "Hoje · 02/09/2026");
});

test("conversa vazia nao gera bloco nenhum", () => {
    assert.strictEqual(api._atdBlocos([], HOJE).length, 0);
    assert.strictEqual(api._atdBlocos(null, HOJE).length, 0);
});

// ───── HTML da conversa ─────

test("cada lado ve as proprias mensagens a direita", () => {
    const mensagens = [msg("usuario", HOJE, "tenho uma duvida"), msg("suporte", HOJE, "pode falar")];

    // No balãozinho, quem está lendo é o usuário.
    const doUsuario = api._atdHtmlConversa(mensagens, "usuario", HOJE);
    assert.ok(doUsuario.indexOf(`atd-bolha minha">tenho uma duvida`) > -1);
    assert.ok(doUsuario.indexOf(`pode falar`) > doUsuario.indexOf(`atd-bolha dele`));

    // Na tela do suporte, a MESMA conversa aparece espelhada.
    const doSuporte = api._atdHtmlConversa(mensagens, "suporte", HOJE);
    assert.ok(doSuporte.indexOf(`atd-bolha dele`) < doSuporte.indexOf(`tenho uma duvida`));
    assert.ok(doSuporte.includes(`atd-bolha minha">pode falar`));
});

test("o nome de quem escreveu so aparece nas mensagens do outro lado", () => {
    // Repetir o próprio nome em cada bolha não informa nada a ninguém.
    const html = api._atdHtmlConversa([
        msg("usuario", HOJE, "oi", "Maria"), msg("suporte", HOJE, "oi", "Suporte"),
    ], "usuario", HOJE);
    assert.ok(html.includes("Suporte"));
    assert.ok(!html.includes("Maria"));
});

test("o texto da mensagem e escapado dentro da bolha", () => {
    const html = api._atdHtmlConversa([msg("suporte", HOJE, `<script>alert(1)</script>`)], "usuario", HOJE);
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
});

test("nome de autor tambem e escapado", () => {
    const html = api._atdHtmlConversa([msg("suporte", HOJE, "oi", `<b>x</b>`)], "usuario", HOJE);
    assert.ok(!html.includes("<b>"));
});

// ───── lista do suporte ─────

test("as iniciais do avatar saem do primeiro e do ultimo nome", () => {
    assert.strictEqual(api._atdaIniciais("Maria Aparecida Silva"), "MS");
    assert.strictEqual(api._atdaIniciais("Maria"), "MA");
    assert.strictEqual(api._atdaIniciais("  joao  souza "), "JS");
    assert.strictEqual(api._atdaIniciais(""), "?");
    assert.strictEqual(api._atdaIniciais(null), "?");
});

test("o cracha de cargo usa a cor do cargo e some quando nao ha cargo", () => {
    assert.ok(api._atdaCrachaRole("entregador").includes("#22c55e"));
    assert.ok(api._atdaCrachaRole("dev").includes("#a78bfa"));
    // Cargo novo que ninguém mapeou ainda continua aparecendo, em cinza.
    assert.ok(api._atdaCrachaRole("cargo-novo").includes("#8494a9"));
    assert.strictEqual(api._atdaCrachaRole(""), "");
    assert.strictEqual(api._atdaCrachaRole(null), "");
});
