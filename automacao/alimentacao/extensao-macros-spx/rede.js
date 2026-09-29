// Conta quantas chamadas o SPX tem em voo, pro macro saber quando a tela
// terminou de carregar de verdade. Tambem captura a AT que o SPX cria ao
// colar um codigo na tela de AT Cluster (ver "captura da AT", abaixo).
//
// POR QUE E UM ARQUIVO SEPARADO: content script roda num mundo isolado, e o
// `fetch` que ele enxerga NAO e o que a pagina usa. Trocar o fetch la nao
// intercepta nada. Este roda no mundo da PAGINA ("world": "MAIN" no manifest)
// e conversa com o outro por postMessage, a unica ponte entre os dois.
//
// Fora da rota de criar AT (ver abaixo), nao le corpo, nao guarda url, nao
// manda nada pra fora - so conta.

(() => {
  'use strict';

  if (window.__xmMacroRede) return;
  window.__xmMacroRede = true;

  let ativas = 0;

  function avisar() {
    window.postMessage({ __xmMacroRede: true, ativas }, window.location.origin);
  }

  function entrou() { ativas++; avisar(); }
  function saiu() { ativas = Math.max(0, ativas - 1); avisar(); }

  // ── captura da AT (Colador — AT Cluster) ──────────────────────────────────
  // Ao colar um codigo nessa tela, o SPX cria a AT e devolve o numero na
  // PROPRIA resposta dessa chamada - e o unico jeito de saber na hora (o
  // arquivo da Shopee com essa informacao so sai horas depois). So esta rota
  // tem o corpo lido; nenhuma outra chamada e olhada por dentro.
  //
  // Se a Shopee renomear a rota ou os campos, e aqui (ROTA_CRIA_AT e
  // CAMPOS_CODIGO/CAMPOS_AT) que se ajusta.
  const ROTA_CRIA_AT = '/assisted_sorting/delivery/order/add';
  const CAMPOS_CODIGO = ['fleet_order_id', 'order_id', 'sls_tracking_no', 'tracking_no'];
  const CAMPOS_AT = ['at_no', 'at_id', 'assisted_task_no'];

  function primeiroCampo(obj, campos) {
    if (!obj || typeof obj !== 'object') return null;
    for (const c of campos) if (obj[c] != null && obj[c] !== '') return String(obj[c]);
    return null;
  }

  function avisarAt(codigo, at) {
    if (codigo && at) window.postMessage({ __xmMacroAt: true, codigo, at }, window.location.origin);
  }

  // `retcode` ausente conta como sucesso: nem toda resposta do SPX o repete.
  function tratarRespostaAt(codigo, texto) {
    if (!codigo) return;
    try {
      const resposta = JSON.parse(texto);
      if (resposta && (resposta.retcode === 0 || resposta.retcode === undefined)) {
        avisarAt(codigo, primeiroCampo(resposta.data, CAMPOS_AT));
      }
    } catch (e) { /* resposta nao e JSON - nao e a chamada que a gente espera */ }
  }

  const fetchOriginal = window.fetch;
  window.fetch = function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : String((args[0] && args[0].url) || '');
    let codigoDaAt = null;
    if (url.includes(ROTA_CRIA_AT)) {
      try {
        const corpo = args[1] && args[1].body;
        if (typeof corpo === 'string') codigoDaAt = primeiroCampo(JSON.parse(corpo), CAMPOS_CODIGO);
      } catch (e) { /* corpo nao e JSON - segue sem capturar */ }
    }
    entrou();
    let promessa;
    try {
      promessa = fetchOriginal.apply(this, args);
    } catch (e) {
      saiu();
      throw e;
    }
    return promessa.then(
      (r) => {
        saiu();
        if (codigoDaAt) r.clone().text().then((t) => tratarRespostaAt(codigoDaAt, t)).catch(() => {});
        return r;
      },
      (e) => { saiu(); throw e; },
    );
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__xmMacroUrl = String(url || '');
    return xhrOpen.call(this, metodo, url, ...resto);
  };

  const xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (corpo) {
    let baixou = false;
    let codigoDaAt = null;
    if ((this.__xmMacroUrl || '').includes(ROTA_CRIA_AT) && typeof corpo === 'string') {
      try { codigoDaAt = primeiroCampo(JSON.parse(corpo), CAMPOS_CODIGO); } catch (e) { /* segue sem capturar */ }
    }
    const terminou = () => {
      if (baixou) return;
      baixou = true;
      saiu();
      if (codigoDaAt) tratarRespostaAt(codigoDaAt, this.responseText);
    };
    try {
      entrou();
      this.addEventListener('loadend', terminou);
    } catch (e) {
      terminou();
    }
    return xhrSend.call(this, corpo);
  };

  // ── o download do relatorio ──────────────────────────────────────────────
  // O botao Baixar do SPX chama window.open. Clique de macro NAO da "ativacao
  // do usuario" pro navegador, entao o bloqueador de pop-up mata a janela: o
  // arquivo nunca vem, nenhum erro aparece na tela e o macro segue achando que
  // baixou. Foi exatamente o que aconteceu - a pasta de downloads ficou sem o
  // arquivo enquanto o painel do SPX dizia "Pronto".
  //
  // Quando a janela e bloqueada, o endereco e baixado por um iframe escondido.
  // Resposta com Content-Disposition: attachment vira download sem sair da
  // pagina e sem depender de permissao de pop-up.
  function baixarEscondido(endereco) {
    try {
      const moldura = document.createElement('iframe');
      moldura.style.display = 'none';
      moldura.src = endereco;
      document.documentElement.appendChild(moldura);
      setTimeout(() => { try { moldura.remove(); } catch (e) {} }, 60000);
      return true;
    } catch (e) {
      return false;
    }
  }

  // O mesmo endereco pedido duas vezes em poucos segundos e o MESMO download.
  //
  // Acontece: uma rodada baixou dois arquivos identicos (mesmo sha1) com seis
  // segundos de diferenca. Nao faz mal - o vigia compara por conteudo e ignora
  // o segundo -, mas enche a pasta de downloads de copia e confunde quem olha.
  //
  // O log conta cada chamada com endereco e hora: se o dobro voltar, o console
  // diz se foi a pagina pedindo duas vezes ou outra coisa.
  const ultimoAberto = { endereco: '', quando: 0 };
  const JANELA_REPETIDO_MS = 10000;

  const abrirOriginal = window.open;
  window.open = function (endereco, ...resto) {
    const alvo = String(endereco || '');
    const agora = Date.now();
    const repetido = alvo && alvo === ultimoAberto.endereco &&
                     agora - ultimoAberto.quando < JANELA_REPETIDO_MS;
    console.log(`[XM Macros] window.open${repetido ? ' (REPETIDO, ignorado)' : ''}:`, alvo);
    if (repetido) return null;
    ultimoAberto.endereco = alvo;
    ultimoAberto.quando = agora;

    let janela = null;
    try {
      janela = abrirOriginal.apply(this, [endereco, ...resto]);
    } catch (e) {
      janela = null;
    }
    if (!janela && endereco) {
      const deu = baixarEscondido(alvo);
      console.log('[XM Macros] pop-up bloqueado; baixando por dentro da página:', alvo);
      window.postMessage({ __xmMacroDownload: true, bloqueado: true, contornado: deu },
                         window.location.origin);
    }
    return janela;
  };

  avisar();
  console.log('[XM Macros] espiao de rede ligado');
})();
