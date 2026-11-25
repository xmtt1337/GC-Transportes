// Equipe (quem não é entregador) registrando devolução pelo botão da tela Registro: o
// formulário é o mesmo do entregador, mas deixa claro que o destino é o CD de Caçador.
// O que quebraria em silêncio: entregador ver "CD de Caçador" na tela dele, ou o
// Registro não mostrar pra onde foi a devolução que a equipe registrou.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = (...p) => fs.readFileSync(path.join(__dirname, "..", ...p), "utf8");
const devJs = ler("js", "devolucoes.js");
const html = ler("index.html");

function carregar(role) {
    const els = {};
    const el = id => els[id] || (els[id] = {
        id, style: {}, innerText: "", innerHTML: "", value: "",
        classList: { add() {}, remove() {}, toggle() {} },
        scrollIntoView() {},
    });
    const telas = [];
    const contexto = vm.createContext({
        console,
        window: { _gcUser: role ? { role } : undefined, addEventListener() {} },
        setTimeout: () => 0, // a fila offline tenta sincronizar 3,5 s depois de carregar
        document: {
            getElementById: el,
            querySelectorAll: () => [],
        },
        mostrarTela: (id, rota) => telas.push([id, rota]),
    });
    vm.runInContext(`${devJs}
        ;globalThis.__d = { _devModoEquipe, _devAplicarModo, _drrRenderizar, abrirDevolucaoNova,
            setDados: d => { _drRegistroDados = d; } };`, contexto, { filename: "devolucoes.js" });
    return { ...contexto.__d, el, telas };
}

test("entregador: formulário de sempre, sem destino nem voltar", () => {
    const d = carregar("entregador");
    assert.strictEqual(d._devModoEquipe(), false);
    d._devAplicarModo();
    assert.strictEqual(d.el("dev-destino").style.display, "none");
    assert.strictEqual(d.el("dev-voltar-registro").style.display, "none");
    assert.strictEqual(d.el("dev-form-titulo").innerText, "Criar Devolução");
});

test("equipe: título e destino dizem CD de Caçador", () => {
    for (const role of ["admin", "user", "dev"]) {
        const d = carregar(role);
        assert.strictEqual(d._devModoEquipe(), true, role);
        d._devAplicarModo();
        assert.strictEqual(d.el("dev-destino").style.display, "");
        assert.strictEqual(d.el("dev-voltar-registro").style.display, "");
        assert.match(d.el("dev-form-titulo").innerText, /CD de Caçador/);
        assert.match(d.el("titulo-pagina").innerText, /CD de Caçador/);
    }
});

test("sem usuário carregado ainda: trata como entregador (não promete destino)", () => {
    assert.strictEqual(carregar(null)._devModoEquipe(), false);
});

test("Registro: devolução com destino mostra 'Destino: CD de Caçador'; sem destino, nada", () => {
    const d = carregar("admin");
    const linhas = [
        { id: 1, codigo: "TESTE001", usuario_nome: "Pessoa A", destino: "CD de Caçador", status: "pendente" },
        { id: 2, codigo: "TESTE002", usuario_nome: "Pessoa B", destino: null, status: "pendente" },
    ];
    d.setDados(linhas);
    d._drrRenderizar(linhas);
    const tbody = d.el("drr-tbody").innerHTML;
    assert.strictEqual((tbody.match(/Destino:/g) || []).length, 1);
    assert.match(tbody, /CD de Caçador/);
});

test("index.html tem o botão no Registro e o bloco de destino no formulário", () => {
    const registro = html.slice(html.indexOf('id="tela-devolucao-registro"'), html.indexOf("/tela-devolucao-registro"));
    assert.match(registro, /onclick="abrirDevolucaoNova\(\)"[^>]*>[^<]*Registrar nova devolução ao CD de Caçador/);
    const form = html.slice(html.indexOf('id="tela-devolucao-nova"'), html.indexOf("/tela-devolucao-nova"));
    assert.match(form, /id="dev-destino"/);
    assert.match(form, /CD de Caçador/);
});
