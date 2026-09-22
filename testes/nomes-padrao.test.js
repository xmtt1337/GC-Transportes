// Testes da leitura da planilha de Conversão de nomes (js/nomes-padrao.js).
//
// O que se protege: _cnpMapear acha o cabeçalho tolerando maiúscula/acento/grafia, e o
// importar SUBSTITUI a lista inteira no servidor — errar o casamento de coluna aqui faria
// a importação gravar "de" e "para" trocados (ou vazios) sem erro nenhum na tela, e a
// próxima substituição apagaria a lista certa que já existia.
//
// Dados de TESTE, inventados.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "nomes-padrao.js"), "utf8");
const ctx = vm.createContext({ console });
vm.runInContext(fonte + "\n;globalThis.__cnp = { mapear: _cnpMapear, norm: _cnpNorm };", ctx, { filename: "nomes-padrao.js" });
const api = ctx.__cnp;

// Objetos/arrays devolvidos nascem DENTRO do vm, com outro Array/Object.prototype:
// deepStrictEqual reprovaria por realm, não por conteúdo (mesmo padrão de
// calendario-dias.test.js). JSON.stringify/parse traz de volta pro realm de fora.
const plano = (v) => JSON.parse(JSON.stringify(v));

// ── cabeçalho tolerante ──
test("acha o cabecalho com a grafia de hoje (Usuario Transportadora / Nome Sistema)", () => {
  const r = api.mapear([
    ["Usuario Transportadora", "Nome Sistema"],
    ["Adaiane.silva", "Adaiane da Silva - Videira"],
  ]);
  assert.ok(!r.erro);
  assert.deepStrictEqual(plano(r.pares), [{ de: "Adaiane.silva", para: "Adaiane da Silva - Videira" }]);
});

test("cabecalho tolera acento, caixa e espaco a mais", () => {
  const r = api.mapear([
    ["  USUÁRIO TRANSPORTADORA  ", "  nome   sistema  "],
    ["joao123", "João Pedro - Caçador"],
  ]);
  assert.ok(!r.erro);
  assert.strictEqual(r.pares.length, 1);
});

test("aceita as grafias alternativas (de/para)", () => {
  const r = api.mapear([
    ["de", "para"],
    ["a", "b"],
  ]);
  assert.ok(!r.erro);
  assert.deepStrictEqual(plano(r.pares), [{ de: "a", para: "b" }]);
});

test("acha o cabecalho mesmo com linhas em branco ou titulo antes dele", () => {
  const r = api.mapear([
    ["Relatório de correção de nomes"],
    [],
    ["Usuario Transportadora", "Nome Sistema"],
    ["a", "b"],
  ]);
  assert.ok(!r.erro);
  assert.strictEqual(r.pares.length, 1);
});

test("sem as duas colunas, devolve erro em vez de adivinhar", () => {
  const r = api.mapear([
    ["Nome", "Cidade"],
    ["a", "b"],
  ]);
  assert.ok(r.erro);
  assert.strictEqual(r.pares, undefined);
});

test("so uma das duas colunas presente tambem e erro — nao importa so metade do par", () => {
  const r = api.mapear([
    ["Usuario Transportadora", "Outra Coisa"],
    ["a", "b"],
  ]);
  assert.ok(r.erro);
});

// ── linhas ──
test("linha em branco no fim do arquivo nao vira par vazio", () => {
  const r = api.mapear([
    ["Usuario Transportadora", "Nome Sistema"],
    ["a", "b"],
    ["", ""],
    [],
  ]);
  assert.strictEqual(r.pares.length, 1);
});

test("linha com so um dos dois nomes preenchido entra (quem chama filtra os invalidos)", () => {
  const r = api.mapear([
    ["Usuario Transportadora", "Nome Sistema"],
    ["a", "b"],
    ["sem destino", ""],
    ["", "sem origem"],
  ]);
  assert.strictEqual(r.pares.length, 3);
  assert.strictEqual(r.pares.filter((p) => p.de && p.para).length, 1);
});

// ── normalização do cabeçalho ──
test("_cnpNorm tira acento e caixa", () => {
  assert.strictEqual(api.norm("Usuário Transportadora"), "usuario transportadora");
});

test("_cnpNorm de vazio ou nulo nao quebra", () => {
  assert.strictEqual(api.norm(""), "");
  assert.strictEqual(api.norm(null), "");
  assert.strictEqual(api.norm(undefined), "");
});
