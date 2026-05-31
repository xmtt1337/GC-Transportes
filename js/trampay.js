// ───── TELA IMPORTAR TRAMPAY (embutido na tela Entregadores) ─────
let _trampayRows = [];

function _lerCsvTrampay(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById("trampay-importar-btn").style.display = "none";
    document.getElementById("trampay-resultado").style.display = "none";
    document.getElementById("trampay-sucesso").style.display   = "none";
    document.getElementById("trampay-counter").textContent = "Lendo arquivo...";
    document.getElementById("trampay-resultado").style.display = "";
    const reader = new FileReader();
    reader.onerror = () => {
        document.getElementById("trampay-counter").textContent = "Erro ao ler o arquivo.";
    };
    reader.onload = e => {
      try {
        const text = e.target.result;
        const linhas = text.split(/\r?\n/).filter(l => l.trim());
        if (linhas.length < 2) {
            document.getElementById("trampay-counter").textContent = "Arquivo vazio ou inválido.";
            return;
        }

        // Detectar separador: tab, ponto-e-vírgula ou vírgula
        const sep = linhas[0].includes("\t") ? "\t" : linhas[0].includes(";") ? ";" : ",";
        const cab = linhas[0].split(sep).map(c => c.trim().toLowerCase()
            .replace(/[_\s]/g, "_")
            .normalize("NFD").replace(/[̀-ͯ]/g, ""));

        const idx = k => cab.findIndex(c => c.includes(k));
        const iNome  = idx("nome");
        const iDoc   = idx("doc");
        const iExt   = idx("externo") >= 0 ? idx("externo") : idx("id");
        const iPix   = idx("chave");
        const iTipo  = idx("tipo");
        const iData  = idx("data");

        _trampayRows = linhas.slice(1).map(l => {
            const cols = l.split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
            return {
                nome:          iNome  >= 0 ? cols[iNome]  : "",
                documento:     iDoc   >= 0 ? cols[iDoc]   : "",
                id_externo:    iExt   >= 0 ? cols[iExt]   : "",
                chave_pix:     iPix   >= 0 ? cols[iPix]   : "",
                chave_pix_tipo:iTipo  >= 0 ? cols[iTipo]  : "",
                data_criacao:  iData  >= 0 ? cols[iData]  : "",
            };
        }).filter(r => r.nome);

        document.getElementById("trampay-counter").textContent =
            `${_trampayRows.length} entregadores encontrados no CSV`;

        document.getElementById("trampay-tbody").innerHTML = _trampayRows.map(r => `
            <tr>
                <td class="t-nome">${r.nome}</td>
                <td class="t-doc">${r.documento || "—"}</td>
                <td class="t-doc">${r.id_externo || "—"}</td>
                <td class="t-pix">${r.chave_pix || "—"}</td>
                <td>${r.chave_pix_tipo ? `<span class="pag-pix-badge">${r.chave_pix_tipo}</span>` : "—"}</td>
                <td style="font-size:12px;color:#64748b">${r.data_criacao || "—"}</td>
            </tr>
        `).join("");

        document.getElementById("trampay-resultado").style.display    = "";
        document.getElementById("trampay-importar-btn").style.display = "";
      } catch(err) {
        document.getElementById("trampay-counter").textContent = "Erro ao processar: " + err.message;
      }
    };
    reader.readAsText(file, "UTF-8");
}

async function _confirmarImportTrampay() {
    if (!_trampayRows.length) return;
    const btn = document.getElementById("trampay-importar-btn");
    btn.disabled = true;
    btn.textContent = "Importando...";
    const tok = localStorage.getItem("token");

    try {
        const res  = await fetch(`${API}/admin/trampay/importar`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
            body: JSON.stringify({ entregadores: _trampayRows })
        });
        const data = await res.json();
        if (data.error) { alert(data.error); btn.disabled = false; btn.textContent = "Importar dados"; return; }
        const partes = [];
        if (data.atualizados) partes.push(`${data.atualizados} atualizados`);
        if (data.novos)       partes.push(`${data.novos} novos`);
        document.getElementById("trampay-sucesso-txt").textContent =
            (partes.length ? partes.join(", ") : "Nenhuma alteração") + " — importação concluída!";
        document.getElementById("trampay-resultado").style.display = "none";
        document.getElementById("trampay-importar-btn").style.display = "none";
        document.getElementById("trampay-sucesso").style.display = "";
        document.getElementById("trampay-file-input").value = "";
        _carregarEntregadoresTrampay();
    } catch {
        alert("Erro ao conectar com o servidor.");
        btn.disabled = false;
        btn.textContent = "Importar dados";
    }
}

// ───── TELA ENTREGADORES TRAMPAY ─────
function abrirEntregadoresTrampay(event) {
    if (event) event.preventDefault();
    _trampayRows = [];
    document.getElementById("trampay-file-input").value = "";
    document.getElementById("trampay-resultado").style.display  = "none";
    document.getElementById("trampay-sucesso").style.display    = "none";
    document.getElementById("trampay-importar-btn").style.display = "none";
    mostrarTela("tela-trampay-entregadores");
    _carregarEntregadoresTrampay();
}

function _carregarEntregadoresTrampay() {
    const tok = localStorage.getItem("token");
    const empty = document.getElementById("trampay-ent-empty");
    const res   = document.getElementById("trampay-ent-resultado");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/admin/trampay/entregadores`, { headers: { "Authorization": "Bearer " + tok } })
    .then(r => r.json())
    .then(data => {
        if (!Array.isArray(data) || !data.length) {
            empty.innerText = "Nenhum entregador com dados Trampay.";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        const lastImport = data[0]?.last_import
            ? new Date(data[0].last_import).toLocaleString("pt-BR")
            : null;
        document.getElementById("trampay-ent-counter").innerHTML =
            `${data.length} entregador${data.length !== 1 ? "es" : ""} cadastrado${data.length !== 1 ? "s" : ""}` +
            (lastImport ? ` &nbsp;·&nbsp; <span style="color:#4a6a8a">Último import: ${lastImport}</span>` : "");
        document.getElementById("trampay-ent-tbody").innerHTML = data.map(u => `
            <tr>
                <td class="adm-nf-entregador">${u.nome || "—"}</td>
                <td class="adm-nf-cnpj">${u.documento || "—"}</td>
                <td class="adm-nf-cnpj">${u.id_externo || "—"}</td>
                <td class="pag-pix">${u.chave_pix || "—"}</td>
                <td>${u.chave_pix ? `<span class="pag-pix-badge">${u.tipo_pix || "—"}</span>` : "—"}</td>
                <td style="font-size:12px;color:#64748b">${u.data_criacao || "—"}</td>
            </tr>
        `).join("");
    }).catch(() => { empty.innerText = "Erro ao carregar entregadores Trampay."; });
}
