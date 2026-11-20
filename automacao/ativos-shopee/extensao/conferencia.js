// XM - Ativos Shopee: a conta do Vapt Vupt, feita aqui na extensao com dados so do SPX (3.0,
// 20/11/2026: "a conferencia nao pega nada do XMTT alem do login").
//
// Romaneio = a viagem do dia, do proprio SPX:
//   1. painel AMH-LM (GET /mgmt/api/pc/dashboard/lm/linehaul_trips): o numero da viagem (LT...)
//      que chega hoje na estacao;
//   2. Viagens de Carga Direta, Pendente (trip/list_v2) ou Finalizado (trip/history/list): o id
//      da viagem pelo numero;
//   3. o anexo da viagem (agency/email/attachments/get?trip_id=): um xlsx com as colunas do
//      Romaneiro (Horario de entrega, Pedido (TN), Origem, Destino, Numero da TO, Rota de LH).
// Contra: a pesquisa em lote do SPX (rastreio), as ATs de hoje e o export de pedidos (comprador e
// CEP), como antes. As regras sao as mesmas da Conferencia do sistema (modules/shopee-conferencia),
// sem a "fora de abrangencia" (dependia da lista de cidades do sistema).

(() => {
  const FUSO = 'America/Sao_Paulo';

  const ROTA_PAINEL_LH = '/mgmt/api/pc/dashboard/lm/linehaul_trips';
  const ROTA_PENDENTES = '/api/admin/transportation/trip/list_v2';
  const ROTA_FINALIZADAS = '/api/admin/transportation/trip/history/list';
  const ROTA_ANEXO = '/api/admin/transportation/agency/email/attachments/get';
  const POR_PAGINA = 24; // o mesmo da tela do SPX
  const MAX_PAGINAS = 10;

  // ── texto ──────────────────────────────────────────────────────────────────────
  const chaveCodigo = (c) => String(c == null ? '' : c).trim().toUpperCase();
  const semAcento = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const epoch = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
  // 2 casas, para baixo: 99,996% nao vira 100,00% (conta inteira antes de dividir).
  const pct = (a, t) => (t ? Math.floor((a * 10000) / t) / 100 : 0);

  function chaveCidade(v) {
    return semAcento(String(v || '').replace(/['’`´]/g, ' '))
      .replace(/\s*\(\s*[a-z]{2}\s*\)$/, '')
      .replace(/\s+-\s+.*$/, '')
      .replace(/\s*[-/,]\s*[a-z]{2}$/, '')
      .replace(/\s+/g, ' ').trim();
  }

  /** "XPT_SC_Caçador" e "XPT SC Cacador" sao a mesma estacao. */
  const chaveEstacao = (v) => semAcento(v).replace(/[^a-z0-9]/g, '');
  function mesmaEstacao(a, b) {
    const x = chaveEstacao(a);
    const y = chaveEstacao(b);
    return !!(x && y && (x === y || x.includes(y) || y.includes(x)));
  }

  // ── xlsx (o anexo da viagem), sem biblioteca: zip + XML ───────────────────────
  const utf8 = new TextDecoder('utf-8');

  function entidades(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (k === 'amp') return '&';
      if (k === 'lt') return '<';
      if (k === 'gt') return '>';
      if (k === 'quot') return '"';
      if (k === 'apos') return "'";
      const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    });
  }

  /** Arquivos de dentro do zip: nome -> { metodo, dados }. */
  function entradasDoZip(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let fim = -1;
    for (let p = u8.length - 22; p >= Math.max(0, u8.length - 65557); p -= 1) {
      if (dv.getUint32(p, true) === 0x06054b50) { fim = p; break; }
    }
    if (fim < 0) throw new Error('O anexo da viagem não é uma planilha xlsx.');
    const qtd = dv.getUint16(fim + 10, true);
    let p = dv.getUint32(fim + 16, true);
    const mapa = new Map();
    for (let i = 0; i < qtd && p + 46 <= u8.length; i += 1) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      const tamanho = dv.getUint32(p + 20, true);
      const nLen = dv.getUint16(p + 28, true);
      const xLen = dv.getUint16(p + 30, true);
      const cLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const nome = utf8.decode(u8.subarray(p + 46, p + 46 + nLen));
      const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      mapa.set(nome, { metodo, dados: u8.subarray(ini, ini + tamanho) });
      p += 46 + nLen + xLen + cLen;
    }
    return mapa;
  }

  async function abrirEntrada(e) {
    if (!e) return '';
    if (e.metodo === 0) return utf8.decode(e.dados);
    if (e.metodo !== 8) throw new Error('A planilha do anexo veio compactada de um jeito que a extensão não lê.');
    const fluxo = new Blob([e.dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return utf8.decode(await new Response(fluxo).arrayBuffer());
  }

  const textoDoXml = (xml) => [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => entidades(m[1])).join('');

  function colunaDe(ref) {
    const m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  /** Linhas de uma aba (XML da sheet) com os textos compartilhados. */
  function linhasDaAba(xml, textos = []) {
    const linhas = [];
    for (const r of String(xml).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const linha = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const corpo = c[2] || '';
        const ref = (/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1];
        const tipo = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || '';
        const col = ref ? colunaDe(ref) : linha.length;
        let valor = '';
        if (tipo === 'inlineStr') valor = textoDoXml(corpo);
        else {
          const v = (/<v>([\s\S]*?)<\/v>/.exec(corpo) || [])[1];
          if (v != null) valor = tipo === 's' ? (textos[Number(v)] ?? '') : entidades(v);
        }
        if (col >= 0) linha[col] = valor;
      }
      linhas.push(Array.from(linha, (v) => (v == null ? '' : v)));
    }
    return linhas;
  }

  async function caminhoDaPrimeiraAba(zip) {
    const wb = await abrirEntrada(zip.get('xl/workbook.xml'));
    const rels = await abrirEntrada(zip.get('xl/_rels/workbook.xml.rels'));
    const rid = (/<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb) || [])[1];
    if (rid) {
      for (const m of rels.matchAll(/<Relationship\b([^>]*)>/g)) {
        const id = (/\bId="([^"]+)"/.exec(m[1]) || [])[1];
        const alvo = (/\bTarget="([^"]+)"/.exec(m[1]) || [])[1];
        if (id === rid && alvo) return alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`;
      }
    }
    return [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0] || '';
  }

  /** xlsx -> linhas (só a primeira aba). */
  async function lerXlsx(bytes) {
    const zip = entradasDoZip(bytes);
    const compartilhados = await abrirEntrada(zip.get('xl/sharedStrings.xml'));
    const textos = [...compartilhados.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textoDoXml(m[1]));
    const aba = await abrirEntrada(zip.get(await caminhoDaPrimeiraAba(zip)));
    if (!aba) throw new Error('A planilha do anexo da viagem veio sem aba.');
    return linhasDaAba(aba, textos);
  }

  // ── romaneio da viagem ──────────────────────────────────────────────────────────
  const COLUNAS = {
    codigo: ['pedido (tn)', 'pedido tn', 'pedido'],
    to: ['numero da to', 'numero to', 'no da to', 'nº da to'],
    destino: ['destino'],
  };

  /**
   * Linhas do anexo -> BR da viagem que vêm para esta estação (coluna Destino). Viagem com mais
   * de uma parada traz os BR das outras estações também; esses ficam de fora.
   */
  function romaneioDaPlanilha(linhas, estacao) {
    const iCab = (linhas || []).findIndex((l) => l.some((c) => COLUNAS.codigo.includes(semAcento(c))));
    if (iCab < 0) throw new Error('O anexo da viagem veio sem a coluna "Pedido (TN)".');
    const cab = linhas[iCab].map(semAcento);
    const col = (k) => cab.findIndex((c) => COLUNAS[k].includes(c));
    const i = { codigo: col('codigo'), to: col('to'), destino: col('destino') };
    const vistos = new Set();
    const itens = [];
    for (const l of linhas.slice(iCab + 1)) {
      const codigo = chaveCodigo(l[i.codigo]);
      if (!codigo || vistos.has(codigo)) continue;
      vistos.add(codigo);
      itens.push({ codigo, to: i.to >= 0 ? texto(l[i.to], 40) : '', destino: i.destino >= 0 ? texto(l[i.destino], 60) : '' });
    }
    if (i.destino < 0 || !estacao) return { itens, outras_estacoes: 0 };
    const daqui = itens.filter((x) => mesmaEstacao(x.destino, estacao));
    return { itens: daqui, outras_estacoes: itens.length - daqui.length };
  }

  // ── viagens ─────────────────────────────────────────────────────────────────────
  /**
   * Resposta do painel AMH-LM -> viagens (procura a lista onde estiver: o SPX embrulha em data).
   * chega_aqui = a viagem termina nesta estação (as de saída para o SoC ficam de fora).
   */
  function viagensDoPainel(resposta) {
    const achadas = [];
    const visitar = (v, fundo) => {
      if (fundo > 6 || !v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach((x) => visitar(x, fundo + 1)); return; }
      if (typeof v.trip_number === 'string' && v.trip_number) { achadas.push(v); return; }
      Object.values(v).forEach((x) => visitar(x, fundo + 1));
    };
    visitar(resposta, 0);
    const vistas = new Map();
    for (const t of achadas) {
      if (vistas.has(t.trip_number)) continue;
      const estacao = t.station_name || '';
      const chegada = t.arrived_station_name || '';
      vistas.set(t.trip_number, {
        numero: t.trip_number,
        estacao,
        estacao_id: t.station_id || t.arrived_station_id || null,
        origem: t.departed_station_name || '',
        destino: chegada,
        pedidos: Number(t.trip_order_qty_td) || 0,
        status: t.trip_status,
        atd: epoch(t.trip_atd), eta: epoch(t.trip_eta), ata: epoch(t.trip_ata),
        chega_aqui: !chegada || !estacao || mesmaEstacao(chegada, estacao),
      });
    }
    return [...vistas.values()];
  }

  /** O id (tripId) da viagem numa página das listas de Viagens de Carga Direta. */
  function idDaViagem(dados, numero) {
    const lista = (dados && Array.isArray(dados.list)) ? dados.list : [];
    const t = lista.find((x) => x && String(x.trip_number || '').toUpperCase() === String(numero).toUpperCase());
    return t && t.id ? t.id : null;
  }

  /** Começo do dia (SP) de N dias atrás e fim de hoje, em segundos. */
  function faixa(dias, agora = new Date()) {
    const hoje = hojeSP(agora);
    const fim = Math.floor(Date.parse(`${hoje}T23:59:59-03:00`) / 1000);
    const ini = Math.floor(Date.parse(`${hoje}T00:00:00-03:00`) / 1000) - dias * 86400;
    return `${ini},${fim}`;
  }
  // Mesmos parâmetros da tela: Pendente (Todos, 7 dias, como o padrão dela) e Finalizado.
  const urlPendentes = (pagina, agora) => `${ROTA_PENDENTES}?station_type=7,2,3,12&pageno=${pagina}&count=${POR_PAGINA}&query_type=1&tab_type=1&display_range=${faixa(7, agora)}`;
  const urlFinalizadas = (pagina, agora) => `${ROTA_FINALIZADAS}?mtime=${faixa(3, agora)}&pageno=${pagina}&count=${POR_PAGINA}`;
  const urlAnexo = (id) => `${ROTA_ANEXO}?trip_id=${encodeURIComponent(id)}`;

  // ── rastreio guardado (Conferir de novo só pesquisa o que pode mudar) ──────────
  /** Pesquisa em lote → um registro por BR, só o que a conferência usa. */
  function lerRastreio(lista) {
    const m = new Map();
    for (const r of Array.isArray(lista) ? lista : []) {
      const codigo = chaveCodigo(r && r.codigo);
      if (!codigo || m.has(codigo)) continue;
      m.set(codigo, {
        codigo,
        recebido_em: epoch(r.recebido_em),
        saiu_em: epoch(r.saiu_em),
        entregue_em: epoch(r.entregue_em),
        motorista: texto(r.motorista, 80),
        status: Number.isFinite(Number(r.status)) ? Number(r.status) : null,
        estacao: texto(r.estacao, 60),
      });
    }
    return m;
  }

  /** Recebido = chegou no XPT (pacote ainda no SoC tem hora de recebimento do SoC). */
  const recebidoNoXpt = (r) => !!(r && r.recebido_em && /XPT/i.test(r.estacao || ''));
  /** Recebido por nós: chegou no XPT OU já saiu para entrega / foi entregue. */
  const foiRecebido = (r) => !!(r && (recebidoNoXpt(r) || r.saiu_em || r.entregue_em));

  /** BR do romaneio que ainda podem mudar: não recebido, ou recebido e ainda sem sair/entregar. */
  function faltaConsultar(codigos, guardado) {
    const m = guardado instanceof Map ? guardado : lerRastreio(guardado);
    return codigos.filter((c) => { const r = m.get(c); return !(r && recebidoNoXpt(r) && (r.saiu_em || r.entregue_em)); });
  }

  /** Junta o rastreio novo com o guardado (o novo vale). */
  function juntarRastreio(guardado, novo) {
    const m = lerRastreio(novo);
    for (const r of Array.isArray(guardado) ? guardado : []) { const c = chaveCodigo(r && r.codigo); if (c && !m.has(c)) m.set(c, r); }
    return [...m.values()];
  }

  // ── a conta (mesmas regras de sistema-backend/modules/shopee-conferencia) ────────
  /** ATs de hoje → lista limpa (cada AT com os BR dela). */
  function lerAts(lista) {
    const vistas = new Set();
    const saida = [];
    for (const a of Array.isArray(lista) ? lista : []) {
      const at = texto(a && a.at, 40);
      if (!at || vistas.has(at)) continue;
      vistas.add(at);
      const codigos = (Array.isArray(a.codigos) ? a.codigos : String(a.codigos || '').split(','))
        .map(chaveCodigo).filter(Boolean).slice(0, 2000);
      saida.push({ at, codigos, motorista: texto(a.motorista, 80), cidade: texto(a.cidade, 80),
        bairro: texto(a.bairro, 80), cluster: texto(a.cluster, 40), criada_em: epoch(a.criada_em) });
    }
    return saida;
  }

  const FMT_HORA = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });
  const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO });
  const horaSP = (seg) => Number(FMT_HORA.format(new Date(seg * 1000)));
  const diaSP = (seg) => FMT_DIA.format(new Date(seg * 1000));
  const hojeSP = (agora = new Date()) => FMT_DIA.format(agora);

  /**
   * @param {string[]} romaneio  BR da viagem
   * @param {Map} rastreio       lerRastreio(...)
   * @param {object[]} ats       lerAts(...)
   * @param {Map<string, {cidade, bairro}>} lugarDoPacote  BR -> lugar pelo CEP, para pacote em AT sem cidade
   */
  function resumir(romaneio, rastreio, ats, lugarDoPacote = new Map()) {
    const codigos = [...new Set((romaneio || []).map(chaveCodigo).filter(Boolean))];
    const atDe = new Map();
    for (const a of ats || []) for (const c of a.codigos) if (!atDe.has(c)) atDe.set(c, a);

    let emAt = 0, recebidos = 0, semCidadeAt = 0;
    const recebidoSemAt = [], naoRecebido = [];
    const cidades = new Map();
    const fluxo = { recebimento: new Map(), atribuicao: new Map(), expedicao: new Map() };
    const somar = (mapa, seg) => { if (!seg) return; const k = `${diaSP(seg)} ${String(horaSP(seg)).padStart(2, '0')}`; mapa.set(k, (mapa.get(k) || 0) + 1); };
    let primeiro = 0, ultimo = 0;

    for (const c of codigos) {
      const r = rastreio.get(c) || null;
      const a = atDe.get(c) || null;
      const recebido = foiRecebido(r);
      if (recebido) recebidos += 1;
      else {
        naoRecebido.push({ codigo: c, achado_no_spx: !!r, estacao: r ? r.estacao : '', at: a ? a.at : '',
          motorista: a ? a.motorista : '', cidade: a ? a.cidade : '', bairro: a ? a.bairro : '', cluster: a ? a.cluster : '' });
      }
      if (recebidoNoXpt(r)) { somar(fluxo.recebimento, r.recebido_em); primeiro = primeiro ? Math.min(primeiro, r.recebido_em) : r.recebido_em; }
      if (r && r.saiu_em) { somar(fluxo.expedicao, r.saiu_em); ultimo = Math.max(ultimo, r.saiu_em); }
      if (a) {
        emAt += 1;
        // O pacote entra na AT depois de recebido: vale a mais tarde entre a criação da AT e o recebimento.
        const atribuido = recebidoNoXpt(r) ? Math.max(a.criada_em, r.recebido_em) : a.criada_em;
        somar(fluxo.atribuicao, atribuido);
        ultimo = Math.max(ultimo, atribuido);
        // AT inteira sem cidade (vem assim do SPX): o pacote empresta pelo CEP.
        if (!a.cidade) semCidadeAt += 1;
        const lugar = (!a.cidade && lugarDoPacote.get(c)) || {};
        const cidade = a.cidade || lugar.cidade || '';
        const chave = chaveCidade(cidade) || '(sem cidade)';
        const ci = cidades.get(chave) || { cidade: cidade || '(sem cidade)', total: 0, bairros: new Map() };
        if (a.cidade) ci.cidade = a.cidade;
        ci.total += 1;
        const b = a.bairro || lugar.bairro || '(sem bairro)';
        ci.bairros.set(b, (ci.bairros.get(b) || 0) + 1);
        cidades.set(chave, ci);
      } else if (recebido) {
        recebidoSemAt.push({ codigo: c, recebido_em: r.recebido_em, motorista: r.motorista, status: r.status, estacao: r.estacao });
      }
    }
    const total = codigos.length;
    const horas = [...new Set([...fluxo.recebimento.keys(), ...fluxo.atribuicao.keys(), ...fluxo.expedicao.keys()])].sort();
    const linha = (m) => horas.map((h) => m.get(h) || 0);
    const porNome = (x, y) => x.localeCompare(y, 'pt-BR');
    return {
      total, em_at: emAt, pct_at: pct(emAt, total),
      recebidos, pct_recebidos: pct(recebidos, total),
      divergencias: recebidoSemAt.length + naoRecebido.length,
      recebido_sem_at: recebidoSemAt.sort((x, y) => x.recebido_em - y.recebido_em),
      nao_recebido: naoRecebido.sort((x, y) => x.codigo.localeCompare(y.codigo)),
      porCidade: [...cidades.values()].map((c) => ({ cidade: c.cidade, total: c.total,
        bairros: [...c.bairros].map(([bairro, qtd]) => ({ bairro, qtd })).sort((x, y) => y.qtd - x.qtd || porNome(x.bairro, y.bairro)) }))
        .sort((x, y) => y.total - x.total || porNome(x.cidade, y.cidade)),
      fluxo: { horas, recebimento: linha(fluxo.recebimento), atribuicao: linha(fluxo.atribuicao), expedicao: linha(fluxo.expedicao) },
      processamento: { inicio: primeiro, fim: ultimo },
      ats: (ats || []).length,
      at_sem_cidade: semCidadeAt,
      sem_rastreio: codigos.filter((c) => !rastreio.has(c)).length,
    };
  }

  /** Cluster mais usado em cada cidade+bairro nas ATs do dia (para pacote sem AT). */
  const chaveBairro = (cidade, bairro) => `${chaveCidade(cidade)}|${chaveCidade(bairro)}`;
  function clusterPorBairro(ats) {
    const contagem = new Map();
    for (const a of ats || []) {
      if (!a.cluster || !a.cidade || !a.bairro) continue;
      const k = chaveBairro(a.cidade, a.bairro);
      const m = contagem.get(k) || new Map();
      m.set(a.cluster, (m.get(a.cluster) || 0) + a.codigos.length);
      contagem.set(k, m);
    }
    const saida = new Map();
    for (const [k, m] of contagem) saida.set(k, [...m].sort((x, y) => y[1] - x[1])[0][0]);
    return saida;
  }

  /** CEP só com dígitos, 8 casas ("" se não tiver). */
  const normCep = (v) => { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d ? d.padStart(8, '0') : ''; };

  /** Pacote sem AT "empresta" cidade, bairro e cluster de pacotes do dia com o MESMO CEP que estão em AT. */
  function lugarPorCep(pedidos, ats) {
    const atDe = new Map();
    for (const a of ats || []) for (const c of a.codigos) if (!atDe.has(c)) atDe.set(c, a);
    const contagem = new Map();
    for (const x of pedidos || []) {
      const cep = normCep(x && x.cep);
      const a = atDe.get(chaveCodigo(x && x.codigo));
      if (!cep || !a || !a.cidade) continue;
      const k = `${a.cidade}|${a.bairro}|${a.cluster}`;
      const m = contagem.get(cep) || new Map();
      const atual = m.get(k) || { cidade: a.cidade, bairro: a.bairro, cluster: a.cluster, n: 0 };
      atual.n += 1;
      m.set(k, atual);
      contagem.set(cep, m);
    }
    const saida = new Map();
    for (const [cep, m] of contagem) {
      const { cidade, bairro, cluster } = [...m.values()].sort((x, y) => y.n - x.n)[0];
      saida.set(cep, { cidade, bairro, cluster });
    }
    return saida;
  }

  /**
   * A conferência inteira.
   * @param {{codigo, to}[]} romaneio  da viagem (romaneioDaPlanilha)
   * @param {object[]} rastreio  pesquisa em lote (enxugada pelo spx.js)
   * @param {object[]} ats       ATs de hoje (enxugadas pelo spx.js)
   * @param {object[]} [pedidos] export de pedidos: {codigo, comprador, cep, motorista, sort_code}
   */
  function contar({ romaneio, rastreio, ats, pedidos }) {
    const rs = lerRastreio(rastreio);
    const as = lerAts(ats);
    const peds = Array.isArray(pedidos) ? pedidos : [];
    const porCep = lugarPorCep(peds, as);
    const cepDe = new Map(peds.map((p) => [chaveCodigo(p.codigo), normCep(p.cep)]));
    const lugarDoPacote = new Map();
    for (const a of as) {
      if (a.cidade) continue;
      for (const c of a.codigos) { const l = porCep.get(cepDe.get(c)); if (l && l.cidade) lugarDoPacote.set(c, { cidade: l.cidade, bairro: l.bairro || '' }); }
    }
    const lista = Array.isArray(romaneio) ? romaneio : [];
    const conta = resumir(lista.map((x) => x.codigo), rs, as, lugarDoPacote);

    // Completa as divergências para o relatório (mesmas colunas do da Shopee). O que veio da AT vale mais.
    const toDe = new Map(lista.map((x) => [chaveCodigo(x.codigo), x.to || '']));
    const pedidoDe = new Map(peds.map((x) => [chaveCodigo(x.codigo), x]));
    const clusters = clusterPorBairro(as);
    const itens = [...conta.recebido_sem_at, ...conta.nao_recebido];
    for (const p of itens) {
      const x = pedidoDe.get(p.codigo) || {};
      const emprestado = porCep.get(normCep(x.cep)) || {};
      p.to = toDe.get(p.codigo) || '';
      p.comprador = x.comprador || '';
      p.cidade = p.cidade || emprestado.cidade || '';
      p.bairro = p.bairro || emprestado.bairro || '';
      p.cluster = p.cluster || emprestado.cluster || (p.cidade && p.bairro && clusters.get(chaveBairro(p.cidade, p.bairro))) || x.sort_code || '';
      p.motorista = p.motorista || x.motorista || '';
    }
    conta.completado = {
      itens: itens.length,
      nos_pedidos: itens.filter((p) => pedidoDe.has(p.codigo)).length,
      com_bairro: itens.filter((p) => p.bairro).length,
      com_cluster: itens.filter((p) => p.cluster).length,
    };
    return conta;
  }

  /** Histórico guardado no Chrome: { estacao: { dia: registro } }, só os últimos dias. */
  function guardarNoHistorico(historico, estacao, dia, registro, maxDias = 15) {
    const h = historico && typeof historico === 'object' ? { ...historico } : {};
    const daEstacao = { ...(h[estacao] || {}), [dia]: registro };
    const dias = Object.keys(daEstacao).sort().reverse().slice(0, maxDias);
    h[estacao] = Object.fromEntries(dias.map((d) => [d, daEstacao[d]]));
    return h;
  }

  const api = {
    ROTA_PAINEL_LH, ROTA_PENDENTES, ROTA_FINALIZADAS, ROTA_ANEXO, MAX_PAGINAS,
    chaveCodigo, chaveCidade, mesmaEstacao, entradasDoZip, linhasDaAba, lerXlsx, romaneioDaPlanilha,
    viagensDoPainel, idDaViagem, faixa, urlPendentes, urlFinalizadas, urlAnexo,
    lerRastreio, recebidoNoXpt, foiRecebido, faltaConsultar, juntarRastreio, lerAts, resumir,
    clusterPorBairro, chaveBairro, normCep, lugarPorCep, contar, guardarNoHistorico, hojeSP, pct,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else self.XMVaptConta = api;
})();
