// ───── SHOPEE → CONFERÊNCIA → ATRIBUIÇÕES ─────
// A pessoa diz o que está conferindo (uma cidade ou um cluster) e bipa. O sistema resolve
// o pacote e responde se ele é daquele grupo:
//
//   cidade  — código → Pedidos pesquisados (Zipcode Name) → planilha de CEPs → cidade
//   cluster — código → AT exportada (SPX tracking num) → Cluster
//
// Tudo fica numa sessão. É isso que permite voltar depois e provar o que foi bipado
// errado — sem sessão, o aviso na tela some no primeiro F5.

const SCA_RESULTADOS = {
    ok:          { rotulo: "Confere",       cor: "#22c55e" },
    divergente:  { rotulo: "Grupo errado",  cor: "#ef4444" },
    sem_pedido:  { rotulo: "Não encontrado",cor: "#eab308" },
    sem_cep:     { rotulo: "Sem CEP",       cor: "#eab308" },
    sem_cidade:  { rotulo: "CEP sem cidade",cor: "#eab308" },
    sem_cluster: { rotulo: "Sem cluster",   cor: "#eab308" },
};

let _scaTipoAtual = null;
let _scaOpcoes    = { cidades: [], clusters: [] };
let _scaSessao    = null;
let _scaBipagens  = [];
let _scaFiltroAtual = "todos";

function abrirShopeeAtribuicoes(event) {
    if (event) event.preventDefault();
    _scaTipoAtual = null;
    _scaSessao = null;
    _scaBipagens = [];
    _scaFiltroAtual = "todos";
    _scaPintarTipo();
    _scaMostrarInicio();
    mostrarTela("tela-shopee-atribuicoes");
    _scaCarregarOpcoes();
    _scaCarregarHistorico();
}

function _scaEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _scaMostrarInicio() {
    document.getElementById("sca-inicio").style.display = "";
    document.getElementById("sca-andamento").style.display = "none";
    document.getElementById("sca-historico").style.display = "";
}

function _scaMostrarAndamento() {
    document.getElementById("sca-inicio").style.display = "none";
    document.getElementById("sca-andamento").style.display = "";
    // O histórico sai da frente durante a conferência: quem está bipando não precisa dele,
    // e a lista da sessão é o que tem que estar à mão.
    document.getElementById("sca-historico").style.display = "none";
}

function _scaCarregarOpcoes() {
    fetch(`${API}/shopee/conferencia/atribuicoes/opcoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.sem_polo) {
                document.getElementById("sca-dica").innerText = "Você ainda não tem polo definido. Abra o Recebimento Shopee para escolher.";
                return;
            }
            if (d.polo_sem_xpt) {
                document.getElementById("sca-dica").innerText = `O polo ${d.polo_label} não recebe Shopee, então não há atribuições para conferir.`;
                return;
            }
            _scaOpcoes = { cidades: d.cidades || [], clusters: d.clusters || [] };
            if (_scaTipoAtual) _scaPreencherAlvo();
        })
        .catch(() => { document.getElementById("sca-dica").innerText = "Erro ao carregar as opções."; });
}

function _scaTipo(tipo) {
    _scaTipoAtual = tipo;
    _scaPintarTipo();
    _scaPreencherAlvo();
}

function _scaPintarTipo() {
    document.querySelectorAll("#sca-tipo .shr-seg-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.tipo === _scaTipoAtual));
    document.getElementById("sca-campo-alvo").style.display = _scaTipoAtual ? "" : "none";
    document.getElementById("sca-btn-comecar").style.display = "none";
    if (!_scaTipoAtual) document.getElementById("sca-dica").innerText = "Escolha o tipo de conferência para começar.";
}

function _scaPreencherAlvo() {
    const cidade = _scaTipoAtual === "cidade";
    document.getElementById("sca-alvo-label").innerText = cidade ? "Cidade" : "Cluster";
    const sel = document.getElementById("sca-alvo");
    const lista = cidade ? _scaOpcoes.cidades : _scaOpcoes.clusters;

    sel.innerHTML = `<option value="">Selecione...</option>` + lista.map(o => {
        const valor = cidade ? o.cidade : o.cluster;
        const qtd   = cidade ? `${o.ceps} CEPs` : `${o.pacotes} pacotes`;
        return `<option value="${_scaEsc(valor)}">${_scaEsc(valor)} — ${qtd}</option>`;
    }).join("");

    document.getElementById("sca-dica").innerText = lista.length
        ? (cidade
            ? "A cidade vem da planilha de CEPs, a mesma da bipagem."
            : "O cluster vem da AT exportada da sua estação.")
        : (cidade
            ? "Nenhuma cidade na planilha de CEPs. Sincronize os CEPs primeiro."
            : "Nenhum cluster na AT. Alimente a AT Exportada primeiro.");
}

function _scaAlvoMudou() {
    const v = document.getElementById("sca-alvo").value;
    document.getElementById("sca-btn-comecar").style.display = v ? "" : "none";
}

function _scaComecar() {
    const alvo = document.getElementById("sca-alvo").value;
    if (!_scaTipoAtual || !alvo) return;
    const btn = document.getElementById("sca-btn-comecar");
    btn.disabled = true;
    btn.textContent = "Abrindo...";

    fetch(`${API}/shopee/conferencia/atribuicoes/sessao`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: _scaTipoAtual, alvo })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        btn.disabled = false;
        btn.textContent = "Começar conferência";
        if (!ok) return gcAlert(d.error || "Não foi possível abrir a conferência.");
        _scaSessao = d;
        _scaBipagens = [];
        _scaFiltroAtual = "todos";
        _scaAbrirSessao();
    })
    .catch(() => {
        btn.disabled = false;
        btn.textContent = "Começar conferência";
        gcAlert("Erro ao conectar com o servidor.");
    });
}

function _scaAbrirSessao() {
    const s = _scaSessao;
    document.getElementById("sca-faixa-label").innerText = s.tipo === "cidade" ? "Conferindo cidade" : "Conferindo cluster";
    document.getElementById("sca-faixa-alvo").innerText = s.alvo;
    document.getElementById("sca-faixa-obs").innerText =
        `Aberta por ${s.usuario_nome || "—"}${s.encerrada_em ? " · encerrada" : ""}`;
    _scaMsg("", null);
    _scaPintarAbas();
    _scaRenderizar();
    _scaMostrarAndamento();
    const campo = document.getElementById("sca-codigo");
    campo.value = "";
    campo.disabled = !!s.encerrada_em;
    if (!s.encerrada_em) campo.focus();
}

function _scaMsg(msg, tipo) {
    const el = document.getElementById("sca-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13.5px`;
    el.innerHTML = msg;
}

let _scaFlashTimer = null;
function _scaFlash(tipo) {
    const wrap = document.getElementById("sca-campo-codigo");
    clearTimeout(_scaFlashTimer);
    wrap.classList.remove("flash-ok", "flash-err");
    void wrap.offsetWidth;
    wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    _scaFlashTimer = setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
}

function _scaCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _scaBipar(); }
}

function _scaScan() {
    _bteAbrirScanner(texto => { document.getElementById("sca-codigo").value = texto; _scaBipar(); });
}

function _scaBipar() {
    if (!_scaSessao || _scaSessao.encerrada_em) return;
    const campo = document.getElementById("sca-codigo");
    const codigo = campo.value.trim().toUpperCase();
    // Limpa e devolve o foco antes da resposta: o leitor dispara o próximo bipe na
    // sequência, e um campo travado perderia pacote.
    campo.value = "";
    campo.focus();
    if (!codigo) return;

    fetch(`${API}/shopee/conferencia/atribuicoes/bipar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ sessao_id: _scaSessao.id, codigo })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro(); _scaFlash("err");
            if (d.ja_bipado) return _scaMsg(`<strong>${_scaEsc(codigo)}</strong> já foi bipado nesta conferência.`, "aviso");
            return _scaMsg(_scaEsc(d.error) || "Erro ao bipar.", "erro");
        }
        const info = SCA_RESULTADOS[d.resultado] || { rotulo: d.resultado, cor: "#eab308" };
        if (d.resultado === "ok") {
            _gcBeepSucesso(); _scaFlash("ok");
            _scaMsg(`✓ <strong>${_scaEsc(d.codigo)}</strong> confere com <strong>${_scaEsc(d.esperado)}</strong>.`, "ok");
        } else {
            // Divergência e "não encontrado" apitam igual: os dois param a esteira.
            _gcBeepErro(); _scaFlash("err");
            _scaMsg(d.resultado === "divergente"
                ? `⚠ <strong>${_scaEsc(d.codigo)}</strong> é de <strong>${_scaEsc(d.encontrado)}</strong>, não de ${_scaEsc(d.esperado)}.`
                : `⚠ <strong>${_scaEsc(d.codigo)}</strong> — ${_scaEsc(d.detalhe || info.rotulo)}`,
                d.resultado === "divergente" ? "erro" : "aviso");
        }
        _scaBipagens.unshift(d);
        _scaRenderizar();
    })
    .catch(() => { _gcBeepErro(); _scaMsg("Erro ao conectar com o servidor.", "erro"); });
}

function _scaFiltro(f) {
    _scaFiltroAtual = f;
    _scaPintarAbas();
    _scaRenderizar();
}

function _scaPintarAbas() {
    document.querySelectorAll("#sca-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.f === _scaFiltroAtual));
}

function _scaRenderizar() {
    const total = _scaBipagens.length;
    const ok    = _scaBipagens.filter(b => b.resultado === "ok").length;
    const div   = _scaBipagens.filter(b => b.resultado === "divergente").length;
    const semD  = total - ok - div;

    const card = (rotulo, valor, sub, cor) => `
        <div class="paj-card">
            <div class="paj-label">${rotulo}</div>
            ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}
            <div class="paj-value"${cor ? ` style="color:${cor}"` : ""}>${valor}</div>
        </div>`;
    document.getElementById("sca-resumo").innerHTML =
        card("Bipados", total, _scaSessao ? _scaSessao.alvo : "") +
        card("Conferem", ok, "no grupo certo", ok ? "#22c55e" : null) +
        card("Grupo errado", div, "não são daqui", div ? "#ef4444" : null) +
        card("Sem dado", semD, "não deu pra conferir", semD ? "#eab308" : null);

    // As abas contam sozinhas: sem isso a pessoa teria que contar linha pra saber
    // quantas divergências apareceram.
    const abas = document.querySelectorAll("#sca-abas .filtro-tab");
    if (abas[0]) abas[0].innerText = `Todos ${total}`;
    if (abas[1]) abas[1].innerText = `Divergentes ${div}`;
    if (abas[2]) abas[2].innerText = `Sem dado ${semD}`;

    let lista = _scaBipagens;
    if (_scaFiltroAtual === "divergente") lista = lista.filter(b => b.resultado === "divergente");
    if (_scaFiltroAtual === "sem_dado")   lista = lista.filter(b => !["ok", "divergente"].includes(b.resultado));

    document.getElementById("sca-tbody").innerHTML = lista.length ? lista.map(b => {
        const info = SCA_RESULTADOS[b.resultado] || { rotulo: b.resultado, cor: "#eab308" };
        return `
        <tr${b.resultado === "divergente" ? ' style="background:rgba(239,68,68,0.06)"' : ""}>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_scaEsc(b.codigo)}
                ${b.cep ? `<div style="font-size:11px;color:#8494a9;font-family:'Inter',sans-serif">CEP ${_scaEsc(b.cep)}</div>` : ""}</td>
            <td data-label="Resultado"><span style="color:${info.cor};font-weight:700">${info.rotulo}</span></td>
            <td data-label="Esperado" style="color:#8494a9">${_scaEsc(b.esperado) || "—"}</td>
            <td data-label="Encontrado" style="color:${b.resultado === "divergente" ? "#ef4444" : "#8494a9"};font-weight:${b.resultado === "divergente" ? 700 : 400}">${_scaEsc(b.encontrado) || "—"}</td>
            <td data-label="Hora" style="color:#8494a9">${_scaEsc(b.data_hora_brasilia) || "—"}</td>
        </tr>`;
    }).join("")
        : `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:26px 10px">${
            total ? "Nada nesse filtro." : "Nenhum pacote bipado ainda."}</td></tr>`;
}

// A lista de divergentes é o que se leva pra separação corrigir.
function _scaCopiarDivergentes() {
    const div = _scaBipagens.filter(b => b.resultado === "divergente");
    if (!div.length) return gcAlert("Nenhuma divergência nesta conferência.");
    const texto = div.map(b => `${b.codigo}\t${b.encontrado || "—"}`).join("\n");
    navigator.clipboard.writeText(texto)
        .then(() => _scaMsg(`${div.length} divergência${div.length !== 1 ? "s" : ""} copiada${div.length !== 1 ? "s" : ""}.`, "aviso"))
        .catch(() => gcAlert("Não foi possível copiar."));
}

function _scaEncerrar() {
    if (!_scaSessao) return;
    const div = _scaBipagens.filter(b => b.resultado === "divergente").length;
    gcConfirm(
        `Encerrar a conferência de ${_scaSessao.alvo}?\n\n${_scaBipagens.length} bipado(s)${div ? `, ${div} no grupo errado` : ""}. Depois de encerrar não dá pra bipar mais nela.`,
        () => {
            fetch(`${API}/shopee/conferencia/atribuicoes/encerrar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ sessao_id: _scaSessao.id })
            }).then(() => {
                _scaSessao = null;
                _scaBipagens = [];
                _scaTipoAtual = null;
                _scaPintarTipo();
                _scaMostrarInicio();
                _scaCarregarHistorico();
            }).catch(() => gcAlert("Erro ao encerrar."));
        },
        "Encerrar conferência",
        "Encerrar"
    );
}

// ── Conferências anteriores ──
function _scaCarregarHistorico() {
    const empty  = document.getElementById("sca-hist-empty");
    const result = document.getElementById("sca-hist-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/shopee/conferencia/atribuicoes/sessoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) { skFim(empty, "Nenhuma conferência ainda."); return; }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("sca-hist-tbody").innerHTML = rows.map(s => `
                <tr>
                    <td data-label="Conferência">
                        <div style="font-weight:700;color:#e2e8f0">${_scaEsc(s.alvo)}</div>
                        <div style="font-size:11px;color:#8494a9">${s.tipo === "cidade" ? "Cidade" : "Cluster"}${s.encerrada_em ? "" : " · em aberto"}</div>
                    </td>
                    <td data-label="Bipados" style="font-variant-numeric:tabular-nums">${s.total}</td>
                    <td data-label="OK" style="font-variant-numeric:tabular-nums;color:#22c55e">${s.ok}</td>
                    <td data-label="Divergentes" style="font-variant-numeric:tabular-nums;color:${s.divergentes ? "#ef4444" : "#8494a9"};font-weight:${s.divergentes ? 700 : 400}">${s.divergentes}</td>
                    <td data-label="Sem dado" style="font-variant-numeric:tabular-nums;color:${s.sem_dado ? "#eab308" : "#8494a9"}">${s.sem_dado}</td>
                    <td data-label="Quem / quando">${_scaEsc(s.usuario_nome) || "—"}
                        <div style="font-size:11px;color:#8494a9">${new Date(s.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div></td>
                    <td><button class="adm-usr-action senha" onclick="_scaVerSessao(${s.id})">${s.encerrada_em ? "Ver" : "Continuar"}</button></td>
                </tr>`).join("");
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _scaVerSessao(id) {
    fetch(`${API}/shopee/conferencia/atribuicoes/sessao/${id}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) return gcAlert(d.error);
            _scaSessao = d.sessao;
            _scaBipagens = d.bipagens || [];
            _scaFiltroAtual = "todos";
            _scaAbrirSessao();
        })
        .catch(() => gcAlert("Erro ao abrir a conferência."));
}
