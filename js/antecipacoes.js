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
    _antCarregarHistorico();
}

function _antBuscarNF() {
    if (!_antQuinzena) return;
    const mes = document.getElementById("ant-mes").value;
    const ano = document.getElementById("ant-ano").value;
    _antMes = parseInt(mes); _antAno = parseInt(ano);
    _antNFAtual = null;

    fetch(`${API}/nota?mes=${mes}&ano=${ano}&quinzena=${_antQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(nf => {
        if (nf.error) {
            document.getElementById("ant-nf-info").innerHTML =
                `<span style="color:#f59e0b">Nenhuma nota fiscal encontrada para esta quinzena.</span>`;
            _antNFAtual = null;
        } else {
            _antNFAtual = nf;
            const vf = nf.valor_fechamento ? moedaJS(parseFloat(nf.valor_fechamento)) : (nf.valor || "—");
            document.getElementById("ant-nf-info").innerHTML =
                `<span style="color:#22c55e">${vf}</span>` +
                (nf.numero_nf ? ` &nbsp;·&nbsp; <span style="color:#94a3b8">NF ${nf.numero_nf}</span>` : "");
            if (nf.numero_nf) document.getElementById("ant-numero-nf").value = nf.numero_nf;
        }
        document.getElementById("ant-empty").style.display = "none";
        document.getElementById("ant-content").style.display = "";
        _antLimparFormMsg();
    })
    .catch(() => {
        document.getElementById("ant-nf-info").innerHTML =
            `<span style="color:#ef4444">Erro ao buscar nota fiscal.</span>`;
        document.getElementById("ant-empty").style.display = "none";
        document.getElementById("ant-content").style.display = "";
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
            const badge   = _antStatusBadge(r.status);
            return `<tr>
                <td>${periodo}</td>
                <td>${vNF}</td>
                <td style="color:#3a86ff;font-weight:600">${vAnt}</td>
                <td>${r.numero_nf || "—"}</td>
                <td>${badge}</td>
                <td style="color:#64748b;font-size:12px">${data}</td>
            </tr>`;
        }).join("");
    }).catch(() => {});
}

function _antStatusBadge(status) {
    const map = {
        pendente:  { color: "#eab308", bg: "rgba(234,179,8,0.1)",    label: "Pendente"  },
        aprovada:  { color: "#22c55e", bg: "rgba(34,197,94,0.1)",    label: "Aprovada"  },
        rejeitada: { color: "#ef4444", bg: "rgba(239,68,68,0.1)",    label: "Rejeitada" },
        paga:      { color: "#3a86ff", bg: "rgba(58,134,255,0.1)",   label: "Paga"      },
    };
    const s = map[status] || { color: "#64748b", bg: "rgba(100,116,139,0.1)", label: status };
    return `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:${s.color};background:${s.bg}">${s.label}</span>`;
}

function _antPreencherValorTotal() {
    if (!_antNFAtual || !_antNFAtual.valor_fechamento) {
        alert("Não foi possível determinar o valor total da NF. Verifique se a nota foi registrada corretamente.");
        return;
    }
    document.getElementById("ant-valor").value = parseFloat(_antNFAtual.valor_fechamento).toFixed(2);
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

    if (!cnpj) return _antMostrarMsg("Informe o CNPJ.", "erro");
    if (!_antValidarCNPJ(cnpj)) return _antMostrarMsg("CNPJ inválido. Verifique os dígitos.", "erro");
    if (!telefone) return _antMostrarMsg("Informe o telefone para contato.", "erro");
    if (!valor || isNaN(valor) || valor <= 0) return _antMostrarMsg("Informe um valor válido para antecipar.", "erro");
    if (_antNFAtual?.valor_fechamento && valor > parseFloat(_antNFAtual.valor_fechamento)) {
        return _antMostrarMsg(`O valor solicitado não pode superar o valor da NF (${moedaJS(parseFloat(_antNFAtual.valor_fechamento))}).`, "erro");
    }
    if (!numeroNF) return _antMostrarMsg("Informe o número da nota fiscal.", "erro");

    const btn = document.querySelector("#ant-form-wrap button[onclick='_antEnviarSolicitacao()']");
    if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }

    const body = {
        quinzena: _antQuinzena, mes, ano,
        valor_nf: _antNFAtual?.valor_fechamento || null,
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
        _antMostrarMsg("Solicitação enviada com sucesso! Aguarde a análise do financeiro.", "ok");
        document.getElementById("ant-cnpj").value = "";
        document.getElementById("ant-telefone").value = "";
        document.getElementById("ant-valor").value = "";
        _antCarregarHistorico();
    })
    .catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar Solicitação"; }
        _antMostrarMsg("Erro ao enviar solicitação. Tente novamente.", "erro");
    });
}
