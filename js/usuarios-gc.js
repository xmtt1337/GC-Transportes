// ───── USUÁRIOS GC TRANSPORTES ─────

const GC_ROLE_LABELS = { admin: "Administrador", finance: "Financeiro", sac: "SAC", user: "Usuário", dev: "Dev" };
const GC_ROLE_COLORS = {
    admin:   { bg: "rgba(58,134,255,0.12)",  color: "#3a86ff" },
    finance: { bg: "rgba(34,197,94,0.12)",   color: "#22c55e" },
    sac:     { bg: "rgba(251,146,60,0.12)",  color: "#fb923c" },
    user:    { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
    dev:     { bg: "rgba(168,85,247,0.12)",  color: "#a855f7" },
};

let _editRoleGC_id = null;

function abrirAdminUsuariosGC(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-admin-usuarios-gc");
    _carregarUsuariosGC();
}

function _carregarUsuariosGC() {
    const tok   = localStorage.getItem("token");
    const empty = document.getElementById("gc-usr-empty");
    const res   = document.getElementById("gc-usr-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/usuarios`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(users => {
        const gcUsers = (Array.isArray(users) ? users : []).filter(u => u.role !== "entregador");
        if (!gcUsers.length) {
            empty.innerText = "Nenhum usuário GC cadastrado.";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        document.getElementById("gc-usr-tbody").innerHTML = gcUsers.map(u => {
            const rc = GC_ROLE_COLORS[u.role] || GC_ROLE_COLORS.user;
            const rl = GC_ROLE_LABELS[u.role] || u.role;
            const nomeEsc = (u.name || u.username).replace(/'/g, "\\'");
            return `<tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div class="adm-usr-avatar">${(u.name || u.username).slice(0,2).toUpperCase()}</div>
                        <div>
                            <div style="font-weight:600;color:#e2e8f0">${u.name || "—"}</div>
                            <div style="font-size:11px;color:#4a6a8a;margin-top:2px">${['dev','finance','sac'].includes(u.role) ? '••••••' : u.username}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <span style="background:${rc.bg};color:${rc.color};border:1px solid ${rc.color}44;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px">${rl}</span>
                </td>
                <td><span class="adm-usr-badge ${u.active ? 'ativo' : 'inativo'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button class="adm-usr-action senha" onclick="_abrirEditarRoleGC(${u.id},'${u.role}','${nomeEsc}')">Editar Role</button>
                        <button class="adm-usr-action ${u.active ? 'inativar' : 'ativar'}" onclick="_toggleAtivoGC(${u.id},${!u.active})">${u.active ? 'Inativar' : 'Ativar'}</button>
                        <button class="adm-usr-action senha" onclick="_resetarSenhaGC(${u.id},'${u.username.replace(/'/g,"\\'")}')">Resetar Senha</button>
                        <button class="adm-usr-action deletar" onclick="_deletarUsuarioGC(${u.id},'${u.username.replace(/'/g,"\\'")}')">Deletar</button>
                    </div>
                </td>
            </tr>`;
        }).join("");
    }).catch(() => { empty.innerText = "Erro ao carregar usuários."; });
}

// ── Novo usuário ──
function _abrirModalNovoUsuarioGC() {
    document.getElementById("ngc-nome").value   = "";
    document.getElementById("ngc-senha").value  = "";
    document.getElementById("ngc-role").value   = "user";
    document.getElementById("ngc-erro").innerText = "";
    document.getElementById("ngc-form").style.display    = "";
    document.getElementById("ngc-sucesso").style.display = "none";
    _abrirModal("modal-novo-usuario-gc");
    setTimeout(() => document.getElementById("ngc-nome").focus(), 80);
}

function _salvarNovoUsuarioGC() {
    const tok      = localStorage.getItem("token");
    const name     = document.getElementById("ngc-nome").value.trim();
    const password = document.getElementById("ngc-senha").value.trim();
    const role     = document.getElementById("ngc-role").value;
    const erro     = document.getElementById("ngc-erro");
    const btn      = document.getElementById("ngc-btn-salvar");
    erro.innerText = "";
    if (!name) { erro.innerText = "Informe o nome do usuário."; return; }
    btn.disabled = true;
    btn.textContent = "Cadastrando...";

    fetch(`${API}/admin/usuarios`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, role })
    }).then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        if (data.error) { erro.innerText = data.error; return; }
        document.getElementById("ngc-id-gerado").innerText = data.username;
        document.getElementById("ngc-copiado").innerText   = "";
        document.getElementById("ngc-form").style.display    = "none";
        document.getElementById("ngc-sucesso").style.display = "";
        _carregarUsuariosGC();
    }).catch(() => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        erro.innerText = "Erro ao cadastrar usuário.";
    });
}

function _copiarIDGC() {
    const id = document.getElementById("ngc-id-gerado").innerText;
    navigator.clipboard.writeText(id).then(() => {
        document.getElementById("ngc-copiado").innerText = "✓ Copiado!";
        setTimeout(() => { document.getElementById("ngc-copiado").innerText = ""; }, 2000);
    });
}

// ── Editar role ──
function _abrirEditarRoleGC(id, roleAtual, nome) {
    _editRoleGC_id = id;
    document.getElementById("erg-nome").innerText  = nome;
    document.getElementById("erg-role").value      = roleAtual;
    document.getElementById("erg-erro").innerText  = "";
    const btn = document.getElementById("erg-btn-salvar");
    btn.disabled = false;
    btn.textContent = "Salvar";
    _abrirModal("modal-editar-role-gc");
}

function _salvarRoleGC() {
    if (!_editRoleGC_id) return;
    const tok  = localStorage.getItem("token");
    const role = document.getElementById("erg-role").value;
    const erro = document.getElementById("erg-erro");
    const btn  = document.getElementById("erg-btn-salvar");
    erro.innerText = "";
    btn.disabled = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/usuarios/${_editRoleGC_id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ role })
    }).then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = "Salvar";
        if (data.error) { erro.innerText = data.error; return; }
        _fecharModal("modal-editar-role-gc");
        _carregarUsuariosGC();
    }).catch(() => {
        btn.disabled = false;
        btn.textContent = "Salvar";
        erro.innerText = "Erro ao atualizar role.";
    });
}

// ── Ações ──
function _toggleAtivoGC(id, active) {
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ active })
    }).then(r => r.json())
    .then(data => { if (data.error) gcAlert(data.error); else _carregarUsuariosGC(); })
    .catch(() => gcAlert("Erro ao atualizar usuário."));
}

function _resetarSenhaGC(id, username) {
    gcConfirm(`Resetar a senha de "${username}" para a senha padrão?`, () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/${id}/reset-senha`, {
            method: "PUT",
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json())
        .then(data => { if (data.error) gcAlert(data.error); else gcAlert("Senha resetada com sucesso."); })
        .catch(() => gcAlert("Erro ao resetar senha."));
    }, null, "Resetar");
}

function _deletarUsuarioGC(id, username) {
    gcConfirm(`Deletar o usuário "${username}"?\nEsta ação não pode ser desfeita.`, () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/${id}`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json())
        .then(data => { if (data.error) gcAlert(data.error); else _carregarUsuariosGC(); })
        .catch(() => gcAlert("Erro ao deletar usuário."));
    }, null, "Deletar");
}
