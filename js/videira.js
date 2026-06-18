// ───── VIDEIRA — ALIMENTAR PLANILHA ─────

function abrirVideiraAlimentar(event) {
    if (event) event.preventDefault();
    _valiIniciarSelects();
    _carregarPlanilhasVideira();
    mostrarTela("tela-videira-alimentar");
}

function _valiIniciarSelects() {
    const selAno = document.getElementById("vali-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual + 1; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === anoAtual) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("vali-mes").value = new Date().getMonth() + 1;
}

function _carregarPlanilhasVideira() {
    fetch(API + "/videira/planilhas", { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(rows => {
        const el = document.getElementById("vali-list");
        if (!rows.length) {
            el.innerHTML = `<div style="color:#7a8599;font-size:14px">Nenhum fechamento cadastrado.</div>`;
            return;
        }
        const mesNomes = ["","Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        el.innerHTML = rows.map(r => `
            <div class="admin-list-item">
                <div>
                    <strong>${mesNomes[r.mes]}/${r.ano} — ${r.quinzena}ª Quinzena</strong>
                    <div class="info" style="font-size:12px;color:#4a6a8a;margin-top:2px">${r.spreadsheet_id}</div>
                </div>
                <button class="admin-del-btn" onclick="deletarPlanilhaVideira(${r.id})">Remover</button>
            </div>
        `).join("");
    })
    .catch(() => {});
}

function adicionarPlanilhaVideira() {
    const mes = document.getElementById("vali-mes").value;
    const ano = document.getElementById("vali-ano").value;
    const q   = document.getElementById("vali-quinzena").value;
    const url = document.getElementById("vali-url").value.trim();
    if (!url) { gcAlert("Cole o link do fechamento."); return; }

    fetch(API + "/videira/planilha", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: parseInt(mes), ano: parseInt(ano), quinzena: parseInt(q), spreadsheet_url: url })
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) { gcAlert(data.error); return; }
        document.getElementById("vali-url").value = "";
        _carregarPlanilhasVideira();
    })
    .catch(() => gcAlert("Erro ao salvar fechamento."));
}

function deletarPlanilhaVideira(id) {
    gcConfirm("Remover este fechamento?", () => {
        fetch(API + "/videira/planilhas/" + id, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token }
        }).then(() => _carregarPlanilhasVideira());
    }, null, "Remover");
}

// ───── VIDEIRA — PAINEL ─────

let _vpQuinzena = 1;

function abrirVideiraPainel(event) {
    if (event) event.preventDefault();
    _vpIniciarSelects();
    mostrarTela("tela-videira-painel");
    buscarPainelVideira();
}

function _vpIniciarSelects() {
    const selAno = document.getElementById("vp-ano");
    if (selAno.options.length > 0) return;
    const anoAtual = new Date().getFullYear();
    for (let a = anoAtual - 1; a <= anoAtual + 1; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === anoAtual) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("vp-mes").value = new Date().getMonth() + 1;
    selecionarQuinzenaVideira(1);
}

function selecionarQuinzenaVideira(q) {
    _vpQuinzena = q;
    document.getElementById("vp-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("vp-btn-2q").classList.toggle("active", q === 2);
    buscarPainelVideira();
}

function buscarPainelVideira() {
    const mes      = document.getElementById("vp-mes")?.value;
    const ano      = document.getElementById("vp-ano")?.value;
    const quinzena = _vpQuinzena;
    if (!mes || !ano) return;

    document.getElementById("vp-empty").style.display   = "";
    document.getElementById("vp-content").style.display = "none";
    document.getElementById("vp-empty").innerText       = "Carregando...";

    fetch(`${API}/videira/painel?mes=${mes}&ano=${ano}&quinzena=${quinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(data => {
        if (data.error) {
            document.getElementById("vp-empty").innerText = data.error;
            return;
        }
        _renderPainelVideira(data);
    })
    .catch(() => {
        document.getElementById("vp-empty").innerText = "Erro ao carregar o fechamento.";
    });
}

function _fmt(n) {
    return (n || 0).toLocaleString("pt-BR");
}

function _renderPainelVideira(d) {
    // KPI cards
    const cards = [
        { label: "Valor Total Líquido", value: d.valor_total_liquido, color: "#22c55e" },
        { label: "Total de Pacotes",    value: d.qtd_pacotes_total,   color: "#3a86ff" },
        { label: "Coletas",             value: d.qtd_coletas,         color: "#f97316" },
        { label: "Valor Coletas",       value: d.valor_coletas,       color: "#f97316" },
        { label: "Diária Coletas",      value: d.diaria_coletas,      color: "#94a3b8" },
        { label: "Descontos",           value: d.valor_desconto,      color: "#ef4444" },
    ];

    document.getElementById("vp-cards").innerHTML = cards.map(c => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px 18px">
            <div style="font-size:12px;color:#64748b;margin-bottom:6px;font-weight:500">${c.label}</div>
            <div style="font-size:20px;font-weight:700;color:${c.color}">${c.value || "—"}</div>
        </div>
    `).join("");

    // Tabela de cidades
    const tbody = document.getElementById("vp-tbody");
    tbody.innerHTML = (d.cidades || []).map(c => `
        <tr>
            <td style="font-weight:600">${c.cidade}</td>
            <td style="text-align:right;color:#f97316">${_fmt(c.shopee)}</td>
            <td style="text-align:right;color:#9333ea">${_fmt(c.imile)}</td>
            <td style="text-align:right;color:#22c55e">${_fmt(c.anjun)}</td>
            <td style="text-align:right;color:#ef4444">${_fmt(c.jt)}</td>
            <td style="text-align:right;color:#12a5e8">${_fmt(c.loggi)}</td>
            <td style="text-align:right;font-weight:600">${_fmt(c.qtd_total)}</td>
            <td style="text-align:right;color:#22c55e;font-weight:600">${c.valor_cidade}</td>
        </tr>
    `).join("");

    // Totais no tfoot
    const tq = d.totais_qtd || {};
    const tv = d.totais_val || {};
    document.getElementById("vp-tfoot").innerHTML = `
        <tr style="background:rgba(255,255,255,0.04);font-weight:700;font-size:13px">
            <td>Totais (qtd)</td>
            <td style="text-align:right;color:#f97316">${_fmt(tq.shopee)}</td>
            <td style="text-align:right;color:#9333ea">${_fmt(tq.imile)}</td>
            <td style="text-align:right;color:#22c55e">${_fmt(tq.anjun)}</td>
            <td style="text-align:right;color:#ef4444">${_fmt(tq.jt)}</td>
            <td style="text-align:right;color:#12a5e8">${_fmt(tq.loggi)}</td>
            <td style="text-align:right">${_fmt(tq.total)}</td>
            <td></td>
        </tr>
        <tr style="background:rgba(255,255,255,0.02);font-size:12px;color:#94a3b8">
            <td>Valores</td>
            <td style="text-align:right">${tv.shopee || "—"}</td>
            <td style="text-align:right">${tv.imile  || "—"}</td>
            <td style="text-align:right">${tv.anjun  || "—"}</td>
            <td style="text-align:right">${tv.jt     || "—"}</td>
            <td style="text-align:right">${tv.loggi  || "—"}</td>
            <td></td>
            <td></td>
        </tr>
    `;

    document.getElementById("vp-empty").style.display   = "none";
    document.getElementById("vp-content").style.display = "";
}
