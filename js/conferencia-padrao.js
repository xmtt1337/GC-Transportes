// Conferência do dia — a TELA PADRÃO das conferências das transportadoras (desde 24/11/2026: Anjun e
// iMile; Loggi e Shopee entram depois).
//
// ARQUIVO IGUAL em dois lugares (os testes conferem):
//   automacao/xm-conferencias/extensao/padrao/conferencia-padrao.js   (no XMTT dos portais)
//   meusite/js/conferencia-padrao.js                                  (Operação › transportadora › Conferência)
//
// Desenha a resposta do sistema (/macros/<transportadora>-conferencia, que vem da conta padrão em
// sistema-backend/modules/conferencia-padrao): os números do dia; as abas Por cidade, Por
// entregador, Atribuídos errado, Na base e Certos; e o "Visualizar", um card por cima com os
// pedidos daquele recorte, filtro por situação, busca e Copiar.
//
// Não busca nada sozinho: quem usa passa as ações (tirar/voltar uma cidade da conta, abrir o
// entregador) e as cores, em variáveis --xcp-* no tema de cada lugar (portal da Anjun, DS da iMile,
// sistema). Nada de dado real aqui: o site é público.

(function (global) {
  'use strict';

  // Situação de cada pedido (status da conta) → grupo da tela.
  const GRUPOS = {
    ok: 'certo', cidade_errada: 'errado', usuario_sem_cidade: 'errado', sem_cidade: 'errado',
    sem_entregador: 'base', fora_abrangencia: 'fora', a_caminho: 'caminho',
  };
  const NOME_GRUPO = { todos: 'Todos', certo: 'Certos', errado: 'Errados', base: 'Na base', fora: 'Fora de abrangência', caminho: 'A caminho' };
  const ORDEM_GRUPO = ['certo', 'errado', 'base', 'fora', 'caminho'];
  const MAX_LINHAS = 300;

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const numero = (n) => Number(n || 0).toLocaleString('pt-BR');
  // 2 casas, para baixo: 99,996% não vira 100,00%.
  const pctDe = (a, t) => (t ? Math.floor((a * 10000) / t) / 100 : 0);
  const pct = (v) => `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const chave = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const porNome = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR');
  const grupoDe = (p) => GRUPOS[p.status] || 'errado';

  /** Pedidos da resposta (sistema antigo, sem "pacotes": só as pendências). */
  const pacotesDe = (r) => (r && Array.isArray(r.pacotes) ? r.pacotes : (r && r.pendentes) || []);

  /** Cidades que o entregador faz, pelo cadastro (resposta.entregadores). */
  function cidadesDo(r, entregador) {
    const k = chave(entregador);
    const e = ((r && r.entregadores) || []).find((x) => chave(x.usuario) === k);
    return e ? e.cidades || [] : null;
  }

  /** Quem faz a cidade no cadastro (resposta.quemFaz). */
  const quemFaz = (r, cidade) => ((r && r.quemFaz) || {})[cidade] || [];

  /** {texto, tipo} da situação de um pedido. tipo: certo | errado | base | fora. */
  function situacao(p, r) {
    switch (p.status) {
      case 'ok': return { texto: 'Certo', tipo: 'certo' };
      case 'cidade_errada': {
        const faz = cidadesDo(r, p.entregador);
        return { texto: faz && faz.length ? `Errado · ele faz ${faz.join(', ')}` : 'Cidade errada', tipo: 'errado' };
      }
      case 'usuario_sem_cidade': return { texto: 'Entregador sem cidade cadastrada', tipo: 'errado' };
      case 'sem_cidade': return { texto: 'Pedido sem cidade', tipo: 'errado' };
      case 'sem_entregador': return { texto: 'Na base, sem entregador', tipo: 'base' };
      case 'fora_abrangencia': return { texto: 'Fora de abrangência', tipo: 'fora' };
      case 'a_caminho': return { texto: 'A caminho', tipo: 'fora' }; // o status da transportadora fica na coluna dele
      default: return { texto: p.status || '—', tipo: 'fora' };
    }
  }

  function contar(pacotes) {
    const c = { todos: pacotes.length, certo: 0, errado: 0, base: 0, fora: 0, caminho: 0 };
    for (const p of pacotes) c[grupoDe(p)] += 1;
    return c;
  }

  /** Por cidade (sem os fora de abrangência): total, certos, errados e na base. Pendência primeiro. */
  function porCidade(pacotes) {
    const m = new Map();
    for (const p of pacotes) {
      const g = grupoDe(p);
      if (g === 'fora' || g === 'caminho') continue;
      const nome = p.cidade || '(sem cidade)';
      const c = m.get(nome) || { cidade: nome, total: 0, certo: 0, errado: 0, base: 0 };
      c.total += 1;
      c[g] += 1;
      m.set(nome, c);
    }
    return [...m.values()].sort((a, b) => (b.errado + b.base) - (a.errado + a.base) || b.total - a.total || porNome(a.cidade, b.cidade));
  }

  /** Cidades fora de abrangência e quantos pedidos de cada. */
  function foraPorCidade(pacotes) {
    const m = new Map();
    for (const p of pacotes) if (grupoDe(p) === 'fora') m.set(p.cidade || '(sem cidade)', (m.get(p.cidade || '(sem cidade)') || 0) + 1);
    return [...m].map(([cidade, total]) => ({ cidade, total })).sort((a, b) => b.total - a.total || porNome(a.cidade, b.cidade));
  }

  /** Por entregador (só quem tem pedido): total, certos, errados e as cidades do cadastro. */
  function porEntregador(pacotes, r) {
    const m = new Map();
    for (const p of pacotes) {
      if (!p.entregador || grupoDe(p) === 'caminho') continue;
      const k = chave(p.entregador);
      const e = m.get(k) || { entregador: p.entregador, total: 0, certo: 0, errado: 0, fora: 0, cidades: cidadesDo(r, p.entregador) };
      e.total += 1;
      const g = grupoDe(p);
      if (g === 'certo' || g === 'errado' || g === 'fora') e[g] += 1;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.errado - a.errado || b.total - a.total || porNome(a.entregador, b.entregador));
  }

  /** Os errados agrupados por entregador (quem tem mais erro primeiro). */
  function erradosPorEntregador(pacotes) {
    const m = new Map();
    for (const p of pacotes) {
      if (grupoDe(p) !== 'errado') continue;
      const k = chave(p.entregador);
      const g = m.get(k) || { entregador: p.entregador || '', pacotes: [] };
      g.pacotes.push(p);
      m.set(k, g);
    }
    const lista = [...m.values()];
    lista.forEach((g) => g.pacotes.sort((a, b) => porNome(a.cidade, b.cidade) || porNome(a.waybill, b.waybill)));
    return lista.sort((a, b) => b.pacotes.length - a.pacotes.length || porNome(a.entregador, b.entregador));
  }

  /** Busca por waybill, cidade, entregador e pelos campos extras. */
  function buscar(pacotes, busca, extras = []) {
    const b = chave(busca);
    if (!b) return pacotes;
    return pacotes.filter((p) => [p.waybill, p.cidade, p.entregador, ...extras.map((x) => p[x.campo])].some((v) => chave(v).includes(b)));
  }

  /** Valor de um campo extra na tela. */
  function formatar(valor, formato) {
    if (valor == null || valor === '') return '';
    if (formato === 'hora') { const m = String(valor).match(/(\d{2}:\d{2})/); return m ? m[1] : String(valor); }
    if (formato === 'moeda') { const n = Number(valor); return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(valor); }
    return String(valor);
  }

  // ── estilo (cores pelas variáveis --xcp-*; o padrão abaixo é claro) ─────────────────
  const CSS = `
  .xcp, .xcp-fundo {
    --xcp-texto: #1d2129; --xcp-sub: #86909c; --xcp-borda: #e4e5ed; --xcp-cartao: #fff; --xcp-janela: #fff;
    --xcp-cabecalho: #f6f7fa; --xcp-linha: #f0f1f5; --xcp-hover: #f8f9fc; --xcp-destaque: #2546ff;
    --xcp-ok: #00b42a; --xcp-base: #d25f00; --xcp-erro: #f53f3f; --xcp-trilho: #f2f3f5; --xcp-campo: #fff;
    --xcp-veu: rgba(29, 33, 41, .45); --xcp-raio: 8px; --xcp-sombra: none;
  }
  .xcp { color: var(--xcp-texto); font-size: 14px; line-height: 1.5; min-width: 0; }
  .xcp *, .xcp-fundo * { box-sizing: border-box; }
  .xcp [hidden], .xcp-fundo [hidden] { display: none !important; }
  .xcp-cartoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 8px; }
  .xcp-cartao { background: var(--xcp-cartao); border: 1px solid var(--xcp-borda); border-radius: var(--xcp-raio); box-shadow: var(--xcp-sombra); padding: 16px 18px; min-width: 0; }
  .xcp-kpi small { display: block; color: var(--xcp-sub); font-size: 12px; }
  .xcp-kpi strong { display: block; font-size: 24px; font-weight: 600; line-height: 1.3; font-variant-numeric: tabular-nums; }
  .xcp-kpi .xcp-detalhe { display: block; color: var(--xcp-sub); font-size: 12px; margin-top: 2px; }
  .xcp-kpi-rua { display: flex; gap: 14px; align-items: center; grid-column: span 2; }
  @media (max-width: 760px) { .xcp-kpi-rua { grid-column: auto; } }
  /* o anel e recortado por mascara: funciona em qualquer fundo (cartao transparente no sistema) */
  .xcp-pizza { --pct: 0; position: relative; flex: none; width: 84px; height: 84px; display: grid; place-items: center; }
  .xcp-pizza::before { content: ''; position: absolute; inset: 0; border-radius: 50%;
    background: conic-gradient(var(--xcp-ok) calc(var(--pct) * 1%), var(--xcp-trilho) 0);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 11px), #000 calc(100% - 10px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 11px), #000 calc(100% - 10px)); }
  .xcp-pizza b { position: relative; font-size: 14px; font-variant-numeric: tabular-nums; }
  .xcp-t-certo { color: var(--xcp-ok); } .xcp-t-errado { color: var(--xcp-erro); } .xcp-t-base { color: var(--xcp-base); } .xcp-t-fora { color: var(--xcp-sub); }
  .xcp-link { background: none; border: 0; padding: 0; font: inherit; font-size: 12px; color: var(--xcp-destaque); cursor: pointer; }
  .xcp-link:hover { text-decoration: underline; }
  .xcp-info { color: var(--xcp-sub); font-size: 12px; margin: 0 0 12px; }
  .xcp-abas { display: flex; flex-wrap: wrap; align-items: center; gap: 0 20px; border-bottom: 1px solid var(--xcp-borda); margin: -6px 0 12px; }
  .xcp-aba { background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 10px 0 8px; font: inherit; font-size: 13px; color: var(--xcp-sub); cursor: pointer; white-space: nowrap; }
  .xcp-aba:hover { color: var(--xcp-texto); }
  .xcp-aba.xcp-sel { color: var(--xcp-destaque); border-bottom-color: var(--xcp-destaque); font-weight: 500; }
  .xcp-aba em { font-style: normal; margin-left: 4px; font-variant-numeric: tabular-nums; }
  .xcp-ferramentas { margin-left: auto; display: flex; gap: 10px; align-items: center; padding: 6px 0; }
  .xcp-busca { height: 30px; width: 240px; max-width: 100%; border: 1px solid var(--xcp-borda); border-radius: 6px; padding: 0 10px; font: inherit; font-size: 13px; background: var(--xcp-campo); color: var(--xcp-texto); outline: none; }
  .xcp-busca:focus { border-color: var(--xcp-destaque); }
  .xcp-aviso { color: var(--xcp-sub); font-size: 12px; }
  .xcp-tabela-caixa { max-height: 60vh; overflow: auto; border: 1px solid var(--xcp-borda); border-radius: 6px; }
  table.xcp-tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
  .xcp-tabela th { position: sticky; top: 0; z-index: 1; background: var(--xcp-cabecalho); color: var(--xcp-sub); font-weight: 500; text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--xcp-borda); white-space: nowrap; }
  .xcp-tabela td { padding: 8px 12px; border-bottom: 1px solid var(--xcp-linha); white-space: nowrap; }
  .xcp-tabela tr:hover td { background: var(--xcp-hover); }
  .xcp-tabela .xcp-num { text-align: right; font-variant-numeric: tabular-nums; }
  .xcp-tabela .xcp-cod { font-variant-numeric: tabular-nums; }
  .xcp-tabela .xcp-quebra { white-space: normal; min-width: 160px; }
  .xcp-tabela tr.xcp-grupo td { background: var(--xcp-cabecalho); font-weight: 500; white-space: normal; }
  .xcp-tabela tr.xcp-grupo td span { color: var(--xcp-sub); font-weight: 400; }
  .xcp-trilho { display: flex; width: 160px; height: 8px; border-radius: 4px; overflow: hidden; background: var(--xcp-trilho); }
  .xcp-trilho i { display: block; height: 100%; }
  .xcp-b-certo { background: var(--xcp-ok); } .xcp-b-errado { background: var(--xcp-erro); } .xcp-b-base { background: var(--xcp-base); }
  .xcp-legenda { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--xcp-sub); margin: 10px 0 0; }
  .xcp-legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .xcp-nota { color: var(--xcp-sub); font-size: 12px; margin-top: 10px; }
  .xcp-vazio { color: var(--xcp-sub); font-size: 13px; padding: 10px 0; }
  .xcp-mais { color: var(--xcp-sub); font-size: 12px; margin-top: 8px; }
  .xcp-fundo { position: fixed; inset: 0; z-index: 2147483000; background: var(--xcp-veu); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .xcp-janela { width: min(1100px, 100%); max-height: 86vh; display: flex; flex-direction: column; background: var(--xcp-janela); color: var(--xcp-texto);
    border: 1px solid var(--xcp-borda); border-radius: 12px; box-shadow: 0 12px 40px rgba(0, 0, 0, .25); padding: 18px 20px; font-size: 14px; line-height: 1.5; }
  .xcp-janela-topo { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
  .xcp-janela-topo h3 { margin: 0; font-size: 16px; font-weight: 600; }
  .xcp-janela-topo span { color: var(--xcp-sub); font-size: 12px; }
  .xcp-fechar { margin-left: auto; background: none; border: 0; font-size: 20px; line-height: 1; color: var(--xcp-sub); cursor: pointer; padding: 0 4px; }
  .xcp-fechar:hover { color: var(--xcp-texto); }
  .xcp-janela .xcp-abas { margin: 4px 0 12px; }
  .xcp-janela .xcp-tabela-caixa { max-height: none; flex: 1; min-height: 0; }
  `;

  function colocarEstilo(doc) {
    if (doc.getElementById('xcp-estilo')) return;
    const s = doc.createElement('style');
    s.id = 'xcp-estilo';
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  // ── a tela ─────────────────────────────────────────────────────────────────────────
  /**
   * @param {HTMLElement} raiz  onde desenhar
   * @param {object} opcoes
   *   tema        {'--xcp-texto': ..., ...}  cores do lugar
   *   extras      [{campo, titulo, formato: 'hora'|'moeda'}]  colunas a mais nas listas
   *   rotulos     {naRua, aCaminho}
   *   info(r)     texto da linha de baixo dos números (recebidos, polo, quem leu...)
   *   aoIgnorar(cidade, tirar)  "tirar"/"voltar" uma cidade da conta (sem ele, não aparece)
   *   aoEntregador(nome)        clicar no entregador (sem ele, o nome é só texto)
   *   copiar(texto)             (padrão: área de transferência)
   * @return {{mostrar(resumo), fecharJanela()}}
   */
  function criar(raiz, opcoes = {}) {
    const doc = raiz.ownerDocument;
    colocarEstilo(doc);
    const tema = opcoes.tema || {};
    const extras = opcoes.extras || [];
    const rot = { naRua: 'Na rua', aCaminho: 'A caminho', ...(opcoes.rotulos || {}) };
    const pintar = (el) => Object.entries(tema).forEach(([k, v]) => el.style.setProperty(k, v));
    const copiarTexto = opcoes.copiar || ((t) => global.navigator.clipboard.writeText(t));
    raiz.classList.add('xcp');
    pintar(raiz);
    const estado = { r: null, aba: 'cidade', busca: '', janela: null, fundo: null };

    const ver = (tipo, valor, texto = 'Visualizar') => `<button type="button" class="xcp-link" data-ver="${esc(tipo)}" data-valor="${esc(valor)}">${esc(texto)}</button>`;
    const nomeEnt = (nome) => (opcoes.aoEntregador && nome
      ? `<button type="button" class="xcp-link" style="font-size:inherit" data-ent="${esc(nome)}" title="Ver e corrigir as cidades dele">${esc(nome)}</button>` : esc(nome || '—'));
    const thExtras = () => extras.map((x) => `<th>${esc(x.titulo)}</th>`).join('');
    const tdExtras = (p) => extras.map((x) => `<td${x.formato === 'moeda' ? ' class="xcp-num"' : ''}>${esc(formatar(p[x.campo], x.formato))}</td>`).join('');
    const tabela = (cab, linhas) => `<div class="xcp-tabela-caixa"><table class="xcp-tabela"><thead><tr>${cab}</tr></thead><tbody>${linhas}</tbody></table></div>`;
    const mais = (n) => (n > MAX_LINHAS ? `<div class="xcp-mais">Mostrando ${numero(MAX_LINHAS)} de ${numero(n)}. "Copiar" leva todos.</div>` : '');
    const corDe = (tipo) => `xcp-t-${tipo}`;

    // ── números do dia ──
    function cartoes(r, c) {
      const nossos = r.nossos != null ? r.nossos : c.todos - c.fora;
      const expedidos = r.expedidos != null ? r.expedidos : nossos - c.base;
      const certos = r.certos != null ? r.certos : c.certo;
      const pRua = r.pct_expedido != null ? r.pct_expedido : pctDe(expedidos, nossos);
      const pCerto = r.pct_certo != null ? r.pct_certo : pctDe(certos, expedidos);
      const naBase = nossos - expedidos;
      const errados = expedidos - certos;
      const fora = (r.contagem && r.contagem.fora_abrangencia) || c.fora;
      const caminho = r.a_caminho ? r.a_caminho.total || 0 : null;
      return `<div class="xcp-cartoes">
        <div class="xcp-cartao xcp-kpi xcp-kpi-rua">
          <div class="xcp-pizza" style="--pct:${Math.min(100, Number(pRua) || 0)}"><b>${nossos ? pct(pRua) : '—'}</b></div>
          <div><small>${esc(rot.naRua)}</small><strong class="${nossos && !naBase ? 'xcp-t-certo' : ''}">${numero(expedidos)} de ${numero(nossos)}</strong>
            <span class="xcp-detalhe">${naBase ? `<span class="xcp-t-base">${numero(naBase)} na base, sem entregador</span> · ${ver('grupo', 'base')}` : (nossos ? '<span class="xcp-t-certo">todos na rua</span>' : 'nenhum pedido')}</span></div>
        </div>
        <div class="xcp-cartao xcp-kpi"><small>Na cidade certa</small>
          <strong class="${expedidos && !errados ? 'xcp-t-certo' : ''}">${expedidos ? pct(pCerto) : '—'}</strong>
          <span class="xcp-detalhe">${numero(certos)} de ${numero(expedidos)} na rua${certos ? ` · ${ver('grupo', 'certo')}` : ''}</span></div>
        <div class="xcp-cartao xcp-kpi"><small>Atribuídos errado</small>
          <strong class="${errados ? 'xcp-t-errado' : 'xcp-t-certo'}">${numero(errados)}</strong>
          <span class="xcp-detalhe">${errados ? ver('grupo', 'errado') : 'nenhum'}</span></div>
        <div class="xcp-cartao xcp-kpi"><small>Fora de abrangência</small>
          <strong class="${fora ? 'xcp-t-base' : 'xcp-t-certo'}">${numero(fora)}</strong>
          <span class="xcp-detalhe">cidade que nenhum entregador faz${fora ? ` · ${ver('grupo', 'fora')}` : ''}</span></div>
        ${caminho == null ? '' : `<div class="xcp-cartao xcp-kpi"><small>${esc(rot.aCaminho)}</small>
          <strong>${numero(caminho)}</strong>
          <span class="xcp-detalhe">fora da conta${caminho && (r.a_caminho.pacotes || []).length ? ` · ${ver('caminho', '')}` : ''}</span></div>`}
      </div>`;
    }

    // ── abas ──
    function abas(c) {
      const lista = [['cidade', 'Por cidade'], ['entregador', 'Por entregador'], ['errado', 'Atribuídos errado', c.errado], ['base', 'Na base', c.base], ['certo', 'Certos', c.certo]];
      const deLista = ['errado', 'base', 'certo'].includes(estado.aba);
      return `<div class="xcp-abas">${lista.map(([k, t, n]) => `<button type="button" class="xcp-aba${estado.aba === k ? ' xcp-sel' : ''}" data-aba="${k}">${esc(t)}${n != null ? `<em>${numero(n)}</em>` : ''}</button>`).join('')}
        <span class="xcp-ferramentas"><input class="xcp-busca" type="search" placeholder="Buscar waybill, cidade ou entregador..." value="${esc(estado.busca)}">
          <button type="button" class="xcp-link" data-copiar="aba"${deLista ? '' : ' hidden'}>Copiar waybills</button><span class="xcp-aviso" data-aviso></span></span></div>`;
    }

    function abaCidade(pacs, r) {
      const linhas = porCidade(pacs).filter((l) => !estado.busca || chave(l.cidade).includes(chave(estado.busca)));
      const maior = Math.max(1, ...linhas.map((l) => l.total));
      const seg = (tipo, n) => (n ? `<i class="xcp-b-${tipo}" style="width:${(n / maior) * 100}%"></i>` : '');
      const foraC = foraPorCidade(pacs);
      const ign = r.ignoradas || [];
      return (linhas.length ? tabela(`<th>Cidade</th><th></th><th class="xcp-num">Total</th><th class="xcp-num">Certos</th><th class="xcp-num">Errados</th><th class="xcp-num">Na base</th><th class="xcp-num">% certo</th><th></th>`,
        linhas.map((l) => `<tr><td>${esc(l.cidade)}</td><td><div class="xcp-trilho">${seg('certo', l.certo)}${seg('errado', l.errado)}${seg('base', l.base)}</div></td>
          <td class="xcp-num">${numero(l.total)}</td><td class="xcp-num xcp-t-certo">${numero(l.certo)}</td>
          <td class="xcp-num${l.errado ? ' xcp-t-errado' : ''}">${numero(l.errado)}</td><td class="xcp-num${l.base ? ' xcp-t-base' : ''}">${numero(l.base)}</td>
          <td class="xcp-num">${pct(pctDe(l.certo, l.total))}</td>
          <td>${ver('cidade', l.cidade)}${opcoes.aoIgnorar ? ` · <button type="button" class="xcp-link" data-tirar="${esc(l.cidade)}" title="Tirar ${esc(l.cidade)} da conta (para todos)">tirar</button>` : ''}</td></tr>`).join(''))
        : '<div class="xcp-vazio">Nenhuma cidade.</div>')
        + '<div class="xcp-legenda"><span><i class="xcp-b-certo"></i>certo</span><span><i class="xcp-b-errado"></i>atribuído errado</span><span><i class="xcp-b-base"></i>na base</span></div>'
        + (foraC.length ? `<div class="xcp-nota">Fora de abrangência: ${foraC.map((f) => `${esc(f.cidade)} (${numero(f.total)}) ${ver('cidade', f.cidade, 'ver')}`).join(' · ')}</div>` : '')
        + (ign.length && opcoes.aoIgnorar ? `<div class="xcp-nota">Fora da conta: ${ign.map((x) => `${esc(x.cidade)} (${numero(x.total)}) <button type="button" class="xcp-link" data-voltar="${esc(x.cidade)}">voltar</button>`).join(' · ')}</div>` : '');
    }

    function abaEntregador(pacs, r) {
      const linhas = porEntregador(pacs, r).filter((l) => !estado.busca || chave(l.entregador).includes(chave(estado.busca))
        || (l.cidades || []).some((c) => chave(c).includes(chave(estado.busca))));
      if (!linhas.length) return '<div class="xcp-vazio">Nenhum entregador com pedido.</div>';
      return tabela(`<th>Entregador</th><th>Faz (cadastro)</th><th class="xcp-num">Pedidos</th><th class="xcp-num">Certos</th><th class="xcp-num">Errados</th><th class="xcp-num">% certo</th><th></th>`,
        linhas.map((l) => `<tr><td>${nomeEnt(l.entregador)}</td>
          <td class="xcp-quebra">${l.cidades == null ? '—' : (l.cidades.length ? esc(l.cidades.join(', ')) : '<span class="xcp-t-errado">sem cidade cadastrada</span>')}</td>
          <td class="xcp-num">${numero(l.total)}</td><td class="xcp-num xcp-t-certo">${numero(l.certo)}</td>
          <td class="xcp-num${l.errado ? ' xcp-t-errado' : ''}">${numero(l.errado)}</td><td class="xcp-num">${l.total - l.fora ? pct(pctDe(l.certo, l.total - l.fora)) : '—'}</td>
          <td>${ver('entregador', l.entregador)}</td></tr>`).join(''))
        + '<div class="xcp-nota">Os pedidos sem entregador estão na aba Na base.</div>';
    }

    function abaErrados(lista, r) {
      if (!lista.length) return `<div class="xcp-vazio">${estado.busca ? 'Nada encontrado.' : 'Nenhum pedido atribuído errado.'}</div>`;
      const grupos = erradosPorEntregador(lista);
      let mostradas = 0;
      const corpo = grupos.map((g) => {
        const faz = cidadesDo(r, g.entregador);
        const cab = `<tr class="xcp-grupo"><td colspan="${4 + extras.length}">${nomeEnt(g.entregador)}
          <span>· ${faz == null ? '' : (faz.length ? `faz ${esc(faz.join(', '))}` : 'sem cidade cadastrada')} · ${numero(g.pacotes.length)} pedido(s)</span></td></tr>`;
        const linhas = g.pacotes.filter(() => (mostradas += 1) <= MAX_LINHAS).map((p) => {
          const quem = quemFaz(r, p.cidade);
          const s = situacao(p, r);
          return `<tr><td class="xcp-cod">${esc(p.waybill)}</td><td>${esc(p.cidade || '—')}</td>
            <td class="xcp-quebra">${quem.length ? esc(quem.join(', ')) : '<span class="xcp-t-fora">ninguém cadastrado</span>'}</td>
            <td class="${corDe(s.tipo)}">${esc(p.status === 'cidade_errada' ? 'Cidade errada' : s.texto)}</td>${tdExtras(p)}</tr>`;
        }).join('');
        return cab + linhas;
      }).join('');
      return tabela(`<th>Waybill</th><th>Cidade do pedido</th><th>Quem faz essa cidade</th><th>Situação</th>${thExtras()}`, corpo) + mais(lista.length);
    }

    function abaLista(lista, comEntregador) {
      if (!lista.length) return `<div class="xcp-vazio">${estado.busca ? 'Nada encontrado.' : 'Nenhum pedido.'}</div>`;
      const ordenada = lista.slice().sort((a, b) => porNome(a.cidade, b.cidade) || porNome(a.entregador, b.entregador) || porNome(a.waybill, b.waybill));
      return tabela(`<th>Waybill</th><th>Cidade</th>${comEntregador ? '<th>Entregador</th>' : ''}${thExtras()}`,
        ordenada.slice(0, MAX_LINHAS).map((p) => `<tr><td class="xcp-cod">${esc(p.waybill)}</td><td>${esc(p.cidade || '—')}</td>${comEntregador ? `<td>${nomeEnt(p.entregador)}</td>` : ''}${tdExtras(p)}</tr>`).join(''))
        + mais(lista.length);
    }

    /** Os pedidos da aba de lista aberta (com a busca), para mostrar e para copiar. */
    function listaDaAba() {
      const pacs = buscar(pacotesDe(estado.r), estado.busca, extras);
      return pacs.filter((p) => grupoDe(p) === estado.aba);
    }

    function desenharConteudo() {
      const alvo = raiz.querySelector('.xcp-conteudo');
      if (!alvo || !estado.r) return;
      const r = estado.r;
      const pacs = pacotesDe(r);
      if (estado.aba === 'cidade') alvo.innerHTML = abaCidade(pacs, r);
      else if (estado.aba === 'entregador') alvo.innerHTML = abaEntregador(pacs, r);
      else if (estado.aba === 'errado') alvo.innerHTML = abaErrados(listaDaAba(), r);
      else alvo.innerHTML = abaLista(listaDaAba(), estado.aba === 'certo');
    }

    function desenhar() {
      const r = estado.r || {};
      const pacs = pacotesDe(r);
      const c = contar(pacs);
      const foco = doc.activeElement && doc.activeElement.classList && doc.activeElement.classList.contains('xcp-busca') && raiz.contains(doc.activeElement);
      const info = opcoes.info ? opcoes.info(r) : '';
      raiz.innerHTML = `${cartoes(r, c)}${info ? `<div class="xcp-info">${esc(info)}</div>` : ''}
        <div class="xcp-cartao">${abas(c)}<div class="xcp-conteudo"></div></div>`;
      desenharConteudo();
      if (foco) { const b = raiz.querySelector('.xcp-busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }

    // ── "Visualizar": o card por cima ──
    function itensDaJanela() {
      const r = estado.r || {};
      const { tipo, valor } = estado.janela;
      const pacs = pacotesDe(r);
      if (tipo === 'caminho') return ((r.a_caminho && r.a_caminho.pacotes) || []).map((p) => ({ ...p, status: 'a_caminho' }));
      if (tipo === 'cidade') return pacs.filter((p) => (p.cidade || '(sem cidade)') === valor);
      if (tipo === 'entregador') return pacs.filter((p) => chave(p.entregador) === chave(valor));
      return pacs; // 'grupo': todos, com o grupo já escolhido
    }

    function tituloDaJanela() {
      const { tipo, valor } = estado.janela;
      if (tipo === 'cidade') return [valor, ''];
      if (tipo === 'entregador') {
        const faz = cidadesDo(estado.r, valor);
        return [valor, faz == null ? '' : (faz.length ? `faz ${faz.join(', ')}` : 'sem cidade cadastrada')];
      }
      if (tipo === 'caminho') return [rot.aCaminho, 'ainda não chegaram: ficam fora da conta'];
      return ['Pedidos do dia', ''];
    }

    function filtradosDaJanela() {
      const j = estado.janela;
      const todos = itensDaJanela();
      const doChip = j.chip === 'todos' ? todos : todos.filter((p) => grupoDe(p) === j.chip);
      return { todos, lista: buscar(doChip, j.busca, extras) };
    }

    function desenharJanela() {
      const j = estado.janela;
      if (!j || !estado.fundo) return;
      const { todos, lista } = filtradosDaJanela();
      const c = contar(todos);
      const chips = [['todos', c.todos], ...ORDEM_GRUPO.map((g) => [g, c[g]]).filter(([, n]) => n)];
      if (!chips.some(([g]) => g === j.chip)) j.chip = 'todos';
      const [titulo, sub] = tituloDaJanela();
      const ordem = { errado: 0, base: 1, fora: 2, caminho: 3, certo: 4 };
      const ordenada = lista.slice().sort((a, b) => ordem[grupoDe(a)] - ordem[grupoDe(b)] || porNome(a.cidade, b.cidade) || porNome(a.waybill, b.waybill));
      const foco = doc.activeElement && doc.activeElement.classList && doc.activeElement.classList.contains('xcp-busca') && estado.fundo.contains(doc.activeElement);
      estado.fundo.innerHTML = `<div class="xcp-janela" role="dialog" aria-modal="true">
        <div class="xcp-janela-topo"><h3>${esc(titulo)}</h3><span>${esc(sub ? `${sub} · ` : '')}${numero(todos.length)} pedido(s)</span>
          <button type="button" class="xcp-fechar" data-fechar title="Fechar (Esc)">×</button></div>
        <div class="xcp-abas">${chips.map(([g, n]) => `<button type="button" class="xcp-aba${j.chip === g ? ' xcp-sel' : ''}" data-chip="${g}">${esc(NOME_GRUPO[g])}<em>${numero(n)}</em></button>`).join('')}
          <span class="xcp-ferramentas"><input class="xcp-busca" type="search" placeholder="Buscar..." value="${esc(j.busca)}">
          <button type="button" class="xcp-link" data-copiar="janela">Copiar waybills</button><span class="xcp-aviso" data-aviso></span></span></div>
        ${lista.length ? tabela(`<th>Waybill</th><th>Cidade</th><th>Entregador</th><th>Situação</th>${thExtras()}`,
          ordenada.slice(0, MAX_LINHAS).map((p) => {
            const s = situacao(p, estado.r);
            return `<tr><td class="xcp-cod">${esc(p.waybill)}</td><td>${esc(p.cidade || '—')}</td><td>${esc(p.entregador || '—')}</td>
              <td class="${corDe(s.tipo)}">${esc(s.texto)}</td>${tdExtras(p)}</tr>`;
          }).join('')) + mais(lista.length) : `<div class="xcp-vazio">${j.busca ? 'Nada encontrado.' : 'Nenhum pedido.'}</div>`}
      </div>`;
      if (foco) { const b = estado.fundo.querySelector('.xcp-busca'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); }
    }

    function aoTeclar(e) { if (e.key === 'Escape') fecharJanela(); }

    function abrirJanela(tipo, valor) {
      fecharJanela();
      estado.janela = { tipo, valor, chip: tipo === 'grupo' ? valor : 'todos', busca: '' };
      const fundo = doc.createElement('div');
      fundo.className = 'xcp-fundo';
      pintar(fundo);
      fundo.addEventListener('click', (e) => {
        if (e.target === fundo || (e.target.closest && e.target.closest('[data-fechar]'))) { fecharJanela(); return; }
        const chip = e.target.closest && e.target.closest('[data-chip]');
        if (chip) { estado.janela.chip = chip.dataset.chip; desenharJanela(); return; }
        const cop = e.target.closest && e.target.closest('[data-copiar]');
        if (cop) copiarLista(filtradosDaJanela().lista, fundo);
      });
      fundo.addEventListener('input', (e) => {
        if (!e.target.classList.contains('xcp-busca')) return;
        estado.janela.busca = e.target.value;
        desenharJanela();
      });
      doc.body.appendChild(fundo);
      estado.fundo = fundo;
      doc.addEventListener('keydown', aoTeclar);
      desenharJanela();
    }

    function fecharJanela() {
      if (estado.fundo) estado.fundo.remove();
      estado.fundo = null;
      estado.janela = null;
      doc.removeEventListener('keydown', aoTeclar);
    }

    function copiarLista(lista, onde) {
      const aviso = onde.querySelector('[data-aviso]');
      const avisar = (t) => { if (aviso) { aviso.textContent = t; setTimeout(() => { if (aviso.isConnected) aviso.textContent = ''; }, 2500); } };
      if (!lista.length) { avisar('Nada para copiar.'); return; }
      Promise.resolve().then(() => copiarTexto(lista.map((p) => p.waybill).join('\n')))
        .then(() => avisar(`${numero(lista.length)} copiado(s).`))
        .catch(() => avisar('Não deu para copiar.'));
    }

    // ── cliques e busca na tela ──
    raiz.addEventListener('click', (e) => {
      const alvo = e.target.closest ? e.target : null;
      if (!alvo) return;
      const aba = alvo.closest('[data-aba]');
      if (aba && raiz.contains(aba)) { estado.aba = aba.dataset.aba; desenhar(); return; }
      const v = alvo.closest('[data-ver]');
      if (v) { abrirJanela(v.dataset.ver, v.dataset.valor); return; }
      const ent = alvo.closest('[data-ent]');
      if (ent && opcoes.aoEntregador) { opcoes.aoEntregador(ent.dataset.ent); return; }
      const t = alvo.closest('[data-tirar]');
      if (t && opcoes.aoIgnorar) { opcoes.aoIgnorar(t.dataset.tirar, true); return; }
      const vo = alvo.closest('[data-voltar]');
      if (vo && opcoes.aoIgnorar) { opcoes.aoIgnorar(vo.dataset.voltar, false); return; }
      const cop = alvo.closest('[data-copiar]');
      if (cop) copiarLista(listaDaAba(), raiz);
    });
    raiz.addEventListener('input', (e) => {
      if (!e.target.classList.contains('xcp-busca')) return;
      estado.busca = e.target.value;
      desenharConteudo();
    });

    return {
      /** Desenha (ou redesenha, mantendo aba, busca e o card aberto) a resposta do sistema. */
      mostrar(resumo) {
        estado.r = resumo || {};
        desenhar();
        if (estado.janela) desenharJanela();
      },
      fecharJanela,
    };
  }

  const api = {
    GRUPOS, NOME_GRUPO, MAX_LINHAS, grupoDe, pacotesDe, situacao, contar, porCidade, foraPorCidade, porEntregador,
    erradosPorEntregador, buscar, formatar, cidadesDo, quemFaz, pctDe, criar,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.XMConfPadrao = api;
})(typeof self !== 'undefined' ? self : this);
