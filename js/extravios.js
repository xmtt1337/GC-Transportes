// ───── EXTRAVIOS DASHBOARD ─────

const EXTRV_URL = "https://docs.google.com/spreadsheets/d/1zTTZZ42BP8Ueo_ZIhhpyJuZWXqVygZ7bY1vT1fSdR38/export?format=csv&gid=1990894309";

const EXTRV_GC = [
    "GC Interno - Caçador",
    "GC Interno - Videira",
    "GC Expedição - Caçador",
    "GC Expedição - Videira"
];

let _extrvData  = null;
let _extrvChart = null;

function abrirExtravios(event) {
    if (event) event.preventDefault();
    _iniciarFiltrosExtrv();
    mostrarTela("tela-extravios");
    _carregarExtravios();
}

function _iniciarFiltrosExtrv() {
    const selAno = document.getElementById("extrv-sel-ano");
    const ano = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = ano - 2; a <= ano + 1; a++) {
        const o = document.createElement("option");
        o.value = a; o.textContent = a;
        if (a === ano) o.selected = true;
        selAno.appendChild(o);
    }
    document.getElementById("extrv-sel-mes").value = new Date().getMonth() + 1;
}

function _filtrarExtravios() {
    if (_extrvData) _renderExtraviosDash(_extrvData);
    else _carregarExtravios();
}

function _extrvRefresh() {
    _extrvData = null;
    if (_extrvChart) { _extrvChart.destroy(); _extrvChart = null; }
    _carregarExtravios();
}

// ── CSV parsing ──
function _splitCSVLine(line) {
    const vals = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (c === ',' && !inQ) {
            vals.push(cur); cur = "";
        } else cur += c;
    }
    vals.push(cur);
    return vals;
}

function _parseCSVExtrv(text) {
    const lines = text.split(/\r?\n/);
    if (!lines.length) return [];
    const headers = _splitCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const vals = _splitCSVLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim().replace(/^"|"$/g, ""); });
        return obj;
    });
}

function _normKeyExtrv(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function _findColExtrv(sample, ...candidates) {
    const keys = Object.keys(sample);
    const nk   = keys.map(_normKeyExtrv);
    for (const c of candidates) {
        const idx = nk.indexOf(_normKeyExtrv(c));
        if (idx !== -1) return keys[idx];
    }
    return null;
}

function _parseValorExtrv(str) {
    if (!str) return 0;
    return parseFloat((str + "").replace(/[^\d,]/g, "").replace(",", ".")) || 0;
}

function _parseDateExtrv(str) {
    if (!str) return null;
    const p = (str + "").trim().split(/[\/\-\.]/);
    if (p.length < 3) return null;
    let d, m, y;
    if ((p[2] || "").length === 4) [d, m, y] = p;
    else [y, m, d] = p;
    const dd = parseInt(d), mm = parseInt(m), yy = parseInt(y);
    if (isNaN(dd) || isNaN(mm) || isNaN(yy)) return null;
    return { day: dd, month: mm, year: yy };
}

function _moedaExtrv(n) {
    return "R$ " + (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _somaValorExtrv(rows, col) {
    if (!col) return 0;
    return rows.reduce((acc, r) => acc + _parseValorExtrv(r[col]), 0);
}

// ── Fetch + render ──
async function _carregarExtravios() {
    const emptyEl   = document.getElementById("extrv-empty");
    const contentEl = document.getElementById("extrv-content");
    emptyEl.style.display = "";
    emptyEl.textContent   = "Carregando dados da planilha...";
    contentEl.style.display = "none";

    try {
        if (!_extrvData) {
            const resp = await fetch(EXTRV_URL);
            if (!resp.ok) throw new Error("HTTP " + resp.status);
            const text = await resp.text();
            const rows = _parseCSVExtrv(text);
            if (!rows.length) throw new Error("vazio");
            _extrvData = rows;
        }
        _renderExtraviosDash(_extrvData);
    } catch (e) {
        emptyEl.textContent = "Erro ao carregar dados. Verifique se a planilha está compartilhada publicamente (qualquer pessoa com o link pode ver).";
    }
}

function _renderExtraviosDash(rows) {
    const ano = parseInt(document.getElementById("extrv-sel-ano").value);
    const mes = parseInt(document.getElementById("extrv-sel-mes").value);

    if (!rows || !rows.length) {
        document.getElementById("extrv-empty").textContent = "Planilha sem dados.";
        return;
    }

    const sample   = rows[0];
    const colData  = _findColExtrv(sample, "DATA", "Data", "data", "DT", "DATE", "date", "Data ocorrência", "Data ocorrencia", "Data Ocorrencia");
    const colStatus= _findColExtrv(sample, "STATUS", "Status", "status", "SITUAÇÃO", "Situação", "SITUACAO", "situacao", "Status ocorrência", "Situacao");
    const colTransp= _findColExtrv(sample, "TRANSPORTADORA", "Transportadora", "transportadora", "TRANSP", "Transp", "Transportador");
    const colResp  = _findColExtrv(sample, "RESPONSAVEL", "Responsável", "RESPONSÁVEL", "responsavel", "RESP", "Resp", "responsável", "Responsavel");
    const colValor = _findColExtrv(sample, "VALOR", "Valor", "valor", "VL", "VALOR R$", "Valor R$", "VALOR (R$)", "Valor (R$)", "Valor do Extravio", "valor do extravio");

    const filtered = rows.filter(r => {
        if (!colData) return true;
        const dt = _parseDateExtrv(r[colData]);
        if (!dt) return false;
        if (dt.year !== ano) return false;
        if (mes !== 0 && dt.month !== mes) return false;
        return true;
    });

    const ns = r => _normKeyExtrv(colStatus ? r[colStatus] : "");

    const bemFeito    = filtered.filter(r => ns(r) === "bem feito");
    const pendentes   = filtered.filter(r => ns(r).includes("pendente"));
    const resolvidos  = filtered.filter(r => ns(r).includes("resolvido"));
    const outrosDecid = filtered.filter(r => {
        const s = ns(r);
        return s !== "" && s !== "bem feito" && !s.includes("pendente") && !s.includes("resolvido");
    });

    document.getElementById("extrv-empty").style.display = "none";
    document.getElementById("extrv-content").style.display = "";

    _renderBemFeitoExtrv(bemFeito, colTransp, colResp, colValor);
    _renderContestacoesExtrv(resolvidos, outrosDecid, pendentes, colValor);
}

// ── Bem Feito section ──
function _renderBemFeitoExtrv(rows, colTransp, colResp, colValor) {
    const el       = document.getElementById("extrv-bf-content");
    const total    = rows.length;
    const totalVal = _somaValorExtrv(rows, colValor);

    const gcRows  = rows.filter(r => colResp && EXTRV_GC.includes((r[colResp] || "").trim()));
    const extRows = rows.filter(r => !colResp || !EXTRV_GC.includes((r[colResp] || "").trim()));
    const gcVal   = _somaValorExtrv(gcRows, colValor);
    const extVal  = _somaValorExtrv(extRows, colValor);

    if (total === 0) {
        el.innerHTML = `<div class="extrv-vazio">Nenhuma ocorrência "Bem Feito" no período selecionado.</div>`;
        return;
    }

    // By transportadora
    const transpMap = {};
    rows.forEach(r => {
        const t = (colTransp ? (r[colTransp] || "") : "") || "—";
        if (!transpMap[t]) transpMap[t] = { n: 0, v: 0 };
        transpMap[t].n++;
        transpMap[t].v += _parseValorExtrv(colValor ? r[colValor] : "");
    });

    // GC by responsavel
    const gcMap = {};
    EXTRV_GC.forEach(k => { gcMap[k] = { n: 0, v: 0 }; });
    gcRows.forEach(r => {
        const k = (r[colResp] || "").trim();
        if (gcMap[k]) { gcMap[k].n++; gcMap[k].v += _parseValorExtrv(colValor ? r[colValor] : ""); }
    });

    // Externos by responsavel
    const extMap = {};
    extRows.forEach(r => {
        const k = (colResp ? (r[colResp] || "") : "") || "Não informado";
        if (!extMap[k]) extMap[k] = { n: 0, v: 0 };
        extMap[k].n++;
        extMap[k].v += _parseValorExtrv(colValor ? r[colValor] : "");
    });

    const transpHTML = Object.entries(transpMap)
        .sort((a, b) => b[1].n - a[1].n)
        .map(([t, d]) => `
            <div class="extrv-tc">
                <div class="extrv-tc-name">${t}</div>
                <div class="extrv-tc-count">${d.n}</div>
                <div class="extrv-tc-val">${_moedaExtrv(d.v)}</div>
            </div>`).join("");

    const gcRespHTML = EXTRV_GC.map(k => {
        const d = gcMap[k];
        return `<div class="extrv-resp-card gc">
            <div class="extrv-resp-name">${k}</div>
            <div class="extrv-resp-row">
                <span class="extrv-resp-count">${d.n} oc.</span>
                <span class="extrv-resp-val${d.v > 0 ? " neg" : ""}">${_moedaExtrv(d.v)}</span>
            </div>
        </div>`;
    }).join("");

    const extRespHTML = Object.entries(extMap)
        .sort((a, b) => b[1].n - a[1].n)
        .map(([k, d]) => `
            <div class="extrv-resp-card ext">
                <div class="extrv-resp-name">${k || "Não informado"}</div>
                <div class="extrv-resp-row">
                    <span class="extrv-resp-count">${d.n} oc.</span>
                    <span class="extrv-resp-val${d.v > 0 ? " neg" : ""}">${_moedaExtrv(d.v)}</span>
                </div>
            </div>`).join("");

    el.innerHTML = `
        <div class="extrv-kpi-row">
            <div class="extrv-kpi-card total">
                <div class="extrv-kpi-lbl">Total Ocorrências</div>
                <div class="extrv-kpi-num">${total}</div>
                <div class="extrv-kpi-sub">${_moedaExtrv(totalVal)}</div>
            </div>
            <div class="extrv-kpi-card gc">
                <div class="extrv-kpi-lbl">Custo GC</div>
                <div class="extrv-kpi-num">${gcRows.length}</div>
                <div class="extrv-kpi-sub">${_moedaExtrv(gcVal)}</div>
            </div>
            <div class="extrv-kpi-card ext">
                <div class="extrv-kpi-lbl">Custo Entregadores</div>
                <div class="extrv-kpi-num">${extRows.length}</div>
                <div class="extrv-kpi-sub">${_moedaExtrv(extVal)}</div>
            </div>
        </div>

        <div class="extrv-section-sub">Por Transportadora</div>
        <div class="extrv-tc-grid">${transpHTML}</div>

        <div class="extrv-group">
            <div class="extrv-group-header gc">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                GC Interno
                <span class="extrv-group-badge">${gcRows.length} oc. · ${_moedaExtrv(gcVal)}</span>
            </div>
            <div class="extrv-resp-grid">
                ${gcRespHTML || '<div class="extrv-vazio">Nenhuma ocorrência GC no período</div>'}
            </div>
        </div>

        <div class="extrv-group">
            <div class="extrv-group-header ext">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Entregadores / Externos
                <span class="extrv-group-badge">${extRows.length} oc. · ${_moedaExtrv(extVal)}</span>
            </div>
            <div class="extrv-resp-grid">
                ${extRespHTML || '<div class="extrv-vazio">Nenhuma ocorrência externa no período</div>'}
            </div>
        </div>
    `;
}

// ── Contestações section ──
function _renderContestacoesExtrv(resolvidos, outrosDecid, pendentes, colValor) {
    const el      = document.getElementById("extrv-cont-content");
    const totRes  = resolvidos.length;
    const totOut  = outrosDecid.length;
    const totPend = pendentes.length;
    const valRes  = _somaValorExtrv(resolvidos, colValor);
    const valOut  = _somaValorExtrv(outrosDecid, colValor);
    const valPend = _somaValorExtrv(pendentes, colValor);
    const total   = totRes + totOut + totPend;
    const decided = totRes + totOut;
    const taxa    = decided > 0 ? ((totRes / decided) * 100).toFixed(1) : null;

    if (total === 0) {
        el.innerHTML = `<div class="extrv-vazio">Nenhuma contestação no período selecionado.</div>`;
        if (_extrvChart) { _extrvChart.destroy(); _extrvChart = null; }
        return;
    }

    el.innerHTML = `
        <div class="extrv-kpi-row">
            <div class="extrv-kpi-card resolvido">
                <div class="extrv-kpi-lbl">Contestado e Resolvido</div>
                <div class="extrv-kpi-num">${totRes}</div>
                <div class="extrv-kpi-sub">${_moedaExtrv(valRes)} revertidos</div>
            </div>
            <div class="extrv-kpi-card outros">
                <div class="extrv-kpi-lbl">Outros Decididos</div>
                <div class="extrv-kpi-num">${totOut}</div>
                <div class="extrv-kpi-sub">${_moedaExtrv(valOut)}</div>
            </div>
            <div class="extrv-kpi-card pendente">
                <div class="extrv-kpi-lbl">Pendentes</div>
                <div class="extrv-kpi-num">${totPend}</div>
                <div class="extrv-kpi-sub">${_moedaExtrv(valPend)} em análise</div>
            </div>
        </div>

        ${taxa !== null ? `
        <div class="extrv-taxa-row">
            <div class="extrv-taxa-label">Taxa de Resolução</div>
            <div class="extrv-taxa-val">${taxa}%</div>
            <div class="extrv-taxa-sub">${totRes} de ${decided} casos decididos revertidos em nosso favor</div>
            <div class="extrv-taxa-bar">
                <div class="extrv-taxa-fill" style="width:${taxa}%"></div>
            </div>
        </div>
        ` : ""}

        <div class="extrv-chart-wrap">
            <canvas id="extrv-cont-chart"></canvas>
        </div>
    `;

    if (_extrvChart) { _extrvChart.destroy(); _extrvChart = null; }
    const ctx = document.getElementById("extrv-cont-chart");
    if (!ctx) return;

    const allLabels = ["Contestado e Resolvido", "Outros Decididos", "Pendente"];
    const allData   = [totRes, totOut, totPend];
    const allColors = [
        { bg: "rgba(34,197,94,0.82)",  border: "#22c55e" },
        { bg: "rgba(239,68,68,0.72)",  border: "#ef4444" },
        { bg: "rgba(251,191,36,0.75)", border: "#fbbf24" }
    ];
    const mask    = allData.map(v => v > 0);
    const labels  = allLabels.filter((_, i) => mask[i]);
    const data    = allData.filter((_, i) => mask[i]);
    const colors  = allColors.filter((_, i) => mask[i]);

    _extrvChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors.map(c => c.bg),
                borderColor:     colors.map(c => c.border),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: "#94a3b8", font: { size: 12 }, padding: 18, boxWidth: 14 }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} caso${ctx.parsed !== 1 ? "s" : ""}`
                    }
                }
            },
            cutout: "68%"
        }
    });
}
