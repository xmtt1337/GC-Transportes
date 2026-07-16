// ───── PEDIDOS COM OCORRÊNCIA (colar dados tabulados Driver/Order ID/OnHold Time) ─────

function abrirPedidosOcorrencia(event) {
    if (event) event.preventDefault();
    document.getElementById("poc-textarea").value = "";
    document.getElementById("poc-colar-status").innerHTML = "";
    mostrarTela("tela-pedidos-ocorrencia");
    _pocCarregarLista();
}

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

async function _pocEnviarColados() {
    const status = document.getElementById("poc-colar-status");
    const texto = document.getElementById("poc-textarea").value;
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
            body: JSON.stringify({ linhas })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao enviar.");
        status.innerHTML = `<div style="color:#22c55e;font-size:13px">✓ ${data.inseridos} pedidos adicionados com sucesso!</div>`;
        document.getElementById("poc-textarea").value = "";
        _pocCarregarLista();
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
    }
}

function _pocBuscar() {
    _pocCarregarLista(document.getElementById("poc-busca").value.trim());
}

function _pocCarregarLista(busca) {
    const tbody = document.getElementById("poc-tbody");
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:16px">Carregando...</td></tr>`;

    const url = busca
        ? `${API}/admin/pedidos-ocorrencia?busca=${encodeURIComponent(busca)}`
        : `${API}/admin/pedidos-ocorrencia`;

    fetch(url, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            document.getElementById("poc-total").innerText = `${rows.length} pedido${rows.length !== 1 ? "s" : ""}`;
            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:16px">Nenhum pedido cadastrado.</td></tr>`;
                return;
            }
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.driver || "-"}</td>
                    <td>${r.order_id || "-"}</td>
                    <td>${r.onhold_time || "-"}</td>
                    <td><button onclick="_pocRemover(${r.id})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px">Remover</button></td>
                </tr>
            `).join("");
        }).catch(() => {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:16px">Erro ao carregar.</td></tr>`;
        });
}

function _pocRemover(id) {
    if (!confirm("Remover este pedido?")) return;
    fetch(`${API}/admin/pedidos-ocorrencia/${id}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(() => _pocCarregarLista(document.getElementById("poc-busca").value.trim()))
    .catch(() => alert("Erro ao remover."));
}
