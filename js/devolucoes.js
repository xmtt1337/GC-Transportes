// ───── DEVOLUÇÕES (ENTREGADOR) ─────
// Pacote que voltou pra base: foto tirada na hora + motivo + transportadora + código
// (ou descrição, quando o código não dá pra identificar). Funciona offline com fila
// própria no celular (mesmo esquema das Baixas Total Express).
let _devFotoBase64   = null;
let _devFotoMimeType = null;

function abrirDevolucaoNova(event) {
    if (event) event.preventDefault();
    _devLimparForm();
    mostrarTela("tela-devolucao-nova");
    _devFilaSincronizar();
}

function abrirDevolucoesPendentes(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-devolucao-pendentes");
    _devRenderPendentes();
    _devFilaSincronizar();
}

function abrirDevolucoesEnviadas(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-devolucao-enviadas");
    _devCarregarEnviadas();
    _devFilaSincronizar();
}

// ───── FORMULÁRIO (NOVA) ─────
function _devLimparForm() {
    _devFotoBase64 = null;
    _devFotoMimeType = null;
    document.getElementById("dev-motivo").value = "";
    document.getElementById("dev-transportadora").value = "";
    document.getElementById("dev-codigo").value = "";
    document.getElementById("dev-sem-codigo").checked = false;
    document.getElementById("dev-descricao").value = "";
    document.getElementById("dev-foto-input").value = "";
    document.getElementById("dev-foto-preview").style.display = "none";
    document.getElementById("dev-foto-preview").src = "";
    _devToggleSemCodigo();
    _devLimparMsg();
}

function _devLimparMsg() {
    const el = document.getElementById("dev-form-msg");
    el.style.display = "none"; el.innerHTML = "";
}

function _devMostrarMsg(msg, tipo) {
    const el = document.getElementById("dev-form-msg");
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _devTirarFoto() {
    document.getElementById("dev-foto-input").click();
}

function _devFotoSelecionada(input) {
    const file = input.files[0];
    if (!file) return;
    // mesma compressão usada nas Baixas (foto de celular vem com vários MB)
    _bteComprimirImagem(file).then(({ dataUrl, base64 }) => {
        _devFotoBase64   = base64;
        _devFotoMimeType = "image/jpeg";
        const preview = document.getElementById("dev-foto-preview");
        preview.src = dataUrl;
        preview.style.display = "";
    }).catch(() => {
        gcAlert("Não foi possível processar a foto. Tente novamente.");
    });
}

function _devAbrirScanner() {
    _bteAbrirScanner(texto => {
        document.getElementById("dev-codigo").value = texto;
        document.getElementById("dev-sem-codigo").checked = false;
        _devToggleSemCodigo();
    });
}

// Marcou "não identificado": esconde o campo do código e mostra a descrição
function _devToggleSemCodigo() {
    const sem = document.getElementById("dev-sem-codigo").checked;
    document.getElementById("dev-codigo-field").style.display    = sem ? "none" : "";
    document.getElementById("dev-descricao-field").style.display = sem ? "" : "none";
    if (sem) document.getElementById("dev-codigo").value = "";
}

function _devEnviar() {
    const motivo         = document.getElementById("dev-motivo").value;
    const transportadora = document.getElementById("dev-transportadora").value;
    const semCodigo      = document.getElementById("dev-sem-codigo").checked;
    const codigo         = document.getElementById("dev-codigo").value.trim();
    const descricao      = document.getElementById("dev-descricao").value.trim();

    if (!_devFotoBase64) return _devMostrarMsg("Tire a foto do pacote antes de enviar.", "erro");
    if (!motivo)         return _devMostrarMsg("Selecione o motivo da devolução.", "erro");
    if (!transportadora) return _devMostrarMsg("Selecione a transportadora.", "erro");
    if (!semCodigo && !codigo) return _devMostrarMsg("Informe o código do pacote (digitando ou escaneando) — ou marque que não foi possível identificar.", "erro");
    if (semCodigo && !descricao) return _devMostrarMsg("Descreva as informações do pacote (nome, produto ou endereço).", "erro");

    const btn = document.getElementById("dev-submit-btn");
    btn.disabled = true; btn.textContent = "Enviando...";

    const payload = {
        transportadora,
        motivo,
        codigo:         semCodigo ? null : codigo,
        descricao:      semCodigo ? descricao : null,
        foto_base64:    _devFotoBase64,
        foto_mime_type: _devFotoMimeType,
        capturada_em:   new Date().toISOString(),
        foi_offline:    false // só vira true se realmente cair na fila, abaixo
    };

    if (!navigator.onLine) { payload.foi_offline = true; return _devGuardarNaFila(payload, btn); }

    fetch(`${API}/devolucoes`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).then(r => r.json())
    .then(d => {
        btn.disabled = false; btn.textContent = "Enviar Devolução";
        if (d.error) return _devMostrarMsg(d.error, "erro");
        _devLimparForm();
        _devMostrarMsg("Devolução enviada com sucesso!", "ok");
        _gcBeepSucesso();
    })
    .catch(() => {
        // rede caiu no meio do caminho — guarda no celular em vez de perder
        payload.foi_offline = true;
        _devGuardarNaFila(payload, btn);
    });
}

// ───── FILA OFFLINE (IndexedDB próprio das devoluções) ─────
let _devSincronizando = false;

function _devAbrirDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("gc-devolucoes-offline", 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore("fila", { keyPath: "id", autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

function _devFilaStore(modo, fn) {
    return _devAbrirDB().then(db => new Promise((resolve, reject) => {
        const req = fn(db.transaction("fila", modo).objectStore("fila"));
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    }));
}

function _devFilaAdicionar(payload) { return _devFilaStore("readwrite", st => st.add({ payload })); }
function _devFilaListar()           { return _devFilaStore("readonly",  st => st.getAll()); }
function _devFilaRemover(id)        { return _devFilaStore("readwrite", st => st.delete(id)); }

function _devGuardarNaFila(payload, btn) {
    _devFilaAdicionar(payload).then(() => {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Devolução"; }
        _devLimparForm();
        _devMostrarMsg("Sem internet agora — a devolução foi <strong>salva no celular</strong> (veja em Pendentes) e será enviada automaticamente quando a conexão voltar.", "ok");
    }).catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Devolução"; }
        _devMostrarMsg("Sem internet e não foi possível salvar no celular. Tente novamente.", "erro");
    });
}

// Envia as devoluções guardadas, uma a uma, parando na primeira falha de rede/servidor
async function _devFilaSincronizar() {
    if (_devSincronizando || !navigator.onLine) return;
    _devSincronizando = true;
    let enviadas = 0;
    try {
        const itens = await _devFilaListar();
        for (const item of itens) {
            let r;
            try {
                r = await fetch(`${API}/devolucoes`, {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                    body: JSON.stringify(item.payload)
                });
                await r.json();
            } catch (e) { break; } // sem rede/servidor fora — tenta na próxima
            if (r.ok) { await _devFilaRemover(item.id); enviadas++; continue; }
            if (r.status === 400) { await _devFilaRemover(item.id); continue; } // inválida — reenviar não resolve
            break; // 401/403/5xx — token vencido ou servidor com problema, tenta depois
        }
    } finally {
        _devSincronizando = false;
        const telaPend = document.getElementById("tela-devolucao-pendentes");
        if (telaPend && telaPend.classList.contains("active-view")) _devRenderPendentes();
        if (enviadas > 0) {
            _gcBeepSucesso();
            const telaEnv = document.getElementById("tela-devolucao-enviadas");
            if (telaEnv && telaEnv.classList.contains("active-view")) _devCarregarEnviadas();
            const telaNova = document.getElementById("tela-devolucao-nova");
            if (telaNova && telaNova.classList.contains("active-view")) {
                _devMostrarMsg(
                    enviadas === 1
                        ? "A devolução que estava pendente foi <strong>enviada com sucesso</strong>!"
                        : `As ${enviadas} devoluções que estavam pendentes foram <strong>enviadas com sucesso</strong>!`,
                    "ok");
            }
        }
    }
}

// Gatilhos automáticos: internet voltou / app abriu
window.addEventListener("online", () => { _devFilaSincronizar(); });
setTimeout(() => { _devFilaSincronizar(); }, 3500);

// ───── TELA PENDENTES (fila do celular) ─────
function _devRenderPendentes() {
    const empty  = document.getElementById("dev-pend-empty");
    const lista  = document.getElementById("dev-pend-lista");
    _devFilaListar().then(itens => {
        if (!itens.length) {
            empty.innerText = "Nenhuma devolução pendente — tudo enviado!";
            empty.style.display = "";
            lista.style.display = "none";
            return;
        }
        empty.style.display = "none";
        lista.style.display = "";
        document.getElementById("dev-pend-aviso").innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 16px;border-radius:12px;background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.3);margin-bottom:16px">
                <div style="flex:1;min-width:170px">
                    <div style="font-size:13px;font-weight:700;color:#eab308">${itens.length} devoluç${itens.length > 1 ? "ões" : "ão"} aguardando envio</div>
                    <div style="font-size:12px;color:#94a3b8">Ser${itens.length > 1 ? "ão enviadas" : "á enviada"} automaticamente quando a internet voltar.</div>
                </div>
                <button onclick="_devFilaTentarAgora()" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(234,179,8,0.4);background:rgba(234,179,8,0.12);color:#eab308;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Enviar agora</button>
            </div>`;
        document.getElementById("dev-pend-cards").innerHTML = itens.map(i => {
            const p = i.payload;
            const quando = p.capturada_em ? new Date(p.capturada_em).toLocaleString("pt-BR") : "—";
            return `
            <div style="display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px;margin-bottom:10px">
                ${p.foto_base64 ? `<img src="data:${p.foto_mime_type || "image/jpeg"};base64,${p.foto_base64}" style="width:54px;height:54px;object-fit:cover;border-radius:8px;flex-shrink:0">` : ""}
                <div style="flex:1;min-width:0">
                    <div style="font-size:13.5px;font-weight:700;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.codigo || p.descricao || "—"}</div>
                    <div style="font-size:12.5px;color:#94a3b8;margin-top:2px">${p.transportadora} · ${p.motivo}</div>
                    <div style="font-size:11.5px;color:#64748b;margin-top:2px">Registrada em ${quando}</div>
                </div>
            </div>`;
        }).join("");
    }).catch(() => {
        empty.innerText = "Erro ao ler as devoluções pendentes deste celular.";
        empty.style.display = "";
        lista.style.display = "none";
    });
}

function _devFilaTentarAgora() {
    if (!navigator.onLine) {
        gcAlert("Ainda sem conexão com a internet. As devoluções serão enviadas automaticamente assim que o sinal voltar.");
        return;
    }
    _devFilaSincronizar().then(() => _devRenderPendentes());
}

// ───── TELA ENVIADO (histórico do servidor) ─────
function _devCarregarEnviadas() {
    const empty  = document.getElementById("dev-env-empty");
    const result = document.getElementById("dev-env-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/devolucoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                empty.innerText = "Nenhuma devolução enviada ainda.";
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("dev-env-tbody").innerHTML = rows.map(r => `
                <tr>
                    <td>${r.codigo || (r.descricao ? `<span style="color:#94a3b8">${r.descricao}</span>` : "—")}</td>
                    <td>${r.transportadora || "—"}</td>
                    <td>${r.motivo || "—"}</td>
                    <td>${r.data_hora_brasilia || "—"}</td>
                </tr>
            `).join("");
        })
        .catch(() => {
            empty.innerText = "Erro ao conectar com o servidor.";
        });
}
