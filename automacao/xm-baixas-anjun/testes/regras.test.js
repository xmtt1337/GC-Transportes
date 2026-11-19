// Regras da XM - Baixas Anjun, sem tela e sem rede. Dados de TESTE, inventados.
//
//   node --test automacao/xm-baixas-anjun/testes/regras.test.js

const test = require('node:test');
const assert = require('node:assert');
const { lerCodigos, mapearEtiquetas, formatarCpf, tracosDoTexto, montarCsv } = require('../extensao/regras.js');

test('lerCodigos: um por linha ou por espaco, sem repetir e na ordem', () => {
  const colado = 'AJ100000000000001\naj100000000000002  AJ100000000000001\n\nAJ1000000000003 lixo';
  assert.deepStrictEqual(lerCodigos(colado), ['AJ100000000000001', 'AJ100000000000002']);
  assert.deepStrictEqual(lerCodigos(''), []);
  assert.deepStrictEqual(lerCodigos(null), []);
});

test('mapearEtiquetas: vale a pagina da etiqueta, nao a lista de mercadorias', () => {
  const paginas = [
    { numero: 1, texto: 'Lista de mercadorias Pedido:TESTE001 Anjun_No:AJ100000000000001' },
    { numero: 2, texto: 'DANFE SIMPLIFICADO-ETIQUETA Fulano de Tal DESTINATARIO AJ100000000000001 SC-W-TESTE' },
    { numero: 3, texto: 'DANFE SIMPLIFICADO-ETIQUETA Ciclano DESTINATARIO AJ100000000000002' },
    { numero: 4, texto: 'Lista de mercadorias Anjun_No:AJ100000000000002' },
  ];
  assert.deepStrictEqual(mapearEtiquetas(paginas), { AJ100000000000001: 2, AJ100000000000002: 3 });
});

test('mapearEtiquetas: sem pagina de etiqueta, fica a primeira que cita o codigo', () => {
  const paginas = [
    { numero: 1, texto: 'Lista de mercadorias Anjun_No:AJ100000000000009' },
    { numero: 2, texto: 'Lista de mercadorias Anjun_No:AJ100000000000009' },
    { numero: 3, texto: 'pagina em branco' },
  ];
  assert.deepStrictEqual(mapearEtiquetas(paginas), { AJ100000000000009: 1 });
  assert.deepStrictEqual(mapearEtiquetas([]), {});
});

test('formatarCpf: so formata o que foi digitado, nunca inventa', () => {
  assert.strictEqual(formatarCpf('00000000000'), '000.000.000-00');
  assert.strictEqual(formatarCpf('000.000.000-00'), '000.000.000-00');
  assert.strictEqual(formatarCpf(' 111 111 111 11 '), '111.111.111-11');
  assert.strictEqual(formatarCpf('0000000000'), '');
  assert.strictEqual(formatarCpf(''), '');
  assert.strictEqual(formatarCpf(undefined), '');
});

test('tracosDoTexto: cada trecho opaco da linha vira um risco da esquerda para a direita', () => {
  // 8 x 3: linha 0 com dois trechos (1..3 e 6..7), linha 1 vazia, linha 2 com um ponto so (4).
  const largura = 8;
  const linhas = [
    [0, 255, 255, 255, 0, 0, 255, 255],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 200, 0, 0, 0],
  ];
  const alfa = Uint8Array.from(linhas.flat());
  const tracos = tracosDoTexto(alfa, largura, 3, { passo: 1, salto: 2 });
  assert.deepStrictEqual(tracos, [
    [{ x: 1, y: 0 }, { x: 3, y: 0 }],
    [{ x: 6, y: 0 }, { x: 7, y: 0 }],
    [{ x: 4, y: 2 }],
  ]);
});

test('tracosDoTexto: pula linhas pelo passo e ignora o que esta abaixo do limiar', () => {
  const alfa = new Uint8Array(4 * 4).fill(255);
  alfa.fill(50, 0, 4); // linha 0 quase transparente
  const tracos = tracosDoTexto(alfa, 4, 4, { passo: 2, salto: 10 });
  assert.deepStrictEqual(tracos, [[{ x: 0, y: 2 }, { x: 3, y: 2 }]]);
  assert.deepStrictEqual(tracosDoTexto(new Uint8Array(9), 3, 3), []);
});

test('montarCsv: cabecalho, situacao por extenso e aspas escapadas', () => {
  const csv = montarCsv([
    { codigo: 'AJ100000000000001', situacao: 'ok', hora: '10:00:00' },
    { codigo: 'AJ100000000000002', situacao: 'erro', motivo: 'a Anjun recusou: "pacote ja assinado"', hora: '10:01:00' },
    { codigo: 'AJ100000000000003', situacao: 'sem_etiqueta' },
  ]);
  assert.deepStrictEqual(csv.split('\r\n'), [
    '"Codigo";"Situacao";"Motivo";"Hora"',
    '"AJ100000000000001";"Baixa feita";"";"10:00:00"',
    '"AJ100000000000002";"Erro";"a Anjun recusou: ""pacote ja assinado""";"10:01:00"',
    '"AJ100000000000003";"Sem etiqueta no PDF";"";""',
  ]);
});
