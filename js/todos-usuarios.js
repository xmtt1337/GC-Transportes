// ───── CADASTROS — TODOS OS USUÁRIOS (SÓ DEV) ─────
// Visão geral, só leitura, de todos os usuários do sistema (qualquer role):
// quantos ativos, quem é quem e quando cada um acessou pela última vez.
let _tuDados = [];

function abrirTodosUsuarios(event) {
    if (event) event.preventDefault();
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
            _tuRenderizar(rows);
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

function _tuRenderizar(rows) {
    const empty = document.getElementById("tu-empty");
    const res   = document.getElementById("tu-resultado");

    if (!rows.length) {
        empty.innerText = "Nenhum usuário encontrado.";
        empty.style.display = "";
        res.style.display = "none";
        return;
    }

    const ativos = rows.filter(u => u.active).length;
    document.getElementById("tu-counter").innerText =
        `${rows.length} usuário${rows.length !== 1 ? "s" : ""} · ${ativos} ativo${ativos !== 1 ? "s" : ""}`;

    empty.style.display = "none";
    res.style.display = "";
    document.getElementById("tu-tbody").innerHTML = rows.map(u => `
        <tr>
            <td>${u.name || "—"}</td>
            <td style="font-family:monospace;font-size:12px">${u.username}</td>
            <td>${_TU_CARGO_LABELS[u.role] || u.role}</td>
            <td>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:${u.active ? "#22c55e" : "#64748b"}">
                    <span style="width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0"></span>${u.active ? "Ativo" : "Inativo"}
                </span>
            </td>
            <td style="font-size:12.5px;color:#94a3b8">${_tuTextoAcesso(u.segundos_desde_acesso)}</td>
        </tr>
    `).join("");
}

function _tuFiltrarLocal() {
    const termo = document.getElementById("tu-filtro-input").value.trim().toLowerCase();
    if (!termo) return _tuRenderizar(_tuDados);
    const filtrado = _tuDados.filter(u =>
        (u.name     || "").toLowerCase().includes(termo) ||
        (u.username || "").toLowerCase().includes(termo) ||
        (_TU_CARGO_LABELS[u.role] || u.role || "").toLowerCase().includes(termo)
    );
    _tuRenderizar(filtrado);
}
