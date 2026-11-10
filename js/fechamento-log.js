// ───── FECHAMENTO › LOG DE VALORES (só dev) ─────
// O que mudou no valor de cada entregador na quinzena: antes → depois, a ação (relatório,
// recálculo, acréscimo, regra, repasse...), quem fez e quando. O servidor tira uma "foto"
// dos valores depois de cada ação e grava a diferença; a tela só lê.
// Backend: GET /admin/fechamento-transportadoras/log-valores (log-valores.js) — só dev.
const _LV_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let _lvDados = null;
let _lvReq = 0;
let _lvAba = "valores";   // "valores" | "extravios"
let _lvExt = null;        // GET .../extravios-log da quinzena
let _lvReqExt = 0;

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
            Na aba Extravios, cada extravio ou multa que entrou, saiu ou mudou na quinzena. Só você (dev) vê esta tela.</div>
        <div class="cft-barra" style="margin:0 0 10px;gap:8px" id="lv-abas"></div>
        <div class="cft-barra" style="margin:0 0 12px;flex-wrap:wrap">
            <select class="fech-select" id="lv-q" onchange="_lvCarregar()">
                <option value="1"${q === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${q === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
            <select class="fech-select" id="lv-mes" onchange="_lvCarregar()">${_LV_MESES.map((m, i) =>
                `<option value="${i + 1}"${i === hoje.getMonth() ? " selected" : ""}>${m}</option>`).join("")}</select>
            <select class="fech-select" id="lv-ano" onchange="_lvCarregar()">${[hoje.getFullYear() - 1, hoje.getFullYear()].map(a =>
                `<option value="${a}"${a === hoje.getFullYear() ? " selected" : ""}>${a}</option>`).join("")}</select>
            <select class="fech-select" id="lv-ent" onchange="_lvDesenhar()"><option value="">Todos os entregadores</option></select>
            <label class="cft-ajuda" id="lv-todos-rot" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="lv-todos" onchange="_lvDesenhar()"> todos os campos (não só o líquido)</label>
        </div>
        <div id="lv-lista"></div>`;
    _lvCarregar();
}

function _lvTrocarAba(aba) {
    _lvAba = aba;
    _lvDesenhar();
}

function _lvCarregar() {
    const v = (id) => parseInt(document.getElementById(id).value, 10);
    const per = { mes: v("lv-mes"), ano: v("lv-ano"), quinzena: v("lv-q") };
    _lvCarregarExt(per);
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
            const nomes = [...new Set(d.linhas.map(l => l.entregador).concat(((_lvExt || {}).linhas || []).map(l => l.entregador).filter(Boolean)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
            sel.innerHTML = `<option value="">Todos os entregadores</option>` + nomes.map(n => `<option value="${_lvEsc(n)}"${n === atual ? " selected" : ""}>${_lvEsc(n)}</option>`).join("");
            _lvDesenhar();
        })
        .catch(() => { if (id === _lvReq) el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

function _lvCarregarExt(per) {
    _lvExt = null;
    const id = ++_lvReqExt;
    fetch(`${API}/admin/fechamento-transportadoras/extravios-log?mes=${per.mes}&ano=${per.ano}&quinzena=${per.quinzena}`,
        { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (id !== _lvReqExt) return;
            _lvExt = ok ? d : { erro: d.error || "Erro ao carregar." };
            if (_lvAba === "extravios") _lvDesenhar();
        })
        .catch(() => { if (id === _lvReqExt) { _lvExt = { erro: "Erro ao carregar." }; if (_lvAba === "extravios") _lvDesenhar(); } });
}

/** Linhas a mostrar: filtro de entregador e, sem "todos os campos", só o líquido. */
function _lvFiltrar(d, entregador, todos) {
    return (d.linhas || []).filter(l => (!entregador || l.entregador === entregador) && (todos || l.campo === "liquido"));
}

function _lvDesenhar() {
    const el = document.getElementById("lv-lista");
    const abas = document.getElementById("lv-abas");
    if (abas) abas.innerHTML = [["valores", "Valores"], ["extravios", "Extravios"]].map(([k, rot]) =>
        `<button class="cft-chip${_lvAba === k ? " on" : ""}" onclick="_lvTrocarAba('${k}')">${rot}</button>`).join("");
    const todosRot = document.getElementById("lv-todos-rot");
    if (todosRot) todosRot.style.display = _lvAba === "extravios" ? "none" : "flex";
    if (_lvAba === "extravios") return _lvDesenharExt(el);
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

const _LV_TIPO_EXT = { entrou: ["Entrou", "cft-neg"], saiu: ["Saiu", "fs-pos"], mudou: ["Mudou", "cft-aviso"] };

/** Aba Extravios: o que entrou, saiu ou mudou nos extravios da quinzena. Entrar = desconto pro entregador (vermelho). */
function _lvDesenharExt(el) {
    if (!el) return;
    const d = _lvExt;
    if (!d) { el.innerHTML = `<div class="xm-carregando xm-carregando-p" role="status"><span>Carregando</span></div>`; return; }
    if (d.erro) { el.innerHTML = `<div class="cft-erro">${_lvEsc(d.erro)}</div>`; return; }
    const ent = (document.getElementById("lv-ent") || {}).value || "";
    const lista = (d.linhas || []).filter(l => !ent || l.entregador === ent);
    const rot = d.rotulos || {};
    const conf = d.conferido_em ? `Planilha conferida às ${_lvEsc(_lvQuando(d.conferido_em))}.` : "";
    if (!lista.length) {
        el.innerHTML = `<div class="cft-ajuda">Nenhum extravio entrou, saiu ou mudou nesta quinzena${(d.linhas || []).length ? " com esse filtro" : ""}. ${conf}</div>`;
        return;
    }
    const valor = (v) => v == null ? "—" : _lvNum(v, "valor");
    el.innerHTML = `<div class="cft-ajuda" style="margin-bottom:8px">${lista.length.toLocaleString("pt-BR")} mudança(s). ${conf}</div>
        <div class="cft-tabela-wrap" style="max-height:65vh;overflow-y:auto"><table class="cft-tabela">
        <thead><tr><th>Quando</th><th>Entregador</th><th>O que houve</th><th>Código</th><th>Status</th><th>Transportadora</th>
            <th style="text-align:right">Valor antes</th><th style="text-align:right">Valor depois</th><th>Detalhe</th></tr></thead>
        <tbody>${lista.map(l => {
            const [nome, cls] = _LV_TIPO_EXT[l.tipo] || [l.tipo, ""];
            const det = (l.campos || []).map(c => `${rot[c.campo] || c.campo}: ${c.antes === "" ? "(vazio)" : c.antes} → ${c.depois === "" ? "(vazio)" : c.depois}`).join("; ");
            return `<tr><td style="white-space:nowrap">${_lvEsc(_lvQuando(l.em))}</td><td>${_lvEsc(l.entregador || l.responsavel || "—")}</td>
                <td class="${cls}">${_lvEsc(nome)}</td><td>${_lvEsc(l.codigo || "—")}</td><td>${_lvEsc(l.status || "")}</td><td>${_lvEsc(l.transportadora || "")}</td>
                <td class="num">${valor(l.valor_antes)}</td><td class="num">${valor(l.valor_depois)}</td>
                <td style="white-space:normal">${_lvEsc(det)}</td></tr>`;
        }).join("")}</tbody></table></div>`;
}
