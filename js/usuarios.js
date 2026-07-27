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
    skMostrar(empty);
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/usuarios?role=entregador`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(users => {
        if (!Array.isArray(users) || !users.length) {
            skFim(empty, "Nenhum entregador cadastrado.");
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        const podeFaltante = ["admin", "dev", "sac"].includes((window._gcUser && window._gcUser.role) || "");
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
                    <div class="adm-usr-editar-wrap">
                        <button class="adm-usr-action senha" onclick="_toggleMenuUsuario(event,${u.id})">Editar ▾</button>
                        <div class="adm-usr-editar-menu" id="adm-usr-menu-${u.id}">
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleAtivoUsuario(${u.id},${!u.active})">${u.active ? 'Inativar' : 'Ativar'}</button>
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_resetarSenha(${u.id},'${u.username.replace(/'/g,"\\'")}')">Resetar senha</button>
                            ${podeFaltante ? `<button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleFaltante(${u.id},${!u.pode_pacote_faltante})">${u.pode_pacote_faltante ? 'Desativar' : 'Ativar'} formulário de faltante</button>` : ""}
                        </div>
                    </div>
                </td>
            </tr>
        `).join("");
    }).catch(() => { skFim(empty, "Erro ao carregar entregadores."); });
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
    document.getElementById("mne-duplicado").style.display = "none";
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
    document.getElementById("mne-duplicado").style.display = "none";
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
        if (data.duplicate) {
            document.getElementById("mne-duplicado-id").innerText = data.existing_username;
            document.getElementById("mne-duplicado").style.display = "";
            return;
        }
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
    gcConfirm("Resetar a senha de TODOS os entregadores para a senha padrão?\n\nEsta ação não pode ser desfeita.", () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/reset-todas-senhas`, {
            method: "PUT",
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            gcAlert(`Senhas resetadas com sucesso para ${data.total || "todos os"} entregadores.`);
        }).catch(() => gcAlert("Erro ao resetar senhas."));
    }, "Confirmar Reset em Massa", "Resetar Todas");
}

function _resetarSenha(id, username) {
    gcConfirm(`Resetar a senha de "${username}" para a senha padrão?`, () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/${id}/reset-senha`, {
            method: "PUT",
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json())
        .then(data => { if (data.error) gcAlert(data.error); })
        .catch(() => gcAlert("Erro ao resetar senha."));
    }, null, "Resetar");
}

function _toggleAtivoUsuario(id, active, aoTerminar) {
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ active })
    }).then(r => r.json())
    .then(data => {
        if (data.error) { gcAlert(data.error); return; }
        (aoTerminar || _carregarUsuarios)();
    }).catch(() => gcAlert("Erro ao atualizar usuário."));
}

function _toggleFaltante(id, valor) {
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios/${id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ pode_pacote_faltante: valor })
    }).then(r => r.json())
    .then(data => {
        if (data.error) { gcAlert(data.error); return; }
        _carregarUsuarios();
    }).catch(() => gcAlert("Erro ao atualizar permissão."));
}

// Dropdown "Editar" por linha: só um aberto por vez, fecha ao clicar fora
function _toggleMenuUsuario(event, id) {
    event.stopPropagation();
    const menu = document.getElementById(`adm-usr-menu-${id}`);
    const jaAberto = menu.classList.contains("open");
    _fecharMenusUsuario();
    if (!jaAberto) menu.classList.add("open");
}
function _fecharMenusUsuario() {
    document.querySelectorAll(".adm-usr-editar-menu.open").forEach(m => m.classList.remove("open"));
}
document.addEventListener("click", _fecharMenusUsuario);
