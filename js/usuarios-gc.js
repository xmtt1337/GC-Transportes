// ───── USUÁRIOS GC TRANSPORTES ─────

const GC_ROLE_LABELS = { admin: "Administrador", finance: "Financeiro", sac: "SAC", user: "Usuário", dev: "Dev" };

// Polos/bases. Joaçaba consta porque tem gente lotada lá, mas não recebe Shopee.
const GC_POLOS = [
    { chave: "cacador", label: "Caçador" },
    { chave: "videira", label: "Videira" },
    { chave: "joacaba", label: "Joaçaba" },
];

let _editRoleGC_id = null;

const _gcPoloLabel = chave => (GC_POLOS.find(p => p.chave === chave) || {}).label || "";

let _editPoloGC_id = null;

// Polo pelo menu Editar, numa janela — igual a Mudar cargo. Antes era um seletor solto na
// linha, fácil de trocar sem querer rolando a lista.
function _abrirEditarPoloGC(id, poloAtual, nome) {
    _editPoloGC_id = id;
    document.getElementById("epg-nome").innerText = nome;
    document.getElementById("epg-polo").value = poloAtual || "";
    document.getElementById("epg-erro").innerText = "";
    const btn = document.getElementById("epg-btn-salvar");
    btn.disabled = false;
    btn.textContent = "Salvar";
    _abrirModal("modal-editar-polo-gc");
}

function _salvarPoloGC() {
    if (!_editPoloGC_id) return;
    const polo = document.getElementById("epg-polo").value;
    const erro = document.getElementById("epg-erro");
    const btn  = document.getElementById("epg-btn-salvar");
    erro.innerText = "";
    btn.disabled = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/usuarios/${_editPoloGC_id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + localStorage.getItem("token"), "Content-Type": "application/json" },
        body: JSON.stringify({ polo: polo || null })
    }).then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = "Salvar";
        if (data.error) { erro.innerText = data.error; return; }
        _fecharModal("modal-editar-polo-gc");
        _carregarUsuariosGC();
    }).catch(() => {
        btn.disabled = false;
        btn.textContent = "Salvar";
        erro.innerText = "Erro ao alterar o polo.";
    });
}

function abrirAdminUsuariosGC(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-admin-usuarios-gc");
    // Só dev edita a Conversão de nomes e o telefone dos entregadores — mesmo controle de
    // quem mexe em cadastro de gente.
    const souDev = window._gcUser && window._gcUser.role === "dev";
    const btnNomes = document.getElementById("btn-conversao-nomes");
    if (btnNomes) btnNomes.style.display = souDev ? "" : "none";
    const btnTelefone = document.getElementById("btn-entregador-telefone");
    if (btnTelefone) btnTelefone.style.display = souDev ? "" : "none";
    _carregarUsuariosGC();
}

function _carregarUsuariosGC() {
    const tok   = localStorage.getItem("token");
    const empty = document.getElementById("gc-usr-empty");
    const res   = document.getElementById("gc-usr-resultado");
    skMostrar(empty);
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/usuarios`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(users => {
        const gcUsers = (Array.isArray(users) ? users : []).filter(u => u.role !== "entregador");
        if (!gcUsers.length) {
            skFim(empty, "Nenhum usuário GC cadastrado.");
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        _cadContagem("gc-usr-contagem", gcUsers, "usuário", "usuários");
        document.getElementById("gc-usr-tbody").innerHTML = gcUsers.map(u => {
            const rl = GC_ROLE_LABELS[u.role] || u.role;
            const nomeEsc = (u.name || u.username).replace(/'/g, "\\'");
            const userEsc = u.username.replace(/'/g, "\\'");
            // As quatro ações num menu só, como em Entregadores — antes eram quatro botões
            // coloridos por linha. Deletar fica por último, em vermelho.
            return `<tr class="${u.active ? "" : "cad-inativo"}">
                <td>${_cadPessoaHtml(u, ['dev','finance','sac'].includes(u.role) ? '••••••' : undefined)}</td>
                <td class="cad-cargo cargo-${_cadEsc(u.role)}">${_cadEsc(rl)}</td>
                <td class="cad-polo" data-rotulo="Polo">${_gcPoloLabel(u.polo) ? _cadEsc(_gcPoloLabel(u.polo)) : `<span class="cad-vazio">Sem polo</span>`}</td>
                <td>${_cadStatusHtml(u)}</td>
                <td data-rotulo="Último acesso">${_cadAcessoHtml(u)}</td>
                <td class="cad-acao">
                    <div class="adm-usr-editar-wrap">
                        <button class="adm-usr-action senha" onclick="_toggleMenuGC(event,${u.id})">Editar ▾</button>
                        <div class="adm-usr-editar-menu" id="gc-usr-menu-${u.id}">
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_abrirEditarRoleGC(${u.id},'${u.role}','${nomeEsc}')">Mudar cargo</button>
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_abrirEditarPoloGC(${u.id},'${_cadEsc(u.polo || "")}','${nomeEsc}')">Mudar polo</button>
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleAtivoGC(${u.id},${!u.active})">${u.active ? 'Inativar' : 'Ativar'}</button>
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_resetarSenhaGC(${u.id},'${userEsc}')">Resetar senha</button>
                            <button class="adm-usr-editar-item perigo" onclick="_fecharMenusUsuario();_deletarUsuarioGC(${u.id},'${userEsc}')">Deletar</button>
                        </div>
                    </div>
                </td>
            </tr>`;
        }).join("");
    }).catch(() => { skFim(empty, "Erro ao carregar usuários."); });
}

// Menu "Editar" da linha: só um aberto por vez (fecha os de Entregadores também), e clicar
// fora fecha — o ouvinte de clique é o de usuarios.js.
function _toggleMenuGC(event, id) {
    event.stopPropagation();
    const menu = document.getElementById(`gc-usr-menu-${id}`);
    const jaAberto = menu.classList.contains("open");
    _fecharMenusUsuario();
    if (!jaAberto) menu.classList.add("open");
}

// ── Novo usuário ──
function _abrirModalNovoUsuarioGC() {
    document.getElementById("ngc-nome").value   = "";
    document.getElementById("ngc-senha").value  = "";
    document.getElementById("ngc-role").value   = "user";
    document.getElementById("ngc-polo").value   = ""; // sem padrão: escolher é o ponto
    document.getElementById("ngc-erro").innerText = "";
    document.getElementById("ngc-duplicado").style.display = "none";
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
    const polo     = document.getElementById("ngc-polo").value;
    const erro     = document.getElementById("ngc-erro");
    const btn      = document.getElementById("ngc-btn-salvar");
    erro.innerText = "";
    document.getElementById("ngc-duplicado").style.display = "none";
    if (!name) { erro.innerText = "Informe o nome do usuário."; return; }
    // Polo obrigatório aqui: é dele que sai o XPT do recebimento Shopee. Deixar em branco
    // faria a pessoa cair na pergunta avulsa depois, que é o que se quer evitar.
    if (!polo) { erro.innerText = "Escolha o polo/base do usuário."; return; }
    btn.disabled = true;
    btn.textContent = "Cadastrando...";

    fetch(`${API}/admin/usuarios`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ name, password, role, polo })
    }).then(r => r.json())
    .then(data => {
        btn.disabled = false;
        btn.textContent = "Cadastrar";
        if (data.duplicate) {
            document.getElementById("ngc-duplicado-id").innerText = data.existing_username;
            document.getElementById("ngc-duplicado").style.display = "";
            return;
        }
        if (data.error) { erro.innerText = data.error; return; }
        document.getElementById("ngc-id-gerado").innerText = data.username;
        document.getElementById("ngc-senha-gerada").innerText = data.senha_temporaria || "—";
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
        document.getElementById("ngc-copiado").innerText = "✓ ID copiado!";
        setTimeout(() => { document.getElementById("ngc-copiado").innerText = ""; }, 2000);
    });
}

function _copiarSenhaGC() {
    // Copia usuário e senha juntos: separados, quem recebe no WhatsApp junta errado.
    const id    = document.getElementById("ngc-id-gerado").innerText;
    const senha = document.getElementById("ngc-senha-gerada").innerText;
    navigator.clipboard.writeText(`Usuário: ${id}\nSenha: ${senha}`).then(() => {
        document.getElementById("ngc-copiado").innerText = "✓ Usuário e senha copiados!";
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
    gcConfirm(`Gerar uma senha temporária nova para "${username}"?\n\nA senha atual deixa de funcionar na hora, e você vai precisar entregar a nova para a pessoa.`, () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/${id}/reset-senha`, {
            method: "PUT",
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json())
        .then(data => {
            if (data.error) return gcAlert(data.error);
            gcSenhaGerada({ username: data.username || username, name: data.name, senha_temporaria: data.senha_temporaria });
        })
        .catch(() => gcAlert("Erro ao resetar senha."));
    }, null, "Gerar senha");
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
