// ───── TRANSFERÊNCIAS (MOTORISTA) ─────
// Uma viagem por dia por motorista (criada automaticamente na 1ª entrega do dia).
// Cada entrega = 1 destino: foto da carga + nome do recebedor + assinatura dele.
// Reaproveita helpers globais: _bteComprimirImagem, _gcBeepSucesso/_gcBeepErro,
// mostrarTela, gcAlert, API, token.
let _trfDestinos      = [];  // [{id, nome}] — mesma planilha de cadastro usada nas Etiquetas
let _trfFotoBase64    = null;
let _trfFotoMimeType  = null;
let _trfSignaturePad  = null;
let _trfLocalizacao   = null; // {latitude, longitude, precisao} — confirmada no destino, obrigatória pra registrar

function abrirTransferenciaNova(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-transferencia-nova");
    _trfLimparForm();
    _trfCarregarDestinos();
    _trfAtualizarBanner();
    _trfPedirLocalizacao();
    setTimeout(_trfInicializarAssinatura, 50); // espera o canvas ficar visível (tamanho real)
}

// Pede a localização ativamente (diferente do compartilhamento passivo do
// entregador): aqui é pra provar onde a carga foi deixada, então precisa mesmo
// que o navegador pergunte a permissão na hora, se ainda não tiver decidido.
function _trfPedirLocalizacao() {
    _trfLocalizacao = null;
    const el = document.getElementById("trf-localizacao-status");
    if (!el) return;
    if (!navigator.geolocation) {
        el.innerHTML = `<span style="color:#ef4444">✕ Seu navegador não suporta localização.</span>`;
        return;
    }
    el.innerHTML = `<span style="color:#94a3b8">Confirmando sua localização…</span>`;
    navigator.geolocation.getCurrentPosition(pos => {
        _trfLocalizacao = {
            latitude:  pos.coords.latitude,
            longitude: pos.coords.longitude,
            precisao:  Math.round(pos.coords.accuracy || 0)
        };
        el.innerHTML = `<span style="color:#22c55e">✓ Localização confirmada (±${_trfLocalizacao.precisao}m)</span>`;
    }, () => {
        el.innerHTML = `<span style="color:#ef4444">⚠ Permita o acesso à localização pra poder registrar a entrega.</span> <button type="button" onclick="_trfPedirLocalizacao()" style="margin-left:6px;background:none;border:none;color:#3a86ff;font-size:12.5px;font-weight:700;cursor:pointer;text-decoration:underline;font-family:inherit">Tentar de novo</button>`;
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
}

function _trfAtualizarBanner() {
    fetch(`${API}/transferencias/atual`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            const banner = document.getElementById("trf-viagem-banner");
            if (!d || !d.existe) { banner.style.display = "none"; return; }
            banner.style.display = "flex";
            document.getElementById("trf-viagem-numero").innerText = d.numero;
            document.getElementById("trf-viagem-qtd").innerText = `${d.entregas} entrega${d.entregas !== 1 ? "s" : ""} hoje`;
        })
        .catch(() => {});
}

function _trfCarregarDestinos() {
    if (_trfDestinos.length) return;
    fetch(`${API}/etiquetas/entregadores`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows)) return;
            _trfDestinos = rows;
            document.getElementById("trf-destino-datalist").innerHTML =
                rows.map(d => `<option value="${d.id.replace(/"/g, "&quot;")}">${d.nome.replace(/</g, "&lt;")}</option>`).join("");
        })
        .catch(() => _trfMsg("Erro ao carregar a lista de destinos.", "erro"));
}

function _trfDestinoAtual() {
    const id = document.getElementById("trf-destino").value.trim();
    return _trfDestinos.find(d => d.id === id) || null;
}

function _trfDestinoMudou() {
    const d = _trfDestinoAtual();
    const row = document.getElementById("trf-destino-id-row");
    if (d) { row.style.display = ""; document.getElementById("trf-destino-id").innerText = d.id; }
    else row.style.display = "none";
}

function _trfTirarFoto() {
    document.getElementById("trf-foto-input").click();
}

function _trfFotoSelecionada(input) {
    const file = input.files[0];
    if (!file) return;
    _bteComprimirImagem(file).then(({ dataUrl, base64 }) => {
        _trfFotoBase64   = base64;
        _trfFotoMimeType = "image/jpeg";
        document.getElementById("trf-foto-preview").src = dataUrl;
        document.getElementById("trf-foto-tile").classList.add("tem-foto");
    }).catch(() => gcAlert("Não foi possível processar a foto. Tente novamente."));
}

// Canvas em alta resolução (devicePixelRatio) — sem isso a assinatura sai borrada
// em celular com tela retina/alta densidade.
function _trfInicializarAssinatura() {
    const canvas = document.getElementById("trf-assinatura-canvas");
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    if (_trfSignaturePad) _trfSignaturePad.clear();
    else _trfSignaturePad = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)" });
}

function _trfLimparAssinatura() {
    if (_trfSignaturePad) _trfSignaturePad.clear();
}

function _trfMsg(msg, tipo) {
    const el = document.getElementById("trf-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _trfLimparForm() {
    _trfFotoBase64 = null;
    _trfFotoMimeType = null;
    document.getElementById("trf-destino").value = "";
    document.getElementById("trf-destino-id-row").style.display = "none";
    document.getElementById("trf-foto-input").value = "";
    document.getElementById("trf-foto-preview").src = "";
    document.getElementById("trf-foto-tile").classList.remove("tem-foto");
    document.getElementById("trf-recebedor").value = "";
    if (_trfSignaturePad) _trfSignaturePad.clear();
    _trfMsg("", null);
}

function _trfEnviar() {
    const destino = _trfDestinoAtual();
    if (!destino) return _trfMsg("Selecione um destino válido da lista (digite e escolha uma das opções).", "erro");
    if (!_trfFotoBase64) return _trfMsg("Tire a foto da carga no destino.", "erro");
    const recebedor = document.getElementById("trf-recebedor").value.trim();
    if (!recebedor) return _trfMsg("Informe o nome de quem recebeu a carga.", "erro");
    if (!_trfSignaturePad || _trfSignaturePad.isEmpty()) return _trfMsg("Peça pro recebedor assinar no campo de assinatura.", "erro");
    if (!_trfLocalizacao) return _trfMsg("Confirme sua localização antes de registrar (veja o aviso acima da assinatura).", "erro");

    const assinaturaBase64 = _trfSignaturePad.toDataURL("image/png").split(",")[1];

    const btn = document.getElementById("trf-submit-btn");
    btn.disabled = true; btn.textContent = "Registrando...";

    fetch(`${API}/transferencias`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            destino_id: destino.id, destino_nome: destino.nome,
            foto_base64: _trfFotoBase64, foto_mime_type: _trfFotoMimeType,
            recebedor_nome: recebedor, assinatura_base64: assinaturaBase64,
            latitude: _trfLocalizacao.latitude, longitude: _trfLocalizacao.longitude, precisao: _trfLocalizacao.precisao
        })
    }).then(r => r.json())
    .then(d => {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Registrar Entrega`;
        if (d.error) return _trfMsg(d.error, "erro");
        _gcBeepSucesso();
        _trfLimparForm();
        _trfPedirLocalizacao(); // reconfirma a localização pra próxima entrega (pode ser em outro lugar)
        _trfMsg(`✓ Entrega em <strong>${destino.nome}</strong> registrada.`, "ok");
        if (d.viagem) {
            document.getElementById("trf-viagem-banner").style.display = "flex";
            document.getElementById("trf-viagem-numero").innerText = d.viagem.numero;
            document.getElementById("trf-viagem-qtd").innerText = `${d.viagem.entregas} entrega${d.viagem.entregas !== 1 ? "s" : ""} hoje`;
        }
    })
    .catch(() => {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Registrar Entrega`;
        _trfMsg("Erro ao conectar com o servidor.", "erro");
    });
}

// ───── HISTÓRICO (MOTORISTA) ─────
function abrirTransferenciaHistorico(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-transferencia-historico");
    _trfCarregarHistorico();
}

let _trfHistDados = []; // última resposta — o modal de detalhe usa sem buscar de novo

function _trfCarregarHistorico() {
    const empty = document.getElementById("trf-hist-empty");
    const lista = document.getElementById("trf-hist-lista");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    lista.style.display = "none";

    fetch(`${API}/transferencias`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(viagens => {
            if (!Array.isArray(viagens) || !viagens.length) {
                empty.innerText = "Nenhuma viagem registrada ainda.";
                return;
            }
            _trfHistDados = viagens;
            empty.style.display = "none";
            lista.style.display = "";
            lista.innerHTML = viagens.map(v => `
                <div onclick="_trfAbrirDetalheViagem(${v.id})" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:10px;cursor:pointer" onmouseover="this.style.borderColor='rgba(58,134,255,0.35)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
                    <div>
                        <div style="font-size:16px;font-weight:800;color:#3a86ff;font-family:monospace">${v.numero}</div>
                        <div style="font-size:12px;color:#94a3b8;margin-top:2px">${v.data_viagem || "—"}</div>
                    </div>
                    <span style="font-size:12px;color:#64748b">${(v.entregas || []).length} entrega${(v.entregas || []).length !== 1 ? "s" : ""} →</span>
                </div>`).join("");
        })
        .catch(() => { empty.innerText = "Erro ao carregar o histórico."; });
}

// Modal com os recebimentos da viagem clicada — mesmo componente genérico
// (usr-modal-overlay) usado em Minhas Viagens.
function _trfAbrirDetalheViagem(viagemId) {
    const v = _trfHistDados.find(x => x.id === viagemId);
    if (!v) return;

    let overlay = document.getElementById("trf-hist-modal-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "trf-hist-modal-overlay";
        overlay.className = "usr-modal-overlay";
        overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove("open"); };
        document.body.appendChild(overlay);
    }

    const entregasHtml = (v.entregas || []).map(e => `
        <div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:11px 14px;margin-bottom:8px">
            <div style="font-size:13px;font-weight:700;color:#e2e8f0">${e.destino_nome || "—"}</div>
            <div style="font-size:11.5px;color:#94a3b8;margin:2px 0 8px">Recebido por ${e.recebedor_nome || "—"} · ${e.data_hora_brasilia || "—"}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${e.tem_foto ? `<button class="abte-foto-btn" onclick="_trfaVerFoto(${e.id})">Foto</button>` : ""}
                <button class="abte-foto-btn" onclick="_trfaVerAssinatura(${e.id})">Assinatura</button>
                ${e.latitude != null ? `<a href="https://maps.google.com/?q=${e.latitude},${e.longitude}" target="_blank" rel="noopener noreferrer" class="abte-foto-btn" style="text-decoration:none">Ver no mapa</a>` : ""}
            </div>
        </div>`).join("") || `<div style="font-size:12.5px;color:#64748b;padding:6px 0">Nenhuma entrega nesta viagem.</div>`;

    overlay.innerHTML = `<div class="usr-modal" style="max-width:540px;width:calc(100% - 32px)">
        <div style="max-height:70vh;overflow-y:auto">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:4px">
                <div>
                    <div style="font-size:22px;font-weight:800;color:#3a86ff;font-family:monospace">${v.numero}</div>
                    <div style="font-size:12.5px;color:#94a3b8;margin-top:2px">${v.data_viagem || "—"}</div>
                </div>
                <button onclick="document.getElementById('trf-hist-modal-overlay').classList.remove('open')" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;line-height:1">✕</button>
            </div>
            <div style="font-size:11px;font-weight:700;color:#4a6a8a;text-transform:uppercase;letter-spacing:0.05em;margin:14px 0 8px">${(v.entregas || []).length} entrega${(v.entregas || []).length !== 1 ? "s" : ""}</div>
            ${entregasHtml}
        </div>
    </div>`;
    overlay.classList.add("open");
}
