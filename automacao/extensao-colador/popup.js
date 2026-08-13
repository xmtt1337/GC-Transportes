// Mostra a URL da aba e sugere o trecho que identifica a tela.
//
// Existe porque a pergunta "como o colador sabe qual aba é a de clusters?" só
// tem uma resposta chata: alguém precisa dizer qual pedaço da URL é daquela
// tela. Aqui a pessoa abre a tela, clica no trecho e cola no colador.

const elUrl = document.getElementById('url');
const elTrechos = document.getElementById('trechos');
const elCopiado = document.getElementById('copiado');

// Pedaços que mudam a cada acesso não servem de filtro: o ID do recebimento
// (RT202608142TO6K) é diferente em toda tarefa.
function pareceIdentificador(parte) {
  return /\d{4,}/.test(parte) || parte.length > 28;
}

function trechosDaUrl(url) {
  const depoisDoHash = (url.split('#')[1] || url).split('?')[0];
  return depoisDoHash
    .split('/')
    .map(p => p.trim())
    .filter(p => p && !pareceIdentificador(p));
}

function copiar(texto) {
  navigator.clipboard.writeText(texto).then(() => {
    elCopiado.textContent = `copiado: ${texto}`;
    setTimeout(() => { elCopiado.textContent = ''; }, 2500);
  });
}

chrome.tabs.query({ active: true, currentWindow: true }, (abas) => {
  const url = abas && abas[0] && abas[0].url;

  if (!url || !url.includes('spx.shopee.com.br')) {
    elUrl.textContent = 'Esta aba não é do SPX.';
    elTrechos.innerHTML = '<p style="font-size:12px;color:#777">' +
      'Abra a tela do SPX que este colador vai usar e clique no ícone de novo.</p>';
    return;
  }

  elUrl.textContent = url;

  const trechos = trechosDaUrl(url);
  if (!trechos.length) {
    elTrechos.innerHTML = '<p style="font-size:12px;color:#777">' +
      'Não achei um trecho estável nesta URL.</p>';
    return;
  }

  // O mais específico primeiro (costuma ser o último segmento fixo), mas
  // palavras genéricas vão pro fim: "list" casaria com meia dúzia de telas
  // e faria dois coladores brigarem pela mesma aba.
  const GENERICOS = ['list', 'index', 'home', 'new', 'detail', 'page', 'ops'];
  trechos.reverse().sort((a, b) =>
    GENERICOS.includes(a.toLowerCase()) - GENERICOS.includes(b.toLowerCase()));

  trechos.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'trecho';
    b.textContent = t;
    b.onclick = () => copiar(t);
    elTrechos.appendChild(b);
  });
});
