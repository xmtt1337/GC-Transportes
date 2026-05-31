// ───── TELA ADMIN USUÁRIOS ─────
function abrirAdminUsuarios(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-admin-usuarios");
    _carregarUsuarios();
}

function _carregarUsuarios() {
    const tok = localStorage.getItem("token");
    const empty = document.getElementById("adm-usr-empty");
    const res   = document.getElementById("adm-usr-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/usuarios?role=entregador`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(users => {
        if (!Array.isArray(users) || !users.length) {
            empty.innerText = "Nenhum entregador cadastrado.";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        document.getElementById("adm-usr-tbody").innerHTML = users.map(u => `
            <tr>
                <td>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div class="adm-usr-avatar">${(u.name || u.username).slice(0, 2).toUpperCase()}</div>
                        <div>
                            <div style="font-weight:600;color:#e2e8f0">${u.name || "—"}</div>
                            <div style="font-size:11px;color:#4a6a8a;margin-top:2px">${u.username}</div>
                        </div>
                    </div>
                </td>
                <td><span class="adm-usr-badge ${u.active ? 'ativo' : 'inativo'}">${u.active ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button class="adm-usr-action ${u.active ? 'inativar' : 'ativar'}" onclick="_toggleAtivoUsuario(${u.id},${!u.active})">${u.active ? 'Inativar' : 'Ativar'}</button>
                        <button class="adm-usr-action senha" onclick="_resetarSenha(${u.id},'${u.username.replace(/'/g,"\\'")}')">Resetar Senha</button>
                        <button class="adm-usr-action deletar" onclick="_deletarUsuario(${u.id},'${u.username.replace(/'/g,"\\'")}')">Deletar</button>
                    </div>
                </td>
            </tr>
        `).join("");
    }).catch(() => { empty.innerText = "Erro ao carregar entregadores."; });
}

function _abrirModal(id) {
    document.getElementById(id).classList.add("open");
}
function _fecharModal(id) {
    document.getElementById(id).classList.remove("open");
}
function _fecharModalSeBackdrop(event, id) {
    if (event.target === document.getElementById(id)) _fecharModal(id);
}

function _abrirModalNovoEntregador() {
    document.getElementById("mne-nome").value      = "";
    document.getElementById("mne-senha").value     = "";
    document.getElementById("mne-telefone").value  = "";
    document.getElementById("mne-erro").innerText  = "";
    document.getElementById("mne-form").style.display    = "";
    document.getElementById("mne-sucesso").style.display = "none";
    _abrirModal("modal-novo-entregador");
    setTimeout(() => document.getElementById("mne-nome").focus(), 80);
}

function _salvarNovoEntregador() {
    const tok      = localStorage.getItem("token");
    const name     = document.getElementById("mne-nome").value.trim();
    const password = document.getElementById("mne-senha").value.trim();
    const telefone = document.getElementById("mne-telefone").value.trim();
    const erro     = document.getElementById("mne-erro");
    const btn      = document.getElementById("mne-btn-salvar");
    erro.innerText = "";
    if (!name) { erro.innerText = "Informe o nome do entregador."; return; }
    btn.disabled   = true;
    btn.textContent = "Cadastrando...";

    fetch(`${API}/admin/usuarios`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, role: "entregador", telefone })
    }).then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        if (data.error) { erro.innerText = data.error; return; }
        document.getElementById("mne-id-gerado").innerText = data.username;
        document.getElementById("mne-copiado").innerText   = "";
        document.getElementById("mne-form").style.display    = "none";
        document.getElementById("mne-sucesso").style.display = "";
        _carregarUsuarios();
    }).catch(() => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        erro.innerText = "Erro ao cadastrar entregador.";
    });
}

function _copiarID() {
    const id = document.getElementById("mne-id-gerado").innerText;
    navigator.clipboard.writeText(id).then(() => {
        document.getElementById("mne-copiado").innerText = "✓ Copiado!";
        setTimeout(() => { document.getElementById("mne-copiado").innerText = ""; }, 2000);
    });
}

function _resetarTodasSenhas() {
    if (!confirm("Resetar a senha de TODOS os entregadores para a senha padrão?\n\nEsta ação não pode ser desfeita.")) return;
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/reset-todas-senhas`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        alert(`Senhas resetadas com sucesso para ${data.total || "todos os"} entregadores.`);
    }).catch(() => alert("Erro ao resetar senhas."));
}

function _resetarSenha(id, username) {
    if (!confirm(`Resetar a senha de "${username}" para a senha padrão?`)) return;
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}/reset-senha`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
    .then(data => { if (data.error) alert(data.error); })
    .catch(() => alert("Erro ao resetar senha."));
}

function _toggleAtivoUsuario(id, active) {
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ active })
    }).then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        _carregarUsuarios();
    }).catch(() => alert("Erro ao atualizar usuário."));
}

function _deletarUsuario(id, username) {
    if (!confirm(`Deletar o usuário "${username}"?\nEsta ação não pode ser desfeita.`)) return;
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
    .then(data => {
        if (data.error) { alert(data.error); return; }
        _carregarUsuarios();
    }).catch(() => alert("Erro ao deletar usuário."));
}
