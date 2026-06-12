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
        show("menu-adminmenu");
        show("submenu-adminmenu");
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

    if (role === "entregador") {
        hide("menu-operacao");
        hide("submenu-operacao");
        hide("menu-pedidos");
        hide("submenu-pedidos");
        hide("menu-conferencias");
        hide("submenu-conferencias");
        show("menu-fechamentos");
        show("submenu-fechamentos");
        document.getElementById("welcome-name").innerText = displayName.split(" ")[0];
    }

    if (role === "user") {
        _showOperacional();
        _showCadastros();
        // sem: fechamentos admin, financeiro, extravios
    }

    if (role === "admin") {
        _showOperacional();
        _showFechamentosAdmin();
        _showCadastros();
        _showExtravios();
        // sem: financeiro
    }

    if (role === "finance" || role === "dev") {
        _showOperacional();
        _showFechamentosAdmin();
        _showFinanceiro();
        _showCadastros();
        _showExtravios();
    }

    if (role === "sac") {
        _showExtravios();
    }

    renderHomeActions(role);

    const badgeLabels = {
        dev: "Dev", admin: "Administrador", finance: "Financeiro",
        user: "Usuário", entregador: "Entregador", sac: "SAC"
    };
    const badge = document.getElementById("home-role-badge");
    if (badge) badge.innerText = badgeLabels[role] || role;

})
.catch(() => {
    localStorage.removeItem("token");
    window.location.href = "login.html";
});
