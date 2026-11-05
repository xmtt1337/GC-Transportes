// Operação › Transportadoras › Jadlog › Atribuir (a partir de 01/11/2026): a operação escolhe o
// dia e o entregador e bipa o código de cada pacote Jadlog (leitor ou câmera). Cada código vira
// um pacote no fechamento (Criar Fechamento › Jadlog › Atualizar com a operação). Até a Q2 de
// outubro/2026 o Jadlog era por quantidade (jadlog-anotacoes.js).

const _JAT_API = () => `${API}/jadlog/atribuicoes`;
const _JAT_INICIO = "2026-11-01";
let _jatDados = null;       // { dia, atribuicoes, entregadores, habituais, dias, total }
let _jatDia = null;         // dia escolhido
let _jatEntregador = "";    // entregador que está recebendo os bipes

function _jatEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _jatChave(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function _jatHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _jatHoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function abrirJadlogAtribuir(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-jadlog-atribuir", "Jadlog/Atribuir");
    document.getElementById("titulo-pagina").innerText = "Atribuir — Jadlog";
    _jatDia = _jatHoje() < _JAT_INICIO ? _JAT_INICIO : _jatHoje();
    document.getElementById("jat-conteudo").innerHTML = `
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap;align-items:center">
            <div class="slh-cal" id="jat-cal"></div>
            <span style="flex:1"></span>
            <span class="cft-ajuda" id="jat-total"></span>
        </div>
        <div class="cft-regras" style="margin:10px 0">
            <div class="cft-rotulo" style="margin-bottom:6px">Entregador</div>
            <div id="jat-escolhido" style="margin-bottom:8px"></div>
            <div class="adm-search-input-area" style="max-width:420px;margin:0">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7b98b5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="jat-busca" placeholder="Pesquisar entregador..." autocomplete="off" oninput="_jatBuscar()">
            </div>
            <div id="jat-sugestoes" style="display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px"></div>
            <div class="cft-rotulo" style="margin:14px 0 6px">Código do pacote</div>
            <div class="bte-codigo-row" style="max-width:420px">
                <input type="text" id="jat-codigo" class="ant-input" placeholder="Bipe ou digite e aperte Enter" autocomplete="off" style="flex:1"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();_jatBipar(this.value);}">
                <button type="button" class="bte-scan-btn" onclick="_jatCamera()" title="Ler com a câmera">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
                </button>
            </div>
            <div class="cft-ajuda" id="jat-status" style="margin-top:8px">Escolha o entregador e bipe os pacotes dele.</div>
        </div>
        <div id="jat-lista"></div>`;
    _jatMontarCalendario();
    _jatCarregar();
}

/** Do início da atribuição (01/11/2026) até hoje, no máximo 120 dias; total bipado embaixo do dia. */
function _jatDiasDoCalendario(comBipe, hoje) {
    const totais = new Map((comBipe || []).map(d => [d.dia, d.total]));
    const dias = [];
    const base = new Date(hoje + "T12:00:00");
    for (let i = -120; i <= 0; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (dia < _JAT_INICIO) continue;
        const t = totais.get(dia);
        dias.push(t ? { dia, sub: String(t), resumo: `${t} pacote(s) Jadlog` } : { dia });
    }
    return dias;
}

function _jatMontarCalendario() {
    const hoje = _jatHoje();
    gcCalMontar({
        alvo: "jat-cal",
        dias: _jatDiasDoCalendario(_jatDados && _jatDados.dias, hoje < _JAT_INICIO ? _JAT_INICIO : hoje),
        dia: _jatDia,
        hoje,
        legenda: "Número embaixo do dia = pacotes Jadlog atribuídos",
        aoEscolher: (dia) => { _jatDia = dia; _jatMontarCalendario(); _jatCarregar(); },
    });
}

function _jatCarregar() {
    const el = document.getElementById("jat-lista");
    el.innerHTML = skLogo(true, "Carregando as atribuições");
    const dia = _jatDia;
    fetch(`${_JAT_API()}?dia=${encodeURIComponent(dia)}`, { headers: _jatHeaders() })
    .then(r => r.json())
    .then(d => {
        if (dia !== _jatDia) return;
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_jatEsc(d.error)}</div>`; return; }
        _jatDados = d;
        _jatMontarCalendario();
        _jatDesenhar();
        if (d.aviso) _jatStatus(d.aviso, "aviso");
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as atribuições.</div>`; });
}

/** Sugestões da lupa: quem já recebeu Jadlog primeiro; sem busca, só esses. */
function _jatSugestoes(d, busca) {
    const b = _jatChave(busca);
    const hab = d.habituais || [];
    const vistos = new Set();
    const ordem = hab.concat(d.entregadores || []).filter(n => { const k = _jatChave(n); if (vistos.has(k)) return false; vistos.add(k); return true; });
    return (b ? ordem.filter(n => _jatChave(n).includes(b)) : hab).slice(0, 12);
}

/** Atribuições do dia por entregador (quem tem mais primeiro); dentro, o último bipe em cima. */
function _jatGrupos(atribuicoes) {
    const m = new Map();
    for (const a of atribuicoes || []) {
        if (!m.has(a.entregador)) m.set(a.entregador, []);
        m.get(a.entregador).push(a);
    }
    return [...m.entries()].map(([entregador, itens]) => ({ entregador, itens }))
        .sort((x, y) => y.itens.length - x.itens.length || x.entregador.localeCompare(y.entregador, "pt-BR"));
}

function _jatHtmlLista(d) {
    const grupos = _jatGrupos(d.atribuicoes);
    if (!grupos.length) return `<div class="cft-ajuda" style="padding:8px 0">Nenhum pacote Jadlog atribuído neste dia.</div>`;
    return grupos.map(g => `<div class="cft-regras" style="margin:0 0 10px">
        <div class="cft-barra" style="margin:0 0 6px"><b style="color:#e2e8f0">${_jatEsc(g.entregador)}</b>
            <span class="cft-ajuda">${g.itens.length} pacote(s)</span>
            <span style="flex:1"></span>
            <button type="button" class="cft-link" data-e="${_jatEsc(g.entregador)}" onclick="_jatEscolher(this.dataset.e)">Bipar pra ele</button></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${g.itens.map(a => `<span class="cft-tag" title="${_jatEsc((a.atribuido_nome || "") + (a.criado_em ? " · " + new Date(a.criado_em).toLocaleString("pt-BR") : ""))}">
            ${_jatEsc(a.codigo)} <button type="button" class="cft-link" style="margin-left:4px" onclick="_jatRemover(${a.id}, '${_jatEsc(a.codigo)}')" title="Tirar">×</button></span>`).join("")}</div>
    </div>`).join("");
}

function _jatDesenhar() {
    document.getElementById("jat-lista").innerHTML = _jatHtmlLista(_jatDados);
    document.getElementById("jat-total").innerText = `${Number(_jatDados.total || 0).toLocaleString("pt-BR")} pacote(s) atribuídos no dia`;
    document.getElementById("jat-escolhido").innerHTML = _jatEntregador
        ? `<span class="cft-sim">Bipando para:</span> <b style="color:#e2e8f0">${_jatEsc(_jatEntregador)}</b>`
        : `<span class="cft-ajuda">Nenhum entregador escolhido.</span>`;
    _jatBuscar();
}

function _jatBuscar() {
    const busca = (document.getElementById("jat-busca") || {}).value || "";
    document.getElementById("jat-sugestoes").innerHTML = _jatDados ? _jatSugestoes(_jatDados, busca).map(n =>
        `<button type="button" class="cft-link" data-n="${_jatEsc(n)}" onclick="_jatEscolher(this.dataset.n)">${_jatEsc(n)}</button>`).join("") : "";
}

function _jatEscolher(nome) {
    _jatEntregador = nome;
    document.getElementById("jat-busca").value = "";
    _jatDesenhar();
    _jatStatus(`Bipe os pacotes de ${nome}.`);
    document.getElementById("jat-codigo").focus();
}

function _jatStatus(msg, tipo) {
    const el = document.getElementById("jat-status");
    el.innerHTML = tipo === "erro" ? `<span class="cft-erro">${_jatEsc(msg)}</span>` : tipo === "ok" ? `<span class="cft-sim">${_jatEsc(msg)}</span>`
        : tipo === "aviso" ? `<span style="color:#f59e0b">${_jatEsc(msg)}</span>` : _jatEsc(msg);
}

async function _jatBipar(texto) {
    const input = document.getElementById("jat-codigo");
    const codigo = String(texto || "").trim();
    if (!codigo) return;
    if (!_jatEntregador) { _gcBeepErro(); _jatStatus("Escolha o entregador antes de bipar.", "erro"); return; }
    input.value = "";
    try {
        const r = await fetch(_JAT_API(), { method: "POST", headers: _jatHeaders(true),
            body: JSON.stringify({ dia: _jatDia, entregador: _jatEntregador, codigo }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao atribuir.");
        _gcBeepSucesso();
        _jatDados.atribuicoes = [{ ...d.atribuicao }].concat(_jatDados.atribuicoes || []);
        _jatDados.total = (_jatDados.total || 0) + 1;
        _jatDesenhar();
        _jatStatus(`${d.atribuicao.codigo} → ${_jatEntregador}`, "ok");
    } catch (err) {
        _gcBeepErro();
        _jatStatus(err.message, "erro");
    }
    input.focus();
}

function _jatCamera() {
    _bteAbrirScanner(texto => _jatBipar(texto));
}

function _jatRemover(id, codigo) {
    gcConfirm(`Tirar ${codigo} da atribuição?`, async () => {
        const r = await fetch(`${_JAT_API()}/${id}`, { method: "DELETE", headers: _jatHeaders() });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { gcAlert(d.error || "Erro ao tirar."); return; }
        _jatDados.atribuicoes = (_jatDados.atribuicoes || []).filter(a => a.id !== id);
        _jatDados.total = Math.max(0, (_jatDados.total || 0) - 1);
        _jatDesenhar();
        _jatStatus(`${codigo} tirado.`);
    }, null, "Tirar");
}
