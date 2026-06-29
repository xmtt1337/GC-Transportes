// ───── SIDEBAR ─────
function _fecharTodosSubmenus() {
    document.querySelectorAll(".submenu").forEach(m => m.classList.remove("open"));
    document.querySelectorAll(".sub-submenu").forEach(s => s.classList.remove("open"));
    document.querySelectorAll(".sub-sub-submenu").forEach(s => s.classList.remove("open"));
    document.querySelectorAll(".subgroup-header, .subgroup-header-2").forEach(h => h.classList.remove("open"));
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const isExpanded = sidebar.classList.toggle("expanded");
    if (!isExpanded) {
        _fecharTodosSubmenus();
        document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
    }
}

function fecharSidebar() {
    document.getElementById("sidebar").classList.remove("expanded");
    _fecharTodosSubmenus();
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
}

function irParaHome() {
    mostrarTela("tela-home");
    document.getElementById("titulo-pagina").innerText = "Painel";
    document.querySelectorAll(".submenu a").forEach(l => l.classList.remove("active"));
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
    _fecharTodosSubmenus();
}

function toggleMenu(element) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar.classList.contains("expanded")) {
        sidebar.classList.add("expanded");
    }

    const submenu = element.nextElementSibling;
    const isOpen  = submenu.classList.contains("open");

    document.querySelectorAll(".menu-item").forEach(i => i.classList.remove("active", "open"));
    _fecharTodosSubmenus();

    if (!isOpen) {
        submenu.classList.add("open");
        element.classList.add("open", "active");
    }
}

function toggleSubGroup(el) {
    const sub    = el.nextElementSibling;
    const isOpen = sub.classList.contains("open");

    el.parentElement.querySelectorAll(".subgroup-header").forEach(h => h.classList.remove("open"));
    el.parentElement.querySelectorAll(".sub-submenu").forEach(s => s.classList.remove("open"));

    if (!isOpen) {
        sub.classList.add("open");
        el.classList.add("open");
    }

    if (el.dataset.nav && typeof window[el.dataset.nav] === "function") {
        window[el.dataset.nav]();
    }
}

function toggleSubSubGroup(el) {
    const sub    = el.nextElementSibling;
    const isOpen = sub.classList.contains("open");

    el.parentElement.querySelectorAll(".subgroup-header-2").forEach(h => h.classList.remove("open"));
    el.parentElement.querySelectorAll(".sub-sub-submenu").forEach(s => s.classList.remove("open"));

    if (!isOpen) {
        sub.classList.add("open");
        el.classList.add("open");
    }
}
