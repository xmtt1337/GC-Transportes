// Testes do macro Colador (Recebimento e AT Cluster) — colador.js.
//
//   node --test automacao/alimentacao/testes/test_macro_colador.test.js
//
// Sem DOM de verdade aqui, de proposito (mesma linha do resto da suite): o que
// precisa de teste e a ORQUESTRACAO — qual lote pede, quando confirma, quando
// libera e desiste, o que manda pro vigia — nao "o querySelector acha o campo
// de verdade", que so da pra confirmar olhando a tela real (ver LEIA-ME sobre
// Chrome headless). `S` (spx.js) e `document.querySelector` sao dublados.
//
// O que se protege:
//   - reserva um lote, cola um por um, confirma cada um assim que entra;
//   - falha de colagem libera o codigo (nao fica preso) e conta como falha;
//   - MAX_FALHAS_SEGUIDAS falhas seguidas desiste (nao martela a fila à toa
//     quando a tela mudou ou a aba caiu) — uma colagem boa no meio zera a conta;
//   - campo nao encontrado e falha (a mesma trava acima), nao excecao muda;
//   - "continuo" espera por codigo novo em vez de terminar com a fila vazia;
//   - "nao continuo" termina quando a fila esvazia;
//   - Parar (S.parar) encerra o laco e conta "parado por voce", nao erro;
//   - a AT capturada (mensagem do rede.js) e mandada ao vigia, sem travar a
//     digitacao caso isso falhe;
//   - so responde comando pro proprio qual, e recusa comando sem config;
//   - dois comandos pro mesmo content script (tabs diferentes) nunca rodam
//     juntos - "rodando" e um unico valor.
//
// Dados de TESTE, inventados.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PASTA = path.join(__dirname, '..', 'extensao-macros-spx');

class ParadoFalso extends Error {}

function carregar({ pagina = {}, respostas = {}, botoes = {}, ensinados = {}, soPorFolha = {}, textoDaPagina = '' } = {}) {
  const chamadasVigia = [];
  const painel = { passos: [], notas: [], ok: null, erro: null, aoParar: null, titulo: null };
  const cliques = [];
  const S = {
    Parado: ParadoFalso,
    parar: false,
    dormir: (ms) => new Promise((resolve, reject) => {
      // sincrono o bastante pro teste nao esperar de verdade, mas ainda respeita Parar.
      if (S.parar) return reject(new ParadoFalso('parado por voce'));
      resolve();
    }),
    // Poll por TENTATIVAS (nao por relogio de verdade): o real usa Date.now(),
    // o que faria cada preparar*() gastar segundos de parede reais no teste.
    esperar: async (condicao, opcoes) => {
      const o = opcoes || {};
      for (let i = 0; i < 500; i++) {
        if (S.parar) throw new ParadoFalso('parado por voce');
        let valor = null;
        try { valor = await condicao(); } catch (e) { if (e instanceof ParadoFalso) throw e; }
        if (valor) return valor;
      }
      throw new Error(`nao apareceu a tempo: ${o.oque || 'condicao'}`);
    },
    visivel: (el) => !!el && el.visivel !== false,
    desabilitado: (el) => !!el && !!el.desabilitado,
    escrever: (el, texto) => { el.value = texto; el.escreveu = (el.escreveu || 0) + 1; },
    apertarEnter: (el) => { el.enterApertado = (el.enterApertado || 0) + 1; },
    clicar: (el) => { if (el) { cliques.push(el); el.cliques = (el.cliques || 0) + 1; } return !!el; },
    // soPorFolha: textos que so existem como elemento sem classe clicavel (o
    // caso real que motivou acharPorTexto - "Recebimento unitário" e um grupo
    // de opções do design system do SPX, que acharBotao sozinho não achava).
    acharBotao: (texto) => (soPorFolha[texto] ? null : botoes[texto] || null),
    folhaVisivelComTexto: (texto) => botoes[texto] || soPorFolha[texto] || null,
    rede: { ativas: 0 },
    esperarRede: async () => {},
  };
  const P = {
    abrir(titulo, aoParar) { painel.titulo = titulo; painel.aoParar = aoParar; },
    passo(t) { painel.passos.push(t); },
    nota(t) { painel.notas.push(t); },
    ok(t) { painel.ok = t; },
    erro(t) { painel.erro = t; },
  };

  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document: { querySelector: (sel) => pagina[sel] || null, body: { innerText: textoDaPagina } },
    chrome: {
      runtime: {
        onMessage: { addListener: (f) => { ctx.__ouvinteMsg = f; } },
        sendMessage(msg, cb) {
          chamadasVigia.push(msg);
          const chave = msg.xmColador;
          const r = typeof respostas[chave] === 'function' ? respostas[chave](msg) : respostas[chave];
          if (r === '__NUNCA_RESPONDE__') return; // simula um pedido que nunca volta
          if (r instanceof Error) { cb({ ok: false, error: r.message }); return; }
          cb(r === undefined ? { ok: true } : r);
        },
        lastError: null,
      },
    },
  });
  ctx.window = ctx; // raiz === window: addEventListener('message') compara evento.source com ele
  ctx.window.addEventListener = (tipo, fn) => { if (tipo === 'message') ctx.__ouvinteWindowMsg = fn; };
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'logica.js'), 'utf8'), ctx);
  ctx.XMMacro.spx = S;
  ctx.XMMacro.painel = P;
  ctx.XMMacro.aprender = { elementosEnsinados: (qual) => ensinados[qual] || [] };
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'colador.js'), 'utf8'), ctx, { filename: 'colador.js' });

  // `window` visto de FORA (ctx.window) nao e o mesmo objeto que `window` visto de
  // DENTRO do vm (o global proxy do V8 - vm.createContext contextifica o sandbox,
  // mas o script enxerga um proxy em cima dele). raiz.addEventListener compara
  // evento.source === raiz por identidade: sem pegar essa referencia de DENTRO, a
  // mensagem simulada nunca bateria e a captura de AT pareceria simplesmente muda.
  const raiz = vm.runInContext('window', ctx);

  return { G: ctx.XMMacro, S, P: painel, chamadasVigia, ctx, raiz, cliques };
}

const CONFIG = { xpt: 'XPT_CFC', dia: '2026-09-28', carencia: 60, lote: 20, intervalo: 0, continuo: false, todos_dias: false };

function loteDe(itens, tabela = 'shopee_recebimentos') {
  return { tabela, itens };
}

// Objeto criado DENTRO do vm (as mensagens que colador.js manda) tem outro
// prototipo do deste realm: normaliza antes de comparar com deepStrictEqual.
const plano = (x) => JSON.parse(JSON.stringify(x));

// Faz o campo aparecer UMA vez (pro check de "já preparado" no início de
// rodar() achar de cara e nunca chamar prepararRecebimento/prepararAtCluster)
// e sumir depois disso — pra testar falha DURANTE a colagem, não antes dela.
function campoSoNoInicio(campo, seletorPrincipal) {
  let usado = false;
  return (sel) => {
    if (!usado && sel === seletorPrincipal) { usado = true; return campo; }
    return null;
  };
}

// ── uma rodada simples ──────────────────────────────────────────────────────
test('cola um codigo, confirma, e termina quando a fila esvazia (nao continuo)', async () => {
  const campo = { desabilitado: false };
  const { G, P, chamadasVigia } = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': campo },
    respostas: {
      lote: (m) => (chamadasVigia.filter((c) => c.xmColador === 'lote').length === 1
        ? loteDe([{ id: 1, codigo: 'BR1' }]) : loteDe([])),
      confirmar: { ok: true, atualizados: 1 },
    },
  });
  await G.colador.rodar('recebimento', CONFIG);
  assert.strictEqual(P.ok, '1 colado(s)');
  assert.strictEqual(campo.value, 'BR1');
  assert.strictEqual(campo.enterApertado, 1);
  const confirmou = chamadasVigia.find((c) => c.xmColador === 'confirmar');
  assert.deepStrictEqual(plano(confirmou), { xmColador: 'confirmar', modo: 'recebimento', tabela: 'shopee_recebimentos', ids: [1] });
});

test('lote pedido leva xpt/dia/carencia/lote da config', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: loteDe([]), confirmar: { ok: true } },
  });
  await r.G.colador.rodar('recebimento', CONFIG);
  const pedido = r.chamadasVigia.find((c) => c.xmColador === 'lote');
  assert.deepStrictEqual(plano(pedido), {
    xmColador: 'lote', modo: 'recebimento', tam: 20, carencia: 60, dia: '2026-09-28', xpt: 'XPT_CFC',
  });
});

test('todos_dias manda dia null pro backend (nao inventa uma data)', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: loteDe([]) },
  });
  await r.G.colador.rodar('recebimento', { ...CONFIG, todos_dias: true, dia: null });
  const pedido = r.chamadasVigia.find((c) => c.xmColador === 'lote');
  assert.strictEqual(pedido.dia, null);
});

test('cola varios da mesma tabela, um por um, cada um confirmado na hora', async () => {
  const campo = { desabilitado: false };
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': campo },
    respostas: {
      lote: (m) => (r.chamadasVigia.filter((c) => c.xmColador === 'lote').length === 1
        ? loteDe([{ id: 1, codigo: 'BR1' }, { id: 2, codigo: 'BR2' }]) : loteDe([])),
      confirmar: { ok: true },
    },
  });
  await r.G.colador.rodar('recebimento', CONFIG);
  const confirmados = r.chamadasVigia.filter((c) => c.xmColador === 'confirmar').map((c) => c.ids[0]);
  assert.deepStrictEqual(confirmados, [1, 2]);
  assert.strictEqual(r.P.ok, '2 colado(s)');
});

// ── falha e desistencia ──────────────────────────────────────────────────────
test('campo nao encontrado libera o codigo e conta como falha (nao excecao muda)', async () => {
  const r = carregar({
    pagina: {},
    respostas: {
      lote: (m) => (r.chamadasVigia.filter((c) => c.xmColador === 'lote').length === 1
        ? loteDe([{ id: 1, codigo: 'BR1' }]) : loteDe([])),
    },
  });
  // "Já preparado" no início de rodar() acha o campo uma vez; ele some depois -
  // é a colagem em si que precisa falhar, não a preparação da tela.
  r.ctx.document.querySelector = campoSoNoInicio({ desabilitado: false }, 'input[placeholder="Por favor, insira"]');
  await r.G.colador.rodar('recebimento', CONFIG);
  const liberou = r.chamadasVigia.find((c) => c.xmColador === 'liberar');
  assert.deepStrictEqual(plano(liberou), { xmColador: 'liberar', modo: 'recebimento', tabela: 'shopee_recebimentos', ids: [1] });
  assert.match(r.P.notas.at(-1), /não colei BR1/);
});

test('depois de MAX_FALHAS_SEGUIDAS falhas seguidas, desiste com erro (nao martela a fila)', async () => {
  const r = carregar({
    pagina: {},
    respostas: {
      lote: (m) => (r.chamadasVigia.filter((c) => c.xmColador === 'lote').length === 1
        ? loteDe([{ id: 1, codigo: 'BR1' }, { id: 2, codigo: 'BR2' }, { id: 3, codigo: 'BR3' }, { id: 4, codigo: 'BR4' }])
        : loteDe([])),
    },
  });
  r.ctx.document.querySelector = campoSoNoInicio({ desabilitado: false }, 'input[placeholder="Por favor, insira"]');
  await r.G.colador.rodar('recebimento', CONFIG);
  assert.match(r.P.erro, /falhas seguidas/);
  // parou antes do 4o - nao gastou o lote inteiro tentando
  assert.strictEqual(r.chamadasVigia.filter((c) => c.xmColador === 'liberar').length, 3);
});

test('uma colagem boa no meio zera a contagem de falhas seguidas', async () => {
  // Campo some (falha), aparece (cola - zera a conta), some de novo duas vezes
  // (2 falhas seguidas, nunca bate as 3 de MAX_FALHAS_SEGUIDAS): termina bem.
  let chamada = 0;
  // O 1o elemento e so pro check de "ja preparado" no inicio de rodar() achar
  // de cara; os 4 seguintes sao BR1..BR4 (falha, cola, falha, falha).
  const seq = [{ desabilitado: false }, null, { desabilitado: false }, null, null];
  const r = carregar({ pagina: {}, respostas: {
    lote: () => (r.chamadasVigia.filter((c) => c.xmColador === 'lote').length === 1
      ? loteDe([{ id: 1, codigo: 'BR1' }, { id: 2, codigo: 'BR2' }, { id: 3, codigo: 'BR3' }, { id: 4, codigo: 'BR4' }])
      : loteDe([])),
    confirmar: { ok: true },
  } });
  // So o PRIMEIRO seletor do catalogo consome da sequencia - os de fallback (que
  // tambem contem "insira") tem que continuar mudos, senao um acharCampo() so
  // consumiria 2 posicoes da vez (o primeiro falhando e caindo no fallback).
  r.ctx.document.querySelector = (sel) => (sel === 'input[placeholder="Por favor, insira"]' ? seq[chamada++] : null);
  await r.G.colador.rodar('recebimento', CONFIG);
  assert.strictEqual(r.P.ok, '1 colado(s)');
});

// ── continuo ──────────────────────────────────────────────────────────────
test('continuo espera por codigo novo em vez de terminar com a fila vazia', async () => {
  let pedidos = 0;
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: {
      lote: () => {
        pedidos++;
        if (pedidos === 1) return loteDe([{ id: 1, codigo: 'BR1' }]);
        if (pedidos === 2) { r.S.parar = true; return loteDe([]); } // simula o Parar chegando na espera
        return loteDe([]);
      },
      confirmar: { ok: true },
    },
  });
  await r.G.colador.rodar('recebimento', { ...CONFIG, continuo: true });
  assert.strictEqual(r.P.erro, 'parado por você');
  assert.ok(pedidos >= 2);
});

// ── Parar ────────────────────────────────────────────────────────────────
test('Parar no meio conta "parado por voce", nao erro', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: () => { r.S.parar = true; return loteDe([{ id: 1, codigo: 'BR1' }]); } },
  });
  await r.G.colador.rodar('recebimento', CONFIG);
  assert.strictEqual(r.P.erro, 'parado por você');
});

// ── AT capturada ─────────────────────────────────────────────────────────
test('AT capturada (mensagem do rede.js) e mandada ao vigia', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Please Scan or Input"]': { desabilitado: false } },
    respostas: {
      lote: (m) => (r.chamadasVigia.filter((c) => c.xmColador === 'lote').length === 1
        ? loteDe([{ id: 1, codigo: 'BR1' }]) : loteDe([])),
      confirmar: { ok: true },
      at: { ok: true, atualizados: 1 },
    },
  });
  r.ctx.__ouvinteWindowMsg({ source: r.raiz, data: { __xmMacroAt: true, codigo: 'BR1', at: 'AT1' } });
  await r.G.colador.rodar('at_cluster', CONFIG);
  const at = r.chamadasVigia.find((c) => c.xmColador === 'at');
  assert.deepStrictEqual(plano(at), { xmColador: 'at', codigo: 'BR1', dia: '2026-09-28', at: 'AT1' });
});

test('mensagem de outra origem (source diferente) e ignorada', async () => {
  const r = carregar({ pagina: {}, respostas: { lote: loteDe([]) } });
  r.ctx.__ouvinteWindowMsg({ source: {}, data: { __xmMacroAt: true, codigo: 'BR1', at: 'AT1' } });
  await r.G.colador.rodar('at_cluster', CONFIG);
  assert.ok(!r.chamadasVigia.some((c) => c.xmColador === 'at'));
});

test('erro ao gravar a AT nao trava a colagem (tenta de novo na proxima rodada)', async () => {
  let tentativasAt = 0;
  const r = carregar({
    pagina: { 'input[placeholder="Please Scan or Input"]': { desabilitado: false } },
    respostas: {
      lote: (m) => (r.chamadasVigia.filter((c) => c.xmColador === 'lote').length === 1
        ? loteDe([{ id: 1, codigo: 'BR1' }]) : loteDe([])),
      confirmar: { ok: true },
      at: () => { tentativasAt++; return new Error('servidor fora'); },
    },
  });
  r.ctx.__ouvinteWindowMsg({ source: r.raiz, data: { __xmMacroAt: true, codigo: 'BR1', at: 'AT1' } });
  await r.G.colador.rodar('at_cluster', CONFIG);
  assert.strictEqual(r.P.ok, '1 colado(s)', 'a colagem termina bem mesmo com a AT falhando');
  assert.ok(tentativasAt >= 1);
});

// ── preparar a tela (criar a RT / a tarefa de separação) ───────────────────
function comCampoDeRotulo(container) {
  return { parentElement: { querySelector: () => container } };
}

test('prepararRecebimento: campo ja pronto nao clica em nada', async () => {
  const r = carregar({ pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } } });
  await r.G.colador.prepararRecebimento();
  assert.strictEqual(r.cliques.length, 0);
});

test('prepararRecebimento: clica em "Recebimento unitário" e depois em "Receber por pedido"', async () => {
  const recebimentoUnitario = {};
  const receberPorPedido = {};
  let apareceu = false;
  const r = carregar({ botoes: { 'Recebimento unitário': recebimentoUnitario, 'Receber por pedido': receberPorPedido } });
  r.ctx.document.querySelector = (sel) => (apareceu && sel === 'input[placeholder="Por favor, insira"]' ? { desabilitado: false } : null);
  const clicarOriginal = r.S.clicar;
  r.S.clicar = (el) => { if (el === recebimentoUnitario) apareceu = true; return clicarOriginal(el); };

  await r.G.colador.prepararRecebimento();
  assert.deepStrictEqual(r.cliques, [recebimentoUnitario, receberPorPedido]);
});

// Bug de verdade, achado testando contra o SPX (29/09/2026): "Recebimento
// unitário"/"Receber por pedido" são um grupo de opções (radio/toggle) do
// design system do SPX, sem classe "btn"/"button" — acharBotao sozinho nunca
// achava. acharPorTexto cai pra folhaVisivelComTexto (acha por TEXTO, sem
// depender de classe) - mesmo fallback que alimentacao.js já usa pro "Mais".
test('prepararRecebimento: acha por TEXTO mesmo quando nao e um elemento clicavel (bug real do SPX)', async () => {
  const recebimentoUnitario = {};
  const receberPorPedido = {};
  let apareceu = false;
  const r = carregar({
    soPorFolha: { 'Recebimento unitário': recebimentoUnitario, 'Receber por pedido': receberPorPedido },
  });
  r.ctx.document.querySelector = (sel) => (apareceu && sel === 'input[placeholder="Por favor, insira"]' ? { desabilitado: false } : null);
  const clicarOriginal = r.S.clicar;
  r.S.clicar = (el) => { if (el === recebimentoUnitario) apareceu = true; return clicarOriginal(el); };

  await r.G.colador.prepararRecebimento();
  assert.deepStrictEqual(r.cliques, [recebimentoUnitario, receberPorPedido]);
});

test('prepararRecebimento: sem o botão "Recebimento unitário", erro claro', async () => {
  const r = carregar({ pagina: {}, botoes: {} });
  await assert.rejects(r.G.colador.prepararRecebimento(), /Recebimento unitário/);
});

test('prepararAtCluster: passa pelo formulário inteiro (Static, YES, os dois ensinados, Confirm, Participar)', async () => {
  const grupoRotasCampo = {};
  const tipoRotaCampo = {};
  const grupoRotasOpcao = { desabilitado: false };
  const tipoRotaOpcao = { desabilitado: false };
  const botoes = {
    'Criar tarefa': {},
    'Criar Tarefa de Separação': {}, // achado por folhaVisivelComTexto, so pra confirmar que o form abriu
    'Static': {},
    'YES': {},
    'Grupo de Rotas': comCampoDeRotulo(grupoRotasCampo),
    'Tipo de Rota de Entrega': comCampoDeRotulo(tipoRotaCampo),
    'Confirm': {},
    'Participar Desta Tarefa': {},
  };
  let participou = false;
  const r = carregar({
    botoes,
    ensinados: { grupo_rotas: [grupoRotasOpcao], tipo_rota_entrega: [tipoRotaOpcao] },
  });
  r.ctx.document.querySelector = (sel) => (participou && sel === 'input[placeholder="Please Scan or Input"]' ? { desabilitado: false } : null);
  const clicarOriginal = r.S.clicar;
  r.S.clicar = (el) => { if (el === botoes['Participar Desta Tarefa']) participou = true; return clicarOriginal(el); };

  await r.G.colador.prepararAtCluster();
  assert.deepStrictEqual(r.cliques, [
    botoes['Criar tarefa'], botoes['Static'], botoes['YES'],
    grupoRotasCampo, grupoRotasOpcao, tipoRotaCampo, tipoRotaOpcao,
    botoes['Confirm'], botoes['Participar Desta Tarefa'],
  ]);
});

test('prepararAtCluster: sem o botão "Criar tarefa", erro claro', async () => {
  const r = carregar({ pagina: {}, botoes: {} });
  await assert.rejects(r.G.colador.prepararAtCluster(), /Criar tarefa/);
});

test('prepararAtCluster: "Grupo de Rotas" nao ensinado pede pra ensinar (Alt+G)', async () => {
  const botoes = {
    'Criar tarefa': {}, 'Criar Tarefa de Separação': {}, 'Static': {}, 'YES': {},
    'Grupo de Rotas': comCampoDeRotulo({}),
  };
  const r = carregar({ botoes, ensinados: {} }); // nada ensinado
  await assert.rejects(r.G.colador.prepararAtCluster(), /Alt\+G/);
});

test('campoDoRotulo: sobe ate achar um campo dentro do container do rotulo', () => {
  const campo = { desabilitado: false };
  const r = carregar({ botoes: { 'Meu Rótulo': comCampoDeRotulo(campo) } });
  assert.strictEqual(r.G.colador.campoDoRotulo('Meu Rótulo'), campo);
});

test('campoDoRotulo: sem o rotulo, null', () => {
  const r = carregar({ botoes: {} });
  assert.strictEqual(r.G.colador.campoDoRotulo('Nao Existe'), null);
});

// ── dispatch (chrome.runtime.onMessage) ─────────────────────────────────────
test('so responde comando do proprio catalogo, e exige config', () => {
  const r = carregar({ pagina: {}, respostas: {} });
  const respostas = [];
  const responder = (x) => respostas.push(x);

  r.ctx.__ouvinteMsg({ xmMacro: 'recebimento' }, {}, responder); // sem config
  assert.deepStrictEqual(plano(respostas.pop()), { ok: false, error: 'comando sem config' });

  r.ctx.__ouvinteMsg({ xmMacro: 'outro-macro', config: {} }, {}, responder);
  assert.strictEqual(respostas.length, 0, 'nao e do catalogo do colador - nem responde');
});

test('comando valido aceita e comeca a rodar', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: loteDe([]) },
  });
  const respostas = [];
  r.ctx.__ouvinteMsg({ xmMacro: 'recebimento', config: CONFIG }, {}, (x) => respostas.push(x));
  assert.deepStrictEqual(plano(respostas), [{ ok: true }]);
  await new Promise((res) => setImmediate(res));
  assert.strictEqual(r.P.ok, '0 colado(s)');
});

test('comando pro mesmo qual enquanto ja esta rodando e recusado', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: '__NUNCA_RESPONDE__' }, // fica "rodando" pra sempre
  });
  const respostas = [];
  r.ctx.__ouvinteMsg({ xmMacro: 'recebimento', config: CONFIG }, {}, (x) => respostas.push(x));
  await new Promise((res) => setImmediate(res));
  r.ctx.__ouvinteMsg({ xmMacro: 'recebimento', config: CONFIG }, {}, (x) => respostas.push(x));
  assert.deepStrictEqual(plano(respostas[1]), { ok: false, error: 'Colador — Recebimento já está rodando' });
});

// ── diaDoLote / diaDaAt (pura) ───────────────────────────────────────────────
test('diaDoLote: todos_dias manda null, senao o dia do filtro', () => {
  const r = carregar({ pagina: {}, respostas: {} });
  assert.strictEqual(r.G.colador.diaDoLote({ todos_dias: true, dia: '2026-09-28' }), null);
  assert.strictEqual(r.G.colador.diaDoLote({ todos_dias: false, dia: '2026-09-28' }), '2026-09-28');
});

test('diaDaAt: usa o dia do filtro, ou hoje se "todos os dias"', () => {
  const r = carregar({ pagina: {}, respostas: {} });
  assert.strictEqual(r.G.colador.diaDaAt({ dia: '2026-09-28' }), '2026-09-28');
  assert.match(r.G.colador.diaDaAt({ dia: null }), /^\d{4}-\d{2}-\d{2}$/);
});

// ── xptDaPagina / xptEfetivo (evita misturar código de polo errado) ─────────
// Motivo de existir: com a MESMA extensão rodando em SPX de contas diferentes
// (Caçador e Videira, cada PC na sua conta, ao mesmo tempo), uma config errada
// ou esquecida não pode colar código de um polo na tela do outro.
test('xptDaPagina acha o XPT no e-mail logado (adm.xpt-cfc-01@...)', () => {
  const r = carregar({ textoDaPagina: 'Bem-vindo, adm.xpt-cfc-01@shopeemobile-external.com' });
  assert.strictEqual(r.G.colador.xptDaPagina(), 'XPT_CFC');
});

test('xptDaPagina acha VIA tambem, e ignora caixa', () => {
  const r = carregar({ textoDaPagina: 'XPT-via encontrado em algum lugar da tela' });
  assert.strictEqual(r.G.colador.xptDaPagina(), 'XPT_VIA');
});

test('xptDaPagina sem nenhum sinal na tela devolve null', () => {
  const r = carregar({ textoDaPagina: 'nada de util aqui' });
  assert.strictEqual(r.G.colador.xptDaPagina(), null);
});

test('xptEfetivo usa o da pagina quando da pra detectar, mesmo com config diferente ausente', () => {
  const r = carregar({ textoDaPagina: 'adm.xpt-via-01@shopeemobile-external.com' });
  assert.strictEqual(r.G.colador.xptEfetivo({ xpt: '' }), 'XPT_VIA');
});

test('xptEfetivo cai pra config quando a pagina nao da nenhum sinal', () => {
  const r = carregar({ textoDaPagina: '' });
  assert.strictEqual(r.G.colador.xptEfetivo({ xpt: 'XPT_CFC' }), 'XPT_CFC');
});

test('xptEfetivo sem pagina NEM config devolve null (sem filtro de xpt)', () => {
  const r = carregar({ textoDaPagina: '' });
  assert.strictEqual(r.G.colador.xptEfetivo({ xpt: '' }), null);
});

test('xptEfetivo RECUSA rodar quando a pagina discorda da config (bug real que motivou isso)', () => {
  const r = carregar({ textoDaPagina: 'adm.xpt-via-01@shopeemobile-external.com' });
  assert.throws(() => r.G.colador.xptEfetivo({ xpt: 'XPT_CFC' }), /XPT_CFC.*XPT_VIA|logada em XPT_VIA/);
});

test('rodar: para ANTES de preparar a tela quando o XPT nao bate (nao cria RT/tarefa à toa)', async () => {
  const r = carregar({
    textoDaPagina: 'adm.xpt-via-01@shopeemobile-external.com',
    botoes: { 'Recebimento unitário': {} }, // se preparar fosse chamado, acharia e clicaria
  });
  await r.G.colador.rodar('recebimento', { ...CONFIG, xpt: 'XPT_CFC' });
  assert.match(r.P.erro, /XPT_VIA/);
  assert.strictEqual(r.cliques.length, 0, 'nao chegou a clicar em nada da preparação');
});

test('rodar: usa o XPT da pagina no pedido de lote, mesmo com a config vazia', async () => {
  const r = carregar({
    textoDaPagina: 'adm.xpt-via-01@shopeemobile-external.com',
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: loteDe([]) },
  });
  await r.G.colador.rodar('recebimento', { ...CONFIG, xpt: '' });
  const pedido = r.chamadasVigia.find((c) => c.xmColador === 'lote');
  assert.strictEqual(pedido.xpt, 'XPT_VIA');
});
