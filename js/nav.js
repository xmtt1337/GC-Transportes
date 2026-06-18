// ───── NAVEGAÇÃO ENTRE TELAS ─────
const _TELA_TITULOS = {
    "tela-home":                 "Painel",
    "tela-admin":                "Alimentar",
    "tela-admin-fechamentos":    "Pesquisar Fechamentos",
    "tela-admin-nfs":            "Notas Fiscais",
    "tela-conf-nfs":             "Conferência NF",
    "tela-admin-pagamentos":     "Pagamentos",
    "tela-trampay-entregadores": "Entregadores",
    "tela-admin-usuarios":       "Entregadores",
    "tela-admin-usuarios-gc":    "Usuários",
    "tela-dashboard":            "Dashboard",
    "tela-ent-dashboard":        "Dashboard",
    "tela-fechamentos":          "Meus Fechamentos",
    "tela-minhas-nfs":           "Notas Fiscais",
    "tela-extravios-dash":       "Extravios",
    "tela-extravios-busca":      "Pesquisar Extravio",
    "tela-conferencias":         "Conferências",
    "tela-bipagens":             "Separação",
    "tela-pesquisar-pedidos":    "Pesquisar Pedidos",
    "tela-desempenho-bip":       "Desempenho",
    "tela-alimentar":            "Alimentar",
    "tela-antecipacoes":         "Solicitar Antecipação",
    "tela-minhas-solicitacoes":  "Minhas Solicitações",
    "tela-admin-antecipacoes":   "Antecipações",
    "tela-videira-alimentar":    "Alimentar Fechamento",
    "tela-videira-painel":       "Meu Fechamento",
    "tela-videira-dash":         "Dashboard",
    "tela-em-breve":             "Em Breve",
};

function mostrarTela(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
    document.getElementById(id).classList.add("active-view");
    const titulo = document.getElementById("titulo-pagina");
    if (titulo && _TELA_TITULOS[id]) titulo.innerText = _TELA_TITULOS[id];
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

// ───── CARD DE PERFIL ─────
const _TRANSP = [
    { key: "loggi",  label: "Loggi",  cor: "#12A5E8" },
    { key: "anjun",  label: "Anjun",  cor: "#22C55E" },
    { key: "jt",     label: "J&T",    cor: "#EF4444" },
    { key: "imile",  label: "iMile",  cor: "#9333EA" },
    { key: "shopee", label: "Shopee", cor: "#F97316" },
];
const _MES_NOMES = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function abrirPerfilCard(e) {
    if (e) e.stopPropagation();
    const card = document.getElementById("perfil-card");
    if (!card) return;
    if (card.style.display !== "none") { fecharPerfilCard(); return; }

    // Move para <body> para escapar de qualquer stacking context pai
    if (card.parentElement !== document.body) document.body.appendChild(card);

    // Posiciona abaixo do trigger
    const trigger = document.getElementById("username-trigger");
    if (trigger) {
        const rect = trigger.getBoundingClientRect();
        card.style.top   = (rect.bottom + 10) + "px";
        card.style.right = (window.innerWidth - rect.right) + "px";
        card.style.left  = "auto";
    }

    card.style.display = "block";
    card.onclick = ev => ev.stopPropagation();
    card.innerHTML = `<div style="padding:20px 16px;color:#3a5a7a;font-size:12px">Carregando...</div>`;

    document.addEventListener("click", _pcClickFora);

    const tok = localStorage.getItem("token");
    fetch(API + "/meu-perfil", { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(d => _renderPerfilCard(card, d))
    .catch(() => { card.innerHTML = `<div style="padding:16px;color:#f87171;font-size:12px">Erro ao carregar</div>`; });
}

function fecharPerfilCard() {
    const card = document.getElementById("perfil-card");
    if (card) card.style.display = "none";
    document.removeEventListener("click", _pcClickFora);
}

function _pcClickFora(e) {
    const card = document.getElementById("perfil-card");
    const trigger = document.getElementById("username-trigger");
    if (card && !card.contains(e.target) && e.target !== trigger) fecharPerfilCard();
}

function _renderPerfilCard(card, d) {
    const u = window._gcUser || {};
    const inicial = (u.displayName || u.name || u.username || "?")[0].toUpperCase();
    const roleLabels = { user: "Usuário", admin: "Administrador", dev: "Dev", finance: "Financeiro", sac: "SAC" };
    const roleLabel  = roleLabels[u.role] || u.role || "";

    const max = Math.max(..._TRANSP.map(t => d.mensal?.[t.key] || 0), 1);
    const transpRows = _TRANSP.map(t => {
        const val = d.mensal?.[t.key] || 0;
        const pct = Math.round((val / max) * 100);
        return `<div class="pc-transp-row">
            <div class="pc-transp-dot" style="background:${t.cor}"></div>
            <span class="pc-transp-label">${t.label}</span>
            <div class="pc-transp-bar-wrap">
                <div class="pc-transp-bar-fill" style="width:${pct}%;background:${t.cor}20;outline:1px solid ${t.cor}40">
                    <div style="height:100%;width:100%;background:${t.cor};opacity:0.7;border-radius:999px"></div>
                </div>
            </div>
            <span class="pc-transp-val">${val}</span>
        </div>`;
    }).join("");

    const svgKey   = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    const svgStar  = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    const svgScan  = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`;
    const svgChev  = `<svg class="pc-senha-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

    const subNivel = d.proxNivel
        ? `Faltam ${(d.faltam||0).toLocaleString("pt-BR")} bipagens para Nv ${d.proxNivel}`
        : `Nv 100 — nível máximo`;

    card.innerHTML = `
        <div class="pc-header">
            <div class="pc-avatar">${inicial}</div>
            <div>
                <div class="pc-name">${u.displayName || u.name || u.username || "—"}</div>
                <div class="pc-meta">@${u.username || "—"} · ${roleLabel}</div>
            </div>
        </div>

        <div class="pc-section">
            <div class="pc-section-hd">${svgStar} Nível</div>
            <div class="pc-nivel-row">
                <span class="pc-nivel-num">Nv ${d.nivel}</span>
                <span class="pc-nivel-total">${(d.totalBipagens||0).toLocaleString("pt-BR")} únicos</span>
            </div>
            <div class="pc-bar"><div class="pc-bar-fill" style="width:${d.progresso}%"></div></div>
            <div class="pc-nivel-sub">${subNivel}</div>
        </div>

        <div class="pc-section">
            <div class="pc-section-hd">${svgScan} ${_MES_NOMES[d.mes]} · ${(d.mensal?.total||0).toLocaleString("pt-BR")} bipagens</div>
            <div class="pc-transp-list">${transpRows}</div>
        </div>

        <button class="pc-senha-toggle" onclick="_pcToggleSenha(this)">
            ${svgKey}
            <span>Redefinir senha</span>
            ${svgChev}
        </button>
        <div class="pc-senha-form" style="display:none">
            <input id="pc-s-atual" class="pc-senha-input" type="password" placeholder="Senha atual" autocomplete="current-password">
            <input id="pc-s-nova"  class="pc-senha-input" type="password" placeholder="Nova senha" autocomplete="new-password">
            <input id="pc-s-conf"  class="pc-senha-input" type="password" placeholder="Confirmar nova senha" autocomplete="new-password">
            <div id="pc-msg" style="display:none" class="pc-msg"></div>
            <button class="pc-senha-submit" onclick="_pcSalvarSenha()">Salvar</button>
        </div>`;
}

function _pcToggleSenha(btn) {
    const form = btn.nextElementSibling;
    const chevron = btn.querySelector(".pc-senha-chevron");
    const aberto = form.style.display !== "none";
    form.style.display = aberto ? "none" : "flex";
    chevron.classList.toggle("open", !aberto);
    if (!aberto) btn.nextElementSibling.querySelector("#pc-s-atual")?.focus();
}

function _pcSalvarSenha() {
    const atual = document.getElementById("pc-s-atual")?.value.trim();
    const nova  = document.getElementById("pc-s-nova")?.value.trim();
    const conf  = document.getElementById("pc-s-conf")?.value.trim();
    const msg   = document.getElementById("pc-msg");
    const u     = window._gcUser || {};

    const show = (txt, tipo) => {
        msg.textContent = txt; msg.className = "pc-msg " + tipo; msg.style.display = "block";
    };
    if (!atual || !nova || !conf)      return show("Preencha todos os campos.", "err");
    if (nova !== conf)                 return show("As senhas não coincidem.", "err");
    if (nova.length < 4)               return show("A nova senha deve ter ao menos 4 caracteres.", "err");

    const tok = localStorage.getItem("token");
    fetch(API + "/redefinir-senha", {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ username: u.username, senha_atual: atual, senha_nova: nova }),
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) {
            show("Senha alterada com sucesso!", "ok");
            document.getElementById("pc-s-atual").value = "";
            document.getElementById("pc-s-nova").value  = "";
            document.getElementById("pc-s-conf").value  = "";
        } else {
            show(d.error || "Erro ao alterar senha.", "err");
        }
    })
    .catch(() => show("Erro de conexão.", "err"));
}
