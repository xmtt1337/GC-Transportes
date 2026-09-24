// Testes do service worker (fundo.js) da parte que liga a extensao a tela Macros.
//
//   node --test automacao/alimentacao/testes/test_fundo_comandos.test.js
//
// O fundo.js roda de verdade, num contexto isolado com chrome, fetch e relogio
// FALSOS. O que se protege - tudo erro que nao aparece na tela de ninguem:
//
//   - um comando rodar em DOBRO (o servidor entrega uma vez, mas a extensao ainda
//     tem que se defender de repeticao) ou rodar algo que nao e macro;
//   - a agenda do sistema nao valer, ou valer sobre a do popup so as vezes;
//   - o comando se perder porque a agenda (a outra metade da resposta) deu problema;
//   - o alarme errado: hora errada num Chrome que ninguem olha;
//   - a pergunta ao vigia travar a proxima, ou estourar erro com o vigia fechado.
//
// Relogio fixo: 24/09/2026 14:00 em Brasilia (17:00 UTC).
//
// Dados de TESTE, inventados.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PASTA = path.join(__dirname, '..', 'extensao-macros-spx');
const AGORA = Date.UTC(2026, 8, 24, 17, 0, 0);   // 14:00 em Brasilia
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function carregar({ storage = {}, vigia = {} } = {}) {
  const guardado = { ...storage };
  const alarmes = new Map();
  const escritas = { criouAlarme: 0 };
  const chamadas = { abas: [], fetch: [], focou: 0 };
  const ouvintes = {};

  const chrome = {
    storage: { local: {
      async get(chaves) {
        const lista = typeof chaves === 'string' ? [chaves] : Array.isArray(chaves) ? chaves : Object.keys(guardado);
        return Object.fromEntries(lista.filter((k) => k in guardado).map((k) => [k, guardado[k]]));
      },
      async set(o) { Object.assign(guardado, o); },
      async remove(ks) { for (const k of [].concat(ks)) delete guardado[k]; },
    } },
    alarms: {
      create(nome, info) {
        escritas.criouAlarme++;
        if (vigia.alarmeQuebra && nome !== 'comandos') throw new Error('alarme quebrou');
        const quando = info.when || AGORA + (info.delayInMinutes || 0) * 60000;
        alarmes.set(nome, { name: nome, ...info, scheduledTime: quando });
      },
      async clear(nome) { alarmes.delete(nome); },
      async get(nome) { return alarmes.get(nome); },
      onAlarm: { addListener: (f) => { ouvintes.alarme = f; } },
    },
    runtime: {
      onMessage: { addListener: (f) => { ouvintes.mensagem = f; } },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
    },
    tabs: {
      async query() { return [{ id: 7, windowId: 1, url: 'https://spx.shopee.com.br/#/delivery-assignment/list' },
        { id: 8, windowId: 1, url: 'https://spx.shopee.com.br/#/orderTracking' },
        { id: 9, windowId: 1, url: 'https://spx.shopee.com.br/#/dashboard/all-mile-hub/lm' }]; },
      async sendMessage(id, msg) {
        chamadas.abas.push({ id, msg });
        return vigia.macroRecusa ? { ok: false, error: 'já está rodando' } : { ok: true };
      },
      async update() { chamadas.focou++; },
      async get() { return { status: 'complete' }; },
      async reload() {},
      async create() { return { id: 99 }; },
    },
    windows: { async update() { chamadas.focou++; } },
  };

  // Tudo que o service worker pede ao vigia passa por aqui.
  let emVoo = 0;
  const fetchFalso = async (url, opcoes = {}) => {
    chamadas.fetch.push({ url, metodo: opcoes.method || 'GET', corpo: opcoes.body });
    if (vigia.fechado) throw new TypeError('Failed to fetch');
    emVoo++;
    if (vigia.demora) await vigia.demora;
    emVoo--;
    if (url.endsWith('/comandos')) {
      const resposta = vigia.resposta === undefined ? { comandos: [] } : vigia.resposta;
      return { ok: vigia.status ? vigia.status < 400 : true, status: vigia.status || 200, json: async () => resposta };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  // Date fixo: o service worker calcula "proximo horario" pelo relogio de Brasilia.
  class DataFixa extends Date {
    constructor(...a) { if (a.length) super(...a); else super(AGORA); }
    static now() { return AGORA; }
  }

  const sandbox = { chrome, fetch: fetchFalso, console: { log() {}, error() {} }, Date: DataFixa,
    AbortSignal, setTimeout, clearTimeout, Intl, Promise };
  sandbox.self = sandbox;
  sandbox.importScripts = (arq) => vm.runInContext(fs.readFileSync(path.join(PASTA, arq), 'utf8'), sandbox);
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(PASTA, 'fundo.js'), 'utf8'), sandbox, { filename: 'fundo.js' });

  return { ctx: sandbox, guardado, alarms: alarmes, chamadas, escritas, ouvintes, chrome };
}

const minutosAte = (alarme) => Math.round((alarme.scheduledTime - AGORA) / 60000);
const enviadosAoVigia = (c, fim) => c.chamadas.fetch.filter((f) => f.url.endsWith(fim));
const macrosDisparados = (c) => c.chamadas.abas.map((a) => a.msg.xmMacro);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── o alarme de perguntar ao vigia ────────────────────────────────────────
test('cria o alarme de comandos de 30 em 30 segundos', async () => {
  const c = carregar();
  await dormir(5);
  const a = c.alarms.get('comandos');
  assert.ok(a, 'o alarme tem que existir ao carregar');
  assert.strictEqual(a.periodInMinutes, 0.5);
});

test('nao recria o alarme de comandos se ele ja existe', async () => {
  const c = carregar();
  await dormir(5);
  const antes = c.escritas.criouAlarme;
  await c.ctx.garantirAlarmeDeComandos();
  assert.strictEqual(c.escritas.criouAlarme, antes);
});

// ── executar comando ──────────────────────────────────────────────────────
test('o comando da tela dispara o macro na aba dele, marcado como vindo do site', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [{ id: ID, qual: 'backlog' }] } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  assert.deepStrictEqual(macrosDisparados(c), ['backlog']);
  assert.strictEqual(c.chamadas.abas[0].id, 9, 'a aba do Backlog, nao a de outro macro');
  assert.match(c.guardado.ultimoDisparo.texto, /disparado: backlog \(site\)/);
});

test('conta o resultado ao vigia (e a tela mostra o "iniciado")', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [{ id: ID, qual: 'alimentacao' }] } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  const [envio] = enviadosAoVigia(c, `/comandos/${ID}/resultado`);
  assert.ok(envio, 'tem que avisar o vigia');
  assert.strictEqual(envio.metodo, 'POST');
  assert.deepStrictEqual(JSON.parse(envio.corpo), { ok: true, error: null });
});

test('macro que recusa (ja rodando) vira erro contado ao vigia, com o motivo', async () => {
  const c = carregar({ vigia: { macroRecusa: true, resposta: { comandos: [{ id: ID, qual: 'pedidos' }] } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  const [envio] = enviadosAoVigia(c, `/comandos/${ID}/resultado`);
  assert.deepStrictEqual(JSON.parse(envio.corpo), { ok: false, error: 'já está rodando' });
});

test('nao rouba o foco: quem clicou no sistema pode estar em qualquer lugar', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [{ id: ID, qual: 'alimentacao' }] } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  assert.strictEqual(c.chamadas.focou, 0);
});

test('o mesmo comando entregue duas vezes roda UMA vez so', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [{ id: ID, qual: 'alimentacao' }] } } });
  await c.ctx.buscarComandos();
  await c.ctx.buscarComandos();
  await dormir(20);
  assert.strictEqual(macrosDisparados(c).length, 1);
});

test('comando sem id, com macro que nao existe ou torto e ignorado', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [
    { id: ID, qual: 'apagar-tudo' }, { qual: 'backlog' }, { id: 'x'.repeat(200), qual: 'backlog' },
    null, 'backlog', { id: 5, qual: 'backlog' },
  ] } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  assert.deepStrictEqual(macrosDisparados(c), []);
});

test('varios comandos na mesma resposta rodam todos', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [
    { id: ID, qual: 'alimentacao' }, { id: '11111111-1111-1111-1111-111111111111', qual: 'backlog' },
  ] } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  assert.deepStrictEqual(macrosDisparados(c).sort(), ['alimentacao', 'backlog']);
});

test('lembra so dos ultimos 30 ids (o storage nao cresce pra sempre)', async () => {
  const ids = Array.from({ length: 40 }, (_, i) => `id-${i}`);
  const c = carregar({ vigia: { resposta: { comandos: ids.map((id) => ({ id, qual: 'backlog' })) } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  assert.strictEqual(c.guardado.comandosFeitos.length, 30);
  assert.strictEqual(c.guardado.comandosFeitos.at(-1), 'id-39');
});

// ── vigia fora do ar / pergunta em andamento ──────────────────────────────
test('vigia fechado: nada estoura, nada e anotado, e tenta de novo depois', async () => {
  const c = carregar({ vigia: { fechado: true } });
  await c.ctx.buscarComandos();
  assert.strictEqual(macrosDisparados(c).length, 0);
  assert.strictEqual(c.guardado.ultimoDisparo, undefined, 'falha de rede nao vira registro');
  await c.ctx.buscarComandos();   // o flag de "buscando" nao pode ter ficado preso
  assert.strictEqual(enviadosAoVigia(c, '/comandos').length, 2);
});

test('vigia respondendo erro (503) tambem e silencioso', async () => {
  const c = carregar({ vigia: { status: 503, resposta: { error: 'servidor fora' } } });
  await c.ctx.buscarComandos();
  assert.strictEqual(macrosDisparados(c).length, 0);
});

test('nao pergunta de novo enquanto a pergunta anterior nao voltou', async () => {
  let soltar;
  const c = carregar({ vigia: { demora: new Promise((r) => { soltar = r; }) } });
  const primeira = c.ctx.buscarComandos();
  await c.ctx.buscarComandos();      // segunda batida do alarme, com a primeira ainda em voo
  assert.strictEqual(enviadosAoVigia(c, '/comandos').length, 1);
  soltar();
  await primeira;
});

// ── agenda vinda do sistema ───────────────────────────────────────────────
const AGENDA = (extra = {}) => ({
  versao: 'v1',
  alimentacao: { ativo: true, modo: 'intervalo', minutos: 40, horarios: [] },
  ...extra,
});

test('agenda nova do sistema e guardada, com a versao, e reagenda', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [], agenda: AGENDA() } } });
  await c.ctx.buscarComandos();
  assert.strictEqual(c.guardado.agendaSiteVersao, 'v1');
  assert.strictEqual(c.guardado.agendaSite.alimentacao.minutos, 40);
  const a = c.alarms.get('alimentacao');
  assert.strictEqual(a.periodInMinutes, 40);
});

test('a mesma versao nao reagenda de novo (nao zera a contagem do alarme a cada 30s)', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [], agenda: AGENDA() } } });
  await c.ctx.buscarComandos();
  const antes = c.escritas.criouAlarme;
  await c.ctx.buscarComandos();
  await c.ctx.buscarComandos();
  assert.strictEqual(c.escritas.criouAlarme, antes);
});

test('versao nova reagenda', async () => {
  const vigia = { resposta: { comandos: [], agenda: AGENDA() } };
  const c = carregar({ vigia });
  await c.ctx.buscarComandos();
  vigia.resposta = { comandos: [], agenda: AGENDA({ versao: 'v2',
    alimentacao: { ativo: true, modo: 'intervalo', minutos: 90, horarios: [] } }) };
  await c.ctx.buscarComandos();
  assert.strictEqual(c.alarms.get('alimentacao').periodInMinutes, 90);
});

test('agenda null (nada configurado no sistema) devolve o controle ao popup', async () => {
  const vigia = { resposta: { comandos: [], agenda: AGENDA() } };
  const c = carregar({ vigia, storage: { agenda: { modo: 'intervalo', minutos: 25, horarios: [] } } });
  await c.ctx.buscarComandos();
  assert.strictEqual(c.alarms.get('alimentacao').periodInMinutes, 40, 'o sistema manda');
  vigia.resposta = { comandos: [], agenda: null };
  await c.ctx.buscarComandos();
  assert.strictEqual(c.guardado.agendaSite, undefined);
  assert.strictEqual(c.guardado.agendaSiteVersao, undefined);
  assert.strictEqual(c.alarms.get('alimentacao').periodInMinutes, 25, 'volta pra agenda do popup');
});

test('resposta SEM a chave agenda (servidor nao soube) deixa tudo como esta', async () => {
  const vigia = { resposta: { comandos: [], agenda: AGENDA() } };
  const c = carregar({ vigia });
  await c.ctx.buscarComandos();
  vigia.resposta = { comandos: [] };
  await c.ctx.buscarComandos();
  assert.strictEqual(c.guardado.agendaSiteVersao, 'v1');
  assert.strictEqual(c.alarms.get('alimentacao').periodInMinutes, 40);
});

test('agenda sem versao ou torta e ignorada', async () => {
  const c = carregar({ vigia: { resposta: { comandos: [], agenda: { alimentacao: { ativo: true } } } } });
  await c.ctx.buscarComandos();
  assert.strictEqual(c.guardado.agendaSite, undefined);
});

test('o comando roda mesmo se aplicar a agenda estourar', async () => {
  // O servidor entrega o comando UMA vez: se a agenda derrubasse a resposta inteira, o "Rodar" se perdia.
  const c = carregar({ vigia: { alarmeQuebra: true,
    resposta: { comandos: [{ id: ID, qual: 'alimentacao' }], agenda: AGENDA() } } });
  await c.ctx.buscarComandos();
  await dormir(20);
  assert.deepStrictEqual(macrosDisparados(c), ['alimentacao']);
});

// ── reagendar: popup x sistema ────────────────────────────────────────────
test('so popup, intervalo: AT e Backlog (de hora em hora) como sempre foi', async () => {
  const c = carregar({ storage: { agenda: { modo: 'intervalo', minutos: 45, horarios: [] } } });
  await c.ctx.reagendar();
  const at = c.alarms.get('alimentacao'), bk = c.alarms.get('backlog');
  assert.strictEqual(at.periodInMinutes, 45);
  assert.strictEqual(bk.periodInMinutes, 60);
  assert.strictEqual(bk.delayInMinutes, 1, 'nunca rodou: roda ja, no proximo minuto (sempre foi assim)');
});

test('so popup, horarios: alarme no proximo horario, e o Backlog vai junto (sem alarme proprio)', async () => {
  const c = carregar({ storage: { agenda: { modo: 'horarios', minutos: 60, horarios: [8, 16] } } });
  await c.ctx.reagendar();
  assert.strictEqual(minutosAte(c.alarms.get('alimentacao')), 120, 'sao 14:00, o proximo e 16:00');
  assert.strictEqual(c.alarms.get('backlog'), undefined);
});

test('so popup, desligado: nenhum alarme de macro', async () => {
  const c = carregar({ storage: { agenda: { modo: 'off', minutos: 60, horarios: [] } } });
  await c.ctx.reagendar();
  assert.strictEqual(c.alarms.get('alimentacao'), undefined);
  assert.strictEqual(c.alarms.get('backlog'), undefined);
});

test('o intervalo do popup respeita o piso de 20 minutos', async () => {
  const c = carregar({ storage: { agenda: { modo: 'intervalo', minutos: 1, horarios: [] } } });
  await c.ctx.reagendar();
  assert.strictEqual(c.alarms.get('alimentacao').periodInMinutes, 20);
});

test('o Backlog conta da ultima vez que rodou, nao do zero a cada reagendar', async () => {
  const c = carregar({ storage: {
    agenda: { modo: 'intervalo', minutos: 45, horarios: [] },
    ultimoBacklog: AGORA - 50 * 60000,
  } });
  await c.ctx.reagendar();
  assert.strictEqual(c.alarms.get('backlog').delayInMinutes, 10, 'rodou ha 50 min: faltam 10');
});

test('o sistema manda sobre o popup: horarios do sistema valem mesmo com o popup desligado', async () => {
  const c = carregar({
    storage: { agenda: { modo: 'off', minutos: 60, horarios: [] },
      agendaSite: { versao: 'v1', alimentacao: { ativo: true, modo: 'horarios', minutos: 60, horarios: [15 * 60 + 30] } } },
  });
  await c.ctx.reagendar();
  assert.strictEqual(minutosAte(c.alarms.get('alimentacao')), 90, 'sao 14:00, o proximo e 15:30');
});

test('backlog com horarios proprios do sistema tem alarme proprio', async () => {
  const c = carregar({ storage: { agendaSite: { versao: 'v1',
    alimentacao: { ativo: true, modo: 'horarios', minutos: 60, horarios: [16 * 60] },
    backlog: { ativo: true, modo: 'horarios', minutos: 60, horarios: [14 * 60 + 45] } } } });
  await c.ctx.reagendar();
  assert.strictEqual(minutosAte(c.alarms.get('backlog')), 45);
});

test('macro desligado no sistema (ativo false) nao cria alarme', async () => {
  const c = carregar({ storage: { agendaSite: { versao: 'v1',
    alimentacao: { ativo: false, modo: 'intervalo', minutos: 60, horarios: [] },
    backlog: { ativo: false, modo: 'intervalo', minutos: 60, horarios: [] } } } });
  await c.ctx.reagendar();
  assert.strictEqual(c.alarms.get('alimentacao'), undefined);
  assert.strictEqual(c.alarms.get('backlog'), undefined);
});

test('so a AT vem do sistema: o Backlog herda o comportamento dela', async () => {
  const c = carregar({ storage: { agendaSite: { versao: 'v1',
    alimentacao: { ativo: true, modo: 'intervalo', minutos: 30, horarios: [] } } } });
  await c.ctx.reagendar();
  assert.strictEqual(c.alarms.get('alimentacao').periodInMinutes, 30);
  assert.strictEqual(c.alarms.get('backlog').periodInMinutes, 60);
});

// ── o alarme disparando ───────────────────────────────────────────────────
test('alarme da AT em horarios fixos, Backlog junto: dispara os dois e marca o proximo', async () => {
  const c = carregar({ storage: { agenda: { modo: 'horarios', minutos: 60, horarios: [8, 16] } } });
  await c.ouvintes.alarme({ name: 'alimentacao' });
  await dormir(20);
  assert.deepStrictEqual(macrosDisparados(c).sort(), ['alimentacao', 'backlog']);
  assert.ok(c.alarms.get('alimentacao'), 'o proximo horario ficou marcado');
});

test('alarme da AT com Backlog de horario proprio: so a AT dispara', async () => {
  const c = carregar({ storage: { agendaSite: { versao: 'v1',
    alimentacao: { ativo: true, modo: 'horarios', minutos: 60, horarios: [16 * 60] },
    backlog: { ativo: true, modo: 'horarios', minutos: 60, horarios: [18 * 60] } } } });
  await c.ouvintes.alarme({ name: 'alimentacao' });
  await dormir(20);
  assert.deepStrictEqual(macrosDisparados(c), ['alimentacao']);
});

test('alarme do Backlog em horarios fixos marca o proximo horario', async () => {
  const c = carregar({ storage: { agendaSite: { versao: 'v1',
    backlog: { ativo: true, modo: 'horarios', minutos: 60, horarios: [10 * 60, 20 * 60] } } } });
  await c.ouvintes.alarme({ name: 'backlog' });
  await dormir(20);
  assert.deepStrictEqual(macrosDisparados(c), ['backlog']);
  assert.strictEqual(minutosAte(c.alarms.get('backlog')), 6 * 60, 'sao 14:00, o proximo e 20:00');
});

test('o alarme de comandos pergunta ao vigia', async () => {
  const c = carregar();
  await c.ouvintes.alarme({ name: 'comandos' });
  assert.strictEqual(enviadosAoVigia(c, '/comandos').length, 1);
});

test('o disparo agendado continua marcado como agendado', async () => {
  const c = carregar({ storage: { agenda: { modo: 'intervalo', minutos: 45, horarios: [] } } });
  await c.ouvintes.alarme({ name: 'alimentacao' });
  await dormir(20);
  assert.match(c.guardado.ultimoDisparo.texto, /disparado: alimentacao \(agendado\)/);
});
