// ───── ENT DASHBOARD ─────
let _entDashValorChart  = null;
let _entDashTranspChart = null;
let _entDashGran        = "quinzena";
let _entGrupos          = [];
let _entAno             = new Date().getFullYear();
let _entSelIdx          = -1;

function _parseMoeda(s) {
    if (!s || typeof s !== "string") return 0;
    return parseFloat(s.replace(/[^\d,\-]/g, "").replace(",", ".")) || 0;
}

function _entSelecionarChip(idx) {
    if (idx < 0 || idx >= _entGrupos.length) return;
    _entSelIdx = idx;
    const g    = _entGrupos[idx];
    const prev = _entGrupos[idx - 1] || null;
    const ini  = _entGrupos[0];

    // Highlight chip
    document.querySelectorAll("#ent-dash-pchips .dash-pchip").forEach((el, i) =>
        el.classList.toggle("current", i === idx)
    );

    // Update KPI cards to reflect selected period
    const gran = _entDashGran === "quinzena" ? "Quinzena" : "Mês";
    document.getElementById("edkpi-mes-card").querySelector(".dash-kpi-lbl").textContent =
        "vs " + gran + " Anterior";

    function _applyKpi(cardId, pctElId, subId, pct, subTxt) {
        document.getElementById(cardId).className =
            "dash-kpi-card" + (pct.dir > 0 ? " kpi-up" : pct.dir < 0 ? " kpi-down" : "");
        const el = document.getElementById(pctElId);
        el.className  = "dash-kpi-pct " + pct.cls;
        el.textContent = pct.txt;
        document.getElementById(subId).textContent = subTxt;
    }

    _applyKpi("edkpi-mes-card", "edkpi-vs-mes", "edkpi-vs-mes-sub",
        _pctKpi(g.valor, prev ? prev.valor : 0),
        prev ? g.label + " vs " + prev.label : "—");

    _applyKpi("edkpi-inicio-card", "edkpi-vs-inicio", "edkpi-vs-inicio-sub",
        _pctKpi(g.valor, ini.valor),
        g.label !== ini.label ? g.label + " vs " + ini.label : "—");

    // Total a receber no período
    const totalLinha = document.getElementById("ent-dash-total-linha");
    totalLinha.style.display = "";
    totalLinha.innerHTML = `Total a receber · ${g.label}: <strong style="color:#22c55e;font-size:15px;font-weight:700">${moedaJS(g.valor)}</strong>`;

    // Update carrier cards
    document.getElementById("ent-dash-transp-grid").innerHTML = TRANSP_DEF.map(t => {
        const v   = g[t.valKey]    || 0;
        const q   = g[t.key]       || 0;
        const pv  = prev ? (prev[t.valKey] || 0) : null;
        const dlt = _delta(v, pv);
        const bCls = dlt.cls === "up" ? "lucro" : dlt.cls === "down" ? "preju" : "estavel";
        const badge = dlt.cls !== "flat"
            ? `<span class="lbadge ${bCls}" style="font-size:10px;padding:2px 7px">${dlt.txt}</span>`
            : "";
        return `<div class="dash-tc">
            <div class="dash-tc-name" style="color:${t.color}">${t.label}</div>
            <div class="dash-tc-qtd" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${moedaJS(v)}${badge}</div>
            <div class="dash-tc-sub">${q} pacotes · ${g.label}</div>
        </div>`;
    }).join("");
}

function setEntDashGran(tipo) {
    _entDashGran = tipo;
    document.getElementById("ent-dash-gran-q").classList.toggle("active", tipo === "quinzena");
    document.getElementById("ent-dash-gran-m").classList.toggle("active", tipo === "mes");
    buscarEntDashboard();
}

function abrirEntDashboard(event) {
    if (event) event.preventDefault();
    document.getElementById("ent-dash-empty").innerText = "Carregando...";
    document.getElementById("ent-dash-empty").style.display = "";
    document.getElementById("ent-dash-content").style.display = "none";
    mostrarTela("tela-ent-dashboard");
    buscarEntDashboard();
}

const _MNF_MESES = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function abrirMinhasNFs(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-minhas-nfs");
    const selAno  = document.getElementById("mnf-ano");
    const anoAtual = new Date().getFullYear();
    if (!selAno.options.length) {
        for (let a = anoAtual - 2; a <= anoAtual; a++) {
            const opt = document.createElement("option");
            opt.value = a; opt.textContent = a;
            if (a === anoAtual) opt.selected = true;
            selAno.appendChild(opt);
        }
    }
    _carregarMinhasNFs();
}

function _carregarMinhasNFs() {
    const ano   = document.getElementById("mnf-ano").value;
    const empty = document.getElementById("minhas-nf-empty");
    const res   = document.getElementById("minhas-nf-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    res.style.display = "none";
    const tok = localStorage.getItem("token");

    Promise.all([
        fetch(`${API}/historico?ano=${ano}`, { headers: { "Authorization": "Bearer " + tok } }).then(r => r.json()),
        fetch(`${API}/minhas-notas`,          { headers: { "Authorization": "Bearer " + tok } }).then(r => r.json())
    ]).then(([historico, nfs]) => {
        if (!Array.isArray(historico) || !historico.length) {
            empty.innerText = "Nenhum fechamento encontrado para este ano.";
            return;
        }
        const nfMap = {};
        (nfs || []).forEach(nf => { nfMap[`${nf.mes}_${nf.ano}_${nf.quinzena}`] = nf; });

        const periodos = historico
            .filter(d => (d.total_receber_num || 0) > 0 && !d.ignora_nf)
            .map(d => ({
                mes: d.mes, ano: parseInt(ano), quinzena: d.quinzena,
                label: `${_MNF_MESES[d.mes]} · ${d.quinzena === 1 ? "1ª Quinzena" : "2ª Quinzena"}`,
                total: d.total_receber_num || 0,
                nf: nfMap[`${d.mes}_${ano}_${d.quinzena}`] || null
            }))
            .reverse();

        if (!periodos.length) {
            empty.innerText = "Nenhum período com fechamento encontrado.";
            return;
        }

        const pendentes = periodos.filter(p => !p.nf).length;
        const enviadas  = periodos.filter(p => !!p.nf).length;

        empty.style.display = "none";
        res.style.display = "";
        document.getElementById("minhas-nf-lista").innerHTML = `
            <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
                <span style="background:rgba(34,197,94,0.1);color:#22c55e;border:1px solid rgba(34,197,94,0.25);padding:4px 13px;border-radius:20px;font-size:12px;font-weight:700">✓ ${enviadas} enviadas</span>
                ${pendentes ? `<span style="background:rgba(251,146,60,0.1);color:#fb923c;border:1px solid rgba(251,146,60,0.28);padding:4px 13px;border-radius:20px;font-size:12px;font-weight:700">⚠ ${pendentes} pendentes</span>` : ""}
            </div>
            <div class="nf-status-list">
            ${periodos.map(p => p.nf ? `
                <div class="nf-status-card ok">
                    <div class="nf-status-icon ok">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div class="nf-status-info">
                        <div class="nf-status-label">${p.label}</div>
                        <div class="nf-status-sub">NF: ${p.nf.valor || "—"} &nbsp;·&nbsp; Quinzena: ${moedaJS(p.total)}</div>
                    </div>
                    <div class="nf-status-tag" style="color:#22c55e">Enviada</div>
                </div>` : `
                <div class="nf-status-card pendente" onclick="_irParaFechamentoPeriodo(${p.mes},${p.ano},${p.quinzena})">
                    <div class="nf-status-icon pendente">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <div class="nf-status-info">
                        <div class="nf-status-label">${p.label}</div>
                        <div class="nf-status-sub">Quinzena: ${moedaJS(p.total)} &nbsp;·&nbsp; Nota não enviada</div>
                    </div>
                    <div class="nf-status-tag" style="color:#fb923c">Anexar →</div>
                </div>`).join("")}
            </div>`;
    }).catch(() => { empty.innerText = "Erro ao carregar dados."; });
}

function _irParaFechamentoPeriodo(mes, ano, quinzena) {
    _fMes = parseInt(mes);
    _fAno = parseInt(ano);
    abrirFechamentos();
    selecionarQuinzena(parseInt(quinzena));
}

function _iniciarSelectsEntDash() {
    const selAno = document.getElementById("ent-dash-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === anoAtual) opt.selected = true;
        selAno.appendChild(opt);
    }
}

function buscarEntDashboard() {
    const ano     = new Date().getFullYear();
    const empty   = document.getElementById("ent-dash-empty");
    const content = document.getElementById("ent-dash-content");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${API}/historico?ano=${ano}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(dados => {
        if (!dados.length) { empty.innerText = "Nenhum dado encontrado para este ano."; return; }
        empty.style.display = "none";
        content.style.display = "";

        // Grupos primeiro — KPIs respeitam a granularidade escolhida
        let grupos;
        if (_entDashGran === "quinzena") {
            grupos = dados.map(d => ({
                label:    `${d.quinzena}Q ${MES_NOMES[d.mes].slice(0, 3)}`,
                valor:    d.total_receber_num || 0,
                mes:      d.mes,
                quinzena: d.quinzena,
                loggi:    d.entregues_loggi  || 0,
                jt:       d.entregues_jt     || 0,
                imile:    d.qtd_imile        || 0,
                anjun:    d.entregues_anjun  || 0,
                shopee:   d.entregues_shopee || 0,
                loggi_v:  d.valor_loggi  || 0,
                jt_v:     d.valor_jt     || 0,
                imile_v:  d.valor_imile  || 0,
                anjun_v:  d.valor_anjun  || 0,
                shopee_v: d.valor_shopee || 0,
            }));
        } else {
            const byMes = {};
            dados.forEach(d => {
                if (!byMes[d.mes]) byMes[d.mes] = { label: MES_NOMES[d.mes].slice(0, 3), valor: 0, mes: d.mes, quinzena: 0, loggi: 0, jt: 0, imile: 0, anjun: 0, shopee: 0, loggi_v: 0, jt_v: 0, imile_v: 0, anjun_v: 0, shopee_v: 0 };
                byMes[d.mes].valor   += d.total_receber_num  || 0;
                byMes[d.mes].loggi   += d.entregues_loggi   || 0;
                byMes[d.mes].jt      += d.entregues_jt      || 0;
                byMes[d.mes].imile   += d.qtd_imile         || 0;
                byMes[d.mes].anjun   += d.entregues_anjun   || 0;
                byMes[d.mes].shopee  += d.entregues_shopee  || 0;
                byMes[d.mes].loggi_v += d.valor_loggi  || 0;
                byMes[d.mes].jt_v    += d.valor_jt     || 0;
                byMes[d.mes].imile_v += d.valor_imile  || 0;
                byMes[d.mes].anjun_v += d.valor_anjun  || 0;
                byMes[d.mes].shopee_v+= d.valor_shopee || 0;
            });
            grupos = Object.keys(byMes).sort((a, b) => Number(a) - Number(b)).map(m => byMes[m]);
        }

        const ult    = grupos[grupos.length - 1];
        const prev   = grupos[grupos.length - 2];
        const inicio = grupos[0];
        const labels = grupos.map(g => g.label);

        // Store globally for chip selection
        _entGrupos = grupos;
        _entAno    = ano;

        // KPIs — comparação baseada nos grupos (quinzena ou mês)
        document.getElementById("edkpi-mes-card").querySelector(".dash-kpi-lbl").textContent =
            _entDashGran === "quinzena" ? "vs Quinzena Anterior" : "vs Mês Anterior";

        function _setKpiE(cardId, elId, subId, pct, subTxt) {
            document.getElementById(cardId).className = "dash-kpi-card" + (pct.dir > 0 ? " kpi-up" : pct.dir < 0 ? " kpi-down" : "");
            const el = document.getElementById(elId);
            el.className = "dash-kpi-pct " + pct.cls;
            el.textContent = pct.txt;
            document.getElementById(subId).textContent = subTxt;
        }

        _setKpiE("edkpi-mes-card", "edkpi-vs-mes", "edkpi-vs-mes-sub",
            _pctKpi(ult ? ult.valor : 0, prev ? prev.valor : 0),
            ult && prev ? ult.label + " vs " + prev.label : "—");

        _setKpiE("edkpi-inicio-card", "edkpi-vs-inicio", "edkpi-vs-inicio-sub",
            _pctKpi(ult ? ult.valor : 0, inicio ? inicio.valor : 0),
            ult && inicio && ult.label !== inicio.label ? ult.label + " vs " + inicio.label : "—");

        // Chips de período (clicáveis → seleciona período no dashboard)
        document.getElementById("ent-dash-pchips").innerHTML = grupos.map((g, i) =>
            `<div class="dash-pchip" onclick="_entSelecionarChip(${i})">
                <div class="dpc-lbl">${g.label}</div>
                <div class="dpc-val">${moedaJS(g.valor)}</div>
            </div>`
        ).join("");

        // Gráfico de valor recebido
        const valCanvas = document.getElementById("ent-dash-valor-chart");
        if (_entDashValorChart) { _entDashValorChart.destroy(); _entDashValorChart = null; }
        _entDashValorChart = new Chart(valCanvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [{ label: "Total a Receber", data: grupos.map(g => g.valor),
                    backgroundColor: "rgba(58,134,255,0.7)", borderColor: "#3a86ff",
                    borderWidth: 1, borderRadius: 7 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => {
                        const i   = ctx.dataIndex;
                        const ant = i > 0 ? grupos[i - 1].valor : null;
                        const dlt = _delta(ctx.raw, ant);
                        return "  " + moedaJS(ctx.raw) + "  " + dlt.txt;
                    }}}
                },
                scales: {
                    x: { grid: { color: "rgba(58,134,255,0.07)" }, border: { color: "rgba(58,134,255,0.1)" }, ticks: { color: "#aab4c8", font: { size: 11 } } },
                    y: { grid: { color: "rgba(58,134,255,0.07)" }, border: { color: "rgba(58,134,255,0.1)" }, ticks: { color: "#4a6a8a", font: { size: 11 }, callback: v => moedaJS(v) } }
                }
            }
        });

        // Enriquecer grupos com valores R$ por transportadora (via painel de cada período)
        const hdrs2 = { "Authorization": "Bearer " + token };
        Promise.all(grupos.map(g => {
            const qs = g.quinzena ? [g.quinzena] : [1, 2];
            return Promise.all(qs.map(q =>
                fetch(`${API}/painel?mes=${g.mes}&ano=${ano}&quinzena=${q}`, { headers: hdrs2 })
                .then(r => r.ok ? r.json() : null).catch(() => null)
            )).then(results => {
                results.filter(Boolean).forEach(p => {
                    g.loggi_v  += _parseMoeda(p.valor_loggi);
                    g.jt_v     += _parseMoeda(p.valor_jt);
                    g.imile_v  += _parseMoeda(p.valor_imile);
                    g.anjun_v  += _parseMoeda(p.valor_anjun);
                    g.shopee_v += _parseMoeda(p.valor_shopee);
                });
            });
        })).then(() => {
            // Selecionar último período e renderizar cards
            _entSelecionarChip(grupos.length - 1);

            // Gráfico de transportadoras por período (R$)
            const transpCanvas = document.getElementById("ent-dash-transp-chart");
            if (_entDashTranspChart) { _entDashTranspChart.destroy(); _entDashTranspChart = null; }
            _entDashTranspChart = new Chart(transpCanvas.getContext("2d"), {
                type: "bar",
                data: {
                    labels,
                    datasets: TRANSP_DEF.map(t => ({
                        label: t.label,
                        data: grupos.map(g => g[t.valKey] || 0),
                        backgroundColor: t.bg,
                        borderColor: t.color,
                        borderWidth: 1,
                        borderRadius: 5,
                    }))
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: "#aab4c8", font: { size: 12 }, boxWidth: 14, padding: 16 } },
                        tooltip: { callbacks: { label: ctx => "  " + ctx.dataset.label + ": " + moedaJS(ctx.raw) } }
                    },
                    scales: {
                        x: { grid: { color: "rgba(58,134,255,0.07)" }, border: { color: "rgba(58,134,255,0.1)" }, ticks: { color: "#aab4c8", font: { size: 11 } } },
                        y: { grid: { color: "rgba(58,134,255,0.07)" }, border: { color: "rgba(58,134,255,0.1)" }, ticks: { color: "#4a6a8a", font: { size: 11 }, callback: v => moedaJS(v) } }
                    }
                }
            });
        });
    })
    .catch(() => { empty.innerText = "Erro ao conectar com o servidor."; });
}
