// Fechamento › Check List: tudo o que falta ou está divergente na quinzena escolhida — relatório
// não anexado, login sem conversão, pacote sem cidade, nome do Ticketlog/extravio sem conversão,
// extravio de quem não tem fechamento, entregador sem login no sistema —, cada grupo dizendo
// onde corrigir.

const _CK_API = () => `${API}/admin/fechamento-transportadoras/checklist`;
const _CK_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function _ckEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _ckPeriodo() {
    return { quinzena: +document.getElementById("ck-q").value, mes: +document.getElementById("ck-mes").value, ano: +document.getElementById("ck-ano").value };
}

function abrirChecklistFechamento(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-checklist-fechamento", "Fechamento/CheckList");
    document.getElementById("titulo-pagina").innerText = "Check List";
    const d = new Date();
    const h = { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
    document.getElementById("ck-conteudo").innerHTML = `
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap">
            <select class="fech-select" id="ck-q" onchange="_ckCarregar()">
                <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
            <select class="fech-select" id="ck-mes" onchange="_ckCarregar()">${_CK_MESES.map((m, i) =>
                `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
            <select class="fech-select" id="ck-ano" onchange="_ckCarregar()">${[h.ano - 1, h.ano, h.ano + 1].map(a =>
                `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
            <span style="flex:1"></span>
            <button class="cft-btn" onclick="_ckCarregar()">Atualizar</button>
        </div>
        <div id="ck-corpo" style="margin-top:12px"></div>`;
    _ckCarregar();
}

let _ckReq = 0;
function _ckCarregar() {
    const el = document.getElementById("ck-corpo");
    el.innerHTML = skLogo(false, "Conferindo a quinzena");
    const p = _ckPeriodo();
    const req = ++_ckReq;
    fetch(`${_CK_API()}?mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (req !== _ckReq) return;
        el.innerHTML = d.error ? `<div class="cft-erro">${_ckEsc(d.error)}</div>` : _ckHtml(d);
    }).catch(() => { if (req === _ckReq) el.innerHTML = `<div class="cft-erro">Erro ao conferir a quinzena.</div>`; });
}

const _ckCelula = (v) => typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : _ckEsc(v);

function _ckHtml(d) {
    const comItem = d.grupos.filter(g => g.itens.length), ok = d.grupos.filter(g => !g.itens.length);
    return `
        <div class="cft-ajuda" style="margin-bottom:10px">${d.pendencias
            ? `<b style="color:#fbbf24">${d.pendencias.toLocaleString("pt-BR")} pendência(s)</b> em ${comItem.length} grupo(s) na ${_ckEsc(d.codigo_quinzena)}.`
            : `<b class="cft-sim">Tudo certo</b> na ${_ckEsc(d.codigo_quinzena)}.`}</div>
        ${comItem.map(g => `<div class="cft-pend" style="margin-bottom:10px"><details>
            <summary style="cursor:pointer"><span class="cft-pend-titulo" style="display:inline">${_ckEsc(g.titulo)}</span>
                <span class="cft-ajuda"> · ${g.itens.length.toLocaleString("pt-BR")} · onde corrigir: ${_ckEsc(g.onde)}</span></summary>
            <div class="cft-tabela-wrap" style="margin-top:8px;max-height:360px;overflow-y:auto"><table class="cft-tabela">
                <thead><tr>${g.colunas.map(c => `<th>${_ckEsc(c)}</th>`).join("")}</tr></thead>
                <tbody>${g.itens.map(i => `<tr>${i.map(v => `<td>${_ckCelula(v)}</td>`).join("")}</tr>`).join("")}</tbody>
            </table></div></details></div>`).join("")}
        ${ok.length ? `<div class="cft-ajuda" style="margin-top:12px">Sem pendência: ${ok.map(g => _ckEsc(g.titulo)).join(" · ")}.</div>` : ""}`;
}
