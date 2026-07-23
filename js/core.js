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
        if (role === "finance") {
            hide("menu-item-pacotes-faltantes-adm"); // só admin/dev
            hide("menu-item-mapa-localizacao");       // localização de entregador é sensível — só admin/dev
            hide("menu-item-transferencias-adm");     // só admin/dev
        }
    }

    if (role === "sac") {
        _showExtravios();
        _showCadastros(); // sac fica acima do admin na gestão de entregadores
        hide("menu-item-etiquetas"); // etiquetas é só do pessoal operacional (user até dev)
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
