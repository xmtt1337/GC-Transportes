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
    // Hero + KPI grid
    const cards = document.getElementById("vp-cards");
    cards.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(34,197,94,0.09) 0%,rgba(58,134,255,0.04) 100%);border:1px solid rgba(34,197,94,0.2);border-radius:18px;padding:20px 24px;margin-bottom:18px">
            <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">Resultado Líquido do Período</div>
            <div style="font-size:30px;font-weight:800;color:#22c55e;letter-spacing:-.5px;margin-bottom:18px">${d.valor_total_liquido || "—"}</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
                ${[
                    { lbl:"Total Pacotes", val:(d.qtd_pacotes_total||0).toLocaleString("pt-BR"), c:"#3a86ff" },
                    { lbl:"Coletas",       val:(d.qtd_coletas||0).toLocaleString("pt-BR"),       c:"#f97316" },
                    { lbl:"Valor Coletas", val:d.valor_coletas||"—",                             c:"#f97316" },
                    { lbl:"Diária Col.",   val:d.diaria_coletas||"—",                            c:"#94a3b8" },
                    { lbl:"Descontos",     val:d.valor_desconto||"—",                            c:"#ef4444" },
                ].map(c => `
                    <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:11px 16px;min-width:120px">
                        <div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${c.lbl}</div>
                        <div style="font-size:17px;font-weight:700;color:${c.c}">${c.val}</div>
                    </div>
                `).join("")}
            </div>
        </div>
        <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;padding-left:2px">Detalhamento por Cidade</div>
    `;

    // Tabela de cidades
    document.getElementById("vp-tbody").innerHTML = (d.cidades || []).map(c => `
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

    // Totais
    const tq = d.totais_qtd || {};
    const tv = d.totais_val || {};
    const totalQtd = tq.total > 0 ? tq.total : ((tq.shopee||0) + (tq.imile||0) + (tq.anjun||0) + (tq.jt||0) + (tq.loggi||0));
    document.getElementById("vp-tfoot").innerHTML = `
        <tr style="background:rgba(255,255,255,0.05);font-weight:700;font-size:13px;border-top:1px solid rgba(255,255,255,0.08)">
            <td style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Total Qtd</td>
            <td style="text-align:right;color:#f97316">${_fmt(tq.shopee)}</td>
            <td style="text-align:right;color:#9333ea">${_fmt(tq.imile)}</td>
            <td style="text-align:right;color:#22c55e">${_fmt(tq.anjun)}</td>
            <td style="text-align:right;color:#ef4444">${_fmt(tq.jt)}</td>
            <td style="text-align:right;color:#12a5e8">${_fmt(tq.loggi)}</td>
            <td style="text-align:right;font-size:14px">${_fmt(totalQtd)}</td>
            <td style="text-align:right;color:#22c55e;font-size:13px">${d.soma_valor_cidades || "—"}</td>
        </tr>
        <tr style="background:rgba(255,255,255,0.02);font-size:12px;color:#64748b">
            <td style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Valores</td>
            <td style="text-align:right">${tv.shopee||"—"}</td>
            <td style="text-align:right">${tv.imile||"—"}</td>
            <td style="text-align:right">${tv.anjun||"—"}</td>
            <td style="text-align:right">${tv.jt||"—"}</td>
            <td style="text-align:right">${tv.loggi||"—"}</td>
            <td></td>
            <td></td>
        </tr>
    `;

    // Extravios
    const extEl = document.getElementById("vp-extravios");
    const lista = d.extravios_linhas || [];
    extEl.innerHTML = `
        <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;padding-left:2px">
            Extravios do Período
            <span style="font-size:10px;font-weight:500;color:#64748b;text-transform:none;letter-spacing:0;margin-left:6px">${lista.length} registro${lista.length !== 1 ? "s" : ""}</span>
        </div>
        <div id="vp-extravios-lista"></div>
    `;
    _renderExtravios(lista, "vp-extravios-lista", true);

    document.getElementById("vp-empty").style.display   = "none";
    document.getElementById("vp-content").style.display = "";
}
