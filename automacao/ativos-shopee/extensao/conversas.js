// XM - Ativos Shopee: a pagina "Conversas" (Ativos Shopee > Conversas), no tema do SPX.
//
// E a tela Ativos > Conversas do sistema (meusite/js/whatsapp-conversa.js) so com a Shopee:
//   Acareacao   (disparos de SAC/dev, com prazo): Vencendo hoje, 24h +, Vencidos, Recebido, Nao recebido;
//   Ativos      (os outros ativos):               Novas respostas, Aguardando, Entregue, Nao entregue;
//   Nos chamaram (o cliente escreveu sem disparo nosso): lista unica.
// Arrastar o card para Recebido/Entregue ou Nao recebido/Nao entregue resolve o pedido; arrastar
// de volta reabre. Abrir o card mostra a conversa: responder (janela de 24h), marcar a resposta,
// copiar o codigo, excluir mensagem do historico.
//
// Tudo passa pelas rotas do sistema em /macros/whatsapp/ (as mesmas de /admin/whatsapp/): o
// servidor decide o que cada conta ve e pode fazer (cargo, polo, quem disparou). Aqui nao tem
// regra de acesso, so a separacao em colunas (regras.js, igual a do sistema).

(() => {
  const POR_PAGINA = 50;
  const RELOGIO_LISTA_MS = 60000;
  const RELOGIO_CHAT_MS = 30000;

  const COLUNAS = {
    acareacao: [
      { chave: 'vencendo_hoje', titulo: 'Vencendo hoje', resultado: null },
      { chave: 'mais_24h', titulo: '24h +', resultado: null },
      { chave: 'vencidos', titulo: 'Vencidos sem resposta', resultado: null },
      { chave: 'recebido', titulo: 'Recebido', resultado: 'recebeu' },
      { chave: 'nao_recebido', titulo: 'Não recebido', resultado: 'nao_recebeu' },
    ],
    outros: [
      { chave: 'novas_respostas', titulo: 'Novas respostas', semDrop: true },
      { chave: 'aguardando', titulo: 'Aguardando', resultado: null },
      { chave: 'entregue', titulo: 'Entregue', resultado: 'recebeu' },
      { chave: 'nao_entregue', titulo: 'Não entregue', resultado: 'nao_recebeu' },
    ],
    chamaram: [{ chave: 'chamaram', titulo: 'Nos chamaram', semDrop: true }],
  };
  const ABAS = [['acareacao', 'Acareação'], ['outros', 'Ativos'], ['chamaram', 'Nos chamaram']];

  const CSS = `
  .xm-ativos-pagina .xm-conv-barra { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
  .xm-ativos-pagina .xm-abas { display: flex; gap: 24px; border-bottom: 1px solid #f0f0f0; margin: 0 0 16px; }
  .xm-ativos-pagina .xm-aba { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 0; margin-bottom: -1px; font: inherit; color: #666; cursor: pointer; }
  .xm-ativos-pagina .xm-aba:hover { color: #ee4d2d; }
  .xm-ativos-pagina .xm-aba.ativa { color: #ee4d2d; border-bottom-color: #ee4d2d; font-weight: 500; }
  .xm-ativos-pagina .xm-aba .xm-n { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 6px; border-radius: 9px; background: #f5f5f5; color: #666; font-size: 12px; line-height: 18px; text-align: center; }
  .xm-ativos-pagina .xm-aba.ativa .xm-n { background: #fff1ec; color: #ee4d2d; }
  .xm-ativos-pagina .xm-conv-busca { max-width: 320px; }
  .xm-ativos-pagina .xm-quadro { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(230px, 1fr); gap: 12px; overflow-x: auto; padding-bottom: 4px; }
  .xm-ativos-pagina .xm-coluna { background: #fff; border-radius: 4px; display: flex; flex-direction: column; min-height: 200px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .xm-ativos-pagina .xm-coluna-topo { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f0f0f0; font-weight: 500; color: #333; }
  .xm-ativos-pagina .xm-coluna-n { min-width: 22px; padding: 0 7px; border-radius: 11px; background: #f5f5f5; color: #666; font-size: 12px; line-height: 20px; text-align: center; font-weight: 400; }
  .xm-ativos-pagina .xm-coluna.xm-destaque .xm-coluna-n { background: #ee4d2d; color: #fff; }
  .xm-ativos-pagina .xm-coluna-cards { flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 6px; max-height: 62vh; overflow-y: auto; transition: background .15s; }
  .xm-ativos-pagina .xm-coluna-cards.xm-sobre { background: #fff7f4; outline: 1px dashed #ee4d2d; outline-offset: -4px; }
  .xm-ativos-pagina .xm-vazia { color: #bbb; text-align: center; padding: 16px 0; font-size: 13px; }
  .xm-ativos-pagina .xm-card { position: relative; border: 1px solid #eee; border-radius: 4px; padding: 7px 10px; cursor: pointer; background: #fff; }
  .xm-ativos-pagina .xm-card:hover { border-color: #ee4d2d; }
  .xm-ativos-pagina .xm-card.xm-nao-lida { border-left: 3px solid #ee4d2d; }
  .xm-ativos-pagina .xm-card.xm-arrastando { opacity: .4; }
  .xm-ativos-pagina .xm-card-cod { font-size: 13px; font-weight: 500; color: #333; padding-right: 26px; word-break: break-all; line-height: 1.4; }
  .xm-ativos-pagina .xm-card-linha { color: #888; font-size: 11px; margin-top: 2px; line-height: 1.4; }
  .xm-ativos-pagina .xm-card-selo { position: absolute; top: 6px; right: 6px; min-width: 18px; padding: 0 5px; border-radius: 9px; background: #ee4d2d; color: #fff; font-size: 11px; line-height: 18px; text-align: center; }
  .xm-ativos-pagina .xm-card-reabrir { margin-top: 2px; font-size: 11px; }
  .xm-ativos-pagina .xm-pag { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 8px; border-top: 1px solid #f0f0f0; font-size: 12px; color: #666; }
  .xm-ativos-pagina .xm-pag button { border: 1px solid #e5e5e5; background: #fff; border-radius: 4px; width: 26px; height: 24px; cursor: pointer; }
  .xm-ativos-pagina .xm-pag button:disabled { opacity: .4; cursor: default; }
  .xm-ativos-pagina .xm-cv-chat { padding: 16px 20px; }
  .xm-ativos-pagina .xm-chat-topo { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
  .xm-ativos-pagina .xm-chat-titulo { font-size: 15px; font-weight: 500; color: #333; }
  .xm-ativos-pagina .xm-chat-sub { color: #999; font-size: 12px; }
  .xm-ativos-pagina .xm-resultado { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #666; }
  .xm-ativos-pagina .xm-resultado b { color: #333; font-weight: 500; }
  .xm-ativos-pagina .xm-chat-corpo { background: #f5f5f5; border-radius: 4px; padding: 12px 16px; height: calc(100vh - 290px); min-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .xm-ativos-pagina .xm-dia { align-self: center; background: #fff; color: #999; font-size: 11px; padding: 1px 10px; border-radius: 10px; margin: 6px 0; }
  .xm-ativos-pagina .xm-bolha { max-width: 60%; padding: 6px 10px 4px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; cursor: pointer; border: 1px solid #eee; background: #fff; color: #333; font-size: 13px; line-height: 1.45; }
  .xm-ativos-pagina .xm-bolha.enviada { align-self: flex-end; background: #fff1ec; border-color: #ffd8cc; }
  .xm-ativos-pagina .xm-bolha.recebida { align-self: flex-start; }
  .xm-ativos-pagina .xm-bolha.xm-sel { outline: 2px solid #ee4d2d; }
  .xm-ativos-pagina .xm-bolha.xm-pisca { box-shadow: 0 0 0 3px rgba(238,77,45,.35); }
  .xm-ativos-pagina .xm-bolha-autor { display: block; font-size: 11px; font-weight: 500; color: #ee4d2d; margin-bottom: 1px; }
  .xm-ativos-pagina .xm-bolha-hora { display: block; text-align: right; font-size: 10px; color: #999; margin-top: 1px; }
  .xm-ativos-pagina .xm-janela { margin-top: 10px; padding: 8px 12px; background: #fff5e6; color: #8a5300; border-radius: 4px; font-size: 13px; }
  .xm-ativos-pagina .xm-selecao { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 10px; padding: 10px 12px; background: #fff7f4; border: 1px solid #ffd8cc; border-radius: 4px; }
  .xm-ativos-pagina .xm-selecao-n { color: #333; margin-right: auto; }
  .xm-ativos-pagina .xm-btn-perigo:hover:not(:disabled) { color: #d0021b; border-color: #d0021b; }
  .xm-ativos-pagina .xm-compor { display: flex; gap: 8px; align-items: flex-end; margin-top: 10px; }
  .xm-ativos-pagina .xm-compor textarea { flex: 1; min-height: 34px; height: 34px; max-height: 140px; padding: 6px 12px; }
  `;

  // A mensagem recebida pode vir sem o nono dígito: compara pelos 8 últimos.
  const mesmoNumero = (a, b) => String(a || '').replace(/\D/g, '').slice(-8) === String(b || '').replace(/\D/g, '').slice(-8);

  let ctx = null;
  let raiz = null;
  const est = {
    logado: false, papel: '', dados: [], aba: null, busca: '', paginas: {},
    chat: null, // { numero, pedido, resolvido }
    selecionadas: new Set(), pedidoDaMsg: {}, arrastando: null,
    relogioLista: null, relogioChat: null,
  };
  const $ = (sel) => raiz.querySelector(sel);

  function montar(contexto) {
    ctx = contexto;
    if (!document.getElementById('xm-conversas-estilo')) {
      const s = document.createElement('style');
      s.id = 'xm-conversas-estilo';
      s.textContent = CSS;
      (document.head || document.documentElement).append(s);
    }
    raiz = document.createElement('div');
    raiz.className = 'xm-ativos-pagina';
    raiz.innerHTML = `
      <div class="xm-cartao xm-cv-cabeca">
        <span class="xm-conta xm-cv-conta"></span>
        <h2 class="xm-titulo">Conversas</h2>
        <p class="xm-sub">Ativos da Shopee pelo WhatsApp da GC, os mesmos do sistema XMTT. Arraste o card para marcar o desfecho.</p>
        <div class="xm-cv-login" hidden></div>
        <div class="xm-cv-topo" hidden>
          <div class="xm-abas">${ABAS.map(([k, t]) => `<button class="xm-aba" type="button" data-aba="${k}">${t}<span class="xm-n">0</span></button>`).join('')}</div>
          <div class="xm-conv-barra">
            <input class="xm-campo xm-conv-busca" placeholder="Buscar BR, número ou nome">
            <button class="xm-btn xm-cv-atualizar" type="button">Atualizar</button>
          </div>
        </div>
        <p class="xm-status xm-cv-status"></p>
      </div>
      <div class="xm-quadro xm-cv-quadro"></div>
      <div class="xm-cartao xm-cv-chat" hidden>
        <div class="xm-chat-topo">
          <button class="xm-link xm-cv-voltar" type="button">‹ Voltar</button>
          <div><div class="xm-chat-titulo xm-cv-chat-titulo"></div><div class="xm-chat-sub xm-cv-chat-sub"></div></div>
          <div class="xm-resultado xm-cv-resultado" hidden><span>Marcado como <b class="xm-cv-resultado-txt"></b></span>
            <button class="xm-btn xm-cv-reabrir" type="button" title="Tira a marcação: o card volta para Aguardando">Desfazer</button></div>
        </div>
        <div class="xm-chat-corpo xm-cv-corpo"></div>
        <div class="xm-selecao xm-cv-selecao" hidden>
          <span class="xm-selecao-n xm-cv-sel-n"></span>
          <button class="xm-btn xm-cv-marcar" type="button" data-resultado="recebeu">Recebeu / Entregue</button>
          <button class="xm-btn xm-cv-marcar" type="button" data-resultado="nao_recebeu">Não recebeu</button>
          <button class="xm-btn xm-cv-copiar" type="button">Copiar código</button>
          <button class="xm-btn xm-btn-perigo xm-cv-excluir" type="button">Excluir</button>
          <button class="xm-link xm-cv-limpar" type="button">Limpar</button>
        </div>
        <div class="xm-janela xm-cv-janela" hidden>O cliente não escreve há mais de 24 horas. Pelas regras do WhatsApp, depois disso só dá para falar com ele disparando o ativo de novo (em Disparar ativos).</div>
        <div class="xm-compor xm-cv-compor">
          <textarea class="xm-area xm-cv-texto" rows="1" placeholder="Escreva uma resposta"></textarea>
          <button class="xm-btn xm-btn-primario xm-cv-enviar" type="button">Enviar</button>
        </div>
      </div>`;

    raiz.querySelectorAll('.xm-aba').forEach((b) => b.addEventListener('click', () => { est.aba = b.dataset.aba; if (est.chat) fecharConversa(); desenharLista(); }));
    $('.xm-conv-busca').addEventListener('input', (e) => { est.busca = e.target.value.trim().toLowerCase(); irOndeEsta(); desenharLista(); });
    $('.xm-cv-atualizar').addEventListener('click', () => carregarLista());
    $('.xm-cv-voltar').addEventListener('click', voltarParaLista);
    $('.xm-cv-reabrir').addEventListener('click', () => resolver({ numero: est.chat.numero, pedido: est.chat.pedido, resolvido: false }).then(voltarParaLista));
    $('.xm-cv-enviar').addEventListener('click', responder);
    $('.xm-cv-texto').addEventListener('input', (e) => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight + 2}px`; });
    $('.xm-cv-texto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); } });
    raiz.querySelectorAll('.xm-cv-marcar').forEach((b) => b.addEventListener('click', () => marcarPelaSelecao(b.dataset.resultado)));
    $('.xm-cv-copiar').addEventListener('click', copiarCodigos);
    $('.xm-cv-excluir').addEventListener('click', excluirSelecionadas);
    $('.xm-cv-limpar').addEventListener('click', () => { est.selecionadas.clear(); desenharSelecao(); });
    $('.xm-cv-corpo').addEventListener('click', (e) => {
      const b = e.target.closest('.xm-bolha');
      if (!b) return;
      const id = b.dataset.id;
      if (est.selecionadas.has(id)) est.selecionadas.delete(id); else est.selecionadas.add(id);
      desenharSelecao();
    });
    // Arrastar e soltar entre as colunas (delegado: o quadro e redesenhado inteiro).
    const quadro = $('.xm-cv-quadro');
    quadro.addEventListener('dragstart', (e) => {
      const c = e.target.closest('.xm-card');
      if (!c) return;
      est.arrastando = { numero: c.dataset.numero, pedido: c.dataset.pedido };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', c.dataset.pedido || c.dataset.numero);
      c.classList.add('xm-arrastando');
    });
    quadro.addEventListener('dragend', (e) => {
      const c = e.target.closest('.xm-card');
      if (c) c.classList.remove('xm-arrastando');
      est.arrastando = null;
      quadro.querySelectorAll('.xm-sobre').forEach((x) => x.classList.remove('xm-sobre'));
    });
    quadro.addEventListener('dragover', (e) => { const z = e.target.closest('.xm-drop'); if (z) { e.preventDefault(); z.classList.add('xm-sobre'); } });
    quadro.addEventListener('dragleave', (e) => { const z = e.target.closest('.xm-drop'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('xm-sobre'); });
    quadro.addEventListener('drop', (e) => {
      const z = e.target.closest('.xm-drop');
      if (!z || !est.arrastando) return;
      e.preventDefault();
      z.classList.remove('xm-sobre');
      const { numero, pedido } = est.arrastando;
      est.arrastando = null;
      const resultado = z.dataset.resultado || null;
      resolver(resultado ? { numero, pedido, resolvido: true, resultado, mensagem_ids: [] } : { numero, pedido, resolvido: false })
        .then(() => carregarLista(true));
    });
    quadro.addEventListener('click', (e) => {
      const pag = e.target.closest('[data-pag]');
      if (pag) { est.paginas[pag.dataset.pag] = (est.paginas[pag.dataset.pag] || 1) + Number(pag.dataset.delta); desenharLista(); return; }
      const reabrir = e.target.closest('.xm-card-reabrir');
      const c = e.target.closest('.xm-card');
      if (!c) return;
      if (reabrir) { e.stopPropagation(); resolver({ numero: c.dataset.numero, pedido: c.dataset.pedido, resolvido: false }).then(() => carregarLista(true)); return; }
      abrirConversa(c.dataset.numero, c.dataset.pedido, c.dataset.resolvido === '1', c.dataset.resultado);
    });
    return raiz;
  }

  // ── conta ──────────────────────────────────────────────────────────────────────
  function status(texto, erro = false) {
    const p = $('.xm-cv-status');
    p.textContent = texto;
    p.className = `xm-status xm-cv-status${erro ? ' xm-erro' : ''}`;
  }

  function mostrarConta(logado, nome, papel) {
    est.logado = logado;
    est.papel = papel || '';
    $('.xm-cv-login').hidden = logado;
    $('.xm-cv-topo').hidden = !logado;
    if (!logado) {
      const caixa = $('.xm-cv-login');
      caixa.replaceChildren(ctx.blocoLogin((r) => { mostrarConta(true, r.nome, r.papel); carregarLista(); }));
      $('.xm-cv-quadro').replaceChildren();
      $('.xm-cv-chat').hidden = true;
      $('.xm-cv-cabeca').hidden = false;
      est.chat = null;
      $('.xm-cv-conta').textContent = '';
      return;
    }
    $('.xm-cv-conta').innerHTML = `${ctx.esc(nome)} · <button class="xm-link xm-cv-sair" type="button">Sair</button>`;
    $('.xm-cv-sair').addEventListener('click', () => ctx.pedirAoFundo('sair').then(() => { pararRelogios(); mostrarConta(false); status(''); }));
  }

  function falhou(e) {
    if (e.conta) { pararRelogios(); mostrarConta(false); }
    status(e.message, true);
  }

  const sistema = (metodo, caminho, corpo) => ctx.pedirAoFundo('sistema', { metodo, caminho, corpo }).then((r) => r.dados);

  // ── lista ──────────────────────────────────────────────────────────────────────
  async function carregarLista(silencioso) {
    if (!est.logado) return;
    if (!silencioso) status('Carregando as conversas...');
    try {
      const r = await sistema('GET', '/macros/whatsapp/conversas');
      if (r && r.polo_pendente) {
        est.dados = [];
        status('Escolha o seu polo no sistema XMTT para ver as conversas.', true);
      } else {
        est.dados = ctx.R.conversasDaShopee(r);
        status('');
      }
      if (est.abrirDepois) {
        const { numero, pedido } = est.abrirDepois;
        est.abrirDepois = null;
        const c = est.dados.find((x) => mesmoNumero(x.numero, numero) && (!pedido || x.pedido === pedido)) || est.dados.find((x) => mesmoNumero(x.numero, numero));
        if (c) { est.aba = ctx.R.abaDe(c); abrirConversa(c.numero, c.pedido, !!c.respondido, c.resultado); }
      }
      if (!est.aba) est.aba = ctx.R.ROLES_ACAREACAO.includes(est.papel) ? 'acareacao' : 'outros';
      desenharLista();
    } catch (e) { falhou(e); }
  }

  const casaBusca = (c) => !est.busca || [c.pedido, c.numero, c.nome_cliente].some((v) => String(v || '').toLowerCase().includes(est.busca));

  // Pesquisar algo que esta em outra aba leva a tela ate la (igual ao sistema).
  function irOndeEsta() {
    if (!est.busca) return;
    const achados = est.dados.filter(casaBusca);
    if (!achados.length || achados.some((c) => ctx.R.abaDe(c) === est.aba)) return;
    est.aba = ctx.R.abaDe(achados[0]);
  }

  function colunaDe(c, aba) {
    if (aba === 'chamaram') return 'chamaram';
    if (aba === 'outros') return ctx.R.colunaDesfecho(c);
    const s = ctx.R.statusPrazo(c);
    if (s !== 'respondidos') return s;
    return c.resultado === 'recebeu' ? 'recebido' : 'nao_recebido';
  }

  function corPrazo(venc) {
    const horas = (venc - new Date()) / 3600000;
    return horas <= 0 ? '#d0021b' : horas <= 24 ? '#b26a00' : '#666';
  }

  function cardHTML(c, aba) {
    const esc = ctx.esc;
    const nl = Number(c.nao_lidas) || 0;
    const selo = nl ? `<span class="xm-card-selo" title="Mensagens que você ainda não leu">${nl > 99 ? '99+' : nl}</span>` : '';
    const lida = nl ? '' : (c.lido_em ? ' · lida' : '');
    const por = c.enviado_por_nome ? ` · ${esc(c.enviado_por_nome)}` : '';
    let linha;
    if (aba === 'acareacao' && !c.respondido) {
      const venc = ctx.R.vencimento(c);
      const quando = venc.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      linha = `<div class="xm-card-linha" style="color:${corPrazo(venc)}">${ctx.R.tempoRestante(venc)} · ${quando}${por}</div>`
        + `<div class="xm-card-linha">${ctx.R.dataCurta(c.ultima)}${lida}</div>`;
    } else {
      linha = `<div class="xm-card-linha">${c.enviado_por_nome ? `${esc(c.enviado_por_nome)} · ` : ''}${ctx.R.dataCurta(c.ultima)}${lida}</div>`;
    }
    const reabrir = c.respondido ? '<button class="xm-link xm-card-reabrir" type="button" title="Tira a marcação: o card volta para Aguardando">Desfazer</button>' : '';
    const arrasta = aba === 'chamaram' ? '' : 'draggable="true"';
    return `<div class="xm-card${nl ? ' xm-nao-lida' : ''}" ${arrasta} data-numero="${esc(c.numero)}" data-pedido="${esc(c.pedido || '')}" data-resolvido="${c.respondido ? '1' : ''}" data-resultado="${esc(c.resultado || '')}">
      <div class="xm-card-cod">${esc(c.pedido || ctx.R.formatarNumero(c.numero))}</div>
      ${linha}${reabrir}${selo}
    </div>`;
  }

  function desenharLista() {
    if (!raiz || !est.logado) return;
    const contagem = { acareacao: 0, outros: 0, chamaram: 0 };
    est.dados.filter(casaBusca).forEach((c) => { const a = ctx.R.abaDe(c); if (a in contagem) contagem[a] += 1; });
    raiz.querySelectorAll('.xm-aba').forEach((b) => {
      b.classList.toggle('ativa', b.dataset.aba === est.aba);
      b.querySelector('.xm-n').textContent = ctx.numero(contagem[b.dataset.aba]);
    });
    if (est.chat) return; // a conversa aberta esconde o quadro
    const aba = est.aba;
    const daAba = est.dados.filter((c) => ctx.R.abaDe(c) === aba && casaBusca(c));
    const colunas = COLUNAS[aba];
    const grupos = Object.fromEntries(colunas.map((g) => [g.chave, []]));
    daAba.forEach((c) => { const k = colunaDe(c, aba); (grupos[k] = grupos[k] || []).push(c); });
    $('.xm-cv-quadro').innerHTML = colunas.map((g) => {
      const itens = grupos[g.chave];
      const chave = `${aba}:${g.chave}`;
      const total = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
      const pag = Math.min(Math.max(est.paginas[chave] || 1, 1), total);
      est.paginas[chave] = pag;
      const pagina = itens.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
      const drop = g.semDrop ? '' : ` xm-drop" data-resultado="${g.resultado || ''}`;
      return `<div class="xm-coluna${g.semDrop && itens.length && aba === 'outros' ? ' xm-destaque' : ''}">
        <div class="xm-coluna-topo"><span>${g.titulo}</span><span class="xm-coluna-n">${ctx.numero(itens.length)}</span></div>
        <div class="xm-coluna-cards${drop}">${pagina.map((c) => cardHTML(c, aba)).join('') || '<div class="xm-vazia">—</div>'}</div>
        ${total > 1 ? `<div class="xm-pag"><button type="button" data-pag="${chave}" data-delta="-1" ${pag <= 1 ? 'disabled' : ''}>‹</button>${pag}/${total}<button type="button" data-pag="${chave}" data-delta="1" ${pag >= total ? 'disabled' : ''}>›</button></div>` : ''}
      </div>`;
    }).join('');
  }

  async function resolver(corpo) {
    try {
      await sistema('POST', '/macros/whatsapp/resolver', corpo);
    } catch (e) { falhou(e); throw e; }
  }

  // ── conversa ───────────────────────────────────────────────────────────────────
  const NOME_RESULTADO = { recebeu: 'Entregue (recebeu)', nao_recebeu: 'Não entregue (não recebeu)' };

  function abrirConversa(numero, pedido, resolvido, resultado) {
    est.chat = { numero, pedido: pedido || '', resolvido };
    est.selecionadas.clear();
    $('.xm-cv-quadro').hidden = true;
    $('.xm-cv-cabeca').hidden = true; // a conversa usa a tela inteira
    $('.xm-cv-chat').hidden = false;
    $('.xm-cv-janela').hidden = true;
    $('.xm-cv-compor').hidden = false;
    $('.xm-cv-chat-titulo').textContent = pedido || ctx.R.formatarNumero(numero);
    $('.xm-cv-chat-sub').textContent = pedido ? ctx.R.formatarNumero(numero) : '';
    $('.xm-cv-resultado').hidden = !resolvido;
    $('.xm-cv-resultado-txt').textContent = NOME_RESULTADO[resultado] || 'respondido';
    $('.xm-cv-corpo').innerHTML = '<div class="xm-vazia">Carregando...</div>';
    desenharSelecao();
    carregarConversa(false, true);
    clearInterval(est.relogioChat);
    est.relogioChat = setInterval(() => carregarConversa(true), RELOGIO_CHAT_MS);
  }

  /** Fecha a conversa e mostra o quadro de novo (sem recarregar). */
  function fecharConversa() {
    clearInterval(est.relogioChat);
    est.chat = null;
    est.selecionadas.clear();
    $('.xm-cv-chat').hidden = true;
    $('.xm-cv-cabeca').hidden = false;
    $('.xm-cv-quadro').hidden = false;
  }

  function voltarParaLista() {
    fecharConversa();
    carregarLista(true);
  }

  function separadorDia(d) {
    const dia = d.toLocaleDateString('pt-BR');
    const hoje = new Date();
    const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
    if (d.toDateString() === hoje.toDateString()) return `Hoje · ${dia}`;
    if (d.toDateString() === ontem.toDateString()) return `Ontem · ${dia}`;
    return dia;
  }

  async function carregarConversa(silencioso, destacar) {
    if (!est.chat) return;
    const corpo = $('.xm-cv-corpo');
    try {
      const msgs = await sistema('GET', `/macros/whatsapp/conversa/${encodeURIComponent(est.chat.numero)}`);
      if (!est.chat) return;
      if (!Array.isArray(msgs) || !msgs.length) { corpo.innerHTML = '<div class="xm-vazia">Nenhuma mensagem.</div>'; return; }
      const rolagem = corpo.scrollTop;
      est.pedidoDaMsg = {};
      let diaAnterior = null;
      const esc = ctx.esc;
      corpo.innerHTML = msgs.map((m) => {
        if (m.pedido) est.pedidoDaMsg[m.id] = m.pedido;
        const d = new Date(m.criado_em);
        let sep = '';
        if (d.toDateString() !== diaAnterior) { diaAnterior = d.toDateString(); sep = `<div class="xm-dia">${separadorDia(d)}</div>`; }
        const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const autor = m.autor ? `<span class="xm-bolha-autor">${esc(m.autor)}</span>` : '';
        const check = m.direcao === 'enviada' ? ' ✓' : '';
        return `${sep}<div class="xm-bolha ${m.direcao === 'enviada' ? 'enviada' : 'recebida'}${est.selecionadas.has(m.id) ? ' xm-sel' : ''}" data-id="${esc(m.id)}"${m.pedido ? ` data-pedido="${esc(m.pedido)}"` : ''}>${autor}${esc(m.texto)}<span class="xm-bolha-hora" title="${d.toLocaleString('pt-BR')}">${hora}${check}</span></div>`;
      }).join('');
      corpo.scrollTop = silencioso ? rolagem : corpo.scrollHeight;
      // Regra do WhatsApp: resposta livre só até 24h depois da última mensagem do cliente.
      const recebidas = msgs.filter((m) => m.direcao !== 'enviada').map((m) => new Date(m.criado_em).getTime());
      const fechada = !recebidas.length || Date.now() - Math.max(...recebidas) > 24 * 3600000;
      $('.xm-cv-janela').hidden = !fechada;
      $('.xm-cv-compor').hidden = fechada;
      if (destacar && est.chat.pedido) {
        const alvo = [...corpo.querySelectorAll('.xm-bolha[data-pedido]')].find((b) => b.dataset.pedido === est.chat.pedido);
        if (alvo) { alvo.scrollIntoView({ block: 'center' }); alvo.classList.add('xm-pisca'); setTimeout(() => alvo.classList.remove('xm-pisca'), 2000); }
      }
    } catch (e) {
      if (!silencioso) corpo.innerHTML = `<div class="xm-vazia" style="color:#d0021b">${ctx.esc(e.message)}</div>`;
      if (e.conta) falhou(e);
    }
  }

  const codigosSelecionados = () => [...new Set([...est.selecionadas].map((id) => est.pedidoDaMsg[id] || est.chat.pedido).filter(Boolean))];

  function desenharSelecao() {
    raiz.querySelectorAll('.xm-cv-corpo .xm-bolha').forEach((b) => b.classList.toggle('xm-sel', est.selecionadas.has(b.dataset.id)));
    const n = est.selecionadas.size;
    $('.xm-cv-selecao').hidden = !n;
    if (!n) return;
    $('.xm-cv-sel-n').textContent = `${n} mensagem(ns) selecionada(s)`;
    raiz.querySelectorAll('.xm-cv-marcar').forEach((b) => { b.hidden = !est.chat || !est.chat.pedido; });
    const cods = codigosSelecionados();
    $('.xm-cv-copiar').hidden = !cods.length;
    $('.xm-cv-copiar').textContent = cods.length > 1 ? 'Copiar códigos' : 'Copiar código';
  }

  async function marcarPelaSelecao(resultado) {
    if (!est.chat || !est.selecionadas.size) return;
    try {
      await resolver({ pedido: est.chat.pedido, numero: est.chat.numero, resolvido: true, resultado, mensagem_ids: [...est.selecionadas] });
      voltarParaLista();
    } catch { /* falhou() ja avisou */ }
  }

  function copiarCodigos() {
    const texto = codigosSelecionados().join('\n');
    if (!texto) return;
    const pronto = () => { $('.xm-cv-copiar').textContent = 'Copiado!'; setTimeout(desenharSelecao, 1500); };
    navigator.clipboard.writeText(texto).then(pronto).catch(() => {
      const t = document.createElement('textarea');
      t.value = texto; t.style.cssText = 'position:fixed;opacity:0';
      document.body.append(t); t.select();
      try { document.execCommand('copy'); pronto(); } finally { t.remove(); }
    });
  }

  async function excluirSelecionadas() {
    const ids = [...est.selecionadas];
    if (!ids.length) return;
    if (!window.confirm(`Excluir ${ids.length} mensagem(ns) do histórico do sistema? No WhatsApp do cliente não muda nada.`)) return;
    try {
      await sistema('POST', '/macros/whatsapp/excluir-mensagens', { ids });
      est.selecionadas.clear();
      desenharSelecao();
      carregarConversa(true);
    } catch (e) { falhou(e); }
  }

  async function responder() {
    const campo = $('.xm-cv-texto');
    const texto = campo.value.trim();
    if (!texto || !est.chat) return;
    campo.disabled = true;
    $('.xm-cv-enviar').disabled = true;
    try {
      await sistema('POST', '/macros/whatsapp/responder', { numero: est.chat.numero, texto });
      campo.value = '';
      campo.style.height = 'auto';
      status('');
      await carregarConversa(true);
      const corpo = $('.xm-cv-corpo');
      corpo.scrollTop = corpo.scrollHeight;
    } catch (e) { falhou(e); } finally {
      campo.disabled = false;
      $('.xm-cv-enviar').disabled = false;
      campo.focus();
    }
  }

  // ── entrar e sair da pagina ────────────────────────────────────────────────────
  function pararRelogios() {
    clearInterval(est.relogioLista);
    clearInterval(est.relogioChat);
    est.relogioLista = null;
    est.relogioChat = null;
  }

  function aoMostrar() {
    ctx.pedirAoFundo('estado').then((r) => {
      mostrarConta(r.logado, r.nome, r.papel);
      if (!r.logado) return;
      // Clicar em "Conversas" no menu (mesmo com uma conversa aberta) volta para o quadro.
      if (est.chat) fecharConversa();
      carregarLista(!!est.dados.length);
      clearInterval(est.relogioLista);
      // A lista depende do relogio (prazo) e das respostas novas: refaz de minuto em minuto.
      est.relogioLista = setInterval(() => { if (!est.chat && !est.arrastando) carregarLista(true); }, RELOGIO_LISTA_MS);
    }).catch((e) => status(e.message, true));
  }

  function aoSair() { pararRelogios(); }

  /** Pelo aviso de mensagem nova: abre esta conversa assim que a lista chegar. */
  function abrirDepois(numero, pedido) { est.abrirDepois = { numero, pedido: pedido || '' }; }

  /** Chegou mensagem nova: atualiza o que estiver aberto, sem piscar. */
  function novidade(numeros) {
    if (!raiz || !raiz.isConnected || !est.logado) return;
    if (est.chat && numeros.some((n) => mesmoNumero(n, est.chat.numero))) carregarConversa(true);
    if (!est.chat && !est.arrastando) carregarLista(true);
  }

  self.XMAtivosConversas = { montar, aoMostrar, aoSair, abrirDepois, novidade };
})();
