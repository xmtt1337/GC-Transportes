// Regras da XM - Bipagem Loggi, sem rede e sem Chrome. Dados de TESTE, inventados.
//
//   node --test automacao/xm-bipagem-loggi/testes/

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../extensao/regras.js');
const { extrairBipes, ROTA } = require('../extensao/loggi.js');
const { limitar } = require('../extensao/menu.js');

const GRUPOS = [
  { id: 1, nome: 'Grupo Teste', cidades: ['Caçador', 'Videira'] },
  { id: 2, nome: 'Grupo Dois', cidades: ['Videira', 'Fraiburgo'] },
];

test('chaveCidade iguala o jeito da Loggi e o do sistema', () => {
  assert.strictEqual(R.chaveCidade('CACADOR'), 'cacador');
  assert.strictEqual(R.chaveCidade('Caçador'), 'cacador');
  assert.strictEqual(R.chaveCidade('CACADOR - SC'), 'cacador');
  assert.strictEqual(R.chaveCidade('Caçador (SC)'), 'cacador');
  assert.strictEqual(R.chaveCidade('Herval d’Oeste'), 'herval d oeste');
});

test('vale um circulo so; com circulo marcado, cidade solta nao conta', () => {
  const a = R.montarAlvo({ grupos: [2, 1], cidades: ['Arroio Trinta'] }, GRUPOS);
  assert.strictEqual(a.tipo, 'circulo');
  assert.deepStrictEqual(a.cidades, ['Videira', 'Fraiburgo']);
  assert.strictEqual(a.rotulo, 'Círculo Grupo Dois');
  assert.strictEqual(a.frase, 'do círculo Grupo Dois');
  // Circulo apagado na frente nao derruba o seguinte.
  assert.strictEqual(R.montarAlvo({ grupos: [99, 1] }, GRUPOS).rotulo, 'Círculo Grupo Teste');
});

test('textos para um circulo, uma cidade e varias cidades', () => {
  assert.strictEqual(R.montarAlvo({ grupos: [1] }, GRUPOS).frase, 'do círculo Grupo Teste');
  assert.strictEqual(R.montarAlvo({ grupos: [1] }, GRUPOS).rotulo, 'Círculo Grupo Teste');
  const uma = R.montarAlvo({ cidades: ['Arroio Trinta'] }, GRUPOS);
  assert.deepStrictEqual([uma.tipo, uma.rotulo, uma.frase], ['cidade', 'Arroio Trinta', 'de Arroio Trinta']);
  const tres = R.montarAlvo({ cidades: ['Caçador', 'Videira', 'Fraiburgo'] }, GRUPOS);
  assert.strictEqual(tres.frase, 'das cidades Caçador, Videira e Fraiburgo');
  assert.strictEqual(tres.rotulo, 'Caçador, Videira, Fraiburgo');
});

test('grupo apagado some da selecao sem quebrar', () => {
  const a = R.montarAlvo({ grupos: [99], cidades: [] }, GRUPOS);
  assert.deepStrictEqual(a.chaves, []);
});

test('bipe da cidade marcada e certo; de outra, errado', () => {
  const alvo = R.montarAlvo({ grupos: [1] }, GRUPOS);
  assert.strictEqual(R.conferirBipe('VIDEIRA', alvo).ok, true);
  assert.strictEqual(R.conferirBipe('CACADOR', alvo).ok, true);
  assert.strictEqual(R.conferirBipe('FRAIBURGO', alvo).ok, false);
});

test('a conversao de cidades corrige o nome da Loggi antes de comparar', () => {
  const alvo = R.montarAlvo({ cidades: ['Caçador'] }, []);
  assert.strictEqual(R.conferirBipe('CACADORR', alvo).ok, false);
  assert.strictEqual(R.conferirBipe('CACADORR', alvo, { cacadorr: 'Caçador' }).ok, true);
});

test('no Continuar, aponta so os errados que ainda estao na lista', () => {
  const alvo = R.montarAlvo({ grupos: [1] }, GRUPOS);
  const bipes = new Map([
    ['SKTESTE0000000001', 'VIDEIRA'],
    ['SKTESTE0000000002', 'FRAIBURGO'],
    ['SKTESTE0000000003', 'LAGES'],
  ]);
  // O 3 foi tirado na lixeira: nao esta mais no texto da tela.
  const tela = 'Lista 2 pacotes\nSKTESTE0000000001 empresa VIDEIRA\nskteste0000000002 empresa FRAIBURGO';
  assert.deepStrictEqual(R.pendentes(bipes, tela, alvo), [{ codigo: 'SKTESTE0000000002', cidade: 'FRAIBURGO' }]);
  assert.deepStrictEqual(R.pendentes(bipes, tela, R.montarAlvo({}, GRUPOS)), []);
});

test('sem nada marcado nao ha alarme', () => {
  assert.strictEqual(R.conferirBipe('VIDEIRA', R.montarAlvo({}, GRUPOS)).ok, null);
  assert.strictEqual(R.conferirBipe('VIDEIRA', null).ok, null);
});

test('le codigo e cidade da resposta do bipe da Loggi, e nada mais', () => {
  const resposta = {
    SKTESTE0000000001: {
      company: { name: 'Empresa Teste' },
      destination: { city: 'VIDEIRA' },
      loggiAddress: { correiosAddress: { cidade: 'VIDEIRA', logradouro: 'Rua Teste' } },
    },
    SKTESTE0000000002: { loggiAddress: { postalAddress: { locality: 'CACADOR' } } },
    SKTESTE0000000003: { status: { code: 1 } },
  };
  assert.deepStrictEqual(extrairBipes(resposta), [
    { codigo: 'SKTESTE0000000001', cidade: 'VIDEIRA' },
    { codigo: 'SKTESTE0000000002', cidade: 'CACADOR' },
  ]);
  assert.deepStrictEqual(extrairBipes(null), []);
  assert.deepStrictEqual(extrairBipes([1]), []);
});

test('so a chamada do bipe e ouvida', () => {
  assert.ok(ROTA.test('https://leve.loggi.com/proxy/last-mile/v1/x:1/group_packages/retrieve_and_validate_packages_by_barcode'));
  assert.ok(!ROTA.test('https://leve.loggi.com/proxy/wms/api/v1/get-create-unitload'));
});

test('login usa o canal vigia e confere o acesso sem banco', async () => {
  const chamadas = [];
  const buscar = async (url, o) => {
    chamadas.push({ url, o });
    return url.endsWith('/login')
      ? { status: 200, ok: true, json: async () => ({ success: true, token: 'T', name: 'Pessoa Teste' }) }
      : { status: 200, ok: true, json: async () => ({ ok: true }) };
  };
  assert.deepStrictEqual(await R.entrar('pessoa', 'x', buscar), { token: 'T', nome: 'Pessoa Teste' });
  assert.strictEqual(JSON.parse(chamadas[0].o.body).canal, 'vigia');
  assert.ok(chamadas[1].url.endsWith('/macros/acesso'));
});

test('entregador barrado e mensagem de erro do servidor chegam certas', async () => {
  const resp = (status, corpo) => async () => ({ status, ok: status < 400, json: async () => corpo });
  await assert.rejects(R.api('T', 'GET', '/grupos', undefined, resp(403, { error: 'Acesso negado' })), R.ErroDeConta);
  await assert.rejects(R.api('T', 'GET', '/grupos', undefined, resp(401, {})), R.ErroDeConta);
  await assert.rejects(R.api('T', 'POST', '/grupos', {}, resp(409, { error: 'Já existe um grupo com esse nome.' })), /Já existe/);
});

test('menu nao sai da tela', () => {
  assert.strictEqual(limitar(-30, 500), 8);
  assert.strictEqual(limitar(900, 500), 500);
});

test('manifest: so Loggi e o sistema, com id liberado no backend', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extensao', 'manifest.json'), 'utf8'));
  assert.deepStrictEqual(m.host_permissions, ['https://*.loggi.com/*', 'https://sistema-backend-i4uh.onrender.com/*']);
  const hash = require('node:crypto').createHash('sha256').update(Buffer.from(m.key, 'base64')).digest('hex').slice(0, 32);
  const id = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.strictEqual(id, 'ogpbfjkhogaonkoahbdgjkhbancgpgbh');
  const server = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'sistema-backend', 'server.js'), 'utf8');
  assert.ok(server.includes(`chrome-extension://${id}`));
});

test('circulo cujo nome ja diz "Círculo" nao repete a palavra', () => {
  const a = R.montarAlvo({ grupos: [9] }, [{ id: 9, nome: 'Círculo Lindomar', cidades: ['Caçador'] }]);
  assert.strictEqual(a.rotulo, 'Círculo Lindomar');
  assert.strictEqual(a.frase, 'do Círculo Lindomar');
});

test('arco.loggi.com sem login trava; com login ou em outro site da Loggi, nao', () => {
  assert.strictEqual(R.precisaTravar('arco.loggi.com', false), true);
  assert.strictEqual(R.precisaTravar('ARCO.loggi.com', false), true);
  assert.strictEqual(R.precisaTravar('arco.loggi.com', true), false);
  assert.strictEqual(R.precisaTravar('www.loggi.com', false), false);
});

test('lixeira: acha o pacote da linha clicada, e nada quando ja passou da linha', () => {
  const codigos = ['SKTESTE0000000001', 'skteste0000000002'];
  // botao (sem texto) → linha com 1 codigo
  assert.strictEqual(R.codigoDaLinha(['', 'SKTESTE0000000002 Empresa Teste VIDEIRA'], codigos), 'SKTESTE0000000002');
  // botao fora de qualquer linha: o primeiro ancestral com codigo ja e a lista inteira
  assert.strictEqual(R.codigoDaLinha(['', 'SKTESTE0000000001\nSKTESTE0000000002'], codigos), null);
  assert.strictEqual(R.codigoDaLinha(['', 'Nada aqui'], codigos), null);
});

// Relatorio Na base: so os "Sem tentativa", so codigo/ID/cidade/prazo. Dados de TESTE, inventados.
test('semTentativa le o CSV do Na base com aspas e virgula dentro do endereco', () => {
  const csv = '﻿Chegou em,Prazo,Endereço completo,Cidade,ID do pacote,Código de barras,Status\r\n'
    + '2026-01-01T08:00:00.000,2026-01-02T22:00,"Rua Teste, 1 ""fundos""",Cidade A,id1,TESTE0001,Sem tentativa\r\n'
    + '2026-01-01T08:00:00.000,2026-01-02T22:00,Rua Teste 2,Cidade B,id2,TESTE0002,Aguardando reenvio\r\n'
    + '2026-01-01T08:00:00.000,2026-01-03T22:00,"Rua\nquebrada",Cidade B,id3,,SEM TENTATIVA\r\n';
  assert.deepStrictEqual(R.semTentativa(csv), [
    { codigo: 'TESTE0001', id: 'id1', cidade: 'Cidade A', prazo: '2026-01-02T22:00' },
    { codigo: '', id: 'id3', cidade: 'Cidade B', prazo: '2026-01-03T22:00' },
  ]);
});

test('semTentativa recusa arquivo sem as colunas', () => {
  assert.throws(() => R.semTentativa('a,b\n1,2'), /Status/);
});
