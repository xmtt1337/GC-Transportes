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
let _scaFaltantes = [];      // o que o grupo tem e ainda não foi bipado
let _scaTotalGrupo = 0;      // quantos pacotes o grupo tem no total
let _scaFaltamCarregado = false;

function abrirShopeeAtribuicoes(event) {
    if (event) event.preventDefault();
    // Abre já em "Por cluster": a visão geral entra mostrando os clusters de qualquer jeito,
    // e sem aba marcada a tela parecia esperar um clique que não era necessário.
    _scaTipoAtual = "cluster";
    _scaSelecaoAberta = false;
    _scaOpcoes = { cidades: [], clusters: [] };
    _scaOpcoesCarregadas = false;
    _scaDicaFixa = "";
    _scaVisaoDia = "";       // reabre sempre no dia atual, não no que ficou aberto da última vez
    _scaVisaoRetrato = false;
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
    _scaAlternarSelecao(false); // volta enxuto: quem termina uma conferência olha a visão geral
    _scaCarregarVisao();
}

function _scaMostrarAndamento() {
    document.getElementById("sca-inicio").style.display = "none";
    document.getElementById("sca-andamento").style.display = "";
    // Visão geral e histórico saem da frente durante a conferência: quem está bipando
    // precisa da lista da sessão à mão, não do panorama.
    document.getElementById("sca-visao").style.display = "none";
    document.getElementById("sca-historico").style.display = "none";
}

function _scaCarregarOpcoes() {
    fetch(`${API}/shopee/conferencia/atribuicoes/opcoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.sem_polo) {
                _scaDicaFixa = "Você ainda não tem polo definido. Abra o Recebimento Shopee para escolher.";
                document.getElementById("sca-dica").innerText = _scaDicaFixa;
                return;
            }
            if (d.polo_sem_xpt) {
                _scaDicaFixa = `O polo ${d.polo_label} não recebe Shopee, então não há atribuições para conferir.`;
                document.getElementById("sca-dica").innerText = _scaDicaFixa;
                return;
            }
            _scaDicaFixa = "";
            _scaOpcoes = { cidades: d.cidades || [], clusters: d.clusters || [] };
            _scaOpcoesCarregadas = true;
            if (_scaTipoAtual) _scaPreencherAlvo();
        })
        .catch(() => {
            _scaDicaFixa = "Erro ao carregar as opções.";
            document.getElementById("sca-dica").innerText = _scaDicaFixa;
        });
}

function _scaTipo(tipo) {
    _scaTipoAtual = tipo;
    _scaSelecaoAberta = false; // trocar de tipo recomeça pela visão geral, não pelo seletor
    _scaPintarTipo();
    _scaPreencherAlvo();
    _scaCarregarVisao(); // a visão geral acompanha o tipo escolhido
}

function _scaPintarTipo() {
    document.querySelectorAll("#sca-tipo .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.tipo === _scaTipoAtual));
    _scaPintarSelecao();
}

// O seletor é o caminho secundário: serve pra marcar vários clusters ou pra achar um grupo
// pelo nome. O caminho de todo dia é o botão "Conferir" da visão geral, então ele nasce
// fechado e o cartão de cima ocupa duas linhas em vez de meia tela.
let _scaSelecaoAberta = false;
let _scaDicaFixa = "";          // aviso de polo/erro que não pode ser sobrescrito pela dica normal
let _scaOpcoesCarregadas = false;

function _scaAlternarSelecao(forcar) {
    _scaSelecaoAberta = typeof forcar === "boolean" ? forcar : !_scaSelecaoAberta;
    _scaPintarSelecao();
}

function _scaPintarSelecao() {
    const aberto = _scaSelecaoAberta && !!_scaTipoAtual && !_scaVisaoRetrato;
    const btn = document.getElementById("sca-abrir");
    document.getElementById("sca-selecao").style.display = aberto ? "" : "none";
    btn.style.display = (_scaTipoAtual && !_scaVisaoRetrato) ? "" : "none";
    btn.classList.toggle("aberto", aberto);
    document.getElementById("sca-abrir-txt").innerText = aberto
        ? "Fechar"
        : (_scaTipoAtual === "cluster" ? "Conferir vários clusters" : "Escolher pela lista");
    _scaDicaPadrao();
}

function _scaDicaPadrao() {
    const dica = document.getElementById("sca-dica");
    if (_scaDicaFixa)          { dica.innerText = _scaDicaFixa; return; }
    if (_scaVisaoRetrato)      { dica.innerText = "Você está vendo um dia fechado. Volte para o dia atual na visão geral para conferir."; return; }
    if (!_scaTipoAtual)        { dica.innerText = "Escolha o tipo de conferência para começar."; return; }
    // Sem as opções na mão ainda, "Nenhum cluster na AT" seria mentira por um instante.
    if (!_scaOpcoesCarregadas) { dica.innerText = "Carregando as opções..."; return; }

    const cidade = _scaTipoAtual === "cidade";
    const lista  = cidade ? _scaOpcoes.cidades : _scaOpcoes.clusters;
    if (!lista.length) {
        dica.innerText = cidade
            ? "Nenhum pedido com cidade identificada. Alimente Pedidos pesquisados primeiro."
            : "Nenhum cluster na AT. Alimente a AT Exportada primeiro.";
    } else if (_scaSelecaoAberta) {
        dica.innerText = cidade
            ? "A cidade de cada pedido vem do CEP, cruzado com a planilha de CEPs."
            : "Marque um ou mais clusters — a conferência aceita todos de uma vez.";
    } else {
        dica.innerText = cidade
            ? "Clique em Conferir na linha da cidade que você vai conferir."
            : "Clique em Conferir na linha do cluster, ou abra a seleção para conferir vários de uma vez.";
    }
}

// Cluster aceita vários numa conferência só — é comum uma pessoa cobrir mais de um.
// Cidade continua uma por vez.
let _scaSelecionados = [];

function _scaPreencherAlvo() {
    const cidade = _scaTipoAtual === "cidade";
    document.getElementById("sca-alvo-label").innerText = cidade ? "Cidade" : "Clusters";
    const sel   = document.getElementById("sca-alvo");
    const multi = document.getElementById("sca-multi");
    const lista = cidade ? _scaOpcoes.cidades : _scaOpcoes.clusters;
    _scaSelecionados = [];

    sel.style.display = cidade ? "" : "none";
    document.getElementById("sca-multi-bloco").style.display = cidade ? "none" : "";

    // Os dois lados mostram o tamanho do trabalho: quantos pedidos naquela cidade, quantos
    // pacotes naquele cluster. Só entra na lista quem tem o que conferir.
    if (cidade) {
        sel.innerHTML = `<option value="">Selecione...</option>` + lista.map(o =>
            `<option value="${_scaEsc(o.cidade)}">${_scaEsc(o.cidade)} — ${o.pedidos} pedido${o.pedidos !== 1 ? "s" : ""}</option>`).join("");
    } else {
        // "pct" em vez de "pacotes" por extenso: o rótulo compete com o nome do cluster
        // numa coluna estreita, e o número é o que interessa.
        multi.innerHTML = lista.map(o => `
            <label class="sca-multi-item" data-cluster="${_scaEsc(o.cluster)}" title="${_scaEsc(o.cluster)} — ${o.pacotes} pacote${o.pacotes !== 1 ? "s" : ""}">
                <input type="checkbox" value="${_scaEsc(o.cluster)}" onchange="_scaAlvoMudou()">
                <span>${_scaEsc(o.cluster)}</span>
                <span class="sca-multi-qtd">${o.pacotes}</span>
            </label>`).join("");
    }

    _scaDicaPadrao();
    _scaAlvoMudou();
}

function _scaMarcarTodos(marcar) {
    document.querySelectorAll("#sca-multi input[type=checkbox]").forEach(c => { c.checked = marcar; });
    _scaAlvoMudou();
}

function _scaAlvoMudou() {
    if (_scaTipoAtual === "cidade") {
        const v = document.getElementById("sca-alvo").value;
        _scaSelecionados = v ? [v] : [];
    } else {
        const caixas = [...document.querySelectorAll("#sca-multi input[type=checkbox]")];
        _scaSelecionados = caixas.filter(c => c.checked).map(c => c.value);
        document.querySelectorAll("#sca-multi .sca-multi-item").forEach(l =>
            l.classList.toggle("marcado", _scaSelecionados.includes(l.dataset.cluster)));
        // Contagem fora da rolagem: com a lista compacta, o que está marcado pode estar
        // fora da parte visível.
        const resumo = document.getElementById("sca-multi-resumo");
        if (resumo) {
            resumo.innerText = caixas.length
                ? `${_scaSelecionados.length} de ${caixas.length} marcado${_scaSelecionados.length !== 1 ? "s" : ""}`
                : "Nenhum cluster na AT";
        }
    }
    const btn = document.getElementById("sca-btn-comecar");
    btn.style.display = _scaSelecionados.length ? "" : "none";
    // O botão diz quantos vão entrar: com vários marcados, "Começar" sozinho não deixaria
    // claro se a conferência é de um ou de todos.
    btn.textContent = _scaSelecionados.length > 1
        ? `Começar conferência (${_scaSelecionados.length} clusters)`
        : "Começar conferência";
}

function _scaComecar() {
    if (!_scaTipoAtual || !_scaSelecionados.length) return;
    const btn = document.getElementById("sca-btn-comecar");
    const rotulo = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Abrindo...";
    // Quando a conferência veio pelo botão da linha, é ele que precisa voltar ao normal
    // se der erro — o do seletor está escondido.
    const linha = _scaBotaoLinha;
    const restaurar = () => {
        btn.disabled = false;
        btn.textContent = rotulo;
        if (linha) { linha.disabled = false; linha.textContent = "Conferir"; }
        _scaBotaoLinha = null;
    };

    fetch(`${API}/shopee/conferencia/atribuicoes/sessao`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: _scaTipoAtual, alvos: _scaSelecionados })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        restaurar();
        if (!ok) return gcAlert(d.error || "Não foi possível abrir a conferência.");
        _scaSessao = d;
        _scaBipagens = [];
        _scaFiltroAtual = "todos";
        // Conferência já aberta é retomada, não recomeçada — carrega o que já foi bipado.
        if (d.reaproveitada) return _scaVerSessao(d.id, true, d.adicionados);
        _scaAbrirSessao();
    })
    .catch(() => {
        restaurar();
        gcAlert("Erro ao conectar com o servidor.");
    });
}

// Carrega o que o grupo tem e ainda não foi bipado. Vem do servidor porque a lista pode
// ser grande e sai do cruzamento com AT/Pedidos, que o navegador não tem.
function _scaCarregarFaltantes(silencioso) {
    if (!_scaSessao) return;
    if (!silencioso) {
        document.getElementById("sca-tbody").innerHTML =
            `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:26px 10px">Carregando...</td></tr>`;
    }
    fetch(`${API}/shopee/conferencia/atribuicoes/sessao/${_scaSessao.id}/faltantes`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) return;
        _scaFaltantes = d.faltantes || [];
        _scaTotalGrupo = d.total_grupo || 0;
        _scaFaltamTruncado = !!d.truncado;
        _scaFaltamCarregado = true;
        _scaRenderizar();
    })
    .catch(() => {});
}
let _scaFaltamTruncado = false;

function _scaAbrirSessao() {
    const s = _scaSessao;
    document.getElementById("sca-faixa-label").innerText = s.tipo === "cidade" ? "Conferindo cidade" : "Conferindo cluster";
    document.getElementById("sca-faixa-alvo").innerText = s.alvo;
    document.getElementById("sca-faixa-obs").innerText =
        `Aberta por ${s.usuario_nome || "—"}${s.encerrada_em ? " · encerrada" : ""}`;
    _scaMsg("", null);
    _scaFaltantes = [];
    _scaTotalGrupo = 0;
    _scaFaltamCarregado = false;
    _scaPintarAbas();
    _scaRenderizar();
    _scaMostrarAndamento();
    _scaCarregarFaltantes(true); // já entra sabendo quantos faltam
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
        if (d.resultado === "ok" && d.status_ok === false) {
            // Cidade certa, mas o pacote não deu entrada no hub. Apita como erro porque
            // também para a esteira — só que o motivo é outro, e a mensagem diz qual.
            _gcBeepErro(); _scaFlash("err");
            _scaMsg(`⚠ <strong>${_scaEsc(d.codigo)}</strong> é de ${_scaEsc(d.esperado)}, mas o status é <strong>${
                _scaEsc(d.status_pedido) || "—"}</strong> — ainda não foi recebido no hub.`, "aviso");
        } else if (d.resultado === "ok") {
            _gcBeepSucesso(); _scaFlash("ok");
            // O detalhe só vem preenchido quando o CEP está em mais de uma cidade — nesse
            // caso o bipe confere, mas a pessoa precisa saber que a planilha está ambígua.
            _scaMsg(`✓ <strong>${_scaEsc(d.codigo)}</strong> confere com <strong>${_scaEsc(d.esperado)}</strong>.${
                d.detalhe ? ` <span style="color:#eab308">${_scaEsc(d.detalhe)}</span>` : ""}`, "ok");
        } else {
            // Divergência e "não encontrado" apitam igual: os dois param a esteira.
            _gcBeepErro(); _scaFlash("err");
            // Divergência de grupo é o problema principal; o status entra como complemento
            // quando também estiver errado, pra pessoa não descobrir isso depois.
            const extraStatus = d.status_ok === false
                ? ` E o status é <strong>${_scaEsc(d.status_pedido) || "—"}</strong>, não recebido no hub.` : "";
            _scaMsg(d.resultado === "divergente"
                ? `⚠ <strong>${_scaEsc(d.codigo)}</strong> é de <strong>${_scaEsc(d.encontrado)}</strong>, não de ${_scaEsc(d.esperado)}.${extraStatus}`
                : `⚠ <strong>${_scaEsc(d.codigo)}</strong> — ${_scaEsc(d.detalhe || info.rotulo)}`,
                d.resultado === "divergente" ? "erro" : "aviso");
        }
        _scaBipagens.unshift(d);
        // Tira da lista de faltantes na hora, sem ida ao servidor: a cada bipe uma
        // consulta deixaria a bipagem em rajada lenta.
        const alvoCod = String(d.codigo || "").toUpperCase();
        _scaFaltantes = _scaFaltantes.filter(f => String(f.codigo || "").toUpperCase() !== alvoCod);
        _scaRenderizar();
    })
    .catch(() => { _gcBeepErro(); _scaMsg("Erro ao conectar com o servidor.", "erro"); });
}

function _scaFiltro(f) {
    _scaFiltroAtual = f;
    _scaPintarAbas();
    // Recarrega ao abrir a aba: outra pessoa pode ter bipado no mesmo grupo enquanto isso.
    if (f === "faltam") return _scaCarregarFaltantes(_scaFaltamCarregado);
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
    // Pacote que chegou ao grupo certo mas não deu entrada no hub. Independe do resultado
    // da cidade — pode estar no grupo certo e ainda assim ser anomalia.
    const statusPend = _scaBipagens.filter(b => b.status_ok === false).length;
    const faltam = _scaFaltantes.length;
    // Progresso do GRUPO, não da sessão: o que interessa é quanto do cluster/cidade já
    // passou, e "12 bipados" sozinho não diz se acabou.
    const conferidos = Math.max(0, _scaTotalGrupo - faltam);
    // Cada lado sai da própria divisão, não de "100 menos o outro" — senão a correção de
    // ponta feita num deles apareceria invertida no outro.
    const pct = _scaPct(conferidos, _scaTotalGrupo);
    const pctFalta = _scaPct(faltam, _scaTotalGrupo);
    _scaBarra(pct, pctFalta, conferidos, faltam);

    document.getElementById("sca-resumo").innerHTML =
        card("Bipados", total, _scaSessao ? _scaSessao.alvo : "") +
        card("Conferem", ok, "no grupo certo", ok ? "#22c55e" : null) +
        card("Grupo errado", div, "não são daqui", div ? "#ef4444" : null) +
        card("Sem dado", semD, "não deu pra conferir", semD ? "#eab308" : null) +
        card("Status pendente", statusPend, "não recebidos no hub", statusPend ? "#eab308" : null) +
        card("Faltam bipar",
             _scaFaltamCarregado ? `${faltam}${pctFalta !== null ? ` <span class="shr-pct">${_scaPctTexto(pctFalta)}</span>` : ""}` : "—",
             _scaTotalGrupo ? `de ${_scaTotalGrupo} no grupo` : "no grupo",
             faltam ? "#eab308" : (_scaFaltamCarregado ? "#22c55e" : null));

    // As abas contam sozinhas: sem isso a pessoa teria que contar linha pra saber
    // quantas divergências apareceram.
    const abas = document.querySelectorAll("#sca-abas .filtro-tab");
    if (abas[0]) abas[0].innerText = `Todos ${total}`;
    if (abas[1]) abas[1].innerText = `Divergentes ${div}`;
    if (abas[2]) abas[2].innerText = `Sem dado ${semD}`;
    if (abas[3]) abas[3].innerText = `Status pendente ${statusPend}`;
    if (abas[4]) abas[4].innerText = `Faltam bipar${_scaFaltamCarregado ? " " + faltam : ""}`;

    const btnCopiar = document.getElementById("sca-btn-copiar");
    if (btnCopiar) btnCopiar.textContent = _scaFiltroAtual === "faltam" ? "Copiar faltantes" : "Copiar divergentes";

    if (_scaFiltroAtual === "faltam") return _scaRenderFaltantes();

    document.getElementById("sca-thead").innerHTML =
        `<tr><th>Código</th><th>Resultado</th><th>Esperado</th><th>Encontrado</th><th>Hora</th></tr>`;

    let lista = _scaBipagens;
    if (_scaFiltroAtual === "divergente") lista = lista.filter(b => b.resultado === "divergente");
    if (_scaFiltroAtual === "sem_dado")   lista = lista.filter(b => !["ok", "divergente"].includes(b.resultado));
    if (_scaFiltroAtual === "status")     lista = lista.filter(b => b.status_ok === false);

    document.getElementById("sca-tbody").innerHTML = lista.length ? lista.map(b => {
        const info = SCA_RESULTADOS[b.resultado] || { rotulo: b.resultado, cor: "#eab308" };
        // Código em amarelo quando o pedido não deu entrada no hub — a cor é do CÓDIGO, e
        // não da linha, porque a linha já usa cor pra dizer se o grupo está certo.
        const statusRuim = b.status_ok === false;
        const apoio = [
            b.cep ? `CEP ${_scaEsc(b.cep)}` : "",
            b.status_pedido ? `<span${statusRuim ? ' style="color:#eab308;font-weight:700"' : ""}>${_scaEsc(b.status_pedido)}</span>` : "",
        ].filter(Boolean).join(" · ");
        return `
        <tr${b.resultado === "divergente" ? ' style="background:rgba(239,68,68,0.06)"' : ""}>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:${statusRuim ? "#eab308" : "#e2e8f0"}">${_scaEsc(b.codigo)}
                ${apoio ? `<div style="font-size:11px;color:#8494a9;font-family:'Inter',sans-serif;font-weight:400">${apoio}</div>` : ""}</td>
            <td data-label="Resultado"><span style="color:${info.cor};font-weight:700">${info.rotulo}</span></td>
            <td data-label="Esperado" style="color:#8494a9">${_scaEsc(b.esperado) || "—"}</td>
            <td data-label="Encontrado" style="color:${b.resultado === "divergente" ? "#ef4444" : "#8494a9"};font-weight:${b.resultado === "divergente" ? 700 : 400}">${_scaEsc(b.encontrado) || "—"}</td>
            <td data-label="Hora" style="color:#8494a9">${_scaEsc(b.data_hora_brasilia) || "—"}</td>
        </tr>`;
    }).join("")
        : `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:26px 10px">${
            total ? "Nada nesse filtro." : "Nenhum pacote bipado ainda."}</td></tr>`;
}

// Verde só em 100% de verdade: grupo em 99,6% ainda tem pacote pra achar, e pintar de
// verde faria alguém parar de procurar.
function _scaCorPct(pct) {
    return pct >= 100 ? "#22c55e" : pct > 0 ? "#eab308" : "#ef4444";
}

// Porcentagem exata: duas casas sempre, menos em 0% e 100%, que não precisam. Arredondar
// para inteiro escondia progresso real — 2 de 455 virava "0%".
// Definida aqui, e não importada de outro arquivo: uma referência a função de fora no topo
// do módulo derruba o arquivo inteiro se aquele outro estiver em cache antigo.
function _scaPct(parte, total) {
    if (!total) return null;
    return (Number(parte) / Number(total)) * 100;
}

function _scaPctTexto(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return "—";
    if (pct >= 100) return "100%";
    if (pct <= 0)   return "0%";
    return pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

// Barra de conclusão, acima do campo de bipagem. Mostra o quanto fechou e o quanto falta
// pra 100% — os dois, porque a pergunta na esteira vem das duas formas.
function _scaBarra(pct, pctFalta, conferidos, faltam) {
    const bloco = document.getElementById("sca-progresso");
    if (!_scaFaltamCarregado || pct === null) { bloco.style.display = "none"; return; }
    bloco.style.display = "";
    const cor = _scaCorPct(pct);
    const el = document.getElementById("sca-prog-pct");
    el.innerText = _scaPctTexto(pct);
    el.style.color = cor;
    document.getElementById("sca-prog-obs").innerText = faltam
        ? `${conferidos} de ${_scaTotalGrupo} conferidos · faltam ${_scaPctTexto(pctFalta)} (${faltam})`
        : `${conferidos} de ${_scaTotalGrupo} conferidos · grupo completo`;
    // A barra usa a fração real: com pouca coisa conferida ela mostra um fiapo em vez de
    // sumir, que é o que confirma na tela que a bipagem está entrando.
    const barra = document.getElementById("sca-prog-barra");
    const frac = _scaTotalGrupo ? (conferidos / _scaTotalGrupo) * 100 : 0;
    barra.style.width = (conferidos && frac < 1 ? 1 : Math.min(100, frac)) + "%";
    barra.style.background = cor;
}

// ── Visão geral: todos os grupos e quanto de cada um já fechou ──
// O servidor guarda um retrato por dia, então dá pra voltar. Dia vazio = o dia corrente dos
// dados, o único calculado ao vivo — nos outros a AT já foi substituída e só resta o retrato.
// "Corrente" não é a data de hoje: se a AT de hoje ainda não entrou, o dia dos dados é o da
// última importação.
let _scaVisao = [];
let _scaVisaoDia = "";      // "" = dia corrente dos dados
let _scaVisaoAtual = "";
let _scaVisaoRetrato = false;

function _scaTrocarDiaVisao(dia) {
    _scaVisaoDia = dia === _scaVisaoAtual ? "" : dia;
    _scaCarregarVisao();
}

function _scaCarregarVisao() {
    const tipo = _scaTipoAtual || "cluster";
    const bloco = document.getElementById("sca-visao");
    const empty = document.getElementById("sca-visao-empty");
    const result = document.getElementById("sca-visao-resultado");
    bloco.style.display = "";
    document.getElementById("sca-visao-titulo").innerText =
        tipo === "cidade" ? "Visão geral das cidades" : "Visão geral dos clusters";
    document.getElementById("sca-visao-col").innerText = tipo === "cidade" ? "Cidade" : "Cluster";
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    const q = _scaVisaoDia ? `&dia=${encodeURIComponent(_scaVisaoDia)}` : "";
    fetch(`${API}/shopee/conferencia/atribuicoes/visao-geral?tipo=${tipo}${q}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) { skFim(empty, d.error); return; }
        if (d.sem_polo)     { skFim(empty, "Defina o seu polo para ver a conferência."); return; }
        if (d.polo_sem_xpt) { skFim(empty, "Este polo não recebe Shopee."); return; }
        _scaVisaoAtual = d.dia_atual || "";
        _scaVisaoRetrato = !!d.retrato;
        _scaEntregadores = d.entregadores || {};
        _scaRenderDiasVisao(d.dias || [], d.dia);
        _scaVisao = d.grupos || [];
        _scaRenderVisao(tipo);
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// Lista de dias com retrato guardado. O dia corrente é o único que ainda muda, por isso vem
// marcado — sem isso a pessoa olha um dia fechado achando que está vendo o de agora.
function _scaRenderDiasVisao(dias, atual) {
    const sel = document.getElementById("sca-visao-dia");
    if (!sel) return;
    sel.innerHTML = dias.map(d => {
        const br = d.split("-").reverse().join("/");
        return `<option value="${_scaEsc(d)}"${d === atual ? " selected" : ""}>${d === _scaVisaoAtual ? `Atual · ${br}` : br}</option>`;
    }).join("");
    sel.value = atual || _scaVisaoAtual;
    document.getElementById("sca-visao-retrato").style.display = _scaVisaoRetrato ? "" : "none";
    // O seletor de grupo não serve num dia fechado — recolhe e a dica avisa o porquê.
    if (_scaVisaoRetrato) _scaSelecaoAberta = false;
    _scaPintarSelecao();
}

function _scaRenderVisao(tipo) {
    const empty  = document.getElementById("sca-visao-empty");
    const result = document.getElementById("sca-visao-resultado");
    if (!_scaVisao.length) {
        skFim(empty, _scaVisaoRetrato
            ? "Nenhum retrato guardado para este dia."
            : (tipo === "cidade"
                ? "Nenhuma cidade com pedidos. Alimente Pedidos pesquisados primeiro."
                : "Nenhum cluster na AT. Alimente a AT Exportada primeiro."));
        return;
    }
    empty.style.display = "none";
    result.style.display = "";
    // Cidade não tem entregador, então a coluna some junto com as células.
    const thEnt = document.getElementById("sca-visao-th-ent");
    if (thEnt) thEnt.style.display = tipo === "cluster" ? "" : "none";
    // Copiar só faz sentido no dia aberto: dia fechado não recebe atribuição nova.
    const btnCopiar = document.getElementById("sca-copiar-ent");
    if (btnCopiar) {
        const faltaAlguem = _scaVisao.some(g => !_scaEntregadores[_scaChave(g.grupo)]);
        btnCopiar.style.display = (tipo === "cluster" && !_scaVisaoRetrato && faltaAlguem) ? "" : "none";
    }

    // Total geral no cabeçalho: é a resposta pra "estamos perto de fechar o dia?".
    const total = _scaVisao.reduce((a, g) => a + g.total, 0);
    const conf  = _scaVisao.reduce((a, g) => a + g.conferidos, 0);
    const pctGeral = _scaPct(conf, total) ?? 0;
    const completos = _scaVisao.filter(g => g.conferidos >= g.total).length;
    document.getElementById("sca-visao-obs").innerHTML =
        `<strong style="color:${_scaCorPct(pctGeral)}">${_scaPctTexto(pctGeral)}</strong> no total · ${conf} de ${total} · ${completos} de ${_scaVisao.length} fechado${completos !== 1 ? "s" : ""}`;

    // Dia fechado não tem "Conferir": a AT daquele dia já foi substituída, e abrir sessão
    // dali cairia em cima da AT de hoje conferindo pacote errado.
    document.getElementById("sca-visao-tbody").innerHTML = _scaVisao.map(g => {
        const pct = _scaPct(g.conferidos, g.total) ?? 0;
        const falta = g.total - g.conferidos;
        const pctFalta = _scaPct(falta, g.total);
        const cor = _scaCorPct(pct);
        const frac = g.total ? (g.conferidos / g.total) * 100 : 0;
        const nomeEsc = String(g.grupo || "").replace(/'/g, "\\'");
        return `
        <tr>
            <td data-label="${tipo === "cidade" ? "Cidade" : "Cluster"}" style="font-weight:700;color:#e2e8f0">${_scaEsc(g.grupo)}</td>
            <td data-label="Conclusão" style="min-width:150px">
                <div class="slh-pct" style="color:${cor}">${_scaPctTexto(pct)}${falta ? ` <span style="font-size:11px;font-weight:600;color:#8494a9">falta ${_scaPctTexto(pctFalta)}</span>` : ""}</div>
                <div class="slh-barra"><div class="slh-barra-fill" style="width:${g.conferidos && frac < 1 ? 1 : Math.min(100, frac)}%;background:${cor}"></div></div>
            </td>
            <td data-label="Total" style="font-variant-numeric:tabular-nums">${g.total}</td>
            <td data-label="Conferidos" style="font-variant-numeric:tabular-nums;color:#22c55e">${g.conferidos}</td>
            <td data-label="Faltam" style="font-variant-numeric:tabular-nums;color:${falta ? "#eab308" : "#8494a9"};font-weight:${falta ? 700 : 400}">${falta}</td>
            ${tipo === "cluster" ? `<td data-label="Entregador">${_scaCelulaEntregador(g.grupo, nomeEsc)}</td>` : ""}
            <td>${_scaVisaoRetrato ? "" : `<button class="adm-usr-action senha" onclick="_scaComecarDaVisao('${nomeEsc}', this)">Conferir</button>`}</td>
        </tr>`;
    }).join("");
}

// ── Entregador responsável por cluster ──
// Fica na visão geral porque é ali que se olha cluster por cluster. Quando falta pacote,
// a primeira pergunta é "de quem é esse cluster?" — e a resposta tinha que sair de fora
// do sistema, na memória de alguém.
let _scaEntregadores = {};   // chave normalizada do cluster -> { id, nome }
let _scaListaEntregadores = null;
let _scaClusterEditando = null;

function _scaChave(v) {
    return String(v || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function _scaCelulaEntregador(grupo, nomeEsc) {
    const e = _scaEntregadores[_scaChave(grupo)];
    // Dia fechado é registro: mostra quem saiu naquele dia, sem deixar reescrever.
    if (_scaVisaoRetrato) {
        return e && e.nome
            ? `<span style="font-size:12px;color:#93c5fd">${_scaEsc(e.nome)}</span>`
            : `<span style="font-size:12px;color:#5c6b80">—</span>`;
    }
    if (e && e.nome) {
        return `<button class="sca-entregador definido" onclick="_scaAbrirEntregador('${nomeEsc}')" title="Trocar o entregador de ${_scaEsc(grupo)} hoje">${_scaEsc(e.nome)}</button>`;
    }
    return `<button class="sca-entregador" onclick="_scaAbrirEntregador('${nomeEsc}')" title="Definir o entregador de ${_scaEsc(grupo)} hoje">+ atribuir</button>`;
}

// Repetir o dia anterior. A atribuição é diária, mas na prática muda pouco — o que muda são
// os clusters de quem faltou. Copiar e ajustar é bem mais rápido que preencher tudo de novo.
function _scaCopiarEntregadores() {
    gcConfirm(
        "Repetir as atribuições do último dia que teve entregadores?\n\nQuem já foi atribuído hoje não é alterado — a cópia só preenche os clusters que ainda estão vazios.",
        () => {
            const btn = document.getElementById("sca-copiar-ent");
            const rotulo = btn ? btn.textContent : "";
            if (btn) { btn.disabled = true; btn.textContent = "Copiando..."; }
            fetch(`${API}/shopee/conferencia/atribuicoes/entregador/copiar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (btn) { btn.disabled = false; btn.textContent = rotulo; }
                if (!ok) return gcAlert(d.error || "Não foi possível copiar.");
                if (!d.copiados) return gcAlert("Nada a copiar: todos os clusters já têm entregador hoje.");
                gcAlert(`${d.copiados} cluster${d.copiados !== 1 ? "s" : ""} preenchido${d.copiados !== 1 ? "s" : ""} com as atribuições de ${d.de.split("-").reverse().join("/")}.`);
                _scaCarregarVisao();
            })
            .catch(() => {
                if (btn) { btn.disabled = false; btn.textContent = rotulo; }
                gcAlert("Erro ao conectar com o servidor.");
            });
        }, "Repetir dia anterior", "Repetir");
}

function _scaAbrirEntregador(cluster) {
    _scaClusterEditando = cluster;
    document.getElementById("sca-ent-cluster").innerText = cluster;
    document.getElementById("sca-ent-erro").style.display = "none";
    _abrirModal("modal-sca-entregador");

    const sel = document.getElementById("sca-ent-select");
    const atual = _scaEntregadores[_scaChave(cluster)];
    // Botão de remover só aparece se há o que remover.
    document.getElementById("sca-ent-remover").style.display = atual ? "" : "none";

    const preencher = () => {
        sel.innerHTML = `<option value="">Selecione o entregador...</option>` +
            _scaListaEntregadores.map(e =>
                `<option value="${_scaEsc(e.nome)}" data-id="${_scaEsc(e.id)}">${_scaEsc(e.nome)}</option>`).join("");
        if (atual) sel.value = atual.nome;
    };
    if (_scaListaEntregadores) return preencher();

    sel.innerHTML = `<option>Carregando...</option>`;
    fetch(`${API}/etiquetas/entregadores`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(lista => {
            _scaListaEntregadores = Array.isArray(lista) ? lista : [];
            preencher();
        })
        .catch(() => { sel.innerHTML = `<option value="">Erro ao carregar a lista</option>`; });
}

function _scaSalvarEntregador(remover) {
    const sel = document.getElementById("sca-ent-select");
    const nome = remover ? "" : sel.value;
    const opt  = sel.selectedOptions[0];
    const id   = remover ? "" : (opt ? opt.dataset.id || "" : "");
    if (!remover && !nome) {
        const erro = document.getElementById("sca-ent-erro");
        erro.innerText = "Escolha um entregador.";
        erro.style.display = "";
        return;
    }
    const btn = document.getElementById(remover ? "sca-ent-remover" : "sca-ent-salvar");
    const rotulo = btn.textContent;
    btn.disabled = true;
    btn.textContent = remover ? "Removendo..." : "Salvando...";

    fetch(`${API}/shopee/conferencia/atribuicoes/entregador`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        // Manda o dia que está na tela: se ele não for o dia atual, o servidor recusa em vez
        // de gravar em cima do registro de outro dia.
        body: JSON.stringify({ cluster: _scaClusterEditando, dia: _scaVisaoDia || _scaVisaoAtual, entregador_nome: nome, entregador_id: id })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        btn.disabled = false;
        btn.textContent = rotulo;
        if (!ok) {
            const erro = document.getElementById("sca-ent-erro");
            erro.innerText = d.error || "Não foi possível salvar.";
            erro.style.display = "";
            return;
        }
        const chave = _scaChave(_scaClusterEditando);
        if (nome) _scaEntregadores[chave] = { id, nome };
        else delete _scaEntregadores[chave];
        _fecharModal("modal-sca-entregador");
        _scaRenderVisao(_scaTipoAtual || "cluster");
    })
    .catch(() => {
        btn.disabled = false;
        btn.textContent = rotulo;
        const erro = document.getElementById("sca-ent-erro");
        erro.innerText = "Erro ao conectar com o servidor.";
        erro.style.display = "";
    });
}

// Atalho da visão geral: já entra na conferência daquele grupo, sem passar pelo seletor.
// É o caminho principal da tela. Sempre um grupo só — quem quer vários abre a seleção.
let _scaBotaoLinha = null;

function _scaComecarDaVisao(nome, botao) {
    if (_scaVisaoRetrato) return; // dia fechado: o botão nem é desenhado, mas não custa travar
    if (!_scaTipoAtual) _scaTipoAtual = "cluster";
    _scaSelecionados = [nome];
    _scaPintarTipo();
    // O botão da linha é o único retorno visual daqui: sem isso a pessoa clica de novo
    // achando que não pegou.
    if (botao) { botao.disabled = true; botao.textContent = "Abrindo..."; }
    _scaBotaoLinha = botao || null;
    _scaComecar();
}

// Faltantes: o cluster/cidade tem esses pacotes e eles ainda não passaram pela bipagem.
// É a metade que a conferência não enxergava — divergência mostra o que veio errado,
// isto mostra o que não veio.
function _scaRenderFaltantes() {
    const cidade = _scaSessao && _scaSessao.tipo === "cidade";
    document.getElementById("sca-thead").innerHTML = cidade
        ? `<tr><th>Código</th><th>Comprador</th><th>CEP</th><th>Motorista</th><th>Status</th></tr>`
        : `<tr><th>Código</th><th>AT</th><th>Motorista</th><th>Cidade / Bairro</th><th>Status</th></tr>`;

    const tbody = document.getElementById("sca-tbody");
    if (!_scaFaltamCarregado) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:26px 10px">Carregando...</td></tr>`;
        return;
    }
    if (!_scaFaltantes.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#22c55e;padding:26px 10px;font-weight:600">${
            _scaTotalGrupo ? "Tudo bipado — não falta nenhum pacote deste grupo." : "O grupo não tem pacotes cadastrados."}</td></tr>`;
        return;
    }
    tbody.innerHTML = _scaFaltantes.map(f => cidade ? `
        <tr>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_scaEsc(f.codigo)}</td>
            <td data-label="Comprador">${_scaEsc(f.buyer_nome) || "—"}</td>
            <td data-label="CEP" style="color:#8494a9">${_scaEsc(f.zipcode_name) || "—"}
                ${f.qtd_cidades > 1
                    ? `<div style="font-size:11px;color:#eab308;font-weight:600" title="Esse CEP está cadastrado em mais de uma cidade na planilha">⚠ ${_scaEsc(f.cidades_cep)}</div>`
                    : f.cidade_cep ? `<div style="font-size:11px;color:#8494a9">${_scaEsc(f.cidade_cep)}</div>` : ""}</td>
            <td data-label="Motorista">${_scaEsc(f.driver_nome) || "—"}</td>
            <td data-label="Status" style="color:#8494a9">${_scaEsc(f.status) || "—"}</td>
        </tr>` : `
        <tr>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_scaEsc(f.codigo)}</td>
            <td data-label="AT" style="font-family:monospace">${_scaEsc(f.task_id) || "—"}</td>
            <td data-label="Motorista">${_scaEsc(f.driver_nome) || "—"}</td>
            <td data-label="Cidade / Bairro">${_scaEsc(f.cidade) || "—"}${f.bairro ? `<div style="font-size:11px;color:#8494a9">${_scaEsc(f.bairro)}</div>` : ""}</td>
            <td data-label="Status" style="color:#8494a9">${_scaEsc(f.status) || "—"}</td>
        </tr>`).join("") + (_scaFaltamTruncado
        ? `<tr><td colspan="5" style="text-align:center;color:#eab308;padding:14px">Mostrando os primeiros ${_scaFaltantes.length} — o grupo tem mais que isso.</td></tr>`
        : "");
}

// Copia o que a aba aberta mostra: divergentes pra separação corrigir, faltantes pra
// procurar no galpão. São as duas listas que saem da tela pra alguém agir.
function _scaCopiar() {
    if (_scaFiltroAtual === "faltam") {
        if (!_scaFaltantes.length) return gcAlert("Nenhum pacote faltando nesta conferência.");
        const texto = _scaFaltantes.map(f => f.codigo).join("\n");
        return navigator.clipboard.writeText(texto)
            .then(() => _scaMsg(`${_scaFaltantes.length} código${_scaFaltantes.length !== 1 ? "s" : ""} que falta${_scaFaltantes.length !== 1 ? "m" : ""} copiado${_scaFaltantes.length !== 1 ? "s" : ""}.`, "aviso"))
            .catch(() => gcAlert("Não foi possível copiar."));
    }
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

// ── Filtro do histórico: período e busca ──
// Mesmo calendário de intervalo das outras telas. Sem modo "um dia" separado: clicar numa
// data só e aplicar já é um dia, porque de e até saem iguais.
const SCA_CAL_DOW   = ["D", "S", "T", "Q", "Q", "S", "S"];
const SCA_CAL_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                       "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
let _scaHistDe = "", _scaHistAte = "", _scaHistBuscaTimer = null;
let _scaCalIni = null, _scaCalFim = null, _scaCalMes = null;

const _scaFmtData   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _scaParseData = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const _scaDataBr    = s => s ? s.split("-").reverse().join("/") : "";

function _scaHistAbrirCal() {
    const cal = document.getElementById("sca-hist-cal");
    const abrir = cal.style.display === "none";
    cal.style.display = abrir ? "" : "none";
    if (!abrir) return;
    _scaCalIni = _scaHistDe ? _scaParseData(_scaHistDe) : null;
    _scaCalFim = _scaHistAte ? _scaParseData(_scaHistAte) : null;
    _scaCalMes = new Date(_scaCalIni || new Date());
    _scaCalMes.setDate(1);
    _scaCalRender();
}

function _scaCalMesAnterior() { _scaCalMes.setMonth(_scaCalMes.getMonth() - 1); _scaCalRender(); }
function _scaCalMesProximo()  { _scaCalMes.setMonth(_scaCalMes.getMonth() + 1); _scaCalRender(); }

function _scaCalClick(dataStr) {
    const d = _scaParseData(dataStr);
    if (!_scaCalIni || _scaCalFim) { _scaCalIni = d; _scaCalFim = null; }
    else if (d < _scaCalIni)       { _scaCalFim = _scaCalIni; _scaCalIni = d; }
    else                           { _scaCalFim = d; }
    _scaCalRender();
    // Com as duas pontas escolhidas já aplica: obrigar um "confirmar" seria um clique a
    // mais pra fazer o que a pessoa acabou de dizer que queria.
    if (_scaCalIni && _scaCalFim) _scaHistAplicarPeriodo();
}

function _scaCalRender() {
    const ano = _scaCalMes.getFullYear(), mesIdx = _scaCalMes.getMonth();
    const primeiro = new Date(ano, mesIdx, 1).getDay();
    const dias = new Date(ano, mesIdx + 1, 0).getDate();
    const celIni = new Date(ano, mesIdx, 1 - primeiro);
    const total = Math.ceil((primeiro + dias) / 7) * 7;
    const ini = _scaCalIni, fim = _scaCalFim;

    let grid = "";
    for (let i = 0; i < total; i++) {
        const dia = new Date(celIni);
        dia.setDate(celIni.getDate() + i);
        let cls = "ped-cal-day" + (dia.getMonth() !== mesIdx ? " outro-mes" : "");
        if (ini && fim) {
            const t = dia.getTime();
            if (t === ini.getTime() && t === fim.getTime()) cls += " intervalo-unico";
            else if (t === ini.getTime()) cls += " intervalo-inicio";
            else if (t === fim.getTime()) cls += " intervalo-fim";
            else if (t > ini.getTime() && t < fim.getTime()) cls += " no-intervalo";
        } else if (ini && dia.getTime() === ini.getTime()) cls += " intervalo-unico";
        grid += `<div class="${cls}" onclick="_scaCalClick('${_scaFmtData(dia)}')">${dia.getDate()}</div>`;
    }
    const texto = !ini ? "Clique na data"
        : !fim ? `${ini.toLocaleDateString("pt-BR")} — clique de novo para um período`
        : ini.getTime() === fim.getTime() ? ini.toLocaleDateString("pt-BR")
        : `${ini.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`;

    document.getElementById("sca-hist-cal").innerHTML = `
        <div class="ped-cal-header">
            <button type="button" class="ped-cal-nav" onclick="_scaCalMesAnterior()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span>${SCA_CAL_MESES[mesIdx]} ${ano}</span>
            <button type="button" class="ped-cal-nav" onclick="_scaCalMesProximo()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>
        <div class="ped-cal-grid">${SCA_CAL_DOW.map(d => `<div class="ped-cal-dow">${d}</div>`).join("")}${grid}</div>
        <div class="ped-cal-footer"><span class="ped-cal-range-txt">${texto}</span></div>`;
}

function _scaHistAplicarPeriodo() {
    _scaHistDe  = _scaCalIni ? _scaFmtData(_scaCalIni) : "";
    _scaHistAte = _scaFmtData(_scaCalFim || _scaCalIni);
    document.getElementById("sca-hist-cal").style.display = "none";
    _scaPintarFiltroHist();
    _scaCarregarHistorico();
}

function _scaHistLimpar() {
    _scaHistDe = ""; _scaHistAte = "";
    _scaCalIni = null; _scaCalFim = null;
    document.getElementById("sca-hist-busca").value = "";
    document.getElementById("sca-hist-cal").style.display = "none";
    _scaPintarFiltroHist();
    _scaCarregarHistorico();
}

function _scaPintarFiltroHist() {
    const btn = document.getElementById("sca-hist-periodo");
    btn.textContent = _scaHistDe
        ? (_scaHistDe === _scaHistAte ? _scaDataBr(_scaHistDe) : `${_scaDataBr(_scaHistDe)} — ${_scaDataBr(_scaHistAte)}`)
        : "Qualquer data";
    const temFiltro = !!_scaHistDe || !!(document.getElementById("sca-hist-busca")?.value || "").trim();
    document.getElementById("sca-hist-limpar").style.display = temFiltro ? "" : "none";
}

function _scaHistBuscar() {
    // Espera a digitação parar: a busca é no servidor.
    clearTimeout(_scaHistBuscaTimer);
    _scaHistBuscaTimer = setTimeout(() => { _scaPintarFiltroHist(); _scaCarregarHistorico(); }, 350);
}

// ── Conferências anteriores ──
function _scaCarregarHistorico() {
    const empty  = document.getElementById("sca-hist-empty");
    const result = document.getElementById("sca-hist-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    const qs = new URLSearchParams();
    if (_scaHistDe)  qs.set("de", _scaHistDe);
    if (_scaHistAte) qs.set("ate", _scaHistAte);
    const busca = (document.getElementById("sca-hist-busca")?.value || "").trim();
    if (busca) qs.set("busca", busca);

    fetch(`${API}/shopee/conferencia/atribuicoes/sessoes?${qs}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                skFim(empty, (_scaHistDe || busca)
                    ? "Nenhuma conferência nesse filtro."
                    : "Nenhuma conferência ainda.");
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("sca-hist-tbody").innerHTML = rows.map(s => {
                // Conclusão do GRUPO por essa conferência: quantos dos pacotes do
                // cluster/cidade ela conferiu. Sem o total do grupo não há o que calcular.
                const pct = s.total_grupo ? _scaPct(s.ok, s.total_grupo) : null;
                const cor = pct === null ? "#8494a9" : _scaCorPct(pct);
                const frac = s.total_grupo ? (s.ok / s.total_grupo) * 100 : 0;
                return `
                <tr>
                    <td data-label="Conferência">
                        <div style="font-weight:700;color:#e2e8f0">${_scaEsc(s.alvo)}</div>
                        <div style="font-size:11px;color:#8494a9">${s.tipo === "cidade" ? "Cidade" : "Cluster"}${s.encerrada_em ? "" : " · em aberto"}</div>
                    </td>
                    <td data-label="Conclusão" style="min-width:130px">
                        <div class="slh-pct" style="color:${cor}">${pct === null ? "—" : _scaPctTexto(pct)}</div>
                        ${pct === null ? "" : `<div class="slh-barra"><div class="slh-barra-fill" style="width:${
                            s.ok && frac < 1 ? 1 : Math.min(100, frac)}%;background:${cor}"></div></div>
                        <div style="font-size:11px;color:#8494a9;margin-top:4px">${s.ok} de ${s.total_grupo}</div>`}
                    </td>
                    <td data-label="Bipados" style="font-variant-numeric:tabular-nums">${s.total}</td>
                    <td data-label="OK" style="font-variant-numeric:tabular-nums;color:#22c55e">${s.ok}</td>
                    <td data-label="Divergentes" style="font-variant-numeric:tabular-nums;color:${s.divergentes ? "#ef4444" : "#8494a9"};font-weight:${s.divergentes ? 700 : 400}">${s.divergentes}</td>
                    <td data-label="Sem dado" style="font-variant-numeric:tabular-nums;color:${s.sem_dado ? "#eab308" : "#8494a9"}">${s.sem_dado}</td>
                    <td data-label="Quem / quando">${_scaEsc(s.usuario_nome) || "—"}
                        <div style="font-size:11px;color:#8494a9">${new Date(s.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div></td>
                    <td><button class="adm-usr-action senha" onclick="_scaVerSessao(${s.id})">${s.encerrada_em ? "Ver" : "Continuar"}</button></td>
                </tr>`;
            }).join("");
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _scaVerSessao(id, retomada, adicionados) {
    fetch(`${API}/shopee/conferencia/atribuicoes/sessao/${id}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) return gcAlert(d.error);
            _scaSessao = d.sessao;
            _scaBipagens = d.bipagens || [];
            _scaFiltroAtual = "todos";
            _scaAbrirSessao();
            // Deixa claro que não começou do zero: os números já vêm preenchidos, e sem
            // aviso pareceria que a conferência anterior sumiu. Também avisa quando a
            // conferência aberta cobre mais grupos do que a pessoa acabou de escolher.
            if (!retomada) return;
            const partes = [];
            if (_scaBipagens.length) {
                partes.push(`Continuando a conferência de <strong>${_scaEsc(d.sessao.alvo)}</strong> que já estava aberta — ${
                    _scaBipagens.length} pacote${_scaBipagens.length !== 1 ? "s" : ""} já bipado${_scaBipagens.length !== 1 ? "s" : ""}.`);
            } else {
                partes.push(`Continuando a conferência de <strong>${_scaEsc(d.sessao.alvo)}</strong> que já estava aberta.`);
            }
            if (adicionados && adicionados.length) {
                partes.push(`<strong>${_scaEsc(adicionados.join(", "))}</strong> ${
                    adicionados.length !== 1 ? "foram somados" : "foi somado"} a ela.`);
            }
            _scaMsg(partes.join(" "), "aviso");
        })
        .catch(() => gcAlert("Erro ao abrir a conferência."));
}
