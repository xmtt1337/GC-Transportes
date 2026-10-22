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

function carregar({ pagina = {}, respostas = {}, botoes = {}, ensinados = {}, soPorFolha = {}, textoDaPagina = '',
  hash = '#/generalReceiveTaskOps/singleReceiveNew/RT1', opcoes = () => [] } = {}) {
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
    folhasComTexto: (texto) => opcoes().filter((o) => o.textContent === texto),
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
    document: { querySelector: (sel) => pagina[sel] || null, querySelectorAll: () => opcoes(), body: { innerText: textoDaPagina } },
    location: { hash },
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
  ctx.XMMacro.aprender = {
    carregar: async () => {},
    elementosEnsinados: (qual) => ensinados[qual] || [],
  };
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

// Bug de verdade, achado ao vivo (01/10/2026): código aparecia certinho em Shopee > Receber mas
// o Colador nunca achava nada - sem o diagnóstico (colagem.js) junto do lote vazio, não dava pra
// saber se era dia/xpt errado ou já colado sem acesso direto ao banco.
test('lote vazio com diagnostico: a nota mostra em qual etapa o código está sumindo', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: {
      lote: () => {
        r.S.parar = true;
        return { tabela: null, itens: [], diagnostico: { total: 4, do_dia: 3, do_dia_e_xpt: 2, pendentes: 1 } };
      },
    },
  });
  await r.G.colador.rodar('recebimento', { ...CONFIG, continuo: true });
  const ultimaNota = r.P.notas[r.P.notas.length - 1];
  assert.match(ultimaNota, /hoje: 3 · desse XPT: 2 · pendentes: 1/);
});

test('lote vazio SEM diagnostico (resposta antiga, ou o proprio diagnostico falhou) nao quebra a nota', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: {
      lote: () => { r.S.parar = true; return loteDe([]); },
    },
  });
  await r.G.colador.rodar('recebimento', { ...CONFIG, continuo: true });
  const ultimaNota = r.P.notas[r.P.notas.length - 1];
  assert.strictEqual(ultimaNota, '0 colado(s) até agora · aguardando novos códigos');
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

// ── Parar remoto (tela Macros -> fundo.js -> xmColadorParar) ────────────────
test('xmColadorParar so marca S.parar se for o QUAL que esta rodando agora', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: '__NUNCA_RESPONDE__' }, // fica "rodando" pra sempre - so pra fixar `rodando`
  });
  // Chega ANTES de qualquer coisa rodar, e pro qual errado - nao pode mexer em nada.
  r.ctx.__ouvinteMsg({ xmColadorParar: 'at_cluster' }, {}, () => {});
  assert.strictEqual(r.S.parar, false);

  r.ctx.__ouvinteMsg({ xmMacro: 'recebimento', config: CONFIG }, {}, () => {});
  await new Promise((res) => setImmediate(res));

  r.ctx.__ouvinteMsg({ xmColadorParar: 'at_cluster' }, {}, () => {}); // qual errado, ja rodando
  assert.strictEqual(r.S.parar, false);
  r.ctx.__ouvinteMsg({ xmColadorParar: 'recebimento' }, {}, () => {}); // o certo
  assert.strictEqual(r.S.parar, true);
});

// Bug de verdade, achado ao vivo (01/10/2026): um "parar" pedido pra uma rodada que JÁ tinha
// terminado chegava atrasado (~30s do vigia) bem quando uma rodada NOVA do mesmo qual na mesma
// máquina tinha acabado de começar - e derrubava ela por engano, só por bater o qual. Agora o
// recado também carrega o id do comando (fundo.js), e só para se o id bater também.
test('xmColadorParar com id DIFERENTE do que está rodando não para, mesmo batendo o qual', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: '__NUNCA_RESPONDE__' },
  });
  r.ctx.__ouvinteMsg({ xmMacro: 'recebimento', config: CONFIG, idComando: 'rodada-nova' }, {}, () => {});
  await new Promise((res) => setImmediate(res));

  r.ctx.__ouvinteMsg({ xmColadorParar: 'recebimento', idComando: 'rodada-velha' }, {}, () => {});
  assert.strictEqual(r.S.parar, false, 'id de outra rodada nao pode parar esta');

  r.ctx.__ouvinteMsg({ xmColadorParar: 'recebimento', idComando: 'rodada-nova' }, {}, () => {});
  assert.strictEqual(r.S.parar, true);
});

test('xmColadorParar sem idComando no recado (compat com vigia/fundo.js antigo) para só pelo qual', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: { lote: '__NUNCA_RESPONDE__' },
  });
  r.ctx.__ouvinteMsg({ xmMacro: 'recebimento', config: CONFIG, idComando: 'rodada-nova' }, {}, () => {});
  await new Promise((res) => setImmediate(res));

  r.ctx.__ouvinteMsg({ xmColadorParar: 'recebimento' }, {}, () => {}); // sem idComando
  assert.strictEqual(r.S.parar, true);
});

test('Parar remoto (tela Macros) conta "parado pela tela do site", diferente do Parar local', async () => {
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: {
      lote: () => {
        r.ctx.__ouvinteMsg({ xmColadorParar: 'recebimento' }, {}, () => {});
        return loteDe([{ id: 1, codigo: 'BR1' }]);
      },
    },
  });
  await r.G.colador.rodar('recebimento', CONFIG);
  assert.strictEqual(r.P.erro, 'parado pela tela do site');
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

test('prepararRecebimento: sem "Receber por pedido" pra clicar, campo ja pronto nao clica em nada', async () => {
  const r = carregar({ pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } } });
  await r.G.colador.prepararRecebimento();
  assert.strictEqual(r.cliques.length, 0);
});

// Bug de verdade, achado ao vivo (30/09/2026): a tela ficava aberta no
// "Recebimento unitário" na aba ERRADA por padrão ("Manifesto/Motorista/Por
// TO/SP PARA Receber"), cujo campo usa o MESMO placeholder genérico ("Por
// favor, insira") do campo certo — acharCampo('recebimento') achava esse
// campo e um `return` antes de tentar "Receber por pedido" fazia o colador
// colar na aba errada sem erro nenhum. Por isso clicar em "Receber por
// pedido" (quando ela existir) vem ANTES de confiar que o campo já visível
// é o certo, mesmo quando prepararRecebimento nem precisa abrir nada novo.
test('prepararRecebimento: mesmo com um campo já visível, garante a aba "Receber por pedido" antes de colar', async () => {
  const receberPorPedido = {};
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    botoes: { 'Receber por pedido': receberPorPedido },
  });
  await r.G.colador.prepararRecebimento();
  assert.deepStrictEqual(r.cliques, [receberPorPedido]);
});

// Bug de verdade, achado ao vivo (01/10/2026): a LISTA de Recebimento (sem nenhum id na URL)
// tem campos de filtro ("ID de recebimento", "Número de manifesto") com o MESMO placeholder
// genérico do campo de digitar de verdade - acharCampo('recebimento') achava um deles e
// prepararRecebimento retornava cedo achando que já estava pronto, sem nunca clicar em
// "Recebimento unitário". Resultado: ficava "aguardando novos códigos" pra sempre, sem erro
// nenhum (a reserva no backend não tem nada a ver com qual tela o navegador mostra).
test('prepararRecebimento: campo com o mesmo placeholder na LISTA (sem id na URL) não engana - abre um novo', async () => {
  const recebimentoUnitario = { desabilitado: false };
  const receberPorPedido = {};
  let apareceu = false;
  const r = carregar({
    hash: '#/generalReceiveTaskOps', // a LISTA, sem RT nenhuma aberta
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } }, // campo de FILTRO da lista
    ensinados: { recebimento_unitario: [recebimentoUnitario] },
  });
  r.S.acharBotao = (texto) => (apareceu && texto === 'Receber por pedido' ? receberPorPedido : null);
  r.S.folhaVisivelComTexto = () => null;
  const clicarOriginal = r.S.clicar;
  r.S.clicar = (el) => { if (el === recebimentoUnitario) { apareceu = true; r.ctx.location.hash = '#/generalReceiveTaskOps/singleReceiveNew/RT2'; } return clicarOriginal(el); };
  await r.G.colador.prepararRecebimento();
  assert.deepStrictEqual(r.cliques, [recebimentoUnitario, receberPorPedido]);
});

// Achado ao vivo (02/10/2026): a LISTA do AT Cluster tem no topo "ID da tarefa de separação" com
// o MESMO placeholder ("Please Scan or Input") do campo de bipar dentro da tarefa - na lista o
// campo NÃO vale como "pronto", senão o colador bipava no filtro da lista.
test('AT Cluster: campo "Please Scan" na LISTA nao vale como pronto - vai criar a tarefa', async () => {
  const criar = {};
  const r = carregar({
    hash: '#/sorting-task/list',
    pagina: { 'input[placeholder="Please Scan or Input"]': { desabilitado: false } },
    botoes: { 'Criar tarefa': criar },
  });
  await assert.rejects(r.G.colador.prepararAtCluster()); // segue o formulário (que não existe aqui)
  assert.strictEqual(r.cliques[0], criar, 'tentou criar a tarefa em vez de achar que ja estava pronto');
});

test('AT Cluster: fora da lista, com o campo visivel, ja esta pronto (reaproveita a tarefa aberta)', async () => {
  const r = carregar({ hash: '#/sorting-task/detail/123', pagina: { 'input[placeholder="Please Scan or Input"]': { desabilitado: false } } });
  await r.G.colador.prepararAtCluster();
  assert.strictEqual(r.cliques.length, 0);
});

// Achado ao vivo (02/10/2026): "não achei o botão Criar tarefa" com ele na tela - era procurado
// uma vez só, logo depois de abrir a aba, antes de o SPX terminar de desenhar a lista.
test('AT Cluster: "Criar tarefa" que aparece atrasado e esperado, nao vira erro', async () => {
  const criar = {};
  let tentativas = 0;
  const r = carregar({ hash: '#/sorting-task/list', pagina: {} });
  r.S.acharBotao = (texto) => (texto === 'Criar tarefa' && ++tentativas > 3 ? criar : null);
  await assert.rejects(r.G.colador.prepararAtCluster(), /Criar Tarefa de Separação|formulário/);
  assert.strictEqual(r.cliques[0], criar);
});

test('AT Cluster: "Criar tarefa" ensinado (Alt+C) serve quando a busca por texto nao acha', async () => {
  const ensinado = {};
  const r = carregar({ hash: '#/sorting-task/list', pagina: {}, ensinados: { criar_tarefa: [ensinado] } });
  await assert.rejects(r.G.colador.prepararAtCluster());
  assert.strictEqual(r.cliques[0], ensinado);
});

// Bug de verdade, achado testando contra o SPX (29/09/2026): "Recebimento
// unitário" não foi achado nem por classe (acharBotao) nem por texto puro
// (folhaVisivelComTexto) — deve estar num componente que foge dos dois
// (Shadow DOM é o suspeito principal). Por isso esse botão é ENSINADO (Alt+R
// ou popup "Ensinar o Recebimento unitário"), como o ícone do Backlog —
// diferente dos botões do AT Cluster, que continuam achados por texto.
test('prepararRecebimento: clica no ensinado "Recebimento unitário" e depois em "Receber por pedido"', async () => {
  const recebimentoUnitario = { desabilitado: false };
  const receberPorPedido = {};
  let apareceu = false;
  const r = carregar({
    ensinados: { recebimento_unitario: [recebimentoUnitario] },
  });
  // "Receber por pedido" só existe DEPOIS de abrir o recebimento unitário — como o
  // campo de código, gated por `apareceu` (senão o teste não pegaria um `return`
  // cedo demais tentando clicar nela antes da tela existir).
  r.ctx.document.querySelector = (sel) => (apareceu && sel === 'input[placeholder="Por favor, insira"]' ? { desabilitado: false } : null);
  r.S.acharBotao = (texto) => (apareceu && texto === 'Receber por pedido' ? receberPorPedido : null);
  r.S.folhaVisivelComTexto = () => null;
  const clicarOriginal = r.S.clicar;
  r.S.clicar = (el) => { if (el === recebimentoUnitario) apareceu = true; return clicarOriginal(el); };

  await r.G.colador.prepararRecebimento();
  assert.deepStrictEqual(r.cliques, [recebimentoUnitario, receberPorPedido]);
});

test('prepararRecebimento: ignora o ensinado se ele nao estiver visivel', async () => {
  const r = carregar({ ensinados: { recebimento_unitario: [{ visivel: false }] } });
  await assert.rejects(r.G.colador.prepararRecebimento(), /ainda não foi ensinado/);
});

test('prepararRecebimento: sem nada ensinado, erro claro (nao tenta adivinhar por texto)', async () => {
  const r = carregar({ pagina: {}, botoes: { 'Recebimento unitário': {} } }); // se caisse pra acharPorTexto, acharia
  await assert.rejects(r.G.colador.prepararRecebimento(), /"Recebimento unitário" ainda não foi ensinado.*Alt\+R/);
});

// Bug de verdade, achado ao vivo (30/09/2026): ensinar funcionou (o popup confirmou), mas
// "Rodar" logo em seguida disse "ainda não foi ensinado" — numa aba nova (conteúdo recém-
// injetado), o que foi ensinado só existe de verdade DEPOIS de um `await
// chrome.storage.local.get(...)`, e nada em colador.js esperava por isso: contava com
// alimentacao.js ter carregado primeiro, sem nenhuma garantia de ordem entre os dois. rodar()
// agora chama G.aprender.carregar() ele mesmo (mesma linha que backlog.js já usa).
test('rodar: carrega o que foi ensinado ANTES de rodar (nao depende de outro script já ter carregado)', async () => {
  let carregado = false;
  const r = carregar({
    pagina: {},
    respostas: { lote: loteDe([]) },
  });
  // Simula o "chrome.storage ainda não respondeu": só existe depois do carregar() de verdade.
  r.G.aprender.elementosEnsinados = () => [];
  r.G.aprender.carregar = async () => { carregado = true; };
  await r.G.colador.rodar('recebimento', CONFIG);
  assert.strictEqual(carregado, true);
});

// Monta o formulário "Criar Tarefa de Separação" como o SPX se comporta: clicar no campo abre o
// menu (a opção passa a existir), digitar + Enter escolhe (o campo passa a mostrar o texto e o
// menu fecha). As variações simulam o que pode dar errado de verdade.
const opcao = (texto) => ({ textContent: texto, querySelector: () => null });

function formularioAtCluster({ enterEscolhe = true, menuAbre = true, campoMudaAoEscolher = true,
  xpt = 'XPT_CFC', nomeGrupo = 'Rotas Caçador' } = {}) {
  const grupoCampo = { tagName: 'INPUT', textContent: '', value: '' };
  const tipoCampo = { tagName: 'INPUT', textContent: '', value: '' };
  const opcaoGrupo = opcao(nomeGrupo);
  const opcaoTipo = opcao('Bulky&Non-bulky');
  const botoes = {
    'Criar tarefa': {}, 'Criar Tarefa de Separação': {}, 'Static': {}, 'YES': {},
    'Grupo de Rotas': comCampoDeRotulo(grupoCampo),
    'Tipo de Rota de Entrega': comCampoDeRotulo(tipoCampo),
    'Confirm': {}, 'Participar Desta Tarefa': {},
  };
  let aberto = null;
  let participou = false;
  const r = carregar({ hash: '#/sorting-task/list', botoes,
    opcoes: () => (aberto === 'grupo' ? [opcaoGrupo] : aberto === 'tipo' ? [opcaoTipo] : []) });
  r.ctx.document.querySelector = (sel) =>
    (participou && sel === 'input[placeholder="Please Scan or Input"]' ? { desabilitado: false } : null);
  const campoAberto = () => (aberto === 'grupo' ? grupoCampo : aberto === 'tipo' ? tipoCampo : null);
  const escolher = (texto) => {
    const c = campoAberto();
    if (c && campoMudaAoEscolher) c.textContent = texto;
    aberto = null;
  };
  const clicarOriginal = r.S.clicar;
  r.S.clicar = (el) => {
    if (menuAbre && el === grupoCampo) aberto = 'grupo';
    else if (menuAbre && el === tipoCampo) aberto = 'tipo';
    else if (el === opcaoGrupo || el === opcaoTipo) escolher(el.textContent);
    if (el === botoes['Participar Desta Tarefa']) { participou = true; r.ctx.location.hash = '#/sorting-task/detail/AS1'; }
    return clicarOriginal(el);
  };
  const enterOriginal = r.S.apertarEnter;
  r.S.apertarEnter = (el) => {
    enterOriginal(el);
    if (enterEscolhe && campoAberto() === el) escolher(el.value);
  };
  return { r, botoes, grupoCampo, tipoCampo, opcaoGrupo, opcaoTipo, xpt };
}

test('prepararAtCluster: Grupo de Rotas e Tipo de Rota por "digitar + Enter"', async () => {
  const f = formularioAtCluster();
  await f.r.G.colador.prepararAtCluster(f.xpt);
  assert.strictEqual(f.grupoCampo.value, 'Rotas Caçador');
  assert.strictEqual(f.grupoCampo.textContent, 'Rotas Caçador');
  assert.strictEqual(f.tipoCampo.textContent, 'Bulky&Non-bulky');
  assert.ok(f.r.cliques.includes(f.botoes['Participar Desta Tarefa']));
});

test('Videira usa "Rotas Videira" (o nome do grupo vem do XPT da aba)', async () => {
  const f = formularioAtCluster({ xpt: 'XPT_VIA', nomeGrupo: 'Rotas Videira' });
  await f.r.G.colador.prepararAtCluster(f.xpt);
  assert.strictEqual(f.grupoCampo.textContent, 'Rotas Videira');
});

test('XPT desconhecido: para com erro claro em vez de chutar um grupo', async () => {
  const f = formularioAtCluster({ xpt: null });
  await assert.rejects(f.r.G.colador.prepararAtCluster(null), /não sei o nome do Grupo de Rotas/);
});

test('Enter nao escolheu e o menu ficou aberto: clica na opcao pelo texto', async () => {
  const f = formularioAtCluster({ enterEscolhe: false });
  await f.r.G.colador.prepararAtCluster(f.xpt);
  assert.ok(f.r.cliques.includes(f.opcaoGrupo));
  assert.ok(f.r.cliques.includes(f.opcaoTipo));
  assert.strictEqual(f.grupoCampo.textContent, 'Rotas Caçador');
});

// Bug de verdade (02/10/2026): "o menu nem abriu" e o macro seguiu/errou sem dizer o porquê.
test('campo que nao vira a escolha: erro claro, nao segue pro Confirm', async () => {
  const f = formularioAtCluster({ menuAbre: false, campoMudaAoEscolher: false });
  await assert.rejects(f.r.G.colador.prepararAtCluster(f.xpt), /não consegui escolher "Rotas Caçador" em "Grupo de Rotas"/);
  assert.ok(!f.r.cliques.includes(f.botoes['Confirm']));
});

// Bug de verdade (02/10/2026): subindo os pais a partir do rótulo, o "primeiro input" do container
// era um campo de CIMA (o radio YES/NO) - o clique ia nele e o menu do Grupo de Rotas nem abria.
test('campoDoRotulo: ignora radio e campo que vem ANTES do rotulo', () => {
  const r = carregar();
  const radioDeCima = { tipo: 'radio-de-cima' };
  const campoCerto = { tipo: 'campo-certo' };
  const label = {
    compareDocumentPosition: (el) => (el === radioDeCima ? 2 : 4),
    parentElement: { querySelectorAll: () => [radioDeCima, campoCerto] },
  };
  r.S.folhaVisivelComTexto = (t) => (t === 'Grupo de Rotas' ? label : null);
  assert.strictEqual(r.G.colador.campoDoRotulo('Grupo de Rotas'), campoCerto);
});

test('prepararAtCluster: sem o botão "Criar tarefa", erro claro', async () => {
  const r = carregar({ pagina: {}, botoes: {} });
  await assert.rejects(r.G.colador.prepararAtCluster(), /Criar tarefa/);
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

test('xptDaPagina le a estacao embaixo da logo (XPT_SC_Caçador / XPT_SC_Videira)', () => {
  assert.strictEqual(carregar({ textoDaPagina: 'Shopee Xpress\nXPT_SC_Caçador\nBusca' }).G.colador.xptDaPagina(), 'XPT_CFC');
  assert.strictEqual(carregar({ textoDaPagina: 'XPT_SC_Videira\nBusca' }).G.colador.xptDaPagina(), 'XPT_VIA');
});

test('xptDaPagina: a estacao embaixo da logo manda mais que o e-mail', () => {
  const r = carregar({ textoDaPagina: 'XPT_SC_Videira\nadm.xpt-cfc-01@shopeemobile-external.com' });
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

test('xptEfetivo sem pagina NEM config RECUSA (sem XPT o lote misturaria os polos)', () => {
  const r = carregar({ textoDaPagina: '' });
  assert.throws(() => r.G.colador.xptEfetivo({ xpt: '' }), /não achei o XPT/);
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

// ── Criar AT (entregadores): uma AT nova do zero por codigo ────────────────
function carregarCriarAt({ aceita = true, mensagemRecusa = 'pedido já está em outra AT', semResposta = false, concluivel = true,
  entraNaAt = aceita, avisoDepoisDoEnter = null, itens = [{ id: 7, codigo: 'BR266104829025G', dia: '2026-10-19' }] } = {}) {
  const campo = { value: '', visivel: true };
  let lotes = 0;
  const r = carregar({
    textoDaPagina: 'XPT_SC_Caçador',
    hash: '#/delivery-assignment/list',
    pagina: { 'input[placeholder*="escaneie ou insira"]': campo },
    botoes: { 'Criar tarefa de atribuição': { nome: 'criar' }, 'Enviar': { nome: 'enviar' } },
    respostas: { lote: () => (lotes++ === 0 ? { ok: true, tabela: 'entregador_pedidos_at', itens } : { ok: true, tabela: null, itens: [] }) },
  });
  const S = r.S;
  const criadas = [];
  const voltas = [];
  const concluidas = [];
  let cardAberto = false;
  // "Você quer sair sem completar?" - aparece ao sair de uma AT nao concluida.
  let avisoDeSair = false;
  const saiuPeloAviso = [];
  // location com o hash observado: quem volta pra lista troca o hash.
  let hash = '#/delivery-assignment/list';
  r.ctx.location = { origin: 'https://spx.shopee.com.br',
    get hash() { return hash; },
    set hash(v) {
      const daAt = (/id=(AT\w+)/.exec(hash) || [])[1];
      if (daAt && !concluidas.includes(daAt) && /delivery-assignment\/list/.test(v)) { avisoDeSair = true; return; }
      hash = v; if (/delivery-assignment\/list/.test(v)) voltas.push(v);
    } };
  r.ctx.postMessage = () => {};
  const clicarOriginal = S.clicar;
  S.clicar = (el) => {
    // Enviar na janela: o SPX cria a AT e abre a pagina dela.
    if (el && el.nome === 'concluir') cardAberto = true;
    if (el && el.nome === 'confirmar') { cardAberto = false; concluidas.push((/id=(AT\w+)/.exec(hash) || [])[1]); }
    if (el && el.nome === 'sair') { avisoDeSair = false; saiuPeloAviso.push(hash); hash = '#/delivery-assignment/list'; voltas.push(hash); }
    if (el && el.nome === 'enviar') {
      const at = `AT2026102${criadas.length}BHA90`;
      criadas.push(at);
      hash = `#/assignment-task/detailNoLabel?id=${at}`;
    }
    return clicarOriginal(el);
  };
  const folha = S.folhaVisivelComTexto;
  S.folhaVisivelComTexto = (texto) => {
    if (texto === 'Criar tarefa de atribuição' && /assignment-task/.test(hash)) return null;
    return folha(texto);
  };
  const acharBotao = S.acharBotao;
  S.acharBotao = (texto, o) => {
    if (texto === 'Criar tarefa de atribuição' && /assignment-task/.test(hash)) return null;
    if (texto === 'Confirmar') return cardAberto ? { nome: 'confirmar' } : null;
    if (texto === 'Determinar') return avisoDeSair ? { nome: 'sair' } : null;
    if (texto === 'Concluído') {
      const daAt = (/id=(AT\w+)/.exec(hash) || [])[1];
      return concluivel && daAt && !concluidas.includes(daAt) ? { nome: 'concluir' } : null;
    }
    return acharBotao(texto, o);
  };
  // Os baloes flutuantes do SPX (SELETOR_AVISOS); o resto do DOM falso continua o de sempre.
  const avisos = [];
  const qsa = r.ctx.document.querySelectorAll;
  r.ctx.document.querySelectorAll = (sel) => (sel === r.G.colador.SELETOR_AVISOS ? avisos : qsa(sel));
  // A resposta do SPX à chamada que levou o código (o que rede.js manda pela ponte).
  S.apertarEnter = (el) => {
    el.enterApertado = (el.enterApertado || 0) + 1;
    if (semResposta) return;

    // O balao do SPX (sucesso ou erro) e o codigo na tabela da AT, como a pagina ficaria.
    if (avisoDepoisDoEnter) avisos.push({ visivel: true, ...avisoDepoisDoEnter });
    if (entraNaAt) r.ctx.document.body.innerText = `XPT_SC_Caçador Atribuído (1) ${el.value}`;
    const dados = { __xmMacroResposta: true, codigo: el.value, ok: aceita, mensagem: aceita ? '' : mensagemRecusa };
    r.ctx.__ouvinteWindowMsg({ source: r.raiz, data: dados });
  };
  return { ...r, campo, criadas, voltas, concluidas, saiuPeloAviso, avisos };
}

test('criar AT: cria a tarefa do zero, poe o codigo, manda a AT pro entregador e confirma', async () => {
  const c = carregarCriarAt();
  await c.G.colador.rodar('criar_at', { ...CONFIG, lote: 20, continuo: false });
  assert.strictEqual(c.criadas.length, 1);
  assert.strictEqual(c.campo.value, 'BR266104829025G');
  const lote = c.chamadasVigia.find((m) => m.xmColador === 'lote');
  assert.strictEqual(lote.tam, 1, 'um codigo de cada vez');
  assert.strictEqual(lote.xpt, 'XPT_CFC');
  const at = c.chamadasVigia.find((m) => m.xmColador === 'at');
  assert.deepStrictEqual(plano({ codigo: at.codigo, dia: at.dia, at: at.at }), { codigo: 'BR266104829025G', dia: '2026-10-19', at: c.criadas[0] });
  const conf = c.chamadasVigia.find((m) => m.xmColador === 'confirmar');
  assert.deepStrictEqual(plano({ modo: conf.modo, tabela: conf.tabela, ids: conf.ids }), { modo: 'criar_at', tabela: 'entregador_pedidos_at', ids: [7] });
  const ordem = c.chamadasVigia.map((m) => m.xmColador).filter((x) => x === 'at' || x === 'confirmar');
  assert.deepStrictEqual(ordem, ['at', 'confirmar'], 'a AT vai antes do confirmar');
  assert.match(c.P.ok, /1 colado/);
});

test('criar AT: cada codigo abre uma AT nova (sempre do zero, voltando pra lista)', async () => {
  const c = carregarCriarAt({ itens: [{ id: 1, codigo: 'BR1', dia: '2026-10-19' }, { id: 2, codigo: 'BR2', dia: '2026-10-19' }] });
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.strictEqual(c.criadas.length, 2);
  assert.notStrictEqual(c.criadas[0], c.criadas[1]);
  assert.strictEqual(c.voltas.length, 1, 'saindo da primeira AT, volta pra lista antes da segunda');
  const ats = c.chamadasVigia.filter((m) => m.xmColador === 'at').map((m) => [m.codigo, m.at]);
  assert.deepStrictEqual(plano(ats), [['BR1', c.criadas[0]], ['BR2', c.criadas[1]]]);
});

test('criar AT: SPX recusou o codigo -> falhou com a mensagem do SPX (nao volta pra fila) e segue', async () => {
  const c = carregarCriarAt({ aceita: false });
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  const falhou = c.chamadasVigia.find((m) => m.xmColador === 'falhou');
  assert.ok(falhou, 'avisou que falhou');
  assert.strictEqual(falhou.id, 7);
  // O entregador le o resumo; o log do macro guarda a frase inteira do SPX.
  assert.strictEqual(falhou.erro, 'Não foi possível criar a AT: pedido já está em outra AT');
  assert.ok(c.P.notas.some((n) => /recusou o código na AT2026.*pedido já está em outra AT/.test(n)));
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'liberar'), 'nao devolve pra fila (repetiria pra sempre)');
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'confirmar'));
  assert.ok(!c.P.erro, 'a sessao nao cai por um codigo recusado');
});

// 20/10/2026: o codigo entrou na AT, mas a conferencia pela tela (texto exato) nao achou e deu
// "nao aceitou". Sem resposta capturada, vale o codigo em QUALQUER lugar do texto da pagina.
test('criar AT: sem resposta capturada, o codigo no meio do texto da AT conta como aceito', async () => {
  const c = carregarCriarAt({ semResposta: true });
  c.ctx.document.body.innerText = 'Atribuído (1)  1  BR266104829025G  Endereço  Entrega';
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.ok(c.chamadasVigia.some((m) => m.xmColador === 'at'), 'mandou a AT pro entregador');
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'falhou'));
});

test('criar AT: sem resposta e sem o codigo na tela, falha dizendo pra conferir a AT (nao inventa)', async () => {
  const c = carregarCriarAt({ semResposta: true });
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  const falhou = c.chamadasVigia.find((m) => m.xmColador === 'falhou');
  assert.strictEqual(falhou.erro, 'Não deu pra confirmar a AT — fale com o responsável');
});

test('criar AT: depois de por o codigo, conclui a AT (Concluido + Confirmar) e so entao abre a proxima', async () => {
  const c = carregarCriarAt({ itens: [{ id: 1, codigo: 'BR1', dia: '2026-10-20' }, { id: 2, codigo: 'BR2', dia: '2026-10-20' }] });
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.deepStrictEqual(plano(c.concluidas), plano(c.criadas), 'as duas ATs concluidas');
  assert.deepStrictEqual(c.saiuPeloAviso, [], 'concluida, sair nao pede confirmacao');
  assert.ok(c.P.notas.some((n) => /\(concluída\)/.test(n)), JSON.stringify(c.P.notas));
});

test('criar AT: sem conseguir concluir, a AT do entregador vale e a proxima sai pelo "Determinar"', async () => {
  const c = carregarCriarAt({ concluivel: false, itens: [{ id: 1, codigo: 'BR1', dia: '2026-10-20' }, { id: 2, codigo: 'BR2', dia: '2026-10-20' }] });
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.strictEqual(c.chamadasVigia.filter((m) => m.xmColador === 'at').length, 2, 'as duas ATs foram pros entregadores');
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'falhou'));
  assert.strictEqual(c.saiuPeloAviso.length, 1, 'saiu da primeira AT confirmando o aviso');
  assert.ok(c.P.notas.some((n) => /não consegui concluir a AT/.test(n)));
});

test('criar AT: "Fleet order not found" -> avisa o entregador que o codigo nao existe', async () => {
  const c = carregarCriarAt({ aceita: false, mensagemRecusa: 'BR266104829025G Fleet order not found' });
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  const falhou = c.chamadasVigia.find((m) => m.xmColador === 'falhou');
  assert.ok(falhou, 'o pedido foi marcado como nao criado');
  assert.strictEqual(falhou.erro, 'Código não existe no SPX');
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'at'));
});

// 20/10/2026: config antiga sem o campo "continuo" terminava no 1o lote vazio ("0 colado(s)") e o
// pedido seguinte do entregador ficava sem ninguem pra pegar.
test('config sem o campo continuo fica de vigia (so continuo: false termina)', async () => {
  let pedidos = 0;
  const r = carregar({
    pagina: { 'input[placeholder="Por favor, insira"]': { desabilitado: false } },
    respostas: {
      lote: () => {
        pedidos++;
        if (pedidos === 3) r.S.parar = true;
        return loteDe([]);
      },
    },
  });
  const semContinuo = { ...CONFIG };
  delete semContinuo.continuo;
  await r.G.colador.rodar('recebimento', semContinuo);
  assert.ok(pedidos >= 3, 'continuou pedindo lote');
  assert.strictEqual(r.P.erro, 'parado por você');
});

// 20/10/2026: o codigo nao entrava na AT e mesmo assim a AT ia pro entregador.
test('criar AT: SPX responde ok mas o codigo nao aparece na AT -> nao entrega, diz pra conferir', async () => {
  const c = carregarCriarAt({ entraNaAt: false });
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'at'), 'nao mandou AT pro entregador');
  const falhou = c.chamadasVigia.find((m) => m.xmColador === 'falhou');
  assert.strictEqual(falhou.erro, 'Não deu pra confirmar a AT — fale com o responsável');
  assert.ok(c.P.notas.some((n) => /respondeu ok, mas o código não apareceu na AT2026/.test(n)));
});

test('criar AT: balao de erro do SPX (com o codigo no texto) -> recusado com a mensagem do balao', async () => {
  const c = carregarCriarAt({ entraNaAt: false,
    avisoDepoisDoEnter: { innerText: 'BR266104829025G: pedido não pode ser atribuído neste status', className: 'ssc-message ssc-message-error' } });
  c.ctx.document.body.innerText = 'XPT_SC_Caçador BR266104829025G: pedido não pode ser atribuído neste status';
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'at'));
  const falhou = c.chamadasVigia.find((m) => m.xmColador === 'falhou');
  assert.strictEqual(falhou.erro, 'Não foi possível criar a AT: pedido não pode ser atribuído neste status');
});

test('criar AT: o codigo so no balao de erro (fora da tabela) nao conta como entrou', () => {
  const c = carregarCriarAt();
  c.avisos.push({ visivel: true, innerText: 'BR1 já existe em outra tarefa', className: 'toast' });
  const [a] = c.G.colador.avisosNaTela();
  assert.strictEqual(a.erro, true);
});

test('criar AT: balao de sucesso nao e erro', () => {
  const c = carregarCriarAt();
  c.avisos.push({ visivel: true, innerText: 'Adicionado com sucesso', className: 'ssc-message ssc-message-success' });
  assert.strictEqual(c.G.colador.avisosNaTela()[0].erro, false);
});

// 20/10/2026: o entregador ve o aviso resumido, na lingua dele.
test('resumoParaEntregador: Delivered, Delivering, inexistente e o resto sem numero interno nem codigo', () => {
  const R = carregar().G.colador.resumoParaEntregador;
  assert.strictEqual(R('o SPX recusou o código na AT20261021BISZW: 141201028: BR2672859634610 O status do pedido é Delivered, não pode ser adicionado ao AT'),
    'Pedido com o status "entregue"');
  assert.strictEqual(R('o SPX recusou o código na AT20261021BISZW: 141201028: BR2672859634610 O status do pedido é Delivering, não pode ser adicionado ao AT'),
    'Pedido já está na rua (em rota de entrega)');
  assert.strictEqual(R('o SPX recusou o código na AT1: BR2672859634610 Fleet order not found'), 'Código não existe no SPX');
  // 22/10/2026: chegou na transferencia mas nao foi bipado no recebimento do hub.
  assert.strictEqual(R('o SPX recusou o código na AT20261022BMBBY: 141201028: BR269545289992M O status do pedido é Hub_LHArrived, não pode ser adicionado ao AT'),
    'O pedido não foi recebido no HUB');
  assert.strictEqual(R('o SPX recusou o código na AT1: 141201030: BR2672859634610 Não foi possível adicionar o pedido à gaiola'),
    'Esse pedido já está em uma AT');
  assert.strictEqual(R('o SPX recusou o código na AT20261021BJ28Y: 141202030: BR260467360950U add_order falhou: BR260467360950U, estação atual inválida: 7326, ID da estação do pedido: 5968'),
    'Esse pedido é de uma estação diferente da sua. Confirme o seu polo — se estiver errado, peça a troca de polo');
  assert.strictEqual(R('o SPX recusou o código na AT20261021BISZW: 141201028: BR2672859634610 pedido bloqueado'),
    'Não foi possível criar a AT: pedido bloqueado');
});

// 20/10/2026 (foto da tela): faixa vermelha no topo SEM classe de aviso conhecida, com o codigo no
// texto. A resposta capturada nao acusou erro, e o codigo "na pagina" virou AT entregue - sem ter
// entrado na AT.
test('criar AT: faixa de erro do SPX com o codigo (sem classe de aviso) -> recusado, nao entrega a AT', async () => {
  const c = carregarCriarAt({ entraNaAt: false });
  c.ctx.document.body.innerText = 'XPT_SC_Caçador\n141201027: BR266104829025G Não foi possível adicionar o pedido na gaiola. ' +
    'Acione a liderança de turno p... tring=AT20261020BIE82)\nStatus Created\nAdd New Order';
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'at'), 'nao mandou AT pro entregador');
  const falhou = c.chamadasVigia.find((m) => m.xmColador === 'falhou');
  assert.strictEqual(falhou.erro, 'Esse pedido já está em uma AT');
});

test('criar AT: codigo solto na pagina, sem tabela nem "Atribuido (N)", nao conta como entrou', async () => {
  const c = carregarCriarAt({ entraNaAt: false });
  c.ctx.document.body.innerText = 'XPT_SC_Caçador\nultimo pesquisado: BR266104829025G\nAtribuído (0)';
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'at'));
});

test('linhaDeErroComCodigo: linha da tabela (codigo + endereco) nao e erro; formato do SPX e', () => {
  const F = carregar().G.colador.linhaDeErroComCodigo;
  assert.strictEqual(F('1  BR266104829025G  Rua das Flores 10  Caçador', 'BR266104829025G'), null);
  assert.match(F('141201027: BR266104829025G Qualquer coisa', 'BR266104829025G'), /^141201027/);
});

// 20/10/2026 (foto): o codigo foi enviado duas vezes - o 1o entrou, o 2o voltou "ja esta na
// gaiola" - e o entregador viu "ja esta em uma AT" com o codigo DENTRO da AT.
test('criar AT: aceito e depois "ja esta na gaiola" (envio repetido) -> vale o que entrou, AT vai pro entregador', async () => {
  const c = carregarCriarAt();
  const enter = c.S.apertarEnter;
  c.S.apertarEnter = (el) => {
    enter(el);
    // o segundo envio do mesmo codigo, com o erro do SPX
    c.ctx.__ouvinteWindowMsg({ source: c.raiz, data: { __xmMacroResposta: true, codigo: el.value, ok: false,
      mensagem: '141201027: BR266104829025G Não foi possível adicionar o pedido na gaiola' } });
    c.ctx.document.body.innerText += '\n141201027: BR266104829025G Não foi possível adicionar o pedido na gaiola';
  };
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.ok(c.chamadasVigia.some((m) => m.xmColador === 'at'), 'a AT foi pro entregador');
  assert.ok(!c.chamadasVigia.some((m) => m.xmColador === 'falhou'));
});

test('criar AT: o campo enviou sozinho -> nao aperta Enter (nao manda o codigo de novo)', async () => {
  const c = carregarCriarAt();
  const escrever = c.S.escrever;
  c.S.escrever = (el, texto) => {
    escrever(el, texto);
    c.ctx.document.body.innerText = `XPT_SC_Caçador Atribuído (1) ${texto}`;
    c.ctx.__ouvinteWindowMsg({ source: c.raiz, data: { __xmMacroResposta: true, codigo: texto, ok: true, mensagem: '' } });
  };
  await c.G.colador.rodar('criar_at', { ...CONFIG, continuo: false });
  assert.ok(!c.campo.enterApertado, 'nao apertou Enter');
  assert.ok(c.chamadasVigia.some((m) => m.xmColador === 'at'));
});
