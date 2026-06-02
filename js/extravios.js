// ───── EXTRAVIOS DASHBOARD ─────

const EXTRV_URL = "https://docs.google.com/spreadsheets/d/1zTTZZ42BP8Ueo_ZIhhpyJuZWXqVygZ7bY1vT1fSdR38/export?format=csv&gid=1990894309";

const EXTRV_GC = [
    "GC Interno - Caçador",
    "GC Interno - Videira",
    "GC Expedição - Caçador",
    "GC Expedição - Videira"
];

const MES_NOMES_EX = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MES_FULL_EX  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const EXTRV_PALETA = [
    { bg:"rgba(1,180,247,0.82)",   bd:"#01b4f7" },
    { bg:"rgba(204,65,56,0.82)",   bd:"#cc4138" },
    { bg:"rgba(107,128,255,0.82)", bd:"#6b80ff" },
    { bg:"rgba(0,156,33,0.82)",    bd:"#009c21" },
    { bg:"rgba(237,77,45,0.82)",   bd:"#ed4d2d" },
    { bg:"rgba(251,146,60,0.82)",  bd:"#fb923c" },
    { bg:"rgba(167,139,250,0.82)", bd:"#a78bfa" },
    { bg:"rgba(251,191,36,0.82)",  bd:"#fbbf24" },
    { bg:"rgba(248,113,113,0.82)", bd:"#f87171" },
    { bg:"rgba(52,211,153,0.82)",  bd:"#34d399" },
];

let _extrvData    = null;
let _extrvChT     = null; // chart topo (anual)
let _extrvChM     = null; // chart mensal
let _extrvChC     = null; // chart contestações

// ── Navegação ──
function abrirExtraviosDash(event) {
    if (event) event.preventDefault();
    _iniciarFiltrosExtrv();
    mostrarTela("tela-extravios-dash");
    _carregarExtravios();
}

function abrirExtraviosBusca(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-extravios-busca");
    if (!_extrvData) {
        fetch(EXTRV_URL)
            .then(r => { if (!r.ok) throw new Error(); return r.text(); })
            .then(text => {
                const rows = _parseCSVExtrv(text);
                if (rows.length) _extrvData = rows;
            })
            .catch(() => {});
    }
}

function _iniciarFiltrosExtrv() {
    const sel = document.getElementById("extrv-sel-ano");
    const ano = new Date().getFullYear();
    sel.innerHTML = "";
    for (let a = ano - 2; a <= ano + 1; a++) {
        const o = document.createElement("option");
        o.value = a; o.textContent = a;
        if (a === ano) o.selected = true;
        sel.appendChild(o);
    }
    document.getElementById("extrv-sel-mes").value = new Date().getMonth() + 1;
}

function _filtrarExtravios() {
    if (_extrvData) _renderExtrDash(_extrvData);
    else _carregarExtravios();
}

function _extrvRefresh() {
    _extrvData = null;
    _extrvDestroyCharts();
    _carregarExtravios();
}

function _extrvBuscarCodigo() {
    const inp = document.getElementById("extrv-busca-input");
    const q   = (inp ? inp.value : "").trim();
    const clr = document.getElementById("extrv-busca-clear");
    if (clr) clr.style.display = q ? "" : "none";

    const res   = document.getElementById("extrv-busca-resultado");
    const empty = document.getElementById("extrv-busca-empty");

    if (!q) {
        res.style.display = "none";
        res.innerHTML = "";
        if (empty) empty.style.display = "";
        return;
    }

    if (empty) empty.style.display = "none";

    if (!_extrvData) {
        res.style.display = "";
        res.innerHTML = `<div class="ed-section"><div class="ed-vazio">Dados ainda não carregados. Aguarde o carregamento e tente novamente.</div></div>`;
        return;
    }

    const s = _extrvData[0];
    const BC = {
        codigo : _findCol(s, "CÓDIGO","Código","codigo","CODIGO"),
        unico  : _findCol(s, "ÚNICO","Único","unico","UNICO"),
        status : _findCol(s, "Status","STATUS","status"),
        transp : _findCol(s, "TRANSPORTADORA","Transportadora"),
        data   : _findCol(s, "DATA","Data","data"),
        hora   : _findCol(s, "HORA","Hora","hora"),
        cidade : _findCol(s, "Cidade","CIDADE","cidade"),
        valor  : _findCol(s, "Valor","VALOR","valor"),
        resp   : _findCol(s, "Responsavel","RESPONSAVEL","Responsável","RESPONSÁVEL"),
        end    : _findCol(s, "Endereço","ENDEREÇO","Endereco","ENDERECO"),
        causa  : _findCol(s, "CAUSA DO PROBLEMA","Causa do Problema","causa do problema"),
        ddesc  : _findCol(s, "Data desconto","DATA DESCONTO","Data Desconto"),
        desc   : _findCol(s, "Para desconto?","Para Desconto?","PARA DESCONTO?"),
    };

    const qNorm = _nk(q);
    const matches = _extrvData.filter(r => {
        const cod = _nk(BC.codigo ? r[BC.codigo] : "");
        return cod.includes(qNorm);
    });

    const statusColors = {
        "para desconto": "#fb923c", "contestado": "#3a86ff",
        "em analise": "#fbbf24", "lost": "#ef4444",
        "dmaged": "#a78bfa", "damaged": "#a78bfa",
    };
    function sBadgeColor(st) {
        const k = _nk(st||"");
        for (const [key, c] of Object.entries(statusColors)) {
            if (k.includes(key)) return c;
        }
        return "#64748b";
    }
    function bcField(lbl, val) {
        if (!val || !(val+"").trim()) return "";
        return `<div class="extrv-bc-field"><span class="extrv-bc-lbl">${lbl}</span><span class="extrv-bc-val">${val}</span></div>`;
    }

    if (!matches.length) {
        res.style.display = "";
        res.innerHTML = `<div class="ed-section">
            <div class="ed-section-title">Pesquisa por CÓDIGO</div>
            <div class="ed-vazio">Nenhum resultado para "<strong style="color:#f1f5f9">${q}</strong>"</div>
        </div>`;
        return;
    }

    const cards = matches.map(r => {
        const status   = (BC.status ? r[BC.status] : "") || "—";
        const codigo   = (BC.codigo ? r[BC.codigo] : "") || "—";
        const descVal  = (BC.desc ? r[BC.desc] : "") || "—";
        const descColor = _nk(descVal) === "sim" ? "#fb923c" : "#22c55e";
        const sc = sBadgeColor(status);
        const val = _parseV(BC.valor ? r[BC.valor] : "");
        return `<div class="extrv-busca-card">
            <div class="extrv-bc-header">
                <div class="extrv-bc-code">${codigo}</div>
                <span class="extrv-bc-badge" style="background:${sc}22;color:${sc};border-color:${sc}55">${status}</span>
            </div>
            <div class="extrv-bc-grid">
                ${bcField("Transportadora", BC.transp ? r[BC.transp] : "")}
                ${bcField("Data", BC.data ? r[BC.data] : "")}
                ${bcField("Hora", BC.hora ? r[BC.hora] : "")}
                ${bcField("Cidade", BC.cidade ? r[BC.cidade] : "")}
                ${bcField("Único", BC.unico ? r[BC.unico] : "")}
                ${bcField("Valor", val > 0 ? _moeda(val) : "")}
                ${bcField("Responsável", BC.resp ? r[BC.resp] : "")}
                ${bcField("Endereço", BC.end ? r[BC.end] : "")}
                ${bcField("Causa", BC.causa ? r[BC.causa] : "")}
                ${bcField("Data Desconto", BC.ddesc ? r[BC.ddesc] : "")}
                <div class="extrv-bc-field">
                    <span class="extrv-bc-lbl">Para Desconto</span>
                    <span class="extrv-bc-val" style="font-weight:700;color:${descColor}">${descVal}</span>
                </div>
            </div>
        </div>`;
    }).join("");

    res.style.display = "";
    res.innerHTML = `<div class="ed-section">
        <div class="ed-section-title">
            Pesquisa por CÓDIGO
            <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:#64748b;margin-left:4px">${matches.length} resultado${matches.length !== 1 ? "s" : ""} para "<em style="color:#f1f5f9">${q}</em>"</span>
        </div>
        <div class="extrv-busca-lista">${cards}</div>
    </div>`;
}

function _extrvLimparBusca() {
    const inp = document.getElementById("extrv-busca-input");
    if (inp) inp.value = "";
    _extrvBuscarCodigo();
}

function _extrvDestroyCharts() {
    if (_extrvChT) { _extrvChT.destroy(); _extrvChT = null; }
    if (_extrvChM) { _extrvChM.destroy(); _extrvChM = null; }
    if (_extrvChC) { _extrvChC.destroy(); _extrvChC = null; }
}

// ── CSV Parsing ──
function _splitCSVLine(line) {
    const vals = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQ && line[i+1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (c === ',' && !inQ) { vals.push(cur); cur = ""; }
        else cur += c;
    }
    vals.push(cur);
    return vals;
}

function _parseCSVExtrv(text) {
    const lines = text.split(/\r?\n/);
    if (!lines.length) return [];
    const headers = _splitCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g,""));
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const vals = _splitCSVLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i]||"").trim().replace(/^"|"$/g,""); });
        return obj;
    });
}

function _nk(s) {
    return (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
}

function _findCol(sample, ...cands) {
    const keys = Object.keys(sample);
    const nkeys = keys.map(_nk);
    for (const c of cands) {
        const i = nkeys.indexOf(_nk(c));
        if (i !== -1) return keys[i];
    }
    return null;
}

function _parseV(str) {
    if (!str) return 0;
    return parseFloat((str+"").replace(/[^\d,]/g,"").replace(",",".")) || 0;
}

function _parseD(str) {
    if (!str) return null;
    const p = (str+"").trim().split(/[\/\-\.]/);
    if (p.length < 3) return null;
    let d, m, y;
    if ((p[2]||"").length === 4) [d,m,y] = p; else [y,m,d] = p;
    const dd=parseInt(d), mm=parseInt(m), yy=parseInt(y);
    if (isNaN(dd)||isNaN(mm)||isNaN(yy)) return null;
    return {day:dd, month:mm, year:yy};
}

function _moeda(n) {
    return "R$ "+(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function _soma(rows, col) {
    if (!col) return 0;
    return rows.reduce((a,r) => a + _parseV(r[col]), 0);
}

function _isSim(r, col) {
    return col && _nk(r[col]) === "sim";
}

function _isContestado(r, col) {
    return col && _nk(r[col]).includes("contest");
}

// ── Fetch ──
async function _carregarExtravios() {
    const empty   = document.getElementById("extrv-empty");
    const content = document.getElementById("extrv-content");
    empty.style.display = "";
    empty.textContent   = "Carregando planilha...";
    content.style.display = "none";
    try {
        if (!_extrvData) {
            const resp = await fetch(EXTRV_URL);
            if (!resp.ok) throw new Error("HTTP "+resp.status);
            const text = await resp.text();
            const rows = _parseCSVExtrv(text);
            if (!rows.length) throw new Error("vazio");
            _extrvData = rows;
        }
        _renderExtrDash(_extrvData);
    } catch(e) {
        empty.textContent = "Erro ao carregar dados. A planilha precisa estar compartilhada como pública (qualquer pessoa com o link pode ver).";
    }
}

// ── Render principal ──
function _renderExtrDash(rows) {
    const ano = parseInt(document.getElementById("extrv-sel-ano").value);
    const mes = parseInt(document.getElementById("extrv-sel-mes").value);

    if (!rows.length) return;
    const s = rows[0];

    // Detectar colunas
    const C = {
        status : _findCol(s, "Status","STATUS","status","Situação","SITUAÇÃO"),
        transp : _findCol(s, "TRANSPORTADORA","Transportadora","transportadora","TRANSP"),
        data   : _findCol(s, "DATA","Data","data","DT","DATE"),
        valor  : _findCol(s, "Valor","VALOR","valor","VL"),
        resp   : _findCol(s, "Responsavel","RESPONSAVEL","Responsável","RESPONSÁVEL","Resp"),
        desc   : _findCol(s, "Para desconto?","Para Desconto?","PARA DESCONTO?","Para desconto","para desconto?"),
    };

    // Filtrar por ano (todos os meses do ano)
    const allYear = rows.filter(r => {
        if (!C.data) return true;
        const dt = _parseD(r[C.data]);
        return dt && dt.year === ano;
    });

    // Filtrar por mês selecionado
    const filtered = mes === 0 ? allYear : allYear.filter(r => {
        const dt = _parseD(C.data ? r[C.data] : "");
        return dt && dt.month === mes;
    });

    _extrvDestroyCharts();
    document.getElementById("extrv-empty").style.display = "none";
    document.getElementById("extrv-content").style.display = "";

    _renderChartTopo(allYear, C);
    _renderResumo(filtered, allYear, C, mes);
    _renderTransp(filtered, C);
    _renderDescontos(filtered, C);
    _renderContest(filtered, C);

    const elM = document.getElementById("extrv-mensal");
    if (mes === 0 && allYear.length) {
        elM.style.display = "";
        _renderMensal(allYear, C);
    } else if (mes !== 0) {
        elM.style.display = "";
        _renderMensal(allYear, C, mes);
    } else {
        elM.style.display = "none";
    }
}

// ────────────────────────────────────────────────────────
// SEÇÃO 1 — RESUMO GERAL
// ────────────────────────────────────────────────────────
function _renderResumo(rows, allYear, C, mes) {
    const total    = rows.length;
    const totalVal = _soma(rows, C.valor);
    const simRows  = rows.filter(r => _isSim(r, C.desc));
    const naoRows  = rows.filter(r => C.desc && _nk(r[C.desc]) === "nao");
    const simVal   = _soma(simRows, C.valor);
    const naoVal   = _soma(naoRows, C.valor);

    // Agrupar por status
    const statusMap = {};
    rows.forEach(r => {
        const s = (C.status ? r[C.status] : "") || "—";
        if (!statusMap[s]) statusMap[s] = {n:0, v:0};
        statusMap[s].n++;
        statusMap[s].v += _parseV(C.valor ? r[C.valor] : "");
    });
    const statusList = Object.entries(statusMap).sort((a,b) => b[1].n - a[1].n);

    const statusColors = {
        "para desconto": "#fb923c",
        "contestado":    "#3a86ff",
        "em analise":    "#fbbf24",
        "lost":          "#ef4444",
        "dmaged":        "#a78bfa",
        "damaged":       "#a78bfa",
        "fora de abrangencia": "#64748b",
    };
    function sColor(s) {
        const k = _nk(s);
        for (const [key, c] of Object.entries(statusColors)) {
            if (k.includes(key)) return c;
        }
        return "#94a3b8";
    }

    const statusHTML = statusList.map(([s, d]) => {
        const color = sColor(s);
        const pct   = total > 0 ? (d.n/total*100).toFixed(1) : 0;
        return `
        <div class="ed-status-row">
            <span class="ed-status-dot" style="background:${color}"></span>
            <span class="ed-status-name">${s}</span>
            <div class="ed-status-bar-wrap">
                <div class="ed-status-bar" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="ed-stat-n">${d.n}</span>
            <span class="ed-stat-v">${_moeda(d.v)}</span>
            <span class="ed-stat-pct">${pct}%</span>
        </div>`;
    }).join("");

    document.getElementById("extrv-resumo").innerHTML = `
    <div class="ed-section">
        <div class="ed-section-title">Visão Geral · ${mes !== 0 ? MES_FULL_EX[mes-1] : "Ano Completo"}</div>

        <div class="ed-kpi5">
            <div class="ed-kpi" style="--kc:#3a86ff">
                <div class="ed-kpi-lbl">Total Registros</div>
                <div class="ed-kpi-n" style="color:var(--kc)">${total}</div>
                <div class="ed-kpi-v">${_moeda(totalVal)}</div>
            </div>
            <div class="ed-kpi" style="--kc:#fb923c">
                <div class="ed-kpi-lbl">Para Desconto · SIM</div>
                <div class="ed-kpi-n" style="color:var(--kc)">${simRows.length}</div>
                <div class="ed-kpi-v">${_moeda(simVal)}</div>
            </div>
            <div class="ed-kpi" style="--kc:#22c55e">
                <div class="ed-kpi-lbl">Para Desconto · NÃO</div>
                <div class="ed-kpi-n" style="color:var(--kc)">${naoRows.length}</div>
                <div class="ed-kpi-v">${_moeda(naoVal)}</div>
            </div>
            <div class="ed-kpi" style="--kc:#3a86ff">
                <div class="ed-kpi-lbl">Qtd · Ano ${document.getElementById("extrv-sel-ano").value}</div>
                <div class="ed-kpi-n" style="color:var(--kc)">${allYear.length}</div>
                <div class="ed-kpi-v">${_moeda(_soma(allYear, C.valor))}</div>
            </div>
        </div>

        ${statusList.length ? `
        <div class="ed-sub-title" style="margin-top:14px">Por Status</div>
        <div class="ed-status-list">${statusHTML}</div>
        ` : ""}
    </div>`;
}

// ────────────────────────────────────────────────────────
// SEÇÃO 2 — POR TRANSPORTADORA
// ────────────────────────────────────────────────────────
function _renderTransp(rows, C) {
    const map = {};
    rows.forEach(r => {
        const t = (C.transp ? r[C.transp] : "") || "—";
        const isSim = _isSim(r, C.desc);
        if (!map[t]) map[t] = {total:0, totalV:0, sim:0, simV:0, nao:0, naoV:0};
        map[t].total++;
        map[t].totalV += _parseV(C.valor ? r[C.valor] : "");
        if (isSim) { map[t].sim++;  map[t].simV  += _parseV(C.valor ? r[C.valor] : ""); }
        else       { map[t].nao++;  map[t].naoV  += _parseV(C.valor ? r[C.valor] : ""); }
    });

    const sorted = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
    if (!sorted.length) { document.getElementById("extrv-transp").innerHTML=""; return; }

    const maxN = sorted[0][1].total;
    const grandTotal = sorted.reduce((a,[,d])=>a+d.total,0);
    const grandV     = sorted.reduce((a,[,d])=>a+d.totalV,0);

    const rows_html = sorted.map(([name, d]) => {
        const pct    = (d.total/maxN*100).toFixed(1);
        const pctTot = grandTotal > 0 ? (d.total/grandTotal*100).toFixed(1) : 0;
        const simPct = d.total > 0 ? (d.sim/d.total*100).toFixed(0) : 0;
        return `
        <div class="ed-tr-row">
            <div class="ed-tr-name">${name}</div>
            <div class="ed-tr-bars">
                <div class="ed-tr-bar-bg">
                    <div class="ed-tr-bar-fill sim" style="width:${(d.sim/maxN*100).toFixed(1)}%"></div>
                    <div class="ed-tr-bar-fill nao" style="width:${(d.nao/maxN*100).toFixed(1)}%"></div>
                </div>
            </div>
            <div class="ed-tr-stats">
                <div class="ed-tr-total">
                    <span class="ed-tr-n">${d.total}</span>
                    <span class="ed-tr-v">${_moeda(d.totalV)}</span>
                    <span class="ed-tr-pct">${pctTot}%</span>
                </div>
                <div class="ed-tr-detail">
                    <span class="ed-badge-sim">▲ SIM ${d.sim} · ${_moeda(d.simV)}</span>
                    <span class="ed-badge-nao">▽ NÃO ${d.nao} · ${_moeda(d.naoV)}</span>
                </div>
            </div>
        </div>`;
    }).join("");

    document.getElementById("extrv-transp").innerHTML = `
    <div class="ed-section">
        <div class="ed-section-title">Por Transportadora
            <span class="ed-legend">
                <span class="ed-leg-dot sim"></span>Para desconto SIM
                <span class="ed-leg-dot nao" style="margin-left:10px"></span>Para desconto NÃO
            </span>
        </div>
        <div class="ed-tr-header">
            <span>Transportadora</span><span></span>
            <span>Total · Valor · %</span>
        </div>
        <div class="ed-tr-list">${rows_html}</div>
        <div class="ed-tr-footer">Total: ${grandTotal} registros · ${_moeda(grandV)}</div>
    </div>`;
}

// ────────────────────────────────────────────────────────
// SEÇÃO 3 — DESCONTOS (Para desconto? = SIM) · GC vs Entregadores
// ────────────────────────────────────────────────────────
function _renderDescontos(rows, C) {
    const simRows = rows.filter(r => _isSim(r, C.desc));
    const gcRows  = simRows.filter(r => C.resp && EXTRV_GC.includes((r[C.resp]||"").trim()));
    const extRows = simRows.filter(r => !C.resp || !EXTRV_GC.includes((r[C.resp]||"").trim()));

    const gcV  = _soma(gcRows,  C.valor);
    const extV = _soma(extRows, C.valor);
    const tot  = simRows.length;
    const totV = gcV + extV;
    const gcPct  = tot > 0 ? (gcRows.length/tot*100).toFixed(1)  : 0;
    const extPct = tot > 0 ? (extRows.length/tot*100).toFixed(1) : 0;

    // GC subgrupos
    const gcMap = {};
    EXTRV_GC.forEach(k => { gcMap[k] = {n:0, v:0}; });
    gcRows.forEach(r => {
        const k = (r[C.resp]||"").trim();
        if (gcMap[k]) { gcMap[k].n++; gcMap[k].v += _parseV(C.valor ? r[C.valor] : ""); }
    });
    const gcMaxN = Math.max(...Object.values(gcMap).map(d=>d.n), 1);

    // Externos
    const extMap = {};
    extRows.forEach(r => {
        const k = (C.resp ? r[C.resp] : "") || "Não informado";
        if (!extMap[k]) extMap[k] = {n:0, v:0};
        extMap[k].n++;
        extMap[k].v += _parseV(C.valor ? r[C.valor] : "");
    });
    const extSorted = Object.entries(extMap).sort((a,b)=>b[1].n-a[1].n);
    const extMaxN   = extSorted.length ? extSorted[0][1].n : 1;

    function respRow(name, d, maxN, cls) {
        const barPct = (d.n/maxN*100).toFixed(1);
        return `<div class="ed-resp-row">
            <div class="ed-resp-name">${name}</div>
            <div class="ed-resp-line">
                <div class="ed-resp-bar-bg">
                    <div class="ed-resp-bar ${cls}" style="width:${barPct}%"></div>
                </div>
                <span class="ed-resp-n">${d.n} oc.</span>
                <span class="ed-resp-v">${_moeda(d.v)}</span>
            </div>
        </div>`;
    }

    const gcHTML  = EXTRV_GC.map(k => respRow(k, gcMap[k], gcMaxN, "gc")).join("");
    const extHTML = extSorted.map(([k,d]) => respRow(k, d, extMaxN, "ext")).join("");

    document.getElementById("extrv-descontos").innerHTML = `
    <div class="ed-section">
        <div class="ed-section-title">Descontos Efetivados (Para Desconto = SIM)</div>

        ${tot === 0 ? `<div class="ed-vazio">Nenhum desconto no período.</div>` : `

        <div class="ed-comp-bar-row">
            <div class="ed-comp-side gc">
                <div class="ed-comp-pct">${gcPct}%</div>
                <div class="ed-comp-lbl">GC Interno</div>
                <div class="ed-comp-val">${gcRows.length} oc. · ${_moeda(gcV)}</div>
            </div>
            <div class="ed-comp-track">
                <div class="ed-comp-seg gc" style="width:${gcPct}%" title="GC: ${gcRows.length}"></div>
                <div class="ed-comp-seg ext" style="width:${extPct}%" title="Entregadores: ${extRows.length}"></div>
            </div>
            <div class="ed-comp-side ext">
                <div class="ed-comp-pct">${extPct}%</div>
                <div class="ed-comp-lbl">Entregadores</div>
                <div class="ed-comp-val">${extRows.length} oc. · ${_moeda(extV)}</div>
            </div>
        </div>

        <div class="ed-desc-cols">
            <div class="ed-desc-col">
                <div class="ed-desc-col-hdr gc">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    GC Interno
                    <span class="ed-col-sub">${gcRows.length} oc. · ${_moeda(gcV)}</span>
                </div>
                ${gcHTML || `<div class="ed-vazio">Nenhuma ocorrência GC</div>`}
            </div>
            <div class="ed-desc-col">
                <div class="ed-desc-col-hdr ext">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    Entregadores / Externos
                    <span class="ed-col-sub">${extRows.length} oc. · ${_moeda(extV)}</span>
                </div>
                ${extHTML || `<div class="ed-vazio">Nenhuma ocorrência</div>`}
            </div>
        </div>
        `}
    </div>`;
}

// ────────────────────────────────────────────────────────
// SEÇÃO 4 — CONTESTAÇÕES
// ────────────────────────────────────────────────────────
function _renderContest(rows, C) {
    const contRows = rows.filter(r => _isContestado(r, C.status));
    const resol    = contRows.filter(r => C.desc && _nk(r[C.desc]) !== "sim");
    const pend     = contRows.filter(r => _isSim(r, C.desc));

    const totCont  = contRows.length;
    const valCont  = _soma(contRows, C.valor);
    const valResol = _soma(resol, C.valor);
    const valPend  = _soma(pend, C.valor);

    const decided = contRows.length;
    const taxa    = decided > 0 ? (resol.length/decided*100).toFixed(1) : 0;
    const taxaNum = parseFloat(taxa);

    const el = document.getElementById("extrv-contest");

    if (totCont === 0) {
        el.innerHTML = `<div class="ed-section"><div class="ed-section-title">Contestações</div><div class="ed-vazio">Nenhuma contestação no período.</div></div>`;
        return;
    }

    el.innerHTML = `
    <div class="ed-section">
        <div class="ed-section-title">Contestações</div>

        <div class="ed-cont-grid">
            <div class="ed-cont-taxa">
                <div class="ed-taxa-lbl">Revertidas (Contestado · Para desconto NÃO)</div>
                <div class="ed-taxa-num" style="color:${taxaNum>=50?'#22c55e':'#f59e0b'}">${taxa}%</div>
                <div class="ed-taxa-sub">${resol.length} de ${totCont} contestados não serão descontados</div>
                <div class="ed-taxa-track">
                    <div class="ed-taxa-fill" style="width:${taxa}%;background:${taxaNum>=50?'#22c55e':'#f59e0b'}"></div>
                </div>
                <div class="ed-taxa-saved">↑ ${_moeda(valResol)} não descontados</div>
            </div>
            <div class="ed-cont-chart-wrap"><canvas id="extrv-ch-cont"></canvas></div>
        </div>

        <div class="ed-cont-cards">
            <div class="ed-cc resolvido">
                <div class="ed-cc-lbl">Revertidas</div>
                <div class="ed-cc-n">${resol.length}</div>
                <div class="ed-cc-v">${_moeda(valResol)}</div>
                <div class="ed-cc-pct">${totCont>0?(resol.length/totCont*100).toFixed(1):0}% dos contestados</div>
            </div>
            <div class="ed-cc pendente">
                <div class="ed-cc-lbl">Pendentes / Não revertidas</div>
                <div class="ed-cc-n">${pend.length}</div>
                <div class="ed-cc-v">${_moeda(valPend)}</div>
                <div class="ed-cc-pct">${totCont>0?(pend.length/totCont*100).toFixed(1):0}% dos contestados</div>
            </div>
            <div class="ed-cc total-cont">
                <div class="ed-cc-lbl">Total Contestados</div>
                <div class="ed-cc-n">${totCont}</div>
                <div class="ed-cc-v">${_moeda(valCont)}</div>
                <div class="ed-cc-pct">em disputa / processados</div>
            </div>
        </div>
    </div>`;

    if (_extrvChC) { _extrvChC.destroy(); _extrvChC = null; }
    const ctx = document.getElementById("extrv-ch-cont");
    if (!ctx) return;
    const vals = [resol.length, pend.length].filter((_,i)=>[resol.length,pend.length][i]>0);
    const lbls = ["Revertidas","Pendentes/Não revertidas"].filter((_,i)=>[resol.length,pend.length][i]>0);
    const bgs  = ["rgba(34,197,94,0.82)","rgba(251,191,36,0.75)"].filter((_,i)=>[resol.length,pend.length][i]>0);
    const brd  = ["#22c55e","#fbbf24"].filter((_,i)=>[resol.length,pend.length][i]>0);
    _extrvChC = new Chart(ctx, {
        type:"doughnut",
        data:{ labels:lbls, datasets:[{data:vals,backgroundColor:bgs,borderColor:brd,borderWidth:2}] },
        options:{
            responsive:true,
            plugins:{
                legend:{position:"bottom",labels:{color:"#94a3b8",font:{size:11},padding:14,boxWidth:12}},
                tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed} caso${c.parsed!==1?"s":""}`}}
            },
            cutout:"65%"
        }
    });
}

// ────────────────────────────────────────────────────────
// GRÁFICO TOPO — Valor Anual por Mês × Transportadora
// ────────────────────────────────────────────────────────
function _renderChartTopo(allYear, C) {
    const el = document.getElementById("extrv-chart-topo");

    // Agrupar transportadoras únicas, ordenadas por volume total
    const transpTotais = {};
    allYear.forEach(r => {
        const t = (C.transp ? r[C.transp] : "") || "—";
        const v = _parseV(C.valor ? r[C.valor] : "");
        transpTotais[t] = (transpTotais[t] || 0) + v;
    });
    const transps = Object.entries(transpTotais)
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t);

    if (!transps.length) { el.innerHTML = ""; return; }

    // Dados mensais por transportadora
    const byMesTransp = {};
    transps.forEach(t => { byMesTransp[t] = new Array(12).fill(0); });
    allYear.forEach(r => {
        const dt = _parseD(C.data ? r[C.data] : "");
        if (!dt) return;
        const t = (C.transp ? r[C.transp] : "") || "—";
        const v = _parseV(C.valor ? r[C.valor] : "");
        if (byMesTransp[t]) byMesTransp[t][dt.month - 1] += v;
    });

    // Total por mês (para tooltip de rodapé)
    const totalMes = new Array(12).fill(0);
    transps.forEach(t => byMesTransp[t].forEach((v, i) => { totalMes[i] += v; }));

    const datasets = transps.map((t, i) => {
        const cor = EXTRV_PALETA[i % EXTRV_PALETA.length];
        return {
            label: t,
            data: byMesTransp[t],
            backgroundColor: cor.bg,
            borderColor: cor.bd,
            borderWidth: 1,
            stack: "s",
        };
    });

    const anoSel = document.getElementById("extrv-sel-ano").value;
    el.innerHTML = `
    <div class="ed-section">
        <div class="ed-section-title">Valor Anual por Transportadora — ${anoSel}</div>
        <div style="position:relative;height:300px">
            <canvas id="extrv-ch-topo"></canvas>
        </div>
    </div>`;

    if (_extrvChT) { _extrvChT.destroy(); _extrvChT = null; }
    const ctx = document.getElementById("extrv-ch-topo");
    if (!ctx) return;

    _extrvChT = new Chart(ctx, {
        type: "bar",
        data: { labels: MES_NOMES_EX, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: "#94a3b8", font: { size: 11 }, padding: 14, boxWidth: 12 }
                },
                tooltip: {
                    mode: "index",
                    callbacks: {
                        label: ctx => {
                            const v = ctx.parsed.y;
                            return v > 0 ? ` ${ctx.dataset.label}: ${_moeda(v)}` : null;
                        },
                        footer: items => {
                            const total = items.reduce((a, i) => a + (i.parsed.y || 0), 0);
                            return total > 0 ? `Total: ${_moeda(total)}` : "";
                        }
                    },
                    filter: item => (item.parsed.y || 0) > 0,
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { color: "rgba(255,255,255,0.04)" },
                    ticks: { color: "#7a8599", font: { size: 11 } }
                },
                y: {
                    stacked: true,
                    grid: { color: "rgba(255,255,255,0.04)" },
                    ticks: {
                        color: "#7a8599",
                        font: { size: 11 },
                        callback: v => "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
                    }
                }
            }
        }
    });
}

// ────────────────────────────────────────────────────────
// SEÇÃO 5 — EVOLUÇÃO MENSAL + POR MÊS/TRANSPORTADORA
// ────────────────────────────────────────────────────────
function _renderMensal(allYear, C, mesDestaque) {
    // Dados mensais
    const byMes = Array.from({length:12}, () => ({total:0,totalV:0, sim:0,simV:0, nao:0,naoV:0, cont:0,contV:0}));

    allYear.forEach(r => {
        const dt = _parseD(C.data ? r[C.data] : "");
        if (!dt) return;
        const mi = dt.month - 1;
        const v  = _parseV(C.valor ? r[C.valor] : "");
        byMes[mi].total++;
        byMes[mi].totalV += v;
        if (_isSim(r, C.desc)) { byMes[mi].sim++;  byMes[mi].simV  += v; }
        else                   { byMes[mi].nao++;  byMes[mi].naoV  += v; }
        if (_isContestado(r, C.status)) { byMes[mi].cont++; byMes[mi].contV += v; }
    });

    // Por transportadora no mês
    const transpByMes = {};
    allYear.forEach(r => {
        const dt = _parseD(C.data ? r[C.data] : "");
        if (!dt) return;
        const mi  = dt.month - 1;
        const t   = (C.transp ? r[C.transp] : "") || "—";
        const v   = _parseV(C.valor ? r[C.valor] : "");
        const isSim = _isSim(r, C.desc);
        if (!transpByMes[t]) transpByMes[t] = Array.from({length:12},()=>({n:0,v:0,sim:0,simV:0}));
        transpByMes[t][mi].n++;
        transpByMes[t][mi].v += v;
        if (isSim) { transpByMes[t][mi].sim++; transpByMes[t][mi].simV += v; }
    });

    const allTransp   = Object.keys(transpByMes).sort();
    const transpColors = ["#01b4f7","#cc4138","#6b80ff","#009c21","#ed4d2d","#fb923c","#a78bfa","#fbbf24"];

    // HTML da tabela mensal
    const mesHTML = byMes.map((d, i) => {
        const isHL = mesDestaque !== undefined && mesDestaque === (i+1);
        return `
        <div class="ed-mes-row${isHL?" hl":""}">
            <div class="ed-mes-name">${MES_NOMES_EX[i]}</div>
            <div class="ed-mes-bar-wrap">
                <div class="ed-mes-bar sim" style="width:${byMes.reduce((a,x)=>Math.max(a,x.sim),1)?`${(d.sim/byMes.reduce((a,x)=>Math.max(a,x.sim),1)*100).toFixed(1)}%`:"0%"}"></div>
                <div class="ed-mes-bar nao" style="width:${byMes.reduce((a,x)=>Math.max(a,x.nao),1)?`${(d.nao/byMes.reduce((a,x)=>Math.max(a,x.nao),1)*100).toFixed(1)}%`:"0%"}"></div>
            </div>
            <div class="ed-mes-stats">
                <span class="ed-mes-total">${d.total}</span>
                <span class="ed-mes-val">${_moeda(d.totalV)}</span>
                <span class="ed-mes-sim">▲${d.sim}</span>
                <span class="ed-mes-nao">▽${d.nao}</span>
            </div>
        </div>`;
    }).join("");

    // Tabela cruzada Mês × Transportadora (Para desconto SIM)
    const maxSimGlobal = Math.max(...byMes.map(d=>d.sim), 1);

    const crossHeader = `<div class="ed-cross-hdr-row">
        <div class="ed-cross-hdr-mes">Mês</div>
        ${allTransp.map(t=>`<div class="ed-cross-hdr-t" title="${t}">${t.split(/[\s\-]/)[0]}</div>`).join("")}
        <div class="ed-cross-hdr-total">Total</div>
    </div>`;

    const crossRows = byMes.map((d, i) => {
        const isHL = mesDestaque !== undefined && mesDestaque === (i+1);
        const cells = allTransp.map(t => {
            const td = transpByMes[t][i];
            return `<div class="ed-cross-cell${td.sim>0?" has":""}">
                ${td.sim > 0 ? `<span class="ed-cross-n">${td.sim}</span><span class="ed-cross-v">${_moeda(td.simV)}</span>` : `<span class="ed-cross-zero">—</span>`}
            </div>`;
        }).join("");
        return `<div class="ed-cross-row${isHL?" hl":""}">
            <div class="ed-cross-mes">${MES_NOMES_EX[i]}</div>
            ${cells}
            <div class="ed-cross-total-cell">
                <span class="ed-cross-n">${d.sim}</span>
                <span class="ed-cross-v">${_moeda(d.simV)}</span>
            </div>
        </div>`;
    }).join("");

    const crossFooter = `<div class="ed-cross-footer-row">
        <div class="ed-cross-mes">Total</div>
        ${allTransp.map(t=>{
            const totN = transpByMes[t].reduce((a,x)=>a+x.sim,0);
            const totV = transpByMes[t].reduce((a,x)=>a+x.simV,0);
            return `<div class="ed-cross-cell has"><span class="ed-cross-n">${totN}</span><span class="ed-cross-v">${_moeda(totV)}</span></div>`;
        }).join("")}
        <div class="ed-cross-total-cell">
            <span class="ed-cross-n">${byMes.reduce((a,d)=>a+d.sim,0)}</span>
            <span class="ed-cross-v">${_moeda(byMes.reduce((a,d)=>a+d.simV,0))}</span>
        </div>
    </div>`;

    const el = document.getElementById("extrv-mensal");
    el.innerHTML = `
    <div class="ed-section">
        <div class="ed-section-title">Evolução Mensal
            <span class="ed-legend">
                <span class="ed-leg-dot sim"></span>Para desconto SIM
                <span class="ed-leg-dot nao" style="margin-left:8px"></span>Para desconto NÃO
            </span>
        </div>

        <div class="ed-mes-list">${mesHTML}</div>
    </div>

    <div class="ed-section">
        <div class="ed-section-title">Descontos SIM — Por Mês × Transportadora</div>
        <div class="ed-cross-wrap">
            ${crossHeader}
            ${crossRows}
            ${crossFooter}
        </div>
    </div>

    <div class="ed-section">
        <div class="ed-section-title">Gráfico — Descontos por Mês</div>
        <div style="position:relative;height:240px"><canvas id="extrv-ch-mensal"></canvas></div>
    </div>`;

    // Chart
    if (_extrvChM) { _extrvChM.destroy(); _extrvChM = null; }
    const ctx = document.getElementById("extrv-ch-mensal");
    if (!ctx) return;

    const datasets = [
        {
            label: "Para desconto SIM",
            data: byMes.map(d=>d.sim),
            backgroundColor: "rgba(251,146,60,0.75)",
            borderColor: "#fb923c",
            borderWidth: 1,
            stack: "s"
        },
        {
            label: "Para desconto NÃO",
            data: byMes.map(d=>d.nao),
            backgroundColor: "rgba(34,197,94,0.6)",
            borderColor: "#22c55e",
            borderWidth: 1,
            stack: "s"
        },
    ];

    _extrvChM = new Chart(ctx, {
        type: "bar",
        data: { labels: MES_NOMES_EX, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position:"bottom", labels:{ color:"#94a3b8", font:{size:11}, padding:14, boxWidth:12 } },
                tooltip: {
                    mode: "index",
                    callbacks: {
                        afterBody: (items) => {
                            const mi = items[0]?.dataIndex;
                            if (mi===undefined) return [];
                            return [
                                `Valor SIM: ${_moeda(byMes[mi].simV)}`,
                                `Valor NÃO: ${_moeda(byMes[mi].naoV)}`,
                                `Contestados: ${byMes[mi].cont}`,
                            ];
                        }
                    }
                }
            },
            scales: {
                x: { stacked:true, grid:{color:"rgba(255,255,255,0.04)"}, ticks:{color:"#7a8599",font:{size:11}} },
                y: { stacked:true, grid:{color:"rgba(255,255,255,0.04)"}, ticks:{color:"#7a8599",font:{size:11}} }
            }
        }
    });
}
