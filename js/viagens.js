// ───── VIAGENS ─────
// Entregador agrupa devoluções (pedidos) numa viagem lacrada + foto da saca e da saca
// no caminhão. A viagem nasce "aberta" (editável) e trava quando a operação recebe.
// Reaproveita helpers globais: _bteAbrirScanner, _bteComprimirImagem, _devEhCep,
// _gcBeepSucesso/_gcBeepErro, mostrarTela, gcAlert, API, token.

// ══════════════════ CRIAR VIAGEM (ENTREGADOR) ══════════════════
let _vcPedidos      = [];   // códigos já adicionados à viagem
let _vcDisponiveis  = [];   // devoluções do entregador sem viagem (códigos válidos)
let _vcSacaBase64   = null;
let _vcCaminhaoBase64 = null;
let _vcFotoMime     = "image/jpeg";

function abrirViagemCriar(event) {
    if (event) event.preventDefault();
    _vcPedidos = [];
    _vcSacaBase64 = null;
    _vcCaminhaoBase64 = null;
    document.getElementById("vc-form").style.display = "";
    document.getElementById("vc-sucesso").style.display = "none";
    document.getElementById("vc-codigo").value = "";
    ["saca", "caminhao"].forEach(t => {
        document.getElementById(`vc-${t}-preview`).src = "";
        document.getElementById(`vc-${t}-tile`).classList.remove("tem-foto");
        document.getElementById(`vc-${t}-input`).value = "";
    });
    _vcMsg("", null);
    _vcRenderLista();
    mostrarTela("tela-viagem-criar");
    _vcCarregarDisponiveis();
}

function _vcMsg(msg, tipo) {
    const el = document.getElementById("vc-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _vcCarregarDisponiveis() {
    fetch(`${API}/viagens/pedidos-disponiveis`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            _vcDisponiveis = Array.isArray(rows) ? rows : [];
            _vcAtualizarInfo();
        })
        .catch(() => { _vcDisponiveis = []; });
}

function _vcAtualizarInfo() {
    const restantes = _vcDisponiveis.filter(d => !_vcPedidos.some(c => c.toUpperCase() === d.codigo.toUpperCase())).length;
    document.getElementById("vc-disp-info").innerText =
        `${restantes} devoluç${restantes !== 1 ? "ões" : "ão"} disponíve${restantes !== 1 ? "is" : "l"} pra adicionar.`;
}

function _vcScan() {
    _bteAbrirScanner(texto => _vcAdicionarCodigo(texto));
}

function _vcCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _vcAdicionarCodigo(document.getElementById("vc-codigo").value); }
}

function _vcAdicionarCodigo(codigoRaw) {
    const codigo = String(codigoRaw || "").trim();
    document.getElementById("vc-codigo").value = "";
    if (!codigo) return;
    if (_devEhCep(codigo)) {
        _gcBeepErro();
        return _vcMsg("Esse código é um CEP, não o código do pacote.", "erro");
    }
    if (_vcPedidos.some(c => c.toUpperCase() === codigo.toUpperCase())) {
        _gcBeepErro();
        return _vcMsg(`O código <strong>${codigo}</strong> já está na viagem.`, "erro");
    }
    const disp = _vcDisponiveis.find(d => d.codigo.toUpperCase() === codigo.toUpperCase());
    if (!disp) {
        _gcBeepErro();
        return _vcMsg(`O código <strong>${codigo}</strong> não está nas suas devoluções disponíveis. Registre a devolução dele primeiro.`, "erro");
    }
    _vcPedidos.push(disp.codigo);
    _gcBeepSucesso();
    _vcMsg("", null);
    _vcRenderLista();
    _vcAtualizarInfo();
    document.getElementById("vc-codigo").focus();
}

function _vcRemover(codigo) {
    _vcPedidos = _vcPedidos.filter(c => c !== codigo);
    _vcRenderLista();
    _vcAtualizarInfo();
}

function _vcRenderLista() {
    const el = document.getElementById("vc-lista");
    if (!_vcPedidos.length) {
        el.innerHTML = `<div style="font-size:12.5px;color:#64748b;padding:6px 0">Nenhum pedido adicionado ainda.</div>`;
        return;
    }
    el.innerHTML = `<div style="font-size:11px;font-weight:700;color:#4a6a8a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${_vcPedidos.length} pedido${_vcPedidos.length !== 1 ? "s" : ""}</div>` +
        _vcPedidos.map(c => {
            const d = _vcDisponiveis.find(x => x.codigo.toUpperCase() === c.toUpperCase()) || {};
            return `
            <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:7px">
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;color:#e2e8f0;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c}</div>
                    ${d.transportadora ? `<div style="font-size:11.5px;color:#94a3b8">${d.transportadora}${d.motivo ? " · " + d.motivo : ""}</div>` : ""}
                </div>
                <button onclick="_vcRemover('${c.replace(/'/g, "\\'")}')" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;line-height:1;flex-shrink:0" title="Remover">✕</button>
            </div>`;
        }).join("");
}

function _vcTirarFoto(tipo) {
    document.getElementById(`vc-${tipo}-input`).click();
}

function _vcFotoSelecionada(tipo, input) {
    const file = input.files[0];
    if (!file) return;
    _bteComprimirImagem(file).then(({ dataUrl, base64 }) => {
        if (tipo === "saca") _vcSacaBase64 = base64; else _vcCaminhaoBase64 = base64;
        document.getElementById(`vc-${tipo}-preview`).src = dataUrl;
        document.getElementById(`vc-${tipo}-tile`).classList.add("tem-foto");
    }).catch(() => gcAlert("Não foi possível processar a foto. Tente novamente."));
}

function _vcCriar() {
    if (!_vcPedidos.length) return _vcMsg("Adicione ao menos um pedido à viagem.", "erro");
    if (!_vcSacaBase64)     return _vcMsg("Tire a foto da saca.", "erro");
    if (!_vcCaminhaoBase64) return _vcMsg("Tire a foto da saca no caminhão.", "erro");

    const btn = document.getElementById("vc-submit-btn");
    btn.disabled = true; btn.textContent = "Criando...";

    fetch(`${API}/viagens`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            codigos: _vcPedidos,
            foto_saca: _vcSacaBase64,
            foto_caminhao: _vcCaminhaoBase64,
            foto_mime_type: _vcFotoMime
        })
    }).then(r => r.json())
    .then(d => {
        btn.disabled = false; btn.textContent = "Criar viagem";
        if (d.error) return _vcMsg(d.error, "erro");
        _gcBeepSucesso();
        document.getElementById("vc-numero-gerado").innerText = d.numero;
        document.getElementById("vc-copiado").innerText = "";
        document.getElementById("vc-form").style.display = "none";
        document.getElementById("vc-sucesso").style.display = "";
    })
    .catch(() => {
        btn.disabled = false; btn.textContent = "Criar viagem";
        _vcMsg("Erro ao criar a viagem. Tente novamente.", "erro");
    });
}

function _vcCopiarNumero() {
    const num = document.getElementById("vc-numero-gerado").innerText;
    navigator.clipboard.writeText(num).then(() => {
        document.getElementById("vc-copiado").innerText = "✓ Copiado!";
        setTimeout(() => { document.getElementById("vc-copiado").innerText = ""; }, 2000);
    });
}

// ══════════════════ MINHAS VIAGENS (ENTREGADOR) ══════════════════
let _vmDetalheId    = null;
let _vmDisponiveis  = [];  // pra editar (adicionar pedidos) na viagem aberta

function abrirViagemMinhas(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-viagem-minhas");
    _vmCarregar();
}

function _vmStatusBadge(status) {
    if (status === "recebida") {
        return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;font-size:11px;font-weight:700">Recebida</span>`;
    }
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);color:#eab308;font-size:11px;font-weight:700">Aberta</span>`;
}

function _vmCarregar() {
    const empty = document.getElementById("vm-empty");
    const lista = document.getElementById("vm-lista");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    lista.style.display = "none";

    fetch(`${API}/viagens`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                empty.innerText = "Você ainda não criou nenhuma viagem.";
                return;
            }
            empty.style.display = "none";
            lista.style.display = "";
            lista.innerHTML = rows.map(v => `
                <div style="display:flex;align-items:center;gap:14px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:10px;flex-wrap:wrap">
                    <div style="flex:1;min-width:180px">
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                            <span style="font-size:17px;font-weight:800;color:#3a86ff;font-family:monospace">${v.numero}</span>
                            ${_vmStatusBadge(v.status)}
                        </div>
                        <div style="font-size:12.5px;color:#94a3b8;margin-top:3px">
                            ${v.pedidos} pedido${v.pedidos !== 1 ? "s" : ""}${v.status === "recebida" ? ` · ${v.pedidos_recebidos} conferido${v.pedidos_recebidos !== 1 ? "s" : ""}` : ""} · ${v.data_hora_brasilia || "—"}
                        </div>
                    </div>
                    <button onclick="_vmAbrirDetalhe(${v.id})" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(58,134,255,0.35);background:rgba(58,134,255,0.08);color:#3a86ff;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Ver / editar</button>
                </div>
            `).join("");
        })
        .catch(() => { empty.innerText = "Erro ao carregar as viagens."; });
}

function _vmAbrirDetalhe(id) {
    _vmDetalheId = id;
    let overlay = document.getElementById("vm-modal-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "vm-modal-overlay";
        overlay.className = "usr-modal-overlay";
        overlay.onclick = e => { if (e.target === overlay) overlay.classList.remove("open"); };
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="usr-modal" style="max-width:540px;width:calc(100% - 32px)">
        <div id="vm-modal-body" style="max-height:70vh;overflow-y:auto"><div style="color:#64748b;font-size:13px;padding:30px 0;text-align:center">Carregando...</div></div>
    </div>`;
    overlay.classList.add("open");
    _vmCarregarDetalhe();
}

function _vmFecharDetalhe() {
    const o = document.getElementById("vm-modal-overlay");
    if (o) o.classList.remove("open");
}

function _vmCarregarDetalhe() {
    Promise.all([
        fetch(`${API}/viagens/${_vmDetalheId}`, { headers: { "Authorization": "Bearer " + token } }).then(r => r.json()),
        fetch(`${API}/viagens/pedidos-disponiveis`, { headers: { "Authorization": "Bearer " + token } }).then(r => r.json()).catch(() => [])
    ]).then(([v, disp]) => {
        _vmDisponiveis = Array.isArray(disp) ? disp : [];
        _vmRenderDetalhe(v);
    }).catch(() => {
        document.getElementById("vm-modal-body").innerHTML = `<div style="color:#ef4444;font-size:13px;padding:24px 0;text-align:center">Erro ao carregar a viagem.</div>`;
    });
}

function _vmRenderDetalhe(v) {
    if (v.error) {
        document.getElementById("vm-modal-body").innerHTML = `<div style="color:#ef4444;font-size:13px;padding:24px 0;text-align:center">${v.error}</div>`;
        return;
    }
    const editavel = v.status === "aberta";
    const pedidosHtml = (v.pedidos || []).map(p => {
        const recebido = p.status === "recebido";
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;margin-bottom:7px">
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#e2e8f0;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.codigo || p.descricao || "—"}</div>
                <div style="font-size:11.5px;color:#94a3b8">${p.transportadora || "—"}${p.motivo ? " · " + p.motivo : ""}</div>
            </div>
            ${recebido
                ? `<span style="font-size:11px;font-weight:700;color:#22c55e;flex-shrink:0">✓ Conferido</span>`
                : (editavel ? `<button onclick="_vmRemoverPedido(${p.id})" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;flex-shrink:0" title="Remover">✕</button>` : `<span style="font-size:11px;color:#eab308;flex-shrink:0">Pendente</span>`)}
        </div>`;
    }).join("") || `<div style="font-size:12.5px;color:#64748b;padding:6px 0">Nenhum pedido nesta viagem.</div>`;

    document.getElementById("vm-modal-body").innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:4px">
            <div>
                <div style="font-size:24px;font-weight:800;color:#3a86ff;font-family:monospace">${v.numero}</div>
                <div style="font-size:12.5px;color:#94a3b8;margin-top:2px">${v.data_hora_brasilia || "—"}</div>
            </div>
            <button onclick="_vmFecharDetalhe()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;line-height:1">✕</button>
        </div>
        <div style="margin:8px 0 16px">${_vmStatusBadge(v.status)}${v.status === "recebida" && v.recebida_por ? `<span style="font-size:12px;color:#64748b;margin-left:8px">por ${v.recebida_por}${v.recebida_data_hora_brasilia ? " em " + v.recebida_data_hora_brasilia : ""}</span>` : ""}</div>

        ${editavel ? `
        <div style="margin-bottom:14px">
            <div class="bte-codigo-row">
                <input type="text" id="vm-add-codigo" class="ant-input" placeholder="Adicionar pedido (escaneie ou digite)" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();_vmAdicionarPedido(this.value);}">
                <button type="button" class="bte-scan-btn" onclick="_vmScanAdicionar()" title="Escanear">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
                </button>
            </div>
            <div id="vm-add-msg" style="display:none;margin-top:8px"></div>
        </div>` : ""}

        <div style="font-size:11px;font-weight:700;color:#4a6a8a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${(v.pedidos || []).length} pedido${(v.pedidos || []).length !== 1 ? "s" : ""}</div>
        ${pedidosHtml}

        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
            <button onclick="_vmVerFoto(${v.id},'saca')" class="abte-foto-btn">Foto da saca</button>
            <button onclick="_vmVerFoto(${v.id},'caminhao')" class="abte-foto-btn">Foto no caminhão</button>
            <button onclick="_vmImprimir(${v.id})" class="abte-foto-btn">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Imprimir
            </button>
        </div>`;
}

function _vmAddMsg(msg, tipo) {
    const el = document.getElementById("vm-add-msg");
    if (!el) return;
    if (!msg) { el.style.display = "none"; return; }
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    el.style.cssText = `display:block;font-size:12.5px;color:${cor}`;
    el.innerHTML = msg;
}

function _vmScanAdicionar() {
    _bteAbrirScanner(texto => _vmAdicionarPedido(texto));
}

function _vmAdicionarPedido(codigoRaw) {
    const codigo = String(codigoRaw || "").trim();
    const inp = document.getElementById("vm-add-codigo");
    if (inp) inp.value = "";
    if (!codigo) return;
    if (_devEhCep(codigo)) { _gcBeepErro(); return _vmAddMsg("Esse código é um CEP, não o código do pacote.", "erro"); }
    const disp = _vmDisponiveis.find(d => d.codigo.toUpperCase() === codigo.toUpperCase());
    if (!disp) { _gcBeepErro(); return _vmAddMsg(`"${codigo}" não está nas suas devoluções disponíveis.`, "erro"); }

    fetch(`${API}/viagens/${_vmDetalheId}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ adicionar: [disp.codigo] })
    }).then(r => r.json())
    .then(d => {
        if (d.error) { _gcBeepErro(); return _vmAddMsg(d.error, "erro"); }
        if (d.invalidos && d.invalidos.length) { _gcBeepErro(); return _vmAddMsg(`Não foi possível adicionar: ${d.invalidos.join(", ")}`, "erro"); }
        _gcBeepSucesso();
        _vmCarregarDetalhe(); // recarrega pedidos + disponíveis
    })
    .catch(() => _vmAddMsg("Erro ao adicionar.", "erro"));
}

function _vmRemoverPedido(devolucaoId) {
    fetch(`${API}/viagens/${_vmDetalheId}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ remover: [devolucaoId] })
    }).then(r => r.json())
    .then(d => {
        if (d.error) { gcAlert(d.error); return; }
        _vmCarregarDetalhe();
    })
    .catch(() => gcAlert("Erro ao remover o pedido."));
}

function _vmVerFoto(id, tipo) {
    _viagemVerFoto(id, tipo);
}

function _vmImprimir(id) {
    fetch(`${API}/viagens/${id}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(v => {
            if (v.error) return gcAlert(v.error);
            const linhas = (v.pedidos || []).map((p, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${p.codigo || p.descricao || "—"}</td>
                    <td>${p.transportadora || "—"}</td>
                    <td>${p.motivo || "—"}</td>
                    <td>${p.status === "recebido" ? "Conferido" : "Pendente"}</td>
                </tr>`).join("");
            const w = window.open("", "_blank");
            if (!w) return gcAlert("Permita pop-ups para imprimir.");
            w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Viagem ${v.numero}</title>
                <style>
                    body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:28px;max-width:720px;margin:0 auto}
                    h1{font-size:22px;margin:0 0 4px}
                    .sub{color:#555;font-size:13px;margin-bottom:18px}
                    .meta{display:flex;gap:24px;flex-wrap:wrap;font-size:13px;margin-bottom:18px}
                    .meta b{display:block;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
                    table{width:100%;border-collapse:collapse;font-size:13px}
                    th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ddd}
                    th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555}
                    td:first-child,th:first-child{width:36px;color:#888}
                    .foot{margin-top:24px;font-size:11px;color:#999}
                </style></head><body>
                <h1>Viagem ${v.numero}</h1>
                <div class="sub">${v.status === "recebida" ? "Recebida pela operação" : "Aberta"}</div>
                <div class="meta">
                    <div><b>Entregador</b>${v.entregador_nome || "—"}</div>
                    <div><b>Criada em</b>${v.data_hora_brasilia || "—"}</div>
                    <div><b>Pedidos</b>${(v.pedidos || []).length}</div>
                    ${v.recebida_por ? `<div><b>Recebida por</b>${v.recebida_por}${v.recebida_data_hora_brasilia ? " · " + v.recebida_data_hora_brasilia : ""}</div>` : ""}
                </div>
                <table><thead><tr><th>#</th><th>Código / Descrição</th><th>Transportadora</th><th>Motivo</th><th>Status</th></tr></thead>
                <tbody>${linhas || `<tr><td colspan="5" style="text-align:center;color:#888;padding:16px">Sem pedidos</td></tr>`}</tbody></table>
                <div class="foot">GC Transportes — impresso em ${new Date().toLocaleString("pt-BR")}</div>
                <script>window.onload=function(){window.print();}<\/script>
                </body></html>`);
            w.document.close();
        })
        .catch(() => gcAlert("Erro ao gerar a impressão."));
}

// ══════════════════ RECEBER VIAGEM (OPERAÇÃO) ══════════════════
let _vrViagem = null; // { id, numero, entregador_nome, pedidos: [...] }

function abrirDevolucoesReceber(event) {
    if (event) event.preventDefault();
    _vrViagem = null;
    document.getElementById("vr-numero").value = "";
    document.getElementById("vr-passo-numero").style.display = "";
    document.getElementById("vr-passo-pedidos").style.display = "none";
    _vrMsg("", null);
    mostrarTela("tela-devolucao-receber");
}

function _vrMsg(msg, tipo) {
    const el = document.getElementById("vr-msg");
    if (!msg) { el.style.display = "none"; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _vrPedidoMsg(msg, tipo) {
    const el = document.getElementById("vr-pedido-msg");
    if (!msg) { el.style.display = "none"; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _vrScanNumero() {
    _bteAbrirScanner(texto => { document.getElementById("vr-numero").value = texto; _vrReceberViagem(); });
}
function _vrNumeroEnter(e) { if (e.key === "Enter") { e.preventDefault(); _vrReceberViagem(); } }

function _vrReceberViagem() {
    const numero = document.getElementById("vr-numero").value.trim();
    if (!numero) return _vrMsg("Informe o número da viagem (ex: GC0001).", "erro");
    _vrMsg("Abrindo viagem...", "ok");
    fetch(`${API}/viagens/receber`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ numero })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) { _gcBeepErro(); return _vrMsg(d.error || "Erro ao abrir a viagem.", "erro"); }
        _vrViagem = d;
        _vrMsg("", null);
        document.getElementById("vr-passo-numero").style.display = "none";
        document.getElementById("vr-passo-pedidos").style.display = "";
        document.getElementById("vr-cab-numero").innerText = d.numero;
        document.getElementById("vr-cab-entregador").innerText = d.entregador_nome || "—";
        _vrPedidoMsg("", null);
        _vrRenderPedidos();
        document.getElementById("vr-pedido-codigo").focus();
    })
    .catch(() => _vrMsg("Erro ao conectar com o servidor.", "erro"));
}

function _vrVoltarNumero() {
    _vrViagem = null;
    document.getElementById("vr-passo-pedidos").style.display = "none";
    document.getElementById("vr-passo-numero").style.display = "";
    document.getElementById("vr-numero").value = "";
    _vrMsg("", null);
    document.getElementById("vr-numero").focus();
}

function _vrRenderPedidos() {
    const pedidos = _vrViagem.pedidos || [];
    const conferidos = pedidos.filter(p => p.status === "recebido").length;
    document.getElementById("vr-pedidos-total").innerText =
        `${conferidos} de ${pedidos.length} conferido${pedidos.length !== 1 ? "s" : ""}`;
    document.getElementById("vr-pedidos-cards").innerHTML = pedidos.map(p => {
        const recebido = p.status === "recebido";
        return `
        <div style="display:flex;align-items:center;gap:10px;border:1px solid ${recebido ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"};border-radius:10px;padding:11px 14px;margin-bottom:8px;background:${recebido ? "rgba(34,197,94,0.05)" : "transparent"}">
            <div style="flex-shrink:0;color:${recebido ? "#22c55e" : "#475569"}">
                ${recebido
                    ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                    : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>`}
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;color:#e2e8f0;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.codigo || p.descricao || "—"}</div>
                <div style="font-size:11.5px;color:#94a3b8">${p.transportadora || "—"}${p.motivo ? " · " + p.motivo : ""}</div>
            </div>
        </div>`;
    }).join("") || `<div style="font-size:12.5px;color:#64748b;padding:6px 0">Esta viagem não tem pedidos.</div>`;
}

function _vrScanPedido() {
    _bteAbrirScanner(texto => { document.getElementById("vr-pedido-codigo").value = texto; _vrConferirPedido(); });
}
function _vrPedidoEnter(e) { if (e.key === "Enter") { e.preventDefault(); _vrConferirPedido(); } }

function _vrConferirPedido() {
    if (!_vrViagem) return;
    const codigo = document.getElementById("vr-pedido-codigo").value.trim();
    document.getElementById("vr-pedido-codigo").value = "";
    document.getElementById("vr-pedido-codigo").focus();
    if (!codigo) return;
    if (_devEhCep(codigo)) { _gcBeepErro(); return _vrPedidoMsg("Esse código é um CEP, não o código do pedido.", "erro"); }

    fetch(`${API}/viagens/${_vrViagem.id}/conferir-pedido`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro();
            if (d.ja_recebido) return _vrPedidoMsg(`Este pedido já foi conferido.`, "aviso");
            if (d.nao_pertence) return _vrPedidoMsg(`⚠️ <strong>${codigo}</strong> não pertence a esta viagem.`, "erro");
            return _vrPedidoMsg(d.error || "Erro ao conferir.", "erro");
        }
        _gcBeepSucesso();
        const p = (_vrViagem.pedidos || []).find(x => x.id === d.id);
        if (p) p.status = "recebido";
        _vrPedidoMsg(`✓ <strong>${d.codigo}</strong> conferido (${d.transportadora || "—"}).`, "ok");
        _vrRenderPedidos();
    })
    .catch(() => { _gcBeepErro(); _vrPedidoMsg("Erro ao conectar com o servidor.", "erro"); });
}

function _vrVerFotoViagem(tipo) {
    if (!_vrViagem) return;
    _viagemVerFoto(_vrViagem.id, tipo);
}

// Overlay genérico pra ver a foto da viagem (saca | caminhao) — usado pelo entregador
// (Minhas viagens) e pela operação (Receber).
function _viagemVerFoto(id, tipo) {
    if (document.getElementById("viagem-foto-overlay")) return;
    const titulo = tipo === "caminhao" ? "Foto da saca no caminhão" : "Foto da saca";
    const overlay = document.createElement("div");
    overlay.id = "viagem-foto-overlay";
    overlay.setAttribute("style", "position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(7,9,14,0.92);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box");
    overlay.innerHTML = `
        <div style="max-width:520px;width:100%;background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;box-sizing:border-box;text-align:center">
            <div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:14px">${titulo}</div>
            <div id="viagem-foto-loading" style="color:#64748b;font-size:13px;padding:40px 0">Carregando foto...</div>
            <img id="viagem-foto-img" style="display:none;max-width:100%;max-height:65vh;border-radius:10px">
            <button id="viagem-foto-fechar" style="margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#94a3b8;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Fechar</button>
        </div>`;
    document.body.appendChild(overlay);
    const fechar = () => overlay.remove();
    overlay.querySelector("#viagem-foto-fechar").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });

    fetch(`${API}/viagens/${id}/foto/${tipo}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error || !d.foto_base64) {
                document.getElementById("viagem-foto-loading").textContent = "Foto não encontrada.";
                return;
            }
            const img = document.getElementById("viagem-foto-img");
            img.src = `data:${d.foto_mime_type || "image/jpeg"};base64,${d.foto_base64}`;
            img.onload = () => {
                document.getElementById("viagem-foto-loading").style.display = "none";
                img.style.display = "";
            };
        })
        .catch(() => {
            const l = document.getElementById("viagem-foto-loading");
            if (l) l.textContent = "Erro ao carregar a foto.";
        });
}
