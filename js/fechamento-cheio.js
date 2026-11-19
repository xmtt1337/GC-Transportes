// Resumo da Quinzena › Cheio → líquido: do valor cheio (todo pacote entregue pelo máximo) até
// o líquido, com cada perda e cada acréscimo/desconto — no total e por entregador, filtrável por
// transportadora, cidade e polo. Os números vêm do mesmo cálculo do fechamento (perda gravada
// em cada pacote na consolidação; valor cheio da tabela da cidade), então mudou valor ou regra
// e recalculou, muda aqui também.
//
// Coletas, acréscimos, viagens, Ticketlog, extravios e descontos são do entregador inteiro: com
// filtro de transportadora ou cidade não dá pra dividir, e ficam de fora (a tela avisa).

let _chDados = null;               // { chave, grupos, entregadores, sem_conta }
let _chFiltros = { transportadora: null, cidade: null, polo: null }; // null = todas; senão [valores]

const _CH_LINHAS = [
    ["cheio", "Valor cheio", ""], ["fora_prazo", "Fora do prazo", "−"], ["ocorrencias", "Ocorrências", "−"], ["pod", "POD", "−"],
    ["pnr", "PNR acima do limite", "−"], ["bruto", "Bruto", "="], ["coletas", "Coletas", "+"], ["acrescimos", "Acréscimos", "+"],
    ["viagens", "Viagens", "+"], ["ticketlog", "Ticketlog", "−"], ["extravios", "Extravios", "−"], ["descontos", "Descontos", "−"], ["liquido", "Líquido", "="],
];
const _CH_AJUSTES = ["coletas", "acrescimos", "viagens", "ticketlog", "extravios", "descontos"];
const _chR2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Soma por entregador o que passa nos filtros, só dos resumos escolhidos (bloco: entregadores,
 * interno, terceirizada). Sem filtro de transportadora/cidade, junta a parte do entregador
 * (coletas etc.); com filtro de polo, só de quem é daquele polo. Os pacotes da terceirizada
 * não entram no total de pacotes (já são de entregadores) — o valor dela entra.
 * @return {{linhas: Array, total: Object, comAjustes: boolean}}
 */
function _chAgregar(dados, filtros, blocos) {
    const doBloco = (x) => !blocos || blocos.includes(x.bloco || "entregadores");
    const set = (k) => filtros[k] ? new Set(filtros[k]) : null;
    const fT = set("transportadora"), fC = set("cidade"), fP = set("polo");
    const comAjustes = !fT && !fC;
    const por = new Map();
    const pegar = (nome, semConv) => {
        if (!por.has(nome)) por.set(nome, { entregador: nome, sem_conversao: !!semConv, pacotes: 0, bruto: 0, fora_prazo: 0, ocorrencias: 0, pod: 0, pnr: 0,
            coletas: 0, acrescimos: 0, viagens: 0, ticketlog: 0, extravios: 0, descontos: 0 });
        return por.get(nome);
    };
    for (const g of dados.grupos || []) {
        if (!doBloco(g)) continue;
        if ((fT && !fT.has(g.transportadora)) || (fC && !fC.has(g.cidade || "(sem cidade)")) || (fP && !fP.has(g.polo || "(sem polo)"))) continue;
        const l = pegar(g.entregador, g.sem_conversao);
        l.bloco = g.bloco || "entregadores";
        for (const c of ["pacotes", "bruto", "fora_prazo", "ocorrencias", "pod", "pnr"]) l[c] += g[c] || 0;
    }
    if (comAjustes) {
        for (const a of dados.entregadores || []) {
            if (!doBloco(a)) continue;
            if (fP && !fP.has(a.polo || "(sem polo)")) continue;
            if (!_CH_AJUSTES.some(c => a[c]) && !por.has(a.entregador)) continue;
            const l = pegar(a.entregador, a.sem_conversao);
            l.bloco = a.bloco || "entregadores";
            for (const c of _CH_AJUSTES) l[c] += a[c] || 0;
        }
    }
    const linhas = [...por.values()].map(l => {
        for (const k of Object.keys(l)) if (typeof l[k] === "number" && k !== "pacotes") l[k] = _chR2(l[k]);
        l.cheio = _chR2(l.bruto + l.fora_prazo + l.ocorrencias + l.pod + l.pnr);
        l.liquido = _chR2(l.bruto + l.coletas + l.acrescimos + l.viagens - l.ticketlog - l.extravios - l.descontos);
        return l;
    }).sort((a, b) => (a.sem_conversao - b.sem_conversao) || a.entregador.localeCompare(b.entregador, "pt-BR"));
    const total = { pacotes: linhas.filter(l => l.bloco !== "terceirizada").reduce((s, l) => s + l.pacotes, 0),
        entregadores: linhas.filter(l => l.bloco !== "terceirizada" && !l.sem_conversao && l.pacotes).length,
        pacotes_terceirizada: linhas.filter(l => l.bloco === "terceirizada").reduce((s, l) => s + l.pacotes, 0) };
    for (const [c] of _CH_LINHAS) total[c] = _chR2(linhas.reduce((s, l) => s + (l[c] || 0), 0));
    return { linhas, total, comAjustes };
}

/** Valores que dá pra escolher em cada filtro (os que aparecem nos pacotes dos resumos escolhidos). */
function _chOpcoes(dados, campo, blocos) {
    const vazio = campo === "cidade" ? "(sem cidade)" : campo === "polo" ? "(sem polo)" : "";
    return (dados.grupos || []).filter(g => !blocos || blocos.includes(g.bloco || "entregadores")).map(g => g[campo] || vazio);
}

/** Topo do Resumo: a conta e o "por transportadora" dos resumos escolhidos, sem os filtros de baixo. */
function _chHtmlTopo(dados, blocos, codigo) {
    const r = _chAgregar(dados, {}, blocos);
    const t = r.total;
    const item = (rot, v, cls) => `<div class="rq-conta-item"><span class="rq-conta-rot">${rot}</span><span class="rq-conta-val${v && cls ? " " + cls : ""}">${_rqNum(v)}</span></div>`;
    const op = (s) => `<span class="rq-conta-op">${s}</span>`;
    const porT = new Map();
    for (const g of dados.grupos || []) {
        if (blocos && !blocos.includes(g.bloco || "entregadores")) continue;
        const x = porT.get(g.transportadora) || { nome: g.transportadora, pacotes: 0, valor: 0 };
        if (g.bloco !== "terceirizada") x.pacotes += g.pacotes;
        x.valor += g.bruto;
        porT.set(g.transportadora, x);
    }
    const cores = new Map((typeof _CF_TRANSPORTADORAS !== "undefined" ? _CF_TRANSPORTADORAS : []).map(x => [x.label, x.cor]));
    const ts = [...porT.values()].sort((a, b) => b.valor - a.valor);
    return `<div class="rq-topo"><div class="rq-conta">
            ${item("Bruto (R$)", t.bruto)}${op("+")}${item("Coletas", t.coletas, "cft-pos")}${op("+")}${item("Acréscimos", t.acrescimos, "cft-pos")}${op("+")}${item("Deslocamento", t.viagens, "cft-pos")}
            ${op("−")}${item("Ticketlog", t.ticketlog, "cft-neg")}${op("−")}${item(`Extravios · ${_rqEsc(codigo || "")}`, t.extravios, "cft-neg")}${op("−")}${item("Descontos", t.descontos, "cft-neg")}${op("=")}
            <div class="rq-conta-item rq-conta-total"><span class="rq-conta-rot">Líquido (R$)</span><span class="rq-conta-val cft-pos">${_rqNum(t.liquido)}</span></div>
        </div>
        <div class="rq-meta"><b>${t.entregadores.toLocaleString("pt-BR")}</b> entregadores · <b>${t.pacotes.toLocaleString("pt-BR")}</b> pacotes${t.pacotes_terceirizada
            ? ` · terceirizada sobre <b>${t.pacotes_terceirizada.toLocaleString("pt-BR")}</b> deles` : ""}</div></div>
        ${ts.length ? `<div class="cft-secao">Por transportadora</div><div class="rq-transp">${ts.map(x => {
            const pct = t.bruto ? x.valor / t.bruto * 100 : 0;
            return `<div class="rq-transp-linha" style="--rq-cor:${cores.get(x.nome) || "#64748b"}">
                <span class="rq-transp-nome">${_rqEsc(x.nome)}</span>
                <span class="rq-transp-pac">${x.pacotes.toLocaleString("pt-BR")} pacotes</span>
                <span class="rq-transp-barra"><em><i style="width:${pct.toFixed(1)}%"></i></em></span>
                <span class="rq-transp-pct">${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                <span class="rq-transp-valor">${_rqNum(x.valor)}</span></div>`; }).join("")}</div>` : ""}`;
}

async function _chCarregar() {
    const el = document.getElementById("rq-painel-cheio");
    const chave = `${_rqAno}-${_rqMes}-${_rqQuinzena}`;
    if (_chDados && _chDados.chave === chave) { _chRender(); return; }
    el.innerHTML = skLogo(false, "Somando do cheio ao líquido");
    try {
        const r = await fetch(`${_RQ_API()}/valores-quinzena?mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}`, { headers: { "Authorization": "Bearer " + token } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro ao carregar.");
        if (chave !== `${_rqAno}-${_rqMes}-${_rqQuinzena}`) return;
        _chDados = { ...d, chave };
        _chFiltros = { transportadora: null, cidade: null, polo: null };
        _chRender();
    } catch (err) {
        el.innerHTML = `<div class="cft-erro">${_rqEsc(err.message)}</div>`;
        const topo = document.getElementById("rq-topo-cheio");
        if (topo) topo.innerHTML = `<div class="cft-erro">${_rqEsc(err.message)}</div>`;
    }
}

function _chFiltrar(btn, campo) {
    colfAbrir(btn, {
        valores: _chOpcoes(_chDados, campo, _rqResumos),
        selecionados: _chFiltros[campo] ? new Set(_chFiltros[campo]) : null,
        aoAplicar: (sel) => { _chFiltros[campo] = sel ? [...sel] : null; _chRender(); },
    });
}

function _chHtml(dados, filtros, blocos) {
    const r = _chAgregar(dados, filtros, blocos);
    const varios = !blocos || blocos.length > 1;
    const etiqueta = (l) => !varios ? "" : l.bloco === "interno" ? ` <span class="cft-ajuda">· GC Interno</span>` : l.bloco === "terceirizada" ? ` <span class="cft-ajuda">· Terceirizada</span>` : "";
    const t = r.total;
    const rotFiltro = (campo, nome) => {
        const f = filtros[campo];
        return `<button type="button" class="cft-btn${f ? " primario" : ""}" onclick="_chFiltrar(this, '${campo}')">${nome}: ${f ? (f.length === 1 ? _rqEsc(f[0]) : f.length + " escolhidos") : "todas"} ▾</button>`;
    };
    const algum = filtros.transportadora || filtros.cidade || filtros.polo;
    const v = (c, n) => !r.comAjustes && _CH_AJUSTES.includes(c) ? `<span class="cft-vazio">—</span>` : _rqNum(n);
    const cor = (c, sinal) => c === "liquido" || c === "bruto" || c === "cheio" ? "" : sinal === "−" ? "cft-neg" : "cft-pos";
    return `
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap">
            ${rotFiltro("transportadora", "Transportadora")}${rotFiltro("cidade", "Cidade")}${rotFiltro("polo", "Polo")}
            ${algum ? `<button type="button" class="cft-link" onclick="_chFiltros={transportadora:null,cidade:null,polo:null};_chRender()">Limpar filtros</button>` : ""}
            <span style="flex:1"></span>
            <button type="button" class="cft-btn" onclick="_chCopiarResumo(this, 'entregadores')" title="Copia o resumo dos entregadores na quinzena inteira (sem os filtros) pronto pra colar no WhatsApp">Copiar resumo dos entregadores</button>
            <button type="button" class="cft-btn" onclick="_chCopiarResumo(this, 'terceirizada')" title="Copia o resumo da Terceirizada - Expedição Videira na quinzena, pronto pra colar no WhatsApp">Copiar resumo da Terceirizada Videira</button>
        </div>
        ${dados.sem_conta ? `<div class="cft-pend" style="margin:8px 0"><div class="cft-pend-titulo">Recalcular</div>
            ${dados.sem_conta.toLocaleString("pt-BR")} pacote(s) foram calculados antes desta conta e aparecem sem perda. Clique em
            <b>Recalcular todas</b> no Criar Fechamento desta quinzena.</div>` : ""}
        ${!r.comAjustes ? `<div class="cft-ajuda" style="margin:8px 0">Com filtro de transportadora ou cidade, coletas, acréscimos, viagens, Ticketlog, extravios e descontos
            ficam de fora — são do entregador inteiro, não de uma parte dos pacotes. O líquido aqui é só o bruto.</div>` : ""}
        <div class="ch-cascata">
            ${_CH_LINHAS.map(([c, rot, sinal]) => `<div class="ch-linha${sinal === "=" || c === "cheio" ? " ch-total" : ""}">
                <span class="ch-sinal">${sinal}</span><span class="ch-rot">${rot}</span>
                <span class="ch-val ${cor(c, sinal)}">${v(c, t[c])}</span></div>`).join("")}
        </div>
        <div class="cft-ajuda" style="margin:6px 0 12px">${t.pacotes.toLocaleString("pt-BR")} pacotes · ${t.entregadores} entregador(es)${t.pacotes_terceirizada ? ` (a terceirizada recebe sobre ${t.pacotes_terceirizada.toLocaleString("pt-BR")} deles)` : ""}.
            Valor cheio = todo pacote entregue pelo máximo (100% da performance, valor fixo inteiro, ou cidade com incentivo e sem desconto). Pacote não entregue não entra.</div>
        <div class="cft-tabela-wrap" style="max-height:560px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th style="text-align:right">Pacotes</th>${_CH_LINHAS.map(([, rot]) => `<th style="text-align:right">${rot}</th>`).join("")}</tr></thead>
            <tbody>${r.linhas.length ? r.linhas.map(l => `<tr><td>${_rqEsc(l.entregador)}${etiqueta(l)}${l.sem_conversao ? ` <span class="cft-aviso">sem conversão</span>` : ""}</td>
                <td class="num">${l.pacotes.toLocaleString("pt-BR")}</td>
                ${_CH_LINHAS.map(([c, , sinal]) => `<td class="num ${l[c] ? cor(c, sinal) : ""}">${l[c] ? v(c, l[c]) : `<span class="cft-vazio">—</span>`}</td>`).join("")}</tr>`).join("")
                : `<tr><td colspan="${_CH_LINHAS.length + 2}" class="cft-vazio" style="padding:12px">Nada com esse filtro.</td></tr>`}</tbody>
            ${r.linhas.length ? `<tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${t.pacotes.toLocaleString("pt-BR")}</strong></td>
                ${_CH_LINHAS.map(([c]) => `<td class="num"><strong>${v(c, t[c])}</strong></td>`).join("")}</tr></tfoot>` : ""}
        </table></div>`;
}

// ── Copiar resumo da quinzena (19/11/2026): texto pronto pro WhatsApp, da quinzena inteira
// (sem os filtros de transportadora/cidade/polo). A conta FECHA: valor cheio − descontos +
// adicionais = líquido. Acréscimos e descontos lançados vão numa linha só (o saldo), pra não
// inflar os dois lados — pedido do usuário.
const _CH_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const _CH_DESC_RESUMO = [["fora_prazo", "Fora do prazo"], ["ocorrencias", "Ocorrências"], ["pod", "POD"], ["pnr", "PNR acima do limite"],
    ["extravios", "Extravios"], ["ticketlog", "Ticketlog"]];

/** "R$ 1.234,50"; negativo sai "−R$ 1.234,50". */
function _chMoeda(n) {
    const v = Number(n) || 0;
    return (v < 0 ? "−" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const _chPct = (parte, todo) => todo ? (parte / todo * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%" : null;

/** Texto do resumo a partir do total de _chAgregar (sem filtros) e da quinzena. */
function _chTextoResumo(t, { mes, ano, quinzena }) {
    const desc = _CH_DESC_RESUMO.filter(([c]) => t[c]);
    const totalDesc = _chR2(desc.reduce((s, [c]) => s + t[c], 0));
    const saldoLanc = _chR2((t.acrescimos || 0) - (t.descontos || 0));
    const adic = [["Coletas", _chR2(t.coletas)], ["Deslocamento (viagens)", _chR2(t.viagens)],
        ["Acréscimos menos descontos lançados", saldoLanc]].filter(([, v]) => v);
    const totalAdic = _chR2(adic.reduce((s, [, v]) => s + v, 0));
    const pct = _chPct(totalDesc, t.cheio);
    return [
        `*Resumo da quinzena Q${quinzena} de ${_CH_MESES[mes - 1]}/${ano}*`,
        "",
        `*${t.pacotes.toLocaleString("pt-BR")} pacotes* que estamos pagando aos entregadores terceirizados (${t.entregadores.toLocaleString("pt-BR")} entregadores)`,
        "",
        `*Valor presumido para pagamento dos entregadores terceirizados (líquido): ${_chMoeda(t.liquido)}*`,
        "",
        `Valor cheio (todo pacote entregue pelo valor máximo): ${_chMoeda(t.cheio)}`,
        "",
        "*Descontos que os entregadores tiveram:*",
        ...(desc.length ? desc.map(([c, rot]) => `• ${rot}: ${_chMoeda(t[c])}`) : ["• Nenhum"]),
        `*Total de descontos: ${_chMoeda(totalDesc)}*${pct ? ` (${pct} do valor cheio)` : ""}`,
        ...(adic.length ? ["", "*Adicionais:*", ...adic.map(([rot, v]) => `• ${rot}: ${_chMoeda(v)}`), `*Total de adicionais: ${_chMoeda(totalAdic)}*`] : []),
        "",
        `Conta: ${_chMoeda(t.cheio)} − ${_chMoeda(totalDesc)}${adic.length ? ` ${totalAdic < 0 ? "−" : "+"} ${_chMoeda(Math.abs(totalAdic))}` : ""} = ${_chMoeda(t.liquido)}`,
    ].join("\n");
}

/**
 * Modelo da Terceirizada - Expedição Videira: pacotes das cidades dela × R$ por pacote, por
 * cidade, coletas/acréscimos, extravios/descontos e o líquido. Sai dos dados da própria tela
 * (bloco "terceirizada"); R$ por pacote = bruto ÷ pacotes.
 */
function _chTextoTerceirizada(dados, { mes, ano, quinzena }) {
    const grupos = (dados.grupos || []).filter(g => g.bloco === "terceirizada");
    const aj = (dados.entregadores || []).find(a => a.bloco === "terceirizada") || {};
    const porCidade = new Map();
    for (const g of grupos) porCidade.set(g.cidade || "(sem cidade)", (porCidade.get(g.cidade || "(sem cidade)") || 0) + (g.pacotes || 0));
    const pacotes = grupos.reduce((s, g) => s + (g.pacotes || 0), 0);
    const bruto = _chR2(grupos.reduce((s, g) => s + (g.bruto || 0), 0));
    const porPacote = pacotes ? _chR2(bruto / pacotes) : 0;
    const coletas = _chR2(aj.coletas), acresc = _chR2(aj.acrescimos), ext = _chR2(aj.extravios), desc = _chR2(aj.descontos);
    const liquido = _chR2(bruto + coletas + acresc - ext - desc);
    const n = (x) => Number(x || 0).toLocaleString("pt-BR");
    const cidades = [...porCidade.entries()].filter(([, q]) => q).sort((a, b) => b[1] - a[1]);
    return [
        `*Resumo da quinzena Q${quinzena} de ${_CH_MESES[mes - 1]}/${ano} — Terceirizada Expedição Videira*`,
        "",
        `*${n(pacotes)} pacotes* nas cidades da terceirizada × ${_chMoeda(porPacote)} = *${_chMoeda(bruto)}*`,
        ...cidades.map(([c, q]) => `• ${c}: ${n(q)}`),
        ...(coletas || acresc ? ["", "*Adicionais:*", ...(coletas ? [`• Coletas: ${_chMoeda(coletas)}`] : []), ...(acresc ? [`• Acréscimos: ${_chMoeda(acresc)}`] : [])] : []),
        ...(ext || desc ? ["", "*Descontos:*",
            ...(ext ? [`• Extravios: ${aj.extravios_qtd ? `${n(aj.extravios_qtd)} pedido${aj.extravios_qtd !== 1 ? "s" : ""} — ` : ""}${_chMoeda(ext)}`] : []),
            ...(desc ? [`• Descontos: ${_chMoeda(desc)}`] : [])] : []),
        "",
        `*Valor presumido para pagamento da terceirizada (líquido): ${_chMoeda(liquido)}*`,
        "",
        `Conta: ${_chMoeda(bruto)}${coletas || acresc ? ` + ${_chMoeda(_chR2(coletas + acresc))}` : ""}${ext || desc ? ` − ${_chMoeda(_chR2(ext + desc))}` : ""} = ${_chMoeda(liquido)}`,
    ].join("\n");
}

function _chCopiarResumo(btn, tipo) {
    if (!_chDados) return;
    const per = { mes: _rqMes, ano: _rqAno, quinzena: _rqQuinzena };
    // Entregadores: só o resumo "Entregadores" (o texto fala dos terceirizados), seja qual for a escolha na tela.
    const texto = tipo === "terceirizada" ? _chTextoTerceirizada(_chDados, per)
        : _chTextoResumo(_chAgregar(_chDados, {}, ["entregadores"]).total, per);
    const rotulo = btn.innerText;
    const aviso = (msg) => { btn.innerText = msg; setTimeout(() => { btn.innerText = rotulo; }, 1800); };
    const jeitoVelho = () => {
        try {
            const ta = document.createElement("textarea");
            ta.value = texto;
            ta.style.cssText = "position:fixed;left:-9999px;top:0";
            document.body.appendChild(ta);
            ta.select();
            const deu = document.execCommand("copy");
            ta.remove();
            aviso(deu ? "Copiado!" : "Não consegui copiar");
        } catch (_) { aviso("Não consegui copiar"); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(() => aviso("Copiado!")).catch(jeitoVelho);
    else jeitoVelho();
}

function _chRender() {
    const el = document.getElementById("rq-painel-cheio");
    if (el && _chDados) el.innerHTML = _chHtml(_chDados, _chFiltros, _rqResumos);
    const topo = document.getElementById("rq-topo-cheio");
    if (topo && _chDados) topo.innerHTML = _chHtmlTopo(_chDados, _rqResumos, _rqDados && _rqDados.codigo_quinzena);
}
