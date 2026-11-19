// ───── PLANEJAMENTO VIDEIRA (bairro → entregador) ─────
// Desde 14/10/2026 o planejamento é GERAL: uma aba por unidade ("Geral Caçador",
// "Geral Videira") com o nome padrão do entregador, e a lista de nomes vem da
// planilha "Dados entregadores". O planejamento por transportadora fica inativo,
// não apagado — voltar é trocar esta constante para true.
const _PV_POR_TRANSPORTADORA = false;
const _PV_GERAL_COR = "#3a86ff";

const _PV_TRANSP = [
    { key: "loggi",         label: "Loggi",         cor: "#12A5E8" },
    { key: "anjun",         label: "Anjun",         cor: "#22C55E" },
    { key: "shopee",        label: "Shopee",        cor: "#F97316" },
    { key: "imile",         label: "Imile",         cor: "#9333EA" },
    { key: "jt",            label: "J&T",           cor: "#EF4444" },
    { key: "total_express", label: "Total Express", cor: "#F59E0B" },
];

const _PV_UNIDADE_LABEL = { videira: "Videira", cacador: "Caçador" };

let _pvUnidade        = "videira";
let _pvTransportadora = _PV_POR_TRANSPORTADORA ? "loggi" : "geral";
let _pvLinhas   = [];
let _pvUsuarios = [];
let _pvView     = "bairro"; // 'bairro' | 'entregador'

function abrirPlanejamentoVideira(event, unidade) {
    if (event) event.preventDefault();
    _pvUnidade = unidade || "videira";
    document.getElementById("pv-titulo-unidade").innerText = _PV_UNIDADE_LABEL[_pvUnidade] || _pvUnidade;
    const tabs = document.getElementById("pv-transp-tabs");
    tabs.style.display = _PV_POR_TRANSPORTADORA ? "" : "none";
    // A lista do geral vem da planilha Dados entregadores — só lá faz sentido pedir cadastro.
    document.getElementById("pv-inserir-btn").style.display = _PV_POR_TRANSPORTADORA ? "none" : "";
    // Enquete "vou fazer a rota de amanhã?" (js/planejamento-enquete.js) — uma por unidade.
    document.getElementById("pv-enquete-btn").style.display = ["cacador", "videira"].includes(_pvUnidade) ? "" : "none";
    tabs.innerHTML = !_PV_POR_TRANSPORTADORA ? "" : _PV_TRANSP.map(t => `
        <button class="pv-transp-tab${t.key === _pvTransportadora ? " active" : ""}" style="--pvc:${t.cor}"
            data-t="${t.key}" onclick="_pvTrocarTransportadora('${t.key}')">
            <span class="pv-tab-dot"></span>${t.label}
        </button>
    `).join("");
    document.getElementById("pv-filtro-input").value = "";
    _pvAplicarAccent();
    document.querySelectorAll(".pv-view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === _pvView));
    document.getElementById("pv-card").style.display        = _pvView === "bairro" ? "" : "none";
    document.getElementById("pv-driver-grid").style.display = _pvView === "entregador" ? "" : "none";
    const _rotaUnidade = { videira: "Videira", cacador: "Cacador" };
    mostrarTela("tela-planejamento-videira", "Planejamento/" + (_rotaUnidade[_pvUnidade] || ""));
    _pvCarregar();
}

function _pvTrocarTransportadora(t) {
    _pvDragForcarLimpeza();
    _pvTransportadora = t;
    document.querySelectorAll(".pv-transp-tab").forEach(btn =>
        btn.classList.toggle("active", btn.dataset.t === t)
    );
    document.getElementById("pv-filtro-input").value = "";
    _pvAplicarAccent();
    _pvCarregar();
}

function _pvAplicarAccent() {
    const cor = (_PV_TRANSP.find(t => t.key === _pvTransportadora) || {}).cor || _PV_GERAL_COR;
    // Aplica no root para o popup de busca (que fica anexado ao <body>) também herdar a cor certa
    document.documentElement.style.setProperty("--pv-accent", cor);
}

function _pvMudarView(view) {
    _pvDragForcarLimpeza();
    _pvView = view;
    document.querySelectorAll(".pv-view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    document.getElementById("pv-card").style.display        = view === "bairro" ? "" : "none";
    document.getElementById("pv-driver-grid").style.display = view === "entregador" ? "" : "none";
    _pvFiltrarLocal();
}

function _pvCarregar() {
    const empty   = document.getElementById("pv-empty");
    const content = document.getElementById("pv-content");
    skMostrar(empty);
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${API}/videira/planejamento?transportadora=${_pvTransportadora}&unidade=${_pvUnidade}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        if (!ok) { skFim(empty, b.error || "Erro ao carregar planejamento."); return; }
        if (!b.linhas || !b.linhas.length) { skFim(empty, "Nenhum bairro encontrado nesta aba."); return; }
        _pvLinhas   = b.linhas;
        _pvUsuarios = b.usuarios || [];
        empty.style.display = "none";
        content.style.display = "";
        _pvFiltrarLocal();
    })
    .catch(() => { skFim(empty, "Erro ao conectar com o servidor."); });
}

// Nome vem da planilha (e do "Inserir Entregador"): nunca vira HTML.
function _pvEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Ordem da rota: pela sigla, com número em ordem numérica ("C-2" antes de "C-10");
// bairro sem sigla vai pro fim, em ordem alfabética.
function _pvOrdemSigla(a, b) {
    if (!a.sigla !== !b.sigla) return a.sigla ? -1 : 1;
    return String(a.sigla || "").localeCompare(String(b.sigla || ""), "pt-BR", { numeric: true })
        || String(a.bairro || "").localeCompare(String(b.bairro || ""), "pt-BR");
}

/**
 * Bairros agrupados por entregador, cada grupo na ordem da sigla. Usado na tela
 * "Por Entregador" e na impressão — as duas mostram a mesma coisa.
 * @return {{grupos: Array<{nome: string, itens: Array}>, vazios: Array}}
 */
function _pvAgrupar(linhas) {
    const mapa = new Map();
    const vazios = [];
    (linhas || []).forEach(l => {
        if (!l.entregador) { vazios.push(l); return; }
        if (!mapa.has(l.entregador)) mapa.set(l.entregador, []);
        mapa.get(l.entregador).push(l);
    });
    const grupos = [...mapa.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
        .map(([nome, itens]) => ({ nome, itens: itens.slice().sort(_pvOrdemSigla) }));
    return { grupos, vazios: vazios.sort(_pvOrdemSigla) };
}

function _pvRenderizar(linhas) {
    _pvAtualizarContador(linhas);

    document.getElementById("pv-tbody").innerHTML = linhas.map(l => {
        const exibicao    = l.entregador || "Não Definido";
        const naoDefinido = !l.entregador;
        return `<tr>
            <td class="adm-nf-entregador">${_pvEsc(l.bairro) || "—"}</td>
            <td><span class="pv-sigla">${_pvEsc(l.sigla) || "—"}</span></td>
            <td>
                <input type="text" class="fech-select pv-combo-input${naoDefinido ? " pv-nao-definido" : ""}" autocomplete="off"
                    value="${_pvEsc(exibicao)}" data-linha="${l.linha}"
                    oninput="_pvComboFiltrar(this)" onfocus="_pvComboAbrir(this)" onblur="_pvComboBlur(this)">
            </td>
        </tr>`;
    }).join("");
}

// ───── Combobox de busca do entregador (só aceita nome que esteja na lista de usuários) ─────
let _pvComboLinha   = null;
let _pvComboInputEl = null;

function _pvOpcoesFiltradas(termo) {
    const t = (termo || "").trim().toLowerCase();
    const todas = ["Não Definido", ..._pvUsuarios];
    if (!t || t === "não definido") return todas;
    return todas.filter(u => u.toLowerCase().includes(t));
}

function _pvComboAbrir(inputEl) {
    _pvComboLinha   = parseInt(inputEl.dataset.linha);
    _pvComboInputEl = inputEl;
    inputEl.select();

    const pop = document.getElementById("pv-combo-pop");
    if (pop.parentElement !== document.body) document.body.appendChild(pop);
    const rect   = inputEl.getBoundingClientRect();
    const margem = 8;
    // Mais largo que o campo (que é estreito) para o nome completo caber sem cortar,
    // mas nunca maior que a tela; e reposiciona para não vazar pela direita/esquerda
    const largura = Math.min(Math.max(rect.width, 240), window.innerWidth - margem * 2);
    let left = Math.min(rect.left, window.innerWidth - largura - margem);
    left = Math.max(left, margem);
    pop.style.top   = (rect.bottom + 4) + "px";
    pop.style.left  = left + "px";
    pop.style.width = largura + "px";
    pop.style.display = "block";
    _pvComboRenderLista(_pvOpcoesFiltradas(inputEl.value));
}

function _pvComboFiltrar(inputEl) {
    _pvComboRenderLista(_pvOpcoesFiltradas(inputEl.value));
}

function _pvComboRenderLista(opcoes) {
    const pop = document.getElementById("pv-combo-pop");
    if (!opcoes.length) {
        pop.innerHTML = `<div class="pv-combo-empty">Nenhum nome encontrado</div>`;
        return;
    }
    pop.innerHTML = opcoes.map(u =>
        `<div class="pv-combo-item" onmousedown="_pvComboEscolher('${u.replace(/'/g, "\\'").replace(/"/g, "&quot;")}')">${u}</div>`
    ).join("");
}

function _pvComboEscolher(nome) {
    if (!_pvComboInputEl || _pvComboLinha === null) return;
    const inputEl = _pvComboInputEl;
    const linha   = _pvComboLinha;
    inputEl.value = nome;
    _pvComboFechar();
    const item = _pvLinhas.find(l => l.linha === linha);
    const atual = (item && item.entregador) || "Não Definido";
    if (nome !== atual) _pvSalvar(linha, nome === "Não Definido" ? "" : nome, inputEl);
}

function _pvComboBlur(inputEl) {
    // Pequeno atraso para o onmousedown do item da lista disparar antes do blur fechar tudo
    setTimeout(() => {
        _pvComboFechar();
        const linha = parseInt(inputEl.dataset.linha);
        const item  = _pvLinhas.find(l => l.linha === linha);
        const atual = (item && item.entregador) || "Não Definido";
        const digitado = inputEl.value.trim();

        if (digitado === "" || digitado === "Não Definido") {
            inputEl.value = "Não Definido";
            if (atual !== "Não Definido") _pvSalvar(linha, "", inputEl);
            return;
        }
        // Só aceita texto que bata exatamente com um nome da lista de usuários
        if (!_pvUsuarios.includes(digitado)) {
            inputEl.value = atual;
            return;
        }
        if (digitado !== atual) _pvSalvar(linha, digitado, inputEl);
    }, 150);
}

function _pvComboFechar() {
    const pop = document.getElementById("pv-combo-pop");
    pop.style.display = "none";
    _pvComboLinha   = null;
    _pvComboInputEl = null;
}

// Chamada crua da API — usada tanto pelo campo de busca quanto pelo arrastar-e-soltar
function _pvSalvarAPI(linha, entregador) {
    return fetch(`${API}/videira/planejamento`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ transportadora: _pvTransportadora, linha, entregador, unidade: _pvUnidade })
    }).then(r => r.json());
}

function _pvSalvar(linha, entregador, inputEl) {
    inputEl.disabled = true;
    _pvSalvarAPI(linha, entregador)
    .then(d => {
        inputEl.disabled = false;
        if (d.error) { gcAlert(d.error); return; }
        // Atualiza estado local para o filtro/revalidação continuar refletindo o valor salvo
        const item = _pvLinhas.find(l => l.linha === linha);
        if (item) item.entregador = entregador;
        inputEl.classList.toggle("pv-nao-definido", !entregador);
        inputEl.style.borderColor = "rgba(34,197,94,0.6)";
        setTimeout(() => { inputEl.style.borderColor = ""; }, 900);
        _pvAtualizarContador();
    })
    .catch(() => {
        inputEl.disabled = false;
        gcAlert("Erro ao salvar. Tente novamente.");
    });
}

function _pvAtualizarContador(linhas) {
    const base = linhas || _pvLinhas;
    const total      = base.length;
    const definidos  = base.filter(l => !!l.entregador).length;
    const pendentes  = total - definidos;
    // Duas casas e arredondando pra baixo: 99,96% nunca pode aparecer como 100,00%.
    const pct        = total > 0 ? Math.floor(definidos * 10000 / total) / 100 : 0;
    const pctTxt     = pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById("pv-counter").innerHTML = `
        <div class="pv-kpis">
            <div class="pv-kpi"><span class="pv-kpi-rot">Bairros</span><span class="pv-kpi-val">${total}</span></div>
            <div class="pv-kpi"><span class="pv-kpi-rot">Definidos</span><span class="pv-kpi-val pv-ok">${definidos}</span></div>
            <div class="pv-kpi"><span class="pv-kpi-rot">Pendentes</span><span class="pv-kpi-val${pendentes ? " pv-warn" : ""}">${pendentes}</span></div>
            <div class="pv-kpi pv-kpi-cob">
                <span class="pv-kpi-rot">Cobertura da rota</span>
                <span class="pv-kpi-val">${pctTxt}%</span>
                <span class="pv-cob-barra"><i style="width:${pct}%"></i></span>
            </div>
        </div>`;
}

/** O que o filtro de cima deixa ver — a tela e a impressão usam o mesmo recorte. */
function _pvLinhasFiltradas() {
    const termo = document.getElementById("pv-filtro-input").value.trim().toLowerCase();
    return !termo ? _pvLinhas : _pvLinhas.filter(l =>
        (l.bairro     || "").toLowerCase().includes(termo) ||
        (l.sigla      || "").toLowerCase().includes(termo) ||
        (l.entregador || "").toLowerCase().includes(termo)
    );
}

function _pvFiltrarLocal() {
    const base = _pvLinhasFiltradas();
    if (_pvView === "bairro") _pvRenderizar(base);
    else _pvRenderizarPorEntregador(base);
}

// ───── Visão "Por Entregador" — quais bairros/siglas cada um vai atender ─────
// Uma linha por entregador, em colunas fixas (nome | quantidade | bairros): o nome
// aparece inteiro e tudo fica alinhado, em vez de cartões de alturas diferentes.
// As classes .pv-driver-card (destino) e .pv-bairro-chip (o que se arrasta) são o
// contrato com o arrastar-e-soltar mais abaixo.
function _pvRenderizarPorEntregador(linhas) {
    _pvAtualizarContador(linhas);
    const { grupos, vazios } = _pvAgrupar(linhas);

    const chips = itens => itens.map(i => `<span class="pv-bairro-chip" data-linha="${i.linha}">`
        + `<span class="sigla">${_pvEsc(i.sigla) || "—"}</span>${_pvEsc(i.bairro) || "—"}</span>`).join("");
    const linha = (nome, itens, vazio) => `
        <div class="pv-driver-card${vazio ? " pv-driver-vazio" : ""}" data-nome="${vazio ? "" : _pvEsc(nome)}">
            <div class="pv-driver-name">${_pvEsc(nome)}</div>
            <div class="pv-driver-count">${itens.length}</div>
            <div class="pv-driver-bairros">${chips(itens)}</div>
        </div>`;

    // Pendente em cima: é o que falta resolver, e dá pra arrastar dali pra alguém.
    const html = (vazios.length ? linha("Sem entregador", vazios, true) : "")
        + grupos.map(g => linha(g.nome, g.itens, false)).join("");

    document.getElementById("pv-driver-grid").innerHTML = html
        ? `<div class="pv-driver-cab"><span>Entregador</span><span>Bairros</span><span>Sigla e bairro</span></div>${html}`
        : `<div class="fechamento-empty">Nenhum resultado para este filtro.</div>`;
}

// ───── Imprimir rota (Por Entregador) ─────
// Folha branca, para a impressora ou "Salvar como PDF" na própria janela de impressão
// do navegador. Imprime o que o filtro de cima está mostrando.

/**
 * HTML da folha. Sem depender da tela: recebe tudo pronto, pra ser testável.
 * @param {Array} linhas Bairros (já filtrados).
 * @param {string} unidade Rótulo da unidade ("Caçador").
 * @param {string} quando Data/hora já formatada.
 * @param {string=} filtro Texto do filtro, se houver.
 */
function _pvHtmlImpressao(linhas, unidade, quando, filtro) {
    const { grupos, vazios } = _pvAgrupar(linhas);
    const todos = grupos.concat(vazios.length ? [{ nome: "Sem entregador", itens: vazios, vazio: true }] : []);

    const corpo = todos.map(g => `<tbody${g.vazio ? ' class="vazio"' : ""}>` + g.itens.map((i, n) => `<tr>`
        + (n === 0 ? `<td class="ent" rowspan="${g.itens.length}"><b>${_pvEsc(g.nome)}</b>`
            + `<small>${g.itens.length} bairro${g.itens.length !== 1 ? "s" : ""}</small></td>` : "")
        + `<td class="sig">${_pvEsc(i.sigla) || "—"}</td><td>${_pvEsc(i.bairro) || "—"}</td></tr>`).join("") + `</tbody>`).join("");

    const resumo = [
        `${linhas.length} bairro${linhas.length !== 1 ? "s" : ""}`,
        `${grupos.length} entregador${grupos.length !== 1 ? "es" : ""}`,
        vazios.length ? `${vazios.length} sem entregador` : "",
        filtro ? `filtro: “${_pvEsc(filtro)}”` : "",
    ].filter(Boolean).join(" · ");

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Rota ${_pvEsc(unidade)}</title>
<style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 17px; margin: 0 0 3px; }
    .sub { color: #555; font-size: 11px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
               color: #555; padding: 5px 8px; border-bottom: 1.5px solid #111; }
    td { padding: 4px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
    tbody { break-inside: avoid; page-break-inside: avoid; }
    tbody tr:last-child td, td.ent { border-bottom: 1.5px solid #111; }
    td.ent { width: 40%; }
    td.ent b { display: block; font-size: 12.5px; }
    td.ent small { color: #666; font-size: 10.5px; }
    td.sig { width: 64px; font-family: Consolas, "Courier New", monospace; font-weight: bold; white-space: nowrap; }
    tbody.vazio td.ent b { font-style: italic; }
    .rodape { margin-top: 10px; font-size: 10px; color: #888; }
</style></head><body>
<h1>Planejamento de Rotas — ${_pvEsc(unidade)}</h1>
<div class="sub">Impresso em ${_pvEsc(quando)} · ${resumo}</div>
<table><thead><tr><th>Entregador</th><th>Sigla</th><th>Bairro</th></tr></thead>${corpo}</table>
</body></html>`;
}

function _pvImprimir() {
    const linhas = _pvLinhasFiltradas();
    if (!linhas.length) { gcAlert("Nada para imprimir com este filtro."); return; }

    const quando = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const html = _pvHtmlImpressao(linhas, _PV_UNIDADE_LABEL[_pvUnidade] || _pvUnidade, quando,
        document.getElementById("pv-filtro-input").value.trim());

    // Iframe escondido em vez de janela nova: abre direto a caixa de impressão, sem
    // depender de pop-up liberado. O anterior só sai na próxima impressão — tirar
    // durante a caixa aberta cancelaria a impressão em alguns navegadores.
    const antigo = document.getElementById("pv-print-frame");
    if (antigo) antigo.remove();
    const frame = document.createElement("iframe");
    frame.id = "pv-print-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    frame.onload = () => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); }
        catch (_) { gcAlert("Não foi possível abrir a impressão."); }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
}

// ───── Arrastar e soltar: mover um bairro de um entregador para outro ─────
// Implementado com Pointer Events (não HTML5 drag nativo) para poder animar
// livremente o "chip" enquanto ele é segurado, e o card de destino ao passar por cima.
// A posição segue o mouse instantaneamente; a rotação "balança" com atraso, baseada
// na velocidade horizontal do ponteiro, e se acalma sozinha quando o mouse para.
let _pvDrag = null;

function _pvDragIniciar(e) {
    if (_pvView !== "entregador") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const chip = e.target.closest(".pv-bairro-chip");
    if (!chip) return;

    // Segurança: se por qualquer motivo um arraste anterior não foi limpo direito
    // (fantasma preso), limpa tudo antes de começar um novo
    if (_pvDrag) _pvDragForcarLimpeza();
    _pvLimparFantasmasOrfaos();

    e.preventDefault();
    const rect  = chip.getBoundingClientRect();
    const linha = parseInt(chip.dataset.linha);

    const ghost = chip.cloneNode(true);
    ghost.classList.add("pv-chip-ghost");
    ghost.style.position   = "fixed";
    ghost.style.left       = rect.left + "px";
    ghost.style.top        = rect.top + "px";
    ghost.style.width      = rect.width + "px";
    ghost.style.margin     = "0";
    ghost.style.transform  = "scale(1.1) rotate(0deg)";
    document.body.appendChild(ghost);

    chip.classList.add("pv-chip-source-dragging");

    _pvDrag = {
        linha, chip, ghost,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        startLeft: rect.left, startTop: rect.top,
        targetLeft: rect.left, targetTop: rect.top,
        lastX: e.clientX, lastY: e.clientY,
        velX: 0, rot: 0,
        overCard: null,
        rafId: null,
    };

    chip.setPointerCapture(e.pointerId);
    chip.addEventListener("pointermove", _pvDragMover);
    chip.addEventListener("pointerup", _pvDragSoltar);
    chip.addEventListener("pointercancel", _pvDragCancelar);

    _pvDrag.rafId = requestAnimationFrame(_pvDragTick);
}

// Remove qualquer fantasma que tenha ficado esquecido na tela (ex: recarregou a lista
// de bairros no meio de um arraste, ou algum evento de finalização não disparou)
function _pvLimparFantasmasOrfaos() {
    document.querySelectorAll(".pv-chip-ghost").forEach(el => el.remove());
}

// Limpeza "seca", sem animação — usada em cenários anômalos (perdeu foco da janela,
// trocou de aba, apertou Esc) onde só precisamos garantir que nada fique preso
function _pvDragForcarLimpeza() {
    if (!_pvDrag) return;
    const { chip, ghost, overCard } = _pvDrag;
    _pvDragFinalizar(chip, overCard);
    ghost.remove();
    _pvDrag = null;
}

// Redes de segurança: qualquer coisa que tire o foco da página no meio do arraste
// cancela o drag em vez de deixar o fantasma preso na tela
window.addEventListener("blur", _pvDragForcarLimpeza);
document.addEventListener("visibilitychange", () => { if (document.hidden) _pvDragForcarLimpeza(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") _pvDragForcarLimpeza(); });

function _pvDragMover(e) {
    if (!_pvDrag) return;
    const d = _pvDrag;

    d.targetLeft = e.clientX - d.offsetX;
    d.targetTop  = e.clientY - d.offsetY;

    // Velocidade horizontal suavizada (média móvel) — alimenta o balanço no _pvDragTick
    const dx = e.clientX - d.lastX;
    d.velX = d.velX * 0.7 + dx * 0.3;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
}

// Rola a área da tela automaticamente quando o dedo/mouse chega perto da borda
// de cima ou de baixo do conteúdo — essencial no mobile, onde só cabe uma tela por vez
// e o card de destino pode estar fora da área visível.
function _pvAutoScroll(clientY) {
    const scroller = document.querySelector("#tela-planejamento-videira .fech-body");
    if (!scroller) return;
    const rect   = scroller.getBoundingClientRect();
    const margem = 60;
    const velMax = 14;

    let vel = 0;
    if (clientY < rect.top + margem) {
        vel = -velMax * (1 - Math.max(0, clientY - rect.top) / margem);
    } else if (clientY > rect.bottom - margem) {
        vel = velMax * (1 - Math.max(0, rect.bottom - clientY) / margem);
    }
    if (vel) scroller.scrollTop += vel;
}

function _pvDragTick() {
    const d = _pvDrag;
    if (!d) return;

    d.ghost.style.left = d.targetLeft + "px";
    d.ghost.style.top  = d.targetTop + "px";

    // Rotação-alvo proporcional à velocidade horizontal, limitada a ±18°;
    // "d.rot" persegue esse alvo aos poucos (efeito mola) e a velocidade tem atrito,
    // então o balanço se acalma sozinho quando o mouse para ou muda de direção.
    const rotAlvo = Math.max(-18, Math.min(18, d.velX * 1.4));
    d.rot += (rotAlvo - d.rot) * 0.2;
    d.velX *= 0.9;
    d.ghost.style.transform = `scale(1.1) rotate(${d.rot.toFixed(2)}deg)`;

    // Recalcula o card sob o ponteiro a cada frame (não só em pointermove) — assim o
    // destaque de destino continua certo mesmo quando o auto-scroll move o conteúdo
    // com o dedo parado perto da borda da tela.
    const under = document.elementFromPoint(d.lastX, d.lastY);
    const card  = under ? under.closest(".pv-driver-card") : null;
    if (card !== d.overCard) {
        if (d.overCard) d.overCard.classList.remove("pv-drop-target");
        if (card) card.classList.add("pv-drop-target");
        d.overCard = card;
    }

    _pvAutoScroll(d.lastY);

    d.rafId = requestAnimationFrame(_pvDragTick);
}

function _pvDragFinalizar(chip, overCard) {
    if (_pvDrag && _pvDrag.rafId) cancelAnimationFrame(_pvDrag.rafId);
    chip.classList.remove("pv-chip-source-dragging");
    if (overCard) overCard.classList.remove("pv-drop-target");
    chip.removeEventListener("pointermove", _pvDragMover);
    chip.removeEventListener("pointerup", _pvDragSoltar);
    chip.removeEventListener("pointercancel", _pvDragCancelar);
}

// Anima o ghost de onde ele está agora até (left,top) — o reflow forçado entre setar
// o transition e mudar o destino é o que garante que a transição realmente anime
function _pvDragAnimarGhostAte(ghost, left, top, extra) {
    ghost.style.transition = "left .22s cubic-bezier(.34,1.56,.64,1), top .22s cubic-bezier(.34,1.56,.64,1), opacity .22s ease, transform .22s ease";
    void ghost.offsetWidth;
    ghost.style.left = left + "px";
    ghost.style.top  = top + "px";
    if (extra) Object.assign(ghost.style, extra);
    setTimeout(() => ghost.remove(), 240);
}

function _pvDragSoltar(e) {
    if (!_pvDrag) return;
    const { chip, ghost, linha, overCard, startLeft, startTop } = _pvDrag;
    try { chip.releasePointerCapture(e.pointerId); } catch (_) {}
    _pvDragFinalizar(chip, overCard);

    const novoNome  = overCard ? overCard.dataset.nome : null;
    const item      = _pvLinhas.find(l => l.linha === linha);
    const nomeAtual = item ? item.entregador : null;

    if (overCard && novoNome && novoNome !== nomeAtual) {
        // Drop válido: anima o chip "encaixando" no card de destino e confirma no servidor
        const destRect  = overCard.getBoundingClientRect();
        const ghostRect = ghost.getBoundingClientRect();
        // Pouso dentro do card de destino (não um deslocamento fixo que pode cair fora dele
        // em cards pequenos), e sempre limitado às bordas visíveis da tela
        let destLeft = destRect.left + 14;
        let destTop  = destRect.top + Math.min(46, Math.max(20, destRect.height - 24));
        destLeft = Math.max(4, Math.min(destLeft, window.innerWidth  - ghostRect.width  - 4));
        destTop  = Math.max(4, Math.min(destTop,  window.innerHeight - ghostRect.height - 4));
        _pvDragAnimarGhostAte(ghost, destLeft, destTop, { opacity: "0", transform: "scale(0.35) rotate(0deg)" });
        _pvReatribuirPorDrag(linha, novoNome);
    } else {
        // Drop inválido (fora de um card, ou no próprio card de origem): volta animado
        _pvDragAnimarGhostAte(ghost, startLeft, startTop, { transform: "scale(1) rotate(0deg)" });
    }

    _pvDrag = null;
}

function _pvDragCancelar() {
    _pvDragForcarLimpeza();
}

function _pvReatribuirPorDrag(linha, novoEntregador) {
    return _pvSalvarAPI(linha, novoEntregador).then(d => {
        if (d.error) { gcAlert(d.error); return; }
        const item = _pvLinhas.find(l => l.linha === linha);
        if (item) item.entregador = novoEntregador;
        _pvFiltrarLocal();
    }).catch(() => gcAlert("Erro ao mover o bairro. Tente novamente."));
}

document.addEventListener("pointerdown", _pvDragIniciar);

// ───── Inserir Entregador — quem planeja pede o cadastro de quem não está na lista ─────
// Vira linha de Cadastros › Dados entregadores no sistema (10/11/2026), e o nome já
// entra no combobox. A regra do modelo é a mesma do backend (modules/planejamento/
// usuarios.js); aqui ela só dá o aviso enquanto digita — quem decide é o servidor.
const _PV_PALAVRA   = "[A-Za-zÀ-ÖØ-öø-ÿ]+(?:'[A-Za-zÀ-ÖØ-öø-ÿ]+)?";
const _PV_RE_MODELO = new RegExp("^" + _PV_PALAVRA + "(?: " + _PV_PALAVRA + ")+ ?- ?" + _PV_PALAVRA + "(?: " + _PV_PALAVRA + ")*$");

function _pvAbrirInserirEntregador() {
    const overlay = document.createElement("div");
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `<div style="${_gcCardStyle}">
        <div style="${_gcTitleStyle}">Inserir Entregador</div>
        <div style="font-size:13px;color:#94a3b8;line-height:1.6;margin-bottom:14px">
            Não achou o nome na lista? Digite no modelo <b style="color:#e2e8f0">Nome Sobrenome - Cidade</b>.
            Ele vai como solicitação de cadastro e já pode ser usado no planejamento.
        </div>
        <input type="text" class="usr-modal-input" data-nome autocomplete="off" maxlength="80"
            placeholder="Ex.: Maria Souza - Videira" style="width:100%;box-sizing:border-box">
        <div data-aviso style="font-size:12px;min-height:18px;margin:8px 0 14px;color:#94a3b8"></div>
        <div style="${_gcBtnsStyle}">
            <button style="${_gcBtnCxStyle}" data-cancelar>Cancelar</button>
            <button style="${_gcBtnOkStyle}" data-inserir>Inserir</button>
        </div>
    </div>`;

    const input  = overlay.querySelector("[data-nome]");
    const aviso  = overlay.querySelector("[data-aviso]");
    const btnIns = overlay.querySelector("[data-inserir]");
    const fechar = () => overlay.remove();

    const conferir = () => {
        const v = input.value.replace(/\s+/g, " ").trim();
        if (!v) { aviso.textContent = ""; return false; }
        const ok = _PV_RE_MODELO.test(v);
        aviso.style.color = ok ? "#22c55e" : "#f59e0b";
        aviso.textContent = ok ? "Formato certo." : "Use o modelo Nome Sobrenome - Cidade.";
        return ok;
    };

    const inserir = () => {
        if (!conferir()) { input.focus(); return; }
        btnIns.disabled = true;
        btnIns.textContent = "Inserindo...";
        fetch(`${API}/videira/planejamento/entregador`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ nome: input.value })
        })
        .then(r => r.json())
        .then(d => {
            if (d.error) {
                aviso.style.color = "#ef4444";
                aviso.textContent = d.error;
                btnIns.disabled = false;
                btnIns.textContent = "Inserir";
                return;
            }
            if (Array.isArray(d.usuarios)) _pvUsuarios = d.usuarios;
            fechar();
            gcAlert(`<b>${_gcEsc(d.nome)}</b> foi enviado para cadastro e já aparece na lista do planejamento.`, "Entregador inserido");
        })
        .catch(() => {
            aviso.style.color = "#ef4444";
            aviso.textContent = "Erro ao conectar com o servidor.";
            btnIns.disabled = false;
            btnIns.textContent = "Inserir";
        });
    };

    input.addEventListener("input", conferir);
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") inserir();
        if (e.key === "Escape") fechar();
    });
    btnIns.addEventListener("click", inserir);
    overlay.querySelector("[data-cancelar]").addEventListener("click", fechar);
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 50);
}
