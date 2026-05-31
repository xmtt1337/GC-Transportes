// ───── TELA ADMIN NOTAS FISCAIS ─────
let _admNFMes      = new Date().getMonth() + 1;
let _admNFAno      = new Date().getFullYear();
let _admNFQuinzena = null;
let _admNFRows     = [];

function abrirAdminNFs(event) {
    if (event) event.preventDefault();
    _admNFQuinzena = null;
    document.getElementById("adm-nf-btn-1q").classList.remove("active");
    document.getElementById("adm-nf-btn-2q").classList.remove("active");
    document.getElementById("adm-nf-empty").innerText = "Selecione o mês, ano e quinzena para ver as notas fiscais.";
    document.getElementById("adm-nf-empty").style.display = "";
    document.getElementById("adm-nf-resultado").style.display = "none";
    _iniciarSelectsAdmNF();
    mostrarTela("tela-admin-nfs");
}

function _iniciarSelectsAdmNF() {
    const selAno = document.getElementById("adm-nf-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        selAno.appendChild(opt);
    }
    selAno.value = _admNFAno;
    document.getElementById("adm-nf-mes").value = _admNFMes;
}

function selecionarQuinzenaNF(q) {
    _admNFQuinzena = q;
    document.getElementById("adm-nf-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("adm-nf-btn-2q").classList.toggle("active", q === 2);
    buscarNFsAdmin();
}

function buscarNFsAdmin() {
    if (!_admNFQuinzena) {
        document.getElementById("adm-nf-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("adm-nf-empty").style.display = "";
        return;
    }
    _admNFMes = parseInt(document.getElementById("adm-nf-mes").value);
    _admNFAno = parseInt(document.getElementById("adm-nf-ano").value);

    const empty     = document.getElementById("adm-nf-empty");
    const resultado = document.getElementById("adm-nf-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/admin/notas?mes=${_admNFMes}&ano=${_admNFAno}&quinzena=${_admNFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(rows => {
        if (!Array.isArray(rows) || !rows.length) {
            _admNFRows = [];
            empty.innerText = "Nenhuma nota fiscal encontrada para este período.";
            return;
        }
        _admNFRows = rows;
        empty.style.display = "none";
        resultado.style.display = "";

        // Total valor NFs
        const totalNF = rows.reduce((s, nf) => s + (_parseMoeda(nf.valor) || 0), 0);

        // Detectar chaves de acesso duplicadas
        const chaveCount = {};
        rows.forEach(nf => { if (nf.chave_acesso) chaveCount[nf.chave_acesso] = (chaveCount[nf.chave_acesso] || 0) + 1; });
        const nDup = rows.filter(nf => chaveCount[nf.chave_acesso] > 1).length;

        // Verificar tomador GC Transportes
        const _isGC = t => t && /gc.*transport/i.test(t);
        const nSemGC = rows.filter(nf => nf.tomador && !_isGC(nf.tomador)).length;

        let counter = `${rows.length} nota${rows.length > 1 ? "s" : ""} &nbsp;·&nbsp; Total: <strong style="color:#22c55e">${moedaJS(totalNF)}</strong>`;
        if (nDup)   counter += ` &nbsp;·&nbsp; <span style="color:#ef4444">⚠ ${nDup} chave(s) duplicada(s)</span>`;
        if (nSemGC) counter += ` &nbsp;·&nbsp; <span style="color:#ef4444">⚠ ${nSemGC} sem GC Transportes</span>`;
        document.getElementById("adm-nf-counter").innerHTML = counter;

        document.getElementById("adm-nf-tbody").innerHTML = rows.map(nf => {
            const badgeCls = nf.status === "confere" ? "confere" : nf.status === "diverge" ? "diverge" : "pendente";
            const badgeTxt = nf.status === "confere" ? "✓ Confere" : nf.status === "diverge" ? "⚠ Diverge" : "—";
            const numPart   = nf.numero_nf ? `<div style="color:#94a3b8;font-size:11px;margin-bottom:3px">Nº ${nf.numero_nf}</div>` : "";
            const chavePart = nf.chave_acesso
                ? `<div class="adm-nf-chave" style="font-family:monospace;font-size:10.5px;color:#64748b;word-break:break-all;line-height:1.5">${nf.chave_acesso}</div>`
                : `<span style="color:#475569">—</span>`;

            const isDup   = chaveCount[nf.chave_acesso] > 1;
            const notGC   = nf.tomador && !_isGC(nf.tomador);
            const rowErr  = isDup || notGC;
            const rowStyle = rowErr ? ' style="background:rgba(239,68,68,0.07);border-left:3px solid #ef4444"' : '';

            const alertas = [
                isDup ? `<span class="adm-nf-badge diverge" style="margin-top:4px;display:inline-block">Chave duplicada</span>` : "",
                notGC ? `<span class="adm-nf-badge diverge" style="margin-top:4px;display:inline-block" title="${nf.tomador}">Tomador ≠ GC</span>` : "",
            ].filter(Boolean).join(" ");

            return `<tr${rowStyle}>
                <td class="adm-nf-entregador">${nf.user_name || nf.username}${alertas ? `<div style="margin-top:4px">${alertas}</div>` : ""}</td>
                <td><span class="adm-nf-badge ${badgeCls}">${badgeTxt}</span></td>
                <td class="adm-nf-valor">${nf.valor || "—"}</td>
                <td>${nf.emissao || "—"}</td>
                <td class="adm-nf-cnpj">${nf.cnpj || "—"}</td>
                <td>${nf.emissor || "—"}</td>
                <td>${numPart}${chavePart}</td>
            </tr>`;
        }).join("");
    })
    .catch(() => {
        empty.innerText = "Erro ao carregar notas fiscais.";
    });
}

function _iniciarSelectsAdmFech() {
    const selAno = document.getElementById("adm-fech-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _admFAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("adm-fech-mes").value = _admFMes;
}

function selecionarQuinzenaAdmin(q) {
    _admFQuinzena = q;
    document.getElementById("adm-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("adm-btn-2q").classList.toggle("active", q === 2);
    buscarQuinzenaAdmin();
}

function buscarQuinzenaAdmin() {
    if (!_admFQuinzena) {
        document.getElementById("adm-fech-empty").innerText = "Selecione a quinzena (1ª ou 2ª) antes de buscar.";
        document.getElementById("adm-fech-empty").style.display = "";
        return;
    }
    _admFMes = parseInt(document.getElementById("adm-fech-mes").value);
    _admFAno = parseInt(document.getElementById("adm-fech-ano").value);
    _admFEntregador = "";
    _admEntregadoresLista = [];
    document.getElementById("adm-ent-section").style.display = "none";
    document.getElementById("adm-fech-data").style.display = "none";

    const empty = document.getElementById("adm-fech-empty");
    empty.innerText = "Carregando...";
    empty.style.display = "";

    fetch(`${API}/admin/entregadores?mes=${_admFMes}&ano=${_admFAno}&quinzena=${_admFQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        if (!ok) {
            empty.innerText = b.error || "Nenhum fechamento encontrado para este período.";
            return;
        }
        _admEntregadoresLista = b.entregadores;
        empty.style.display = "none";
        document.getElementById("adm-search-input").value = "";
        document.getElementById("adm-search-input-area").style.display = "";
        document.getElementById("adm-selected-chip").style.display = "none";
        document.getElementById("adm-fech-data").style.display = "none";
        // Resumo geral
        const totalGeral   = b.entregadores.reduce((s, e) => s + (e.total_receber_num || 0), 0);
        const _toInt = v => parseInt(String(v || 0).replace(/\./g, "")) || 0;
        const totalPacotes = b.entregadores.reduce((s, e) => s + _toInt(e.total_entregues), 0);
        document.getElementById("adm-ent-counter").textContent       = `${b.entregadores.length} entregadores`;
        document.getElementById("adm-ent-total-pacotes").textContent = `${totalPacotes.toLocaleString("pt-BR")} pacotes entregues`;
        document.getElementById("adm-ent-total-geral").textContent   = `Total: ${moedaJS(totalGeral)}`;
        document.getElementById("adm-ent-section").style.display = "";
        _renderEntregadoresGrid(b.entregadores);
    })
    .catch(() => {
        empty.innerText = "Erro ao conectar com o servidor.";
    });
}

const _TRANSP_CHIPS = [
    { key: "qtd_loggi",  label: "Loggi",  color: "#01b4f7" },
    { key: "qtd_jt",     label: "J&T",    color: "#cc4138" },
    { key: "qtd_imile",  label: "iMile",  color: "#6b80ff" },
    { key: "qtd_anjun",  label: "Anjun",  color: "#009c21" },
    { key: "qtd_shopee", label: "Shopee", color: "#ed4d2d" },
];

function _renderEntregadoresGrid(lista) {
    const grid = document.getElementById("adm-ent-grid");
    if (!lista.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;padding:24px;text-align:center;color:#4a6a8a;font-size:13px">Nenhum entregador encontrado</div>`;
        return;
    }
    grid.innerHTML = lista.map(e => {
        const nomeEsc = e.nome.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `<div class="adm-ent-card" onclick="selecionarEntregadorAdmin('${nomeEsc}')" data-nome="${nomeEsc}">
            <div class="adm-ent-card-nome" title="${e.nome}">${e.nome}</div>
            <div class="adm-ent-card-valor">${e.total_receber}</div>
            <div class="adm-ent-card-qtd">${parseInt(String(e.total_entregues || 0).replace(/\./g, "")) || 0} pacotes entregues</div>
        </div>`;
    }).join("");
}

function filtrarEntregadores() {
    const q = document.getElementById("adm-search-input").value.toLowerCase();
    _renderEntregadoresGrid(_admEntregadoresLista.filter(e => e.nome.toLowerCase().includes(q)));
}

function abrirDropdownEntregadores() {}

function selecionarEntregadorAdmin(nome) {
    _admFEntregador = nome;
    document.getElementById("adm-ent-section").style.display = "none";
    _carregarPainelAdmin();
}

function limparSelecaoEntregador() {
    _admFEntregador = "";
    document.getElementById("adm-fech-data").style.display = "none";
    document.getElementById("adm-fech-empty").style.display = "none";
    document.getElementById("adm-ent-section").style.display = "";
}
