// Tela da XM - Agrupamento Loggi no Arco, com a cara do proprio Arco (sem marca XM na tela).
//
// Ao clicar em "Agrupar" (em qualquer tela do Arco) abre a gaveta "Conferência", no mesmo jeito do
// "Criar círculo" da Loggi: UM circulo ou as cidades marcadas (comeca vazio; "Limpar" desfaz).
// No canto fica uma pilula com o que esta valendo e a contagem; clicar nela reabre a gaveta.
// Cada bipe de fora: faixa vermelha + som. No "Continuar" com pacote de fora ainda na lista, o
// clique nao chega a Loggi e uma janela diz quais tirar.
// A configuracao fica no chrome.storage.local, uma por base (ex.: "base:CCR").
// Estilo copiado do Arco (jss do filtro Cidades e do Criar circulo): Open Sans, #00BAFF, #2E3545,
// subtitulo #BEC7D6, item marcado #F3FCFF com barra #079BD3, divisoria #F5F8FA.

(() => {
  const NOME = 'XM - Agrupamento Loggi';
  const MARGEM = 8;
  const VALIDADE_MS = 6 * 60 * 60 * 1000; // lista da Loggi guardada vale 6 h; depois busca de novo
  const TARJA_MS = 2500;
  const PEDIDO_MS = 20000; // "Agrupar" que abriu outra aba/recarregou: a gaveta abre na tela nova em ate 20 s

  function limitar(valor, maximo) {
    return Math.min(Math.max(MARGEM, valor), Math.max(MARGEM, maximo));
  }

  if (typeof module !== 'undefined') {
    module.exports = { limitar, VALIDADE_MS, PEDIDO_MS };
    return;
  }

  const R = self.XMAgrupamento;
  const CANAL = 'xmAgrup';
  // Icones do Material (os mesmos do Arco).
  const ICONE = {
    caixa: '<path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>',
    caixaMarcada: '<path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>',
    radio: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>',
    radioMarcado: '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>',
    fechar: '<path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
    busca: '<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>',
    lista: '<path d="M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11 2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 19z"/>',
    aviso: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
  };
  const svg = (nome, classe = '') => `<svg class="ico ${classe}" viewBox="0 0 24 24" aria-hidden="true">${ICONE[nome]}</svg>`;

  const hospedeiro = document.createElement('div');
  const sombra = hospedeiro.attachShadow({ mode: 'closed' });
  sombra.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .raiz { --azul: #00baff; --azul-escuro: #079bd3; --texto: #2e3545; --cinza: #757d8c; --sub: #bec7d6; --divisa: #f5f8fa;
        --marcado: #f3fcff; --borda-marcado: #ccf1ff; --erro: #d32f2f; --verde: #43a047;
        font: 400 14px/1.5 'Open Sans', sans-serif; color: var(--texto); -webkit-font-smoothing: antialiased; }
      button { font: inherit; cursor: pointer; }
      .ico { width: 24px; height: 24px; flex: none; fill: currentColor; }

      /* pilula do canto: o que esta valendo (estilo dos botoes brancos do Arco) */
      .canto { position: fixed; z-index: 2147483645; }
      .pilula-canto { display: flex; align-items: center; gap: 10px; max-width: 420px; padding: 10px 20px 10px 14px; color: var(--texto);
        background: #fff; border: 1px solid var(--azul); border-radius: 24px; box-shadow: 0 5px 8px 0 rgba(139, 159, 183, .2);
        font-weight: 600; cursor: grab; touch-action: none; user-select: none; }
      .pilula-canto:hover { background: var(--marcado); }
      .pilula-canto .ico { color: var(--azul); width: 22px; height: 22px; }
      .pilula-canto .qual { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pilula-canto .nada { color: var(--azul); }
      .pilula-canto .conta { white-space: nowrap; font-weight: 400; color: var(--cinza); }
      .pilula-canto .conta b { font-weight: 700; }
      .pilula-canto .ok b { color: var(--verde); }
      .pilula-canto .fora b { color: var(--erro); }

      /* gaveta (igual a do "Criar círculo") */
      .cortina { position: fixed; inset: 0; z-index: 2147483646; background: rgba(0, 0, 0, .5); opacity: 0; pointer-events: none; transition: opacity 225ms cubic-bezier(.4, 0, .2, 1); }
      .gaveta { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483646; width: min(480px, 100vw); display: flex; flex-direction: column;
        background: #fff; box-shadow: 0 8px 10px -5px rgba(0,0,0,.2), 0 16px 24px 2px rgba(0,0,0,.14), 0 6px 30px 5px rgba(0,0,0,.12);
        transform: translateX(100%); visibility: hidden; transition: transform 225ms cubic-bezier(0, 0, .2, 1), visibility 0s linear 225ms; }
      .aberta .cortina { opacity: 1; pointer-events: auto; }
      .aberta .gaveta { transform: none; visibility: visible; transition: transform 225ms cubic-bezier(0, 0, .2, 1); }
      .aberta ~ .canto, .aberta + .canto { display: none; }
      .gaveta-corpo { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 24px 28px 8px; }
      .fechar { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; padding: 0; color: var(--azul);
        background: #fff; border: 1px solid var(--azul); border-radius: 50%; }
      .fechar:hover { background: rgba(0, 186, 255, .04); }
      .fechar .ico { width: 20px; height: 20px; }
      .sobre { margin: 40px 0 4px; color: var(--cinza); font-size: 14px; }
      .titulo { margin: 0 0 12px; font: 700 32px/1.2 Montserrat, 'Open Sans', sans-serif; color: var(--texto); }
      .texto { margin: 0 0 20px; font-size: 16px; color: var(--texto); }
      .estado { display: flex; gap: 12px; align-items: flex-start; padding: 10px 16px; margin-bottom: 24px; border-radius: 8px; font-size: 14px; }
      .estado .ico { width: 22px; height: 22px; margin-top: 1px; }
      .estado strong { display: block; font-weight: 600; }
      .estado.vazio { background: #fff4e5; color: #663c00; }
      .estado.vazio .ico { color: #ff9800; }
      .estado.ok { background: var(--marcado); color: var(--texto); border: 1px solid var(--borda-marcado); }
      .estado.ok .ico { color: var(--azul); }
      .linha { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
      /* alternar como o "Pacotes | Grupos" do Arco */
      .alternar { display: inline-flex; padding: 2px; background: var(--azul); border: thin solid var(--azul); border-radius: 800px; }
      .alternar button { padding: 8px 24px; color: #fff; background: transparent; border: 0; border-radius: 24px; font-weight: 600; letter-spacing: .02857em; }
      .alternar button.ativo { color: var(--azul); background: #fff; }
      .atualizar { padding: 6px 8px; color: var(--azul); background: none; border: 0; border-radius: 4px; font-weight: 600; white-space: nowrap; }
      .atualizar:hover { background: rgba(0, 186, 255, .04); }
      /* campo com rotulo na borda (MUI outlined) */
      .campo { position: relative; margin: 8px 0 8px; }
      .campo label { position: absolute; left: 12px; top: -9px; padding: 0 4px; background: #fff; color: var(--cinza); font-size: 12px; line-height: 18px; }
      .campo input { width: 100%; height: 56px; padding: 16px 14px 16px 48px; color: var(--texto); background: #fff; border: 1px solid rgba(0,0,0,.23);
        border-radius: 4px; font: inherit; font-size: 16px; outline: none; }
      .campo input:hover { border-color: var(--texto); }
      .campo input:focus { border: 2px solid var(--azul); padding-left: 47px; }
      .campo:focus-within label { color: var(--azul); }
      .campo .ico { position: absolute; left: 14px; top: 16px; color: var(--cinza); }
      .subtitulo { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; color: var(--sub); font-size: .75rem; font-weight: 700; line-height: 1; text-transform: uppercase; }
      .lista { margin: 0 -28px; padding: 0; list-style: none; }
      .lista li { display: flex; align-items: center; gap: 16px; min-height: 48px; padding: 8px 28px; border-bottom: 1px solid var(--divisa); cursor: pointer; }
      .lista li:last-child { border-bottom-width: 0; }
      .lista li:hover { background: rgba(0, 0, 0, .04); }
      .lista li.sel { padding-left: 25px; background: var(--marcado); border-left: 3px solid var(--azul-escuro); border-bottom-color: var(--borda-marcado); }
      .lista li .ico { color: rgba(0, 0, 0, .6); }
      .lista li.sel .ico { color: var(--azul); }
      .lista .nome { flex: 1; min-width: 0; font-size: .875rem; }
      .lista .nome small { display: block; color: var(--cinza); font-size: .75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .lista .tirar { padding: 4px 8px; color: var(--erro); background: none; border: 0; border-radius: 4px; font-size: .8125rem; font-weight: 600; }
      .lista .tirar:hover { background: rgba(211, 47, 47, .04); }
      .lista .vazia { color: var(--cinza); cursor: default; }
      .lista .vazia:hover { background: none; }
      .adicionar { display: flex; gap: 12px; align-items: center; }
      .adicionar .campo { flex: 1; margin: 8px 0; }
      .adicionar .campo input { height: 48px; padding-left: 14px; font-size: 14px; }
      .adicionar .campo input:focus { padding-left: 13px; }
      .contorno { padding: 5px 15px; color: var(--azul); background: #fff; border: 1px solid var(--azul); border-radius: 24px; font-weight: 600; white-space: nowrap; }
      .contorno:hover { background: rgba(0, 186, 255, .04); }
      .sugestoes { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px; }
      .sugestoes:empty { display: none; }
      .sugestoes button { padding: 4px 12px; color: var(--azul); background: var(--marcado); border: 1px solid var(--borda-marcado); border-radius: 100px; font-size: .8125rem; }
      .recado { min-height: 20px; margin: 4px 0 12px; color: var(--cinza); font-size: .8125rem; }
      .recado.erro { color: var(--erro); }
      .rodape { display: grid; grid-template-columns: 1fr 3fr; gap: 16px; padding: 20px 28px; border-top: 1px solid var(--divisa); box-shadow: 0 -2px 5px rgba(46, 53, 69, .1); }
      .rodape .limpar { padding: 6px 8px; color: var(--texto); background: none; border: 0; border-radius: 4px; font-weight: 600; }
      .rodape .limpar:hover { background: rgba(0, 0, 0, .04); }
      .rodape .aplicar { padding: 8px 22px; color: var(--azul); background: #fff; border: 1px solid var(--azul); border-radius: 24px; font-weight: 600; }
      .rodape .aplicar:hover { background: rgba(0, 186, 255, .04); }

      /* alerta do bipe (faixa no alto) e janela do "Continuar" */
      .tarja { display: flex; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; gap: 16px; align-items: center; padding: 18px 28px;
        color: #fff; background: var(--erro); font: 400 18px 'Open Sans', sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.3);
        opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .5s ease, visibility 0s linear .5s; }
      .tarja.ver { opacity: 1; visibility: visible; pointer-events: auto; transition: none; }
      .tarja .ico { width: 36px; height: 36px; }
      .tarja div { flex: 1; }
      .tarja strong { display: block; font: 700 24px Montserrat, 'Open Sans', sans-serif; }
      .tarja button { padding: 6px 8px; color: #fff; background: none; border: 0; font-weight: 600; text-decoration: underline; }
      .fundo { display: none; position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, .5); align-items: center; justify-content: center; }
      .fundo.ver { display: flex; }
      .card { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; background: #fff; border-radius: 12px;
        border-top: 6px solid var(--erro); box-shadow: 0 11px 15px -7px rgba(0,0,0,.2), 0 24px 38px 3px rgba(0,0,0,.14); padding: 28px; }
      .card h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; font: 700 24px/1.25 Montserrat, 'Open Sans', sans-serif; color: var(--erro); }
      .card p { margin: 0 0 16px; font-size: 16px; }
      .card ul { margin: 0 0 20px; padding: 0; list-style: none; border: 1px solid var(--divisa); border-radius: 8px; }
      .card li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--divisa); font-weight: 600; }
      .card li:last-child { border-bottom: 0; }
      .card li span:first-child { font-family: ui-monospace, Consolas, monospace; }
      .card li span:last-child { color: var(--erro); }
      .card .acoes { display: flex; justify-content: flex-end; }
    </style>
    <div class="raiz">
      <div class="fundo" role="alertdialog" aria-modal="true">
        <div class="card">
          <h2>${svg('aviso')}Tem pacote de fora neste grupo</h2>
          <p class="explica"></p>
          <ul></ul>
          <div class="acoes"><button type="button" class="contorno entendi">Entendi, vou tirar</button></div>
        </div>
      </div>
      <div class="tarja" role="alert">
        ${svg('aviso')}
        <div><strong>Grupo errado</strong><span class="texto-tarja"></span></div>
        <button type="button">Fechar</button>
      </div>

      <div class="gaveta-envolve">
        <div class="cortina"></div>
        <aside class="gaveta" role="dialog" aria-modal="true" aria-label="Conferência do agrupamento">
          <div class="gaveta-corpo">
            <button type="button" class="fechar" title="Fechar" aria-label="Fechar">${svg('fechar')}</button>
            <div class="sobre">Agrupar</div>
            <h2 class="titulo">Conferência</h2>
            <p class="texto">Escolha o círculo ou as cidades deste grupo. Pacote de outra cidade é avisado na hora do bipe e não deixa continuar.</p>
            <div class="estado"></div>
            <div class="linha">
              <div class="alternar" role="group">
                <button type="button" data-modo="circulos">Círculo</button>
                <button type="button" data-modo="cidades">Cidades</button>
              </div>
              <button type="button" class="atualizar">Atualizar</button>
            </div>
            <div class="campo">
              <label class="rotulo-busca">Buscar círculo</label>
              ${svg('busca')}
              <input type="text" class="filtro" autocomplete="off">
            </div>
            <div class="subtitulo"><span class="titulo-lista"></span></div>
            <ul class="lista"></ul>
            <div class="bloco-adicionar">
              <div class="subtitulo"><span class="titulo-adicionar">Adicionar cidade</span></div>
              <form class="adicionar">
                <div class="campo"><input type="text" class="nova" placeholder="Cidade que não está na lista" autocomplete="off"></div>
                <button type="submit" class="contorno">Adicionar</button>
              </form>
              <div class="sugestoes"></div>
            </div>
            <div class="recado"></div>
          </div>
          <footer class="rodape">
            <button type="button" class="limpar">Limpar</button>
            <button type="button" class="aplicar">Aplicar</button>
          </footer>
        </aside>
      </div>

      <div class="canto">
        <button type="button" class="pilula-canto" title="Conferência do agrupamento"></button>
      </div>
    </div>`;

  const $ = (s) => sombra.querySelector(s);
  const canto = $('.canto');
  const pilula = $('.pilula-canto');
  const envolve = $('.gaveta-envolve');
  const tarja = $('.tarja');
  const fundo = $('.fundo');
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  const el = (tag, classe, texto) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; };
  const icone = (nome) => { const t = document.createElement('template'); t.innerHTML = svg(nome); return t.content.firstChild; };

  // ── estado ────────────────────────────────────────────────────────────────
  let codigoBase = (location.pathname.split('/').filter(Boolean)[0] || '').toUpperCase();
  let cfg = R.cfgVazia();
  let cidadesLoggi = [];
  let circulos = [];
  let alvo = R.montarAlvo(cfg, [], []);
  let modo = 'circulos';
  const bipes = new Map(); // codigo -> cidade, desde que a pagina abriu
  let certos = 0;
  let deFora = 0;
  let posicao = { direita: 24, baixo: 24 };

  const chaveDaBase = () => `base:${codigoBase || 'sem-base'}`;
  async function guardar() {
    await chrome.storage.local.set({ [chaveDaBase()]: { ...cfg, cache: { cidades: cidadesLoggi, circulos, em: Date.now() } } });
  }

  function recado(texto, erro = false) {
    $('.recado').textContent = texto || '';
    $('.recado').classList.toggle('erro', !!erro);
  }

  function mudar(novo) {
    cfg = novo;
    guardar();
    desenhar();
  }

  // ── desenhar ──────────────────────────────────────────────────────────────
  function desenharEstado() {
    const caixa = $('.estado');
    caixa.className = `estado ${alvo.tipo === 'nada' ? 'vazio' : 'ok'}`;
    const txt = el('div');
    if (alvo.tipo === 'nada') {
      txt.append(el('strong', '', 'Nada escolhido'), 'Os bipes não estão sendo conferidos.');
      caixa.replaceChildren(icone('aviso'), txt);
    } else {
      const nomes = alvo.cidades.map((c) => c.nome);
      txt.append(el('strong', '', `Conferindo: ${alvo.rotulo}`), `${nomes.slice(0, 8).join(', ')}${nomes.length > 8 ? ` e mais ${nomes.length - 8}` : ''}`);
      caixa.replaceChildren(icone('lista'), txt);
    }
  }

  function itemLista({ marcado, unico, nome, detalhe, aoClicar, tirar }) {
    const li = el('li');
    if (marcado) li.classList.add('sel');
    li.setAttribute('role', unico ? 'radio' : 'checkbox');
    li.setAttribute('aria-checked', marcado ? 'true' : 'false');
    li.append(icone(unico ? (marcado ? 'radioMarcado' : 'radio') : (marcado ? 'caixaMarcada' : 'caixa')));
    const n = el('span', 'nome', nome);
    if (detalhe) n.append(el('small', '', detalhe));
    li.append(n);
    if (tirar) {
      const b = el('button', 'tirar', 'Tirar');
      b.type = 'button';
      b.addEventListener('click', (e) => { e.stopPropagation(); tirar(); });
      li.append(b);
    }
    li.addEventListener('click', aoClicar);
    return li;
  }

  function desenharLista() {
    const busca = $('.filtro').value;
    sombra.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('ativo', b.dataset.modo === modo));
    $('.rotulo-busca').textContent = modo === 'circulos' ? 'Buscar círculo' : 'Buscar cidade';
    let itens;
    if (modo === 'circulos') {
      $('.titulo-lista').textContent = 'Escolha um círculo';
      itens = R.filtrar(R.ordenarCirculos(circulos), busca).map((c) => itemLista({
        unico: true,
        marcado: alvo.tipo === 'circulo' && alvo.id === c.id,
        nome: c.nome,
        detalhe: R.listaDoCirculo(c, cidadesLoggi, cfg).map((x) => x.nome).join(', '),
        aoClicar: () => mudar(R.escolherCirculo(cfg, c.id)),
      }));
      if (!circulos.length) itens = [el('li', 'vazia', 'Nenhum círculo nesta base. Use "Cidades".')];
    } else {
      $('.titulo-lista').textContent = 'Escolha uma ou mais cidades';
      const marcadas = new Set(alvo.tipo === 'cidades' ? alvo.chaves : []);
      itens = R.filtrar(R.listaDaBase(cidadesLoggi, cfg), busca).map((c) => itemLista({
        marcado: marcadas.has(c.chave),
        nome: c.nome,
        detalhe: c.origem === 'adicionada' ? 'Adicionada por você' : '',
        aoClicar: () => mudar(R.alternarCidade(cfg, c.chave)),
        tirar: c.origem === 'adicionada' ? () => mudar(R.tirarAdicionada(cfg, c.chave, cidadesLoggi, circulos)) : null,
      }));
      if (!cidadesLoggi.length && !itens.length) itens = [el('li', 'vazia', 'Carregando as cidades da base...')];
    }
    if (!itens.length) itens = [el('li', 'vazia', 'Nada com esse nome.')];
    $('.lista').replaceChildren(...itens);

    // Adicionar: no circulo escolhido, ou na lista de cidades (ja marcada).
    const noCirculo = alvo.tipo === 'circulo';
    $('.bloco-adicionar').hidden = modo === 'circulos' && !noCirculo;
    $('.titulo-adicionar').textContent = noCirculo ? `Adicionar cidade no círculo ${alvo.nome}` : 'Adicionar cidade';
    $('.sugestoes').replaceChildren(...R.sugestoes(bipes, alvo).map((cidade) => {
      const b = el('button', '', `+ ${cidade}`);
      b.type = 'button';
      b.title = 'Bipada aqui e de fora. Clique para adicionar.';
      b.addEventListener('click', () => adicionar(cidade));
      return b;
    }));
  }

  function desenharPilula() {
    pilula.replaceChildren(icone('lista'));
    if (alvo.tipo === 'nada') {
      pilula.append(el('span', 'qual nada', 'Escolher círculo ou cidades'));
    } else {
      pilula.append(el('span', 'qual', alvo.rotulo));
      const ok = el('span', 'conta ok');
      ok.append(el('b', '', numero(certos)), ' certos');
      const fora = el('span', 'conta fora');
      fora.append(el('b', '', numero(deFora)), ' de fora');
      pilula.append(ok, fora);
    }
    aplicarPosicao();
  }

  function desenhar() {
    alvo = R.montarAlvo(cfg, cidadesLoggi, circulos);
    desenharEstado();
    desenharLista();
    desenharPilula();
  }

  function adicionar(nome) {
    const r = R.adicionarCidade(cfg, nome, cidadesLoggi, circulos);
    if (r.erro) return recado(r.erro, true);
    $('.nova').value = '';
    recado(`${String(nome).trim()} adicionada.`);
    if (r.cfg.escolha && r.cfg.escolha.tipo === 'cidades') modo = 'cidades';
    mudar(r.cfg);
  }

  // ── gaveta ────────────────────────────────────────────────────────────────
  function abrirGaveta() {
    if (!chrome.runtime || !chrome.runtime.id) {
      window.alert(`A extensão ${NOME} foi atualizada. Aperte F5 nesta página.`);
      return;
    }
    chrome.storage.local.remove('pedirEscolha');
    modo = alvo.tipo === 'cidades' || !circulos.length ? 'cidades' : 'circulos';
    $('.filtro').value = '';
    recado('');
    desenhar();
    envolve.classList.add('aberta');
    setTimeout(() => $('.filtro').focus(), 250);
  }
  const fecharGaveta = () => envolve.classList.remove('aberta');

  // "Agrupar" em qualquer tela do Arco. O clique segue para a Loggi. Se abriu outra aba, a gaveta
  // abre nela (pedirEscolha); se ficou nesta, abre aqui. Ja bipando nesta tela, nao abre de novo.
  window.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, a, [role="button"]');
    if (!b || e.composedPath().includes(hospedeiro) || !R.ehAgrupar(b.textContent) || bipes.size) return;
    chrome.storage.local.set({ pedirEscolha: Date.now() });
    setTimeout(() => { if (!document.hidden) abrirGaveta(); }, 700);
  }, true);

  // ── buscar na Loggi (pelo loggi.js, com a sessao da propria pagina) ─────────
  function pedirALoggi(tipo) {
    return new Promise((ok, nao) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const ouvir = (e) => {
        if (e.source !== window || !e.data || e.data[CANAL] !== 'resposta' || e.data.id !== id) return;
        window.removeEventListener('message', ouvir);
        clearTimeout(limite);
        if (e.data.erro) nao(new Error(e.data.erro)); else ok(e.data);
      };
      const limite = setTimeout(() => { window.removeEventListener('message', ouvir); nao(new Error('A Loggi demorou para responder. Tente de novo.')); }, 30000);
      window.addEventListener('message', ouvir);
      window.postMessage({ [CANAL]: 'pedir', id, tipo }, location.origin);
    });
  }

  let buscando = false;
  async function atualizarDaLoggi() {
    if (buscando) return;
    buscando = true;
    recado('Buscando os círculos e as cidades da base...');
    try {
      const c = await pedirALoggi('cidades');
      if (c.base && c.base.codigo && c.base.codigo !== codigoBase) { codigoBase = c.base.codigo; await carregarCfg(false); }
      cidadesLoggi = c.cidades;
      let erro = '';
      try { circulos = (await pedirALoggi('circulos')).circulos; } catch (e) { erro = `As cidades vieram, mas os círculos não: ${e.message}`; }
      await guardar();
      recado(erro, !!erro);
    } catch (e) {
      recado(cidadesLoggi.length ? `Usando a lista guardada. ${e.message}` : e.message, true);
    } finally {
      buscando = false;
      desenhar();
    }
  }

  async function carregarCfg(buscarSeVelho = true) {
    const salvo = (await chrome.storage.local.get(chaveDaBase()))[chaveDaBase()];
    cfg = R.normalizarCfg(salvo);
    const cache = salvo && salvo.cache;
    cidadesLoggi = (cache && cache.cidades) || [];
    circulos = (cache && cache.circulos) || [];
    desenhar();
    if (buscarSeVelho && (!cache || Date.now() - cache.em > VALIDADE_MS || !cidadesLoggi.length)) atualizarDaLoggi();
  }

  // ── alerta ────────────────────────────────────────────────────────────────
  let audio = null;
  function tocarErro() {
    try {
      audio = audio || new AudioContext();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime;
      for (let i = 0; i < 3; i += 1) {
        const osc = audio.createOscillator();
        const vol = audio.createGain();
        osc.type = 'square';
        osc.frequency.value = 330;
        vol.gain.setValueAtTime(0.25, t0 + i * 0.22);
        vol.gain.setValueAtTime(0, t0 + i * 0.22 + 0.16);
        osc.connect(vol).connect(audio.destination);
        osc.start(t0 + i * 0.22);
        osc.stop(t0 + i * 0.22 + 0.17);
      }
    } catch { /* sem audio, a faixa ainda aparece */ }
  }

  let sumirTarja = null;
  function mostrarTarja(codigo, cidade) {
    tarja.querySelector('.texto-tarja').textContent = `${codigo} é de ${cidade}: ${alvo.fora}`;
    tarja.classList.add('ver');
    clearTimeout(sumirTarja);
    sumirTarja = setTimeout(() => tarja.classList.remove('ver'), TARJA_MS);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data[CANAL] !== 'bipe' || !Array.isArray(e.data.itens)) return;
    let errado = null;
    let algumCerto = false;
    for (const i of e.data.itens) {
      const codigo = String(i.codigo);
      const cidade = R.consertarTexto(String(i.cidade)); // "CaÃ§ador" aparece como "Caçador"
      const novo = !bipes.has(codigo);
      bipes.set(codigo, cidade);
      const { ok } = R.conferirBipe(cidade, alvo);
      if (ok === false) { errado = errado || { codigo, cidade }; if (novo) deFora += 1; }
      if (ok === true) { algumCerto = true; if (novo) certos += 1; }
    }
    if (errado) { mostrarTarja(errado.codigo, errado.cidade); tocarErro(); } else if (algumCerto) tarja.classList.remove('ver');
    desenhar();
  });

  // ── trava do "Continuar" ──────────────────────────────────────────────────
  function mostrarPendentes(errados) {
    const onde = alvo.fora.replace(/^não é de/, 'fora de');
    fundo.querySelector('.explica').textContent = errados.length === 1
      ? `Este pacote está ${onde}. Tire ele do grupo para continuar.`
      : `Estes ${errados.length} pacotes estão ${onde}. Tire eles do grupo para continuar.`;
    fundo.querySelector('ul').replaceChildren(...errados.map((x) => {
      const li = el('li');
      li.append(el('span', '', x.codigo), el('span', '', x.cidade));
      return li;
    }));
    fundo.classList.add('ver');
    tocarErro();
  }

  // Fase de captura no window: o clique para aqui antes do React do Arco.
  window.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b.textContent.replace(/\s+/g, ' ').trim().toLowerCase() !== 'continuar') return;
    const errados = R.pendentes(bipes, document.body.innerText, alvo);
    if (!errados.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    mostrarPendentes(errados);
  }, true);
  $('.entendi').addEventListener('click', () => fundo.classList.remove('ver'));
  tarja.querySelector('button').addEventListener('click', () => tarja.classList.remove('ver'));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (fundo.classList.contains('ver')) fundo.classList.remove('ver'); else if (envolve.classList.contains('aberta')) fecharGaveta();
  }, true);

  // ── canto: posicao e arrastar ─────────────────────────────────────────────
  function aplicarPosicao() {
    const r = canto.getBoundingClientRect();
    posicao.direita = limitar(posicao.direita, window.innerWidth - r.width - MARGEM);
    posicao.baixo = limitar(posicao.baixo, window.innerHeight - r.height - MARGEM);
    canto.style.right = `${posicao.direita}px`;
    canto.style.bottom = `${posicao.baixo}px`;
  }

  function arrastar(elemento, aoClicar) {
    let inicio = null;
    let moveu = false;
    elemento.addEventListener('pointerdown', (e) => {
      inicio = { x: e.clientX, y: e.clientY, direita: posicao.direita, baixo: posicao.baixo };
      moveu = false;
      elemento.setPointerCapture(e.pointerId);
    });
    elemento.addEventListener('pointermove', (e) => {
      if (!inicio) return;
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      if (!moveu && Math.hypot(dx, dy) < 4) return;
      moveu = true;
      posicao.direita = inicio.direita - dx;
      posicao.baixo = inicio.baixo - dy;
      aplicarPosicao();
    });
    elemento.addEventListener('pointerup', () => {
      if (!inicio) return;
      inicio = null;
      if (moveu) chrome.storage.local.set({ posicaoAgrup: posicao }); else if (aoClicar) aoClicar();
    });
  }

  arrastar(pilula, abrirGaveta);
  $('.fechar').addEventListener('click', fecharGaveta);
  $('.cortina').addEventListener('click', fecharGaveta);
  $('.aplicar').addEventListener('click', fecharGaveta);
  sombra.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; $('.filtro').value = ''; desenharLista(); }));
  $('.atualizar').addEventListener('click', atualizarDaLoggi);
  $('.limpar').addEventListener('click', () => { mudar(R.limpar(cfg)); recado('Escolha limpa: nada está sendo conferido.'); });
  $('.filtro').addEventListener('input', desenharLista);
  $('.adicionar').addEventListener('submit', (e) => { e.preventDefault(); adicionar($('.nova').value); });
  // O leitor de codigo digita como teclado: o que se digita na gaveta nao vai para o Arco.
  ['keydown', 'keypress', 'keyup'].forEach((t) => hospedeiro.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); }));
  window.addEventListener('resize', aplicarPosicao);

  document.documentElement.append(hospedeiro);
  chrome.storage.local.get(['posicaoAgrup', 'pedirEscolha']).then((s) => {
    if (s.posicaoAgrup) posicao = s.posicaoAgrup;
    aplicarPosicao();
    if (s.pedirEscolha && Date.now() - s.pedirEscolha < PEDIDO_MS) setTimeout(abrirGaveta, 300);
  });
  carregarCfg();
})();
