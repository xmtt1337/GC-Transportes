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
let _cenRota = {};
let _cenBipagens = [];
let _cenFaltantes = [];
let _cenAlvos = [];
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

// ── Minha rota do dia ──
// Os clusters aparecem como detalhamento, não como botões: a conferência é uma só, da rota
// inteira. Ele vê quanto falta de cada um sem ter que entrar e sair de cada cluster.
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

        _cenPintarRota(d.rota || {}, lista.length);

        document.getElementById("cen-tbody").innerHTML = lista.map(c => {
            const pct = c.total ? (c.conferidos / c.total) * 100 : 0;
            const falta = Math.max(0, c.total - c.conferidos);
            const cor = falta === 0 && c.total ? "#22c55e" : c.conferidos ? "#eab308" : "#8494a9";
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
            </tr>`;
        }).join("");
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _cenPintarRota(rota, qtdClusters) {
    _cenRota = rota;
    const total  = rota.total || 0;
    const feitos = rota.conferidos || 0;
    const falta  = Math.max(0, total - feitos);
    const pct    = total ? (feitos / total) * 100 : 0;
    const cor    = falta === 0 && total ? "#22c55e" : feitos ? "#eab308" : "#8494a9";

    document.getElementById("cen-rota-pct").innerText = _cenPctTexto(pct);
    document.getElementById("cen-rota-pct").style.color = cor;
    document.getElementById("cen-rota-obs").innerText =
        `${qtdClusters} cluster${qtdClusters !== 1 ? "s" : ""} · ${total} pacote${total !== 1 ? "s" : ""}` +
        (falta ? ` · faltam ${falta}` : total ? " · tudo conferido" : "");
    const barra = document.getElementById("cen-rota-barra");
    barra.style.width = (feitos && pct < 1 ? 1 : Math.min(100, pct)) + "%";
    barra.style.background = cor;

    document.getElementById("cen-rota-btn").textContent =
        rota.encerrada ? "Ver conferência" : rota.sessao_id ? "Continuar conferência" : "Conferir rota";
}

// Percentual exato, no formato 0,00% — 100% sem casas, que é como o resto do sistema mostra.
function _cenPctTexto(pct) {
    if (pct === null || pct === undefined) return "—";
    if (pct >= 100) return "100%";
    if (pct <= 0) return "0%";
    return pct.toFixed(2).replace(".", ",") + "%";
}

function _cenAbrirRota(botao) {
    // Rota já encerrada abre em modo consulta, direto pelo id. Chamar o POST aqui abriria
    // uma conferência nova do mesmo dia em cima de uma que a pessoa já fechou.
    if (_cenRota.encerrada && _cenRota.sessao_id) {
        _cenSessao = { id: _cenRota.sessao_id, alvo: _cenRota.alvo, encerrada_em: true };
        _cenBipagens = [];
        _cenFaltantes = [];
        _cenTotalGrupo = 0;
        _cenFiltro = "todos";
        _cenAbrirSessao();
        return;
    }
    const rotulo = botao ? botao.textContent : "";
    if (botao) { botao.disabled = true; botao.textContent = "Abrindo..."; }
    fetch(`${API}/entregador/conferencia/sessao`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: "{}"
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (botao) { botao.disabled = false; botao.textContent = rotulo; }
        if (!ok) return gcAlert(d.error || "Não foi possível abrir a conferência.");
        _cenSessao = d;
        _cenBipagens = [];
        // Zerados junto com a sessão: sobra de uma conferência anterior mostraria faltante
        // de outra rota enquanto a lista nova não chega.
        _cenFaltantes = [];
        _cenTotalGrupo = 0;
        _cenFiltro = "todos";
        _cenAbrirSessao();
    })
    .catch(() => {
        if (botao) { botao.disabled = false; botao.textContent = rotulo; }
        gcAlert("Erro ao conectar com o servidor.");
    });
}

function _cenAbrirSessao() {
    _cenMostrarAndamento();
    document.getElementById("cen-faixa-alvo").innerText = _cenSessao.alvo || "—";
    document.getElementById("cen-msg").style.display = "none";

    // Conferência fechada é só consulta: some o campo de bipar e o botão de encerrar, senão
    // a pessoa bipa e leva erro do servidor sem entender por quê.
    const fechada = !!_cenSessao.encerrada_em;
    document.getElementById("cen-bipar-card").style.display = fechada ? "none" : "";
    document.getElementById("cen-encerrar-btn").style.display = fechada ? "none" : "";

    _cenRenderizar();
    _cenCarregarSessao();
    _cenCarregarFaltantes();
    if (!fechada) {
        const campo = document.getElementById("cen-codigo");
        campo.value = "";
        campo.focus();
    }
}

// Erro aqui aparece na tela. Engolir calado deixava a conferência com tudo zerado e cara de
// "não tem nada pra conferir" — que é exatamente o oposto do que estava acontecendo.
function _cenCarregarSessao() {
    if (!_cenSessao) return;
    fetch(`${API}/shopee/conferencia/atribuicoes/sessao/${_cenSessao.id}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) return _cenMsg(d.error, "erro");
        _cenBipagens = d.bipagens || [];
        _cenRenderizar();
    }).catch(() => _cenMsg("Erro ao carregar o que já foi bipado.", "erro"));
}

function _cenCarregarFaltantes() {
    if (!_cenSessao) return;
    fetch(`${API}/shopee/conferencia/atribuicoes/sessao/${_cenSessao.id}/faltantes`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) return _cenMsg(d.error, "erro");
        _cenFaltantes = d.faltantes || [];
        _cenTotalGrupo = d.total_grupo || 0;
        // Os alvos como o SERVIDOR os leu. Só servem quando a rota vem vazia, e aí valem
        // muito: separam "a AT não tem esse cluster" de "a lista de clusters foi lida
        // errada", que na tela são idênticos.
        _cenAlvos = Array.isArray(d.alvos) ? d.alvos : [];
        _cenRenderizar();
    }).catch(() => _cenMsg("Erro ao carregar os faltantes.", "erro"));
}

// ── Bipagem ──
function _cenCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _cenBipar(); }
}

function _cenScan() {
    // Mesmo leitor das Baixas: detector nativo → ZBar → ZXing. Não vale reimplementar.
    // Contínuo e em tela cheia: quem confere uma rota inteira bipa dezenas de pacotes
    // seguidos, e reabrir a câmera a cada um era o gargalo.
    _bteAbrirScanner(codigo => _cenBipar(codigo), {
        continuo: true,
        areaCheia: true,
        titulo: "Bipando a rota",
    });
}

function _cenEscaneando() {
    return !!document.getElementById("bte-scan-overlay");
}

function _cenBipar(codigoLido) {
    const campo = document.getElementById("cen-codigo");
    const codigo = String(codigoLido != null ? codigoLido : campo.value).trim().toUpperCase();
    // Com a câmera aberta o campo fica atrás do overlay: focar ali sobe o teclado do
    // celular por cima da imagem. Digitando na mão o foco continua voltando pro campo.
    if (codigoLido == null) {
        campo.value = "";
        campo.focus();
    }
    if (!codigo || !_cenSessao) return;

    fetch(`${API}/shopee/conferencia/atribuicoes/bipar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, sessao_id: _cenSessao.id })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            // Já bipado é aviso, não erro: o pacote está na rota, só passou duas vezes.
            const tipo = d.ja_bipado ? "aviso" : "erro";
            return _cenResposta(d.error || "Não foi possível bipar.", tipo);
        }
        _cenResposta(_cenTextoResultado(d), d.resultado === "ok" ? "ok" : "erro");
        // Recarrega dos dois lados: o bipado entra na lista e sai dos faltantes.
        _cenCarregarSessao();
        _cenCarregarFaltantes();
    })
    .catch(() => _cenResposta("Erro ao conectar com o servidor.", "erro"));
}

// O que a mensagem do bipe diz.
//
// Pacote de outro cluster tem que dizer DE QUAL. "Outra rota" sozinho não resolve nada com
// o pacote na mão: é o número do cluster que decide se ele volta pro galpão ou vai pro
// colega que leva aquele cluster. A conferência da operação já mostrava isso; a do
// entregador mostrava só o rótulo genérico, e ele é quem está longe do galpão.
function _cenTextoResultado(d) {
    const rotulo = (CEN_RESULTADOS[d.resultado] || {}).rotulo || "";
    if (d.resultado === "ok") return d.detalhe || "Confere";
    if (d.resultado === "divergente" && d.encontrado) {
        return `Esse pacote é do ${d.encontrado} — não é da sua rota`;
    }
    return d.detalhe || rotulo;
}

// Som, cor e texto do bipe. O som é o que importa de verdade: conferindo pacote na mão,
// ninguém olha a tela a cada bipe — é pelo apito que se percebe que algo saiu errado.
function _cenResposta(msg, tipo) {
    if (tipo === "ok") { _gcBeepSucesso(); } else { _gcBeepErro(); }
    _cenFlash(tipo);
    _cenMsg(msg, tipo);
    // Com a câmera cobrindo a tela, a resposta tem que aparecer dentro do overlay.
    if (_cenEscaneando()) _bteScanStatus(msg || (tipo === "ok" ? "Confere" : "Erro"), tipo);
}

let _cenFlashTimer = null;
function _cenFlash(tipo) {
    const wrap = document.getElementById("cen-campo-codigo");
    if (!wrap) return;
    clearTimeout(_cenFlashTimer);
    wrap.classList.remove("flash-ok", "flash-err");
    void wrap.offsetWidth;   // reinicia a animação quando dois bipes vêm em sequência
    wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    _cenFlashTimer = setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
}

function _cenMsg(msg, tipo) {
    const el = document.getElementById("cen-msg");
    if (!msg) { el.style.display = "none"; return; }
    const cor = tipo === "ok" ? "#22c55e" : tipo === "aviso" ? "#eab308" : "#ef4444";
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
    const cor = !_cenTotalGrupo ? "#8494a9" : faltam === 0 ? "#22c55e" : "#eab308";
    document.getElementById("cen-prog-pct").innerText = _cenPctTexto(pct);
    document.getElementById("cen-prog-pct").style.color = cor;
    // Sem nenhum pacote no grupo não dá pra dizer "tudo conferido": é a mesma tela de quem
    // acabou de conferir 200 pacotes, e foi exatamente assim que a rota vazia passou dias
    // parecendo rota concluída.
    // Vem dos alvos que o servidor leu, um por um entre colchetes. Se aparecer um item só
    // com vírgula dentro — [C-01, C-02] em vez de [C-01] [C-02] — o problema não é a AT, é
    // a leitura da lista de clusters, e dá pra ver isso da tela do celular.
    const alvos = _cenAlvos.length
        ? _cenAlvos.map(a => `[${a}]`).join(" ")
        : (_cenSessao && _cenSessao.alvo ? _cenSessao.alvo : "da sua rota");
    document.getElementById("cen-prog-obs").innerText = _cenTotalGrupo
        ? `${ok} de ${_cenTotalGrupo} conferidos${faltam ? ` · faltam ${faltam}` : " · tudo conferido"}`
        : `A AT de hoje não tem pacote nos clusters ${alvos} — avise a operação.`;
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
        // "Cluster do pacote" e não "Onde está": a conferência do entregador é sempre por
        // cluster, e é esse número que ele precisa ler pra saber o que fazer com o pacote.
        document.getElementById("cen-thead").innerHTML = `<tr><th>Código</th><th>Resultado</th><th>Cluster do pacote</th><th>Hora</th></tr>`;
        linhas = filtradas.map(b => {
            const r = CEN_RESULTADOS[b.resultado] || { rotulo: b.resultado, cor: "#8494a9" };
            return `
            <tr>
                <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_cenEsc(b.codigo)}</td>
                <td data-label="Resultado"><span style="color:${r.cor};font-weight:700;font-size:12.5px">${r.rotulo}</span></td>
                <td data-label="Cluster do pacote">${_cenEsc(b.encontrado || "—")}</td>
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
        ? `Encerrar a conferência da sua rota?\n\nAinda faltam ${faltam} pacote${faltam !== 1 ? "s" : ""} sem bipar. Depois de encerrar não dá pra bipar mais nessa conferência.`
        : `Encerrar a conferência da sua rota?\n\nTodos os pacotes foram conferidos.`;
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
