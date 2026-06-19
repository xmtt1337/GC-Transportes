// ───── VIDEIRA — ALIMENTAR PLANILHA ─────

function abrirVideiraAlimentar(event) {
    if (event) event.preventDefault();
    _valiIniciarSelects();
    _carregarPlanilhasVideira();
    mostrarTela("tela-videira-alimentar");
}

function _valiIniciarSelects() {
    const selAno = document.getElementById("vali-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual + 1; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === anoAtual) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("vali-mes").value = new Date().getMonth() + 1;
}

function _carregarPlanilhasVideira() {
    fetch(API + "/videira/planilhas", { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(rows => {
        const el = document.getElementById("vali-list");
        if (!rows.length) {
            el.innerHTML = `<div style="color:#7a8599;font-size:14px">Nenhum fechamento cadastrado.</div>`;
            return;
        }
        const mesNomes = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        el.innerHTML = rows.map(r => `
            <div class="admin-list-item">
                <div>
                    <strong>${mesNomes[r.mes]}/${r.ano} — ${r.quinzena}ª Quinzena</strong>
                    <div class="info" style="font-size:12px;color:#4a6a8a;margin-top:2px">${r.spreadsheet_id}</div>
                </div>
                <button class="admin-del-btn" onclick="deletarPlanilhaVideira(${r.id})">Remover</button>
            </div>
        `).join("");
    })
    .catch(() => {});
}

function adicionarPlanilhaVideira() {
    const mes = document.getElementById("vali-mes").value;
    const ano = document.getElementById("vali-ano").value;
    const q   = document.getElementById("vali-quinzena").value;
    const url = document.getElementById("vali-url").value.trim();
    if (!url) { gcAlert("Cole o link do fechamento."); return; }

    fetch(API + "/videira/planilha", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: parseInt(mes), ano: parseInt(ano), quinzena: parseInt(q), spreadsheet_url: url })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) { gcAlert(data.error); return; }
        document.getElementById("vali-url").value = "";
        _carregarPlanilhasVideira();
    })
    .catch(() => gcAlert("Erro ao salvar fechamento."));
}

function deletarPlanilhaVideira(id) {
    gcConfirm("Remover este fechamento?", () => {
        fetch(API + "/videira/planilhas/" + id, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token }
        }).then(() => _carregarPlanilhasVideira());
    }, null, "Remover");
}

// ───── VIDEIRA — PAINEL ─────

let _vpQuinzena = 1;

function abrirVideiraPainel(event) {
    if (event) event.preventDefault();
    _vpIniciarSelects();
    mostrarTela("tela-videira-painel");
    buscarPainelVideira();
}

function _vpIniciarSelects() {
    const selAno = document.getElementById("vp-ano");
    if (selAno.options.length > 0) return;
    const anoAtual = new Date().getFullYear();
    for (let a = anoAtual - 1; a <= anoAtual + 1; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === anoAtual) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("vp-mes").value = new Date().getMonth() + 1;
    selecionarQuinzenaVideira(1);
}

function selecionarQuinzenaVideira(q) {
    _vpQuinzena = q;
    document.getElementById("vp-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("vp-btn-2q").classList.toggle("active", q === 2);
    buscarPainelVideira();
}

function buscarPainelVideira() {
    const mes      = document.getElementById("vp-mes")?.value;
    const ano      = document.getElementById("vp-ano")?.value;
    const quinzena = _vpQuinzena;
    if (!mes || !ano) return;

    document.getElementById("vp-empty").style.display   = "";
    document.getElementById("vp-content").style.display = "none";
    document.getElementById("vp-empty").innerText       = "Carregando...";

    fetch(`${API}/videira/painel?mes=${mes}&ano=${ano}&quinzena=${quinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            document.getElementById("vp-empty").innerText = data.error;
            return;
        }
        _renderPainelVideira(data);
    })
    .catch(() => {
        document.getElementById("vp-empty").innerText = "Erro ao carregar o fechamento.";
    });
}

function _fmt(n) {
    return (n || 0).toLocaleString("pt-BR");
}

function _renderPainelVideira(d) {
    // Hero + KPI grid
    const cards = document.getElementById("vp-cards");
    cards.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(34,197,94,0.09) 0%,rgba(58,134,255,0.04) 100%);border:1px solid rgba(34,197,94,0.2);border-radius:18px;padding:20px 24px;margin-bottom:18px">
            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Resultado Líquido do Período</div>
            <div style="font-size:30px;font-weight:800;color:#22c55e;letter-spacing:-.5px;margin-bottom:18px">${d.valor_total_liquido || "—"}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${[
                    { lbl:"Total Pacotes", val:(d.qtd_pacotes_total||0).toLocaleString("pt-BR"), c:"#3a86ff" },
                    { lbl:"Coletas",       val:(d.qtd_coletas||0).toLocaleString("pt-BR"),       c:"#f97316" },
                    { lbl:"Valor Coletas", val:d.valor_coletas||"—",                             c:"#f97316" },
                    { lbl:"Diária Col.",   val:d.diaria_coletas||"—",                            c:"#94a3b8" },
                    { lbl:"Descontos",     val:d.valor_desconto||"—",                            c:"#ef4444" },
                ].map(c => `
                    <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:11px 16px;min-width:120px">
                        <div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${c.lbl}</div>
                        <div style="font-size:17px;font-weight:700;color:${c.c}">${c.val}</div>
                    </div>
                `).join("")}
            </div>
        </div>
        <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;padding-left:2px">Detalhamento por Cidade</div>
    `;

    // Tabela de cidades
    document.getElementById("vp-tbody").innerHTML = (d.cidades || []).map(c => `
        <tr>
            <td style="font-weight:600">${c.cidade}</td>
            <td style="text-align:right;color:#f97316">${_fmt(c.shopee)}</td>
            <td style="text-align:right;color:#9333ea">${_fmt(c.imile)}</td>
            <td style="text-align:right;color:#22c55e">${_fmt(c.anjun)}</td>
            <td style="text-align:right;color:#ef4444">${_fmt(c.jt)}</td>
            <td style="text-align:right;color:#12a5e8">${_fmt(c.loggi)}</td>
            <td style="text-align:right;font-weight:600">${_fmt(c.qtd_total)}</td>
            <td style="text-align:right;color:#22c55e;font-weight:600">${c.valor_cidade}</td>
        </tr>
    `).join("");

    // Totais
    const tq = d.totais_qtd || {};
    const tv = d.totais_val || {};
    const totalQtd = tq.total > 0 ? tq.total : ((tq.shopee||0) + (tq.imile||0) + (tq.anjun||0) + (tq.jt||0) + (tq.loggi||0));

    // Tabela: footer só com QTD totais
    document.getElementById("vp-tfoot").innerHTML = `
        <tr style="background:rgba(255,255,255,0.05);border-top:2px solid rgba(255,255,255,0.1)">
            <td style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Total</td>
            <td style="text-align:right;font-weight:700;color:#f97316">${_fmt(tq.shopee)}</td>
            <td style="text-align:right;font-weight:700;color:#9333ea">${_fmt(tq.imile)}</td>
            <td style="text-align:right;font-weight:700;color:#22c55e">${_fmt(tq.anjun)}</td>
            <td style="text-align:right;font-weight:700;color:#ef4444">${_fmt(tq.jt)}</td>
            <td style="text-align:right;font-weight:700;color:#12a5e8">${_fmt(tq.loggi)}</td>
            <td style="text-align:right;font-weight:800;font-size:14px;color:#e2e8f0">${_fmt(totalQtd)}</td>
            <td style="text-align:right;font-weight:700;color:#22c55e">${d.soma_valor_cidades || "—"}</td>
        </tr>
    `;

    // Cards de valor por transportadora (abaixo da tabela)
    const transp = [
        { nome:"Shopee", cor:"#f97316", bg:"rgba(249,115,22,0.08)", qtd: tq.shopee||0, val: tv.shopee },
        { nome:"iMile",  cor:"#9333ea", bg:"rgba(147,51,234,0.08)", qtd: tq.imile||0,  val: tv.imile  },
        { nome:"Anjun",  cor:"#22c55e", bg:"rgba(34,197,94,0.08)",  qtd: tq.anjun||0,  val: tv.anjun  },
        { nome:"J&T",    cor:"#ef4444", bg:"rgba(239,68,68,0.08)",  qtd: tq.jt||0,     val: tv.jt     },
        { nome:"Loggi",  cor:"#12a5e8", bg:"rgba(18,165,232,0.08)", qtd: tq.loggi||0,  val: tv.loggi  },
    ];
    const vpValCards = document.getElementById("vp-val-cards");
    if (vpValCards) {
        vpValCards.innerHTML = `
            <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;padding-left:2px">Valores por Transportadora</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${transp.map(t => `
                    <div style="flex:1;min-width:140px;background:${t.bg};border:1px solid ${t.cor}33;border-radius:14px;padding:14px 16px">
                        <div style="font-size:11px;font-weight:600;color:${t.cor};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">${t.nome}</div>
                        <div style="font-size:18px;font-weight:700;color:#e2e8f0;line-height:1">${t.val || "—"}</div>
                        <div style="font-size:11px;color:#64748b;margin-top:5px">${_fmt(t.qtd)} pacotes</div>
                    </div>
                `).join("")}
            </div>
        `;
    }

    // Extravios
    const extEl = document.getElementById("vp-extravios");
    const lista = d.extravios_linhas || [];
    const _periodoLabel = d.quinzena_ref || "Extravios";
    extEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.7px">
                Extravios do Período
                <span style="font-size:10px;font-weight:500;color:#64748b;text-transform:none;letter-spacing:0;margin-left:6px">${lista.length} registro${lista.length !== 1 ? "s" : ""}</span>
            </div>
            ${lista.length > 0 ? `
            <button onclick="_baixarExtraviosVdXlsx()" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:9px;border:1px solid rgba(52,211,153,0.35);background:rgba(52,211,153,0.07);color:#34d399;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .2s" onmouseover="this.style.background='rgba(52,211,153,0.16)'" onmouseout="this.style.background='rgba(52,211,153,0.07)'">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Baixar XLSX
            </button>` : ""}
        </div>
        <div id="vp-extravios-lista"></div>
    `;
    _renderExtravios(lista, "vp-extravios-lista", true);
    window._vdExtraviosLista   = lista;
    window._vdExtraviosPeriodo = _periodoLabel;

    document.getElementById("vp-empty").style.display   = "none";
    document.getElementById("vp-content").style.display = "";
}

function _baixarExtraviosVdXlsx() {
    const lista   = window._vdExtraviosLista   || [];
    const periodo = window._vdExtraviosPeriodo || "Extravios";
    if (!lista.length) return;

    const linhas = lista.map(e => ({
        "Transportadora": e.transportadora,
        "Código":         e.codigo,
        "Endereço":       e.endereco,
        "Responsável":    e.responsavel,
        "Valor":          e.valor,
    }));

    const ws  = XLSX.utils.json_to_sheet(linhas);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extravios");
    XLSX.writeFile(wb, `Extravios_${periodo.replace(/\//g, "-")}.xlsx`);
}

// ───── VIDEIRA — DASHBOARD ─────

let _vdGran        = "quinzena";
let _vdGruposRaw   = [];
let _vdGrupos      = [];
let _vdSelIdx      = -1;
let _vdValorChart  = null;
let _vdTranspChart = null;

function abrirVideiraDash(event) {
    if (event) event.preventDefault();
    document.getElementById("vd-empty").innerText      = "Carregando...";
    document.getElementById("vd-empty").style.display  = "";
    document.getElementById("vd-content").style.display = "none";
    mostrarTela("tela-videira-dash");
    _buscarVideiraDash();
}

function setVdGran(tipo) {
    _vdGran = tipo;
    document.getElementById("vd-gran-q").classList.toggle("active", tipo === "quinzena");
    document.getElementById("vd-gran-m").classList.toggle("active", tipo === "mes");
    if (_vdGruposRaw.length) _renderVdDash(_vdGruposRaw);
}

function _pmoedaVd(s) {
    if (typeof s === "number") return s;
    if (!s) return 0;
    return parseFloat(String(s).replace(/[^\d,\-]/g, "").replace(",", ".")) || 0;
}

function _buscarVideiraDash() {
    fetch(`${API}/videira/planilhas`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(planilhas => {
        if (!Array.isArray(planilhas) || !planilhas.length) {
            document.getElementById("vd-empty").innerText = "Nenhum fechamento cadastrado.";
            return;
        }
        // planilhas vem do mais recente para o mais antigo — invertemos para o gráfico
        const ordered = [...planilhas].reverse();
        return Promise.all(ordered.map(p =>
            fetch(`${API}/videira/painel?mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`, {
                headers: { "Authorization": "Bearer " + token }
            }).then(r => r.ok ? r.json() : null).catch(() => null)
        )).then(results => {
            const raw = ordered.map((p, i) => {
                const d = results[i];
                if (!d || d.error) return null;
                const tq = d.totais_qtd || {};
                const tv = d.totais_val || {};
                return {
                    mes: p.mes, ano: p.ano, quinzena: p.quinzena,
                    label:    `${p.quinzena}Q ${MES_NOMES[p.mes].slice(0, 3)}`,
                    valor:    d.valor_total_liquido_num || 0,
                    shopee:   tq.shopee || 0,  shopee_v: _pmoedaVd(tv.shopee),
                    imile:    tq.imile  || 0,  imile_v:  _pmoedaVd(tv.imile),
                    anjun:    tq.anjun  || 0,  anjun_v:  _pmoedaVd(tv.anjun),
                    jt:       tq.jt     || 0,  jt_v:     _pmoedaVd(tv.jt),
                    loggi:    tq.loggi  || 0,  loggi_v:  _pmoedaVd(tv.loggi),
                    qtd_total: d.qtd_pacotes_total || 0,
                };
            }).filter(Boolean);
            _vdGruposRaw = raw;
            _renderVdDash(raw);
        });
    })
    .catch(() => { document.getElementById("vd-empty").innerText = "Erro ao carregar dados."; });
}

function _renderVdDash(raw) {
    let grupos;
    if (_vdGran === "quinzena") {
        grupos = raw;
    } else {
        const byMes = {};
        raw.forEach(d => {
            const k = `${d.ano}_${d.mes}`;
            if (!byMes[k]) byMes[k] = {
                mes: d.mes, ano: d.ano, quinzena: 0,
                label: MES_NOMES[d.mes].slice(0, 3),
                valor: 0, shopee: 0, shopee_v: 0, imile: 0, imile_v: 0,
                anjun: 0, anjun_v: 0, jt: 0, jt_v: 0, loggi: 0, loggi_v: 0, qtd_total: 0
            };
            const g = byMes[k];
            g.valor    += d.valor;       g.qtd_total += d.qtd_total;
            g.shopee   += d.shopee;      g.shopee_v  += d.shopee_v;
            g.imile    += d.imile;       g.imile_v   += d.imile_v;
            g.anjun    += d.anjun;       g.anjun_v   += d.anjun_v;
            g.jt       += d.jt;          g.jt_v      += d.jt_v;
            g.loggi    += d.loggi;       g.loggi_v   += d.loggi_v;
        });
        grupos = Object.values(byMes);
    }
    _vdGrupos = grupos;
    if (!grupos.length) { document.getElementById("vd-empty").innerText = "Sem dados."; return; }

    document.getElementById("vd-empty").style.display   = "none";
    document.getElementById("vd-content").style.display = "";

    const labels = grupos.map(g => g.label);
    const ult  = grupos[grupos.length - 1];
    const prev = grupos[grupos.length - 2] || null;
    const ini  = grupos[0];

    // KPI cards
    const gran = _vdGran === "quinzena" ? "Quinzena" : "Mês";
    document.getElementById("vdkpi-ant-card").querySelector(".dash-kpi-lbl").textContent = `vs ${gran} Anterior`;
    function _applyVdKpi(cardId, pctId, subId, pct, sub) {
        document.getElementById(cardId).className = "dash-kpi-card" + (pct.dir > 0 ? " kpi-up" : pct.dir < 0 ? " kpi-down" : "");
        const el = document.getElementById(pctId);
        el.className = "dash-kpi-pct " + pct.cls;
        el.textContent = pct.txt;
        document.getElementById(subId).textContent = sub;
    }
    _applyVdKpi("vdkpi-ant-card","vdkpi-vs-ant","vdkpi-vs-ant-sub",
        _pctKpi(ult.valor, prev ? prev.valor : 0),
        prev ? ult.label + " vs " + prev.label : "—");
    _applyVdKpi("vdkpi-ini-card","vdkpi-vs-ini","vdkpi-vs-ini-sub",
        _pctKpi(ult.valor, ini.valor),
        ult.label !== ini.label ? ult.label + " vs " + ini.label : "—");

    // Period chips
    document.getElementById("vd-pchips").innerHTML = grupos.map((g, i) =>
        `<div class="dash-pchip" onclick="_vdSelecionarChip(${i})">
            <div class="dpc-lbl">${g.label}</div>
            <div class="dpc-val">${moedaJS(g.valor)}</div>
        </div>`
    ).join("");
    _vdSelecionarChip(grupos.length - 1);

    // Chart: Valor Líquido por período
    if (_vdValorChart) { _vdValorChart.destroy(); _vdValorChart = null; }
    _vdValorChart = new Chart(document.getElementById("vd-valor-chart").getContext("2d"), {
        type: "bar",
        data: { labels, datasets: [{ label: "Valor Líquido", data: grupos.map(g => g.valor),
            backgroundColor: "rgba(34,197,94,0.7)", borderColor: "#22c55e", borderWidth: 1, borderRadius: 7 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: ctx => "  " + moedaJS(ctx.raw) + (_delta(ctx.raw, ctx.dataIndex > 0 ? grupos[ctx.dataIndex-1].valor : null).cls !== "flat" ? "  " + _delta(ctx.raw, grupos[ctx.dataIndex-1]?.valor).txt : "") } }
            },
            scales: {
                x: { grid: { color: "rgba(34,197,94,0.07)" }, ticks: { color: "#aab4c8", font: { size: 11 } } },
                y: { grid: { color: "rgba(34,197,94,0.07)" }, ticks: { color: "#4a6a8a", font: { size: 11 }, callback: v => moedaJS(v) } }
            }
        }
    });

    // Chart: Transportadoras por período (Qtd)
    if (_vdTranspChart) { _vdTranspChart.destroy(); _vdTranspChart = null; }
    _vdTranspChart = new Chart(document.getElementById("vd-transp-chart").getContext("2d"), {
        type: "bar",
        data: { labels, datasets: TRANSP_DEF.map(t => ({
            label: t.label, data: grupos.map(g => g[t.key] || 0),
            backgroundColor: t.bg, borderColor: t.color, borderWidth: 1, borderRadius: 5,
        })) },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#aab4c8", font: { size: 12 }, boxWidth: 14, padding: 16 } },
                tooltip: { callbacks: { label: ctx => "  " + ctx.dataset.label + ": " + (ctx.raw||0).toLocaleString("pt-BR") } }
            },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#aab4c8", font: { size: 11 } } },
                y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#4a6a8a", font: { size: 11 } } }
            }
        }
    });
}

function _vdSelecionarChip(idx) {
    if (idx < 0 || idx >= _vdGrupos.length) return;
    _vdSelIdx = idx;
    const g    = _vdGrupos[idx];
    const prev = _vdGrupos[idx - 1] || null;
    document.querySelectorAll("#vd-pchips .dash-pchip").forEach((el, i) =>
        el.classList.toggle("current", i === idx)
    );
    const totalLinha = document.getElementById("vd-total-linha");
    totalLinha.style.display = "";
    totalLinha.innerHTML = `Valor líquido · ${g.label}: <strong style="color:#22c55e;font-size:15px;font-weight:700">${moedaJS(g.valor)}</strong>`;
    document.getElementById("vd-transp-grid").innerHTML = TRANSP_DEF.map(t => {
        const v   = g[t.valKey] || 0;
        const q   = g[t.key]    || 0;
        const pv  = prev ? (prev[t.valKey] || 0) : null;
        const dlt = _delta(v, pv);
        const bCls = dlt.cls === "up" ? "lucro" : dlt.cls === "down" ? "preju" : "estavel";
        const badge = dlt.cls !== "flat"
            ? `<span class="lbadge ${bCls}" style="font-size:10px;padding:2px 7px">${dlt.txt}</span>` : "";
        return `<div class="dash-tc">
            <div class="dash-tc-name" style="color:${t.color}">${t.label}</div>
            <div class="dash-tc-qtd" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${moedaJS(v)}${badge}</div>
            <div class="dash-tc-sub">${q.toLocaleString("pt-BR")} pacotes · ${g.label}</div>
        </div>`;
    }).join("");
}
