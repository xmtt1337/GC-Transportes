// ───── SHOPEE → ALIMENTAR → ROMANEIRO SHOPEE ─────
// Envia as linhas do romaneiro de LH pro sistema. Cada envio acrescenta: não existe
// remover pela tela. Se um romaneiro vier errado, o conserto é mandar o certo por cima —
// apagar histórico de alimentação some com a prova do que já foi carregado.

// Colunas esperadas no arquivo. `nomes` são as grafias que já vimos: o arquivo vem da
// Shopee e o cabeçalho muda de acento e de caixa entre um relatório e outro.
const SHL_COLUNAS = [
    { id: "horario_entrega", label: "Horário de entrega", nomes: ["horario de entrega", "horário de entrega", "horario entrega"] },
    { id: "pedido_tn",       label: "Pedido (TN)",        nomes: ["pedido (tn)", "pedido tn", "pedido"] },
    { id: "origem",          label: "Origem",             nomes: ["origem"] },
    { id: "destino",         label: "Destino",            nomes: ["destino"] },
    { id: "numero_to",       label: "Número da TO",       nomes: ["numero da to", "número da to", "numero to", "nº da to", "no da to"] },
    { id: "rota_lh",         label: "Rota de LH",         nomes: ["rota de lh", "rota lh"] },
];

let _shlLinhas  = [];   // linhas lidas do arquivo, aguardando envio
let _shlArquivoNome = "";
let _shlEnviando = false;

function abrirShopeeRomaneiro(event) {
    if (event) event.preventDefault();
    _shlCancelar();
    mostrarTela("tela-shopee-romaneiro");
    _shlCarregarHistorico();

    // Arrastar o arquivo em cima do quadro também vale — é como o resto do sistema faz.
    const area = document.getElementById("shl-upload-area");
    area.ondragover  = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop      = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) _shlLerArquivo(e.dataTransfer.files[0]);
    };
}

const _shlNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
                        .toLowerCase().replace(/\s+/g, " ").trim();

function _shlEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _shlMsg(msg, tipo) {
    const el = document.getElementById("shl-erro");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.erro;
    el.style.cssText = `display:block;margin-bottom:16px;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _shlArquivo(input) {
    if (input.files[0]) _shlLerArquivo(input.files[0]);
    input.value = ""; // permite reenviar o mesmo arquivo sem recarregar a tela
}

async function _shlLerArquivo(file) {
    _shlMsg("", null);
    _shlArquivoNome = file.name;
    document.getElementById("shl-sub").innerText = `Lendo ${file.name}...`;

    try {
        const grid = await _shlLerGrid(file);
        const linhas = _shlMapear(grid);
        if (linhas.erro) { _shlCancelar(); return _shlMsg(linhas.erro, "erro"); }
        if (!linhas.dados.length) { _shlCancelar(); return _shlMsg("O arquivo não tem nenhuma linha preenchida.", "aviso"); }

        _shlLinhas = linhas.dados;
        _shlRenderPrevia(linhas.faltando);
    } catch (err) {
        _shlCancelar();
        _shlMsg("Não foi possível ler o arquivo: " + _shlEsc(err.message), "erro");
    }
}

// Mesma leitura do Alimentar: XLSX resolve .xlsx e .csv, e o `raw:false` mantém hora e
// número como o arquivo mostra, em vez de virar número de série do Excel.
function _shlLerGrid(file) {
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

// Acha o cabeçalho e casa as colunas pelo nome. Procura nas primeiras linhas porque esses
// relatórios costumam vir com título ou linha em branco antes da tabela.
function _shlMapear(grid) {
    let cabIdx = -1, indices = null;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const cab = (grid[i] || []).map(_shlNorm);
        const tentativa = {};
        let achou = 0;
        for (const col of SHL_COLUNAS) {
            const idx = cab.findIndex(c => col.nomes.includes(c));
            if (idx >= 0) { tentativa[col.id] = idx; achou++; }
        }
        // Metade das colunas já identifica a linha do cabeçalho; o resto vira aviso.
        if (achou >= Math.ceil(SHL_COLUNAS.length / 2)) { cabIdx = i; indices = tentativa; break; }
    }
    if (cabIdx < 0) {
        return { erro: "Não encontrei o cabeçalho no arquivo. Ele precisa ter as colunas: " +
                       SHL_COLUNAS.map(c => c.label).join(", ") + "." };
    }

    const faltando = SHL_COLUNAS.filter(c => indices[c.id] === undefined).map(c => c.label);
    const dados = [];
    for (let i = cabIdx + 1; i < grid.length; i++) {
        const linha = grid[i] || [];
        const obj = {};
        for (const col of SHL_COLUNAS) {
            const idx = indices[col.id];
            obj[col.id] = idx === undefined ? "" : String(linha[idx] ?? "").trim();
        }
        // Linha vazia no fim do arquivo é comum — não vira registro.
        if (Object.values(obj).some(v => v)) dados.push(obj);
    }
    return { dados, faltando };
}

function _shlRenderPrevia(faltando) {
    const n = _shlLinhas.length;
    document.getElementById("shl-previa-titulo").innerText =
        `Prévia · ${n} linha${n !== 1 ? "s" : ""} de ${_shlArquivoNome}`;
    document.getElementById("shl-sub").innerText = "Arraste o arquivo aqui ou clique para selecionar — .xlsx, .xls ou .csv";

    if (faltando && faltando.length) {
        _shlMsg(`Estas colunas não foram encontradas e vão entrar em branco: <strong>${_shlEsc(faltando.join(", "))}</strong>.`, "aviso");
    }

    // Mostra as 20 primeiras: a prévia é pra conferir se as colunas casaram, não pra ler
    // o arquivo inteiro.
    const amostra = _shlLinhas.slice(0, 20);
    document.getElementById("shl-previa-tbody").innerHTML = amostra.map(l => `
        <tr>${SHL_COLUNAS.map(c =>
            `<td data-label="${c.label}">${_shlEsc(l[c.id]) || '<span style="color:#717f95">—</span>'}</td>`).join("")}</tr>
    `).join("") + (n > amostra.length
        ? `<tr><td colspan="${SHL_COLUNAS.length}" style="text-align:center;color:#8494a9;padding:14px">
             + ${n - amostra.length} linha${n - amostra.length !== 1 ? "s" : ""} que não cabem na prévia</td></tr>`
        : "");

    document.getElementById("shl-previa").style.display = "";
    const btn = document.getElementById("shl-btn-enviar");
    btn.disabled = false;
    btn.textContent = `Enviar ${n} linha${n !== 1 ? "s" : ""}`;
}

function _shlCancelar() {
    _shlLinhas = [];
    _shlArquivoNome = "";
    _shlMsg("", null);
    const previa = document.getElementById("shl-previa");
    if (previa) previa.style.display = "none";
    const sub = document.getElementById("shl-sub");
    if (sub) sub.innerText = "Arraste o arquivo aqui ou clique para selecionar — .xlsx, .xls ou .csv";
}

function _shlEnviar() {
    if (_shlEnviando || !_shlLinhas.length) return;
    _shlEnviando = true;
    const btn = document.getElementById("shl-btn-enviar");
    btn.disabled = true;
    btn.textContent = "Enviando...";

    fetch(`${API}/shopee/lh`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ arquivo: _shlArquivoNome, linhas: _shlLinhas })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        _shlEnviando = false;
        btn.disabled = false;
        if (!ok) {
            btn.textContent = "Enviar para o sistema";
            return _shlMsg(_shlEsc(d.error) || "Não foi possível enviar.", "erro");
        }
        const n = d.gravadas;
        _shlCancelar();
        _shlMsg(`✓ ${n} linha${n !== 1 ? "s" : ""} enviada${n !== 1 ? "s" : ""}.`, "ok");
        _shlCarregarHistorico();
    })
    .catch(() => {
        _shlEnviando = false;
        btn.disabled = false;
        btn.textContent = "Enviar para o sistema";
        _shlMsg("Erro ao conectar com o servidor.", "erro");
    });
}

// ── Histórico ──
function _shlCarregarHistorico() {
    const empty  = document.getElementById("shl-hist-empty");
    const result = document.getElementById("shl-hist-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/shopee/lh/importacoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            const imps = (d && d.importacoes) || [];
            _shlRenderUltima(imps[0], d && d.total);
            if (!imps.length) { skFim(empty, "Nenhum romaneiro enviado ainda."); return; }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("shl-hist-tbody").innerHTML = imps.map(i => `
                <tr>
                    <td data-label="Arquivo">${_shlEsc(i.arquivo) || "—"}</td>
                    <td data-label="Linhas" style="font-variant-numeric:tabular-nums">${i.linhas}</td>
                    <td data-label="Enviado por">${_shlEsc(i.importado_por) || "—"}</td>
                    <td data-label="Quando" style="color:#8494a9">${_shlDataHora(i.importado_em)}</td>
                </tr>`).join("");
        })
        .catch(() => {
            skFim(empty, "Erro ao conectar com o servidor.");
            _shlRenderUltima(null, null);
        });
}

function _shlDataHora(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// "Há quanto tempo" junto da data: o que interessa é saber se o romaneiro de hoje já
// entrou, e uma data crua exige a pessoa fazer essa conta de cabeça.
function _shlHaQuantoTempo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1)   return "agora mesmo";
    if (min < 60)  return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)    return `há ${h}h`;
    const d = Math.floor(h / 24);
    return d === 1 ? "ontem" : `há ${d} dias`;
}

function _shlRenderUltima(ultima, total) {
    const el = document.getElementById("shl-ultima");
    if (!ultima) {
        el.className = "shr-ultima vazia";
        el.innerHTML = `<span class="shr-ultima-label">Romaneiro</span>
            <span class="shr-ultima-valor">Nenhum envio ainda</span>`;
        return;
    }
    el.className = "shr-ultima";
    el.innerHTML = `
        <span class="shr-ultima-label">Atualizado</span>
        <span class="shr-ultima-valor">${_shlDataHora(ultima.importado_em)}</span>
        <span class="shr-ultima-rel">${_shlHaQuantoTempo(ultima.importado_em)}</span>
        <span class="shr-ultima-obs">${_shlEsc(ultima.importado_por) || "—"} · ${ultima.linhas} linha${ultima.linhas !== 1 ? "s" : ""}${
            total ? ` · ${total.toLocaleString("pt-BR")} no total` : ""}</span>`;
}
