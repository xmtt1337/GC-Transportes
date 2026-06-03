// ───── NOTA FISCAL ─────
if (typeof pdfjsLib !== "undefined")
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function _mostrarUploadArea() {
    const area = document.getElementById("nota-upload-area");
    area.innerHTML = `
        <input type="file" id="nota-file-input" accept=".pdf" style="display:none" onchange="_processarNota(this)">
        <div class="nota-upload-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3a86ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/></svg>
        </div>
        <div class="nota-upload-text">
            <div class="nota-upload-title">Enviar Nota Fiscal</div>
            <div class="nota-upload-sub">Selecione o PDF · dados extraídos automaticamente</div>
        </div>
        <div class="nota-upload-btn">Selecionar PDF</div>`;
    area.style.display = "";
    document.getElementById("nota-card").style.display = "none";
}

function _carregarNota() {
    fetch(`${API}/nota?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.ok ? r.json() : null)
    .then(nota => nota ? _renderNotaCard(nota) : _mostrarUploadArea())
    .catch(() => _mostrarUploadArea());
}

function _renderNotaCard(nota) {
    document.getElementById("nota-upload-area").style.display = "none";
    document.getElementById("nota-card").style.display = "";
    document.getElementById("nota-numero").textContent  = nota.chave_acesso || nota.numero_nf || "—";
    document.getElementById("nota-emissao").textContent = nota.emissao      || "—";
    document.getElementById("nota-cnpj").textContent    = nota.cnpj         || "—";
    document.getElementById("nota-emissor").textContent = nota.emissor      || "—";
    document.getElementById("nota-valor").textContent   = nota.valor        || "—";
    document.getElementById("nota-tomador").textContent = nota.tomador      || "—";

    const statusEl = document.getElementById("nota-status");
    if (nota.valor && nota.valor !== "—" && _fTotalReceber) {
        const notaNum = _parseMoeda(nota.valor);
        const diff    = Math.abs(notaNum - _fTotalReceber);
        if (diff < 0.02) {
            statusEl.className   = "nota-status confere";
            statusEl.innerHTML   = `<span>✓</span> Valor confere com o fechamento (${moedaJS(_fTotalReceber)})`;
        } else {
            statusEl.className   = "nota-status diverge";
            statusEl.innerHTML   = `<span>⚠</span> Valor diverge — fechamento: ${moedaJS(_fTotalReceber)} · NF: ${moedaJS(notaNum)}`;
        }
        statusEl.style.display = "";
    } else {
        statusEl.style.display = "none";
    }
}

async function _removerNota() {
    await fetch(`${API}/nota?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    }).catch(() => {});
    _mostrarUploadArea();
}

async function _processarNota(input) {
    const file = input.files[0];
    if (!file) return;
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

        // Verificar se a chave de acesso já foi usada em outro período/entregador
        if (nota.chave_acesso) {
            const vRes  = await fetch(`${API}/nota/verificar?chave_acesso=${nota.chave_acesso}&mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
                headers: { "Authorization": "Bearer " + token }
            });
            const vData = await vRes.json();
            if (vData.duplicata) {
                _mostrarUploadArea();
                const hint = document.querySelector("#nota-upload-area .nota-hint");
                hint.style.color  = "#ef4444";
                hint.textContent  = `⚠ Esta nota já foi utilizada (${vData.detalhe}). Use uma nota diferente.`;
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
        _mostrarUploadArea();
        document.querySelector("#nota-upload-area .nota-hint").textContent = "Erro ao ler o PDF. Tente novamente.";
        document.querySelector("#nota-upload-area .nota-hint").style.color = "#ef4444";
    }
}

function _extrairCamposNota(raw) {
    const t = raw.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();

    // ── CHAVE DE ACESSO / CÓDIGO ÚNICO ──
    let chave_acesso = null;

    const chaveM44 = t.match(/(?<!\d)(\d{44})(?!\d)/);
    if (chaveM44) chave_acesso = chaveM44[1];

    if (!chave_acesso) {
        const m4 = t.match(/(?<!\d)(\d{4}(?:\s+\d{4}){10})(?!\d)/);
        if (m4) chave_acesso = m4[1].replace(/\s+/g, "");
    }

    if (!chave_acesso) {
        const mLabel = t.match(/[Cc]have\s+de\s+[Aa]cesso[^0-9]{0,40}([\d][\d\s]{42,56}[\d])/);
        if (mLabel) {
            const d = mLabel[1].replace(/\s/g, "");
            if (d.length >= 44) chave_acesso = d.slice(0, 44);
        }
    }

    if (!chave_acesso) {
        const candidatos = t.match(/\d[\d ]{43,70}\d/g) || [];
        for (const c of candidatos) {
            const d = c.replace(/ /g, "");
            if (d.length === 44 && /^\d+$/.test(d)) { chave_acesso = d; break; }
        }
    }

    if (!chave_acesso) {
        const codPats = [
            /C[oó]digo\s+de\s+verifica[çc][aã]o[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+de\s+verifica\S*\s+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+de\s+autenticidade[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+de\s+controle[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+verificador[:\s]+([A-Za-z0-9]{4,50})/i,
            /Chave\s+de\s+acesso[:\s]+([A-Za-z0-9]{8,60})/i,
            /Verifica\S*\s+de\s+autenticidade[:\s]+([A-Za-z0-9]{4,50})/i,
            /C[oó]digo\s+NFS-?[eE][:\s]+([A-Za-z0-9]{4,50})/i,
        ];
        for (const p of codPats) {
            const m = t.match(p);
            if (m) { chave_acesso = m[1].trim(); break; }
        }
    }

    // ── NÚMERO DA NF ──
    const numNfM = t.match(/N[úu]mero\s+da\s+NFS?-?[eE][:\s]+(\d+)/i)
                || t.match(/N[úu]mero\s+d[ao]\s+[Nn]ota[:\s\s]+(\d+)/i)
                || t.match(/N[úu]mero\s+do\s+RPS[:\s]+(\d+)/i)
                || t.match(/NF-?[eE]\s+N[°ºo]?[:\s.]+(\d+)/i)
                || t.match(/Nota\s+Fiscal\s+N[°ºo]?[:\s.]+(\d+)/i);
    const numero_nf = numNfM ? numNfM[1] : null;

    // ── DATA DE EMISSÃO ──
    const dataLabelM = t.match(/emiss[aã]o[^0-9]{0,30}(\d{2}\/\d{2}\/\d{4})[^0-9]{0,5}(\d{2}:\d{2}(?::\d{2})?)?/i);
    const dataHoraM  = t.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    let emissao;
    if (dataLabelM) {
        emissao = dataLabelM[2] ? `${dataLabelM[1]} ${dataLabelM[2]}` : dataLabelM[1];
    } else if (dataHoraM) {
        emissao = `${dataHoraM[1]} ${dataHoraM[2]}`;
    } else {
        emissao = (t.match(/\d{2}\/\d{2}\/\d{4}/) || ["—"])[0];
    }

    // ── CNPJ ──
    const cnpjAll = [];
    const cnpjFmtRe = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
    let mc;
    while ((mc = cnpjFmtRe.exec(t)) !== null) {
        cnpjAll.push({ raw: mc[0], idx: mc.index });
    }
    if (!cnpjAll.length) {
        const re14 = /(?<!\d)\d{14}(?!\d)/g;
        while ((mc = re14.exec(t)) !== null) cnpjAll.push({ raw: mc[0], idx: mc.index });
    }
    const tomadorIdx = t.search(/TOMADOR/i);
    const cnpjEmit   = cnpjAll.find(c => tomadorIdx < 0 || c.idx < tomadorIdx) || cnpjAll[0];
    const cnpj       = cnpjEmit ? cnpjEmit.raw : "—";

    // ── VALOR ──
    const valorPatterns = [
        /Valor\s+L[ií]quido\s+da\s+NFS-?e[:\s]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+DOS\s+SERVI[CÇ]OS[^\d]*([\d.]+,\d{2})/i,
        /Valor\s+do\s+Servi[çc]o[:\s]*([\d.]+,\d{2})/i,
        /VALOR\s+L[IÍ]QUIDO[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+GERAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+A\s+PAGAR[^\d]*([\d.]+,\d{2})/i,
        /R\$\s*([\d.]+,\d{2})/,
    ];
    let valor = "—";
    for (const pat of valorPatterns) {
        const vm = t.match(pat);
        if (vm) { valor = `R$ ${vm[1]}`; break; }
    }

    // ── AUXILIAR: nome próximo ao CNPJ ──
    // Rejeita candidatos que contenham labels de campos administrativos
    const _reAdmin = /\b(ENDERE[ÇC]O|INSCRI[ÇC][ÃA]O(?:\s+ESTADUAL)?|CEP\b|BAIRRO|MUNIC[IÍ]PIO|CIDADE\b|UF\b|TELEFONE|E-?MAIL)\b/iu;
    function _nomePertoCNPJ(entry, janela = 400) {
        if (!entry) return null;
        const before = t.slice(Math.max(0, entry.idx - janela), entry.idx);
        const m = before.match(/([\p{L}][\p{L}\d\s\-&.,'/]{3,80})\s*$/u);
        if (!m) return null;
        const candidate = m[1].trim();
        if (_reAdmin.test(candidate)) return null;
        return candidate;
    }

    // ── HELPER: busca nome dentro de uma seção por múltiplos labels ──
    function _nomeNaSec(sec) {
        return sec.match(/Raz[aã]o\s+[Ss]ocial[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i)
            || sec.match(/Nome\s+Empresarial[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i)
            || sec.match(/Nome\s*[\/|]\s*(?:Nome\s+)?Empresarial\s+(.+?)(?=\s+E-?mail|\s+Endere[çc]o|\s+Inscri|\s+CNPJ|\s+CPF)/i)
            || sec.match(/Nome[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri|\s+E-?mail|\s+Endere[çc]o))/i);
    }

    // ── EMISSOR ──
    let emissor = "—";

    // P1: EMITENTE DA NFS (ABRASF / DANFSe)
    if (emissor === "—") {
        const secM = t.match(/EMITENTE\s+DA\s+NFS.{0,5}(.{0,600}?)(?=TOMADOR|INTERMEDI[AÁ]RIO|SERVI[CÇ]O\s+PRESTADO)/i);
        if (secM) {
            const nomeM = _nomeNaSec(secM[1]);
            if (nomeM) emissor = nomeM[1].trim().replace(/^\d{2}\.?\d{3}\.?\d{3}\s+/, "");
        }
    }

    // P2: PRESTADOR DE SERVIÇOS (prefeituras — Betha, ISSNet, WebISS, Simpliss)
    if (emissor === "—") {
        const secM = t.match(/PRESTADOR\s+DE\s+SERVI[CÇ]OS?(.{0,800}?)(?=TOMADOR)/i);
        if (secM) {
            const nomeM = _nomeNaSec(secM[1]);
            if (nomeM) emissor = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }

    // P3: DADOS DO PRESTADOR (Betha, IPM, GovBR)
    if (emissor === "—") {
        const secM = t.match(/DADOS\s+DO\s+PRESTADOR(.{0,600}?)(?=DADOS\s+DO\s+TOMADOR|TOMADOR)/i);
        if (secM) {
            const nomeM = _nomeNaSec(secM[1]);
            if (nomeM) emissor = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }

    // P4: RAZÃO SOCIAL / NOME EMPRESARIAL direto (DANFE, NF-e)
    if (emissor === "—") {
        const razaoM = t.match(/(?:RAZ[AaãÃ]O\s+SOCIAL|NOME\s+EMPRESARIAL)[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|ENDERE[CÇ]O|INS|IE\b|\d{2}[.\/]))/i);
        if (razaoM) emissor = razaoM[1].trim();
    }

    // Fallback: texto antes do CNPJ do emitente (janela 400 chars + validação anti-label)
    if (emissor === "—") emissor = _nomePertoCNPJ(cnpjEmit) || "—";

    // ── TOMADOR ──
    let tomador = "—";

    // P1: TOMADOR DO SERVIÇO (ABRASF / DANFSe)
    if (tomador === "—") {
        const secM = t.match(/TOMADOR\s+DO\s+SERVI[CÇ]O(.{0,600}?)(?=INTERMEDI[AÁ]RIO|SERVI[CÇ]O\s+PRESTADO|TRIBUTA[CÇ][ÃA]O|DISCRIMINA)/i);
        if (secM) {
            const nomeM = _nomeNaSec(secM[1]);
            if (nomeM) tomador = nomeM[1].trim();
        }
    }

    // P2: TOMADOR DE SERVIÇOS (prefeituras — Betha, ISSNet, WebISS, Simpliss)
    if (tomador === "—") {
        const secM = t.match(/TOMADOR\s+DE\s+SERVI[CÇ]OS?(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO|TRIBUTA[CÇ][ÃA]O)/i);
        if (secM) {
            const nomeM = _nomeNaSec(secM[1]);
            if (nomeM) tomador = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }

    // P3: DADOS DO TOMADOR (Betha, IPM, GovBR)
    if (tomador === "—") {
        const secM = t.match(/DADOS\s+DO\s+TOMADOR(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO|TRIBUTA[CÇ][ÃA]O)/i);
        if (secM) {
            const nomeM = _nomeNaSec(secM[1]);
            if (nomeM) tomador = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }

    // P4: DESTINATÁRIO / CONTRATANTE / TOMADOR label direto (DANFE / NF-e genérica)
    if (tomador === "—") {
        const tomLabelPatterns = [
            /DESTINAT[AÁ]RIO(?:[\/\s]REMETENTE)?[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
            /CONTRATANTE[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
            /TOMADOR[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
        ];
        for (const pat of tomLabelPatterns) {
            const tm = t.match(pat);
            if (tm) { tomador = tm[1].trim(); break; }
        }
    }

    // Fallback: texto antes do segundo CNPJ (janela 400 chars + validação anti-label)
    if (tomador === "—" && cnpjAll.length > 1) {
        const c2 = cnpjAll.find(c => c !== cnpjEmit) || cnpjAll[1];
        tomador = _nomePertoCNPJ(c2) || "—";
    }

    return { emissao, cnpj, emissor, valor, tomador, numero_nf, chave_acesso };
}
