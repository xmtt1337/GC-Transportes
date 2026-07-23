// ───── TORRE DE CONTROLE — LOCALIZAÇÃO DOS ENTREGADORES (ADMIN/DEV) ─────
// Mapa ao vivo com a posição atual de quem já compartilha localização. Mapa via
// Leaflet + OpenStreetMap (gratuito, sem chave) — mesma fonte de mapas já usada
// no reverse-geocoding das Baixas Total Express.
let _locMap            = null;
let _locMarkers        = {};
let _locAutoRefresh    = null;
let _locBoundsAjustado = false;

const _LOC_ATIVO_SEGUNDOS = 10 * 60; // até 10 min atrás conta como "ativo agora"

function abrirLocalizacaoAdmin(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-torre-mapa");
    _locBoundsAjustado = false;
    if (!_locMap) _locInicializarMapa();
    _locCarregar();
    if (_locAutoRefresh) clearInterval(_locAutoRefresh);
    _locAutoRefresh = setInterval(_locCarregar, 30000);
}

function _locInicializarMapa() {
    _locMap = L.map("loc-mapa").setView([-27.5, -50.5], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19
    }).addTo(_locMap);
}

function _locCarregar() {
    fetch(`${API}/admin/localizacoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => { if (Array.isArray(rows)) _locRenderizar(rows); })
        .catch(() => {});
}

function _locTextoTempo(segundos) {
    if (segundos < 60) return "agora mesmo";
    const min = Math.round(segundos / 60);
    if (min < 60) return `há ${min} min`;
    const horas = Math.round(min / 60);
    return `há ${horas}h`;
}

function _locRenderizar(rows) {
    // Tela pode ter sido montada escondida (view ainda não visível quando o mapa foi
    // criado) — o Leaflet só sabe o tamanho real do container depois disso.
    setTimeout(() => _locMap.invalidateSize(), 50);

    const comPosicao = rows.filter(r => r.latitude != null && r.longitude != null);
    const idsAtuais = new Set();
    const bounds = [];

    comPosicao.forEach(r => {
        idsAtuais.add(r.usuario_id);
        const ativo = r.segundos_atras <= _LOC_ATIVO_SEGUNDOS;
        const cor = ativo ? "#22c55e" : "#64748b";
        const icon = L.divIcon({
            className: "",
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${cor};border:2px solid #0b0f18;box-shadow:0 0 0 3px ${cor}40"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7]
        });

        let marker = _locMarkers[r.usuario_id];
        if (!marker) {
            marker = L.marker([r.latitude, r.longitude], { icon }).addTo(_locMap);
            _locMarkers[r.usuario_id] = marker;
        } else {
            marker.setLatLng([r.latitude, r.longitude]);
            marker.setIcon(icon);
        }
        marker.bindPopup(`
            <strong>${r.usuario_nome || "—"}</strong><br>
            ${_locTextoTempo(r.segundos_atras)}
            ${r.precisao_metros ? `<br><span style="color:#888">±${Math.round(r.precisao_metros)}m de precisão</span>` : ""}
            ${r.data_hora_brasilia ? `<br><span style="color:#888">${r.data_hora_brasilia}</span>` : ""}
        `);
        bounds.push([r.latitude, r.longitude]);
    });

    // Remove do mapa quem não veio mais na resposta (ex: perdeu a linha no banco)
    Object.keys(_locMarkers).forEach(id => {
        if (!idsAtuais.has(parseInt(id))) { _locMap.removeLayer(_locMarkers[id]); delete _locMarkers[id]; }
    });

    if (bounds.length && !_locBoundsAjustado) {
        _locMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        _locBoundsAjustado = true;
    }

    const ativos = comPosicao.filter(r => r.segundos_atras <= _LOC_ATIVO_SEGUNDOS);
    document.getElementById("loc-counter").innerText =
        `${ativos.length} ativo${ativos.length !== 1 ? "s" : ""} agora · ${comPosicao.length} no total`;

    document.getElementById("loc-lista").innerHTML = comPosicao
        .slice()
        .sort((a, b) => a.segundos_atras - b.segundos_atras)
        .map(r => {
            const ativo = r.segundos_atras <= _LOC_ATIVO_SEGUNDOS;
            return `<div class="loc-item" onclick="_locFocar(${r.usuario_id})">
                <div style="display:flex;align-items:center;gap:7px">
                    <span style="width:8px;height:8px;border-radius:50%;background:${ativo ? "#22c55e" : "#64748b"};flex-shrink:0"></span>
                    <span style="font-size:13px;font-weight:600;color:#e2e8f0">${r.usuario_nome || "—"}</span>
                </div>
                <div style="font-size:11.5px;color:#64748b;margin-left:15px">${_locTextoTempo(r.segundos_atras)}</div>
            </div>`;
        }).join("") || `<div style="color:#4a6a8a;font-size:13px;text-align:center;padding:20px 8px">Nenhum entregador compartilhando localização ainda.</div>`;
}

function _locFocar(usuarioId) {
    const marker = _locMarkers[usuarioId];
    if (!marker) return;
    _locMap.setView(marker.getLatLng(), 15);
    marker.openPopup();
}
