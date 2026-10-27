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

// ───── Relatório (.xlsx/.xls/.csv/.txt) para fixos e extras ─────
// A coluna é achada pelo cabeçalho nas primeiras linhas; sem cabeçalho, vale a
// ordem (1ª coluna entregador, 2ª bairro). Quem confere nome e bairro é o
// servidor no Salvar (fixos) ou a lista do combobox (extras) — aqui só se lê.
const _PE_CAB_NOME   = ["entregador", "entregadores", "nome", "nomes", "usuario", "usuarios", "extra", "extras", "motorista"];
const _PE_CAB_BAIRRO = ["bairro", "bairros"];

function _peNorm(v) {
    return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function _peAcharCabecalho(linhas, aceitos) {
    for (let i = 0; i < Math.min(linhas.length, 10); i++) {
        const c = (linhas[i] || []).findIndex(v => aceitos.includes(_peNorm(v)));
        if (c >= 0) return { linha: i, col: c };
    }
    return null;
}

function _peCelula(v) {
    return String(v ?? "").replace(/\s+/g, " ").trim();
}

/** Linhas "Entregador;Bairro" a partir do relatório (vai pro campo de texto). */
function _peFixosDoRelatorio(linhas) {
    const nome = _peAcharCabecalho(linhas, _PE_CAB_NOME);
    const bairro = _peAcharCabecalho(linhas, _PE_CAB_BAIRRO);
    const temCab = nome && bairro;
    const cN = temCab ? nome.col : 0;
    const cB = temCab ? bairro.col : 1;
    const inicio = temCab ? Math.max(nome.linha, bairro.linha) + 1 : 0;
    const out = [];
    for (let i = inicio; i < linhas.length; i++) {
        const e = _peCelula((linhas[i] || [])[cN]);
        const b = _peCelula((linhas[i] || [])[cB]);
        if (e || b) out.push(`${e};${b}`);
    }
    return out;
}

/** Nomes da coluna de entregador (ou da 1ª coluna), sem repetir. */
function _peNomesDoRelatorio(linhas) {
    const cab = _peAcharCabecalho(linhas, _PE_CAB_NOME);
    const col = cab ? cab.col : 0;
    const vistos = new Set();
    const out = [];
    for (let i = cab ? cab.linha + 1 : 0; i < linhas.length; i++) {
        const n = _peCelula((linhas[i] || [])[col]);
        if (!n || vistos.has(_peNorm(n))) continue;
        vistos.add(_peNorm(n));
        out.push(n);
    }
    return out;
}

/** Casa os nomes do relatório com a lista do planejamento (sem caixa, acento e " - Cidade"). */
function _peCasarNomes(nomes, lista) {
    const chave = n => _peNorm(String(n).split(" - ")[0]);
    const porChave = new Map(lista.map(n => [chave(n), n]));
    const achados = [], faltando = [];
    nomes.forEach(n => {
        const oficial = porChave.get(chave(n));
        if (oficial) { if (!achados.includes(oficial)) achados.push(oficial); }
        else faltando.push(n);
    });
    return { achados, faltando };
}

/** Lê o arquivo como linhas de células. CSV/TXT aceitam ; , ou TAB. */
function _peLerArquivo(arquivo) {
    const ehTexto = /\.(csv|txt)$/i.test(arquivo.name);
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
        leitor.onload = () => {
            try {
                if (ehTexto) {
                    const texto = String(leitor.result).replace(/^﻿/, "");
                    const sep = /[;\t]/.test(texto) ? /;|\t/ : /,/;
                    resolve(texto.split(/\r?\n/).map(l => l.split(sep)));
                    return;
                }
                const wb = XLSX.read(new Uint8Array(leitor.result), { type: "array" });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false }));
            } catch (e) {
                reject(new Error("Arquivo em formato que não deu pra ler. Use .xlsx, .xls ou .csv."));
            }
        };
        if (ehTexto) leitor.readAsText(arquivo, "utf-8"); else leitor.readAsArrayBuffer(arquivo);
    });
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
            <div class="pe-g-rot pe-g-rot-acao">
                <span>Fixos — uma linha por bairro, no formato <b>Entregador;Bairro</b></span>
                <button type="button" class="pe-g-link" data-subir="fixos">Subir relatório</button>
            </div>
            <textarea class="usr-modal-input pe-g-texto" data-lista spellcheck="false" placeholder="Nome Sobrenome;Bairro">${_gcEsc(listaTexto)}</textarea>
            <div class="pe-g-msg" data-msg="fixos"></div>
            <div class="pe-g-rot pe-g-rot-acao">
                <span>Extras disponíveis <span data-qtd></span></span>
                <button type="button" class="pe-g-link" data-subir="extras">Subir relatório</button>
            </div>
            <div class="pe-g-msg" data-msg="extras"></div>
            <input type="file" data-arquivo accept=".xlsx,.xls,.csv,.txt" style="display:none">
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

    // Subir relatório: fixos vira o texto do campo (o Salvar confere contra a planilha);
    // extras substitui a seleção pelos nomes do arquivo que existem na lista.
    const inputArq = overlay.querySelector("[data-arquivo]");
    let alvo = null;
    overlay.querySelectorAll("[data-subir]").forEach(b => b.addEventListener("click", () => {
        alvo = b.dataset.subir;
        inputArq.value = "";
        inputArq.click();
    }));
    inputArq.addEventListener("change", () => {
        const arquivo = inputArq.files && inputArq.files[0];
        if (!arquivo || !alvo) return;
        const msg = overlay.querySelector(`[data-msg="${alvo}"]`);
        const qual = alvo;
        msg.className = "pe-g-msg";
        msg.textContent = "Lendo " + arquivo.name + "...";
        _peLerArquivo(arquivo).then(linhas => {
            if (qual === "fixos") {
                const fixos = _peFixosDoRelatorio(linhas);
                if (!fixos.length) { msg.className = "pe-g-msg pe-g-msg-erro"; msg.textContent = "Nenhuma linha com entregador e bairro no arquivo."; return; }
                overlay.querySelector("[data-lista]").value = fixos.join("\n");
                msg.textContent = `${fixos.length} linha${fixos.length !== 1 ? "s" : ""} lida${fixos.length !== 1 ? "s" : ""} de ${arquivo.name}. Confira e clique em Salvar.`;
                return;
            }
            const nomes = _peNomesDoRelatorio(linhas);
            const { achados, faltando } = _peCasarNomes(nomes, _pvUsuarios);
            if (!achados.length) {
                msg.className = "pe-g-msg pe-g-msg-erro";
                msg.textContent = "Nenhum nome do arquivo está na lista do planejamento. A seleção não mudou.";
                return;
            }
            extrasSel.clear();
            achados.forEach(n => extrasSel.add(n));
            overlay.querySelector("[data-busca]").value = "";
            renderExtras();
            msg.innerHTML = `${achados.length} extra${achados.length !== 1 ? "s" : ""} marcado${achados.length !== 1 ? "s" : ""}. Clique em Salvar.` +
                (faltando.length ? `<div class="pe-g-msg-erro">Fora da lista do planejamento (não marcados): ${faltando.map(_gcEsc).join(", ")}</div>` : "");
        }).catch(e => {
            msg.className = "pe-g-msg pe-g-msg-erro";
            msg.textContent = e.message;
        });
    });

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
