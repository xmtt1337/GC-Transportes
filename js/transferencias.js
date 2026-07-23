// ───── TRANSFERÊNCIAS (MOTORISTA) ─────
// Uma viagem por dia por motorista (criada automaticamente na 1ª entrega do dia).
// Cada entrega = 1 destino: foto da carga + nome do recebedor + assinatura dele.
// Reaproveita helpers globais: _bteComprimirImagem, _gcBeepSucesso/_gcBeepErro,
// mostrarTela, gcAlert, API, token.
let _trfDestinos      = [];  // [{id, nome}] — mesma planilha de cadastro usada nas Etiquetas
let _trfFotoBase64    = null;
let _trfFotoMimeType  = null;
let _trfSignaturePad  = null;

function abrirTransferenciaNova(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-transferencia-nova");
    _trfLimparForm();
    _trfCarregarDestinos();
    _trfAtualizarBanner();
    setTimeout(_trfInicializarAssinatura, 50); // espera o canvas ficar visível (tamanho real)
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

    const assinaturaBase64 = _trfSignaturePad.toDataURL("image/png").split(",")[1];

    const btn = document.getElementById("trf-submit-btn");
    btn.disabled = true; btn.textContent = "Registrando...";

    fetch(`${API}/transferencias`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            destino_id: destino.id, destino_nome: destino.nome,
            foto_base64: _trfFotoBase64, foto_mime_type: _trfFotoMimeType,
            recebedor_nome: recebedor, assinatura_base64: assinaturaBase64
        })
    }).then(r => r.json())
    .then(d => {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Registrar Entrega`;
        if (d.error) return _trfMsg(d.error, "erro");
        _gcBeepSucesso();
        _trfLimparForm();
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
            empty.style.display = "none";
            lista.style.display = "";
            lista.innerHTML = viagens.map(v => `
                <div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:10px">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
                        <span style="font-size:16px;font-weight:800;color:#3a86ff;font-family:monospace">${v.numero}</span>
                        <span style="font-size:12px;color:#64748b">${(v.entregas || []).length} entrega${(v.entregas || []).length !== 1 ? "s" : ""}</span>
                    </div>
                    ${(v.entregas || []).map(e => `
                        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid rgba(255,255,255,0.05)">
                            <div style="flex:1;min-width:0">
                                <div style="font-size:13px;font-weight:600;color:#e2e8f0">${e.destino_nome || "—"}</div>
                                <div style="font-size:11.5px;color:#94a3b8">Recebido por ${e.recebedor_nome || "—"} · ${e.data_hora_brasilia || "—"}</div>
                            </div>
                        </div>`).join("") || `<div style="font-size:12.5px;color:#64748b;padding:6px 0">Nenhuma entrega nesta viagem.</div>`}
                </div>`).join("");
        })
        .catch(() => { empty.innerText = "Erro ao carregar o histórico."; });
}
