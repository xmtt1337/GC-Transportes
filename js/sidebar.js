// ───── SIDEBAR ─────
function _fecharTodosSubmenus() {
    document.querySelectorAll(".submenu").forEach(m => {
        m.classList.remove("open");
        m.style.maxHeight = "0";
    });
    document.querySelectorAll(".sub-submenu").forEach(s => {
        s.classList.remove("open");
        s.style.maxHeight = "0";
    });
    document.querySelectorAll(".sub-sub-submenu").forEach(s => {
        s.classList.remove("open");
        s.style.maxHeight = "0";
    });
    document.querySelectorAll(".subgroup-header, .subgroup-header-2").forEach(h => h.classList.remove("open"));
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const isExpanded = sidebar.classList.toggle("expanded");
    document.getElementById("sidebar-backdrop").classList.toggle("active", isExpanded);
    if (!isExpanded) {
        _fecharTodosSubmenus();
        document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
    }
}

function fecharSidebar() {
    document.getElementById("sidebar").classList.remove("expanded");
    document.getElementById("sidebar-backdrop").classList.remove("active");
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
        document.getElementById("sidebar-backdrop").classList.add("active");
    }

    const allMenuItems = document.querySelectorAll(".menu-item");
    const submenu = element.nextElementSibling;
    const isOpen  = submenu.classList.contains("open");

    allMenuItems.forEach(i => i.classList.remove("active", "open"));
    _fecharTodosSubmenus();

    if (!isOpen) {
        submenu.classList.add("open");
        submenu.style.maxHeight = submenu.scrollHeight + "px";
        element.classList.add("open", "active");
    }
}

function toggleSubGroup(el) {
    const sub    = el.nextElementSibling;
    const isOpen = sub.classList.contains("open");

    el.parentElement.querySelectorAll(".subgroup-header").forEach(h => h.classList.remove("open"));
    el.parentElement.querySelectorAll(".sub-submenu").forEach(s => {
        s.classList.remove("open");
        s.style.maxHeight = "0";
    });

    if (!isOpen) {
        sub.classList.add("open");
        el.classList.add("open");
        sub.style.maxHeight = sub.scrollHeight + "px";
        // Recalcula o pai (submenu) para acomodar o sub-submenu aberto
        const pai = el.closest(".submenu");
        if (pai) pai.style.maxHeight = pai.scrollHeight + sub.scrollHeight + "px";
    }

    if (el.dataset.nav && typeof window[el.dataset.nav] === "function") {
        window[el.dataset.nav]();
    }
}

function toggleSubSubGroup(el) {
    const sub    = el.nextElementSibling;
    const isOpen = sub.classList.contains("open");

    el.parentElement.querySelectorAll(".subgroup-header-2").forEach(h => h.classList.remove("open"));
    el.parentElement.querySelectorAll(".sub-sub-submenu").forEach(s => {
        s.classList.remove("open");
        s.style.maxHeight = "0";
    });

    if (!isOpen) {
        sub.classList.add("open");
        el.classList.add("open");
        sub.style.maxHeight = sub.scrollHeight + "px";
        // Recalcula os pais em cascata
        const subSubmenu = el.closest(".sub-submenu");
        if (subSubmenu) subSubmenu.style.maxHeight = subSubmenu.scrollHeight + sub.scrollHeight + "px";
        const submenu = el.closest(".submenu");
        if (submenu) submenu.style.maxHeight = submenu.scrollHeight + sub.scrollHeight + "px";
    }
}
