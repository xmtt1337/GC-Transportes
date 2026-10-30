// Regras do XM Consulta, sem rede e sem Chrome. Dados de TESTE, inventados.
//
//   node --test automacao/xm-consulta/testes/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const X = require('../extensao/consulta.js');

const ANJUN = X.TRANSPORTADORAS[0];
const semPausa = async () => {};

test('tempoDeBloqueio le o prazo da Anjun e soma 1 minuto de folga', () => {
  const msg = 'A Anjun recusou (HTTP 200, code 500): Operações muito frequentes, tente novamente após 29 minuto(s) 27 segundo(s).';
  assert.strictEqual(X.tempoDeBloqueio(msg), ((29 * 60) + 27 + 60) * 1000);
  assert.strictEqual(X.tempoDeBloqueio('muito frequentes, após 40 segundo(s)'), 100000);
});

test('bloqueio sem prazo legivel assume 30 minutos, e outro erro nao bloqueia', () => {
  assert.strictEqual(X.tempoDeBloqueio('Operações muito frequentes'), 31 * 60 * 1000);
  assert.strictEqual(X.tempoDeBloqueio('A Anjun recusou (HTTP 502)'), null);
  assert.strictEqual(X.tempoDeBloqueio(null), null);
});

test('nao inicia durante o bloqueio e libera quando o prazo acaba', () => {
  const agora = Date.now();
  assert.match(X.motivoParaNaoIniciar({ agora, bloqueadoAte: agora + 120000 }), /bloqueou.*falta 2 min 00 s/);
  assert.strictEqual(X.motivoParaNaoIniciar({ agora, bloqueadoAte: agora - 1 }), null);
});

test('nao inicia em cima de outra rodada', () => {
  const agora = Date.now();
  assert.match(X.motivoParaNaoIniciar({ agora, ultimaConsulta: agora - 3000 }), /outra aba/);
  assert.strictEqual(X.motivoParaNaoIniciar({ agora, ultimaConsulta: agora - 10000 }), null);
  assert.strictEqual(X.motivoParaNaoIniciar({ agora }), null);
});

test('extrairCodigos aceita separadores, tira repetido e conta lixo', () => {
  const texto = 'AJ100000000000001\naj100000000000002, AJ100000000000001;BR123 xyz';
  assert.deepStrictEqual(X.extrairCodigos(texto, ANJUN.padrao), {
    codigos: ['AJ100000000000001', 'AJ100000000000002'],
    ignorados: 2,
  });
});

test('so a Anjun esta ativa, e as tres aparecem', () => {
  assert.deepStrictEqual(X.TRANSPORTADORAS.map((t) => t.chave), ['anjun', 'shopee', 'imile']);
  assert.deepStrictEqual(X.TRANSPORTADORAS.filter((t) => t.ativa).map((t) => t.nome), ['Anjun']);
});

test('linkWhatsapp acrescenta DDI so quando falta', () => {
  assert.strictEqual(X.linkWhatsapp('49900000000'), 'https://wa.me/5549900000000');
  assert.strictEqual(X.linkWhatsapp('(49) 3333-3333'), 'https://wa.me/554933333333');
  assert.strictEqual(X.linkWhatsapp('5549900000000'), 'https://wa.me/5549900000000');
  assert.strictEqual(X.linkWhatsapp('123'), '');
  assert.strictEqual(X.linkWhatsapp(null), '');
});

test('CSV abre no Excel com acento e sem virar formula', () => {
  const csv = X.montarCsv([{
    waybill: 'AJ1', status: 'Em trânsito', nome: '=Fulano "X"', telefone: '49900000000', whatsapp: '',
  }]);
  assert.ok(csv.startsWith('﻿"') === false && csv.startsWith('﻿waybill;'));
  assert.ok(csv.includes('"Em trânsito"'));
  assert.ok(csv.includes(`"'=Fulano ""X"""`));
});

test('nomeArquivo tem transportadora e horario', () => {
  assert.strictEqual(X.nomeArquivo('anjun', new Date(2026, 9, 30, 15, 4, 9)), 'anjun-contatos-2026-10-30_15-04-09.csv');
});

test('executar mostra a porcentagem e faz 1 pacote a cada 3 segundos', async () => {
  const avancos = [];
  const pausas = [];
  const res = await X.executar({
    codigos: ['AJ1', 'AJ2', 'AJ3', 'AJ4'],
    pedir: async () => ({ ok: true, dados: { status: 'S', nome: 'F', telefone: '49900000000' } }),
    aoAvancar: (f, t) => avancos.push(X.porcentagem(f, t)),
    deveParar: () => false,
    dormir: async (ms) => pausas.push(ms),
    agora: () => 0,
  });
  assert.deepStrictEqual(avancos, [25, 50, 75, 100]);
  assert.deepStrictEqual(pausas, [3000, 3000, 3000]);
  assert.strictEqual(res.linhas[0].whatsapp, 'https://wa.me/5549900000000');
  assert.strictEqual(res.erro, null);
});

test('a pausa desconta o tempo da consulta', async () => {
  const tempos = [0, 400];
  const pausas = [];
  await X.executar({
    codigos: ['AJ1', 'AJ2'],
    pedir: async () => ({ ok: true }),
    aoAvancar() {},
    deveParar: () => false,
    dormir: async (ms) => pausas.push(ms),
    agora: () => tempos.shift() ?? 0,
  });
  assert.strictEqual(pausas[0], 2600);
});

test('bloqueio para, guarda o que veio e devolve o resto', async () => {
  const res = await X.executar({
    codigos: ['AJ1', 'AJ2', 'AJ3'],
    pedir: async (c) => (c === 'AJ2' ? { ok: false, erro: 'A Anjun recusou (HTTP 429)' } : { ok: true }),
    aoAvancar() {},
    deveParar: () => false,
    dormir: semPausa,
  });
  assert.deepStrictEqual(res.linhas.map((l) => l.waybill), ['AJ1']);
  assert.deepStrictEqual(res.pendentes, ['AJ2', 'AJ3']);
  assert.match(res.erro, /HTTP 429/);
});

test('o botao Parar devolve o que faltou', async () => {
  let parar = false;
  const res = await X.executar({
    codigos: ['AJ1', 'AJ2'],
    pedir: async () => { parar = true; return { ok: true }; },
    aoAvancar() {},
    deveParar: () => parar,
    dormir: semPausa,
  });
  assert.strictEqual(res.parado, true);
  assert.deepStrictEqual(res.pendentes, ['AJ2']);
});

function resposta(status, corpo = {}) {
  return { status, ok: status < 400, json: async () => corpo };
}

test('login usa o canal vigia e confere o acesso', async () => {
  const chamadas = [];
  const buscar = async (url, o) => {
    chamadas.push({ url, o });
    return url.endsWith('/login') ? resposta(200, { success: true, token: 'T', name: 'Fulano' }) : resposta(200);
  };
  assert.deepStrictEqual(await X.entrar('fulano', 'x', buscar), { token: 'T', nome: 'Fulano' });
  assert.strictEqual(JSON.parse(chamadas[0].o.body).canal, 'vigia');
  assert.ok(chamadas[1].url.endsWith('/macros/resumo'));
  assert.strictEqual(chamadas[1].o.headers.Authorization, 'Bearer T');
});

test('entregador e barrado mesmo com a senha certa', async () => {
  const buscar = async (url) => (url.endsWith('/login')
    ? resposta(200, { success: true, token: 'T' })
    : resposta(403));
  await assert.rejects(X.entrar('entregador', 'x', buscar), X.ErroDeConta);
});

test('senha errada, inativo e senha temporaria nao entram', async () => {
  for (const corpo of [{ success: false }, { success: false, inativo: true }, { success: true, require_password_change: true }]) {
    await assert.rejects(X.entrar('fulano', 'x', async () => resposta(200, corpo)), X.ErroDeConta);
  }
});

test('servidor fora do ar nao vira "senha errada"', async () => {
  await assert.rejects(X.entrar('fulano', 'x', async () => { throw new Error('rede'); }), /Não alcancei/);
});

test('sem aba aberta, abre a Anjun e espera ficar pronta', async () => {
  const criadas = [];
  let abas = [];
  let voltas = 0;
  const ctrl = X.criarAbas({
    esperar: async () => { voltas += 1; },
    tabs: {
      query: async () => abas,
      create: async (o) => { criadas.push(o.url); abas = [{ id: 7 }]; },
      sendMessage: async () => ({ pronto: voltas >= 2 }),
      update: async () => {},
    },
  });
  await ctrl.preparar(ANJUN);
  assert.deepStrictEqual(criadas, [ANJUN.url]);
});

test('aba sem sessao avisa o que fazer em vez de seguir', async () => {
  let t = 0;
  const ctrl = X.criarAbas({
    esperar: async () => {},
    agora: () => (t += 10000),
    tabs: {
      query: async () => [{ id: 1 }],
      create: async () => {},
      sendMessage: async () => ({ pronto: false }),
      update: async () => {},
    },
  });
  await assert.rejects(ctrl.preparar(ANJUN), /F5/);
});

test('menu flutuante nao sai da tela nem some ao arrastar', () => {
  const { limitar } = require('../extensao/menu.js');
  assert.strictEqual(limitar(100, 500), 100);
  assert.strictEqual(limitar(-30, 500), 8);
  assert.strictEqual(limitar(900, 500), 500);
  assert.strictEqual(limitar(100, -50), 8); // janela menor que o painel
});

test('so a Anjun pode embutir o painel, e ele guarda o nome novo', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extensao', 'manifest.json'), 'utf8'));
  assert.strictEqual(m.name, 'XM - Consultas de telefone');
  assert.deepStrictEqual(m.web_accessible_resources, [{
    resources: ['pagina.html', 'img/logo.png', 'img/logo-claro.png'],
    matches: ['https://newsupplier.anjunexpress.com/*'],
  }]);
});

test('manifest alcanca so a Anjun e o sistema, com o id liberado no backend', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extensao', 'manifest.json'), 'utf8'));
  assert.deepStrictEqual(m.host_permissions, [
    'https://newsupplier.anjunexpress.com/*',
    'https://sistema-backend-i4uh.onrender.com/*',
  ]);
  const hash = require('node:crypto').createHash('sha256')
    .update(Buffer.from(m.key, 'base64')).digest('hex').slice(0, 32);
  const id = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.strictEqual(id, 'cdhcmfhjiijlnbemdabgelddpjmoecbp');
});
