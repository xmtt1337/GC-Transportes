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
    if (!url) { gcAlert("Cole a URL da planilha."); return; }

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
    gcConfirm("Remover esta planilha?", () => {
        fetch(API + "/admin/planilhas/" + id, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token }
        }).then(() => _carregarPlanilhas());
    }, null, "Remover");
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
    if (role === "admin" || role === "dev") {
        defs.push({
            icon: `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
            title: "Desempenho",
            desc: "Ranking de bipagens por operador.",
            fn: "abrirDesempenhoBip(event)"
        });
        defs.push({
            icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
            title: "Usuários",
            desc: "Gerenciar entregadores e acessos.",
            fn: "abrirAdminUsuariosGC(event)"
        });
        defs.push({
            icon: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
            title: "Pesquisar Pedidos",
            desc: "Buscar histórico de bipagens.",
            fn: "abrirPesquisarPedidos(event)"
        });
        defs.push({
            icon: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
            title: "Extravios",
            desc: "Análise e histórico de extravios.",
            fn: "abrirExtraviosDash(event)"
        });
    }
    if (role === "user") {
        defs.push({
            icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
            title: "Usuários",
            desc: "Gerenciar entregadores e acessos.",
            fn: "abrirAdminUsuariosGC(event)"
        });
        defs.push({
            icon: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
            title: "Pesquisar Pedidos",
            desc: "Buscar histórico de bipagens.",
            fn: "abrirPesquisarPedidos(event)"
        });
    }

    if (role === "ADM Videira") {
        defs.push({
            icon: `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
            title: "Dashboard",
            desc: "Evolução por quinzena/mês e transportadoras.",
            fn: "abrirVideiraDash(event)"
        });
        defs.push({
            icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01"/>`,
            title: "Meu Fechamento",
            desc: "Veja o fechamento por cidade e transportadora.",
            fn: "abrirVideiraPainel(event)"
        });
        defs.push({
            icon: `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`,
            title: "Alimentar Fechamento",
            desc: "Informe o link do fechamento para o período.",
            fn: "abrirVideiraAlimentar(event)"
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

    if (role === "entregador")    carregarHomeNFStatus();
    if (role === "finance")       _carregarHomeAdmin(role);
    if (role === "dev")           _carregarHomeAdmin("admin");
    if (role === "admin")         _carregarHomeAdmin("admin");
    if (role === "user")          _carregarHomeUser();
    if (role === "ADM Videira")   _carregarHomeVideira();
}

function _carregarHomeUser() {
    const dash = document.getElementById("home-user-dash");
    if (!dash) return;
    const tok = localStorage.getItem("token");
    const mesNomes = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

    const iconScan = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`;
    const iconTarget = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3a86ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    const iconTrophy = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`;

    fetch(`${API}/bipagem/meu-desempenho`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(d => {
        if (d.error) return;

        const bottomHtml = d.pessoaAcima
            ? `<div class="user-desemp-bottom">
                <div class="user-desemp-gap-icon">${iconTarget}</div>
                <div class="user-desemp-gap-text">
                    Faltam <strong>${d.faltam.toLocaleString("pt-BR")}</strong> bipagem${d.faltam !== 1 ? "s" : ""}
                    para ultrapassar <em>${d.pessoaAcima.nome}</em>
                    <span style="color:#3a5a7a;font-size:11px"> · ${d.pessoaAcima.total.toLocaleString("pt-BR")} bip.</span>
                </div>
               </div>`
            : `<div class="user-desemp-first">
                <div class="user-desemp-first-icon">${iconTrophy}</div>
                <div class="user-desemp-first-text"><strong>Você está em 1°!</strong> Continue assim.</div>
               </div>`;

        dash.innerHTML = `
            <div class="user-desemp-widget">
                <div class="user-desemp-top">
                    <div class="user-desemp-eyebrow">
                        ${iconScan} Bipagens em ${mesNomes[d.mes]}
                    </div>
                    <div class="user-desemp-count-row">
                        <div class="user-desemp-count">${d.total.toLocaleString("pt-BR")}</div>
                        <div class="user-desemp-pos-block">
                            <div class="user-desemp-pos">${d.posicao}°</div>
                            <div class="user-desemp-pos-sub">de ${d.totalUsuarios} operadores</div>
                        </div>
                    </div>
                </div>
                ${bottomHtml}
            </div>`;
    })
    .catch(() => {});
}

function _carregarHomeAdmin(role) {
    const dash = document.getElementById("home-admin-dash");
    if (!dash) return;
    const tok = localStorage.getItem("token");
    const mesNomes = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    Promise.all([
        fetch(`${API}/admin/planilhas`,               { headers: { "Authorization": "Bearer " + tok } }).then(r => r.json()),
        fetch(`${API}/admin/usuarios?role=entregador`, { headers: { "Authorization": "Bearer " + tok } }).then(r => r.json()),
    ]).then(([planilhas, entregadores]) => {
        if (!Array.isArray(planilhas) || !planilhas.length) return;

        const ultimo = planilhas[0];
        const nEnt   = Array.isArray(entregadores) ? entregadores.filter(u => u.active !== false).length : "—";

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
                    ${role === "finance" ? `
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(34,197,94,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </div>
                        <div class="adm-home-card-label">Total a pagar</div>
                        <div class="adm-home-card-value" style="color:#22c55e">${totalPagar}</div>
                    </div>` : ""}
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(251,146,60,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.91 8.84L8.56 2.23a1 1 0 0 0-.97 0L2.05 5.11A1 1 0 0 0 2 6v12a1 1 0 0 0 .53.88l6.03 3.26a1 1 0 0 0 .94 0L21 15.34a1 1 0 0 0 .54-.88V9.7a1 1 0 0 0-.63-.86z"/><polyline points="7.9 4.5 12 6.86 16.1 4.5"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                        </div>
                        <div class="adm-home-card-label">Pacotes entregues</div>
                        <div class="adm-home-card-value" style="color:#fb923c">${totalPacotes}</div>
                    </div>
                    ${role === "finance" ? `
                    <div class="adm-home-card" onclick="abrirAdminFechamentos(event)" style="cursor:pointer">
                        <div class="adm-home-card-icon" style="background:rgba(167,139,250,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div class="adm-home-card-label">Ver fechamentos</div>
                        <div class="adm-home-card-value" style="color:#a78bfa;font-size:13px">Abrir →</div>
                    </div>` : ""}
                </div>
            `;

        }).catch(() => {});
    }).catch(() => {});
}

function _carregarHomeVideira() {
    const dash = document.getElementById("home-videira-dash");
    if (!dash) return;
    const tok = localStorage.getItem("token");
    const mesNomes = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    fetch(`${API}/videira/planilhas`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(planilhas => {
        if (!Array.isArray(planilhas) || !planilhas.length) return;
        const ultimo = planilhas[0];

        fetch(`${API}/videira/painel?mes=${ultimo.mes}&ano=${ultimo.ano}&quinzena=${ultimo.quinzena}`, {
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json()).then(data => {
            if (data.error) return;
            const periodoLabel = `${ultimo.quinzena}ª Qz · ${mesNomes[ultimo.mes]} ${ultimo.ano}`;

            dash.innerHTML = `
                <div class="adm-home-section-label">Último período: ${periodoLabel}</div>
                <div class="adm-home-cards">
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(34,197,94,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </div>
                        <div class="adm-home-card-label">Valor Líquido</div>
                        <div class="adm-home-card-value" style="color:#22c55e">${data.valor_total_liquido || "—"}</div>
                    </div>
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(58,134,255,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#3a86ff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20.91 8.84L8.56 2.23a1 1 0 0 0-.97 0L2.05 5.11A1 1 0 0 0 2 6v12a1 1 0 0 0 .53.88l6.03 3.26a1 1 0 0 0 .94 0L21 15.34a1 1 0 0 0 .54-.88V9.7a1 1 0 0 0-.63-.86z"/><polyline points="7.9 4.5 12 6.86 16.1 4.5"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                        </div>
                        <div class="adm-home-card-label">Total Pacotes</div>
                        <div class="adm-home-card-value" style="color:#3a86ff">${data.qtd_pacotes_total ? Number(data.qtd_pacotes_total).toLocaleString("pt-BR") : "—"}</div>
                    </div>
                    <div class="adm-home-card">
                        <div class="adm-home-card-icon" style="background:rgba(249,115,22,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                        </div>
                        <div class="adm-home-card-label">Coletas</div>
                        <div class="adm-home-card-value" style="color:#f97316">${data.qtd_coletas ? Number(data.qtd_coletas).toLocaleString("pt-BR") : "—"}</div>
                    </div>
                    <div class="adm-home-card" onclick="abrirVideiraPainel(event)" style="cursor:pointer">
                        <div class="adm-home-card-icon" style="background:rgba(167,139,250,0.1)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div class="adm-home-card-label">Ver Fechamento</div>
                        <div class="adm-home-card-value" style="color:#a78bfa;font-size:13px">Abrir →</div>
                    </div>
                </div>
            `;
        }).catch(() => {});
    })
    .catch(() => {});
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
        const periodos  = historico.filter(d => (d.total_receber_num || 0) > 0 && !d.ignora_nf);
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
