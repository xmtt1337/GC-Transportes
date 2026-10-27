// ───── FECHAMENTO › DESLOCAMENTOS ─────
// Valor a mais pelo caminho até a rota: cada entregador cadastrado tem km por dia em estrada
// de asfalto e em estrada de chão; o valor do km de cada tipo é ajustado aqui.
//   deslocamento da quinzena = dias com entrega × (km asfalto × R$/km + km chão × R$/km)
// Entra no Resumo da Quinzena (soma no líquido). Backend: /deslocamentos
// (modules/fechamento-transportadoras/deslocamentos.js).
const _DS_API = () => `${API}/admin/fechamento-transportadoras`;
const _DS_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let _dsLinhas = [];
let _dsEntregadores = null;

function _dsEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _dsNum(n, casas = 2) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function _dsHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _dsPeriodo() {
    const v = (id) => parseInt(document.getElementById(id).value, 10);
    return { mes: v("ds-mes"), ano: v("ds-ano"), quinzena: v("ds-q") };
}

function abrirDeslocamentos(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-deslocamentos");
    const d = new Date();
    const h = { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
    document.getElementById("ds-conteudo").innerHTML = `
        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Valor por km</div>
            <div class="cft-ajuda" style="margin-bottom:8px">Deslocamento da quinzena = dias em que o entregador entregou (baixou pacote, em qualquer transportadora)
                × (km de asfalto × R$/km asfalto + km de chão × R$/km chão).</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <label class="cft-rotulo" for="ds-v-asfalto">Asfalto (R$/km)</label>
                <input class="cft-input" id="ds-v-asfalto" inputmode="decimal" style="width:100px;flex:0 0 auto;margin:0">
                <label class="cft-rotulo" for="ds-v-chao">Chão (R$/km)</label>
                <input class="cft-input" id="ds-v-chao" inputmode="decimal" style="width:100px;flex:0 0 auto;margin:0">
                <button class="cft-btn primario" onclick="_dsSalvarValores()">Salvar valores</button>
                <span class="cft-ajuda" id="ds-v-status"></span>
            </div>
        </div>
        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Entregadores com deslocamento</div>
            <datalist id="ds-entregadores"></datalist>
            <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap">
                <input class="cft-input" id="ds-driver" list="ds-entregadores" placeholder="Entregador..." style="width:300px;flex:0 0 auto;margin:0" onfocus="_dsGarantirEntregadores()">
                <input class="cft-input" id="ds-km-asfalto" inputmode="decimal" placeholder="Km asfalto / dia" style="width:140px;flex:0 0 auto;margin:0">
                <input class="cft-input" id="ds-km-chao" inputmode="decimal" placeholder="Km chão / dia" style="width:130px;flex:0 0 auto;margin:0">
                <input class="cft-input" id="ds-obs" placeholder="Observação (opcional)" maxlength="300" style="min-width:200px;flex:1;margin:0">
                <button class="cft-btn primario" onclick="_dsSalvar()">Adicionar / atualizar</button>
                <span class="cft-ajuda" id="ds-status"></span>
            </div>
            <div class="cft-barra" style="margin:0 0 8px;flex-wrap:wrap">
                <span class="cft-rotulo">Calcular na quinzena</span>
                <select class="fech-select" id="ds-q" onchange="_dsCarregar()">
                    <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
                <select class="fech-select" id="ds-mes" onchange="_dsCarregar()">${_DS_MESES.map((m, i) =>
                    `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
                <select class="fech-select" id="ds-ano" onchange="_dsCarregar()">${[h.ano - 1, h.ano].map(a =>
                    `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
            </div>
            <div id="ds-lista"></div>
        </div>`;
    _dsGarantirEntregadores();
    _dsCarregar();
}

function _dsGarantirEntregadores() {
    const pintar = () => {
        const dl = document.getElementById("ds-entregadores");
        if (dl) dl.innerHTML = (_dsEntregadores || []).map(n => `<option value="${_dsEsc(n)}">`).join("");
    };
    if (_dsEntregadores) { pintar(); return; }
    fetch(`${_DS_API()}/entregadores`, { headers: _dsHeaders() }).then(r => r.json())
        .then(d => { _dsEntregadores = d.nomes || []; pintar(); }).catch(() => {});
}

function _dsCarregar(msg) {
    const p = _dsPeriodo();
    const el = document.getElementById("ds-lista");
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_DS_API()}/deslocamentos?mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`, { headers: _dsHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_dsEsc(d.error)}</div>`; return; }
        _dsLinhas = d.linhas || [];
        const v = d.valores || {};
        const ia = document.getElementById("ds-v-asfalto"), ic = document.getElementById("ds-v-chao");
        if (document.activeElement !== ia) ia.value = String(v.asfalto || 0).replace(".", ",");
        if (document.activeElement !== ic) ic.value = String(v.chao || 0).replace(".", ",");
        _dsRender(v, msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

function _dsRender(v, msg) {
    const semValor = !v.asfalto && !v.chao;
    const total = _dsLinhas.reduce((s, l) => s + (l.valor || 0), 0);
    document.getElementById("ds-lista").innerHTML = `
        ${semValor ? `<div class="cft-ajuda" style="margin-bottom:6px"><span class="cft-aviso">Valor por km ainda zerado</span> — defina em cima pra calcular.</div>` : ""}
        <div class="cft-tabela-wrap" style="max-height:560px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th style="text-align:right">Km asfalto/dia</th><th style="text-align:right">Km chão/dia</th>
                <th style="text-align:right">R$/dia</th><th style="text-align:right">Dias com entrega</th><th style="text-align:right">Deslocamento (R$)</th><th>Observação</th><th></th></tr></thead>
            <tbody>${_dsLinhas.length ? _dsLinhas.map(l => `<tr>
                <td>${_dsEsc(l.driver)}</td>
                <td class="num">${_dsNum(l.km_asfalto, 1)}</td><td class="num">${_dsNum(l.km_chao, 1)}</td>
                <td class="num">${_dsNum(l.valor_dia)}</td>
                <td class="num">${l.dias ?? "—"}</td>
                <td class="num cft-pos"><strong>${_dsNum(l.valor)}</strong></td>
                <td style="white-space:normal" class="cft-ajuda">${_dsEsc(l.observacao || "")}</td>
                <td style="white-space:nowrap"><button class="cft-btn" onclick="_dsEditar(${l.id})">Editar</button>
                    <button class="cft-btn perigo" onclick="_dsRemover(${l.id})">Remover</button></td>
            </tr>`).join("") : `<tr><td colspan="8" class="cft-vazio" style="padding:14px">Nenhum entregador com deslocamento.</td></tr>`}</tbody>
            ${_dsLinhas.length ? `<tfoot><tr><td><strong>Total</strong></td><td></td><td></td><td></td><td></td>
                <td class="num cft-pos"><strong>${_dsNum(total)}</strong></td><td></td><td></td></tr></tfoot>` : ""}
        </table></div>
        <div class="cft-ajuda" style="margin-top:6px">${msg || ""} O deslocamento entra no Resumo da Quinzena, somando no líquido.</div>`;
}

function _dsEditar(id) {
    const l = _dsLinhas.find(x => x.id === id);
    if (!l) return;
    document.getElementById("ds-driver").value = l.driver;
    document.getElementById("ds-km-asfalto").value = String(l.km_asfalto || "").replace(".", ",");
    document.getElementById("ds-km-chao").value = String(l.km_chao || "").replace(".", ",");
    document.getElementById("ds-obs").value = l.observacao || "";
    document.getElementById("ds-driver").focus();
}

async function _dsSalvar() {
    const st = document.getElementById("ds-status");
    const corpo = { driver: document.getElementById("ds-driver").value, km_asfalto: document.getElementById("ds-km-asfalto").value,
        km_chao: document.getElementById("ds-km-chao").value, observacao: document.getElementById("ds-obs").value };
    try {
        const r = await fetch(`${_DS_API()}/deslocamentos`, { method: "POST", headers: _dsHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.innerText = d.error || "Erro ao salvar."; return; }
        st.innerText = "";
        for (const id of ["ds-driver", "ds-km-asfalto", "ds-km-chao", "ds-obs"]) document.getElementById(id).value = "";
        _dsCarregar("Salvo.");
    } catch (_) { st.innerText = "Erro ao salvar."; }
}

async function _dsSalvarValores() {
    const st = document.getElementById("ds-v-status");
    try {
        const r = await fetch(`${_DS_API()}/deslocamentos-valores`, { method: "PUT", headers: _dsHeaders(true),
            body: JSON.stringify({ asfalto: document.getElementById("ds-v-asfalto").value, chao: document.getElementById("ds-v-chao").value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.innerText = d.error || "Erro ao salvar."; return; }
        st.innerText = "Valores salvos.";
        _dsCarregar();
    } catch (_) { st.innerText = "Erro ao salvar."; }
}

function _dsRemover(id) {
    const l = _dsLinhas.find(x => x.id === id);
    gcConfirm(`Tirar o deslocamento de <b>${_dsEsc(l ? l.driver : "")}</b>?`, () => {
        fetch(`${_DS_API()}/deslocamentos/${id}`, { method: "DELETE", headers: _dsHeaders() })
        .then(r => r.json())
        .then(d => { if (d.error) gcAlert(d.error); else _dsCarregar("Removido."); })
        .catch(() => gcAlert("Erro ao remover."));
    }, "Remover deslocamento", "Remover");
}
