// ───── DEVOLUÇÕES (ENTREGADOR) ─────
// Pacote que voltou pra base: foto tirada na hora + motivo + transportadora + código
// (ou descrição, quando o código não dá pra identificar). Funciona offline com fila
// própria no celular (mesmo esquema das Baixas Total Express).
let _devFotoBase64   = null;
let _devFotoMimeType = null;

// CEP = 8 dígitos, com ou sem hífen depois do 5º ("00000-000" ou "00000000") e nada
// mais — nunca é um código de rastreio válido. Usado nas duas pontas de Devoluções
// (entregador registrando e admin recebendo) pra barrar código bipado/digitado errado.
const _DEV_CEP_REGEX = /^\d{5}-?\d{3}$/;
function _devEhCep(codigo) {
    return _DEV_CEP_REGEX.test(String(codigo || "").trim());
}

// Viagem "aberta" atual do entregador (cada pedido registrado entra automaticamente
// nela) — id guardado aqui pros botões "Ver pedidos" / "Fechar Viagem".
let _devViagemAtualId = null;

function abrirDevolucaoNova(event) {
    if (event) event.preventDefault();
    _devLimparForm();
    document.getElementById("dev-form-wrap").style.display = "";
    document.getElementById("dev-pedido-sucesso").style.display = "none";
    mostrarTela("tela-devolucao-nova");
    _devAtualizarBadgeFila();
    _devAtualizarBannerViagem();
    _devFilaSincronizar();
}

// Banner "Viagem em andamento" no topo — mostra a viagem aberta atual (se houver)
function _devAtualizarBannerViagem() {
    fetch(`${API}/viagens/aberta`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (!d || !d.aberta) {
                _devViagemAtualId = null;
                const banner = document.getElementById("dev-viagem-banner");
                if (banner) banner.style.display = "none";
                return;
            }
            _devViagemAtualId = d.id;
            _devAtualizarBannerComDados(d);
            // Anti-burro: viagem aberta desde outro dia é fácil de esquecer — avisa
            // toda vez que abrir a tela em vez de confiar só no banner passando batido.
            if (d.de_hoje === false) _devAvisarViagemAntiga(d);
        })
        .catch(() => {});
}

function _devAvisarViagemAntiga(viagem) {
    gcConfirm(
        `Você tem a viagem <strong style="color:#3a86ff;font-family:monospace">${viagem.numero}</strong> aberta desde <strong>${viagem.criada_em || "outro dia"}</strong>, com ${viagem.pedidos} pedido${viagem.pedidos !== 1 ? "s" : ""}. Os pedidos que você registrar agora vão entrar nela. Se ela já não faz mais sentido, feche-a antes de continuar.`,
        () => _devVerPedidosViagemAtual(),
        "Viagem em aberto de outro dia",
        "Ver essa viagem"
    );
}

function _devAtualizarBannerComDados(viagem) {
    const banner = document.getElementById("dev-viagem-banner");
    if (!banner || !viagem) return;
    banner.style.display = "flex";
    document.getElementById("dev-viagem-numero").innerText = viagem.numero;
    document.getElementById("dev-viagem-qtd").innerText = `${viagem.pedidos} pedido${viagem.pedidos !== 1 ? "s" : ""}`;
}

function _devVerPedidosViagemAtual() {
    if (_devViagemAtualId) _vmAbrirDetalhe(_devViagemAtualId);
}

// Card de sucesso após enviar: mostra a viagem e oferece "Adicionar mais" ou "Fechar"
function _devMostrarSucesso(viagem) {
    document.getElementById("dev-form-wrap").style.display = "none";
    document.getElementById("dev-pedido-sucesso").style.display = "";
    document.getElementById("dev-sucesso-numero").innerText = viagem ? viagem.numero : "—";
    document.getElementById("dev-sucesso-qtd").innerText = viagem ? viagem.pedidos : "—";
    if (viagem) {
        _devViagemAtualId = viagem.id;
        _devAtualizarBannerComDados(viagem);
    }
}

function _devAdicionarMais() {
    document.getElementById("dev-pedido-sucesso").style.display = "none";
    document.getElementById("dev-form-wrap").style.display = "";
    const campo = document.getElementById("dev-codigo");
    if (campo) campo.focus();
}

function _devIrFecharViagem() {
    if (_devViagemAtualId) _vfAbrir(_devViagemAtualId);
}

function abrirDevolucoesEnviadas(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-devolucao-enviadas");
    _devCarregarEnviadas();
    _devFilaSincronizar();
}

// ───── FORMULÁRIO (NOVA) ─────
// Chip clicado: guarda o valor no input escondido e marca só ele como ativo
function _devChip(btn, inputId) {
    document.getElementById(inputId).value = btn.dataset.val || btn.textContent.trim();
    btn.parentElement.querySelectorAll(".dev-chip").forEach(c => c.classList.toggle("active", c === btn));
}

// O botão de enviar tem um ícone dentro — restaurar via innerHTML pra não perdê-lo
const _DEV_BTN_HTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
    Enviar Devolução`;

function _devLimparForm() {
    _devFotoBase64 = null;
    _devFotoMimeType = null;
    document.getElementById("dev-motivo").value = "";
    document.getElementById("dev-transportadora").value = "";
    document.querySelectorAll("#tela-devolucao-nova .dev-chip.active").forEach(c => c.classList.remove("active"));
    document.getElementById("dev-codigo").value = "";
    document.getElementById("dev-sem-codigo").checked = false;
    document.getElementById("dev-descricao").value = "";
    document.getElementById("dev-foto-input").value = "";
    document.getElementById("dev-foto-preview").src = "";
    document.getElementById("dev-foto-tile").classList.remove("tem-foto");
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
        document.getElementById("dev-foto-preview").src = dataUrl;
        document.getElementById("dev-foto-tile").classList.add("tem-foto");
    }).catch(() => {
        gcAlert("Não foi possível processar a foto. Tente novamente.");
    });
}

function _devAbrirScanner() {
    _bteAbrirScanner(texto => {
        if (_devEhCep(texto)) {
            _gcBeepErro();
            _devMostrarMsg("Esse código lido é um CEP, não o código do pacote. Escaneie o código de rastreio da etiqueta.", "erro");
            return;
        }
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
    if (!semCodigo && _devEhCep(codigo)) return _devMostrarMsg("Esse código é um CEP, não o código do pacote. Confira o código de rastreio.", "erro");
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
        btn.disabled = false; btn.innerHTML = _DEV_BTN_HTML;
        if (d.error) return _devMostrarMsg(d.error, "erro");
        _devLimparForm();
        _gcBeepSucesso();
        _devMostrarSucesso(d.viagem);
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
        if (btn) { btn.disabled = false; btn.innerHTML = _DEV_BTN_HTML; }
        _devLimparForm();
        _devMostrarMsg("Sem internet agora — a devolução foi <strong>salva no celular</strong> e será enviada automaticamente quando a conexão voltar.", "ok");
        _devAtualizarBadgeFila();
    }).catch(() => {
        if (btn) { btn.disabled = false; btn.innerHTML = _DEV_BTN_HTML; }
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
            if (r.status === 400 || r.status === 409) { await _devFilaRemover(item.id); continue; } // inválida ou código já registrado — reenviar não resolve
            break; // 401/403/5xx — token vencido ou servidor com problema, tenta depois
        }
    } finally {
        _devSincronizando = false;
        _devAtualizarBadgeFila();
        if (enviadas > 0) {
            _gcBeepSucesso();
            const telaEnv = document.getElementById("tela-devolucao-enviadas");
            if (telaEnv && telaEnv.classList.contains("active-view")) _devCarregarEnviadas();
            const telaNova = document.getElementById("tela-devolucao-nova");
            if (telaNova && telaNova.classList.contains("active-view")) {
                _devAtualizarBannerViagem();
                if (document.getElementById("dev-form-wrap").style.display !== "none") {
                    _devMostrarMsg(
                        enviadas === 1
                            ? "A devolução que estava pendente foi <strong>enviada com sucesso</strong>!"
                            : `As ${enviadas} devoluções que estavam pendentes foram <strong>enviadas com sucesso</strong>!`,
                        "ok");
                }
            }
        }
    }
}

// Gatilhos automáticos: internet voltou / app abriu
window.addEventListener("online", () => { _devFilaSincronizar(); });
setTimeout(() => { _devFilaSincronizar(); }, 3500);

// Banner compacto na tela Criar Devolução avisando de devoluções ainda na fila do
// celular (mesmo esquema do "bte-fila-card" das Baixas Total Express).
function _devAtualizarBadgeFila() {
    const card = document.getElementById("dev-fila-card");
    if (!card) return;
    _devFilaListar().then(itens => {
        if (!itens.length) { card.style.display = "none"; card.innerHTML = ""; return; }
        card.style.display = "";
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 16px;border-radius:12px;background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.3);margin-bottom:16px">
                <div style="flex:1;min-width:170px">
                    <div style="font-size:13px;font-weight:700;color:#eab308">${itens.length} devoluç${itens.length > 1 ? "ões" : "ão"} aguardando envio</div>
                    <div style="font-size:12px;color:#94a3b8">Ser${itens.length > 1 ? "ão enviadas" : "á enviada"} automaticamente quando a internet voltar.</div>
                </div>
                <button onclick="_devFilaTentarAgora()" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(234,179,8,0.4);background:rgba(234,179,8,0.12);color:#eab308;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Enviar agora</button>
            </div>`;
    }).catch(() => {});
}

function _devFilaTentarAgora() {
    if (!navigator.onLine) {
        gcAlert("Ainda sem conexão com a internet. As devoluções serão enviadas automaticamente assim que o sinal voltar.");
        return;
    }
    _devFilaSincronizar();
}

// ───── TELA ENVIADO (histórico do servidor) ─────
function _devStatusBadge(r) {
    if (r.status === "recebido") {
        const quando = r.recebido_data_hora_brasilia ? ` title="Recebido por ${r.recebido_por || "—"} em ${r.recebido_data_hora_brasilia}"` : "";
        return `<span${quando} style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;font-size:11.5px;font-weight:700">Recebido no hub</span>`;
    }
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);color:#eab308;font-size:11.5px;font-weight:700">Pendente</span>`;
}

function _devCarregarEnviadas() {
    const empty  = document.getElementById("dev-env-empty");
    const result = document.getElementById("dev-env-resultado");
    skMostrar(empty);
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/devolucoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                skFim(empty, "Nenhuma devolução enviada ainda.");
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("dev-env-tbody").innerHTML = rows.map(r => `
                <tr>
                    <td data-label="Código / Descrição">${r.codigo || (r.descricao ? `<span style="color:#94a3b8">${r.descricao}</span>` : "—")}</td>
                    <td data-label="Transportadora">${r.transportadora || "—"}</td>
                    <td data-label="Motivo">${r.motivo || "—"}</td>
                    <td data-label="Data/Hora">${r.data_hora_brasilia || "—"}</td>
                    <td data-label="Status">${_devStatusBadge(r)}</td>
                </tr>
            `).join("");
        })
        .catch(() => {
            skFim(empty, "Erro ao conectar com o servidor.");
        });
}

// O recebimento agora é por VIAGEM (operação recebe o GC e confere os pedidos) —
// toda a lógica de "Receber" vive em viagens.js (abrirDevolucoesReceber e _vr*).

// Foto da devolução sob demanda (mesmo visual do "Ver foto" das baixas)
function _drVerFoto(id) {
    if (document.getElementById("dr-foto-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "dr-foto-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="max-width:520px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box;text-align:center">
            <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px">Foto do pacote</div>
            <div id="dr-foto-loading" style="color:#64748b;font-size:13px;padding:40px 0">Carregando foto...</div>
            <img id="dr-foto-img" style="display:none;max-width:100%;max-height:65vh;border-radius:10px">
            <button id="dr-foto-fechar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Fechar</button>
        </div>`;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#dr-foto-fechar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    fetch(`${API}/devolucoes/foto/${id}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error || !d.foto_base64) {
                document.getElementById("dr-foto-loading").textContent = "Foto não encontrada.";
                return;
            }
            const img = document.getElementById("dr-foto-img");
            img.src = `data:${d.foto_mime_type || "image/jpeg"};base64,${d.foto_base64}`;
            img.onload = () => {
                document.getElementById("dr-foto-loading").style.display = "none";
                img.style.display = "";
            };
        })
        .catch(() => {
            const l = document.getElementById("dr-foto-loading");
            if (l) l.textContent = "Erro ao carregar a foto.";
        });
}

// ───── REGISTRO (todas as devoluções — equipe da base) ─────
let _drRegistroDados = [];

function abrirDevolucoesRegistro(event) {
    if (event) event.preventDefault();
    document.getElementById("drr-busca").value = "";
    mostrarTela("tela-devolucao-registro");
    _drrCarregar();
}

function _drrCarregar() {
    const empty  = document.getElementById("drr-empty");
    const result = document.getElementById("drr-resultado");
    skMostrar(empty);
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/devolucoes/registro`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                skFim(empty, "Nenhuma devolução registrada ainda.");
                return;
            }
            _drRegistroDados = rows;
            empty.style.display = "none";
            result.style.display = "";
            _drrRenderizar(rows);
        })
        .catch(() => {
            skFim(empty, "Erro ao conectar com o servidor.");
        });
}

function _drrRenderizar(rows) {
    document.getElementById("drr-total").innerText =
        `${rows.length} devoluç${rows.length !== 1 ? "ões" : "ão"}`;
    document.getElementById("drr-tbody").innerHTML = rows.map(r => `
        <tr>
            <td>${r.codigo || (r.descricao ? `<span style="color:#94a3b8">${r.descricao}</span>` : "—")}</td>
            <td>${r.transportadora || "—"}</td>
            <td>${r.motivo || "—"}</td>
            <td>${r.viagem_numero ? `<span style="font-family:monospace;font-weight:700;color:#3a86ff">${r.viagem_numero}</span>` : `<span style="color:#475569">—</span>`}</td>
            <td>${r.sem_registro ? `
                <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;font-size:11.5px;font-weight:700">Não registrada pelo entregador</span>` : `
                <div style="color:#e2e8f0">${r.usuario_nome || "—"}</div>
                <div style="font-size:11.5px;color:#64748b">${r.data_hora_brasilia || "—"}</div>`}
            </td>
            <td>${r.status === "recebido" ? `
                <div style="color:#22c55e;font-weight:600">${r.recebido_por || "Recebido"}</div>
                <div style="font-size:11.5px;color:#64748b">${r.recebido_data_hora_brasilia || "—"}</div>`
                : _devStatusBadge(r)}
            </td>
            <td>${r.tem_foto ? `
                <button class="abte-foto-btn" onclick="_drVerFoto(${r.id})">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Ver foto
                </button>` : `<span style="color:#475569">—</span>`}
            </td>
        </tr>
    `).join("");
}

function _drrFiltrar() {
    const q = document.getElementById("drr-busca").value.trim().toLowerCase();
    if (!q) return _drrRenderizar(_drRegistroDados);
    _drrRenderizar(_drRegistroDados.filter(r =>
        [r.codigo, r.descricao, r.transportadora, r.motivo, r.usuario_nome, r.recebido_por, r.viagem_numero]
            .some(v => String(v || "").toLowerCase().includes(q))
    ));
}
