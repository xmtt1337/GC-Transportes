// ───── TELA ADMIN PAGAMENTOS ─────
let _pagMes      = new Date().getMonth() + 1;
let _pagAno      = new Date().getFullYear();
let _pagQuinzena = null;

function abrirAdminPagamentos(event) {
    if (event) event.preventDefault();
    _pagQuinzena = null;
    document.getElementById("pag-btn-1q").classList.remove("active");
    document.getElementById("pag-btn-2q").classList.remove("active");
    document.getElementById("pag-empty").innerText = "Selecione o mês, ano e quinzena para ver os pagamentos.";
    document.getElementById("pag-empty").style.display = "";
    document.getElementById("pag-resultado").style.display = "none";
    _iniciarSelectsPag();
    mostrarTela("tela-admin-pagamentos");
}

function _iniciarSelectsPag() {
    const selAno   = document.getElementById("pag-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _pagAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("pag-mes").value = _pagMes;
}

function selecionarQuinzenaPag(q) {
    _pagQuinzena = q;
    document.getElementById("pag-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("pag-btn-2q").classList.toggle("active", q === 2);
    buscarPagamentos();
}

function buscarPagamentos() {
    if (!_pagQuinzena) {
        document.getElementById("pag-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("pag-empty").style.display = "";
        return;
    }
    const mes = document.getElementById("pag-mes").value;
    const ano = document.getElementById("pag-ano").value;
    _pagMes = parseInt(mes); _pagAno = parseInt(ano);
    const empty    = document.getElementById("pag-empty");
    const resultado = document.getElementById("pag-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/admin/pagamentos?mes=${mes}&ano=${ano}&quinzena=${_pagQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(data => {
        if (data.error) { empty.innerText = data.error; return; }
        if (!data.length) { empty.innerText = "Nenhum entregador com valor neste período."; return; }
        empty.style.display = "none";
        resultado.style.display = "";

        const totalBruto  = data.reduce((s, d) => s + (d.total_num || 0), 0);
        const totalAnt    = data.reduce((s, d) => s + (d.antecipado_num || 0), 0);
        const totalLiq    = data.reduce((s, d) => s + (d.liquido_num != null ? d.liquido_num : d.total_num || 0), 0);
        document.getElementById("pag-counter").innerHTML =
            `${data.length} entregadores &nbsp;·&nbsp; Bruto: <strong>${moedaJS(totalBruto)}</strong>` +
            (totalAnt > 0 ? ` &nbsp;·&nbsp; Antecipado: <strong style="color:#fb923c">${moedaJS(totalAnt)}</strong>` : "") +
            ` &nbsp;·&nbsp; Líquido: <strong style="color:#22c55e">${moedaJS(totalLiq)}</strong>`;

        document.getElementById("pag-tbody").innerHTML = data.map(d => {
            const temAnt = (d.antecipado_num || 0) > 0;
            return `<tr>
                <td class="adm-nf-entregador">${d.nome}</td>
                <td class="pag-valor" style="color:#94a3b8">${d.total}</td>
                <td class="pag-valor" style="color:${temAnt ? '#fb923c' : '#4a6a8a'}">${temAnt ? d.antecipado : '—'}</td>
                <td class="pag-valor" style="color:#22c55e;font-weight:700">${d.liquido || d.total}</td>
                <td class="pag-doc">${d.documento || '<span class="pag-sem-cad">—</span>'}</td>
                <td class="pag-pix">${d.chave_pix || '<span class="pag-sem-cad">—</span>'}</td>
                <td>${d.tipo_pix ? `<span class="pag-pix-badge">${d.tipo_pix}</span>` : '<span class="pag-sem-cad">—</span>'}</td>
            </tr>`;
        }).join("");

        _buscarStatusQuinzena();
    }).catch(() => { empty.innerText = "Erro ao carregar pagamentos."; });
}

function _buscarStatusQuinzena() {
    const mes = document.getElementById("pag-mes").value;
    const ano = document.getElementById("pag-ano").value;
    fetch(`${API}/admin/pagamentos/quinzena?mes=${mes}&ano=${ano}&quinzena=${_pagQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json()).then(d => { _renderStatusPagBtn(d); }).catch(() => {});
}

function _renderStatusPagBtn(d) {
    const btn      = document.getElementById("pag-pagar-btn");
    const pagoDiv  = document.getElementById("pag-status-pago");
    const pagoData = document.getElementById("pag-pago-data");
    if (d.status === "pago") {
        btn.style.display   = "none";
        pagoDiv.style.display = "flex";
        const dt = d.data_pagamento ? new Date(d.data_pagamento).toLocaleDateString("pt-BR") : "—";
        pagoData.innerText  = dt;
    } else {
        btn.style.display   = "";
        pagoDiv.style.display = "none";
    }
}

function _pagarQuinzena() {
    if (!_pagQuinzena) return;
    if (!confirm("Marcar a quinzena inteira como PAGA? Todos os entregadores serão notificados.")) return;
    const mes = document.getElementById("pag-mes").value;
    const ano = document.getElementById("pag-ano").value;
    fetch(`${API}/admin/pagamentos/quinzena`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: parseInt(mes), ano: parseInt(ano), quinzena: _pagQuinzena, status: "pago" })
    }).then(r => r.json()).then(d => {
        if (d.error) return alert(d.error);
        _renderStatusPagBtn(d);
    }).catch(() => alert("Erro ao salvar status."));
}

function _desfazerPagamento() {
    if (!_pagQuinzena) return;
    if (!confirm("Desfazer o pagamento desta quinzena?")) return;
    const mes = document.getElementById("pag-mes").value;
    const ano = document.getElementById("pag-ano").value;
    fetch(`${API}/admin/pagamentos/quinzena`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: parseInt(mes), ano: parseInt(ano), quinzena: _pagQuinzena, status: "pendente" })
    }).then(r => r.json()).then(d => {
        if (d.error) return alert(d.error);
        _renderStatusPagBtn(d);
    }).catch(() => alert("Erro ao desfazer."));
}

function _baixarCsvPagamentos() {
    const mes      = document.getElementById("pag-mes").value;
    const ano      = document.getElementById("pag-ano").value;
    const quinzena = _pagQuinzena;
    if (!quinzena) return;
    const url = `${API}/admin/pagamentos/csv?mes=${mes}&ano=${ano}&quinzena=${quinzena}`;
    const a   = document.createElement("a");
    a.href    = url;
    a.setAttribute("download", `pagamentos_${mes}_${ano}_q${quinzena}.csv`);
    const headers = new Headers({ "Authorization": "Bearer " + token });
    fetch(url, { headers })
        .then(r => {
            if (!r.ok) return r.json().then(d => { alert(d.error || "Erro ao gerar CSV."); throw new Error(); });
            return r.blob();
        })
        .then(blob => {
            const link = document.createElement("a");
            link.href  = URL.createObjectURL(blob);
            link.download = `pagamentos_${mes}_${ano}_q${quinzena}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        })
        .catch(() => {});
}

function _exportarNFsXlsx() {
    if (!_admNFRows.length) return;
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const nomeMes = MESES[(_admNFMes || 1) - 1] || "";
    const ordQ    = _admNFQuinzena === 1 ? "1ª Quinzena" : "2ª Quinzena";

    const data = _admNFRows.map(nf => ({
        "Entregador":      nf.user_name || nf.username || "",
        "Status":          nf.status === "confere" ? "Confere" : nf.status === "diverge" ? "Diverge" : "Pendente",
        "Valor NF":        nf.valor || "",
        "Data Emissão":    nf.emissao || "",
        "CNPJ":            nf.cnpj || "",
        "Emissor":         nf.emissor || "",
        "Nº NF":           nf.numero_nf || "",
        "Chave de Acesso": nf.chave_acesso || "",
        "Tomador":         nf.tomador || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notas Fiscais");
    XLSX.writeFile(wb, `notas_fiscais_${nomeMes}_${_admNFAno}_${ordQ.replace(" ","")}.xlsx`);
}
