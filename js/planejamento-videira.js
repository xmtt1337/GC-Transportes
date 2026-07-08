// ───── PLANEJAMENTO VIDEIRA (bairro → entregador, por transportadora) ─────
const _PV_TRANSP_NOMES = { loggi: "Loggi", anjun: "Anjun", shopee: "Shopee", imile: "Imile", jt: "J&T" };
let _pvTransportadora = "loggi";
let _pvLinhas   = [];
let _pvUsuarios = [];

function abrirPlanejamentoVideira(event, transportadora) {
    if (event) event.preventDefault();
    _pvTransportadora = transportadora;
    document.getElementById("pv-transp-nome").innerText = _PV_TRANSP_NOMES[transportadora] || transportadora;
    document.getElementById("pv-filtro-input").value = "";
    mostrarTela("tela-planejamento-videira");
    _pvCarregar();
}

function _pvCarregar() {
    const empty   = document.getElementById("pv-empty");
    const content = document.getElementById("pv-content");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${API}/videira/planejamento?transportadora=${_pvTransportadora}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        if (!ok) { empty.innerText = b.error || "Erro ao carregar planejamento."; return; }
        if (!b.linhas || !b.linhas.length) { empty.innerText = "Nenhum bairro encontrado nesta aba."; return; }
        _pvLinhas   = b.linhas;
        _pvUsuarios = b.usuarios || [];
        empty.style.display = "none";
        content.style.display = "";
        _pvRenderizar(_pvLinhas);
    })
    .catch(() => { empty.innerText = "Erro ao conectar com o servidor."; });
}

function _pvRenderizar(linhas) {
    document.getElementById("pv-counter").innerText = `${linhas.length} bairro${linhas.length !== 1 ? "s" : ""}`;

    document.getElementById("pv-tbody").innerHTML = linhas.map(l => {
        const atual = l.entregador || "";
        const opcoesComSelecao = ["Não Definido", ..._pvUsuarios].map(u => {
            const val = u === "Não Definido" ? "" : u;
            const sel = val === atual ? " selected" : "";
            return `<option value="${val.replace(/"/g, "&quot;")}"${sel}>${u}</option>`;
        }).join("");
        return `<tr>
            <td class="adm-nf-entregador">${l.bairro || "—"}</td>
            <td class="adm-nf-cnpj">${l.sigla || "—"}</td>
            <td>
                <select class="fech-select" style="width:100%" onchange="_pvSalvar(${l.linha}, this)">
                    ${opcoesComSelecao}
                </select>
            </td>
        </tr>`;
    }).join("");
}

function _pvSalvar(linha, selectEl) {
    const entregador = selectEl.value;
    selectEl.disabled = true;
    fetch(`${API}/videira/planejamento`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ transportadora: _pvTransportadora, linha, entregador })
    })
    .then(r => r.json())
    .then(d => {
        selectEl.disabled = false;
        if (d.error) { gcAlert(d.error); return; }
        // Atualiza estado local para o filtro continuar refletindo o valor salvo
        const item = _pvLinhas.find(l => l.linha === linha);
        if (item) item.entregador = entregador;
        selectEl.style.borderColor = "rgba(34,197,94,0.6)";
        setTimeout(() => { selectEl.style.borderColor = ""; }, 900);
    })
    .catch(() => {
        selectEl.disabled = false;
        gcAlert("Erro ao salvar. Tente novamente.");
    });
}

function _pvFiltrarLocal() {
    const termo = document.getElementById("pv-filtro-input").value.trim().toLowerCase();
    if (!termo) { _pvRenderizar(_pvLinhas); return; }
    const filtrado = _pvLinhas.filter(l =>
        (l.bairro || "").toLowerCase().includes(termo) ||
        (l.sigla  || "").toLowerCase().includes(termo)
    );
    _pvRenderizar(filtrado);
}
