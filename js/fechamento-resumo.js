// ───── FECHAMENTO › RESUMO DA QUINZENA ─────
// Uma linha por entregador: valor de cada transportadora (já com a performance
// consolidada da Shopee), bruto, desconto do Ticketlog e líquido. Lê o que foi gravado no
// Criar Fechamento — nada é calculado aqui. Backend: GET /resumo-quinzena
// (modules/fechamento-transportadoras/resumo-quinzena.js).
const _RQ_API = () => `${API}/admin/fechamento-transportadoras`;
let _rqMes = new Date().getMonth() + 1;
let _rqAno = new Date().getFullYear();
let _rqQuinzena = null;
let _rqDados = null;
let _rqOrdem = { campo: "entregador", desc: false };
let _rqReq = 0;

function _rqEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _rqNum(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _rqChave(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function abrirResumoQuinzena(event) {
    if (event) event.preventDefault();
    const selAno = document.getElementById("rq-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const o = document.createElement("option");
        o.value = a; o.textContent = a;
        if (a === _rqAno) o.selected = true;
        selAno.appendChild(o);
    }
    document.getElementById("rq-mes").value = _rqMes;
    mostrarTela("tela-resumo-quinzena");
    if (_rqQuinzena) _rqCarregar();
}

function _rqPeriodoMudou() {
    _rqMes = parseInt(document.getElementById("rq-mes").value);
    _rqAno = parseInt(document.getElementById("rq-ano").value);
    if (_rqQuinzena) _rqCarregar();
}

function _rqSelecionarQuinzena(q) {
    _rqQuinzena = q;
    document.getElementById("rq-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("rq-btn-2q").classList.toggle("active", q === 2);
    _rqCarregar();
}

function _rqCarregar() {
    const el = document.getElementById("rq-conteudo");
    const req = ++_rqReq;
    el.innerHTML = `<div class="fechamento-empty">Carregando...</div>`;
    fetch(`${_RQ_API()}/resumo-quinzena?mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (req !== _rqReq) return;
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_rqEsc(d.error)}</div>`; return; }
        _rqDados = d;
        _rqRender();
    }).catch(() => { if (req === _rqReq) el.innerHTML = `<div class="cft-erro">Erro ao carregar o resumo.</div>`; });
}

// Colunas de transportadora: só as que têm relatório na quinzena.
function _rqColunas() {
    return Object.entries(_rqDados.transportadoras).filter(([, t]) => t.enviado).map(([k, t]) => ({ chave: k, nome: t.nome }));
}

function _rqRender() {
    const d = _rqDados;
    const el = document.getElementById("rq-conteudo");
    const t = d.totais;
    const polos = [...new Set(d.linhas.map(l => l.polo).filter(Boolean))].sort();
    const faltam = Object.values(d.transportadoras).filter(x => !x.enviado).map(x => x.nome);
    const transp = Object.values(d.transportadoras).filter(x => x.enviado).map(x =>
        `<div class="cft-kpi"><div class="cft-kpi-valor">${_rqNum(x.valor)}</div>
            <div class="cft-kpi-rotulo">${_rqEsc(x.nome)} · ${x.pacotes.toLocaleString("pt-BR")} pacotes</div></div>`).join("");
    el.innerHTML = `
        <div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor">${t.entregadores.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Entregadores</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${t.pacotes.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Pacotes</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${_rqNum(t.bruto)}</div><div class="cft-kpi-rotulo">Bruto (R$)</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor${t.ticketlog ? " cft-neg" : ""}">${_rqNum(t.ticketlog)}</div><div class="cft-kpi-rotulo">Ticketlog (R$)</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor cft-pos">${_rqNum(t.liquido)}</div><div class="cft-kpi-rotulo">Líquido (R$)</div></div>
        </div>
        ${transp ? `<div class="cft-pend-titulo" style="color:#e2e8f0">Por transportadora</div><div class="cft-kpis">${transp}</div>` : ""}
        ${faltam.length ? `<div class="cft-ajuda" style="margin-bottom:6px">Sem relatório nesta quinzena: ${_rqEsc(faltam.join(", "))}.</div>` : ""}
        ${t.sem_conversao.linhas ? `<div class="cft-ajuda" style="margin-bottom:6px"><span class="cft-aviso">${t.sem_conversao.linhas} usuário(s) sem conversão de nome</span>
            (R$ ${_rqNum(t.sem_conversao.valor)}) — aparecem no fim da lista; converta no Criar Fechamento.</div>` : ""}
        ${t.ticketlog_sem_nome ? `<div class="cft-ajuda" style="margin-bottom:6px"><span class="cft-aviso">R$ ${_rqNum(t.ticketlog_sem_nome)} de Ticketlog sem entregador</span> — confira em Descontos: Ticketlog.</div>` : ""}
        ${!d.ticketlog_arquivos ? `<div class="cft-ajuda" style="margin-bottom:6px">Nenhum relatório do Ticketlog nesta quinzena.</div>` : ""}

        <div class="cft-barra" style="justify-content:space-between">
            <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <div class="adm-search-input-area" style="max-width:260px;margin:0">
                    <input type="text" id="rq-busca" placeholder="Entregador..." oninput="_rqRenderTabela()">
                </div>
                <select class="fech-select" id="rq-polo" onchange="_rqRenderTabela()">
                    <option value="">Todos os polos</option>${polos.map(p => `<option>${_rqEsc(p)}</option>`).join("")}
                </select>
            </span>
            <button class="cft-btn" onclick="_rqExportar()">Exportar planilha</button>
        </div>
        <div class="cft-tabela-wrap" style="max-height:620px;overflow-y:auto"><table class="cft-tabela">
            <thead id="rq-thead"></thead><tbody id="rq-tbody"></tbody><tfoot id="rq-tfoot"></tfoot>
        </table></div>
        <div class="cft-ajuda" style="margin-top:6px">Valor de cada transportadora = soma do "Valor motorista" dos pacotes (Shopee já pela performance consolidada).
            Líquido = bruto − Ticketlog. Clique no título da coluna pra ordenar.</div>`;
    _rqRenderTabela();
}

function _rqFiltradas() {
    const busca = _rqChave((document.getElementById("rq-busca") || {}).value);
    const polo = (document.getElementById("rq-polo") || {}).value || "";
    const lista = _rqDados.linhas.filter(l => (!busca || _rqChave(l.entregador).includes(busca)) && (!polo || l.polo === polo));
    const { campo, desc } = _rqOrdem;
    const val = (l) => campo.startsWith("t:") ? ((l.por_transp[campo.slice(2)] || {}).valor || 0) : l[campo];
    return lista.slice().sort((a, b) => {
        if (a.sem_conversao !== b.sem_conversao) return a.sem_conversao ? 1 : -1; // sem conversão sempre no fim
        const x = val(a), y = val(b);
        const c = typeof x === "number" || typeof y === "number" ? (x || 0) - (y || 0) : String(x || "").localeCompare(String(y || ""), "pt-BR");
        return desc ? -c : c;
    });
}

function _rqOrdenar(campo) {
    _rqOrdem = { campo, desc: _rqOrdem.campo === campo ? !_rqOrdem.desc : campo !== "entregador" && campo !== "polo" };
    _rqRenderTabela();
}

function _rqRenderTabela() {
    const cols = _rqColunas();
    const seta = (c) => _rqOrdem.campo === c ? (_rqOrdem.desc ? " ↓" : " ↑") : "";
    const th = (c, rot, num) => `<th${num ? ` style="text-align:right"` : ""}><a href="#" class="cft-ordem" onclick="event.preventDefault();_rqOrdenar('${c}')">${rot}${seta(c)}</a></th>`;
    document.getElementById("rq-thead").innerHTML = `<tr>${th("entregador", "Entregador")}${th("polo", "Polo")}
        ${cols.map(c => th("t:" + c.chave, _rqEsc(c.nome), true)).join("")}
        ${th("pacotes", "Pacotes", true)}${th("bruto", "Bruto", true)}${th("ticketlog", "Ticketlog", true)}${th("liquido", "Líquido", true)}</tr>`;
    const lista = _rqFiltradas();
    document.getElementById("rq-tbody").innerHTML = lista.length ? lista.map(l => `<tr>
            <td>${_rqEsc(l.entregador)}${l.sem_conversao ? ` <span class="cft-aviso" title="Usuário sem conversão de nome">sem conversão</span>` : ""}</td>
            <td>${l.polo ? _rqEsc(l.polo) : `<span class="cft-vazio">—</span>`}</td>
            ${cols.map(c => { const v = l.por_transp[c.chave];
                return v ? `<td class="num" title="${v.pacotes} pacote(s)">${_rqNum(v.valor)}</td>` : `<td class="num cft-vazio">—</td>`; }).join("")}
            <td class="num">${l.pacotes.toLocaleString("pt-BR")}</td>
            <td class="num">${_rqNum(l.bruto)}</td>
            <td class="num${l.ticketlog ? " cft-neg" : ""}"${l.ticketlog_divergencias ? ` title="${l.ticketlog_divergencias} abastecimento(s) com divergência de cartão/matrícula"` : ""}>${l.ticketlog ? _rqNum(l.ticketlog) : `<span class="cft-vazio">—</span>`}</td>
            <td class="num ${l.liquido < 0 ? "cft-neg" : "cft-pos"}"><strong>${_rqNum(l.liquido)}</strong></td>
        </tr>`).join("")
        : `<tr><td colspan="${cols.length + 6}" class="cft-vazio" style="padding:14px">${_rqDados.linhas.length ? "Nada com esse filtro." : "Nenhum relatório nesta quinzena ainda."}</td></tr>`;
    const soma = (f) => lista.reduce((s, l) => s + f(l), 0);
    document.getElementById("rq-tfoot").innerHTML = lista.length ? `<tr>
            <td><strong>Total</strong> <span class="cft-ajuda">${lista.length} linha(s)</span></td><td></td>
            ${cols.map(c => `<td class="num"><strong>${_rqNum(soma(l => (l.por_transp[c.chave] || {}).valor || 0))}</strong></td>`).join("")}
            <td class="num"><strong>${soma(l => l.pacotes).toLocaleString("pt-BR")}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.bruto))}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.ticketlog))}</strong></td>
            <td class="num cft-pos"><strong>${_rqNum(soma(l => l.liquido))}</strong></td>
        </tr>` : "";
}

// Planilha com o que está na tela (respeita busca e polo).
function _rqLinhasExportar() {
    const cols = _rqColunas();
    return _rqFiltradas().map(l => {
        const o = { Entregador: l.entregador + (l.sem_conversao ? " (sem conversão)" : ""), Polo: l.polo || "" };
        for (const c of cols) {
            o[c.nome + " (pacotes)"] = (l.por_transp[c.chave] || {}).pacotes || 0;
            o[c.nome + " (R$)"] = (l.por_transp[c.chave] || {}).valor || 0;
        }
        return Object.assign(o, { Pacotes: l.pacotes, Bruto: l.bruto, Ticketlog: l.ticketlog, "Líquido": l.liquido });
    });
}

function _rqExportar() {
    const ws = XLSX.utils.json_to_sheet(_rqLinhasExportar());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumo");
    XLSX.writeFile(wb, `resumo_quinzena_${_rqQuinzena}q_${String(_rqMes).padStart(2, "0")}_${_rqAno}.xlsx`);
}
