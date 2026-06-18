const API   = "https://sistema-backend-i4uh.onrender.com";
const token = localStorage.getItem("token");

if (!token) window.location.href = "login.html";


// Carrega perfil do usuário
fetch(API + "/perfil", {
    headers: { "Authorization": "Bearer " + token }
})
.then(res => { if (!res.ok) throw new Error(); return res.json(); })
.then(data => {
    const username = data.usuario.username;
    const name     = data.usuario.name;
    const displayName = name || username;
    const role = data.usuario.role;

    document.querySelector(".username").innerText = displayName;
    document.getElementById("welcome-name").innerText = displayName;

    if (role === "entregador") {
        document.getElementById("menu-operacao").style.display      = "none";
        document.getElementById("submenu-operacao").style.display      = "none";
        document.getElementById("menu-pedidos").style.display       = "none";
        document.getElementById("submenu-pedidos").style.display       = "none";
        document.getElementById("menu-fechamentos").style.display    = "";
        document.getElementById("submenu-fechamentos").style.display    = "";
        document.getElementById("menu-conferencias").style.display   = "none";
        document.getElementById("submenu-conferencias").style.display   = "none";
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
    }

    if (role === "admin") {
        document.getElementById("menu-adminmenu").style.display    = "";
        document.getElementById("submenu-adminmenu").style.display  = "";
        document.getElementById("menu-financeiro").style.display   = "";
        document.getElementById("submenu-financeiro").style.display = "";
        document.getElementById("menu-cadastros").style.display    = "";
        document.getElementById("submenu-cadastros").style.display  = "";
        document.getElementById("menu-dashboard").style.display    = "";
    }

    if (role === "ADM Videira") {
        document.getElementById("menu-operacao").style.display     = "none";
        document.getElementById("submenu-operacao").style.display  = "none";
        document.getElementById("menu-pedidos").style.display      = "none";
        document.getElementById("submenu-pedidos").style.display   = "none";
        document.getElementById("menu-conferencias").style.display = "none";
        document.getElementById("submenu-conferencias").style.display = "none";
        document.getElementById("menu-videira").style.display      = "";
        document.getElementById("submenu-videira").style.display   = "";
    }

    if (["admin", "dev"].includes(role)) {
        document.getElementById("menu-videira").style.display    = "";
        document.getElementById("submenu-videira").style.display = "";
    }

    renderHomeActions(role);
    const badge = document.getElementById("home-role-badge");
    if (badge) badge.innerText = role === "admin" ? "Administrador" : role === "entregador" ? "Entregador" : role === "ADM Videira" ? "ADM Videira" : "Operador";
})
.catch(() => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
});

// ───── SIDEBAR ─────
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const isExpanded = sidebar.classList.toggle("expanded");
    document.getElementById("sidebar-backdrop").classList.toggle("active", isExpanded);
    if (!isExpanded) {
        document.querySelectorAll(".submenu").forEach(m => m.classList.remove("open"));
        document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
    }
}

function fecharSidebar() {
    document.getElementById("sidebar").classList.remove("expanded");
    document.getElementById("sidebar-backdrop").classList.remove("active");
    document.querySelectorAll(".submenu").forEach(m => m.classList.remove("open"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
}

function irParaHome() {
    mostrarTela("tela-home");
    document.getElementById("titulo-pagina").innerText = "Painel";
    document.querySelectorAll(".submenu a").forEach(l => l.classList.remove("active"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
    document.querySelectorAll(".submenu").forEach(m => m.classList.remove("open"));
}

function toggleSubGroup(el) {
    const sub   = el.nextElementSibling;
    const isOpen = sub.classList.contains("open");
    // Fecha outros subgroups do mesmo pai
    el.parentElement.querySelectorAll(".subgroup-header").forEach(h => h.classList.remove("open"));
    el.parentElement.querySelectorAll(".sub-submenu").forEach(s => s.classList.remove("open"));
    if (!isOpen) {
        sub.classList.add("open");
        el.classList.add("open");
    }
}

function toggleMenu(element) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar.classList.contains("expanded")) {
        sidebar.classList.add("expanded");
        document.getElementById("sidebar-backdrop").classList.add("active");
    }

    const allMenuItems = document.querySelectorAll(".menu-item");
    const allSubmenus  = document.querySelectorAll(".submenu");
    const submenu = element.nextElementSibling;
    const isOpen  = submenu.classList.contains("open");

    allMenuItems.forEach(i => i.classList.remove("active", "open"));
    allSubmenus.forEach(m  => m.classList.remove("open"));

    if (!isOpen) {
        submenu.classList.add("open");
        element.classList.add("open", "active");
    }
}

// ───── NAVEGAÇÃO ENTRE TELAS ─────
function mostrarTela(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
    document.getElementById(id).classList.add("active-view");
    // Sempre fecha/recolhe a sidebar ao navegar
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.remove("expanded");
    document.getElementById("sidebar-backdrop").classList.remove("active");
    document.querySelectorAll(".submenu").forEach(m => m.classList.remove("open"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
}


function _emBreve(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-em-breve");
}


// ───── EXTRAVIOS CARDS ─────
function _renderExtravios(lista, containerId, showWa) {
    const el = document.getElementById(containerId);
    if (!lista.length) {
        el.innerHTML = `<div class="extr-vazio">Nenhum extravio no período</div>`;
        return;
    }
    el.innerHTML = lista.map(e => {
        const wa = showWa ? (() => {
            const msg = encodeURIComponent(`Olá! Eu gostaria de contestar um pedido da ${e.transportadora}.\nCódigo: ${e.codigo}`);
            return `<a class="extr-wa" href="https://wa.me/554991984179?text=${msg}" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                Contestar
            </a>`;
        })() : "";
        return `<div class="extr-card">
            <div class="extr-top">
                <span class="extr-transp">${e.transportadora}</span>
                <span class="extr-codigo">${e.codigo}</span>
            </div>
            <div class="extr-endereco">${e.endereco}</div>
            <div class="extr-bottom">
                <span class="extr-valor${e.tem_valor ? ' val-neg' : ''}">${e.valor}</span>
                ${wa}
            </div>
        </div>`;
    }).join("");
}

// ───── TELA FECHAMENTOS ─────
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

let _fMes           = new Date().getMonth() + 1;
let _fAno           = new Date().getFullYear();
let _fQuinzena      = null;
let _fTotalReceber  = 0;

function abrirFechamentos(event) {
    if (event) event.preventDefault();
    _fQuinzena = null;
    document.querySelectorAll(".quinzena-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("fechamento-empty").innerText = "Selecione uma quinzena para ver o fechamento.";
    document.getElementById("fechamento-empty").style.display = "";
    document.getElementById("fechamento-data").style.display  = "none";
    _iniciarSelects();
    mostrarTela("tela-fechamentos");
}

function _iniciarSelects() {
    const selMes = document.getElementById("sel-mes");
    const selAno = document.getElementById("sel-ano");
    selMes.value = _fMes;
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _fAno) opt.selected = true;
        selAno.appendChild(opt);
    }
}

function filtrarPeriodo() {
    _fMes      = parseInt(document.getElementById("sel-mes").value);
    _fAno      = parseInt(document.getElementById("sel-ano").value);
    _fQuinzena = null;
    document.querySelectorAll(".quinzena-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("fechamento-empty").innerText = "Selecione uma quinzena para ver o fechamento.";
    document.getElementById("fechamento-empty").style.display = "";
    document.getElementById("fechamento-data").style.display  = "none";
}

function selecionarQuinzena(q) {
    _fQuinzena = q;
    document.getElementById("btn-1q").classList.toggle("active", q === 1);
    document.getElementById("btn-2q").classList.toggle("active", q === 2);
    _carregarPainel();
}

function _carregarPainel() {
    const empty = document.getElementById("fechamento-empty");
    const data  = document.getElementById("fechamento-data");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    data.style.display  = "none";

    fetch(`${API}/painel?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json().then(body => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            empty.innerText = body.error || "Nenhum fechamento encontrado para este período.";
            return;
        }
        const d = body;

        _fTotalReceber = d.total_receber_num || 0;

        // Banner
        const banner = document.getElementById("pb-banner");
        banner.className = "painel-banner " + (d.total_receber_num < 0 ? "banner-negativo" : "banner-positivo");
        document.getElementById("pb-total-receber").innerText   = d.total_receber;
        document.getElementById("pb-total-entregues").innerText = d.total_entregues;

        // Ajustes
        document.getElementById("paj-adicional").innerText    = d.adicional;
        document.getElementById("paj-adicional-card").className = "paj-card " + (_parseMoeda(d.adicional) < 0 ? "negativo" : "positivo");
        document.getElementById("paj-deslocamento").innerText = d.deslocamento;
        document.getElementById("paj-grandes").innerText      = d.valor_grandes;
        document.getElementById("paj-descontos").innerText    = d.descontos;
        document.getElementById("paj-ticket").innerText       = d.desconto_ticket;

        // Transportadoras
        document.getElementById("pt-loggi-v").innerText  = d.valor_loggi;
        document.getElementById("pt-loggi-q").innerText  = d.entregues_loggi + " pacotes";
        document.getElementById("pt-jt-v").innerText     = d.valor_jt;
        document.getElementById("pt-jt-q").innerText     = d.entregues_jt + " pacotes";
        document.getElementById("pt-imile-v").innerText  = d.valor_imile;
        document.getElementById("pt-imile-q").innerText  = d.qtd_imile + " pacotes";
        document.getElementById("pt-anjun-v").innerText  = d.valor_anjun;
        document.getElementById("pt-anjun-q").innerText  = d.entregues_anjun + " pacotes";
        document.getElementById("pt-shopee-v").innerText = d.valor_shopee;
        document.getElementById("pt-shopee-q").innerText = d.entregues_shopee + " pacotes";

        // Extravios
        _renderExtravios(d.extravios_linhas, "extravios-lista", true);

        // Multas
        const multTbody = document.getElementById("multas-tbody");
        multTbody.innerHTML = d.multas_linhas.length
            ? d.multas_linhas.map(m => `<tr>
                <td class="mono">${m.transportadora}</td>
                <td class="mono">${m.codigo}</td>
                <td class="${m.tem_valor ? 'val-neg' : ''}">${m.valor}</td>
              </tr>`).join("")
            : `<tr><td colspan="3" class="poc-empty">Nenhuma multa no período</td></tr>`;

        empty.style.display = "none";
        data.style.display  = "";
        _carregarNota();
    })
    .catch(() => {
        empty.innerText = "Erro ao conectar com o servidor.";
    });
}

// ───── NAVEGAÇÃO RÁPIDA: CHIP → FECHAMENTO ─────
function irParaFechamentoPeriodo(mes, ano, quinzena) {
    _fMes = mes;
    _fAno = ano;
    _iniciarSelects();
    document.getElementById("sel-mes").value = mes;
    document.getElementById("fechamento-data").style.display = "none";

    if (quinzena) {
        _fQuinzena = quinzena;
        document.getElementById("btn-1q").classList.toggle("active", quinzena === 1);
        document.getElementById("btn-2q").classList.toggle("active", quinzena === 2);
        document.getElementById("fechamento-empty").style.display = "none";
        mostrarTela("tela-fechamentos");
        _carregarPainel();
    } else {
        _fQuinzena = null;
        document.getElementById("btn-1q").classList.remove("active");
        document.getElementById("btn-2q").classList.remove("active");
        document.getElementById("fechamento-empty").innerText = "Selecione uma quinzena para ver o fechamento.";
        document.getElementById("fechamento-empty").style.display = "";
        mostrarTela("tela-fechamentos");
    }
}

function irParaAdminFechamentoPeriodo(mes, ano, quinzena) {
    _admFMes = mes;
    _admFAno = ano;
    _admFQuinzena = quinzena || null;
    _admFEntregador = "";
    _admEntregadoresLista = [];
    _iniciarSelectsAdmFech();
    document.getElementById("adm-fech-mes").value = mes;
    document.getElementById("adm-fech-data").style.display = "none";
    document.getElementById("adm-search-input").value = "";
    document.getElementById("adm-search-input-area").style.display = "";
    document.getElementById("adm-selected-chip").style.display = "none";
    document.getElementById("adm-dropdown").style.display = "none";
    document.getElementById("adm-ent-section").style.display = "none";

    if (quinzena) {
        document.getElementById("adm-btn-1q").classList.toggle("active", quinzena === 1);
        document.getElementById("adm-btn-2q").classList.toggle("active", quinzena === 2);
    } else {
        document.getElementById("adm-btn-1q").classList.remove("active");
        document.getElementById("adm-btn-2q").classList.remove("active");
    }

    mostrarTela("tela-admin-fechamentos");

    if (quinzena) {
        buscarQuinzenaAdmin();
    } else {
        document.getElementById("adm-fech-empty").innerText = "Selecione a quinzena para ver os entregadores.";
        document.getElementById("adm-fech-empty").style.display = "";
    }
}

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

// ───── TELA CONFERÊNCIA NF ─────
let _confNFMes           = new Date().getMonth() + 1;
let _confNFAno           = new Date().getFullYear();
let _confNFQuinzena      = null;
let _confNFFiltrarPend   = false;
let _confNFTodosRows     = [];

function _toggleFiltroConf() {
    _confNFFiltrarPend = !_confNFFiltrarPend;
    const btn = document.getElementById("conf-nf-filtro-btn");
    if (_confNFFiltrarPend) {
        btn.style.background = "rgba(251,146,60,0.15)";
        btn.textContent = "Ver todos";
    } else {
        btn.style.background = "transparent";
        btn.textContent = "Ver apenas pendentes";
    }
    _renderConfNFTabela(_confNFFiltrarPend ? _confNFTodosRows.filter(r => !r.emitiu_nf) : _confNFTodosRows);
}

function abrirConfNFs(event) {
    if (event) event.preventDefault();
    _confNFQuinzena = null;
    document.getElementById("conf-nf-btn-1q").classList.remove("active");
    document.getElementById("conf-nf-btn-2q").classList.remove("active");
    document.getElementById("conf-nf-empty").innerText = "Selecione o período para conferir as notas fiscais.";
    document.getElementById("conf-nf-empty").style.display = "";
    document.getElementById("conf-nf-resultado").style.display = "none";
    _iniciarSelectsConfNF();
    mostrarTela("tela-conf-nfs");
}

function selecionarQuinzenaConf(q) {
    _confNFQuinzena = q;
    document.getElementById("conf-nf-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("conf-nf-btn-2q").classList.toggle("active", q === 2);
    buscarConfNFs();
}

function buscarConfNFs() {
    if (!_confNFQuinzena) {
        document.getElementById("conf-nf-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("conf-nf-empty").style.display = "";
        return;
    }
    const mes      = document.getElementById("conf-nf-mes").value;
    const ano      = document.getElementById("conf-nf-ano").value;
    const empty    = document.getElementById("conf-nf-empty");
    const resultado = document.getElementById("conf-nf-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/admin/conferencia?mes=${mes}&ano=${ano}&quinzena=${_confNFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(rows => {
        if (rows.error) { empty.innerText = rows.error; return; }
        if (!rows.length) { empty.innerText = "Nenhum entregador encontrado para este período."; return; }
        empty.style.display = "none";
        resultado.style.display = "";
        _confNFTodosRows = rows;
        _confNFFiltrarPend = false;
        const btn = document.getElementById("conf-nf-filtro-btn");
        if (btn) { btn.style.background = "transparent"; btn.textContent = "Ver apenas pendentes"; }
        const total    = rows.length;
        const emitidas = rows.filter(r => r.emitiu_nf).length;
        const pendentes = total - emitidas;
        const confere  = rows.filter(r => r.status === "confere").length;
        document.getElementById("conf-nf-counter").innerHTML =
            `${total} entregadores &nbsp;·&nbsp; <span style="color:#22c55e">${emitidas} enviaram NF</span> &nbsp;·&nbsp; <span style="color:#fb923c">${pendentes} pendentes</span> &nbsp;·&nbsp; <span style="color:#22c55e">${confere} conferem</span>`;
        _renderConfNFTabela(rows);
    })
    .catch(() => { empty.innerText = "Erro ao carregar dados."; });
}

function _renderConfNFTabela(rows) {
    const MESES_CONF = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const quinzenaLabel = `${_confNFQuinzena}ª quinzena de ${MESES_CONF[parseInt(document.getElementById("conf-nf-mes").value)]}/${document.getElementById("conf-nf-ano").value}`;
    document.getElementById("conf-nf-tbody").innerHTML = rows.map(r => {
        let emitBadge, confBadge;
        if (!r.emitiu_nf) {
            emitBadge = `<span class="adm-nf-badge pendente">Não enviou</span>`;
            confBadge = `<span class="adm-nf-badge pendente">—</span>`;
        } else {
            emitBadge = `<span class="adm-nf-badge confere">✓ Enviou</span>`;
            if (r.status === "confere")
                confBadge = `<span class="adm-nf-badge confere">✓ Confere</span>`;
            else if (r.status === "diverge")
                confBadge = `<span class="adm-nf-badge diverge">⚠ Diverge</span>`;
            else
                confBadge = `<span class="adm-nf-badge pendente">—</span>`;
        }
        let waBtn = "";
        if (!r.emitiu_nf) {
            const phone = (r.telefone || "").replace(/\D/g, "");
            const primeiroNome = r.nome.split(" ")[0];
            const msg = encodeURIComponent(`Olá, ${primeiroNome}! Tudo bem?\nPassando para informar que a NFS-e referente à ${quinzenaLabel} ainda não foi anexada no sistema.\nPor favor, acesse o sistema e realize o envio o quanto antes para que possamos efetuar o pagamento normalmente.\nQualquer dúvida, estamos à disposição. Obrigado!`);
            if (phone) {
                waBtn = `<a class="extr-wa" href="https://wa.me/55${phone}?text=${msg}" target="_blank" rel="noopener noreferrer">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884"/></svg>
                    WhatsApp
                </a>`;
            } else {
                waBtn = `<span class="extr-wa" style="opacity:0.35;cursor:default" title="Sem telefone na planilha TERCEIRIZADOS">Sem telefone</span>`;
            }
        }
        return `<tr>
            <td class="adm-nf-entregador">${r.nome}</td>
            <td class="adm-nf-valor">${r.total_receber || "—"}</td>
            <td>${emitBadge}</td>
            <td>${r.valor_nf || "—"}</td>
            <td>${confBadge}</td>
            <td>${waBtn}</td>
        </tr>`;
    }).join("");
}

function _iniciarSelectsConfNF() {
    const selAno = document.getElementById("conf-nf-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _confNFAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("conf-nf-mes").value = _confNFMes;
}

// ───── TELA IMPORTAR TRAMPAY ─────
let _trampayRows = [];

function abrirImportarTrampay(event) {
    if (event) event.preventDefault();
    _trampayRows = [];
    document.getElementById("trampay-file-input").value = "";
    document.getElementById("trampay-resultado").style.display = "none";
    document.getElementById("trampay-sucesso").style.display   = "none";
    document.getElementById("trampay-importar-btn").style.display = "none";
    document.getElementById("trampay-upload-area").style.display  = "";
    mostrarTela("tela-trampay-importar");
}

function _lerCsvTrampay(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const text = e.target.result;
        const linhas = text.split(/\r?\n/).filter(l => l.trim());
        if (linhas.length < 2) { alert("CSV vazio ou inválido."); return; }

        // Detectar separador (tab ou vírgula)
        const sep = linhas[0].includes("\t") ? "\t" : ",";
        const cab = linhas[0].split(sep).map(c => c.trim().toLowerCase()
            .replace(/[_\s]/g, "_")
            .normalize("NFD").replace(/[̀-ͯ]/g, ""));

        const idx = k => cab.findIndex(c => c.includes(k));
        const iNome  = idx("nome");
        const iDoc   = idx("doc");
        const iExt   = idx("externo") >= 0 ? idx("externo") : idx("id");
        const iPix   = idx("chave");
        const iTipo  = idx("tipo");
        const iData  = idx("data");

        _trampayRows = linhas.slice(1).map(l => {
            const cols = l.split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
            return {
                nome:          iNome  >= 0 ? cols[iNome]  : "",
                documento:     iDoc   >= 0 ? cols[iDoc]   : "",
                id_externo:    iExt   >= 0 ? cols[iExt]   : "",
                chave_pix:     iPix   >= 0 ? cols[iPix]   : "",
                chave_pix_tipo:iTipo  >= 0 ? cols[iTipo]  : "",
                data_criacao:  iData  >= 0 ? cols[iData]  : "",
            };
        }).filter(r => r.nome);

        document.getElementById("trampay-counter").textContent =
            `${_trampayRows.length} entregadores encontrados no CSV`;

        document.getElementById("trampay-tbody").innerHTML = _trampayRows.map(r => `
            <tr>
                <td class="t-nome">${r.nome}</td>
                <td class="t-doc">${r.documento || "—"}</td>
                <td class="t-doc">${r.id_externo || "—"}</td>
                <td class="t-pix">${r.chave_pix || "—"}</td>
                <td>${r.chave_pix_tipo ? `<span class="pag-pix-badge">${r.chave_pix_tipo}</span>` : "—"}</td>
                <td style="font-size:12px;color:#64748b">${r.data_criacao || "—"}</td>
            </tr>
        `).join("");

        document.getElementById("trampay-upload-area").style.display  = "none";
        document.getElementById("trampay-resultado").style.display     = "";
        document.getElementById("trampay-importar-btn").style.display  = "";
    };
    reader.readAsText(file, "UTF-8");
}

async function _confirmarImportTrampay() {
    if (!_trampayRows.length) return;
    const btn = document.getElementById("trampay-importar-btn");
    btn.disabled = true;
    btn.textContent = "Importando...";
    const tok = localStorage.getItem("token");

    try {
        const res  = await fetch(`${API}/admin/trampay/importar`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ entregadores: _trampayRows })
        });
        const data = await res.json();
        if (data.error) { alert(data.error); btn.disabled = false; btn.textContent = "Importar dados"; return; }
        const partes = [];
        if (data.atualizados) partes.push(`${data.atualizados} atualizados`);
        if (data.novos)       partes.push(`${data.novos} novos`);
        document.getElementById("trampay-sucesso-txt").textContent =
            (partes.length ? partes.join(", ") : "Nenhuma alteração") + " — importação concluída!";
        document.getElementById("trampay-resultado").style.display = "none";
        document.getElementById("trampay-importar-btn").style.display = "none";
        document.getElementById("trampay-sucesso").style.display = "";
        document.getElementById("trampay-file-input").value = "";
        _carregarEntregadoresTrampay();
    } catch {
        alert("Erro ao conectar com o servidor.");
        btn.disabled = false;
        btn.textContent = "Importar dados";
    }
}

// ───── TELA ENTREGADORES TRAMPAY ─────
function abrirEntregadoresTrampay(event) {
    if (event) event.preventDefault();
    _trampayRows = [];
    document.getElementById("trampay-file-input").value = "";
    document.getElementById("trampay-resultado").style.display  = "none";
    document.getElementById("trampay-sucesso").style.display    = "none";
    document.getElementById("trampay-importar-btn").style.display = "none";
    mostrarTela("tela-trampay-entregadores");
    _carregarEntregadoresTrampay();
}

function _carregarEntregadoresTrampay() {
    const tok = localStorage.getItem("token");
    const empty = document.getElementById("trampay-ent-empty");
    const res   = document.getElementById("trampay-ent-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/trampay/entregadores`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(data => {
        if (!Array.isArray(data) || !data.length) {
            empty.innerText = "Nenhum entregador com dados Trampay.";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        const lastImport = data[0]?.last_import
            ? new Date(data[0].last_import).toLocaleString("pt-BR")
            : null;
        document.getElementById("trampay-ent-counter").innerHTML =
            `${data.length} entregador${data.length !== 1 ? "es" : ""} cadastrado${data.length !== 1 ? "s" : ""}` +
            (lastImport ? ` &nbsp;·&nbsp; <span style="color:#4a6a8a">Último import: ${lastImport}</span>` : "");
        document.getElementById("trampay-ent-tbody").innerHTML = data.map(u => `
            <tr>
                <td class="adm-nf-entregador">${u.nome || "—"}</td>
                <td class="adm-nf-cnpj">${u.documento || "—"}</td>
                <td class="adm-nf-cnpj">${u.id_externo || "—"}</td>
                <td class="pag-pix">${u.chave_pix || "—"}</td>
                <td>${u.chave_pix ? `<span class="pag-pix-badge">${u.tipo_pix || "—"}</span>` : "—"}</td>
                <td style="font-size:12px;color:#64748b">${u.data_criacao || "—"}</td>
            </tr>
        `).join("");
    }).catch(() => { empty.innerText = "Erro ao carregar entregadores Trampay."; });
}

// ───── TELA ADMIN USUÁRIOS ─────
function abrirAdminUsuarios(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-admin-usuarios");
    _carregarUsuarios();
}

function _carregarUsuarios() {
    const tok = localStorage.getItem("token");
    const empty = document.getElementById("adm-usr-empty");
    const res   = document.getElementById("adm-usr-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/usuarios?role=entregador`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(users => {
        if (!Array.isArray(users) || !users.length) {
            empty.innerText = "Nenhum entregador cadastrado.";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        document.getElementById("adm-usr-tbody").innerHTML = users.map(u => `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div class="adm-usr-avatar">${(u.name || u.username).slice(0, 2).toUpperCase()}</div>
                        <div>
                            <div style="font-weight:600;color:#e2e8f0">${u.name || "—"}</div>
                            <div style="font-size:11px;color:#4a6a8a;margin-top:2px">${u.username}</div>
                        </div>
                    </div>
                </td>
                <td><span class="adm-usr-badge ${u.active ? 'ativo' : 'inativo'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button class="adm-usr-action ${u.active ? 'inativar' : 'ativar'}" onclick="_toggleAtivoUsuario(${u.id},${!u.active})">${u.active ? 'Inativar' : 'Ativar'}</button>
                        <button class="adm-usr-action senha" onclick="_resetarSenha(${u.id},'${u.username.replace(/'/g,"\\'")}')">Resetar Senha</button>
                        <button class="adm-usr-action deletar" onclick="_deletarUsuario(${u.id},'${u.username.replace(/'/g,"\\'")}')">Deletar</button>
                    </div>
                </td>
            </tr>
        `).join("");
    }).catch(() => { empty.innerText = "Erro ao carregar entregadores."; });
}

function _abrirModal(id) {
    document.getElementById(id).classList.add("open");
}
function _fecharModal(id) {
    document.getElementById(id).classList.remove("open");
}
function _fecharModalSeBackdrop(event, id) {
    if (event.target === document.getElementById(id)) _fecharModal(id);
}

function _abrirModalNovoEntregador() {
    document.getElementById("mne-nome").value      = "";
    document.getElementById("mne-senha").value     = "";
    document.getElementById("mne-telefone").value  = "";
    document.getElementById("mne-erro").innerText  = "";
    document.getElementById("mne-form").style.display    = "";
    document.getElementById("mne-sucesso").style.display = "none";
    _abrirModal("modal-novo-entregador");
    setTimeout(() => document.getElementById("mne-nome").focus(), 80);
}

function _salvarNovoEntregador() {
    const tok      = localStorage.getItem("token");
    const name     = document.getElementById("mne-nome").value.trim();
    const password = document.getElementById("mne-senha").value.trim();
    const telefone = document.getElementById("mne-telefone").value.trim();
    const erro     = document.getElementById("mne-erro");
    const btn      = document.getElementById("mne-btn-salvar");
    erro.innerText = "";
    if (!name) { erro.innerText = "Informe o nome do entregador."; return; }
    btn.disabled   = true;
    btn.textContent = "Cadastrando...";

    fetch(`${API}/admin/usuarios`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, role: "entregador", telefone })
    }).then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        if (data.error) { erro.innerText = data.error; return; }
        document.getElementById("mne-id-gerado").innerText = data.username;
        document.getElementById("mne-copiado").innerText   = "";
        document.getElementById("mne-form").style.display    = "none";
        document.getElementById("mne-sucesso").style.display = "";
        _carregarUsuarios();
    }).catch(() => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        erro.innerText = "Erro ao cadastrar entregador.";
    });
}

function _copiarID() {
    const id = document.getElementById("mne-id-gerado").innerText;
    navigator.clipboard.writeText(id).then(() => {
        document.getElementById("mne-copiado").innerText = "✓ Copiado!";
        setTimeout(() => { document.getElementById("mne-copiado").innerText = ""; }, 2000);
    });
}

function _resetarTodasSenhas() {
    if (!confirm("Resetar a senha de TODOS os entregadores para a senha padrão?\n\nEsta ação não pode ser desfeita.")) return;
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/reset-todas-senhas`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        alert(`Senhas resetadas com sucesso para ${data.total || "todos os"} entregadores.`);
    }).catch(() => alert("Erro ao resetar senhas."));
}

function _resetarSenha(id, username) {
    if (!confirm(`Resetar a senha de "${username}" para a senha padrão?`)) return;
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}/reset-senha`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
    .then(data => { if (data.error) alert(data.error); })
    .catch(() => alert("Erro ao resetar senha."));
}

function _toggleAtivoUsuario(id, active) {
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ active })
    }).then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        _carregarUsuarios();
    }).catch(() => alert("Erro ao atualizar usuário."));
}

function _deletarUsuario(id, username) {
    if (!confirm(`Deletar o usuário "${username}"?\nEsta ação não pode ser desfeita.`)) return;
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        _carregarUsuarios();
    }).catch(() => alert("Erro ao deletar usuário."));
}

// ───── TELA ADMIN PAGAMENTOS ─────
let _pagMes      = new Date().getMonth() + 1;
let _pagAno      = new Date().getFullYear();
let _pagQuinzena = null;

function abrirAdminPagamentos(event) {
    if (event) event.preventDefault();
    _pagQuinzena = null;
    document.getElementById("pag-btn-1q").classList.remove("active");
    document.getElementById("pag-btn-2q").classList.remove("active");
    document.getElementById("pag-empty").innerText = "Selecione o mês, ano e quinzena para ver os pagamentos.";
    document.getElementById("pag-empty").style.display = "";
    document.getElementById("pag-resultado").style.display = "none";
    _iniciarSelectsPag();
    mostrarTela("tela-admin-pagamentos");
}

function _iniciarSelectsPag() {
    const selAno   = document.getElementById("pag-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _pagAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("pag-mes").value = _pagMes;
}

function selecionarQuinzenaPag(q) {
    _pagQuinzena = q;
    document.getElementById("pag-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("pag-btn-2q").classList.toggle("active", q === 2);
    buscarPagamentos();
}

function buscarPagamentos() {
    if (!_pagQuinzena) {
        document.getElementById("pag-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("pag-empty").style.display = "";
        return;
    }
    const mes = document.getElementById("pag-mes").value;
    const ano = document.getElementById("pag-ano").value;
    _pagMes = parseInt(mes); _pagAno = parseInt(ano);
    const empty    = document.getElementById("pag-empty");
    const resultado = document.getElementById("pag-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/admin/pagamentos?mes=${mes}&ano=${ano}&quinzena=${_pagQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(data => {
        if (data.error) { empty.innerText = data.error; return; }
        if (!data.length) { empty.innerText = "Nenhum entregador com valor neste período."; return; }
        empty.style.display = "none";
        resultado.style.display = "";

        const total = data.reduce((s, d) => s + (d.total_num || 0), 0);
        document.getElementById("pag-counter").innerHTML =
            `${data.length} entregadores &nbsp;·&nbsp; Total: <strong style="color:#22c55e">${moedaJS(total)}</strong>`;

        document.getElementById("pag-tbody").innerHTML = data.map(d => `
            <tr>
                <td class="adm-nf-entregador">${d.nome}</td>
                <td class="pag-valor">${d.total}</td>
                <td class="pag-doc">${d.documento || '<span class="pag-sem-cad">—</span>'}</td>
                <td class="pag-pix">${d.chave_pix || '<span class="pag-sem-cad">—</span>'}</td>
                <td>${d.tipo_pix ? `<span class="pag-pix-badge">${d.tipo_pix}</span>` : '<span class="pag-sem-cad">—</span>'}</td>
            </tr>
        `).join("");
    }).catch(() => { empty.innerText = "Erro ao carregar pagamentos."; });
}

function _baixarCsvPagamentos() {
    const mes      = document.getElementById("pag-mes").value;
    const ano      = document.getElementById("pag-ano").value;
    const quinzena = _pagQuinzena;
    if (!quinzena) return;
    const url = `${API}/admin/pagamentos/csv?mes=${mes}&ano=${ano}&quinzena=${quinzena}`;
    const a   = document.createElement("a");
    a.href    = url;
    a.setAttribute("download", `pagamentos_${mes}_${ano}_q${quinzena}.csv`);
    const headers = new Headers({ "Authorization": "Bearer " + token });
    fetch(url, { headers })
        .then(r => {
            if (!r.ok) return r.json().then(d => { alert(d.error || "Erro ao gerar CSV."); throw new Error(); });
            return r.blob();
        })
        .then(blob => {
            const link = document.createElement("a");
            link.href  = URL.createObjectURL(blob);
            link.download = `pagamentos_${mes}_${ano}_q${quinzena}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        })
        .catch(() => {});
}

function _exportarNFsXlsx() {
    if (!_admNFRows.length) return;
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const nomeMes = MESES[(_admNFMes || 1) - 1] || "";
    const ordQ    = _admNFQuinzena === 1 ? "1ª Quinzena" : "2ª Quinzena";

    const data = _admNFRows.map(nf => ({
        "Entregador":      nf.user_name || nf.username || "",
        "Status":          nf.status === "confere" ? "Confere" : nf.status === "diverge" ? "Diverge" : "Pendente",
        "Valor NF":        nf.valor || "",
        "Data Emissão":    nf.emissao || "",
        "CNPJ":            nf.cnpj || "",
        "Emissor":         nf.emissor || "",
        "Nº NF":           nf.numero_nf || "",
        "Chave de Acesso": nf.chave_acesso || "",
        "Tomador":         nf.tomador || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas Fiscais");
    XLSX.writeFile(wb, `notas_fiscais_${nomeMes}_${_admNFAno}_${ordQ.replace(" ","")}.xlsx`);
}

// ───── TELA ADMIN NOTAS FISCAIS ─────
let _admNFMes      = new Date().getMonth() + 1;
let _admNFAno      = new Date().getFullYear();
let _admNFQuinzena = null;
let _admNFRows     = [];

function abrirAdminNFs(event) {
    if (event) event.preventDefault();
    _admNFQuinzena = null;
    document.getElementById("adm-nf-btn-1q").classList.remove("active");
    document.getElementById("adm-nf-btn-2q").classList.remove("active");
    document.getElementById("adm-nf-empty").innerText = "Selecione o mês, ano e quinzena para ver as notas fiscais.";
    document.getElementById("adm-nf-empty").style.display = "";
    document.getElementById("adm-nf-resultado").style.display = "none";
    _iniciarSelectsAdmNF();
    mostrarTela("tela-admin-nfs");
}

function _iniciarSelectsAdmNF() {
    const selAno = document.getElementById("adm-nf-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        selAno.appendChild(opt);
    }
    selAno.value = _admNFAno;
    document.getElementById("adm-nf-mes").value = _admNFMes;
}

function selecionarQuinzenaNF(q) {
    _admNFQuinzena = q;
    document.getElementById("adm-nf-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("adm-nf-btn-2q").classList.toggle("active", q === 2);
    buscarNFsAdmin();
}

function buscarNFsAdmin() {
    if (!_admNFQuinzena) {
        document.getElementById("adm-nf-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("adm-nf-empty").style.display = "";
        return;
    }
    _admNFMes = parseInt(document.getElementById("adm-nf-mes").value);
    _admNFAno = parseInt(document.getElementById("adm-nf-ano").value);

    const empty     = document.getElementById("adm-nf-empty");
    const resultado = document.getElementById("adm-nf-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/admin/notas?mes=${_admNFMes}&ano=${_admNFAno}&quinzena=${_admNFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(rows => {
        if (!Array.isArray(rows) || !rows.length) {
            _admNFRows = [];
            empty.innerText = "Nenhuma nota fiscal encontrada para este período.";
            return;
        }
        _admNFRows = rows;
        empty.style.display = "none";
        resultado.style.display = "";

        // Total valor NFs
        const totalNF = rows.reduce((s, nf) => s + (_parseMoeda(nf.valor) || 0), 0);

        // Detectar chaves de acesso duplicadas
        const chaveCount = {};
        rows.forEach(nf => { if (nf.chave_acesso) chaveCount[nf.chave_acesso] = (chaveCount[nf.chave_acesso] || 0) + 1; });
        const nDup = rows.filter(nf => chaveCount[nf.chave_acesso] > 1).length;

        // Verificar tomador GC Transportes
        const _isGC = t => t && /gc.*transport/i.test(t);
        const nSemGC = rows.filter(nf => nf.tomador && !_isGC(nf.tomador)).length;

        let counter = `${rows.length} nota${rows.length > 1 ? "s" : ""} &nbsp;·&nbsp; Total: <strong style="color:#22c55e">${moedaJS(totalNF)}</strong>`;
        if (nDup)   counter += ` &nbsp;·&nbsp; <span style="color:#ef4444">⚠ ${nDup} chave(s) duplicada(s)</span>`;
        if (nSemGC) counter += ` &nbsp;·&nbsp; <span style="color:#ef4444">⚠ ${nSemGC} sem GC Transportes</span>`;
        document.getElementById("adm-nf-counter").innerHTML = counter;

        document.getElementById("adm-nf-tbody").innerHTML = rows.map(nf => {
            const badgeCls = nf.status === "confere" ? "confere" : nf.status === "diverge" ? "diverge" : "pendente";
            const badgeTxt = nf.status === "confere" ? "✓ Confere" : nf.status === "diverge" ? "⚠ Diverge" : "—";
            const numPart   = nf.numero_nf ? `<div style="color:#94a3b8;font-size:11px;margin-bottom:3px">Nº ${nf.numero_nf}</div>` : "";
            const chavePart = nf.chave_acesso
                ? `<div class="adm-nf-chave" style="font-family:monospace;font-size:10.5px;color:#64748b;word-break:break-all;line-height:1.5">${nf.chave_acesso}</div>`
                : `<span style="color:#475569">—</span>`;

            const isDup   = chaveCount[nf.chave_acesso] > 1;
            const notGC   = nf.tomador && !_isGC(nf.tomador);
            const rowErr  = isDup || notGC;
            const rowStyle = rowErr ? ' style="background:rgba(239,68,68,0.07);border-left:3px solid #ef4444"' : '';

            const alertas = [
                isDup ? `<span class="adm-nf-badge diverge" style="margin-top:4px;display:inline-block">Chave duplicada</span>` : "",
                notGC ? `<span class="adm-nf-badge diverge" style="margin-top:4px;display:inline-block" title="${nf.tomador}">Tomador ≠ GC</span>` : "",
            ].filter(Boolean).join(" ");

            return `<tr${rowStyle}>
                <td class="adm-nf-entregador">${nf.user_name || nf.username}${alertas ? `<div style="margin-top:4px">${alertas}</div>` : ""}</td>
                <td><span class="adm-nf-badge ${badgeCls}">${badgeTxt}</span></td>
                <td class="adm-nf-valor">${nf.valor || "—"}</td>
                <td>${nf.emissao || "—"}</td>
                <td class="adm-nf-cnpj">${nf.cnpj || "—"}</td>
                <td>${nf.emissor || "—"}</td>
                <td>${numPart}${chavePart}</td>
            </tr>`;
        }).join("");
    })
    .catch(() => {
        empty.innerText = "Erro ao carregar notas fiscais.";
    });
}

function _iniciarSelectsAdmFech() {
    const selAno = document.getElementById("adm-fech-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _admFAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("adm-fech-mes").value = _admFMes;
}

function selecionarQuinzenaAdmin(q) {
    _admFQuinzena = q;
    document.getElementById("adm-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("adm-btn-2q").classList.toggle("active", q === 2);
    buscarQuinzenaAdmin();
}

function buscarQuinzenaAdmin() {
    if (!_admFQuinzena) {
        document.getElementById("adm-fech-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("adm-fech-empty").style.display = "";
        return;
    }
    _admFMes = parseInt(document.getElementById("adm-fech-mes").value);
    _admFAno = parseInt(document.getElementById("adm-fech-ano").value);
    _admFEntregador = "";
    _admEntregadoresLista = [];
    document.getElementById("adm-ent-section").style.display = "none";
    document.getElementById("adm-fech-data").style.display = "none";

    const empty = document.getElementById("adm-fech-empty");
    empty.innerText = "Carregando...";
    empty.style.display = "";

    fetch(`${API}/admin/entregadores?mes=${_admFMes}&ano=${_admFAno}&quinzena=${_admFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        if (!ok) {
            empty.innerText = b.error || "Nenhum fechamento encontrado para este período.";
            return;
        }
        _admEntregadoresLista = b.entregadores;
        empty.style.display = "none";
        document.getElementById("adm-search-input").value = "";
        document.getElementById("adm-search-input-area").style.display = "";
        document.getElementById("adm-selected-chip").style.display = "none";
        document.getElementById("adm-fech-data").style.display = "none";
        // Resumo geral
        const totalGeral   = b.entregadores.reduce((s, e) => s + (e.total_receber_num || 0), 0);
        const _toInt = v => parseInt(String(v || 0).replace(/\./g, "")) || 0;
        const totalPacotes = b.entregadores.reduce((s, e) => s + _toInt(e.total_entregues), 0);
        document.getElementById("adm-ent-counter").textContent       = `${b.entregadores.length} entregadores`;
        document.getElementById("adm-ent-total-pacotes").textContent = `${totalPacotes.toLocaleString("pt-BR")} pacotes entregues`;
        document.getElementById("adm-ent-total-geral").textContent   = `Total: ${moedaJS(totalGeral)}`;
        document.getElementById("adm-ent-section").style.display = "";
        _renderEntregadoresGrid(b.entregadores);
    })
    .catch(() => {
        empty.innerText = "Erro ao conectar com o servidor.";
    });
}

const _TRANSP_CHIPS = [
    { key: "qtd_loggi",  label: "Loggi",  color: "#01b4f7" },
    { key: "qtd_jt",     label: "J&T",    color: "#cc4138" },
    { key: "qtd_imile",  label: "iMile",  color: "#6b80ff" },
    { key: "qtd_anjun",  label: "Anjun",  color: "#009c21" },
    { key: "qtd_shopee", label: "Shopee", color: "#ed4d2d" },
];

function _renderEntregadoresGrid(lista) {
    const grid = document.getElementById("adm-ent-grid");
    if (!lista.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:#4a6a8a;font-size:13px">Nenhum entregador encontrado</div>`;
        return;
    }
    grid.innerHTML = lista.map(e => {
        const nomeEsc = e.nome.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `<div class="adm-ent-card" onclick="selecionarEntregadorAdmin('${nomeEsc}')" data-nome="${nomeEsc}">
            <div class="adm-ent-card-nome" title="${e.nome}">${e.nome}</div>
            <div class="adm-ent-card-valor">${e.total_receber}</div>
            <div class="adm-ent-card-qtd">${parseInt(String(e.total_entregues || 0).replace(/\./g, "")) || 0} pacotes entregues</div>
        </div>`;
    }).join("");
}

function filtrarEntregadores() {
    const q = document.getElementById("adm-search-input").value.toLowerCase();
    _renderEntregadoresGrid(_admEntregadoresLista.filter(e => e.nome.toLowerCase().includes(q)));
}

function abrirDropdownEntregadores() {}

function selecionarEntregadorAdmin(nome) {
    _admFEntregador = nome;
    document.getElementById("adm-ent-section").style.display = "none";
    _carregarPainelAdmin();
}

function limparSelecaoEntregador() {
    _admFEntregador = "";
    document.getElementById("adm-fech-data").style.display = "none";
    document.getElementById("adm-fech-empty").style.display = "none";
    document.getElementById("adm-ent-section").style.display = "";
}

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
            .filter(d => (d.total_receber_num || 0) > 0)
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

// ───── NOTA FISCAL ─────
if (typeof pdfjsLib !== "undefined")
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function _mostrarUploadArea() {
    const area = document.getElementById("nota-upload-area");
    area.innerHTML = `
        <input type="file" id="nota-file-input" accept=".pdf" style="display:none" onchange="_processarNota(this)">
        <button class="nota-btn-upload" onclick="document.getElementById('nota-file-input').click()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            Anexar PDF
        </button>
        <p class="nota-hint">Extraímos automaticamente os dados da nota</p>`;
    area.style.display = "";
    document.getElementById("nota-card").style.display = "none";
}

function _carregarNota() {
    fetch(`${API}/nota?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.ok ? r.json() : null)
    .then(nota => nota ? _renderNotaCard(nota) : _mostrarUploadArea())
    .catch(() => _mostrarUploadArea());
}

function _renderNotaCard(nota) {
    document.getElementById("nota-upload-area").style.display = "none";
    document.getElementById("nota-card").style.display = "";
    document.getElementById("nota-numero").textContent  = nota.chave_acesso || nota.numero_nf || "—";
    document.getElementById("nota-emissao").textContent = nota.emissao      || "—";
    document.getElementById("nota-cnpj").textContent    = nota.cnpj         || "—";
    document.getElementById("nota-emissor").textContent = nota.emissor      || "—";
    document.getElementById("nota-valor").textContent   = nota.valor        || "—";
    document.getElementById("nota-tomador").textContent = nota.tomador      || "—";

    const statusEl = document.getElementById("nota-status");
    if (nota.valor && nota.valor !== "—" && _fTotalReceber) {
        const notaNum = _parseMoeda(nota.valor);
        const diff    = Math.abs(notaNum - _fTotalReceber);
        if (diff < 0.02) {
            statusEl.className   = "nota-status confere";
            statusEl.innerHTML   = `<span>✓</span> Valor confere com o fechamento (${moedaJS(_fTotalReceber)})`;
        } else {
            statusEl.className   = "nota-status diverge";
            statusEl.innerHTML   = `<span>⚠</span> Valor diverge — fechamento: ${moedaJS(_fTotalReceber)} · NF: ${moedaJS(notaNum)}`;
        }
        statusEl.style.display = "";
    } else {
        statusEl.style.display = "none";
    }
}

async function _removerNota() {
    await fetch(`${API}/nota?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    }).catch(() => {});
    _mostrarUploadArea();
}

async function _processarNota(input) {
    const file = input.files[0];
    if (!file) return;
    const area = document.getElementById("nota-upload-area");
    area.innerHTML = `<div class="nota-loading">Lendo PDF…</div>`;
    try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(it => it.str).join(" ") + "\n";
        }
        const nota             = _extrairCamposNota(text);
        const notaNum          = _parseMoeda(nota.valor);
        const valor_fechamento = _fTotalReceber || null;
        const status           = (valor_fechamento && notaNum > 0)
            ? (Math.abs(notaNum - valor_fechamento) < 0.02 ? "confere" : "diverge")
            : null;

        // Verificar se a chave de acesso já foi usada em outro período/entregador
        if (nota.chave_acesso) {
            const vRes  = await fetch(`${API}/nota/verificar?chave_acesso=${nota.chave_acesso}&mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
                headers: { "Authorization": "Bearer " + token }
            });
            const vData = await vRes.json();
            if (vData.duplicata) {
                _mostrarUploadArea();
                const hint = document.querySelector("#nota-upload-area .nota-hint");
                hint.style.color  = "#ef4444";
                hint.textContent  = `⚠ Esta nota já foi utilizada (${vData.detalhe}). Use uma nota diferente.`;
                return;
            }
        }

        await fetch(`${API}/nota`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ mes: _fMes, ano: _fAno, quinzena: _fQuinzena, ...nota, status, valor_fechamento })
        });
        _renderNotaCard(nota);
    } catch (e) {
        _mostrarUploadArea();
        document.querySelector("#nota-upload-area .nota-hint").textContent = "Erro ao ler o PDF. Tente novamente.";
        document.querySelector("#nota-upload-area .nota-hint").style.color = "#ef4444";
    }
}

function _extrairCamposNota(raw) {
    const t = raw.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();

    // ── CHAVE DE ACESSO / CÓDIGO ÚNICO ──
    let chave_acesso = null;

    // P1: 44 dígitos contínuos (NF-e, CT-e, NFS-e ABRASF sem espaçamento)
    const chaveM44 = t.match(/(?<!\d)(\d{44})(?!\d)/);
    if (chaveM44) chave_acesso = chaveM44[1];

    // P2: 44 dígitos em grupos de 4 separados por espaço (formato DANFE impresso)
    // ex: "3525 0466 8456 2200 0186 5500 1000 0000 4510 0000 0045"
    if (!chave_acesso) {
        const m4 = t.match(/(?<!\d)(\d{4}(?:\s+\d{4}){10})(?!\d)/);
        if (m4) chave_acesso = m4[1].replace(/\s+/g, "");
    }

    // P3: próximo ao label "Chave de Acesso" — captura qualquer sequência de dígitos/espaços
    if (!chave_acesso) {
        const mLabel = t.match(/[Cc]have\s+de\s+[Aa]cesso[^0-9]{0,40}([\d][\d\s]{42,56}[\d])/);
        if (mLabel) {
            const d = mLabel[1].replace(/\s/g, "");
            if (d.length >= 44) chave_acesso = d.slice(0, 44);
        }
    }

    // P4: qualquer grupo de dígitos-com-espaços que some exatamente 44 dígitos
    if (!chave_acesso) {
        const candidatos = t.match(/\d[\d ]{43,70}\d/g) || [];
        for (const c of candidatos) {
            const d = c.replace(/ /g, "");
            if (d.length === 44 && /^\d+$/.test(d)) { chave_acesso = d; break; }
        }
    }

    // Prioridade 2: código alfanumérico em diversas nomenclaturas municipais
    if (!chave_acesso) {
        const codPats = [
            // Explícito com Unicode (ç=ç, ã=ã, ó=ó)
            /C[oó]digo\s+de\s+verifica[çc][aã]o[:\s]+([A-Za-z0-9]{4,50})/i,
            // Fallback loose: qualquer coisa após "verifica" (cobre encodings alternativos)
            /C[oó]digo\s+de\s+verifica\S*\s+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+de\s+autenticidade[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+de\s+controle[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+verificador[:\s]+([A-Za-z0-9]{4,50})/i,
            /Chave\s+de\s+acesso[:\s]+([A-Za-z0-9]{8,60})/i,
            /Verifica\S*\s+de\s+autenticidade[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+NFS-?[eE][:\s]+([A-Za-z0-9]{4,50})/i,
        ];
        for (const p of codPats) {
            const m = t.match(p);
            if (m) { chave_acesso = m[1].trim(); break; }
        }
    }

    // ── NÚMERO DA NF ──
    const numNfM = t.match(/N[úu]mero\s+da\s+NFS?-?[eE][:\s]+(\d+)/i)
                || t.match(/N[úu]mero\s+d[ao]\s+[Nn]ota[:\s\s]+(\d+)/i)
                || t.match(/N[úu]mero\s+do\s+RPS[:\s]+(\d+)/i)
                || t.match(/NF-?[eE]\s+N[°ºo]?[:\s.]+(\d+)/i)
                || t.match(/Nota\s+Fiscal\s+N[°ºo]?[:\s.]+(\d+)/i);
    const numero_nf = numNfM ? numNfM[1] : null;

    // ── DATA DE EMISSÃO ──
    const dataLabelM = t.match(/emiss[aã]o[^0-9]{0,30}(\d{2}\/\d{2}\/\d{4})[^0-9]{0,5}(\d{2}:\d{2}(?::\d{2})?)?/i);
    const dataHoraM  = t.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    let emissao;
    if (dataLabelM) {
        emissao = dataLabelM[2] ? `${dataLabelM[1]} ${dataLabelM[2]}` : dataLabelM[1];
    } else if (dataHoraM) {
        emissao = `${dataHoraM[1]} ${dataHoraM[2]}`;
    } else {
        emissao = (t.match(/\d{2}\/\d{2}\/\d{4}/) || ["—"])[0];
    }

    // ── CNPJ ──
    // Usa regex estrita com pontuação (XX.XXX.XXX/XXXX-XX) para não casar
    // com a Chave de Acesso (44 dígitos sem pontuação) nem com CPF
    const cnpjAll = [];
    const cnpjFmtRe = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
    let mc;
    while ((mc = cnpjFmtRe.exec(t)) !== null) {
        cnpjAll.push({ raw: mc[0], idx: mc.index });
    }
    // Fallback: 14 dígitos isolados (não adjacentes a mais dígitos)
    if (!cnpjAll.length) {
        const re14 = /(?<!\d)\d{14}(?!\d)/g;
        while ((mc = re14.exec(t)) !== null) cnpjAll.push({ raw: mc[0], idx: mc.index });
    }
    // CNPJ do emitente: o que aparece antes de "TOMADOR" (ou o primeiro)
    const tomadorIdx = t.search(/TOMADOR/i);
    const cnpjEmit   = cnpjAll.find(c => tomadorIdx < 0 || c.idx < tomadorIdx) || cnpjAll[0];
    const cnpj       = cnpjEmit ? cnpjEmit.raw : "—";

    // ── VALOR ──
    const valorPatterns = [
        /Valor\s+L[ií]quido\s+da\s+NFS-?e[:\s]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+DOS\s+SERVI[CÇ]OS[^\d]*([\d.]+,\d{2})/i,
        /Valor\s+do\s+Servi[çc]o[:\s]*([\d.]+,\d{2})/i,
        /VALOR\s+L[IÍ]QUIDO[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+GERAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+A\s+PAGAR[^\d]*([\d.]+,\d{2})/i,
        /R\$\s*([\d.]+,\d{2})/,
    ];
    let valor = "—";
    for (const pat of valorPatterns) {
        const vm = t.match(pat);
        if (vm) { valor = `R$ ${vm[1]}`; break; }
    }

    // ── EMISSOR ──
    let emissor = "—";

    // DANFSe/NFS-e ABRASF: "EMITENTE DA NFS" → "Nome / Nome Empresarial"
    const emitSecM = t.match(/EMITENTE\s+DA\s+NFS.{0,5}(.{0,600}?)(?=TOMADOR|INTERMEDIÁRIO|SERVI[CÇ]O\s+PRESTADO)/i);
    if (emitSecM) {
        const sec   = emitSecM[1];
        const nomeM = sec.match(/Nome\s*[\/\|]\s*Nome\s+Empresarial\s+(.+?)(?=\s+E-mail|\s+Endere[çc]o|\s+Inscri)/i);
        if (nomeM) emissor = nomeM[1].trim().replace(/^\d{2}\.?\d{3}\.?\d{3}\s+/, "");
    }
    // NFS-e Prefeitura: "PRESTADOR DE SERVIÇOS" → "Nome/Razão social: NAME"
    if (emissor === "—") {
        const prestSecM = t.match(/PRESTADOR\s+DE\s+SERVI[CÇ]OS?(.{0,800}?)(?=TOMADOR)/i);
        if (prestSecM) {
            const sec   = prestSecM[1];
            const nomeM = sec.match(/Raz[aãâáÃÂÁ]o\s+social[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i);
            if (nomeM) emissor = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }
    // DANFE / NF-e: "RAZÃO SOCIAL" ou "NOME EMPRESARIAL"
    if (emissor === "—") {
        const razaoM = t.match(/(?:RAZ[AaãÃ]O\s+SOCIAL|NOME\s+EMPRESARIAL)[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|ENDERE[CÇ]O|INS|IE\b|\d{2}[.\/]))/i);
        if (razaoM) emissor = razaoM[1].trim();
    }
    // Fallback: texto antes do CNPJ do emitente
    if (emissor === "—" && cnpjEmit) {
        const before = t.slice(Math.max(0, cnpjEmit.idx - 100), cnpjEmit.idx);
        const nameM  = before.match(/([A-Za-záàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\wáàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ\s\-&.,'/]{4,70})\s*$/);
        if (nameM) emissor = nameM[1].trim();
    }

    // ── TOMADOR ──
    let tomador = "—";

    // DANFSe/NFS-e ABRASF: "TOMADOR DO SERVIÇO" → "Nome / Nome Empresarial"
    const tomSecM = t.match(/TOMADOR\s+DO\s+SERVI[CÇ]O(.{0,600}?)(?=INTERMEDIÁRIO|SERVI[CÇ]O\s+PRESTADO|TRIBUTAÇÃO|DISCRIMINA)/i);
    if (tomSecM) {
        const sec   = tomSecM[1];
        const nomeM = sec.match(/Nome\s*[\/\|]\s*Nome\s+Empresarial\s+(.+?)(?=\s+E-mail|\s+Endere[çc]o|\s+Inscri)/i);
        if (nomeM) tomador = nomeM[1].trim();
    }
    // NFS-e Prefeitura: "TOMADOR DE SERVIÇOS" → "Nome/Razão social: NAME"
    if (tomador === "—") {
        const tomServSecM = t.match(/TOMADOR\s+DE\s+SERVI[CÇ]OS?(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO)/i);
        if (tomServSecM) {
            const sec   = tomServSecM[1];
            const nomeM = sec.match(/Raz[aãâáÃÂÁ]o\s+social[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i);
            if (nomeM) tomador = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }
    // DANFE / NF-e genérica
    if (tomador === "—") {
        const tomLabelPatterns = [
            /DESTINAT[AÁ]RIO(?:[\/\s]REMETENTE)?[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
            /CONTRATANTE[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
        ];
        for (const pat of tomLabelPatterns) {
            const tm = t.match(pat);
            if (tm) { tomador = tm[1].trim(); break; }
        }
    }
    // Fallback: texto antes do segundo CNPJ (tomador)
    if (tomador === "—" && cnpjAll.length > 1) {
        const c2     = cnpjAll.find(c => c !== cnpjEmit) || cnpjAll[1];
        const before = t.slice(Math.max(0, c2.idx - 100), c2.idx);
        const nameM2 = before.match(/([A-Za-záàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\wáàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ\s\-&.,'/]{4,70})\s*$/);
        if (nameM2) tomador = nameM2[1].trim();
    }

    return { emissao, cnpj, emissor, valor, tomador, numero_nf, chave_acesso };
}

// ───── MODAL TELEFONE ─────
let _mtUserId = null;

function _abrirModalTelefone(id, nome, telefone) {
    _mtUserId = id;
    document.getElementById("mt-sub").textContent   = "WhatsApp de " + nome;
    document.getElementById("mt-telefone").value    = telefone || "";
    document.getElementById("mt-erro").textContent  = "";
    _abrirModal("modal-telefone");
    setTimeout(() => document.getElementById("mt-telefone").focus(), 80);
}

function _salvarTelefone() {
    const tok      = localStorage.getItem("token");
    const telefone = document.getElementById("mt-telefone").value.trim();
    const btn      = document.getElementById("mt-btn-salvar");
    const erro     = document.getElementById("mt-erro");
    erro.textContent = "";
    btn.disabled    = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/usuarios/${_mtUserId}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ telefone })
    }).then(r => r.json())
    .then(data => {
        btn.disabled    = false;
        btn.textContent = "Salvar";
        if (data.error) { erro.textContent = data.error; return; }
        _fecharModal("modal-telefone");
        _carregarUsuarios();
    }).catch(() => {
        btn.disabled    = false;
        btn.textContent = "Salvar";
        erro.textContent = "Erro ao salvar telefone.";
    });
}

function _carregarPainelAdmin() {
    const empty = document.getElementById("adm-fech-empty");
    const data  = document.getElementById("adm-fech-data");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    data.style.display = "none";

    fetch(`${API}/admin/painel?entregador=${encodeURIComponent(_admFEntregador)}&mes=${_admFMes}&ano=${_admFAno}&quinzena=${_admFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json().then(body => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            empty.innerText = body.error || "Nenhum fechamento encontrado para este período.";
            return;
        }
        const d = body;

        const banner = document.getElementById("adm-pb-banner");
        banner.className = "painel-banner " + (d.total_receber_num < 0 ? "banner-negativo" : "banner-positivo");
        document.getElementById("adm-pb-total-receber").innerText   = d.total_receber;
        document.getElementById("adm-pb-total-entregues").innerText = d.total_entregues;

        document.getElementById("adm-paj-adicional").innerText    = d.adicional;
        document.getElementById("adm-paj-adicional-card").className = "paj-card " + (_parseMoeda(d.adicional) < 0 ? "negativo" : "positivo");
        document.getElementById("adm-paj-deslocamento").innerText = d.deslocamento;
        document.getElementById("adm-paj-grandes").innerText      = d.valor_grandes;
        document.getElementById("adm-paj-descontos").innerText    = d.descontos;
        document.getElementById("adm-paj-ticket").innerText       = d.desconto_ticket;

        document.getElementById("adm-pt-loggi-v").innerText  = d.valor_loggi;
        document.getElementById("adm-pt-loggi-q").innerText  = d.entregues_loggi + " pacotes";
        document.getElementById("adm-pt-jt-v").innerText     = d.valor_jt;
        document.getElementById("adm-pt-jt-q").innerText     = d.entregues_jt + " pacotes";
        document.getElementById("adm-pt-imile-v").innerText  = d.valor_imile;
        document.getElementById("adm-pt-imile-q").innerText  = d.qtd_imile + " pacotes";
        document.getElementById("adm-pt-anjun-v").innerText  = d.valor_anjun;
        document.getElementById("adm-pt-anjun-q").innerText  = d.entregues_anjun + " pacotes";
        document.getElementById("adm-pt-shopee-v").innerText = d.valor_shopee;
        document.getElementById("adm-pt-shopee-q").innerText = d.entregues_shopee + " pacotes";

        _renderExtravios(d.extravios_linhas, "adm-extravios-lista");

        const multTbody = document.getElementById("adm-multas-tbody");
        multTbody.innerHTML = d.multas_linhas.length
            ? d.multas_linhas.map(m => `<tr>
                <td class="mono">${m.transportadora}</td>
                <td class="mono">${m.codigo}</td>
                <td class="${m.tem_valor ? 'val-neg' : ''}">${m.valor}</td>
              </tr>`).join("")
            : `<tr><td colspan="3" class="poc-empty">Nenhuma multa no período</td></tr>`;

        empty.style.display = "none";
        data.style.display  = "";
        data.scrollIntoView({ behavior: "smooth", block: "start" });
    })
    .catch(() => {
        empty.innerText = "Erro ao conectar com o servidor.";
    });
}
