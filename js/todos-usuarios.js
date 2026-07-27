// ───── CADASTROS — TODOS OS USUÁRIOS (SÓ DEV) ─────
// Visão geral, só leitura, de todos os usuários do sistema (qualquer role):
// quem está online agora, quem nunca acessou, e quando cada um acessou por último.
let _tuDados  = [];
let _tuFiltro = "todos"; // "todos" | "online" | "nunca" | "inativos"

const _TU_ONLINE_SEGUNDOS = 5 * 60; // até 5 min atrás conta como "online agora"

function abrirTodosUsuarios(event) {
    if (event) event.preventDefault();
    if (!window._gcUser || window._gcUser.role !== "dev") {
        gcAlert("Acesso restrito a desenvolvedores.");
        return;
    }
    mostrarTela("tela-todos-usuarios");
    _tuCarregar();
}

function _tuCarregar() {
    const empty = document.getElementById("tu-empty");
    const res   = document.getElementById("tu-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/dev/usuarios`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows)) { empty.innerText = rows.error || "Erro ao carregar usuários."; return; }
            _tuDados = rows;
            const filtro = document.getElementById("tu-filtro-input");
            if (filtro) filtro.value = "";
            _tuAplicarFiltros();
        }).catch(() => { empty.innerText = "Erro ao carregar usuários."; });
}

function _tuTextoAcesso(segundos) {
    if (segundos == null) return "Nunca acessou";
    if (segundos < 60) return "agora mesmo";
    const min = Math.round(segundos / 60);
    if (min < 60) return `há ${min} min`;
    const horas = Math.round(min / 60);
    if (horas < 24) return `há ${horas}h`;
    const dias = Math.round(horas / 24);
    return `há ${dias} dia${dias !== 1 ? "s" : ""}`;
}

const _TU_CARGO_LABELS = {
    dev: "Dev", admin: "Administrador", finance: "Financeiro", user: "Usuário",
    entregador: "Entregador", motorista: "Motorista", sac: "SAC", "ADM Videira": "ADM Videira"
};

function _tuOnline(u) {
    return u.segundos_desde_acesso != null && u.segundos_desde_acesso <= _TU_ONLINE_SEGUNDOS;
}

// Chips (Todos/Online/Nunca acessou/Inativos) + busca por texto, combinados
function _tuFiltrar(filtro) {
    _tuFiltro = filtro;
    document.querySelectorAll("#tu-filtro-chips .filtro-tab").forEach(c =>
        c.classList.toggle("active", c.dataset.filtro === filtro));
    _tuAplicarFiltros();
}

function _tuFiltrarLocal() {
    _tuAplicarFiltros();
}

function _tuAplicarFiltros() {
    const termo = (document.getElementById("tu-filtro-input").value || "").trim().toLowerCase();
    const filtrado = _tuDados.filter(u => {
        if (_tuFiltro === "online"    && !_tuOnline(u)) return false;
        if (_tuFiltro === "nunca"     && u.segundos_desde_acesso != null) return false;
        if (_tuFiltro === "inativos"  && u.active) return false;
        if (!termo) return true;
        return (u.name     || "").toLowerCase().includes(termo) ||
               (u.username || "").toLowerCase().includes(termo) ||
               (_TU_CARGO_LABELS[u.role] || u.role || "").toLowerCase().includes(termo);
    });
    // Mais recente primeiro — quem nunca acessou (sem segundos_desde_acesso) vai pro final
    filtrado.sort((a, b) => {
        if (a.segundos_desde_acesso == null && b.segundos_desde_acesso == null) return 0;
        if (a.segundos_desde_acesso == null) return 1;
        if (b.segundos_desde_acesso == null) return -1;
        return a.segundos_desde_acesso - b.segundos_desde_acesso;
    });
    _tuRenderizar(filtrado);
}

function _tuRenderizar(rows) {
    const empty = document.getElementById("tu-empty");
    const res   = document.getElementById("tu-resultado");

    const online = _tuDados.filter(_tuOnline).length;
    document.getElementById("tu-counter").innerText =
        `${_tuDados.length} usuário${_tuDados.length !== 1 ? "s" : ""} · ${online} online agora`;

    if (!rows.length) {
        empty.innerText = "Nenhum usuário encontrado com esse filtro.";
        empty.style.display = "";
        res.style.display = "none";
        return;
    }

    empty.style.display = "none";
    res.style.display = "";
    document.getElementById("tu-tbody").innerHTML = rows.map(u => {
        const online = _tuOnline(u);
        return `
        <tr>
            <td>${u.name || "—"}</td>
            <td style="font-family:monospace;font-size:12px">${u.username}</td>
            <td>${_TU_CARGO_LABELS[u.role] || u.role}</td>
            <td>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:${online ? "#22c55e" : "#64748b"}">
                    <span style="width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0"></span>${online ? "Online" : "Offline"}
                </span>
            </td>
            <td style="font-size:12.5px;color:#94a3b8">${_tuTextoAcesso(u.segundos_desde_acesso)}</td>
        </tr>`;
    }).join("");
}
