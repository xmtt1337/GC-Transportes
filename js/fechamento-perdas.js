// ───── FECHAMENTO › PERDAS POR DESEMPENHO ─────
// Quanto cada entregador deixou de receber na quinzena, por aba: Resumo por entregador, Fora
// do prazo (atrasado/não entregue), Ocorrências (onhold), PNR e Por dia. Filtros de
// entregador, polo e cidade (cidade = a do nome padrão, "Fulano - Cidade").
// Conta (backend perdas.js): performance = pacotes × (R$ de 100% − R$ do dia), dividido
// entre as ocorrências do dia; PNR = entregas que caíram × (R$ do dia − tarifa mínima).
const _PD_API = () => `${API}/admin/fechamento-transportadoras`;
const _PD_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const _PD_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const _PD_ABAS = [["resumo", "Resumo por entregador"], ["prazo", "Fora do prazo"], ["onhold", "Ocorrências (onhold)"], ["pnr", "PNR"], ["dias", "Por dia"]];
let _pdDados = null;
let _pdAba = "resumo";

function _pdEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _pdNum(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _pdPct(n) {
    return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
}
function _pdDia(iso) {
    const [, m, d] = String(iso || "").split("-");
    return d ? `${d}/${m}` : "—";
}
function _pdSem(iso) { return _PD_SEM[new Date(iso + "T12:00:00Z").getUTCDay()]; }
function _pdNorm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
function _pdQs() {
    const v = (id) => parseInt(document.getElementById(id).value, 10);
    return `mes=${v("pd-mes")}&ano=${v("pd-ano")}&quinzena=${v("pd-q")}`;
}

function abrirPerdasDesempenho(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-perdas");
    const d = new Date();
    const h = { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
    document.getElementById("pd-conteudo").innerHTML = `
        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Perdas por desempenho</div>
            <div class="cft-ajuda" style="margin-bottom:10px">Quanto cada entregador deixou de receber na quinzena (polos da regra da performance).
                <b>Performance:</b> pacotes do dia × (R$ de 100% − R$ que ele fez), dividido entre os onholds e atrasos do dia.
                <b>PNR:</b> entregas que caíram pra tarifa mínima × (R$ do dia − tarifa mínima); valor fixo: a diferença pro fixo com desconto.
                O pacote não entregue em si não entra — só o quanto ele derrubou a performance.</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <select class="fech-select" id="pd-q" onchange="_pdCarregar()">
                    <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
                <select class="fech-select" id="pd-mes" onchange="_pdCarregar()">${_PD_MESES.map((m, i) =>
                    `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
                <select class="fech-select" id="pd-ano" onchange="_pdCarregar()">${[h.ano - 1, h.ano].map(a =>
                    `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
                <input class="cft-input" id="pd-entregador" list="pd-entregadores" placeholder="Entregador..." style="width:260px;flex:0 0 auto;margin:0" oninput="_pdRender()">
                <datalist id="pd-entregadores"></datalist>
                <select class="fech-select" id="pd-polo" onchange="_pdRender()"><option value="">Todos os polos</option></select>
                <select class="fech-select" id="pd-cidade" onchange="_pdRender()"><option value="">Todas as cidades</option></select>
                <a href="#" class="cft-ajuda" style="text-decoration:underline" onclick="event.preventDefault();_pdLimpar()">limpar filtros</a>
            </div>
        </div>
        <div id="pd-lista"></div>`;
    _pdCarregar();
}

function _pdCarregar() {
    const el = document.getElementById("pd-lista");
    if (!el) return;
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_PD_API()}/perdas?${_pdQs()}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_pdEsc(d.error)}</div>`; return; }
        _pdDados = d;
        _pdOpcoes();
        _pdRender();
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

// Opções dos filtros a partir do que veio (mantém o que estava escolhido).
function _pdOpcoes() {
    const dias = (_pdDados || {}).dias || [];
    const uniq = (f) => [...new Set(dias.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const preencher = (id, todos, lista) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const atual = sel.value;
        sel.innerHTML = `<option value="">${todos}</option>` + lista.map(x => `<option value="${_pdEsc(x)}"${x === atual ? " selected" : ""}>${_pdEsc(x)}</option>`).join("");
    };
    preencher("pd-polo", "Todos os polos", uniq(d => d.polo));
    preencher("pd-cidade", "Todas as cidades", uniq(d => d.cidade));
    const dl = document.getElementById("pd-entregadores");
    if (dl) dl.innerHTML = uniq(d => d.driver).map(n => `<option value="${_pdEsc(n)}">`).join("");
}

function _pdLimpar() {
    for (const id of ["pd-entregador", "pd-polo", "pd-cidade"]) { const e = document.getElementById(id); if (e) e.value = ""; }
    _pdRender();
}

function _pdFiltro() {
    const v = (id) => (document.getElementById(id) || {}).value || "";
    const ent = _pdNorm(v("pd-entregador")), polo = v("pd-polo"), cidade = v("pd-cidade");
    return (x) => (!ent || _pdNorm(x.driver).includes(ent)) && (!polo || x.polo === polo) && (!cidade || x.cidade === cidade);
}

function _pdAbrirAba(aba) { _pdAba = aba; _pdRender(); }

/** Entregador × quinzena a partir dos dias (já filtrados). */
function _pdPorEntregador(dias) {
    const m = new Map();
    for (const d of dias) {
        const r = m.get(d.driver) || { driver: d.driver, cidade: d.cidade, polos: new Map(), dias: 0, afetados: 0, onholds: 0, atrasos: 0, pnr: 0,
            pacotes_minima: 0, perda_performance: 0, perda_pnr: 0, total: 0 };
        r.polos.set(d.polo, (r.polos.get(d.polo) || 0) + 1);
        r.dias++;
        if (d.total > 0) r.afetados++;
        r.onholds += d.onholds; r.atrasos += d.atrasos; r.pnr += d.pnr; r.pacotes_minima += d.pacotes_minima;
        r.perda_performance += d.perda_performance; r.perda_pnr += d.perda_pnr; r.total += d.total;
        m.set(d.driver, r);
    }
    return [...m.values()].map(r => ({ ...r, polo: [...r.polos.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
        .sort((a, b) => b.total - a.total || a.driver.localeCompare(b.driver, "pt-BR"));
}

function _pdRender() {
    const el = document.getElementById("pd-lista");
    if (!el || !_pdDados) return;
    const ok = _pdFiltro();
    const dias = (_pdDados.dias || []).filter(ok);
    const oc = (_pdDados.ocorrencias || []).filter(ok);
    const soma = (lista, f) => lista.reduce((s, x) => s + (Number(f(x)) || 0), 0);
    const perf = soma(dias, d => d.perda_performance), pnr = soma(dias, d => d.perda_pnr);
    const ents = _pdPorEntregador(dias);
    const deTipo = (tipos) => oc.filter(o => tipos.includes(o.tipo));
    const contagem = { resumo: ents.filter(e => e.total > 0).length, prazo: deTipo(["Atrasado", "Não entregue"]).length,
        onhold: deTipo(["Onhold"]).length, pnr: deTipo(["PNR"]).length, dias: dias.filter(d => d.total > 0).length };
    el.innerHTML = `
        <div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor cft-neg">R$ ${_pdNum(perf + pnr)}</div><div class="cft-kpi-rotulo">Deixaram de receber</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">R$ ${_pdNum(perf)}</div><div class="cft-kpi-rotulo">Performance (onhold e atraso)</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">R$ ${_pdNum(pnr)}</div><div class="cft-kpi-rotulo">PNR</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${contagem.resumo} de ${ents.length}</div><div class="cft-kpi-rotulo">Entregadores com perda</div></div>
        </div>
        <div class="filtro-tabs" style="margin-bottom:12px">${_PD_ABAS.map(([k, n]) =>
            `<button type="button" class="filtro-tab${k === _pdAba ? " active" : ""}" onclick="_pdAbrirAba('${k}')">${n} <span class="cft-ajuda">${contagem[k]}</span></button>`).join("")}</div>
        <div class="cft-tabela-wrap" style="max-height:62vh;overflow-y:auto">${_pdTabela(_pdAba, { ents, dias, deTipo })}</div>`;
}

function _pdTabela(aba, { ents, dias, deTipo }) {
    const vazio = (n) => `<tr><td colspan="${n}" class="cft-vazio" style="padding:14px">Nada por aqui.</td></tr>`;
    const dia = (iso) => `${_pdDia(iso)} <span class="cft-ajuda">${_pdSem(iso)}</span>`;
    const perdido = (v, situacao) => `<td class="num${v > 0 ? " cft-neg" : ""}">${v > 0 ? "−" + _pdNum(v)
        : situacao ? `<span class="cft-ajuda">${_pdEsc(situacao)}</span>` : "—"}</td>`;
    const total = (cols, v) => `<tr><td colspan="${cols}"><strong>Total</strong></td><td class="num cft-neg"><strong>${v > 0 ? "−" + _pdNum(v) : "—"}</strong></td></tr>`;
    if (aba === "resumo") {
        const lista = ents.filter(e => e.total > 0);
        return `<table class="cft-tabela"><thead><tr><th>Entregador</th><th>Polo</th><th>Cidade</th><th style="text-align:right">Dias afetados</th>
            <th style="text-align:right">Onholds</th><th style="text-align:right">Fora do prazo</th><th style="text-align:right">PNR</th>
            <th style="text-align:right">Performance</th><th style="text-align:right">PNR (R$)</th><th style="text-align:right">Total</th></tr></thead>
            <tbody>${lista.length ? lista.map(e => `<tr style="cursor:pointer" title="Filtrar por este entregador" data-n="${_pdEsc(e.driver)}"
                onclick="document.getElementById('pd-entregador').value=this.dataset.n;_pdAba='dias';_pdRender()">
                <td>${_pdEsc(e.driver)}</td><td>${_pdEsc(e.polo || "—")}</td><td>${_pdEsc(e.cidade || "—")}</td>
                <td class="num">${e.afetados} de ${e.dias}</td><td class="num">${e.onholds}</td><td class="num">${e.atrasos}</td><td class="num">${e.pnr}</td>
                ${perdido(e.perda_performance)}${perdido(e.perda_pnr)}<td class="num cft-neg"><strong>−${_pdNum(e.total)}</strong></td>
            </tr>`).join("") + `<tr><td colspan="7"><strong>Total</strong></td>${perdido(lista.reduce((s, e) => s + e.perda_performance, 0))}${perdido(lista.reduce((s, e) => s + e.perda_pnr, 0))}
                <td class="num cft-neg"><strong>−${_pdNum(lista.reduce((s, e) => s + e.total, 0))}</strong></td></tr>` : vazio(10)}</tbody></table>`;
    }
    // Ocorrências: a perda é do DIA (entregador × dia) — aparece uma vez, na 1ª linha do dia;
    // as outras linhas do mesmo dia ficam em branco (ou dizem por que não custaram nada).
    const porDiaMap = new Map(((_pdDados || {}).dias || []).map(d => [d.driver + "|" + d.dia, d]));
    const ordenar = (l) => l.slice().sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.driver.localeCompare(b.driver, "pt-BR")));
    const perdaDoDia = (lista, campo) => {
        const vistos = new Set();
        let soma = 0;
        const celulas = lista.map(o => {
            const k = o.driver + "|" + o.dia;
            if (vistos.has(k)) return o.situacao ? `<td class="num"><span class="cft-ajuda">${_pdEsc(o.situacao)}</span></td>` : "<td></td>";
            vistos.add(k);
            const d = porDiaMap.get(k);
            const v = d ? d[campo] : 0;
            soma += v;
            return perdido(v, v ? null : o.situacao);
        });
        return { celulas, soma };
    };
    const thDia = (titulo) => `<th style="text-align:right" title="${titulo}">Deixou de receber no dia</th>`;
    if (aba === "prazo") {
        const lista = ordenar(deTipo(["Atrasado", "Não entregue"]));
        const pd = perdaDoDia(lista, "perda_performance");
        return `<table class="cft-tabela"><thead><tr><th>Dia</th><th>Entregador</th><th>Transportadora</th><th>Código</th><th>Deveria</th><th>Entregue</th>
            <th style="text-align:right" title="Performance do entregador no dia">% do dia</th>
            ${thDia("Perda de performance do dia inteiro (onholds e atrasos juntos), na 1ª linha de cada dia")}</tr></thead>
            <tbody>${lista.length ? lista.map((o, i) => `<tr><td>${dia(o.dia)}</td><td>${_pdEsc(o.driver)}</td><td>${_pdEsc(o.transportadora || "")}</td>
                <td>${_pdEsc(o.codigo || "")}</td><td>${_pdDia(o.deveria)}</td><td>${o.entregue ? _pdDia(o.entregue) : `<span class="cft-aviso">não entregue</span>`}</td>
                <td class="num">${porDiaMap.has(o.driver + "|" + o.dia) ? _pdPct(porDiaMap.get(o.driver + "|" + o.dia).pct) : "—"}</td>
                ${pd.celulas[i]}</tr>`).join("") + total(7, pd.soma) : vazio(8)}</tbody></table>`;
    }
    if (aba === "onhold" || aba === "pnr") {
        const lista = ordenar(deTipo([aba === "onhold" ? "Onhold" : "PNR"]));
        const pnr = aba === "pnr";
        const pd = perdaDoDia(lista, pnr ? "perda_pnr" : "perda_performance");
        return `<table class="cft-tabela"><thead><tr><th>Dia</th><th>Entregador</th><th>Transportadora</th>${pnr ? "<th>Usuário</th>" : ""}<th>Código</th>
            <th>${aba === "onhold" ? "Motivo" : "Aberta em"}</th>${thDia(pnr ? "O que a PNR tirou do dia inteiro, na 1ª linha de cada dia"
                : "Perda de performance do dia inteiro (onholds e atrasos juntos), na 1ª linha de cada dia")}</tr></thead>
            <tbody>${lista.length ? lista.map((o, i) => `<tr><td>${dia(o.dia)}</td><td>${_pdEsc(o.driver)}</td><td>${_pdEsc(o.transportadora || "")}</td>
                ${pnr ? `<td class="cft-ajuda">${_pdEsc(o.usuario || "—")}</td>` : ""}<td>${_pdEsc(o.codigo || "")}</td>
                <td class="cft-ajuda">${aba === "onhold" ? `${_pdEsc(o.motivo || "")}${o.hora ? ` · ${_pdEsc(o.hora)}` : ""}` : `${_pdDia(o.ocorrencia)}${o.hora ? ` às ${_pdEsc(o.hora)}` : ""}`}</td>
                ${pd.celulas[i]}</tr>`).join("") + total(pnr ? 6 : 5, pd.soma) : vazio(pnr ? 7 : 6)}</tbody></table>`;
    }
    const lista = dias.filter(d => d.total > 0).sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.driver.localeCompare(b.driver, "pt-BR")));
    return `<table class="cft-tabela"><thead><tr><th>Dia</th><th>Entregador</th><th style="text-align:right">Performance</th><th style="text-align:right">R$/pacote</th>
        <th style="text-align:right">Pacotes</th><th style="text-align:right">Onhold / atraso</th><th style="text-align:right">PNR</th>
        <th style="text-align:right">Performance (R$)</th><th style="text-align:right">PNR (R$)</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${lista.length ? lista.map(d => `<tr><td>${dia(d.dia)}</td><td>${_pdEsc(d.driver)}</td>
            <td class="num">${_pdPct(d.pct)}</td>
            <td class="num">${d.fixo ? "fixo" : d.pacotes_minima && d.valor_medio
                ? `<span title="Média do dia: ${d.pacotes - d.pacotes_minima} pacotes a ${_pdNum(d.valor)} e ${d.pacotes_minima} na tarifa mínima a ${_pdNum(d.valor_minima)}">${_pdNum(d.valor_medio)}</span> <span class="cft-ajuda">de ${_pdNum(d.valor_maximo)}</span>
                    <div class="cft-ajuda">${d.pacotes - d.pacotes_minima} a ${_pdNum(d.valor)} · ${d.pacotes_minima} a ${_pdNum(d.valor_minima)}</div>`
                : `${_pdNum(d.valor)} <span class="cft-ajuda">de ${_pdNum(d.valor_maximo)}</span>`}</td>
            <td class="num">${d.pacotes}${d.pacotes_minima ? ` <span class="cft-ajuda">(${d.pacotes_minima} na mínima)</span>` : ""}</td>
            <td class="num">${d.onholds} / ${d.atrasos}</td><td class="num">${d.pnr}</td>
            ${perdido(d.perda_performance)}${perdido(d.perda_pnr)}<td class="num cft-neg"><strong>−${_pdNum(d.total)}</strong></td></tr>`).join("")
            + total(9, lista.reduce((s, d) => s + d.total, 0)) : vazio(10)}</tbody></table>`;
}
