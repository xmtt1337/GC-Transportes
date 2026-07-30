// ───── WHATSAPP — RÉPLICA VISUAL DA CONVERSA (SÓ DEV) ─────
// Recria o visual do app do WhatsApp com os dados reais trocados com o cliente,
// pra servir de "print" pro SAC mostrar pra transportadora sem precisar do celular.
let _wacNumeroAtual = null;

// Prazo de resposta (em dias) por template — usado pra agrupar a lista de conversas
// por urgência. Todos os scripts de reclamação hoje têm 2 dias; ajuste aqui se algum mudar.
const WA_PRAZO_DIAS_PADRAO = 2;
const WA_PRAZO_POR_TEMPLATE = {
    reclamacao_tiktok_jt: 2,
    reclamacao_ml_jt: 2,
    reclamacao_shopee: 2,
    reclamacao_imile: 2,
    reclamacao_anjun: 2,
};

// Dias restantes até o vencimento, contando por data de calendário (não por hora exata) —
// mais intuitivo pra um prazo em "dias" (ex.: enviou às 23h, ainda conta o dia inteiro).
function _wacDiasRestantes(primeiroEnvio, template) {
    const prazoDias = WA_PRAZO_POR_TEMPLATE[template] ?? WA_PRAZO_DIAS_PADRAO;
    const envio = new Date(primeiroEnvio);
    const vencimento = new Date(envio.getFullYear(), envio.getMonth(), envio.getDate() + prazoDias);
    const hoje = new Date();
    const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return Math.round((vencimento - hojeSemHora) / (1000 * 60 * 60 * 24));
}

function _wacStatusPrazo(conversa) {
    if (conversa.respondido) return "respondidos";
    const dias = _wacDiasRestantes(conversa.primeiro_envio, conversa.template_inicial);
    if (dias <= 0) return "vencendo_hoje";
    if (dias === 1) return "um_dia";
    return "dois_dias";
}

const WA_GRUPOS_PRAZO = [
    { chave: "vencendo_hoje", titulo: "Vencendo hoje", cor: "#ef4444" },
    { chave: "um_dia",        titulo: "1 dia de prazo", cor: "#fbbf24" },
    { chave: "dois_dias",     titulo: "2 dias de prazo (vencendo em mais de 1 dia)", cor: "#3a86ff" },
    { chave: "respondidos",   titulo: "Respondidos", cor: "#22c55e" },
];

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

            const grupos = {};
            WA_GRUPOS_PRAZO.forEach(g => { grupos[g.chave] = []; });
            rows.forEach(r => grupos[_wacStatusPrazo(r)].push(r));

            document.getElementById("wac-lista").innerHTML = WA_GRUPOS_PRAZO.map(g => {
                const itens = grupos[g.chave];
                if (!itens.length) return "";
                const linhas = itens.map(r => {
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
                return `
                <div class="wac-grupo-header" style="border-left-color:${g.cor}">
                    <span>${g.titulo}</span><span class="wac-grupo-contagem">${itens.length}</span>
                </div>
                <div class="ed-tr-list" style="margin-bottom:20px">${linhas}</div>`;
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

// Resposta livre — só funciona dentro da janela de 24h aberta pelo cliente (sem template).
function _wacResponderEnviar() {
    const input = document.getElementById("wac-compose-input");
    const texto = input.value.trim();
    if (!texto || !_wacNumeroAtual) return;

    input.disabled = true;
    fetch(`${API}/admin/whatsapp/responder`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ numero: _wacNumeroAtual, texto })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        input.disabled = false;
        if (!ok) { gcAlert(body.error || "Erro ao enviar."); return; }
        input.value = "";
        input.focus();
        _wacCarregarConversa();
    })
    .catch(() => { input.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}
