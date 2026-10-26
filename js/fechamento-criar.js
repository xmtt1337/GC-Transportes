// ───── CRIAR FECHAMENTO (relatório por transportadora → fechamento tratado no banco) ─────
// A pessoa escolhe mês/ano/quinzena, clica na transportadora e anexa o relatório dela.
// O backend (modules/fechamento-transportadoras) trata: conversão de nome, cidade → preço,
// prazo e polo pela planilha de precificação, dentro do prazo, incentivo, desconto,
// adicional por peso e valor do motorista — e grava como o fechamento daquela quinzena.
let _cfMes         = new Date().getMonth() + 1;
let _cfAno         = new Date().getFullYear();
let _cfQuinzena    = null;
let _cfTranspAtual = null;
let _cfReqId       = 0; // descarta resposta de período trocado antes do fetch anterior voltar
let _cfResumo      = [];
let _cfColunas     = null; // nomes de coluna aceitos por transportadora (GET /config)
let _cfRegras     = null; // quadro de regras de prazo em edição: [{tipo, escopo, t: {chave: {sab, dom}}}]
let _cfPolos      = [];
let _cfCidades    = [];
let _cfCidadesPend = [];   // [{nome, qtd, feito, tipo: "preco"|"conv"}] — cidades sem preço / sem conversão (clicáveis na Loggi)
let _cfCidadesPlan = null; // cidades da aba Loggi da planilha de precificação (card "Qual é a cidade certa?")
let _cfConvCidades = [];   // tela Conversão de cidades: [{id, cidade_errada, cidade_correta}]
// Transportadoras com Conversão de cidades — por enquanto só a Loggi (igual ao backend).
const _CF_CONVERTE_CIDADE = ["loggi"];
let _cfColCfg     = null; // tela Colunas dos relatórios: { transp, campos: [{campo, rotulo, obrigatorio, nomes, padrao, nomes_padrao}] }
let _cfNovoTipo   = "polo"; // o que o "+ Adicionar" das regras cria: polo ou cidade
let _cfNomesPend  = []; // [{nome, qtd, feito}] — nomes sem conversão do lote aberto (tags clicáveis)
let _cfEntregadores = null; // {nomes, aviso} — Dados entregadores + Conversão de nomes, lido 1x por tela
let _cfTemLote     = false;
let _cfBusca       = "";
let _cfFiltro      = "";
let _cfPagina      = 0;
let _cfBuscaTimer  = null;
let _cfColFiltros = {};   // filtro de coluna (funil): { coluna: [valores] } — só colunas com recorte
let _cfOrdem      = null; // { coluna, dir } escolhida no funil
const _CF_POR_PAGINA = 200;
const _CF_API = () => `${API}/admin/fechamento-transportadoras`;

// key/label também são lidos por pedidos-ocorrencia.js.
const _CF_TRANSPORTADORAS = [
    // Shopee: um fechamento por XPT, mesmas regras (valor pela performance — ver _cfEhShopee).
    { key: "shopee_cfc", label: "Shopee Caçador", cor: "#F97316" },
    { key: "shopee_via", label: "Shopee Videira", cor: "#F97316" },
    { key: "loggi",  label: "Loggi",         cor: "#12A5E8" },
    { key: "anjun",  label: "Anjun",         cor: "#22C55E" },
    { key: "imile",  label: "Imile",         cor: "#9333EA" },
    { key: "total",  label: "Total Express", cor: "#EAB308" },
];

/** Shopee (as duas XPTs): valor pela performance do usuário no dia, sem prazo. */
function _cfEhShopee(key) { return String(key || "").startsWith("shopee"); }

function _cfEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _cfDia(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a.slice(2)}`;
}
function _cfNum(n, casas = 2) {
    return n === null || n === undefined ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function _cfHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _cfQs(extra) {
    const p = { mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, ...(extra || {}) };
    return Object.keys(p).map(k => k + "=" + encodeURIComponent(p[k] ?? "")).join("&");
}

function abrirCriarFechamento(event) {
    if (event) event.preventDefault();
    _cfQuinzena = null;
    _cfTranspAtual = null;
    _cfReqId++; // resposta ainda pendente não pode pintar a tela sem quinzena escolhida
    document.getElementById("cf-btn-1q").classList.remove("active");
    document.getElementById("cf-btn-2q").classList.remove("active");
    document.getElementById("cf-empty").innerText = "Selecione o mês, ano e quinzena.";
    document.getElementById("cf-empty").style.display = "";
    document.getElementById("cf-content").style.display = "none";
    _cfIniciarSelects();
    mostrarTela("tela-criar-fechamento");
}

function _cfIniciarSelects() {
    const selAno   = document.getElementById("cf-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _cfAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("cf-mes").value = _cfMes;
}

function _cfPeriodoMudou() {
    _cfMes = parseInt(document.getElementById("cf-mes").value);
    _cfAno = parseInt(document.getElementById("cf-ano").value);
    if (_cfQuinzena) _cfCarregarResumo();
}

function _cfSelecionarQuinzena(q) {
    _cfQuinzena = q;
    document.getElementById("cf-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("cf-btn-2q").classList.toggle("active", q === 2);
    _cfCarregarResumo();
}

function _cfCarregarResumo() {
    if (!_cfQuinzena) return;
    _cfMes = parseInt(document.getElementById("cf-mes").value);
    _cfAno = parseInt(document.getElementById("cf-ano").value);
    const empty   = document.getElementById("cf-empty");
    const content = document.getElementById("cf-content");
    const reqId   = ++_cfReqId;
    skMostrar(empty);
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${_CF_API()}/resumo?${_cfQs()}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(rows => {
        if (reqId !== _cfReqId) return; // período já mudou de novo — resposta desatualizada, ignora
        empty.style.display = "none";
        content.style.display = "";
        _cfResumo = Array.isArray(rows) ? rows : [];
        _cfRenderCards();
        if (_cfTranspAtual) _cfCarregarDetalhe();
        else document.getElementById("cf-painel").style.display = "none";
    }).catch(() => {
        if (reqId === _cfReqId) skFim(empty, "Erro ao carregar dados do período.");
    });
}

// Recarrega só os cards (depois de upload/recálculo), sem esconder a tela.
function _cfAtualizarCards() {
    const reqId = _cfReqId;
    fetch(`${_CF_API()}/resumo?${_cfQs()}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(rows => {
        if (reqId !== _cfReqId) return;
        _cfResumo = Array.isArray(rows) ? rows : [];
        _cfRenderCards();
    }).catch(() => {});
}

function _cfRenderCards() {
    document.getElementById("cf-cards").innerHTML = _CF_TRANSPORTADORAS.map(t => {
        const r = _cfResumo.find(x => x.chave === t.key || x.transportadora === t.label);
        let corpo;
        if (!r) {
            corpo = `<div class="cft-card-vazio">Sem relatório</div>`;
        } else {
            const comData = r.dentro_prazo + r.fora_prazo;
            const pct = comData ? Math.round(r.dentro_prazo / comData * 100) : 0;
            corpo = `
                <div class="cft-card-linha"><strong>${r.total.toLocaleString("pt-BR")}</strong> pacotes${_cfEhShopee(t.key) ? "" : ` · <strong>${pct}%</strong> no prazo`}</div>
                <div class="cft-card-linha">Motoristas: <strong>${moedaJS(r.valor_motorista)}</strong></div>
                ${r.com_pendencia ? `<div class="cft-card-linha cft-card-pend">${r.com_pendencia.toLocaleString("pt-BR")} com pendência</div>` : ""}
                <div class="cft-arquivo" title="${_cfEsc(r.arquivo)}">${_cfEsc(r.arquivo || "")}</div>`;
        }
        return `<button class="cft-card${_cfTranspAtual === t.key ? " active" : ""}" style="--cft-cor:${t.cor}" onclick="_cfSelecionarTransp('${t.key}')">
            <div class="cft-card-nome">${t.label}</div>${corpo}</button>`;
    }).join("");
}

function _cfSelecionarTransp(key) {
    _cfTranspAtual = key;
    _cfBusca = ""; _cfFiltro = ""; _cfPagina = 0; _cfColFiltros = {}; _cfOrdem = null;
    _cfRenderCards();
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === key);
    document.getElementById("cf-painel-nome").innerText = cfg.label;
    document.getElementById("cf-upload-titulo").innerText = `Anexar relatório — ${cfg.label}`;
    document.getElementById("cf-upload-status").innerHTML = "";
    document.getElementById("cf-file-input").value = "";
    document.getElementById("cf-painel").style.display = "";
    // Shopee: segundo upload, dos onholds da quinzena.
    const oh = document.getElementById("cf-onholds-wrap");
    oh.style.display = _cfEhShopee(key) ? "" : "none";
    if (_cfEhShopee(key)) {
        document.getElementById("cf-onholds-titulo").innerText = `Alimentar onholds — ${cfg.label}`;
        document.getElementById("cf-onholds-input").value = "";
        _cfCarregarOnholdsInfo();
    }
    _cfCarregarDetalhe();
}

// ── Shopee: valores fixos por entregador (no lugar da performance) ──
let _cfFixos = [];

function _cfAbrirFixos() {
    const el = document.getElementById("cf-fixos");
    if (el.style.display !== "none") { el.style.display = "none"; return; }
    el.style.display = "";
    _cfCarregarFixos();
}

function _cfCarregarFixos(msg) {
    const el = document.getElementById("cf-fixos");
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    Promise.all([
        fetch(`${_CF_API()}/valores-fixos`, { headers: _cfHeaders() }).then(r => r.json()),
        _cfEntregadores ? Promise.resolve(_cfEntregadores)
            : fetch(`${_CF_API()}/entregadores`, { headers: _cfHeaders() }).then(r => r.json())
                .then(d => (_cfEntregadores = { nomes: d.nomes || [], aviso: d.aviso || null })).catch(() => ({ nomes: [] })),
    ]).then(([d, ent]) => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfFixos = d.linhas || [];
        el.innerHTML = `
            <div class="cft-barra" style="margin-top:0">
                <span class="cft-pend-titulo" style="color:#e2e8f0;margin:0">Valores fixos por entregador — Shopee</span>
            </div>
            <div class="cft-ajuda" style="margin-bottom:10px">Pra quem está aqui, todo pacote entregue vale o valor fixo, seja qual for a performance
                (vale pra Shopee Caçador e Videira). O entregador é o nome convertido — o "Driver" da tela.</div>
            <div class="cft-tabela-wrap"><table class="cft-tabela">
                <thead><tr><th>Entregador</th><th>R$ por pacote</th><th></th></tr></thead>
                <tbody>${_cfFixos.length ? _cfFixos.map(f => `<tr>
                    <td>${_cfEsc(f.entregador)}</td>
                    <td class="num">${_cfNum(f.valor)}</td>
                    <td><button class="cft-btn perigo" onclick="_cfRemoverFixo(${f.id})">Remover</button></td>
                </tr>`).join("") : `<tr><td colspan="3" class="cft-vazio" style="padding:14px">Ninguém com valor fixo.</td></tr>`}</tbody>
            </table></div>
            <div class="cft-barra">
                <input list="cf-fixo-lista" id="cf-fixo-nome" class="fech-select" placeholder="Entregador (ex.: Fulano - Cidade)" style="min-width:300px">
                <datalist id="cf-fixo-lista">${(ent.nomes || []).map(n => `<option value="${_cfEsc(n)}">`).join("")}</datalist>
                <input id="cf-fixo-valor" class="cft-input" placeholder="R$ por pacote" style="width:130px;margin:0" inputmode="decimal">
                <button class="cft-btn primario" id="cf-fixo-salvar" onclick="_cfSalvarFixo()">Adicionar / atualizar</button>
            </div>
            <div class="cft-ajuda" id="cf-fixo-status">${msg || ""}</div>`;
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar os valores fixos.</div>`; });
}

// Mudou valor fixo: recalcula a Shopee já enviada na quinzena aberta.
async function _cfRecalcularShopee() {
    const lotes = _cfQuinzena ? _cfResumo.map(x => x.chave).filter(_cfEhShopee) : [];
    for (const k of lotes) {
        await fetch(`${_CF_API()}/recalcular`, {
            method: "POST", headers: _cfHeaders(true),
            body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: k }),
        }).catch(() => {});
    }
    if (lotes.length) { _cfAtualizarCards(); if (_cfEhShopee(_cfTranspAtual)) _cfCarregarDetalhe(); }
    return lotes.length;
}

async function _cfSalvarFixo() {
    const entregador = document.getElementById("cf-fixo-nome").value.trim();
    const valor = document.getElementById("cf-fixo-valor").value.trim();
    const status = document.getElementById("cf-fixo-status");
    const btn = document.getElementById("cf-fixo-salvar");
    btn.disabled = true;
    status.innerText = "Salvando...";
    try {
        const r = await fetch(`${_CF_API()}/valores-fixos`, {
            method: "POST", headers: _cfHeaders(true), body: JSON.stringify({ entregador, valor }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        status.innerText = "Salvo. Recalculando a Shopee desta quinzena...";
        const n = await _cfRecalcularShopee();
        _cfCarregarFixos(n ? "Salvo e recalculado." : "Salvo. Vale nos próximos envios e recálculos da Shopee.");
    } catch (err) {
        btn.disabled = false;
        status.innerText = err.message;
    }
}

function _cfRemoverFixo(id) {
    const f = _cfFixos.find(x => x.id === id);
    gcConfirm(`Tirar o valor fixo de <b>${_cfEsc(f ? f.entregador : "")}</b>? Ele volta a ganhar pela performance.`, async () => {
        try {
            const r = await fetch(`${_CF_API()}/valores-fixos/${id}`, { method: "DELETE", headers: _cfHeaders() });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Erro ao remover.");
            const n = await _cfRecalcularShopee();
            _cfCarregarFixos(n ? "Removido e recalculado." : "Removido.");
        } catch (err) { gcAlert(err.message); }
    }, "Tirar valor fixo", "Tirar");
}

// ── Shopee: onholds da quinzena (Order ID, OnHold Time, OnHoldReason; Driver Name se tiver) ──
function _cfCarregarOnholdsInfo(msg) {
    const key = _cfTranspAtual;
    const el = document.getElementById("cf-onholds-status");
    fetch(`${_CF_API()}/onholds?${_cfQs({ transportadora: key })}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (key !== _cfTranspAtual) return;
        const arqs = d.arquivos || [];
        const lista = arqs.length ? `
            <div class="cft-tabela-wrap" style="margin-top:6px"><table class="cft-tabela">
                <thead><tr><th>Arquivo de onholds</th><th>Onholds</th><th>Enviado em</th><th></th></tr></thead>
                <tbody>${arqs.map(a => `<tr>
                    <td>${_cfEsc(a.arquivo || "(sem nome)")}</td>
                    <td class="num">${Number(a.total).toLocaleString("pt-BR")}</td>
                    <td>${a.enviado_em ? new Date(a.enviado_em).toLocaleString("pt-BR") : ""}</td>
                    <td><button class="cft-btn perigo" data-envio="${_cfEsc(a.envio_id)}" data-nome="${_cfEsc(a.arquivo || "")}" onclick="_cfRemoverOnholds(this.dataset.envio, this.dataset.nome)">Remover</button></td>
                </tr>`).join("")}</tbody>
            </table></div>
            <div style="margin-top:4px">${Number(d.total || 0).toLocaleString("pt-BR")} onholds valendo neste fechamento (repetido entre arquivos conta uma vez).</div>`
            : "Nenhum onhold desta quinzena ainda — sem eles, todo mundo fica com 100% de performance.";
        el.innerHTML = (msg ? `<div>${msg}</div>` : "") + lista;
    }).catch(() => {});
}

// Vários arquivos de uma vez: um por um, cada um soma aos que já estão.
async function _cfOnholdsSelecionado(input) {
    const arquivos = [...(input.files || [])];
    input.value = "";
    if (!arquivos.length) return;
    const key = _cfTranspAtual;
    const el = document.getElementById("cf-onholds-status");
    const n = (x) => Number(x || 0).toLocaleString("pt-BR");
    const msgs = [];
    let recalculado = false;
    for (const file of arquivos) {
        el.innerText = `Lendo ${file.name}...`;
        try {
            const grid = await _cfLerGrid(file);
            // Só as colunas que interessam (arquivo de onholds pode ser grande).
            const { grid: enviar } = _cfSoColunasUteis(grid, ["Order ID", "OnHold Time", "On Hold Time", "OnHoldReason", "OnHold Reason", "On Hold Reason", "Driver Name"]);
            el.innerText = `Gravando ${file.name} (${n(grid.length - 1)} linhas)...`;
            const r = await fetch(`${_CF_API()}/onholds`, {
                method: "POST", headers: _cfHeaders(true),
                body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: key, arquivo: file.name, grid: enviar }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) {
                msgs.push(`<span class="cft-erro">${_cfEsc(file.name)}: ${_cfEsc(d.error || "erro ao enviar.")}</span>`
                    + (d.cabecalho_encontrado ? `<div class="cft-pend-tags">${d.cabecalho_encontrado.map(h => `<span class="cft-tag">${_cfEsc(h)}</span>`).join("")}</div>` : ""));
                continue;
            }
            recalculado = recalculado || d.recalculado;
            msgs.push(_cfEsc(`${file.name}: ${n(d.gravados)} onholds da quinzena`
                + (d.fora_da_quinzena ? ` · ${n(d.fora_da_quinzena)} fora da quinzena ignorados` : "")
                + (d.sem_data ? ` · ${n(d.sem_data)} sem OnHold Time` : "")));
        } catch (err) {
            msgs.push(`<span class="cft-erro">${_cfEsc(file.name)}: ${_cfEsc(err.message)}</span>`);
        }
    }
    if (key !== _cfTranspAtual) return;
    _cfCarregarOnholdsInfo(msgs.join("<br>") + (recalculado ? "<br>Valores recalculados." : ""));
    if (recalculado) { _cfAtualizarCards(); _cfCarregarDetalhe(); }
}

function _cfRemoverOnholds(envio, nome) {
    gcConfirm(`Remover o arquivo de onholds <b>${_cfEsc(nome || "(sem nome)")}</b> deste fechamento? Os valores são recalculados.`, async () => {
        const key = _cfTranspAtual;
        try {
            const r = await fetch(`${_CF_API()}/onholds/${encodeURIComponent(envio)}?${_cfQs({ transportadora: key })}`,
                { method: "DELETE", headers: _cfHeaders() });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Erro ao remover.");
            if (key !== _cfTranspAtual) return;
            _cfCarregarOnholdsInfo(_cfEsc(`${nome || "Arquivo"} removido.`) + (d.recalculado ? " Valores recalculados." : ""));
            if (d.recalculado) { _cfAtualizarCards(); _cfCarregarDetalhe(); }
        } catch (err) { gcAlert(err.message); }
    }, "Remover onholds", "Remover");
}

// ── Shopee: performance por usuário e dia (entregues ÷ (entregues + onholds)) ──
let _cfPerfLinhas = [];
const _CF_DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function _cfCarregarPerformance() {
    const key = _cfTranspAtual;
    const el = document.getElementById("cf-perf");
    if (!el) return;
    el.innerHTML = `<div class="cft-ajuda">Carregando performance...</div>`;
    fetch(`${_CF_API()}/performance?${_cfQs({ transportadora: key })}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (key !== _cfTranspAtual) return;
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfPerfLinhas = d.linhas || [];
        el.innerHTML = `
            <div class="cft-barra" style="justify-content:space-between">
                <span class="cft-pend-titulo" style="color:#e2e8f0;margin:0">Performance por usuário e dia</span>
                <div class="adm-search-input-area" style="max-width:260px">
                    <input type="text" id="cf-perf-busca" placeholder="Usuário ou driver..." oninput="_cfRenderPerformance()">
                </div>
            </div>
            <div class="cft-ajuda" style="margin-bottom:8px">Performance = entregues ÷ (entregues + onholds) do usuário no dia.
                Entregador em "Valores fixos" ganha o valor dele, seja qual for a performance.
                Seg a sáb: ≤ 95% R$ 1,80 · &lt; 98% R$ 2,00 · &lt; 99,5% R$ 2,50 · ≥ 99,5% R$ 2,60. Domingo: ≤ 90% R$ 2,40 · &lt; 98% R$ 2,50 · ≥ 98% R$ 2,60.</div>
            <div class="cft-tabela-wrap" style="max-height:420px;overflow-y:auto"><table class="cft-tabela">
                <thead><tr><th>Dia</th><th>Usuário</th><th>Driver</th><th>Entregues</th><th>Onholds</th><th>Performance</th><th>R$/pacote</th><th>Total</th></tr></thead>
                <tbody id="cf-perf-tbody"></tbody>
            </table></div>
            <div class="cft-ajuda" style="margin:6px 0 18px" id="cf-perf-total"></div>`;
        _cfRenderPerformance();
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar a performance.</div>`; });
}

function _cfRenderPerformance() {
    const busca = _cfChave((document.getElementById("cf-perf-busca") || {}).value || "");
    const lista = _cfPerfLinhas.filter(l => !busca || _cfChave(l.usuario).includes(busca) || _cfChave(l.driver).includes(busca));
    const diaSem = (iso) => _CF_DIAS_SEMANA[new Date(iso + "T12:00:00Z").getUTCDay()];
    document.getElementById("cf-perf-tbody").innerHTML = lista.length ? lista.slice(0, 1000).map(l => `<tr>
            <td>${_cfDia(l.dia)} <span class="cft-ajuda">${diaSem(l.dia)}</span></td>
            <td>${_cfEsc(l.usuario)}</td>
            <td>${l.driver ? _cfEsc(l.driver) : `<span class="cft-vazio">—</span>`}</td>
            <td class="num">${l.entregues.toLocaleString("pt-BR")}</td>
            <td class="num${l.onholds ? " cft-neg" : ""}">${l.onholds.toLocaleString("pt-BR")}</td>
            <td class="num">${_cfNum(l.pct, 2)}%</td>
            <td class="num">${l.fixo ? `<span class="cft-ajuda" title="Valor fixo do entregador (Valores fixos)">fixo</span> ` : ""}${_cfNum(l.valor)}</td>
            <td class="num cft-pos"><strong>${_cfNum(l.total)}</strong></td>
        </tr>`).join("")
        : `<tr><td colspan="8" class="cft-vazio" style="padding:14px">Nada por aqui.</td></tr>`;
    const tot = lista.reduce((s, l) => s + l.total, 0);
    document.getElementById("cf-perf-total").innerText =
        `${lista.length.toLocaleString("pt-BR")} linha${lista.length !== 1 ? "s" : ""} (usuário × dia) · total ${moedaJS(tot)}`;
}

function _cfCarregarDetalhe() {
    const key = _cfTranspAtual;
    const reqId = _cfReqId;
    const det = document.getElementById("cf-detalhe");
    det.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CF_API()}/lote?${_cfQs({ transportadora: key })}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (reqId !== _cfReqId || key !== _cfTranspAtual) return;
        if (d.error) { det.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfTemLote = !!d.lote;
        if (d.lote) {
            const quando = new Date(d.lote.recalculado_em || d.lote.enviado_em);
            document.getElementById("cf-painel-arquivo").innerText =
                `${d.lote.arquivo || "relatório"} · ${d.lote.recalculado_em ? "recalculado" : "enviado"} em ${quando.toLocaleString("pt-BR")}`;
        } else {
            document.getElementById("cf-painel-arquivo").innerText = "";
        }
        if (!d.lote) {
            det.innerHTML = `<div class="cft-ajuda">Nenhum relatório dessa transportadora nesta quinzena ainda.</div>`;
            return;
        }
        det.innerHTML = _cfHtmlResumo(d.resumo) + _cfHtmlAcoes()
            + (_cfEhShopee(key) ? `<div id="cf-perf"></div>` : "") + _cfHtmlTabelaBase();
        if (_cfEhShopee(key)) _cfCarregarPerformance();
        _cfCarregarPacotes();
    }).catch(() => {
        if (reqId === _cfReqId) det.innerHTML = `<div class="cft-erro">Erro ao carregar o fechamento.</div>`;
    });
}

function _cfHtmlResumo(r) {
    const comData = r.dentro_prazo + r.fora_prazo;
    const pct = comData ? Math.round(r.dentro_prazo / comData * 100) : 0;
    const perf = r.performance;
    const kpis = _cfEhShopee(_cfTranspAtual) ? `
        <div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor">${r.total.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Pacotes</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${perf ? _cfNum(perf.pct, 2) + "%" : "—"}</div><div class="cft-kpi-rotulo">Performance geral</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${perf ? perf.onholds.toLocaleString("pt-BR") : "—"}</div><div class="cft-kpi-rotulo">Onholds na quinzena${perf && perf.onholds_sem_entregador ? ` · <span class="cft-neg">${perf.onholds_sem_entregador} sem entregador</span>` : ""}</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor cft-pos">${moedaJS(r.valor_motorista)}</div><div class="cft-kpi-rotulo">Valor motoristas</div></div>
        </div>` : `
        <div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor">${r.total.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Pacotes</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${pct}%</div><div class="cft-kpi-rotulo">${r.dentro_prazo.toLocaleString("pt-BR")} no prazo</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${r.fora_prazo.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Fora do prazo</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor cft-pos">${moedaJS(r.valor_motorista)}</div><div class="cft-kpi-rotulo">Valor motoristas</div></div>
        </div>`;

    const tags = (lista) => `<div class="cft-pend-tags">${lista.map(x =>
        `<span class="cft-tag">${_cfEsc(x.nome)} <b>${x.qtd}</b></span>`).join("")}</div>`;
    const grupos = [];
    // Antes de montar os grupos: as tags clicáveis leem daqui.
    _cfNomesPend = r.nomes_sem_conversao.map(x => ({ ...x, feito: null }));
    _cfCidadesPend = [
        ...r.cidades_sem_preco.map(x => ({ ...x, feito: null, tipo: "preco" })),
        ...(r.cidades_sem_conversao || []).map(x => ({ ...x, feito: null, tipo: "conv" })),
    ];
    if (r.cidades_sem_preco.length) grupos.push(_CF_CONVERTE_CIDADE.includes(_cfTranspAtual)
        ? `<div class="cft-pend-grupo"><b>Cidade sem preço na planilha</b> — clique na cidade pra dizer qual é a certa (ou cadastre na aba da transportadora):<div class="cft-pend-tags" id="cf-cidades-pend">${_cfHtmlCidadesPend("preco")}</div></div>`
        : `<div class="cft-pend-grupo"><b>Cidade sem preço na planilha</b> — sem valor nem prazo até cadastrar na aba da transportadora:${tags(r.cidades_sem_preco)}</div>`);
    if ((r.cidades_sem_conversao || []).length && _CF_CONVERTE_CIDADE.includes(_cfTranspAtual)) grupos.push(
        `<div class="cft-pend-grupo"><b>Cidade sem conversão</b> — achou preço pelo nome, mas ainda não está na Conversão de cidades. Clique pra confirmar (ou trocar):<div class="cft-pend-tags" id="cf-cidades-conv-pend">${_cfHtmlCidadesPend("conv")}</div></div>`);
    if ((r.ceps_sem_cidade || []).length) grupos.push(`<div class="cft-pend-grupo"><b>CEP sem cidade</b> — não está na planilha de CEP do Planejamento (aba Cep Geral); a cidade fica em branco:${tags(r.ceps_sem_cidade)}</div>`);
    if (r.tipos_sem_preco.length) grupos.push(`<div class="cft-pend-grupo"><b>Tipo de produto sem coluna de preço</b>:${tags(r.tipos_sem_preco)}</div>`);
    if (r.nomes_sem_conversao.length) grupos.push(`<div class="cft-pend-grupo"><b>Usuário sem conversão de nome</b> — clique no nome pra dizer quem é o entregador:<div class="cft-pend-tags" id="cf-nomes-pend">${_cfHtmlNomesPend()}</div></div>`);
    if (r.sem_data_entrega) grupos.push(`<div class="cft-pend-grupo"><b>${r.sem_data_entrega}</b> sem data de entrega (não pagos)</div>`);
    if (r.sem_data_atribuicao) grupos.push(`<div class="cft-pend-grupo"><b>${r.sem_data_atribuicao}</b> sem data de atribuição (prazo não calculado)</div>`);
    const pend = grupos.length ? `
        <div class="cft-pend">
            <div class="cft-pend-titulo">Pendências</div>
            ${grupos.join("")}
            <div class="cft-ajuda" style="margin-top:10px">Depois de corrigir, clique em Recalcular — não precisa reenviar o relatório.</div>
        </div>` : "";
    return kpis + pend;
}

function _cfHtmlCidadesPend(tipo) {
    return _cfCidadesPend.map((x, i) => x.tipo !== tipo ? "" : x.feito
        ? `<span class="cft-tag cft-tag-ok" title="${_cfEsc(x.nome)} → ${_cfEsc(x.feito)}">${_cfEsc(x.nome)}<span>→ ${_cfEsc(x.feito)}</span></span>`
        : `<button class="cft-tag cft-tag-btn" onclick="_cfAbrirCidadeCerta(${i})"${(x.variantes || []).length > 1 ? ` title="Grafias no relatório: ${_cfEsc(x.variantes.join(" · "))}"` : ""}>${_cfEsc(x.nome)}${(x.variantes || []).length > 1 ? ` <span class="cft-ajuda">+${x.variantes.length - 1} grafia${x.variantes.length > 2 ? "s" : ""}</span>` : ""} <b>${x.qtd}</b></button>`
    ).join("");
}

// ── Card "Qual é a cidade certa?": cidade do relatório sem preço → escolhe uma cidade da aba
// da transportadora na planilha. Grava na Conversão de cidades (mesma tabela do CSV).
async function _cfAbrirCidadeCerta(i) {
    const item = _cfCidadesPend[i];
    if (!item) return;
    _cfFecharConversao();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "cf-conv";
    ov.innerHTML = `
        <div class="cft-modal">
            <div class="cft-modal-titulo">Qual é a cidade certa?</div>
            <div class="cft-ajuda" style="margin-bottom:12px">No relatório aparece <b style="color:#e2e8f0">${_cfEsc(item.nome)}</b>
                — ${item.qtd.toLocaleString("pt-BR")} pacote${item.qtd !== 1 ? "s" : ""} sem preço.</div>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
                <label class="cft-rotulo" for="cf-conv-input">Cidade da planilha de precificação</label>
                <span class="cft-ajuda" id="cf-conv-total"></span>
            </div>
            <input id="cf-conv-input" class="cft-input" autocomplete="off" placeholder="Digite pra buscar..."
                value="${_cfEsc(item.tipo === "conv" ? item.nome : String(item.nome).slice(0, 4))}" oninput="_cfFiltrarCidadesPlan(this.value)"
                onkeydown="if(event.key==='Enter')_cfSalvarCidadeCerta(${i})">
            <div class="cft-sugestoes" id="cf-conv-sugestoes"></div>
            <div class="cft-ajuda" id="cf-conv-status" style="min-height:18px;margin-top:8px"></div>
            <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
                <button class="cft-btn" onclick="_cfFecharConversao()">Cancelar</button>
                <button class="cft-btn primario" id="cf-conv-salvar" onclick="_cfSalvarCidadeCerta(${i})">Salvar</button>
            </div>
        </div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _cfFecharConversao(); });
    document.body.appendChild(ov);
    const inp = document.getElementById("cf-conv-input");
    inp.focus(); inp.select();
    if (!_cfCidadesPlan) {
        document.getElementById("cf-conv-sugestoes").innerHTML = `<div class="cft-ajuda" style="padding:6px 2px">Lendo a planilha de precificação...</div>`;
        try {
            const d = await fetch(`${_CF_API()}/cidades-planilha?transportadora=${_cfTranspAtual}`, { headers: _cfHeaders() }).then(r => r.json());
            if (d.error) throw new Error(d.error);
            _cfCidadesPlan = d.cidades || [];
        } catch (err) {
            const el = document.getElementById("cf-conv-sugestoes");
            if (el) el.innerHTML = `<div class="cft-erro">${_cfEsc(err.message || "Erro ao ler a planilha.")}</div>`;
            return;
        }
    }
    const atual = document.getElementById("cf-conv-input");
    if (!atual) return;
    // "Sem conversão" já achou a cidade na planilha pelo nome: deixa ela escolhida, é só confirmar.
    const mesma = item.tipo === "conv" && _cfCidadesPlan.find(c => _cfChave(c) === _cfChave(item.nome));
    if (mesma) atual.value = mesma;
    _cfFiltrarCidadesPlan(atual.value);
}

function _cfFiltrarCidadesPlan(q) {
    const el = document.getElementById("cf-conv-sugestoes");
    if (!el || !_cfCidadesPlan) return;
    const termo = _cfChave(q);
    const comeca = [], contem = [];
    for (const c of _cfCidadesPlan) {
        const k = _cfChave(c);
        if (!termo || k.startsWith(termo)) comeca.push(c);
        else if (k.includes(termo)) contem.push(c);
    }
    const lista = comeca.concat(contem);
    el.innerHTML = lista.length
        ? lista.slice(0, 200).map(c => `<button class="cft-sugestao" data-nome="${_cfEsc(c)}" onclick="_cfEscolherCidadePlan(this.dataset.nome)">${_cfEsc(c)}</button>`).join("")
        : `<div class="cft-ajuda" style="padding:6px 2px">Nenhuma cidade da planilha com esse nome.</div>`;
    const cont = document.getElementById("cf-conv-total");
    if (cont) cont.innerText = `${lista.length} de ${_cfCidadesPlan.length} cidades`;
}

function _cfEscolherCidadePlan(nome) {
    const inp = document.getElementById("cf-conv-input");
    inp.value = nome;
    document.getElementById("cf-conv-sugestoes").innerHTML = "";
    inp.focus();
}

function _cfSalvarCidadeCerta(i) {
    const item = _cfCidadesPend[i];
    const correta = document.getElementById("cf-conv-input").value.trim();
    const status = document.getElementById("cf-conv-status");
    const btn = document.getElementById("cf-conv-salvar");
    // Só aceita cidade que existe na planilha — o motivo de converter é achar o preço.
    const daPlanilha = (_cfCidadesPlan || []).find(c => _cfChave(c) === _cfChave(correta));
    if (!daPlanilha) { status.innerText = "Escolha uma cidade da lista (precisa existir na planilha de precificação)."; return; }
    btn.disabled = true;
    status.innerText = "Salvando...";
    fetch(`${_CF_API()}/cidades-conversao`, {
        method: "POST", headers: _cfHeaders(true),
        body: JSON.stringify({ transportadora: _cfTranspAtual, cidade_errada: item.nome, cidade_correta: daPlanilha }),
    }).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { btn.disabled = false; status.innerText = d.error || "Erro ao salvar."; return; }
        item.feito = daPlanilha;
        _cfFecharConversao();
        const lista = document.getElementById("cf-cidades-pend");
        if (lista) lista.innerHTML = _cfHtmlCidadesPend("preco");
        const listaConv = document.getElementById("cf-cidades-conv-pend");
        if (listaConv) listaConv.innerHTML = _cfHtmlCidadesPend("conv");
        const st = document.getElementById("cf-acao-status");
        if (st) st.innerText = "Conversão de cidade salva — clique em Recalcular pra aplicar nos pacotes.";
    }).catch(() => { btn.disabled = false; status.innerText = "Erro ao salvar."; });
}

// ── Tela Conversão de cidades (por enquanto só Loggi): subir CSV "Cidade Errada | Cidade
// Correta", ver e remover. Acrescenta/atualiza, nunca apaga o que não veio no arquivo.
function _cfAbrirConvCidades() {
    const el = document.getElementById("cf-cidades");
    if (el.style.display !== "none") { el.style.display = "none"; return; }
    el.style.display = "";
    _cfCarregarConvCidades();
}

function _cfCarregarConvCidades(msg) {
    const el = document.getElementById("cf-cidades");
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CF_API()}/cidades-conversao?transportadora=loggi`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfConvCidades = d.linhas || [];
        _cfRenderConvCidades(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar a conversão de cidades.</div>`; });
}

function _cfRenderConvCidades(msg) {
    const el = document.getElementById("cf-cidades");
    const busca = _cfChave((document.getElementById("cf-cid-busca") || {}).value || "");
    const lista = _cfConvCidades.filter(l => _cfBateConvCidade(l, busca));
    el.innerHTML = `
        <div class="cft-barra" style="margin-top:0">
            <span class="cft-pend-titulo" style="color:#e2e8f0;margin:0">Conversão de cidades — Loggi</span>
            <span class="cft-ajuda">por enquanto só vale pra Loggi</span>
        </div>
        <div class="cft-ajuda" style="margin-bottom:10px">Cidade escrita errada no relatório → cidade certa (como está na planilha de precificação).
            Suba um CSV ou planilha com as colunas <b>Cidade Errada</b> e <b>Cidade Correta</b>: o que vier no arquivo é acrescentado ou atualizado, o resto fica.
            Também dá pra clicar na cidade sem preço nas Pendências da Loggi.</div>
        <div class="cft-barra">
            <label class="cft-btn" style="cursor:pointer">Subir CSV
                <input type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="_cfImportarConvCidades(this)">
            </label>
            <span style="flex:1"></span>
            <div class="adm-search-input-area" style="max-width:260px">
                <input type="text" id="cf-cid-busca" placeholder="Buscar cidade..." value="" oninput="_cfRenderConvCidadesBusca()">
            </div>
        </div>
        <div class="cft-ajuda" id="cf-cid-status" style="margin-bottom:8px">${msg || ""}</div>
        <div class="cft-tabela-wrap" style="max-height:360px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Cidade errada (todas as grafias)</th><th>Cidade correta</th><th></th></tr></thead>
            <tbody id="cf-cid-tbody">${_cfLinhasConvCidades(lista)}</tbody>
        </table></div>
        <div class="cft-ajuda" style="margin-top:6px" id="cf-cid-total">${_cfConvCidades.length.toLocaleString("pt-BR")} conversões</div>`;
}

// Grafias da cidade errada: a principal + as outras que vieram no(s) CSV(s) — tudo isso
// vira a mesma cidade (sem acento/maiúscula/UF), então é uma linha só.
function _cfGrafias(l) {
    return [...new Set([l.cidade_errada, ...(l.variantes || [])])];
}

function _cfBateConvCidade(l, busca) {
    return !busca || _cfGrafias(l).some(g => _cfChave(g).includes(busca)) || _cfChave(l.cidade_correta).includes(busca);
}

function _cfLinhasConvCidades(lista) {
    return lista.length
        ? lista.slice(0, 500).map(l => `<tr>
            <td>${_cfGrafias(l).map(_cfEsc).join(" · ")}</td><td>${_cfEsc(l.cidade_correta)}</td>
            <td><button class="cft-btn perigo" onclick="_cfRemoverConvCidade(${l.id})">Remover</button></td>
        </tr>`).join("")
        : `<tr><td colspan="3" class="cft-vazio" style="padding:14px">Nenhuma conversão.</td></tr>`;
}

function _cfRenderConvCidadesBusca() {
    const busca = _cfChave(document.getElementById("cf-cid-busca").value);
    const lista = _cfConvCidades.filter(l => _cfBateConvCidade(l, busca));
    document.getElementById("cf-cid-tbody").innerHTML = _cfLinhasConvCidades(lista);
}

async function _cfImportarConvCidades(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const status = document.getElementById("cf-cid-status");
    status.innerText = "Lendo arquivo...";
    try {
        const grid = await _cfLerGrid(file);
        const cab = (grid[0] || []).map(h => _cfChave(h));
        const iE = cab.indexOf("cidade errada"), iC = cab.indexOf("cidade correta");
        if (iE < 0 || iC < 0) throw new Error('O arquivo precisa das colunas "Cidade Errada" e "Cidade Correta".');
        const linhas = grid.slice(1).map(r => [r[iE] ?? "", r[iC] ?? ""]).filter(([e, c]) => String(e).trim() || String(c).trim());
        status.innerText = `Gravando ${linhas.length.toLocaleString("pt-BR")} linhas...`;
        const r = await fetch(`${_CF_API()}/cidades-conversao`, {
            method: "POST", headers: _cfHeaders(true), body: JSON.stringify({ transportadora: "loggi", linhas }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao importar.");
        _cfCarregarConvCidades(_cfMsgImportCidades(linhas.length, d));
    } catch (err) {
        status.innerText = err.message;
    }
}

// Resultado da importação: por que "N linhas" virou "M conversões" — vazias, variações da
// mesma cidade (sem acento/maiúscula/UF/" - ...") juntadas numa só, e conflitos.
function _cfMsgImportCidades(totalLinhas, d) {
    const n = (x) => Number(x || 0).toLocaleString("pt-BR");
    const partes = [`${n(totalLinhas)} linhas no arquivo → ${n(d.gravados)} conversões gravadas.`];
    if (d.juntadas) partes.push(`${n(d.juntadas)} linha${d.juntadas !== 1 ? "s eram" : " era"} a mesma cidade escrita de outro jeito (acento, maiúscula, UF ou " - ..." no fim) e ${d.juntadas !== 1 ? "viraram" : "virou"} uma só.`);
    if (d.ignorados) partes.push(`${n(d.ignorados)} linha${d.ignorados !== 1 ? "s" : ""} sem Cidade Errada ou Cidade Correta.`);
    let html = `<div>${_cfEsc(partes.join(" "))} Recalcule a Loggi pra aplicar.</div>`;
    if ((d.conflitos || []).length) {
        html += `<div class="cft-erro" style="margin-top:6px">Atenção — ${d.conflitos.length} cidade${d.conflitos.length !== 1 ? "s" : ""} com corretas diferentes no arquivo; ficou valendo a última de cada:</div>
            <div class="cft-pend-tags">${d.conflitos.map(c => `<span class="cft-tag">${_cfEsc(c.erradas.join(" / "))} → ${_cfEsc(c.corretas.join(" ou "))} · ficou <b>${_cfEsc(c.ficou)}</b></span>`).join("")}</div>`;
    }
    return html;
}

function _cfRemoverConvCidade(id) {
    const l = _cfConvCidades.find(x => x.id === id);
    gcConfirm(`Remover a conversão <b>${_cfEsc(l ? l.cidade_errada : "")}</b> → <b>${_cfEsc(l ? l.cidade_correta : "")}</b>?`, () => {
        fetch(`${_CF_API()}/cidades-conversao/${id}`, { method: "DELETE", headers: _cfHeaders() })
        .then(r => r.json())
        .then(d => { if (d.error) gcAlert(d.error); else _cfCarregarConvCidades(_cfEsc("Removida. Recalcule a Loggi pra aplicar.")); })
        .catch(() => gcAlert("Erro ao remover."));
    }, "Remover conversão", "Remover");
}

function _cfHtmlNomesPend() {
    return _cfNomesPend.map((x, i) => x.feito
        ? `<span class="cft-tag cft-tag-ok" title="${_cfEsc(x.nome)} → ${_cfEsc(x.feito)}">${_cfEsc(x.nome)}<span>→ ${_cfEsc(x.feito)}</span></span>`
        : `<button class="cft-tag cft-tag-btn" onclick="_cfAbrirConversao(${i})">${_cfEsc(x.nome)} <b>${x.qtd}</b></button>`
    ).join("");
}

// ── Card de conversão de nome: nome do relatório → entregador responsável. Grava na
// Conversão de nomes (POST /admin/nomes-padrao), a mesma lista de Cadastros › Usuários.
function _cfAbrirConversao(i) {
    const item = _cfNomesPend[i];
    if (!item) return;
    _cfFecharConversao();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "cf-conv";
    // Sugestão inicial: a primeira parte do usuário ("kauane.maciel" → "kauane").
    const palpite = String(item.nome).split(/[.\s_-]+/).filter(Boolean)[0] || item.nome;
    ov.innerHTML = `
        <div class="cft-modal">
            <div class="cft-modal-titulo">Quem é o entregador?</div>
            <div class="cft-ajuda" style="margin-bottom:12px">No relatório aparece <b style="color:#e2e8f0">${_cfEsc(item.nome)}</b>
                — ${item.qtd.toLocaleString("pt-BR")} pacote${item.qtd !== 1 ? "s" : ""}.</div>
            <div class="cft-cidades" id="cf-conv-cidades-rel"></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
                <label class="cft-rotulo" for="cf-conv-input">Entregador responsável</label>
                <span class="cft-ajuda" id="cf-conv-total"></span>
            </div>
            <input id="cf-conv-input" class="cft-input" autocomplete="off" placeholder="Digite pra buscar..." value="${_cfEsc(palpite)}"
                oninput="_cfBuscarEntregador(this.value)" onkeydown="if(event.key==='Enter')_cfSalvarConversao(${i})">
            <div class="cft-sugestoes" id="cf-conv-sugestoes"></div>
            <div class="cft-novo" id="cf-conv-novo">
                <span class="cft-ajuda">Não achou?</span>
                <button class="cft-link" onclick="_cfAbrirNovoEntregador()">Cadastrar novo entregador</button>
            </div>
            <div class="cft-cidades" id="cf-conv-cidades-ent"></div>
            <div class="cft-ajuda" id="cf-conv-status" style="min-height:18px;margin-top:8px"></div>
            <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
                <button class="cft-btn" onclick="_cfFecharConversao()">Cancelar</button>
                <button class="cft-btn primario" id="cf-conv-salvar" onclick="_cfSalvarConversao(${i})">Salvar</button>
            </div>
        </div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _cfFecharConversao(); });
    document.body.appendChild(ov);
    const inp = document.getElementById("cf-conv-input");
    inp.focus(); inp.select();
    _cfBuscarEntregador(palpite);
    _cfMostrarCidades("cf-conv-cidades-rel", `${_CF_API()}/cidades?${_cfQs({ transportadora: _cfTranspAtual, usuario: item.nome })}`,
        `Cidades de <b>${_cfEsc(item.nome)}</b> neste relatório`, "Sem cidade neste relatório.");
}

// Cidades (com quantos pacotes) — pra reconhecer quem é quem pelo lugar que atende.
function _cfMostrarCidades(id, url, titulo, vazio) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.url = url;
    el.innerHTML = `<div class="cft-ajuda">${titulo}: carregando...</div>`;
    fetch(url, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (el.dataset.url !== url) return; // clicou em outro enquanto carregava
        const cidades = d.cidades || [];
        el.innerHTML = `<div class="cft-ajuda">${titulo}:</div>` + (cidades.length
            ? `<div class="cft-pend-tags">${cidades.map(c => `<span class="cft-tag">${_cfEsc(c.cidade)} <b>${c.qtd.toLocaleString("pt-BR")}</b></span>`).join("")}</div>`
            : `<div class="cft-ajuda" style="font-style:italic">${vazio}</div>`);
    }).catch(() => { if (el.dataset.url === url) el.innerHTML = `<div class="cft-erro">Erro ao carregar cidades.</div>`; });
}

function _cfFecharConversao() {
    const ov = document.getElementById("cf-conv");
    if (ov) ov.remove();
}

// Lista inteira vem uma vez (planilha Dados entregadores + Conversão de nomes) e o filtro
// é local — digitar não fica esperando o Google a cada letra.
function _cfBuscarEntregador(q) {
    const el = document.getElementById("cf-conv-sugestoes");
    if (!el) return;
    // Digitou de novo: as cidades do entregador escolhido antes não valem mais.
    const ent = document.getElementById("cf-conv-cidades-ent");
    if (ent) { ent.innerHTML = ""; ent.dataset.url = ""; }
    if (!_cfEntregadores) {
        el.innerHTML = `<div class="cft-ajuda" style="padding:6px 2px">Carregando entregadores...</div>`;
        fetch(`${_CF_API()}/entregadores`, { headers: _cfHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.error) throw new Error(d.error);
            _cfEntregadores = { nomes: d.nomes || [], aviso: d.aviso || null };
            const atual = document.getElementById("cf-conv-input");
            if (atual) _cfBuscarEntregador(atual.value);
        }).catch(err => { el.innerHTML = `<div class="cft-erro">${_cfEsc(err.message || "Erro ao carregar entregadores.")}</div>`; });
        return;
    }
    const termo = _cfChave(q);
    // Começa com o termo primeiro, depois quem só contém; vazio mostra todo mundo.
    const todos = _cfEntregadores.nomes;
    const comeca = [], contem = [];
    for (const n of todos) {
        const k = _cfChave(n);
        if (!termo || k.startsWith(termo)) comeca.push(n);
        else if (k.includes(termo)) contem.push(n);
    }
    const lista = comeca.concat(contem);
    const aviso = _cfEntregadores.aviso ? `<div class="cft-erro" style="font-size:12px;padding:4px 2px">${_cfEsc(_cfEntregadores.aviso)}</div>` : "";
    el.innerHTML = aviso + (lista.length
        ? lista.slice(0, 200).map(n => `<button class="cft-sugestao" data-nome="${_cfEsc(n)}" onclick="_cfEscolherEntregador(this.dataset.nome)">${_cfEsc(n)}</button>`).join("")
          + (lista.length > 200 ? `<div class="cft-ajuda" style="padding:6px 2px">+${lista.length - 200} — digite mais pra filtrar.</div>` : "")
        : `<div class="cft-ajuda" style="padding:6px 2px">Ninguém com esse nome nos Dados entregadores — salvar cria um nome novo.</div>`);
    const cont = document.getElementById("cf-conv-total");
    if (cont) cont.innerText = `${lista.length} de ${todos.length} entregadores`;
}

// Cadastro de entregador novo pela própria tela: grava na aba "Solicitação de usuários"
// da planilha Dados entregadores (mesmo "Inserir Entregador" do Planejamento).
function _cfAbrirNovoEntregador() {
    const el = document.getElementById("cf-conv-novo");
    const digitado = (document.getElementById("cf-conv-input").value || "").trim();
    el.innerHTML = `
        <label class="cft-rotulo" for="cf-novo-nome">Novo entregador</label>
        <input id="cf-novo-nome" class="cft-input" autocomplete="off" placeholder="Nome Sobrenome - Cidade" value="${_cfEsc(digitado)}"
            onkeydown="if(event.key==='Enter')_cfCadastrarEntregador()">
        <div class="cft-ajuda" style="margin-top:6px">Modelo: <b style="color:#cbd5e1">Nome Sobrenome - Cidade</b>. Vai pra aba Solicitação de usuários dos Dados entregadores.</div>
        <div class="cft-barra" style="margin:8px 0 0">
            <button class="cft-btn" id="cf-novo-btn" onclick="_cfCadastrarEntregador()">Cadastrar</button>
            <span class="cft-ajuda" id="cf-novo-status"></span>
        </div>`;
    const inp = document.getElementById("cf-novo-nome");
    inp.focus();
}

function _cfCadastrarEntregador() {
    const nome = document.getElementById("cf-novo-nome").value.trim();
    const btn = document.getElementById("cf-novo-btn");
    const status = document.getElementById("cf-novo-status");
    if (!nome) { status.innerText = "Digite o nome."; return; }
    btn.disabled = true;
    status.innerText = "Cadastrando...";
    fetch(`${_CF_API()}/entregadores`, { method: "POST", headers: _cfHeaders(true), body: JSON.stringify({ nome }) })
    .then(async r => {
        const d = await r.json().catch(() => ({}));
        btn.disabled = false;
        if (!r.ok) { status.innerText = d.error || "Erro ao cadastrar."; return; }
        if (_cfEntregadores && !_cfEntregadores.nomes.includes(d.nome)) {
            _cfEntregadores.nomes.push(d.nome);
            _cfEntregadores.nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
        }
        const novo = document.getElementById("cf-conv-novo");
        novo.innerHTML = `<span class="cft-ajuda">${_cfEsc(d.nome)} cadastrado nos Dados entregadores. Clique em Salvar pra ligar ao nome do relatório.</span>`;
        _cfEscolherEntregador(d.nome);
    }).catch(() => { btn.disabled = false; status.innerText = "Erro ao cadastrar."; });
}

function _cfEscolherEntregador(nome) {
    const inp = document.getElementById("cf-conv-input");
    inp.value = nome;
    document.getElementById("cf-conv-sugestoes").innerHTML = "";
    inp.focus();
    _cfMostrarCidades("cf-conv-cidades-ent", `${_CF_API()}/cidades?driver=${encodeURIComponent(nome)}`,
        `Cidades que <b>${_cfEsc(nome)}</b> já fez nos fechamentos`, "Ainda não aparece em nenhum fechamento gravado.");
}

function _cfSalvarConversao(i) {
    const item = _cfNomesPend[i];
    const nome = document.getElementById("cf-conv-input").value.trim();
    const status = document.getElementById("cf-conv-status");
    const btn = document.getElementById("cf-conv-salvar");
    if (!nome) { status.innerText = "Escolha o entregador."; return; }
    btn.disabled = true;
    status.innerText = "Salvando...";
    fetch(`${API}/admin/nomes-padrao`, {
        method: "POST", headers: _cfHeaders(true),
        body: JSON.stringify({ nome_origem: item.nome, nome_sistema: nome }),
    }).then(async r => {
        const d = await r.json().catch(() => ({}));
        // 409 = esse par já estava cadastrado: pro que a pessoa quer, é a mesma coisa que salvar.
        if (!r.ok && r.status !== 409) {
            btn.disabled = false;
            status.innerText = r.status === 403 ? "Só quem é dev pode mexer na Conversão de nomes." : (d.error || "Erro ao salvar.");
            return;
        }
        item.feito = nome;
        _cfFecharConversao();
        const lista = document.getElementById("cf-nomes-pend");
        if (lista) lista.innerHTML = _cfHtmlNomesPend();
        const st = document.getElementById("cf-acao-status");
        if (st) st.innerText = "Conversão salva — clique em Recalcular pra aplicar nos pacotes.";
    }).catch(() => { btn.disabled = false; status.innerText = "Erro ao salvar."; });
}

function _cfHtmlAcoes() {
    return `
        <div class="cft-barra">
            <button class="cft-btn" id="cf-btn-recalcular" onclick="_cfRecalcular()">Recalcular</button>
            <button class="cft-btn" onclick="_cfExportar(this)">Baixar relatório tratado</button>
            <button class="cft-btn perigo" onclick="_cfExcluir()">Excluir relatório</button>
            <span class="cft-ajuda" id="cf-acao-status"></span>
        </div>`;
}

function _cfHtmlTabelaBase() {
    return `
        <div class="cft-barra" style="justify-content:space-between">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="cft-chip${_cfFiltro === "" ? " on" : ""}" data-cf-filtro="" onclick="_cfMudarFiltro('')">Todos</button>
                ${_cfEhShopee(_cfTranspAtual) ? "" : `<button class="cft-chip${_cfFiltro === "fora" ? " on" : ""}" data-cf-filtro="fora" onclick="_cfMudarFiltro('fora')">Fora do prazo</button>`}
                <button class="cft-chip${_cfFiltro === "pendentes" ? " on" : ""}" data-cf-filtro="pendentes" onclick="_cfMudarFiltro('pendentes')">Com pendência</button>
                <button class="cft-btn" id="cf-limpar-filtros" style="display:none" onclick="_cfLimparFiltrosColuna()">Limpar filtros de coluna</button>
            </div>
            <div class="adm-search-input-area" style="max-width:300px">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7b98b5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="cf-busca" placeholder="Código, usuário, driver ou cidade..." value="${_cfEsc(_cfBusca)}" oninput="_cfBuscar(this.value)">
            </div>
        </div>
        <div id="cf-tabela"></div>`;
}

const _CF_PENDENCIA_TEXTO = {
    cidade_sem_preco: "cidade sem preço", tipo_sem_preco: "tipo sem preço", sem_conversao_nome: "sem conversão de nome",
    sem_data_entrega: "sem data de entrega", sem_data_atribuicao: "sem data de atribuição",
};

function _cfCarregarPacotes() {
    const el = document.getElementById("cf-tabela");
    if (!el) return;
    const key = _cfTranspAtual;
    const reqId = _cfReqId;
    const params = { ..._cfParamsFiltro(), limite: _CF_POR_PAGINA, pagina: _cfPagina };
    if (_cfOrdem) { params.ordem = _cfOrdem.coluna; params.dir = _cfOrdem.dir; }
    fetch(`${_CF_API()}/pacotes?${_cfQs(params)}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (reqId !== _cfReqId || key !== _cfTranspAtual) return;
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        const total = key === "total";
        // Shopee: só as colunas que ela grava (sem prazo, peso, incentivo, desconto, adicional).
        const sp = _cfEhShopee(key);
        const linhas = (d.pacotes || []).map(p => {
            const pend = (p.pendencias || []).map(x => _CF_PENDENCIA_TEXTO[x] || x).join(", ");
            const prazo = p.dentro_prazo === "Sim" ? `<span class="cft-sim">Sim</span>`
                : p.dentro_prazo === "Não" ? `<span class="cft-nao">Não</span>` : `<span class="cft-vazio">—</span>`;
            return `<tr class="${pend ? "pendente" : ""}" title="${_cfEsc(pend)}">
                <td>${p.driver ? _cfEsc(p.driver) : `<span class="cft-vazio">—</span>`}</td>
                <td>${_cfEsc(p.usuario)}</td>
                <td>${_cfEsc(p.codigo)}</td>
                ${total ? `<td>${_cfEsc(p.tipo_produto)}</td>` : ""}
                <td>${sp ? (p.cidade ? _cfEsc(p.cidade) : `<span class="cft-vazio">—</span>`) : _cfEsc(p.cidade || p.cep)}</td>
                ${sp ? `<td>${_cfEsc(p.cep)}</td>` : ""}
                <td>${_cfEsc(p.polo)}</td>
                ${sp ? "" : `<td>${_cfDia(p.data_atribuicao)}</td>`}
                <td>${_cfDia(p.data_entrega)}</td>
                ${sp ? "" : `<td>${_cfDia(p.deve_ser_entregue)}</td>
                <td>${prazo}</td>
                <td class="num">${_cfNum(p.peso_kg, 2)}</td>
                <td class="num">${_cfNum(p.valor_entrega)}</td>
                <td class="num${p.incentivo > 0 ? " cft-pos" : ""}">${_cfNum(p.incentivo)}</td>
                <td class="num${p.desconto > 0 ? " cft-neg" : ""}">${_cfNum(p.desconto)}</td>
                <td class="num${p.adicional_peso > 0 ? " cft-pos" : ""}">${_cfNum(p.adicional_peso)}</td>`}
                <td class="num cft-pos"><strong>${_cfNum(p.valor_motorista)}</strong></td>
            </tr>`;
        }).join("");
        const paginas = Math.max(1, Math.ceil(d.total / _CF_POR_PAGINA));
        el.innerHTML = `
            <div class="cft-tabela-wrap"><table class="cft-tabela">
                <thead><tr>
                    ${_cfTh("Driver", "driver")}${_cfTh("Usuário", "usuario")}${_cfTh("Código", "codigo")}${total ? _cfTh("Tipo", "tipo_produto") : ""}
                    ${_cfTh("Cidade", "cidade")}${sp ? _cfTh("Zipcode", "cep") : ""}${_cfTh(sp ? "XPT" : "Polo", "polo")}
                    ${sp ? "" : _cfTh("Atribuição", "data_atribuicao")}${_cfTh("Entrega", "data_entrega")}
                    ${sp ? "" : _cfTh("Deve ser entregue", "deve_ser_entregue") + _cfTh("No prazo", "dentro_prazo")
                        + _cfTh("Peso (kg)", "peso_kg") + _cfTh("Valor", "valor_entrega") + _cfTh("Incentivo", "incentivo")
                        + _cfTh("Desconto", "desconto") + _cfTh("Adic. peso", "adicional_peso")}
                    ${_cfTh(sp ? "Valor (performance)" : "Motorista", "valor_motorista")}
                </tr></thead>
                <tbody>${linhas || `<tr><td colspan="16" class="cft-vazio" style="padding:16px">Nenhum pacote.</td></tr>`}</tbody>
            </table></div>
            <div class="cft-paginacao">
                <span>${d.total.toLocaleString("pt-BR")} pacote${d.total !== 1 ? "s" : ""}</span>
                ${paginas > 1 ? `<span>
                    <button class="cft-chip" ${_cfPagina === 0 ? "disabled" : ""} onclick="_cfMudarPagina(-1)">‹</button>
                    página ${_cfPagina + 1} de ${paginas}
                    <button class="cft-chip" ${_cfPagina >= paginas - 1 ? "disabled" : ""} onclick="_cfMudarPagina(1)">›</button>
                </span>` : ""}
            </div>`;
        _cfAtualizarLimparFiltros();
    }).catch(() => {
        if (reqId === _cfReqId) el.innerHTML = `<div class="cft-erro">Erro ao carregar os pacotes.</div>`;
    });
}

// ── Filtro de coluna (funil no cabeçalho, mesmo componente dos backlogs: col-filtro.js).
// A lista de valores vem do servidor (lote inteiro), não só da página na tela.
const _CF_FUNIL = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';

function _cfTh(rotulo, coluna) {
    const ativo = !!_cfColFiltros[coluna] || (_cfOrdem && _cfOrdem.coluna === coluna);
    return `<th><span class="colf-th">${rotulo}<button type="button" class="colf-btn${ativo ? " ativo" : ""}" onclick="_cfAbrirFiltroColuna(this, '${coluna}')" title="Filtrar / ordenar">${_CF_FUNIL}</button></span></th>`;
}

function _cfParamsFiltro() {
    const p = { transportadora: _cfTranspAtual, busca: _cfBusca, filtro: _cfFiltro };
    if (Object.keys(_cfColFiltros).length) p.filtros = JSON.stringify(_cfColFiltros);
    return p;
}

function _cfAbrirFiltroColuna(btn, coluna) {
    fetch(`${_CF_API()}/valores?${_cfQs({ ..._cfParamsFiltro(), coluna })}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { gcAlert(d.error); return; }
        colfAbrir(btn, {
            contagem: d.valores || [],
            selecionados: _cfColFiltros[coluna] ? new Set(_cfColFiltros[coluna]) : null,
            ordenar: { atual: _cfOrdem && _cfOrdem.coluna === coluna ? _cfOrdem.dir : null },
            aoAplicar: (sel, ordem) => {
                if (sel) _cfColFiltros[coluna] = [...sel]; else delete _cfColFiltros[coluna];
                if (ordem) _cfOrdem = { coluna, dir: ordem };
                else if (_cfOrdem && _cfOrdem.coluna === coluna) _cfOrdem = null;
                _cfPagina = 0;
                _cfAtualizarLimparFiltros();
                _cfCarregarPacotes();
            },
        });
    }).catch(() => gcAlert("Erro ao carregar os valores da coluna."));
}

function _cfLimparFiltrosColuna() {
    _cfColFiltros = {}; _cfOrdem = null; _cfPagina = 0;
    _cfAtualizarLimparFiltros();
    _cfCarregarPacotes();
}

function _cfAtualizarLimparFiltros() {
    const el = document.getElementById("cf-limpar-filtros");
    if (el) el.style.display = Object.keys(_cfColFiltros).length || _cfOrdem ? "" : "none";
}

function _cfBuscar(v) {
    clearTimeout(_cfBuscaTimer);
    _cfBuscaTimer = setTimeout(() => { _cfBusca = v.trim(); _cfPagina = 0; _cfCarregarPacotes(); }, 300);
}
function _cfMudarFiltro(f) {
    _cfFiltro = f; _cfPagina = 0;
    document.querySelectorAll("[data-cf-filtro]").forEach(b => b.classList.toggle("on", b.dataset.cfFiltro === f));
    _cfCarregarPacotes();
}
function _cfMudarPagina(delta) {
    _cfPagina = Math.max(0, _cfPagina + delta);
    _cfCarregarPacotes();
}

function _cfRecalcular() {
    const key = _cfTranspAtual;
    const btn = document.getElementById("cf-btn-recalcular");
    const status = document.getElementById("cf-acao-status");
    if (btn) btn.disabled = true;
    if (status) status.innerText = "Recalculando (relendo planilha de precificação, conversão de nomes e regras de prazo)...";
    fetch(`${_CF_API()}/recalcular`, {
        method: "POST", headers: _cfHeaders(true),
        body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: key }),
    }).then(r => r.json())
    .then(d => {
        if (key !== _cfTranspAtual) return;
        if (d.error) { if (status) status.innerText = d.error; if (btn) btn.disabled = false; return; }
        _cfAtualizarCards();
        _cfCarregarDetalhe();
    }).catch(() => {
        if (btn) btn.disabled = false;
        if (status) status.innerText = "Erro ao recalcular.";
    });
}

// ── Colunas dos relatórios: por transportadora, os nomes de coluna aceitos em cada campo,
// em ordem — em cada linha vale a primeira dessas colunas que estiver preenchida.
// Gravado no banco (fechamento_colunas); sem edição vale o padrão do sistema.
const _CF_OBRIG = {
    sim: "obrigatório", cidade_ou_cep: "Cidade ou CEP (um dos dois)", nao: "opcional", nao_usa: "não usado (sempre NORMAL)",
};

function _cfAbrirColunas(key) {
    const el = document.getElementById("cf-colunas");
    if (!key && el.style.display !== "none") { el.style.display = "none"; return; }
    el.style.display = "";
    const transp = key || (_cfColCfg && _cfColCfg.transp) || _cfTranspAtual || _CF_TRANSPORTADORAS[0].key;
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CF_API()}/colunas?transportadora=${transp}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfColCfg = { transp, campos: d.campos || [] };
        _cfRenderColunas();
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as colunas.</div>`; });
}

function _cfRenderColunas(msg) {
    const el = document.getElementById("cf-colunas");
    const { transp, campos } = _cfColCfg;
    // Tipo de Produto só existe na Total Express — nas outras a linha só confundiria.
    const linhas = campos.map((c, i) => c.obrigatorio === "nao_usa" ? "" : (() => {
        const vazioObrig = !c.nomes.length && c.obrigatorio === "sim";
        const tags = c.nomes.map((n, k) => `<span class="cft-tag cft-col-tag">
                ${k > 0 ? `<button class="cft-col-mini" title="Subir (tem preferência)" onclick="_cfColMover(${i}, ${k})">↑</button>` : ""}${_cfEsc(n)}
                <button class="cft-col-mini" title="Remover" onclick="_cfColRemover(${i}, ${k})">×</button>
            </span>`).join("");
        return `<tr>
            <td><strong>${_cfEsc(c.rotulo)}</strong><div class="cft-ajuda">${_CF_OBRIG[c.obrigatorio] || ""}</div></td>
            <td>
                <div class="cft-pend-tags" style="margin:0">${tags || `<span class="cft-ajuda${vazioObrig ? " cft-neg" : ""}">nenhuma coluna${vazioObrig ? " — o upload vai recusar" : ""}</span>`}</div>
                <input class="cft-input cft-col-input" placeholder="Nome da coluna + Enter" onkeydown="if(event.key==='Enter')_cfColAdicionar(${i}, this)">
            </td>
            <td class="cft-ajuda">${c.padrao ? "padrão" : "editado"}</td>
        </tr>`;
    })()).join("");
    el.innerHTML = `
        <div class="cft-barra" style="margin-top:0">
            ${_CF_TRANSPORTADORAS.map(t => `<button class="cft-chip${t.key === transp ? " on" : ""}" onclick="_cfAbrirColunas('${t.key}')">${t.label}</button>`).join("")}
        </div>
        <div class="cft-barra" style="margin-top:0">
            <label class="cft-btn" style="cursor:pointer">Ler colunas de um arquivo
                <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="_cfLerColunasDeArquivo(this)">
            </label>
            <span class="cft-ajuda">escolhe na lista qual coluna do arquivo é cada campo, sem digitar</span>
        </div>
        <div class="cft-ajuda" style="margin-bottom:10px">Nomes das colunas no relatório da transportadora, em ordem de preferência: em cada linha vale a
            <b>primeira dessas colunas que estiver preenchida</b> (as outras são o plano B). Acento e maiúscula não importam.
            "#S" quer dizer a coluna S do arquivo, pela letra.</div>
        <div class="cft-tabela-wrap"><table class="cft-tabela cft-regras-tabela cft-col-tabela">
            <thead><tr><th>Campo</th><th>Colunas aceitas</th><th></th></tr></thead>
            <tbody>${linhas}</tbody>
        </table></div>
        <div class="cft-barra">
            <button class="cft-btn perigo" onclick="_cfColRestaurar()">Restaurar padrão</button>
            <span style="flex:1"></span>
            <button class="cft-btn primario" id="cf-col-salvar" onclick="_cfColSalvar()">Salvar</button>
        </div>
        <div class="cft-ajuda" id="cf-col-status">${msg || ""}</div>`;
}

function _cfColAdicionar(i, input) {
    const nome = input.value.replace(/\s+/g, " ").trim();
    if (!nome) return;
    const c = _cfColCfg.campos[i];
    if (c.nomes.some(n => _cfChave(n) === _cfChave(nome))) { input.value = ""; return; }
    c.nomes.push(nome);
    _cfRenderColunas("Alteração não salva.");
}

function _cfColRemover(i, k) {
    _cfColCfg.campos[i].nomes.splice(k, 1);
    _cfRenderColunas("Alteração não salva.");
}

function _cfColMover(i, k) {
    const n = _cfColCfg.campos[i].nomes;
    [n[k - 1], n[k]] = [n[k], n[k - 1]];
    _cfRenderColunas("Alteração não salva.");
}

function _cfColSalvar() {
    const { transp, campos } = _cfColCfg;
    const corpo = { transportadora: transp, campos: {} };
    campos.forEach(c => { corpo.campos[c.campo] = c.nomes; });
    const btn = document.getElementById("cf-col-salvar");
    btn.disabled = true;
    fetch(`${_CF_API()}/colunas`, { method: "PUT", headers: _cfHeaders(true), body: JSON.stringify(corpo) })
    .then(async r => {
        const d = await r.json().catch(() => ({}));
        btn.disabled = false;
        if (!r.ok) { document.getElementById("cf-col-status").innerText = d.error || "Erro ao salvar."; return; }
        _cfColunas = null; // o upload relê a lista de colunas que manda pro servidor
        _cfAbrirColunas(transp);
        setTimeout(() => { const s = document.getElementById("cf-col-status"); if (s) s.innerText = "Salvo. Vale pro próximo relatório enviado."; }, 300);
    }).catch(() => { btn.disabled = false; document.getElementById("cf-col-status").innerText = "Erro ao salvar."; });
}

function _cfColRestaurar() {
    const { transp } = _cfColCfg;
    const label = (_CF_TRANSPORTADORAS.find(t => t.key === transp) || {}).label || transp;
    gcConfirm(`Voltar as colunas da <b>${label}</b> pro padrão do sistema?`, () => {
        fetch(`${_CF_API()}/colunas?transportadora=${transp}`, { method: "DELETE", headers: _cfHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.error) { gcAlert(d.error); return; }
            _cfColunas = null;
            _cfAbrirColunas(transp);
        }).catch(() => gcAlert("Erro ao restaurar."));
    }, "Restaurar padrão", "Restaurar");
}

// ── Regras de prazo: quais transportadoras não contam sábado/domingo, geral e por polo.
// A regra do polo SOMA à geral (ver modules/fechamento-transportadoras/regras-prazo.js).
function _cfAbrirRegras() {
    const el = document.getElementById("cf-regras");
    if (el.style.display !== "none") { el.style.display = "none"; return; }
    el.style.display = "";
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CF_API()}/regras-prazo`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfPolos = d.polos || [];
        _cfCidades = d.cidades || [];
        const linhas = [{ tipo: "geral", escopo: "geral", t: {} }];
        for (const r of d.regras || []) {
            const tipo = r.tipo || (_cfChave(r.escopo) === "geral" ? "geral" : "polo");
            let l = linhas.find(x => x.tipo === tipo && _cfChave(x.escopo) === _cfChave(r.escopo));
            if (!l) { l = { tipo, escopo: r.escopo, t: {} }; linhas.push(l); }
            l.t[r.transportadora] = { sab: !!r.ignorar_sabado, dom: !!r.ignorar_domingo };
        }
        _cfRegras = linhas;
        _cfRenderRegras();
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as regras.</div>`; });
}

function _cfRenderRegras(msg) {
    const el = document.getElementById("cf-regras");
    const celula = (i, key, dia, rot) => {
        const on = !!((_cfRegras[i].t[key] || {})[dia]);
        return `<button class="cft-chip cft-chip-mini${on ? " on" : ""}" title="${on ? "Não conta" : "Conta"} ${rot === "Sáb" ? "sábado" : "domingo"}"
            onclick="_cfAlternarRegra(${i}, '${key}', '${dia}')">${rot}</button>`;
    };
    const usados = new Set(_cfRegras.filter(l => l.tipo === _cfNovoTipo).map(l => _cfChave(l.escopo)));
    const sugestoes = (_cfNovoTipo === "cidade" ? _cfCidades : _cfPolos).filter(p => !usados.has(_cfChave(p)));
    const rotuloLinha = (l) => l.tipo === "geral" ? "Geral (todos)" : (l.tipo === "cidade" ? "Cidade " : "Polo ") + _cfEsc(l.escopo);
    // Geral, depois polos, depois cidades — a ordem em que as camadas se somam.
    const ordem = { geral: 0, polo: 1, cidade: 2 };
    const indices = _cfRegras.map((_, i) => i).sort((a, b) =>
        ordem[_cfRegras[a].tipo] - ordem[_cfRegras[b].tipo] || _cfRegras[a].escopo.localeCompare(_cfRegras[b].escopo, "pt-BR"));
    el.innerHTML = `
        <div class="cft-ajuda" style="margin-bottom:10px">Marcado = <b>não conta</b> aquele dia no prazo (cada dia desses que cair no prazo soma +1 dia).
            Polo e cidade somam à Geral: um pacote segue a Geral + a linha do polo dele + a linha da cidade dele (polo e cidade vêm da planilha de precificação).</div>
        <div class="cft-tabela-wrap"><table class="cft-tabela cft-regras-tabela">
            <thead><tr><th>Vale para</th>${_CF_TRANSPORTADORAS.map(t => `<th>${t.label}</th>`).join("")}<th></th></tr></thead>
            <tbody>${indices.map(i => { const l = _cfRegras[i]; return `<tr>
                <td><strong>${rotuloLinha(l)}</strong></td>
                ${_CF_TRANSPORTADORAS.map(t => `<td>${celula(i, t.key, "sab", "Sáb")} ${celula(i, t.key, "dom", "Dom")}</td>`).join("")}
                <td>${l.tipo === "geral" ? "" : `<button class="cft-btn perigo" onclick="_cfRemoverPolo(${i})">Remover</button>`}</td>
            </tr>`; }).join("")}</tbody>
        </table></div>
        <div class="cft-barra">
            <button class="cft-chip${_cfNovoTipo === "polo" ? " on" : ""}" onclick="_cfTipoNovaRegra('polo')">Polo</button>
            <button class="cft-chip${_cfNovoTipo === "cidade" ? " on" : ""}" onclick="_cfTipoNovaRegra('cidade')">Cidade</button>
            <input list="cf-polos-lista" id="cf-novo-polo" class="fech-select" placeholder="${_cfNovoTipo === "cidade" ? "Cidade (ex.: Caçador)" : "Polo (ex.: Joaçaba)"}" style="min-width:220px">
            <datalist id="cf-polos-lista">${sugestoes.map(p => `<option value="${_cfEsc(p)}">`).join("")}</datalist>
            <button class="cft-btn" onclick="_cfAdicionarPolo()">Adicionar regra ${_cfNovoTipo === "cidade" ? "por cidade" : "por polo"}</button>
            <span style="flex:1"></span>
            <button class="cft-btn primario" id="cf-regras-salvar" onclick="_cfSalvarRegras()">Salvar${_cfQuinzena ? " e recalcular a quinzena" : ""}</button>
        </div>
        <div class="cft-ajuda" id="cf-regras-status">${msg || ""}</div>`;
}

function _cfAlternarRegra(i, key, dia) {
    const t = _cfRegras[i].t;
    t[key] = t[key] || { sab: false, dom: false };
    t[key][dia] = !t[key][dia];
    _cfRenderRegras();
}

function _cfTipoNovaRegra(tipo) {
    _cfNovoTipo = tipo;
    _cfRenderRegras();
}

function _cfAdicionarPolo() {
    const nome = document.getElementById("cf-novo-polo").value.trim();
    if (!nome) return;
    const tipo = _cfNovoTipo;
    if (_cfChave(nome) === "geral" || _cfRegras.some(l => l.tipo === tipo && _cfChave(l.escopo) === _cfChave(nome))) {
        _cfRenderRegras(`Ess${tipo === "cidade" ? "a cidade" : "e polo"} já está na lista.`);
        return;
    }
    _cfRegras.push({ tipo, escopo: nome, t: {} });
    _cfRenderRegras();
}

function _cfRemoverPolo(i) {
    _cfRegras.splice(i, 1);
    _cfRenderRegras();
}

async function _cfSalvarRegras() {
    const btn = document.getElementById("cf-regras-salvar");
    const status = document.getElementById("cf-regras-status");
    const regras = [];
    for (const l of _cfRegras) {
        for (const [key, v] of Object.entries(l.t)) {
            if (v.sab || v.dom) regras.push({ tipo: l.tipo, escopo: l.escopo, transportadora: key, ignorar_sabado: v.sab, ignorar_domingo: v.dom });
        }
    }
    btn.disabled = true;
    status.innerText = "Salvando...";
    try {
        const r = await fetch(`${_CF_API()}/regras-prazo`, { method: "PUT", headers: _cfHeaders(true), body: JSON.stringify({ regras }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        // Regra nova só vale pro que for (re)calculado: recalcula o que já subiu nesta quinzena.
        const lotes = _cfQuinzena ? _cfResumo.map(x => x.chave).filter(Boolean) : [];
        const falhas = [];
        for (let i = 0; i < lotes.length; i++) {
            status.innerText = `Salvo. Recalculando ${i + 1} de ${lotes.length}...`;
            const rr = await fetch(`${_CF_API()}/recalcular`, {
                method: "POST", headers: _cfHeaders(true),
                body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: lotes[i] }),
            });
            if (!rr.ok) falhas.push(_CF_TRANSPORTADORAS.find(t => t.key === lotes[i])?.label || lotes[i]);
        }
        btn.disabled = false;
        status.innerText = falhas.length ? `Salvo, mas não consegui recalcular: ${falhas.join(", ")}.`
            : lotes.length ? "Salvo e recalculado." : "Salvo. Vale pros próximos relatórios e recálculos.";
        if (lotes.length) { _cfAtualizarCards(); if (_cfTranspAtual) _cfCarregarDetalhe(); }
    } catch (err) {
        btn.disabled = false;
        status.innerText = err.message;
    }
}

function _cfExcluir() {
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual);
    gcConfirm(`Excluir o relatório da <b>${cfg.label}</b> desta quinzena? Os pacotes tratados saem do banco.`, () => {
        fetch(`${_CF_API()}/lote?${_cfQs({ transportadora: cfg.key })}`, { method: "DELETE", headers: _cfHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.error) { gcAlert(d.error); return; }
            _cfAtualizarCards();
            _cfCarregarDetalhe();
        }).catch(() => gcAlert("Erro ao excluir."));
    }, "Excluir relatório", "Excluir");
}

// Mesma ordem de colunas da planilha de fechamento.
const _CF_EXPORT_COLUNAS = [
    ["Transportadora", "transportadora"], ["Tipo de Produto", "tipo_produto"], ["Driver", "driver"],
    ["Usuario", "usuario"], ["Codigo", "codigo"], ["Cidade", "cidade"], ["Polo", "polo"],
    ["Destinatario", "destinatario"], ["Endereço", "endereco"], ["Data atribuicao", "data_atribuicao"],
    ["Data entrega", "data_entrega"], ["Deve ser entregue", "deve_ser_entregue"], ["Dentro do prazo", "dentro_prazo"],
    ["Peso (Kg)", "peso_kg"], ["Valor entrega", "valor_entrega"], ["Incentivo", "incentivo"], ["Desconto", "desconto"],
    ["Adicional por peso", "adicional_peso"], ["Valor motorista", "valor_motorista"],
];

// Shopee: só as colunas que ela grava.
const _CF_EXPORT_COLUNAS_SHOPEE = [
    ["Transportadora", "transportadora"], ["Driver", "driver"], ["Usuario", "usuario"], ["Codigo", "codigo"],
    ["Cidade", "cidade"], ["Polo", "polo"], ["Zipcode Name", "cep"], ["Data entrega", "data_entrega"],
    ["Valor motorista", "valor_motorista"],
];

function _cfExportar(btn) {
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual);
    btn.disabled = true;
    fetch(`${_CF_API()}/exportar?${_cfQs({ transportadora: cfg.key })}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        btn.disabled = false;
        if (d.error) { gcAlert(d.error); return; }
        const colunas = _cfEhShopee(cfg.key) ? _CF_EXPORT_COLUNAS_SHOPEE : _CF_EXPORT_COLUNAS;
        const linhas = [colunas.map(c => c[0])].concat(d.pacotes.map(p => colunas.map(c => p[c[1]] ?? "")));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), cfg.label.slice(0, 31));
        const nomeArq = `fechamento_${cfg.key}_${String(_cfMes).padStart(2, "0")}-${_cfAno}_q${_cfQuinzena}.xlsx`;
        if (!_cfEhShopee(cfg.key)) { XLSX.writeFile(wb, nomeArq); return; }
        // Shopee: segunda aba com a performance por usuário e dia.
        return fetch(`${_CF_API()}/performance?${_cfQs({ transportadora: cfg.key })}`, { headers: _cfHeaders() })
            .then(r => r.json())
            .then(pf => {
                const perf = [["Dia", "Usuario", "Driver", "Entregues", "Onholds", "Performance (%)", "Valor por pacote", "Total"]]
                    .concat((pf.linhas || []).map(l => [_cfDia(l.dia), l.usuario, l.driver || "", l.entregues, l.onholds, l.pct, l.valor, l.total]));
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(perf), "Performance");
                XLSX.writeFile(wb, nomeArq);
            });
    }).catch(() => { btn.disabled = false; gcAlert("Erro ao baixar."); });
}

// ── Upload ──
async function _cfArquivoSelecionado(input) {
    const file = input.files[0];
    input.value = "";
    if (file) await _cfEnviarArquivo(file, _cfTranspAtual);
}

async function _cfEnviarArquivo(file, key) {
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === key);
    if (!cfg) return;
    const status = document.getElementById("cf-upload-status");
    status.innerHTML = `<div class="cft-ajuda" style="font-size:13px">Lendo arquivo...</div>`;

    try {
        if (!_cfColunas) {
            const c = await fetch(`${_CF_API()}/config`, { headers: _cfHeaders() }).then(r => r.json());
            if (c.error) throw new Error(c.error);
            _cfColunas = c.colunas;
        }
        const grid = await _cfLerGrid(file);
        if (!grid || grid.length < 2) throw new Error("Arquivo vazio ou inválido.");
        // Loggi filtra pela coluna Status (só "Entregue") no servidor — ela tem que ir junto.
        const { grid: enviar, posicoes } = _cfSoColunasUteis(grid, [...(_cfColunas[key] || []), ...(key === "loggi" ? ["Status"] : [])]);
        status.innerHTML = `<div class="cft-ajuda" style="font-size:13px">Tratando ${(grid.length - 1).toLocaleString("pt-BR")} linhas (planilha de precificação + conversão de nomes)...</div>`;
        const res = await fetch(`${_CF_API()}/upload`, {
            method: "POST", headers: _cfHeaders(true),
            body: JSON.stringify({
                mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: key, arquivo: file.name,
                grid: enviar, posicoes_originais: posicoes, cabecalho_original: grid[0],
            }),
        });
        const d = await res.json();
        if (!res.ok) {
            // Coluna faltando: abre o quadro pra escolher qual coluna do arquivo é cada campo.
            if (d.cabecalho_encontrado) {
                _cfAbrirMapeamento({ transp: key, cabecalho: grid[0], arquivo: file, alvo: "cf-upload-status", aviso: d.error });
                return;
            }
            status.innerHTML = `<div class="cft-erro">${_cfEsc(d.error || "Erro ao enviar.")}</div>`;
            return;
        }
        if (key !== _cfTranspAtual) return;
        const ign = d.ignorados || [];
        const totalIgn = ign.reduce((s, x) => s + x.qtd, 0);
        status.innerHTML = `<div class="cft-ajuda" style="font-size:13px;color:#cbd5e1">${d.resumo.total.toLocaleString("pt-BR")} pacotes tratados e gravados.</div>`
            + (totalIgn ? `<div class="cft-ajuda" style="margin-top:4px">${totalIgn.toLocaleString("pt-BR")} linha${totalIgn !== 1 ? "s" : ""} fora do fechamento por não estar${totalIgn !== 1 ? "em" : ""} com Status "Entregue":
                ${ign.map(x => `${_cfEsc(x.status)} ${x.qtd.toLocaleString("pt-BR")}`).join(" · ")}</div>` : "");
        _cfAtualizarCards();
        _cfCarregarDetalhe();
    } catch (err) {
        status.innerHTML = `<div class="cft-erro">${_cfEsc(err.message)}</div>`;
    }
}

// ── Ligar colunas: "qual coluna do arquivo é o quê", escolhendo numa lista (sem digitar).
// Abre sozinho quando o relatório não tem alguma coluna obrigatória, ou pela tela Colunas
// dos relatórios › "Ler colunas de um arquivo". A coluna escolhida vira a 1ª da lista daquele
// campo (as outras continuam de plano B) e é gravada em fechamento_colunas.
let _cfMapa = null; // { transp, cabecalho, arquivo, alvo, campos, escolha: {campo: coluna | ""} }

async function _cfAbrirMapeamento({ transp, cabecalho, arquivo, alvo, aviso }) {
    const el = document.getElementById(alvo);
    el.innerHTML = `<div class="cft-ajuda">Carregando colunas...</div>`;
    try {
        const d = await fetch(`${_CF_API()}/colunas?transportadora=${transp}`, { headers: _cfHeaders() }).then(r => r.json());
        if (d.error) throw new Error(d.error);
        const colunasArquivo = [...new Set((cabecalho || []).map(h => String(h ?? "").trim()).filter(Boolean))];
        const escolha = {};
        for (const c of d.campos) {
            // Já escolhe o que a configuração atual acharia nesse arquivo.
            const achou = c.nomes.map(n => colunasArquivo.find(h => _cfChave(h) === _cfChave(n))).find(Boolean);
            escolha[c.campo] = achou || "";
        }
        _cfMapa = { transp, cabecalho: colunasArquivo, arquivo, alvo, aviso, campos: d.campos, escolha };
        _cfRenderMapeamento();
    } catch (err) {
        el.innerHTML = `<div class="cft-erro">${_cfEsc(err.message || "Erro ao carregar as colunas.")}</div>`;
    }
}

function _cfRenderMapeamento(msg) {
    const m = _cfMapa;
    const el = document.getElementById(m.alvo);
    const label = (_CF_TRANSPORTADORAS.find(t => t.key === m.transp) || {}).label || m.transp;
    const linhas = m.campos.filter(c => c.obrigatorio !== "nao_usa").map(c => {
        const sel = m.escolha[c.campo] || "";
        const falta = !sel && (c.obrigatorio === "sim" ||
            (c.obrigatorio === "cidade_ou_cep" && !m.escolha.cidade && !m.escolha.cep));
        return `<tr>
            <td><strong${falta ? ' class="cft-neg"' : ""}>${_cfEsc(c.rotulo)}</strong><div class="cft-ajuda">${_CF_OBRIG[c.obrigatorio] || ""}</div></td>
            <td><select class="fech-select cft-map-select" onchange="_cfMapaEscolher('${c.campo}', this.value)">
                <option value="">— não tem no arquivo —</option>
                ${m.cabecalho.map(h => `<option value="${_cfEsc(h)}"${h === sel ? " selected" : ""}>${_cfEsc(h)}</option>`).join("")}
            </select></td>
        </tr>`;
    }).join("");
    el.innerHTML = `
        <div class="cft-regras" style="margin:8px 0 0">
            ${m.aviso ? `<div class="cft-erro" style="margin-bottom:8px">${_cfEsc(m.aviso)}</div>` : ""}
            <div class="cft-pend-titulo" style="color:#e2e8f0">Qual coluna do arquivo é cada campo — ${_cfEsc(label)}</div>
            <div class="cft-ajuda" style="margin-bottom:10px">Escolha na lista as colunas do seu arquivo. Fica salvo pros próximos relatórios da ${_cfEsc(label)}.</div>
            <div class="cft-tabela-wrap"><table class="cft-tabela cft-regras-tabela cft-col-tabela">
                <thead><tr><th>Campo</th><th>Coluna no arquivo</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table></div>
            <div class="cft-barra">
                <button class="cft-btn" onclick="_cfFecharMapeamento()">Cancelar</button>
                <span style="flex:1"></span>
                <button class="cft-btn primario" id="cf-mapa-salvar" onclick="_cfSalvarMapeamento()">${m.arquivo ? "Salvar e enviar de novo" : "Salvar"}</button>
            </div>
            <div class="cft-ajuda" id="cf-mapa-status">${msg || ""}</div>
        </div>`;
}

function _cfMapaEscolher(campo, valor) {
    _cfMapa.escolha[campo] = valor;
    _cfRenderMapeamento();
}

function _cfFecharMapeamento() {
    const m = _cfMapa;
    _cfMapa = null;
    if (!m) return;
    if (m.alvo === "cf-colunas") _cfAbrirColunas(m.transp);
    else document.getElementById(m.alvo).innerHTML = "";
}

/** Listas novas: a coluna escolhida vai pra frente; "não tem" tira as que estão nesse arquivo. */
function _cfMapaListas(m) {
    const campos = {};
    for (const c of m.campos) {
        const sel = m.escolha[c.campo];
        const doArquivo = (n) => m.cabecalho.some(h => _cfChave(h) === _cfChave(n));
        campos[c.campo] = sel
            ? [sel, ...c.nomes.filter(n => _cfChave(n) !== _cfChave(sel))]
            : c.nomes.filter(n => !doArquivo(n));
    }
    return campos;
}

async function _cfSalvarMapeamento() {
    const m = _cfMapa;
    const btn = document.getElementById("cf-mapa-salvar");
    btn.disabled = true;
    try {
        const r = await fetch(`${_CF_API()}/colunas`, {
            method: "PUT", headers: _cfHeaders(true),
            body: JSON.stringify({ transportadora: m.transp, campos: _cfMapaListas(m) }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        _cfColunas = null; // a lista de colunas que o upload manda mudou
        _cfMapa = null;
        if (m.arquivo) await _cfEnviarArquivo(m.arquivo, m.transp);
        else _cfAbrirColunas(m.transp);
    } catch (err) {
        btn.disabled = false;
        _cfRenderMapeamento(err.message);
    }
}

function _cfLerColunasDeArquivo(input) {
    const file = input.files[0];
    input.value = "";
    if (!file || !_cfColCfg) return;
    const transp = _cfColCfg.transp;
    document.getElementById("cf-colunas").innerHTML = `<div class="cft-ajuda">Lendo arquivo...</div>`;
    _cfLerGrid(file)
        .then(grid => _cfAbrirMapeamento({ transp, cabecalho: grid[0] || [], arquivo: null, alvo: "cf-colunas" }))
        .catch(() => { document.getElementById("cf-colunas").innerHTML = `<div class="cft-erro">Não consegui ler o arquivo.</div>`; });
}

// Mesma normalização do backend (nomes-padrao/normalizacao.chave): sem acento/caixa/espaço extra.
function _cfChave(v) {
    return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Relatório da Shopee tem dezenas de colunas × dezenas de milhares de linhas — manda só
// as colunas que o backend sabe ler. "#S" na lista é coluna pela letra; a posição original
// de cada coluna vai junto (posicoes) pro backend saber qual era a S.
function _cfSoColunasUteis(grid, aceitas) {
    const set = new Set(aceitas.filter(a => !/^#/.test(a)).map(_cfChave));
    const letras = new Set(aceitas.filter(a => /^#[A-Za-z]{1,3}$/.test(a)).map(a => _cfLetraParaIndice(a.slice(1))));
    const posicoes = grid[0].map((h, i) => set.has(_cfChave(h)) || letras.has(i) ? i : -1).filter(i => i >= 0);
    return { grid: grid.map(row => posicoes.map(i => row[i] ?? "")), posicoes };
}

function _cfLetraParaIndice(letras) {
    let n = 0;
    for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

// Acento quebrado: texto UTF-8 que alguém leu como Latin-1/Windows-1252 e gravou assim
// ("CÃ³digo de Barras" — o relatório da Loggi vem desse jeito). Só mexe quando o padrão
// aparece e a volta é UTF-8 válido. Mesma regra do backend (fechamento-transportadoras/acento.js).
const _CF_CP1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89,
    "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
    "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
const _CF_QUEBRADO = /[ÃÂ][\u0080-\u00BF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;
function _cfConsertarAcento(s) {
    if (typeof s !== "string" || !_CF_QUEBRADO.test(s)) return s;
    const bytes = [];
    for (const ch of s) {
        const c = ch.charCodeAt(0);
        if (c <= 0xff) bytes.push(c);
        else if (_CF_CP1252[ch] !== undefined) bytes.push(_CF_CP1252[ch]);
        else return s;
    }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bytes)); }
    catch (_) { return s; }
}

// Data de célula do Excel vira "AAAA-MM-DD HH:MM:SS" (sem ambiguidade dia/mês); o resto
// vai como o texto que aparece na célula (código numérico grande não perde dígito).
// CSV com cada linha de dados INTEIRA entre aspas (o cabeçalho não): o leitor entende a
// linha toda como um campo só, e ela inteira caía em "Código" (relatório da Shopee de set/26).
// Linha com um campo só, que tem separador dentro, enquanto o cabeçalho tem várias colunas:
// lê esse campo de novo como uma linha de CSV.
function _cfDesembrulharLinhas(grid, lerLinha) {
    const colunas = (grid[0] || []).filter(c => String(c ?? "").trim()).length;
    if (colunas < 3) return grid;
    const ler = lerLinha || (s => XLSX.utils.sheet_to_json(XLSX.read(s, { type: "string", raw: true }).Sheets.Sheet1,
        { header: 1, defval: "", raw: true })[0] || []);
    return grid.map((row, i) => {
        if (i === 0 || !Array.isArray(row)) return row;
        const cheias = row.filter(c => String(c ?? "").trim());
        if (cheias.length !== 1) return row;
        const s = String(cheias[0]);
        if (![",", ";", "\t"].some(sep => s.split(sep).length >= Math.min(colunas, 3))) return row;
        const nova = ler(s);
        return nova.length >= Math.min(colunas, 3) ? nova.map(c => _cfConsertarAcento(String(c ?? ""))) : row;
    });
}

function _cfLerGrid(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                let wb;
                if (file.name.toLowerCase().endsWith(".csv")) {
                    let text = new TextDecoder("utf-8").decode(data);
                    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(data);
                    // raw: texto puro, sem o SheetJS tentar ler "01/10/2026" como data americana.
                    wb = XLSX.read(text, { type: "string", raw: true });
                } else {
                    wb = XLSX.read(data, { type: "array", cellDates: true });
                }
                const ws = wb.Sheets[wb.SheetNames[0]];
                const crus = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
                const txt = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
                const p2 = n => String(n).padStart(2, "0");
                const grid = crus.map((row, i) => row.map((v, j) => {
                    if (v instanceof Date) {
                        // SheetJS monta a data no fuso local; arredonda pro segundo (vem com ms de sobra).
                        const d = new Date(Math.round(v.getTime() / 1000) * 1000);
                        return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
                    }
                    const t = txt[i] && txt[i][j];
                    return _cfConsertarAcento(t !== undefined && t !== "" ? String(t) : String(v ?? ""));
                }));
                resolve(_cfDesembrulharLinhas(grid));
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}
