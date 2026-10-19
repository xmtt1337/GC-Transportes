// Testes do macro Pedidos Pesquisados (pedidos.js) - a parte de pedir os codigos ao vigia.
//
//   node --test automacao/alimentacao/testes/test_macro_pedidos.test.js
//
// O que se protege:
//   - ENCADEADO na AT, "0 codigos" nao e resposta final: a AT termina quando o Chrome baixa o
//     arquivo, mas o dado so chega no banco depois que o vigia manda (pode levar minutos). Em
//     01/10/2026 a AT rodou certo e o Pedidos falhou com "nao ha pedido novo" por perguntar cedo;
//   - mesmo encadeado, desiste depois do prazo (nao fica preso pra sempre) com um motivo que
//     aponta pro vigia, e nao pra "rode a AT antes" (ela acabou de rodar);
//   - disparo MANUAL continua falhando na hora com 0 codigos;
//   - Parar durante a espera encerra (S.dormir respeita S.parar).
//
// Relogio falso: S.dormir avanca o Date.now() do contexto, sem esperar de verdade.
// Dados de TESTE, inventados.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PASTA = path.join(__dirname, '..', 'extensao-macros-spx');
class ParadoFalso extends Error {}

// `respostas`: o que o vigia devolve a cada pergunta de pendentes, em ordem (a ultima se repete).
function carregar(respostas, textoDaPagina = 'Shopee Xpress XPT_SC_Caçador Busca Painel') {
  let agora = Date.UTC(2026, 9, 1, 0, 20, 0);
  class DataFalsa extends Date {
    constructor(...a) { if (a.length) super(...a); else super(agora); }
    static now() { return agora; }
  }
  const perguntas = [];
  const painel = { notas: [] };
  const S = {
    Parado: ParadoFalso,
    parar: false,
    dormir: async (ms) => { if (S.parar) throw new ParadoFalso('parado'); agora += ms; },
  };
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    Date: DataFalsa,
    document: { body: { innerText: textoDaPagina } },
    chrome: { runtime: {
      onMessage: { addListener() {} },
      async sendMessage(msg) {
        perguntas.push(msg);
        return respostas[Math.min(perguntas.length - 1, respostas.length - 1)];
      },
    } },
  });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'logica.js'), 'utf8'), ctx);
  ctx.XMMacro.spx = S;
  ctx.XMMacro.painel = { nota: (t) => painel.notas.push(t), passo() {}, abrir() {}, ok() {}, erro() {} };
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'pedidos.js'), 'utf8'), ctx, { filename: 'pedidos.js' });
  return { G: ctx.XMMacro, S, perguntas, painel, minutosPassados: () => (agora - Date.UTC(2026, 9, 1, 0, 20, 0)) / 60000 };
}

const VAZIO = { ok: true, codigos: [], total: 0 };
const COM = (n) => ({ ok: true, codigos: Array.from({ length: n }, (_, i) => `BR${i}`), total: n });

test('encadeado: 0 codigos na primeira pergunta espera a carga chegar e segue quando ela chega', async () => {
  const r = carregar([VAZIO, VAZIO, COM(3)]);
  const codigos = await r.G.pedidos.pedirCodigos({ encadeado: true });
  assert.strictEqual(codigos.length, 3);
  assert.strictEqual(r.perguntas.length, 3);
  assert.ok(r.painel.notas.some((n) => /aguardando o XM Vigia/.test(n)));
});

test('encadeado: desiste depois de ~6 min com motivo que aponta pro vigia (nao "rode a AT antes")', async () => {
  const r = carregar([VAZIO]);
  await assert.rejects(r.G.pedidos.pedirCodigos({ encadeado: true }), (e) => {
    assert.match(e.message, /não chegou no banco em 6 min/);
    assert.doesNotMatch(e.message, /rode o macro da AT/);
    return true;
  });
  assert.ok(r.minutosPassados() >= 6 && r.minutosPassados() < 7, `esperou ${r.minutosPassados()} min`);
});

test('manual: 0 codigos falha na hora, sem esperar (quem clicou quer saber ja)', async () => {
  const r = carregar([VAZIO, COM(5)]);
  await assert.rejects(r.G.pedidos.pedirCodigos(), /não há pedido novo pra pesquisar/);
  assert.strictEqual(r.perguntas.length, 1);
  assert.strictEqual(r.minutosPassados(), 0);
});

test('encadeado com codigos de cara nao espera nada', async () => {
  const r = carregar([COM(2)]);
  assert.strictEqual((await r.G.pedidos.pedirCodigos({ encadeado: true })).length, 2);
  assert.strictEqual(r.perguntas.length, 1);
});

test('vigia fora do ar continua sendo erro na hora, mesmo encadeado (nao e "carga atrasada")', async () => {
  const r = carregar([{ ok: false, error: 'connection refused' }]);
  await assert.rejects(r.G.pedidos.pedirCodigos({ encadeado: true }), /XM Vigia não respondeu/);
  assert.strictEqual(r.perguntas.length, 1);
});

// Achado ao vivo (01/10/2026): de noite a AT nao muda, o SPX exporta o MESMO arquivo e o vigia
// nao regrava (igual a um ja enviado). "0 codigos" ai e "nada novo", nao "a carga atrasou" -
// esperar 6 min pra falhar em vermelho seria mentir duas vezes.
test('encadeado: vigia diz que a AT acabou de vir repetida -> null (nada novo), sem esperar', async () => {
  const r = carregar([{ ...VAZIO, at_repetida_ha_s: 12 }]);
  assert.strictEqual(await r.G.pedidos.pedirCodigos({ encadeado: true }), null);
  assert.strictEqual(r.perguntas.length, 1);
  assert.strictEqual(r.minutosPassados(), 0);
});

test('encadeado: "repetida" de outra rodada (mais de 2 min) nao conta - espera a carga', async () => {
  const r = carregar([{ ...VAZIO, at_repetida_ha_s: 900 }, COM(4)]);
  assert.strictEqual((await r.G.pedidos.pedirCodigos({ encadeado: true })).length, 4);
});

test('manual: AT repetida nao muda nada - 0 codigos continua erro na hora', async () => {
  const r = carregar([{ ...VAZIO, at_repetida_ha_s: 5 }]);
  await assert.rejects(r.G.pedidos.pedirCodigos(), /não há pedido novo/);
});

test('encadeado: com codigos, a marca de repetida e ignorada (tem o que pesquisar)', async () => {
  const r = carregar([{ ...COM(3), at_repetida_ha_s: 5 }]);
  assert.strictEqual((await r.G.pedidos.pedirCodigos({ encadeado: true })).length, 3);
});

test('Parar durante a espera encerra', async () => {
  const r = carregar([VAZIO]);
  r.S.parar = true;
  await assert.rejects(r.G.pedidos.pedirCodigos({ encadeado: true }), ParadoFalso);
});

// Achado ao vivo (02/10 23:17 e 03/10 00:00): "pedi a exportação 3 vezes e nenhuma tarefa nasceu"
// - o painel era olhado UMA vez, 4s depois do clique; de noite a tarefa demorava mais pra nascer.
function carregarExportacao({ nasceNaLeitura }) {
  const r = carregar([COM(1)]);
  let leituras = 0;
  let pedidos = 0;
  const nova = { nome: 'Return Order', quando: '2026-10-03 00:00:30' };
  r.G.painelDeTarefas = {
    lerTarefasAgora: async () => { leituras++; return leituras >= nasceNaLeitura ? [nova] : []; },
    fecharPainelTarefas: async () => {},
  };
  // Só o necessário pra exportarPesquisados() "clicar" sem DOM de verdade.
  const S = r.S;
  Object.assign(S, {
    acharBotao: () => ({}), folhaVisivelComTexto: () => null, passarMouse() {}, apertarEsc() {},
    clicarNoPonto: () => { pedidos++; }, clicar: () => { pedidos++; }, rede: { ativas: 0 }, esperarRede: async () => {},
    // Por TENTATIVAS (limite/intervalo), sem relógio: o dormir falso não avança o Date.now daqui.
    esperar: async (cond, o) => {
      const voltas = Math.ceil((o.limite || 15000) / (o.intervalo || 200));
      for (let i = 0; i <= voltas; i++) { const v = await cond(); if (v) return v; await S.dormir(o.intervalo || 200); }
      throw new Error('tempo');
    },
  });
  return { r, nova, pedidos: () => pedidos };
}

test('exportacao: tarefa que nasce ~15s depois do clique e aceita no 1o pedido (nao pede de novo)', async () => {
  const { r, nova, pedidos } = carregarExportacao({ nasceNaLeitura: 7 }); // 3s + 6 leituras de 2s
  const achada = await r.G.pedidos.pedirExportacao([]);
  assert.strictEqual(achada.nome, nova.nome);
  assert.strictEqual(pedidos(), 1);
});

test('exportacao: tarefa que nunca nasce ainda desiste depois de 3 pedidos', async () => {
  const { r, pedidos } = carregarExportacao({ nasceNaLeitura: Infinity });
  await assert.rejects(r.G.pedidos.pedirExportacao([]), /3 vezes/);
  assert.strictEqual(pedidos(), 3);
});

// Achado ao vivo (15/10/2026): 7311 códigos colados, parte deles não existe no SPX ("Pedidos
// não encontrados"). O rodapé fechava num número menor e nunca no total - o macro travava 3 min
// e desistia.
test('rodape: fecha no total quando todos foram encontrados', () => {
  const r = carregar([COM(1)]);
  const rod = r.G.pedidos.novoRodape(7311);
  assert.strictEqual(rod.ler(7311, false), 7311);
});

test('rodape: com "nao encontrados", aceita o numero menor so depois de parar de mudar', () => {
  const r = carregar([COM(1)]);
  const rod = r.G.pedidos.novoRodape(7311);
  const leituras = [7000, 7280, 7280, 7280, 7280, 7280, 7280, 7280]; // a 1a 7280 + 6 iguais
  const resultados = leituras.map((n) => rod.ler(n, true));
  assert.deepStrictEqual(resultados.slice(0, 7), [null, null, null, null, null, null, null]);
  assert.strictEqual(resultados[7], 7280);
});

// 15/10/2026: 'Esperado 4825' parado e o aviso na tela, mas o aviso nao foi achado - sem ele,
// vale o numero parado por bem mais tempo (20 leituras), nunca antes disso.
test('rodape: sem o aviso, numero menor so vale depois de 20 leituras iguais', () => {
  const r = carregar([COM(1)]);
  const rod = r.G.pedidos.novoRodape(7313);
  const res = Array.from({ length: 21 }, () => rod.ler(4825, false));
  assert.ok(res.slice(0, 20).every((x) => x === null));
  assert.strictEqual(res[20], 4825);
});

test('rodape: numero piscando maior que o total nunca vale, mesmo parado', () => {
  const r = carregar([COM(1)]);
  const rod = r.G.pedidos.novoRodape(3256);
  for (let i = 0; i < 20; i++) assert.strictEqual(rod.ler(1055090, true), null);
});

test('estacao: pede ao vigia so os pendentes da estacao logada embaixo da logo', async () => {
  const r = carregar([COM(2)], 'Shopee Xpress XPT_SC_Videira Busca');
  await r.G.pedidos.pedirCodigos();
  assert.strictEqual(r.perguntas[0].estacao, 'XPT_SC_Videira');
});

test('estacao: sem XPT_SC_ na tela recusa, em vez de pesquisar codigos de outro polo', async () => {
  const r = carregar([COM(2)], 'carregando...');
  await assert.rejects(r.G.pedidos.pedirCodigos(), /não achei a estação/);
  assert.strictEqual(r.perguntas.length, 0);
});

// 19/10/2026: busca so com codigos de outra estacao - o SPX nao desenha o rodape "Esperado N".
test('rodape: sem rodape e com o aviso de "nao encontrados" por 10 leituras, a resposta e zero', () => {
  const r = carregar([COM(1)]);
  const rod = r.G.pedidos.novoRodape(3073);
  const res = Array.from({ length: 10 }, () => rod.ler(null, true));
  assert.ok(res.slice(0, 9).every((x) => x === null));
  assert.strictEqual(res[9], 0);
});

test('rodape: sem rodape e SEM o aviso nunca conclui zero (pode ser so a tela carregando)', () => {
  const r = carregar([COM(1)]);
  const rod = r.G.pedidos.novoRodape(3073);
  for (let i = 0; i < 30; i++) assert.strictEqual(rod.ler(null, false), null);
});

test('rodape: o aviso piscando nao soma leituras de zero', () => {
  const r = carregar([COM(1)]);
  const rod = r.G.pedidos.novoRodape(3073);
  for (let i = 0; i < 30; i++) assert.strictEqual(rod.ler(null, i % 2 === 0), null);
});
