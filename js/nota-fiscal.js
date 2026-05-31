// ───── NOTA FISCAL ─────
if (typeof pdfjsLib !== "undefined")
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function _mostrarUploadArea() {
    const area = document.getElementById("nota-upload-area");
    area.innerHTML = `
        <input type="file" id="nota-file-input" accept=".pdf" style="display:none" onchange="_processarNota(this)">
        <button class="nota-btn-upload" onclick="document.getElementById('nota-file-input').click()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            Anexar PDF
        </button>
        <p class="nota-hint">Extraímos automaticamente os dados da nota</p>`;
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

    // P1: 44 dígitos contínuos (NF-e, CT-e, NFS-e ABRASF sem espaçamento)
    const chaveM44 = t.match(/(?<!\d)(\d{44})(?!\d)/);
    if (chaveM44) chave_acesso = chaveM44[1];

    // P2: 44 dígitos em grupos de 4 separados por espaço (formato DANFE impresso)
    // ex: "3525 0466 8456 2200 0186 5500 1000 0000 4510 0000 0045"
    if (!chave_acesso) {
        const m4 = t.match(/(?<!\d)(\d{4}(?:\s+\d{4}){10})(?!\d)/);
        if (m4) chave_acesso = m4[1].replace(/\s+/g, "");
    }

    // P3: próximo ao label "Chave de Acesso" — captura qualquer sequência de dígitos/espaços
    if (!chave_acesso) {
        const mLabel = t.match(/[Cc]have\s+de\s+[Aa]cesso[^0-9]{0,40}([\d][\d\s]{42,56}[\d])/);
        if (mLabel) {
            const d = mLabel[1].replace(/\s/g, "");
            if (d.length >= 44) chave_acesso = d.slice(0, 44);
        }
    }

    // P4: qualquer grupo de dígitos-com-espaços que some exatamente 44 dígitos
    if (!chave_acesso) {
        const candidatos = t.match(/\d[\d ]{43,70}\d/g) || [];
        for (const c of candidatos) {
            const d = c.replace(/ /g, "");
            if (d.length === 44 && /^\d+$/.test(d)) { chave_acesso = d; break; }
        }
    }

    // Prioridade 2: código alfanumérico em diversas nomenclaturas municipais
    if (!chave_acesso) {
        const codPats = [
            // Explícito com Unicode (ç=ç, ã=ã, ó=ó)
            /C[oó]digo\s+de\s+verifica[çc][aã]o[:\s]+([A-Za-z0-9]{4,50})/i,
            // Fallback loose: qualquer coisa após "verifica" (cobre encodings alternativos)
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
    // Usa regex estrita com pontuação (XX.XXX.XXX/XXXX-XX) para não casar
    // com a Chave de Acesso (44 dígitos sem pontuação) nem com CPF
    const cnpjAll = [];
    const cnpjFmtRe = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
    let mc;
    while ((mc = cnpjFmtRe.exec(t)) !== null) {
        cnpjAll.push({ raw: mc[0], idx: mc.index });
    }
    // Fallback: 14 dígitos isolados (não adjacentes a mais dígitos)
    if (!cnpjAll.length) {
        const re14 = /(?<!\d)\d{14}(?!\d)/g;
        while ((mc = re14.exec(t)) !== null) cnpjAll.push({ raw: mc[0], idx: mc.index });
    }
    // CNPJ do emitente: o que aparece antes de "TOMADOR" (ou o primeiro)
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

    // ── EMISSOR ──
    let emissor = "—";

    // DANFSe/NFS-e ABRASF: "EMITENTE DA NFS" → "Nome / Nome Empresarial"
    const emitSecM = t.match(/EMITENTE\s+DA\s+NFS.{0,5}(.{0,600}?)(?=TOMADOR|INTERMEDIÁRIO|SERVI[CÇ]O\s+PRESTADO)/i);
    if (emitSecM) {
        const sec   = emitSecM[1];
        const nomeM = sec.match(/Nome\s*[\/\|]\s*Nome\s+Empresarial\s+(.+?)(?=\s+E-mail|\s+Endere[çc]o|\s+Inscri)/i);
        if (nomeM) emissor = nomeM[1].trim().replace(/^\d{2}\.?\d{3}\.?\d{3}\s+/, "");
    }
    // NFS-e Prefeitura: "PRESTADOR DE SERVIÇOS" → "Nome/Razão social: NAME"
    if (emissor === "—") {
        const prestSecM = t.match(/PRESTADOR\s+DE\s+SERVI[CÇ]OS?(.{0,800}?)(?=TOMADOR)/i);
        if (prestSecM) {
            const sec   = prestSecM[1];
            const nomeM = sec.match(/Raz[aãâáÃÂÁ]o\s+social[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i);
            if (nomeM) emissor = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }
    // DANFE / NF-e: "RAZÃO SOCIAL" ou "NOME EMPRESARIAL"
    if (emissor === "—") {
        const razaoM = t.match(/(?:RAZ[AaãÃ]O\s+SOCIAL|NOME\s+EMPRESARIAL)[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|ENDERE[CÇ]O|INS|IE\b|\d{2}[.\/]))/i);
        if (razaoM) emissor = razaoM[1].trim();
    }
    // Fallback: texto antes do CNPJ do emitente
    if (emissor === "—" && cnpjEmit) {
        const before = t.slice(Math.max(0, cnpjEmit.idx - 100), cnpjEmit.idx);
        const nameM  = before.match(/([A-Za-záàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\wáàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ\s\-&.,'/]{4,70})\s*$/);
        if (nameM) emissor = nameM[1].trim();
    }

    // ── TOMADOR ──
    let tomador = "—";

    // DANFSe/NFS-e ABRASF: "TOMADOR DO SERVIÇO" → "Nome / Nome Empresarial"
    const tomSecM = t.match(/TOMADOR\s+DO\s+SERVI[CÇ]O(.{0,600}?)(?=INTERMEDIÁRIO|SERVI[CÇ]O\s+PRESTADO|TRIBUTAÇÃO|DISCRIMINA)/i);
    if (tomSecM) {
        const sec   = tomSecM[1];
        const nomeM = sec.match(/Nome\s*[\/\|]\s*Nome\s+Empresarial\s+(.+?)(?=\s+E-mail|\s+Endere[çc]o|\s+Inscri)/i);
        if (nomeM) tomador = nomeM[1].trim();
    }
    // NFS-e Prefeitura: "TOMADOR DE SERVIÇOS" → "Nome/Razão social: NAME"
    if (tomador === "—") {
        const tomServSecM = t.match(/TOMADOR\s+DE\s+SERVI[CÇ]OS?(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO)/i);
        if (tomServSecM) {
            const sec   = tomServSecM[1];
            const nomeM = sec.match(/Raz[aãâáÃÂÁ]o\s+social[:\s]+(.{3,80}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri))/i);
            if (nomeM) tomador = nomeM[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim();
        }
    }
    // DANFE / NF-e genérica
    if (tomador === "—") {
        const tomLabelPatterns = [
            /DESTINAT[AÁ]RIO(?:[\/\s]REMETENTE)?[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
            /CONTRATANTE[:\s]+(.{4,80}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/i,
        ];
        for (const pat of tomLabelPatterns) {
            const tm = t.match(pat);
            if (tm) { tomador = tm[1].trim(); break; }
        }
    }
    // Fallback: texto antes do segundo CNPJ (tomador)
    if (tomador === "—" && cnpjAll.length > 1) {
        const c2     = cnpjAll.find(c => c !== cnpjEmit) || cnpjAll[1];
        const before = t.slice(Math.max(0, c2.idx - 100), c2.idx);
        const nameM2 = before.match(/([A-Za-záàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\wáàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ\s\-&.,'/]{4,70})\s*$/);
        if (nameM2) tomador = nameM2[1].trim();
    }

    return { emissao, cnpj, emissor, valor, tomador, numero_nf, chave_acesso };
}
