// Fechamento › Terceirizada Videira: a Terceirizada - Expedição Videira recebe R$ X por pacote
// (padrão 0,48) de todo pacote da quinzena nas cidades dela — todas as transportadoras, o
// Jadlog pela cidade do entregador —, menos os extravios em nome dela. Valor e cidades
// editáveis aqui mesmo.

const _TV_API = () => `${API}/admin/fechamento-transportadoras/terceirizada-videira`;
const _TV_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let _tvDados = null;

function _tvEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _tvR(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function _tvChave(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function _tvHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _tvPeriodo() {
    return { quinzena: +document.getElementById("tv-q").value, mes: +document.getElementById("tv-mes").value, ano: +document.getElementById("tv-ano").value };
}

function abrirTerceirizadaVideira(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-terceirizada-videira", "Fechamento/TerceirizadaVideira");
    document.getElementById("titulo-pagina").innerText = "Terceirizada Videira";
    const d = new Date();
    const h = { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
    document.getElementById("tv-conteudo").innerHTML = `
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap;align-items:flex-end">
            <select class="fech-select" id="tv-q" onchange="_tvCarregar()">
                <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
            <select class="fech-select" id="tv-mes" onchange="_tvCarregar()">${_TV_MESES.map((m, i) =>
                `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
            <select class="fech-select" id="tv-ano" onchange="_tvCarregar()">${[h.ano - 1, h.ano, h.ano + 1].map(a =>
                `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
            <span style="flex:1"></span>
            <a href="#" class="fs-fechar" onclick="event.preventDefault();_tvBaixar()">Baixar planilha</a>
        </div>
        <div id="tv-corpo" style="margin-top:12px"></div>`;
    _tvCarregar();
}

function _tvCarregar(msg) {
    const el = document.getElementById("tv-corpo");
    el.innerHTML = skLogo();
    const p = _tvPeriodo();
    fetch(`${_TV_API()}?mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`, { headers: _tvHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_tvEsc(d.error)}</div>`; return; }
        _tvDados = d;
        el.innerHTML = _tvHtml(d, msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

/** Transportadoras que aparecem nas cidades dela, na ordem de quantidade. */
function _tvTransportadoras(d) {
    return Object.entries(d.por_transportadora || {}).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

function _tvHtml(d, msg) {
    const transps = _tvTransportadoras(d);
    const kpi = (v, rot, cls) => `<div class="cft-kpi"><div class="cft-kpi-valor${cls ? " " + cls : ""}">${v}</div><div class="cft-kpi-rotulo">${rot}</div></div>`;
    const todasCidades = [...new Set(d.regra.cidades.concat(d.cidades_quinzena || []))];
    const marcadas = new Set(d.regra.cidades.map(_tvChave));
    const pub = d.publicado_em ? new Date(d.publicado_em).toLocaleString("pt-BR") : null;
    return `
        <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap">
            <span class="cft-ajuda">${pub ? `<span class="cft-sim">Liberado</span> em ${pub} — a terceirizada vê na tela Fechamento Videira.`
                : "Ainda não liberado: a terceirizada não vê esta quinzena."}</span>
            <button class="cft-btn${pub ? " perigo" : " primario"}" onclick="_tvLiberar(${pub ? "false" : "true"}, this)">${pub ? "Tirar a liberação" : "Liberar fechamento"}</button>
        </div>
        <div class="cft-ajuda" style="margin-bottom:10px">${_tvEsc(d.nome)}: ${_tvR(d.valor_pacote)} por pacote de todas as transportadoras nas cidades abaixo
            (entregue ou não; o Jadlog pela cidade do entregador), mais as coletas dela (Fechamento › Coletas), menos os extravios em nome dela.</div>
        <div class="cft-kpis">
            ${kpi(d.pacotes.toLocaleString("pt-BR"), "pacotes")}
            ${kpi(_tvR(d.bruto), "bruto")}
            ${d.coletas && d.coletas.quantidade ? kpi(_tvR(d.coletas.total), `coletas (${d.coletas.quantidade} × ${_tvR(d.coletas.valor)})`) : ""}
            ${kpi(_tvR(d.extravios), `extravios (${(d.extravios_linhas || []).length})`, d.extravios ? "cft-nao" : "")}
            ${d.acrescimos || d.descontos ? kpi(_tvR(d.acrescimos - d.descontos), "acréscimos − descontos") : ""}
            ${kpi(_tvR(d.liquido), "líquido", "cft-sim")}
        </div>
        ${d.extravios_erro ? `<div class="cft-ajuda" style="color:#f59e0b">Não consegui ler a planilha de extravios: ${_tvEsc(d.extravios_erro)}</div>` : ""}
        <div class="cft-tabela-wrap" style="margin-top:12px"><table class="cft-tabela">
            <thead><tr><th>Cidade</th>${transps.map(t => `<th>${_tvEsc(t)}</th>`).join("")}<th>Pacotes</th><th>Valor</th></tr></thead>
            <tbody>${d.cidades.map(c => `<tr>
                <td>${_tvEsc(c.cidade)}</td>${transps.map(t => `<td>${(c.por_transportadora[t] || 0).toLocaleString("pt-BR")}</td>`).join("")}
                <td><b>${c.pacotes.toLocaleString("pt-BR")}</b></td><td>${_tvR(c.valor)}</td></tr>`).join("")}</tbody>
            <tfoot><tr><td><b>Total</b></td>${transps.map(t => `<td><b>${(d.por_transportadora[t] || 0).toLocaleString("pt-BR")}</b></td>`).join("")}
                <td><b>${d.pacotes.toLocaleString("pt-BR")}</b></td><td><b>${_tvR(d.bruto)}</b></td></tr></tfoot>
        </table></div>
        ${(d.extravios_linhas || []).length ? `<div class="cft-secao">Extravios em nome dela</div>
            <div class="cft-tabela-wrap"><table class="cft-tabela"><thead><tr><th>Data</th><th>Transportadora</th><th>Código</th><th>Status</th><th>Valor</th></tr></thead>
            <tbody>${d.extravios_linhas.map(e => `<tr><td>${_tvEsc(e.data || "")}</td><td>${_tvEsc(e.transportadora || "")}</td><td>${_tvEsc(e.codigo || "")}</td>
                <td>${_tvEsc(e.status || "")}</td><td class="cft-nao">${_tvR(e.valor)}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${(d.ajustes_linhas || []).length ? `<div class="cft-secao">Acréscimos e descontos</div>
            <div class="cft-tabela-wrap"><table class="cft-tabela"><thead><tr><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead>
            <tbody>${d.ajustes_linhas.map(a => `<tr><td>${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"}</td><td>${_tvEsc(a.descricao || "")}</td>
                <td class="${a.tipo === "acrescimo" ? "cft-sim" : "cft-nao"}">${_tvR(a.valor)}</td></tr>`).join("")}</tbody></table></div>` : ""}
        <div class="cft-secao">Regra</div>
        <div class="cft-regras" style="margin:0">
            <div class="cft-barra" style="margin:0;flex-wrap:wrap;align-items:flex-end">
                <label class="aj-campo"><span class="cft-rotulo">R$ por pacote</span>
                    <input class="cft-input" id="tv-valor" inputmode="decimal" style="width:110px;margin:0" value="${String(d.regra.valor).replace(".", ",")}"></label>
            </div>
            <div class="cft-rotulo" style="margin-top:10px">Cidades dela</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px 16px;margin:6px 0 10px">${todasCidades.map(c => `<label class="cft-ajuda" style="display:flex;gap:6px;align-items:center;cursor:pointer;color:#cbd5e1">
                <input type="checkbox" class="tv-cidade" value="${_tvEsc(c)}"${marcadas.has(_tvChave(c)) ? " checked" : ""}> ${_tvEsc(c)}</label>`).join("")}</div>
            <button class="cft-btn" onclick="_tvSalvarRegra(this)">Salvar regra</button>
            <span class="cft-ajuda" id="tv-status" style="margin-left:8px">${msg || ""}</span>
        </div>`;
}

async function _tvLiberar(publicar, btn) {
    btn.disabled = true;
    try {
        const r = await fetch(`${_TV_API()}/publicacao`, { method: "PUT", headers: _tvHeaders(true), body: JSON.stringify({ ..._tvPeriodo(), publicar }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao liberar.");
        _tvCarregar(publicar ? "Fechamento liberado." : "Liberação retirada.");
    } catch (err) { gcAlert(err.message); btn.disabled = false; }
}

async function _tvSalvarRegra(btn) {
    const st = document.getElementById("tv-status");
    btn.disabled = true;
    try {
        const cidades = [...document.querySelectorAll(".tv-cidade:checked")].map(c => c.value);
        const r = await fetch(`${_TV_API()}/regra`, { method: "PUT", headers: _tvHeaders(true),
            body: JSON.stringify({ valor: document.getElementById("tv-valor").value, cidades }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        _tvCarregar("Regra salva.");
    } catch (err) {
        st.innerText = err.message;
        btn.disabled = false;
    }
}

/** Planilha: cidades × transportadoras, extravios e o resumo. */
function _tvAbas(d) {
    const transps = _tvTransportadoras(d);
    const abas = [{ nome: "Cidades", linhas: [["Cidade"].concat(transps, ["Pacotes", "Valor"])]
        .concat(d.cidades.map(c => [c.cidade].concat(transps.map(t => c.por_transportadora[t] || 0), [c.pacotes, c.valor]))) }];
    if ((d.extravios_linhas || []).length) abas.push({ nome: "Extravios", linhas: [["Data", "Transportadora", "Código", "Status", "Valor", "Causa"]]
        .concat(d.extravios_linhas.map(e => [e.data || "", e.transportadora || "", e.codigo || "", e.status || "", e.valor || 0, e.causa || ""])) });
    abas.push({ nome: "Resumo", linhas: [["Item", "Valor"], ["R$ por pacote", d.valor_pacote], ["Pacotes", d.pacotes], ["Bruto", d.bruto],
        ["Coletas", (d.coletas && d.coletas.quantidade) || 0], ["Valor das coletas", (d.coletas && d.coletas.total) || 0],
        ["Extravios", d.extravios], ["Acréscimos", d.acrescimos], ["Descontos", d.descontos], ["Líquido", d.liquido]] });
    return abas;
}

function _tvBaixar() {
    if (!_tvDados) return;
    const p = _tvPeriodo();
    const wb = XLSX.utils.book_new();
    for (const a of _tvAbas(_tvDados)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.linhas), a.nome);
    XLSX.writeFile(wb, `terceirizada_videira_Q${p.quinzena}_${String(p.mes).padStart(2, "0")}_${p.ano}.xlsx`);
}
