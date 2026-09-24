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
        const podeNF       = ["admin", "dev", "finance"].includes((window._gcUser && window._gcUser.role) || "");
        // Mesma alçada de quem cria motorista: quem não pode cadastrar um não deveria poder
        // transformar um entregador em um por outra porta.
        const podeMotorista = ["admin", "dev", "finance"].includes((window._gcUser && window._gcUser.role) || "");
        // Anotações de Quantidade é o entregador quem preenche e configura — só dev ativa.
        const podeAnotar = (window._gcUser && window._gcUser.role) === "dev";
        _cadContagem("adm-usr-contagem", users, "entregador", "entregadores");
        document.getElementById("adm-usr-tbody").innerHTML = users.map(u => {
            // O que esse entregador tem de diferente do padrão, em texto corrido — precisa ficar
            // à vista (senão ninguém lembra de quem foi liberado), mas sem virar selo colorido.
            const liberacoes = [
                u.isento_nf && `<span title="Vê os fechamentos mesmo com nota fiscal pendente da quinzena anterior">Sem trava de NF</span>`,
                u.faz_motorista && `<span title="Além da rota, tem acesso a Transferências e Devoluções do motorista">Também motorista</span>`,
                u.pode_anotar_quantidade && `<span title="Pode registrar quantidade entregue por transportadora e ver a estimativa de ganho">Anotações de quantidade</span>`,
            ].filter(Boolean);
            return `
            <tr class="${u.active ? "" : "cad-inativo"}">
                <td>${_cadPessoaHtml(u)}</td>
                <td>${_cadStatusHtml(u)}</td>
                <td class="cad-liberacoes">${liberacoes.length ? liberacoes.join(" · ") : `<span class="cad-vazio">—</span>`}</td>
                <td class="cad-acao">
                    <div class="adm-usr-editar-wrap">
                        <button class="adm-usr-action senha" onclick="_toggleMenuUsuario(event,${u.id})">Editar ▾</button>
                        <div class="adm-usr-editar-menu" id="adm-usr-menu-${u.id}">
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleAtivoUsuario(${u.id},${!u.active})">${u.active ? 'Inativar' : 'Ativar'}</button>
                            <button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_resetarSenha(${u.id},'${u.username.replace(/'/g,"\'")}')">Resetar senha</button>
                            ${podeFaltante ? `<button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleFaltante(${u.id},${!u.pode_pacote_faltante})">${u.pode_pacote_faltante ? 'Desativar' : 'Ativar'} formulário de faltante</button>` : ""}
                            ${podeNF ? `<button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleIsentoNF(${u.id},${!u.isento_nf},'${(u.name || u.username).replace(/'/g,"\'")}')">${u.isento_nf ? 'Voltar a exigir NF' : 'Liberar fechamento sem NF'}</button>` : ""}
                            ${podeMotorista ? `<button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleFazMotorista(${u.id},${!u.faz_motorista},'${(u.name || u.username).replace(/'/g,"\'")}')">${u.faz_motorista ? 'Tirar telas de motorista' : 'Liberar telas de motorista'}</button>` : ""}
                            ${podeAnotar ? `<button class="adm-usr-editar-item" onclick="_fecharMenusUsuario();_toggleAnotaQuantidade(${u.id},${!u.pode_anotar_quantidade},'${(u.name || u.username).replace(/'/g,"\'")}')">${u.pode_anotar_quantidade ? 'Desativar' : 'Ativar'} Anotações de Quantidade</button>` : ""}
                        </div>
                    </div>
                </td>
            </tr>`;
        }).join("");
    }).catch(() => { skFim(empty, "Erro ao carregar entregadores."); });
}

// ── Peças comuns das telas de Cadastros (Entregadores, Motoristas, Usuários) ──
// Nome em cima, login embaixo, sem bolinha de iniciais. `login` troca o que vai na segunda
// linha (Usuários esconde o login de dev/finance/sac).
function _cadPessoaHtml(u, login) {
    return `
        <div class="cad-pessoa">
            <div class="cad-nome">${_cadEsc(u.name || "—")}</div>
            <div class="cad-login">${login !== undefined ? login : _cadEsc(u.username)}</div>
            ${typeof _aparelhoLinha === "function" ? _aparelhoLinha(u) : ""}
        </div>`;
}

// Ativo/Inativo em texto, e o aviso de senha pendente embaixo — quem está nela não entra.
function _cadStatusHtml(u) {
    return `<div class="cad-status">${u.active ? "Ativo" : "Inativo"}</div>`
        + (u.senha_temporaria ? `<div class="cad-senha-pendente" title="Ainda não trocou a senha temporária — não consegue entrar até trocar">Senha pendente</div>` : "");
}

// "4 entregadores · 3 ativos" no cabeçalho da tela.
function _cadContagem(id, lista, singular, plural) {
    const el = document.getElementById(id);
    if (!el) return;
    const total = lista.length;
    const ativos = lista.filter(u => u.active).length;
    el.textContent = `${total} ${total === 1 ? singular : plural} · ${ativos} ${ativos === 1 ? "ativo" : "ativos"}`;
}

function _cadEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
        document.getElementById("mne-senha-gerada").innerText = data.senha_temporaria || "—";
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
        document.getElementById("mne-copiado").innerText = "✓ ID copiado!";
        setTimeout(() => { document.getElementById("mne-copiado").innerText = ""; }, 2000);
    });
}

function _copiarSenhaEntregador() {
    const id    = document.getElementById("mne-id-gerado").innerText;
    const senha = document.getElementById("mne-senha-gerada").innerText;
    navigator.clipboard.writeText(`Usuário: ${id}\nSenha: ${senha}`).then(() => {
        document.getElementById("mne-copiado").innerText = "✓ Usuário e senha copiados!";
        setTimeout(() => { document.getElementById("mne-copiado").innerText = ""; }, 2000);
    });
}

// Reset em massa removido: com senha única por pessoa ele travava todo mundo de uma vez e
// gerava uma lista de dezenas de senhas pra distribuir na mão. Agora é um de cada vez, na
// linha do usuário, quando a pessoa avisa que não consegue entrar.

function _resetarSenha(id, username) {
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

// Liberar cobra confirmação; voltar a exigir não. Liberar afrouxa uma regra de cobrança, e
// é o tipo de clique que passa batido no menu se não avisar o que está fazendo.
function _toggleIsentoNF(id, valor, nome) {
    const aplicar = () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/${id}`, {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ isento_nf: valor })
        }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _carregarUsuarios();
        }).catch(() => gcAlert("Erro ao atualizar a permissão."));
    };
    if (!valor) return aplicar();
    gcConfirm(
        `Liberar "${nome}" do bloqueio de nota fiscal?\n\nEle passa a ver os fechamentos mesmo com a NF da quinzena anterior pendente, com valor divergente ou com tomador errado.`,
        aplicar, "Liberar fechamento sem NF", "Liberar");
}

// Confirma antes: liberar dá acesso a telas de outra função, e tirar no meio do dia deixa
// quem está rodando uma transferência sem conseguir terminá-la.
function _toggleFazMotorista(id, valor, nome) {
    const aplicar = () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/${id}`, {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ faz_motorista: valor })
        }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _carregarUsuarios();
        }).catch(() => gcAlert("Erro ao atualizar a permissão."));
    };
    gcConfirm(
        valor
            ? `Liberar as telas de motorista para ${nome}?\n\nEle continua entregador — só ganha Transferências e Devoluções do motorista no menu. Vale no próximo clique, sem precisar sair e entrar.`
            : `Tirar as telas de motorista de ${nome}?\n\nEle perde o acesso a Transferências e Devoluções do motorista. O que já foi registrado continua no histórico.`,
        aplicar,
        valor ? "Liberar telas de motorista" : "Tirar telas de motorista",
        valor ? "Liberar" : "Tirar"
    );
}

// Confirma antes: liga uma tela nova de entrada de dados pro entregador, e desligar some
// com o menu dele sem apagar o que já foi lançado.
function _toggleAnotaQuantidade(id, valor, nome) {
    const aplicar = () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/admin/usuarios/${id}`, {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ pode_anotar_quantidade: valor })
        }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _carregarUsuarios();
        }).catch(() => gcAlert("Erro ao atualizar a permissão."));
    };
    gcConfirm(
        valor
            ? `Ativar Anotações de Quantidade para ${nome}?\n\nEle passa a poder registrar, por conta própria, a quantidade entregue por transportadora e configurar sua estimativa de valor por pacote.`
            : `Desativar Anotações de Quantidade para ${nome}?\n\nEle perde o acesso à tela. O que já foi lançado continua no histórico.`,
        aplicar,
        valor ? "Ativar Anotações de Quantidade" : "Desativar Anotações de Quantidade",
        valor ? "Ativar" : "Desativar"
    );
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
