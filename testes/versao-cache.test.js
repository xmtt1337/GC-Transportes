// Testes da autoverificação de versão do index.html.
//
// O GitHub Pages serve o index com Cache-Control: max-age=600. Isso significa
// que um `location.reload()` pode ser atendido pelo próprio cache: volta a MESMA
// página velha, que continua pedindo o style.css e os js velhos. E a trava de
// sessionStorage, logo antes, já marcou a versão como "tentada" — então a
// checagem desiste e o aparelho fica preso no antigo até o cache vencer.
//
// O sintoma é cruel de depurar: a correção está publicada, o servidor serve
// certo, e a pessoa continua vendo o bug. Foi o que aconteceu com o celular do
// entregador.
//
// A saída é recarregar numa URL que o cache não tenha: ?_v=<versao>. Estes
// testes rodam os dois scripts embutidos do index.html num contexto isolado,
// com location/history/fetch de mentira, e conferem o comportamento — não só
// o texto do arquivo.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

/** Conteúdo do primeiro <script> embutido que contenha `marca`. */
function scriptCom(marca) {
    let de = 0;
    for (;;) {
        const abre = indexHtml.indexOf("<script>", de);
        assert.notStrictEqual(abre, -1, `nenhum <script> do index contém "${marca}"`);
        const ini = abre + "<script>".length;
        const fim = indexHtml.indexOf("</script>", ini);
        const corpo = indexHtml.slice(ini, fim);
        if (corpo.includes(marca)) return corpo;
        de = fim;
    }
}

const SCRIPT_ROTA   = scriptCom("_BASES");
const SCRIPT_VERSAO = scriptCom("gc_versao_tentada");

/** location de mentira, com o bastante pra os dois scripts rodarem. */
function fazerLocation(href) {
    const u = new URL(href);
    return {
        href: u.href, hostname: u.hostname, pathname: u.pathname,
        search: u.search, hash: u.hash,
        _replaced: null,
        _reloaded: false,
        replace(alvo) { this._replaced = alvo; },
        reload() { this._reloaded = true; },
    };
}

/** Roda a autoverificação de versão e devolve o que ela fez. */
async function rodarVersao({ daPagina, doServidor, sessaoQuebrada = false, jaTentada = null }) {
    const guardado = { valor: jaTentada };
    const location = fazerLocation("https://xmtt.com.br/Conferencia/Shopee");
    const ctx = {
        document: {
            querySelector: () => ({ getAttribute: () => daPagina }),
        },
        location,
        URL,
        URLSearchParams,
        sessionStorage: {
            getItem() { if (sessaoQuebrada) throw new Error("bloqueado"); return guardado.valor; },
            setItem(_, v) { if (sessaoQuebrada) throw new Error("bloqueado"); guardado.valor = v; },
        },
        fetch: () => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ versao: doServidor }),
        }),
    };
    ctx.globalThis = ctx;
    vm.runInContext(SCRIPT_VERSAO, vm.createContext(ctx), { filename: "index-versao.js" });
    // Deixa as promessas do fetch de mentira assentarem.
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    return { location, guardado };
}

test("versao nova: recarrega furando o cache, com ?_v=", async () => {
    const { location } = await rodarVersao({ daPagina: "aaa1111", doServidor: "bbb2222" });
    assert.strictEqual(location._reloaded, false,
        "location.reload() pode ser servido do cache e traz a mesma pagina velha de volta");
    assert.ok(location._replaced, "devia ter navegado pra uma URL nova");
    assert.match(location._replaced, /[?&]_v=bbb2222/,
        "a URL precisa carregar a versao nova pra o cache nao ter essa entrada");
});

test("versao nova: o caminho da rota e preservado", async () => {
    const { location } = await rodarVersao({ daPagina: "aaa1111", doServidor: "bbb2222" });
    assert.match(location._replaced, /\/Conferencia\/Shopee/,
        "recarregar nao pode jogar o entregador de volta pra home");
});

test("mesma versao: nao mexe em nada", async () => {
    const { location } = await rodarVersao({ daPagina: "aaa1111", doServidor: "aaa1111" });
    assert.strictEqual(location._replaced, null);
    assert.strictEqual(location._reloaded, false);
});

test("a trava impede tentar a mesma versao duas vezes", async () => {
    const { location } = await rodarVersao({
        daPagina: "aaa1111", doServidor: "bbb2222", jaTentada: "bbb2222",
    });
    assert.strictEqual(location._replaced, null,
        "ja tentou esta versao: insistir viraria laco de recarregamento");
});

test("sessionStorage bloqueado nao vira laco infinito de recarregamento", async () => {
    // Sem sessionStorage a trava nao guarda nada, entao a pagina recarregaria pra
    // sempre. O ?_v= e o que salva: a segunda carga ja vem com a versao certa e a
    // comparacao passa a bater sozinha, sem depender de trava nenhuma.
    const { location } = await rodarVersao({
        daPagina: "aaa1111", doServidor: "bbb2222", sessaoQuebrada: true,
    });
    assert.match(location._replaced, /[?&]_v=bbb2222/);
    const segunda = await rodarVersao({
        daPagina: "bbb2222", doServidor: "bbb2222", sessaoQuebrada: true,
    });
    assert.strictEqual(segunda.location._replaced, null,
        "com o index novo em maos as versoes batem e a checagem se cala");
});

/** Roda o script de rota do topo e devolve a URL que ele deixou na barra. */
function rodarRota(href) {
    const location = fazerLocation(href);
    let posto = null;
    const ctx = {
        location,
        URLSearchParams,
        history: { replaceState: (_e, _t, url) => { posto = url; } },
        document: {
            createElement: () => ({}),
            head: { appendChild: () => {} },
        },
    };
    ctx.globalThis = ctx;
    vm.runInContext(SCRIPT_ROTA, vm.createContext(ctx), { filename: "index-rota.js" });
    return posto;
}

test("o ?_v= sai da barra de endereco depois de cumprir a funcao", () => {
    const url = rodarRota("https://xmtt.com.br/Conferencia/Shopee?_v=bbb2222");
    assert.strictEqual(url, "/Conferencia/Shopee",
        "o parametro tecnico nao pode sobrar na URL que o entregador ve e compartilha");
});

test("o ?_v= sai sem levar junto outros parametros", () => {
    const url = rodarRota("https://xmtt.com.br/Pedidos?busca=ABC123&_v=bbb2222");
    assert.strictEqual(url, "/Pedidos?busca=ABC123");
});

test("sem ?_v= a barra fica como estava", () => {
    assert.strictEqual(rodarRota("https://xmtt.com.br/Pedidos?busca=ABC123"), null);
});

test("a rota vinda do 404.html continua sendo restaurada", () => {
    const url = rodarRota("https://xmtt.com.br/?_rota=" + encodeURIComponent("Conferencia/Shopee"));
    assert.strictEqual(url, "/Conferencia/Shopee");
});
