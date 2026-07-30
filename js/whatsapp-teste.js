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
    _waCarregarStatus();
    _waRecRenderCampos();
    _waCarregarHistorico();
}

// Mostra qual número o servidor está usando pra enviar — trocamos de número no meio
// do projeto, e vários erros da Meta só fazem sentido sabendo qual está configurado.
function _waCarregarStatus() {
    const el = document.getElementById("wa-status");
    el.innerText = "Consultando...";

    fetch(`${API}/admin/whatsapp/status`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (!d.configurado) { el.innerHTML = `<span style="color:#ef4444">Nenhum número configurado no servidor.</span>`; return; }
        const m = d.meta || {};
        if (m.error) {
            el.innerHTML = `<span style="color:#ef4444">A Meta não reconheceu o ID ${d.phone_number_id}: ${m.error.message || "erro"}</span>`;
            return;
        }
        const coexistencia = m.platform_type && m.platform_type !== "CLOUD_API";
        el.innerHTML = `
            <div><strong style="color:#e2e8f0">${m.display_phone_number || "—"}</strong> · ${m.verified_name || "—"}</div>
            <div style="font-size:12px;margin-top:4px">ID: <span style="font-family:monospace">${d.phone_number_id}</span> · Plataforma: ${m.platform_type || "—"} · Verificação: ${m.code_verification_status || "—"}</div>
            ${coexistencia ? `<div style="color:#fbbf24;font-size:12px;margin-top:6px">⚠ Esse número não é Cloud API puro (${m.platform_type}) — é o caso em que a Meta bloqueia registro e templates.</div>` : ""}`;
    })
    .catch(() => { el.innerHTML = `<span style="color:#ef4444">Erro ao consultar o servidor.</span>`; });
}

// ── Mensagens de reclamação por transportadora ──
// Cada categoria vira um template aprovado na Meta (nome em "template"); os campos
// abaixo viram os parâmetros {{1}}, {{2}}... na mesma ordem em que aparecem no texto.
const WA_REC_TEMPLATES = {
    tiktok: {
        rotulo: "TikTok (J&T)",
        template: "reclamacao_tiktok_jt",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "codigo_pedido", label: "Código do pedido" },
            { id: "nome_loja", label: "Nome da loja" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"}
Meu nome é ${_waRecNomeAtendente()}, representante da transportadora J&T Express.
Verificamos que você abriu uma reclamação referente ao pedido ${v.codigo_pedido || "___"}, realizado pela ${v.nome_loja || "___"}.
Para que possamos auxiliar, escolha uma das opções abaixo e responda apenas com o número:
1 - Recebi o produto;
2 - Recebi o produto corretamente lacrado/embalado;
3 - Não recebi o produto;
4 - Recebi o produto com itens faltantes;
5 - Recebi o produto com a embalagem externa em más condições;
6 - Recebi um produto diferente do comprado;
7 - Recebi o produto com defeito`,
        parametros: v => [v.nome_cliente, _waRecNomeAtendente(), v.codigo_pedido, v.nome_loja],
    },
    mercadolivre: {
        rotulo: "Mercado Livre (J&T)",
        template: "reclamacao_ml_jt",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "nome_produto", label: "Nome do produto" },
            { id: "id_pacote_jms", label: "ID do pacote e número JMS" },
            { id: "data_entrega", label: "Data e hora da entrega" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"}!
Me chamo ${_waRecNomeAtendente()} e sou da Transportadora J&T Express, parceira de entregas do Mercado Livre.

Verificamos que você abriu uma reclamação referente ao produto ${v.nome_produto || "___"} ID ${v.id_pacote_jms || "___"} entregue dia ${v.data_entrega || "___"}.
Para que possamos auxiliar, escolha uma opção:
1- Recebi o produto
2- Não recebi o produto;
3- Recebi o pacote com produtos faltantes;
4- Recebi o produto com defeito;
5- Recebi um produto diferente do comprado.`,
        parametros: v => [v.nome_cliente, _waRecNomeAtendente(), v.nome_produto, v.id_pacote_jms, v.data_entrega],
    },
    shopee: {
        rotulo: "Shopee",
        template: "reclamacao_shopee",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "codigo_pedido", label: "Código do pedido" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"} !Aqui é da transportadora GCTRANSPORTES, parceira da Shopee e responsável pela entrega do seu pedido ${v.codigo_pedido || "___"}. Por gentileza, pode confirmar a entrega do seu pedido preenchendo os dados abaixo:【1】Nome completo do destinatário:【2】CPF:【3】Seu pedido foi recebido?: SIM ou NÃO【4】 A solicitação de reembolso foi cancelada via app?*: SIM ou NÃO【Nota】*Caso seu pedido tenha sido entregue e a solicitação de reembolso ainda está aberta, pedimos que prossiga com o cancelamento do reembolso via app. Agradecemos pela atenção!`,
        parametros: v => [v.nome_cliente, v.codigo_pedido],
    },
    imile: {
        rotulo: "iMile",
        template: "reclamacao_imile",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "numero_pedido", label: "Número do pedido" },
            { id: "remetente", label: "Remetente" },
            { id: "produto", label: "Produto" },
        ],
        montar: v => `Olá cliente ${v.nome_cliente || "___"}, tudo bem?
Me chamo ${_waRecNomeAtendente()}, sou do time de SAC da Imile Delivery.
Recebemos uma reclamação a respeito do seu pedido número ${v.numero_pedido || "___"}, remetente ${v.remetente || "___"}.
PRODUTO: ${v.produto || "___"}

Poderia me confirmar se você recebeu ele corretamente se estava lacrado?
Observação: não aceitamos áudios, apenas mensagens por escrito

Aguardo seu retorno e agradeço desde já! ☺️`,
        parametros: v => [v.nome_cliente, _waRecNomeAtendente(), v.numero_pedido, v.remetente, v.produto],
    },
    anjun: {
        rotulo: "Anjun",
        template: "reclamacao_anjun",
        campos: [
            { id: "nome_cliente", label: "Nome do cliente" },
            { id: "numero_pedido", label: "Número do pedido" },
            { id: "plataforma", label: "Plataforma (Shopee, Mercado Livre...)" },
        ],
        montar: v => `Olá, ${v.nome_cliente || "___"} ! Faço parte da equipe de parceiros da Anjun Express, transportadora responsável pela entrega do seu pedido. O motivo do meu contato é para falarmos a respeito do pedido ${v.numero_pedido || "___"}, do qual foi aberto uma reclamação. Plataforma: ${v.plataforma || "___"} Por gentileza, poderia confirmar o recebimento do seu pedido preenchendo os dados abaixo? .CPF: .Seu pedido foi entregue? Responda com SIM ou NÃO.`,
        parametros: v => [v.nome_cliente, v.numero_pedido, v.plataforma],
    },
};

let _waRecCategoria = "tiktok";

// Nome de quem está atendendo (Matheus/Amanda/"seu nome" nos scripts originais) vira
// o nome de quem está logado no sistema, em vez de fixo ou de precisar digitar toda hora.
function _waRecNomeAtendente() {
    return (window._gcUser && window._gcUser.name) || "___";
}

function _waRecEscolher(cat) {
    _waRecCategoria = cat;
    document.querySelectorAll("#wa-rec-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.cat === cat));
    _waRecRenderCampos();
}

function _waRecRenderCampos() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    document.getElementById("wa-rec-campos").innerHTML = cfg.campos.map(c => `
        <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;display:block;margin-bottom:6px">${c.label}</label>
            <input type="text" id="wa-rec-campo-${c.id}" class="fech-select" style="width:100%" oninput="_waRecAtualizarPreview()">
        </div>`).join("");
    _waRecAtualizarPreview();
}

function _waRecValores() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    const v = {};
    cfg.campos.forEach(c => {
        const el = document.getElementById(`wa-rec-campo-${c.id}`);
        v[c.id] = el ? el.value.trim() : "";
    });
    return v;
}

function _waRecAtualizarPreview() {
    const cfg = WA_REC_TEMPLATES[_waRecCategoria];
    document.getElementById("wa-rec-preview").innerText = cfg.montar(_waRecValores());
}

function _waRecEnviar() {
    const cfg    = WA_REC_TEMPLATES[_waRecCategoria];
    const numero = document.getElementById("wa-rec-numero").value.trim();
    const msgEl  = document.getElementById("wa-rec-msg");
    const v      = _waRecValores();

    if (!numero) { msgEl.style.color = "#ef4444"; msgEl.innerText = "Informe o número do cliente."; return; }
    const faltando = cfg.campos.filter(c => !v[c.id]);
    if (faltando.length) {
        msgEl.style.color = "#ef4444";
        msgEl.innerText = "Preencha: " + faltando.map(c => c.label).join(", ");
        return;
    }

    msgEl.style.color = "#64748b";
    msgEl.innerText = "Enviando...";

    fetch(`${API}/admin/whatsapp/enviar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            numero, template: cfg.template, parametros: cfg.parametros(v),
            texto: cfg.montar(v), nome_cliente: v.nome_cliente || null
        })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            if (body.detalhe) console.error("[whatsapp] recusa da Meta:", body.detalhe);
            msgEl.style.color = "#ef4444";
            msgEl.innerText = body.error || "Erro ao enviar.";
            return;
        }
        msgEl.style.color = "#22c55e";
        msgEl.innerText = "Enviado! ID: " + (body.id || "—");
        _waCarregarHistorico();
    })
    .catch(() => { msgEl.style.color = "#ef4444"; msgEl.innerText = "Erro ao conectar com o servidor."; });
}

// ── Envio em massa via CSV (colunas: Numero,Texto) ──
let _waBulkLinhas  = [];
let _waBulkEnviando = false;

function _waBulkSplitLinha(linha) {
    const vals = []; let cur = ""; let inQ = false;
    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
            if (inQ && linha[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (c === "," && !inQ) { vals.push(cur); cur = ""; }
        else cur += c;
    }
    vals.push(cur);
    return vals.map(v => v.trim().replace(/^"|"$/g, ""));
}

function _waBulkParseCSV(texto) {
    const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
    if (!linhas.length) return [];
    const cabecalho = _waBulkSplitLinha(linhas[0]).map(h => h.toLowerCase());
    const idxNumero = cabecalho.findIndex(h => h.includes("numero") || h.includes("número"));
    const idxTexto  = cabecalho.findIndex(h => h.includes("texto"));
    if (idxNumero === -1) return [];

    return linhas.slice(1).map(linha => {
        const vals = _waBulkSplitLinha(linha);
        return { numero: (vals[idxNumero] || "").trim(), texto: (vals[idxTexto] || "").trim() };
    }).filter(l => l.numero);
}

function _waBulkArquivoSelecionado(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        _waBulkLinhas = _waBulkParseCSV(reader.result).map(l => ({ ...l, status: "aguardando" }));
        _waBulkRenderizar();
        document.getElementById("wa-bulk-preview").style.display = _waBulkLinhas.length ? "" : "none";
        document.getElementById("wa-bulk-contagem").innerText = _waBulkLinhas.length
            ? `${_waBulkLinhas.length} destinatário${_waBulkLinhas.length !== 1 ? "s" : ""} encontrado${_waBulkLinhas.length !== 1 ? "s" : ""} no arquivo.`
            : "Nenhuma linha válida encontrada. Confira se o arquivo tem a coluna 'Numero'.";
        document.getElementById("wa-bulk-progresso").innerText = "";
        const btn = document.getElementById("wa-bulk-btn-enviar");
        btn.disabled = false;
        btn.textContent = "Enviar em massa";
    };
    reader.readAsText(file, "utf-8");
}

function _waBulkStatusCor(status) {
    if (status === "ok") return "#22c55e";
    if (status === "erro") return "#ef4444";
    if (status === "enviando") return "#fbbf24";
    return "#64748b";
}
function _waBulkStatusTexto(l) {
    if (l.status === "ok") return "Enviado";
    if (l.status === "erro") return l.erro || "Falhou";
    if (l.status === "enviando") return "Enviando...";
    return "Aguardando";
}

function _waBulkRenderizar() {
    document.getElementById("wa-bulk-tbody").innerHTML = _waBulkLinhas.map(l => `
        <tr style="border-top:1px solid rgba(255,255,255,0.04)">
            <td style="padding:7px 10px;font-family:monospace">${l.numero}</td>
            <td style="padding:7px 10px;color:#94a3b8;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.texto || "—"}</td>
            <td style="padding:7px 10px;color:${_waBulkStatusCor(l.status)};font-weight:600">${_waBulkStatusTexto(l)}</td>
        </tr>`).join("");
}

async function _waBulkEnviar() {
    if (_waBulkEnviando || !_waBulkLinhas.length) return;
    const template = document.getElementById("wa-bulk-template").value.trim();
    const progresso = document.getElementById("wa-bulk-progresso");
    if (!template) {
        progresso.style.color = "#ef4444";
        progresso.innerText = "Informe o template antes de enviar.";
        return;
    }

    _waBulkEnviando = true;
    const btn = document.getElementById("wa-bulk-btn-enviar");
    btn.disabled = true;

    let ok = 0, falha = 0;
    for (let i = 0; i < _waBulkLinhas.length; i++) {
        const linha = _waBulkLinhas[i];
        linha.status = "enviando";
        _waBulkRenderizar();
        progresso.style.color = "#64748b";
        progresso.innerText = `Enviando ${i + 1} de ${_waBulkLinhas.length}... (${ok} ok, ${falha} falhas)`;

        try {
            const resp = await fetch(`${API}/admin/whatsapp/enviar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ numero: linha.numero, template, parametros: linha.texto ? [linha.texto] : [] })
            });
            const body = await resp.json();
            if (resp.ok) { linha.status = "ok"; ok++; }
            else { linha.status = "erro"; linha.erro = body.error || "Falhou"; falha++; }
        } catch {
            linha.status = "erro"; linha.erro = "Erro de conexão"; falha++;
        }
        _waBulkRenderizar();

        // Espaçamento entre envios — evita rajada instantânea e protege o quality rating do número.
        if (i < _waBulkLinhas.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    _waBulkEnviando = false;
    progresso.style.color = falha ? "#fbbf24" : "#22c55e";
    progresso.innerText = `Concluído: ${ok} enviado${ok !== 1 ? "s" : ""}, ${falha} falha${falha !== 1 ? "s" : ""}.`;
    btn.textContent = "Escolha outro arquivo pra reenviar";
    _waCarregarHistorico();
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
