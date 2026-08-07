// ───── CONFERÊNCIA DO ENTREGADOR → SHOPEE ─────
// O outro lado da conferência da operação: o galpão confere que separou certo, o entregador
// confere que recebeu tudo. Mesmos endpoints de bipar/faltantes/encerrar, mas em sessão
// própria (origem='entregador') — se fosse a mesma, o bipe do motorista faria a visão geral
// do galpão dar o cluster por conferido sem ninguém de lá ter olhado.

const CEN_RESULTADOS = {
    ok:          { rotulo: "Confere",        cor: "#22c55e" },
    divergente:  { rotulo: "Outra rota",     cor: "#ef4444" },
    sem_pedido:  { rotulo: "Não encontrado", cor: "#eab308" },
    sem_cluster: { rotulo: "Sem cluster",    cor: "#eab308" },
    sem_cep:     { rotulo: "Sem CEP",        cor: "#eab308" },
    sem_cidade:  { rotulo: "CEP sem cidade", cor: "#eab308" },
};

let _cenSessao = null;
let _cenBipagens = [];
let _cenFaltantes = [];
let _cenTotalGrupo = 0;
let _cenFiltro = "todos";

function _cenEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function abrirConfEntregador(event) {
    if (event) event.preventDefault();
    _cenSessao = null;
    _cenBipagens = [];
    _cenFaltantes = [];
    _cenFiltro = "todos";
    _cenMostrarInicio();
    mostrarTela("tela-conf-entregador");
    _cenCarregarClusters();
}

function _cenMostrarInicio() {
    document.getElementById("cen-inicio").style.display = "";
    document.getElementById("cen-andamento").style.display = "none";
}

function _cenMostrarAndamento() {
    document.getElementById("cen-inicio").style.display = "none";
    document.getElementById("cen-andamento").style.display = "";
}

// ── Meus clusters do dia ──
function _cenCarregarClusters() {
    const empty = document.getElementById("cen-empty");
    const res   = document.getElementById("cen-lista");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    res.style.display = "none";

    fetch(`${API}/entregador/conferencia/clusters`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (d && d.error) { skFim(empty, d.error); return; }
        const lista = d.clusters || [];
        if (!lista.length) {
            skFim(empty, "Nenhum cluster atribuído a você hoje. Fale com a operação.");
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        document.getElementById("cen-dia").innerText = d.dia ? d.dia.split("-").reverse().join("/") : "";

        document.getElementById("cen-tbody").innerHTML = lista.map(c => {
            const pct = c.total ? (c.conferidos / c.total) * 100 : 0;
            const falta = Math.max(0, c.total - c.conferidos);
            const cor = falta === 0 && c.total ? "#22c55e" : c.conferidos ? "#eab308" : "#8494a9";
            const nomeEsc = String(c.cluster || "").replace(/'/g, "\\'");
            return `
            <tr>
                <td data-label="Cluster" style="font-weight:700;color:#e2e8f0">${_cenEsc(c.cluster)}</td>
                <td data-label="Conclusão" style="min-width:140px">
                    <div class="slh-pct" style="color:${cor}">${_cenPctTexto(pct)}</div>
                    <div class="slh-barra"><div class="slh-barra-fill" style="width:${c.conferidos && pct < 1 ? 1 : Math.min(100, pct)}%;background:${cor}"></div></div>
                </td>
                <td data-label="Pacotes" style="font-variant-numeric:tabular-nums">${c.total}</td>
                <td data-label="Bipados" style="font-variant-numeric:tabular-nums;color:#22c55e">${c.conferidos}</td>
                <td data-label="Faltam" style="font-variant-numeric:tabular-nums;color:${falta ? "#eab308" : "#8494a9"};font-weight:${falta ? 700 : 400}">${falta}</td>
                <td><button class="adm-usr-action senha" onclick="_cenAbrirCluster('${nomeEsc}', this)">${c.encerrada ? "Ver" : c.sessao_id ? "Continuar" : "Conferir"}</button></td>
            </tr>`;
        }).join("");
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// Percentual exato, no formato 0,00% — 100% sem casas, que é como o resto do sistema mostra.
function _cenPctTexto(pct) {
    if (pct === null || pct === undefined) return "—";
    if (pct >= 100) return "100%";
    if (pct <= 0) return "0%";
    return pct.toFixed(2).replace(".", ",") + "%";
}

function _cenAbrirCluster(cluster, botao) {
    if (botao) { botao.disabled = true; botao.textContent = "Abrindo..."; }
    fetch(`${API}/entregador/conferencia/sessao`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ cluster })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (botao) { botao.disabled = false; botao.textContent = "Conferir"; }
        if (!ok) return gcAlert(d.error || "Não foi possível abrir a conferência.");
        _cenSessao = d;
        _cenBipagens = [];
        _cenFiltro = "todos";
        _cenAbrirSessao();
    })
    .catch(() => {
        if (botao) { botao.disabled = false; botao.textContent = "Conferir"; }
        gcAlert("Erro ao conectar com o servidor.");
    });
}

function _cenAbrirSessao() {
    _cenMostrarAndamento();
    document.getElementById("cen-faixa-alvo").innerText = _cenSessao.alvo || "—";
    document.getElementById("cen-msg").style.display = "none";
    _cenCarregarSessao();
    _cenCarregarFaltantes();
    const campo = document.getElementById("cen-codigo");
    campo.value = "";
    campo.focus();
}

function _cenCarregarSessao() {
    if (!_cenSessao) return;
    fetch(`${API}/shopee/conferencia/atribuicoes/sessao/${_cenSessao.id}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) return;
        _cenBipagens = d.bipagens || [];
        _cenRenderizar();
    }).catch(() => {});
}

function _cenCarregarFaltantes() {
    if (!_cenSessao) return;
    fetch(`${API}/shopee/conferencia/atribuicoes/sessao/${_cenSessao.id}/faltantes`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) return;
        _cenFaltantes = d.faltantes || [];
        _cenTotalGrupo = d.total_grupo || 0;
        _cenRenderizar();
    }).catch(() => {});
}

// ── Bipagem ──
function _cenCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _cenBipar(); }
}

function _cenScan() {
    // Mesmo leitor das Baixas: detector nativo → ZBar → ZXing. Não vale reimplementar.
    _bteAbrirScanner(codigo => {
        document.getElementById("cen-codigo").value = codigo;
        _cenBipar();
    });
}

function _cenBipar() {
    const campo = document.getElementById("cen-codigo");
    const codigo = campo.value.trim().toUpperCase();
    if (!codigo || !_cenSessao) return;
    campo.value = "";
    campo.focus();

    fetch(`${API}/shopee/conferencia/atribuicoes/bipar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, sessao_id: _cenSessao.id })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) return _cenMsg(d.error || "Não foi possível bipar.", "erro");
        _cenMsg(d.detalhe || (CEN_RESULTADOS[d.resultado] || {}).rotulo || "", d.resultado === "ok" ? "ok" : "erro");
        // Recarrega dos dois lados: o bipado entra na lista e sai dos faltantes.
        _cenCarregarSessao();
        _cenCarregarFaltantes();
    })
    .catch(() => _cenMsg("Erro ao conectar com o servidor.", "erro"));
}

function _cenMsg(msg, tipo) {
    const el = document.getElementById("cen-msg");
    if (!msg) { el.style.display = "none"; return; }
    const cor = tipo === "ok" ? "#22c55e" : "#ef4444";
    el.style.display = "";
    el.innerHTML = `<div style="background:${cor}1a;border:1px solid ${cor}55;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;color:${cor}">${_cenEsc(msg)}</div>`;
    clearTimeout(_cenMsgTimer);
    _cenMsgTimer = setTimeout(() => { el.style.display = "none"; }, 4000);
}
let _cenMsgTimer = null;

// ── Resumo e lista ──
function _cenFiltro_(f) { _cenFiltro = f; _cenRenderizar(); }

function _cenRenderizar() {
    const ok      = _cenBipagens.filter(b => b.resultado === "ok").length;
    const outra   = _cenBipagens.filter(b => b.resultado === "divergente").length;
    const semDado = _cenBipagens.filter(b => !["ok", "divergente"].includes(b.resultado)).length;
    const faltam  = _cenFaltantes.length;

    // "Bipado a mais" é o que entrou na conferência sem pertencer ao cluster: veio junto por
    // engano, e é o número que o entregador precisa devolver ao galpão.
    const aMais = outra + semDado;

    document.getElementById("cen-resumo").innerHTML = `
        <div class="shr-resumo-item"><span class="shr-resumo-num" style="color:#22c55e">${ok}</span><span class="shr-resumo-lbl">Conferem</span></div>
        <div class="shr-resumo-item"><span class="shr-resumo-num" style="color:${faltam ? "#eab308" : "#8494a9"}">${faltam}</span><span class="shr-resumo-lbl">Faltam</span></div>
        <div class="shr-resumo-item"><span class="shr-resumo-num" style="color:${aMais ? "#ef4444" : "#8494a9"}">${aMais}</span><span class="shr-resumo-lbl">A mais</span></div>`;

    const pct = _cenTotalGrupo ? (ok / _cenTotalGrupo) * 100 : 0;
    const cor = faltam === 0 && _cenTotalGrupo ? "#22c55e" : "#eab308";
    document.getElementById("cen-prog-pct").innerText = _cenPctTexto(pct);
    document.getElementById("cen-prog-pct").style.color = cor;
    document.getElementById("cen-prog-obs").innerText =
        `${ok} de ${_cenTotalGrupo} conferidos${faltam ? ` · faltam ${faltam}` : " · tudo conferido"}`;
    const barra = document.getElementById("cen-prog-barra");
    barra.style.width = (ok && pct < 1 ? 1 : Math.min(100, pct)) + "%";
    barra.style.background = cor;

    document.querySelectorAll("#cen-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.f === _cenFiltro));

    let linhas;
    if (_cenFiltro === "faltam") {
        linhas = _cenFaltantes.map(f => `
            <tr>
                <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_cenEsc(f.codigo)}</td>
                <td data-label="Situação"><span style="color:#eab308;font-weight:700;font-size:12.5px">Não bipado</span></td>
                <td data-label="Cidade">${_cenEsc(f.cidade || f.bairro || "—")}</td>
            </tr>`);
        document.getElementById("cen-thead").innerHTML = `<tr><th>Código</th><th>Situação</th><th>Cidade / Bairro</th></tr>`;
    } else {
        const filtradas = _cenBipagens.filter(b => {
            if (_cenFiltro === "todos") return true;
            if (_cenFiltro === "divergente") return b.resultado === "divergente";
            if (_cenFiltro === "amais") return !["ok", "divergente"].includes(b.resultado);
            return true;
        });
        document.getElementById("cen-thead").innerHTML = `<tr><th>Código</th><th>Resultado</th><th>Onde está</th><th>Hora</th></tr>`;
        linhas = filtradas.map(b => {
            const r = CEN_RESULTADOS[b.resultado] || { rotulo: b.resultado, cor: "#8494a9" };
            return `
            <tr>
                <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_cenEsc(b.codigo)}</td>
                <td data-label="Resultado"><span style="color:${r.cor};font-weight:700;font-size:12.5px">${r.rotulo}</span></td>
                <td data-label="Onde está">${_cenEsc(b.encontrado || "—")}</td>
                <td data-label="Hora" style="font-size:12px;color:#8494a9">${_cenEsc((b.data_hora_brasilia || "").split(" ")[1] || "")}</td>
            </tr>`;
        });
    }
    document.getElementById("cen-tbody-bip").innerHTML = linhas.length
        ? linhas.join("")
        : `<tr><td colspan="4" style="text-align:center;color:#8494a9;padding:20px">Nada aqui.</td></tr>`;
}

function _cenVoltar() {
    _cenSessao = null;
    _cenMostrarInicio();
    _cenCarregarClusters();
}

function _cenEncerrar() {
    if (!_cenSessao) return;
    const faltam = _cenFaltantes.length;
    const msg = faltam
        ? `Encerrar a conferência de ${_cenSessao.alvo}?\n\nAinda faltam ${faltam} pacote${faltam !== 1 ? "s" : ""} sem bipar. Depois de encerrar não dá pra bipar mais nessa conferência.`
        : `Encerrar a conferência de ${_cenSessao.alvo}?\n\nTodos os pacotes foram conferidos.`;
    gcConfirm(msg, () => {
        fetch(`${API}/shopee/conferencia/atribuicoes/encerrar`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ sessao_id: _cenSessao.id })
        }).then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) return gcAlert(d.error || "Não foi possível encerrar.");
            _cenVoltar();
        }).catch(() => gcAlert("Erro ao conectar com o servidor."));
    }, "Encerrar conferência", "Encerrar");
}
