// ───── OCORRÊNCIAS — PACOTES FALTANTES (ENTREGADOR) ─────
// Pacote atribuído ao entregador que não está fisicamente com ele: só código +
// transportadora, sem foto. Pensado pra escanear vários seguidos — ao enviar um,
// só o código limpa (transportadora continua selecionada) e mostra confirmação.
// Reaproveita helpers globais: _bteAbrirScanner, _devEhCep, _gcBeepSucesso/_gcBeepErro,
// mostrarTela, gcAlert, API, token.
const _PF_TRANSPORTADORAS = ["Loggi", "Shopee", "J&T Express", "Imile", "Anjun", "Total Express"];
let _pfTransp = null;

function abrirPacotesFaltantes(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-pacotes-faltantes");
    _pfRenderChips();
    _pfMsg("", null);
    _pfAtualizarBadgeFila();
    _pfFilaSincronizar();
}

function _pfRenderChips() {
    const wrap = document.getElementById("pf-transp-chips");
    if (wrap.childElementCount) return; // já renderizado
    wrap.innerHTML = _PF_TRANSPORTADORAS.map(t =>
        `<button type="button" class="dev-chip" data-transp="${t}" onclick="_pfSelecionarTransp('${t.replace(/'/g, "\\'")}')">${t}</button>`
    ).join("");
}

function _pfSelecionarTransp(valor) {
    _pfTransp = valor;
    document.querySelectorAll("#pf-transp-chips .dev-chip").forEach(c =>
        c.classList.toggle("active", c.dataset.transp === valor));
}

function _pfMsg(msg, tipo) {
    const el = document.getElementById("pf-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _pfAbrirScanner() {
    _bteAbrirScanner(texto => {
        if (_devEhCep(texto)) {
            _gcBeepErro();
            _pfMsg("Esse código lido é um CEP, não o código do pacote. Escaneie o código de rastreio da etiqueta.", "erro");
            return;
        }
        document.getElementById("pf-codigo").value = texto;
        _pfEnviar();
    });
}

function _pfCodigoEnter(e) { if (e.key === "Enter") { e.preventDefault(); _pfEnviar(); } }

function _pfEnviar() {
    const codigo = document.getElementById("pf-codigo").value.trim();
    if (!_pfTransp) return _pfMsg("Selecione a transportadora.", "erro");
    if (!codigo)    return _pfMsg("Informe o código do pacote (digitando ou escaneando).", "erro");
    if (_devEhCep(codigo)) return _pfMsg("Esse código é um CEP, não o código do pacote. Confira o código de rastreio.", "erro");

    const btn = document.getElementById("pf-submit-btn");
    btn.disabled = true; btn.textContent = "Registrando...";

    const payload = {
        codigo, transportadora: _pfTransp,
        capturada_em: new Date().toISOString(),
        foi_offline: false // só vira true se realmente cair na fila, abaixo
    };

    const _restaurarBtn = () => {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Registrar Pacote Faltante`;
    };

    if (!navigator.onLine) { payload.foi_offline = true; return _pfGuardarNaFila(payload, _restaurarBtn); }

    fetch(`${API}/pacotes-faltantes`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(r => r.json())
    .then(d => {
        _restaurarBtn();
        if (d.error) return _pfMsg(d.error, "erro");
        _gcBeepSucesso();
        document.getElementById("pf-codigo").value = "";
        document.getElementById("pf-codigo").focus();
        _pfMsg(`✓ Código <strong>${codigo}</strong> registrado como faltante.`, "ok");
    })
    .catch(() => {
        // rede caiu no meio do caminho — guarda no celular em vez de perder
        payload.foi_offline = true;
        _pfGuardarNaFila(payload, _restaurarBtn);
    });
}

// ───── FILA OFFLINE (IndexedDB próprio de pacotes faltantes) ─────
let _pfSincronizando = false;

function _pfAbrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("gc-pacotesfaltantes-offline", 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore("fila", { keyPath: "id", autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

function _pfFilaStore(modo, fn) {
    return _pfAbrirDB().then(db => new Promise((resolve, reject) => {
        const req = fn(db.transaction("fila", modo).objectStore("fila"));
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    }));
}

function _pfFilaAdicionar(payload) { return _pfFilaStore("readwrite", st => st.add({ payload })); }
function _pfFilaListar()           { return _pfFilaStore("readonly",  st => st.getAll()); }
function _pfFilaRemover(id)        { return _pfFilaStore("readwrite", st => st.delete(id)); }

function _pfGuardarNaFila(payload, restaurarBtn) {
    _pfFilaAdicionar(payload).then(() => {
        restaurarBtn();
        document.getElementById("pf-codigo").value = "";
        document.getElementById("pf-codigo").focus();
        _pfMsg("Sem internet agora — o pacote foi <strong>salvo no celular</strong> e será enviado automaticamente quando a conexão voltar.", "ok");
        _pfAtualizarBadgeFila();
    }).catch(() => {
        restaurarBtn();
        _pfMsg("Sem internet e não foi possível salvar no celular. Tente novamente.", "erro");
    });
}

// Envia os pacotes guardados, um a um, parando na primeira falha de rede/servidor
async function _pfFilaSincronizar() {
    if (_pfSincronizando || !navigator.onLine) return;
    _pfSincronizando = true;
    let enviados = 0;
    try {
        const itens = await _pfFilaListar();
        for (const item of itens) {
            let r;
            try {
                r = await fetch(`${API}/pacotes-faltantes`, {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                    body: JSON.stringify(item.payload)
                });
                await r.json();
            } catch (e) { break; } // sem rede/servidor fora — tenta na próxima
            if (r.ok) { await _pfFilaRemover(item.id); enviados++; continue; }
            if (r.status === 400 || r.status === 409) { await _pfFilaRemover(item.id); continue; } // inválido — reenviar não resolve
            break; // 401/403/5xx — token vencido ou servidor com problema, tenta depois
        }
    } finally {
        _pfSincronizando = false;
        _pfAtualizarBadgeFila();
        if (enviados > 0) {
            _gcBeepSucesso();
            const telaReg = document.getElementById("tela-pacotes-faltantes-registro");
            if (telaReg && telaReg.classList.contains("active-view")) _pfCarregarRegistro();
        }
    }
}

window.addEventListener("online", () => { _pfFilaSincronizar(); });

function _pfAtualizarBadgeFila() {
    const card = document.getElementById("pf-fila-card");
    if (!card) return;
    _pfFilaListar().then(itens => {
        if (!itens.length) { card.style.display = "none"; card.innerHTML = ""; return; }
        card.style.display = "";
        card.innerHTML = `
            <div style="max-width:560px;margin:0 auto 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 16px;border-radius:12px;background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.3)">
                <div style="flex:1;min-width:170px">
                    <div style="font-size:13px;font-weight:700;color:#eab308">${itens.length} pacote${itens.length > 1 ? "s" : ""} aguardando envio</div>
                    <div style="font-size:12px;color:#94a3b8">Ser${itens.length > 1 ? "ão enviados" : "á enviado"} automaticamente quando a internet voltar.</div>
                </div>
                <button onclick="_pfFilaTentarAgora()" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(234,179,8,0.4);background:rgba(234,179,8,0.12);color:#eab308;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Enviar agora</button>
            </div>`;
    }).catch(() => {});
}

function _pfFilaTentarAgora() {
    if (!navigator.onLine) {
        gcAlert("Ainda sem conexão com a internet. Os pacotes serão enviados automaticamente assim que o sinal voltar.");
        return;
    }
    _pfFilaSincronizar();
}

// ───── MEUS REGISTROS (histórico do servidor) ─────
function abrirPacotesFaltantesRegistro(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-pacotes-faltantes-registro");
    _pfCarregarRegistro();
}

function _pfCarregarRegistro() {
    const empty  = document.getElementById("pf-reg-empty");
    const result = document.getElementById("pf-reg-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/pacotes-faltantes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                empty.innerText = "Nenhum pacote faltante registrado ainda.";
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("pf-reg-tbody").innerHTML = rows.map(r => `
                <tr>
                    <td data-label="Código" style="font-family:monospace">${r.codigo || "—"}</td>
                    <td data-label="Transportadora">${r.transportadora || "—"}</td>
                    <td data-label="Data/Hora">${r.data_hora_brasilia || "—"}</td>
                </tr>
            `).join("");
        })
        .catch(() => { empty.innerText = "Erro ao carregar os registros."; });
}

// Gatilho automático: app abriu com pacotes pendentes na fila
setTimeout(() => { _pfFilaSincronizar(); }, 3500);
