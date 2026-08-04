// ───── SHOPEE → ALIMENTAR → AT EXPORTADA ─────
// Mesma mecânica do Romaneiro, com uma diferença que muda tudo: aqui cada envio SUBSTITUI
// o anterior. Não é histórico, é a foto de agora — por isso a tela avisa o que vai ser
// trocado antes de gravar.

// Cabeçalhos do arquivo exportado pela Shopee. `nomes` guarda as grafias já vistas; o
// casamento é sem acento e sem caixa, porque o export muda entre uma versão e outra.
const SAT_CAMPOS = [
    { id: "task_id",              label: "Task ID",              nomes: ["task id"] },
    { id: "station",              label: "Station name",         nomes: ["station name", "station"] },
    { id: "rota",                 label: "Corridor-Cage/Route",  nomes: ["corridor-cage/route", "corridor cage/route", "route"] },
    { id: "cage",                 label: "Cage",                 nomes: ["cage"] },
    { id: "codigo",               label: "SPX tracking num",     nomes: ["spx tracking num", "spx tracking number", "spx tracking"] },
    { id: "numero_to",            label: "TO number",            nomes: ["to number"] },
    { id: "driver_nome",          label: "Driver name",          nomes: ["driver name"] },
    { id: "driver_id",            label: "Driver ID",            nomes: ["driver id"] },
    { id: "agency",               label: "Agency",               nomes: ["agency"] },
    { id: "delivery_date",        label: "Delivery Date",        nomes: ["delivery date"] },
    { id: "zipcode",              label: "Zipcode",              nomes: ["zipcode", "zip code"] },
    { id: "qtd_pedidos",          label: "Number of order/TO",   nomes: ["number of order/to", "number of order / to"] },
    { id: "qtd_atribuidos",       label: "Number of assigned orders/TO", nomes: ["number of assigned orders/to"] },
    { id: "status",               label: "Status",               nomes: ["status"] },
    { id: "cidade",               label: "City",                 nomes: ["city"] },
    { id: "cluster",              label: "Cluster",              nomes: ["cluster"] },
    { id: "bairro",               label: "Neighborhood",         nomes: ["neighborhood"] },
    { id: "create_time",          label: "Create Time",          nomes: ["create time"] },
    { id: "complete_time",        label: "Complete time",        nomes: ["complete time"] },
    { id: "driver_assigned_time", label: "Driver Assigned Time", nomes: ["driver assigned time"] },
];
// Sem estes, não dá pra saber o que é a linha nem qual AT substituir.
const SAT_OBRIGATORIOS = ["task_id", "station"];

let _satLinhas = [];
let _satArquivoNome = "";
let _satEnviando = false;
let _satPagina = 1;
let _satBuscaTimer = null;

function abrirShopeeAT(event) {
    if (event) event.preventDefault();
    _satCancelar();
    _satPagina = 1;
    const busca = document.getElementById("sat-busca");
    if (busca) busca.value = "";
    mostrarTela("tela-shopee-at");
    _satCarregar();

    const area = document.getElementById("sat-upload-area");
    area.ondragover  = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop      = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) _satLerArquivo(e.dataTransfer.files[0]);
    };
}

const _satNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
                        .toLowerCase().replace(/\s+/g, " ").trim();

function _satEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _satMsg(msg, tipo) {
    const el = document.getElementById("sat-erro");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.erro;
    el.style.cssText = `display:block;margin-bottom:16px;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _satArquivo(input) {
    if (input.files[0]) _satLerArquivo(input.files[0]);
    input.value = "";
}

async function _satLerArquivo(file) {
    _satMsg("", null);
    _satArquivoNome = file.name;
    document.getElementById("sat-sub").innerText = `Lendo ${file.name}...`;
    try {
        const grid = await _satLerGrid(file);
        const r = _satMapear(grid);
        if (r.erro) { _satCancelar(); return _satMsg(r.erro, "erro"); }
        if (!r.dados.length) { _satCancelar(); return _satMsg("O arquivo não tem nenhuma linha preenchida.", "aviso"); }
        _satLinhas = r.dados;
        _satRenderPrevia(r.faltando);
    } catch (err) {
        _satCancelar();
        _satMsg("Não foi possível ler o arquivo: " + _satEsc(err.message), "erro");
    }
}

function _satLerGrid(file) {
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

function _satMapear(grid) {
    let cabIdx = -1, indices = null, cabecalho = null;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const cab = (grid[i] || []).map(_satNorm);
        const tentativa = {};
        let achou = 0;
        for (const col of SAT_CAMPOS) {
            const idx = cab.findIndex(c => col.nomes.includes(c));
            if (idx >= 0) { tentativa[col.id] = idx; achou++; }
        }
        if (SAT_OBRIGATORIOS.every(o => tentativa[o] !== undefined) && achou >= 5) {
            cabIdx = i; indices = tentativa; cabecalho = grid[i] || [];
            break;
        }
    }
    if (cabIdx < 0) {
        return { erro: "Não encontrei o cabeçalho da AT. O arquivo precisa ter pelo menos as colunas <strong>Task ID</strong> e <strong>Station name</strong>." };
    }

    const faltando = SAT_CAMPOS.filter(c => indices[c.id] === undefined).map(c => c.label);
    const dados = [];
    for (let i = cabIdx + 1; i < grid.length; i++) {
        const linha = grid[i] || [];
        const obj = {};
        for (const col of SAT_CAMPOS) {
            const idx = indices[col.id];
            obj[col.id] = idx === undefined ? "" : String(linha[idx] ?? "").trim();
        }
        if (!obj.task_id && !obj.codigo) continue; // linha vazia do fim do arquivo

        // Guarda a linha inteira do arquivo, inclusive as colunas que o sistema ainda não
        // usa — assim uma necessidade nova não obriga a reimportar tudo.
        const completo = {};
        cabecalho.forEach((nome, j) => {
            const chave = String(nome || "").trim();
            if (chave) completo[chave] = String(linha[j] ?? "").trim();
        });
        obj.dados = completo;
        dados.push(obj);
    }
    return { dados, faltando };
}

// O arquivo traz VÁRIAS ATs (um Task ID por AT), não uma só. Contar as ATs além das
// linhas é o que faz a tela dizer a verdade sobre o que está sendo substituído.
function _satContarAts(linhas) {
    return new Set(linhas.map(l => String(l.task_id || "").trim()).filter(Boolean)).size;
}

function _satPlural(n, singular, plural) {
    return `${n.toLocaleString("pt-BR")} ${n === 1 ? singular : plural}`;
}

function _satRenderPrevia(faltando) {
    const n = _satLinhas.length;
    const ats = _satContarAts(_satLinhas);
    const estacoes = [...new Set(_satLinhas.map(l => l.station).filter(Boolean))];
    document.getElementById("sat-previa-titulo").innerText =
        `Prévia · ${_satPlural(ats, "AT", "ATs")} · ${_satPlural(n, "linha", "linhas")} de ${_satArquivoNome}`;
    document.getElementById("sat-sub").innerText = "Arraste o arquivo aqui ou clique para selecionar — .csv, .xlsx ou .xls";

    // O aviso do que vai ser substituído é o ponto: enviar aqui apaga TODAS as ATs
    // anteriores das estações do arquivo, e isso não pode ser descoberto depois.
    const avisos = [];
    avisos.push(`Isto <strong>substitui todas as ATs</strong> de <strong>${_satEsc(estacoes.join(", "))}</strong> pelas ${_satPlural(ats, "AT", "ATs")} deste arquivo.`);
    if (faltando && faltando.length) {
        avisos.push(`Colunas não encontradas (vão entrar em branco): ${_satEsc(faltando.join(", "))}.`);
    }
    _satMsg(avisos.join("<br>"), "aviso");

    const amostra = _satLinhas.slice(0, 20);
    document.getElementById("sat-previa-tbody").innerHTML = amostra.map(l => `
        <tr>
            <td data-label="Task ID" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_satEsc(l.task_id) || "—"}</td>
            <td data-label="Estação">${_satEsc(l.station) || "—"}</td>
            <td data-label="SPX tracking" style="font-family:monospace">${_satEsc(l.codigo) || "—"}</td>
            <td data-label="Motorista">${_satEsc(l.driver_nome) || "—"}</td>
            <td data-label="Cidade">${_satEsc(l.cidade) || "—"}</td>
            <td data-label="Status">${_satEsc(l.status) || "—"}</td>
        </tr>`).join("") + (n > amostra.length
        ? `<tr><td colspan="6" style="text-align:center;color:#8494a9;padding:14px">+ ${n - amostra.length} linha${n - amostra.length !== 1 ? "s" : ""} que não cabem na prévia</td></tr>`
        : "");

    document.getElementById("sat-previa").style.display = "";
    const btn = document.getElementById("sat-btn-enviar");
    btn.disabled = false;
    btn.textContent = `Substituir por ${_satPlural(ats, "AT", "ATs")}`;
}

function _satCancelar() {
    _satLinhas = [];
    _satArquivoNome = "";
    _satMsg("", null);
    const previa = document.getElementById("sat-previa");
    if (previa) previa.style.display = "none";
    const sub = document.getElementById("sat-sub");
    if (sub) sub.innerText = "Arraste o arquivo aqui ou clique para selecionar — .csv, .xlsx ou .xls";
}

function _satEnviar() {
    if (_satEnviando || !_satLinhas.length) return;
    const estacoes = [...new Set(_satLinhas.map(l => l.station).filter(Boolean))];
    const ats = _satContarAts(_satLinhas);

    // Confirmação explícita: substituir apaga TODAS as ATs da estação, não só as que
    // coincidirem com as do arquivo. Sem dizer isso, o tamanho do estrago fica escondido.
    gcConfirm(
        `Todas as ATs de ${estacoes.join(", ")} vão ser apagadas e trocadas pelas ${_satPlural(ats, "AT", "ATs")} deste arquivo (${_satPlural(_satLinhas.length, "linha", "linhas")}).\n\nNão dá pra desfazer.`,
        () => {
            _satEnviando = true;
            const btn = document.getElementById("sat-btn-enviar");
            btn.disabled = true;
            btn.textContent = "Substituindo...";

            fetch(`${API}/shopee/at`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ arquivo: _satArquivoNome, linhas: _satLinhas })
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                _satEnviando = false;
                btn.disabled = false;
                if (!ok) {
                    btn.textContent = "Substituir a AT";
                    return _satMsg(_satEsc(d.error) || "Não foi possível enviar.", "erro");
                }
                _satCancelar();
                _satMsg(`✓ ${_satPlural(d.ats || 0, "AT substituída", "ATs substituídas")} em ${
                    _satEsc((d.estacoes || []).join(", "))} — ${_satPlural(d.gravadas, "linha", "linhas")}.`, "ok");
                _satPagina = 1;
                _satCarregar();
            })
            .catch(() => {
                _satEnviando = false;
                btn.disabled = false;
                btn.textContent = "Substituir a AT";
                _satMsg("Erro ao conectar com o servidor.", "erro");
            });
        },
        "Substituir a AT",
        "Substituir"
    );
}

// ── AT atual ──
function _satBuscar() {
    // Espera a digitação parar: a busca é no servidor, e uma consulta por tecla seria
    // uma ida ao banco a cada letra.
    clearTimeout(_satBuscaTimer);
    _satBuscaTimer = setTimeout(() => { _satPagina = 1; _satCarregar(); }, 350);
}

function _satTrocarPagina(passo) {
    _satPagina += passo;
    _satCarregar();
    document.getElementById("sat-lista-titulo").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function _satCarregar() {
    const empty  = document.getElementById("sat-empty");
    const result = document.getElementById("sat-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    const busca = (document.getElementById("sat-busca")?.value || "").trim();
    const qs = new URLSearchParams({ pagina: _satPagina });
    if (busca) qs.set("busca", busca);

    fetch(`${API}/shopee/at?${qs}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); _satRenderUltima(null); return; }
            _satRenderUltima(d);

            if (d.sem_polo)     { skFim(empty, "Você ainda não tem polo definido. Abra o Recebimento Shopee para escolher."); return; }
            if (d.polo_sem_xpt) { skFim(empty, `O polo ${d.polo_label} não recebe Shopee, então não tem AT para conferir.`); return; }

            const linhas = d.linhas || [];
            document.getElementById("sat-lista-titulo").innerText =
                `ATs atuais${d.polo_label ? " · " + d.polo_label : ""}`;

            if (!linhas.length) {
                skFim(empty, busca ? "Nenhuma linha encontrada nessa busca." : "Nenhuma AT enviada ainda para esta estação.");
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("sat-tbody").innerHTML = linhas.map(l => `
                <tr>
                    <td data-label="Task ID" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_satEsc(l.task_id) || "—"}</td>
                    <td data-label="SPX tracking" style="font-family:monospace">${_satEsc(l.codigo) || "—"}</td>
                    <td data-label="Motorista">${_satEsc(l.driver_nome) || "—"}${l.driver_id ? `<div style="font-size:11px;color:#8494a9">${_satEsc(l.driver_id)}</div>` : ""}</td>
                    <td data-label="Cidade / Bairro">${_satEsc(l.cidade) || "—"}${l.bairro ? `<div style="font-size:11px;color:#8494a9">${_satEsc(l.bairro)}</div>` : ""}</td>
                    <td data-label="Entrega" style="color:#8494a9">${_satEsc(l.delivery_date) || "—"}</td>
                    <td data-label="Status">${_satEsc(l.status) || "—"}</td>
                </tr>`).join("");

            const total = d.total || 0;
            const por = d.por_pagina || 50;
            const paginas = Math.max(1, Math.ceil(total / por));
            const inicio = (d.pagina - 1) * por;
            const pag = document.getElementById("sat-paginacao");
            pag.style.display = total > por ? "" : "none";
            if (total > por) {
                document.getElementById("sat-pag-info").innerText =
                    `${inicio + 1}–${Math.min(inicio + por, total)} de ${total}`;
                document.getElementById("sat-pag-ant").disabled  = d.pagina <= 1;
                document.getElementById("sat-pag-prox").disabled = d.pagina >= paginas;
            }
        })
        .catch(() => { skFim(empty, "Erro ao conectar com o servidor."); _satRenderUltima(null); });
}

function _satDataHora(iso) {
    return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
}

function _satHaQuantoTempo(iso) {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1)  return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)   return `há ${h}h`;
    const d = Math.floor(h / 24);
    return d === 1 ? "ontem" : `há ${d} dias`;
}

function _satRenderUltima(d) {
    const el = document.getElementById("sat-ultima");
    const u = d && d.ultima;
    if (!u || !u.importado_em) {
        el.className = "shr-ultima vazia";
        el.innerHTML = `<span class="shr-ultima-label">ATs</span>
            <span class="shr-ultima-valor">Nenhum envio ainda</span>`;
        return;
    }
    // ATs primeiro, linhas depois: quem olha quer saber quantas viagens estão carregadas,
    // não quantas linhas o arquivo tinha.
    el.className = "shr-ultima";
    el.innerHTML = `
        <span class="shr-ultima-label">Atualizado</span>
        <span class="shr-ultima-valor">${_satDataHora(u.importado_em)}</span>
        <span class="shr-ultima-rel">${_satHaQuantoTempo(u.importado_em)}</span>
        <span class="shr-ultima-obs">${_satEsc(u.importado_por) || "—"}${u.arquivo ? " · " + _satEsc(u.arquivo) : ""} · ${
            _satPlural(d.total_ats || 0, "AT", "ATs")} · ${_satPlural(d.total || 0, "linha", "linhas")}</span>`;
}
