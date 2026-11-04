// ───── OPERAÇÃO › TRANSPORTADORAS › <TRANSPORTADORA> › CONFERÊNCIA ─────
// Sobe o relatório da transportadora e confere duas coisas (o que antes era CONT.SE na planilha):
//   1. foi atribuído?          pacote sem Entregador = sem atribuição
//   2. foi atribuído certo?    o login do Entregador atende a cidade do pacote?
//   3. é nosso?                cidade que nenhum login da lista faz = fora de abrangência
// Salvo por dia (o dia em que subiu) e por polo (coluna Ponto Responsável): quem não é dev/admin só
// vê e só sobe o próprio polo; dev/admin veem todos e filtram.
// A lista login → cidades fica na aba "Cidades por usuário" desta tela. Login sem cidade ou com
// cidade fora da lista: clique no nome e marque as cidades que ele faz (mesmo jeito das
// pendências do fechamento). A conferência é refeita na hora contra a lista atual — não precisa
// subir o relatório de novo.
// Backend: /admin/conferencia-expedicao (modules/conferencia-expedicao). Começou pela Anjun;
// transportadora nova = relatório dela em relatorios.js + entrada em _CEX_NOMES.
const _CEX_API = () => `${API}/admin/conferencia-expedicao`;
const _CEX_NOMES = { anjun: "Anjun" };
const _CEX_LOGOS = { anjun: "img/Transportadoras/Anjun.branco.png" };
const _CEX_STATUS = {
    fora_abrangencia:   { rotulo: "Fora de abrangência", classe: "cft-aviso" },
    sem_entregador:     { rotulo: "Sem atribuição",   classe: "cft-neg" },
    cidade_errada:      { rotulo: "Cidade errada",    classe: "cft-neg" },
    usuario_sem_cidade: { rotulo: "Login sem cidade", classe: "cft-aviso" },
    sem_cidade:         { rotulo: "Pacote sem cidade", classe: "cft-aviso" },
    ok:                 { rotulo: "Certo",            classe: "cft-pos" },
};
const _CEX_MAX_LINHAS = 500;
const _CEX_MAX_BARRAS = 8;   // teto igual nos três gráficos: nenhum card cresce mais que os outros

let _cexTransp = "anjun";
let _cexAba = "conferencia";
let _cexDados = null;     // resposta de /:transp/resultado
let _cexFiltro = "pend";  // pend | todos | um dos status
let _cexCidades = null;   // linhas de /cidades-usuario
let _cexDia = null;       // AAAA-MM-DD escolhido; null = o último com relatório
let _cexPolo = "";        // só dev/admin: "" = todos os polos
const _CEX_POLOS = { cacador: "Caçador", videira: "Videira", joacaba: "Joaçaba" };

function _cexEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _cexChave(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function _cexHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _cexNum(n) { return Number(n || 0).toLocaleString("pt-BR"); }

function abrirConfExpedicao(event, transportadora) {
    if (event) event.preventDefault();
    _cexTransp = transportadora || "anjun";
    _cexDados = null;
    _cexCidades = null;
    _cexDia = null;
    const nome = _CEX_NOMES[_cexTransp] || _cexTransp;
    const logo = _CEX_LOGOS[_cexTransp];
    document.getElementById("cex-titulo").innerHTML = logo
        ? `<img src="${logo}" alt="${_cexEsc(nome)}" class="cex-logo"><span>Conferência</span>`
        : "Conferência — " + _cexEsc(nome);
    mostrarTela("tela-conf-expedicao", "Conferencias/" + nome);
    document.getElementById("titulo-pagina").innerText = "Conferência — " + nome;
    _cexAbrirAba(_cexAba);
}

function _cexAbrirAba(aba) {
    _cexAba = aba;
    document.getElementById("cex-abas").innerHTML = [["conferencia", "Conferência"], ["cidades", "Cidades por usuário"]].map(([k, n]) =>
        `<button type="button" class="filtro-tab${k === aba ? " active" : ""}" onclick="_cexAbrirAba('${k}')">${n}</button>`).join("");
    document.getElementById("cex-painel-conferencia").style.display = aba === "conferencia" ? "" : "none";
    document.getElementById("cex-painel-cidades").style.display = aba === "cidades" ? "" : "none";
    if (aba === "conferencia") _cexCarregar();
    else _cexCarregarCidades();
}

// ── Conferência ──
function _cexCarregar(msg) {
    const el = document.getElementById("cex-resultado");
    if (!_cexDados) el.innerHTML = skLogo();
    const qs = new URLSearchParams();
    if (_cexDia) qs.set("dia", _cexDia);
    if (_cexPolo) qs.set("polo", _cexPolo);
    fetch(`${_CEX_API()}/${_cexTransp}/resultado?${qs}`, { headers: _cexHeaders() })
    .then(r => r.json())
    .then(d => {
        // Sem polo no cadastro: pergunta (mesma escolha das telas da Shopee) e tenta de novo.
        if (d.polo_pendente && typeof gcPoloGarantir === "function") {
            el.innerHTML = `<div class="cft-ajuda">${_cexEsc(d.error)}</div>`;
            if (typeof gcPoloInvalidar === "function") gcPoloInvalidar();
            gcPoloGarantir(() => _cexCarregar());
            return;
        }
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cexEsc(d.error)}</div>`; return; }
        _cexDados = d;
        _cexDia = d.dia;
        _cexRender(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

async function _cexSubir(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const st = document.getElementById("cex-status");
    st.className = "cft-ajuda";
    st.innerText = "Lendo arquivo...";
    try {
        const grade = await _confLerGrid(file); // conferencias.js
        st.innerText = "Enviando...";
        const r = await fetch(`${_CEX_API()}/${_cexTransp}/envios`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ arquivo: file.name, grade }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.className = "cft-erro"; st.innerText = d.error || "Erro ao enviar."; return; }
        st.innerText = "";
        const desc = Object.entries(d.desconhecidos || {});
        const salvos = Object.entries(d.gravados || {}).map(([p, n]) => `${_CEX_POLOS[p] || p} ${_cexNum(n)}`).join(", ");
        const extra = [d.outro_polo ? `${_cexNum(d.outro_polo)} de outro polo ignorado(s)` : "",
            desc.length ? `${_cexNum(desc.reduce((a, [, n]) => a + n, 0))} com Ponto Responsável desconhecido (${desc.map(([k]) => k).slice(0, 3).join(", ")}) ignorado(s)` : "",
            d.repetidos ? `${_cexNum(d.repetidos)} waybill repetido(s) contado(s) uma vez` : "",
            d.ignorados ? `${_cexNum(d.ignorados)} linha(s) sem waybill ignorada(s)` : ""].filter(Boolean).join(" · ");
        _cexDados = null;
        _cexDia = d.dia;
        _cexCarregar(`Salvo em ${_cexDiaBr(d.dia)}: ${salvos}${extra ? " — " + extra : ""}.`);
    } catch (err) {
        st.className = "cft-erro";
        st.innerText = (err && err.message) || "Erro ao ler o arquivo.";
    }
}

function _cexRender(msg) {
    const d = _cexDados || {};
    const el = document.getElementById("cex-resultado");
    // Um relatório por dia e por polo: subir de novo no mesmo dia substitui aquele dia.
    const dias = d.dias || [];
    const selDia = dias.length ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_cexDia=this.value;_cexDados=null;_cexCarregar()">
        ${dias.map(x => `<option value="${x}"${x === d.dia ? " selected" : ""}>${_cexDiaBr(x)}${x === d.hoje ? " (hoje)" : ""}</option>`).join("")}
    </select>` : "";
    // Dev/admin escolhem o polo; os demais só enxergam o próprio (o backend já filtra).
    const selPolo = d.ve_tudo ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_cexPolo=this.value;_cexDia=null;_cexDados=null;_cexCarregar()">
        ${[["", "Todos os polos"], ...Object.entries(_CEX_POLOS)].map(([k, n]) => `<option value="${k}"${k === (d.polo || "") ? " selected" : ""}>${n}</option>`).join("")}
    </select>` : (d.polo ? `<span class="cft-ajuda">Polo ${_cexEsc(_CEX_POLOS[d.polo] || d.polo)}</span>` : "");
    document.getElementById("cex-envio").innerHTML = selDia + selPolo + (msg ? `<span class="cft-ajuda cft-pos">${_cexEsc(msg)}</span>` : "");

    if (!(d.envios || []).length) {
        el.innerHTML = `<div class="fechamento-empty">${d.dia ? "Nenhum relatório neste dia." : `Suba o relatório da ${_cexEsc(_CEX_NOMES[_cexTransp] || _cexTransp)} pra conferir.`}</div>`;
        return;
    }
    const usuarios = d.usuarios || [];
    const semCad = usuarios.filter(u => u.sem_cadastro);
    const comErro = usuarios.filter(u => !u.sem_cadastro && u.erradas);
    const tag = (u, n) => `<button class="cft-tag cft-tag-btn" data-u="${_cexEsc(u.usuario)}" onclick="_cexAbrirUsuario(this.dataset.u)">${_cexEsc(u.usuario)} <b>${_cexNum(n)}</b></button>`;
    const grupos = [];
    if (semCad.length) grupos.push(`<div class="cft-pend-grupo"><b>Login sem cidade cadastrada</b> — clique no nome pra dizer quais cidades ele faz:<div class="cft-pend-tags">${semCad.map(u => tag(u, u.qtd)).join("")}</div></div>`);
    if (comErro.length) grupos.push(`<div class="cft-pend-grupo"><b>Login com pacote de cidade que ele não faz</b> — confira a atribuição, ou clique no nome se a cidade for dele mesmo:<div class="cft-pend-tags">${comErro.map(u => tag(u, u.erradas)).join("")}</div></div>`);

    el.innerHTML = `
        <div class="cex-conf" id="cex-conf"></div>
        <div class="nr-tiles" id="cex-tiles" style="margin-bottom:18px"></div>
        <!-- Um card por conferência: a pizza diz QUANTO está certo; a barra ao lado, ONDE/QUEM falta. -->
        <div class="nr-graficos cex-graficos">
            <div class="nr-grafico-card">
                <div class="nr-grafico-titulo">1. Foi atribuído? <span class="cft-ajuda" style="font-weight:400">· meta 100%</span></div>
                <div class="nr-grafico-legenda" id="cex-gr-atrib-leg"></div>
                <div class="cex-par">
                    <div class="nr-grafico-area cex-rosca"><canvas id="cex-gr-atrib"></canvas><div class="cex-centro" id="cex-gr-atrib-centro"></div></div>
                    <div>
                        <div class="cex-par-sub">Sem atribuição por cidade</div>
                        <div class="nr-grafico-area cex-barras"><canvas id="cex-gr-cidades"></canvas>
                            <div class="nr-grafico-vazio" id="cex-gr-cidades-vazio" style="display:none">Todos os pacotes atribuídos.</div></div>
                    </div>
                </div>
            </div>
            <div class="nr-grafico-card">
                <div class="nr-grafico-titulo">2. Foi pra cidade certa? <span class="cft-ajuda" style="font-weight:400">· meta 100%</span></div>
                <div class="nr-grafico-legenda" id="cex-gr-certo-leg"></div>
                <div class="cex-par">
                    <div class="nr-grafico-area cex-rosca"><canvas id="cex-gr-certo"></canvas><div class="cex-centro" id="cex-gr-certo-centro"></div></div>
                    <div>
                        <div class="cex-par-sub" title="Clique na barra pra corrigir as cidades do login">Atribuição errada por login</div>
                        <div class="nr-grafico-area cex-barras"><canvas id="cex-gr-logins"></canvas>
                            <div class="nr-grafico-vazio" id="cex-gr-logins-vazio" style="display:none">Nenhum login com pacote fora das cidades dele.</div></div>
                    </div>
                </div>
            </div>
            <div class="nr-grafico-card">
                <div class="nr-grafico-titulo">3. É cidade que a gente atende?</div>
                <div class="nr-grafico-legenda" id="cex-gr-abr-leg"></div>
                <div class="cex-par">
                    <div class="nr-grafico-area cex-rosca"><canvas id="cex-gr-abr"></canvas><div class="cex-centro" id="cex-gr-abr-centro"></div></div>
                    <div>
                        <div class="cex-par-sub" title="Cidades que nenhum login desta transportadora faz">Fora de abrangência por cidade</div>
                        <div class="cex-lista" id="cex-fora"></div>
                    </div>
                </div>
            </div>
        </div>
        ${grupos.length ? `<div class="cft-pend"><div class="cft-pend-titulo">Pendências</div>${grupos.join("")}</div>` : ""}
        <div class="cft-barra" style="margin:0 0 10px">
            <input class="cft-input" id="cex-busca" placeholder="Buscar waybill, login ou cidade..." style="width:280px;flex:0 0 auto;margin:0" oninput="_cexPintarTabela()">
            <button class="cft-btn" onclick="_cexCopiar()">Copiar waybills</button>
            <span class="cft-ajuda" id="cex-copia"></span>
        </div>
        <div id="cex-tabela"></div>`;
    _cexPintarTabela();
    _cexGraficar();
}

// ── Gráficos ── (mesmo padrão do Backlog da Shopee: nr-graficos + Chart.js)
// Meta é zero pendência: o % no meio da pizza só fica verde em 100%.
const _CEX_CORES = { fora_abrangencia: "#a78bfa", ok: "#22c55e", sem_entregador: "#ef4444", cidade_errada: "#f97316", usuario_sem_cidade: "#f59e0b", sem_cidade: "#64748b" };
const _CEX_EIXO = { color: "#7b8ba3", font: { size: 11 } };
const _CEX_GRADE = { color: "rgba(255,255,255,0.055)", drawTicks: false };
const _CEX_GRAF_BASE = { responsive: true, maintainAspectRatio: false, animation: { duration: 220 } };
let _cexGraficos = {};

function _cexGraficar() {
    Object.values(_cexGraficos).forEach(g => { try { g.destroy(); } catch (_) {} });
    _cexGraficos = {};
    if (typeof Chart === "undefined") return;
    const r = (_cexDados && _cexDados.resumo) || {};
    const pacotes = (_cexDados && _cexDados.pacotes) || [];
    // Fora de abrangência não conta nas pizzas 1 e 2: não é pacote que a gente deveria atribuir.
    const nossos = r.total - r.fora_abrangencia;
    const atribuidos = nossos - r.sem_entregador;

    _cexRosca("atrib", [["Atribuídos", atribuidos, _CEX_CORES.ok], ["Sem atribuição", r.sem_entregador, _CEX_CORES.sem_entregador]],
        atribuidos, nossos, "atribuído");
    _cexRosca("certo", [["Cidade certa", r.ok, _CEX_CORES.ok], ["Cidade errada", r.cidade_errada, _CEX_CORES.cidade_errada],
        ["Login sem cidade", r.usuario_sem_cidade, _CEX_CORES.usuario_sem_cidade], ["Pacote sem cidade", r.sem_cidade, _CEX_CORES.sem_cidade]]
        .filter(([, n], i) => n || i < 2), r.ok, atribuidos, "na cidade certa");

    // Onde falta atribuir — a cidade é o que diz pra quem mandar.
    const porCidade = new Map();
    pacotes.filter(p => p.status === "sem_entregador").forEach(p => {
        const c = String(p.cidade || "").trim() || "(sem cidade)";
        porCidade.set(c, (porCidade.get(c) || 0) + 1);
    });
    _cexBarras("cidades", [...porCidade.entries()].sort((a, b) => b[1] - a[1]).slice(0, _CEX_MAX_BARRAS).map(([c, n]) => ({ rotulo: c, cidade_errada: 0, sem_entregador: n })),
        [["sem_entregador", "Sem atribuição"]]);

    // Quem recebeu pacote fora das cidades dele (ou sem cidade cadastrada). Clicar abre o card do login.
    const logins = ((_cexDados && _cexDados.usuarios) || [])
        .map(u => ({ rotulo: u.usuario, cidade_errada: u.erradas, usuario_sem_cidade: u.sem_cadastro ? u.qtd : 0 }))
        .filter(u => u.cidade_errada || u.usuario_sem_cidade)
        .sort((a, b) => (b.cidade_errada + b.usuario_sem_cidade) - (a.cidade_errada + a.usuario_sem_cidade)).slice(0, _CEX_MAX_BARRAS);
    _cexBarras("logins", logins, [["cidade_errada", "Cidade errada"], ["usuario_sem_cidade", "Login sem cidade"]], u => _cexAbrirUsuario(u.rotulo));

    // 3. O % aqui é informativo (o pacote não é nosso), mas fora de abrangência ainda é pendência:
    // precisa voltar pra transportadora — ou a cidade entrar na lista de algum login.
    _cexRosca("abr", [["Na abrangência", nossos, _CEX_CORES.ok], ["Fora de abrangência", r.fora_abrangencia, _CEX_CORES.fora_abrangencia]],
        nossos, r.total, "na abrangência", false);
    // Lista em vez de barra: costuma ser 1 pacote por cidade, e barras todas iguais não dizem nada.
    const fora = new Map();
    pacotes.filter(p => p.status === "fora_abrangencia").forEach(p => {
        const c = String(p.cidade || "").trim() || "(sem cidade)";
        fora.set(c, (fora.get(c) || 0) + 1);
    });
    const cidadesFora = [...fora.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    const elFora = document.getElementById("cex-fora");
    const limite = _CEX_MAX_BARRAS * 2;
    if (elFora) elFora.innerHTML = !cidadesFora.length
        ? `<div class="cft-ajuda">Todos os pacotes são de cidades que a gente atende.</div>`
        : cidadesFora.slice(0, limite).map(([c, n]) => `<div class="cex-lista-item" title="${_cexEsc(c)}"><span>${_cexEsc(c)}</span><b>${_cexNum(n)}</b></div>`).join("")
          + (cidadesFora.length > limite ? `<div class="cex-lista-item cft-ajuda">+${cidadesFora.length - limite} cidades</div>` : "");
}

// Arredonda pra baixo: 99,996% não pode aparecer como 100% se ainda tem pacote pendente.
// O 1e-9 evita o erro de ponto flutuante (99,02 * 100 = 9901,999...).
function _cexPct(feitos, total) {
    if (!total) return "—";
    if (feitos === total) return "100%";
    return (Math.floor(feitos / total * 10000 + 1e-9) / 100)
        .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

// meta = o % tem que chegar a 100 (verde só lá; abaixo, vermelho). Sem meta o número fica neutro.
function _cexRosca(id, fatias, feitos, total, rotulo, meta = true) {
    const leg = document.getElementById(`cex-gr-${id}-leg`);
    if (leg) leg.innerHTML = fatias.map(([n, v, cor]) => `<span class="nr-leg"><i style="background:${cor}"></i>${n} ${_cexNum(v)}</span>`).join("");
    const txt = _cexPct(feitos, total);
    const centro = document.getElementById(`cex-gr-${id}-centro`);
    if (centro) centro.innerHTML = `<div class="cex-centro-valor" style="color:${!meta ? "#cbd5e1" : feitos === total ? _CEX_CORES.ok : _CEX_CORES.sem_entregador}">${txt}</div>
        <div class="cex-centro-rotulo">${rotulo}</div>`;
    // Fatia zerada fica só na legenda — na pizza ela vira um risco escuro no topo.
    const comValor = fatias.filter(f => f[1]);
    _cexGraficos[id] = new Chart(document.getElementById(`cex-gr-${id}`), {
        type: "doughnut",
        data: { labels: comValor.map(f => f[0]), datasets: [{ data: comValor.map(f => f[1]), backgroundColor: comValor.map(f => f[2]),
            borderColor: "#0f1520", borderWidth: comValor.length > 1 ? 2 : 0 }] },
        options: { ..._CEX_GRAF_BASE, cutout: "68%", plugins: { legend: { display: false },
            tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed.toLocaleString("pt-BR")} pacotes` } } } },
    });
}

function _cexBarras(id, linhas, series, aoClicar) {
    const vazio = document.getElementById(`cex-gr-${id}-vazio`);
    if (vazio) vazio.style.display = linhas.length ? "none" : "";
    const leg = document.getElementById(`cex-gr-${id}-leg`);
    if (leg) leg.innerHTML = linhas.length && series.length > 1
        ? series.map(([k, n]) => `<span class="nr-leg"><i style="background:${_CEX_CORES[k]}"></i>${n}</span>`).join("") : "";
    // Altura pela quantidade de linhas: 2 cidades não precisam de um gráfico de 250px.
    const canvas = document.getElementById(`cex-gr-${id}`);
    if (canvas) canvas.parentElement.style.height = (linhas.length ? Math.max(70, linhas.length * 19 + 24) : 70) + "px";
    if (!linhas.length) return;
    const curto = t => t.length <= 17 ? t : t.slice(0, 16) + "…";
    _cexGraficos[id] = new Chart(document.getElementById(`cex-gr-${id}`), {
        type: "bar",
        data: {
            labels: linhas.map(l => curto(l.rotulo)),
            datasets: series.map(([k, n]) => ({ label: n, data: linhas.map(l => l[k]), backgroundColor: _CEX_CORES[k], maxBarThickness: 11 })),
        },
        options: {
            ..._CEX_GRAF_BASE, indexAxis: "y",
            onClick: aoClicar ? (_, els) => { if (els.length) aoClicar(linhas[els[0].index]); } : undefined,
            onHover: aoClicar ? (e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; } : undefined,
            plugins: { legend: { display: false }, tooltip: { callbacks: {
                title: c => linhas[c[0].dataIndex].rotulo,
                label: c => `${c.dataset.label}: ${c.parsed.x.toLocaleString("pt-BR")} pacotes`,
            } } },
            scales: {
                x: { stacked: true, ticks: { ..._CEX_EIXO, precision: 0 }, grid: _CEX_GRADE, beginAtZero: true },
                y: { stacked: true, ticks: { ..._CEX_EIXO, autoSkip: false }, grid: { display: false } },
            },
        },
    });
}

function _cexDiaBr(dia) {
    const [a, m, d] = String(dia || "").split("-");
    return d ? `${d}/${m}/${a}` : "";
}

function _cexData(v) {
    if (!v) return "";
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function _cexFiltrados() {
    const pacotes = (_cexDados && _cexDados.pacotes) || [];
    const q = _cexChave((document.getElementById("cex-busca") || {}).value);
    return pacotes.filter(p => (_cexFiltro === "todos" || (_cexFiltro === "pend" ? p.status !== "ok" : p.status === _cexFiltro))
        && (!q || _cexChave(p.waybill).includes(q) || _cexChave(p.entregador).includes(q) || _cexChave(p.cidade).includes(q) || _cexChave(p.cliente).includes(q)));
}

function _cexPintarTabela() {
    const r = (_cexDados && _cexDados.resumo) || {};
    // Conformidade: pacote nosso (dentro da abrangência) atribuído pro login certo. Meta 100%.
    // Clicar filtra a tabela pelo que falta.
    const nossos = r.total - r.fora_abrangencia;
    const faltam = nossos - r.ok;
    const segs = [["ok", r.ok], ["sem_entregador", r.sem_entregador], ["cidade_errada", r.cidade_errada],
        ["usuario_sem_cidade", r.usuario_sem_cidade], ["sem_cidade", r.sem_cidade]].filter(([, n]) => n);
    const fc = document.getElementById("cex-conf");
    if (fc) fc.innerHTML = `
        <div class="cex-conf-topo${_cexFiltro === "pend" ? " sel" : ""}" onclick="_cexFiltro='pend';_cexPintarTabela()" title="Clique pra ver só o que falta">
            <span class="cex-conf-rotulo">Conformidade</span>
            <b style="color:${faltam ? _CEX_CORES.sem_entregador : _CEX_CORES.ok}">${_cexPct(r.ok, nossos)}</b>
            <span class="cft-ajuda">${_cexNum(r.ok)} de ${_cexNum(nossos)} atribuídos certo${faltam ? ` · faltam ${_cexNum(faltam)}` : ""} · meta 100%</span>
        </div>
        <div class="cex-conf-barra">${nossos ? segs.map(([k, n]) =>
            `<i style="width:${n / nossos * 100}%;background:${_CEX_CORES[k]}" title="${_CEX_STATUS[k].rotulo}: ${_cexNum(n)}"></i>`).join("") : ""}</div>`;

    // Tiles = filtro da tabela (mesmo jeito do Backlog da Shopee).
    const tiles = [["todos", "Pacotes", r.total, ""],
        ["fora_abrangencia", "Fora de abrangência", r.fora_abrangencia, _CEX_CORES.fora_abrangencia],
        ["sem_entregador", "Sem atribuição", r.sem_entregador, _CEX_CORES.sem_entregador],
        ["cidade_errada", "Cidade errada", r.cidade_errada, _CEX_CORES.cidade_errada],
        ["sem_cidade", "Pacote sem cidade", r.sem_cidade, _CEX_CORES.sem_cidade]]
        .filter(([k, , n]) => n || !["sem_cidade", "fora_abrangencia"].includes(k));
    const ft = document.getElementById("cex-tiles");
    if (ft) ft.innerHTML = tiles.map(([k, nome, n, cor]) => `
        <div class="nr-tile nr-tile-click${k === _cexFiltro ? " nr-tile-selecionada" : ""}" onclick="_cexFiltro='${k}';_cexPintarTabela()">
            <div class="nr-tile-label">${cor ? `<span class="nr-chip-cor" style="background:${cor}"></span>` : ""}${nome}</div>
            <div class="nr-tile-valor">${_cexNum(n)}</div>
            <div class="nr-tile-sub">${r.total ? (Math.floor(n / r.total * 1000) / 10).toLocaleString("pt-BR") + "% dos pacotes" : "pacotes"}</div>
        </div>`).join("");
    const el = document.getElementById("cex-tabela");
    if (!el) return;
    const lista = _cexFiltrados();
    const verPolo = !!(_cexDados && _cexDados.ve_tudo && !_cexDados.polo);
    if (!lista.length) { el.innerHTML = `<div class="cft-ajuda">Nada por aqui.</div>`; return; }
    el.innerHTML = `<div class="cft-tabela-wrap" style="max-height:62vh"><table class="cft-tabela">
        <thead><tr><th>Waybill</th>${verPolo ? "<th>Polo</th>" : ""}<th>Entregador</th><th>Cidade do destinatário</th><th>Cidades do login</th><th>Remetente</th><th class="num">Valor declarado</th><th>Área de recebimento</th><th>Última rota</th><th>Entrada no ponto</th><th>Situação</th></tr></thead>
        <tbody>${lista.slice(0, _CEX_MAX_LINHAS).map(p => {
            const s = _CEX_STATUS[p.status] || { rotulo: p.status, classe: "" };
            const cid = p.cidades_usuario || [];
            return `<tr>
                <td>${_cexEsc(p.waybill)}</td>
                ${verPolo ? `<td title="${_cexEsc(p.ponto)}">${_cexEsc(_CEX_POLOS[p.polo] || p.polo)}</td>` : ""}
                <td>${p.entregador ? `<a href="#" class="cft-link" data-u="${_cexEsc(p.entregador)}" onclick="event.preventDefault();_cexAbrirUsuario(this.dataset.u)">${_cexEsc(p.entregador)}</a>` : `<span class="cft-vazio">—</span>`}</td>
                <td>${_cexEsc(p.cidade) || `<span class="cft-vazio">—</span>`}</td>
                <td class="cft-ajuda" title="${_cexEsc(cid.join(", "))}">${cid.length ? _cexEsc(cid.slice(0, 3).join(", ")) + (cid.length > 3 ? ` +${cid.length - 3}` : "") : ""}</td>
                <td title="${_cexEsc(p.cliente)}">${_cexEsc(String(p.cliente || "").slice(0, 32))}</td>
                <td class="num">${_cexEsc(p.valor_declarado)}</td>
                <td>${_cexEsc(p.area_recebimento)}</td>
                <td title="${_cexEsc(p.ultima_rota)}">${_cexEsc(String(p.ultima_rota || "").slice(0, 40))}</td>
                <td>${_cexEsc(p.entrada_ponto)}</td>
                <td class="${s.classe}">${s.rotulo}</td>
            </tr>`;
        }).join("")}</tbody></table></div>
        ${lista.length > _CEX_MAX_LINHAS ? `<div class="cft-ajuda" style="margin-top:6px">Mostrando ${_CEX_MAX_LINHAS} de ${_cexNum(lista.length)} — "Copiar waybills" leva todos do filtro.</div>` : ""}`;
}

function _cexCopiar() {
    const codigos = _cexFiltrados().map(p => p.waybill);
    const st = document.getElementById("cex-copia");
    if (!codigos.length) { st.innerText = "Nada pra copiar."; return; }
    navigator.clipboard.writeText(codigos.join("\n"))
        .then(() => { st.innerText = `${_cexNum(codigos.length)} copiado(s).`; })
        .catch(() => { st.innerText = "Não deu pra copiar."; });
}

// ── Card "Quais cidades esse login faz?" — cidades dele neste relatório pra marcar, mais uma
// livre. Grava em Cidades por usuário e refaz a conferência.
function _cexAbrirUsuario(usuario) {
    const d = _cexDados || {};
    const u = (d.usuarios || []).find(x => _cexChave(x.usuario) === _cexChave(usuario))
        || { usuario, qtd: 0, cadastradas: [], cidades: [], sem_cadastro: true };
    _cexFecharModal();
    const novas = u.cidades.filter(c => !c.atende);
    const conhecidas = new Set();
    for (const x of d.usuarios || []) { x.cadastradas.forEach(c => conhecidas.add(c)); x.cidades.forEach(c => conhecidas.add(c.cidade)); }
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "cex-modal";
    ov.innerHTML = `
        <div class="cft-modal">
            <div class="cft-modal-titulo">Quais cidades <span style="color:#e2e8f0">${_cexEsc(u.usuario)}</span> faz?</div>
            <div class="cft-ajuda" style="margin-bottom:10px">${_cexNum(u.qtd)} pacote${u.qtd !== 1 ? "s" : ""} dele neste relatório.</div>
            <div class="cft-ajuda">Já cadastradas:</div>
            ${u.cadastradas.length
                ? `<div class="cft-pend-tags" style="margin-bottom:12px">${u.cadastradas.map(c => `<span class="cft-tag">${_cexEsc(c)}</span>`).join("")}</div>`
                : `<div class="cft-ajuda" style="font-style:italic;margin-bottom:12px">Nenhuma.</div>`}
            ${novas.length ? `<div class="cft-ajuda">Cidades dele neste relatório que ainda não estão na lista — marque as que ele faz:</div>
                <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0 12px;max-height:200px;overflow:auto">
                    ${novas.map(c => `<label class="cft-ajuda" style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#cbd5e1">
                        <input type="checkbox" class="cex-marca" value="${_cexEsc(c.cidade)}"${u.sem_cadastro ? " checked" : ""}> ${_cexEsc(c.cidade)} <span class="cft-ajuda">${_cexNum(c.qtd)}</span></label>`).join("")}
                </div>` : ""}
            <label class="cft-rotulo" for="cex-outra">Outra cidade</label>
            <input id="cex-outra" class="cft-input" list="cex-cidades-conhecidas" autocomplete="off" placeholder="Digite a cidade..."
                onkeydown="if(event.key==='Enter')_cexSalvarUsuario()">
            <datalist id="cex-cidades-conhecidas">${[...conhecidas].sort((a, b) => a.localeCompare(b, "pt-BR")).map(c => `<option value="${_cexEsc(c)}">`).join("")}</datalist>
            <div class="cft-ajuda" id="cex-modal-status" style="min-height:18px;margin-top:8px"></div>
            <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
                <button class="cft-btn" onclick="_cexFecharModal()">Cancelar</button>
                <button class="cft-btn primario" id="cex-modal-salvar" data-u="${_cexEsc(u.usuario)}" onclick="_cexSalvarUsuario()">Salvar</button>
            </div>
        </div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _cexFecharModal(); });
    document.body.appendChild(ov);
}

function _cexFecharModal() {
    const ov = document.getElementById("cex-modal");
    if (ov) ov.remove();
}

async function _cexSalvarUsuario() {
    const btn = document.getElementById("cex-modal-salvar");
    const st = document.getElementById("cex-modal-status");
    const usuario = btn.dataset.u;
    const cidades = [...document.querySelectorAll(".cex-marca")].filter(c => c.checked).map(c => c.value);
    const outra = document.getElementById("cex-outra").value.trim();
    if (outra) cidades.push(outra);
    if (!cidades.length) { st.innerText = "Marque ou digite pelo menos uma cidade."; return; }
    btn.disabled = true;
    st.innerText = "Salvando...";
    try {
        const r = await fetch(`${_CEX_API()}/cidades-usuario`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ transportadora: _cexTransp, usuario, cidades }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { btn.disabled = false; st.innerText = d.error || "Erro ao salvar."; return; }
        _cexFecharModal();
        _cexCidades = null;
        _cexCarregar(`${usuario}: ${cidades.length} cidade(s) cadastrada(s).`);
    } catch (_) { btn.disabled = false; st.innerText = "Erro ao salvar."; }
}

// ── Cidades por usuário ──
function _cexCarregarCidades(msg) {
    const el = document.getElementById("cex-cidades");
    if (!_cexCidades) el.innerHTML = skLogo();
    fetch(`${_CEX_API()}/cidades-usuario?transportadora=${_cexTransp}`, { headers: _cexHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cexEsc(d.error)}</div>`; return; }
        _cexCidades = d.linhas || [];
        _cexRenderCidades(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

function _cexRenderCidades(msg) {
    const el = document.getElementById("cex-cidades");
    const busca = (document.getElementById("cex-cid-busca") || {}).value || "";
    const nome = _CEX_NOMES[_cexTransp] || _cexTransp;
    const usuarios = new Set((_cexCidades || []).map(l => _cexChave(l.usuario)));
    el.innerHTML = `
        <div class="cft-regras">
            <div class="cft-ajuda" style="margin-bottom:8px">Cada login da ${_cexEsc(nome)} e as cidades que ele faz. A conferência marca
                <b>Cidade errada</b> quando o pacote foi atribuído a um login que não tem a cidade dele aqui.</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <input class="cft-input" id="cex-cid-busca" placeholder="Buscar login ou cidade..." value="${_cexEsc(busca)}" style="width:240px;flex:0 0 auto;margin:0" oninput="_cexPintarCidades()">
                <label class="cft-btn" for="cex-cid-arquivo" style="cursor:pointer">Importar planilha</label>
                <input type="file" id="cex-cid-arquivo" accept=".csv,.xlsx,.xls" style="display:none" onchange="_cexImportar(this)">
                <span class="cft-ajuda">${_cexNum(usuarios.size)} login(s) · ${_cexNum((_cexCidades || []).length)} cidade(s)</span>
                <span class="cft-ajuda" id="cex-cid-status">${_cexEsc(msg || "")}</span>
            </div>
            <div class="cft-ajuda" style="margin-top:6px">Planilha: colunas <b>Usuário</b>, <b>Cidade</b> e (opcional) <b>Transportadora</b>; sem transportadora vale ${_cexEsc(nome)}. Soma ao que já existe.</div>
            <div class="cft-barra" style="margin:12px 0 0;flex-wrap:wrap">
                <input class="cft-input" id="cex-cid-novo-u" placeholder="Login" style="width:200px;flex:0 0 auto;margin:0">
                <input class="cft-input" id="cex-cid-novo-c" placeholder="Cidade" style="width:200px;flex:0 0 auto;margin:0" onkeydown="if(event.key==='Enter')_cexAdicionar()">
                <button class="cft-btn primario" onclick="_cexAdicionar()">Adicionar</button>
            </div>
        </div>
        <div id="cex-cid-lista"></div>`;
    _cexPintarCidades();
}

function _cexPintarCidades() {
    const el = document.getElementById("cex-cid-lista");
    if (!el) return;
    const q = _cexChave((document.getElementById("cex-cid-busca") || {}).value);
    const grupos = new Map();
    for (const l of _cexCidades || []) {
        const k = _cexChave(l.usuario);
        if (!grupos.has(k)) grupos.set(k, { usuario: l.usuario, cidades: [] });
        grupos.get(k).cidades.push(l);
    }
    const lista = [...grupos.values()].filter(g => !q || _cexChave(g.usuario).includes(q) || g.cidades.some(c => _cexChave(c.cidade).includes(q)));
    if (!lista.length) { el.innerHTML = `<div class="cft-ajuda">${(_cexCidades || []).length ? "Ninguém com esse nome." : "Nenhum login cadastrado ainda — importe a planilha ou adicione acima."}</div>`; return; }
    el.innerHTML = `<div class="cft-tabela-wrap"><table class="cft-tabela"><thead><tr><th>Login</th><th>Cidades</th><th></th></tr></thead><tbody>
        ${lista.slice(0, 300).map(g => `<tr>
            <td style="vertical-align:top">${_cexEsc(g.usuario)}</td>
            <td style="white-space:normal"><div class="cft-pend-tags" style="margin:0">${g.cidades.map(c =>
                `<span class="cft-tag" title="${_cexEsc(c.criado_por ? "por " + c.criado_por : "")}">${_cexEsc(c.cidade)}
                    <a href="#" class="cft-ajuda" style="margin-left:4px;text-decoration:none" title="Tirar" onclick="event.preventDefault();_cexRemover(${Number(c.id)})">×</a></span>`).join("")}</div></td>
            <td style="vertical-align:top"><a href="#" class="cft-link" data-u="${_cexEsc(g.usuario)}" onclick="event.preventDefault();_cexNovaCidade(this.dataset.u)">+ cidade</a></td>
        </tr>`).join("")}
    </tbody></table></div>
    ${lista.length > 300 ? `<div class="cft-ajuda" style="margin-top:6px">Mostrando 300 de ${_cexNum(lista.length)} — busque pra achar os outros.</div>` : ""}`;
}

function _cexNovaCidade(usuario) {
    document.getElementById("cex-cid-novo-u").value = usuario;
    const c = document.getElementById("cex-cid-novo-c");
    c.value = "";
    c.focus();
}

async function _cexAdicionar() {
    const usuario = document.getElementById("cex-cid-novo-u").value.trim();
    const cidade = document.getElementById("cex-cid-novo-c").value.trim();
    if (!usuario || !cidade) { gcAlert("Preencha o login e a cidade."); return; }
    try {
        const r = await fetch(`${_CEX_API()}/cidades-usuario`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ transportadora: _cexTransp, usuario, cidades: [cidade] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { gcAlert(d.error || "Erro ao salvar."); return; }
        _cexDados = null;
        _cexCarregarCidades(d.inseridos ? `${usuario} → ${cidade}.` : "Já estava na lista.");
    } catch (_) { gcAlert("Erro ao salvar."); }
}

function _cexRemover(id) {
    fetch(`${_CEX_API()}/cidades-usuario/${id}`, { method: "DELETE", headers: _cexHeaders() })
    .then(r => r.json())
    .then(d => { if (d.error) gcAlert(d.error); else { _cexDados = null; _cexCarregarCidades("Removida."); } })
    .catch(() => gcAlert("Erro ao remover."));
}

async function _cexImportar(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const st = document.getElementById("cex-cid-status");
    st.innerText = "Lendo...";
    try {
        const grade = (await _confLerGrid(file)).filter(l => l.some(c => String(c).trim()));
        const cab = (grade[0] || []).map(_cexChave);
        const iu = cab.findIndex(h => h.includes("usuario") || h.includes("login") || h.includes("entregador"));
        const ic = cab.findIndex(h => h.includes("cidade"));
        const it = cab.findIndex(h => h.includes("transportadora"));
        // Sem cabeçalho reconhecível: lê na ordem usuário, cidade, transportadora.
        const temCab = iu >= 0 && ic >= 0;
        const linhas = (temCab ? grade.slice(1) : grade).map(l => temCab
            ? [l[iu], l[ic], it >= 0 ? l[it] : ""]
            : [l[0], l[1], l[2] || ""]);
        const r = await fetch(`${_CEX_API()}/cidades-usuario/importar`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ transportadora: _cexTransp, linhas }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.innerText = d.error || "Erro ao importar."; return; }
        _cexDados = null;
        _cexCarregarCidades(`${_cexNum(d.inseridos)} nova(s)` + (d.ja_existiam ? `, ${_cexNum(d.ja_existiam)} já existia(m)` : "")
            + (d.ignorados ? `, ${_cexNum(d.ignorados)} linha(s) ignorada(s)` : "") + ".");
    } catch (err) { st.innerText = (err && err.message) || "Erro ao ler o arquivo."; }
}
