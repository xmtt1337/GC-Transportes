// ───── SHOPEE → ALIMENTAR → PEDIDOS PESQUISADOS ─────
// Mesma mecânica de envio das outras telas de Alimentar. A diferença está no que acontece
// com o que já estava lá: aqui cada pedido é ATUALIZADO, não duplicado nem apagado.
// O arquivo é o resultado de uma busca — é sempre um recorte, então substituir a tabela
// inteira sumiria com pedido que só não estava naquela consulta.

const SPP_CAMPOS = [
    { id: "order_id",              label: "Order ID",                      nomes: ["order id"] },
    { id: "sls_tracking",          label: "SLS Tracking Number",           nomes: ["sls tracking number", "sls tracking"] },
    { id: "shopee_order_sn",       label: "Shopee Order SN",               nomes: ["shopee order sn"] },
    { id: "sort_code_name",        label: "Sort Code Name",                nomes: ["sort code name"] },
    { id: "zipcode_name",          label: "Zipcode Name",                  nomes: ["zipcode name"] },
    { id: "postal_code",           label: "Postal Code",                   nomes: ["postal code"] },
    { id: "buyer_nome",            label: "Buyer Name",                    nomes: ["buyer name"] },
    { id: "buyer_telefone",        label: "Buyer Phone",                   nomes: ["buyer phone"] },
    { id: "buyer_endereco",        label: "Buyer Address",                 nomes: ["buyer address"] },
    { id: "driver_id",             label: "Driver ID",                     nomes: ["driver id"] },
    { id: "driver_nome",           label: "Driver Name",                   nomes: ["driver name"] },
    { id: "driver_telefone",       label: "Driver Phone",                  nomes: ["driver phone"] },
    { id: "received_time",         label: "Received Time",                 nomes: ["received time"] },
    { id: "station_received_time", label: "Current Station Received Time", nomes: ["current station received time"] },
    { id: "delivering_time",       label: "Delivering Time",               nomes: ["delivering time"] },
    { id: "delivered_time",        label: "Delivered Time",                nomes: ["delivered time"] },
    { id: "onhold_time",           label: "OnHold Time",                   nomes: ["onhold time", "on hold time"] },
    { id: "onhold_reason",         label: "OnHoldReason",                  nomes: ["onholdreason", "onhold reason", "on hold reason"] },
    { id: "reschedule_date",       label: "Reschedule Date",               nomes: ["reschedule date"] },
    { id: "status",                label: "Status",                        nomes: ["status"] },
    { id: "reject_remark",         label: "Reject remark",                 nomes: ["reject remark"] },
    { id: "cod_amount",            label: "COD Amount",                    nomes: ["cod amount"] },
    { id: "manifest_number",       label: "Manifest Number",               nomes: ["manifest number"] },
    { id: "delivery_attempts",     label: "Delivery Attempts",             nomes: ["delivery attempts"] },
    { id: "sla_target_date",       label: "SLA Target Date",               nomes: ["sla target date"] },
    { id: "current_station",       label: "Current Station",               nomes: ["current station"] },
    { id: "destination_station",   label: "Destination Station",           nomes: ["destination station"] },
    { id: "next_station",          label: "Next Station",                  nomes: ["next station"] },
    { id: "pickup_station",        label: "Pickup Station",                nomes: ["pickup station"] },
    { id: "zona",                  label: "Zone",                          nomes: ["zone"] },
];
// Sem um destes a linha não identifica pedido nenhum.
const SPP_CHAVES = ["order_id", "sls_tracking"];

let _sppLinhas = [];
let _sppArquivoNome = "";
let _sppEnviando = false;
let _sppPagina = 1;
let _sppBuscaTimer = null;

function abrirShopeePedidos(event) {
    if (event) event.preventDefault();
    _sppCancelar();
    _sppPagina = 1;
    const busca = document.getElementById("spp-busca");
    if (busca) busca.value = "";
    mostrarTela("tela-shopee-pedidos");
    _sppCarregar();

    const area = document.getElementById("spp-upload-area");
    area.ondragover  = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop      = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) _sppLerArquivo(e.dataTransfer.files[0]);
    };
}

const _sppNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
                        .toLowerCase().replace(/\s+/g, " ").trim();

function _sppEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _sppMsg(msg, tipo) {
    const el = document.getElementById("spp-erro");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.erro;
    el.style.cssText = `display:block;margin-bottom:16px;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _sppArquivo(input) {
    if (input.files[0]) _sppLerArquivo(input.files[0]);
    input.value = "";
}

async function _sppLerArquivo(file) {
    _sppMsg("", null);
    _sppArquivoNome = file.name;
    document.getElementById("spp-sub").innerText = `Lendo ${file.name}...`;
    try {
        const grid = await _sppLerGrid(file);
        const r = _sppMapear(grid);
        if (r.erro) { _sppCancelar(); return _sppMsg(r.erro, "erro"); }
        if (!r.dados.length) { _sppCancelar(); return _sppMsg("O arquivo não tem nenhuma linha com pedido.", "aviso"); }
        _sppLinhas = r.dados;
        _sppRenderPrevia(r.faltando, r.semChave);
    } catch (err) {
        _sppCancelar();
        _sppMsg("Não foi possível ler o arquivo: " + _sppEsc(err.message), "erro");
    }
}

function _sppLerGrid(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = file.name.toLowerCase().endsWith(".csv")
                    ? XLSX.read(new TextDecoder("utf-8").decode(data), { type: "string" })
                    : XLSX.read(data, { type: "array", raw: false });
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("falha ao abrir o arquivo"));
        reader.readAsArrayBuffer(file);
    });
}

function _sppMapear(grid) {
    let cabIdx = -1, indices = null, cabecalho = null;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const cab = (grid[i] || []).map(_sppNorm);
        const tentativa = {};
        let achou = 0;
        for (const col of SPP_CAMPOS) {
            const idx = cab.findIndex(c => col.nomes.includes(c));
            if (idx >= 0) { tentativa[col.id] = idx; achou++; }
        }
        // Basta uma das chaves e um punhado de colunas conhecidas pra ser o cabeçalho.
        if (SPP_CHAVES.some(k => tentativa[k] !== undefined) && achou >= 5) {
            cabIdx = i; indices = tentativa; cabecalho = grid[i] || [];
            break;
        }
    }
    if (cabIdx < 0) {
        return { erro: "Não encontrei o cabeçalho. O arquivo precisa ter pelo menos <strong>Order ID</strong> ou <strong>SLS Tracking Number</strong>." };
    }

    const faltando = SPP_CAMPOS.filter(c => indices[c.id] === undefined).map(c => c.label);
    const dados = [];
    let semChave = 0;
    for (let i = cabIdx + 1; i < grid.length; i++) {
        const linha = grid[i] || [];
        const obj = {};
        for (const col of SPP_CAMPOS) {
            const idx = indices[col.id];
            obj[col.id] = idx === undefined ? "" : String(linha[idx] ?? "").trim();
        }
        // Linha sem pedido não vai pro banco: viraria registro que não identifica nada.
        if (!obj.order_id && !obj.sls_tracking) {
            if (linha.some(v => String(v ?? "").trim())) semChave++;
            continue;
        }
        const completo = {};
        cabecalho.forEach((nome, j) => {
            const chave = String(nome || "").trim();
            if (chave) completo[chave] = String(linha[j] ?? "").trim();
        });
        obj.dados = completo;
        dados.push(obj);
    }
    return { dados, faltando, semChave };
}

function _sppRenderPrevia(faltando, semChave) {
    const n = _sppLinhas.length;
    document.getElementById("spp-previa-titulo").innerText =
        `Prévia · ${n} pedido${n !== 1 ? "s" : ""} de ${_sppArquivoNome}`;
    document.getElementById("spp-sub").innerText = "Arraste o arquivo aqui ou clique para selecionar — .csv, .xlsx ou .xls";

    const avisos = ["Pedido que já existe é <strong>atualizado</strong>; os outros continuam como estão."];
    if (semChave) avisos.push(`${semChave} linha${semChave !== 1 ? "s" : ""} sem Order ID e sem SLS Tracking ${semChave !== 1 ? "foram ignoradas" : "foi ignorada"}.`);
    if (faltando && faltando.length) avisos.push(`Colunas não encontradas (vão entrar em branco): ${_sppEsc(faltando.join(", "))}.`);
    _sppMsg(avisos.join("<br>"), "aviso");

    const amostra = _sppLinhas.slice(0, 20);
    document.getElementById("spp-previa-tbody").innerHTML = amostra.map(l => `
        <tr>
            <td data-label="Pedido" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_sppEsc(l.order_id || l.sls_tracking)}</td>
            <td data-label="Comprador">${_sppEsc(l.buyer_nome) || "—"}</td>
            <td data-label="Status">${_sppEsc(l.status) || "—"}</td>
            <td data-label="Motorista">${_sppEsc(l.driver_nome) || "—"}</td>
            <td data-label="Destino">${_sppEsc(l.destination_station || l.current_station) || "—"}</td>
        </tr>`).join("") + (n > amostra.length
        ? `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:14px">+ ${n - amostra.length} pedido${n - amostra.length !== 1 ? "s" : ""} que não cabem na prévia</td></tr>`
        : "");

    document.getElementById("spp-previa").style.display = "";
    const btn = document.getElementById("spp-btn-enviar");
    btn.disabled = false;
    btn.textContent = `Enviar ${n} pedido${n !== 1 ? "s" : ""}`;
}

function _sppCancelar() {
    _sppLinhas = [];
    _sppArquivoNome = "";
    _sppMsg("", null);
    const previa = document.getElementById("spp-previa");
    if (previa) previa.style.display = "none";
    const sub = document.getElementById("spp-sub");
    if (sub) sub.innerText = "Arraste o arquivo aqui ou clique para selecionar — .csv, .xlsx ou .xls";
}

function _sppEnviar() {
    if (_sppEnviando || !_sppLinhas.length) return;
    _sppEnviando = true;
    const btn = document.getElementById("spp-btn-enviar");
    btn.disabled = true;
    btn.textContent = "Enviando...";

    fetch(`${API}/shopee/pedidos-pesquisados`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo: _sppArquivoNome, linhas: _sppLinhas })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        _sppEnviando = false;
        btn.disabled = false;
        if (!ok) {
            btn.textContent = "Enviar";
            return _sppMsg(_sppEsc(d.error) || "Não foi possível enviar.", "erro");
        }
        const n = d.gravadas;
        _sppCancelar();
        _sppMsg(`✓ ${n} pedido${n !== 1 ? "s" : ""} enviado${n !== 1 ? "s" : ""}.` +
                (d.repetidos ? ` ${d.repetidos} repetido${d.repetidos !== 1 ? "s" : ""} no arquivo — ficou a última ocorrência.` : ""), "ok");
        _sppPagina = 1;
        _sppCarregar();
    })
    .catch(() => {
        _sppEnviando = false;
        btn.disabled = false;
        btn.textContent = "Enviar";
        _sppMsg("Erro ao conectar com o servidor.", "erro");
    });
}

// ── Pedidos já enviados ──
function _sppBuscar() {
    clearTimeout(_sppBuscaTimer);
    _sppBuscaTimer = setTimeout(() => { _sppPagina = 1; _sppCarregar(); }, 350);
}

function _sppTrocarPagina(passo) {
    _sppPagina += passo;
    _sppCarregar();
    document.getElementById("spp-lista-titulo").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Cor pelo desfecho: entregue fecha o caso, on hold e rejeitado pedem ação.
function _sppCorStatus(status) {
    const s = _sppNorm(status);
    if (!s) return "#8494a9";
    if (s.includes("delivered") || s.includes("entregue")) return "#22c55e";
    if (s.includes("hold") || s.includes("reject") || s.includes("fail") || s.includes("return")) return "#ef4444";
    if (s.includes("delivering") || s.includes("transit") || s.includes("assigned")) return "#3a86ff";
    return "#eab308";
}

function _sppCarregar() {
    const empty  = document.getElementById("spp-empty");
    const result = document.getElementById("spp-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    const busca = (document.getElementById("spp-busca")?.value || "").trim();
    const qs = new URLSearchParams({ pagina: _sppPagina });
    if (busca) qs.set("busca", busca);

    fetch(`${API}/shopee/pedidos-pesquisados?${qs}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); _sppRenderUltima(null); return; }
            _sppRenderUltima(d);

            if (d.sem_polo)     { skFim(empty, "Você ainda não tem polo definido. Abra o Recebimento Shopee para escolher."); return; }
            if (d.polo_sem_xpt) { skFim(empty, `O polo ${d.polo_label} não recebe Shopee, então não tem pedidos para conferir.`); return; }

            const linhas = d.linhas || [];
            document.getElementById("spp-lista-titulo").innerText =
                `Pedidos${d.polo_label ? " · " + d.polo_label : ""}`;

            if (!linhas.length) {
                skFim(empty, busca ? "Nenhum pedido encontrado nessa busca." : "Nenhum pedido enviado ainda para esta estação.");
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("spp-tbody").innerHTML = linhas.map(l => `
                <tr>
                    <td data-label="Pedido" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_sppEsc(l.order_id || l.chave)}
                        ${l.shopee_order_sn ? `<div style="font-size:11px;color:#8494a9;font-family:'Inter',sans-serif">${_sppEsc(l.shopee_order_sn)}</div>` : ""}</td>
                    <td data-label="Comprador">${_sppEsc(l.buyer_nome) || "—"}
                        ${l.zipcode_name ? `<div style="font-size:11px;color:#8494a9">${_sppEsc(l.zipcode_name)}</div>` : ""}</td>
                    <td data-label="Status"><span style="color:${_sppCorStatus(l.status)};font-weight:600">${_sppEsc(l.status) || "—"}</span>
                        ${l.onhold_reason ? `<div style="font-size:11px;color:#8494a9">${_sppEsc(l.onhold_reason)}</div>` : ""}</td>
                    <td data-label="Motorista">${_sppEsc(l.driver_nome) || "—"}</td>
                    <td data-label="Tentativas" style="font-variant-numeric:tabular-nums">${_sppEsc(l.delivery_attempts) || "—"}</td>
                    <td data-label="SLA" style="color:#8494a9">${_sppEsc(l.sla_target_date) || "—"}</td>
                </tr>`).join("");

            const total = d.total || 0;
            const por = d.por_pagina || 50;
            const paginas = Math.max(1, Math.ceil(total / por));
            const inicio = (d.pagina - 1) * por;
            const pag = document.getElementById("spp-paginacao");
            pag.style.display = total > por ? "" : "none";
            if (total > por) {
                document.getElementById("spp-pag-info").innerText =
                    `${inicio + 1}–${Math.min(inicio + por, total)} de ${total}`;
                document.getElementById("spp-pag-ant").disabled  = d.pagina <= 1;
                document.getElementById("spp-pag-prox").disabled = d.pagina >= paginas;
            }
        })
        .catch(() => { skFim(empty, "Erro ao conectar com o servidor."); _sppRenderUltima(null); });
}

function _sppRenderUltima(d) {
    const el = document.getElementById("spp-ultima");
    const u = d && d.ultima;
    if (!u || !u.importado_em) {
        el.className = "shr-ultima vazia";
        el.innerHTML = `<span class="shr-ultima-label">Pedidos</span>
            <span class="shr-ultima-valor">Nenhum envio ainda</span>`;
        return;
    }
    const min = Math.floor((Date.now() - new Date(u.importado_em).getTime()) / 60000);
    const rel = min < 1 ? "agora mesmo" : min < 60 ? `há ${min} min`
              : min < 1440 ? `há ${Math.floor(min / 60)}h`
              : Math.floor(min / 1440) === 1 ? "ontem" : `há ${Math.floor(min / 1440)} dias`;
    el.className = "shr-ultima";
    el.innerHTML = `
        <span class="shr-ultima-label">Atualizado</span>
        <span class="shr-ultima-valor">${new Date(u.importado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
        <span class="shr-ultima-rel">${rel}</span>
        <span class="shr-ultima-obs">${_sppEsc(u.importado_por) || "—"}${u.arquivo ? " · " + _sppEsc(u.arquivo) : ""} · ${
            (d.total || 0).toLocaleString("pt-BR")} pedido${d.total !== 1 ? "s" : ""}</span>`;
}
