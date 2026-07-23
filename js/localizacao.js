// ───── COMPARTILHAMENTO DE LOCALIZAÇÃO (ENTREGADOR) ─────
// Controle de veículo: manda a posição atual periodicamente enquanto o site estiver
// aberto. Só ativa pra quem JÁ concedeu a permissão de geolocalização (a Permissions
// API consulta o estado sem disparar o pedido nativo do navegador) — nunca força o
// pedido por aqui; quem nunca decidiu ou negou simplesmente não é rastreado.
let _locIntervalo = null;

function _locIniciarCompartilhamento() {
    if (!navigator.geolocation) return;
    if (!navigator.permissions || !navigator.permissions.query) return; // sem suporte — não força prompt, não ativa

    navigator.permissions.query({ name: "geolocation" }).then(status => {
        if (status.state === "granted") _locComecarEnvios();
        // Se conceder depois (ex: ao tirar foto de uma baixa), passa a valer no mesmo acesso
        status.onchange = () => {
            if (status.state === "granted") _locComecarEnvios();
            else _locPararEnvios();
        };
    }).catch(() => {});
}

function _locComecarEnvios() {
    if (_locIntervalo) return; // já rodando
    _locEnviarPosicao();
    _locIntervalo = setInterval(_locEnviarPosicao, 60000); // a cada 1 min
}

function _locPararEnvios() {
    if (_locIntervalo) { clearInterval(_locIntervalo); _locIntervalo = null; }
}

function _locEnviarPosicao() {
    navigator.geolocation.getCurrentPosition(pos => {
        fetch(`${API}/localizacao`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({
                latitude:  pos.coords.latitude,
                longitude: pos.coords.longitude,
                precisao:  Math.round(pos.coords.accuracy || 0)
            })
        }).catch(() => {});
    }, () => {}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 45000 });
}
