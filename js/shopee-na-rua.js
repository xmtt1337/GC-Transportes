// ───── TORRE DE CONTROLE > NA RUA > SHOPEE ─────
//
// As outras transportadoras de Na Rua dependem de alguém subir um arquivo. A
// Shopee não: o XM Vigia já alimenta o sistema sozinho, então esta tela só
// LÊ o que já está lá — sem upload, sem botão "Enviar relatório". É por isso
// que ela mora num arquivo à parte em vez de dentro de torre-na-rua.js: o
// fluxo inteiro é outro, só a aba é a mesma.
//
// O padrão de tela é o de Shopee > Conferência > Entregadores: lista de
// cards por entregador, "Ver pedidos" troca pra um detalhe (não modal).

let _snrDia   = "";
let _snrDias  = [];
let _snrLista = [];
let _snrDet   = null;   // { nome, dia, pedidos: [...] }

function _snrEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _snrMostrarLista() {
    document.getElementById("snr-lista-wrap").style.display = "";
    document.getElementById("snr-detalhe").style.display = "none";
}

function _snrMostrarDetalhe() {
    document.getElementById("snr-lista-wrap").style.display = "none";
    document.getElementById("snr-detalhe").style.display = "";
}

// Chamado pela aba "Shopee" dentro de Na Rua (torre-na-rua.js), no lugar do
// upload+pivô que as outras transportadoras usam.
function _snrMostrar() {
    _snrDet = null;
    _snrMostrarLista();
    _snrCarregar();
}

// ── Lista de entregadores do dia ──
function _snrCarregar() {
    const empty = document.getElementById("snr-empty");
    const res   = document.getElementById("snr-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    res.style.display = "none";

    const qs = _snrDia ? `?dia=${encodeURIComponent(_snrDia)}` : "";
    fetch(`${API}/shopee-na-rua/entregadores${qs}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (d && d.error) { skFim(empty, d.error); return; }

        // O servidor escolhe o dia (hoje, ou o mais recente com pedido) — a
        // tela só passa a mandar um dia específico depois que alguém escolhe.
        _snrDia  = d.dia || "";
        _snrDias = d.dias || [];
        _snrRenderDias(d.hoje);

        _snrLista = d.entregadores || [];
        if (!_snrLista.length) {
            skFim(empty, _snrDias.length
                ? "Nenhum pedido pesquisado nesse dia."
                : "Nenhum pedido pesquisado ainda. O macro de Pedidos Pesquisados alimenta isso sozinho.");
            document.getElementById("snr-resumo").innerHTML = "";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        _snrRenderResumo();
        _snrRenderLista();
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// Só aparecem dias que têm pedido pesquisado — clicar nunca leva a uma tela
// vazia. Mesmo componente compartilhado de Conferência-Entregadores e Line Haul.
function _snrRenderDias(hoje) {
    gcCalMontar({
        alvo: "snr-dias",
        dias: _snrDias.map(d => ({
            dia: d.dia,
            resumo: `${d.pedidos} pedido${d.pedidos !== 1 ? "s" : ""} · ${d.entregadores} entregador${d.entregadores !== 1 ? "es" : ""}`,
        })),
        dia: _snrDia,
        hoje: hoje || "",
        aoEscolher: _snrTrocarDia,
    });
}

function _snrTrocarDia(dia) {
    _snrDia = dia;
    _snrCarregar();
}

function _snrRenderResumo() {
    const totalPedidos = _snrLista.reduce((s, e) => s + e.total, 0);
    const semEntregador = _snrLista.find(e => e.nome === "Sem entregador");

    document.getElementById("snr-resumo").innerHTML = `
        <div class="paj-card"><div class="paj-label">Pedidos</div><div class="paj-value">${totalPedidos}</div></div>
        <div class="paj-card"><div class="paj-label">Entregadores</div><div class="paj-value">${_snrLista.filter(e => e.nome !== "Sem entregador").length}</div></div>
        <div class="paj-card"><div class="paj-label">Sem entregador</div><div class="paj-value" style="color:${semEntregador ? "#eab308" : "#8494a9"}">${semEntregador ? semEntregador.total : 0}</div></div>`;
}

function _snrRenderLista() {
    document.getElementById("snr-entregadores").innerHTML = _snrLista.map(e => {
        const semEntregador = e.nome === "Sem entregador";
        return `
        <div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:10px;background:rgba(255,255,255,0.02)">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-weight:700;color:${semEntregador ? "#eab308" : "#e2e8f0"};font-size:14px;flex:1;min-width:140px">
                    ${_snrEsc(e.nome)}
                </span>
                <span style="font-variant-numeric:tabular-nums;font-weight:700;color:#93c5fd;font-size:15px;flex:none">
                    ${e.total} pedido${e.total !== 1 ? "s" : ""}
                </span>
                <button class="adm-usr-action senha" style="flex:none" onclick="_snrAbrirDetalhe('${_snrEsc(e.nome).replace(/'/g, "\\'")}')">Ver pedidos</button>
            </div>
        </div>`;
    }).join("");
}

// ── Detalhe: os pedidos de um entregador ──
function _snrAbrirDetalhe(nome) {
    _snrMostrarDetalhe();
    document.getElementById("snr-det-nome").innerText = nome;
    document.getElementById("snr-det-sub").innerText = gcCalBr(_snrDia);
    document.getElementById("snr-det-tbody").innerHTML =
        `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:22px">Carregando...</td></tr>`;

    fetch(`${API}/shopee-na-rua/entregador?dia=${encodeURIComponent(_snrDia)}&nome=${encodeURIComponent(nome)}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) {
            document.getElementById("snr-det-tbody").innerHTML =
                `<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:22px">${_snrEsc(d.error)}</td></tr>`;
            return;
        }
        _snrDet = d;
        _snrRenderDetalhe();
    })
    .catch(() => {
        document.getElementById("snr-det-tbody").innerHTML =
            `<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:22px">Erro ao conectar com o servidor.</td></tr>`;
    });
}

function _snrVoltar() {
    _snrDet = null;
    _snrMostrarLista();
}

function _snrRenderDetalhe() {
    if (!_snrDet) return;
    const pedidos = _snrDet.pedidos || [];

    document.getElementById("snr-det-tbody").innerHTML = pedidos.length
        ? pedidos.map(p => {
            // Endereço só existe quando o código bateu com uma linha da AT que
            // tem essa informação (o Romaneio) — pedido mais velho, ligado a
            // uma AT de antes disso, fica sem endereço, e é isso mesmo.
            const endereco = [p.endereco, p.complemento].filter(Boolean).join(" — ") || "—";
            return `
            <tr>
                <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_snrEsc(p.codigo)}</td>
                <td data-label="AT">${_snrEsc(p.task_id || "—")}</td>
                <td data-label="Endereço">${_snrEsc(endereco)}${p.bairro ? `<br><span style="color:#8494a9;font-size:11.5px">${_snrEsc(p.bairro)}${p.cidade ? " · " + _snrEsc(p.cidade) : ""}</span>` : ""}</td>
                <td data-label="Cluster">${_snrEsc(p.cluster || "—")}</td>
                <td data-label="Status">${_snrEsc(p.status || "—")}</td>
            </tr>`;
        }).join("")
        : `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:20px">Nada aqui.</td></tr>`;
}
