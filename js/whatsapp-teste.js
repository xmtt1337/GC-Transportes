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
