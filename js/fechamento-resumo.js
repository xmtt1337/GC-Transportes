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
let _rqXCidades = [];      // cidades escolhidas no "Baixar relatório": [{nome, variantes}] (vazio = todas)
let _rqXNaoAchadas = [];   // nomes colados que não existem nesta quinzena

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
            <button class="cft-btn" onclick="_rqAlternarBaixar()">Baixar relatório</button>
        </div>
        <div id="rq-baixar" class="cft-regras" style="display:none">
            <div class="cft-ajuda" style="margin-bottom:8px">Relatório detalhado, igual ao do Criar Fechamento: uma aba por transportadora
                com todos os pacotes, a aba <b>Performance</b> da Shopee e, no fim, o <b>Resumo</b> por entregador.
                Escolha o que entra — sem nada escolhido, vai tudo.</div>
            <div class="cft-rotulo" style="margin-bottom:4px">Transportadoras</div>
            <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap;gap:14px">
                ${_rqColunas().map(c => `<label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#cbd5e1">
                    <input type="checkbox" class="rq-x-transp" value="${c.chave}" checked> ${_rqEsc(c.nome)}</label>`).join("")}
            </div>
            <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap">
                ${_rqSelect("rq-x-polo", "Todos os polos", (d.opcoes || {}).polos)}
                ${_rqSelect("rq-x-driver", "Todos os entregadores", (d.opcoes || {}).entregadores)}
            </div>
            <div class="cft-rotulo" style="margin-bottom:4px">Cidades</div>
            <datalist id="rq-x-cidades-lista">${_rqGruposCidades().map(g => `<option value="${_rqEsc(g.nome)}">`).join("")}</datalist>
            <div class="cft-barra" style="margin:0 0 6px;flex-wrap:wrap">
                <input class="cft-input" id="rq-x-cidade" list="rq-x-cidades-lista" placeholder="Digite a cidade..." style="width:320px;flex:0 0 auto;margin:0"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();_rqAddCidades(this.value);this.value='';}">
                <button class="cft-btn" onclick="const i=document.getElementById('rq-x-cidade');_rqAddCidades(i.value);i.value=''">Adicionar</button>
            </div>
            <textarea id="rq-x-colar" class="cft-input" rows="2" placeholder="Ou cole uma lista de cidades (uma por linha, ou separadas por vírgula / ponto e vírgula)"
                onpaste="setTimeout(()=>{_rqAddCidades(this.value);this.value='';},0)"></textarea>
            <div id="rq-x-cidades" style="margin:6px 0 10px"></div>
            <div class="cft-barra" style="margin:0">
                <button class="cft-btn primario" id="rq-x-btn" onclick="_rqBaixar()">Baixar</button>
                <span class="cft-ajuda" id="rq-x-status"></span>
            </div>
        </div>
        <div class="cft-tabela-wrap" style="max-height:620px;overflow-y:auto"><table class="cft-tabela">
            <thead id="rq-thead"></thead><tbody id="rq-tbody"></tbody><tfoot id="rq-tfoot"></tfoot>
        </table></div>
        <div class="cft-ajuda" style="margin-top:6px">Valor de cada transportadora = soma do "Valor motorista" dos pacotes (Shopee já pela performance consolidada).
            Líquido = bruto − Ticketlog. Clique no título da coluna pra ordenar.</div>`;
    _rqRenderTabela();
    _rqRenderCidades();
}

// Cidades do filtro: aceita uma ou uma lista colada. Casa sem olhar acento, caixa,
// espaço/hífen/apóstrofo nem "/SC" ou "- SC" no fim — e pega TODAS as grafias da mesma
// cidade que existem na quinzena (Joaçaba, JOACABA, Joacaba...). O que não existe vira aviso.
function _rqChaveCidade(c) {
    return _rqChave(c).replace(/\s*[-/]\s*[a-z]{2}$/, "").replace(/[^a-z0-9]+/g, "");
}
// Grafias da quinzena agrupadas; o nome mostrado é o "mais bonito" (com acento e sem tudo maiúsculo).
function _rqGruposCidades() {
    const g = new Map();
    for (const c of ((_rqDados && _rqDados.opcoes) || {}).cidades || []) {
        const k = _rqChaveCidade(c);
        if (!k) continue;
        if (!g.has(k)) g.set(k, { chave: k, variantes: [] });
        g.get(k).variantes.push(c);
    }
    const nota = (v) => (/[^\x00-\x7f]/.test(v) ? 2 : 0) + (v !== v.toUpperCase() ? 1 : 0);
    return [...g.values()].map(x => ({ ...x, nome: x.variantes.slice().sort((a, b) => nota(b) - nota(a))[0] }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
function _rqAddCidades(texto) {
    const grupos = new Map(_rqGruposCidades().map(x => [x.chave, x]));
    for (const bruto of String(texto || "").split(/[\n\r;,\t]+/)) {
        const nome = bruto.trim();
        if (!nome) continue;
        const g = grupos.get(_rqChaveCidade(nome));
        if (g) { if (!_rqXCidades.some(x => x.chave === g.chave)) _rqXCidades.push(g); }
        else if (!_rqXNaoAchadas.includes(nome)) _rqXNaoAchadas.push(nome);
    }
    _rqRenderCidades();
}
function _rqTirarCidade(i) { _rqXCidades.splice(i, 1); _rqRenderCidades(); }
function _rqLimparCidades() { _rqXCidades = []; _rqXNaoAchadas = []; _rqRenderCidades(); }
function _rqRenderCidades() {
    const el = document.getElementById("rq-x-cidades");
    if (!el) return;
    el.innerHTML = (_rqXCidades.length
        ? `<span class="cft-ajuda">${_rqXCidades.length} cidade(s): </span>` + _rqXCidades.map((c, i) =>
            `<span class="cft-chip"${c.variantes.length > 1 ? ` title="Grafias: ${_rqEsc(c.variantes.join(" · "))}"` : ""}>${_rqEsc(c.nome)}${c.variantes.length > 1 ? ` <span class="cft-ajuda">+${c.variantes.length - 1}</span>` : ""} <a href="#" title="Tirar" onclick="event.preventDefault();_rqTirarCidade(${i})">×</a></span>`).join(" ")
            + ` <a href="#" class="cft-ordem cft-ajuda" onclick="event.preventDefault();_rqLimparCidades()">limpar</a>`
        : `<span class="cft-ajuda">Todas as cidades.</span>`)
        + (_rqXNaoAchadas.length ? `<div class="cft-ajuda" style="margin-top:4px"><span class="cft-aviso">Sem pacote nesta quinzena:</span> ${_rqEsc(_rqXNaoAchadas.join(", "))}</div>` : "");
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

function _rqSelect(id, todos, lista) {
    return `<select class="fech-select" id="${id}" style="max-width:280px"><option value="">${todos}</option>${(lista || []).map(v => `<option value="${_rqEsc(v)}">${_rqEsc(v)}</option>`).join("")}</select>`;
}

function _rqAlternarBaixar() {
    const el = document.getElementById("rq-baixar");
    el.style.display = el.style.display === "none" ? "" : "none";
}

/**
 * Aba "Resumo" (por entregador) a partir dos pacotes já filtrados. Ticketlog (e o líquido)
 * só entra quando não tem filtro de cidade nem de transportadora — o desconto é do
 * entregador inteiro, não de uma parte dos pacotes dele.
 */
function _rqAbaResumo(pacotes, filtros) {
    const comTl = !(filtros.cidades || []).length && !filtros.parcialTransp;
    const tl = new Map((_rqDados.linhas || []).filter(l => !l.sem_conversao).map(l => [l.entregador, l.ticketlog || 0]));
    const transp = [...new Set(pacotes.map(p => p.transportadora))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const por = new Map();
    for (const p of pacotes) {
        const k = p.driver || `${p.usuario || "(sem usuário)"} (sem conversão)`;
        if (!por.has(k)) por.set(k, { nome: k, driver: p.driver, polos: new Map(), t: {}, pacotes: 0, bruto: 0 });
        const r = por.get(k);
        r.t[p.transportadora] = (r.t[p.transportadora] || 0) + (p.valor_motorista || 0);
        r.pacotes++;
        r.bruto += p.valor_motorista || 0;
        if (p.polo) r.polos.set(p.polo, (r.polos.get(p.polo) || 0) + 1);
    }
    const r2 = (n) => Math.round(n * 100) / 100;
    const cab = ["Entregador", "Polo", ...transp.map(t => t + " (R$)"), "Pacotes", "Bruto"].concat(comTl ? ["Ticketlog", "Líquido"] : []);
    const linhas = [...por.values()].sort((a, b) => (!a.driver - !b.driver) || a.nome.localeCompare(b.nome, "pt-BR")).map(r => {
        const polo = [...r.polos.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || "";
        const desc = comTl && r.driver ? (tl.get(r.driver) || 0) : 0;
        return [r.nome, polo, ...transp.map(t => r2(r.t[t] || 0)), r.pacotes, r2(r.bruto)].concat(comTl ? [desc, r2(r.bruto - desc)] : []);
    });
    return [cab, ...linhas];
}

/**
 * Abas do relatório detalhado: uma por transportadora com as MESMAS colunas do export do
 * Criar Fechamento (_CF_EXPORT_COLUNAS / _SHOPEE, de fechamento-criar.js), a Performance
 * consolidada da Shopee (só dos entregadores que estão no arquivo) e o Resumo no fim.
 * @return {Array<{nome: string, linhas: Array<Array>}>}
 */
function _rqMontarAbas(pacotes, filtros, perfLinhas) {
    const ordem = Object.values(_rqDados.transportadoras).map(t => t.nome);
    const nomes = [...new Set(pacotes.map(p => p.transportadora))]
        .sort((a, b) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99));
    const abas = nomes.map(nome => {
        const cols = /^shopee/i.test(nome) ? _CF_EXPORT_COLUNAS_SHOPEE : _CF_EXPORT_COLUNAS;
        const doTransp = pacotes.filter(p => p.transportadora === nome);
        return { nome: nome.slice(0, 31), linhas: [cols.map(c => c[0])].concat(doTransp.map(p => cols.map(c => p[c[1]] ?? ""))) };
    });
    const drivers = new Set(pacotes.map(p => p.driver).filter(Boolean));
    const perf = (perfLinhas || []).filter(l => drivers.has(l.driver));
    if (perf.length) {
        abas.push({ nome: "Performance", linhas: [["Dia", "Entregador", "Shopee entregues", "Onholds", "Outras no prazo", "Outras atrasadas",
            "Performance (%)", "Valor por pacote", "Pacotes pagos", "Total"]].concat(perf.map(l => [_cfDia(l.dia), l.driver, l.shopee, l.onholds,
            l.outras_prazo, l.outras_atraso, l.pct, l.valor, l.pacotes_pagos, l.total])) });
    }
    abas.push({ nome: "Resumo", linhas: _rqAbaResumo(pacotes, filtros) });
    return abas;
}

// Performance consolidada das XPTs da Shopee que estão no arquivo (sem repetir entregador × dia).
async function _rqBuscarPerformance(pacotes) {
    const chaves = Object.entries(_rqDados.transportadoras)
        .filter(([, t]) => /^shopee/i.test(t.nome) && pacotes.some(p => p.transportadora === t.nome)).map(([k]) => k);
    const vistos = new Set(), linhas = [];
    for (const k of chaves) {
        const r = await fetch(`${_RQ_API()}/performance?mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}&transportadora=${k}`,
            { headers: { "Authorization": "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        for (const l of d.linhas || []) {
            const id = l.driver + "|" + l.dia;
            if (!vistos.has(id)) { vistos.add(id); linhas.push(l); }
        }
    }
    return linhas.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : String(a.driver).localeCompare(String(b.driver), "pt-BR")));
}

async function _rqBaixar() {
    const v = (id) => document.getElementById(id).value;
    const caixas = [...document.querySelectorAll(".rq-x-transp")];
    const transps = caixas.filter(c => c.checked).map(c => c.value);
    if (caixas.length && !transps.length) { document.getElementById("rq-x-status").innerText = "Marque ao menos uma transportadora."; return; }
    const filtros = { transportadoras: transps.length === caixas.length ? [] : transps, parcialTransp: transps.length < caixas.length,
        polo: v("rq-x-polo"), driver: v("rq-x-driver"), cidades: _rqXCidades.flatMap(c => c.variantes), nCidades: _rqXCidades.length,
        nomeCidade: _rqXCidades.length === 1 ? _rqXCidades[0].nome : "" };
    const btn = document.getElementById("rq-x-btn");
    const st = document.getElementById("rq-x-status");
    btn.disabled = true;
    st.innerText = "Buscando os pacotes...";
    try {
        const qs = `mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}`
            + `&transportadoras=${encodeURIComponent(filtros.transportadoras.join(","))}&polo=${encodeURIComponent(filtros.polo)}`
            + `&driver=${encodeURIComponent(filtros.driver)}&cidades=${encodeURIComponent(filtros.cidades.join("|"))}`;
        const r = await fetch(`${_RQ_API()}/resumo-quinzena/pacotes?${qs}`, { headers: { "Authorization": "Bearer " + token } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro ao baixar.");
        if (!d.pacotes.length) { st.innerText = "Nenhum pacote com esse filtro."; return; }
        const perf = await _rqBuscarPerformance(d.pacotes);
        const wb = XLSX.utils.book_new();
        for (const a of _rqMontarAbas(d.pacotes, filtros, perf)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.linhas), a.nome);
        const nomeTransp = filtros.transportadoras.length === 1 ? (_rqDados.transportadoras[filtros.transportadoras[0]] || {}).nome
            : filtros.transportadoras.length ? filtros.transportadoras.length + " transportadoras" : "";
        const nomeCidade = filtros.nomeCidade || (filtros.nCidades ? filtros.nCidades + " cidades" : "");
        const sufixo = [nomeTransp, filtros.polo, filtros.driver, nomeCidade].filter(Boolean)
            .map(x => "_" + x.replace(/[^\w\u00C0-\u017F-]+/g, "-")).join("");
        XLSX.writeFile(wb, `fechamento_${_rqQuinzena}q_${String(_rqMes).padStart(2, "0")}-${_rqAno}${sufixo}.xlsx`);
        st.innerText = `${d.pacotes.length.toLocaleString("pt-BR")} pacotes baixados.`;
    } catch (err) {
        st.innerText = err.message;
    } finally {
        btn.disabled = false;
    }
}
