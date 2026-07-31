// ───── WHATSAPP — RÉPLICA VISUAL DA CONVERSA (SÓ DEV) ─────
// Recria o visual do app do WhatsApp com os dados reais trocados com o cliente,
// pra servir de "print" pro SAC mostrar pra transportadora sem precisar do celular.
let _wacNumeroAtual = null;
let _wacAutoRefresh = null;
let _wacSelecionadas = new Set(); // ids ("e12"/"r5") marcados pra excluir
let _wacDados = [];               // última resposta do servidor, pra filtrar sem re-buscar
let _wacPedidoAtual = "";         // pedido do card que abriu a conversa
let _wacResolvidoAtual = false;

// Avatar padrão do sistema — igual pra todo mundo, sem emoji e sem imitar outro app.
const WA_AVATAR_SVG = `<svg viewBox="0 0 212 212" width="100%" height="100%" aria-hidden="true">
    <circle cx="106" cy="106" r="106" fill="#1b2635"/>
    <path fill="#64748b" d="M106 109c17 0 31-14 31-31s-14-31-31-31-31 14-31 31 14 31 31 31zm0 13c-25 0-56 12-56 31v14h112v-14c0-19-31-31-56-31z"/>
</svg>`;

// Prazo padrão em horas, usado só para envios antigos, feitos antes do campo de prazo
// existir. Hoje o prazo vem preenchido no disparo, por pedido.
const WA_PRAZO_HORAS_PADRAO = 48;

// Vencimento exato: conta as horas do prazo a partir do minuto do envio.
function _wacVencimento(primeiroEnvio, prazoHoras) {
    const horas = prazoHoras || WA_PRAZO_HORAS_PADRAO;
    return new Date(new Date(primeiroEnvio).getTime() + horas * 60 * 60 * 1000);
}

// "faltam 6h" / "faltam 40min" / "venceu há 3h" — precisão que o card de prazo curto exige.
function _wacTempoRestante(vencimento) {
    const ms = vencimento - new Date();
    const venceu = ms < 0;
    const totalMin = Math.floor(Math.abs(ms) / 60000);
    const horas = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const texto = horas >= 24 ? `${Math.floor(horas / 24)}d ${horas % 24}h`
                : horas >= 1  ? `${horas}h ${min}min`
                : `${min}min`;
    return venceu ? `venceu há ${texto}` : `faltam ${texto}`;
}

// O agrupamento em blocos (hoje/1 dia/2 dias) compara a DATA do vencimento exato acima
// com a data de hoje — assim o corte de bucket cai num dia legível, mas o vencimento em
// si continua sendo as 48h corridas de verdade (é o que aparece na hora certa na conversa).
function _wacStatusPrazo(conversa) {
    // Cliente que nos procurou sem nunca termos mandado nada: não tem prazo correndo,
    // mas precisa de atenção — fica numa coluna própria, não escondido nas sanfonas.
    if (!conversa.primeiro_envio) return "recebidas";
    if (conversa.respondido) return "respondidos";
    const vencimento = _wacVencimento(conversa.primeiro_envio, conversa.prazo_horas);
    const hoje = new Date();
    const vencimentoData = new Date(vencimento.getFullYear(), vencimento.getMonth(), vencimento.getDate());
    const hojeData = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const diasRestantes = Math.round((vencimentoData - hojeData) / (1000 * 60 * 60 * 24));

    if (diasRestantes < 0)   return "vencidos";       // passou do prazo e o cliente nunca respondeu
    if (diasRestantes === 0) return "vencendo_hoje";
    if (diasRestantes === 1) return "um_dia";
    return "dois_dias";
}

// Colunas abertas: o que precisa de ação — quem nos procurou + o que corre contra o prazo.
const WA_COLUNAS_PRAZO = [
    { chave: "recebidas",     titulo: "Nos chamaram", cor: "#06b6d4", corBg: "rgba(6,182,212,0.14)" },
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
    const fmt = d => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return itens.map(r => {
        // Quem nos procurou e quem já respondeu não têm prazo correndo — mostram a última mensagem.
        const semPrazo = grupo.chave === "respondidos" || grupo.chave === "recebidas";
        const vencimento = semPrazo ? null : _wacVencimento(r.primeiro_envio, r.prazo_horas);
        const linhaPrazo = semPrazo
            ? (grupo.chave === "recebidas"
                ? `Chegou ${fmt(new Date(r.ultima))}`
                : `Respondido · ${fmt(new Date(r.ultima))}`)
            : `${_wacTempoRestante(vencimento)} · ${fmt(vencimento)}`;
        // O card é do PEDIDO; o cliente vira a linha de apoio.
        const titulo = r.pedido || _wacFormatarNumero(r.numero);
        const apoio  = r.pedido
            ? (r.nome_cliente ? `${r.nome_cliente} · ${_wacFormatarNumero(r.numero)}` : _wacFormatarNumero(r.numero))
            : (r.nome_cliente || "");
        const pedidoEsc = (r.pedido || "").replace(/'/g, "\\'");
        // Ponto verde: cliente escreveu depois do nosso último envio — tem resposta pra ler.
        const aviso = r.tem_resposta_nova && !r.respondido ? `<span class="wac-card-novo" title="Resposta não lida"></span>` : "";
        // Só os respondidos têm botão: reabrir arrastando exigiria mirar numa coluna de
        // prazo específica, e a certa depende do vencimento — o botão evita esse chute.
        const acao = r.respondido
            ? `<button class="wac-card-acao reabrir" title="Reabrir pedido" onclick="_wacReabrirPeloCard(event,'${r.numero}','${pedidoEsc}')">↺</button>`
            : "";
        return `
        <div class="wac-card" draggable="true"
             ondragstart="_wacArrastarInicio(event,'${r.numero}','${pedidoEsc}')"
             ondragend="_wacArrastarFim(event)"
             onclick="_wacAbrirConversa('${r.numero}','${pedidoEsc}',${!!r.respondido})">
            <div class="wac-card-avatar">${WA_AVATAR_SVG}</div>
            <div class="wac-card-info">
                <div class="wac-card-nome">${aviso}${titulo}</div>
                ${apoio ? `<div class="wac-card-numero">${apoio}</div>` : ""}
                <div class="wac-card-prazo" ${vencimento && vencimento < new Date() ? 'style="color:#ef4444"' : ""}>${linhaPrazo}</div>
            </div>
            ${acao}
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
            _wacDados = rows;
            const busca = document.getElementById("wac-busca");
            if (busca) busca.value = "";
            empty.style.display = "none";
            result.style.display = "";
            _wacRenderizar();
        })
        .catch(() => { skFim(empty, "Erro ao carregar conversas."); });
}

// Busca local por pedido, número ou nome — os dados já estão carregados, não refaz requisição.
function _wacFiltrar() {
    _wacRenderizar();
}

function _wacRenderizar() {
    const termo = (document.getElementById("wac-busca")?.value || "").trim().toLowerCase();
    const visiveis = !termo ? _wacDados : _wacDados.filter(r =>
        (r.pedido || "").toLowerCase().includes(termo) ||
        (r.numero || "").toLowerCase().includes(termo) ||
        (r.nome_cliente || "").toLowerCase().includes(termo));

    const grupos = {};
    WA_GRUPOS_PRAZO.forEach(g => { grupos[g.chave] = []; });
    visiveis.forEach(r => grupos[_wacStatusPrazo(r)].push(r));

    document.getElementById("wac-lista").innerHTML = WA_COLUNAS_PRAZO.map(g => `
        <div class="wac-coluna">
            <div class="wac-coluna-header">
                <span class="wac-coluna-dot" style="background:${g.cor}"></span>
                <span>${g.titulo}</span><span class="wac-coluna-contagem">${grupos[g.chave].length}</span>
            </div>
            <div class="wac-coluna-cards wac-drop"
                 ondragover="_wacDropSobre(event)" ondragleave="_wacDropSaiu(event)" ondrop="_wacSoltar(event,null)">
                ${_wacCards(grupos[g.chave], g) || `<div class="wac-coluna-vazia">—</div>`}
            </div>
        </div>`).join("");

    // Sanfonas: fecham ao carregar a tela, mas ficam abertas durante a busca — senão
    // um resultado que caiu ali dentro ficaria escondido sem a pessoa perceber.
    const vazio = `<div class="wac-coluna-vazia">Nenhuma conversa aqui.</div>`;
    document.getElementById("wac-acordeoes").innerHTML = WA_ACORDEOES_PRAZO.map(g => {
        const itens = grupos[g.chave];
        let corpo;
        if (g.chave === "respondidos") {
            // Separa pelo resultado registrado na hora de marcar como respondido.
            const recebeu = itens.filter(r => r.resultado === "recebeu");
            const naoRecebeu = itens.filter(r => r.resultado !== "recebeu");
            const sub = (titulo, cor, lista, valor) => `
                <div class="wac-sub-coluna">
                    <div class="wac-sub-header">
                        <span class="wac-coluna-dot" style="background:${cor}"></span>
                        <span>${titulo}</span><span class="wac-coluna-contagem">${lista.length}</span>
                    </div>
                    <div class="wac-cards-grid wac-drop"
                         ondragover="_wacDropSobre(event)" ondragleave="_wacDropSaiu(event)" ondrop="_wacSoltar(event,'${valor}')">
                        ${_wacCards(lista, g) || vazio}
                    </div>
                </div>`;
            corpo = `<div class="wac-sub-colunas">
                ${sub("Recebido", "#22c55e", recebeu, "recebeu")}
                ${sub("Não recebido", "#ef4444", naoRecebeu, "nao_recebeu")}
            </div>`;
        } else {
            corpo = `<div class="wac-cards-grid">${_wacCards(itens, g) || vazio}</div>`;
        }
        return `
        <div class="wac-acordeao${termo && itens.length ? " aberto" : ""}" id="wac-acordeao-${g.chave}">
            <button class="wac-acordeao-header" onclick="_wacAlternarAcordeao('${g.chave}')">
                <span class="wac-coluna-dot" style="background:${g.cor}"></span>
                <span>${g.titulo}</span>
                <span class="wac-coluna-contagem">${itens.length}</span>
                <span class="wac-acordeao-seta">⌄</span>
            </button>
            <div class="wac-acordeao-corpo">${corpo}</div>
        </div>`;
    }).join("");
}

// O cabeçalho mostra só o número, nunca o nome do cliente — contato não salvo, como
// aparece de verdade, o que dá credibilidade ao print enviado à transportadora.
function _wacAbrirConversa(numero, pedido, resolvido) {
    _wacNumeroAtual = numero;
    _wacPedidoAtual = pedido || "";
    _wacResolvidoAtual = resolvido === true || resolvido === "true";
    _wacSelecionadas.clear();
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
            const scrollAnterior = body.scrollTop;
            body.innerHTML = rows.map(m => {
                const hora  = new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const check = m.direcao === "enviada" ? `<span class="wac-check">✓</span>` : "";
                const sel   = _wacSelecionadas.has(m.id) ? " selecionada" : "";
                const ped   = m.pedido ? ` data-pedido="${m.pedido}"` : "";
                return `<div class="wac-bubble ${m.direcao}${sel}"${ped} onclick="_wacAlternarSelecao('${m.id}')">${_wacEscapar(m.texto)}<span class="wac-bubble-hora">${hora} ${check}</span></div>`;
            }).join("");
            // Só desce sozinho na abertura; no auto-refresh respeita onde a pessoa estava.
            body.scrollTop = silencioso ? scrollAnterior : body.scrollHeight;
            if (!silencioso) _wacDestacarPedido(body);
            _wacAtualizarBarraSelecao();
        })
        .catch(() => { body.innerHTML = `<div style="text-align:center;color:#ef4444;font-size:13px;padding:20px">Erro ao carregar conversa.</div>`; });
}

// Abriu por um card de pedido: leva direto pra mensagem daquele pedido e pisca nela,
// senão numa conversa com vários pedidos a pessoa cairia no fim sem saber qual é qual.
function _wacDestacarPedido(body) {
    if (!_wacPedidoAtual) return;
    const alvo = body.querySelector(`.wac-bubble[data-pedido="${CSS.escape(_wacPedidoAtual)}"]`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center" });
    alvo.classList.add("destacada");
    setTimeout(() => alvo.classList.remove("destacada"), 2000);
}

// ── Arrastar e soltar entre as colunas ──
// Arrastar pra "Recebido"/"Não recebido" resolve o pedido; arrastar de volta pra uma
// coluna de prazo reabre. É o mesmo endpoint do botão ✓, só que sem passar pelo modal.
let _wacArrastando = null;

function _wacArrastarInicio(ev, numero, pedido) {
    _wacArrastando = { numero, pedido };
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", pedido || numero);
    ev.currentTarget.classList.add("arrastando");
    // Abre a sanfona de respondidos: sem isso não haveria onde soltar.
    const ac = document.getElementById("wac-acordeao-respondidos");
    if (ac) ac.classList.add("aberto");
}

function _wacArrastarFim(ev) {
    ev.currentTarget.classList.remove("arrastando");
    _wacArrastando = null;
    document.querySelectorAll(".wac-drop.sobre").forEach(e => e.classList.remove("sobre"));
}

function _wacDropSobre(ev) { ev.preventDefault(); ev.currentTarget.classList.add("sobre"); }
function _wacDropSaiu(ev)  { ev.currentTarget.classList.remove("sobre"); }

// resultado null = reabrir (voltou pra uma coluna de prazo)
function _wacSoltar(ev, resultado) {
    ev.preventDefault();
    ev.currentTarget.classList.remove("sobre");
    if (!_wacArrastando) return;
    const { numero, pedido } = _wacArrastando;
    _wacArrastando = null;

    fetch(`${API}/admin/whatsapp/resolver`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(resultado
            ? { pedido, numero, resolvido: true, resultado, mensagem_ids: [] }
            : { pedido, numero, resolvido: false })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) { gcAlert(body.error || "Erro ao mover."); return; }
        _wacCarregarLista();
    })
    .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

// ── Marcação manual de resolvido ──
// Vale tanto pelo card no funil (rápido, sem abrir a conversa) quanto pela mensagem
// selecionada dentro do chat (aí a mensagem fica gravada como prova da decisão).
let _wacResultadoAlvo = null; // { pedido, numero, mensagem_ids, noChat }

function _wacAbrirModalResultado() {
    if (!_wacSelecionadas.size) return;
    const n = _wacSelecionadas.size;
    _wacResultadoAlvo = {
        pedido: _wacPedidoAtual, numero: _wacNumeroAtual,
        mensagem_ids: [..._wacSelecionadas], noChat: true
    };
    document.getElementById("wac-resultado-msg").innerText =
        `${n} mensagem${n !== 1 ? "s" : ""} selecionada${n !== 1 ? "s" : ""}` +
        (_wacPedidoAtual ? ` como resposta do pedido ${_wacPedidoAtual}.` : ".") +
        " O que o cliente respondeu?";
    document.getElementById("wac-resultado-overlay").style.display = "";
}

function _wacReabrirPeloCard(event, numero, pedido) {
    event.stopPropagation();
    fetch(`${API}/admin/whatsapp/resolver`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, numero, resolvido: false })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) { gcAlert(body.error || "Erro ao reabrir."); return; }
        _wacCarregarLista();
    })
    .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

function _wacFecharModalResultado() {
    document.getElementById("wac-resultado-overlay").style.display = "none";
    _wacResultadoAlvo = null;
}

function _wacConfirmarResultado(resultado) {
    if (!_wacResultadoAlvo) return;
    const alvo = _wacResultadoAlvo;
    fetch(`${API}/admin/whatsapp/resolver`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            pedido: alvo.pedido, numero: alvo.numero, resolvido: true,
            resultado, mensagem_ids: alvo.mensagem_ids
        })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) { gcAlert(body.error || "Erro ao salvar."); return; }
        _wacFecharModalResultado();
        if (alvo.noChat) { _wacResolvidoAtual = true; _wacLimparSelecao(); }
        else _wacCarregarLista();
    })
    .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

// ── Seleção e exclusão de mensagens ──
function _wacAlternarSelecao(id) {
    if (_wacSelecionadas.has(id)) _wacSelecionadas.delete(id);
    else _wacSelecionadas.add(id);
    document.querySelectorAll(".wac-bubble").forEach(b => {
        const bid = (b.getAttribute("onclick") || "").match(/'([^']+)'/);
        if (bid) b.classList.toggle("selecionada", _wacSelecionadas.has(bid[1]));
    });
    _wacAtualizarBarraSelecao();
}

function _wacAtualizarBarraSelecao() {
    const barra = document.getElementById("wac-selecao-barra");
    if (!barra) return;
    const n = _wacSelecionadas.size;
    barra.style.display = n ? "" : "none";
    if (n) document.getElementById("wac-selecao-contagem").innerText =
        `${n} mensagem${n !== 1 ? "s" : ""} selecionada${n !== 1 ? "s" : ""}`;
}

function _wacLimparSelecao() {
    _wacSelecionadas.clear();
    document.querySelectorAll(".wac-bubble.selecionada").forEach(b => b.classList.remove("selecionada"));
    _wacAtualizarBarraSelecao();
}

function _wacExcluirSelecionadas() {
    const ids = [..._wacSelecionadas];
    if (!ids.length) return;
    gcConfirm(
        `Excluir ${ids.length} mensagem${ids.length !== 1 ? "s" : ""} do histórico do sistema? ` +
        `Isso não apaga nada no WhatsApp do cliente — só some daqui e do print.`,
        () => {
            fetch(`${API}/admin/whatsapp/excluir-mensagens`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ ids })
            })
            .then(r => r.json().then(body => ({ ok: r.ok, body })))
            .then(({ ok, body }) => {
                if (!ok) { gcAlert(body.error || "Erro ao excluir."); return; }
                _wacLimparSelecao();
                _wacCarregarConversa();
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
        },
        "Excluir mensagens", "Excluir"
    );
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
        if (!ok) {
            if (body.detalhe) console.error("[whatsapp] recusa da Meta:", body.detalhe);
            gcAlert(body.error || "Erro ao enviar.");
            return;
        }
        input.value = "";
        input.focus();
        _wacCarregarConversa();
    })
    .catch(() => { input.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}
