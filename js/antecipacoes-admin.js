// ───── ANTECIPAÇÕES (ADMIN / FINANCE) ─────
let _admAntMes      = new Date().getMonth() + 1;
let _admAntAno      = new Date().getFullYear();
let _admAntQuinzena = null;
let _admAntRows     = [];
let _admAntReqId    = 0; // descarta resposta de período trocado antes do fetch anterior voltar

function abrirAdminAntecipacoes(event) {
    if (event) event.preventDefault();
    _admAntQuinzena = null;
    _admAntRows     = [];
    _fecharModal("modal-ant-conf");
    _admAntReqId++; // resposta ainda pendente não pode pintar a tela sem quinzena escolhida
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
    skMostrar(empty); empty.style.display = ""; result.style.display = "none";

    const url = `${API}/admin/antecipacoes?mes=${mes}&ano=${ano}&quinzena=${_admAntQuinzena}`;
    const reqId = ++_admAntReqId;

    fetch(url, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(rows => {
        if (reqId !== _admAntReqId) return; // período já mudou de novo — resposta desatualizada, ignora
        if (rows.error) { skFim(empty, rows.error); return; }
        if (!rows.length) { skFim(empty, "Nenhuma solicitação encontrada para este período."); return; }
        _admAntRows = rows;
        empty.style.display = "none"; result.style.display = "";
        document.getElementById("adm-ant-counter").innerHTML =
            `${rows.length} solicitação${rows.length !== 1 ? "ões" : ""}`;
        const totalSol = rows.reduce((s, r) => s + (parseFloat(r.valor_antecipado) || 0), 0);
        const totalEl  = document.getElementById("adm-ant-total");
        if (totalEl) totalEl.innerHTML = `Total solicitado: <strong style="color:#3a86ff">${moedaJS(totalSol)}</strong>`;
        _renderAdmAntTabela(rows);
    })
    .catch(() => { if (reqId === _admAntReqId) skFim(empty, "Erro ao carregar antecipações."); });
}

function _renderAdmAntTabela(rows) {
    const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    document.getElementById("adm-ant-tbody").innerHTML = rows.map(r => {
        const data  = r.data_solicitacao ? new Date(r.data_solicitacao).toLocaleDateString("pt-BR") : "—";
        const vNF   = r.valor_nf ? moedaJS(parseFloat(r.valor_nf)) : "—";
        const vAnt  = r.valor_antecipado ? moedaJS(parseFloat(r.valor_antecipado)) : "—";
        const qz    = `${r.quinzena}ª Qz ${MESES[r.mes]}/${r.ano}`;
        const cnpj  = r.cnpj ? r.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : "—";
        const finalizado = r.status === "paga" || r.status === "rejeitada";
        return `<tr>
            <td style="text-align:center"><input type="checkbox" class="adm-ant-cb" data-id="${r.id}" ${finalizado ? "disabled" : ""} onchange="_admAntOnCbChange()" style="cursor:${finalizado?"not-allowed":"pointer"};accent-color:#3a86ff;width:15px;height:15px;opacity:${finalizado?"0.3":"1"}"></td>
            <td style="font-size:12px;color:#8494a9">${data}</td>
            <td class="adm-nf-entregador">${r.usuario_nome || "—"}</td>
            <td style="color:#94a3b8">${qz}</td>
            <td>${vNF}</td>
            <td style="color:#3a86ff;font-weight:600">${vAnt}</td>
            <td>${r.numero_nf || "—"}</td>
            <td style="font-size:12px;color:#94a3b8">${cnpj}</td>
            <td style="font-size:12px;color:#94a3b8">${r.telefone || "—"}</td>
            <td>${_admAntBadge(r.status)}</td>
        </tr>`;
    }).join("");
    const cbAll = document.getElementById("adm-ant-cb-all");
    if (cbAll) cbAll.checked = false;
    const selBtn = document.getElementById("adm-ant-sel-btn");
    if (selBtn) selBtn.style.display = "none";
}

function _admAntBadge(status) {
    const map = {
        pendente:  { color: "#eab308", bg: "rgba(234,179,8,0.1)",    label: "Pendente"  },
        aprovada:  { color: "#22c55e", bg: "rgba(34,197,94,0.1)",    label: "Aprovada"  },
        rejeitada: { color: "#ef4444", bg: "rgba(239,68,68,0.1)",    label: "Rejeitada" },
        paga:      { color: "#3a86ff", bg: "rgba(58,134,255,0.1)",   label: "Trampay ✓" },
    };
    const s = map[status] || { color: "#8494a9", bg: "rgba(100,116,139,0.1)", label: status };
    return `<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;color:${s.color};background:${s.bg}">${s.label}</span>`;
}

function _admAntOnCbChange() {
    const selecionados = document.querySelectorAll(".adm-ant-cb:checked").length;
    const selBtn = document.getElementById("adm-ant-sel-btn");
    if (selBtn) {
        selBtn.style.display = selecionados > 0 ? "inline-flex" : "none";
        const txt = selBtn.querySelector("span") || selBtn.lastChild;
        if (txt && txt.nodeType === 3) txt.textContent = ` Saldo Subido na Trampay (${selecionados})`;
        else selBtn.childNodes[selBtn.childNodes.length - 1].textContent = ` Saldo Subido na Trampay (${selecionados})`;
    }
    const cbAll = document.getElementById("adm-ant-cb-all");
    const disponiveis = document.querySelectorAll(".adm-ant-cb:not([disabled])");
    if (cbAll) cbAll.checked = disponiveis.length > 0 && selecionados === disponiveis.length;
}

function _admAntSelectAll(cbAll) {
    document.querySelectorAll(".adm-ant-cb:not([disabled])").forEach(cb => { cb.checked = cbAll.checked; });
    _admAntOnCbChange();
}

function _admAntPagarSelecionadas() {
    const ids = [...document.querySelectorAll(".adm-ant-cb:checked")].map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    gcConfirm(`Confirmar que o saldo de ${ids.length} entregador(es) já foi subido na Trampay?`, () => {
        fetch(`${API}/admin/antecipacoes/bulk/pagar`, {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ ids })
        }).then(r => r.json()).then(d => {
            if (d.error) return gcAlert(d.error);
            buscarAntecipacoes();
        }).catch(() => gcAlert("Erro ao marcar como pagas."));
    }, null, "Confirmar");
}

function _admAntPagarTodas() {
    if (!_admAntQuinzena || !_admAntRows.length) return;
    gcConfirm("Confirmar que o saldo de TODOS os entregadores desta quinzena já foi subido na Trampay?", () => {
        const mes = document.getElementById("adm-ant-mes").value;
        const ano = document.getElementById("adm-ant-ano").value;
        fetch(`${API}/admin/antecipacoes/quinzena/pagar`, {
            method: "PATCH",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ mes: parseInt(mes), ano: parseInt(ano), quinzena: _admAntQuinzena })
        }).then(r => r.json()).then(d => {
            if (d.error) return gcAlert(d.error);
            const btn = document.getElementById("adm-ant-pagar-btn");
            if (btn) { btn.disabled = true; btn.textContent = `✓ Saldo subido na Trampay (${d.updated})`; btn.style.color = "#22c55e"; btn.style.borderColor = "rgba(34,197,94,0.35)"; btn.style.background = "rgba(34,197,94,0.08)"; }
        }).catch(() => gcAlert("Erro ao marcar como paga."));
    }, null, "Confirmar");
}

function _baixarCsvAntecipacoes() {
    if (!_admAntQuinzena) return gcAlert("Selecione a quinzena antes de exportar.");
    const mes = document.getElementById("adm-ant-mes").value;
    const ano = document.getElementById("adm-ant-ano").value;
    const url = `${API}/admin/antecipacoes/csv?mes=${mes}&ano=${ano}&quinzena=${_admAntQuinzena}`;
    fetch(url, { headers: { "Authorization": "Bearer " + token } })
        .then(r => {
            if (!r.ok) return r.json().then(d => { gcAlert(d.error || "Erro ao gerar CSV."); throw new Error(); });
            return r.blob();
        })
        .then(blob => {
            const link = document.createElement("a");
            link.href  = URL.createObjectURL(blob);
            link.download = `antecipacoes_trampay_${mes}_${ano}_q${_admAntQuinzena}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        })
        .catch(() => {});
}

function _exportarAntecipacaoXlsx() {
    if (!_admAntRows.length) { gcAlert("Nenhum dado para exportar."); return; }
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

// ───── CONFERÊNCIA COM O RELATÓRIO DA TRAMPAY ─────
// Sobe o relatório de antecipações da Trampay (vem com todos os períodos) e o servidor
// confere, por id_entregador, se cada pedido do XM desta quinzena saiu "Aprovado" lá com o
// mesmo valor_pedido. A quinzena é achada pela data_de_vencimento (fim + 45 dias, ±5).
// O resultado abre num modal; dali dá pra trazer o valor da Trampay pro XM (valor diferente)
// ou excluir o pedido do XM (não pediu na Trampay).
let _admAntConf = null; // { dados, ctx, filtro }

const _ADM_ANT_SIT = {
    ok:              "Recebeu",
    valor_diferente: "Valor diferente",
    nao_encontrado:  "Não está na Trampay",
};

function _admAntEscolherRelatorioTrampay() {
    if (!_admAntQuinzena) return gcAlert("Selecione o mês, o ano e a quinzena antes de subir o relatório da Trampay.");
    const input = document.getElementById("adm-ant-trampay-file");
    input.value = "";
    input.click();
}

function _admAntConferirTrampay(input) {
    const arquivo = input.files && input.files[0];
    if (!arquivo || !_admAntQuinzena) return;
    const mes = parseInt(document.getElementById("adm-ant-mes").value);
    const ano = parseInt(document.getElementById("adm-ant-ano").value);
    const quinzena = _admAntQuinzena;
    const MESES = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    _admAntConf = null;
    document.getElementById("ant-conf-titulo").textContent = `Conferência Trampay — ${quinzena}ª Qz ${MESES[mes]}/${ano}`;
    document.getElementById("ant-conf-sub").textContent = `Conferindo ${arquivo.name}...`;
    document.getElementById("ant-conf-resumo").innerHTML = "";
    document.getElementById("ant-conf-corpo").innerHTML = "";
    _abrirModal("modal-ant-conf");
    const falhou = (msg) => { document.getElementById("ant-conf-sub").textContent = msg; };

    const texto = /\.(csv|tsv|txt)$/i.test(arquivo.name);
    const leitor = new FileReader();
    leitor.onload = () => {
        let linhas;
        try {
            // raw: no CSV a data fica texto ("14/10/2026" não vira data americana); codepage pro acento do UTF-8
            const wb = XLSX.read(new Uint8Array(leitor.result), texto ? { type: "array", raw: true, codepage: 65001 } : { type: "array" });
            linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
        } catch (e) {
            return falhou("Não consegui ler o arquivo. Use o relatório da Trampay em .csv ou .xlsx.");
        }
        fetch(`${API}/admin/antecipacoes/conferencia-trampay`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ mes, ano, quinzena, linhas })
        })
        .then(r => r.json())
        .then(d => {
            if (d.error) return falhou(d.error);
            _admAntConf = { dados: d, ctx: { arquivo: arquivo.name }, filtro: null };
            _admAntRenderConferencia();
        })
        .catch(() => falhou("Erro ao conferir o relatório."));
    };
    leitor.readAsArrayBuffer(arquivo);
}

function _admAntEsc(s) {
    const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(s ?? "").replace(/[&<>"']/g, c => mapa[c]);
}

function _admAntDataBR(iso) {
    const [a, m, d] = String(iso || "").split("-");
    return d ? `${d}/${m}/${a}` : "—";
}

function _admAntFiltrarConf(filtro) {
    if (!_admAntConf) return;
    _admAntConf.filtro = _admAntConf.filtro === filtro ? null : filtro;
    _admAntRenderConferencia();
}

function _admAntRenderConferencia() {
    const { dados: d, ctx, filtro } = _admAntConf;
    const r = d.resumo;
    const j = d.janela;
    document.getElementById("ant-conf-sub").innerHTML =
        `${_admAntEsc(ctx.arquivo)}<br>Vencimento de ${_admAntDataBR(j.de)} a ${_admAntDataBR(j.ate)} (pagamento ${_admAntDataBR(j.pagamento)}, ±5 dias), só "Aprovado". ` +
        `${r.linhas_consideradas} linha(s) usada(s); ${r.linhas_fora_da_janela} de outros períodos e ${r.linhas_nao_aprovadas} não aprovada(s) ficaram de fora.`;

    // Contagem refeita aqui porque trocar valor / excluir muda a lista sem voltar ao servidor.
    const conta = (s) => d.itens.filter(i => i.situacao === s).length;
    const parte = (chave, n, um, varios) => { const texto = n === 1 ? um : varios; return n
        ? `<button type="button" class="ant-conf-link${filtro === chave ? " ativo" : ""}" onclick="_admAntFiltrarConf('${chave}')">${n} ${texto}</button>`
        : `0 ${texto}`; };
    document.getElementById("ant-conf-resumo").innerHTML = [
        parte("ok", conta("ok"), "recebeu certo", "receberam certo"),
        parte("valor_diferente", conta("valor_diferente"), "com valor diferente", "com valor diferente"),
        parte("nao_encontrado", conta("nao_encontrado"), "não está na Trampay", "não estão na Trampay"),
        parte("so_trampay", d.so_na_trampay.length, "só na Trampay", "só na Trampay"),
    ].join(`<span class="sep">·</span>`) +
        (filtro ? `<span class="sep">·</span><button type="button" class="ant-conf-link" onclick="_admAntFiltrarConf(null)">ver todos</button>` : "");

    // Problemas primeiro, quem recebeu certo no fim.
    const ordem = { nao_encontrado: 0, valor_diferente: 1, ok: 2 };
    const itens = d.itens
        .map((i, idx) => ({ ...i, idx }))
        .filter(i => !filtro || i.situacao === filtro)
        .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || String(a.usuario_nome).localeCompare(String(b.usuario_nome)));

    const linhasXm = itens.map(i => {
        const trampay = i.linhas_trampay
            ? `${moedaJS(i.recebido)}${i.linhas_trampay > 1 ? `<div class="sub">${i.linhas_trampay} pedidos somados</div>` : ""}`
            : "—";
        const obs = [i.pelo_nome ? "achado pelo nome" : "", !i.id_trampay ? "sem ID Trampay no cadastro" : ""].filter(Boolean).join(" · ");
        let acao = "";
        if (i.situacao === "valor_diferente") acao = `<button type="button" class="ant-conf-link" onclick="_admAntUsarValorTrampay(${i.idx})">usar ${moedaJS(i.recebido)} da Trampay</button>`;
        if (i.situacao === "nao_encontrado") acao = `<button type="button" class="ant-conf-link" onclick="_admAntExcluirSemTrampay(${i.idx})">excluir pedido</button>`;
        return `<tr>
            <td>${_admAntEsc(i.usuario_nome)}${i.nome_real && i.nome_real !== i.usuario_nome ? `<div class="sub">${_admAntEsc(i.nome_real)}</div>` : ""}</td>
            <td>${_admAntEsc(i.id_trampay) || "—"}</td>
            <td class="num">${moedaJS(i.solicitado)}</td>
            <td class="num">${trampay}</td>
            <td>${_ADM_ANT_SIT[i.situacao]}${obs ? `<div class="sub">${_admAntEsc(obs)}</div>` : ""}${acao ? `<div>${acao}</div>` : ""}</td>
        </tr>`;
    }).join("");

    const mostrarXm = filtro !== "so_trampay";
    const mostrarSobra = (!filtro || filtro === "so_trampay") && d.so_na_trampay.length;
    let html = "";
    if (mostrarXm) {
        html += d.itens.length
            ? `<table class="ant-conf-tabela">
                <thead><tr><th>Entregador (XM)</th><th>ID Trampay</th><th>Pedido no XM</th><th>Na Trampay</th><th>Situação</th></tr></thead>
                <tbody>${linhasXm}</tbody>
              </table>`
            : `<div class="fechamento-empty">Nenhum pedido de antecipação no XM nesta quinzena.</div>`;
    }
    if (mostrarSobra) {
        html += `${mostrarXm ? `<div class="ant-conf-secao">Aprovados na Trampay sem pedido no XM nesta quinzena</div>` : ""}
            <table class="ant-conf-tabela">
                <thead><tr><th>Nome (Trampay)</th><th>ID Trampay</th><th>Valor pedido</th><th>Vencimento</th></tr></thead>
                <tbody>${d.so_na_trampay.map(t => `<tr>
                    <td>${_admAntEsc(t.nome) || "—"}</td>
                    <td>${_admAntEsc(t.id_trampay) || "—"}</td>
                    <td class="num">${moedaJS(t.valor_pedido)}</td>
                    <td class="num">${_admAntDataBR(t.vencimento)}</td>
                </tr>`).join("")}</tbody>
            </table>`;
    }
    document.getElementById("ant-conf-corpo").innerHTML = html;
}

function _admAntUsarValorTrampay(idx) {
    const i = _admAntConf && _admAntConf.dados.itens[idx];
    if (!i) return;
    gcConfirm(
        `O pedido de <strong>${_admAntEsc(i.usuario_nome)}</strong> no XM passa de ${moedaJS(i.solicitado)} para <strong>${moedaJS(i.recebido)}</strong>, o valor aprovado na Trampay.`,
        () => {
            fetch(`${API}/admin/antecipacoes/${i.antecipacao_id}/valor-trampay`, {
                method: "PATCH",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ valor: i.recebido })
            }).then(r => r.json()).then(d => {
                if (d.error) return gcAlert(d.error);
                i.solicitado = i.recebido;
                i.situacao = "ok";
                _admAntRenderConferencia();
                buscarAntecipacoes();
            }).catch(() => gcAlert("Erro ao trocar o valor."));
        },
        "Usar o valor da Trampay?", "Trocar valor"
    );
}

function _admAntExcluirSemTrampay(idx) {
    const i = _admAntConf && _admAntConf.dados.itens[idx];
    if (!i) return;
    gcConfirm(
        `O pedido de <strong>${_admAntEsc(i.usuario_nome)}</strong> (${moedaJS(i.solicitado)}) não está na Trampay e vai ser apagado do sistema. Não dá pra desfazer.`,
        () => {
            fetch(`${API}/admin/antecipacoes/${i.antecipacao_id}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + token }
            }).then(r => r.json()).then(d => {
                if (d.error) return gcAlert(d.error);
                _admAntConf.dados.itens.splice(idx, 1);
                _admAntRenderConferencia();
                buscarAntecipacoes();
            }).catch(() => gcAlert("Erro ao excluir o pedido."));
        },
        "Excluir pedido de antecipação?", "Excluir"
    );
}
