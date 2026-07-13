// ───── BAIXAS — TOTAL EXPRESS (ENTREGADOR) ─────
let _bteFotoBase64   = null;
let _bteFotoMimeType = null;
let _bteScanStream   = null;
let _bteScanTimer    = null;
let _bteScanReader   = null;
let _bteScanCanvas   = null;
let _bteScanCanvas2  = null;
let _bteDetector     = null; // BarcodeDetector nativo (Android/Chrome) — muito melhor em 1D que o ZXing

function abrirBaixaTotalExpress(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role && role !== "entregador") {
        abrirAdminBaixasTotalExpress();
        return;
    }
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
    _bteComprimirImagem(file).then(({ dataUrl, base64 }) => {
        _bteFotoBase64   = base64;
        _bteFotoMimeType = "image/jpeg";
        const preview = document.getElementById("bte-foto-preview");
        preview.src = dataUrl;
        preview.style.display = "";
    }).catch(() => {
        gcAlert("Não foi possível processar a foto. Tente novamente.");
    });
}

// Redimensiona e recomprime a foto no navegador antes de enviar — etiqueta de celular
// costuma vir com vários MB, e isso ia direto pro banco em base64 (33% maior ainda).
function _bteComprimirImagem(file, maxDim = 1280, qualidade = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
                    else { width = Math.round(width * maxDim / height); height = maxDim; }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width; canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL("image/jpeg", qualidade);
                resolve({ dataUrl, base64: dataUrl.split(",")[1] });
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
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
// Proporção da área de leitura marcada na tela (relativa ao vídeo) — só essa região
// é recortada e decodificada, ignorando o resto do frame (fundo, mão, mesa etc.).
const _BTE_SCAN_AREA_W = 0.90;
const _BTE_SCAN_AREA_H = 0.20;

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
            <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Alinhe o código dentro da área marcada</div>
            <div style="position:relative;width:100%;border-radius:10px;overflow:hidden">
                <video id="bte-scan-video" style="width:100%;display:block;background:#000" muted playsinline></video>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${_BTE_SCAN_AREA_W*100}%;height:${_BTE_SCAN_AREA_H*100}%;border:2px solid #3a86ff;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);pointer-events:none"></div>
            </div>
            <div id="bte-scan-erro" style="color:#f87171;font-size:13px;margin-top:10px;display:none"></div>
            <button id="bte-scan-cancelar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#bte-scan-cancelar").addEventListener("click", _bteFecharScanner);
    document.addEventListener("keydown", _bteScanEscKey);
    window.addEventListener("blur", _bteFecharScanner);
    document.addEventListener("visibilitychange", _bteScanVisibilidade);

    const videoEl = overlay.querySelector("#bte-scan-video");

    // O bundle UMD do ZXing não exporta os enums BarcodeFormat/DecodeHintType, então
    // usamos os valores numéricos como fallback (conferidos no fonte da lib).
    const FMT = ZXingBrowser.BarcodeFormat ||
        { QR_CODE: 11, CODE_128: 4, CODE_39: 2, EAN_13: 7, ITF: 8, DATA_MATRIX: 5 };
    const hints = new Map();
    // 2 = POSSIBLE_FORMATS: só os formatos usados em etiqueta de transportadora
    hints.set(2, [FMT.QR_CODE, FMT.CODE_128, FMT.CODE_39, FMT.EAN_13, FMT.ITF, FMT.DATA_MATRIX]);
    // 3 = TRY_HARDER: varre mais linhas por frame — sem isso o 1D (código reto) quase não lê
    hints.set(3, true);
    _bteScanReader = new ZXingBrowser.BrowserMultiFormatReader(hints);

    // Detector nativo do navegador (Android/Chrome usa o motor do Google Lens):
    // lê código de barras 1D com folga onde o ZXing falha. Se não existir, fica o ZXing.
    _bteDetector = null;
    if (window.BarcodeDetector) {
        try {
            _bteDetector = new BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "itf", "data_matrix"] });
        } catch (e) { _bteDetector = null; }
    }

    navigator.mediaDevices.getUserMedia({
        // 1080p: código de barras denso precisa de mais pixels por barra que QR code
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, focusMode: "continuous" }
    }).then(stream => {
        _bteScanStream = stream;
        videoEl.srcObject = stream;
        videoEl.play();
        _bteScanTimer = setTimeout(_bteScanLoop, 300);
    }).catch(() => {
        const erroEl = overlay.querySelector("#bte-scan-erro");
        erroEl.textContent = "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
        erroEl.style.display = "";
    });
}

// Recorta só a área marcada (em pixels do vídeo, não da tela) e tenta decodificar
// apenas ali — menos pixels por tentativa e ignora o fundo desfocado ao redor.
function _bteScanLoop() {
    if (!_bteScanReader) return;
    const videoEl = document.getElementById("bte-scan-video");
    if (!videoEl || !videoEl.videoWidth) {
        _bteScanTimer = setTimeout(_bteScanLoop, 150);
        return;
    }
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    const sw = Math.round(vw * _BTE_SCAN_AREA_W), sh = Math.round(vh * _BTE_SCAN_AREA_H);
    const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);

    if (!_bteScanCanvas) _bteScanCanvas = document.createElement("canvas");
    _bteScanCanvas.width = sw; _bteScanCanvas.height = sh;
    _bteScanCanvas.getContext("2d").drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);

    _bteScanDecodificar(_bteScanCanvas).then(texto => {
        if (!_bteScanReader) return; // scanner foi fechado enquanto decodificava
        if (texto) {
            document.getElementById("bte-codigo").value = texto;
            _bteFecharScanner();
            return;
        }
        _bteScanTimer = setTimeout(_bteScanLoop, 120);
    });
}

// Ordem de tentativa: BarcodeDetector nativo → ZXing → ZXing com o recorte ampliado 2x
// (código denso filmado de perto fica com ~3px por barra, pouco pro binarizador do ZXing).
async function _bteScanDecodificar(canvas) {
    if (_bteDetector) {
        try {
            const codigos = await _bteDetector.detect(canvas);
            return (codigos && codigos.length && codigos[0].rawValue) || null;
        } catch (e) {
            _bteDetector = null; // detector nativo indisponível de verdade — segue só com ZXing
        }
    }
    try {
        return _bteScanReader.decodeFromCanvas(canvas).getText();
    } catch (e) { /* nenhum código nesse frame — tenta ampliado */ }
    try {
        if (!_bteScanCanvas2) _bteScanCanvas2 = document.createElement("canvas");
        _bteScanCanvas2.width = canvas.width * 2; _bteScanCanvas2.height = canvas.height * 2;
        const ctx = _bteScanCanvas2.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0, _bteScanCanvas2.width, _bteScanCanvas2.height);
        return _bteScanReader.decodeFromCanvas(_bteScanCanvas2).getText();
    } catch (e) { return null; }
}

function _bteScanEscKey(e) {
    if (e.key === "Escape") _bteFecharScanner();
}

function _bteScanVisibilidade() {
    if (document.hidden) _bteFecharScanner();
}

function _bteFecharScanner() {
    if (_bteScanTimer) { clearTimeout(_bteScanTimer); _bteScanTimer = null; }
    if (_bteScanStream) { _bteScanStream.getTracks().forEach(t => t.stop()); _bteScanStream = null; }
    _bteScanReader = null;
    _bteDetector   = null;
    const overlay = document.getElementById("bte-scan-overlay");
    if (overlay) overlay.remove();
    document.removeEventListener("keydown", _bteScanEscKey);
    window.removeEventListener("blur", _bteFecharScanner);
    document.removeEventListener("visibilitychange", _bteScanVisibilidade);
}

// ───── BAIXAS — TOTAL EXPRESS (ADMIN/FINANCE/DEV) ─────
let _abteDados     = [];
let _abteFiltrados = [];
let _abtePagina    = 1;
let _abtePorPagina = 25;

function abrirAdminBaixasTotalExpress(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-admin-baixas-te");
    _abteCarregar();
}

function _abteCarregar() {
    const empty = document.getElementById("abte-empty");
    const lista = document.getElementById("abte-lista");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    lista.style.display = "none";

    fetch(`${API}/admin/baixas/total-express`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(rows => {
        if (!Array.isArray(rows)) { empty.innerText = rows.error || "Erro ao carregar baixas."; return; }
        _abteDados = rows;
        const filtro = document.getElementById("abte-filtro-input");
        if (filtro) filtro.value = "";
        _abteRenderizar(rows);
    }).catch(() => {
        empty.innerText = "Erro ao carregar baixas.";
    });
}

function _abteRenderizar(rows) {
    const empty = document.getElementById("abte-empty");
    const lista = document.getElementById("abte-lista");
    _abteFiltrados = rows;
    _abtePagina = 1;

    if (!rows.length) {
        empty.innerText = "Nenhuma baixa encontrada.";
        empty.style.display = "";
        lista.style.display = "none";
        return;
    }
    document.getElementById("abte-counter").innerText = `${rows.length.toLocaleString("pt-BR")} baixa${rows.length !== 1 ? "s" : ""}`;
    empty.style.display = "none";
    lista.style.display = "";
    _abteRenderizarPagina();
}

function _abteRenderizarPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_abteFiltrados.length / _abtePorPagina));
    _abtePagina = Math.min(Math.max(1, _abtePagina), totalPaginas);
    const inicio = (_abtePagina - 1) * _abtePorPagina;
    const pagina = _abteFiltrados.slice(inicio, inicio + _abtePorPagina);

    document.getElementById("abte-tbody").innerHTML = pagina.map(r => `
        <tr>
            <td style="font-family:monospace;font-size:12px">${r.codigo}</td>
            <td>${r.nome_cliente || "—"}</td>
            <td>${r.usuario_nome || "—"}</td>
            <td style="font-size:12px;white-space:nowrap;color:#94a3b8">${r.data_hora_brasilia || "—"}</td>
            <td>
                <button class="abte-foto-btn" onclick="_abteVerFoto(${r.id})">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Ver foto
                </button>
            </td>
        </tr>`).join("");

    document.getElementById("abte-pagina-info").innerText = `Página ${_abtePagina} de ${totalPaginas}`;
}

function _abteMudarPorPagina() {
    _abtePorPagina = parseInt(document.getElementById("abte-por-pagina").value, 10);
    _abtePagina = 1;
    _abteRenderizarPagina();
}

function _abtePaginaAnterior() {
    if (_abtePagina <= 1) return;
    _abtePagina--;
    _abteRenderizarPagina();
}

function _abteProximaPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_abteFiltrados.length / _abtePorPagina));
    if (_abtePagina >= totalPaginas) return;
    _abtePagina++;
    _abteRenderizarPagina();
}

function _abteFiltrarLocal() {
    const termo = document.getElementById("abte-filtro-input").value.trim().toLowerCase();
    if (!termo) { _abteRenderizar(_abteDados); return; }
    const filtrado = _abteDados.filter(r =>
        (r.codigo       || "").toLowerCase().includes(termo) ||
        (r.nome_cliente || "").toLowerCase().includes(termo) ||
        (r.usuario_nome || "").toLowerCase().includes(termo)
    );
    _abteRenderizar(filtrado);
}

function _abteVerFoto(id) {
    if (document.getElementById("abte-foto-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "abte-foto-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="max-width:520px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box;text-align:center">
            <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Foto da etiqueta</div>
            <div id="abte-foto-loading" style="color:#64748b;font-size:13px;padding:40px 0">Carregando foto...</div>
            <img id="abte-foto-img" style="display:none;max-width:100%;max-height:65vh;border-radius:10px">
            <button id="abte-foto-fechar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Fechar</button>
        </div>`;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#abte-foto-fechar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    fetch(`${API}/admin/baixas/total-express/${id}/foto`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d.error || !d.foto_base64) {
            document.getElementById("abte-foto-loading").textContent = "Foto não encontrada.";
            return;
        }
        const img = document.getElementById("abte-foto-img");
        img.src = `data:${d.foto_mime_type || "image/jpeg"};base64,${d.foto_base64}`;
        img.onload = () => {
            img.style.display = "";
            document.getElementById("abte-foto-loading").style.display = "none";
        };
    }).catch(() => {
        document.getElementById("abte-foto-loading").textContent = "Erro ao carregar a foto.";
    });
}
