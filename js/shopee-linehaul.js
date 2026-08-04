// ───── SHOPEE → CONFERÊNCIA → LINE HAUL ─────
// Cruza o romaneiro (o que era pra chegar) com o recebimento (o que foi bipado), por TO.
// A pergunta que a tela responde é a mesma da planilha: quanto de cada viagem já entrou,
// e quais códigos ainda faltam.

let _slhTos     = [];
let _slhFora    = [];      // bipados que não estão em romaneiro nenhum
let _slhFiltro  = "todas";
let _slhPagina  = 1;
const SLH_POR_PAGINA = 50;

let _slhToAtual = null;    // { numero_to, linhas: [...] } do modal aberto
let _slhToFiltroAtual = "faltam";

function abrirShopeeLineHaul(event) {
    if (event) event.preventDefault();
    _slhFiltro = "todas";
    _slhPagina = 1;
    const busca = document.getElementById("slh-busca");
    if (busca) busca.value = "";
    _slhPintarTabs();
    mostrarTela("tela-shopee-linehaul");
    _slhCarregar();
}

function _slhEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _slhPct(recebidos, total) {
    return total ? (recebidos / total) * 100 : 0;
}

// Verde só quando fechou. Antes disso é âmbar, mesmo em 99% — TO quase completa ainda é
// TO em aberto, e pintar de verde faria alguém parar de procurar o que falta.
function _slhCor(pct) {
    return pct >= 100 ? "#22c55e" : pct > 0 ? "#eab308" : "#ef4444";
}

function _slhCarregar() {
    const empty  = document.getElementById("slh-empty");
    const result = document.getElementById("slh-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";
    document.getElementById("slh-resumo").innerHTML = "";

    fetch(`${API}/shopee/conferencia/linehaul`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); return; }

            // Cada XPT confere o seu: a tela é sempre de um polo só, e dizer qual evita
            // alguém achar que está vendo a carga inteira e cobrar viagem que não é dele.
            _slhFaixa(d);
            if (d && d.sem_polo) {
                skFim(empty, "Você ainda não tem polo definido. Abra o Recebimento Shopee para escolher.");
                return;
            }
            if (d && d.polo_sem_xpt) {
                skFim(empty, `O polo ${d.polo_label} não recebe Shopee, então não tem line haul para conferir.`);
                return;
            }

            _slhTos = (d && d.tos) || [];
            _slhForaTotal = (d && d.fora_da_lh) || 0;
            if (!_slhTos.length && !_slhForaTotal) {
                skFim(empty, "Nenhuma viagem com destino a este XPT ainda. Alimente o Romaneiro Shopee primeiro.");
                _slhRenderResumo();
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            _slhRenderResumo();
            _slhRenderizar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _slhFaixa(d) {
    const faixa = document.getElementById("slh-faixa");
    const temXpt = d && d.xpt;
    faixa.style.display = (temXpt || (d && d.polo_label)) ? "" : "none";
    faixa.className = "shr-faixa " + (temXpt ? "cfc" : "sem");
    document.getElementById("slh-faixa-xpt").innerText = temXpt
        ? `${d.polo_label} · ${d.xpt}`
        : (d && d.polo_label) || "—";
}

let _slhForaTotal = 0;

function _slhRenderResumo() {
    const total     = _slhTos.reduce((a, t) => a + t.total, 0);
    const recebidos = _slhTos.reduce((a, t) => a + t.recebidos, 0);
    const completas = _slhTos.filter(t => t.recebidos >= t.total && t.total > 0).length;
    const pct = Math.round(_slhPct(recebidos, total));

    const card = (rotulo, valor, sub, cor) => `
        <div class="paj-card">
            <div class="paj-label">${rotulo}</div>
            ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}
            <div class="paj-value"${cor ? ` style="color:${cor}"` : ""}>${valor}</div>
        </div>`;

    document.getElementById("slh-resumo").innerHTML =
        card("Recebido no total", `${pct}%`, `${recebidos.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`, _slhCor(pct)) +
        card("Viagens (TO)", _slhTos.length, `${completas} completa${completas !== 1 ? "s" : ""}`) +
        card("Falta receber", (total - recebidos).toLocaleString("pt-BR"), "pacotes") +
        card("Fora da LH", _slhForaTotal, "bipados sem romaneiro", _slhForaTotal ? "#eab308" : null);
}

function _slhTrocarFiltro(filtro) {
    _slhFiltro = filtro;
    _slhPagina = 1;
    _slhPintarTabs();
    // "Fora da LH" é outra lista, com outras colunas — busca sob demanda.
    if (filtro === "fora" && !_slhFora.length) return _slhCarregarFora();
    _slhRenderizar();
}

function _slhPintarTabs() {
    document.querySelectorAll("#slh-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.filtro === _slhFiltro));
}

function _slhBuscar() { _slhPagina = 1; _slhRenderizar(); }

function _slhTrocarPagina(passo) {
    _slhPagina += passo;
    _slhRenderizar();
    document.getElementById("slh-resumo").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function _slhCarregarFora() {
    const empty  = document.getElementById("slh-empty");
    const result = document.getElementById("slh-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/shopee/conferencia/fora-da-lh`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            _slhFora = Array.isArray(rows) ? rows : [];
            empty.style.display = "none";
            result.style.display = "";
            _slhRenderizar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _slhRenderizar() {
    const termo = (document.getElementById("slh-busca")?.value || "").trim().toLowerCase();
    const thead = document.getElementById("slh-thead");
    const tbody = document.getElementById("slh-tbody");

    if (_slhFiltro === "fora") {
        const rows = _slhFora.filter(r => !termo ||
            String(r.codigo || "").toLowerCase().includes(termo) ||
            String(r.usuario_nome || "").toLowerCase().includes(termo));
        thead.innerHTML = `<tr><th>Código</th><th>XPT</th><th>Bipado por</th><th>Quando</th></tr>`;
        const pagina = _slhPaginar(rows, 4);
        tbody.innerHTML = pagina.length ? pagina.map(r => `
            <tr>
                <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_slhEsc(r.codigo)}</td>
                <td data-label="XPT"><span class="shr-xpt-tag">${_slhEsc(r.xpt) || "—"}</span></td>
                <td data-label="Bipado por">${_slhEsc(r.usuario_nome) || "—"}</td>
                <td data-label="Quando" style="color:#8494a9">${_slhEsc(r.data_hora_brasilia) || "—"}</td>
            </tr>`).join("")
            : `<tr><td colspan="4" style="text-align:center;color:#8494a9;padding:26px 10px">Nenhum bipado fora do romaneiro.</td></tr>`;
        return;
    }

    let rows = _slhTos;
    if (_slhFiltro === "abertas")   rows = rows.filter(t => t.recebidos < t.total);
    if (_slhFiltro === "completas") rows = rows.filter(t => t.total > 0 && t.recebidos >= t.total);
    if (termo) rows = rows.filter(t =>
        [t.numero_to, t.rota_lh, t.destino, t.origem].some(v => String(v || "").toLowerCase().includes(termo)));

    thead.innerHTML = `<tr>
        <th>TO (LH)</th><th>% Recebido</th><th>Total na LH</th><th>Recebidos</th><th>Faltam</th><th>Destino</th>
    </tr>`;

    const pagina = _slhPaginar(rows, 6);
    tbody.innerHTML = pagina.length ? pagina.map(t => {
        const pct  = _slhPct(t.recebidos, t.total);
        const cor  = _slhCor(pct);
        const falta = t.total - t.recebidos;
        const toEsc = _slhEsc(t.numero_to).replace(/'/g, "\\'");
        return `
        <tr class="slh-linha" onclick="_slhAbrirTo('${toEsc}')" title="Ver os códigos desta TO">
            <td data-label="TO">
                <div style="font-family:monospace;font-weight:700;color:#e2e8f0">${_slhEsc(t.numero_to)}</div>
                ${t.rota_lh ? `<div style="font-size:11px;color:#8494a9">${_slhEsc(t.rota_lh)}</div>` : ""}
            </td>
            <td data-label="% Recebido" style="min-width:140px">
                <div class="slh-pct" style="color:${cor}">${pct.toFixed(pct % 1 ? 1 : 0)}%</div>
                <div class="slh-barra"><div class="slh-barra-fill" style="width:${Math.min(100, pct)}%;background:${cor}"></div></div>
            </td>
            <td data-label="Total na LH" style="font-variant-numeric:tabular-nums">${t.total}</td>
            <td data-label="Recebidos" style="font-variant-numeric:tabular-nums;color:#22c55e">${t.recebidos}</td>
            <td data-label="Faltam" style="font-variant-numeric:tabular-nums;color:${falta ? "#ef4444" : "#8494a9"};font-weight:${falta ? 700 : 400}">${falta}</td>
            <td data-label="Destino" style="color:#8494a9">${_slhEsc(t.destino) || "—"}</td>
        </tr>`;
    }).join("")
        : `<tr><td colspan="6" style="text-align:center;color:#8494a9;padding:26px 10px">Nenhuma TO nesse filtro.</td></tr>`;
}

// Paginação compartilhada pelas duas listas da tela.
function _slhPaginar(rows, colunas) {
    const paginas = Math.max(1, Math.ceil(rows.length / SLH_POR_PAGINA));
    _slhPagina = Math.min(Math.max(1, _slhPagina), paginas);
    const inicio = (_slhPagina - 1) * SLH_POR_PAGINA;

    const pag = document.getElementById("slh-paginacao");
    pag.style.display = rows.length > SLH_POR_PAGINA ? "" : "none";
    if (rows.length > SLH_POR_PAGINA) {
        document.getElementById("slh-pag-info").innerText =
            `${inicio + 1}–${Math.min(inicio + SLH_POR_PAGINA, rows.length)} de ${rows.length}`;
        document.getElementById("slh-pag-ant").disabled  = _slhPagina <= 1;
        document.getElementById("slh-pag-prox").disabled = _slhPagina >= paginas;
    }
    return rows.slice(inicio, inicio + SLH_POR_PAGINA);
}

// ── Detalhe da TO ──
function _slhAbrirTo(numeroTo) {
    const t = _slhTos.find(x => x.numero_to === numeroTo);
    _slhToAtual = { numero_to: numeroTo, linhas: [] };
    _slhToFiltroAtual = "faltam";
    _slhPintarToTabs();

    document.getElementById("slh-to-titulo").innerText = numeroTo;
    document.getElementById("slh-to-sub").innerText = t
        ? `${t.recebidos} de ${t.total} recebidos${t.rota_lh ? " · rota " + t.rota_lh : ""}${t.destino ? " · " + t.destino : ""}`
        : "";
    const pct = t ? _slhPct(t.recebidos, t.total) : 0;
    const barra = document.getElementById("slh-to-barra");
    barra.style.width = Math.min(100, pct) + "%";
    barra.style.background = _slhCor(pct);
    document.getElementById("slh-to-lista").innerHTML = `<div style="color:#8494a9;font-size:13px;padding:14px 0">Carregando...</div>`;
    _abrirModal("modal-slh-to");

    fetch(`${API}/shopee/conferencia/linehaul/${encodeURIComponent(numeroTo)}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(linhas => {
        _slhToAtual.linhas = Array.isArray(linhas) ? linhas : [];
        _slhRenderTo();
    })
    .catch(() => {
        document.getElementById("slh-to-lista").innerHTML =
            `<div style="color:#ef4444;font-size:13px;padding:14px 0">Erro ao carregar os códigos.</div>`;
    });
}

function _slhToFiltro(f) {
    _slhToFiltroAtual = f;
    _slhPintarToTabs();
    _slhRenderTo();
}

function _slhPintarToTabs() {
    document.querySelectorAll("#slh-to-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.f === _slhToFiltroAtual));
}

function _slhRenderTo() {
    if (!_slhToAtual) return;
    const todas = _slhToAtual.linhas;
    const faltam    = todas.filter(l => !l.recebido);
    const recebidos = todas.filter(l => l.recebido);

    // O contador fica nas abas: sem ele a pessoa tem que contar linha pra saber quanto falta.
    const tabs = document.querySelectorAll("#slh-to-tabs .filtro-tab");
    if (tabs[0]) tabs[0].innerText = `Faltam ${faltam.length}`;
    if (tabs[1]) tabs[1].innerText = `Recebidos ${recebidos.length}`;
    if (tabs[2]) tabs[2].innerText = `Todos ${todas.length}`;

    const lista = _slhToFiltroAtual === "faltam" ? faltam
                : _slhToFiltroAtual === "recebidos" ? recebidos : todas;

    const el = document.getElementById("slh-to-lista");
    if (!lista.length) {
        el.innerHTML = `<div style="color:#8494a9;font-size:13px;padding:14px 0">${
            _slhToFiltroAtual === "faltam" ? "Nenhum pendente — a TO está completa." : "Nada aqui."}</div>`;
        return;
    }
    el.innerHTML = lista.map(l => `
        <div class="slh-cod ${l.recebido ? "ok" : "falta"}">
            <span class="slh-cod-num">${_slhEsc(l.codigo)}</span>
            ${l.recebido
                ? `<span class="slh-cod-info">${_slhEsc(l.usuario_nome) || "—"} · ${_slhEsc(l.data_hora_brasilia) || "—"}</span>`
                : `<span class="slh-cod-info falta">não recebido</span>`}
        </div>`).join("");

    const btn = document.getElementById("slh-to-copiar");
    btn.disabled = !faltam.length;
    btn.textContent = faltam.length ? `Copiar os ${faltam.length} que faltam` : "Nada a copiar";
}

// Copiar a lista dos faltantes: é o que se manda pra transportadora cobrar.
function _slhCopiarFaltantes() {
    if (!_slhToAtual) return;
    const faltam = _slhToAtual.linhas.filter(l => !l.recebido).map(l => l.codigo);
    if (!faltam.length) return;
    const btn = document.getElementById("slh-to-copiar");
    navigator.clipboard.writeText(faltam.join("\n")).then(() => {
        btn.textContent = "✓ Copiado";
        setTimeout(() => { btn.textContent = `Copiar os ${faltam.length} que faltam`; }, 2000);
    }).catch(() => gcAlert("Não foi possível copiar."));
}
