// MACRO: PEDIDOS PESQUISADOS
//
// ESCOPO: so a tela Pedidos > Rastreio de pedidos do SPX.
//
// Pega na macro_at_exportada os codigos que ainda nao foram pesquisados, joga
// na Pesquisa em lote e exporta o resultado. O arquivo cai na pasta de
// downloads e o XM Vigia manda pra macro_pedidos_pesquisados, ligando cada
// pedido de volta a AT de onde ele veio.
//
// Faz, na ordem:
//   1. pede os codigos ao vigia (ele e quem tem o login do sistema)
//   2. abre a Pesquisa em lote
//   3. cola os codigos, um por linha, e clica em Enviar
//   4. Exportar > Exportar pedidos pesquisados
//   5. espera o relatorio ficar pronto no painel Ultima tarefa e baixa
//
// DE ONDE VEM OS CODIGOS: a extensao nao alcanca banco nem backend. Quem tem o
// login e o vigia, que roda na maquina. Ela pergunta a ele por 127.0.0.1 -
// mesmo arranjo do ColadorNeon, e o que evita uma segunda copia da senha.
//
// O pedido passa pelo service worker de proposito: pagina HTTPS falando com
// http://127.0.0.1 esbarra em bloqueio de rede privada do Chrome, e o erro que
// chega e um "failed to fetch" que nao conta nada. Do service worker, com
// permissao de host, o caminho e limpo.

(function (raiz) {
  'use strict';

  const G = (raiz.XMMacro = raiz.XMMacro || {});
  const L = G.logica;
  const S = G.spx;
  const P = G.painel;

  const TELA = '#/orderTracking';
  const TEXTO_LOTE = 'Pesquisa em lote';
  const TEXTO_EXPORTAR = 'Exportar';
  const TEXTO_EXPORTAR_PESQUISADOS = 'Exportar pedidos pesquisados';
  // O SPX aceita ate 10 mil por vez - esta escrito na propria caixa.
  const MAX_POR_VEZ = 10000;

  let rodando = false;

  // O botao da lupa e o que so existe nesta tela - e por ele que se sabe que
  // ela terminou de carregar, e nao pela URL.
  const achouATela = () => !!(S.acharBotao(TEXTO_LOTE) || S.folhaVisivelComTexto(TEXTO_LOTE));

  // ── 1. os codigos ──────────────────────────────────────────────────────
  async function pedirCodigos() {
    let resposta;
    try {
      resposta = await chrome.runtime.sendMessage({ xmMacro: 'pendentes', limite: MAX_POR_VEZ });
    } catch (e) {
      throw new Error('não consegui falar com a extensão — dê F5 na aba');
    }
    if (!resposta || !resposta.ok) {
      const motivo = (resposta && resposta.error) || 'sem resposta';
      throw new Error(`o XM Vigia não respondeu (${motivo}). Ele está aberto na bandeja?`);
    }
    const codigos = (resposta.codigos || []).filter(Boolean);
    if (!codigos.length) {
      throw new Error('não há pedido novo pra pesquisar — rode o macro da AT Exportada antes');
    }
    P.nota(`${codigos.length} códigos${resposta.total > codigos.length
      ? ` (de ${resposta.total} no total)` : ''}`);
    return codigos;
  }

  // ── 2 e 3. pesquisa em lote ────────────────────────────────────────────
  // A CAIXA SO PODE SER PROCURADA DENTRO DO DIALOGO.
  //
  // Procurar na pagina inteira ja colou os 1804 codigos no campo "Shop ID":
  // ele tambem e um textarea, estava visivel, e era o primeiro. O dialogo nem
  // chegou a abrir. Achar um campo nao quer dizer estar na tela certa - o
  // mesmo engano do popup que fica no DOM depois de fechado.
  const EH_DIALOGO = '[role="dialog"], [class*="modal"], [class*="dialog"], [class*="popup"]';
  const EH_CAMPO = 'textarea, input[type="text"]';
  const ehCampoDeRastreio = (c) => /rastreamento|tracking/i.test(c.placeholder || '');

  function acharDialogoDeLote() {
    const abertos = [...document.querySelectorAll(EH_DIALOGO)]
      .filter(S.visivel)
      .filter((d) => [...d.querySelectorAll(EH_CAMPO)].some(S.visivel));
    if (!abertos.length) return null;

    // O que se anuncia como a Pesquisa em lote, pelo titulo.
    const alvo = L.chave(TEXTO_LOTE);
    const porTitulo = abertos.find((d) => L.chave(d.textContent).includes(alvo));
    if (porTitulo) return porTitulo;

    // Ou o que tem o campo pedindo numero de rastreamento.
    return abertos.find((d) =>
      [...d.querySelectorAll(EH_CAMPO)].some(ehCampoDeRastreio)) || null;
  }

  function acharCaixaDeLote(dialogo) {
    if (!dialogo) return null;
    const campos = [...dialogo.querySelectorAll(EH_CAMPO)].filter(S.visivel);
    return campos.find(ehCampoDeRastreio) || campos.find((c) => c.tagName === 'TEXTAREA') ||
           campos[0] || null;
  }

  async function abrirPesquisaEmLote() {
    let dialogo = acharDialogoDeLote();
    if (!dialogo) {
      const botao = S.acharBotao(TEXTO_LOTE) || S.folhaVisivelComTexto(TEXTO_LOTE);
      if (!botao) throw new Error(`não achei o botão "${TEXTO_LOTE}" (o da lupa)`);
      S.clicar(botao);
      await S.dormir(900);
      dialogo = await S.esperar(acharDialogoDeLote, {
        oque: 'a janela da Pesquisa em lote abrir', limite: 15000 });
    }
    const caixa = acharCaixaDeLote(dialogo);
    if (!caixa) {
      throw new Error('a janela da Pesquisa em lote abriu mas não achei a caixa de texto dela');
    }
    return { dialogo, caixa };
  }

  async function colarEEnviar(codigos) {
    const { dialogo, caixa } = await abrirPesquisaEmLote();
    // Uma por linha: e o que a propria caixa pede.
    S.escrever(caixa, codigos.join('\n'));
    await S.dormir(400);

    const colados = String(caixa.value || '').split('\n').filter(Boolean).length;
    if (colados !== codigos.length) {
      throw new Error(`a caixa ficou com ${colados} códigos em vez de ${codigos.length}`);
    }

    // Preso ao dialogo: "Enviar" solto na tela seria de outra caixa qualquer.
    const enviar = S.acharBotao('Enviar', { dentro: dialogo }) ||
                   S.acharBotao('Submit', { dentro: dialogo });
    if (!enviar) throw new Error('não achei o botão "Enviar" da Pesquisa em lote');

    const base = S.rede.ativas;
    S.clicar(enviar);
    await S.dormir(900);
    await S.esperarRede({ base, limite: 180000 });

    // Esperar a REDE acalmar nao basta: com milhares de codigos a tela ainda
    // esta montando a lista quando as chamadas param, e exportar no meio disso
    // nao exporta nada. O rodape "Esperado N" so aparece com o resultado
    // pronto - e o N tem que ser o que foi mandado.
    const quantos = await S.esperar(() => {
      const achado = G.painelDeTarefas.folhaComRegex(/esperado\s+([\d.,]+)/i);
      if (!achado) return null;
      return Number(achado.m[1].replace(/[.,]/g, '')) || null;
    }, { oque: 'a busca terminar ("Esperado N" no rodapé)', limite: 180000, intervalo: 700 });

    if (quantos !== codigos.length) {
      P.nota(`atenção: a tela diz ${quantos}, mandei ${codigos.length}`);
    }
    P.nota(`busca pronta: ${quantos} pedidos`);
    await S.dormir(800);
  }

  // ── 4. exportar ────────────────────────────────────────────────────────
  function acharItemExportar() {
    const exato = S.acharBotao(TEXTO_EXPORTAR_PESQUISADOS) ||
                  S.folhaVisivelComTexto(TEXTO_EXPORTAR_PESQUISADOS);
    if (exato) return exato;

    // Com teto de tamanho, pelo mesmo motivo do outro menu: o container do
    // dropdown "contem" o texto de todos os itens juntos, e clicar nele nao
    // faz nada.
    const alvo = L.chave(TEXTO_EXPORTAR_PESQUISADOS);
    const teto = TEXTO_EXPORTAR_PESQUISADOS.length + 10;
    const achados = [];
    for (const el of document.querySelectorAll('*')) {
      const texto = L.normalizar(el.textContent);
      if (texto.length > teto || !L.chave(texto).includes(alvo)) continue;
      if (!S.visivel(el)) continue;
      achados.push({ el, tamanho: texto.length });
    }
    achados.sort((a, b) => a.tamanho - b.tamanho);
    return achados.length ? achados[0].el : null;
  }

  async function abrirMenuExportar() {
    const abre = S.acharBotao(TEXTO_EXPORTAR) ||
                 S.acharBotao(TEXTO_EXPORTAR, { comeca: true });
    if (!abre) throw new Error(`não achei o botão "${TEXTO_EXPORTAR}"`);

    // Hover ANTES do clique: esta tela usa outro design system (ssc-dropdown,
    // nao ssc-react), e dropdown desse tipo abre ao passar o mouse. Com clique
    // sozinho o menu nunca aparecia e o macro concluia que o item nao existe.
    for (const tentar of [() => S.passarMouse(abre), () => S.clicar(abre)]) {
      tentar();
      const item = await S.esperar(acharItemExportar, {
        oque: 'o menu Exportar abrir', limite: 4000, intervalo: 250,
      }).catch(() => null);
      if (item) return item;
    }
    return null;
  }

  // CLICA UMA VEZ SO.
  //
  // A primeira versao conferia se o menu fechava depois do clique, e tentava de
  // novo quando nao fechava. Este menu NAO fecha ao clicar no item: o clique
  // funcionou, o relatorio foi pedido, e o macro pediu outros dois por achar
  // que tinha falhado.
  //
  // Nao existe sinal de sucesso nesta tela - o sinal e a tarefa aparecer no
  // painel "Ultima tarefa", e quem confere isso e o passo seguinte, que
  // desiste em 90s se nada nascer. Inventar um sinal proximo saiu caro.
  async function exportarPesquisados() {
    let item = acharItemExportar();
    if (!item) item = await abrirMenuExportar();
    if (!item) {
      throw new Error(`não achei "${TEXTO_EXPORTAR_PESQUISADOS}" no menu Exportar`);
    }

    const base = S.rede.ativas;
    // Passar o mouse antes: em menu que abre por hover, o item so fica ativo
    // quando o ponteiro chega nele.
    S.passarMouse(item);
    await S.dormir(250);
    S.clicarNoPonto(item);
    await S.dormir(900);
    await S.esperarRede({ base, limite: 60000 });

    // Fecha o menu pra ele nao ficar por cima do painel de tarefas.
    S.apertarEsc();
    await S.dormir(300);
  }

  /**
   * Pede a exportacao ate uma tarefa NASCER no painel.
   *
   * O clique nesse menu e intermitente - numa rodada pegou de primeira, na
   * seguinte nao pegou nenhuma vez. E nao ha nada na tela que diga se pegou: o
   * menu nao fecha, nenhum aviso aparece.
   *
   * Entao a confirmacao e o resultado de verdade: uma tarefa nova no painel
   * "Ultima tarefa". Repetir so depois de olhar la evita as duas coisas que ja
   * aconteceram - pedir tres vezes achando que falhou, e nao pedir nenhuma
   * achando que deu certo.
   */
  async function pedirExportacao(antes) {
    const T = G.painelDeTarefas;
    for (const tentativa of [1, 2, 3]) {
      await exportarPesquisados();
      if (tentativa > 1) P.nota(`pedindo de novo (${tentativa}ª vez)`);

      await S.dormir(4000);
      const agora = await T.lerTarefasAgora();
      const nova = L.escolherTarefaNova(antes, agora, L.NOME_PESQUISADOS);
      await T.fecharPainelTarefas();

      if (nova) {
        P.nota(`pedido aceito: ${nova.nome} — ${nova.quando}`);
        return nova;
      }
      P.nota('o clique não pegou — nenhuma tarefa nasceu');
    }
    throw new Error('pedi a exportação 3 vezes e nenhuma tarefa nasceu no painel');
  }

  // ── o macro ────────────────────────────────────────────────────────────
  async function rodar() {
    if (rodando) { P.nota('já está rodando'); return; }
    rodando = true;
    S.parar = false;
    P.abrir('Pedidos Pesquisados', () => { S.parar = true; });

    const T = G.painelDeTarefas;

    try {
      P.passo('abrindo Pedidos › Rastreio de pedidos');
      const mudou = await S.irParaTela(TELA, achouATela, 'Rastreio de pedidos');
      P.nota(mudou ? 'tela aberta' : 'já estava nela');

      P.passo('1/5 · pedindo os códigos ao vigia');
      const codigos = await pedirCodigos();

      P.passo('2/5 · Pesquisa em lote');
      await colarEEnviar(codigos);

      P.passo('3/5 · lendo o painel antes de exportar');
      const antes = await T.lerTarefasAgora();
      await T.fecharPainelTarefas();

      P.passo('4/5 · Exportar pedidos pesquisados');
      await pedirExportacao(antes);

      P.passo('5/5 · esperando o relatório ficar pronto');
      // Pelo NOME, e nao "qualquer tarefa nova".
      //
      // Enquanto o nome nao se conhecia, este macro aceitava qualquer tarefa
      // que nao estivesse la antes - e com os dois macros rodando juntos, a
      // tarefa nova era a do outro: ele baixava o Br Assignment Task achando
      // que era o dele.
      const alvo = await T.esperarRelatorio(antes, L.NOME_PESQUISADOS);
      await T.baixar(alvo);

      P.ok(`baixado: ${alvo.nome} — ${alvo.quando}`);
    } catch (e) {
      if (e instanceof S.Parado) P.erro('parado por você');
      else P.erro(e.message || String(e));
    } finally {
      rodando = false;
      S.parar = false;
    }
  }

  G.pedidos = { rodar, pedirCodigos, acharDialogoDeLote, acharCaixaDeLote, acharItemExportar,
                TEXTO_LOTE, TEXTO_EXPORTAR, TEXTO_EXPORTAR_PESQUISADOS };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
      if (msg && msg.xmMacro === 'pedidos') {
        if (rodando) responder({ ok: false, error: 'os Pedidos Pesquisados já estão rodando' });
        else { rodar(); responder({ ok: true }); }
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
