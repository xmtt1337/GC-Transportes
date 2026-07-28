// ───── WHATSAPP — TELA DE TESTE (SÓ DEV) ─────
// Tela simples pra testar o disparo assim que o número/token entrarem no Render.
// Nada de automação aqui ainda — é só um formulário manual pra validar a integração.
function abrirWhatsappTeste(event) {
    if (event) event.preventDefault();
    if (!window._gcUser || window._gcUser.role !== "dev") {
        gcAlert("Acesso restrito a desenvolvedores.");
        return;
    }
    mostrarTela("tela-whatsapp-teste");
    document.getElementById("wa-msg").innerText = "";
    _waCarregarHistorico();
}

function _waEnviar() {
    const numero     = document.getElementById("wa-numero").value.trim();
    const template   = document.getElementById("wa-template").value.trim();
    const parametros = document.getElementById("wa-parametros").value
        .split(",").map(p => p.trim()).filter(p => p);
    const msgEl = document.getElementById("wa-msg");

    if (!numero || !template) {
        msgEl.style.color = "#ef4444";
        msgEl.innerText = "Informe o número e o template.";
        return;
    }

    msgEl.style.color = "#64748b";
    msgEl.innerText = "Enviando...";

    fetch(`${API}/admin/whatsapp/enviar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ numero, template, parametros })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            msgEl.style.color = "#ef4444";
            msgEl.innerText = body.error || "Erro ao enviar.";
            return;
        }
        msgEl.style.color = "#22c55e";
        msgEl.innerText = "Enviado! ID: " + (body.id || "—");
        _waCarregarHistorico();
    })
    .catch(() => {
        msgEl.style.color = "#ef4444";
        msgEl.innerText = "Erro ao conectar com o servidor.";
    });
}

function _waCarregarHistorico() {
    const el = document.getElementById("wa-historico");
    skMostrar(el, "tabela", 4);
    fetch(`${API}/admin/whatsapp/mensagens`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(rows => {
        if (!Array.isArray(rows) || !rows.length) {
            skFim(el, "Nenhum envio registrado ainda.");
            return;
        }
        el.classList.remove("sk-mode");
        el.innerHTML = `
        <div class="ed-tr-header" style="grid-template-columns:130px 140px 70px 1fr">
            <span>Número</span><span>Template</span><span>Status</span><span>Quando / por quem</span>
        </div>
        <div class="ed-tr-list">${rows.map(r => `
            <div class="ed-tr-row" style="grid-template-columns:130px 140px 70px 1fr">
                <div class="ed-tr-name" style="font-family:monospace">${r.numero}</div>
                <div class="ed-tr-name">${r.template}</div>
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${r.sucesso ? "#22c55e" : "#ef4444"}">
                    <span style="width:7px;height:7px;border-radius:50%;background:currentColor"></span>${r.sucesso ? "Ok" : "Falhou"}
                </div>
                <div style="font-size:12px;color:#64748b">${new Date(r.criado_em).toLocaleString("pt-BR")} · ${r.enviado_por_nome || "—"}</div>
            </div>`).join("")}</div>`;
    })
    .catch(() => { skFim(el, "Erro ao carregar histórico."); });
}
