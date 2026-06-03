// ───── NOTA FISCAL ─────
if (typeof pdfjsLib !== "undefined")
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let _notaAtual = null;

function _mostrarUploadArea(erro) {
    const area = document.getElementById("nota-upload-area");
    area.innerHTML = `
        <input type="file" id="nota-file-input" accept=".pdf" style="display:none" onchange="_processarNota(this)">
        <div class="nota-upload-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3a86ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>
        </div>
        <div class="nota-upload-text">
            <div class="nota-upload-title">Enviar Nota Fiscal</div>
            <div class="nota-upload-sub" id="nota-upload-sub">${erro ? `<span style="color:#ef4444">${erro}</span>` : "Arraste o PDF aqui ou clique para selecionar"}</div>
        </div>
        <div class="nota-upload-btn">Selecionar</div>`;
    area.ondragover  = (e) => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = ()  => area.classList.remove("drag-over");
    area.ondrop      = (e) => {
        e.preventDefault(); area.classList.remove("drag-over");
        const f = e.dataTransfer.files[0];
        if (f && f.type === "application/pdf") _processarNotaFile(f);
        else _mostrarUploadArea("Arquivo inválido. Envie um PDF.");
    };
    area.style.display = "";
    document.getElementById("nota-card").style.display = "none";
}

function _renderNotaCard(nota) {
    _notaAtual = nota;
    document.getElementById("nota-upload-area").style.display = "none";
    const notaNum = _parseMoeda(nota.valor);
    const diff    = _fTotalReceber && notaNum > 0 ? Math.abs(notaNum - _fTotalReceber) : null;
    const statusHtml = diff !== null
        ? (diff < 0.02
            ? `<div class="nota-status confere" style="margin-top:6px"><span>✓</span> Valor confere com o fechamento (${moedaJS(_fTotalReceber)})</div>`
            : `<div class="nota-status diverge" style="margin-top:6px"><span>⚠</span> Valor diverge — fechamento: ${moedaJS(_fTotalReceber)} · NF: ${moedaJS(notaNum)}</div>`)
        : "";
    const card = document.getElementById("nota-card");
    card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
            <div class="nota-card-ok-icon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style="flex:1;min-width:0">
                <span style="font-size:13px;font-weight:700;color:#22c55e">NF Enviada</span>
                ${nota.chave_acesso || nota.numero_nf ? `<span style="font-size:11px;color:#64748b;margin-left:8px">${(nota.chave_acesso || nota.numero_nf).slice(0,20)}…</span>` : ""}
            </div>
            <button class="nota-ver-btn" onclick="_verNotaModal()">Ver nota →</button>
            <button class="nota-remove-btn" onclick="_removerNota()">✕</button>
        </div>
        ${statusHtml}`;
    card.style.display = "";
}

function _verNotaModal() {
    if (!_notaAtual) return;
    const n = _notaAtual;
    const notaNum = _parseMoeda(n.valor);
    const diff    = _fTotalReceber && notaNum > 0 ? Math.abs(notaNum - _fTotalReceber) : null;
    const statusHtml = diff !== null
        ? (diff < 0.02
            ? `<div class="nota-status confere"><span>✓</span> Valor confere com o fechamento (${moedaJS(_fTotalReceber)})</div>`
            : `<div class="nota-status diverge"><span>⚠</span> Valor diverge — fechamento: ${moedaJS(_fTotalReceber)} · NF: ${moedaJS(notaNum)}</div>`)
        : "";
    const row = (lbl, val) => val && val !== "—"
        ? `<div class="nota-modal-row"><span class="nota-modal-lbl">${lbl}</span><span class="nota-modal-val">${val}</span></div>`
        : "";
    const overlay = document.createElement("div");
    overlay.className = "nota-modal-overlay";
    overlay.innerHTML = `
        <div class="nota-modal">
            <div class="nota-modal-header">
                <span>Nota Fiscal</span>
                <button class="nota-modal-close" onclick="this.closest('.nota-modal-overlay').remove()">✕</button>
            </div>
            <div class="nota-modal-body">
                ${row("Nº / Chave", n.chave_acesso || n.numero_nf)}
                ${row("Data emissão", n.emissao)}
                ${row("CNPJ", n.cnpj)}
                ${row("Emissor", n.emissor)}
                ${row("Valor", n.valor)}
                ${row("Tomador", n.tomador)}
                ${statusHtml}
            </div>
            <div class="nota-modal-footer">
                <button class="nota-remove-btn" onclick="_removerNota();this.closest('.nota-modal-overlay').remove()">✕ Remover NF</button>
            </div>
        </div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

function _carregarNota() {
    fetch(`${API}/nota?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.ok ? r.json() : null)
    .then(nota => nota ? _renderNotaCard(nota) : _mostrarUploadArea())
    .catch(() => _mostrarUploadArea());
}

async function _removerNota() {
    await fetch(`${API}/nota?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    }).catch(() => {});
    _mostrarUploadArea();
}

function _processarNota(input) {
    const file = input.files[0];
    if (file) _processarNotaFile(file);
}

async function _processarNotaFile(file) {
    const area = document.getElementById("nota-upload-area");
    area.innerHTML = `<div class="nota-loading">Lendo PDF…</div>`;
    try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(it => it.str).join(" ") + "\n";
        }
        const nota             = _extrairCamposNota(text);
        const notaNum          = _parseMoeda(nota.valor);
        const valor_fechamento = _fTotalReceber || null;
        const status           = (valor_fechamento && notaNum > 0)
            ? (Math.abs(notaNum - valor_fechamento) < 0.02 ? "confere" : "diverge")
            : null;

        if (nota.chave_acesso) {
            const vRes  = await fetch(`${API}/nota/verificar?chave_acesso=${nota.chave_acesso}&mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
                headers: { "Authorization": "Bearer " + token }
            });
            const vData = await vRes.json();
            if (vData.duplicata) {
                _mostrarUploadArea(`⚠ Esta nota já foi utilizada (${vData.detalhe}). Use uma nota diferente.`);
                return;
            }
        }

        await fetch(`${API}/nota`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ mes: _fMes, ano: _fAno, quinzena: _fQuinzena, ...nota, status, valor_fechamento })
        });
        _renderNotaCard(nota);
    } catch (e) {
        _mostrarUploadArea("Erro ao ler o PDF. Tente novamente.");
    }
}

function _extrairCamposNota(raw) {
    const t = raw.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();

    // ── CHAVE DE ACESSO ──
    let chave_acesso = null;
    const chaveM44 = t.match(/(?<!\d)(\d{44})(?!\d)/);
    if (chaveM44) chave_acesso = chaveM44[1];
    if (!chave_acesso) {
        const m4 = t.match(/(?<!\d)(\d{4}(?:\s+\d{4}){10})(?!\d)/);
        if (m4) chave_acesso = m4[1].replace(/\s+/g, "");
    }
    if (!chave_acesso) {
        const mLabel = t.match(/[Cc]have\s+de\s+[Aa]cesso[^0-9]{0,40}([\d][\d\s]{42,56}[\d])/);
        if (mLabel) { const d = mLabel[1].replace(/\s/g, ""); if (d.length >= 44) chave_acesso = d.slice(0, 44); }
    }
    if (!chave_acesso) {
        for (const c of (t.match(/\d[\d ]{43,70}\d/g) || [])) {
            const d = c.replace(/ /g, "");
            if (d.length === 44 && /^\d+$/.test(d)) { chave_acesso = d; break; }
        }
    }
    if (!chave_acesso) {
        for (const p of [
            /C[oó]digo\s+de\s+verifica[çc][aã]o[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+de\s+autenticidade[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+de\s+controle[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+verificador[:\s]+([A-Za-z0-9]{4,50})/i,
            /Chave\s+de\s+acesso[:\s]+([A-Za-z0-9]{8,60})/i,
            /C[oó]digo\s+NFS-?[eE][:\s]+([A-Za-z0-9]{4,50})/i,
        ]) { const m = t.match(p); if (m) { chave_acesso = m[1].trim(); break; } }
    }

    // ── NÚMERO DA NF ──
    const numero_nf = (
        t.match(/N[úu]mero\s+da\s+NFS?-?[eE][:\s]+(\d+)/i)      ||
        t.match(/N[úu]mero\s+d[ao]\s+[Nn]ota[:\s]+(\d+)/i)       ||
        t.match(/N[úu]mero\s+do\s+RPS[:\s]+(\d+)/i)              ||
        t.match(/\bN[°º]\s*([\d.]+)\s+S[ÉE]RIE/i)                ||
        t.match(/NF-?[eE]\s+N[°ºo.]?[:\s]+(\d[\d.]+)/i)          ||
        t.match(/Nota\s+Fiscal\s+N[°ºo.]?[:\s]+(\d[\d.]+)/i)     ||
        t.match(/NFS-?[eE]\s+N[°ºo.]?\s*(\d+)/i)
    )?.[1] ?? null;

    // ── DATA DE EMISSÃO ──
    const dataLabelM = t.match(/emiss[aã]o[^0-9]{0,30}(\d{2}\/\d{2}\/\d{4})[^0-9]{0,5}(\d{2}:\d{2}(?::\d{2})?)?/i);
    const dataHoraM  = t.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    let emissao;
    if (dataLabelM)     emissao = dataLabelM[2] ? `${dataLabelM[1]} ${dataLabelM[2]}` : dataLabelM[1];
    else if (dataHoraM) emissao = `${dataHoraM[1]} ${dataHoraM[2]}`;
    else                emissao = (t.match(/\d{2}\/\d{2}\/\d{4}/) || ["—"])[0];

    // ── CNPJ ──
    const cnpjAll = [];
    let mc;
    const cnpjFmtRe = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
    while ((mc = cnpjFmtRe.exec(t)) !== null) cnpjAll.push({ raw: mc[0], idx: mc.index });
    if (!cnpjAll.length) {
        const re14 = /(?<!\d)\d{14}(?!\d)/g;
        while ((mc = re14.exec(t)) !== null) cnpjAll.push({ raw: mc[0], idx: mc.index });
    }
    // Para DANFE: emitente vem antes de DESTINATÁRIO; para NFS-e: antes de TOMADOR
    const sepIdx   = Math.min(
        t.search(/DESTINAT[AÁ]R/i) < 0 ? Infinity : t.search(/DESTINAT[AÁ]R/i),
        t.search(/\bTOMADOR\b/i)   < 0 ? Infinity : t.search(/\bTOMADOR\b/i)
    );
    const cnpjEmit = cnpjAll.find(c => sepIdx === Infinity || c.idx < sepIdx) || cnpjAll[0];
    const cnpj     = cnpjEmit ? cnpjEmit.raw : "—";

    // ── VALOR ──
    let valor = "—";
    for (const pat of [
        /Valor\s+L[ií]quido\s+da\s+NFS?-?[eE][:\s]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+DOS\s+SERVI[CÇ]OS[^\d]*([\d.]+,\d{2})/i,
        /Valor\s+do\s+Servi[çc]o[:\s]*([\d.]+,\d{2})/i,
        /VALOR\s+L[IÍ]QUIDO[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL\s+DO\s+CT-?[eE][^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+GERAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+A\s+PAGAR[^\d]*([\d.]+,\d{2})/i,
        /R\$\s*([\d.]+,\d{2})/,
    ]) { const vm = t.match(pat); if (vm) { valor = `R$ ${vm[1]}`; break; } }

    // ── AUXILIARES ──
    const _reAdmin = /\b(ENDERE[ÇC]O|INSCRI[ÇC][ÃA]O(?:\s+ESTADUAL)?|CEP\b|BAIRRO|MUNIC[IÍ]PIO|CIDADE\b|UF\b|TELEFONE|E-?MAIL|FONE\b|FAX\b)\b/iu;

    function _nomePertoCNPJ(entry, janela = 400) {
        if (!entry) return null;
        const before = t.slice(Math.max(0, entry.idx - janela), entry.idx);
        const m = before.match(/([\p{L}][\p{L}\d\s\-&.,'/]{3,80})\s*$/u);
        if (!m) return null;
        const c = m[1].trim();
        return _reAdmin.test(c) ? null : c;
    }

    function _nomeNaSec(sec) {
        return sec.match(/Raz[aã]o\s+[Ss]ocial[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i)
            || sec.match(/Nome\s+Empresarial[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i)
            || sec.match(/Nome\s*[\/|]\s*(?:Nome\s+)?Empresarial\s+(.+?)(?=\s+E-?mail|\s+Endere[çc]o|\s+Inscri|\s+CNPJ|\s+CPF)/i)
            || sec.match(/Nome[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri|\s+E-?mail|\s+Endere[çc]o))/i);
    }

    // Nome direto após header (DANFE): primeira sequência de letras antes de CNPJ/IE/ENDEREÇO
    function _nomeDirectSec(sec) {
        return sec.match(/^\s*([\p{Lu}][\p{L}\s\-&.,'/\d]{3,80}?)(?=\s*(?:CNPJ|IE\b|ENDERE[CÇ]O|INSCRI|\d{2}[.\/]))/u);
    }

    // ── EMISSOR ──
    let emissor = "—";

    // NFS-e ABRASF / DANFSe
    if (emissor === "—") {
        const m = t.match(/EMITENTE\s+DA\s+NFS.{0,5}(.{0,600}?)(?=TOMADOR|INTERMEDI[AÁ]RIO|SERVI[CÇ]O\s+PRESTADO)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) emissor = n[1].trim().replace(/^\d{2}\.?\d{3}\.?\d{3}\s+/, ""); }
    }
    // NFS-e prefeituras — PRESTADOR DE SERVIÇOS
    if (emissor === "—") {
        const m = t.match(/PRESTADOR\s+DE\s+SERVI[CÇ]OS?(.{0,800}?)(?=TOMADOR)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) emissor = n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim(); }
    }
    // NFS-e — DADOS DO PRESTADOR
    if (emissor === "—") {
        const m = t.match(/DADOS\s+DO\s+PRESTADOR(.{0,600}?)(?=DADOS\s+DO\s+TOMADOR|TOMADOR)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) emissor = n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim(); }
    }
    // DANFE/NF-e — IDENTIFICAÇÃO DO EMITENTE (bloco no topo do DANFE)
    if (emissor === "—") {
        const m = t.match(/IDENTIFICA[CÇ][ÃA]O\s+DO\s+EMITENTE\s+([\p{L}][\p{L}\s\-&.,'/\d]{3,80}?)(?=\s*(?:CNPJ|IE\b|ENDERE|NF-e|\d{2}[.\/]))/u);
        if (m) emissor = m[1].trim();
    }
    // DANFE/NF-e — bloco EMITENTE (sem "DA NFS")
    if (emissor === "—") {
        const m = t.match(/\bEMITENTE\b(.{0,500}?)(?=DESTINAT[AÁ]R|RECEBEMOS|FATURA|TRANSPOR|C[AÁ]LCULO\s+DO\s+IMPOSTO)/i);
        if (m) {
            const sec = m[1];
            const withLabel = _nomeNaSec(sec);
            if (withLabel) emissor = withLabel[1].trim();
            else { const d = _nomeDirectSec(sec); if (d) emissor = d[1].trim(); }
        }
    }
    // CTe — REMETENTE
    if (emissor === "—") {
        const m = t.match(/\bREMETENTE\b(.{0,400}?)(?=DESTINAT[AÁ]R|TOMADOR|TRANSPOR)/i);
        if (m) { const n = _nomeNaSec(m[1]) || _nomeDirectSec(m[1]); if (n) emissor = n[1].trim(); }
    }
    // Genérico — RAZÃO SOCIAL / NOME EMPRESARIAL no contexto do emitente
    if (emissor === "—") {
        // Pega só a primeira ocorrência (que pertence ao emitente)
        const m = t.match(/(?:RAZ[AÃ]O\s+SOCIAL|NOME\s+EMPRESARIAL)[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|ENDERE[CÇ]O|INS|IE\b|\d{2}[.\/]))/i);
        if (m) emissor = m[1].trim();
    }
    // Fallback: texto antes do CNPJ do emitente
    if (emissor === "—") emissor = _nomePertoCNPJ(cnpjEmit) || "—";

    // ── TOMADOR ──
    let tomador = "—";

    // NFS-e ABRASF
    if (tomador === "—") {
        const m = t.match(/TOMADOR\s+DO\s+SERVI[CÇ]O(.{0,600}?)(?=INTERMEDI[AÁ]RIO|SERVI[CÇ]O\s+PRESTADO|TRIBUTA[CÇ][ÃA]O|DISCRIMINA)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) tomador = n[1].trim(); }
    }
    // NFS-e prefeituras — TOMADOR DE SERVIÇOS
    if (tomador === "—") {
        const m = t.match(/TOMADOR\s+DE\s+SERVI[CÇ]OS?(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO|TRIBUTA[CÇ][ÃA]O)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) tomador = n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim(); }
    }
    // NFS-e — DADOS DO TOMADOR
    if (tomador === "—") {
        const m = t.match(/DADOS\s+DO\s+TOMADOR(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO|TRIBUTA[CÇ][ÃA]O)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) tomador = n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim(); }
    }
    // DANFE — bloco DESTINATÁRIO/REMETENTE
    if (tomador === "—") {
        const m = t.match(/DESTINAT[AÁ]RIO(?:\/REMETENTE)?(.{0,500}?)(?=FATURA|TRANSPOR|C[AÁ]LCULO\s+DO\s+IMPOSTO|DADOS\s+DO\s+PRODUTO)/i);
        if (m) {
            const sec = m[1];
            const withLabel = _nomeNaSec(sec);
            if (withLabel) tomador = withLabel[1].trim();
            else { const d = _nomeDirectSec(sec); if (d) tomador = d[1].trim(); }
        }
    }
    // CTe — DESTINATÁRIO
    if (tomador === "—") {
        const m = t.match(/\bDESTINAT[AÁ]RIO\b(.{0,400}?)(?=TOMADOR|TRANSPOR|PRODUTO)/i);
        if (m) { const n = _nomeNaSec(m[1]) || _nomeDirectSec(m[1]); if (n) tomador = n[1].trim(); }
    }
    // Labels genéricos
    if (tomador === "—") {
        for (const pat of [
            /CONTRATANTE[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
            /\bTOMADOR[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
        ]) { const m = t.match(pat); if (m) { tomador = m[1].trim(); break; } }
    }
    // Fallback: texto antes do segundo CNPJ
    if (tomador === "—" && cnpjAll.length > 1) {
        const c2 = cnpjAll.find(c => c !== cnpjEmit) || cnpjAll[1];
        tomador = _nomePertoCNPJ(c2) || "—";
    }

    return { emissao, cnpj, emissor, valor, tomador, numero_nf, chave_acesso };
}
