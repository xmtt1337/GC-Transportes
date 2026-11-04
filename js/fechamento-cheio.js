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
 * Soma por entregador o que passa nos filtros. Sem filtro de transportadora/cidade, junta
 * a parte do entregador (coletas etc.); com filtro de polo, só de quem é daquele polo.
 * @return {{linhas: Array, total: Object, comAjustes: boolean}}
 */
function _chAgregar(dados, filtros) {
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
        if ((fT && !fT.has(g.transportadora)) || (fC && !fC.has(g.cidade || "(sem cidade)")) || (fP && !fP.has(g.polo || "(sem polo)"))) continue;
        const l = pegar(g.entregador, g.sem_conversao);
        for (const c of ["pacotes", "bruto", "fora_prazo", "ocorrencias", "pod", "pnr"]) l[c] += g[c] || 0;
    }
    if (comAjustes) {
        for (const a of dados.entregadores || []) {
            if (fP && !fP.has(a.polo || "(sem polo)")) continue;
            if (!_CH_AJUSTES.some(c => a[c]) && !por.has(a.entregador)) continue;
            const l = pegar(a.entregador, a.sem_conversao);
            for (const c of _CH_AJUSTES) l[c] += a[c] || 0;
        }
    }
    const linhas = [...por.values()].map(l => {
        for (const k of Object.keys(l)) if (typeof l[k] === "number" && k !== "pacotes") l[k] = _chR2(l[k]);
        l.cheio = _chR2(l.bruto + l.fora_prazo + l.ocorrencias + l.pod + l.pnr);
        l.liquido = _chR2(l.bruto + l.coletas + l.acrescimos + l.viagens - l.ticketlog - l.extravios - l.descontos);
        return l;
    }).sort((a, b) => (a.sem_conversao - b.sem_conversao) || a.entregador.localeCompare(b.entregador, "pt-BR"));
    const total = { pacotes: linhas.reduce((s, l) => s + l.pacotes, 0) };
    for (const [c] of _CH_LINHAS) total[c] = _chR2(linhas.reduce((s, l) => s + (l[c] || 0), 0));
    return { linhas, total, comAjustes };
}

/** Valores que dá pra escolher em cada filtro (os que aparecem nos pacotes). */
function _chOpcoes(dados, campo) {
    const vazio = campo === "cidade" ? "(sem cidade)" : campo === "polo" ? "(sem polo)" : "";
    return (dados.grupos || []).map(g => g[campo] || vazio);
}

async function _chCarregar() {
    const el = document.getElementById("rq-painel-cheio");
    if (_rqVisao !== "entregadores") { el.innerHTML = `<div class="cft-ajuda">Disponível na visão Entregadores.</div>`; return; }
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
    } catch (err) { el.innerHTML = `<div class="cft-erro">${_rqEsc(err.message)}</div>`; }
}

function _chFiltrar(btn, campo) {
    colfAbrir(btn, {
        valores: _chOpcoes(_chDados, campo),
        selecionados: _chFiltros[campo] ? new Set(_chFiltros[campo]) : null,
        aoAplicar: (sel) => { _chFiltros[campo] = sel ? [...sel] : null; _chRender(); },
    });
}

function _chHtml(dados, filtros) {
    const r = _chAgregar(dados, filtros);
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
        <div class="cft-ajuda" style="margin:6px 0 12px">${t.pacotes.toLocaleString("pt-BR")} pacotes · ${r.linhas.length} entregador(es).
            Valor cheio = todo pacote entregue pelo máximo (100% da performance, valor fixo inteiro, ou cidade com incentivo e sem desconto). Pacote não entregue não entra.</div>
        <div class="cft-tabela-wrap" style="max-height:560px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th style="text-align:right">Pacotes</th>${_CH_LINHAS.map(([, rot]) => `<th style="text-align:right">${rot}</th>`).join("")}</tr></thead>
            <tbody>${r.linhas.length ? r.linhas.map(l => `<tr><td>${_rqEsc(l.entregador)}${l.sem_conversao ? ` <span class="cft-aviso">sem conversão</span>` : ""}</td>
                <td class="num">${l.pacotes.toLocaleString("pt-BR")}</td>
                ${_CH_LINHAS.map(([c, , sinal]) => `<td class="num ${l[c] ? cor(c, sinal) : ""}">${l[c] ? v(c, l[c]) : `<span class="cft-vazio">—</span>`}</td>`).join("")}</tr>`).join("")
                : `<tr><td colspan="${_CH_LINHAS.length + 2}" class="cft-vazio" style="padding:12px">Nada com esse filtro.</td></tr>`}</tbody>
            ${r.linhas.length ? `<tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${t.pacotes.toLocaleString("pt-BR")}</strong></td>
                ${_CH_LINHAS.map(([c]) => `<td class="num"><strong>${v(c, t[c])}</strong></td>`).join("")}</tr></tfoot>` : ""}
        </table></div>`;
}

function _chRender() {
    const el = document.getElementById("rq-painel-cheio");
    if (el && _chDados) el.innerHTML = _chHtml(_chDados, _chFiltros);
}
