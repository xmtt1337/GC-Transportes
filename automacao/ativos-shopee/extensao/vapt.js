// XM - Ativos Shopee: a pagina "Vapt Vupt" (Conferencia > Vapt Vupt), no tema do SPX.
//
// E a Conferencia Shopee da XM - Operacao, dentro do SPX: o romaneio de hoje (sistema, polo de
// quem enviou) contra a pesquisa em lote do SPX e as ATs criadas hoje. Mostra % AT vinculada,
// recebidos, divergencias (Recebido - Sem AT e Enviado - Nao recebido), fora de abrangencia,
// BWT de processamento, volume por cidade, fluxo hora a hora e a lista das divergencias, com o
// relatorio no formato do painel da Shopee.
//
// "Conferir agora": romaneio (GET /macros/shopee-conferencia/romaneio) -> spx.js pesquisa os BR e
// lista as ATs -> POST /leitura -> se houver divergencia, o export de pedidos da viagem (comprador
// e CEP) -> fundo.js -> POST /pedidos. As regras e a conta sao do sistema (modules/shopee-conferencia).
// Quem nao e dev nem admin ve so o proprio polo; dev e admin escolhem.

(() => {
  const POLOS = [['', 'Todos os polos'], ['cacador', 'Caçador'], ['videira', 'Videira'], ['joacaba', 'Joaçaba']];
  const XPT_DO_POLO = { cacador: 'XPT_SC_Caçador', videira: 'XPT_SC_Videira', joacaba: 'XPT_SC_Joaçaba' };
  const MAX_LISTA = 500;
  const DUAS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  const CSS = `
  .xm-ativos-pagina .xm-vv-barra { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .xm-ativos-pagina .xm-vv-barra select { height: 32px; border: 1px solid #e5e5e5; border-radius: 4px; padding: 0 8px; font: inherit; color: #333; background: #fff; }
  .xm-ativos-pagina .xm-vv-lido { color: #999; font-size: 12px; margin-left: auto; }
  .xm-ativos-pagina .xm-vv-cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 1300px) { .xm-ativos-pagina .xm-vv-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .xm-ativos-pagina .xm-vv-card { background: #fff; border-radius: 4px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(0,0,0,.04); min-width: 0; }
  .xm-ativos-pagina .xm-vv-rot { color: #666; font-size: 12px; }
  .xm-ativos-pagina .xm-vv-val { color: #333; font-size: 24px; font-weight: 500; line-height: 1.3; margin: 4px 0 2px; white-space: nowrap; }
  .xm-ativos-pagina .xm-vv-val.xm-atencao { color: #ee4d2d; }
  .xm-ativos-pagina .xm-vv-sub { color: #999; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .xm-ativos-pagina .xm-vv-trilho { height: 4px; background: #f0f0f0; border-radius: 2px; margin-top: 8px; overflow: hidden; }
  .xm-ativos-pagina .xm-vv-trilho i { display: block; height: 100%; background: #ee4d2d; }
  .xm-ativos-pagina .xm-vv-tres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  @media (max-width: 1100px) { .xm-ativos-pagina .xm-vv-tres { grid-template-columns: 1fr; } }
  .xm-ativos-pagina .xm-vv-tres .xm-cartao { margin-bottom: 0; }
  .xm-ativos-pagina .xm-vv-h { font-size: 15px; font-weight: 500; color: #333; margin: 0 0 2px; }
  .xm-ativos-pagina .xm-vv-hsub { color: #999; font-size: 12px; margin: 0 0 12px; }
  .xm-ativos-pagina .xm-vv-barras { display: grid; gap: 8px; }
  .xm-ativos-pagina .xm-vv-linha { display: grid; grid-template-columns: minmax(90px, 160px) minmax(0, 1fr) 48px; align-items: center; gap: 10px; font-size: 13px; color: #333; }
  .xm-ativos-pagina .xm-vv-linha.xm-clica { cursor: pointer; padding: 4px 6px; margin: 0 -6px; border-radius: 4px; }
  .xm-ativos-pagina .xm-vv-linha.xm-clica:hover, .xm-ativos-pagina .xm-vv-linha.xm-ativa { background: #fff7f4; }
  .xm-ativos-pagina .xm-vv-linha span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .xm-ativos-pagina .xm-vv-linha b { font-weight: 500; text-align: right; }
  .xm-ativos-pagina .xm-vv-t { height: 8px; background: #f0f0f0; border-radius: 4px; overflow: hidden; }
  .xm-ativos-pagina .xm-vv-t i { display: block; height: 100%; background: #ee4d2d; border-radius: 4px; }
  .xm-ativos-pagina .xm-vv-t.xm-cinza i { background: #b8c0c8; }
  .xm-ativos-pagina .xm-vv-vazio { color: #bbb; font-size: 13px; padding: 8px 0; }
  .xm-ativos-pagina .xm-vv-fluxo { overflow-x: auto; }
  .xm-ativos-pagina .xm-vv-fluxo table { border-collapse: separate; border-spacing: 4px; font-size: 12px; }
  .xm-ativos-pagina .xm-vv-fluxo th { color: #999; font-weight: 500; padding: 2px 6px; white-space: nowrap; }
  .xm-ativos-pagina .xm-vv-fluxo td { min-width: 46px; padding: 6px 4px; text-align: center; border-radius: 4px; color: #333; }
  .xm-ativos-pagina .xm-vv-fluxo td.xm-et { text-align: left; font-weight: 500; white-space: nowrap; padding-right: 10px; }
  .xm-ativos-pagina .xm-vv-fluxo td.xm-tot { font-weight: 500; background: #fafafa; }
  `;

  let ctx = null;
  let raiz = null;
  const est = { logado: false, papel: '', polo: '', dia: '', dados: null, tipo: 'sem_at', ocupado: false };
  const $ = (sel) => raiz.querySelector(sel);
  const esc = (v) => ctx.esc(v);
  const n = (v) => ctx.numero(v);
  const pct2 = (v) => `${Number(v || 0).toLocaleString('pt-BR', DUAS)}%`;
  const vePolos = () => ctx.R.ROLES_TODOS_POLOS.includes(est.papel);
  const sistema = (metodo, caminho, corpo) => ctx.pedirAoFundo('sistema', { metodo, caminho, corpo }).then((r) => r.dados);
  const comPolo = (caminho) => {
    const q = [];
    if (vePolos() && est.polo) q.push(`polo=${encodeURIComponent(est.polo)}`);
    return q.length ? `${caminho}${caminho.includes('?') ? '&' : '?'}${q.join('&')}` : caminho;
  };

  function montar(contexto) {
    ctx = contexto;
    if (!document.getElementById('xm-vapt-estilo')) {
      const s = document.createElement('style');
      s.id = 'xm-vapt-estilo';
      s.textContent = CSS;
      (document.head || document.documentElement).append(s);
    }
    raiz = document.createElement('div');
    raiz.className = 'xm-ativos-pagina';
    raiz.innerHTML = `
      <div class="xm-cartao">
        <span class="xm-conta xm-vv-conta"></span>
        <h2 class="xm-titulo">Vapt Vupt</h2>
        <p class="xm-sub">Romaneio de hoje contra o SPX: AT vinculada, recebidos e divergências. Os mesmos números da Conferência do sistema XMTT.</p>
        <div class="xm-vv-login" hidden></div>
        <div class="xm-vv-barra" hidden>
          <select class="xm-vv-polo" hidden>${POLOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
          <select class="xm-vv-dia" title="Dia da conferência"></select>
          <button class="xm-btn xm-btn-primario xm-vv-conferir" type="button">Conferir agora</button>
          <button class="xm-btn xm-vv-baixar" type="button">Baixar relatório</button>
          <span class="xm-vv-lido"></span>
        </div>
        <p class="xm-status xm-vv-status"></p>
      </div>
      <div class="xm-vv-corpo" hidden>
        <div class="xm-vv-cards"></div>
        <div class="xm-vv-tres">
          <div class="xm-cartao"><h3 class="xm-vv-h">Divergências — Detalhamento</h3><p class="xm-vv-hsub">Pacotes fora de "AT vinculada". Clique para ver a lista.</p><div class="xm-vv-barras xm-vv-tipos"></div></div>
          <div class="xm-cartao"><h3 class="xm-vv-h">Divergências — Localização</h3><p class="xm-vv-hsub">Divergências por cidade</p><div class="xm-vv-barras xm-vv-loc"></div></div>
          <div class="xm-cartao"><h3 class="xm-vv-h">Volume — Abrangência</h3><p class="xm-vv-hsub xm-vv-volsub"></p><div class="xm-vv-barras xm-vv-vol"></div></div>
        </div>
        <div class="xm-cartao"><h3 class="xm-vv-h">Fluxo hora a hora</h3><p class="xm-vv-hsub">Recebimento no XPT, atribuição (AT) e expedição, por hora</p><div class="xm-vv-fluxo"></div></div>
        <div class="xm-cartao">
          <div class="xm-cabecalho"><h3 class="xm-vv-h xm-vv-lista-tit" style="margin:0"></h3><button class="xm-btn xm-vv-copiar" type="button">Copiar BR</button></div>
          <div class="xm-tabela-caixa"><table class="xm-tabela">
            <thead><tr><th>SPX Tracking Number</th><th>TO</th><th>Cidade</th><th>Bairro</th><th>Cluster</th><th>Motorista / AT</th><th>Localização atual</th></tr></thead>
            <tbody class="xm-vv-linhas"></tbody>
          </table></div>
        </div>
      </div>`;
    $('.xm-vv-conferir').addEventListener('click', conferir);
    $('.xm-vv-baixar').addEventListener('click', baixarRelatorio);
    $('.xm-vv-copiar').addEventListener('click', copiarBR);
    $('.xm-vv-polo').addEventListener('change', (e) => {
      est.polo = e.target.value;
      try { chrome.storage.local.set({ poloVapt: est.polo }); } catch { /* sem guardar, segue */ }
      est.dia = '';
      carregar();
    });
    $('.xm-vv-dia').addEventListener('change', (e) => { est.dia = e.target.value; carregar(); });
    $('.xm-vv-tipos').addEventListener('click', (e) => {
      const l = e.target.closest('[data-tipo]');
      if (!l) return;
      est.tipo = l.dataset.tipo;
      desenhar();
    });
    return raiz;
  }

  // ── conta ──────────────────────────────────────────────────────────────────────
  function status(texto, erro = false) {
    const p = $('.xm-vv-status');
    p.textContent = texto;
    p.className = `xm-status xm-vv-status${erro ? ' xm-erro' : ''}`;
  }

  function mostrarConta(logado, nome, papel) {
    est.logado = logado;
    est.papel = papel || '';
    $('.xm-vv-login').hidden = logado;
    $('.xm-vv-barra').hidden = !logado;
    if (!logado) {
      $('.xm-vv-login').replaceChildren(ctx.blocoLogin((r) => { ctx.aoEntrar(r); mostrarConta(true, r.nome, r.papel); carregar(); }));
      $('.xm-vv-corpo').hidden = true;
      $('.xm-vv-conta').textContent = '';
      return;
    }
    $('.xm-vv-polo').hidden = !vePolos();
    $('.xm-vv-conta').innerHTML = `${esc(nome)} · <button class="xm-link xm-vv-sair" type="button">Sair</button>`;
    $('.xm-vv-sair').addEventListener('click', () => ctx.pedirAoFundo('sair').then(() => { ctx.aoEntrar(null); mostrarConta(false); status(''); }));
  }

  function falhou(e) {
    if (e.conta) mostrarConta(false);
    status(e.message, true);
  }

  // ── dados ──────────────────────────────────────────────────────────────────────
  async function carregar() {
    if (!est.logado) return;
    try {
      const caminho = comPolo(`/macros/shopee-conferencia${est.dia ? `?dia=${encodeURIComponent(est.dia)}` : ''}`);
      const r = await sistema('GET', caminho);
      mostrar(r);
      if (!r || !r.dia) status('Nenhuma conferência ainda. Clique em Conferir agora.');
    } catch (e) { falhou(e); }
  }

  function mostrar(r) {
    est.dados = r || null;
    const dias = (r && r.dias) || [];
    const dia = (r && r.dia) || '';
    if (dia) est.dia = dia;
    const sel = $('.xm-vv-dia');
    const opcoes = [...new Set([...(r && r.hoje ? [r.hoje] : []), ...dias])];
    sel.innerHTML = opcoes.map((d) => `<option value="${d}"${d === dia ? ' selected' : ''}>${d.split('-').reverse().join('/')}</option>`).join('');
    sel.hidden = !opcoes.length;
    const l = r && r.leitura;
    $('.xm-vv-lido').textContent = l && l.lido_em
      ? `lido às ${new Date(l.lido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${l.usuario ? ` por ${l.usuario}` : ''}` : '';
    $('.xm-vv-corpo').hidden = !(r && r.total);
    if (r && r.total) desenhar();
  }

  function duracao(ini, fim) {
    if (!ini || !fim || fim <= ini) return '—';
    const min = Math.round((fim - ini) / 60);
    return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min`;
  }
  const hora = (seg) => (seg ? new Date(seg * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '');

  function card(rotulo, valor, sub, extra = '', atencao = false) {
    return `<div class="xm-vv-card"><div class="xm-vv-rot">${rotulo}</div><div class="xm-vv-val${atencao ? ' xm-atencao' : ''}">${valor}</div><div class="xm-vv-sub" title="${esc(sub)}">${esc(sub)}</div>${extra}</div>`;
  }

  function linhaBarra(rotulo, qtd, maior, { tipo, cinza, ativa, direita } = {}) {
    const larg = maior ? Math.max(2, Math.round((qtd / maior) * 100)) : 0;
    return `<div class="xm-vv-linha${tipo ? ' xm-clica' : ''}${ativa ? ' xm-ativa' : ''}"${tipo ? ` data-tipo="${tipo}"` : ''}>
      <span title="${esc(rotulo)}">${esc(rotulo)}</span><div class="xm-vv-t${cinza ? ' xm-cinza' : ''}"><i style="width:${larg}%"></i></div><b>${direita != null ? direita : n(qtd)}</b></div>`;
  }

  function desenhar() {
    const r = est.dados;
    if (!r || !r.total) return;
    const semAt = r.recebido_sem_at || [];
    const naoRec = r.nao_recebido || [];
    const p = r.processamento || {};
    const tipos = (semAt.length ? 1 : 0) + (naoRec.length ? 1 : 0);
    const foraTxt = r.fora_abrangencia ? (r.fora || []).slice(0, 2).map((f) => f.cidade).join(', ') : 'nenhum pacote';
    $('.xm-vv-cards').innerHTML = [
      card('% AT vinculada', pct2(r.pct_at), `${n(r.em_at)} / ${n(r.total)} pacotes`, `<div class="xm-vv-trilho"><i style="width:${Math.min(100, Number(r.pct_at) || 0)}%"></i></div>`),
      card('Total de pacotes', n(r.total), 'no romaneio'),
      card('Pacotes recebidos', n(r.recebidos), `${pct2(r.pct_recebidos)} do romaneio`),
      card('Divergências', n(r.divergencias), `${tipos} tipo(s) · ${pct2(r.total ? Math.floor((r.divergencias * 10000) / r.total) / 100 : 0)} do romaneio`, '', r.divergencias > 0),
      card('Fora de abrangência', n(r.fora_abrangencia), foraTxt, '', r.fora_abrangencia > 0),
      card('BWT processamento', duracao(p.inicio, p.fim), p.inicio && p.fim ? `${hora(p.inicio)} → ${hora(p.fim)}` : 'sem horário ainda'),
    ].join('');

    // Detalhamento por tipo
    const maiorTipo = Math.max(semAt.length, naoRec.length);
    const pctDe = (q) => (r.divergencias ? `${Math.floor((q * 100) / r.divergencias)}%` : '0%');
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

    // Volume: dentro e fora da abrangência + as cidades das ATs
    const totalAt = (r.dentro || 0) + (r.fora_abrangencia || 0);
    $('.xm-vv-volsub').textContent = `${n(totalAt)} pacotes nas ATs · ${pct2(totalAt ? Math.floor(((r.dentro || 0) * 10000) / totalAt) / 100 : 0)} dentro da abrangência`;
    const vol = (r.porCidade || []).slice(0, 8);
    const maiorVol = Math.max(0, ...vol.map((c) => c.total));
    $('.xm-vv-vol').innerHTML = vol.length
      ? vol.map((c) => linhaBarra(`${c.cidade}${c.fora ? ' (fora)' : ''}`, c.total, maiorVol, { cinza: !c.fora })).join('')
      : '<div class="xm-vv-vazio">Nenhuma AT de hoje com BR do romaneio.</div>';

    desenharFluxo(r.fluxo);
    desenharLista();
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

  const itensDoTipo = () => (est.dados ? (est.tipo === 'sem_at' ? est.dados.recebido_sem_at : est.dados.nao_recebido) || [] : []);

  function desenharLista() {
    const itens = itensDoTipo();
    $('.xm-vv-lista-tit').textContent = `${est.tipo === 'sem_at' ? 'Recebido - Sem AT' : 'Enviado - Não recebido'} (${n(itens.length)})`;
    $('.xm-vv-linhas').innerHTML = itens.length ? itens.slice(0, MAX_LISTA).map((d) => `<tr>
      <td class="xm-cod">${esc(d.codigo)}</td><td>${esc(d.to || '—')}</td><td>${esc(d.cidade || '—')}</td><td>${esc(d.bairro || '—')}</td>
      <td>${esc(d.cluster || '—')}</td><td>${esc([d.motorista, d.at].filter(Boolean).join(' · ') || '—')}</td>
      <td>${esc(d.achado_no_spx === false ? 'não achado no SPX' : (d.estacao || '—'))}</td></tr>`).join('')
      : '<tr><td colspan="7" style="color:#bbb;text-align:center">Nenhum.</td></tr>';
  }

  // ── conferir agora ─────────────────────────────────────────────────────────────
  async function conferir() {
    if (est.ocupado || !est.logado) return;
    est.ocupado = true;
    $('.xm-vv-conferir').disabled = true;
    try {
      status('Pegando o romaneio de hoje no sistema...');
      const rom = await sistema('GET', comPolo('/macros/shopee-conferencia/romaneio'));
      if (!rom.codigos || !rom.codigos.length) throw new Error('Nenhum BR no romaneio de hoje deste polo. Alimente o Romaneiro no sistema primeiro.');
      const res = await ctx.pedirAoSpx('buscar', { codigos: rom.consultar || rom.codigos }, status);
      status(`Mandando ao sistema (${n(res.rastreio.length)} BR, ${n(res.ats.length)} ATs)...`);
      let resumo = await sistema('POST', comPolo('/macros/shopee-conferencia/leitura'), { rastreio: res.rastreio, ats: res.ats });
      est.dia = resumo.dia || est.dia;
      mostrar(resumo);
      // Comprador e CEP das divergências: o export de pedidos da viagem (o mesmo do botão Export do
      // Order Tracking), lido por dentro. Se falhar, a conferência vale do mesmo jeito.
      const divergentes = [...(resumo.recebido_sem_at || []), ...(resumo.nao_recebido || [])].map((d) => d.codigo);
      let aviso = '';
      if (divergentes.length) {
        try {
          status('Pedindo ao SPX o export de pedidos da viagem (comprador e CEP das divergências)...');
          const viagem = [...new Set([...divergentes, ...rom.codigos])].slice(0, 10000);
          const exp = await ctx.pedirAoSpx('exportar', { codigos: viagem }, status);
          const p = await ctx.pedirAoFundo('pedidosConferencia', { url: exp.url, polo: vePolos() ? est.polo : '', divergentes });
          resumo = p.resumo;
          mostrar(resumo);
        } catch (e) {
          aviso = `Conferência pronta, mas o relatório ficou sem comprador e CEP: ${e.message}`;
        }
      }
      status(aviso, !!aviso);
    } catch (e) {
      falhou(e);
    } finally {
      est.ocupado = false;
      $('.xm-vv-conferir').disabled = false;
    }
  }

  // ── relatório e copiar ─────────────────────────────────────────────────────────
  const celula = (v) => { const t = String(v == null || v === '' ? '—' : v); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

  function baixarRelatorio() {
    const r = est.dados;
    if (!r || !r.divergencias) return status('Nenhuma divergência para baixar.');
    const manifesto = XPT_DO_POLO[r.polo] || 'Todos os polos';
    const cab = ['Manifesto/Operação', 'Tracking Number', 'Número da TO', 'Comprador', 'Cidade', 'Bairro', 'Cluster', 'Motorista', 'AT (rota)', 'Localização atual', 'Status'];
    const linhas = [
      ...(r.recebido_sem_at || []).map((d) => [manifesto, d.codigo, d.to, d.comprador, d.cidade, d.bairro, d.cluster, d.motorista, '', d.estacao, 'Recebido - Sem AT']),
      ...(r.nao_recebido || []).map((d) => [manifesto, d.codigo, d.to, d.comprador, d.cidade, d.bairro, d.cluster, d.motorista, d.at,
        d.achado_no_spx ? d.estacao : 'não achado no SPX', /^soc/i.test(d.estacao || '') ? 'Enviado SOC - Não recebido' : 'Enviado - Não recebido']),
    ];
    const texto = String.fromCharCode(0xfeff) + [cab.join(';'), ...linhas.map((l) => l.map(celula).join(';'))].join('\r\n');
    const [ano, mes, dia] = String(r.dia || '').split('-');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    a.download = `${dia}-${mes}-${ano}_${XPT_DO_POLO[r.polo] || 'Todos'}_Divergências.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status(`Relatório com ${n(r.divergencias)} divergência(s) baixado.`);
  }

  function copiarBR() {
    const texto = itensDoTipo().map((d) => d.codigo).join('\n');
    if (!texto) return status('Nada para copiar.');
    const pronto = () => status(`${n(itensDoTipo().length)} BR copiado(s).`);
    navigator.clipboard.writeText(texto).then(pronto).catch(() => {
      const t = document.createElement('textarea');
      t.value = texto; t.style.cssText = 'position:fixed;opacity:0';
      document.body.append(t); t.select();
      try { document.execCommand('copy'); pronto(); } finally { t.remove(); }
    });
  }

  // ── entrar e sair da pagina ────────────────────────────────────────────────────
  function aoMostrar() {
    ctx.pedirAoFundo('estado').then(async (r) => {
      if (r.logado && ctx.R.ROLES_TODOS_POLOS.includes(r.papel)) {
        try { est.polo = (await chrome.storage.local.get('poloVapt')).poloVapt || ''; } catch { est.polo = ''; }
        $('.xm-vv-polo').value = est.polo;
      }
      mostrarConta(r.logado, r.nome, r.papel);
      if (r.logado) carregar();
    }).catch((e) => status(e.message, true));
  }

  function aoSair() {}

  self.XMAtivosVapt = { montar, aoMostrar, aoSair };
})();
