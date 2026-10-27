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

/** Quinzena de hoje (1–15 = Q1). */
function _ajHoje(hoje) {
    const d = hoje || new Date();
    return { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
}
/** As n quinzenas a partir de per, virando mês e ano (igual ao servidor). */
function _ajProximas(per, n) {
    const out = [];
    let { mes, ano, quinzena } = per;
    for (let i = 0; i < n; i++) {
        out.push({ mes, ano, quinzena });
        if (quinzena === 1) quinzena = 2; else { quinzena = 1; mes++; if (mes > 12) { mes = 1; ano++; } }
    }
    return out;
}
function _ajCodigo(p) { return `Q${p.quinzena}${_AJ_MESES[p.mes - 1]}/${p.ano}`; }
function _ajPeriodo() {
    const v = (id) => parseInt(document.getElementById(id).value, 10);
    return { mes: v("aj-mes"), ano: v("aj-ano"), quinzena: v("aj-q") };
}
// Valor digitado ("1.941,12") → número.
function _ajValorNum(t) {
    const n = Number(String(t || "").replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}
// "6 × R$ 323,52 · Q1Out/2026 até Q2Dez/2026"
function _ajTextoParcelas() {
    const el = document.getElementById("aj-previa");
    if (!el) return;
    const n = parseInt(document.getElementById("aj-parcelas").value, 10) || 1;
    const total = _ajValorNum(document.getElementById("aj-valor").value);
    if (n <= 1 || !total) { el.innerText = ""; return; }
    const qs = _ajProximas(_ajPeriodo(), n);
    const base = Math.floor(Math.round(total * 100) / n) / 100;
    const ultima = Math.round((total - base * (n - 1)) * 100) / 100;
    el.innerText = `${n} × R$ ${_ajNum(base)}${ultima !== base ? ` (última R$ ${_ajNum(ultima)})` : ""} · ${_ajCodigo(qs[0])} até ${_ajCodigo(qs[n - 1])}`;
}

function abrirAjustesFechamento(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-ajustes-fechamento");
    const h = _ajHoje();
    const el = document.getElementById("aj-conteudo");
    el.innerHTML = `
        <div class="cft-secao" style="margin-top:0">Novo lançamento</div>
        <div class="cft-ajuda" style="margin-bottom:14px">Entra no Resumo da Quinzena da quinzena escolhida: acréscimo soma no líquido, desconto tira.
            Parcelado: o valor total é dividido e cai uma parcela por quinzena, a partir da escolhida (pode ser quinzena futura, até de outro ano).</div>
        <datalist id="aj-entregadores"></datalist>
        <div class="aj-form">
            <div class="aj-campo"><span class="cft-rotulo">Quinzena</span><span class="aj-junto">
                <select class="fech-select" id="aj-q" onchange="_ajPeriodoMudou()">
                    <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
                <select class="fech-select" id="aj-mes" onchange="_ajPeriodoMudou()">${_AJ_MESES.map((m, i) =>
                    `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
                <select class="fech-select" id="aj-ano" onchange="_ajPeriodoMudou()">${Array.from({ length: 7 }, (_, i) => h.ano - 1 + i).map(a =>
                    `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
            </span></div>
            <div class="aj-campo"><span class="cft-rotulo">Tipo</span><span class="aj-tipo">
                <label><input type="radio" name="aj-tipo" value="acrescimo"><span>Acréscimo</span></label>
                <label><input type="radio" name="aj-tipo" value="desconto"><span>Desconto</span></label>
            </span></div>
            <label class="aj-campo" style="flex:1 1 220px"><span class="cft-rotulo">Entregador</span>
                <input class="cft-input" id="aj-driver" list="aj-entregadores" placeholder="Nome do entregador" onfocus="_ajGarantirEntregadores()"></label>
            <label class="aj-campo"><span class="cft-rotulo">Valor total (R$)</span>
                <input class="cft-input" id="aj-valor" inputmode="decimal" placeholder="0,00" style="width:140px" oninput="_ajTextoParcelas()"></label>
            <label class="aj-campo"><span class="cft-rotulo">Parcelas</span>
                <input class="cft-input" id="aj-parcelas" type="number" min="1" max="48" value="1" style="width:80px" oninput="_ajTextoParcelas()"></label>
            <label class="aj-campo" style="flex:1 1 100%"><span class="cft-rotulo">Descrição <span class="cft-ajuda" style="font-weight:400">(opcional)</span></span>
                <input class="cft-input" id="aj-descricao" maxlength="300"></label>
        </div>
        <div class="cft-barra" style="margin:12px 0 0">
            <button class="cft-btn primario" id="aj-salvar" onclick="_ajSalvar()">Lançar</button>
            <span class="cft-ajuda" id="aj-previa"></span>
            <span class="cft-ajuda" id="aj-status"></span>
        </div>
        <div id="aj-lista"></div>
        <div id="aj-parcelamentos"></div>`;
    _ajGarantirEntregadores();
    _ajCarregar();
    _ajCarregarParcelamentos();
}

function _ajPeriodoMudou() { _ajTextoParcelas(); _ajCarregar(); }

// Parcelamentos de todas as quinzenas: quantas parcelas ainda existem e onde caem.
function _ajCarregarParcelamentos() {
    const el = document.getElementById("aj-parcelamentos");
    fetch(`${_AJ_API()}/ajustes/parcelamentos`, { headers: _ajHeaders() })
    .then(r => r.json())
    .then(d => {
        const ls = d.linhas || [];
        el.innerHTML = !ls.length ? "" : `
            <div class="cft-secao">Parcelamentos</div>
            <div class="cft-tabela-wrap" style="max-height:360px;overflow-y:auto"><table class="cft-tabela">
                <thead><tr><th>Entregador</th><th>Tipo</th><th>Descrição</th><th style="text-align:right">Parcelas</th><th style="text-align:right">Soma (R$)</th><th>Quinzenas</th><th></th></tr></thead>
                <tbody>${ls.map(p => `<tr>
                    <td>${_ajEsc(p.driver)}</td>
                    <td>${p.tipo === "acrescimo" ? "Acréscimo" : "Desconto"}</td>
                    <td style="white-space:normal">${_ajEsc(p.descricao || "")}</td>
                    <td class="num">${p.restantes} de ${p.parcelas}</td>
                    <td class="num ${p.tipo === "acrescimo" ? "cft-pos" : "cft-neg"}">${_ajNum(p.total_restante)}</td>
                    <td class="cft-ajuda" style="white-space:normal">${(p.lista || []).map(x => `${_ajCodigo(x)} (${x.parcela})`).join(" · ")}</td>
                    <td style="width:1%"><button class="cft-btn perigo" data-g="${_ajEsc(p.grupo_id)}" onclick="_ajRemoverTodas(this.dataset.g)">Remover todas</button></td>
                </tr>`).join("")}</tbody></table></div>`;
        _ajParcelamentos = ls;
    }).catch(() => {});
}
let _ajParcelamentos = [];

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
        <div class="cft-secao cft-secao-lado">
            <span>Lançamentos da quinzena</span>
            <span class="cft-ajuda" style="font-weight:400">${msg || ""} Acréscimos <span class="cft-pos">${_ajNum(soma("acrescimo"))}</span> · Descontos <span class="cft-neg">${_ajNum(soma("desconto"))}</span></span>
        </div>
        <div class="cft-tabela-wrap" style="max-height:560px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th>Tipo</th><th style="text-align:right">Valor (R$)</th><th>Descrição</th><th>Lançado por</th><th></th></tr></thead>
            <tbody>${_ajLinhas.length ? _ajLinhas.map(a => `<tr>
                <td>${_ajEsc(a.driver)}</td>
                <td>${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"}${a.parcelas ? ` <span class="cft-ajuda">parcela ${a.parcela}/${a.parcelas}</span>` : ""}</td>
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
        tipo, descricao: document.getElementById("aj-descricao").value, parcelas: document.getElementById("aj-parcelas").value || "1" };
    if (!tipo) { st.innerText = "Escolha se é acréscimo ou desconto."; return; }
    const btn = document.getElementById("aj-salvar");
    btn.disabled = true;
    try {
        const r = await fetch(`${_AJ_API()}/ajustes`, { method: "POST", headers: _ajHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.innerText = d.error || "Erro ao lançar."; return; }
        st.innerText = "";
        for (const id of ["aj-driver", "aj-valor", "aj-descricao"]) document.getElementById(id).value = "";
        document.getElementById("aj-parcelas").value = "1";
        _ajTextoParcelas();
        const ps = d.parcelas || [];
        _ajCarregar(ps.length > 1 ? `Lançado em ${ps.length} parcelas (${_ajCodigo(ps[0])} até ${_ajCodigo(ps[ps.length - 1])}).` : "Lançado.");
        _ajCarregarParcelamentos();
    } catch (_) { st.innerText = "Erro ao lançar."; } finally { btn.disabled = false; }
}

function _ajApagar(id, todas, msg) {
    fetch(`${_AJ_API()}/ajustes/${id}${todas ? "?todas=1" : ""}`, { method: "DELETE", headers: _ajHeaders() })
    .then(r => r.json())
    .then(d => { if (d.error) gcAlert(d.error); else { _ajCarregar(msg); _ajCarregarParcelamentos(); } })
    .catch(() => gcAlert("Erro ao remover."));
}

// Parcela: remove só esta (as outras continuam caindo). O parcelamento inteiro sai pela lista Parcelamentos.
function _ajRemover(id) {
    const a = _ajLinhas.find(x => x.id === id);
    const qual = a && a.parcelas ? `a parcela ${a.parcela}/${a.parcelas} do` : "o";
    gcConfirm(`Remover ${qual} ${a && a.tipo === "acrescimo" ? "acréscimo" : "desconto"} de <b>${_ajEsc(a ? a.driver : "")}</b> (R$ ${_ajNum(a ? a.valor : 0)})?`
        + (a && a.parcelas ? "<br><span style='font-size:12px;color:#8494a9'>As outras parcelas continuam. Pra tirar todas, use Parcelamentos.</span>" : ""),
        () => _ajApagar(id, false, "Removido."), "Remover lançamento", "Remover");
}

function _ajRemoverTodas(grupo) {
    const p = _ajParcelamentos.find(x => x.grupo_id === grupo);
    if (!p || !p.lista || !p.lista.length) return;
    gcConfirm(`Remover as <b>${p.restantes} parcelas</b> de ${p.tipo === "acrescimo" ? "acréscimo" : "desconto"} de <b>${_ajEsc(p.driver)}</b> (R$ ${_ajNum(p.total_restante)})?`,
        () => _ajApagarGrupo(grupo), "Remover parcelamento", "Remover todas");
}
function _ajApagarGrupo(grupo) {
    fetch(`${_AJ_API()}/ajustes/grupo/${encodeURIComponent(grupo)}`, { method: "DELETE", headers: _ajHeaders() })
    .then(r => r.json())
    .then(x => { if (x.error) gcAlert(x.error); else { _ajCarregar("Parcelamento removido."); _ajCarregarParcelamentos(); } })
    .catch(() => gcAlert("Erro ao remover."));
}
