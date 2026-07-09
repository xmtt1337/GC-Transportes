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
let _pvView     = "bairro"; // 'bairro' | 'entregador'

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
    document.querySelectorAll(".pv-view-btn").forEach(b => b.classList.toggle("active", b.dataset.view === _pvView));
    document.getElementById("pv-card").style.display        = _pvView === "bairro" ? "" : "none";
    document.getElementById("pv-driver-grid").style.display = _pvView === "entregador" ? "" : "none";
    mostrarTela("tela-planejamento-videira");
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
    const cor = (_PV_TRANSP.find(t => t.key === _pvTransportadora) || {}).cor || "#3a86ff";
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
        _pvFiltrarLocal();
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

// Chamada crua da API — usada tanto pelo campo de busca quanto pelo arrastar-e-soltar
function _pvSalvarAPI(linha, entregador) {
    return fetch(`${API}/videira/planejamento`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ transportadora: _pvTransportadora, linha, entregador })
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
    const base = !termo ? _pvLinhas : _pvLinhas.filter(l =>
        (l.bairro     || "").toLowerCase().includes(termo) ||
        (l.sigla      || "").toLowerCase().includes(termo) ||
        (l.entregador || "").toLowerCase().includes(termo)
    );
    if (_pvView === "bairro") _pvRenderizar(base);
    else _pvRenderizarPorEntregador(base);
}

// ───── Visão "Por Entregador" — quais bairros/siglas cada um vai atender ─────
function _pvRenderizarPorEntregador(linhas) {
    _pvAtualizarContador(linhas);

    const grupos = {};
    linhas.forEach(l => {
        const chave = l.entregador || "__vazio__";
        (grupos[chave] = grupos[chave] || []).push(l);
    });

    const nomes = Object.keys(grupos)
        .filter(n => n !== "__vazio__")
        .sort((a, b) => a.localeCompare(b, "pt-BR"));

    const cardHtml = (nome, itens) => {
        const chips = itens.map(i => `
            <span class="pv-bairro-chip" data-linha="${i.linha}">${i.bairro || "—"}${i.sigla ? ` <span class="sigla">${i.sigla}</span>` : ""}</span>
        `).join("");
        return `
        <div class="pv-driver-card" data-nome="${nome.replace(/"/g, "&quot;")}">
            <div class="pv-driver-head">
                <div class="pv-ent-avatar" style="width:36px;height:36px;font-size:12px">${_pvIniciais(nome)}</div>
                <div class="pv-driver-name">${nome}</div>
                <div class="pv-driver-count">${itens.length} bairro${itens.length !== 1 ? "s" : ""}</div>
            </div>
            <div class="pv-driver-bairros">${chips}</div>
        </div>`;
    };

    const html = nomes.map(n => cardHtml(n, grupos[n])).join("");

    document.getElementById("pv-driver-grid").innerHTML =
        html || `<div class="fechamento-empty">Nenhum resultado para este filtro.</div>`;
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
