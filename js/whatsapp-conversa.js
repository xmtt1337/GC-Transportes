// ───── WHATSAPP — RÉPLICA VISUAL DA CONVERSA (SÓ DEV) ─────
// Recria o visual do app do WhatsApp com os dados reais trocados com o cliente,
// pra servir de "print" pro SAC mostrar pra transportadora sem precisar do celular.
let _wacNumeroAtual = null;

function abrirWhatsappConversas(event) {
    if (event) event.preventDefault();
    if (!window._gcUser || window._gcUser.role !== "dev") {
        gcAlert("Acesso restrito a desenvolvedores.");
        return;
    }
    mostrarTela("tela-whatsapp-conversas");
    _wacCarregarLista();
}

function _wacCarregarLista() {
    const empty  = document.getElementById("wac-lista-empty");
    const result = document.getElementById("wac-lista-resultado");
    skMostrar(empty, "cards");
    result.style.display = "none";

    fetch(`${API}/admin/whatsapp/conversas`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) { skFim(empty, "Nenhuma conversa registrada ainda."); return; }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("wac-lista").innerHTML = rows.map(r => {
                const nome = (r.nome_cliente || "").replace(/'/g, "\\'");
                return `
                <div class="ed-tr-row" style="cursor:pointer;grid-template-columns:1fr auto" onclick="_wacAbrirConversa('${r.numero}','${nome}')">
                    <div>
                        <div class="ed-tr-name">${r.nome_cliente || "—"}</div>
                        <div style="font-size:12px;color:#64748b;font-family:monospace">${r.numero}</div>
                    </div>
                    <div style="font-size:12px;color:#64748b">${new Date(r.ultima).toLocaleString("pt-BR")}</div>
                </div>`;
            }).join("");
        })
        .catch(() => { skFim(empty, "Erro ao carregar conversas."); });
}

function _wacAbrirConversa(numero, nomeCliente) {
    _wacNumeroAtual = numero;
    document.getElementById("wac-chat-nome").innerText = nomeCliente || numero;
    document.getElementById("wac-chat-numero").innerText = numero;
    mostrarTela("tela-whatsapp-conversa-chat");
    _wacCarregarConversa();
}

function _wacEscapar(s) {
    const div = document.createElement("div");
    div.innerText = s || "";
    return div.innerHTML.replace(/\n/g, "<br>");
}

function _wacCarregarConversa() {
    const body = document.getElementById("wac-chat-body");
    body.innerHTML = `<div style="text-align:center;color:#5b6b73;font-size:13px;padding:20px">Carregando...</div>`;

    fetch(`${API}/admin/whatsapp/conversa/${_wacNumeroAtual}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                body.innerHTML = `<div style="text-align:center;color:#5b6b73;font-size:13px;padding:20px">Nenhuma mensagem encontrada.</div>`;
                return;
            }
            body.innerHTML = rows.map(m => {
                const hora  = new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const check = m.direcao === "enviada" ? `<span class="wac-check">✓✓</span>` : "";
                return `<div class="wac-bubble ${m.direcao}">${_wacEscapar(m.texto)}<span class="wac-bubble-hora">${hora} ${check}</span></div>`;
            }).join("");
            body.scrollTop = body.scrollHeight;
        })
        .catch(() => { body.innerHTML = `<div style="text-align:center;color:#ef4444;font-size:13px;padding:20px">Erro ao carregar conversa.</div>`; });
}
