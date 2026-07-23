// ───── TORRE DE CONTROLE — TRANSFERÊNCIAS (ADMIN/DEV) ─────
// Auditoria: todas as viagens de transferência de todos os motoristas, com as
// entregas (destino, recebedor, foto, assinatura) dentro de cada uma.
let _trfaDados = []; // [{id, numero, motorista_nome, data_viagem, entregas:[...]}]

function abrirTransferenciasAdmin(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-torre-transferencias");
    _trfaCarregar();
}

function _trfaCarregar() {
    const empty = document.getElementById("trfa-empty");
    const lista = document.getElementById("trfa-lista");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    lista.style.display = "none";

    fetch(`${API}/admin/transferencias`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows)) { empty.innerText = rows.error || "Erro ao carregar transferências."; return; }
            _trfaDados = rows;
            const filtro = document.getElementById("trfa-filtro-input");
            if (filtro) filtro.value = "";
            _trfaRenderizar(rows);
        }).catch(() => { empty.innerText = "Erro ao carregar transferências."; });
}

function _trfaRenderizar(viagens) {
    const empty = document.getElementById("trfa-empty");
    const lista = document.getElementById("trfa-lista");

    if (!viagens.length) {
        empty.innerText = "Nenhuma transferência registrada.";
        empty.style.display = "";
        lista.style.display = "none";
        return;
    }
    const totalEntregas = viagens.reduce((a, v) => a + (v.entregas || []).length, 0);
    document.getElementById("trfa-counter").innerText =
        `${viagens.length} viagem${viagens.length !== 1 ? "ns" : ""} · ${totalEntregas} entrega${totalEntregas !== 1 ? "s" : ""}`;
    empty.style.display = "none";
    lista.style.display = "";

    lista.innerHTML = viagens.map(v => `
        <div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
                <div>
                    <span style="font-size:16px;font-weight:800;color:#3a86ff;font-family:monospace">${v.numero}</span>
                    <span style="font-size:13px;color:#94a3b8;margin-left:10px">${v.motorista_nome || "—"}</span>
                </div>
                <span style="font-size:12px;color:#64748b">${v.data_viagem || "—"} · ${(v.entregas || []).length} entrega${(v.entregas || []).length !== 1 ? "s" : ""}</span>
            </div>
            ${(v.entregas || []).map(e => `
                <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,0.05);flex-wrap:wrap">
                    <div style="flex:1;min-width:160px">
                        <div style="font-size:13px;font-weight:600;color:#e2e8f0">${e.destino_nome || "—"}</div>
                        <div style="font-size:11.5px;color:#94a3b8">Recebido por ${e.recebedor_nome || "—"} · ${e.data_hora_brasilia || "—"}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
                        ${e.tem_foto ? `<button class="abte-foto-btn" onclick="_trfaVerFoto(${e.id})">Foto</button>` : ""}
                        <button class="abte-foto-btn" onclick="_trfaVerAssinatura(${e.id})">Assinatura</button>
                        ${e.latitude != null ? `<a href="https://maps.google.com/?q=${e.latitude},${e.longitude}" target="_blank" rel="noopener noreferrer" class="abte-foto-btn" style="text-decoration:none">Ver no mapa</a>` : ""}
                    </div>
                </div>`).join("") || `<div style="font-size:12.5px;color:#64748b;padding:6px 0">Nenhuma entrega nesta viagem.</div>`}
        </div>`).join("");
}

function _trfaFiltrarLocal() {
    const termo = document.getElementById("trfa-filtro-input").value.trim().toLowerCase();
    if (!termo) return _trfaRenderizar(_trfaDados);
    const filtrado = _trfaDados
        .map(v => ({
            ...v,
            entregas: (v.entregas || []).filter(e => (e.destino_nome || "").toLowerCase().includes(termo))
        }))
        .filter(v =>
            (v.motorista_nome || "").toLowerCase().includes(termo) ||
            (v.numero || "").toLowerCase().includes(termo) ||
            v.entregas.length > 0
        );
    // Se o filtro bateu só no motorista/número (não no destino), mantém as entregas originais
    const comEntregasCompletas = filtrado.map(v => {
        const original = _trfaDados.find(o => o.id === v.id);
        const bateuNoDestino = (original.entregas || []).some(e => (e.destino_nome || "").toLowerCase().includes(termo));
        return bateuNoDestino ? v : { ...v, entregas: original.entregas };
    });
    _trfaRenderizar(comEntregasCompletas);
}

function _trfaVerFoto(entregaId) {
    if (document.getElementById("trfa-foto-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "trfa-foto-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="max-width:520px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box;text-align:center">
            <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Foto da carga no destino</div>
            <div id="trfa-foto-loading" style="color:#64748b;font-size:13px;padding:40px 0">Carregando foto...</div>
            <img id="trfa-foto-img" style="display:none;max-width:100%;max-height:65vh;border-radius:10px">
            <button id="trfa-foto-fechar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Fechar</button>
        </div>`;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#trfa-foto-fechar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    fetch(`${API}/transferencias/foto/${entregaId}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error || !d.foto_base64) { document.getElementById("trfa-foto-loading").textContent = "Foto não encontrada."; return; }
            const img = document.getElementById("trfa-foto-img");
            img.src = `data:${d.foto_mime_type || "image/jpeg"};base64,${d.foto_base64}`;
            img.onload = () => { img.style.display = ""; document.getElementById("trfa-foto-loading").style.display = "none"; };
        }).catch(() => { document.getElementById("trfa-foto-loading").textContent = "Erro ao carregar a foto."; });
}

function _trfaVerAssinatura(entregaId) {
    if (document.getElementById("trfa-assinatura-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "trfa-assinatura-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="max-width:460px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box;text-align:center">
            <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Assinatura do recebedor</div>
            <div id="trfa-assinatura-loading" style="color:#64748b;font-size:13px;padding:40px 0">Carregando...</div>
            <img id="trfa-assinatura-img" style="display:none;max-width:100%;border-radius:10px;background:#fff">
            <button id="trfa-assinatura-fechar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Fechar</button>
        </div>`;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#trfa-assinatura-fechar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    fetch(`${API}/transferencias/assinatura/${entregaId}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error || !d.assinatura_base64) { document.getElementById("trfa-assinatura-loading").textContent = "Assinatura não encontrada."; return; }
            const img = document.getElementById("trfa-assinatura-img");
            img.src = `data:image/png;base64,${d.assinatura_base64}`;
            img.onload = () => { img.style.display = ""; document.getElementById("trfa-assinatura-loading").style.display = "none"; };
        }).catch(() => { document.getElementById("trfa-assinatura-loading").textContent = "Erro ao carregar a assinatura."; });
}
