// XM - Conferencia Shopee: a pagina "Vapt Vupt" (Conferencia > Vapt Vupt), no tema do SPX. Antes
// ficava na XM - Ativos Shopee; separada em 20/11/2026 (o usuario achou arriscado juntas).
//
// A viagem do dia, toda pelo SPX (3.0, 20/11/2026: do sistema XMTT so o login): o romaneio vem
// da viagem que o painel AMH-LM mostra hoje (anexo da viagem em Viagens de Carga Direta), contra
// a pesquisa em lote do SPX e as ATs criadas hoje. Mostra % AT vinculada, recebidos, divergencias
// (Recebido - Sem AT e Enviado - Nao recebido), BWT de processamento, volume por cidade, fluxo hora
// a hora e a lista das divergencias, com o relatorio no formato do painel da Shopee.
//
// "Conferir agora": spx.js le o painel, acha o tripId e baixa o anexo -> conferencia.js le o xlsx
// -> spx.js pesquisa os BR e lista as ATs -> se houver divergencia, o export de pedidos da viagem
// (comprador e CEP) -> fundo.js le o CSV -> conferencia.js faz a conta. O resultado fica guardado
// neste Chrome (historico dos ultimos dias, por estacao); nada vai ao sistema.

(() => {
  const C = self.XMVaptConta;
  const MAX_LISTA = 500;
  const DIAS_GUARDADOS = 10;
  const CHAVE_HISTORICO = 'vaptHistorico';
  const CHAVE_RASTREIO = 'vaptRastreio';
  const CHAVE_ESTACAO = 'vaptEstacao';
  const CHAVE_AREA = 'vaptArea'; // prefixos de CEP das ATs, por estação e dia (abrangência aprendida)
  const DIAS_AREA = 15;
  const DUAS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  const CSS = `
  .xm-conf-pagina .xm-vv-barra { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .xm-conf-pagina .xm-vv-barra select { height: 32px; border: 1px solid #e5e5e5; border-radius: 4px; padding: 0 8px; font: inherit; color: #333; background: #fff; }
  .xm-conf-pagina .xm-vv-lido { color: #999; font-size: 12px; margin-left: auto; }
  .xm-conf-pagina .xm-vv-viagem { color: #666; font-size: 13px; margin: 0 0 10px; }
  /* Checklist do Conferir agora, no canto de baixo (verde feito, âmbar andando ou aviso, vermelho erro). */
  .xm-conf-pagina .xm-vv-passos { position: fixed; right: 24px; bottom: 24px; z-index: 1000; width: 340px; background: #fff;
    border-radius: 4px; box-shadow: 0 4px 18px rgba(0,0,0,.16); padding: 12px 14px; font-size: 12px; color: #333; }
  .xm-conf-pagina .xm-vv-passos-cab { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; font-weight: 500; }
  .xm-conf-pagina .xm-vv-passos-cab button { border: 0; background: none; color: #999; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px; }
  .xm-conf-pagina .xm-vv-passos ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
  .xm-conf-pagina .xm-vv-passos li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 7px; align-items: start; }
  .xm-conf-pagina .xm-vv-ic { width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center; margin-top: 1px;
    font-size: 11px; font-weight: 700; color: #fff; background: #e5e5e5; }
  .xm-conf-pagina .xm-vv-ic.xm-ok { background: #26a65b; }
  .xm-conf-pagina .xm-vv-ic.xm-andamento { background: #f5a623; animation: xm-vv-pulsa 1s ease-in-out infinite; }
  .xm-conf-pagina .xm-vv-ic.xm-aviso { background: #f5a623; }
  .xm-conf-pagina .xm-vv-ic.xm-erro { background: #ee4d2d; }
  .xm-conf-pagina .xm-vv-ic.xm-pulado { background: #d9d9d9; }
  @keyframes xm-vv-pulsa { 50% { opacity: .45; } }
  .xm-conf-pagina .xm-vv-pt { color: #333; }
  .xm-conf-pagina .xm-vv-pt.xm-espera { color: #aaa; }
  .xm-conf-pagina .xm-vv-filtros { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .xm-conf-pagina .xm-vv-filtro { color: #666; }
  .xm-conf-pagina .xm-vv-filtro.xm-ativo { color: #ee4d2d; font-weight: 500; }
  .xm-conf-pagina .xm-vv-sep { color: #ccc; }
  .xm-conf-pagina .xm-vv-tabela-tos td { padding-top: 8px; padding-bottom: 8px; }
  .xm-conf-pagina .xm-vv-to-clica { cursor: pointer; }
  .xm-conf-pagina .xm-vv-to-clica:hover td { background: #fff7f4; }
  /* Card flutuante da TO (por cima de tudo, até do checklist). */
  .xm-conf-pagina .xm-vv-fundo-to { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,.35); display: grid; place-items: center; padding: 24px; }
  .xm-conf-pagina .xm-vv-card-to { width: min(980px, 100%); max-height: calc(100vh - 48px); display: flex; flex-direction: column; background: #fff; border-radius: 4px; box-shadow: 0 10px 32px rgba(0,0,0,.25); padding: 20px 24px; }
  .xm-conf-pagina .xm-vv-ct-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .xm-conf-pagina .xm-vv-ct-tit { font-family: ui-monospace, Consolas, monospace; }
  .xm-conf-pagina .xm-vv-ct-fechar { flex: none; width: 32px; height: 32px; border: 1px solid #e5e5e5; border-radius: 4px; background: #fff; color: #666; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; display: grid; place-items: center; }
  .xm-conf-pagina .xm-vv-ct-fechar:hover { color: #ee4d2d; border-color: #ee4d2d; }
  .xm-conf-pagina .xm-vv-ct-barra .xm-vv-pct-to { grid-template-columns: 70px minmax(120px, 1fr); }
  .xm-conf-pagina .xm-vv-ct-caixa { max-height: none; min-height: 0; flex: 1 1 auto; overflow: auto; }
  .xm-conf-pagina .xm-vv-pct-to { display: grid; grid-template-columns: 64px minmax(80px, 160px); align-items: center; gap: 8px; }
  .xm-conf-pagina .xm-vv-pct-to b { font-weight: 500; text-align: right; font-variant-numeric: tabular-nums; }
  .xm-conf-pagina a.xm-vv-ver { text-decoration: none; white-space: nowrap; }
  .xm-conf-pagina a.xm-vv-ver:hover { text-decoration: underline; }
  .xm-conf-pagina .xm-vv-pd { display: block; color: #999; overflow-wrap: anywhere; }
  .xm-conf-pagina .xm-vv-cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 1300px) { .xm-conf-pagina .xm-vv-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .xm-conf-pagina .xm-vv-card { position: relative; background: #fff; border-radius: 4px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); min-width: 0; }
  .xm-conf-pagina .xm-vv-baixar-card { position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border: 0; border-radius: 4px;
    background: #ee4d2d; color: #fff; cursor: pointer; display: grid; place-items: center; padding: 0; }
  .xm-conf-pagina .xm-vv-baixar-card:hover { background: #d73211; }
  .xm-conf-pagina .xm-vv-baixar-card svg { width: 18px; height: 18px; }
  .xm-conf-pagina .xm-vv-rot { color: #666; font-size: 12px; }
  .xm-conf-pagina .xm-vv-val { color: #333; font-size: 24px; font-weight: 500; line-height: 1.3; margin: 4px 0 2px; white-space: nowrap; }
  .xm-conf-pagina .xm-vv-val.xm-atencao { color: #ee4d2d; }
  .xm-conf-pagina .xm-vv-sub { color: #999; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Meio arco da % AT vinculada (o mesmo da XM - Operação): 157 de comprimento, --pct x 1,5708 é o pintado. */
  .xm-conf-pagina .xm-vv-arco { --pct: 0; position: relative; width: 150px; height: 84px; margin: 6px auto 2px; }
  .xm-conf-pagina .xm-vv-arco svg { display: block; width: 100%; height: 100%; overflow: visible; }
  .xm-conf-pagina .xm-vv-arco path { fill: none; stroke-width: 12; stroke-linecap: round; }
  .xm-conf-pagina .xm-vv-arco .xm-arco-fundo { stroke: #f0f0f0; }
  .xm-conf-pagina .xm-vv-arco .xm-arco-valor { stroke: #ee4d2d; stroke-dasharray: calc(var(--pct) * 1.5708px) 400px; }
  .xm-conf-pagina .xm-vv-arco.xm-zero .xm-arco-valor { display: none; }
  .xm-conf-pagina .xm-vv-arco span { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font-size: 22px; font-weight: 500; color: #333; }
  .xm-conf-pagina .xm-vv-card-at .xm-vv-sub { text-align: center; }
  .xm-conf-pagina .xm-vv-tres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 1100px) { .xm-conf-pagina .xm-vv-tres { grid-template-columns: 1fr; } }
  .xm-conf-pagina .xm-vv-tres .xm-cartao { margin-bottom: 0; }
  .xm-conf-pagina .xm-vv-h { font-size: 15px; font-weight: 500; color: #333; margin: 0 0 2px; }
  .xm-conf-pagina .xm-vv-hsub { color: #999; font-size: 12px; margin: 0 0 12px; }
  .xm-conf-pagina .xm-vv-barras { display: grid; gap: 8px; }
  .xm-conf-pagina .xm-vv-linha { display: grid; grid-template-columns: minmax(90px, 160px) minmax(0, 1fr) auto; align-items: center; gap: 10px; font-size: 13px; color: #333; }
  .xm-conf-pagina .xm-vv-linha.xm-clica { cursor: pointer; padding: 4px 6px; margin: 0 -6px; border-radius: 4px; }
  .xm-conf-pagina .xm-vv-linha.xm-clica:hover, .xm-conf-pagina .xm-vv-linha.xm-ativa { background: #fff7f4; }
  .xm-conf-pagina .xm-vv-linha span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .xm-conf-pagina .xm-vv-linha b { font-weight: 500; text-align: right; }
  .xm-conf-pagina .xm-vv-t { height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
  .xm-conf-pagina .xm-vv-t i { display: block; height: 100%; background: #ee4d2d; border-radius: 4px; }
  .xm-conf-pagina .xm-vv-t.xm-cinza i { background: #b8c0c8; }
  .xm-conf-pagina .xm-vv-vazio { color: #bbb; font-size: 13px; padding: 8px 0; }
  .xm-conf-pagina .xm-vv-fluxo { overflow-x: auto; }
  .xm-conf-pagina .xm-vv-fluxo table { border-collapse: separate; border-spacing: 4px; font-size: 12px; }
  .xm-conf-pagina .xm-vv-fluxo th { color: #999; font-weight: 500; padding: 2px 6px; white-space: nowrap; }
  .xm-conf-pagina .xm-vv-fluxo td { min-width: 46px; padding: 6px 4px; text-align: center; border-radius: 4px; color: #333; }
  .xm-conf-pagina .xm-vv-fluxo td.xm-et { text-align: left; font-weight: 500; white-space: nowrap; padding-right: 10px; }
  .xm-conf-pagina .xm-vv-fluxo td.xm-tot { font-weight: 500; background: #fafafa; }
  `;

  let ctx = null;
  let raiz = null;
  // registro = um dia conferido: { dia, estacao, viagens, lido_em, usuario, conta }
  const est = { logado: false, nome: '', estacao: '', dia: '', registro: null, tipo: 'sem_at', ocupado: false, filtroTo: 'abertas', toNoCard: '' };
  const $ = (sel) => raiz.querySelector(sel);
  const esc = (v) => ctx.esc(v);
  const n = (v) => ctx.numero(v);
  const pct2 = (v) => `${Number(v || 0).toLocaleString('pt-BR', DUAS)}%`;
  const conta = () => (est.registro && est.registro.conta) || null;

  // ── guardado neste Chrome ─────────────────────────────────────────────────────
  async function ler(chave) {
    try { return (await chrome.storage.local.get(chave))[chave]; } catch { return undefined; }
  }
  async function gravar(chave, valor) {
    try { await chrome.storage.local.set({ [chave]: valor }); } catch { /* sem guardar, a tela vale do mesmo jeito */ }
  }

  function montar(contexto) {
    ctx = contexto;
    if (!document.getElementById('xm-vapt-estilo')) {
      const s = document.createElement('style');
      s.id = 'xm-vapt-estilo';
      s.textContent = CSS;
      (document.head || document.documentElement).append(s);
    }
    raiz = document.createElement('div');
    raiz.className = 'xm-conf-pagina';
    raiz.innerHTML = `
      <div class="xm-cartao">
        <span class="xm-conta xm-vv-conta"></span>
        <h2 class="xm-titulo">Vapt Vupt</h2>
        <p class="xm-sub">A viagem de hoje (painel AMH-LM) contra o SPX: AT vinculada, recebidos e divergências. Tudo lido do próprio SPX.</p>
        <div class="xm-vv-login" hidden></div>
        <p class="xm-vv-viagem" hidden></p>
        <div class="xm-vv-barra" hidden>
          <select class="xm-vv-dia" title="Dia da conferência"></select>
          <button class="xm-btn xm-btn-primario xm-vv-conferir" type="button">Conferir agora</button>
          <button class="xm-btn xm-vv-baixar" type="button">Baixar relatório</button>
          <span class="xm-vv-lido"></span>
        </div>
        <p class="xm-status xm-vv-status"></p>
      </div>
      <div class="xm-vv-passos" hidden>
        <div class="xm-vv-passos-cab"><span class="xm-vv-passos-tit"></span><button type="button" class="xm-vv-passos-fechar" title="Fechar">×</button></div>
        <ol class="xm-vv-passos-lista"></ol>
      </div>
      <div class="xm-vv-fundo-to" hidden>
        <div class="xm-vv-card-to" role="dialog" aria-modal="true">
          <div class="xm-vv-ct-cab">
            <div><h3 class="xm-vv-h xm-vv-ct-tit" style="margin:0"></h3><p class="xm-vv-hsub xm-vv-ct-sub" style="margin:2px 0 8px"></p></div>
            <button type="button" class="xm-vv-ct-fechar" title="Voltar (Esc)" aria-label="Voltar">×</button>
          </div>
          <div class="xm-vv-ct-barra"></div>
          <div class="xm-cabecalho" style="margin:14px 0 8px"><span class="xm-vv-hsub" style="margin:0">Pedidos que faltam receber</span><button class="xm-btn xm-btn-primario xm-vv-ct-copiar" type="button">Copiar faltantes</button></div>
          <div class="xm-tabela-caixa xm-vv-ct-caixa"><table class="xm-tabela">
            <thead><tr><th>SPX Tracking Number</th><th>Localização atual</th><th>Cidade · Bairro</th><th>Motorista / AT</th><th>Ação</th></tr></thead>
            <tbody class="xm-vv-ct-linhas"></tbody>
          </table></div>
        </div>
      </div>
      <div class="xm-vv-corpo" hidden>
        <div class="xm-vv-cards"></div>
        <div class="xm-vv-tres">
          <div class="xm-cartao"><h3 class="xm-vv-h">Divergências — Detalhamento</h3><p class="xm-vv-hsub">Pacotes fora de "AT vinculada". Clique para ver a lista.</p><div class="xm-vv-barras xm-vv-tipos"></div></div>
          <div class="xm-cartao"><h3 class="xm-vv-h">Divergências — Localização</h3><p class="xm-vv-hsub">Divergências por cidade</p><div class="xm-vv-barras xm-vv-loc"></div></div>
          <div class="xm-cartao"><h3 class="xm-vv-h">Volume por cidade</h3><p class="xm-vv-hsub xm-vv-volsub"></p><div class="xm-vv-barras xm-vv-vol"></div></div>
        </div>
        <div class="xm-cartao xm-vv-tos-cartao">
          <div class="xm-cabecalho">
            <div><h3 class="xm-vv-h" style="margin:0">TOs da viagem</h3><p class="xm-vv-hsub xm-vv-tos-sub" style="margin:2px 0 0"></p></div>
            <div class="xm-vv-filtros"></div>
          </div>
          <div class="xm-tabela-caixa"><table class="xm-tabela xm-vv-tabela-tos">
            <thead><tr><th>TO</th><th>% recebido</th><th>Total</th><th>Recebidos</th><th>Faltam</th><th></th></tr></thead>
            <tbody class="xm-vv-tos"></tbody>
          </table></div>
        </div>
        <div class="xm-cartao"><h3 class="xm-vv-h">Fluxo hora a hora</h3><p class="xm-vv-hsub">Recebimento no XPT, atribuição (AT) e expedição, por hora</p><div class="xm-vv-fluxo"></div></div>
        <div class="xm-cartao">
          <div class="xm-cabecalho"><h3 class="xm-vv-h xm-vv-lista-tit" style="margin:0"></h3><button class="xm-btn xm-vv-copiar" type="button">Copiar BR</button></div>
          <div class="xm-tabela-caixa"><table class="xm-tabela">
            <thead><tr><th>SPX Tracking Number</th><th>TO</th><th>Cidade</th><th>Bairro</th><th>Cluster</th><th>Motorista / AT</th><th>Localização atual</th><th>Ação</th></tr></thead>
            <tbody class="xm-vv-linhas"></tbody>
          </table></div>
        </div>
      </div>`;
    $('.xm-vv-conferir').addEventListener('click', conferir);
    $('.xm-vv-baixar').addEventListener('click', baixarRelatorio);
    $('.xm-vv-copiar').addEventListener('click', copiarBR);
    $('.xm-vv-passos-fechar').addEventListener('click', () => { $('.xm-vv-passos').hidden = true; });
    $('.xm-vv-dia').addEventListener('change', (e) => { est.dia = e.target.value; carregar(); });
    $('.xm-vv-cards').addEventListener('click', (e) => { if (e.target.closest('[data-acao="baixar"]')) baixarRelatorio(); });
    $('.xm-vv-tipos').addEventListener('click', (e) => {
      const l = e.target.closest('[data-tipo]');
      if (!l) return;
      est.tipo = l.dataset.tipo;
      desenhar();
    });
    $('.xm-vv-filtros').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      est.filtroTo = b.dataset.filtro;
      desenharTos();
    });
    // Clicar na TO (com pacote faltando) abre o card flutuante com os pedidos que faltam.
    $('.xm-vv-tos').addEventListener('click', (e) => {
      const linha = e.target.closest('tr[data-to]');
      if (linha && Number(linha.dataset.faltam)) abrirCardTo(linha.dataset.to);
    });
    $('.xm-vv-fundo-to').addEventListener('click', (e) => {
      if (e.target === e.currentTarget || e.target.closest('.xm-vv-ct-fechar')) fecharCardTo();
      else if (e.target.closest('.xm-vv-ct-copiar')) {
        // O status da página fica atrás do card: o próprio botão confirma.
        const b = e.target.closest('.xm-vv-ct-copiar');
        copiarLista(faltantesDa(est.toNoCard).map((d) => d.codigo), (q) => {
          b.textContent = `Copiado (${n(q)})`;
          setTimeout(() => { b.textContent = 'Copiar faltantes'; }, 2000);
        });
      }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && est.toNoCard) fecharCardTo(); });
    return raiz;
  }

  // ── conta ──────────────────────────────────────────────────────────────────────
  function status(texto, erro = false) {
    const p = $('.xm-vv-status');
    p.textContent = texto;
    p.className = `xm-status xm-vv-status${erro ? ' xm-erro' : ''}`;
  }

  function mostrarConta(logado, nome) {
    est.logado = logado;
    est.nome = nome || '';
    $('.xm-vv-login').hidden = logado;
    $('.xm-vv-barra').hidden = !logado;
    if (!logado) {
      $('.xm-vv-login').replaceChildren(ctx.blocoLogin((r) => { ctx.aoEntrar(r); mostrarConta(true, r.nome); carregar(); }));
      $('.xm-vv-corpo').hidden = true;
      $('.xm-vv-viagem').hidden = true;
      $('.xm-vv-conta').textContent = '';
      return;
    }
    $('.xm-vv-conta').innerHTML = `${esc(nome)} · <button class="xm-link xm-vv-sair" type="button">Sair</button>`;
    $('.xm-vv-sair').addEventListener('click', () => ctx.pedirAoFundo('sair').then(() => { ctx.aoEntrar(null); mostrarConta(false); status(''); }));
  }

  function falhou(e) {
    if (e.conta) mostrarConta(false);
    status(e.message, true);
  }

  // ── dados (o histórico deste Chrome) ─────────────────────────────────────────
  async function carregar() {
    if (!est.logado) return;
    const historico = (await ler(CHAVE_HISTORICO)) || {};
    if (!est.estacao) est.estacao = (await ler(CHAVE_ESTACAO)) || '';
    const dias = Object.keys(historico[est.estacao] || {}).sort().reverse();
    if (!dias.includes(est.dia)) est.dia = dias[0] || '';
    mostrar(est.dia ? historico[est.estacao][est.dia] : null, dias);
    if (!est.dia) status('Nenhuma conferência neste computador ainda. Clique em Conferir agora.');
  }

  const horaMin = (seg) => (seg ? new Date(seg * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');

  function mostrar(registro, dias) {
    est.registro = registro || null;
    const sel = $('.xm-vv-dia');
    sel.innerHTML = (dias || []).map((d) => `<option value="${d}"${d === est.dia ? ' selected' : ''}>${d.split('-').reverse().join('/')}</option>`).join('');
    sel.hidden = !(dias && dias.length);
    $('.xm-vv-lido').textContent = registro && registro.lido_em
      ? `lido às ${new Date(registro.lido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${registro.usuario ? ` por ${registro.usuario}` : ''}` : '';
    // A estação e a(s) viagem(ns) de onde saiu o romaneio.
    const v = $('.xm-vv-viagem');
    v.hidden = !registro;
    if (registro) {
      const viagens = (registro.viagens || []).map((t) => `${t.numero} (${n(t.romaneio || 0)} pedidos${t.ata ? `, chegou ${horaMin(t.ata)}` : t.eta ? `, previsão ${horaMin(t.eta)}` : ''})`);
      v.textContent = `${registro.estacao} · viagem ${viagens.join(' + ') || '—'}`;
    }
    const c = conta();
    $('.xm-vv-corpo').hidden = !(c && c.total);
    if (c && c.total) desenhar();
  }

  function duracao(ini, fim) {
    if (!ini || !fim || fim <= ini) return '—';
    const min = Math.round((fim - ini) / 60);
    return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min`;
  }
  const hora = (seg) => (seg ? new Date(seg * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');

  /** % AT vinculada em meio arco (pedido do usuário: igual ao da XM - Operação). */
  function cardAt(r) {
    const p = Math.min(100, Math.max(0, Number(r.pct_at) || 0));
    const arco = 'M10 60 A50 50 0 0 1 110 60';
    return `<div class="xm-vv-card xm-vv-card-at"><div class="xm-vv-rot">% AT vinculada</div>
      <div class="xm-vv-arco${p ? '' : ' xm-zero'}" style="--pct:${p}"><svg viewBox="0 0 120 68"><path class="xm-arco-fundo" d="${arco}"/><path class="xm-arco-valor" d="${arco}"/></svg><span>${pct2(r.pct_at)}</span></div>
      <div class="xm-vv-sub">${n(r.em_at)} / ${n(r.total)} pacotes</div></div>`;
  }

  /**
   * Fora de abrangência sem lista do sistema: pacote fora de AT com CEP (5 primeiros dígitos) que
   * não apareceu em nenhuma AT dos últimos dias. Sem o export de pedidos (o CEP), fica "—".
   */
  function cardFora(r) {
    const explica = `Pacote fora de AT com CEP (5 primeiros dígitos) que não apareceu em nenhuma AT dos últimos ${r.area_dias || 0} dia(s) desta estação.`;
    if (r.fora_abrangencia == null) return card('Fora de abrangência', '—', 'sem o CEP do export de pedidos');
    const sub = r.fora_abrangencia ? `CEP ${(r.fora || []).slice(0, 3).map((f) => `${f.prefixo}-xxx`).join(', ')}` : 'nenhum pacote';
    return card('Fora de abrangência', n(r.fora_abrangencia), sub, '', r.fora_abrangencia > 0).replace('<div class="xm-vv-card">', `<div class="xm-vv-card" title="${esc(explica)}">`);
  }

  function card(rotulo, valor, sub, extra = '', atencao = false) {
    return `<div class="xm-vv-card"><div class="xm-vv-rot">${rotulo}</div><div class="xm-vv-val${atencao ? ' xm-atencao' : ''}">${valor}</div><div class="xm-vv-sub" title="${esc(sub)}">${esc(sub)}</div>${extra}</div>`;
  }

  function linhaBarra(rotulo, qtd, maior, { tipo, cinza, ativa, direita } = {}) {
    const larg = maior ? Math.max(2, Math.round((qtd / maior) * 100)) : 0;
    return `<div class="xm-vv-linha${tipo ? ' xm-clica' : ''}${ativa ? ' xm-ativa' : ''}"${tipo ? ` data-tipo="${tipo}"` : ''}>
      <span title="${esc(rotulo)}">${esc(rotulo)}</span><div class="xm-vv-t${cinza ? ' xm-cinza' : ''}"><i style="width:${larg}%"></i></div><b>${direita != null ? direita : n(qtd)}</b></div>`;
  }

  function desenhar() {
    const r = conta();
    if (!r || !r.total) return;
    const semAt = r.recebido_sem_at || [];
    const naoRec = r.nao_recebido || [];
    const p = r.processamento || {};
    const tipos = (semAt.length ? 1 : 0) + (naoRec.length ? 1 : 0);
    $('.xm-vv-cards').innerHTML = [
      cardAt(r),
      card('Total de pacotes', n(r.total), 'no romaneio'),
      card('Pacotes recebidos', n(r.recebidos), `${pct2(r.pct_recebidos)} do romaneio`),
      card('Divergências', n(r.divergencias), `${tipos} tipo(s) · ${pct2(r.total ? Math.floor((r.divergencias * 10000) / r.total) / 100 : 0)} do romaneio`,
        // Baixar o relatório pelo próprio cartão, como no painel da Shopee (pedido do usuário).
        r.divergencias ? `<button class="xm-vv-baixar-card" type="button" data-acao="baixar" title="Baixar relatório de divergências">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg></button>` : '',
        r.divergencias > 0),
      cardFora(r),
      card('BWT processamento', duracao(p.inicio, p.fim), p.inicio && p.fim ? `${hora(p.inicio)} → ${hora(p.fim)}` : 'sem horário ainda'),
    ].join('');

    // Detalhamento por tipo
    const maiorTipo = Math.max(semAt.length, naoRec.length);
    // Porcentagem sempre com 2 casas, para baixo (regra do usuário): 30 de 3.028 = 0,99%, não 0%.
    const pctDe = (q) => pct2(r.divergencias ? Math.floor((q * 10000) / r.divergencias) / 100 : 0);
    $('.xm-vv-tipos').innerHTML = r.divergencias
      ? linhaBarra('Recebido - Sem AT', semAt.length, maiorTipo, { tipo: 'sem_at', ativa: est.tipo === 'sem_at', direita: `${n(semAt.length)} · ${pctDe(semAt.length)}` })
        + linhaBarra('Enviado - Não recebido', naoRec.length, maiorTipo, { tipo: 'nao_recebido', ativa: est.tipo === 'nao_recebido', direita: `${n(naoRec.length)} · ${pctDe(naoRec.length)}` })
      : '<div class="xm-vv-vazio">Nenhuma divergência.</div>';

    // Localização: divergências por cidade (a cidade vem da AT ou do CEP do pedido)
    const porCidade = new Map();
    [...semAt, ...naoRec].forEach((d) => { const c = d.cidade || '(sem cidade)'; porCidade.set(c, (porCidade.get(c) || 0) + 1); });
    const cidades = [...porCidade].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maiorLoc = Math.max(0, ...cidades.map((c) => c[1]));
    $('.xm-vv-loc').innerHTML = cidades.length ? cidades.map(([c, q]) => linhaBarra(c, q, maiorLoc)).join('') : '<div class="xm-vv-vazio">Nenhuma divergência.</div>';

    // Volume: os pacotes do romaneio que estão em AT, por cidade da AT
    $('.xm-vv-volsub').textContent = `${n(r.em_at)} pacotes do romaneio nas ATs de hoje${r.area_dias ? ` · abrangência aprendida com ${n(r.area_dias)} dia(s) de ATs` : ''}`;
    const vol = (r.porCidade || []).slice(0, 8);
    const maiorVol = Math.max(0, ...vol.map((c) => c.total));
    $('.xm-vv-vol').innerHTML = vol.length
      ? vol.map((c) => linhaBarra(c.cidade, c.total, maiorVol, { cinza: true })).join('')
      : '<div class="xm-vv-vazio">Nenhuma AT de hoje com BR do romaneio.</div>';

    desenharTos();
    desenharFluxo(r.fluxo);
    desenharLista();
  }

  // ── TOs da viagem: conclusão de cada TO (pacotes recebidos / pacotes da TO no romaneio) ──────
  // Mesmas cores da conferência de LineHaul do sistema: verde só fechada, âmbar no meio, vermelho
  // nada recebido. Porcentagem com 2 casas, para baixo (99,99% não vira 100,00%).
  const corDaTo = (t) => (t.faltam === 0 ? '#26a65b' : t.recebidos > 0 ? '#f5a623' : '#ee4d2d');
  const faltantesDa = (to) => ((conta() && conta().nao_recebido) || []).filter((d) => (d.to || C.SEM_TO) === to);

  function desenharTos() {
    const r = conta();
    const caixa = raiz.querySelector('.xm-vv-tos-cartao');
    const tos = (r && r.tos) || null;
    caixa.hidden = !tos;
    if (!tos) return;
    const abertas = tos.filter((t) => t.faltam > 0);
    const completas = tos.length - abertas.length;
    const faltam = abertas.reduce((s, t) => s + t.faltam, 0);
    $('.xm-vv-tos-sub').textContent = `${n(completas)} de ${n(tos.length)} TOs 100% recebidas · ${n(faltam)} pacote(s) faltando em ${n(abertas.length)} TO(s)`;
    const filtros = [['abertas', 'Abertas', abertas.length], ['completas', 'Completas', completas], ['todas', 'Todas', tos.length]];
    $('.xm-vv-filtros').innerHTML = filtros.map(([k, rot, q]) => `<button type="button" class="xm-link xm-vv-filtro${est.filtroTo === k ? ' xm-ativo' : ''}" data-filtro="${k}">${rot} (${n(q)})</button>`).join('<span class="xm-vv-sep">·</span>');
    const lista = est.filtroTo === 'abertas' ? abertas : est.filtroTo === 'completas' ? tos.filter((t) => !t.faltam) : tos;
    $('.xm-vv-tos').innerHTML = lista.length ? lista.map((t) => {
      const cor = corDaTo(t);
      return `<tr data-to="${esc(t.to)}" data-faltam="${t.faltam}" class="${t.faltam ? 'xm-vv-to-clica' : ''}">
        <td class="xm-cod">${esc(t.to)}</td>
        <td>${barraDaTo(t)}</td>
        <td>${n(t.total)}</td><td>${n(t.recebidos)}</td><td>${t.faltam ? `<b style="color:${cor}">${n(t.faltam)}</b>` : '0'}</td>
        <td>${t.faltam ? '<span class="xm-link">Ver o que falta</span>' : ''}</td></tr>`;
    }).join('') : `<tr><td colspan="6" style="color:#bbb;text-align:center">${est.filtroTo === 'abertas' ? 'Todas as TOs estão 100% recebidas.' : 'Nenhuma.'}</td></tr>`;
  }

  const barraDaTo = (t) => {
    const cor = corDaTo(t);
    return `<div class="xm-vv-pct-to"><b style="color:${cor}">${pct2(t.pct)}</b><div class="xm-vv-t"><i style="width:${Math.min(100, t.pct)}%;background:${cor}"></i></div></div>`;
  };

  // ── card flutuante da TO: os pedidos que faltam receber dela ──────────────────────────────────
  function abrirCardTo(to) {
    const t = ((conta() && conta().tos) || []).find((x) => x.to === to);
    if (!t) return;
    const falt = faltantesDa(to);
    est.toNoCard = to;
    const card = $('.xm-vv-card-to');
    card.querySelector('.xm-vv-ct-tit').textContent = to;
    card.querySelector('.xm-vv-ct-sub').textContent = `${n(t.recebidos)} de ${n(t.total)} recebidos · ${n(t.faltam)} faltam receber`;
    card.querySelector('.xm-vv-ct-barra').innerHTML = barraDaTo(t);
    card.querySelector('.xm-vv-ct-linhas').innerHTML = falt.length ? falt.map((d) => `<tr>
      <td class="xm-cod">${esc(d.codigo)}</td>
      <td>${esc(d.achado_no_spx === false ? 'não achado no SPX' : (d.estacao || '—'))}</td>
      <td>${esc([d.cidade, d.bairro].filter(Boolean).join(' · ') || '—')}</td>
      <td>${esc([d.motorista, d.at].filter(Boolean).join(' · ') || '—')}</td>
      <td><a class="xm-link xm-vv-ver" href="${esc(C.linkDoPedido(d.codigo, location.origin))}" target="_blank" rel="noopener">Visualizar</a></td></tr>`).join('')
      : '<tr><td colspan="5" style="color:#bbb;text-align:center">Nenhum.</td></tr>';
    $('.xm-vv-fundo-to').hidden = false;
  }

  function fecharCardTo() {
    est.toNoCard = '';
    $('.xm-vv-fundo-to').hidden = true;
  }

  function desenharFluxo(f) {
    const caixa = $('.xm-vv-fluxo');
    if (!f || !f.horas || !f.horas.length) { caixa.innerHTML = '<div class="xm-vv-vazio">Sem horários ainda.</div>'; return; }
    const linhas = [['Recebimento', f.recebimento], ['Atribuição', f.atribuicao], ['Expedição', f.expedicao]];
    const maior = Math.max(1, ...linhas.flatMap(([, v]) => v));
    let diaAnt = '';
    const cab = f.horas.map((h) => {
      const [dia, hr] = h.split(' ');
      const rot = `${dia !== diaAnt ? `${dia.slice(8, 10)}/${dia.slice(5, 7)} ` : ''}${hr}h`;
      diaAnt = dia;
      return `<th>${rot}</th>`;
    }).join('');
    caixa.innerHTML = `<table><tr><th></th>${cab}<th>Total</th></tr>${linhas.map(([nome, vals]) => `<tr><td class="xm-et">${nome}</td>${vals.map((v) => {
      const a = v ? 0.12 + 0.78 * (v / maior) : 0;
      return `<td style="background:${v ? `rgba(238,77,45,${a.toFixed(2)})` : '#fafafa'};color:${a > 0.55 ? '#fff' : '#333'}">${n(v)}</td>`;
    }).join('')}<td class="xm-tot">${n(vals.reduce((x, y) => x + y, 0))}</td></tr>`).join('')}</table>`;
  }

  const itensDoTipo = () => { const c = conta(); return c ? (est.tipo === 'sem_at' ? c.recebido_sem_at : c.nao_recebido) || [] : []; };

  function desenharLista() {
    const itens = itensDoTipo();
    $('.xm-vv-lista-tit').textContent = `${est.tipo === 'sem_at' ? 'Recebido - Sem AT' : 'Enviado - Não recebido'} (${n(itens.length)})`;
    $('.xm-vv-linhas').innerHTML = itens.length ? itens.slice(0, MAX_LISTA).map((d) => `<tr>
      <td class="xm-cod">${esc(d.codigo)}</td><td>${esc(d.to || '—')}</td><td>${esc(d.cidade || '—')}</td><td>${esc(d.bairro || '—')}</td>
      <td>${esc(d.cluster || '—')}</td><td>${esc([d.motorista, d.at].filter(Boolean).join(' · ') || '—')}</td>
      <td>${esc(d.achado_no_spx === false ? 'não achado no SPX' : (d.estacao || '—'))}</td>
      <td><a class="xm-link xm-vv-ver" href="${esc(C.linkDoPedido(d.codigo, location.origin))}" target="_blank" rel="noopener">Visualizar</a></td></tr>`).join('')
      : '<tr><td colspan="8" style="color:#bbb;text-align:center">Nenhum.</td></tr>';
  }

  // ── conferir agora ─────────────────────────────────────────────────────────────
  const lerSpx = (url) => ctx.pedirAoSpx('lerViagem', { url });

  // Checklist no canto: cada passo espera -> andamento -> ok / aviso / erro / pulado.
  const PASSOS = [
    ['viagem', 'Viagem de hoje (painel AMH-LM)'],
    ['trip', 'Viagem em Viagens de Carga Direta'],
    ['romaneio', 'Romaneio da viagem'],
    ['pesquisa', 'Pesquisa dos pedidos no SPX'],
    ['ats', 'ATs de hoje'],
    ['export', 'Export de pedidos (comprador e CEP)'],
    ['conta', 'Conta, abrangência e histórico'],
  ];
  const ICONE = { espera: '', andamento: '…', ok: '✓', aviso: '!', erro: '×', pulado: '–' };
  let passos = {};
  let passoAtual = '';
  let tituloPassos = '';

  function desenharPassos() {
    $('.xm-vv-passos-tit').textContent = tituloPassos;
    $('.xm-vv-passos-lista').innerHTML = PASSOS.map(([id, rotulo]) => {
      const p = passos[id] || { estado: 'espera', texto: '' };
      return `<li><span class="xm-vv-ic xm-${p.estado}">${ICONE[p.estado] || ''}</span>
        <span class="xm-vv-pt${p.estado === 'espera' ? ' xm-espera' : ''}">${esc(rotulo)}${p.texto ? `<span class="xm-vv-pd">${esc(p.texto)}</span>` : ''}</span></li>`;
    }).join('');
  }
  let fecharPassos = null;
  function iniciarPassos() {
    clearTimeout(fecharPassos);
    passos = {};
    passoAtual = '';
    tituloPassos = 'Conferindo a viagem de hoje...';
    $('.xm-vv-passos').hidden = false;
    desenharPassos();
  }
  function passo(id, estado, texto = '') {
    passos[id] = { estado, texto };
    if (estado === 'andamento') passoAtual = id;
    desenharPassos();
  }
  // Deu tudo certo: o checklist some sozinho (ele cobre a coluna Ação da lista). Com aviso ou erro,
  // fica até fecharem no ×.
  const SOME_EM_MS = 8000;
  function fimDosPassos(titulo) {
    tituloPassos = titulo;
    desenharPassos();
    const limpo = Object.values(passos).every((p) => p.estado === 'ok' || p.estado === 'pulado');
    if (limpo) fecharPassos = setTimeout(() => { $('.xm-vv-passos').hidden = true; }, SOME_EM_MS);
  }

  // Andamento que vem do spx.js (pesquisa, ATs, export).
  function andamento(_texto, d = {}) {
    if (d.etapa === 'pesquisa') passo('pesquisa', 'andamento', `${n(d.n)} de ${n(d.t)}`);
    else if (d.etapa === 'ats') {
      if (passos.pesquisa && passos.pesquisa.estado === 'andamento') passo('pesquisa', 'ok', passos.pesquisa.texto);
      passo('ats', 'andamento', `${n(d.n)} de ${n(d.t)}`);
    } else if (d.etapa === 'export') passo('export', 'andamento', `esperando o SPX montar o arquivo (${d.s} s)`);
  }

  /**
   * A viagem de hoje: painel AMH-LM (número da viagem) -> Viagens de Carga Direta, Pendente e
   * depois Finalizado (o tripId) -> anexo da viagem (o romaneio, xlsx).
   */
  async function viagemDeHoje() {
    // 1. O número da viagem: o painel AMH-LM. Se ele não responder, a lista de viagens dá conta.
    let viagens = [];
    let semPainel = '';
    passo('viagem', 'andamento', 'lendo o painel...');
    try {
      viagens = C.viagensDoPainel((await lerSpx(C.ROTA_PAINEL_LH)).json).filter((v) => v.chega_aqui);
      if (!viagens.length) semPainel = 'o painel não mostra viagem chegando';
    } catch (e) {
      semPainel = `o painel não respondeu (${e.message.replace(/\.?\s*Dê F5.*$/, '').replace(/^A Shopee recusou /, '').replace(/[()]/g, '')})`;
    }
    if (viagens.length) passo('viagem', 'ok', viagens.map((v) => v.numero).join(', '));
    else passo('viagem', 'andamento', `${semPainel}; procurando na lista de viagens`);

    // 2. O tripId (e, sem o painel, a própria viagem): Viagens de Carga Direta, Pendente e Finalizado.
    const itens = [];
    const achouTodas = () => viagens.length && viagens.every((v) => v.id || C.idDaViagem({ list: itens }, v.numero));
    for (const [aba, urlDe] of [['Pendente', C.urlPendentes], ['Finalizado', C.urlFinalizadas]]) {
      let daAba = 0;
      for (let pagina = 1; pagina <= C.MAX_PAGINAS && !achouTodas(); pagina += 1) {
        passo('trip', 'andamento', `${aba}, página ${pagina}`);
        let dados;
        try {
          dados = ((await lerSpx(urlDe(pagina))).json || {}).data || {};
        } catch (e) {
          throw new Error(`Viagens de Carga Direta (${aba}): ${e.message}`);
        }
        const lista = Array.isArray(dados.list) ? dados.list : [];
        itens.push(...lista);
        daAba += lista.length;
        if (!lista.length || daAba >= (Number(dados.total) || 0)) break;
      }
    }
    if (viagens.length) for (const v of viagens) v.id = v.id || C.idDaViagem({ list: itens }, v.numero);
    else {
      viagens = C.viagensDasListas(itens, C.hojeSP());
      if (viagens.length) passo('viagem', 'ok', `${viagens.map((v) => v.numero).join(', ')} · pela lista de viagens (${semPainel})`);
    }
    if (!viagens.length) {
      passoAtual = 'viagem';
      throw new Error(`Não achei viagem chegando hoje nesta estação (${semPainel || 'nem na lista de viagens'}).`);
    }
    const semId = viagens.filter((v) => !v.id).map((v) => v.numero);
    passo('trip', semId.length ? 'aviso' : 'ok', semId.length ? `não achei: ${semId.join(', ')}` : `tripId ${viagens.map((v) => v.id).join(', ')}`);
    const estacao = viagens[0].estacao || viagens[0].destino;

    // 3. O romaneio: o anexo de cada viagem.
    const romaneio = new Map();
    const falhas = [];
    for (const v of viagens) {
      if (!v.id) continue;
      passo('romaneio', 'andamento', `baixando o anexo da ${v.numero}...`);
      try {
        const { bytes } = await lerSpx(C.urlAnexo(v.id));
        const r = C.romaneioDaPlanilha(await C.lerXlsx(bytes), estacao);
        v.romaneio = r.itens.length;
        for (const x of r.itens) if (!romaneio.has(x.codigo)) romaneio.set(x.codigo, x);
      } catch (e) {
        falhas.push(`${v.numero}: ${e.message}`);
      }
    }
    if (!romaneio.size) throw new Error(`Não deu para ler o romaneio da viagem de hoje${falhas.length ? ` (${falhas.join('; ')})` : ''}.`);
    passo('romaneio', falhas.length ? 'aviso' : 'ok', `${n(romaneio.size)} pedidos para ${estacao}${falhas.length ? ` · ${falhas.join('; ')}` : ''}`);
    const resumoViagens = viagens.filter((v) => v.romaneio).map((v) => ({ numero: v.numero, id: v.id, pedidos: v.pedidos, romaneio: v.romaneio, eta: v.eta, ata: v.ata }));
    return { estacao, viagens: resumoViagens, romaneio: [...romaneio.values()] };
  }

  async function conferir() {
    if (est.ocupado || !est.logado) return;
    est.ocupado = true;
    $('.xm-vv-conferir').disabled = true;
    status('');
    iniciarPassos();
    try {
      const { estacao, viagens, romaneio } = await viagemDeHoje();
      const dia = C.hojeSP();
      est.estacao = estacao;
      est.dia = dia;
      await gravar(CHAVE_ESTACAO, estacao);

      // Só pesquisa no SPX o que ainda pode mudar (o resto vem do que já foi lido hoje, neste Chrome).
      const guardado = await ler(CHAVE_RASTREIO);
      const anterior = guardado && guardado.estacao === estacao && guardado.dia === dia ? guardado.rastreio : [];
      const codigos = romaneio.map((x) => x.codigo);
      const consultar = C.faltaConsultar(codigos, anterior);
      const jaLidos = codigos.length - consultar.length;
      passo('pesquisa', 'andamento', consultar.length ? `0 de ${n(consultar.length)}` : 'nada novo para pesquisar');
      const res = await ctx.pedirAoSpx('buscar', { codigos: consultar }, andamento);
      passo('pesquisa', 'ok', `${n(consultar.length)} pesquisados${jaLidos ? ` · ${n(jaLidos)} já lidos hoje (recebidos e já saíram)` : ''}`);
      passo('ats', 'ok', `${n(res.ats.length)} ATs`);
      const daViagem = new Set(codigos);
      const rastreio = C.juntarRastreio(anterior, res.rastreio).filter((r) => daViagem.has(r.codigo));
      await gravar(CHAVE_RASTREIO, { estacao, dia, rastreio });

      const registro = { dia, estacao, viagens, lido_em: new Date().toISOString(), usuario: est.nome, conta: C.contar({ romaneio, rastreio, ats: res.ats }) };
      mostrar(registro, [dia]);

      // O export de pedidos da viagem (o do botão Export do Order Tracking): comprador e CEP. O CEP
      // empresta cidade a quem está fora de AT e ensina a abrangência. Se falhar, a conferência vale.
      let pedidos = null;
      try {
        passo('export', 'andamento', 'pedindo ao SPX...');
        const exp = await ctx.pedirAoSpx('exportar', { codigos: codigos.slice(0, ctx.R.MAX_CODIGOS) }, andamento);
        passo('export', 'andamento', 'lendo o arquivo...');
        pedidos = (await ctx.pedirAoFundo('pedidosConferencia', { url: exp.url })).pedidos;
        passo('export', 'ok', `${n(pedidos.length)} pedidos com comprador e CEP`);
      } catch (e) {
        passo('export', 'aviso', `sem comprador, CEP e abrangência: ${e.message}`);
      }

      passo('conta', 'andamento', 'calculando...');
      let detalheConta = 'guardado neste Chrome';
      if (pedidos) {
        const area = C.guardarNoHistorico((await ler(CHAVE_AREA)) || {}, estacao, dia, C.prefixosDasAts(pedidos, res.ats), DIAS_AREA);
        await gravar(CHAVE_AREA, area);
        const conhecida = C.areaConhecida(area, estacao);
        registro.conta = C.contar({ romaneio, rastreio, ats: res.ats, pedidos, area: conhecida.prefixos, areaDias: conhecida.dias });
        detalheConta = `abrangência de ${n(conhecida.dias)} dia(s) de ATs (${n(conhecida.prefixos.size)} prefixos de CEP) · guardado neste Chrome`;
      }
      const historico = C.guardarNoHistorico((await ler(CHAVE_HISTORICO)) || {}, estacao, dia, registro, DIAS_GUARDADOS);
      await gravar(CHAVE_HISTORICO, historico);
      mostrar(registro, Object.keys(historico[estacao] || {}).sort().reverse());
      passo('conta', 'ok', detalheConta);
      fimDosPassos(`Pronto às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      if (passoAtual) passo(passoAtual, 'erro', e.message);
      for (const [id] of PASSOS) if (!passos[id]) passos[id] = { estado: 'pulado', texto: '' };
      fimDosPassos('Parou');
      falhou(e);
    } finally {
      est.ocupado = false;
      $('.xm-vv-conferir').disabled = false;
    }
  }

  // ── relatório e copiar ─────────────────────────────────────────────────────────
  const celula = (v) => { const t = String(v == null || v === '' ? '—' : v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

  function baixarRelatorio() {
    const r = conta();
    if (!r || !r.divergencias) return status('Nenhuma divergência para baixar.');
    const manifesto = est.registro.estacao || '';
    const cab = ['Manifesto/Operação', 'Tracking Number', 'Número da TO', 'Comprador', 'Cidade', 'Bairro', 'Cluster', 'Motorista', 'AT (rota)', 'Localização atual', 'Status', 'Abrangência'];
    const abrangencia = (d) => (d.fora ? 'Fora' : r.fora_abrangencia == null ? '' : 'Dentro');
    const linhas = [
      ...(r.recebido_sem_at || []).map((d) => [manifesto, d.codigo, d.to, d.comprador, d.cidade, d.bairro, d.cluster, d.motorista, '', d.estacao, 'Recebido - Sem AT', abrangencia(d)]),
      ...(r.nao_recebido || []).map((d) => [manifesto, d.codigo, d.to, d.comprador, d.cidade, d.bairro, d.cluster, d.motorista, d.at,
        d.achado_no_spx ? d.estacao : 'não achado no SPX', /^soc/i.test(d.estacao || '') ? 'Enviado SOC - Não recebido' : 'Enviado - Não recebido', abrangencia(d)]),
    ];
    const texto = String.fromCharCode(0xfeff) + [cab.join(';'), ...linhas.map((l) => l.map(celula).join(';'))].join('\r\n');
    const [ano, mes, dia] = String(est.registro.dia || '').split('-');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = `${dia}-${mes}-${ano}_${manifesto || 'XPT'}_Divergências.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status(`Relatório com ${n(r.divergencias)} divergência(s) baixado.`);
  }

  function copiarBR() {
    copiarLista(itensDoTipo().map((d) => d.codigo));
  }

  function copiarLista(codigos, aoCopiar = () => {}) {
    const texto = codigos.join('\n');
    if (!texto) return status('Nada para copiar.');
    const pronto = () => { status(`${n(codigos.length)} BR copiado(s).`); aoCopiar(codigos.length); };
    navigator.clipboard.writeText(texto).then(pronto).catch(() => {
      const t = document.createElement('textarea');
      t.value = texto; t.style.cssText = 'position:fixed;opacity:0';
      document.body.append(t); t.select();
      try { document.execCommand('copy'); pronto(); } finally { t.remove(); }
    });
  }

  // ── entrar e sair da pagina ────────────────────────────────────────────────────
  function aoMostrar() {
    ctx.pedirAoFundo('estado').then((r) => {
      mostrarConta(r.logado, r.nome);
      if (r.logado) carregar();
    }).catch((e) => status(e.message, true));
  }

  function aoSair() {}

  self.XMConfVapt = { montar, aoMostrar, aoSair };
})();
