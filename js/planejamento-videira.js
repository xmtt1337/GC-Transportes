// ───── PLANEJAMENTO VIDEIRA (bairro → entregador, por transportadora) ─────
const _PV_TRANSP = [
    { key: "loggi",  label: "Loggi",  cor: "#12A5E8" },
    { key: "anjun",  label: "Anjun",  cor: "#22C55E" },
    { key: "shopee", label: "Shopee", cor: "#F97316" },
    { key: "imile",  label: "Imile",  cor: "#9333EA" },
    { key: "jt",     label: "J&T",    cor: "#EF4444" },
];

let _pvTransportadora = "loggi";
let _pvLinhas   = [];
let _pvUsuarios = [];

function abrirPlanejamentoVideira(event) {
    if (event) event.preventDefault();
    document.getElementById("pv-transp-tabs").innerHTML = _PV_TRANSP.map(t => `
        <button class="pv-transp-tab${t.key === _pvTransportadora ? " active" : ""}" style="--pvc:${t.cor}"
            data-t="${t.key}" onclick="_pvTrocarTransportadora('${t.key}')">
            <span class="pv-tab-dot"></span>${t.label}
        </button>
    `).join("");
    document.getElementById("pv-filtro-input").value = "";
    _pvAplicarAccent();
    mostrarTela("tela-planejamento-videira");
    _pvCarregar();
}

function _pvTrocarTransportadora(t) {
    _pvTransportadora = t;
    document.querySelectorAll(".pv-transp-tab").forEach(btn =>
        btn.classList.toggle("active", btn.dataset.t === t)
    );
    document.getElementById("pv-filtro-input").value = "";
    _pvAplicarAccent();
    _pvCarregar();
}

function _pvAplicarAccent() {
    const cor = (_PV_TRANSP.find(t => t.key === _pvTransportadora) || {}).cor || "#3a86ff";
    // Aplica no root para o popup de busca (que fica anexado ao <body>) também herdar a cor certa
    document.documentElement.style.setProperty("--pv-accent", cor);
}

function _pvCarregar() {
    const empty   = document.getElementById("pv-empty");
    const content = document.getElementById("pv-content");
    empty.innerText = "Carregando...";
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${API}/videira/planejamento?transportadora=${_pvTransportadora}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        if (!ok) { empty.innerText = b.error || "Erro ao carregar planejamento."; return; }
        if (!b.linhas || !b.linhas.length) { empty.innerText = "Nenhum bairro encontrado nesta aba."; return; }
        _pvLinhas   = b.linhas;
        _pvUsuarios = b.usuarios || [];
        empty.style.display = "none";
        content.style.display = "";
        _pvRenderizar(_pvLinhas);
    })
    .catch(() => { empty.innerText = "Erro ao conectar com o servidor."; });
}

function _pvIniciais(nome) {
    const partes = nome.trim().split(/\s+/);
    const ini = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2);
    return ini.toUpperCase();
}

function _pvRenderizar(linhas) {
    _pvAtualizarContador(linhas);

    document.getElementById("pv-tbody").innerHTML = linhas.map(l => {
        const exibicao    = l.entregador || "Não Definido";
        const naoDefinido = !l.entregador;
        const avatarTxt   = naoDefinido
            ? `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
            : _pvIniciais(l.entregador);
        return `<tr>
            <td class="adm-nf-entregador">${l.bairro || "—"}</td>
            <td>${l.sigla ? `<span class="pv-sigla-pill">${l.sigla}</span>` : "—"}</td>
            <td>
                <div class="pv-ent-cell">
                    <div class="pv-ent-avatar${naoDefinido ? " pv-avatar-vazio" : ""}">${avatarTxt}</div>
                    <input type="text" class="fech-select pv-combo-input${naoDefinido ? " pv-nao-definido" : ""}" autocomplete="off"
                        value="${exibicao.replace(/"/g, "&quot;")}" data-linha="${l.linha}"
                        oninput="_pvComboFiltrar(this)" onfocus="_pvComboAbrir(this)" onblur="_pvComboBlur(this)">
                </div>
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
    const rect = inputEl.getBoundingClientRect();
    pop.style.top   = (rect.bottom + 4) + "px";
    pop.style.left  = rect.left + "px";
    pop.style.width = rect.width + "px";
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

function _pvSalvar(linha, entregador, inputEl) {
    inputEl.disabled = true;
    fetch(`${API}/videira/planejamento`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ transportadora: _pvTransportadora, linha, entregador })
    })
    .then(r => r.json())
    .then(d => {
        inputEl.disabled = false;
        if (d.error) { gcAlert(d.error); return; }
        // Atualiza estado local para o filtro/revalidação continuar refletindo o valor salvo
        const item = _pvLinhas.find(l => l.linha === linha);
        if (item) item.entregador = entregador;
        inputEl.classList.toggle("pv-nao-definido", !entregador);
        inputEl.style.borderColor = "rgba(34,197,94,0.6)";
        setTimeout(() => { inputEl.style.borderColor = ""; }, 900);

        const avatarEl = inputEl.closest(".pv-ent-cell")?.querySelector(".pv-ent-avatar");
        if (avatarEl) {
            avatarEl.classList.toggle("pv-avatar-vazio", !entregador);
            avatarEl.innerHTML = entregador
                ? _pvIniciais(entregador)
                : `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        }
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
    const pct        = total > 0 ? Math.round((definidos / total) * 100) : 0;

    document.getElementById("pv-counter").innerHTML = `
        <div class="pv-stats">
            <div class="pv-stat-tile">
                <div class="pv-stat-val">${total}</div>
                <div class="pv-stat-lbl">Bairro${total !== 1 ? "s" : ""}</div>
            </div>
            <div class="pv-stat-tile">
                <div class="pv-stat-val pv-ok">${definidos}</div>
                <div class="pv-stat-lbl">Definidos</div>
            </div>
            <div class="pv-stat-tile">
                <div class="pv-stat-val${pendentes ? " pv-warn" : ""}">${pendentes}</div>
                <div class="pv-stat-lbl">Pendentes</div>
            </div>
            <div class="pv-stat-progress">
                <div class="pv-stat-progress-hd"><span>Cobertura da rota</span><b>${pct}%</b></div>
                <div class="pv-progress-track"><div class="pv-progress-fill" style="width:${pct}%"></div></div>
            </div>
        </div>`;
}

function _pvFiltrarLocal() {
    const termo = document.getElementById("pv-filtro-input").value.trim().toLowerCase();
    if (!termo) { _pvRenderizar(_pvLinhas); return; }
    const filtrado = _pvLinhas.filter(l =>
        (l.bairro || "").toLowerCase().includes(termo) ||
        (l.sigla  || "").toLowerCase().includes(termo)
    );
    _pvRenderizar(filtrado);
}
