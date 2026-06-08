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
            <div class="nota-upload-title">Anexar PDF da Nota Fiscal</div>
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
    const row = (lbl, val) =>
        `<div class="nota-modal-row"><span class="nota-modal-lbl">${lbl}</span><span class="nota-modal-val" style="${!val||val==='—'?'color:#4a6a8a':''}">${val||'—'}</span></div>`;
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

        const vParams = new URLSearchParams({ mes: _fMes, ano: _fAno, quinzena: _fQuinzena });
        if (nota.chave_acesso) vParams.set('chave_acesso', nota.chave_acesso);
        if (nota.numero_nf)    vParams.set('numero_nf',   nota.numero_nf);
        if (nota.valor)        vParams.set('valor',        nota.valor);
        if (nota.cnpj)         vParams.set('cnpj',         nota.cnpj);
        if (nota.emissor)      vParams.set('emissor',      nota.emissor);
        if (nota.emissao)      vParams.set('emissao',      nota.emissao);
        const vRes  = await fetch(`${API}/nota/verificar?${vParams}`, {
            headers: { "Authorization": "Bearer " + token }
        });
        const vData = await vRes.json();
        if (vData.duplicata) {
            _mostrarUploadArea(`⚠ Esta nota já foi utilizada (${vData.detalhe}). Use uma nota diferente.`);
            return;
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

// ── Auxiliares de extração (compartilhados entre emissor e tomador) ──

// Rejeita texto que contenha labels administrativos ou de seção
const _reAdmin = /\b(ENDERE[ÇC]O|INSCRI[ÇC][ÃA]O(?:\s+ESTADUAL)?|CEP\b|BAIRRO|MUNIC[IÍ]PIO|CIDADE\b|UF\b|TELEFONE|E-?MAIL|FONE\b|FAX\b|CNPJ\b|CPF\b|NIF\b|EMITENTE\b|PRESTADOR\b|TOMADOR\b|DESTINAT[AÁ]R|SERVI[CÇ]O\b)\b/iu;

// Busca nome por labels dentro de uma seção de texto
function _nomeNaSec(sec) {
    return (
        // "Nome/Razão social:" — NFS-e municipais (Curitibanos e similares)
        sec.match(/Nome\s*[\/|]\s*Raz[aã]o\s+[Ss]ocial\s*:?\s*([\p{L}].{2,79}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri|IE\b|E-?mail|Endere|\s{2}))/iu) ||
        // "Razão Social" padrão / "Razão Social / Nome Empresarial"
        sec.match(/Raz[aã]o\s+[Ss]ocial\s*(?:[\/|]\s*(?:Nome\s+)?Empresarial\s*)?:?\s*([\p{L}].{2,79}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri|IE\b|E-?mail|Endere|\s{2}))/iu) ||
        sec.match(/Nome\s+Empresarial\s*:?\s*([\p{L}].{2,79}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri|IE\b|E-?mail|Endere|\s{2}))/iu) ||
        sec.match(/Nome\s*[\/|]\s*(?:Nome\s+)?Empresarial\s*([\p{L}].{2,79}?)(?=\s+(?:E-?mail|Endere[çc]o|Inscri|CNPJ|CPF))/iu) ||
        sec.match(/\bNome\s*:\s*([\p{L}].{2,79}?)(?=\s*(?:CPF|CNPJ|\d{2}[.\/]|Inscri|E-?mail|Endere))/iu)
    );
}

// Busca nome no início de seção sem label explícito (DANFE)
function _nomeDirectSec(sec) {
    return sec.match(/^\s*([\p{Lu}][\p{L}\s\-&.,'/\d]{3,80}?)(?=\s*(?:CNPJ|IE\b|ENDERE[CÇ]O|INSCRI|\d{2}[.\/]))/u);
}

// Texto mais próximo ao CNPJ (olhando para trás, janela configurável)
function _nomePertoCNPJ(t, entry, janela = 400) {
    if (!entry) return null;
    const before = t.slice(Math.max(0, entry.idx - janela), entry.idx);
    const m = before.match(/([\p{L}][\p{L}\d\s\-&.,'/]{3,80})\s*$/u);
    if (!m) return null;
    const c = m[1].trim();
    return _reAdmin.test(c) ? null : c;
}

// Rejeita candidatos que contenham texto de instrução, metadados de DPS/NFS-e ou campos administrativos.
// Usa NFD + remoção de diacríticos para não depender da forma de codificação do PDF (composta vs decomposta).
function _isTextoInstrucao(nome) {
    const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return n.includes("consulta da chave")   ||
           n.includes("portal nacional")     ||
           n.includes("autenticidade")       ||
           n.includes("numero da nfs")       ||
           n.includes("nfs-e")               ||
           n.includes("numero da dps")       ||
           n.includes("serie da dps")        ||
           n.includes("emissao da dps")      ||
           n.includes("data e hora")         ||
           n.includes("numero do rps")       ||
           n.includes("data de emissao")     ||
           n.includes("codigo de verifica")  ||
           n.includes("verifique");
}

// ── Estratégia de proximidade ao CNPJ ──
// Captura até 300 chars antes do CNPJ do emitente, remove labels e dados administrativos,
// e retorna o maior candidato que pareça uma razão social.
function _emissorPorProximidadeCNPJ(t, cnpjEmit) {
    if (!cnpjEmit) return null;
    let trecho = t.slice(Math.max(0, cnpjEmit.idx - 300), cnpjEmit.idx);

    trecho = trecho
        .replace(/(?:CNPJ|CPF|CEP|BAIRRO|MUNIC[IÍ]PIO|CIDADE|UF|TELEFONE|E-?MAIL|FONE|FAX|ENDERE[ÇC]O|PRESTADOR|EMITENTE|TOMADOR|INSCRI[ÇC][ÃA]O(?:\s+ESTADUAL)?)\s*:?/gi, " ")
        .replace(/\d{2}\.\d{3}-\d{3}/g, " ")           // CEP formatado
        .replace(/\(\d{2}\)\s*\d[\d\s\-]{6,}/g, " ")   // telefone
        .replace(/[\d.\/\-]{8,}/g, " ")                 // sequências numéricas longas
        .replace(/\bDPS\b/gi, " ")                      // token "DPS" isolado
        .replace(/\bData\s+e\s+Hora\b/gi, " ")          // metadado DPS
        .replace(/\bS[ée]rie\b/gi, " ")                 // "Série da DPS"
        .replace(/\s{2,}/g, " ").trim();

    const candidatos = (trecho.match(/[\p{L}][\p{L}\d\s\-&.,'/]{3,80}/gu) || [])
        .map(c => c.trim())
        .filter(c => c.length >= 4 && !_reAdmin.test(c) && !_isTextoInstrucao(c));

    if (!candidatos.length) return null;
    return candidatos.sort((a, b) => b.length - a.length)[0] || null;
}

// ── Extração do emissor ──
// Pipeline de estratégias em cascata. Para adicionar suporte a um novo layout de NFS-e,
// acrescente uma entrada no array `estrategias` abaixo.
function _extrairEmissor(t, cnpjEmit, sepIdx) {
    const emitPart = sepIdx < Infinity ? t.slice(0, sepIdx) : t;

    const estrategias = [
        // ── Labels diretos no trecho do emitente (mais confiável — tem label explícito) ──
        {
            nome: "label-direto",
            fn: () => {
                for (const pat of [
                    /(?:Emiss[ao]r[a]?|Emitente)\s*:\s*([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|\bCEP\b|\bIE\b|E-?mail|Endere))/iu,
                    /Raz[aã]o\s+[Ss]ocial\s*(?:[\/|]\s*(?:Nome\s+)?Empresarial\s*)?:?\s*([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|\bIE\b|Inscri|E-?mail|Endere|\s{2}))/iu,
                    /Nome\s+Empresarial\s*:?\s*([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|\bIE\b|Inscri))/iu,
                    /Prestador\s+de\s+Servi[çc]os?\s*:\s*([\p{L}].{3,119}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|\bIE\b|Inscri|E-?mail|Endere))/iu,
                    /Dados\s+do\s+Prestador\s*:\s*([\p{L}].{3,119}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|\bIE\b|Inscri|E-?mail|Endere))/iu,
                ]) {
                    const m = emitPart.match(pat);
                    if (m && !_reAdmin.test(m[1])) return m[1].trim();
                }
                return null;
            },
        },
        // ── DPS (Documento de Prestação de Serviços): seção "PRESTADOR" ──
        {
            nome: "dps-prestador",
            fn: () => {
                const m = t.match(/\bPRESTADOR\b(.{0,600}?)(?=\bTOMADOR\b|\bSERVI[CÇ]O\b|\bDISCRIMINA)/i);
                if (!m) return null;
                const n = _nomeNaSec(m[1]);
                return n ? n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim() : null;
            },
        },
        // ── NFS-e ABRASF: seção "EMITENTE DA NFS-e" ──
        {
            nome: "nfse-emitente-abrasf",
            fn: () => {
                const m = t.match(/EMITENTE\s+DA\s+NFS.{0,5}(.{0,600}?)(?=TOMADOR|INTERMEDI[AÁ]RIO|SERVI[CÇ]O\s+PRESTADO)/i);
                if (!m) return null;
                const n = _nomeNaSec(m[1]);
                return n ? n[1].trim().replace(/^\d{2}\.?\d{3}\.?\d{3}\s+/, "") : null;
            },
        },
        // ── NFS-e prefeituras: seção "PRESTADOR DE SERVIÇOS" ──
        {
            nome: "nfse-prestador-servicos",
            fn: () => {
                const m = t.match(/PRESTADOR\s+DE\s+SERVI[CÇ]OS?(.{0,800}?)(?=TOMADOR)/i);
                if (!m) return null;
                const n = _nomeNaSec(m[1]);
                return n ? n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim() : null;
            },
        },
        // ── Seção "DADOS DO PRESTADOR" ──
        {
            nome: "nfse-dados-prestador",
            fn: () => {
                const m = t.match(/DADOS\s+DO\s+PRESTADOR(.{0,600}?)(?=DADOS\s+DO\s+TOMADOR|TOMADOR)/i);
                if (!m) return null;
                const n = _nomeNaSec(m[1]);
                return n ? n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim() : null;
            },
        },
        // ── DANFE: "IDENTIFICAÇÃO DO EMITENTE" ──
        {
            nome: "danfe-identificacao-emitente",
            fn: () => {
                const m = t.match(/IDENTIFICA[CÇ][ÃA]O\s+DO\s+EMITENTE\s+([\p{L}][\p{L}\s\-&.,'/\d]{3,80}?)(?=\s*(?:CNPJ|IE\b|ENDERE|NF-e|\d{2}[.\/]))/u);
                return m ? m[1].trim() : null;
            },
        },
        // ── DANFE: bloco "EMITENTE" ──
        {
            nome: "danfe-emitente",
            fn: () => {
                const m = t.match(/\bEMITENTE\b(.{0,500}?)(?=DESTINAT[AÁ]R|RECEBEMOS|FATURA|TRANSPOR|C[AÁ]LCULO)/i);
                if (!m) return null;
                const n = _nomeNaSec(m[1]) || _nomeDirectSec(m[1]);
                return n ? n[1].trim() : null;
            },
        },
        // ── CTe: "REMETENTE" ──
        {
            nome: "cte-remetente",
            fn: () => {
                const m = t.match(/\bREMETENTE\b(.{0,400}?)(?=DESTINAT[AÁ]R|TOMADOR|TRANSPOR)/i);
                if (!m) return null;
                const n = _nomeNaSec(m[1]) || _nomeDirectSec(m[1]);
                return n ? n[1].trim() : null;
            },
        },
        // ── Proximidade ao CNPJ (heurística — usada apenas quando nenhum label foi encontrado) ──
        {
            nome: "proximidade-cnpj",
            fn: () => _emissorPorProximidadeCNPJ(t, cnpjEmit),
        },
        // ── Fallback final: texto mais próximo ao CNPJ do emitente (janela ampla) ──
        {
            nome: "fallback-perto-cnpj",
            fn: () => _nomePertoCNPJ(t, cnpjEmit),
        },
    ];

    for (const { nome, fn } of estrategias) {
        const resultado = fn();
        if (resultado && resultado !== "—" && !_isTextoInstrucao(resultado)) {
            console.log(`=== EMISSOR [${nome}] ===`, resultado);
            return resultado;
        }
    }

    console.warn("Não foi possível identificar o emissor");
    if (cnpjEmit) {
        const trecho = t.slice(Math.max(0, cnpjEmit.idx - 250), cnpjEmit.idx + 250);
        console.warn("Trecho ao redor do CNPJ emitente:", trecho);
    }
    return "—";
}

function _extrairCamposNota(raw) {
    // NFC garante que caracteres acentuados estejam compostos (ú, ã, ç…)
    // independente de como o PDF.js os extraiu
    const t = raw.normalize("NFC").replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();

    console.log("=== TEXTO EXTRAÍDO PDF ===");
    console.log(t);

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
        // Exige ao menos um dígito no código — evita capturar palavras comuns como "Secretaria"
        for (const p of [
            /C[oó]digo\s+de\s+verifica[çc][aã]o[:\s]+([A-Za-z0-9]*\d[A-Za-z0-9]{0,49})/i,
            /C[oó]digo\s+de\s+autenticidade[:\s]+([A-Za-z0-9]*\d[A-Za-z0-9]{0,49})/i,
            /C[oó]digo\s+de\s+controle[:\s]+([A-Za-z0-9]*\d[A-Za-z0-9]{0,49})/i,
            /C[oó]digo\s+verificador[:\s]+([A-Za-z0-9]*\d[A-Za-z0-9]{0,49})/i,
            /Chave\s+de\s+acesso[:\s]+([A-Za-z0-9]{8,60})/i,
            /C[oó]digo\s+NFS-?[eE][:\s]+([A-Za-z0-9]*\d[A-Za-z0-9]{0,49})/i,
        ]) { const m = t.match(p); if (m) { chave_acesso = m[1].trim(); break; } }
    }

    // ── NÚMERO DA NF ──
    const numero_nf = (
        t.match(/N[úu]mero\s+da\s+NFS?-?[eE][:\s]+(\d+)/i)           ||
        t.match(/N[úu]mero\s+d[ao]\s+[Nn]ota\s*[:\s]\s*(\d+)/i)       ||
        // Curitibanos e similares: "Número da nota 62" (sem dois-pontos, valor direto)
        t.match(/N[úu]mero\s+da\s+[Nn]ota\s+(\d+)/i)                  ||
        t.match(/N[úu]mero\s+do\s+RPS[:\s]+(\d+)/i)                   ||
        t.match(/\bN[°º]\s*([\d.]+)\s+S[ÉE]RIE/i)                     ||
        t.match(/NF-?[eE]\s+N[°ºo.]?[:\s]+(\d[\d.]+)/i)               ||
        t.match(/Nota\s+Fiscal\s+N[°ºo.]?[:\s]+(\d[\d.]+)/i)          ||
        t.match(/NFS-?[eE]\s+N[°ºo.]?\s*(\d+)/i)
    )?.[1] ?? null;

    // ── DATA DE EMISSÃO ──
    const dataLabelM = t.match(/emiss[aã]o[^0-9]{0,30}(\d{2}\/\d{2}\/\d{4})[^0-9]{0,5}(\d{2}:\d{2}(?::\d{2})?)?/i);
    const dataHoraM  = t.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/);
    let emissao;
    if (dataLabelM)     emissao = dataLabelM[2] ? `${dataLabelM[1]} ${dataLabelM[2]}` : dataLabelM[1];
    else if (dataHoraM) emissao = `${dataHoraM[1]} ${dataHoraM[2]}`;
    else                emissao = (t.match(/\d{2}\/\d{2}\/\d{4}/) || ["—"])[0];

    // ── CNPJ / EMISSOR / TOMADOR — detecção por seção ──
    const cnpjAll = [];
    let mc;
    const cnpjFmtRe = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
    while ((mc = cnpjFmtRe.exec(t)) !== null) cnpjAll.push({ raw: mc[0], idx: mc.index });
    if (!cnpjAll.length) {
        const re14 = /(?<!\d)\d{14}(?!\d)/g;
        while ((mc = re14.exec(t)) !== null) cnpjAll.push({ raw: mc[0], idx: mc.index });
    }

    // Extrai uma "janela" de texto após um marcador de seção (800 chars)
    const _secWindow = (pat) => {
        const m = new RegExp(pat, 'i').exec(t);
        return m ? { text: t.slice(m.index, m.index + 800), start: m.index } : null;
    };
    // Busca CNPJ rotulado "CPF/CNPJ:XX.XXX..." dentro de uma janela de seção
    const _cnpjNaSec = (win) => {
        if (!win) return null;
        const m = /CPF\s*\/?\s*CNPJ\s*:?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i.exec(win.text);
        return m ? { raw: m[1], idx: win.start + m.index + m[0].lastIndexOf(m[1]) } : null;
    };
    // Busca nome rotulado "Nome/Razão social:" ou "Razão social:" dentro de uma janela
    const _nomeNaSecWin = (win) => {
        if (!win) return null;
        const m = (
            /(?:Nome\s*[\/|]\s*)?Raz[aã]o\s+[Ss]ocial\s*:?\s*([\p{L}][^\n\r]{2,79}?)(?=\s*(?:CPF|CNPJ|Inscri|E-?mail|Endere|Site\b))/iu.exec(win.text) ||
            /Nome\s*[\/|]\s*Raz[aã]o\s+[Ss]ocial\s*:?\s*([\p{L}][^\n\r]{2,79}?)(?=\s*(?:CPF|CNPJ|Inscri|E-?mail|Endere|Site\b))/iu.exec(win.text)
        );
        return m ? m[1].trim().replace(/\s*[-–]\s*\d{8,14}\s*$/, '').trim() : null;
    };

    const _prestWin = _secWindow('PRESTADOR\\s+DE\\s+SERVI[CÇ]OS?');
    const _tomWin   = _secWindow('TOMADOR\\s+DE\\s+SERVI[CÇ]OS?');

    // CNPJ: prioriza o rotulado na seção PRESTADOR
    let cnpjEmit = _cnpjNaSec(_prestWin);
    if (!cnpjEmit) {
        // Fallback: primeiro CNPJ antes do separador DESTINATÁRIO/TOMADOR
        const _s = (pat) => { const i = t.search(pat); return i < 0 ? Infinity : i; };
        const _sep = Math.min(_s(/DESTINAT[AÁ]R/i), Math.min(_s(/TOMADOR\s+DE\s+SERVI[CÇ]OS?/i), _s(/\bTOMADOR\b/i)));
        cnpjEmit = cnpjAll.find(c => _sep === Infinity || c.idx < _sep) || cnpjAll[0];
    }

    const sepIdx = (() => {
        const _s = (pat) => { const i = t.search(pat); return i < 0 ? Infinity : i; };
        return Math.min(_s(/DESTINAT[AÁ]R/i), Math.min(_s(/TOMADOR\s+DE\s+SERVI[CÇ]OS?/i), _s(/\bTOMADOR\b/i)));
    })();
    const cnpj = cnpjEmit ? cnpjEmit.raw : "—";

    // ── VALOR ──
    let valor = "—";
    for (const pat of [
        /Valor\s+L[ií]quido\s+da\s+NFS?-?[eE][:\s]*([\d.]+,\d{2})/i,
        // Curitibanos / NFS-e municipais: "Valor líquido = R$ 1.218,60"
        /Valor\s+l[íi]quido\s*=\s*R?\$?\s*([\d.]+,\d{2})/i,
        /Valor\s+bruto\s*=\s*R?\$?\s*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+DA\s+NOTA[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+DOS\s+SERVI[CÇ]OS[^\d]*([\d.]+,\d{2})/i,
        // "Valor do serviço 1.218,6000" — captura só 2 casas decimais mesmo com 4
        /Valor\s+do\s+Servi[çc]o[:\s]*([\d.]+,\d{2})/i,
        /VALOR\s+L[IÍ]QUIDO[^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL\s+DO\s+CT-?[eE][^\d]*([\d.]+,\d{2})/i,
        /VALOR\s+TOTAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+GERAL[^\d]*([\d.]+,\d{2})/i,
        /TOTAL\s+A\s+PAGAR[^\d]*([\d.]+,\d{2})/i,
        /R\$\s*([\d.]+,\d{2})/,
    ]) { const vm = t.match(pat); if (vm) { valor = `R$ ${vm[1]}`; break; } }

    console.log("=== CNPJ EMITENTE ===");
    console.log(cnpjEmit);

    if (cnpjEmit) {
        console.log("=== TRECHO AO REDOR DO CNPJ ===");
        console.log(t.slice(Math.max(0, cnpjEmit.idx - 500), cnpjEmit.idx + 500));
    }

    // ── EMISSOR ──
    const emissor = _extrairEmissor(t, cnpjEmit, sepIdx);

    console.log("=== EMISSOR EXTRAÍDO ===");
    console.log(emissor);

    // ── TOMADOR ──
    let tomador = "—";
    const tomPart = sepIdx < Infinity ? t.slice(sepIdx) : "";

    // P0: labels diretos no trecho do tomador
    if (tomador === "—" && tomPart) {
        for (const pat of [
            /Raz[aã]o\s+[Ss]ocial\s*(?:[\/|]\s*(?:Nome\s+)?Empresarial\s*)?:?\s+([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|\bIE\b|Inscri|E-?mail|Endere))/iu,
            /Nome\s+Empresarial\s*:?\s+([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|\bIE\b|Inscri))/iu,
            /\bNome\s*:\s*([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]|Inscri|E-?mail|Endere))/iu,
        ]) {
            const m = tomPart.match(pat);
            if (m && !_reAdmin.test(m[1])) { tomador = m[1].trim(); break; }
        }
    }
    // P1: NFS-e ABRASF — "TOMADOR DO SERVIÇO"
    if (tomador === "—") {
        const m = t.match(/TOMADOR\s+DO\s+SERVI[CÇ]O(.{0,600}?)(?=INTERMEDI[AÁ]RIO|SERVI[CÇ]O\s+PRESTADO|TRIBUTA[CÇ][ÃA]O|DISCRIMINA)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) tomador = n[1].trim(); }
    }
    // P2: "TOMADOR DE SERVIÇOS"
    if (tomador === "—") {
        const m = t.match(/TOMADOR\s+DE\s+SERVI[CÇ]OS?(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO|TRIBUTA[CÇ][ÃA]O)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) tomador = n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim(); }
    }
    // P3: "DADOS DO TOMADOR"
    if (tomador === "—") {
        const m = t.match(/DADOS\s+DO\s+TOMADOR(.{0,600}?)(?=DISCRIMINA|RETEN[CÇ]|FORMA\s+DE\s+PAGAMENTO|TRIBUTA[CÇ][ÃA]O)/i);
        if (m) { const n = _nomeNaSec(m[1]); if (n) tomador = n[1].trim().replace(/\s*[-–]\s*\d{8,11}\s*$/, "").trim(); }
    }
    // P4: DANFE — "DESTINATÁRIO/REMETENTE"
    if (tomador === "—") {
        const m = t.match(/DESTINAT[AÁ]RIO(?:\/REMETENTE)?(.{0,500}?)(?=FATURA|TRANSPOR|C[AÁ]LCULO|DADOS\s+DO\s+PRODUTO)/i);
        if (m) { const n = _nomeNaSec(m[1]) || _nomeDirectSec(m[1]); if (n) tomador = n[1].trim(); }
    }
    // P5: CTe — "DESTINATÁRIO"
    if (tomador === "—") {
        const m = t.match(/\bDESTINAT[AÁ]RIO\b(.{0,400}?)(?=TOMADOR|TRANSPOR|PRODUTO)/i);
        if (m) { const n = _nomeNaSec(m[1]) || _nomeDirectSec(m[1]); if (n) tomador = n[1].trim(); }
    }
    // Labels genéricos
    if (tomador === "—") {
        for (const pat of [
            /CONTRATANTE\s*:\s*([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/iu,
            /\bTOMADOR\s*:\s*([\p{L}].{3,79}?)(?=\s*(?:CNPJ|CPF|\d{2}[.\/]))/iu,
        ]) { const m = t.match(pat); if (m) { tomador = m[1].trim(); break; } }
    }
    // Fallback: texto antes do segundo CNPJ
    if (tomador === "—" && cnpjAll.length > 1) {
        const c2 = cnpjAll.find(c => c !== cnpjEmit) || cnpjAll[1];
        tomador = _nomePertoCNPJ(t, c2) || "—";
    }

    // ── Override NFS-e municipal: usa labels explícitos das seções ──
    // Tem prioridade sobre as heurísticas acima pois é mais confiável.
    const _emissNaSec = _nomeNaSecWin(_prestWin);
    if (_emissNaSec) emissor = _emissNaSec;

    const _tomNaSec = _nomeNaSecWin(_tomWin);
    if (_tomNaSec) tomador = _tomNaSec;

    return { emissao, cnpj, emissor, valor, tomador, numero_nf, chave_acesso };
}
