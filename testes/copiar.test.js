/**
 * Testes de gcCopiar (js/nav.js).
 *
 * Por que isto tem teste: o site é servido em HTTP, e navigator.clipboard só
 * existe em contexto seguro. Quem chama a API moderna direto — como o botão de
 * copiar AT da Conferência ainda faz — simplesmente não copia nada no celular
 * do entregador, e o erro aparece como "não consegui copiar", que parece
 * problema do navegador dele.
 *
 * Aqui o navegador é falso: o que se exercita é a escolha do caminho e a
 * limpeza do textarea temporário.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FONTE = fs.readFileSync(path.join(__dirname, "..", "js", "nav.js"), "utf8");

/**
 * Carrega gcCopiar num navegador de mentira.
 * @param {Object} opcoes seguro, clipboardFalha, execFalha
 */
function carregar(opcoes) {
    const o = opcoes || {};
    const criados = [];
    const anexados = [];
    const selecionados = [];

    const sandbox = {
        navigator: o.semClipboard ? {} : {
            clipboard: {
                writeText: (t) => o.clipboardFalha
                    ? Promise.reject(new Error("bloqueado"))
                    : Promise.resolve(sandbox.__copiadoPeloModerno = t),
            },
        },
        window: { isSecureContext: !!o.seguro },
        document: {
            createElement() {
                const el = {
                    value: "", style: {},
                    setAttribute(k, v) { this[k] = v; },
                    select() { selecionados.push("select"); },
                    setSelectionRange(a, b) { selecionados.push(`range:${a}-${b}`); },
                };
                criados.push(el);
                return el;
            },
            body: {
                appendChild(el) { anexados.push(el); },
                removeChild(el) {
                    const i = anexados.indexOf(el);
                    if (i < 0) throw new Error("removeu o que nao estava no DOM");
                    anexados.splice(i, 1);
                },
            },
            execCommand(cmd) {
                if (o.execFalha) throw new Error("recusado");
                sandbox.__copiadoPeloAntigo = criados[criados.length - 1].value;
                return !o.execRetornaFalso;
            },
        },
        Promise, Error, String, setTimeout,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(FONTE, sandbox);
    return { sandbox, criados, anexados, selecionados };
}

test("em HTTPS usa a area de transferencia moderna", async () => {
    const { sandbox, criados } = carregar({ seguro: true });
    await sandbox.gcCopiar("AT202609049AXFA");
    assert.strictEqual(sandbox.__copiadoPeloModerno, "AT202609049AXFA");
    assert.strictEqual(criados.length, 0, "nao precisava do textarea");
});

test("em HTTP cai no caminho que funciona", async () => {
    // O caso real do site hoje: sem isto, o botao nao copia nada.
    const { sandbox } = carregar({ seguro: false });
    await sandbox.gcCopiar("AT202609049AXFA");
    assert.strictEqual(sandbox.__copiadoPeloAntigo, "AT202609049AXFA");
});

test("navegador sem clipboard nenhum ainda copia", async () => {
    const { sandbox } = carregar({ semClipboard: true });
    await sandbox.gcCopiar("AT202609049AZHJ");
    assert.strictEqual(sandbox.__copiadoPeloAntigo, "AT202609049AZHJ");
});

test("clipboard bloqueado pelo navegador cai pro antigo", async () => {
    // Permissao negada acontece mesmo em HTTPS; nao pode virar erro na cara.
    const { sandbox } = carregar({ seguro: true, clipboardFalha: true });
    await sandbox.gcCopiar("AT-X");
    assert.strictEqual(sandbox.__copiadoPeloAntigo, "AT-X");
});

test("o iPhone precisa do setSelectionRange", async () => {
    // select() sozinho nao funciona no Safari do iOS - metade dos celulares
    // da rua ficaria sem copiar.
    const { sandbox, selecionados } = carregar({ seguro: false });
    await sandbox.gcCopiar("AT202609049AXFA");
    assert.ok(selecionados.includes("select"));
    assert.ok(selecionados.some(s => s.startsWith("range:0-")));
});

test("o textarea some do DOM mesmo quando a copia falha", async () => {
    // Sem o finally, cada tentativa frustrada deixaria lixo na pagina.
    const { sandbox, anexados } = carregar({ seguro: false, execFalha: true });
    await assert.rejects(() => sandbox.gcCopiar("AT-X"));
    assert.deepStrictEqual(anexados, [], "sobrou textarea no DOM");
});

test("recusa silenciosa do navegador vira erro, nao sucesso falso", async () => {
    // execCommand devolvendo false e "nao copiei" — dizer "Copiado!" ali seria
    // a tela mentindo, e o entregador colaria a AT anterior sem perceber.
    const { sandbox } = carregar({ seguro: false, execRetornaFalso: true });
    await assert.rejects(() => sandbox.gcCopiar("AT-X"));
});

test("texto vazio nao tenta copiar", async () => {
    const { sandbox, criados } = carregar({ seguro: false });
    await assert.rejects(() => sandbox.gcCopiar(""));
    await assert.rejects(() => sandbox.gcCopiar(null));
    assert.strictEqual(criados.length, 0);
});
