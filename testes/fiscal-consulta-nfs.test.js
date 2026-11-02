// Testes de js/fiscal-consulta-nfs.js — leitura dos códigos colados, contador,
// tabela de resultado e CSV. A busca da chave em si é testada no backend
// (modules/fiscal/testes/consulta-nfs.test.js).
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "fiscal-consulta-nfs.js"), "utf8");

function carregar({ cteApi, copiar } = {}) {
  const els = {};
  const el = (id) => (els[id] ||= {
    value: "", innerHTML: "", textContent: "", innerText: "", disabled: false,
    dataset: {},
    classes: new Set(),
    classList: { toggle(c, on) { const lista = els[id].classes; on ? lista.add(c) : lista.delete(c); },
                 add(c) { els[id].classes.add(c); }, remove(c) { els[id].classes.delete(c); } },
  });
  const baixados = [];
  const copiados = [];
  const ctx = vm.createContext({
    console,
    document: {
      getElementById: el,
      createElement: () => ({ click() { baixados.push(this.download); }, remove() {} }),
      body: { appendChild() {} },
    },
    mostrarTela() {},
    Blob: class { constructor(partes) { this.texto = partes.join(""); } },
    URL: { createObjectURL: () => "blob:teste", revokeObjectURL() {} },
    _esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    _cteApi: cteApi || (async () => ({ resultados: [] })),
    // gcCopiar é global (nav.js), não parte deste arquivo — mockado aqui como
    // em qualquer outro teste que usa botão de copiar (ver entregador-conferencia).
    gcCopiar: copiar || (async (texto) => { copiados.push(texto); }),
    setTimeout, clearTimeout,
  });
  vm.runInContext(fonte + `
    ;globalThis.__cnfs = { ler: _cnfsLerCodigos, contar: _cnfsContar, html: _cnfsHtmlResultado,
                           csv: _cnfsMontarCsv, gerar: _cnfsGerar, tela: _htmlConsultaNfs,
                           baixar: _cnfsBaixar, copiar: _cnfsCopiar };`,
    ctx, { filename: "fiscal-consulta-nfs.js" });
  return { api: ctx.__cnfs, el, baixados, copiados };
}

const COM_NF = { codigo: "BR000000000001A", nfs: ["1".repeat(44)], erro: null };
const DUAS_NF = { codigo: "BR000000000002B", nfs: ["2".repeat(44), "3".repeat(44)], erro: null };
const SEM_NF = { codigo: "BR000000000003C", nfs: [], erro: "Nenhuma NF-e encontrada para este código." };

test("aceita linha, espaço, vírgula e ponto e vírgula, sem repetir código", () => {
  const { api } = carregar();
  const lidos = api.ler("BR1\nBR2 BR3,BR4;BR1\r\n\n");
  assert.strictEqual(JSON.stringify(lidos), JSON.stringify(["BR1", "BR2", "BR3", "BR4"]));
});

test("tela não traz mais a descrição nem código de exemplo real", () => {
  const { api } = carregar();
  const html = api.tela();
  assert.ok(!html.includes("aviso-info"));
  assert.ok(!html.includes("autXML"));
  assert.ok(!/BR\d*[1-9]/.test(html));
});

test("contador mostra a quantidade e fica vermelho só acima do limite", () => {
  const { api, el } = carregar();
  el("cnfs-codigos").value = "BR1\nBR2\nBR2";
  api.contar();
  assert.strictEqual(el("cnfs-contagem").textContent, "2 de 300");
  assert.ok(!el("cnfs-contagem").classes.has("cft-neg"));

  el("cnfs-codigos").value = Array.from({ length: 301 }, (_, i) => `BR${i}`).join("\n");
  api.contar();
  assert.strictEqual(el("cnfs-contagem").textContent, "301 de 300");
  assert.ok(el("cnfs-contagem").classes.has("cft-neg"));
});

test("resultado soma com e sem NF-e e mostra o erro no lugar da chave", () => {
  const { api } = carregar();
  const html = api.html([COM_NF, DUAS_NF, SEM_NF]);
  const kpis = [...html.matchAll(/cft-kpi-valor[^>]*>(\d+)</g)].map((m) => m[1]);
  assert.strictEqual(kpis.join(), "3,2,1");
  assert.ok(html.includes("3".repeat(44)));
  assert.ok(html.includes("Nenhuma NF-e encontrada para este código."));
});

test("sem nenhuma falha, o total de Sem NF-e não fica vermelho", () => {
  const { api } = carregar();
  assert.ok(!api.html([COM_NF]).includes('cft-kpi-valor cft-neg'));
});

test("código e erro vindos do servidor não viram HTML", () => {
  const { api } = carregar();
  const html = api.html([{ codigo: "<b>x</b>", nfs: [], erro: "<img src=x>" }]);
  assert.ok(!html.includes("<b>x"));
  assert.ok(!html.includes("<img"));
});

test("CSV mantém a chave como texto pro Excel e junta várias NF-e", () => {
  const { api } = carregar();
  const linhas = api.csv([DUAS_NF, SEM_NF]).split("\r\n");
  assert.strictEqual(linhas[0], '"Código BR";"NFs";"Erro"');
  assert.strictEqual(linhas[1], `"BR000000000002B";="${"2".repeat(44)}; ${"3".repeat(44)}";""`);
  assert.strictEqual(linhas[2], '"BR000000000003C";="";"Nenhuma NF-e encontrada para este código."');
});

test("consultar mostra na tela, sem baixar nada, e devolve o botão", async () => {
  const { api, el, baixados } = carregar({ cteApi: async () => ({ resultados: [COM_NF] }) });
  el("cnfs-codigos").value = "BR000000000001A";
  await api.gerar();
  assert.ok(el("cnfs-resultado").innerHTML.includes("1".repeat(44)));
  assert.strictEqual(baixados.length, 0);
  assert.strictEqual(el("cnfs-btn").disabled, false);
  assert.strictEqual(el("cnfs-btn").textContent, "Consultar");
});

test("Exportar CSV baixa o que está na tela", async () => {
  const { api, el, baixados } = carregar({ cteApi: async () => ({ resultados: [COM_NF] }) });
  el("cnfs-codigos").value = "BR000000000001A";
  await api.gerar();
  api.baixar();
  assert.strictEqual(baixados.length, 1);
  assert.match(baixados[0], /^consulta-nfs-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("cada chave tem o próprio botão de copiar", () => {
  const { api } = carregar();
  const html = api.html([DUAS_NF]);
  assert.ok(html.includes(`data-nf="${"2".repeat(44)}"`));
  assert.ok(html.includes(`data-nf="${"3".repeat(44)}"`));
});

test("copiar manda a chave e avisa no próprio botão", async () => {
  const { api, copiados } = carregar();
  const btn = {
    dataset: { nf: "1".repeat(44) }, innerText: "Copiar",
    classList: { add() {}, remove() {} },
  };
  api.copiar(btn);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(copiados[0], "1".repeat(44));
  assert.strictEqual(btn.innerText, "Copiado!");
});

test("sem código não chama o servidor", async () => {
  let chamou = false;
  const { api, el } = carregar({ cteApi: async () => { chamou = true; return {}; } });
  await api.gerar();
  assert.strictEqual(chamou, false);
  assert.ok(el("cnfs-erro").innerHTML.includes("Cole ao menos um código BR."));
});

test("falha do servidor aparece na tela e devolve o botão", async () => {
  const { api, el } = carregar({ cteApi: async () => { throw new Error("Máximo de 300 códigos por vez"); } });
  el("cnfs-codigos").value = "BR1";
  await api.gerar();
  assert.ok(el("cnfs-erro").innerHTML.includes("Máximo de 300"));
  assert.strictEqual(el("cnfs-btn").disabled, false);
});
