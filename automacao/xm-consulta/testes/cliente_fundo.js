// Roda o fundo.js de verdade contra a ponte Python, com o Chrome dublado.
// Uso (pelo test_ponte.py): node cliente_fundo.js <porta> <chave>
// Dados de TESTE, inventados.

const fs = require('fs');
const path = require('path');

const [porta, chave] = process.argv.slice(2);
const ouvinte = { addListener() {} };

global.chrome = {
  storage: {
    local: { get: async () => ({ chave }) },
    onChanged: ouvinte,
  },
  runtime: { onInstalled: ouvinte, onStartup: ouvinte, onMessage: ouvinte },
  alarms: { create() {}, onAlarm: ouvinte },
  tabs: {
    onUpdated: ouvinte,
    query: async () => [{ id: 1 }],
    create: async () => {},
    sendMessage: async (_, pedido) => (pedido.tipo === 'status'
      ? { pronto: true }
      : { ok: true, dados: { status: 'Pacote com problemas', nome: 'Fulano', telefone: pedido.codigo.slice(-11) } }),
  },
};

const codigo = fs.readFileSync(path.join(__dirname, '..', 'extensao', 'fundo.js'), 'utf8')
  .replace('const PORTA = 49741;', `const PORTA = ${Number(porta)};`);
eval(codigo);
