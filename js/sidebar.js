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
    el.parentElement.querySelectorAll(".subgroup-header").forEach(h => h.classList.remove("open"));
    el.parentElement.querySelectorAll(".sub-submenu").forEach(s => s.classList.remove("open"));
    if (!isOpen) {
        sub.classList.add("open");
        el.classList.add("open");
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
