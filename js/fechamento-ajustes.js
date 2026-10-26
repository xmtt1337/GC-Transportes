// ───── FECHAMENTO › ACRÉSCIMOS E DESCONTOS ─────
// Lançamento à mão por entregador e quinzena: acréscimo (soma) ou desconto (tira). Entra
// nos ajustes do Resumo da Quinzena. Backend: /admin/fechamento-transportadoras/ajustes
// (modules/fechamento-transportadoras/ajustes.js).
const _AJ_API = () => `${API}/admin/fechamento-transportadoras`;
const _AJ_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let _ajLinhas = [];
let _ajEntregadores = null;

function _ajEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _ajNum(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _ajHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}

/** Quinzenas pra escolher: da próxima até 6 meses atrás, a atual selecionada. Valor "ano-mes-q". */
function _ajQuinzenas(hoje) {
    const d = hoje || new Date();
    let ano = d.getFullYear(), mes = d.getMonth() + 1, q = d.getDate() <= 15 ? 1 : 2;
    const atual = `${ano}-${mes}-${q}`;
    // começa uma quinzena à frente
    if (q === 1) q = 2; else { q = 1; mes++; if (mes > 12) { mes = 1; ano++; } }
    const lista = [];
    for (let i = 0; i < 14; i++) {
        lista.push({ valor: `${ano}-${mes}-${q}`, rotulo: `Q${q}${_AJ_MESES[mes - 1]} · ${q === 1 ? "1 – 15" : "16 – fim"} de ${_AJ_MESES[mes - 1]}/${ano}`, atual: `${ano}-${mes}-${q}` === atual });
        if (q === 2) q = 1; else { q = 2; mes--; if (mes < 1) { mes = 12; ano--; } }
    }
    return lista;
}
function _ajPeriodo() {
    const [ano, mes, quinzena] = document.getElementById("aj-quinzena").value.split("-").map(Number);
    return { mes, ano, quinzena };
}

function abrirAjustesFechamento(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-ajustes-fechamento");
    const el = document.getElementById("aj-conteudo");
    el.innerHTML = `
        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Novo lançamento</div>
            <div class="cft-ajuda" style="margin-bottom:10px">Entra no Resumo da Quinzena da quinzena escolhida: acréscimo soma no líquido, desconto tira.</div>
            <datalist id="aj-entregadores"></datalist>
            <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap">
                <select class="fech-select" id="aj-quinzena" onchange="_ajCarregar()">${_ajQuinzenas().map(q =>
                    `<option value="${q.valor}"${q.atual ? " selected" : ""}>${_ajEsc(q.rotulo)}</option>`).join("")}</select>
                <input class="cft-input" id="aj-driver" list="aj-entregadores" placeholder="Entregador..." style="width:300px;flex:0 0 auto;margin:0" onfocus="_ajGarantirEntregadores()">
                <input class="cft-input" id="aj-valor" inputmode="decimal" placeholder="Valor (R$)" style="width:120px;flex:0 0 auto;margin:0">
            </div>
            <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap;gap:16px">
                <label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#cbd5e1"><input type="radio" name="aj-tipo" value="acrescimo"> Acréscimo</label>
                <label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#cbd5e1"><input type="radio" name="aj-tipo" value="desconto"> Desconto</label>
                <input class="cft-input" id="aj-descricao" placeholder="Descrição (opcional)" maxlength="300" style="min-width:300px;flex:1;margin:0">
            </div>
            <div class="cft-barra" style="margin:0">
                <button class="cft-btn primario" id="aj-salvar" onclick="_ajSalvar()">Lançar</button>
                <span class="cft-ajuda" id="aj-status"></span>
            </div>
        </div>
        <div id="aj-lista"></div>`;
    _ajGarantirEntregadores();
    _ajCarregar();
}

// Lista de entregadores (Dados entregadores + Conversão de nomes), lida uma vez.
function _ajGarantirEntregadores() {
    const pintar = () => {
        const dl = document.getElementById("aj-entregadores");
        if (dl) dl.innerHTML = (_ajEntregadores || []).map(n => `<option value="${_ajEsc(n)}">`).join("");
    };
    if (_ajEntregadores) { pintar(); return; }
    fetch(`${_AJ_API()}/entregadores`, { headers: _ajHeaders() }).then(r => r.json())
        .then(d => { _ajEntregadores = d.nomes || []; pintar(); }).catch(() => {});
}

function _ajCarregar(msg) {
    const p = _ajPeriodo();
    const el = document.getElementById("aj-lista");
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_AJ_API()}/ajustes?mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`, { headers: _ajHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_ajEsc(d.error)}</div>`; return; }
        _ajLinhas = d.linhas || [];
        _ajRenderLista(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar os lançamentos.</div>`; });
}

function _ajRenderLista(msg) {
    const soma = (t) => _ajLinhas.filter(a => a.tipo === t).reduce((s, a) => s + a.valor, 0);
    document.getElementById("aj-lista").innerHTML = `
        <div class="cft-barra" style="justify-content:space-between">
            <span class="cft-pend-titulo" style="color:#e2e8f0;margin:0">Lançamentos da quinzena</span>
            <span class="cft-ajuda">${msg || ""} Acréscimos <span class="cft-pos">${_ajNum(soma("acrescimo"))}</span> · Descontos <span class="cft-neg">${_ajNum(soma("desconto"))}</span></span>
        </div>
        <div class="cft-tabela-wrap" style="max-height:560px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th>Tipo</th><th style="text-align:right">Valor (R$)</th><th>Descrição</th><th>Lançado por</th><th></th></tr></thead>
            <tbody>${_ajLinhas.length ? _ajLinhas.map(a => `<tr>
                <td>${_ajEsc(a.driver)}</td>
                <td>${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"}</td>
                <td class="num ${a.tipo === "acrescimo" ? "cft-pos" : "cft-neg"}">${a.tipo === "acrescimo" ? "+" : "−"} ${_ajNum(a.valor)}</td>
                <td style="white-space:normal">${_ajEsc(a.descricao || "")}</td>
                <td class="cft-ajuda">${_ajEsc(a.criado_por_nome || "")} ${a.criado_em ? new Date(a.criado_em).toLocaleString("pt-BR") : ""}</td>
                <td style="width:1%"><button class="cft-btn perigo" onclick="_ajRemover(${a.id})">Remover</button></td>
            </tr>`).join("") : `<tr><td colspan="6" class="cft-vazio" style="padding:14px">Nenhum lançamento nesta quinzena.</td></tr>`}</tbody>
        </table></div>`;
}

async function _ajSalvar() {
    const st = document.getElementById("aj-status");
    const tipo = (document.querySelector('input[name="aj-tipo"]:checked') || {}).value || "";
    const corpo = { ..._ajPeriodo(), driver: document.getElementById("aj-driver").value, valor: document.getElementById("aj-valor").value,
        tipo, descricao: document.getElementById("aj-descricao").value };
    if (!tipo) { st.innerText = "Escolha se é acréscimo ou desconto."; return; }
    const btn = document.getElementById("aj-salvar");
    btn.disabled = true;
    try {
        const r = await fetch(`${_AJ_API()}/ajustes`, { method: "POST", headers: _ajHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.innerText = d.error || "Erro ao lançar."; return; }
        st.innerText = "";
        for (const id of ["aj-driver", "aj-valor", "aj-descricao"]) document.getElementById(id).value = "";
        _ajCarregar("Lançado.");
    } catch (_) { st.innerText = "Erro ao lançar."; } finally { btn.disabled = false; }
}

function _ajRemover(id) {
    const a = _ajLinhas.find(x => x.id === id);
    gcConfirm(`Remover o ${a && a.tipo === "acrescimo" ? "acréscimo" : "desconto"} de <b>${_ajEsc(a ? a.driver : "")}</b> (R$ ${_ajNum(a ? a.valor : 0)})?`, () => {
        fetch(`${_AJ_API()}/ajustes/${id}`, { method: "DELETE", headers: _ajHeaders() })
        .then(r => r.json())
        .then(d => { if (d.error) gcAlert(d.error); else _ajCarregar("Removido."); })
        .catch(() => gcAlert("Erro ao remover."));
    }, "Remover lançamento", "Remover");
}
