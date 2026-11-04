// Fechamento › Coletas: quantas coletas cada entregador fez na quinzena × o valor por coleta
// dele (cada um tem o seu; quem não tem vem com o padrão). Entra no Resumo da Quinzena como
// acréscimo "Coletas: N × R$ X".

const _CO_API = () => `${API}/admin/fechamento-transportadoras`;
const _CO_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
let _coDados = null;        // { linhas, valores, valor_padrao, total }
let _coEntregadores = null; // nomes pra escolher

function _coEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _coChave(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function _coR(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function _coHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _coPeriodo() {
    return { quinzena: +document.getElementById("co-q").value, mes: +document.getElementById("co-mes").value, ano: +document.getElementById("co-ano").value };
}

function abrirColetasFechamento(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-coletas-fechamento", "Fechamento/Coletas");
    document.getElementById("titulo-pagina").innerText = "Coletas";
    const d = new Date();
    const h = { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
    document.getElementById("co-conteudo").innerHTML = `
        <div class="cft-ajuda" style="margin-bottom:12px">Coletas da quinzena por entregador × o valor por coleta dele. Entra no Resumo da Quinzena
            como acréscimo. O valor fica guardado por entregador e já vem preenchido na próxima quinzena.</div>
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap;align-items:flex-end">
            <select class="fech-select" id="co-q" onchange="_coCarregar()">
                <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
            <select class="fech-select" id="co-mes" onchange="_coCarregar()">${_CO_MESES.map((m, i) =>
                `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
            <select class="fech-select" id="co-ano" onchange="_coCarregar()">${[h.ano - 1, h.ano, h.ano + 1].map(a =>
                `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
        </div>
        <div id="co-lista" style="margin-top:12px"></div>`;
    _coGarantirEntregadores().then(() => _coCarregar());
}

function _coGarantirEntregadores() {
    if (_coEntregadores) return Promise.resolve();
    return fetch(`${_CO_API()}/entregadores`, { headers: _coHeaders() }).then(r => r.json())
        .then(d => { _coEntregadores = d.nomes || []; }).catch(() => { _coEntregadores = []; });
}

function _coCarregar(msg) {
    const el = document.getElementById("co-lista");
    el.innerHTML = skLogo();
    const p = _coPeriodo();
    fetch(`${_CO_API()}/coletas?mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`, { headers: _coHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_coEsc(d.error)}</div>`; return; }
        _coDados = d;
        el.innerHTML = _coHtml(d, _coEntregadores || [], msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as coletas.</div>`; });
}

/** Valor por coleta que vem preenchido: o do entregador, senão o padrão. */
function _coValorDe(d, driver) {
    const v = (d.valores || []).find(x => _coChave(x.driver) === _coChave(driver));
    return v ? v.valor : d.valor_padrao;
}

function _coHtml(d, nomes, msg) {
    const linhas = d.linhas || [];
    return `
        <div class="cft-regras" style="margin:0 0 12px">
            <div class="cft-barra" style="margin:0;flex-wrap:wrap;align-items:flex-end">
                <label class="aj-campo" style="flex:1 1 260px"><span class="cft-rotulo">Entregador</span>
                    <select class="fech-select" id="co-driver" style="width:100%" onchange="_coEscolheu()">
                        <option value="">Escolha o entregador...</option>
                        ${nomes.map(n => `<option value="${_coEsc(n)}">${_coEsc(n)}</option>`).join("")}
                    </select></label>
                <label class="aj-campo"><span class="cft-rotulo">Coletas na quinzena</span>
                    <input class="cft-input" id="co-qtd" inputmode="numeric" style="width:120px;margin:0"></label>
                <label class="aj-campo"><span class="cft-rotulo">R$ por coleta</span>
                    <input class="cft-input" id="co-valor" inputmode="decimal" style="width:120px;margin:0"></label>
                <button class="cft-btn primario" id="co-salvar" onclick="_coSalvar()">Salvar</button>
            </div>
            <div class="cft-ajuda" id="co-status" style="margin-top:6px">${msg || ""}</div>
        </div>
        <div class="cft-tabela-wrap"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th>Coletas</th><th>R$ por coleta</th><th>Total</th><th></th></tr></thead>
            <tbody>${linhas.length ? linhas.map(l => `<tr>
                <td>${_coEsc(l.driver)}</td><td>${l.quantidade.toLocaleString("pt-BR")}</td><td>${_coR(l.valor)}</td><td class="cft-sim">${_coR(l.total)}</td>
                <td style="white-space:nowrap"><button class="cft-link" data-d="${_coEsc(l.driver)}" onclick="_coEditar(this.dataset.d)">Editar</button>
                    · <button class="cft-link" data-d="${_coEsc(l.driver)}" onclick="_coApagar(this.dataset.d)">Apagar</button></td>
            </tr>`).join("") : `<tr><td colspan="5" class="cft-vazio" style="padding:12px">Nenhuma coleta nesta quinzena.</td></tr>`}</tbody>
            ${linhas.length ? `<tfoot><tr><td><b>Total</b></td><td>${linhas.reduce((s, l) => s + l.quantidade, 0).toLocaleString("pt-BR")}</td><td></td><td><b>${_coR(d.total)}</b></td><td></td></tr></tfoot>` : ""}
        </table></div>
        <div class="cft-barra" style="margin-top:14px;flex-wrap:wrap;align-items:flex-end">
            <label class="aj-campo"><span class="cft-rotulo">Valor padrão por coleta (quem ainda não tem o seu)</span>
                <input class="cft-input" id="co-padrao" inputmode="decimal" style="width:120px;margin:0" value="${String(d.valor_padrao ?? "").replace(".", ",")}"></label>
            <button class="cft-btn" onclick="_coSalvarPadrao()">Salvar padrão</button>
        </div>`;
}

function _coEscolheu() {
    const driver = document.getElementById("co-driver").value;
    if (!driver || !_coDados) return;
    const l = (_coDados.linhas || []).find(x => _coChave(x.driver) === _coChave(driver));
    document.getElementById("co-qtd").value = l ? l.quantidade : "";
    document.getElementById("co-valor").value = String(l ? l.valor : _coValorDe(_coDados, driver) ?? "").replace(".", ",");
}

function _coEditar(driver) {
    const sel = document.getElementById("co-driver");
    if (![...sel.options].some(o => o.value === driver)) sel.insertAdjacentHTML("beforeend", `<option value="${_coEsc(driver)}">${_coEsc(driver)}</option>`);
    sel.value = driver;
    _coEscolheu();
    document.getElementById("co-qtd").focus();
}

async function _coEnviar(corpo, url, msgOk) {
    const st = document.getElementById("co-status");
    if (st) st.innerText = "Salvando...";
    try {
        const r = await fetch(url, { method: "PUT", headers: _coHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        _coCarregar(_coEsc(msgOk));
    } catch (err) { if (st) st.innerText = err.message; }
}

function _coSalvar() {
    const driver = document.getElementById("co-driver").value;
    if (!driver) { document.getElementById("co-status").innerText = "Escolha o entregador."; return; }
    const qtd = document.getElementById("co-qtd").value;
    _coEnviar({ ..._coPeriodo(), driver, quantidade: qtd, valor: document.getElementById("co-valor").value },
        `${_CO_API()}/coletas`, `${driver}: ${String(qtd).trim() && +qtd ? "coletas salvas" : "coletas apagadas"}.`);
}

function _coApagar(driver) {
    const l = (_coDados.linhas || []).find(x => x.driver === driver);
    _coEnviar({ ..._coPeriodo(), driver, quantidade: 0, valor: l ? l.valor : 0 }, `${_CO_API()}/coletas`, `${driver}: coletas apagadas.`);
}

function _coSalvarPadrao() {
    _coEnviar({ valor: document.getElementById("co-padrao").value }, `${_CO_API()}/coletas/padrao`, "Valor padrão salvo.");
}
