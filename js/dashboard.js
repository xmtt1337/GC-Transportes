// ───── DASHBOARD ─────
let _dashBarChart = null;
let _dashGran     = "quinzena";
let _admGrupos    = [];
let _admAno       = new Date().getFullYear();
let _admSelIdx    = -1;

function _admSelecionarChip(idx) {
    if (idx < 0 || idx >= _admGrupos.length) return;
    _admSelIdx = idx;
    const g    = _admGrupos[idx];
    const prev = _admGrupos[idx - 1] || null;
    const ini  = _admGrupos[0];

    document.querySelectorAll("#dash-pchips .dash-pchip").forEach((el, i) =>
        el.classList.toggle("current", i === idx)
    );

    const gran = _dashGran === "quinzena" ? "Quinzena" : "Mês";
    document.getElementById("dkpi-mes-card").querySelector(".dash-kpi-lbl").textContent =
        "vs " + gran + " Anterior";

    function _applyKpi(cardId, pctElId, subId, pct, subTxt) {
        document.getElementById(cardId).className =
            "dash-kpi-card" + (pct.dir > 0 ? " kpi-up" : pct.dir < 0 ? " kpi-down" : "");
        const el = document.getElementById(pctElId);
        el.className   = "dash-kpi-pct " + pct.cls;
        el.textContent = pct.txt;
        document.getElementById(subId).textContent = subTxt;
    }

    _applyKpi("dkpi-mes-card", "dkpi-vs-mes", "dkpi-vs-mes-sub",
        _pctKpi(g.total, prev ? prev.total : 0),
        prev ? g.label + " vs " + prev.label : "—");

    _applyKpi("dkpi-inicio-card", "dkpi-vs-inicio", "dkpi-vs-inicio-sub",
        _pctKpi(g.total, ini.total),
        g.label !== ini.label ? g.label + " vs " + ini.label : "—");

    document.getElementById("dash-transp-grid").innerHTML = TRANSP_DEF.map(t => {
        const qtd  = g[t.key] || 0;
        const pQtd = prev ? (prev[t.key] || 0) : 0;
        const dlt  = _delta(qtd, pQtd);
        const pctStr = dlt.cls !== "flat" ? dlt.txt.slice(2) : "—";
        const bCls   = dlt.cls === "up" ? "lucro" : dlt.cls === "down" ? "preju" : "estavel";
        return `<div class="dash-tc">
            <div class="dash-tc-name" style="color:${t.color}">${t.label}</div>
            <div class="dash-tc-qtd">${qtd.toLocaleString("pt-BR")}</div>
            <div class="dash-tc-sub">pacotes · ${g.label}</div>
            <span class="lbadge ${bCls}">${pctStr}</span>
        </div>`;
    }).join("");
}

const TRANSP_DEF = [
    { key: "loggi",  valKey: "loggi_v",  label: "Loggi",  color: "#01b4f7", bg: "rgba(1,180,247,0.7)"   },
    { key: "jt",     valKey: "jt_v",     label: "J&T",    color: "#cc4138", bg: "rgba(204,65,56,0.7)"   },
    { key: "imile",  valKey: "imile_v",  label: "iMile",  color: "#6b80ff", bg: "rgba(107,128,255,0.7)"  },
    { key: "anjun",  valKey: "anjun_v",  label: "Anjun",  color: "#009c21", bg: "rgba(0,156,33,0.7)"    },
    { key: "shopee", valKey: "shopee_v", label: "Shopee", color: "#ed4d2d", bg: "rgba(237,77,45,0.7)"   },
];
const MES_NOMES = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function _delta(atual, ant) {
    if (!ant) return { cls: "flat", txt: "—" };
    const diff = atual - ant;
    const pct  = ((diff / ant) * 100).toFixed(1);
    if (diff > 0) return { cls: "up",   txt: "↑ +" + pct + "%" };
    if (diff < 0) return { cls: "down", txt: "↓ "  + pct + "%" };
    return { cls: "flat", txt: "= 0%" };
}

function _pctKpi(atual, ant) {
    if (!ant || ant === 0) return { cls: "flat", txt: "—", dir: 0 };
    const diff = atual - ant;
    const pct  = ((diff / ant) * 100).toFixed(1);
    if (diff > 0) return { cls: "up",   txt: "↑ +" + pct + "%", dir:  1 };
    if (diff < 0) return { cls: "down", txt: "↓ "  + pct + "%", dir: -1 };
    return { cls: "flat", txt: "= 0%", dir: 0 };
}

function setDashGran(tipo) {
    _dashGran = tipo;
    document.getElementById("dash-gran-q").classList.toggle("active", tipo === "quinzena");
    document.getElementById("dash-gran-m").classList.toggle("active", tipo === "mes");
    buscarDashboard();
}

function abrirDashboard(event) {
    if (event) event.preventDefault();
    document.getElementById("dash-empty").innerText = "Carregando...";
    document.getElementById("dash-empty").style.display = "";
    document.getElementById("dash-content").style.display = "none";
    mostrarTela("tela-dashboard");
    buscarDashboard();
}

function _iniciarSelectsDash() {
    const selAno = document.getElementById("dash-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === anoAtual) opt.selected = true;
        selAno.appendChild(opt);
    }
}

function buscarDashboard() {
    const ano     = new Date().getFullYear();
    const empty   = document.getElementById("dash-empty");
    const content = document.getElementById("dash-content");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${API}/admin/historico?ano=${ano}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(dados => {
        if (!dados.length) { empty.innerText = "Nenhum dado encontrado para este ano."; return; }
        empty.style.display = "none";
        content.style.display = "";

        // Grupos primeiro — KPIs respeitam a granularidade escolhida
        let grupos;
        if (_dashGran === "quinzena") {
            grupos = dados.map(d => ({
                label:    `${d.quinzena}Q ${MES_NOMES[d.mes].slice(0, 3)}`,
                total:    d.total_entregues || 0,
                mes:      d.mes,
                quinzena: d.quinzena,
                loggi:    d.loggi  ? d.loggi.qtd  : 0,
                jt:       d.jt     ? d.jt.qtd     : 0,
                imile:    d.imile  ? d.imile.qtd  : 0,
                anjun:    d.anjun  ? d.anjun.qtd  : 0,
                shopee:   d.shopee ? d.shopee.qtd : 0,
            }));
        } else {
            const byMes = {};
            dados.forEach(d => {
                if (!byMes[d.mes]) byMes[d.mes] = { label: MES_NOMES[d.mes].slice(0, 3), total: 0, mes: d.mes, quinzena: 0, loggi: 0, jt: 0, imile: 0, anjun: 0, shopee: 0 };
                byMes[d.mes].total  += d.total_entregues || 0;
                byMes[d.mes].loggi  += d.loggi  ? d.loggi.qtd  : 0;
                byMes[d.mes].jt     += d.jt     ? d.jt.qtd     : 0;
                byMes[d.mes].imile  += d.imile  ? d.imile.qtd  : 0;
                byMes[d.mes].anjun  += d.anjun  ? d.anjun.qtd  : 0;
                byMes[d.mes].shopee += d.shopee ? d.shopee.qtd : 0;
            });
            grupos = Object.keys(byMes).sort((a, b) => Number(a) - Number(b)).map(m => byMes[m]);
        }

        // Store globally for chip selection
        _admGrupos = grupos;
        _admAno    = ano;

        document.getElementById("dash-chart-title").textContent = _dashGran === "quinzena" ? "Pacotes por Quinzena" : "Pacotes por Mês";

        // Chips de período (clicáveis → seleciona período no dashboard)
        document.getElementById("dash-pchips").innerHTML = grupos.map((g, i) =>
            `<div class="dash-pchip" onclick="_admSelecionarChip(${i})">
                <div class="dpc-lbl">${g.label}</div>
                <div class="dpc-val">${g.total.toLocaleString("pt-BR")}</div>
            </div>`
        ).join("");

        const labels = grupos.map(g => g.label);
        const canvas = document.getElementById("dash-bar-chart");
        if (_dashBarChart) { _dashBarChart.destroy(); _dashBarChart = null; }
        _dashBarChart = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: TRANSP_DEF.map(t => ({
                    label: t.label,
                    data: grupos.map(g => g[t.key] || 0),
                    backgroundColor: t.bg,
                    borderColor: t.color,
                    borderWidth: 1, borderRadius: 4,
                }))
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: "#aab4c8", font: { size: 12 }, usePointStyle: true, padding: 16 } },
                    tooltip: { callbacks: { label: ctx => {
                        const i   = ctx.dataIndex;
                        const t   = TRANSP_DEF[ctx.datasetIndex];
                        const ant = i > 0 ? (grupos[i - 1][t.key] || 0) : null;
                        const dlt = _delta(ctx.raw, ant);
                        return "  " + ctx.raw.toLocaleString("pt-BR") + " pacotes  " + dlt.txt;
                    }}}
                },
                scales: {
                    x: { grid: { color: "rgba(58,134,255,0.07)" }, border: { color: "rgba(58,134,255,0.1)" }, ticks: { color: "#aab4c8", font: { size: 11 } } },
                    y: { grid: { color: "rgba(58,134,255,0.07)" }, border: { color: "rgba(58,134,255,0.1)" }, ticks: { color: "#4a6a8a", font: { size: 11 }, callback: v => v.toLocaleString("pt-BR") } }
                }
            }
        });

        // Selecionar último período nos cards e KPIs
        _admSelecionarChip(grupos.length - 1);
    })
    .catch(() => { empty.innerText = "Erro ao conectar com o servidor."; });
}
