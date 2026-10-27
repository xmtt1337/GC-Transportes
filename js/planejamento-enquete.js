// ───── ENQUETE DO PLANEJAMENTO ("vou fazer a rota de amanhã?") ─────
// Das 00:00 às 14:00 o entregador FIXO (lista "Entregador;Bairro" da unidade) diz,
// bairro a bairro, se faz a rota do dia seguinte — e quem não vai escolhe o extra
// que fica no lugar. A resposta já vai para a coluna C do planejamento (backend:
// modules/planejamento/enquete*.js). Por enquanto só a cidade de Caçador.
//
// Dois lados neste arquivo:
//   _peVerificar()     — entregador: abre o quadro se houver enquete pendente.
//   _peAbrirGestor()   — Planejamento Caçador: quem respondeu + configuração.

const _PE_FORA = "__fora__";

function _peDiaRotulo(dia) {
    const [a, m, d] = String(dia || "").split("-").map(Number);
    if (!a) return dia || "";
    const s = new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ───── Lado do entregador ─────
function _peVerificar() {
    if (document.getElementById("pe-overlay")) return;
    fetch(`${API}/entregador/enquete-planejamento`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => { if (d && d.pendente) _peAbrirEntregador(d); })
        .catch(() => {});
}

function _peAbrirEntregador(d) {
    const respostas = {}; // bairro → { vai, extra, foraDaLista }
    const overlay = document.createElement("div");
    overlay.id = "pe-overlay";
    overlay.setAttribute("style", _gcOverlayStyle);

    const opcoesExtra = `<option value="">Escolher extra</option>` +
        (d.extras || []).map(e => `<option value="${_gcEsc(e)}">${_gcEsc(e)}</option>`).join("") +
        `<option value="${_PE_FORA}">Extra não está na lista</option>`;

    overlay.innerHTML = `<div class="pe-card">
        <div class="pe-etiqueta">Planejamento de amanhã</div>
        <div class="pe-titulo">Você vai fazer sua rota?</div>
        <div class="pe-dia">${_gcEsc(_peDiaRotulo(d.diaRota))}</div>
        <div class="pe-sub">Responda até as ${_gcEsc(d.fechaAs)}. O que você marcar já vai direto para o planejamento.</div>
        <div class="pe-lista">
            ${d.bairros.map((b, i) => `
            <div class="pe-item" data-i="${i}">
                <div class="pe-item-topo">
                    <div class="pe-bairro">${_gcEsc(b)}</div>
                    <div class="pe-escolha">
                        <button type="button" class="pe-op" data-vai="1">Vou fazer</button>
                        <button type="button" class="pe-op" data-vai="0">Não vou</button>
                    </div>
                </div>
                <div class="pe-extra" style="display:none">
                    <span>Quem fica no seu lugar:</span>
                    <select class="pe-extra-sel">${opcoesExtra}</select>
                </div>
            </div>`).join("")}
        </div>
        <div class="pe-erro" data-erro></div>
        <button type="button" class="pe-enviar" data-enviar disabled>Enviar resposta</button>
    </div>`;

    const btnEnviar = overlay.querySelector("[data-enviar]");
    const erroEl    = overlay.querySelector("[data-erro]");

    const completo = () => d.bairros.every(b => {
        const r = respostas[b];
        return r && (r.vai || r.foraDaLista || r.extra);
    });
    const atualizar = () => { btnEnviar.disabled = !completo(); };

    overlay.querySelectorAll(".pe-item").forEach(item => {
        const bairro = d.bairros[parseInt(item.dataset.i)];
        const extraEl = item.querySelector(".pe-extra");
        const sel = item.querySelector(".pe-extra-sel");
        item.querySelectorAll(".pe-op").forEach(btn => btn.addEventListener("click", () => {
            const vai = btn.dataset.vai === "1";
            item.querySelectorAll(".pe-op").forEach(b => b.classList.toggle("ativo", b === btn));
            item.classList.toggle("pe-vai", vai);
            item.classList.toggle("pe-nao-vai", !vai);
            extraEl.style.display = vai ? "none" : "";
            respostas[bairro] = vai ? { vai: true } : { vai: false, extra: sel.value === _PE_FORA ? "" : sel.value, foraDaLista: sel.value === _PE_FORA };
            atualizar();
        }));
        sel.addEventListener("change", () => {
            sel.classList.toggle("escolhido", !!sel.value);
            respostas[bairro] = { vai: false, extra: sel.value === _PE_FORA ? "" : sel.value, foraDaLista: sel.value === _PE_FORA };
            atualizar();
        });
    });

    // Sem fechar clicando fora nem com Esc: o quadro só sai quando ele responde.
    btnEnviar.addEventListener("click", () => {
        if (!completo()) return;
        btnEnviar.disabled = true;
        btnEnviar.textContent = "Enviando...";
        erroEl.textContent = "";
        const itens = d.bairros.map(b => ({ bairro: b, ...respostas[b] }));
        fetch(`${API}/entregador/enquete-planejamento`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ itens })
        })
        .then(r => r.json().then(b => ({ ok: r.ok, status: r.status, b })))
        .then(({ ok, status, b }) => {
            // 409 = já respondeu ou fechou: não adianta insistir, o quadro sai.
            if (ok || status === 409) {
                overlay.remove();
                gcAlert(ok ? "Resposta enviada. Obrigado!" : _gcEsc(b.error), "Planejamento de amanhã");
                return;
            }
            erroEl.textContent = b.error || "Não foi possível enviar. Tente de novo.";
            btnEnviar.disabled = false;
            btnEnviar.textContent = "Enviar resposta";
        })
        .catch(() => {
            erroEl.textContent = "Sem conexão com o servidor. Tente de novo.";
            btnEnviar.disabled = false;
            btnEnviar.textContent = "Enviar resposta";
        });
    });

    document.body.appendChild(overlay);
}

// ───── Lado do gestor (Planejamento Caçador) ─────
function _peAbrirGestor() {
    const overlay = document.createElement("div");
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `<div class="pe-card pe-card-gestor"><div class="pe-sub">Carregando...</div></div>`;
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    fetch(`${API}/videira/planejamento/enquete?unidade=${_pvUnidade}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(b => ({ ok: r.ok, b })))
        .then(({ ok, b }) => {
            if (!ok) { overlay.querySelector(".pe-card").innerHTML = `<div class="pe-erro">${_gcEsc(b.error || "Erro ao carregar a enquete.")}</div>`; return; }
            _peRenderGestor(overlay, b);
        })
        .catch(() => { overlay.querySelector(".pe-card").innerHTML = `<div class="pe-erro">Erro ao conectar com o servidor.</div>`; });
}

function _peRenderGestor(overlay, d) {
    // Agrupa os bairros fixos por entregador, na ordem da lista.
    const porEntregador = new Map();
    (d.fixos || []).forEach(f => {
        if (!porEntregador.has(f.entregador)) porEntregador.set(f.entregador, []);
        porEntregador.get(f.entregador).push(f.bairro);
    });
    const respostaDe = new Map((d.respostas || []).map(r => [r.entregador, r]));
    const respondidos = [...porEntregador.keys()].filter(n => respostaDe.has(n)).length;

    const linhaEntregador = (nome, bairros) => {
        const r = respostaDe.get(nome);
        const decisao = b => r && (r.decisoes || []).find(x => x.bairro === b);
        return `<div class="pe-g-ent">
            <div class="pe-g-nome">${_gcEsc(nome)}${r ? `<span class="pe-g-hora">${new Date(r.respondido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>` : ""}</div>
            ${bairros.map(b => {
                const x = decisao(b);
                const status = !r ? `<span class="pe-g-st pe-g-sem">Sem resposta</span>`
                    : !x ? `<span class="pe-g-st pe-g-sem">—</span>`
                    : x.vai ? `<span class="pe-g-st pe-g-vai">Vai fazer</span>`
                    : x.foraDaLista ? `<span class="pe-g-st pe-g-pend">Não vai · extra fora da lista</span>`
                    : `<span class="pe-g-st">Não vai · <b>${_gcEsc(x.extra)}</b></span>`;
                return `<div class="pe-g-bairro"><span>${_gcEsc(b)}</span>${status}</div>`;
            }).join("")}
        </div>`;
    };

    const listaTexto = (d.fixos || []).map(f => `${f.entregador};${f.bairro}`).join("\n");
    const extrasSel = new Set(d.extras || []);

    overlay.querySelector(".pe-card").innerHTML = `
        <div class="pe-etiqueta">Planejamento de amanhã</div>
        <div class="pe-titulo">Enquete — ${_gcEsc(_peDiaRotulo(d.diaRota))}</div>
        <div class="pe-sub">${!d.ativo ? "Enquete desligada." : d.aberta ? `Aberta para os entregadores até as ${String(d.janela.fim).padStart(2, "0")}:00.` : `Fechada. Abre de novo às ${String(d.janela.inicio).padStart(2, "0")}:00.`}
            ${porEntregador.size ? ` ${respondidos} de ${porEntregador.size} responderam.` : ""}</div>
        <div class="pe-g-lista">${porEntregador.size
            ? [...porEntregador.entries()].map(([n, b]) => linhaEntregador(n, b)).join("")
            : `<div class="pe-sub">Nenhum entregador fixo cadastrado. Cole a lista em Configurar.</div>`}</div>

        <details class="pe-g-config"${porEntregador.size ? "" : " open"}>
            <summary>Configurar</summary>
            <label class="pe-g-check"><input type="checkbox" data-ativo${d.ativo ? " checked" : ""}> Enquete ligada</label>
            <div class="pe-g-rot">Fixos — uma linha por bairro, no formato <b>Entregador;Bairro</b></div>
            <textarea class="usr-modal-input pe-g-texto" data-lista spellcheck="false" placeholder="Nome Sobrenome;Bairro">${_gcEsc(listaTexto)}</textarea>
            <div class="pe-g-rot">Extras disponíveis <span data-qtd></span></div>
            <input type="text" class="usr-modal-input pe-g-busca" data-busca placeholder="Buscar nome...">
            <div class="pe-g-extras" data-extras></div>
            <div class="pe-g-ignorados" data-ignorados></div>
            <div style="${_gcBtnsStyle}">
                <button style="${_gcBtnCxStyle}" data-fechar>Fechar</button>
                <button style="${_gcBtnOkStyle}" data-salvar>Salvar</button>
            </div>
        </details>
        <div class="pe-g-rodape" data-rodape${porEntregador.size ? "" : ` style="display:none"`}><button style="${_gcBtnCxStyle}" data-fechar>Fechar</button></div>`;

    const extrasEl = overlay.querySelector("[data-extras]");
    const qtdEl = overlay.querySelector("[data-qtd]");
    const renderExtras = () => {
        const t = overlay.querySelector("[data-busca]").value.trim().toLowerCase();
        // Os nomes saem da mesma lista do combobox do planejamento: escolher, não digitar.
        const nomes = [...new Set([..._pvUsuarios, ...extrasSel])].filter(n => !t || n.toLowerCase().includes(t));
        extrasEl.innerHTML = nomes.map(n => `<label class="pe-g-check"><input type="checkbox" value="${_gcEsc(n)}"${extrasSel.has(n) ? " checked" : ""}> ${_gcEsc(n)}</label>`).join("")
            || `<div class="pe-sub">Nenhum nome encontrado.</div>`;
        qtdEl.textContent = extrasSel.size ? `(${extrasSel.size} marcado${extrasSel.size !== 1 ? "s" : ""})` : "";
    };
    extrasEl.addEventListener("change", e => {
        if (e.target.type !== "checkbox") return;
        if (e.target.checked) extrasSel.add(e.target.value); else extrasSel.delete(e.target.value);
        qtdEl.textContent = extrasSel.size ? `(${extrasSel.size} marcado${extrasSel.size !== 1 ? "s" : ""})` : "";
    });
    overlay.querySelector("[data-busca]").addEventListener("input", renderExtras);
    overlay.querySelector(".pe-g-config").addEventListener("toggle", e => {
        overlay.querySelector("[data-rodape]").style.display = e.target.open ? "none" : "";
    });
    overlay.querySelectorAll("[data-fechar]").forEach(b => b.addEventListener("click", () => overlay.remove()));
    renderExtras();

    const btnSalvar = overlay.querySelector("[data-salvar]");
    btnSalvar.addEventListener("click", () => {
        btnSalvar.disabled = true;
        btnSalvar.textContent = "Salvando...";
        fetch(`${API}/videira/planejamento/enquete`, {
            method: "PUT",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({
                unidade: _pvUnidade,
                ativo: overlay.querySelector("[data-ativo]").checked,
                lista: overlay.querySelector("[data-lista]").value,
                extras: [...extrasSel],
            })
        })
        .then(r => r.json().then(b => ({ ok: r.ok, b })))
        .then(({ ok, b }) => {
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Salvar";
            if (!ok) { gcAlert(_gcEsc(b.error || "Erro ao salvar.")); return; }
            if (b.ignorados && b.ignorados.length) {
                // Fica aberto (com o texto como foi colado) mostrando o que não entrou,
                // pra corrigir e salvar de novo.
                overlay.querySelector("[data-ignorados]").innerHTML =
                    `<b>Salvo, mas ${b.ignorados.length} linha${b.ignorados.length !== 1 ? "s ficaram" : " ficou"} de fora:</b>` +
                    b.ignorados.map(i => `<div>${_gcEsc(i.texto)} — ${_gcEsc(i.motivo)}</div>`).join("");
                return;
            }
            overlay.remove();
            _peAbrirGestor();
        })
        .catch(() => {
            btnSalvar.disabled = false;
            btnSalvar.textContent = "Salvar";
            gcAlert("Erro ao conectar com o servidor.");
        });
    });
}
