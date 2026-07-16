// ───── PEDIDOS COM OCORRÊNCIA (colar dados tabulados Driver/Order ID/OnHold Time) ─────
// Vive dentro da tela Criar Fechamento — cada transportadora tem seu próprio lote
// (os Order IDs vêm do relatório daquela transportadora específica).

// Aceita o texto colado direto de uma planilha (com abas entre colunas). Tolera linhas de
// cabeçalho soltas (ex.: "Driver Name" / "Order ID" / "OnHold Time" cada uma em uma linha,
// sem tab) e tabs duplicados/irregulares entre Order ID e OnHold Time.
function _pocParseTexto(texto) {
    const linhas = [];
    texto.split(/\r?\n/).forEach(linha => {
        if (!linha.includes("\t")) return; // sem tab = linha de cabeçalho/lixo, ignora
        const partes = linha.split("\t");
        const driver = (partes[0] || "").trim();
        const resto = partes.slice(1).map(p => p.trim()).filter(Boolean);
        const orderId = resto[0] || "";
        const onholdTime = resto[1] || "";
        if (!orderId && !onholdTime) return;
        linhas.push({ driver: driver || null, order_id: orderId || null, onhold_time: onholdTime || null });
    });
    return linhas;
}

function _cfResetOcorrencias() {
    document.getElementById("cf-ocorrencia-textarea").value = "";
    document.getElementById("cf-ocorrencia-status").innerHTML = "";
    document.getElementById("cf-ocorrencia-busca").value = "";
    document.getElementById("cf-ocorrencia-transp-nome").innerText = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual)?.label || "";
    _cfCarregarOcorrencias();
}

async function _cfEnviarOcorrencias() {
    const status = document.getElementById("cf-ocorrencia-status");
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual);
    if (!cfg) return;
    const texto = document.getElementById("cf-ocorrencia-textarea").value;
    const linhas = _pocParseTexto(texto);
    if (!linhas.length) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">Nenhuma linha válida encontrada — cole o texto com as colunas separadas por tab.</div>`;
        return;
    }
    status.innerHTML = `<div style="color:#64748b;font-size:13px">Enviando ${linhas.length} pedidos...</div>`;
    try {
        const res = await fetch(`${API}/admin/pedidos-ocorrencia`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ transportadora: cfg.transportadora, linhas })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao enviar.");
        status.innerHTML = `<div style="color:#22c55e;font-size:13px">✓ ${data.inseridos} pedidos adicionados com sucesso!</div>`;
        document.getElementById("cf-ocorrencia-textarea").value = "";
        _cfCarregarOcorrencias();
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
    }
}

function _cfBuscarOcorrencias() {
    _cfCarregarOcorrencias(document.getElementById("cf-ocorrencia-busca").value.trim());
}

function _cfCarregarOcorrencias(busca) {
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual);
    if (!cfg) return;
    const tbody = document.getElementById("cf-ocorrencia-tbody");
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:16px">Carregando...</td></tr>`;

    const params = new URLSearchParams({ transportadora: cfg.transportadora });
    if (busca) params.set("busca", busca);

    fetch(`${API}/admin/pedidos-ocorrencia?${params}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            document.getElementById("cf-ocorrencia-total").innerText = `${rows.length} pedido${rows.length !== 1 ? "s" : ""}`;
            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:16px">Nenhum pedido cadastrado.</td></tr>`;
                return;
            }
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.driver || "-"}</td>
                    <td>${r.order_id || "-"}</td>
                    <td>${r.onhold_time || "-"}</td>
                    <td><button onclick="_cfRemoverOcorrencia(${r.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px">Remover</button></td>
                </tr>
            `).join("");
        }).catch(() => {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:16px">Erro ao carregar.</td></tr>`;
        });
}

function _cfRemoverOcorrencia(id) {
    if (!confirm("Remover este pedido?")) return;
    fetch(`${API}/admin/pedidos-ocorrencia/${id}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(() => _cfBuscarOcorrencias())
    .catch(() => alert("Erro ao remover."));
}
