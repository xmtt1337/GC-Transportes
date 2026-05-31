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
