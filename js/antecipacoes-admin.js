// ───── ANTECIPAÇÕES (ADMIN / FINANCE) ─────
let _admAntMes      = new Date().getMonth() + 1;
let _admAntAno      = new Date().getFullYear();
let _admAntQuinzena = null;
let _admAntRows     = [];

function abrirAdminAntecipacoes(event) {
    if (event) event.preventDefault();
    _admAntQuinzena = null;
    _admAntRows     = [];
    document.getElementById("adm-ant-btn-1q").classList.remove("active");
    document.getElementById("adm-ant-btn-2q").classList.remove("active");
    document.getElementById("adm-ant-empty").innerText = "Selecione o período e a quinzena para ver as antecipações.";
    document.getElementById("adm-ant-empty").style.display = "";
    document.getElementById("adm-ant-resultado").style.display = "none";
    _iniciarSelectsAdmAnt();
    mostrarTela("tela-admin-antecipacoes");
}

function _iniciarSelectsAdmAnt() {
    const selAno   = document.getElementById("adm-ant-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _admAntAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("adm-ant-mes").value = _admAntMes;
}

function selecionarQuinzenaAntAdmin(q) {
    _admAntQuinzena = q;
    document.getElementById("adm-ant-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("adm-ant-btn-2q").classList.toggle("active", q === 2);
    buscarAntecipacoes();
}

function buscarAntecipacoes() {
    if (!_admAntQuinzena) {
        document.getElementById("adm-ant-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("adm-ant-empty").style.display = "";
        return;
    }
    const mes     = document.getElementById("adm-ant-mes").value;
    const ano     = document.getElementById("adm-ant-ano").value;
    const status  = document.getElementById("adm-ant-status").value;
    _admAntMes = parseInt(mes); _admAntAno = parseInt(ano);

    const empty  = document.getElementById("adm-ant-empty");
    const result = document.getElementById("adm-ant-resultado");
    empty.innerText = "Carregando..."; empty.style.display = ""; result.style.display = "none";

    let url = `${API}/admin/antecipacoes?mes=${mes}&ano=${ano}&quinzena=${_admAntQuinzena}`;
    if (status) url += `&status=${status}`;

    fetch(url, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(rows => {
        if (rows.error) { empty.innerText = rows.error; return; }
        if (!rows.length) { empty.innerText = "Nenhuma solicitação encontrada para este período."; return; }
        _admAntRows = rows;
        empty.style.display = "none"; result.style.display = "";
        document.getElementById("adm-ant-counter").innerHTML =
            `${rows.length} solicitação${rows.length !== 1 ? "ões" : ""}`;
        _renderAdmAntTabela(rows);
    })
    .catch(() => { empty.innerText = "Erro ao carregar antecipações."; });
}

function _renderAdmAntTabela(rows) {
    const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    document.getElementById("adm-ant-tbody").innerHTML = rows.map(r => {
        const data   = r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString("pt-BR") : "—";
        const vNF    = r.valor_nf ? moedaJS(parseFloat(r.valor_nf)) : "—";
        const vAnt   = r.valor_antecipado ? moedaJS(parseFloat(r.valor_antecipado)) : "—";
        const qz     = `${r.quinzena}ª Qz ${MESES[r.mes]}/${r.ano}`;
        const badge  = _admAntBadge(r.status);
        const acoes  = _admAntAcoes(r);
        const cnpj   = r.cnpj ? r.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—";
        return `<tr>
            <td style="font-size:12px;color:#64748b">${data}</td>
            <td class="adm-nf-entregador">${r.usuario_nome || "—"}</td>
            <td>${qz}</td>
            <td>${vNF}</td>
            <td style="color:#3a86ff;font-weight:600">${vAnt}</td>
            <td>${r.numero_nf || "—"}</td>
            <td style="font-size:12px;color:#94a3b8">${cnpj}</td>
            <td style="font-size:12px;color:#94a3b8">${r.telefone || "—"}</td>
            <td>${badge}</td>
            <td style="font-size:12px;color:#64748b">${r.aprovado_por || "—"}</td>
            <td>${acoes}</td>
        </tr>`;
    }).join("");
}

function _admAntBadge(status) {
    const map = {
        pendente:  { color: "#eab308", bg: "rgba(234,179,8,0.1)",    label: "Pendente"  },
        aprovada:  { color: "#22c55e", bg: "rgba(34,197,94,0.1)",    label: "Aprovada"  },
        rejeitada: { color: "#ef4444", bg: "rgba(239,68,68,0.1)",    label: "Rejeitada" },
        paga:      { color: "#3a86ff", bg: "rgba(58,134,255,0.1)",   label: "Paga"      },
    };
    const s = map[status] || { color: "#64748b", bg: "rgba(100,116,139,0.1)", label: status };
    return `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;color:${s.color};background:${s.bg}">${s.label}</span>`;
}

function _admAntAcoes(r) {
    if (r.status === "pendente") {
        return `
            <div style="display:flex;gap:6px">
                <button onclick="_admAntAprovar(${r.id})" style="padding:5px 12px;border-radius:7px;border:none;background:rgba(34,197,94,0.12);color:#22c55e;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Aprovar</button>
                <button onclick="_admAntRejeitar(${r.id})" style="padding:5px 12px;border-radius:7px;border:none;background:rgba(239,68,68,0.1);color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Rejeitar</button>
            </div>`;
    }
    if (r.status === "aprovada") {
        return `<button onclick="_admAntMarcarPaga(${r.id})" style="padding:5px 12px;border-radius:7px;border:none;background:rgba(58,134,255,0.1);color:#3a86ff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Marcar Paga</button>`;
    }
    return `<span style="font-size:12px;color:#4a6a8a">—</span>`;
}

function _admAntAprovar(id) {
    if (!confirm("Aprovar esta solicitação de antecipação?")) return;
    _admAntPatch(id, { status: "aprovada" });
}

function _admAntRejeitar(id) {
    const obs = prompt("Motivo da rejeição (opcional):");
    if (obs === null) return;
    _admAntPatch(id, { status: "rejeitada", observacao: obs || null });
}

function _admAntMarcarPaga(id) {
    if (!confirm("Marcar esta antecipação como paga?")) return;
    _admAntPatch(id, { status: "paga" });
}

function _admAntPatch(id, body) {
    fetch(`${API}/admin/antecipacoes/${id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }).then(r => r.json())
    .then(d => {
        if (d.error) { alert(d.error); return; }
        buscarAntecipacoes();
    })
    .catch(() => alert("Erro ao atualizar solicitação."));
}

function _exportarAntecipacaoXlsx() {
    if (!_admAntRows.length) return alert("Nenhum dado para exportar.");
    const MESES = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const data = _admAntRows.map(r => ({
        "Data Solicitação": r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString("pt-BR") : "",
        "Entregador":       r.usuario_nome || "",
        "Quinzena":         `${r.quinzena}ª Quinzena ${MESES[r.mes]}/${r.ano}`,
        "Valor NF":         r.valor_nf ? parseFloat(r.valor_nf).toFixed(2).replace(".", ",") : "",
        "Valor Antecipado": r.valor_antecipado ? parseFloat(r.valor_antecipado).toFixed(2).replace(".", ",") : "",
        "Nº NF":            r.numero_nf || "",
        "CNPJ":             r.cnpj ? r.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "",
        "Telefone":         r.telefone || "",
        "Status":           r.status || "",
        "Data Aprovação":   r.data_aprovacao ? new Date(r.data_aprovacao).toLocaleDateString("pt-BR") : "",
        "Aprovado Por":     r.aprovado_por || "",
        "Observação":       r.observacao || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Antecipações");
    XLSX.writeFile(wb, `antecipacoes_${_admAntMes}_${_admAntAno}_q${_admAntQuinzena}.xlsx`);
}
