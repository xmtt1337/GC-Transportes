// ───── FECHAMENTO › ACAREAÇÕES ─────
// Relatórios de acareação (PNR) por transportadora — Shopee, Imile, Anjun e Loggi; a
// transportadora sai das colunas do arquivo. Vários arquivos por quinzena.
// Regra: entregador (somando os usuários dele em todas as transportadoras) com mais de 2
// acareações abertas no mesmo dia → todos os pacotes dele naquele dia valem a tarifa mínima
// do dia (seg a sáb R$ 1,50, domingo R$ 1,80). Só nos polos da regra da performance.
// Backend: /acareacoes (modules/fechamento-transportadoras/acareacoes.js); a conta entra na
// consolidação e aparece no Resumo da Quinzena e no Meus Fechamentos.
const _AC_API = () => `${API}/admin/fechamento-transportadoras`;
const _AC_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const _AC_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
let _acDados = null;
let _acAbertos = new Set();
let _acEntregadores = null;

function _acEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _acNum(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _acDia(iso) {
    const [, m, d] = String(iso || "").split("-");
    return d ? `${d}/${m}` : "—";
}
function _acHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _acPeriodo() {
    const v = (id) => parseInt(document.getElementById(id).value, 10);
    return { mes: v("ac-mes"), ano: v("ac-ano"), quinzena: v("ac-q") };
}
function _acQs() {
    const p = _acPeriodo();
    return `mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`;
}

function abrirAcareacoes(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-acareacoes");
    const d = new Date();
    const h = { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
    document.getElementById("ac-conteudo").innerHTML = `
        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Acareações</div>
            <div class="cft-ajuda" style="margin-bottom:8px">Entregador com <b>mais de 2 acareações abertas no mesmo dia</b> (somando todos os usuários dele,
                de todas as transportadoras) recebe a <b>tarifa mínima do dia</b> em todos os pacotes daquele dia: R$ 1,50 de segunda a sábado,
                R$ 1,80 no domingo. Vale só pros polos da regra da performance (Caçador e Videira).</div>
            <div class="cft-ajuda" style="margin-bottom:10px">Relatórios aceitos — Shopee: Driver, Created Time, SPXTN · Imile: Associated Waybill,
                The Responsible Person, Create Time · Anjun: Número do Waybill, Entregador, tempo de registro (só "Suspeita de perda")
                · Loggi: Pacote, Entregador, Aberto em. Mesmo código repetido conta uma vez.</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <select class="fech-select" id="ac-q" onchange="_acCarregar()">
                    <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
                <select class="fech-select" id="ac-mes" onchange="_acCarregar()">${_AC_MESES.map((m, i) =>
                    `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
                <select class="fech-select" id="ac-ano" onchange="_acCarregar()">${[h.ano - 1, h.ano].map(a =>
                    `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
                <label class="cft-btn primario" style="cursor:pointer">Anexar relatórios
                    <input type="file" accept=".xlsx,.xls,.csv" multiple style="display:none" onchange="_acArquivos(this)">
                </label>
                <span class="cft-ajuda" id="ac-status"></span>
            </div>
        </div>
        <div id="ac-lista"></div>`;
    _acCarregar();
}

function _acCarregar(msg) {
    const el = document.getElementById("ac-lista");
    if (!el) return;
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_AC_API()}/acareacoes?${_acQs()}`, { headers: _acHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_acEsc(d.error)}</div>`; return; }
        _acDados = d;
        _acAbertos = new Set();
        _acRender(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

function _acRender(msg) {
    const d = _acDados || {};
    const arqs = d.arquivos || [];
    const pend = d.sem_conversao || [];
    const dias = d.dias || [];
    const minimas = dias.filter(x => x.tarifa_minima);
    document.getElementById("ac-lista").innerHTML = `
        ${msg ? `<div class="cft-ajuda" style="margin:0 0 10px">${msg}</div>` : ""}
        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Relatórios da quinzena</div>
            ${arqs.length ? `<div class="cft-tabela-wrap"><table class="cft-tabela">
                <thead><tr><th>Transportadora</th><th>Arquivo</th><th style="text-align:right">Acareações</th><th></th></tr></thead>
                <tbody>${arqs.map(a => `<tr>
                    <td>${_acEsc(a.transportadora)}</td><td>${_acEsc(a.arquivo || "(sem nome)")}</td><td class="num">${a.total}</td>
                    <td style="width:1%;white-space:nowrap"><button class="cft-btn perigo" data-e="${_acEsc(a.envio_id)}" data-n="${_acEsc(a.arquivo || "")}"
                        onclick="_acRemover(this.dataset.e, this.dataset.n)">Remover</button></td>
                </tr>`).join("")}</tbody></table></div>` : `<div class="cft-ajuda">Nenhum relatório de acareação nesta quinzena ainda.</div>`}
        </div>
        ${pend.length ? `<div class="cft-pend">
            <div class="cft-pend-titulo"><span class="cft-aviso">Usuários sem entregador (${pend.length})</span></div>
            <div class="cft-ajuda" style="margin-bottom:6px">Não achei o entregador desses usuários — as acareações deles ainda não contam.
                Escolha quem é: fica salvo na Conversão de nomes e a quinzena é recalculada.</div>
            <datalist id="ac-entregadores">${(_acEntregadores || []).map(n => `<option value="${_acEsc(n)}">`).join("")}</datalist>
            <div class="cft-tabela-wrap"><table class="cft-tabela"><tbody>${pend.map((p, i) => `<tr>
                <td>${_acEsc(p.usuario)}</td><td class="cft-ajuda">${_acEsc(p.transportadoras.join(", "))}</td>
                <td class="num">${p.acareacoes} acareação(ões)</td>
                <td><input class="cft-input" id="ac-conv-${i}" list="ac-entregadores" placeholder="Entregador..." style="min-width:260px;margin:0"
                    onfocus="_acGarantirEntregadores()"></td>
                <td style="width:1%;white-space:nowrap"><button class="cft-btn" onclick="_acSalvarConversao(${i})">Salvar</button></td>
            </tr>`).join("")}</tbody></table></div>
        </div>` : ""}
        ${dias.length ? `<div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor">${(d.lista || []).length.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Acareações com entregador</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor${minimas.length ? " cft-neg" : ""}">${minimas.length}</div><div class="cft-kpi-rotulo">Dias na tarifa mínima</div></div>
        </div>
        <div class="cft-barra" style="flex-wrap:wrap">
            <input class="cft-input" id="ac-busca" placeholder="Buscar entregador..." style="width:260px;flex:0 0 auto;margin:0" oninput="_acRenderTabela()">
            <label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="ac-so-minima" onchange="_acRenderTabela()"> só os dias na tarifa mínima</label>
        </div>
        <div class="cft-tabela-wrap" style="max-height:62vh;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Dia</th><th>Entregador</th><th style="text-align:right">Acareações</th><th>Transportadoras</th>
                <th>Tarifa</th><th style="text-align:right">R$/pacote</th><th style="text-align:right">Pacotes</th><th style="text-align:right">Total do dia</th></tr></thead>
            <tbody id="ac-tbody"></tbody></table></div>` : ""}`;
    if (dias.length) _acRenderTabela();
}

function _acRenderTabela() {
    const d = _acDados || {};
    const busca = (document.getElementById("ac-busca") || {}).value || "";
    const so = (document.getElementById("ac-so-minima") || {}).checked;
    const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const linhas = (d.dias || []).filter(x => (!so || x.tarifa_minima) && (!busca || norm(x.driver).includes(norm(busca))));
    const limite = d.limite ?? 2;
    document.getElementById("ac-tbody").innerHTML = linhas.length ? linhas.map(x => {
        const k = x.driver + "|" + x.dia;
        const aberto = _acAbertos.has(k);
        const tarifa = x.tarifa_minima ? `<span class="cft-neg">Tarifa mínima</span>`
            : x.acareacoes > limite ? `<span class="cft-ajuda" title="Sem pacote nos polos da regra nesse dia">fora da regra</span>`
            : `<span class="cft-ajuda">normal</span>`;
        const codigos = aberto ? (d.lista || []).filter(a => a.driver === x.driver && a.dia === x.dia) : [];
        return `<tr style="cursor:pointer" title="Clique pra ver os códigos" data-k="${_acEsc(k)}" onclick="_acAlternar(this.dataset.k)">
            <td><span class="cft-ajuda">${aberto ? "▾" : "▸"}</span> ${_acDia(x.dia)} <span class="cft-ajuda">${_AC_SEM[new Date(x.dia + "T12:00:00Z").getUTCDay()]}</span></td>
            <td>${_acEsc(x.driver)}</td>
            <td class="num${x.acareacoes > limite ? " cft-neg" : ""}"><strong>${x.acareacoes}</strong></td>
            <td class="cft-ajuda">${Object.entries(x.por_transportadora || {}).map(([t, n]) => `${_acEsc(t)} ${n}`).join(" · ")}</td>
            <td>${tarifa}</td>
            <td class="num">${x.valor_dia != null ? _acNum(x.valor_dia) : "—"}</td>
            <td class="num">${x.pacotes || 0}</td>
            <td class="num">${x.na_regra ? _acNum(x.total) : "—"}</td>
        </tr>${aberto ? `<tr><td colspan="8" style="background:rgba(255,255,255,0.02);padding:8px 12px">
            ${codigos.map(a => `<div class="cft-ajuda">${_acEsc(a.transportadora)} · <b>${_acEsc(a.codigo || "(sem código)")}</b>${a.hora ? ` · aberta às ${_acEsc(a.hora)}` : ""}</div>`).join("")}
        </td></tr>` : ""}`;
    }).join("") : `<tr><td colspan="8" class="cft-vazio" style="padding:14px">Nada por aqui.</td></tr>`;
}

function _acAlternar(k) {
    if (_acAbertos.has(k)) _acAbertos.delete(k); else _acAbertos.add(k);
    _acRenderTabela();
}

async function _acArquivos(input) {
    const arquivos = [...(input.files || [])];
    input.value = "";
    const p = _acPeriodo();
    const msgs = [];
    for (const file of arquivos) {
        const st = document.getElementById("ac-status");
        if (st) st.innerText = `Lendo ${file.name}...`;
        try {
            const grid = await _cfLerGrid(file);
            const r = await fetch(`${_AC_API()}/acareacoes`, { method: "POST", headers: _acHeaders(true),
                body: JSON.stringify({ ...p, arquivo: file.name, grid }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                msgs.push(`<span class="cft-erro">${_acEsc(file.name)}: ${_acEsc(d.error || "erro ao enviar.")}</span>`
                    + (d.cabecalho_encontrado && d.cabecalho_encontrado.length ? ` <span class="cft-ajuda">Colunas do arquivo: ${_acEsc(d.cabecalho_encontrado.join(" · "))}</span>` : ""));
                continue;
            }
            const extra = [d.repetidos ? `${d.repetidos} repetida(s)` : "", d.fora_da_quinzena ? `${d.fora_da_quinzena} fora da quinzena` : "",
                d.outro_status ? `${d.outro_status} com outro status` : "", d.sem_data ? `${d.sem_data} sem data` : ""].filter(Boolean);
            msgs.push(_acEsc(`${file.name} (${d.transportadora}): ${d.gravados} acareação(ões)`) + (extra.length ? ` <span class="cft-ajuda">— ${_acEsc(extra.join(", "))} ignorada(s)</span>` : ""));
        } catch (err) { msgs.push(`<span class="cft-erro">${_acEsc(file.name)}: ${_acEsc(err.message)}</span>`); }
    }
    const st = document.getElementById("ac-status");
    if (st) st.innerText = "";
    _acCarregar(msgs.join("<br>"));
}

function _acRemover(envio, nome) {
    gcConfirm(`Remover o relatório de acareações <b>${_acEsc(nome || "(sem nome)")}</b> desta quinzena?`, () => {
        fetch(`${_AC_API()}/acareacoes/${encodeURIComponent(envio)}?${_acQs()}`, { method: "DELETE", headers: _acHeaders() })
        .then(r => r.json())
        .then(d => { if (d.error) gcAlert(d.error); else _acCarregar(_acEsc(`${nome || "Relatório"} removido.`)); })
        .catch(() => gcAlert("Erro ao remover."));
    }, "Remover acareações", "Remover");
}

function _acGarantirEntregadores() {
    if (_acEntregadores) return;
    fetch(`${_AC_API()}/entregadores`, { headers: _acHeaders() }).then(r => r.json()).then(d => {
        _acEntregadores = d.nomes || [];
        const dl = document.getElementById("ac-entregadores");
        if (dl) dl.innerHTML = _acEntregadores.map(n => `<option value="${_acEsc(n)}">`).join("");
    }).catch(() => {});
}

async function _acSalvarConversao(i) {
    const item = ((_acDados || {}).sem_conversao || [])[i];
    const nome = document.getElementById("ac-conv-" + i).value.trim();
    if (!item || !nome) { gcAlert("Escolha o entregador."); return; }
    const r = await fetch(`${API}/admin/nomes-padrao`, { method: "POST", headers: _acHeaders(true),
        body: JSON.stringify({ nome_origem: item.usuario, nome_sistema: nome }) });
    const d = await r.json().catch(() => ({}));
    // 409 = o par já existia: dá no mesmo.
    if (!r.ok && r.status !== 409) { gcAlert(r.status === 403 ? "Só quem é dev pode mexer na Conversão de nomes." : (d.error || "Erro ao salvar.")); return; }
    await fetch(`${_AC_API()}/acareacoes/recalcular`, { method: "POST", headers: _acHeaders(true), body: JSON.stringify(_acPeriodo()) }).catch(() => {});
    _acCarregar(_acEsc(`${item.usuario} → ${nome}`));
}
