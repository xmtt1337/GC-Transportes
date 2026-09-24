// ───── MACROS (SÓ DEV) ─────
// Tarefas que o sistema roda sozinho, em seções (ver _MAC_SECOES). Hoje só o aviso de rota
// incompleta da Shopee XPT_CFC funciona (modules/avisos-entregador); os outros itens ficam na
// tela como "ainda não integrado" até ganharem chave no servidor.
//
// Configurar é sempre pela tela — nunca mexendo direto no banco (mesmo espírito de
// Conversão de nomes e Telefones dos entregadores).

let _macLista = [];
let _macTipos = [];     // catálogo de critérios do macro aberto no modal (vem do servidor)
let _macRodadas = [];   // cópia de trabalho das rodadas de quem está aberto no modal
let _macChaveEditando = null;

function abrirMacros(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev") {
        gcAlert("Só dev acessa os Macros.");
        return;
    }
    mostrarTela("tela-macros");
    _macCarregarLista();
}

function _macEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// "avisos_entregador" -> "avisos-entregador", o caminho que o servidor usa. Funciona pra
// qualquer chave futura que siga a mesma convenção, sem precisar de uma tabela de rotas.
const _macRotaDaChave = chave => String(chave || "").replace(/_/g, "-");

function _macCarregarLista() {
    const empty = document.getElementById("mac-empty");
    const lista = document.getElementById("mac-lista");
    skMostrar(empty, "cards");
    empty.style.display = "";
    lista.innerHTML = "";

    fetch(`${API}/admin/macros`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); return; }
            _macLista = d.macros || [];
            empty.style.display = "none";
            lista.innerHTML = _macHtmlSecoes(_macLista);
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// ── Como a tela se organiza ──
// A arrumação é daqui do front: o servidor só manda os macros que JÁ funcionam (por chave), e
// cada um cai no lugar dele. Item sem `chave` é um que ainda vai ser integrado — aparece na
// lista, apagado, sem "Configurar", só pra ficar marcado onde ele vai morar.
const _MAC_SECOES = [
    {
        titulo: "Avisos de rota incompleta",
        texto: "Mensagem no WhatsApp pro entregador quando a rota ainda não fechou.",
        grupos: [{
            itens: [
                { nome: "Shopee XPT_CFC", detalhe: "Caçador · WhatsApp oficial (WABA)", chave: "avisos_entregador" },
                { nome: "Shopee XPT_VIA", detalhe: "Videira" },
            ],
        }],
    },
    {
        titulo: "Macros",
        texto: "Rotinas que rodam sozinhas no sistema da Shopee.",
        grupos: [{
            titulo: "Shopee",
            itens: [
                { nome: "Alimentar AT exportada" },
                { nome: "Pedidos pesquisados" },
                { nome: "Backlog" },
            ],
        }],
    },
];

// "19:05 Abaixo de 90% concluído · 22:05 Mais de 1 pacotes em Delivering" (resumo do servidor)
// vira uma linha por rodada, com o horário separado do critério. Texto fora desse formato
// ("sem rodada configurada") passa inteiro, numa linha só.
function _macResumoHtml(resumo) {
    const partes = String(resumo || "").split(" · ").filter(Boolean);
    if (!partes.length) return "";
    return partes.map(p => {
        const m = /^(\d{2}:\d{2}) (.+)$/.exec(p);
        return m
            ? `<div class="mac-agenda-linha"><span class="mac-agenda-hora">${m[1]}</span><span>${_macEsc(m[2].charAt(0).toLowerCase() + m[2].slice(1))}</span></div>`
            : `<div class="mac-agenda-linha"><span>${_macEsc(p)}</span></div>`;
    }).join("");
}

function _macHtmlItem(item, m) {
    const nome = `<div class="mac-item-nome">${_macEsc(item.nome)}</div>`
        + (item.detalhe ? `<div class="mac-item-detalhe">${_macEsc(item.detalhe)}</div>` : "");

    if (!item.chave || !m) {
        // Ainda não integrado (ou o servidor não mandou esse macro): fica marcado, sem ação.
        const aviso = item.chave ? "Indisponível no momento" : "Ainda não integrado";
        return `
        <div class="mac-item mac-item-pendente">
            <div class="mac-item-id">${nome}</div>
            <div class="mac-item-agenda">${aviso}</div>
            <div class="mac-item-status"></div>
            <div class="mac-item-acao"></div>
        </div>`;
    }
    return `
        <div class="mac-item">
            <div class="mac-item-id">${nome}</div>
            <div class="mac-item-agenda">${_macResumoHtml(m.resumo)}</div>
            <div class="mac-item-status ${m.ativo ? "ligado" : "desligado"}">
                <button type="button" class="gc-toggle mac-toggle${m.ativo ? " gc-toggle--on" : ""}" role="switch" aria-checked="${m.ativo ? "true" : "false"}"
                        title="${m.ativo ? "Desligar" : "Ligar"}" onclick="_macAlternarAtivo('${_macEsc(m.chave)}', this)"><span class="gc-toggle__knob"></span></button>
                <span class="mac-status-texto">${m.ativo ? "Ativo" : "Desligado"}</span>
            </div>
            <div class="mac-item-acao"><button type="button" class="mac-configurar" onclick="_macAbrirConfigurar('${_macEsc(m.chave)}')">Configurar</button></div>
        </div>`;
}

function _macHtmlSecao(secao, porChave) {
    const grupos = secao.grupos.map(g => `
        <div class="mac-grupo">
            ${g.titulo ? `<div class="mac-grupo-titulo">${_macEsc(g.titulo)}</div>` : ""}
            ${g.itens.map(item => _macHtmlItem(item, item.chave && porChave[item.chave])).join("")}
        </div>`).join("");
    return `
    <section class="mac-secao">
        <h3 class="mac-secao-titulo">${_macEsc(secao.titulo)}</h3>
        ${secao.texto ? `<p class="mac-secao-texto">${_macEsc(secao.texto)}</p>` : ""}
        <div class="mac-painel">${grupos}</div>
    </section>`;
}

// A tela inteira, a partir da lista do servidor. Macro que o servidor mande e que ainda não
// tenha lugar em _MAC_SECOES não some: cai em "Outros", configurável normalmente.
function _macHtmlSecoes(lista) {
    const porChave = {};
    (lista || []).forEach(m => { porChave[m.chave] = m; });
    const conhecidas = new Set();
    _MAC_SECOES.forEach(s => s.grupos.forEach(g => g.itens.forEach(i => i.chave && conhecidas.add(i.chave))));
    const sobra = (lista || []).filter(m => !conhecidas.has(m.chave));

    const secoes = sobra.length
        ? _MAC_SECOES.concat([{ titulo: "Outros", grupos: [{ itens: sobra.map(m => ({ nome: m.nome, detalhe: m.descricao, chave: m.chave })) }] }])
        : _MAC_SECOES;
    return secoes.map(s => _macHtmlSecao(s, porChave)).join("");
}

// ── Ligar/desligar direto na lista ──
// O interruptor da linha grava só o "ativo" (as rodadas ficam como estão), sem passar pelo
// modal. Troca na hora e volta atrás se o servidor recusar.
function _macAlternarAtivo(chave, botao) {
    const m = _macLista.find(x => x.chave === chave);
    if (!m || (botao && botao.disabled)) return;
    const antes = !!m.ativo;
    const novo = !antes;

    const redesenhar = () => {
        const lista = document.getElementById("mac-lista");
        if (lista) lista.innerHTML = _macHtmlSecoes(_macLista);
    };
    m.ativo = novo;
    redesenhar();

    fetch(`${API}/admin/macros/${_macRotaDaChave(chave)}/ativo`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novo })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (ok) return;
            m.ativo = antes;
            redesenhar();
            gcAlert(d.error || "Não foi possível mudar.");
        })
        .catch(() => {
            m.ativo = antes;
            redesenhar();
            gcAlert("Erro ao conectar com o servidor.");
        });
}

// Nome do macro no título do modal: o da tela ("Avisos de rota incompleta — Shopee XPT_CFC"),
// que é como ele aparece na lista; o nome do servidor só se ele não tiver lugar na tela.
function _macTituloModal(chave) {
    for (const s of _MAC_SECOES) {
        for (const g of s.grupos) {
            const item = g.itens.find(i => i.chave === chave);
            if (item) return `${s.titulo} — ${item.nome}`;
        }
    }
    const m = _macLista.find(x => x.chave === chave);
    return (m && m.nome) || "Configurar macro";
}

function _macAbrirConfigurar(chave) {
    _macChaveEditando = chave;
    const m = _macLista.find(x => x.chave === chave);
    document.getElementById("mac-editar-titulo").innerText = _macTituloModal(chave);
    document.getElementById("mac-editar-descricao").innerText = (m && m.descricao) || "";
    document.getElementById("mac-editar-erro").innerText = "";

    fetch(`${API}/admin/macros/${_macRotaDaChave(chave)}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) { gcAlert(d.error); return; }
            _macTipos = d.tipos || [];
            _macRodadas = (d.rodadas || []).map(r => Object.assign({}, r));
            document.getElementById("mac-editar-ativo").checked = !!d.ativo;
            _macRenderizarRodadas();
            _abrirModal("modal-macro-editar");
        })
        .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

function _macRotuloParametro(tipoId) {
    const t = _macTipos.find(x => x.id === tipoId);
    return t ? t.parametroRotulo : "Parâmetro";
}

// Dois dígitos nos rótulos: "03", não "3".
const _macDoisDigitos = n => String(n).padStart(2, "0");

// "19:05" pro campo de horário — sempre com dois dígitos ("19:03", não "19:3"). Vazio quando
// hora/minuto não são inteiros da faixa (00–23 e 00–59): melhor um campo vazio do que um
// horário que não é o guardado.
const _macEmFaixa = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

function _macHorarioTexto(r) {
    return _macEmFaixa(r.hora, 23) && _macEmFaixa(r.minuto, 59)
        ? `${_macDoisDigitos(r.hora)}:${_macDoisDigitos(r.minuto)}` : "";
}

// Digitar no campo: o navegador devolve sempre "HH:MM" em 24h (mesmo que MOSTRE AM/PM, conforme
// o idioma) ou "" enquanto está incompleto. Grava em hora e minuto, que é o que o servidor
// guarda — a faixa (0–23, 0–59) o próprio campo já garante.
function _macMudarHorario(i, valor) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(valor || "");
    _macRodadas[i].hora = m ? Number(m[1]) : "";
    _macRodadas[i].minuto = m ? Number(m[2]) : "";
}

// ── Escolher o horário numa lista ──
// O campo de horário do Chrome tem uma lista própria, mas ela DÁ A VOLTA (depois do 59 vem o
// 00 de novo) e parecia rolar sem fim — e não dá pra mudar isso. O relógio do campo abre esta
// lista no lugar: hora (00–23) e minuto (00–59) lado a lado, com começo e fim. Digitar direto
// no campo continua funcionando.
const _macRelogioSvg = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`;

let _macPop = null;   // a lista aberta: { el, i, input, aoFora, aoTecla }

function _macFecharHorario() {
    if (!_macPop) return;
    document.removeEventListener("mousedown", _macPop.aoFora, true);
    document.removeEventListener("keydown", _macPop.aoTecla, true);
    window.removeEventListener("resize", _macFecharHorario);
    _macPop.el.remove();
    _macPop = null;
}

// Uma coluna: de `de` até `ate`, dois dígitos, com o valor atual marcado.
function _macColunaHtml(de, ate, atual, campo, i) {
    let html = "";
    for (let n = de; n <= ate; n++) {
        html += `<button type="button" class="mac-hm-item${n === atual ? " sel" : ""}" tabindex="-1" data-n="${n}" onclick="_macEscolherHm(${i},'${campo}',${n})">${_macDoisDigitos(n)}</button>`;
    }
    return html;
}

function _macAbrirHorario(i, botao) {
    const jaAberta = !!_macPop && _macPop.i === i;
    _macFecharHorario();
    if (jaAberta) return; // clicar de novo no relógio fecha

    const r = _macRodadas[i];
    const el = document.createElement("div");
    el.className = "mac-hm-pop";
    el.innerHTML = `
        <div class="mac-hm-lista"><div class="mac-hm-rotulo">Hora</div>
            <div class="mac-hm-col" data-campo="hora">${_macColunaHtml(0, 23, r.hora, "hora", i)}</div></div>
        <div class="mac-hm-lista"><div class="mac-hm-rotulo">Minuto</div>
            <div class="mac-hm-col" data-campo="minuto">${_macColunaHtml(0, 59, r.minuto, "minuto", i)}</div></div>`;
    document.body.appendChild(el);

    // Abre PRA BAIXO do campo; só vira pra cima se embaixo não couber e em cima houver mais lugar.
    const caixa = botao.getBoundingClientRect();
    const alto = el.offsetHeight, largo = el.offsetWidth;
    const abaixo = window.innerHeight - caixa.bottom;
    const praCima = abaixo < alto + 12 && caixa.top > abaixo;
    el.style.left = Math.max(8, Math.min(caixa.left, window.innerWidth - largo - 8)) + "px";
    el.style.top = (praCima ? Math.max(8, caixa.top - alto - 6) : caixa.bottom + 6) + "px";

    const aoFora = ev => { if (!el.contains(ev.target) && !botao.contains(ev.target)) _macFecharHorario(); };
    const aoTecla = ev => { if (ev.key === "Escape") { ev.stopPropagation(); _macFecharHorario(); } };
    document.addEventListener("mousedown", aoFora, true);
    document.addEventListener("keydown", aoTecla, true);
    window.addEventListener("resize", _macFecharHorario);
    _macPop = { el, i, input: botao.parentNode.querySelector("input"), aoFora, aoTecla };

    // Cada coluna já abre com o valor atual à vista, no meio.
    el.querySelectorAll(".mac-hm-col").forEach(col => {
        const sel = col.querySelector(".sel");
        if (sel) col.scrollTop = sel.offsetTop - (col.clientHeight - sel.offsetHeight) / 2;
    });
}

// Escolheu na lista: grava, marca na coluna e atualiza o campo. Escolher o minuto é o último
// passo, então fecha; escolher a hora deixa aberta pra escolher o minuto em seguida.
function _macEscolherHm(i, campo, n) {
    _macRodadas[i][campo] = n;
    if (_macPop) {
        _macPop.el.querySelectorAll(`.mac-hm-col[data-campo="${campo}"] .mac-hm-item`)
            .forEach(b => b.classList.toggle("sel", Number(b.dataset.n) === n));
        if (_macPop.input) _macPop.input.value = _macHorarioTexto(_macRodadas[i]);
    }
    if (campo === "minuto") _macFecharHorario();
}

const _macCapitalizar = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

// Uma rodada = uma linha (sem cartão dentro do cartão do modal): horário, critério, o número
// do critério e um "Remover" discreto. O rótulo do número acompanha o critério escolhido.
function _macLinhaRodada(r, i) {
    const rotuloParam = _macRotuloParametro(r.tipo);
    return `
    <div class="mac-rodada">
        <div class="mac-campo mac-campo-horario">
            <span>Horário</span>
            <div class="mac-horario-wrap">
                <input type="time" class="usr-modal-input mac-horario" value="${_macHorarioTexto(r)}"
                       oninput="_macMudarHorario(${i}, this.value)">
                <button type="button" class="mac-relogio" title="Escolher o horário numa lista" aria-label="Escolher o horário"
                        onclick="_macAbrirHorario(${i}, this)">${_macRelogioSvg}</button>
            </div>
        </div>
        <label class="mac-campo mac-campo-criterio">
            <span>Critério</span>
            <select class="usr-modal-input mac-criterio" title="${_macEsc((_macTipos.find(t => t.id === r.tipo) || {}).rotulo)}"
                    onchange="_macMudarTipo(${i}, this.value)">
                ${_macTipos.map(t => `<option value="${t.id}"${t.id === r.tipo ? " selected" : ""}>${_macEsc(t.rotulo)}</option>`).join("")}
            </select>
        </label>
        <label class="mac-campo mac-campo-param">
            <span title="${_macEsc(rotuloParam)}">${_macEsc(_macCapitalizar(rotuloParam))}</span>
            <input type="number" min="0" class="usr-modal-input" value="${r.parametro}"
                   oninput="_macMudarCampo(${i},'parametro',this.value)">
        </label>
        <button type="button" class="mac-remover" onclick="_macRemoverRodada(${i})">Remover</button>
    </div>`;
}

function _macRenderizarRodadas() {
    _macFecharHorario(); // a lista aberta era de uma linha que está sendo redesenhada
    const el = document.getElementById("mac-rodadas-lista");
    if (!_macRodadas.length) {
        el.innerHTML = `<div style="font-size:12.5px;color:#66829c;padding:8px 0">Nenhuma rodada — adicione pelo menos uma.</div>`;
        return;
    }
    el.innerHTML = _macRodadas.map((r, i) => _macLinhaRodada(r, i)).join("");
}

// `_macRodadas` é sempre quem manda: os campos só escrevem nela, e um re-render (troca de
// tipo) nunca perde o que já foi digitado nos outros campos.
function _macMudarCampo(i, campo, valor) {
    _macRodadas[i][campo] = valor === "" ? "" : Number(valor);
}

function _macMudarTipo(i, tipoId) {
    const t = _macTipos.find(x => x.id === tipoId);
    _macRodadas[i].tipo = tipoId;
    _macRodadas[i].parametro = t ? t.parametroPadrao : 0;
    _macRenderizarRodadas(); // o rótulo do campo parâmetro muda junto com o tipo
}

function _macAdicionarRodada() {
    const primeiro = _macTipos[0];
    _macRodadas.push({ hora: 12, minuto: 0, tipo: primeiro ? primeiro.id : "", parametro: primeiro ? primeiro.parametroPadrao : 0 });
    _macRenderizarRodadas();
}

function _macRemoverRodada(i) {
    _macRodadas.splice(i, 1);
    _macRenderizarRodadas();
}

function _macSalvar() {
    const erro = document.getElementById("mac-editar-erro");
    erro.innerText = "";
    if (!_macRodadas.length) { erro.innerText = "Adicione pelo menos uma rodada."; return; }

    const ativo = document.getElementById("mac-editar-ativo").checked;
    const btn = document.getElementById("mac-editar-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/macros/${_macRotaDaChave(_macChaveEditando)}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo, rodadas: _macRodadas })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _fecharModal("modal-macro-editar");
            _macCarregarLista();
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}
