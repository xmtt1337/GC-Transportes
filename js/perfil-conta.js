// ───── CARD DO PERFIL → CONTA ─────
// O que todo cargo faz pelo próprio nome no topo: foto, senha, e-mail e (role user) pedido
// de troca de polo. O card em si é montado em nav.js; aqui ficam as ações e os diálogos.
//
// Cada diálogo fecha o card antes de abrir: o clique dentro do diálogo contaria como clique
// fora do card e o fecharia de qualquer jeito, só que no meio da digitação.

const PC_FOTO_LADO = 256; // px — a foto só aparece em avatar, nunca maior que isso

function _pcHeaders() {
    return { "Authorization": "Bearer " + token, "Content-Type": "application/json" };
}

async function _pcPost(caminho, corpo, metodo) {
    const r = await fetch(API + caminho, { method: metodo || "POST", headers: _pcHeaders(), body: corpo ? JSON.stringify(corpo) : undefined });
    let d = {};
    try { d = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, d };
}

// Diálogo genérico no mesmo visual de gcAlert/gcConfirm. `montar(overlay, fechar)` liga os
// eventos do conteúdo; o diálogo fecha no Cancelar, no Esc e no clique fora.
function _pcDialogo(titulo, corpoHtml, montar) {
    fecharPerfilCard();
    const overlay = document.createElement("div");
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `<div style="${_gcCardStyle}">
        <div style="${_gcTitleStyle}">${titulo}</div>
        ${corpoHtml}
        <div class="pc-dlg-erro" style="display:none"></div>
        <div style="${_gcBtnsStyle};margin-top:18px">
            <button type="button" style="${_gcBtnCxStyle}" data-action="cancel">Cancelar</button>
            <button type="button" style="${_gcBtnOkStyle}" data-action="ok">Salvar</button>
        </div>
    </div>`;
    const esc = e => { if (e.key === "Escape") fechar(); };
    const fechar = () => { overlay.remove(); document.removeEventListener("keydown", esc); };
    overlay.querySelector("[data-action=cancel]").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });
    document.addEventListener("keydown", esc);
    document.body.appendChild(overlay);

    const erroEl = overlay.querySelector(".pc-dlg-erro");
    const ok = overlay.querySelector("[data-action=ok]");
    const api = {
        overlay, fechar, ok,
        erro(msg) { erroEl.style.display = msg ? "" : "none"; erroEl.style.color = "#f87171"; erroEl.innerText = msg || ""; },
        aviso(msg) { erroEl.style.display = msg ? "" : "none"; erroEl.style.color = "#22c55e"; erroEl.innerText = msg || ""; },
        ocupado(sim, texto) { ok.disabled = sim; if (texto) ok.innerText = texto; },
    };
    montar(api);
    const primeiro = overlay.querySelector("input, textarea");
    if (primeiro) setTimeout(() => primeiro.focus(), 60);
    return api;
}

// ── Foto ──
// Recorta o centro em quadrado e reduz no navegador: foto de celular passa de 3 MB, e ela
// volta inteira a cada abertura do card. 256px em JPEG fica na casa dos 20 KB.
function _pcReduzirFoto(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        leitor.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("Esse arquivo não é uma imagem válida."));
            img.onload = () => {
                const lado = Math.min(img.width, img.height);
                const canvas = document.createElement("canvas");
                canvas.width = canvas.height = PC_FOTO_LADO;
                canvas.getContext("2d").drawImage(img,
                    (img.width - lado) / 2, (img.height - lado) / 2, lado, lado,
                    0, 0, PC_FOTO_LADO, PC_FOTO_LADO);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.src = leitor.result;
        };
        leitor.readAsDataURL(arquivo);
    });
}

function pcEscolherFoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
        const arquivo = input.files && input.files[0];
        if (!arquivo) return;
        try {
            const foto = await _pcReduzirFoto(arquivo);
            const r = await _pcPost("/minha-foto", { foto }, "PUT");
            if (!r.ok) { gcAlert(r.d.error || "Não foi possível salvar a foto."); return; }
            _pcAtualizarAvatar(foto);
        } catch (e) {
            gcAlert(e.message || "Erro ao enviar a foto.");
        }
    };
    input.click();
}

function pcRemoverFoto() {
    gcConfirm("Remover sua foto de perfil?", async () => {
        const r = await _pcPost("/minha-foto", null, "DELETE").catch(() => ({ ok: false, d: {} }));
        if (!r.ok) { gcAlert(r.d.error || "Não foi possível remover a foto."); return; }
        _pcAtualizarAvatar(null);
    }, "Remover foto", "Remover");
}

// Reabre o card já com a foto nova (e o "Remover foto" aparecendo ou sumindo), e
// atualiza o chip do topo junto.
function _pcAtualizarAvatar(foto) {
    gcPerfilChipAvatar(foto);
    fecharPerfilCard();
    abrirPerfilCard();
}

// ── Chip do topo (avatar + nome + setinha) ──
// A foto só entra se o servidor validou como data URL de imagem (modules/perfil).
function gcPerfilChipAvatar(foto) {
    const el = document.getElementById("perfil-chip-avatar");
    if (!el) return;
    const u = window._gcUser || {};
    const inicial = (u.displayName || u.name || u.username || "?")[0].toUpperCase();
    el.innerHTML = foto ? `<img src="${foto}" alt="">` : _gcEsc(inicial);
}

// Uma consulta só, na entrada. A foto vem reduzida (~20 KB), então não pesa.
function gcPerfilChipCarregarFoto() {
    fetch(API + "/meus-dados", { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.foto) gcPerfilChipAvatar(d.foto); })
        .catch(() => {});
}

// ── Senha ──
function pcAlterarSenha() {
    const campo = (id, label, auto) => `
        <label class="pc-dlg-label" for="${id}">${label}</label>
        <input type="password" id="${id}" class="pc-dlg-input" autocomplete="${auto}">`;
    _pcDialogo("Alterar senha", `
        ${campo("pc-senha-atual", "Senha atual", "current-password")}
        ${campo("pc-senha-nova", "Senha nova (mínimo 6 caracteres)", "new-password")}
        ${campo("pc-senha-conf", "Repita a senha nova", "new-password")}`,
    dlg => {
        const val = id => dlg.overlay.querySelector("#" + id).value;
        const enviar = async () => {
            const atual = val("pc-senha-atual"), nova = val("pc-senha-nova"), conf = val("pc-senha-conf");
            if (!atual || !nova) { dlg.erro("Preencha a senha atual e a nova."); return; }
            if (nova.length < 6) { dlg.erro("A senha nova deve ter pelo menos 6 caracteres."); return; }
            if (nova !== conf)   { dlg.erro("As duas senhas novas não são iguais."); return; }
            dlg.erro(""); dlg.ocupado(true, "Salvando...");
            try {
                const r = await _pcPost("/minha-senha/logado", { senha_atual: atual, senha_nova: nova });
                if (!r.ok) { dlg.erro(r.d.error || "Não foi possível trocar a senha."); return; }
                dlg.fechar();
                gcAlert("Senha alterada. Use a nova no próximo login.", "Pronto");
            } catch { dlg.erro("Erro ao conectar com o servidor."); }
            finally { dlg.ocupado(false, "Salvar"); }
        };
        dlg.ok.addEventListener("click", enviar);
        dlg.overlay.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") enviar(); }));
    });
}

// ── E-mail ──
// Mesmo fluxo da tela de login: manda código pro endereço novo e só grava depois que a
// pessoa digita o código. O servidor pode devolver 409 com sugestão de domínio parecido
// ("gmial.com") — aí pergunta, e insistir manda `confirmado`.
function pcAlterarEmail(atual) {
    let etapa = "email", confirmado = false;
    _pcDialogo("Alterar e-mail", `
        <div style="${_gcMsgStyle};margin-bottom:12px">E-mail atual: <strong style="color:#e2e8f0">${_gcEsc(atual || "nenhum cadastrado")}</strong></div>
        <div id="pc-email-etapa1">
            <label class="pc-dlg-label" for="pc-email-novo">Novo e-mail</label>
            <input type="email" id="pc-email-novo" class="pc-dlg-input" autocomplete="email" placeholder="voce@exemplo.com">
            <div id="pc-email-sugestao" style="display:none;font-size:12.5px;color:#fbbf24;margin-top:8px">
                <span></span>
                <div style="display:flex;gap:8px;margin-top:8px">
                    <button type="button" class="filtro-tab" data-sug="usar"></button>
                    <button type="button" class="filtro-tab" data-sug="manter">Está certo assim</button>
                </div>
            </div>
        </div>
        <div id="pc-email-etapa2" style="display:none">
            <label class="pc-dlg-label" for="pc-email-codigo">Código de 6 dígitos enviado ao novo e-mail</label>
            <input type="text" id="pc-email-codigo" class="pc-dlg-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
        </div>`,
    dlg => {
        const $ = id => dlg.overlay.querySelector("#" + id);
        dlg.ocupado(false, "Enviar código");

        const enviarCodigo = async () => {
            const email = $("pc-email-novo").value.trim().toLowerCase();
            if (!email) { dlg.erro("Informe o novo e-mail."); return; }
            if (atual && email === String(atual).toLowerCase()) { dlg.erro("Esse já é o seu e-mail."); return; }
            dlg.erro(""); dlg.ocupado(true, "Enviando...");
            try {
                const r = await _pcPost("/meu-email/solicitar", { email, confirmado });
                if (r.status === 409 && r.d.confirmar && r.d.sugestao) {
                    const box = $("pc-email-sugestao");
                    box.querySelector("span").innerText = r.d.error;
                    box.querySelector("[data-sug=usar]").innerText = "Usar " + r.d.sugestao;
                    box.querySelector("[data-sug=usar]").onclick = () => { $("pc-email-novo").value = r.d.sugestao; box.style.display = "none"; enviarCodigo(); };
                    box.querySelector("[data-sug=manter]").onclick = () => { confirmado = true; box.style.display = "none"; enviarCodigo(); };
                    box.style.display = "";
                    return;
                }
                if (!r.ok) { dlg.erro(r.d.error || "Não foi possível enviar o código."); if (r.d.sugestao) $("pc-email-novo").value = r.d.sugestao; return; }
                etapa = "codigo";
                $("pc-email-etapa1").style.display = "none";
                $("pc-email-etapa2").style.display = "";
                dlg.aviso(`Código enviado para ${r.d.email}. Ele vale por 15 minutos.`);
                setTimeout(() => $("pc-email-codigo").focus(), 60);
            } catch { dlg.erro("Erro ao conectar com o servidor."); }
            finally { dlg.ocupado(false, etapa === "codigo" ? "Confirmar" : "Enviar código"); }
        };

        const confirmarCodigo = async () => {
            const codigo = $("pc-email-codigo").value.replace(/\D/g, "");
            if (codigo.length !== 6) { dlg.erro("Digite os 6 dígitos do código."); return; }
            dlg.ocupado(true, "Confirmando...");
            try {
                const r = await _pcPost("/meu-email/confirmar", { codigo });
                if (!r.ok) { dlg.erro(r.d.error || "Código inválido."); return; }
                dlg.fechar();
                gcAlert(`Seu e-mail agora é ${_gcEsc(r.d.email)}.`, "E-mail alterado");
            } catch { dlg.erro("Erro ao conectar com o servidor."); }
            finally { dlg.ocupado(false, "Confirmar"); }
        };

        const seguir = () => (etapa === "codigo" ? confirmarCodigo() : enviarCodigo());
        dlg.ok.addEventListener("click", seguir);
        dlg.overlay.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") seguir(); }));
    });
}

// ── Pedido de troca de polo (role user) ──
// Quem não é dev não troca sozinho: o pedido vira mensagem na Central de Atendimento e o
// suporte troca em Cadastros > Usuários.
function pcSolicitarPolo(poloAtual) {
    let escolhido = null;
    const opcoes = SHOPEE_POLOS.filter(p => p.chave !== poloAtual);
    _pcDialogo("Pedir troca de polo", `
        <div style="${_gcMsgStyle};margin-bottom:12px">O pedido vai para o suporte pela Central de Atendimento. A resposta chega por lá.</div>
        <div class="pc-polo-opcoes" style="grid-template-columns:repeat(${opcoes.length}, 1fr)">
            ${opcoes.map(p => `
                <button type="button" class="pc-polo-btn" data-polo="${p.chave}">
                    <span class="pc-polo-nome">${p.label}</span>
                    <span class="pc-polo-cod">${p.xpt || "sem Shopee"}</span>
                </button>`).join("")}
        </div>
        <label class="pc-dlg-label" for="pc-polo-motivo">Motivo (opcional)</label>
        <textarea id="pc-polo-motivo" class="pc-dlg-input" rows="2" maxlength="300" style="resize:vertical"></textarea>`,
    dlg => {
        dlg.ocupado(false, "Enviar pedido");
        dlg.overlay.querySelectorAll(".pc-polo-btn").forEach(btn => btn.addEventListener("click", () => {
            escolhido = btn.dataset.polo;
            dlg.overlay.querySelectorAll(".pc-polo-btn").forEach(b => b.classList.toggle("ativo", b === btn));
            dlg.erro("");
        }));
        dlg.ok.addEventListener("click", async () => {
            if (!escolhido) { dlg.erro("Escolha o polo para onde quer ir."); return; }
            dlg.ocupado(true, "Enviando...");
            try {
                const motivo = dlg.overlay.querySelector("#pc-polo-motivo").value.trim();
                const r = await _pcPost("/meu-polo/solicitar", { polo: escolhido, motivo });
                if (!r.ok) { dlg.erro(r.d.error || "Não foi possível enviar o pedido."); return; }
                dlg.fechar();
                gcAlert("Pedido enviado ao suporte. Acompanhe a resposta pela Central de Atendimento.", "Pedido enviado");
            } catch { dlg.erro("Erro ao conectar com o servidor."); }
            finally { dlg.ocupado(false, "Enviar pedido"); }
        });
    });
}
