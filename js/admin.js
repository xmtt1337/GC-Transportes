// ───── TELA ADMIN ─────
function abrirAdmin(event) {
    if (event) event.preventDefault();
    _iniciarSelectsAdmin();
    _carregarPlanilhas();
    mostrarTela("tela-admin");
}

function _iniciarSelectsAdmin() {
    const selAno = document.getElementById("adm-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual + 1; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === anoAtual) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("adm-mes").value = new Date().getMonth() + 1;
}

function _carregarPlanilhas() {
    fetch(API + "/admin/planilhas", { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(rows => {
        const el = document.getElementById("adm-planilhas-list");
        if (!rows.length) {
            el.innerHTML = `<div style="color:#7a8599;font-size:14px">Nenhuma planilha cadastrada.</div>`;
            return;
        }
        const mesNomes = ["", "Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        el.innerHTML = rows.map(r => `
            <div class="admin-list-item">
                <div>
                    <strong>${mesNomes[r.mes]}/${r.ano} — ${r.quinzena}ª Quinzena</strong>
                    <div class="info">${r.spreadsheet_id}</div>
                </div>
                <button class="admin-del-btn" onclick="deletarPlanilha(${r.id})">Remover</button>
            </div>
        `).join("");
    });
}

function adicionarPlanilha() {
    const mes  = document.getElementById("adm-mes").value;
    const ano  = document.getElementById("adm-ano").value;
    const q    = document.getElementById("adm-quinzena").value;
    const url  = document.getElementById("adm-url").value.trim();
    if (!url) { alert("Cole a URL da planilha."); return; }

    fetch(API + "/admin/planilhas", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: parseInt(mes), ano: parseInt(ano), quinzena: parseInt(q), spreadsheet_url: url })
    })
    .then(r => r.json())
    .then(() => {
        document.getElementById("adm-url").value = "";
        _carregarPlanilhas();
    });
}

function deletarPlanilha(id) {
    if (!confirm("Remover esta planilha?")) return;
    fetch(API + "/admin/planilhas/" + id, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    }).then(() => _carregarPlanilhas());
}

// ───── LOGOUT ─────
function logout() {
    localStorage.removeItem("token");
    window.location.href = "login.html";
}

// ───── LINK ATIVO NO SUBMENU ─────
document.querySelectorAll(".submenu a").forEach(link => {
    link.addEventListener("click", function() {
        document.querySelectorAll(".submenu a").forEach(l => l.classList.remove("active"));
        this.classList.add("active");
        this.closest(".submenu").previousElementSibling.classList.add("active");
        document.getElementById("titulo-pagina").innerText = this.innerText;
    });
});

// ───── HOME ACTIONS ─────
function renderHomeActions(role) {
    const container = document.getElementById("home-actions");
    if (!container) return;
    const defs = [];

    if (role === "entregador") {
        defs.push({
            icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01"/>`,
            title: "Meus Fechamentos",
            desc: "Veja seus valores quinzenais.",
            fn: "abrirFechamentos()"
        });
        defs.push({
            icon: `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
            title: "Dashboard",
            desc: "Evolução dos seus valores por transportadora.",
            fn: "abrirEntDashboard()"
        });
    }
    if (role === "admin") {
        defs.push({
            icon: `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
            title: "Dashboard",
            desc: "Gráficos e resumo por transportadora.",
            fn: "abrirDashboard()"
        });
        defs.push({
            icon: `<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/><path d="M18 14l2 2 4-4"/>`,
            title: "Administração",
            desc: "Planilhas e fechamentos dos entregadores.",
            fn: "abrirAdmin()"
        });
    }

    container.innerHTML = defs.map(d => `
        <div class="home-action-card" onclick="${d.fn}">
            <div class="home-card-icon"><svg viewBox="0 0 24 24">${d.icon}</svg></div>
            <div>
                <div class="home-card-title">${d.title}</div>
                <div class="home-card-desc">${d.desc}</div>
            </div>
        </div>
    `).join("");

    if (role === "entregador") carregarHomeNFStatus();
    if (role === "admin") _carregarHomeAdmin();
}

function _carregarHomeAdmin() {
    const dash = document.getElementById("home-admin-dash");
    if (!dash) return;
    const tok = localStorage.getItem("token");
    const anoAtual = new Date().getFullYear();
    const mesNomes = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    Promise.all([
        fetch(`${API}/admin/planilhas`,              { headers: { "Authorization": "Bearer " + tok } }).then(r => r.json()),
        fetch(`${API}/admin/usuarios?role=entregador`,{ headers: { "Authorization": "Bearer " + tok } }).then(r => r.json()),
        fetch(`${API}/admin/historico?ano=${anoAtual}`,{ headers: { "Authorization": "Bearer " + tok } }).then(r => r.json()),
    ]).then(([planilhas, entregadores, historico]) => {
        if (!Array.isArray(planilhas) || !planilhas.length) return;

        const ultimo  = planilhas[0];
        const nEnt    = Array.isArray(entregadores) ? entregadores.filter(u => u.active !== false).length : "—";
        const periodos = Array.isArray(historico) ? historico : [];

        fetch(`${API}/admin/resumo-quinzena?mes=${ultimo.mes}&ano=${ultimo.ano}&quinzena=${ultimo.quinzena}`, {
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json()).then(resumo => {
            const periodoLabel = `${ultimo.quinzena}ª Qz · ${mesNomes[ultimo.mes]} ${ultimo.ano}`;
            const totalPagar   = resumo.total_geral || "—";
            const totalPacotes = resumo.total_entregues ? resumo.total_entregues.toLocaleString("pt-BR") : "—";

            dash.innerHTML = `
                <div class="adm-home-section-label">Último período: ${periodoLabel}</div>
                <div class="adm-home-cards">
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(58,134,255,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#3a86ff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
                        </div>
                        <div class="adm-home-card-label">Entregadores ativos</div>
                        <div class="adm-home-card-value" style="color:#3a86ff">${nEnt}</div>
                    </div>
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(34,197,94,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </div>
                        <div class="adm-home-card-label">Total a pagar</div>
                        <div class="adm-home-card-value" style="color:#22c55e">${totalPagar}</div>
                    </div>
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(251,146,60,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.91 8.84L8.56 2.23a1 1 0 0 0-.97 0L2.05 5.11A1 1 0 0 0 2 6v12a1 1 0 0 0 .53.88l6.03 3.26a1 1 0 0 0 .94 0L21 15.34a1 1 0 0 0 .54-.88V9.7a1 1 0 0 0-.63-.86z"/><polyline points="7.9 4.5 12 6.86 16.1 4.5"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                        </div>
                        <div class="adm-home-card-label">Pacotes entregues</div>
                        <div class="adm-home-card-value" style="color:#fb923c">${totalPacotes}</div>
                    </div>
                    <div class="adm-home-card" onclick="abrirAdminFechamentos(event)" style="cursor:pointer">
                        <div class="adm-home-card-icon" style="background:rgba(167,139,250,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div class="adm-home-card-label">Ver fechamentos</div>
                        <div class="adm-home-card-value" style="color:#a78bfa;font-size:13px">Abrir →</div>
                    </div>
                </div>
                ${periodos.length >= 2 ? `
                <div class="adm-home-chart-wrap">
                    <div class="adm-home-chart-title">Pacotes entregues por período — ${anoAtual}</div>
                    <canvas id="home-admin-chart"></canvas>
                </div>` : ""}
            `;

            if (periodos.length >= 2) {
                const transp = [
                    { key: "loggi",  label: "Loggi",  color: "#01b4f7" },
                    { key: "jt",     label: "J&T",    color: "#cc4138" },
                    { key: "imile",  label: "iMile",  color: "#6b80ff" },
                    { key: "anjun",  label: "Anjun",  color: "#009c21" },
                    { key: "shopee", label: "Shopee", color: "#ed4d2d" },
                ];
                const labels = periodos.map(p => `${p.quinzena}ª ${mesNomes[p.mes]}`);
                const ctx = document.getElementById("home-admin-chart").getContext("2d");
                new Chart(ctx, {
                    type: "bar",
                    data: {
                        labels,
                        datasets: transp.map(t => ({
                            label:           t.label,
                            data:            periodos.map(p => p[t.key]?.qtd || 0),
                            backgroundColor: t.color + "cc",
                            borderRadius:    4,
                        }))
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { labels: { color: "#94a3b8", font: { size: 11 }, boxWidth: 12 } }
                        },
                        scales: {
                            x: { stacked: true, ticks: { color: "#7a8599", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
                            y: { stacked: true, ticks: { color: "#7a8599", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.06)" } }
                        }
                    }
                });
            }
        }).catch(() => {});
    }).catch(() => {});
}

function carregarHomeNFStatus() {
    const widget = document.getElementById("home-nf-status");
    if (!widget) return;
    const tok = localStorage.getItem("token");
    const anoAtual = new Date().getFullYear();

    Promise.all([
        fetch(`${API}/historico?ano=${anoAtual}`, { headers: { "Authorization": "Bearer " + tok } }).then(r => r.json()),
        fetch(`${API}/minhas-notas`,               { headers: { "Authorization": "Bearer " + tok } }).then(r => r.json())
    ]).then(([historico, nfs]) => {
        if (!Array.isArray(historico) || !historico.length) return;
        const nfMap = {};
        (nfs || []).forEach(nf => { nfMap[`${nf.mes}_${nf.ano}_${nf.quinzena}`] = nf; });
        const periodos  = historico.filter(d => (d.total_receber_num || 0) > 0);
        const pendentes = periodos.filter(d => !nfMap[`${d.mes}_${anoAtual}_${d.quinzena}`]).length;

        if (pendentes === 0) {
            widget.innerHTML = `
                <div class="home-nf-widget ok">
                    <div class="home-nf-widget-icon ok">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:14px;font-weight:600;color:#22c55e">Notas Fiscais em dia</div>
                        <div style="font-size:12px;color:#64748b;margin-top:2px">Todos os períodos enviados</div>
                    </div>
                    <div style="font-size:11px;font-weight:700;color:#22c55e;white-space:nowrap">✓ OK</div>
                </div>`;
        } else {
            widget.innerHTML = `
                <div class="home-nf-widget pendente" onclick="abrirMinhasNFs()">
                    <div class="home-nf-widget-icon pendente">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:14px;font-weight:600;color:#fb923c">${pendentes} ${pendentes === 1 ? "nota pendente" : "notas pendentes"}</div>
                        <div style="font-size:12px;color:#64748b;margin-top:2px">Clique para ver os períodos em aberto</div>
                    </div>
                    <div style="font-size:12px;font-weight:700;color:#fb923c;white-space:nowrap">Ver →</div>
                </div>`;
        }
    }).catch(() => {});
}

// ───── ADMIN FECHAMENTOS ─────
let _admFMes = new Date().getMonth() + 1;
let _admFAno = new Date().getFullYear();
let _admFQuinzena = null;
let _admFEntregador = "";
let _admEntregadoresLista = [];
let _admNomeParaId = {}; // mapa nome → username

function moedaJS(n) {
    return "R$ " + (n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function abrirAdminFechamentos(event) {
    event.preventDefault();
    _admFQuinzena = null;
    _admFEntregador = "";
    _admEntregadoresLista = [];
    document.getElementById("adm-btn-1q").classList.remove("active");
    document.getElementById("adm-btn-2q").classList.remove("active");
    document.getElementById("adm-fech-empty").innerText = "Selecione o mês, ano e quinzena e clique em Buscar.";
    document.getElementById("adm-fech-empty").style.display = "";
    document.getElementById("adm-ent-section").style.display = "none";
    document.getElementById("adm-fech-data").style.display = "none";
    _iniciarSelectsAdmFech();
    mostrarTela("tela-admin-fechamentos");
}
