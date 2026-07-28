const API   = "https://sistema-backend-i4uh.onrender.com";
const token = localStorage.getItem("token");

if (!token) window.location.href = "login.html";

fetch(API + "/perfil", { headers: { "Authorization": "Bearer " + token } })
.then(res => { if (!res.ok) throw new Error(); return res.json(); })
.then(data => {
    const username    = data.usuario.username;
    const name        = data.usuario.name;
    const displayName = name || username;
    const role        = data.usuario.role;

    window._gcUser = { name, username, displayName, role };
    document.querySelector(".username").innerText  = displayName;
    document.getElementById("welcome-name").innerText = displayName;

    if (role === "user") {
        const trigger = document.getElementById("username-trigger");
        if (trigger) {
            trigger.classList.add("perfil-trigger");
            trigger.onclick = (e) => abrirPerfilCard(e);
        }
    }

    const show = (id) => { const el = document.getElementById(id); if (el) el.style.display = ""; };
    const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; };

    // ── Menus comuns para roles com acesso operacional ──
    const _showOperacional = () => {
        show("menu-desempenho-bip");
    };
    const _showFechamentosAdmin = () => {
        show("menu-fechamento");
        show("submenu-fechamento");
    };
    const _showPlanejamento = () => {
        show("menu-planejamento");
        show("submenu-planejamento");
    };
    const _showFinanceiro = () => {
        show("menu-financeiro");
        show("submenu-financeiro");
    };
    const _showCadastros = () => {
        show("menu-cadastros");
        show("submenu-cadastros");
    };
    const _showExtravios = () => {
        show("menu-extravios");
        show("submenu-extravios");
    };
    const _showTorreControle = () => {
        show("menu-torrecontrole");
        show("submenu-torrecontrole");
    };

    if (role === "entregador") {
        hide("menu-operacao");
        hide("submenu-operacao");
        hide("menu-pedidos");
        hide("submenu-pedidos");
        hide("menu-conferencias");
        hide("submenu-conferencias");
        show("menu-fechamentos");
        show("submenu-fechamentos");
        show("menu-adiantamentos");
        show("submenu-adiantamentos");
        show("menu-baixas");
        show("submenu-baixas");
        show("menu-devolucoes");
        show("submenu-devolucoes");
        // Ocorrências → Pacotes Faltantes: só aparece pro entregador liberado
        // (toggle em Cadastros → Entregadores, "Editar" → Ativar formulário de faltante)
        if (data.usuario.pode_pacote_faltante) {
            show("menu-ocorrencias");
            show("submenu-ocorrencias");
        }
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
        _locIniciarCompartilhamento(); // controle de veículo — só ativa se já tiver permissão de localização concedida
    }

    if (role === "motorista") {
        hide("menu-operacao");
        hide("submenu-operacao");
        hide("menu-pedidos");
        hide("submenu-pedidos");
        hide("menu-conferencias");
        hide("submenu-conferencias");
        show("menu-transferencias");
        show("submenu-transferencias");
        show("menu-devolucoes-motorista");
        show("submenu-devolucoes-motorista");
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
    }

    if (role === "user") {
        _showOperacional();
        _showCadastros();
        show("bip-sync-btn");
        // sem: fechamentos admin, financeiro, extravios
    }

    if (role === "admin") {
        _showOperacional();
        _showPlanejamento();
        _showCadastros();
        _showExtravios();
        _showTorreControle();
        show("menu-baixas");
        show("submenu-baixas");
        show("bip-sync-btn");
        hide("menu-item-mapa-localizacao"); // localização de entregador é só pra dev
        // sem: financeiro, fechamento (só dev e finance)
    }

    if (role === "finance" || role === "dev") {
        _showOperacional();
        _showFechamentosAdmin();
        _showPlanejamento();
        _showFinanceiro();
        _showCadastros();
        _showExtravios();
        _showTorreControle();
        show("menu-baixas");
        show("submenu-baixas");
        show("bip-sync-btn");
        if (role === "dev" || role === "finance") {
            show("btn-add-entregador"); // só dev/finance criam entregador/motorista novo
            show("btn-add-motorista");
        }
        if (role === "finance") {
            hide("menu-item-mapa-localizacao"); // localização de entregador é sensível — só dev
        }
        if (role === "dev") {
            show("menu-item-todos-usuarios"); // visão de todos os usuários do sistema — só dev
            show("menu-item-whatsapp-teste"); // teste de disparo WhatsApp — só dev, enquanto valida a integração
        }
    }

    if (role === "sac") {
        _showExtravios();
        _showCadastros(); // sac fica acima do admin na gestão de entregadores
        _showTorreControle(); // pacotes faltantes/transferências: admin, dev, sac e finance veem
        hide("menu-item-etiquetas"); // etiquetas é só do pessoal operacional (user até dev)
        hide("menu-item-mapa-localizacao"); // localização de entregador é sensível — só dev
    }

    if (role === "ADM Videira") {
        hide("menu-operacao");
        hide("submenu-operacao");
        hide("menu-pedidos");
        hide("submenu-pedidos");
        hide("menu-conferencias");
        hide("submenu-conferencias");
        show("menu-videira");
        show("submenu-videira");
        // Alimentar só para dev
    }

    // Registro de Pacotes Faltantes: entregador usa o menu Ocorrências, com toggle liberado
    // (acima). Os demais cargos (user, admin, finance, dev, sac, motorista, ADM Videira) já têm
    // acesso direto, como item dentro de Operação — entra na mesma lista/tabela compartilhada.
    if (role !== "entregador") {
        show("menu-item-pacotes-faltantes-op");
    }

    renderHomeActions(role);

    const badgeLabels = {
        dev: "Dev", admin: "Administrador", finance: "Financeiro",
        user: "Usuário", entregador: "Entregador", sac: "SAC", motorista: "Motorista"
    };
    const badgeColors = {
        dev: "#a78bfa", admin: "#fb923c", finance: "#34d399",
        user: "#3a86ff", entregador: "#22c55e", sac: "#06b6d4", "ADM Videira": "#e879f9", motorista: "#f59e0b"
    };
    const badge = document.getElementById("home-role-badge");
    if (badge) {
        const cor = badgeColors[role] || "#3a86ff";
        badge.innerHTML = `<span class="role-dot" style="background:${cor}"></span>${badgeLabels[role] || role}`;
        badge.style.color       = cor;
        badge.style.borderColor = cor + "3d";
        badge.style.background  = cor + "14";
    }

    // Abre direto a tela indicada na URL (ex.: /GC-Transportes/Baixas/TotalExpress),
    // se houver uma — feito só depois dos menus do cargo estarem prontos.
    if (typeof _rotaAbrirAtual === "function") _rotaAbrirAtual();

})
.catch(() => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
});

// ───── SKELETON DE CARREGAMENTO (uso geral) ─────
// Formatos que imitam o conteúdo real de cada tela:
//   skTabela(n)  — cabeçalho + linhas com colunas (telas de tabela/listagem)
//   skCards(n)   — cards empilhados (históricos, viagens, transferências)
//   skDash()     — faixa de KPIs + gráfico (dashboards)
//   skLinhas(n)  — linhas simples (modais/popovers/containers pequenos)
// skMostrar(el, tipo, n) aplica no placeholder; skFim(el, texto) volta ao normal.
function skLinhas(linhas = 6) {
    return Array(linhas).fill(`
        <div style="display:flex;align-items:center;gap:14px;padding:12px 0">
            <div class="sk" style="width:9px;height:9px;border-radius:50%;flex-shrink:0"></div>
            <div class="sk sk-h8" style="width:26%;max-width:190px"></div>
            <div class="sk sk-h8" style="flex:1"></div>
            <div class="sk sk-h8" style="width:70px"></div>
        </div>`).join("");
}
function skHTML(linhas = 6) {
    return `<div class="sk-card" style="gap:0">${skLinhas(linhas)}</div>`;
}
function skTabela(linhas = 7) {
    const cols = [16, 24, 13, 11, 9];
    const header = `<div style="display:flex;gap:20px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.07)">`
        + cols.map(w => `<div class="sk sk-h8" style="width:${Math.max(6, w - 6)}%"></div>`).join("") + `</div>`;
    const row = `<div style="display:flex;align-items:center;gap:20px;padding:15px 18px;border-bottom:1px solid rgba(255,255,255,0.04)">`
        + cols.map(w => `<div class="sk sk-h8" style="width:${w}%"></div>`).join("") + `</div>`;
    return `<div class="sk-card" style="gap:0;padding:0;overflow:hidden">${header}${Array(linhas).fill(row).join("")}</div>`;
}
function skCards(n = 3) {
    return Array(n).fill(`
        <div class="sk-card" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:14px">
                <div class="sk" style="height:13px;width:30%;max-width:220px;border-radius:5px"></div>
                <div class="sk sk-h8" style="width:64px"></div>
            </div>
            <div class="sk sk-h8" style="width:55%;max-width:340px"></div>
            <div class="sk sk-h8" style="width:38%;max-width:240px"></div>
        </div>`).join("");
}
function skDash() {
    const kpi = `
        <div style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:10px">
            <div class="sk sk-h8 sk-w60"></div>
            <div class="sk" style="height:26px;width:70px;border-radius:6px"></div>
            <div class="sk sk-h8 sk-w40"></div>
        </div>`;
    return `
        <div class="sk-card" style="margin-bottom:16px"><div style="display:flex;gap:24px;flex-wrap:wrap">${Array(4).fill(kpi).join("")}</div></div>
        <div class="sk-card" style="gap:14px">
            <div class="sk sk-h8" style="width:180px"></div>
            <div class="sk" style="height:240px;border-radius:10px"></div>
        </div>`;
}
function skMostrar(el, tipo = "tabela", n) {
    if (!el) return;
    el.classList.add("sk-mode");
    el.style.display = "";
    el.innerHTML = tipo === "cards" ? skCards(n || 3)
                 : tipo === "dash"  ? skDash()
                 : tipo === "fech"  ? (typeof _skeletonFechamento === "function" ? _skeletonFechamento() : skTabela(n || 7))
                 : tipo === "lista" ? skHTML(n || 6)
                 : skTabela(n || 7);
}
function skFim(el, texto) {
    if (!el) return;
    el.classList.remove("sk-mode");
    if (texto !== undefined) el.innerText = texto;
}
