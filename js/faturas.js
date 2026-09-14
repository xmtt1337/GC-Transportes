// ───── TELA GERADOR DE FATURAS (Financeiro) ─────

function abrirGeradorFaturas(event) {
    if (event) event.preventDefault();
    _fatLimparMsg();
    document.getElementById("fat-numero").value = "";
    document.getElementById("fat-valor").value = "";
    document.getElementById("fat-referencia").value = "";
    document.getElementById("fat-emissao").value = _fatHojeISO();
    mostrarTela("tela-faturas");
    _fatCarregarHistorico();
}

// Local do navegador, de propósito — evita o desvio de "toISOString()", que
// converte pra UTC e pode devolver o dia de ontem/amanhã dependendo do fuso.
function _fatHojeISO() {
    const hoje = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
}

function _fatFormatarDataBR(iso) {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
}

function _fatLimparMsg() {
    const el = document.getElementById("fat-form-msg");
    el.style.display = "none"; el.innerHTML = "";
}

function _fatMostrarMsg(msg, tipo) {
    const el = document.getElementById("fat-form-msg");
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _fatCarregarHistorico() {
    const empty     = document.getElementById("fat-empty");
    const resultado = document.getElementById("fat-resultado");
    skMostrar(empty);
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/faturas`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(data => {
        if (data.error) { skFim(empty, data.error); return; }
        if (!data.length) { skFim(empty, "Nenhuma fatura gerada ainda."); return; }
        empty.style.display = "none";
        resultado.style.display = "";

        document.getElementById("fat-tbody").innerHTML = data.map(f => `<tr>
            <td>${f.numero_fatura}</td>
            <td>${f.referencia}</td>
            <td class="pag-valor">${moedaJS(parseFloat(f.valor))}</td>
            <td>${_fatFormatarDataBR(f.data_emissao)}</td>
            <td>${_fatFormatarDataBR(f.vencimento)}</td>
            <td>${f.gerado_por || "—"}</td>
            <td>
                <button class="adm-nf-pdf-btn" onclick="_fatBaixar(${f.id}, '${String(f.nome_arquivo).replace(/[^\wÀ-ÿ .-]/g, "")}')" title="Baixar o PDF desta fatura">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    PDF
                </button>
            </td>
        </tr>`).join("");
    })
    .catch(() => skFim(empty, "Erro ao carregar faturas."));
}

function _fatGerar() {
    const numero     = document.getElementById("fat-numero").value.trim();
    const emissaoISO = document.getElementById("fat-emissao").value;
    const valor      = document.getElementById("fat-valor").value;
    const referencia = document.getElementById("fat-referencia").value.trim();

    if (!numero)     return _fatMostrarMsg("Informe o número da fatura.", "erro");
    if (!emissaoISO) return _fatMostrarMsg("Informe a data de emissão.", "erro");
    if (!valor || parseFloat(valor) <= 0) return _fatMostrarMsg("Informe um valor válido.", "erro");
    if (!referencia) return _fatMostrarMsg("Informe a referência/PO.", "erro");

    const btn = document.getElementById("fat-gerar-btn");
    btn.disabled = true;
    const textoOriginal = btn.innerText;
    btn.innerText = "Gerando...";
    _fatLimparMsg();

    fetch(`${API}/faturas/gerar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ numero_fatura: numero, data_emissao: emissaoISO, valor: parseFloat(valor), referencia })
    })
    .then(async (r) => {
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d.error || "Erro ao gerar fatura.");
        }
        const blob = await r.blob();
        const [y, m, d] = emissaoISO.split("-");
        const nome = `Fatura GC Shopee ${referencia} - ${d}-${m}-${y}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        _fatMostrarMsg("Fatura gerada e baixada com sucesso.", "sucesso");
        document.getElementById("fat-numero").value = "";
        document.getElementById("fat-valor").value = "";
        document.getElementById("fat-referencia").value = "";
        _fatCarregarHistorico();
    })
    .catch((err) => _fatMostrarMsg(err.message || "Erro ao gerar fatura.", "erro"))
    .finally(() => { btn.disabled = false; btn.innerText = textoOriginal; });
}

function _fatBaixar(id, nome) {
    fetch(`${API}/faturas/${id}/pdf`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
    .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nome || `fatura-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    })
    .catch(() => gcAlert("Não foi possível baixar o PDF desta fatura."));
}
