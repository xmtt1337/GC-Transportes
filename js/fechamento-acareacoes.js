// ───── FECHAMENTO › ACAREAÇÕES ─────
// Relatórios de acareação (PNR) por transportadora — Shopee, Imile, Anjun e Loggi; a
// transportadora sai das colunas do arquivo. Vários arquivos por quinzena.
// O dia de cada PNR é o ANTERIOR ao da abertura (criada dia 21 → conta no dia 20).
// Regra: um usuário com mais de N acareações no mesmo dia (conta por usuário, não
// soma os usuários do entregador) → as entregas desse usuário naquele dia valem a tarifa mínima
// do dia (seg a sáb R$ 1,50, domingo R$ 1,80). Só nos polos da regra da performance.
// Quem tem valor fixo: soma os usuários, compara com as baixas do dia e cai pro fixo menos
// um desconto. Limites, desconto e exceções por entregador ficam em Fechamento › Regras e
// configurações (fechamento-regras.js); aqui só o resumo.
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
            <div class="cft-pend-titulo" style="color:#e2e8f0">PNR abertas (acareações)</div>
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
            <div class="cft-ajuda" style="margin-bottom:8px">Anexe o relatório de cada transportadora — a que ainda não tem fica marcada como "falta".
                Se a transportadora não teve PNR, anexe o relatório mesmo assim (vazio ou sem nada na quinzena), pra ficar registrado.</div>
            <div class="cft-tabela-wrap"><table class="cft-tabela">
                <thead><tr><th>Transportadora</th><th>Situação</th><th>Arquivos</th><th></th></tr></thead>
                <tbody>${_acSlots(d).map(t => {
                    const seus = arqs.filter(a => a.transportadora === t.nome);
                    return `<tr>
                    <td><strong>${_acEsc(t.nome)}</strong></td>
                    <td>${t.arquivos ? `<span class="cft-pos">Anexado</span> <span class="cft-ajuda">· ${t.pnr} PNR</span>` : `<span class="cft-aviso">Falta anexar</span>`}</td>
                    <td>${seus.map(a => `<div class="cft-ajuda" style="display:flex;align-items:center;gap:8px">${_acEsc(a.arquivo || "(sem nome)")} · ${a.total} PNR
                        <a href="#" class="cft-ajuda" style="text-decoration:underline" data-e="${_acEsc(a.envio_id)}" data-n="${_acEsc(a.arquivo || "")}"
                        onclick="event.preventDefault();_acRemover(this.dataset.e, this.dataset.n)">remover</a></div>`).join("") || `<span class="cft-ajuda">—</span>`}</td>
                    <td style="width:1%;white-space:nowrap"><label class="cft-btn${t.arquivos ? "" : " primario"}" style="cursor:pointer">Anexar
                        <input type="file" accept=".xlsx,.xls,.csv" multiple style="display:none" data-t="${_acEsc(t.chave)}" onchange="_acArquivos(this, this.dataset.t)">
                    </label></td>
                </tr>`; }).join("")}</tbody></table></div>
        </div>
        ${_acRegrasResumoHtml(d)}
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
            <div class="cft-kpi"><div class="cft-kpi-valor">${(d.lista || []).length.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">PNR com entregador</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor${minimas.length ? " cft-neg" : ""}">${minimas.length}</div><div class="cft-kpi-rotulo">Dias na tarifa mínima</div></div>
            ${_acTransportadoras().map(([t, n]) => `<div class="cft-kpi"><div class="cft-kpi-valor">${n.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">${_acEsc(t)}</div></div>`).join("")}
        </div>
        <div class="cft-barra" style="flex-wrap:wrap">
            <select class="fech-select" id="ac-transp" onchange="_acRenderTabela()">
                <option value="">Todas as transportadoras</option>${_acTransportadoras().map(([t]) => `<option value="${_acEsc(t)}">${_acEsc(t)}</option>`).join("")}</select>
            <input class="cft-input" id="ac-busca" placeholder="Buscar entregador..." style="width:260px;flex:0 0 auto;margin:0" oninput="_acRenderTabela()">
            <label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="ac-so-minima" onchange="_acRenderTabela()"> só os dias na tarifa mínima</label>
        </div>
        <div class="cft-tabela-wrap" style="max-height:62vh;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Dia</th><th>Entregador</th><th style="text-align:right">PNR no dia</th><th>Transportadora</th>
                <th>Tarifa</th><th style="text-align:right">R$/pacote</th><th style="text-align:right">Pacotes</th><th style="text-align:right">Total do dia</th></tr></thead>
            <tbody id="ac-tbody"></tbody></table></div>` : ""}`;
    if (dias.length) _acRenderTabela();
}

// Regras que valem hoje (só leitura — mudar em Regras e configurações).
function _acPct(n) {
    return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}
function _acRegrasResumoHtml(d) {
    const r = d.regra_fixo || { fator: 0.01, desconto_pct: 40 };
    const limite = d.limite ?? 2;
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">Regras que valem hoje</div>
        <div class="cft-ajuda"><b>Sem valor fixo:</b> um usuário com mais de <b>${limite}</b> PNR no mesmo dia (cada usuário separado) → as entregas DESSE usuário
            naquele dia na tarifa mínima (os outros usuários do entregador seguem normais) (R$ 1,50 seg a sáb, R$ 1,80 dom).
            <b>Com valor fixo:</b> somando os usuários, mais PNR que as baixas do dia × <b>${_acPct(r.fator)}</b> (1.000 baixas × ${_acPct(r.fator)} = mais de ${_acPct(1000 * r.fator)}) → fixo com <b>${_acPct(r.desconto_pct)}% a menos</b>.
            A PNR conta no dia anterior ao da abertura (criada dia 21 → dia 20). Só nos polos da performance. Pra mudar ou criar exceção pra um entregador:
            <a href="#" style="color:#60a5fa" onclick="event.preventDefault();abrirRegrasFechamento()">Regras e configurações</a>.</div>
    </div>`;
}

/** Transportadoras com PNR na quinzena: [[nome, quantidade]], na ordem do relatório. */
function _acTransportadoras() {
    const m = new Map();
    for (const a of (_acDados || {}).lista || []) m.set(a.transportadora, (m.get(a.transportadora) || 0) + 1);
    return [...m.entries()];
}

function _acRenderTabela() {
    const d = _acDados || {};
    const transp = (document.getElementById("ac-transp") || {}).value || "";
    const busca = (document.getElementById("ac-busca") || {}).value || "";
    const so = (document.getElementById("ac-so-minima") || {}).checked;
    const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const linhas = (d.dias || []).filter(x => (!so || x.tarifa_minima) && (!busca || norm(x.driver).includes(norm(busca)))
        && (!transp || (x.por_transportadora || {})[transp]))
        // Fora dos polos da regra (ex.: Joaçaba) vai pro fim — não mexe no valor.
        .sort((a, b) => (a.fora_dos_polos ? 1 : 0) - (b.fora_dos_polos ? 1 : 0));
    const limite = d.limite ?? 2;
    document.getElementById("ac-tbody").innerHTML = linhas.length ? linhas.map(x => {
        const k = x.driver + "|" + x.dia;
        const aberto = _acAbertos.has(k);
        const descFixo = (d.regra_fixo || {}).desconto_pct ?? 40;
        // Sem fixo: só as entregas do usuário que passou caem (o resto do dia segue normal).
        const tarifa = x.tarifa_minima ? (x.fixo ? `<span class="cft-neg">Fixo −${_acPct(descFixo)}%</span>`
                : `<span class="cft-neg">Tarifa mínima</span> <span class="cft-ajuda">em ${x.pacotes_minima || 0} de ${x.pacotes || 0} pacotes</span>`)
            : x.fora_dos_polos ? `<span class="cft-ajuda" title="Entregador de polo fora da regra da performance (só Caçador e Videira): a PNR não mexe no valor dele.">não afeta a precificação nesse polo</span>`
            : x.excecao ? `<span class="cft-ajuda" title="Exceção do entregador (Regras e configurações)">exceção: ${_acEsc(x.excecao)}</span>`
            : x.fixo ? `<span class="cft-ajuda">fixo</span>`
            : (x.maior_usuario ?? x.acareacoes) > limite
                ? (!x.na_regra
                    ? `<span class="cft-aviso" title="Nenhum pacote entregue por ele nesse dia nos polos da regra (Caçador e Videira): não tem pacote pra baixar pra tarifa mínima. Se ele trabalhou, confira se o relatório de entregas do dia foi enviado.">sem entrega no dia</span>`
                    : `<span class="cft-aviso" title="O fechamento ainda não foi recalculado com essas PNR. Use Recalcular.">falta recalcular</span>`)
            : `<span class="cft-ajuda">normal</span>`;
        const codigos = aberto ? (d.lista || []).filter(a => a.driver === x.driver && a.dia === x.dia && (!transp || a.transportadora === transp)) : [];
        return `<tr style="cursor:pointer" title="Clique pra ver os códigos" data-k="${_acEsc(k)}" onclick="_acAlternar(this.dataset.k)">
            <td><span class="cft-ajuda">${aberto ? "▾" : "▸"}</span> ${_acDia(x.dia)} <span class="cft-ajuda">${_AC_SEM[new Date(x.dia + "T12:00:00Z").getUTCDay()]}</span></td>
            <td>${_acEsc(x.driver)}</td>
            <td class="num${x.tarifa_minima || (!x.fixo && !x.fora_dos_polos && (x.maior_usuario ?? x.acareacoes) > limite) ? " cft-neg" : ""}"><strong>${x.acareacoes}</strong></td>
            <td class="cft-ajuda">${(e => e.length > 1 ? e.map(([t, n]) => `${_acEsc(t)} ${n}`).join(" · ") : e.map(([t]) => _acEsc(t)).join(""))(Object.entries(x.por_transportadora || {}))}</td>
            <td>${tarifa}</td>
            <td class="num">${x.valor_dia == null ? "—" : x.tarifa_minima && !x.fixo && x.pacotes_minima
                ? (x.pacotes_minima >= (x.pacotes || 0) ? _acNum(x.valor_minima) : `<span class="cft-neg">${_acNum(x.valor_minima)}</span> / ${_acNum(x.valor_dia)}`)
                : _acNum(x.valor_dia)}</td>
            <td class="num">${x.pacotes || 0}</td>
            <td class="num">${x.na_regra ? _acNum(x.total) : "—"}</td>
        </tr>${aberto ? `<tr><td colspan="8" style="background:rgba(255,255,255,0.02);padding:8px 12px">
            ${(x.usuarios || []).map(u => `<div class="cft-ajuda" style="margin-bottom:2px">${u.passou ? `<span class="cft-neg">${_acEsc(u.usuario)}</span>` : _acEsc(u.usuario)}
                (${_acEsc(u.transportadora)}): <b>${u.pnr} PNR</b> — ${u.passou ? "passou do limite: as entregas desse usuário no dia vão pra tarifa mínima" : "não passou: entregas desse usuário no valor normal"}</div>`).join("")}
            ${x.tarifa_minima && !x.fixo && !x.pacotes_minima ? `<div class="cft-aviso" style="margin-bottom:4px">Nenhuma entrega desse usuário no dia: confira se o nome do usuário na PNR é o mesmo do relatório de entregas.</div>` : ""}
            ${(x.usuarios || []).length ? `<div style="height:6px"></div>` : ""}
            ${codigos.map(a => `<div class="cft-ajuda">${_acEsc(a.transportadora)}${a.usuario ? ` · ${_acEsc(a.usuario)}` : ""} · <b>${_acEsc(a.codigo || "(sem código)")}</b>${a.hora ? ` · aberta no dia seguinte às ${_acEsc(a.hora)}` : " · aberta no dia seguinte"}</div>`).join("")}
        </td></tr>` : ""}`;
    }).join("") : `<tr><td colspan="8" class="cft-vazio" style="padding:14px">Nada por aqui.</td></tr>`;
}

function _acAlternar(k) {
    if (_acAbertos.has(k)) _acAbertos.delete(k); else _acAbertos.add(k);
    _acRenderTabela();
}

/** Uma linha por transportadora (o backend manda; sem ele, as quatro sem nada). */
function _acSlots(d) {
    return (d && d.transportadoras) || [["shopee_cfc", "Shopee Caçador"], ["shopee_via", "Shopee Videira"], ["imile", "Imile"], ["anjun", "Anjun"], ["loggi", "Loggi"]]
        .map(([chave, nome]) => ({ chave, nome, arquivos: 0, pnr: 0 }));
}

async function _acArquivos(input, transportadora) {
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
                body: JSON.stringify({ ...p, arquivo: file.name, grid, transportadora: transportadora || undefined }) });
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
