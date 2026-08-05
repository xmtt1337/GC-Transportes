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
    _scaCarregarVisao(); // a visão geral acompanha o tipo escolhido
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
    if (abas[3]) abas[3].innerText = `Faltam bipar${_scaFaltamCarregado ? " " + faltam : ""}`;

    const btnCopiar = document.getElementById("sca-btn-copiar");
    if (btnCopiar) btnCopiar.textContent = _scaFiltroAtual === "faltam" ? "Copiar faltantes" : "Copiar divergentes";

    if (_scaFiltroAtual === "faltam") return _scaRenderFaltantes();

    document.getElementById("sca-thead").innerHTML =
        `<tr><th>Código</th><th>Resultado</th><th>Esperado</th><th>Encontrado</th><th>Hora</th></tr>`;

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

// Verde só em 100% de verdade: grupo em 99,6% ainda tem pacote pra achar, e pintar de
// verde faria alguém parar de procurar.
function _scaCorPct(pct) {
    return pct >= 100 ? "#22c55e" : pct > 0 ? "#eab308" : "#ef4444";
}

// Porcentagem que não mente nas pontas. Arredondar direto faz 2 de 455 virar "0%" (como
// se nada tivesse sido feito) e 453 de 455 virar "100%" (como se tivesse acabado). Perto
// de 0 e de 100 a casa decimal entra; no meio, inteiro basta.
function _scaPct(parte, total) {
    if (!total) return null;
    const v = (parte / total) * 100;
    if (v > 0 && v < 1)     return Math.round(v * 10) / 10;   // 0,4% em vez de 0%
    if (v > 99 && v < 100)  return Math.round(v * 10) / 10;   // 99,6% em vez de 100%
    return Math.round(v);
}

function _scaPctTexto(pct) {
    return pct === null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
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
let _scaVisao = [];

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

    fetch(`${API}/shopee/conferencia/atribuicoes/visao-geral?tipo=${tipo}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) { skFim(empty, d.error); return; }
        if (d.sem_polo)     { skFim(empty, "Defina o seu polo para ver a conferência."); return; }
        if (d.polo_sem_xpt) { skFim(empty, "Este polo não recebe Shopee."); return; }
        _scaVisao = d.grupos || [];
        _scaRenderVisao(tipo);
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _scaRenderVisao(tipo) {
    const empty  = document.getElementById("sca-visao-empty");
    const result = document.getElementById("sca-visao-resultado");
    if (!_scaVisao.length) {
        skFim(empty, tipo === "cidade"
            ? "Nenhuma cidade com pedidos. Alimente Pedidos pesquisados primeiro."
            : "Nenhum cluster na AT. Alimente a AT Exportada primeiro.");
        return;
    }
    empty.style.display = "none";
    result.style.display = "";

    // Total geral no cabeçalho: é a resposta pra "estamos perto de fechar o dia?".
    const total = _scaVisao.reduce((a, g) => a + g.total, 0);
    const conf  = _scaVisao.reduce((a, g) => a + g.conferidos, 0);
    const pctGeral = _scaPct(conf, total) ?? 0;
    const completos = _scaVisao.filter(g => g.conferidos >= g.total).length;
    document.getElementById("sca-visao-obs").innerHTML =
        `<strong style="color:${_scaCorPct(pctGeral)}">${_scaPctTexto(pctGeral)}</strong> no total · ${conf} de ${total} · ${completos} de ${_scaVisao.length} fechado${completos !== 1 ? "s" : ""}`;

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
            <td><button class="adm-usr-action senha" onclick="_scaComecarDaVisao('${nomeEsc}')">Conferir</button></td>
        </tr>`;
    }).join("");
}

// Atalho da visão geral: já entra na conferência daquele grupo, sem passar pelo seletor.
function _scaComecarDaVisao(nome) {
    if (!_scaTipoAtual) _scaTipoAtual = "cluster";
    const sel = document.getElementById("sca-alvo");
    if (![...sel.options].some(o => o.value === nome)) {
        sel.innerHTML += `<option value="${_scaEsc(nome)}">${_scaEsc(nome)}</option>`;
    }
    sel.value = nome;
    _scaPintarTipo();
    _scaAlvoMudou();
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
            <td data-label="CEP" style="color:#8494a9">${_scaEsc(f.zipcode_name) || "—"}</td>
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
