// ───── BAIXAS — TOTAL EXPRESS (ENTREGADOR) ─────
let _bteFotoBase64   = null;
let _bteFotoMimeType = null;
let _bteScanControls = null;

function abrirBaixaTotalExpress(event) {
    if (event) event.preventDefault();
    _bteLimparForm();
    mostrarTela("tela-baixa-te");
    _bteCarregarHistorico();
}

function _bteLimparForm() {
    _bteFotoBase64 = null;
    _bteFotoMimeType = null;
    document.getElementById("bte-cliente").value = "";
    document.getElementById("bte-codigo").value = "";
    document.getElementById("bte-foto-input").value = "";
    document.getElementById("bte-foto-preview").style.display = "none";
    document.getElementById("bte-foto-preview").src = "";
    _bteLimparMsg();
}

function _bteLimparMsg() {
    const el = document.getElementById("bte-form-msg");
    el.style.display = "none"; el.innerHTML = "";
}

function _bteMostrarMsg(msg, tipo) {
    const el = document.getElementById("bte-form-msg");
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _bteFotoSelecionada(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        _bteFotoBase64   = reader.result.split(",")[1];
        _bteFotoMimeType = file.type || "image/jpeg";
        const preview = document.getElementById("bte-foto-preview");
        preview.src = reader.result;
        preview.style.display = "";
    };
    reader.readAsDataURL(file);
}

function _bteEnviarBaixa() {
    const cliente = document.getElementById("bte-cliente").value.trim();
    const codigo  = document.getElementById("bte-codigo").value.trim();

    if (!codigo) return _bteMostrarMsg("Informe o código (digitando ou escaneando).", "erro");
    if (!/tx/i.test(codigo)) return _bteMostrarMsg('O código deve conter "TX".', "erro");
    if (!_bteFotoBase64) return _bteMostrarMsg("Tire a foto da etiqueta antes de enviar.", "erro");

    const btn = document.getElementById("bte-submit-btn");
    btn.disabled = true; btn.textContent = "Enviando...";

    fetch(`${API}/baixas/total-express`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            nome_cliente: cliente || null,
            codigo,
            foto_base64: _bteFotoBase64,
            foto_mime_type: _bteFotoMimeType
        })
    }).then(r => r.json())
    .then(d => {
        btn.disabled = false; btn.textContent = "Enviar Baixa";
        if (d.error) return _bteMostrarMsg(d.error, "erro");
        _bteLimparForm();
        _bteMostrarMsg("Baixa enviada com sucesso!", "ok");
        _bteCarregarHistorico();
    })
    .catch(() => {
        btn.disabled = false; btn.textContent = "Enviar Baixa";
        _bteMostrarMsg("Erro ao enviar a baixa. Tente novamente.", "erro");
    });
}

function _bteCarregarHistorico() {
    const empty  = document.getElementById("bte-hist-empty");
    const result = document.getElementById("bte-hist-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/baixas/total-express`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(rows => {
        if (!Array.isArray(rows) || !rows.length) {
            empty.innerText = "Nenhuma baixa enviada ainda.";
            return;
        }
        empty.style.display = "none";
        result.style.display = "";
        document.getElementById("bte-hist-tbody").innerHTML = rows.map(r => `
            <tr>
                <td data-label="Código">${r.codigo}</td>
                <td data-label="Cliente">${r.nome_cliente || "—"}</td>
                <td data-label="Data/Hora" style="color:#64748b;font-size:12px">${r.data_hora_brasilia || "—"}</td>
            </tr>`).join("");
    }).catch(() => {
        empty.innerText = "Erro ao carregar histórico.";
    });
}

// ───── SCANNER DE CÓDIGO (CÂMERA) ─────

function _bteAbrirScanner() {
    if (document.getElementById("bte-scan-overlay")) return;
    if (typeof ZXingBrowser === "undefined") {
        gcAlert("Leitor de código indisponível no momento. Digite o código manualmente.");
        return;
    }

    const overlay = document.createElement("div");
    overlay.id = "bte-scan-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="width:100%;max-width:420px;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box">
            <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Aponte a câmera para o código</div>
            <video id="bte-scan-video" style="width:100%;border-radius:10px;background:#000;display:block" muted playsinline></video>
            <div id="bte-scan-erro" style="color:#f87171;font-size:13px;margin-top:10px;display:none"></div>
            <button id="bte-scan-cancelar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#bte-scan-cancelar").addEventListener("click", _bteFecharScanner);
    document.addEventListener("keydown", _bteScanEscKey);
    window.addEventListener("blur", _bteFecharScanner);
    document.addEventListener("visibilitychange", _bteScanVisibilidade);

    const videoEl = overlay.querySelector("#bte-scan-video");
    const reader  = new ZXingBrowser.BrowserMultiFormatReader();
    reader.decodeFromVideoDevice(undefined, videoEl, (result, err, controls) => {
        _bteScanControls = controls;
        if (result) {
            document.getElementById("bte-codigo").value = result.getText();
            _bteFecharScanner();
        }
    }).catch(() => {
        const erroEl = overlay.querySelector("#bte-scan-erro");
        erroEl.textContent = "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
        erroEl.style.display = "";
    });
}

function _bteScanEscKey(e) {
    if (e.key === "Escape") _bteFecharScanner();
}

function _bteScanVisibilidade() {
    if (document.hidden) _bteFecharScanner();
}

function _bteFecharScanner() {
    if (_bteScanControls) { _bteScanControls.stop(); _bteScanControls = null; }
    const overlay = document.getElementById("bte-scan-overlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", _bteScanEscKey);
    window.removeEventListener("blur", _bteFecharScanner);
    document.removeEventListener("visibilitychange", _bteScanVisibilidade);
}
