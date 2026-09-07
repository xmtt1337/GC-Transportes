// Testes do HTTPS obrigatório e do que depende de contexto seguro.
//
// O site respondia em http:// puro (conferido: http://xmtt.com.br devolvia 200,
// sem redirecionar — o "Enforce HTTPS" do GitHub Pages está desligado). Quem
// abria assim perdia coisas em silêncio, e a pior delas tinha cara de bug
// aleatório: `navigator.mediaDevices` não existe fora de contexto seguro, então
// o scanner estourava um TypeError SÍNCRONO. O `.catch()` nunca rodava, a
// mensagem de erro nunca aparecia, e sobrava só o overlay do scanner — que é
// #000 de tela cheia com z-index 99999. O aparelho inteiro preto, mudo.
//
// Era a "tela toda preta" filmada pelo entregador. E explica o "pra uns buga e
// pra outros não": dependia de qual endereço a pessoa tinha salvo.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

const PAGINAS = ["index.html", "login.html", "redefinir-senha.html", "404.html"];

for (const pagina of PAGINAS) {
    test(`${pagina} manda o http pro https`, () => {
        const html = ler(pagina);
        assert.match(html, /location\.protocol !== "http:"/,
            "a checagem tem que existir e ser de protocolo");
        assert.match(html, /location\.replace\("https:\/\/"/,
            "tem que redirecionar pro mesmo endereço em https");
    });

    test(`${pagina} redireciona antes de carregar qualquer coisa`, () => {
        const html = ler(pagina);
        const redir = html.indexOf("HTTPS OBRIGATORIO");
        assert.notStrictEqual(redir, -1, `${pagina} perdeu o bloco de redirecionamento`);
        // Se um <script src> ou <link> vier antes, o navegador já baixou algo em
        // http antes do desvio — e é justamente isso que se quer evitar.
        const antes = html.slice(0, redir);
        assert.doesNotMatch(antes, /<script[^>]+src=/i,
            "nenhum script pode carregar antes do redirecionamento");
        assert.doesNotMatch(antes, /<link[^>]+stylesheet/i,
            "nenhum CSS pode carregar antes do redirecionamento");
    });

    test(`${pagina} nao redireciona em ambiente local`, () => {
        const html = ler(pagina);
        const bloco = html.slice(html.indexOf("HTTPS OBRIGATORIO"),
                                 html.indexOf("HTTPS OBRIGATORIO") + 1600);
        assert.match(bloco, /localhost/,
            "desenvolver local roda em http de propósito — não pode entrar no laço");
    });
}

test("o scanner nao chama a camera sem antes conferir se ela existe", () => {
    const js = ler("js/baixas.js");
    const chamada = js.indexOf("navigator.mediaDevices.getUserMedia(");
    const guarda  = js.indexOf("!navigator.mediaDevices");
    assert.notStrictEqual(guarda, -1,
        "sem a guarda, http:// derruba o scanner num TypeError e deixa a tela preta");
    assert.ok(guarda < chamada,
        "a guarda precisa vir ANTES da chamada — depois não adianta, o erro é síncrono");
});

test("sem camera o scanner explica em vez de ficar preto", () => {
    const js = ler("js/baixas.js");
    const bloco = js.slice(js.indexOf("!navigator.mediaDevices"),
                           js.indexOf("navigator.mediaDevices.getUserMedia("));
    assert.match(bloco, /_bteScanErro\(/,
        "tem que escrever a razão na tela; overlay preto sem texto não diz nada a ninguém");
    assert.match(bloco, /https/i,
        "quando o motivo for contexto inseguro, a mensagem precisa dizer isso");
    assert.match(bloco, /return;/,
        "e precisa sair, senão segue e estoura o mesmo TypeError");
});

test("o copiar continua guardado por contexto seguro", () => {
    // Já existia (nav.js) e é o mesmo problema — fica travado pra não regredir
    // junto quando alguém mexer no HTTPS.
    assert.match(ler("js/nav.js"), /navigator\.clipboard && window\.isSecureContext/,
        "navigator.clipboard também não existe em http://");
});
