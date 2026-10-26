// ───── FECHAMENTO › FECHAMENTO DE EXTRAVIOS ─────
// Extravios e multas que caem na quinzena: linhas da planilha de extravios do site com
// "Data desconto" = Q1/Q2 + mês (Q2Set...). Por entregador (nome padrão, igual ao Ticketlog),
// marcando quem tem desconto mas não tem fechamento (nenhum pacote) na quinzena — esse
// desconto não tem de onde sair. Backend: GET /extravios-quinzena.
const _FX_API = () => `${API}/admin/fechamento-transportadoras`;
let _fxMes = new Date().getMonth() + 1;
let _fxAno = new Date().getFullYear();
let _fxQuinzena = null;
let _fxDados = null;
let _fxFiltro = "";
let _fxReq = 0;

function _fxEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _fxNum(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fxChave(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function abrirExtraviosFechamento(event) {
    if (event) event.preventDefault();
    const selAno = document.getElementById("fx-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual + 1; a++) {
        const o = document.createElement("option");
        o.value = a; o.textContent = a;
        if (a === _fxAno) o.selected = true;
        selAno.appendChild(o);
    }
    document.getElementById("fx-mes").value = _fxMes;
    mostrarTela("tela-extravios-fechamento");
    if (_fxQuinzena) _fxCarregar();
}

function _fxPeriodoMudou() {
    _fxMes = parseInt(document.getElementById("fx-mes").value);
    _fxAno = parseInt(document.getElementById("fx-ano").value);
    if (_fxQuinzena) _fxCarregar();
}

function _fxSelecionarQuinzena(q) {
    _fxQuinzena = q;
    document.getElementById("fx-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("fx-btn-2q").classList.toggle("active", q === 2);
    _fxCarregar();
}

function _fxCarregar() {
    const el = document.getElementById("fx-conteudo");
    const req = ++_fxReq;
    el.innerHTML = `<div class="fechamento-empty">Lendo a planilha de extravios...</div>`;
    fetch(`${_FX_API()}/extravios-quinzena?mes=${_fxMes}&ano=${_fxAno}&quinzena=${_fxQuinzena}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (req !== _fxReq) return;
        if (d.error) {
            // planilha fora do ar ou fonte errada: dá pra trocar a fonte daqui mesmo
            el.innerHTML = `<div class="cft-erro">${_fxEsc(d.error)}</div>
                <div class="cft-barra"><button class="cft-btn" onclick="_fxAbrirFonte()">Fonte: planilha e aba</button></div>
                <div id="fx-fonte" class="cft-regras" style="display:none"></div>`;
            return;
        }
        _fxDados = d;
        _fxRender();
    }).catch(() => { if (req === _fxReq) el.innerHTML = `<div class="cft-erro">Erro ao carregar os extravios.</div>`; });
}

// Situação de cada entregador: sem conversão (responsável não achou entregador),
// sem fechamento (tem desconto mas nenhum pacote na quinzena) ou ok.
function _fxSituacao(r) {
    if (r.sem_conversao) return { k: "sem_conversao", t: "Responsável sem entregador" };
    if (!r.tem_fechamento) return { k: "sem_fechamento", t: "Sem fechamento na quinzena" };
    return { k: "ok", t: "No fechamento" };
}

function _fxRender() {
    const d = _fxDados, t = d.totais;
    const el = document.getElementById("fx-conteudo");
    el.innerHTML = `<div id="fx-fonte" class="cft-regras" style="display:none"></div>` + `
        <div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor">${t.linhas.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Extravios e multas · ${_fxEsc(d.codigo_quinzena)}</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor cft-neg">${_fxNum(t.total)}</div><div class="cft-kpi-rotulo">Total a descontar (R$)</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${t.entregadores.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Entregadores</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor${t.sem_fechamento.entregadores ? " cft-aviso" : ""}">${t.sem_fechamento.entregadores} · ${_fxNum(t.sem_fechamento.total)}</div><div class="cft-kpi-rotulo">Sem fechamento na quinzena</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor${t.sem_conversao.entregadores ? " cft-aviso" : ""}">${t.sem_conversao.entregadores} · ${_fxNum(t.sem_conversao.total)}</div><div class="cft-kpi-rotulo">Responsável sem entregador</div></div>
        </div>
        <div class="cft-ajuda" style="margin-bottom:10px">Linhas da planilha de extravios com "Data desconto" = <b style="color:#cbd5e1">${_fxEsc(d.codigo_quinzena)}</b>.
            O desconto entra no Resumo da Quinzena de quem tem fechamento.
            <a href="#" class="cft-ordem" style="color:#60a5fa" onclick="event.preventDefault();_fxAbrirFonte()">Fonte: planilha e aba</a>
            ${d.tem_relatorios ? "" : `<span class="cft-aviso">Nenhum relatório de transportadora nesta quinzena ainda — todos aparecem como sem fechamento.</span>`}</div>
        <div class="cft-barra" style="justify-content:space-between">
            <span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                ${[["", "Todos"], ["sem_fechamento", "Sem fechamento"], ["sem_conversao", "Sem entregador"], ["ok", "No fechamento"]].map(([k, rot]) =>
                    `<button class="cft-chip${_fxFiltro === k ? " on" : ""}" onclick="_fxMudarFiltro('${k}')">${rot}</button>`).join("")}
                <div class="adm-search-input-area" style="max-width:260px;margin:0">
                    <input type="text" id="fx-busca" placeholder="Entregador ou código..." oninput="_fxRenderTabelas()">
                </div>
            </span>
            <button class="cft-btn" onclick="_fxExportar()">Baixar planilha</button>
        </div>
        <div class="cft-pend-titulo" style="color:#e2e8f0">Por entregador</div>
        <div class="cft-tabela-wrap" style="max-height:380px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th>Situação</th><th style="text-align:right">Extravios</th><th style="text-align:right">Multas</th><th style="text-align:right">Total (R$)</th></tr></thead>
            <tbody id="fx-tbody-ent"></tbody></table></div>
        <div class="cft-pend-titulo" style="color:#e2e8f0;margin-top:14px">Linhas</div>
        <div class="cft-tabela-wrap" style="max-height:480px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th>Responsável (planilha)</th><th>Status</th><th>Transportadora</th><th>Data</th><th>Código</th>
                <th style="text-align:right">Valor (R$)</th><th>Causa</th></tr></thead>
            <tbody id="fx-tbody-lin"></tbody></table></div>`;
    _fxRenderTabelas();
}

function _fxMudarFiltro(k) { _fxFiltro = k; _fxRender(); }

function _fxSituacaoLinha(l) {
    return l.sem_conversao ? "sem_conversao" : l.tem_fechamento ? "ok" : "sem_fechamento";
}

/** Linhas e entregadores que passam no filtro e na busca. */
function _fxFiltrados() {
    const busca = _fxChave((document.getElementById("fx-busca") || {}).value);
    const ent = _fxDados.por_entregador.filter(r => (!_fxFiltro || _fxSituacao(r).k === _fxFiltro)
        && (!busca || _fxChave(r.entregador).includes(busca) || r.responsaveis.some(x => _fxChave(x).includes(busca))));
    const lin = _fxDados.linhas.filter(l => (!_fxFiltro || _fxSituacaoLinha(l) === _fxFiltro)
        && (!busca || _fxChave(l.driver).includes(busca) || _fxChave(l.responsavel).includes(busca) || _fxChave(l.codigo).includes(busca)));
    return { ent, lin };
}

function _fxRenderTabelas() {
    const { ent, lin } = _fxFiltrados();
    const vazio = (n) => `<tr><td colspan="${n}" class="cft-vazio" style="padding:14px">${_fxDados.linhas.length ? "Nada com esse filtro." : "Nenhum extravio com essa Data desconto."}</td></tr>`;
    document.getElementById("fx-tbody-ent").innerHTML = ent.length ? ent.map(r => {
        const s = _fxSituacao(r);
        return `<tr>
            <td>${_fxEsc(r.entregador)}${r.responsaveis.length && r.responsaveis.some(x => x !== r.entregador) ? ` <span class="cft-ajuda" title="Como está na planilha">(${_fxEsc(r.responsaveis.join(" · "))})</span>` : ""}</td>
            <td>${s.k === "ok" ? `<span class="cft-ajuda">${s.t}</span>` : `<span class="cft-aviso">${s.t}</span>`}</td>
            <td class="num">${r.extravios}</td><td class="num">${r.multas}</td>
            <td class="num cft-neg"><strong>${_fxNum(r.total)}</strong></td>
        </tr>`;
    }).join("") : vazio(5);
    document.getElementById("fx-tbody-lin").innerHTML = lin.length ? lin.slice(0, 2000).map(l => `<tr>
            <td>${_fxEsc(l.driver || "—")}${_fxSituacaoLinha(l) !== "ok" ? ` <span class="cft-aviso">${l.sem_conversao ? "sem entregador" : "sem fechamento"}</span>` : ""}</td>
            <td>${_fxEsc(l.responsavel)}</td><td>${_fxEsc(l.status)}</td><td>${_fxEsc(l.transportadora)}</td>
            <td>${_fxEsc(l.data)}</td><td>${_fxEsc(l.codigo)}</td>
            <td class="num cft-neg">${_fxNum(l.valor)}</td><td style="white-space:normal">${_fxEsc(l.causa)}</td>
        </tr>`).join("") : vazio(8);
}

/** Planilha com o que está na tela (filtro e busca): abas Por entregador e Linhas. */
function _fxAbas() {
    const { ent, lin } = _fxFiltrados();
    return [
        { nome: "Por entregador", linhas: [["Entregador", "Situação", "Extravios", "Multas", "Total", "Responsável (planilha)"]]
            .concat(ent.map(r => [r.entregador, _fxSituacao(r).t, r.extravios, r.multas, r.total, r.responsaveis.join(" · ")])) },
        { nome: "Linhas", linhas: [["Entregador", "Situação", "Responsável (planilha)", "Status", "Transportadora", "Data", "Código", "Valor", "Causa", "Data desconto", "Para desconto?"]]
            .concat(lin.map(l => [l.driver || "", { ok: "No fechamento", sem_fechamento: "Sem fechamento na quinzena", sem_conversao: "Responsável sem entregador" }[_fxSituacaoLinha(l)],
                l.responsavel, l.status, l.transportadora, l.data, l.codigo, l.valor, l.causa, l.data_desconto, l.para_desconto])) },
    ];
}

function _fxExportar() {
    const wb = XLSX.utils.book_new();
    for (const a of _fxAbas()) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.linhas), a.nome);
    XLSX.writeFile(wb, `extravios_${_fxDados.codigo_quinzena}_${_fxAno}${_fxFiltro ? "_" + _fxFiltro : ""}.xlsx`);
}

// ── Fonte: de qual planilha/aba vêm os extravios (vale aqui e no Resumo da Quinzena) ──
function _fxAbrirFonte() {
    const el = document.getElementById("fx-fonte");
    if (el.style.display !== "none") { el.style.display = "none"; return; }
    el.style.display = "";
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_FX_API()}/extravios-fonte`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(f => {
        el.innerHTML = `
            <div class="cft-pend-titulo" style="color:#e2e8f0">Fonte dos extravios</div>
            <div class="cft-ajuda" style="margin-bottom:8px">${f.planilha ? `Hoje: planilha <b style="color:#cbd5e1">${_fxEsc(f.planilha)}</b>, aba <b style="color:#cbd5e1">${_fxEsc(f.aba)}</b>.`
                : "Hoje: planilha de extravios do site (Extravios › Registrar)."}
                As colunas são achadas pelo nome: precisa ter <b>Data desconto</b>, <b>Responsavel</b> e <b>Valor</b>
                (Transportadora, Codigo, Endereço, Cidade e Status entram se tiver). A conta do servidor precisa ter acesso de Leitor na planilha.</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <input class="cft-input" id="fx-fonte-link" placeholder="Link da planilha do Google" value="${f.planilha ? "https://docs.google.com/spreadsheets/d/" + _fxEsc(f.planilha) : ""}"
                    style="min-width:420px;flex:1;margin:0" onchange="_fxCarregarAbas()">
                <select class="fech-select" id="fx-fonte-aba">${(f.abas || []).map(a => `<option${a === f.aba ? " selected" : ""}>${_fxEsc(a)}</option>`).join("")
                    || `<option value="">cole o link pra ver as abas</option>`}</select>
                <button class="cft-btn primario" onclick="_fxSalvarFonte()">Salvar</button>
                <span class="cft-ajuda" id="fx-fonte-status"></span>
            </div>`;
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar a fonte.</div>`; });
}

function _fxCarregarAbas() {
    const link = document.getElementById("fx-fonte-link").value;
    const st = document.getElementById("fx-fonte-status");
    const sel = document.getElementById("fx-fonte-aba");
    st.innerText = "Abrindo a planilha...";
    fetch(`${_FX_API()}/extravios-fonte?link=${encodeURIComponent(link)}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(f => {
        if (f.error) { st.innerText = f.error; return; }
        st.innerText = "";
        sel.innerHTML = (f.abas || []).map(a => `<option>${_fxEsc(a)}</option>`).join("");
    }).catch(() => { st.innerText = "Erro ao abrir a planilha."; });
}

async function _fxSalvarFonte() {
    const st = document.getElementById("fx-fonte-status");
    st.innerText = "Conferindo as colunas...";
    try {
        const r = await fetch(`${_FX_API()}/extravios-fonte`, { method: "PUT",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ link: document.getElementById("fx-fonte-link").value, aba: document.getElementById("fx-fonte-aba").value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
            st.innerText = (d.error || "Erro ao salvar.") + (d.cabecalho_encontrado && d.cabecalho_encontrado.length ? " Colunas da aba: " + d.cabecalho_encontrado.join(" · ") : "");
            return;
        }
        if (_fxQuinzena) _fxCarregar();
    } catch (_) { st.innerText = "Erro ao salvar."; }
}
