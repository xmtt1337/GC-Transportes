// ───── SHOPEE → CONFERÊNCIA → ENTREGADORES ─────
// O galpão olhando a conferência que cada entregador fez no celular. É leitura: dá pra ver
// o que ele bipou e o que ficou faltando, mas não dá pra bipar nem encerrar por ele — o
// registro é do que ELE recebeu, e mexer de fora esvaziaria o sentido dele.

const SCE_RESULTADOS = {
    ok:          { rotulo: "Confere",        cor: "#22c55e" },
    divergente:  { rotulo: "Outra rota",     cor: "#ef4444" },
    sem_pedido:  { rotulo: "Não encontrado", cor: "#eab308" },
    sem_cluster: { rotulo: "Sem cluster",    cor: "#eab308" },
    sem_cep:     { rotulo: "Sem CEP",        cor: "#eab308" },
    sem_cidade:  { rotulo: "CEP sem cidade", cor: "#eab308" },
};

let _sceDia    = "";
let _sceDias   = [];
let _sceLista  = [];
let _sceDet    = null;     // { sessao, bipagens, faltantes, total_grupo }
let _sceFiltro = "todos";

function _sceEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _scePct(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return "—";
    if (pct >= 100) return "100%";
    if (pct <= 0) return "0%";
    return pct.toFixed(2).replace(".", ",") + "%";
}

function abrirShopeeConfEntregadores(event) {
    if (event) event.preventDefault();
    _sceDia = "";
    _sceDet = null;
    _sceFiltro = "todos";
    _sceMostrarLista();
    mostrarTela("tela-shopee-conf-entregadores");
    _sceCarregar();
}

function _sceMostrarLista() {
    document.getElementById("sce-lista-wrap").style.display = "";
    document.getElementById("sce-detalhe").style.display = "none";
}

function _sceMostrarDetalhe() {
    document.getElementById("sce-lista-wrap").style.display = "none";
    document.getElementById("sce-detalhe").style.display = "";
}

// ── Lista por dia ──
function _sceCarregar() {
    const empty = document.getElementById("sce-empty");
    const res   = document.getElementById("sce-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    res.style.display = "none";

    const qs = _sceDia ? `?dia=${encodeURIComponent(_sceDia)}` : "";
    fetch(`${API}/shopee/conferencia/entregadores${qs}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (d && d.error) { skFim(empty, d.error); return; }
        if (d.sem_polo)     { skFim(empty, "Você ainda não tem polo definido. Abra o Recebimento Shopee para escolher."); return; }
        if (d.polo_sem_xpt) { skFim(empty, `O polo ${d.polo_label} não recebe Shopee, então não há conferências de entregador.`); return; }

        _sceFaixa(d);
        // O servidor escolhe o dia da primeira carga (hoje, ou o mais recente com
        // atribuição) — a tela só passa a mandar depois que alguém escolhe.
        _sceDia  = d.dia || "";
        _sceDias = d.dias || [];
        _sceRenderDias(d.hoje);

        _sceLista = d.entregadores || [];
        if (!_sceLista.length) {
            skFim(empty, _sceDias.length
                ? "Nenhum entregador com cluster atribuído nesse dia."
                : "Nenhum entregador atribuído ainda. Defina os entregadores em Atribuições.");
            document.getElementById("sce-resumo").innerHTML = "";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        _sceRenderResumo();
        _sceRenderLista();
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _sceFaixa(d) {
    const faixa = document.getElementById("sce-faixa");
    if (!d || !d.xpt) { faixa.style.display = "none"; return; }
    faixa.style.display = "";
    document.getElementById("sce-faixa-xpt").innerText = `${d.polo_label} · ${d.xpt}`;
}

// Só aparecem dias que têm entregador atribuído, então clicar nunca leva a uma
// tela vazia. O calendário é o componente compartilhado (js/calendario-dias.js),
// o mesmo do Line Haul — a fita de 8 dias que estava aqui escondia qualquer dia
// mais antigo que o oitavo.
function _sceRenderDias(hoje) {
    gcCalMontar({
        alvo: "sce-dias",
        // Sem miúdo na célula: "19 entregadores" não cabe num quadrado de 40px e
        // vazava por cima dos dias vizinhos. A contagem fica no botão e na dica
        // de cada dia, onde há espaço pra ela.
        dias: _sceDias.map(d => ({
            dia: d.dia,
            resumo: d.entregadores + " entregador" + (d.entregadores !== 1 ? "es" : ""),
        })),
        dia: _sceDia,
        hoje: hoje || "",
        aoEscolher: _sceTrocarDia,
    });
}

function _sceTrocarDia(dia) {
    _sceDia = dia;
    _sceCarregar();
}

function _sceRenderResumo() {
    // Só entra na conta quem tem total conhecido: dia antigo sem retrato devolve null, e
    // somar isso como zero faria a base parecer mais adiantada do que está.
    const comTotal = _sceLista.filter(e => e.total !== null && e.total !== undefined);
    const total    = comTotal.reduce((s, e) => s + e.total, 0);
    const feitos   = comTotal.reduce((s, e) => s + e.conferidos, 0);
    const faltam   = Math.max(0, total - feitos);
    const naoComecou = _sceLista.filter(e => !e.comecou).length;
    const encerradas = _sceLista.filter(e => e.encerrada).length;

    document.getElementById("sce-resumo").innerHTML = `
        <div class="paj-card"><div class="paj-label">Conferidos</div><div class="paj-value" style="color:#22c55e">${feitos}</div></div>
        <div class="paj-card"><div class="paj-label">Faltam</div><div class="paj-value" style="color:${faltam ? "#eab308" : "#8494a9"}">${faltam}</div></div>
        <div class="paj-card"><div class="paj-label">Não começaram</div><div class="paj-value" style="color:${naoComecou ? "#ef4444" : "#8494a9"}">${naoComecou}</div></div>
        <div class="paj-card"><div class="paj-label">Encerradas</div><div class="paj-value" style="color:#8494a9">${encerradas}</div></div>`;
}

function _sceRenderLista() {
    document.getElementById("sce-entregadores").innerHTML = _sceLista.map((e, i) => {
        const semTotal = e.total === null || e.total === undefined;
        const pct   = semTotal || !e.total ? 0 : (e.conferidos / e.total) * 100;
        const falta = semTotal ? null : Math.max(0, e.total - e.conferidos);
        const cor = semTotal ? "#8494a9"
                  : falta === 0 && e.total ? "#22c55e"
                  : e.conferidos ? "#eab308" : "#8494a9";

        const marca = e.encerrada
            ? `<span style="font-size:11px;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:999px;padding:2px 9px">Encerrada</span>`
            : e.comecou
                ? `<span style="font-size:11px;font-weight:700;color:#eab308;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:999px;padding:2px 9px">Em andamento</span>`
                : `<span style="font-size:11px;font-weight:700;color:#8494a9;background:rgba(132,148,169,0.12);border:1px solid rgba(132,148,169,0.3);border-radius:999px;padding:2px 9px">Não começou</span>`;

        // Divergente e "sem dado" viram um alerta só: os dois são pacote que entrou no carro
        // sem ser da rota, e é isso que a operação vai ter que ir buscar.
        const aMais = (e.divergentes || 0) + (e.outros || 0);
        const alerta = aMais
            ? `<span style="font-size:11px;font-weight:700;color:#ef4444;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:999px;padding:2px 9px">${aMais} a mais</span>`
            : "";

        return `
        <div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:10px;background:rgba(255,255,255,0.02)">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
                <span style="font-weight:700;color:#e2e8f0;font-size:14px;flex:1;min-width:140px">${_sceEsc(e.nome)}</span>
                ${marca}${alerta}
            </div>
            <div style="font-size:12.5px;color:#8494a9;margin-bottom:9px">
                ${e.clusters.length} cluster${e.clusters.length !== 1 ? "s" : ""} ·
                <span style="color:#93c5fd">${_sceEsc(e.clusters.join(", "))}</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <span style="font-variant-numeric:tabular-nums;font-weight:700;color:${cor};font-size:15px;flex:none">
                    ${e.conferidos} / ${semTotal ? "—" : e.total}
                </span>
                <span style="font-size:12.5px;color:${cor};flex:none">${semTotal ? "" : _scePct(pct)}</span>
                <div class="slh-barra" style="flex:1;min-width:110px">
                    <div class="slh-barra-fill" style="width:${e.conferidos && pct < 1 ? 1 : Math.min(100, pct)}%;background:${cor}"></div>
                </div>
                ${e.sessao_id
                    ? `<button class="adm-usr-action senha" style="flex:none" onclick="_sceAbrirDetalhe(${e.sessao_id}, ${i})">Ver pedidos</button>`
                    : `<span style="font-size:12px;color:#717f95;flex:none">sem conferência</span>`}
            </div>
        </div>`;
    }).join("");
}

// ── Detalhe: os pedidos de uma conferência ──
function _sceAbrirDetalhe(sessaoId, indice) {
    _sceFiltro = "todos";
    _sceDet = null;
    _sceMostrarDetalhe();
    document.getElementById("sce-det-nome").innerText =
        (_sceLista[indice] && _sceLista[indice].nome) || "—";
    document.getElementById("sce-det-tbody").innerHTML =
        `<tr><td colspan="4" style="text-align:center;color:#8494a9;padding:22px">Carregando...</td></tr>`;
    document.getElementById("sce-det-resumo").innerHTML = "";

    fetch(`${API}/shopee/conferencia/entregadores/sessao/${sessaoId}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) {
            document.getElementById("sce-det-tbody").innerHTML =
                `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:22px">${_sceEsc(d.error)}</td></tr>`;
            return;
        }
        _sceDet = d;
        _sceRenderDetalhe();
    })
    .catch(() => {
        document.getElementById("sce-det-tbody").innerHTML =
            `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:22px">Erro ao conectar com o servidor.</td></tr>`;
    });
}

function _sceVoltar() {
    _sceDet = null;
    _sceMostrarLista();
}

function _sceFiltro_(f) { _sceFiltro = f; _sceRenderDetalhe(); }

function _sceRenderDetalhe() {
    if (!_sceDet) return;
    const bip = _sceDet.bipagens || [];
    const falt = _sceDet.faltantes || [];
    const total = _sceDet.total_grupo || 0;

    const ok      = bip.filter(b => b.resultado === "ok").length;
    const outra   = bip.filter(b => b.resultado === "divergente").length;
    const semDado = bip.filter(b => !["ok", "divergente"].includes(b.resultado)).length;

    const s = _sceDet.sessao || {};
    document.getElementById("sce-det-sub").innerText =
        `${(s.alvos || []).join(", ") || s.alvo || "—"}${s.dia ? " · " + s.dia.split("-").reverse().join("/") : ""}${
            s.encerrada_em ? " · encerrada" : " · em andamento"}`;

    const pct = total ? (ok / total) * 100 : 0;
    const cor = !total ? "#8494a9" : falt.length === 0 ? "#22c55e" : "#eab308";
    document.getElementById("sce-det-pct").innerText = _scePct(pct);
    document.getElementById("sce-det-pct").style.color = cor;
    document.getElementById("sce-det-obs").innerText = total
        ? `${ok} de ${total} conferidos${falt.length ? ` · faltam ${falt.length}` : " · tudo conferido"}`
        : "Sem retrato dos pacotes desse dia — a AT já foi substituída.";
    const barra = document.getElementById("sce-det-barra");
    barra.style.width = (ok && pct < 1 ? 1 : Math.min(100, pct)) + "%";
    barra.style.background = cor;

    document.getElementById("sce-det-resumo").innerHTML = `
        <div class="paj-card"><div class="paj-label">Conferem</div><div class="paj-value" style="color:#22c55e">${ok}</div></div>
        <div class="paj-card"><div class="paj-label">Faltam</div><div class="paj-value" style="color:${falt.length ? "#eab308" : "#8494a9"}">${falt.length}</div></div>
        <div class="paj-card"><div class="paj-label">A mais</div><div class="paj-value" style="color:${outra + semDado ? "#ef4444" : "#8494a9"}">${outra + semDado}</div></div>`;

    document.querySelectorAll("#sce-det-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.f === _sceFiltro));

    let linhas;
    if (_sceFiltro === "faltam") {
        document.getElementById("sce-det-thead").innerHTML =
            `<tr><th>Código</th><th>Situação</th><th>Cluster</th><th>Cidade / Bairro</th></tr>`;
        linhas = falt.map(f => `
            <tr>
                <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_sceEsc(f.codigo)}</td>
                <td data-label="Situação"><span style="color:#eab308;font-weight:700;font-size:12.5px">Não bipado</span></td>
                <td data-label="Cluster">${_sceEsc(f.cluster || "—")}</td>
                <td data-label="Cidade / Bairro">${_sceEsc(f.cidade || f.bairro || "—")}</td>
            </tr>`);
    } else {
        document.getElementById("sce-det-thead").innerHTML =
            `<tr><th>Código</th><th>Resultado</th><th>Cluster do pacote</th><th>Hora</th></tr>`;
        const filtradas = bip.filter(b => {
            if (_sceFiltro === "todos") return true;
            if (_sceFiltro === "divergente") return b.resultado === "divergente";
            if (_sceFiltro === "amais") return !["ok", "divergente"].includes(b.resultado);
            return true;
        });
        linhas = filtradas.map(b => {
            const r = SCE_RESULTADOS[b.resultado] || { rotulo: b.resultado, cor: "#8494a9" };
            return `
            <tr>
                <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_sceEsc(b.codigo)}</td>
                <td data-label="Resultado"><span style="color:${r.cor};font-weight:700;font-size:12.5px">${r.rotulo}</span></td>
                <td data-label="Cluster do pacote">${_sceEsc(b.encontrado || "—")}</td>
                <td data-label="Hora" style="font-size:12px;color:#8494a9">${_sceEsc((b.data_hora_brasilia || "").split(" ")[1] || "")}</td>
            </tr>`;
        });
    }
    document.getElementById("sce-det-tbody").innerHTML = linhas.length
        ? linhas.join("")
        : `<tr><td colspan="4" style="text-align:center;color:#8494a9;padding:20px">Nada aqui.</td></tr>`;
}
