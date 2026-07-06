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
    const liqNum = d.valor_total_liquido_num || 0;
    const desNum = parseFloat(String(d.valor_desconto||"").replace(/[^\d,\-]/g,"").replace(",",".")) || 0;

    const cards = document.getElementById("vp-cards");
    cards.innerHTML = `
        <div class="vp-hero${liqNum < 0 ? " neg" : ""}">
            <div>
                <div class="vp-hero-eyebrow">Resultado Líquido do Período</div>
                <div class="vp-hero-val">${d.valor_total_liquido || "—"}</div>
                <div class="vp-hero-sub">${d.quinzena_ref || ""}</div>
            </div>
            <div class="vp-hero-sep"></div>
            <div class="vp-hero-right">
                <div class="vp-hero-eyebrow">Total Pacotes</div>
                <div class="vp-hero-val neutral">${(d.qtd_pacotes_total||0).toLocaleString("pt-BR")}</div>
                <div class="vp-hero-sub">pacotes finalizados</div>
            </div>
        </div>

        <div class="vp-stats">
            <div class="vp-stat orange">
                <div class="vp-stat-lbl">Coletas</div>
                <div class="vp-stat-val">${(d.qtd_coletas||0).toLocaleString("pt-BR")} col.</div>
            </div>
            <div class="vp-stat orange">
                <div class="vp-stat-lbl">Valor Coletas</div>
                <div class="vp-stat-val">${d.valor_coletas || "—"}</div>
            </div>
            <div class="vp-stat">
                <div class="vp-stat-lbl">Diária Col.</div>
                <div class="vp-stat-val">${d.diaria_coletas || "—"}</div>
            </div>
            <div class="vp-stat${desNum > 0 ? " red" : ""}">
                <div class="vp-stat-lbl">Descontos</div>
                <div class="vp-stat-val">${d.valor_desconto || "R$ 0,00"}</div>
            </div>
        </div>

        <div class="vp-lbl">Detalhamento por Cidade</div>
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
            <td style="text-align:right;color:#f59e0b">${_fmt(c.total_express)}</td>
            <td style="text-align:right;color:#e8340a">${_fmt(c.jadlog)}</td>
            <td style="text-align:right;font-weight:600">${_fmt(c.qtd_total)}</td>
            <td style="text-align:right;color:#22c55e;font-weight:600">${c.valor_cidade}</td>
        </tr>
    `).join("");

    // Totais
    const tq = d.totais_qtd || {};
    const tv = d.totais_val || {};
    const totalQtd = tq.total > 0 ? tq.total : ((tq.shopee||0) + (tq.imile||0) + (tq.anjun||0) + (tq.jt||0) + (tq.loggi||0) + (tq.total_express||0) + (tq.jadlog||0));

    // Tabela: footer só com QTD totais
    document.getElementById("vp-tfoot").innerHTML = `
        <tr style="background:rgba(255,255,255,0.05);border-top:2px solid rgba(255,255,255,0.1)">
            <td style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Total</td>
            <td style="text-align:right;font-weight:700;color:#f97316">${_fmt(tq.shopee)}</td>
            <td style="text-align:right;font-weight:700;color:#9333ea">${_fmt(tq.imile)}</td>
            <td style="text-align:right;font-weight:700;color:#22c55e">${_fmt(tq.anjun)}</td>
            <td style="text-align:right;font-weight:700;color:#ef4444">${_fmt(tq.jt)}</td>
            <td style="text-align:right;font-weight:700;color:#12a5e8">${_fmt(tq.loggi)}</td>
            <td style="text-align:right;font-weight:700;color:#f59e0b">${_fmt(tq.total_express)}</td>
            <td style="text-align:right;font-weight:700;color:#e8340a">${_fmt(tq.jadlog)}</td>
            <td style="text-align:right;font-weight:800;font-size:14px;color:#e2e8f0">${_fmt(totalQtd)}</td>
            <td style="text-align:right;font-weight:700;color:#22c55e">${d.soma_valor_cidades || "—"}</td>
        </tr>
    `;

    // Cards de valor por transportadora (abaixo da tabela)
    const transp = [
        { nome:"Shopee",        cor:"#f97316", bg:"rgba(249,115,22,0.08)",  qtd: tq.shopee||0,        val: tv.shopee        },
        { nome:"iMile",         cor:"#9333ea", bg:"rgba(147,51,234,0.08)", qtd: tq.imile||0,          val: tv.imile         },
        { nome:"Anjun",         cor:"#22c55e", bg:"rgba(34,197,94,0.08)",  qtd: tq.anjun||0,          val: tv.anjun         },
        { nome:"J&T",           cor:"#ef4444", bg:"rgba(239,68,68,0.08)",  qtd: tq.jt||0,             val: tv.jt            },
        { nome:"Loggi",         cor:"#12a5e8", bg:"rgba(18,165,232,0.08)", qtd: tq.loggi||0,          val: tv.loggi         },
        { nome:"Total Express", cor:"#f59e0b", bg:"rgba(245,158,11,0.08)", qtd: tq.total_express||0,  val: tv.total_express },
        { nome:"JadLog",        cor:"#e8340a", bg:"rgba(232,51,10,0.08)",  qtd: tq.jadlog||0,          val: tv.jadlog        },
    ];
    const vpValCards = document.getElementById("vp-val-cards");
    if (vpValCards) {
        vpValCards.innerHTML = `
            <div class="vp-lbl">Transportadoras</div>
            <div class="vp-carrier-grid">
                ${transp.map(t => `
                    <div class="vp-c" style="border-left-color:${t.cor}">
                        <div class="vp-c-name" style="color:${t.cor}">${t.nome}</div>
                        <div class="vp-c-val">${t.val || "—"}</div>
                        <div class="vp-c-qty">${_fmt(t.qtd)} pacotes</div>
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

function _refToNomeArquivo(ref) {
    const meses = {jan:"Janeiro",fev:"Fevereiro",mar:"Marco",abr:"Abril",mai:"Maio",jun:"Junho",jul:"Julho",ago:"Agosto",set:"Setembro",out:"Outubro",nov:"Novembro",dez:"Dezembro"};
    const m = String(ref || "").trim().match(/^Q([12])([A-Za-z]{3})/i);
    if (!m) return ref || "Periodo";
    const nome = meses[m[2].toLowerCase()] || m[2];
    return `Q${m[1]}_${nome}_${new Date().getFullYear()}`;
}

function _baixarExtraviosVdXlsx() {
    const lista   = window._vdExtraviosLista   || [];
    const periodo = window._vdExtraviosPeriodo || "";
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
    XLSX.writeFile(wb, `Extravios_Videira_${_refToNomeArquivo(periodo)}.xlsx`);
}

// ───── VIDEIRA — DASHBOARD ─────

let _vdGran        = "quinzena";
let _vdGruposRaw   = [];
let _vdGrupos      = [];
let _vdSelIdx      = -1;
let _vdValorChart  = null;
let _vdTranspChart = null;
let _vdPieChart    = null;

const VD_TRANSP_DEF = [
    { key: "shopee",        valKey: "shopee_v",        label: "Shopee",    color: "#f97316", bg: "rgba(249,115,22,0.7)"  },
    { key: "imile",         valKey: "imile_v",         label: "iMile",     color: "#9333ea", bg: "rgba(147,51,234,0.7)"  },
    { key: "anjun",         valKey: "anjun_v",         label: "Anjun",     color: "#22c55e", bg: "rgba(34,197,94,0.7)"   },
    { key: "jt",            valKey: "jt_v",            label: "J&T",       color: "#ef4444", bg: "rgba(239,68,68,0.7)"   },
    { key: "loggi",         valKey: "loggi_v",         label: "Loggi",     color: "#12a5e8", bg: "rgba(18,165,232,0.7)"  },
    { key: "total_express", valKey: "total_express_v", label: "T.Express", color: "#f59e0b", bg: "rgba(245,158,11,0.7)"  },
    { key: "jadlog",        valKey: "jadlog_v",        label: "JadLog",    color: "#e8340a", bg: "rgba(232,52,10,0.7)"   },
];

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
                    shopee:         tq.shopee         || 0, shopee_v:         _pmoedaVd(tv.shopee),
                    imile:          tq.imile          || 0, imile_v:          _pmoedaVd(tv.imile),
                    anjun:          tq.anjun          || 0, anjun_v:          _pmoedaVd(tv.anjun),
                    jt:             tq.jt             || 0, jt_v:             _pmoedaVd(tv.jt),
                    loggi:          tq.loggi          || 0, loggi_v:          _pmoedaVd(tv.loggi),
                    total_express:  tq.total_express  || 0, total_express_v:  _pmoedaVd(tv.total_express),
                    jadlog:         tq.jadlog         || 0, jadlog_v:         _pmoedaVd(tv.jadlog),
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
                anjun: 0, anjun_v: 0, jt: 0, jt_v: 0, loggi: 0, loggi_v: 0,
                total_express: 0, total_express_v: 0, jadlog: 0, jadlog_v: 0, qtd_total: 0
            };
            const g = byMes[k];
            g.valor         += d.valor;          g.qtd_total       += d.qtd_total;
            g.shopee        += d.shopee;         g.shopee_v        += d.shopee_v;
            g.imile         += d.imile;          g.imile_v         += d.imile_v;
            g.anjun         += d.anjun;          g.anjun_v         += d.anjun_v;
            g.jt            += d.jt;             g.jt_v            += d.jt_v;
            g.loggi         += d.loggi;          g.loggi_v         += d.loggi_v;
            g.total_express += d.total_express;  g.total_express_v += d.total_express_v;
            g.jadlog        += d.jadlog;         g.jadlog_v        += d.jadlog_v;
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

    if (_vdPieChart) { _vdPieChart.destroy(); _vdPieChart = null; }
    _vdSelecionarChip(grupos.length - 1);

    const gran2 = _vdGran === "quinzena" ? "Quinzena" : "Mês";
    const titEl = document.getElementById("vd-transp-title");
    if (titEl) titEl.textContent = `Mix de Transportadoras por ${gran2} (%)`;

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

    // Chart: Mix por período — 100% normalizado
    if (_vdTranspChart) { _vdTranspChart.destroy(); _vdTranspChart = null; }
    const totaisPorPeriodo = grupos.map(g => VD_TRANSP_DEF.reduce((s, t) => s + (g[t.key] || 0), 0));
    _vdTranspChart = new Chart(document.getElementById("vd-transp-chart").getContext("2d"), {
        type: "bar",
        data: { labels, datasets: VD_TRANSP_DEF.map(t => ({
            label: t.label,
            data: grupos.map((g, i) => {
                const tot = totaisPorPeriodo[i];
                return tot ? +((( g[t.key] || 0) / tot) * 100).toFixed(2) : 0;
            }),
            backgroundColor: t.bg, borderColor: t.color, borderWidth: 1,
        })) },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: "#aab4c8", font: { size: 11 }, boxWidth: 12, padding: 14 } },
                tooltip: { callbacks: { label: ctx => {
                    const g = grupos[ctx.dataIndex];
                    const t = VD_TRANSP_DEF[ctx.datasetIndex];
                    const qtd = g ? (g[t.key] || 0) : 0;
                    return `  ${ctx.dataset.label}: ${ctx.raw}%  (${qtd.toLocaleString("pt-BR")} pct)`;
                }}}
            },
            scales: {
                x: { stacked: true, grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "#aab4c8", font: { size: 11 } } },
                y: { stacked: true, max: 100, grid: { color: "rgba(255,255,255,0.04)" },
                    ticks: { color: "#4a6a8a", font: { size: 11 }, callback: v => v + "%" } }
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

    // Carrier cards com borda lateral colorida
    document.getElementById("vd-transp-grid").innerHTML = VD_TRANSP_DEF.map(t => {
        const v   = g[t.valKey] || 0;
        const q   = g[t.key]    || 0;
        const pv  = prev ? (prev[t.valKey] || 0) : null;
        const dlt = _delta(v, pv);
        const bCls = dlt.cls === "up" ? "lucro" : dlt.cls === "down" ? "preju" : "estavel";
        const badge = dlt.cls !== "flat"
            ? `<span class="lbadge ${bCls}">${dlt.txt.slice(2)}</span>` : "";
        return `<div class="dash-tc" style="border-left-color:${t.color}">
            <div class="dash-tc-name" style="color:${t.color}">${t.label}</div>
            <div class="dash-tc-qtd">${moedaJS(v)} ${badge}</div>
            <div class="dash-tc-sub">${q.toLocaleString("pt-BR")} pacotes · ${g.label}</div>
        </div>`;
    }).join("");

    // Donut — mix por qtd
    const totPie = VD_TRANSP_DEF.reduce((s, t) => s + (g[t.key] || 0), 0);
    const pieData = VD_TRANSP_DEF.map(t => g[t.key] || 0);
    const pieCanvas = document.getElementById("vd-pie-chart");
    if (_vdPieChart) {
        _vdPieChart.data.datasets[0].data = pieData;
        _vdPieChart.update();
    } else if (pieCanvas) {
        _vdPieChart = new Chart(pieCanvas.getContext("2d"), {
            type: "doughnut",
            data: {
                labels: VD_TRANSP_DEF.map(t => t.label),
                datasets: [{
                    data: pieData,
                    backgroundColor: VD_TRANSP_DEF.map(t => t.bg),
                    borderColor:     VD_TRANSP_DEF.map(t => t.color),
                    borderWidth: 1.5, hoverOffset: 6,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "68%",
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => {
                        const pct = totPie ? ((ctx.raw / totPie) * 100).toFixed(1) : "0.0";
                        return `  ${ctx.raw.toLocaleString("pt-BR")} pacotes  (${pct}%)`;
                    }}}
                }
            }
        });
    }
    const legendEl = document.getElementById("vd-pie-legend");
    if (legendEl) legendEl.innerHTML = VD_TRANSP_DEF.map(t => {
        const qtd = g[t.key] || 0;
        const pct = totPie ? ((qtd / totPie) * 100).toFixed(1) : "0.0";
        return `<div class="dash-pie-leg">
            <div class="dash-pie-dot" style="background:${t.color}"></div>
            <span class="dash-pie-name">${t.label}</span>
            <span class="dash-pie-qty">${qtd.toLocaleString("pt-BR")}</span>
            <span class="dash-pie-pct">${pct}%</span>
        </div>`;
    }).join("");
}
