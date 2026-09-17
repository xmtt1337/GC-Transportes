// ───── FILTRO DE COLUNA (estilo planilha) ─────
//
// Popover reaproveitável entre telas: ordenar A→Z/Z→A, buscar e marcar/
// desmarcar valores distintos de uma coluna — igual o filtro de coluna do
// Google Sheets, no visual do sistema. Cada tela chama colfAbrir() a partir
// do botão de funil no cabeçalho; quem decide o que filtrar/ordenar é a
// própria tela (esta função só monta a UI e devolve a escolha).
//
// `selecionados` que chega em `aoAplicar` é `null` quando tudo ficou marcado
// (equivale a "sem filtro"), ou um Set com os valores BRUTOS (não o rótulo)
// que devem continuar visíveis.

let _colfAberto = null; // { anchor, el, onDocClick, onScroll }

function _colfEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function colfCompara(a, b, dir) {
    const r = String(a || "").localeCompare(String(b || ""), "pt-BR", { sensitivity: "base" });
    return dir === "desc" ? -r : r;
}

function _colfFechar() {
    if (!_colfAberto) return;
    _colfAberto.el.remove();
    document.removeEventListener("click", _colfAberto.onDocClick);
    window.removeEventListener("scroll", _colfAberto.onScroll, true);
    _colfAberto = null;
}

/**
 * @param {HTMLElement} anchorEl O botão de funil que abriu o popover.
 * @param {Object} opts
 * @param {Array<string>} opts.valores Valor bruto de CADA linha (com repetição — a
 *   contagem por valor é calculada aqui).
 * @param {?Set<string>} opts.selecionados Valores atualmente incluídos, ou null pra "todos".
 * @param {{atual: ?string}=} opts.ordenar Presente pra mostrar os botões de ordenar;
 *   `atual` é "asc"/"desc"/null.
 * @param {Function} opts.aoAplicar (novoSelecionadosOuNull, novaOrdem) => void.
 */
function colfAbrir(anchorEl, opts) {
    // Clicar no mesmo funil que já está aberto só fecha (toggle). O clique que
    // abriu o outro já rodou até aqui antes do listener de "fora" existir (ele
    // só é ligado no próximo tick, mais abaixo), então _colfAberto ainda é o
    // popover anterior nesse instante — dá pra comparar com segurança.
    const mesma = _colfAberto && _colfAberto.anchor === anchorEl;
    _colfFechar();
    if (mesma) return;

    const contagem = new Map();
    (opts.valores || []).forEach(v => {
        const chave = String(v ?? "").trim();
        contagem.set(chave, (contagem.get(chave) || 0) + 1);
    });
    const todasChaves = [...contagem.keys()].sort((a, b) => colfCompara(a, b, "asc"));
    const selecionadas = opts.selecionados ? new Set(opts.selecionados) : new Set(todasChaves);
    let ordemEscolhida = opts.ordenar ? opts.ordenar.atual || null : null;

    const el = document.createElement("div");
    el.className = "colf-pop";
    el.innerHTML = `
        ${opts.ordenar ? `
        <div class="colf-ordenar">
            <button type="button" class="colf-ord-btn${ordemEscolhida === "asc" ? " active" : ""}" data-dir="asc">A → Z</button>
            <button type="button" class="colf-ord-btn${ordemEscolhida === "desc" ? " active" : ""}" data-dir="desc">Z → A</button>
        </div>` : ""}
        <div class="colf-busca"><input type="text" placeholder="Buscar valor..." autocomplete="off"></div>
        <div class="colf-acoes">
            <button type="button" class="colf-link" data-acao="tudo">Selecionar tudo</button>
            <button type="button" class="colf-link" data-acao="limpar">Limpar</button>
        </div>
        <div class="colf-lista"></div>
        <div class="colf-rodape">
            <button type="button" class="colf-cancelar">Cancelar</button>
            <button type="button" class="colf-ok">OK</button>
        </div>`;
    document.body.appendChild(el);

    const listaEl = el.querySelector(".colf-lista");
    const buscaEl = el.querySelector(".colf-busca input");

    function pintarLista() {
        const t = buscaEl.value.trim().toLowerCase();
        const chaves = todasChaves.filter(c => !t || (c || "(vazio)").toLowerCase().includes(t));
        listaEl.innerHTML = chaves.length ? chaves.map(c => `
            <label class="colf-item">
                <input type="checkbox" value="${_colfEsc(c)}"${selecionadas.has(c) ? " checked" : ""}>
                <span>${_colfEsc(c) || "(vazio)"}</span>
                <span class="colf-qtd">${contagem.get(c)}</span>
            </label>`).join("") : `<div class="colf-vazio">Nenhum valor encontrado.</div>`;
    }
    pintarLista();

    listaEl.addEventListener("change", e => {
        const cb = e.target.closest("input[type=checkbox]");
        if (!cb) return;
        if (cb.checked) selecionadas.add(cb.value); else selecionadas.delete(cb.value);
    });
    buscaEl.addEventListener("input", pintarLista);

    el.querySelectorAll(".colf-link").forEach(btn => btn.onclick = () => {
        if (btn.dataset.acao === "tudo") todasChaves.forEach(c => selecionadas.add(c));
        else selecionadas.clear();
        pintarLista();
    });

    el.querySelectorAll(".colf-ord-btn").forEach(btn => btn.onclick = () => {
        // Clicar na ordem já ativa desliga (volta a não ordenar por aqui).
        ordemEscolhida = ordemEscolhida === btn.dataset.dir ? null : btn.dataset.dir;
        el.querySelectorAll(".colf-ord-btn").forEach(b => b.classList.toggle("active", b.dataset.dir === ordemEscolhida));
    });

    el.querySelector(".colf-cancelar").onclick = _colfFechar;
    el.querySelector(".colf-ok").onclick = () => {
        const todasMarcadas = selecionadas.size >= todasChaves.length;
        opts.aoAplicar(todasMarcadas ? null : selecionadas, ordemEscolhida);
        _colfFechar();
    };

    // Fixo (não absoluto) porque o gatilho pode estar em qualquer coluna da
    // tabela — sem isso o popover nasceria sempre colado no canto errado.
    // Corrige a borda direita/inferior pra nunca nascer cortado fora da tela.
    const r = anchorEl.getBoundingClientRect();
    const LARGURA = 240;
    el.style.top  = Math.min(r.bottom + 6, window.innerHeight - 60) + "px";
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - LARGURA - 8)) + "px";

    const onDocClick = e => {
        const dentro = e.composedPath ? e.composedPath().includes(el) : el.contains(e.target);
        if (!dentro) _colfFechar();
    };
    // window com capture=true pega até o scroll da lista interna (.colf-lista
    // tem overflow-y próprio) — sem o filtro por alvo, rolar os valores fechava
    // o próprio popover no meio do uso.
    const onScroll = e => { if (!el.contains(e.target)) _colfFechar(); };
    // Registrado só no próximo tick: senão o MESMO clique que abriu o popover,
    // ainda borbulhando até o document, já dispararia o fechamento na hora.
    setTimeout(() => {
        document.addEventListener("click", onDocClick);
        window.addEventListener("scroll", onScroll, true);
    }, 0);

    _colfAberto = { anchor: anchorEl, el, onDocClick, onScroll };
}
