// ───── ANTECIPAÇÃO DE PAGAMENTO (ENTREGADOR) ─────
let _antMes      = new Date().getMonth() + 1;
let _antAno      = new Date().getFullYear();
let _antQuinzena = null;
let _antNFAtual  = null;

function abrirAntecipacoes(event) {
    if (event) event.preventDefault();
    _antQuinzena = null;
    _antNFAtual  = null;
    _iniciarSelectsAnt();
    document.getElementById("ant-btn-1q").classList.remove("active");
    document.getElementById("ant-btn-2q").classList.remove("active");
    document.getElementById("ant-empty").style.display = "";
    document.getElementById("ant-content").style.display = "none";
    mostrarTela("tela-antecipacoes");
}

function _iniciarSelectsAnt() {
    const selAno   = document.getElementById("ant-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _antAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("ant-mes").value = _antMes;
}

function selecionarQuinzenaAnt(q) {
    _antQuinzena = q;
    document.getElementById("ant-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("ant-btn-2q").classList.toggle("active", q === 2);
    _antBuscarNF();
}

function _addDiasUteis(date, dias) {
    const result = new Date(date);
    let adicionados = 0;
    while (adicionados < dias) {
        result.setDate(result.getDate() + 1);
        if (result.getDay() !== 0 && result.getDay() !== 6) adicionados++;
    }
    result.setHours(0, 0, 0, 0);
    return result;
}

function _antCardHtml(tipo, titulo, sub) {
    const SVG = {
        lock:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
        wait:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>`,
        clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
        ok:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    };
    const cfg = {
        lock:  { border: "#334155", bg: "rgba(51,65,85,0.35)",  cor: "#94a3b8" },
        wait:  { border: "#92400e", bg: "rgba(146,64,14,0.18)", cor: "#f59e0b" },
        clock: { border: "#1e3a8a", bg: "rgba(30,58,138,0.18)", cor: "#60a5fa" },
        ok:    { border: "#14532d", bg: "rgba(20,83,45,0.18)",  cor: "#22c55e" },
        error: { border: "#7f1d1d", bg: "rgba(127,29,29,0.22)", cor: "#f87171" },
    };
    const c = cfg[tipo] || cfg.wait;
    return `<div style="border:1px solid ${c.border};background:${c.bg};border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;margin-bottom:14px">
        <div style="color:${c.cor};flex-shrink:0;margin-top:1px;opacity:.9">${SVG[tipo] || SVG.wait}</div>
        <div>
            <div style="font-size:13px;font-weight:700;color:${c.cor};margin-bottom:4px">${titulo}</div>
            <div style="font-size:12px;line-height:1.5;color:#94a3b8">${sub}</div>
        </div>
    </div>`;
}

function _antRenderStatusCard(mes, ano, quinzena, uploadedAt, diverge, valorPlanilha) {
    let card = document.getElementById("ant-status-card");
    if (!card) {
        card = document.createElement("div");
        card.id = "ant-status-card";
        const formWrap = document.getElementById("ant-form-wrap");
        if (formWrap) formWrap.parentNode.insertBefore(card, formWrap);
        else document.getElementById("ant-content")?.prepend(card);
    }
    const form = document.getElementById("ant-form-wrap");

    // Período bloqueado: antes da 2ª Quinzena de Maio/2026
    const bloqueado = ano < 2026 || (ano === 2026 && mes < 5) || (ano === 2026 && mes === 5 && quinzena < 2);
    if (bloqueado) {
        card.innerHTML = _antCardHtml("lock", "Antecipação não disponível",
            "Esta funcionalidade está disponível a partir da 2ª Quinzena de Maio/2026.");
        if (form) form.style.display = "none";
        return;
    }

    if (!uploadedAt) {
        card.innerHTML = _antCardHtml("wait", "Período ainda não processado",
            "O administrador ainda não processou este período. Aguarde.");
        if (form) form.style.display = "none";
        return;
    }

    if (diverge) {
        const vNF  = moedaJS(_antNFAtual._valorNum);
        const vPl  = moedaJS(valorPlanilha);
        card.innerHTML = _antCardHtml("error", "Valor da NF diverge do fechamento",
            `O valor da nota fiscal emitida (<strong style="color:#fca5a5">${vNF}</strong>) é diferente do valor do seu fechamento (<strong style="color:#fca5a5">${vPl}</strong>). Corrija a NF para que os valores correspondam antes de solicitar a antecipação.`);
        if (form) form.style.display = "none";
        return;
    }

    card.innerHTML = "";
    if (form) form.style.display = "";
}

function _antBuscarNF() {
    if (!_antQuinzena) return;
    const mes = document.getElementById("ant-mes").value;
    const ano = document.getElementById("ant-ano").value;
    _antMes = parseInt(mes); _antAno = parseInt(ano);
    _antNFAtual = null;

    // Busca NF (dados cadastrais) e painel (valor vivo da planilha) em paralelo
    Promise.all([
        fetch(`${API}/nota?mes=${mes}&ano=${ano}&quinzena=${_antQuinzena}`, {
            headers: { "Authorization": "Bearer " + token }
        }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API}/painel?mes=${mes}&ano=${ano}&quinzena=${_antQuinzena}`, {
            headers: { "Authorization": "Bearer " + token }
        }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([nf, painel]) => {
        const uploadedAt    = painel?.planilha_uploaded_at ?? null;
        const valorPlanilha = painel?.total_receber_num ?? null;
        const nfCard        = document.getElementById("ant-nf-card");
        let diverge = false;

        // Normaliza valor do banco (pode estar em formato BR: "4.675,61" ou "R$ 4.675,61")
        const _nfValorNum = nf ? (parseFloat(String(nf.valor || "").replace(/[R$\s.]/g, "").replace(",", ".")) || 0) : 0;
        if (nf && nf.id) {
            _antNFAtual = { ...nf, _valorNum: _nfValorNum }; // valor já normalizado
            const vNF = _nfValorNum;

            if (vNF > 0) {
                document.getElementById("ant-nf-info").innerHTML =
                    `<span style="color:#22c55e">${moedaJS(vNF)}</span>` +
                    (nf.numero_nf ? ` &nbsp;·&nbsp; <span style="color:#94a3b8">NF ${nf.numero_nf}</span>` : "");
                // Bloqueia se valor da NF divergir do valor do fechamento
                if (valorPlanilha !== null && valorPlanilha > 0 && Math.abs(vNF - valorPlanilha) > 0.01) {
                    diverge = true;
                }
            } else {
                // NF existe mas valor não foi extraído automaticamente do PDF
                document.getElementById("ant-nf-info").innerHTML =
                    `<span style="color:#f59e0b">Valor não extraído — preencha manualmente</span>`;
            }

            if (nf.numero_nf) document.getElementById("ant-numero-nf").value = nf.numero_nf;
            nfCard.style.display = "";
        } else {
            _antNFAtual = null;
            nfCard.style.display = "none";
        }

        document.getElementById("ant-empty").style.display = "none";
        document.getElementById("ant-content").style.display = "";
        _antLimparFormMsg();
        _antRenderStatusCard(_antMes, _antAno, _antQuinzena, uploadedAt, diverge, valorPlanilha);
    });
}

function _antCarregarHistorico() {
    fetch(`${API}/antecipacoes`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(rows => {
        const empty  = document.getElementById("ant-historico-empty");
        const result = document.getElementById("ant-historico-resultado");
        const tbody  = document.getElementById("ant-historico-tbody");
        if (!rows.length) {
            empty.style.display = ""; result.style.display = "none"; return;
        }
        empty.style.display = "none"; result.style.display = "";
        const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        tbody.innerHTML = rows.map(r => {
            const periodo = `${r.quinzena}ª Qz ${MESES[r.mes]}/${r.ano}`;
            const data    = r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString("pt-BR") : "—";
            const vNF     = r.valor_nf ? moedaJS(parseFloat(r.valor_nf)) : "—";
            const vAnt    = r.valor_antecipado ? moedaJS(parseFloat(r.valor_antecipado)) : "—";
            return `<tr>
                <td data-label="Quinzena">${periodo}</td>
                <td data-label="Valor NF">${vNF}</td>
                <td data-label="Solicitado" style="color:#3a86ff;font-weight:600">${vAnt}</td>
                <td data-label="Nº NF">${r.numero_nf || "—"}</td>
                <td data-label="Data" style="color:#64748b;font-size:12px">${data}</td>
            </tr>`;
        }).join("");
    }).catch(() => {});
}

function _antStatusBadge(status) {
    const map = {
        pendente:  { color: "#eab308", bg: "rgba(234,179,8,0.1)",    label: "Pendente"  },
        aprovada:  { color: "#22c55e", bg: "rgba(34,197,94,0.1)",    label: "Aprovada"  },
        rejeitada: { color: "#ef4444", bg: "rgba(239,68,68,0.1)",    label: "Rejeitada" },
        paga:      { color: "#3a86ff", bg: "rgba(58,134,255,0.1)",   label: "Trampay ✓" },
    };
    const s = map[status] || { color: "#64748b", bg: "rgba(100,116,139,0.1)", label: status };
    return `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:${s.color};background:${s.bg}">${s.label}</span>`;
}

function _antPreencherValorTotal() {
    if (!_antNFAtual || !(_antNFAtual._valorNum > 0)) {
        gcAlert("Nenhuma nota fiscal encontrada para esta quinzena. Emita e anexe a NF primeiro.");
        return;
    }
    document.getElementById("ant-valor").value = _antNFAtual._valorNum.toFixed(2);
}

function _antMaskCNPJ(input) {
    let v = input.value.replace(/\D/g, "").slice(0, 14);
    if (v.length > 12) v = v.slice(0,2)+"."+v.slice(2,5)+"."+v.slice(5,8)+"/"+v.slice(8,12)+"-"+v.slice(12);
    else if (v.length > 8) v = v.slice(0,2)+"."+v.slice(2,5)+"."+v.slice(5,8)+"/"+v.slice(8);
    else if (v.length > 5) v = v.slice(0,2)+"."+v.slice(2,5)+"."+v.slice(5);
    else if (v.length > 2) v = v.slice(0,2)+"."+v.slice(2);
    input.value = v;
}

function _antValidarCNPJ(cnpj) {
    cnpj = cnpj.replace(/\D/g, "");
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    let soma = 0, peso = 5;
    for (let i = 0; i < 12; i++) { soma += parseInt(cnpj[i]) * peso; peso = peso === 2 ? 9 : peso - 1; }
    let r = soma % 11;
    if ((r < 2 ? 0 : 11 - r) !== parseInt(cnpj[12])) return false;
    soma = 0; peso = 6;
    for (let i = 0; i < 13; i++) { soma += parseInt(cnpj[i]) * peso; peso = peso === 2 ? 9 : peso - 1; }
    r = soma % 11;
    return (r < 2 ? 0 : 11 - r) === parseInt(cnpj[13]);
}

function _antLimparFormMsg() {
    const el = document.getElementById("ant-form-msg");
    el.style.display = "none"; el.innerHTML = "";
}

function _antMostrarMsg(msg, tipo) {
    const el = document.getElementById("ant-form-msg");
    const cor = tipo === "erro" ? "#ef4444" : "#22c55e";
    const bg  = tipo === "erro" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${bg};border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _antEnviarSolicitacao() {
    if (!_antQuinzena) return _antMostrarMsg("Selecione a quinzena antes de enviar.", "erro");

    const cnpj     = document.getElementById("ant-cnpj").value.trim();
    const telefone = document.getElementById("ant-telefone").value.replace(/\D/g, "");
    const valor    = parseFloat(document.getElementById("ant-valor").value);
    const numeroNF = document.getElementById("ant-numero-nf").value.trim();
    const mes      = parseInt(document.getElementById("ant-mes").value);
    const ano      = parseInt(document.getElementById("ant-ano").value);

    if (!_antNFAtual?.id) return _antMostrarMsg("Nenhuma nota fiscal encontrada para esta quinzena. Emita e anexe a NF primeiro.", "erro");
    if (!cnpj) return _antMostrarMsg("Informe o CNPJ.", "erro");
    if (!_antValidarCNPJ(cnpj)) return _antMostrarMsg("CNPJ inválido. Verifique os dígitos.", "erro");
    if (!telefone) return _antMostrarMsg("Informe o telefone para contato.", "erro");
    if (!valor || isNaN(valor) || valor <= 0) return _antMostrarMsg("Informe um valor válido para antecipar.", "erro");
    if (_antNFAtual?._valorNum > 0 && valor > _antNFAtual._valorNum) {
        return _antMostrarMsg(`O valor solicitado não pode superar o valor da NF (${moedaJS(_antNFAtual._valorNum)}).`, "erro");
    }
    if (!numeroNF) return _antMostrarMsg("Informe o número da nota fiscal.", "erro");

    const btn = document.querySelector("#ant-form-wrap button[onclick='_antEnviarSolicitacao()']");
    if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

    const body = {
        quinzena: _antQuinzena, mes, ano,
        valor_nf: _antNFAtual?._valorNum || null,
        valor_antecipado: valor,
        numero_nf: numeroNF,
        cnpj: cnpj.replace(/\D/g, ""),
        telefone
    };

    fetch(`${API}/antecipacoes`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }).then(r => r.json())
    .then(d => {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Solicitação"; }
        if (d.error) return _antMostrarMsg(d.error, "erro");
        const card = document.getElementById("ant-status-card");
        if (card) card.innerHTML = _antCardHtml("ok", "Solicitação enviada com sucesso!",
            "Assim que o financeiro subir seu saldo na Trampay, você poderá solicitar o valor pelo <strong style='color:#cbd5e1'>WhatsApp da Trampay</strong>.");
        const form = document.getElementById("ant-form-wrap");
        if (form) form.style.display = "none";
        _antLimparFormMsg();
    })
    .catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Solicitação"; }
        _antMostrarMsg("Erro ao enviar solicitação. Tente novamente.", "erro");
    });
}

// ───── MINHAS SOLICITAÇÕES ─────

function abrirMinhasSolicitacoes(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-minhas-solicitacoes");
    _carregarMinhasSolicitacoes();
}

function _carregarMinhasSolicitacoes() {
    const empty  = document.getElementById("ms-empty");
    const result = document.getElementById("ms-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/antecipacoes`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(rows => {
        if (!rows.length) {
            empty.innerText = "Nenhuma solicitação encontrada.";
            return;
        }
        empty.style.display = "none";
        result.style.display = "";
        const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        document.getElementById("ms-tbody").innerHTML = rows.map(r => {
            const periodo = `${r.quinzena}ª Qz ${MESES[r.mes]}/${r.ano}`;
            const data    = r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString("pt-BR") : "—";
            const vNF     = r.valor_nf ? moedaJS(parseFloat(r.valor_nf)) : "—";
            const vAnt    = r.valor_antecipado ? moedaJS(parseFloat(r.valor_antecipado)) : "—";
            return `<tr>
                <td data-label="Quinzena">${periodo}</td>
                <td data-label="Valor NF">${vNF}</td>
                <td data-label="Solicitado" style="color:#3a86ff;font-weight:600">${vAnt}</td>
                <td data-label="Status">${_antStatusBadge(r.status)}</td>
                <td data-label="Data" style="color:#64748b;font-size:12px">${data}</td>
            </tr>`;
        }).join("");
    }).catch(() => {
        empty.innerText = "Erro ao carregar solicitações.";
    });
}
