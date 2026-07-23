// ───── DEVOLUÇÕES (MOTORISTA) ─────
// O motorista busca (recolhe) a viagem de devolução que o entregador fechou —
// vira 'em_transferencia' até a operação confirmar a chegada na base (Receber
// Viagem, tela separada da equipe da base). Reaproveita _bteAbrirScanner/gcAlert.

function abrirMotoristaBuscarViagem(event) {
    if (event) event.preventDefault();
    document.getElementById("motb-numero").value = "";
    _motbMsg("", null);
    mostrarTela("tela-motorista-buscar");
    document.getElementById("motb-numero").focus();
}

function _motbMsg(msg, tipo) {
    const el = document.getElementById("motb-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _motbScanNumero() {
    _bteAbrirScanner(texto => { document.getElementById("motb-numero").value = texto; _motbBuscarViagem(); });
}
function _motbNumeroEnter(e) { if (e.key === "Enter") { e.preventDefault(); _motbBuscarViagem(); } }

function _motbBuscarViagem() {
    const numero = document.getElementById("motb-numero").value.trim();
    if (!numero) return _motbMsg("Informe o número da viagem (ex: GC2026070001).", "erro");
    _motbMsg("Buscando viagem...", "ok");

    fetch(`${API}/viagens/buscar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ numero })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) { _gcBeepErro(); return _motbMsg(d.error || "Erro ao buscar a viagem.", "erro"); }
        _gcBeepSucesso();
        document.getElementById("motb-numero").value = "";
        _motbMsg(`✓ Viagem <strong>${d.numero}</strong> (${d.entregador_nome || "—"}, ${d.pedidos} pedido${d.pedidos !== 1 ? "s" : ""}) coletada com sucesso.`, "ok");
    })
    .catch(() => { _gcBeepErro(); _motbMsg("Erro ao conectar com o servidor.", "erro"); });
}

// ───── MINHAS CARGAS ─────
function abrirMotoristaMinhasCargas(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-motorista-cargas");
    _motcCarregar();
}

function _motcStatusBadge(status) {
    if (status === "recebida") {
        return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#22c55e;font-size:11px;font-weight:700">Entregue na base</span>`;
    }
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.3);color:#a855f7;font-size:11px;font-weight:700">Em trânsito</span>`;
}

function _motcCarregar() {
    const empty = document.getElementById("motc-empty");
    const lista = document.getElementById("motc-lista");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    lista.style.display = "none";

    fetch(`${API}/viagens/motorista/minhas-cargas`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                empty.innerText = "Nenhuma carga recolhida ainda.";
                return;
            }
            empty.style.display = "none";
            lista.style.display = "";
            lista.innerHTML = rows.map(v => `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:10px">
                    <div>
                        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                            <span style="font-size:16px;font-weight:800;color:#3a86ff;font-family:monospace">${v.numero}</span>
                            ${_motcStatusBadge(v.status)}
                        </div>
                        <div style="font-size:12.5px;color:#94a3b8;margin-top:3px">${v.entregador_nome || "—"} · ${v.pedidos} pedido${v.pedidos !== 1 ? "s" : ""}</div>
                    </div>
                    <div style="font-size:12px;color:#64748b;text-align:right">
                        ${v.status === "recebida"
                            ? `Entregue em<br>${v.recebida_data_hora_brasilia || "—"}`
                            : `Coletada em<br>${v.em_transferencia_data_hora_brasilia || "—"}`}
                    </div>
                </div>`).join("");
        })
        .catch(() => { empty.innerText = "Erro ao carregar as cargas."; });
}
