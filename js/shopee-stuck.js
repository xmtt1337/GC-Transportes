// ───── SHOPEE → STUCK ─────
//
// Os pedidos parados, direto da planilha que a operação da Shopee mantém. A
// tela só escreve UMA coisa lá: a Justificativa. Todo o resto é leitura.
//
// A justificativa se amarra ao PEDIDO, não à linha: o servidor reprocura o
// shipment_id na hora de gravar. A planilha é editada à mão em paralelo, e uma
// linha inserida entre carregar a tela e clicar deslocaria tudo — a
// justificativa cairia no pedido do vizinho sem erro nenhum.

let _sstRegistros = [];
let _sstJustificativas = [];
let _sstFiltro = "";

function _sstEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function abrirShopeeStuck(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-shopee-stuck", "Shopee/Stuck");
    document.getElementById("sst-busca").value = "";
    _sstFiltro = "";
    _sstCarregar();
}

function _sstCarregar() {
    const empty = document.getElementById("sst-empty");
    const wrap  = document.getElementById("sst-conteudo");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    wrap.style.display = "none";

    fetch(`${API}/shopee/stuck`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(b => ({ ok: r.ok, b })))
        .then(({ ok, b }) => {
            if (!ok) { skFim(empty, b.error || "Erro ao ler a planilha do Stuck."); return; }
            if (b.sem_estacao) {
                skFim(empty, "Seu polo não opera Shopee, então não há Stuck para mostrar.");
                return;
            }
            _sstRegistros = b.registros || [];
            _sstJustificativas = b.justificativas || [];
            document.getElementById("sst-estacao").innerText = b.estacao || "—";
            if (!_sstRegistros.length) {
                skFim(empty, "Nenhum pedido parado na sua base. 🎉");
                return;
            }
            empty.style.display = "none";
            wrap.style.display = "";
            _sstRenderizar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _sstFiltrar() {
    _sstFiltro = document.getElementById("sst-busca").value;
    _sstRenderizar();
}

/** Casa o termo em qualquer coluna: quem procura tem o código OU o motorista. */
function _sstVisiveis() {
    const termo = String(_sstFiltro || "").trim().toLowerCase();
    if (!termo) return _sstRegistros;
    return _sstRegistros.filter(r =>
        Object.values(r).some(v => String(v ?? "").toLowerCase().includes(termo)));
}

function _sstRenderizar() {
    const lista = _sstVisiveis();
    document.getElementById("sst-contador").innerText = lista.length === _sstRegistros.length
        ? `${_sstRegistros.length} pedido${_sstRegistros.length !== 1 ? "s" : ""} parado${_sstRegistros.length !== 1 ? "s" : ""}`
        : `${lista.length} de ${_sstRegistros.length}`;

    document.getElementById("sst-tbody").innerHTML = lista.map(r => {
        // O índice do registro na lista COMPLETA: o filtro muda a ordem visível,
        // e passar a posição da lista filtrada faria o clique gravar em outro.
        const i = _sstRegistros.indexOf(r);
        return `
        <tr data-codigo="${_sstEsc(r.codigo)}">
            <td data-label="Estação">${_sstEsc(r.station_name)}</td>
            <td data-label="Cidade">${_sstEsc(r.buyer_city)}</td>
            <td data-label="Pedido" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;color:#e2e8f0">${_sstEsc(r.codigo)}</td>
            <td data-label="Status">${_sstEsc(r.tracking_status)}</td>
            <td data-label="Dias parado" style="text-align:center">${_sstEsc(r.ageing_last_status)}</td>
            <td data-label="Motorista">${_sstEsc(r.driver_name) || "—"}</td>
            <td data-label="Valor">${_sstEsc(r.cogs)}</td>
            <td data-label="Justificativa">${_sstSelectHtml(r, i)}</td>
            <td data-label="Histórico">
                <button type="button" class="sst-hist-btn" onclick="_sstAbrirHistorico('${_sstEsc(r.codigo)}')">Visualizar</button>
            </td>
        </tr>`;
    }).join("");
}

/**
 * O seletor da justificativa.
 *
 * As opções mostram o rótulo CURTO — a frase inteira tem até 70 caracteres e
 * empurraria as outras colunas pra fora da tela. O valor enviado continua sendo
 * o texto completo, que é o que a validação de dados da planilha aceita.
 */
function _sstSelectHtml(r, indice) {
    const atual = r.Justificativa || "";
    const conhecida = _sstJustificativas.some(j => j.valor === atual);
    const opcoes = _sstJustificativas.map(j =>
        `<option value="${_sstEsc(j.valor)}"${j.valor === atual ? " selected" : ""}>${_sstEsc(j.curto)}</option>`).join("");
    // Justificativa escrita à mão na planilha, fora da lista: entra como opção
    // só pra não parecer que o campo está vazio. Escolher outra a substitui.
    const foraDaLista = atual && !conhecida
        ? `<option value="${_sstEsc(atual)}" selected>${_sstEsc(r.justificativa_curta)}</option>` : "";
    return `
        <select class="sst-just" title="${_sstEsc(atual)}" onchange="_sstSalvar(this, ${indice})">
            <option value=""${!atual ? " selected" : ""}>— sem justificativa —</option>
            ${foraDaLista}${opcoes}
        </select>`;
}

function _sstSalvar(sel, indice) {
    const registro = _sstRegistros[indice];
    if (!registro) return;
    const anterior = registro.Justificativa || "";
    const novo = sel.value;
    if (novo === anterior) return;

    sel.disabled = true;
    sel.classList.remove("erro", "ok");
    fetch(`${API}/shopee/stuck/justificativa`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: registro.codigo, justificativa: novo })
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        sel.disabled = false;
        if (!ok) {
            // Volta pro valor de antes: deixar o seletor no valor novo diria que
            // gravou, e a planilha continuaria com o antigo.
            sel.value = anterior;
            sel.classList.add("erro");
            gcAlert(b.error || "Não foi possível gravar a justificativa.");
            return;
        }
        registro.Justificativa = b.justificativa;
        registro.justificativa_curta = b.justificativa_curta;
        sel.title = b.justificativa;
        sel.classList.add("ok");
        setTimeout(() => sel.classList.remove("ok"), 1200);
    })
    .catch(() => {
        sel.disabled = false;
        sel.value = anterior;
        sel.classList.add("erro");
        gcAlert("Erro ao conectar com o servidor.");
    });
}

// ───── Histórico do pedido ─────
//
// O rastro do código no sistema inteiro: recebimento, as duas conferências,
// retenção, bipagem, devolução, faltante e custódia. Quando um pedido trava, a
// pergunta é sempre "por onde ele passou e quem foi o último a encostar" — e a
// resposta estava espalhada por sete telas.

const _SST_CORES = {
    ativo:                  "#25D366",
    baixa:                  "#34d399",
    recebimento:            "#12A5E8",
    conferencia_operacao:   "#3a86ff",
    conferencia_entregador: "#22c55e",
    retido:                 "#ef4444",
    bipagem:                "#8494a9",
    devolucao:              "#f59e0b",
    faltante:               "#ef4444",
    custodia:               "#9333EA",
};

let _sstCodigoAberto = "";

function _sstAbrirHistorico(codigo) {
    _sstCodigoAberto = codigo;
    document.getElementById("sst-hist-codigo").innerText = codigo;
    document.getElementById("sst-hist-corpo").innerHTML =
        `<div class="fechamento-empty" style="padding:20px">Carregando...</div>`;
    _abrirModal("modal-sst-historico");

    fetch(`${API}/shopee/stuck/historico?codigo=${encodeURIComponent(codigo)}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json().then(b => ({ ok: r.ok, b })))
    .then(({ ok, b }) => {
        const corpo = document.getElementById("sst-hist-corpo");
        if (!ok) {
            corpo.innerHTML = `<div class="fechamento-empty" style="padding:20px">${_sstEsc(b.error || "Erro ao buscar o histórico.")}</div>`;
            return;
        }
        const eventos = b.eventos || [];
        if (!eventos.length) {
            // Não é erro: o pedido simplesmente nunca foi bipado aqui. Numa
            // investigação de pedido parado, isso É a resposta.
            corpo.innerHTML = `<div class="fechamento-empty" style="padding:20px">Esse pedido nunca foi bipado no sistema — nem no recebimento, nem em conferência nenhuma.</div>`;
            return;
        }
        corpo.innerHTML = eventos.map(_sstEventoHtml).join("");
    })
    .catch(() => {
        document.getElementById("sst-hist-corpo").innerHTML =
            `<div class="fechamento-empty" style="padding:20px">Erro ao conectar com o servidor.</div>`;
    });
}

/**
 * O botão de abrir a conversa do ativo.
 *
 * Só aparece pra quem pode: Conversas é restrito a sac, dev e admin
 * (verificarAtivos no servidor), enquanto o Stuck é aberto a toda a operação.
 * Mostrar o botão pra quem levaria "Você não tem acesso" é pior do que não
 * mostrar — a pessoa clica achando que é falha do sistema.
 *
 * O evento em si continua visível pra todos: saber que houve um ativo e o que
 * o cliente respondeu é informação sobre o pacote, não conteúdo de conversa.
 */
function _sstConversaHtml(e, codigo) {
    if (e.etapa !== "ativo") return "";
    var role = window._gcUser && window._gcUser.role;
    if (typeof WA_ROLES_ATIVOS === "undefined" || !WA_ROLES_ATIVOS.includes(role)) return "";
    return `<button type="button" class="sst-conversa-btn"
                    onclick="_sstAbrirConversa('${_sstEsc(codigo)}')">Ver conversa</button>`;
}

function _sstAbrirConversa(codigo) {
    _fecharModal("modal-sst-historico");
    // A tela de Conversas resolve aba e transportadora sozinha a partir do
    // código — por isso só ele vai. Ela também confere o cargo de novo, então
    // um link colado por engano não passa.
    abrirWhatsappConversas(null, { codigo: codigo });
}

function _sstEventoHtml(e) {
    const cor = _SST_CORES[e.etapa] || "#8494a9";
    return `
    <div class="sst-evento" style="--sst-c:${cor}">
        <div class="sst-evento-topo">
            <span class="sst-evento-etapa">${_sstEsc(e.etapa_rotulo)}</span>
            <span class="sst-evento-quando">${_sstEsc(_sstQuando(e))}</span>
        </div>
        ${e.detalhe ? `<div class="sst-evento-detalhe">${_sstEsc(e.detalhe)}</div>` : ""}
        <div class="sst-evento-rodape">
            <span class="sst-evento-quem">${e.usuario ? _sstEsc(e.usuario) : "—"}</span>
            ${_sstConversaHtml(e, e.codigo || _sstCodigoAberto)}
        </div>
    </div>`;
}

/**
 * Quando aconteceu.
 *
 * O texto gravado no bipe manda, quando existe: ele já veio no fuso de
 * Brasília, do próprio aparelho de quem bipou. O timestamp do banco é a
 * reserva, convertido aqui.
 */
function _sstQuando(e) {
    if (e.quando_texto) return e.quando_texto;
    if (!e.quando) return "—";
    const d = new Date(e.quando);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}
