// ───── CÂMERA DENTRO DA PÁGINA (foto de devolução, baixa, saca, transferência) ─────
// O <input type="file" capture> abre o APP de câmera do celular. Enquanto ele está na
// frente, o Android pode matar a aba do Chrome pra liberar memória (aparelho simples,
// câmera de muitos megapixels). Ao clicar no "certinho" a aba recarrega do zero, a
// rota devolve a mesma tela — vazia — e a foto se perde sem aviso nenhum. Era o
// "volta pra tela sem anexar" do entregador.
//
// Aqui a câmera roda dentro da própria página (getUserMedia): o Chrome não sai da
// frente, então não tem o que matar. O <input capture> continua existindo como
// reserva, pra aparelho sem acesso à câmera pelo navegador.
let _xmCamStream  = null;
let _xmCamResolve = null;
let _xmCamInputId = null;

// Abre a câmera e devolve a foto já comprimida ({ dataUrl, base64 }) — ou null se
// cancelou ou se caiu na reserva (aí quem responde é o onchange do próprio input).
function xmCameraFoto(inputReservaId, titulo) {
    if (document.getElementById("xm-cam-overlay")) return Promise.resolve(null);
    _xmCamInputId = inputReservaId;

    // Sem getUserMedia (http://, navegador antigo) a reserva precisa sair AGORA,
    // ainda dentro do toque: depois de um await o navegador não abre mais o seletor.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        _xmCamUsarReserva();
        return Promise.resolve(null);
    }

    const overlay = document.createElement("div");
    overlay.id = "xm-cam-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#000;display:flex;flex-direction:column");
    // object-fit:contain — o que aparece na tela é exatamente o que vai na foto.
    overlay.innerHTML = `
        <div style="padding:14px 16px;color:#f1f5f9;font-size:15px;font-weight:700">${titulo || "Tirar foto"}</div>
        <div style="flex:1;position:relative;min-height:0">
            <video id="xm-cam-video" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;background:#000" muted playsinline autoplay></video>
            <img id="xm-cam-preview" alt="" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;display:none">
            <div id="xm-cam-erro" style="display:none;position:absolute;left:16px;right:16px;top:40%;color:#f87171;font-size:14px;text-align:center"></div>
        </div>
        <div style="padding:16px 16px calc(18px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;gap:12px">
            <button id="xm-cam-cancelar" style="flex:1;padding:12px;border:none;background:none;color:#94a3b8;font-size:15px;font-family:inherit;text-align:left;cursor:pointer">Cancelar</button>
            <button id="xm-cam-disparar" aria-label="Tirar foto" disabled style="width:68px;height:68px;border-radius:50%;border:4px solid rgba(255,255,255,0.35);background:#fff;background-clip:padding-box;cursor:pointer;flex:none;opacity:0.4"></button>
            <button id="xm-cam-usar" style="display:none;flex:none;padding:12px 18px;border-radius:10px;border:none;background:#3a86ff;color:#fff;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer">Usar foto</button>
            <button id="xm-cam-reserva" style="display:none;flex:none;padding:12px 18px;border-radius:10px;border:none;background:#3a86ff;color:#fff;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer">Abrir câmera do celular</button>
            <div style="flex:1"></div>
        </div>`;
    document.body.appendChild(overlay);

    const video     = overlay.querySelector("#xm-cam-video");
    const preview   = overlay.querySelector("#xm-cam-preview");
    const disparar  = overlay.querySelector("#xm-cam-disparar");
    const usar      = overlay.querySelector("#xm-cam-usar");
    const cancelar  = overlay.querySelector("#xm-cam-cancelar");
    let foto = null;

    const mostrarErro = (msg) => {
        const el = overlay.querySelector("#xm-cam-erro");
        el.textContent = msg;
        el.style.display = "";
        disparar.style.display = "none";
        overlay.querySelector("#xm-cam-reserva").style.display = "";
    };

    const voltarPraCamera = () => {
        foto = null;
        preview.style.display = "none";
        video.style.display = "";
        disparar.style.display = "";
        usar.style.display = "none";
        cancelar.textContent = "Cancelar";
    };

    disparar.addEventListener("click", () => {
        if (!video.videoWidth) return;
        foto = _xmCamCapturar(video);
        preview.src = foto.dataUrl;
        preview.style.display = "";
        video.style.display = "none";
        disparar.style.display = "none";
        usar.style.display = "";
        cancelar.textContent = "Tirar outra";
    });
    usar.addEventListener("click", () => _xmCamFechar(foto));
    cancelar.addEventListener("click", () => foto ? voltarPraCamera() : _xmCamFechar(null));
    // Botão novo = toque novo: aqui o navegador ainda aceita abrir o seletor.
    overlay.querySelector("#xm-cam-reserva").addEventListener("click", () => {
        _xmCamFechar(null);
        _xmCamUsarReserva();
    });

    const promessa = new Promise(resolve => { _xmCamResolve = resolve; });

    navigator.mediaDevices.getUserMedia({
        audio: false,
        // 1080p basta: a foto sai com no máximo 1280px, e pedir a resolução máxima
        // do sensor é justamente o que pesa na memória do aparelho simples.
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    }).then(stream => {
        if (!document.getElementById("xm-cam-overlay")) { stream.getTracks().forEach(t => t.stop()); return; }
        _xmCamStream = stream;
        video.srcObject = stream;
        video.play().catch(() => {});
        video.addEventListener("loadedmetadata", () => {
            disparar.disabled = false;
            disparar.style.opacity = "1";
        }, { once: true });
    }).catch(() => {
        mostrarErro("Não deu pra abrir a câmera aqui. Libere a câmera pro site nas permissões do navegador, ou use a câmera do celular.");
    });

    return promessa;
}

// Mesmo tamanho e qualidade do _bteComprimirImagem — a foto chega igual no servidor.
function _xmCamCapturar(video, maxDim = 1280, qualidade = 0.7) {
    let width = video.videoWidth, height = video.videoHeight;
    if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
        else { width = Math.round(width * maxDim / height); height = maxDim; }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", qualidade);
    return { dataUrl, base64: dataUrl.split(",")[1] };
}

function _xmCamFechar(resultado) {
    if (_xmCamStream) { _xmCamStream.getTracks().forEach(t => t.stop()); _xmCamStream = null; }
    const overlay = document.getElementById("xm-cam-overlay");
    if (overlay) overlay.remove();
    const resolve = _xmCamResolve;
    _xmCamResolve = null;
    if (resolve) resolve(resultado);
}

function _xmCamUsarReserva() {
    const input = _xmCamInputId && document.getElementById(_xmCamInputId);
    if (input) input.click();
}
