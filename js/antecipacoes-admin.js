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
    const mes = document.getElementById("adm-ant-mes").value;
    const ano = document.getElementById("adm-ant-ano").value;
    _admAntMes = parseInt(mes); _admAntAno = parseInt(ano);

    const empty  = document.getElementById("adm-ant-empty");
    const result = document.getElementById("adm-ant-resultado");
    empty.innerText = "Carregando..."; empty.style.display = ""; result.style.display = "none";

    const url = `${API}/admin/antecipacoes?mes=${mes}&ano=${ano}&quinzena=${_admAntQuinzena}`;

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
        const data  = r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString("pt-BR") : "—";
        const vNF   = r.valor_nf ? moedaJS(parseFloat(r.valor_nf)) : "—";
        const vAnt  = r.valor_antecipado ? moedaJS(parseFloat(r.valor_antecipado)) : "—";
        const qz    = `${r.quinzena}ª Qz ${MESES[r.mes]}/${r.ano}`;
        const badge = _admAntBadge(r.status);
        const cnpj  = r.cnpj ? r.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—";
        return `<tr>
            <td style="font-size:12px;color:#64748b">${data}</td>
            <td class="adm-nf-entregador">${r.usuario_nome || "—"}</td>
            <td style="color:#94a3b8">${qz}</td>
            <td>${vNF}</td>
            <td style="color:#3a86ff;font-weight:600">${vAnt}</td>
            <td>${r.numero_nf || "—"}</td>
            <td style="font-size:12px;color:#94a3b8">${cnpj}</td>
            <td style="font-size:12px;color:#94a3b8">${r.telefone || "—"}</td>
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

function _admAntPagarTodas() {
    if (!_admAntQuinzena || !_admAntRows.length) return;
    if (!confirm(`Marcar TODAS as antecipações desta quinzena como PAGAS?`)) return;
    const mes = document.getElementById("adm-ant-mes").value;
    const ano = document.getElementById("adm-ant-ano").value;
    fetch(`${API}/admin/antecipacoes/quinzena/pagar`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: parseInt(mes), ano: parseInt(ano), quinzena: _admAntQuinzena })
    }).then(r => r.json()).then(d => {
        if (d.error) return alert(d.error);
        const btn = document.getElementById("adm-ant-pagar-btn");
        if (btn) { btn.disabled = true; btn.textContent = `✓ ${d.updated} antecipação(ões) marcada(s) como paga`; btn.style.color = "#22c55e"; btn.style.borderColor = "rgba(34,197,94,0.35)"; btn.style.background = "rgba(34,197,94,0.08)"; }
    }).catch(() => alert("Erro ao marcar como paga."));
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
        "Observação":       r.observacao || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Antecipações");
    XLSX.writeFile(wb, `antecipacoes_${_admAntMes}_${_admAntAno}_q${_admAntQuinzena}.xlsx`);
}
