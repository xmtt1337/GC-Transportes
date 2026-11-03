// ───── SIDEBAR ─────
function _fecharTodosSubmenus() {
    document.querySelectorAll(".submenu").forEach(m => m.classList.remove("open"));
    document.querySelectorAll(".sub-submenu").forEach(s => s.classList.remove("open"));
    document.querySelectorAll(".sub-sub-submenu").forEach(s => s.classList.remove("open"));
    document.querySelectorAll(".subgroup-header, .subgroup-header-2").forEach(h => h.classList.remove("open"));
}

// Deixa aberto só o caminho até o link (Torre > Transportadoras > Shopee > Na Rua), pra
// quem reabre o menu ver onde está. Antes, abrir uma tela fechava o menu inteiro.
function _abrirCaminhoAte(link) {
    _fecharTodosSubmenus();
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active", "open"));
    document.querySelectorAll(".submenu a, .subgroup-header, .subgroup-header-2").forEach(l => l.classList.remove("active"));
    link.classList.add("active");
    // Cada título no caminho também fica marcado (Torre, Transportadoras, Loggi).
    let ul = link.closest(".submenu, .sub-submenu, .sub-sub-submenu");
    while (ul) {
        ul.classList.add("open");
        const cabeca = ul.previousElementSibling;
        if (cabeca) cabeca.classList.add("open", "active");
        if (ul.classList.contains("submenu")) break;
        ul = ul.parentElement.closest(".submenu, .sub-submenu, .sub-sub-submenu");
    }
}

// Ao recolher a barra, o que foi aberto só pra olhar volta pro caminho da tela atual.
function _menuVoltarAoAtivo() {
    const ativo = document.querySelector(".submenu a.active");
    if (ativo) return _abrirCaminhoAte(ativo);
    _fecharTodosSubmenus();
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("open"));
}

// No computador a barra fica sempre aberta, encostada na tela (a margem muda num pulo só,
// sem animar: animar trava as tabelas grandes). Não abre mais passando o mouse. O botão
// do rodapé minimiza pra só os ícones, e a escolha fica salva no navegador.
const _SIDEBAR_MINIMIZADA_CHAVE = "gc_sidebar_minimizada";
const _ehComputador = () => window.matchMedia("(min-width: 681px)").matches;
const sidebarFixa = () => document.body.classList.contains("sidebar-fixa");

function _aplicarSidebarFixa(fixa) {
    const sidebar = document.getElementById("sidebar");
    document.body.classList.toggle("sidebar-fixa", fixa);
    sidebar.classList.toggle("expanded", fixa);
    const botao = sidebar.querySelector(".hamburger-btn");
    if (botao) botao.title = fixa ? "Minimizar a barra" : "Abrir a barra";
    if (!fixa) _menuVoltarAoAtivo();
}

function alternarSidebarFixa() {
    const fixa = !sidebarFixa();
    _aplicarSidebarFixa(fixa);
    try { localStorage.setItem(_SIDEBAR_MINIMIZADA_CHAVE, fixa ? "0" : "1"); } catch (_) {}
}

function toggleSidebar() {
    if (_ehComputador()) return alternarSidebarFixa();
    const sidebar = document.getElementById("sidebar");
    const isExpanded = sidebar.classList.toggle("expanded");
    document.getElementById("sidebar-backdrop").classList.toggle("active", isExpanded);
    if (!isExpanded) _menuVoltarAoAtivo();
}

function fecharSidebar() {
    document.getElementById("sidebar").classList.remove("expanded");
    document.getElementById("sidebar-backdrop").classList.remove("active");
    _menuVoltarAoAtivo();
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

    const submenu = element.nextElementSibling;
    const isOpen  = submenu.classList.contains("open");

    // Abrir pra olhar não tira a marca da área da tela atual ("active"); só abre.
    document.querySelectorAll(".menu-item").forEach(i => i.classList.remove("open"));
    _fecharTodosSubmenus();

    if (!isOpen) {
        submenu.classList.add("open");
        element.classList.add("open");
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

// Minimizada, clicar num ícone abre a barra só até escolher a tela ou o mouse sair.
// A largura é conferida a cada evento, não só ao carregar: página aberta larga e depois
// estreitada (janela reduzida, modo celular do DevTools) ficava com o hover ligado, e o
// mouse saindo fechava a barra sem tirar o fundo escuro, que só some em fecharSidebar.
document.addEventListener("DOMContentLoaded", function () {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;
    const temHover = window.matchMedia("(hover: hover) and (min-width: 681px)");
    let minimizada = false;
    try { minimizada = localStorage.getItem(_SIDEBAR_MINIMIZADA_CHAVE) === "1"; } catch (_) {}
    if (_ehComputador()) {
        // Ao carregar, aparece já aberta: sem isso ela animaria abrindo a cada recarga.
        sidebar.style.transition = "none";
        _aplicarSidebarFixa(!minimizada);
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => requestAnimationFrame(() => { sidebar.style.transition = ""; }));
        }
    }
    let hoverTimer;
    sidebar.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        if (!temHover.matches || sidebarFixa()) return;
        hoverTimer = setTimeout(() => { sidebar.classList.remove("expanded"); _menuVoltarAoAtivo(); }, 150);
    });
});

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
