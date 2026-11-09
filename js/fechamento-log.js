// ───── FECHAMENTO › LOG DE VALORES (só dev) ─────
// O que mudou no valor de cada entregador na quinzena: antes → depois, a ação (relatório,
// recálculo, acréscimo, regra, repasse...), quem fez e quando. O servidor tira uma "foto"
// dos valores depois de cada ação e grava a diferença; a tela só lê.
// Backend: GET /admin/fechamento-transportadoras/log-valores (log-valores.js) — só dev.
const _LV_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let _lvDados = null;
let _lvReq = 0;

function _lvEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _lvNum(n, campo) {
    if (campo === "pacotes") return Number(n || 0).toLocaleString("pt-BR");
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _lvQuando(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function abrirLogValores(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-log-valores");
    const hoje = new Date();
    const q = hoje.getDate() <= 15 ? 1 : 2;
    document.getElementById("lv-conteudo").innerHTML = `
        <div class="cft-secao" style="margin-top:0">Log de valores dos entregadores</div>
        <div class="cft-ajuda" style="margin-bottom:14px">Cada mudança no valor de um entregador na quinzena: antes, depois, o que mudou e quem fez.
            Só você (dev) vê esta tela.</div>
        <div class="cft-barra" style="margin:0 0 12px;flex-wrap:wrap">
            <select class="fech-select" id="lv-q" onchange="_lvCarregar()">
                <option value="1"${q === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${q === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
            <select class="fech-select" id="lv-mes" onchange="_lvCarregar()">${_LV_MESES.map((m, i) =>
                `<option value="${i + 1}"${i === hoje.getMonth() ? " selected" : ""}>${m}</option>`).join("")}</select>
            <select class="fech-select" id="lv-ano" onchange="_lvCarregar()">${[hoje.getFullYear() - 1, hoje.getFullYear()].map(a =>
                `<option value="${a}"${a === hoje.getFullYear() ? " selected" : ""}>${a}</option>`).join("")}</select>
            <select class="fech-select" id="lv-ent" onchange="_lvDesenhar()"><option value="">Todos os entregadores</option></select>
            <label class="cft-ajuda" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="lv-todos" onchange="_lvDesenhar()"> todos os campos (não só o líquido)</label>
        </div>
        <div id="lv-lista"></div>`;
    _lvCarregar();
}

function _lvCarregar() {
    const v = (id) => parseInt(document.getElementById(id).value, 10);
    const per = { mes: v("lv-mes"), ano: v("lv-ano"), quinzena: v("lv-q") };
    const el = document.getElementById("lv-lista");
    el.innerHTML = `<div class="xm-carregando xm-carregando-p" role="status"><span>Carregando</span></div>`;
    const id = ++_lvReq;
    fetch(`${API}/admin/fechamento-transportadoras/log-valores?mes=${per.mes}&ano=${per.ano}&quinzena=${per.quinzena}`,
        { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (id !== _lvReq) return;
            if (!ok) { el.innerHTML = `<div class="cft-erro">${_lvEsc(d.error || "Erro ao carregar.")}</div>`; return; }
            _lvDados = d;
            const sel = document.getElementById("lv-ent");
            const atual = sel.value;
            const nomes = [...new Set(d.linhas.map(l => l.entregador))].sort((a, b) => a.localeCompare(b, "pt-BR"));
            sel.innerHTML = `<option value="">Todos os entregadores</option>` + nomes.map(n => `<option value="${_lvEsc(n)}"${n === atual ? " selected" : ""}>${_lvEsc(n)}</option>`).join("");
            _lvDesenhar();
        })
        .catch(() => { if (id === _lvReq) el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

/** Linhas a mostrar: filtro de entregador e, sem "todos os campos", só o líquido. */
function _lvFiltrar(d, entregador, todos) {
    return (d.linhas || []).filter(l => (!entregador || l.entregador === entregador) && (todos || l.campo === "liquido"));
}

function _lvDesenhar() {
    const el = document.getElementById("lv-lista");
    const d = _lvDados;
    if (!el || !d) return;
    const nomeCampo = Object.fromEntries(d.campos || []);
    const lista = _lvFiltrar(d, document.getElementById("lv-ent").value, document.getElementById("lv-todos").checked);
    const desde = d.desde ? `Registrando desde ${_lvQuando(d.desde)}.` : "";
    if (!lista.length) {
        el.innerHTML = `<div class="cft-ajuda">Nenhuma mudança registrada nesta quinzena${(d.linhas || []).length ? " com esse filtro" : ""}. ${desde}</div>`;
        return;
    }
    el.innerHTML = `<div class="cft-ajuda" style="margin-bottom:8px">${lista.length.toLocaleString("pt-BR")} mudança(s). ${desde}</div>
        <div class="cft-tabela-wrap" style="max-height:65vh;overflow-y:auto"><table class="cft-tabela">
        <thead><tr><th>Quando</th><th>Entregador</th><th>Campo</th><th style="text-align:right">Antes</th><th style="text-align:right">Depois</th>
            <th style="text-align:right">Diferença</th><th>O que mudou</th><th>Quem</th></tr></thead>
        <tbody>${lista.map(l => {
            const dif = Math.round((l.depois - l.antes) * 100) / 100;
            // Mais dinheiro pro entregador = verde; menos = vermelho (desconto/Ticketlog/extravio subir é menos dinheiro).
            const contra = ["descontos", "ticketlog", "extravios"].includes(l.campo);
            const cls = dif === 0 ? "" : ((dif > 0) !== contra ? "fs-pos" : "cft-neg");
            return `<tr><td style="white-space:nowrap">${_lvEsc(_lvQuando(l.em))}</td><td>${_lvEsc(l.entregador)}</td>
                <td>${_lvEsc(nomeCampo[l.campo] || l.campo)}</td>
                <td class="num">${_lvNum(l.antes, l.campo)}</td><td class="num">${_lvNum(l.depois, l.campo)}</td>
                <td class="num ${cls}">${dif > 0 ? "+" : ""}${_lvNum(dif, l.campo)}</td>
                <td style="white-space:normal">${_lvEsc(l.acao)}</td><td>${_lvEsc(l.usuario || "—")}</td></tr>`;
        }).join("")}</tbody></table></div>`;
}
