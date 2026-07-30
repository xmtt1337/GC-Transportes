// ───── WHATSAPP — RÉPLICA VISUAL DA CONVERSA (SÓ DEV) ─────
// Recria o visual do app do WhatsApp com os dados reais trocados com o cliente,
// pra servir de "print" pro SAC mostrar pra transportadora sem precisar do celular.
let _wacNumeroAtual = null;
let _wacAutoRefresh = null;

// Foto de perfil padrão (silhueta cinza do WhatsApp) — igual pra todo mundo, sem emoji.
const WA_AVATAR_SVG = `<svg viewBox="0 0 212 212" width="100%" height="100%" aria-hidden="true">
    <circle cx="106" cy="106" r="106" fill="#6a7175"/>
    <path fill="#cfd5d9" d="M106 109c17 0 31-14 31-31s-14-31-31-31-31 14-31 31 14 31 31 31zm0 13c-25 0-56 12-56 31v14h112v-14c0-19-31-31-56-31z"/>
</svg>`;

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

// Vencimento exato: 48h corridas (2 × 24h) a partir do minuto certo do primeiro envio,
// não da data do calendário — enviou 29/07 às 23h58, vence 31/07 às 23h58 em ponto.
function _wacVencimento(primeiroEnvio, template) {
    const prazoDias = WA_PRAZO_POR_TEMPLATE[template] ?? WA_PRAZO_DIAS_PADRAO;
    const envio = new Date(primeiroEnvio);
    return new Date(envio.getTime() + prazoDias * 24 * 60 * 60 * 1000);
}

// O agrupamento em blocos (hoje/1 dia/2 dias) compara a DATA do vencimento exato acima
// com a data de hoje — assim o corte de bucket cai num dia legível, mas o vencimento em
// si continua sendo as 48h corridas de verdade (é o que aparece na hora certa na conversa).
function _wacStatusPrazo(conversa) {
    if (conversa.respondido) return "respondidos";
    const vencimento = _wacVencimento(conversa.primeiro_envio, conversa.template_inicial);
    const hoje = new Date();
    const vencimentoData = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate());
    const hojeData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const diasRestantes = Math.round((vencimentoData - hojeData) / (1000 * 60 * 60 * 24));

    if (diasRestantes < 0)   return "vencidos";       // passou do prazo e o cliente nunca respondeu
    if (diasRestantes === 0) return "vencendo_hoje";
    if (diasRestantes === 1) return "um_dia";
    return "dois_dias";
}

// Colunas abertas: só o que ainda está correndo contra o prazo.
const WA_COLUNAS_PRAZO = [
    { chave: "vencendo_hoje", titulo: "Vence hoje",  cor: "#ef4444", corBg: "rgba(239,68,68,0.14)" },
    { chave: "um_dia",        titulo: "1 dia",       cor: "#fbbf24", corBg: "rgba(251,191,36,0.14)" },
    { chave: "dois_dias",     titulo: "2 dias",      cor: "#3a86ff", corBg: "rgba(58,134,255,0.14)" },
];

// Sanfonas embaixo: casos encerrados (respondido) ou perdidos (venceu sem resposta).
// Começam sempre fechadas — são consulta pontual, não o foco do dia a dia.
const WA_ACORDEOES_PRAZO = [
    { chave: "vencidos",    titulo: "Vencidos sem resposta", cor: "#64748b", corBg: "rgba(100,116,139,0.16)" },
    { chave: "respondidos", titulo: "Respondidos",           cor: "#22c55e", corBg: "rgba(34,197,94,0.14)" },
];

const WA_GRUPOS_PRAZO = [...WA_COLUNAS_PRAZO, ...WA_ACORDEOES_PRAZO];

function abrirWhatsappConversas(event) {
    if (event) event.preventDefault();
    if (!window._gcUser || window._gcUser.role !== "dev") {
        gcAlert("Acesso restrito a desenvolvedores.");
        return;
    }
    mostrarTela("tela-whatsapp-conversas");
    _wacCarregarLista();
}

function _wacCards(itens, grupo) {
    return itens.map(r => {
        const respondeu = grupo.chave === "respondidos";
        const quando = respondeu ? new Date(r.ultima) : _wacVencimento(r.primeiro_envio, r.template_inicial);
        const rotulo = respondeu ? "Respondeu" : (grupo.chave === "vencidos" ? "Venceu" : "Vence");
        return `
        <div class="wac-card" onclick="_wacAbrirConversa('${r.numero}')">
            <div class="wac-card-avatar">${WA_AVATAR_SVG}</div>
            <div class="wac-card-info">
                <div class="wac-card-nome">${r.nome_cliente || _wacFormatarNumero(r.numero)}</div>
                <div class="wac-card-numero">${r.numero}</div>
                <div class="wac-card-prazo">${rotulo} ${quando.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
            </div>
        </div>`;
    }).join("");
}

function _wacAlternarAcordeao(chave) {
    const el = document.getElementById(`wac-acordeao-${chave}`);
    if (el) el.classList.toggle("aberto");
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

            document.getElementById("wac-lista").innerHTML = WA_COLUNAS_PRAZO.map(g => `
                <div class="wac-coluna">
                    <div class="wac-coluna-header">
                        <span class="wac-coluna-dot" style="background:${g.cor}"></span>
                        <span>${g.titulo}</span><span class="wac-coluna-contagem">${grupos[g.chave].length}</span>
                    </div>
                    <div class="wac-coluna-cards">${_wacCards(grupos[g.chave], g) || `<div class="wac-coluna-vazia">—</div>`}</div>
                </div>`).join("");

            // Sanfonas: sempre fecham ao entrar na tela, mesmo que estivessem abertas antes.
            document.getElementById("wac-acordeoes").innerHTML = WA_ACORDEOES_PRAZO.map(g => `
                <div class="wac-acordeao" id="wac-acordeao-${g.chave}">
                    <button class="wac-acordeao-header" onclick="_wacAlternarAcordeao('${g.chave}')">
                        <span class="wac-coluna-dot" style="background:${g.cor}"></span>
                        <span>${g.titulo}</span>
                        <span class="wac-coluna-contagem">${grupos[g.chave].length}</span>
                        <span class="wac-acordeao-seta">⌄</span>
                    </button>
                    <div class="wac-acordeao-corpo">${_wacCards(grupos[g.chave], g) || `<div class="wac-coluna-vazia">Nenhuma conversa aqui.</div>`}</div>
                </div>`).join("");
        })
        .catch(() => { skFim(empty, "Erro ao carregar conversas."); });
}

// O cabeçalho mostra só o número, nunca o nome do cliente — é assim que o WhatsApp
// exibe contato não salvo, e é o que dá credibilidade ao print enviado à transportadora.
function _wacAbrirConversa(numero) {
    _wacNumeroAtual = numero;
    document.getElementById("wac-chat-nome").innerText = _wacFormatarNumero(numero);
    document.getElementById("wac-chat-numero").innerText = "";
    mostrarTela("tela-whatsapp-conversa-chat");
    _wacCarregarConversa();
    // Recarrega sozinho enquanto a conversa está aberta, pra resposta do cliente
    // aparecer sem precisar sair e entrar de novo.
    if (_wacAutoRefresh) clearInterval(_wacAutoRefresh);
    _wacAutoRefresh = setInterval(() => {
        const tela = document.getElementById("tela-whatsapp-conversa-chat");
        if (!tela || !tela.classList.contains("active-view")) { clearInterval(_wacAutoRefresh); _wacAutoRefresh = null; return; }
        _wacCarregarConversa(true);
    }, 10000);
}

// 5549999276131 → +55 49 99927-6131
function _wacFormatarNumero(numero) {
    const n = String(numero).replace(/\D/g, "");
    const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${n}`;
}

function _wacEscapar(s) {
    const div = document.createElement("div");
    div.innerText = s || "";
    return div.innerHTML.replace(/\n/g, "<br>");
}

// silencioso: recarrega sem piscar "Carregando..." (usado pelo auto-refresh)
function _wacCarregarConversa(silencioso) {
    const body = document.getElementById("wac-chat-body");
    if (!silencioso) body.innerHTML = `<div style="text-align:center;color:#5b6b73;font-size:13px;padding:20px">Carregando...</div>`;

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
