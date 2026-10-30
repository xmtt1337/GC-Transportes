// A tela. As regras moram em consulta.js.
//
// A senha nao e guardada. O token fica em storage.session: nao chega aos scripts
// das paginas e some quando o Chrome fecha.

const X = self.XMConsulta;
const $ = (id) => document.getElementById(id);

let rodando = false;
let pedirParada = false;
let ultimoDownload = null;

const relogio = new Worker('relogio.js');
const esperas = new Map();
let proximaEspera = 0;
relogio.onmessage = (e) => {
  esperas.get(e.data)();
  esperas.delete(e.data);
};
const dormir = (ms) => new Promise((resolve) => {
  const id = ++proximaEspera;
  esperas.set(id, resolve);
  relogio.postMessage({ id, ms });
});

const abas = X.criarAbas({ tabs: chrome.tabs, esperar: dormir });

function mostrarLogin(aviso = '') {
  $('tela-consulta').hidden = true;
  $('tela-login').hidden = false;
  $('aviso-login').textContent = aviso;
  $('senha').value = '';
  chrome.storage.local.get('usuario').then(({ usuario }) => {
    if (usuario && !$('usuario').value) $('usuario').value = usuario;
    $(usuario ? 'senha' : 'usuario').focus();
  });
}

function mostrarConsulta(nome) {
  $('tela-login').hidden = true;
  $('tela-consulta').hidden = false;
  $('logado').textContent = `Logado como ${nome}`;
  atualizarContagem();
}

function transportadora() {
  return X.TRANSPORTADORAS[$('transportadora').selectedIndex];
}

function atualizarContagem() {
  const t = transportadora();
  if (!t.ativa) {
    $('contagem').textContent = `${t.nome} ainda não está disponível.`;
    $('iniciar').disabled = true;
    return;
  }
  const { codigos, ignorados } = X.extrairCodigos($('codigos').value, t.padrao);
  $('contagem').textContent = ignorados
    ? `${codigos.length} códigos · ${ignorados} ignorados (não parecem da ${t.nome})`
    : `${codigos.length} códigos`;
  $('iniciar').disabled = rodando || !codigos.length;
}

function mostrarProgresso(feitos, total, restanteMs) {
  const pct = X.porcentagem(feitos, total);
  $('barra').style.width = `${pct}%`;
  $('progresso').textContent = feitos ? `${pct}%  ·  ${feitos} de ${total}  ·  faltam ${X.textoTempo(restanteMs)}` : '0%';
  document.title = rodando ? `${pct}% · XM Consulta` : 'XM Consulta';
}

function dizer(texto, erro = false) {
  $('mensagem').textContent = texto;
  $('mensagem').className = erro ? 'erro' : '';
}

async function baixarCsv(t, linhas) {
  const nome = X.nomeArquivo(t.chave);
  const url = URL.createObjectURL(new Blob([X.montarCsv(linhas)], { type: 'text/csv;charset=utf-8' }));
  ultimoDownload = await chrome.downloads.download({ url, filename: `XM Consulta/${nome}`, saveAs: false });
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  $('mostrar').hidden = false;
  return nome;
}

function definirRodando(valor) {
  rodando = valor;
  $('parar').disabled = !valor;
  $('transportadora').disabled = valor;
  $('codigos').readOnly = valor;
  $('sair').disabled = valor;
  atualizarContagem();
}

async function iniciar() {
  const t = transportadora();
  const { codigos } = X.extrairCodigos($('codigos').value, t.padrao);
  pedirParada = false;
  $('mostrar').hidden = true;
  mostrarProgresso(0, codigos.length, 0);
  definirRodando(true);

  try {
    dizer('Conferindo seu acesso...');
    const { token } = await chrome.storage.session.get('token');
    await X.conferir(token);
    dizer(`Preparando a aba da ${t.nome}...`);
    await abas.preparar(t);
    dizer('Consultando...');

    const inicio = Date.now();
    const res = await X.executar({
      codigos,
      dormir,
      pedir: (codigo) => abas.consultar(t, codigo),
      deveParar: () => pedirParada,
      aoAvancar: (feitos, total) => {
        const medio = (Date.now() - inicio) / feitos;
        mostrarProgresso(feitos, total, medio * (total - feitos));
      },
    });
    await concluir(t, res);
  } catch (e) {
    if (e instanceof X.ErroDeConta) {
      definirRodando(false);
      await chrome.storage.session.remove('token');
      mostrarLogin(e.message);
      return;
    }
    dizer(e.message, true);
  }
  definirRodando(false);
  document.title = 'XM Consulta';
}

async function concluir(t, res) {
  const partes = [];
  if (res.parado) partes.push('Parado por você');
  if (res.erro) partes.push(res.erro);
  if (res.linhas.length) {
    const nome = await baixarCsv(t, res.linhas);
    partes.push(`${res.linhas.length} pacotes em Downloads\\XM Consulta\\${nome}`);
    const semWhats = res.linhas.filter((l) => !l.whatsapp).length;
    if (semWhats) partes.push(`${semWhats} sem WhatsApp válido`);
  }
  if (res.pendentes.length) {
    $('codigos').value = res.pendentes.join('\n');
    partes.push(`${res.pendentes.length} códigos que faltaram ficaram na caixa`);
  }
  dizer(`${partes.map((p) => p.replace(/\.$/, '')).join('. ')}.`, !!res.erro);
}

$('tela-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('usuario').value.trim();
  $('entrar').disabled = true;
  $('entrar').textContent = 'Entrando...';
  try {
    const { token, nome } = await X.entrar(usuario, $('senha').value);
    await chrome.storage.session.set({ token, nome });
    await chrome.storage.local.set({ usuario });
    $('senha').value = '';
    mostrarConsulta(nome);
  } catch (erro) {
    mostrarLogin(erro.message);
  }
  $('entrar').disabled = false;
  $('entrar').textContent = 'Entrar';
});

$('sair').addEventListener('click', async () => {
  await chrome.storage.session.clear();
  mostrarLogin();
});
$('iniciar').addEventListener('click', iniciar);
$('parar').addEventListener('click', () => {
  pedirParada = true;
  $('parar').disabled = true;
  dizer('Parando...');
});
$('mostrar').addEventListener('click', () => chrome.downloads.show(ultimoDownload));
$('codigos').addEventListener('input', atualizarContagem);
$('transportadora').addEventListener('change', atualizarContagem);

// Fechar no meio perderia o que ja veio.
window.addEventListener('beforeunload', (e) => {
  if (rodando) e.preventDefault();
});

async function comecar() {
  for (const t of X.TRANSPORTADORAS) {
    $('transportadora').add(new Option(t.ativa ? t.nome : `${t.nome} (em breve)`));
  }
  chrome.tabs.getCurrent().then((aba) => {
    if (aba) chrome.tabs.update(aba.id, { autoDiscardable: false }).catch(() => {});
  });

  const { token, nome } = await chrome.storage.session.get(['token', 'nome']);
  if (!token) return mostrarLogin();
  try {
    await X.conferir(token);
    mostrarConsulta(nome);
  } catch (e) {
    if (e instanceof X.ErroDeConta) await chrome.storage.session.clear();
    mostrarLogin(e.message);
  }
}

comecar();
