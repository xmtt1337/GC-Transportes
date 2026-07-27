// ───── CADASTROS — MOTORISTAS ─────
// Mesma estrutura de Cadastros → Entregadores (usuarios.js), só que pro role
// 'motorista' — sem o toggle de "pacote faltante" (isso é específico de entregador).
function abrirAdminMotoristas(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-admin-motoristas");
    _carregarMotoristas();
}

function _carregarMotoristas() {
    const tok   = localStorage.getItem("token");
    const empty = document.getElementById("adm-mot-empty");
    const res   = document.getElementById("adm-mot-resultado");
    skMostrar(empty);
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/usuarios?role=motorista`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(users => {
        if (!Array.isArray(users) || !users.length) {
            skFim(empty, "Nenhum motorista cadastrado.");
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        document.getElementById("adm-mot-tbody").innerHTML = users.map(u => `
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
                        <button class="adm-usr-action senha" onclick="_toggleMenuMotorista(event,${u.id})">Editar ▾</button>
                        <div class="adm-usr-editar-menu" id="adm-mot-menu-${u.id}">
                            <button class="adm-usr-editar-item" onclick="_fecharMenusMotorista();_toggleAtivoUsuario(${u.id},${!u.active},_carregarMotoristas)">${u.active ? 'Inativar' : 'Ativar'}</button>
                            <button class="adm-usr-editar-item" onclick="_fecharMenusMotorista();_resetarSenha(${u.id},'${u.username.replace(/'/g,"\\'")}')">Resetar senha</button>
                        </div>
                    </div>
                </td>
            </tr>
        `).join("");
    }).catch(() => { skFim(empty, "Erro ao carregar motoristas."); });
}

function _toggleMenuMotorista(event, id) {
    event.stopPropagation();
    const menu = document.getElementById(`adm-mot-menu-${id}`);
    const jaAberto = menu.classList.contains("open");
    _fecharMenusMotorista();
    if (!jaAberto) menu.classList.add("open");
}
function _fecharMenusMotorista() {
    document.querySelectorAll("#adm-mot-tbody .adm-usr-editar-menu.open").forEach(m => m.classList.remove("open"));
}
document.addEventListener("click", _fecharMenusMotorista);

function _abrirModalNovoMotorista() {
    document.getElementById("mnm-nome").value  = "";
    document.getElementById("mnm-senha").value = "";
    document.getElementById("mnm-erro").innerText = "";
    document.getElementById("mnm-duplicado").style.display = "none";
    document.getElementById("mnm-form").style.display    = "";
    document.getElementById("mnm-sucesso").style.display = "none";
    _abrirModal("modal-novo-motorista");
    setTimeout(() => document.getElementById("mnm-nome").focus(), 80);
}

function _salvarNovoMotorista() {
    const tok      = localStorage.getItem("token");
    const name     = document.getElementById("mnm-nome").value.trim();
    const password = document.getElementById("mnm-senha").value.trim();
    const erro     = document.getElementById("mnm-erro");
    const btn      = document.getElementById("mnm-btn-salvar");
    erro.innerText = "";
    document.getElementById("mnm-duplicado").style.display = "none";
    if (!name) { erro.innerText = "Informe o nome do motorista."; return; }
    btn.disabled    = true;
    btn.textContent = "Cadastrando...";

    fetch(`${API}/admin/usuarios`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, role: "motorista" })
    }).then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        if (data.duplicate) {
            document.getElementById("mnm-duplicado-id").innerText = data.existing_username;
            document.getElementById("mnm-duplicado").style.display = "";
            return;
        }
        if (data.error) { erro.innerText = data.error; return; }
        document.getElementById("mnm-id-gerado").innerText = data.username;
        document.getElementById("mnm-copiado").innerText   = "";
        document.getElementById("mnm-form").style.display    = "none";
        document.getElementById("mnm-sucesso").style.display = "";
        _carregarMotoristas();
    }).catch(() => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        erro.innerText = "Erro ao cadastrar motorista.";
    });
}

function _copiarIDMotorista() {
    const id = document.getElementById("mnm-id-gerado").innerText;
    navigator.clipboard.writeText(id).then(() => {
        document.getElementById("mnm-copiado").innerText = "✓ Copiado!";
        setTimeout(() => { document.getElementById("mnm-copiado").innerText = ""; }, 2000);
    });
}
