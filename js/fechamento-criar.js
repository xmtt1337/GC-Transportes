// ───── CRIAR FECHAMENTO (upload de relatório por transportadora → banco) ─────
let _cfMes         = new Date().getMonth() + 1;
let _cfAno         = new Date().getFullYear();
let _cfQuinzena    = null;
let _cfTranspAtual = null;

// Cada transportadora tem suas próprias regras de mapeamento de colunas — o parser
// de cada uma fica isolado, pra facilitar acrescentar as próximas depois.
const _CF_TRANSPORTADORAS = [
    { key: "shopee_cfc", label: "Shopee CFC", transportadora: "Shopee CFC", polo: "Caçador", parser: _cfParseShopee },
    { key: "shopee_via", label: "Shopee VIA",  transportadora: "Shopee VIA", polo: "Videira", parser: _cfParseShopee },
];

function abrirCriarFechamento(event) {
    if (event) event.preventDefault();
    _cfQuinzena = null;
    _cfTranspAtual = null;
    document.getElementById("cf-btn-1q").classList.remove("active");
    document.getElementById("cf-btn-2q").classList.remove("active");
    document.getElementById("cf-empty").innerText = "Selecione o mês, ano e quinzena.";
    document.getElementById("cf-empty").style.display = "";
    document.getElementById("cf-content").style.display = "none";
    _cfIniciarSelects();
    mostrarTela("tela-criar-fechamento");
}

function _cfIniciarSelects() {
    const selAno   = document.getElementById("cf-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _cfAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("cf-mes").value = _cfMes;
}

function _cfPeriodoMudou() {
    _cfMes = parseInt(document.getElementById("cf-mes").value);
    _cfAno = parseInt(document.getElementById("cf-ano").value);
    if (_cfQuinzena) _cfCarregarResumo();
}

function _cfSelecionarQuinzena(q) {
    _cfQuinzena = q;
    document.getElementById("cf-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("cf-btn-2q").classList.toggle("active", q === 2);
    _cfCarregarResumo();
}

function _cfCarregarResumo() {
    if (!_cfQuinzena) return;
    _cfMes = parseInt(document.getElementById("cf-mes").value);
    _cfAno = parseInt(document.getElementById("cf-ano").value);
    const empty   = document.getElementById("cf-empty");
    const content = document.getElementById("cf-content");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${API}/admin/fechamento/entregas/resumo?mes=${_cfMes}&ano=${_cfAno}&quinzena=${_cfQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(rows => {
        empty.style.display = "none";
        content.style.display = "";
        _cfTranspAtual = null;
        _cfRenderResumo(Array.isArray(rows) ? rows : []);
        _cfRenderTabs();
        document.getElementById("cf-upload-wrap").style.display = "none";
    }).catch(() => {
        empty.innerText = "Erro ao carregar dados do período.";
    });
}

// Reaplica a tabela de conversão de nomes (fechamento_nomes) nas entregas já salvas
// desse período — sem precisar reprocessar/reenviar o relatório original.
function _cfAtualizarNomes() {
    if (!_cfQuinzena) return;
    const btn    = document.getElementById("cf-atualizar-nomes-btn");
    const status = document.getElementById("cf-atualizar-nomes-status");
    btn.disabled = true;
    status.innerText = "Atualizando...";

    fetch(`${API}/admin/fechamento/entregas/atualizar-nomes`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena })
    }).then(r => r.json())
    .then(d => {
        btn.disabled = false;
        if (d.error) { status.innerText = d.error; return; }
        status.innerText = `${d.atualizados} entrega${d.atualizados !== 1 ? "s" : ""} atualizada${d.atualizados !== 1 ? "s" : ""}.`;
    }).catch(() => {
        btn.disabled = false;
        status.innerText = "Erro ao atualizar.";
    });
}

function _cfRenderResumo(rows) {
    const el = document.getElementById("cf-resumo");
    if (!rows.length) {
        el.innerHTML = `<div style="font-size:13px;color:#64748b">Nenhuma entrega cadastrada ainda para esse período.</div>`;
        return;
    }
    el.innerHTML = `
        <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px">Já cadastrado nesse período</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${rows.map(r => `
                <div style="padding:8px 14px;border-radius:10px;background:rgba(58,134,255,0.08);border:1px solid rgba(58,134,255,0.2);font-size:13px">
                    <strong style="color:#e2e8f0">${r.transportadora}</strong>
                    <span style="color:#64748b"> — ${r.total} entrega${r.total !== 1 ? "s" : ""}</span>
                </div>`).join("")}
        </div>`;
}

function _cfRenderTabs() {
    const el = document.getElementById("cf-transp-tabs");
    el.innerHTML = _CF_TRANSPORTADORAS.map(t => `
        <button class="quinzena-btn${_cfTranspAtual === t.key ? " active" : ""}" onclick="_cfSelecionarTransp('${t.key}')">${t.label}</button>
    `).join("");
}

function _cfSelecionarTransp(key) {
    _cfTranspAtual = key;
    _cfRenderTabs();
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === key);
    document.getElementById("cf-upload-titulo").innerText = `Anexar relatório — ${cfg.label}`;
    document.getElementById("cf-upload-status").innerHTML = "";
    document.getElementById("cf-file-input").value = "";
    document.getElementById("cf-upload-wrap").style.display = "";
}

async function _cfArquivoSelecionado(input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById("cf-upload-status");
    status.innerHTML = `<div style="color:#64748b;font-size:13px">Lendo arquivo...</div>`;

    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual);
    if (!cfg) return;

    try {
        const grid = await _cfLerGrid(file);
        if (!grid || grid.length < 2) throw new Error("Arquivo vazio ou inválido.");
        const linhas = cfg.parser(grid, cfg);
        if (!linhas.length) throw new Error("Nenhuma linha válida encontrada no arquivo.");
        status.innerHTML = `<div style="color:#64748b;font-size:13px">Enviando ${linhas.length} entregas...</div>`;
        await _cfEnviarLinhas(linhas);
        status.innerHTML = `<div style="color:#22c55e;font-size:13px">✓ ${linhas.length} entregas enviadas com sucesso!</div>`;
        input.value = "";
        _cfCarregarResumo();
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
        input.value = "";
    }
}

async function _cfEnviarLinhas(linhas) {
    const res = await fetch(`${API}/admin/fechamento/entregas`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: _cfTranspAtual, linhas })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao enviar.");
    return data;
}

// ── Leitura genérica do arquivo (mesma lógica usada em Alimentar Separação) ──
function _cfLerGrid(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                let wb;
                if (file.name.toLowerCase().endsWith(".csv")) {
                    const text = new TextDecoder("utf-8").decode(data);
                    wb = XLSX.read(text, { type: "string" });
                } else {
                    wb = XLSX.read(data, { type: "array", raw: false });
                }
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }));
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ── Parser Shopee (CFC e VIA usam o mesmo formato de relatório) ──
function _cfParseShopee(grid, cfg) {
    const headers = grid[0].map(h => String(h || "").trim());
    const idx = (nome) => headers.indexOf(nome);

    const iDriver   = idx("Driver Name");
    const iOrder    = idx("Order ID");
    const iZip      = idx("Zipcode Name");
    const iBuyer    = idx("Buyer Name");
    const iRecebido = idx("Current Station Received Time");
    const iEntregue = idx("Delivered Time");
    const iPeso     = idx("Chargeable Weight");

    const faltando = [];
    if (iDriver   < 0) faltando.push("Driver Name");
    if (iOrder    < 0) faltando.push("Order ID");
    if (iZip      < 0) faltando.push("Zipcode Name");
    if (iBuyer    < 0) faltando.push("Buyer Name");
    if (iRecebido < 0) faltando.push("Current Station Received Time");
    if (iEntregue < 0) faltando.push("Delivered Time");
    if (iPeso     < 0) faltando.push("Chargeable Weight");
    if (faltando.length) throw new Error("Colunas não encontradas no arquivo: " + faltando.join(", "));

    const linhas = [];
    for (let i = 1; i < grid.length; i++) {
        const row = grid[i];
        if (!row || !row.some(c => String(c || "").trim())) continue; // linha em branco
        const cep = String(row[iZip] || "").replace(/\D/g, "").padStart(8, "0");
        linhas.push({
            transportadora:  cfg.transportadora,
            tipo_produto:    "NORMAL",
            driver:          null,
            usuario:         String(row[iDriver] || "").trim() || null,
            codigo:          String(row[iOrder]  || "").trim() || null,
            cep,
            polo:            cfg.polo,
            destinatario:    String(row[iBuyer] || "").trim() || null,
            endereco:        null,
            data_atribuicao: String(row[iRecebido] || "").trim() || null,
            data_entrega:    String(row[iEntregue]  || "").trim() || null,
            dentro_prazo:    null,
            peso_kg:         String(row[iPeso] || "").trim().replace(".", ",") || null,
            valor_entrega:   null,
            incentivo:       "-",
            desconto_40:     "-",
            adicional_peso:  "0",
            valor_motorista: null,
        });
    }
    return linhas;
}
