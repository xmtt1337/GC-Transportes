// ───── TORRE DE CONTROLE > NA RUA > SHOPEE ─────
//
// As outras transportadoras de Na Rua dependem de alguém subir um arquivo. A
// Shopee não: o XM Vigia já alimenta o sistema sozinho, então esta tela só
// LÊ o que já está lá — sem upload, sem botão "Enviar relatório". É por isso
// que ela mora num arquivo à parte em vez de dentro de torre-na-rua.js: o
// fluxo inteiro é outro, só a aba é a mesma.
//
// O padrão de tela é o de Shopee > Conferência > Entregadores: lista de
// cards por entregador, "Ver pedidos" troca pra um detalhe (não modal).

let _snrDia   = "";
let _snrDias  = [];
let _snrLista = [];
let _snrDet   = null;   // { nome, dia, pedidos: [...] }
let _snrTodos = [];     // pedidos crus do dia inteiro — só buscado quando alguém clica um status
let _snrStatusClicado = null;
let _snrGeralGraficos = {};

function _snrEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Chart.js não herda a fonte da página (cai em Helvetica) e o tooltip padrão é
// uma caixa preta translúcida de canto bem redondo. Passado por gráfico, e não
// em Chart.defaults, pra não mexer nos gráficos das outras telas.
const SNR_FONTE = "Inter, sans-serif";
const SNR_TOOLTIP = {
    backgroundColor: "#1a2334", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1,
    padding: 10, cornerRadius: 6, boxPadding: 4, titleColor: "#f1f5f9", bodyColor: "#cbd5e1",
};

// Uma linha de legenda: quadradinho de cor, nome, contagem e %. Com `status`
// vira botão (clicar lista os pedidos daquele status).
function _snrLegLinha({ cor, nome, n, pct, status }) {
    const miolo = `<i style="background:${cor}"></i>
        <span class="snr-leg-nome">${_snrEsc(nome)}</span>
        <span class="snr-leg-n">${Number(n).toLocaleString("pt-BR")}</span>
        <span class="snr-leg-pct">${pct === undefined ? "" : _snrPct(pct)}</span>`;
    return status === undefined
        ? `<div class="snr-leg-lin">${miolo}</div>`
        : `<button type="button" class="snr-leg-lin${status === _snrStatusClicado ? " sel" : ""}"
                   data-status="${_snrEsc(status)}" onclick="_snrClicarStatus(this.dataset.status)">${miolo}</button>`;
}

// Só "rua, número" - o que vem depois da segunda vírgula (complemento,
// referência, observação) some. O ENDEREÇO COMPLETO da AT já vem com tudo
// junto numa string só ("Rua X, 117, CASA 1 - casa da esquina"), e o
// complemento de novo no fim (que às vezes SÓ repete o que já tava aí)
// deixava a linha comprida demais pra bater o olho numa lista de pendentes.
function _snrRuaNumero(endereco) {
    const partes = String(endereco || "").split(",").map(s => s.trim()).filter(Boolean);
    return partes.slice(0, 2).join(", ");
}

function _snrMostrarLista() {
    document.getElementById("snr-lista-wrap").style.display = "";
    document.getElementById("snr-detalhe").style.display = "none";
}

function _snrMostrarDetalhe() {
    document.getElementById("snr-lista-wrap").style.display = "none";
    document.getElementById("snr-detalhe").style.display = "";
    // A lista é comprida e a linha clicada costuma estar lá embaixo: sem isto o
    // detalhe abre no meio da página, com o nome do entregador fora da tela.
    const corpo = document.querySelector("#tela-torre-na-rua .fech-body");
    if (corpo) corpo.scrollTop = 0;
}

// Chamado pela aba "Shopee" dentro de Na Rua (torre-na-rua.js), no lugar do
// upload+pivô que as outras transportadoras usam.
function _snrMostrar() {
    _snrDet = null;
    _snrMostrarLista();
    _snrCarregar();
}

// ── Última atualização ──
// importado_em chega como TEXTO puro ("2026-09-16 21:08:40.774"), de
// propósito: é um TIMESTAMP sem fuso gravado em horário de Brasília
// (comoBrasilia, no backend). Rodar isso por `new Date(...)` aqui reabriria
// o mesmo bug de fuso já corrigido na escrita - o navegador reinterpretaria
// esses dígitos usando o fuso de QUEM ESTÁ VENDO a tela, que pode não ser
// Brasília. Por isso vira texto na mão, e o "há quanto tempo" já chega
// pronto do servidor (calculado dentro do Postgres).
function _snrDataHora(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(texto || ""));
    if (!m) return "—";
    const [, , mes, dia, h, mi] = m;
    return `${dia}/${mes} ${h}:${mi}`;
}

function _snrRelativo(seg) {
    if (seg === null || seg === undefined || !isFinite(seg)) return "";
    const min = Math.floor(Math.max(seg, 0) / 60);
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h}h`;
    const d = Math.floor(h / 24);
    return d === 1 ? "ontem" : `há ${d} dias`;
}

function _snrRenderUltima(atualizado) {
    const el = document.getElementById("snr-ultima");
    if (!atualizado || !atualizado.importado_em) {
        el.className = "snr-ultima vazia";
        el.innerHTML = `<span>Pedidos pesquisados: nenhuma importação ainda</span>`;
        return;
    }
    const rel = _snrRelativo(atualizado.segundos_atras);
    el.className = "snr-ultima";
    el.innerHTML = `
        <span>Atualizado <b>${_snrDataHora(atualizado.importado_em)}</b></span>
        ${rel ? `<span class="rel">${rel}</span>` : ""}
        <span>XM Vigia (automático)</span>`;
}

// ── Lista de entregadores do dia ──
function _snrCarregar() {
    const empty = document.getElementById("snr-empty");
    const res   = document.getElementById("snr-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    res.style.display = "none";

    const qs = _snrDia ? `?dia=${encodeURIComponent(_snrDia)}` : "";
    fetch(`${API}/shopee-na-rua/entregadores${qs}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (d && d.error) { skFim(empty, d.error); return; }

        // O servidor escolhe o dia (hoje, ou o mais recente com pedido) — a
        // tela só passa a mandar um dia específico depois que alguém escolhe.
        _snrDia  = d.dia || "";
        _snrDias = d.dias || [];
        _snrRenderDias(d.hoje);
        _snrRenderUltima(d.atualizado);

        _snrLista = d.entregadores || [];
        _snrTodos = []; // limpa o cache de pedidos crus — troca de dia, troca a carga
        _snrFecharStatusLista();
        if (!_snrLista.length) {
            skFim(empty, _snrDias.length
                ? "Nenhum pedido pesquisado nesse dia."
                : "Nenhum pedido pesquisado ainda. O macro de Pedidos Pesquisados alimenta isso sozinho.");
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        _snrRenderLista();
        _snrRenderGeral();
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// Só aparecem dias que têm pedido pesquisado — clicar nunca leva a uma tela
// vazia. Mesmo componente compartilhado de Conferência-Entregadores e Line Haul.
function _snrRenderDias(hoje) {
    gcCalMontar({
        alvo: "snr-dias",
        dias: _snrDias.map(d => ({
            dia: d.dia,
            resumo: `${d.pedidos} pedido${d.pedidos !== 1 ? "s" : ""} · ${d.entregadores} entregador${d.entregadores !== 1 ? "es" : ""}`,
        })),
        dia: _snrDia,
        hoje: hoje || "",
        aoEscolher: _snrTrocarDia,
    });
}

function _snrTrocarDia(dia) {
    _snrDia = dia;
    _snrCarregar();
}

// Quantos pedidos do entregador ainda estão "na rua" (Delivering) — a soma
// vem da quebra por status que entregadoresDoDia já manda, sem precisar
// abrir o detalhe pra saber quantos faltam fechar hoje.
function _snrPendentes(e) {
    return (e.status || []).reduce((s, x) => s + (_snrBucketStatus(x.status) === "pendente" ? x.total : 0), 0);
}

// Fatias da barra de andamento de um entregador: entregue / na rua / onhold e,
// à parte, o que ainda nem saiu pra rua (Hub_Assigned e afins). Só entra fatia
// que tem pedido — a barra nunca reserva espaço pra status zerado.
function _snrSegmentosBarra(e) {
    const c = { entregue: 0, pendente: 0, insucesso: 0, outros: 0 };
    (e.status || []).forEach(s => { c[_snrBucketStatus(s.status) || "outros"] += s.total; });
    return [
        { nome: "Delivered",  total: c.entregue,   cor: SNR_COR_ENTREGUE },
        { nome: "Delivering", total: c.pendente,   cor: SNR_COR_PENDENTE },
        { nome: "OnHold",     total: c.insucesso,  cor: SNR_COR_INSUCESSO },
        { nome: "Outros",     total: c.outros,     cor: SNR_COR_OUTROS },
    ].filter(x => x.total > 0);
}

const _SNR_ICONE_SINO = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`;

function _snrRenderLista() {
    // Ordem de quem tem mais coisa pra resolver agora, não de quem tem mais
    // pedido no total — total alto com tudo já entregue não pede atenção.
    const lista = [..._snrLista].sort((a, b) => _snrPendentes(b) - _snrPendentes(a));
    // O nome viaja em data-nome (e não dentro do onclick): aspas e barra no
    // nome de alguém não quebram o atributo, e a linha inteira vira clicável.
    const linhas = lista.map(e => {
        const semEntregador = e.nome === "Sem entregador";
        // % de conclusão AGORA, sem precisar abrir o detalhe: Delivered sobre
        // o total do dia — mesma conta de _snrStats, só que já computada pelo
        // servidor (entregadoresDoDia) pra cada entregador de uma vez.
        const pct = e.total ? (e.entregues / e.total * 100) : null;
        const pendentes = _snrPendentes(e);
        const segmentos = _snrSegmentosBarra(e);
        const dica = segmentos.map(s => `${s.nome} ${s.total}`).join(" · ");
        const abrir = "event.stopPropagation();_snrAbrirDetalhe(this.closest('[data-nome]').dataset.nome)";
        const alertar = semEntregador ? "" : `
            <button type="button" class="snr-btn snr-alerta${pendentes ? "" : " quieto"}"
                    title="${pendentes ? "Mandar o aviso de rota incompleta no WhatsApp agora" : "Nada na rua agora — o aviso avulso ainda pode ser mandado"}"
                    onclick="event.stopPropagation();_snrAlertar(this.closest('[data-nome]').dataset.nome)">${_SNR_ICONE_SINO}Alertar</button>`;
        return `
        <div class="snr-lin" data-nome="${_snrEsc(e.nome)}" onclick="_snrAbrirDetalhe(this.dataset.nome)">
            <div class="snr-c-nome${semEntregador ? " sem" : ""}" title="${_snrEsc(e.nome)}">${_snrEsc(e.nome)}</div>
            <div class="snr-c-barra"><div class="snr-prog" title="${_snrEsc(dica)}">${
                segmentos.map(s => `<span style="flex:${s.total};background:${s.cor}"></span>`).join("")}</div></div>
            <div class="snr-c-num${pendentes ? "" : " zero"}" data-label="Na rua" title="Delivering — ainda na rua">${pendentes}</div>
            <div class="snr-c-num" data-label="Concluído" style="color:${_snrCorPerformance(pct)};font-weight:600" title="Delivered sobre o total do dia">${_snrPct(pct)}</div>
            <div class="snr-c-num forte" data-label="Pedidos">${e.total}</div>
            <div class="snr-c-acoes">${alertar}
                <button type="button" class="snr-link" onclick="${abrir}">Ver pedidos ›</button>
            </div>
        </div>`;
    }).join("");

    document.getElementById("snr-entregadores").innerHTML = `
    <div class="snr-lista">
        <div class="snr-lista-cab">
            <span>Entregador</span><span>Andamento</span>
            <span class="snr-c-num">Na rua</span><span class="snr-c-num">Concluído</span><span class="snr-c-num">Pedidos</span>
            <span></span>
        </div>
        ${linhas}
    </div>`;
}

// ── Alertar: dispara o mesmo aviso de rota incompleta da rodada automática (19:05/22:05),
// mas na hora, pra 1 entregador só — pra quem quiser avisar antes do horário configurado em
// Macros, sem esperar o critério dela (% abaixo de X etc.) ficar verdadeiro. Cada clique é
// um disparo avulso (grava com rodada "manual-HH:MM:SS"), sem dedupe: clicar de novo manda
// de novo, de propósito.
function _snrAlertar(nome) {
    gcConfirm(
        `Mandar o aviso de rota incompleta pro WhatsApp de <b>${_snrEsc(nome)}</b> agora?<br><br>` +
        `Isso manda WhatsApp de verdade, fora do horário automático — não é uma simulação.`,
        () => _snrAlertarConfirmado(nome),
        "Alertar entregador",
        "Mandar aviso"
    );
}

function _snrAlertarConfirmado(nome) {
    fetch(`${API}/admin/avisos-entregador/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ dia: _snrDia, nome }),
    })
    .then(r => r.json())
    .then(d => {
        if (d && d.error) return gcAlert(_snrEsc(d.error));
        if (!d.disparou) return gcAlert(_snrEsc(d.motivo || "Não deu pra mandar o aviso."));
        if (d.sucesso) return gcAlert(`Aviso mandado pro WhatsApp de ${_snrEsc(nome)}.`);
        return gcAlert(`Não deu pra mandar: ${_snrEsc(d.erro || "erro desconhecido")}`);
    })
    .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

// ── Visão geral do dia (todos os entregadores somados) ──
// Dois gráficos: distribuição de status (clicável — mostra os pedidos daquele
// status embaixo) e quem tem mais pedido Delivering agora, em coluna e em
// pizza. Rampa sequencial de azul (um hue só, validada contra o fundo escuro
// do sistema com scripts/validate_palette.js da skill de dataviz) em vez de
// cor por categoria: é "quem tem mais", uma classificação, não identidades
// que precisam ser diferenciáveis à vontade — por isso também corta em Top 5
// + Outros, não tenta uma cor por entregador.
const SNR_RAMPA_AZUL = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];

function _snrStatusGeralContagem() {
    const porStatus = new Map();
    _snrLista.forEach(e => {
        (e.status || []).forEach(s => {
            const st = String(s.status || "").trim() || "(sem status)";
            porStatus.set(st, (porStatus.get(st) || 0) + s.total);
        });
    });
    return [...porStatus.entries()].sort((a, b) => b[1] - a[1]);
}

function _snrCorStatusGeral(status) {
    const b = _snrBucketStatus(status);
    if (b === "entregue") return SNR_COR_ENTREGUE;
    if (b === "pendente") return SNR_COR_PENDENTE;
    if (b === "insucesso") return SNR_COR_INSUCESSO;
    return SNR_COR_OUTROS; // Hub_Assigned e qualquer status anterior a "na rua"
}

function _snrDestruirGraficosGerais() {
    Object.values(_snrGeralGraficos).forEach(g => { try { g.destroy(); } catch (_) {} });
    _snrGeralGraficos = {};
}

function _snrRenderGeral() {
    _snrDestruirGraficosGerais();
    _snrGraficarStatusGeral();
    _snrGraficarDeliveringPorEntregador();
}

function _snrGraficarStatusGeral() {
    const dados = _snrStatusGeralContagem();
    const total = dados.reduce((s, [, n]) => s + n, 0);

    document.getElementById("snr-ger-gr-status-legenda").innerHTML = dados.map(([st, n]) =>
        _snrLegLinha({ cor: _snrCorStatusGeral(st), nome: st, n, pct: total ? n / total * 100 : 0, status: st })).join("");

    if (typeof Chart === "undefined" || !dados.length) return;
    _snrRegistrarPlugin();
    _snrGeralGraficos.status = new Chart(document.getElementById("snr-ger-gr-status"), {
        type: "doughnut",
        data: {
            labels: dados.map(([st]) => st),
            datasets: [{
                data: dados.map(([, n]) => n),
                backgroundColor: dados.map(([st]) => _snrCorStatusGeral(st)),
                borderColor: "#0f1520",
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: "68%",
            font: { family: SNR_FONTE },
            animation: { duration: 220 },
            onClick: (evt, els) => { if (els.length) _snrClicarStatus(dados[els[0].index][0]); },
            plugins: {
                legend: { display: false },
                tooltip: { ...SNR_TOOLTIP, callbacks: { label: c =>
                    `${c.label}: ${c.parsed.toLocaleString("pt-BR")} (${_snrPct(total ? c.parsed / total * 100 : 0)})` } },
                snrCenterText: { valor: total.toLocaleString("pt-BR"), rotulo: total === 1 ? "pedido" : "pedidos", cor: "#e2e8f0" },
            },
        },
    });
}

// Clicar num status (legenda ou fatia) lista os pedidos daquele status,
// somando todo mundo — busca os pedidos crus só na primeira vez (fica em
// cache em _snrTodos até trocar de dia).
function _snrClicarStatus(status) {
    _snrStatusClicado = status;
    document.getElementById("snr-ger-status-lista-wrap").style.display = "";
    document.getElementById("snr-ger-status-lista-titulo").innerText = `Pedidos — ${status}`;
    _snrMarcarStatusLegenda();

    if (_snrTodos.length) return _snrPintarStatusLista();

    document.getElementById("snr-ger-status-lista").innerHTML = `<div class="snr-vazio">Carregando...</div>`;
    fetch(`${API}/shopee-na-rua/pedidos?dia=${encodeURIComponent(_snrDia)}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        _snrTodos = (d && !d.error) ? (d.pedidos || []) : [];
        _snrPintarStatusLista();
    })
    .catch(() => {
        document.getElementById("snr-ger-status-lista").innerHTML =
            `<div class="snr-vazio">Erro ao conectar com o servidor.</div>`;
    });
}

// Realça, na legenda, o status cuja lista está aberta (ou tira o realce de todos).
function _snrMarcarStatusLegenda() {
    document.querySelectorAll("#snr-ger-gr-status-legenda .snr-leg-lin").forEach(b =>
        b.classList.toggle("sel", _snrStatusClicado !== null && b.dataset.status === _snrStatusClicado));
}

function _snrFecharStatusLista() {
    _snrStatusClicado = null;
    _snrMarcarStatusLegenda();
    const wrap = document.getElementById("snr-ger-status-lista-wrap");
    if (wrap) wrap.style.display = "none";
}

function _snrPintarStatusLista() {
    // A legenda chama de "(sem status)" o que chega vazio — o filtro tem que
    // usar o mesmo nome, senão clicar nele listaria sempre "nenhum pedido".
    const pedidos = _snrTodos.filter(p => (String(p.status || "").trim() || "(sem status)") === _snrStatusClicado);
    const el = document.getElementById("snr-ger-status-lista");
    document.getElementById("snr-ger-status-lista-titulo").innerText =
        `Pedidos — ${_snrStatusClicado} · ${pedidos.length.toLocaleString("pt-BR")}`;
    if (!pedidos.length) {
        el.innerHTML = `<div class="snr-vazio">Nenhum pedido com esse status.</div>`;
        return;
    }
    el.innerHTML = pedidos.map(p => {
        const endereco = _snrRuaNumero(p.endereco) || "—";
        return `
        <div class="snr-pac">
            <span class="snr-pac-cod">${_snrEsc(p.codigo)}</span>
            <span class="snr-pac-end">${_snrEsc(endereco)}${p.bairro ? `<small>${_snrEsc(p.bairro)}</small>` : ""}</span>
            <span class="snr-pac-quem">${_snrEsc(p.entregador)}</span>
        </div>`;
    }).join("");
}

// Top 12 em coluna (leaderboard — dá pra ler todo mundo relevante de uma vez)
// e Top 5 + Outros na pizza (mais que isso e a fatia vira ruído ilegível).
function _snrDeliveringPorEntregador(limite) {
    return _snrLista
        .map(e => ({ nome: e.nome, pendentes: _snrPendentes(e) }))
        .filter(e => e.pendentes > 0)
        .sort((a, b) => b.pendentes - a.pendentes)
        .slice(0, limite);
}

function _snrEncurtarNome(nome) {
    const t = String(nome || "").trim();
    if (t.length <= 20) return t;
    const partes = t.split(/\s+/);
    if (partes.length < 2) return t.slice(0, 19) + "…";
    return partes[0] + " " + partes[1][0] + ".";
}

function _snrGraficarDeliveringPorEntregador() {
    if (typeof Chart === "undefined") return;
    _snrRegistrarPlugin();

    // Barras na horizontal, com o número na ponta: o nome cabe inteiro do lado
    // esquerdo (na coluna vertical ele girava 40°) e o valor dispensa eixo e
    // grade. A altura do painel acompanha quantas barras há, pra a barra não
    // ficar gorda com dois entregadores nem espremida com doze.
    const coluna = _snrDeliveringPorEntregador(12);
    document.getElementById("snr-ger-deliv-col-area").style.height = coluna.length ? `${coluna.length * 30 + 8}px` : "";
    document.getElementById("snr-ger-gr-deliv-col").style.display = coluna.length ? "" : "none";
    document.getElementById("snr-ger-deliv-col-vazio").style.display = coluna.length ? "none" : "";
    if (coluna.length) {
        _snrGeralGraficos.delivCol = new Chart(document.getElementById("snr-ger-gr-deliv-col"), {
            type: "bar",
            data: {
                labels: coluna.map(e => _snrEncurtarNome(e.nome)),
                datasets: [{
                    data: coluna.map(e => e.pendentes),
                    backgroundColor: SNR_COR_PENDENTE,
                    borderRadius: { topRight: 3, bottomRight: 3 },
                    borderSkipped: "start",
                    barThickness: 14,
                }],
            },
            options: {
                indexAxis: "y",
                responsive: true, maintainAspectRatio: false,
                font: { family: SNR_FONTE },
                animation: { duration: 220 },
                plugins: {
                    legend: { display: false },
                    snrValorNaBarra: { ativo: true },
                    tooltip: { ...SNR_TOOLTIP, callbacks: {
                        title: c => coluna[c[0].dataIndex].nome,
                        label: c => c.parsed.x.toLocaleString("pt-BR") + " delivering",
                    } },
                },
                scales: {
                    x: { display: false, beginAtZero: true, grace: "12%" },
                    y: { grid: { display: false }, border: { display: false },
                         ticks: { color: "#c3cddc", font: { size: 12 } } },
                },
            },
        });
    }

    // Top 5 + Outros: cor por RANKING (rampa sequencial), não por identidade —
    // um 8º entregador nunca vira "mais uma cor", vira parte de "Outros".
    const todos = _snrDeliveringPorEntregador(Infinity);
    const top5 = todos.slice(0, 5);
    const outrosTotal = todos.slice(5).reduce((s, e) => s + e.pendentes, 0);
    const fatias = outrosTotal ? [...top5, { nome: "Outros", pendentes: outrosTotal }] : top5;
    const totalFatias = fatias.reduce((s, e) => s + e.pendentes, 0);

    // Sem ninguém na rua: some a rosca e a legenda velha (de outro dia) junto —
    // antes ela ficava ali, mentindo, quando se trocava pra um dia sem Delivering.
    document.getElementById("snr-ger-gr-deliv-pizza").parentElement.style.display = fatias.length ? "" : "none";
    document.getElementById("snr-ger-gr-deliv-pizza-legenda").innerHTML = fatias.length
        ? fatias.map((e, i) => _snrLegLinha({
            cor: SNR_RAMPA_AZUL[i], nome: e.nome, n: e.pendentes, pct: e.pendentes / totalFatias * 100 })).join("")
        : `<div class="snr-vazio">Ninguém com pedido na rua agora.</div>`;
    if (!fatias.length) return;

    _snrGeralGraficos.delivPizza = new Chart(document.getElementById("snr-ger-gr-deliv-pizza"), {
        type: "doughnut",
        data: {
            labels: fatias.map(e => e.nome),
            datasets: [{
                data: fatias.map(e => e.pendentes),
                backgroundColor: fatias.map((_, i) => SNR_RAMPA_AZUL[i]),
                borderColor: "#0f1520",
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: "62%",
            font: { family: SNR_FONTE },
            animation: { duration: 220 },
            plugins: {
                legend: { display: false },
                tooltip: { ...SNR_TOOLTIP, callbacks: { label: c => `${c.label}: ${c.parsed.toLocaleString("pt-BR")}` } },
                snrCenterText: { valor: totalFatias.toLocaleString("pt-BR"), rotulo: "na rua", cor: "#e2e8f0" },
            },
        },
    });
}

// ── Detalhe: os pedidos de um entregador ──
function _snrAbrirDetalhe(nome) {
    _snrMostrarDetalhe();
    document.getElementById("snr-det-nome").innerText = nome;
    document.getElementById("snr-det-sub").innerText = gcCalBr(_snrDia);
    document.getElementById("snr-det-tbody").innerHTML =
        `<tr><td colspan="4" style="text-align:center;color:#8494a9;padding:22px">Carregando...</td></tr>`;

    fetch(`${API}/shopee-na-rua/entregador?dia=${encodeURIComponent(_snrDia)}&nome=${encodeURIComponent(nome)}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) {
            document.getElementById("snr-det-tbody").innerHTML =
                `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:22px">${_snrEsc(d.error)}</td></tr>`;
            return;
        }
        _snrDet = d;
        _snrRenderDetalhe();
    })
    .catch(() => {
        document.getElementById("snr-det-tbody").innerHTML =
            `<tr><td colspan="4" style="text-align:center;color:#ef4444;padding:22px">Erro ao conectar com o servidor.</td></tr>`;
    });
}

function _snrVoltar() {
    _snrDet = null;
    _snrMostrarLista();
}

// ── Status agregados: Delivered / Delivering / OnHold ──
// Delivering é o único que ainda não fechou — por isso ele fica de fora da
// taxa de sucesso (que só faz sentido entre Delivered e OnHold, que já
// terminaram), mas conta CONTRA na performance: pra quem paga a diária pelo
// desempenho do dia, pedido que ainda não foi entregue é pedido que ainda
// não rendeu, não importa se é falha ou só demora.
const SNR_COR_ENTREGUE  = "#22c55e";
const SNR_COR_PENDENTE  = "#3a86ff";
const SNR_COR_INSUCESSO = "#ef4444";
const SNR_COR_OUTROS    = "#64748b"; // ainda nem saiu pra rua (Hub_Assigned etc.)

function _snrBucketStatus(status) {
    const s = String(status || "").toLowerCase();
    if (s.includes("delivered")) return "entregue";
    if (s.includes("onhold") || s.includes("on hold") || s.includes("on_hold")) return "insucesso";
    if (s.includes("delivering")) return "pendente";
    return null; // status anterior a "na rua" (Hub_Assigned etc.) - fora dessa conta
}

function _snrStats(pedidos) {
    const c = { entregue: 0, pendente: 0, insucesso: 0 };
    pedidos.forEach(p => { const b = _snrBucketStatus(p.status); if (b) c[b]++; });
    const total = c.entregue + c.pendente + c.insucesso;
    const finalizados = c.entregue + c.insucesso;
    return {
        ...c, total, finalizados,
        pctEntregue:  total ? c.entregue  / total * 100 : 0,
        pctPendente:  total ? c.pendente  / total * 100 : 0,
        pctInsucesso: total ? c.insucesso / total * 100 : 0,
        taxaSucesso:  finalizados ? c.entregue  / finalizados * 100 : null,
        taxaFalha:    finalizados ? c.insucesso / finalizados * 100 : null,
        performance:  total ? c.entregue / total * 100 : null,
    };
}

function _snrPct(p) {
    if (p === null || p === undefined || !isFinite(p)) return "—";
    if (p <= 0) return "0%";
    if (p >= 100) return "100%";
    return p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

// Verde/amarelo/vermelho por faixa — o mesmo corte de bom/ok/ruim usado pra
// decidir a diária. Aqui é só pra colorir o número; a conta é a mesma.
function _snrCorPerformance(p) {
    if (p === null) return "#8494a9";
    if (p >= 90) return SNR_COR_ENTREGUE;
    if (p >= 75) return "#eab308";
    return SNR_COR_INSUCESSO;
}

// ── Gráficos + lista de pendentes (tudo calculado no que já veio no detalhe,
// sem precisar de outra chamada ao servidor) ──
let _snrGraficos = {};
let _snrPluginPronto = false;

function _snrDestruirGraficos() {
    Object.values(_snrGraficos).forEach(g => { try { g.destroy(); } catch (_) {} });
    _snrGraficos = {};
}

// Número grande no meio do anel — Chart.js não desenha isso sozinho. Plugin
// registrado uma vez só; charts que não passam `snrCenterText` nas opções
// não são afetados (opts vem undefined e o afterDraw sai de imediato).
function _snrRegistrarPlugin() {
    if (_snrPluginPronto || typeof Chart === "undefined") return;
    Chart.register({
        id: "snrCenterText",
        afterDraw(chart, args, opts) {
            if (!opts || !opts.valor) return;
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            const cx = (left + right) / 2, cy = (top + bottom) / 2;
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `700 25px ${SNR_FONTE}`;
            ctx.fillStyle = opts.cor || "#e2e8f0";
            ctx.fillText(opts.valor, cx, cy - (opts.rotulo ? 10 : 0));
            if (opts.rotulo) {
                ctx.font = `600 10.5px ${SNR_FONTE}`;
                ctx.fillStyle = "#7b8ba3";
                ctx.fillText(opts.rotulo, cx, cy + 12);
            }
            ctx.restore();
        },
    });
    // Número na ponta da barra horizontal — dispensa eixo e grade. Só desenha
    // quando o gráfico liga `snrValorNaBarra.ativo`; nos outros, sai de imediato.
    Chart.register({
        id: "snrValorNaBarra",
        afterDatasetsDraw(chart, args, opts) {
            if (!opts || !opts.ativo) return;
            const { ctx } = chart;
            ctx.save();
            ctx.font = `600 12px ${SNR_FONTE}`;
            ctx.fillStyle = "#e2e8f0";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            chart.getDatasetMeta(0).data.forEach((barra, i) => {
                ctx.fillText(String(chart.data.datasets[0].data[i]), barra.x + 8, barra.y);
            });
            ctx.restore();
        },
    });
    _snrPluginPronto = true;
}

function _snrGraficarStatus(pedidos) {
    _snrDestruirGraficos();
    const st = _snrStats(pedidos);

    if (typeof Chart !== "undefined") {
        _snrRegistrarPlugin();

        // 1. Distribuição — os três status como chegam da Shopee, sem mexer.
        _snrGraficos.status = new Chart(document.getElementById("snr-gr-status"), {
            type: "doughnut",
            data: {
                labels: ["Delivered", "Delivering", "OnHold"],
                datasets: [{
                    data: [st.entregue, st.pendente, st.insucesso],
                    backgroundColor: [SNR_COR_ENTREGUE, SNR_COR_PENDENTE, SNR_COR_INSUCESSO],
                    borderColor: "#0f1520",
                    borderWidth: 3,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "72%",
                font: { family: SNR_FONTE },
                animation: { duration: 220 },
                plugins: {
                    legend: { display: false },
                    tooltip: { ...SNR_TOOLTIP, callbacks: { label: c =>
                        `${c.label}: ${c.parsed} (${_snrPct(st.total ? c.parsed / st.total * 100 : 0)})` } },
                    snrCenterText: { valor: String(st.total), rotulo: st.total === 1 ? "pedido" : "pedidos", cor: "#e2e8f0" },
                },
            },
        });

        // 2. Performance — Delivered contra tudo que ainda não fechou entregue.
        // É a mesma conta usada na precificação diária por performance.
        const naoEntregue = st.pendente + st.insucesso;
        _snrGraficos.performance = new Chart(document.getElementById("snr-gr-performance"), {
            type: "doughnut",
            data: {
                labels: ["Delivered", "OnHold + Delivering"],
                datasets: [{
                    data: [st.entregue, naoEntregue],
                    backgroundColor: [SNR_COR_ENTREGUE, SNR_COR_INSUCESSO],
                    borderColor: "#0f1520",
                    borderWidth: 3,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "72%",
                font: { family: SNR_FONTE },
                animation: { duration: 220 },
                plugins: {
                    legend: { display: false },
                    tooltip: { ...SNR_TOOLTIP, callbacks: { label: c =>
                        `${c.label}: ${c.parsed} (${_snrPct(st.total ? c.parsed / st.total * 100 : 0)})` } },
                    snrCenterText: { valor: _snrPct(st.performance), rotulo: "performance", cor: _snrCorPerformance(st.performance) },
                },
            },
        });
    }

    document.getElementById("snr-gr-status-legenda").innerHTML =
        _snrLegLinha({ cor: SNR_COR_ENTREGUE,  nome: "Delivered",  n: st.entregue,  pct: st.pctEntregue }) +
        _snrLegLinha({ cor: SNR_COR_PENDENTE,  nome: "Delivering", n: st.pendente,   pct: st.pctPendente }) +
        _snrLegLinha({ cor: SNR_COR_INSUCESSO, nome: "OnHold",     n: st.insucesso,  pct: st.pctInsucesso });
    document.getElementById("snr-gr-status-sub").innerText = st.finalizados
        ? `Entre os finalizados (Delivered + OnHold): ${_snrPct(st.taxaSucesso)} entregue e ${_snrPct(st.taxaFalha)} onhold. Delivering ainda não entra nessa conta — ainda não finalizou.`
        : "Nenhum pedido finalizado ainda hoje.";

    document.getElementById("snr-gr-performance-legenda").innerHTML =
        _snrLegLinha({ cor: SNR_COR_ENTREGUE,  nome: "Delivered",           n: st.entregue,                 pct: st.pctEntregue }) +
        _snrLegLinha({ cor: SNR_COR_INSUCESSO, nome: "OnHold + Delivering", n: st.pendente + st.insucesso,  pct: st.pctPendente + st.pctInsucesso });
    document.getElementById("snr-gr-performance-sub").innerText =
        "Mesma porcentagem usada na precificação diária por performance: Delivered sobre o total. Delivering ainda pendente entra contra — hoje ainda não fechou entregue.";

    _snrRenderPendentes(pedidos);
}

// Só os Delivering: são os únicos que ainda dá tempo de virar Delivered
// hoje. OnHold já fechou perdido, então listar ele aqui não ajudaria em nada
// — quem trata OnHold é outra tela.
function _snrRenderPendentes(pedidos) {
    const wrap = document.getElementById("snr-pendentes-wrap");
    const pendentes = pedidos.filter(p => _snrBucketStatus(p.status) === "pendente");

    if (!pendentes.length) {
        wrap.innerHTML = `
        <section class="snr-painel snr-pend">
            <h3 class="snr-painel-titulo">Pendentes que afetam a performance</h3>
            <p class="snr-vazio">Nenhum — tudo já finalizou (Delivered ou OnHold).</p>
        </section>`;
        return;
    }

    wrap.innerHTML = `
    <section class="snr-painel snr-pend">
        <h3 class="snr-painel-titulo">Pendentes que afetam a performance · ${pendentes.length}</h3>
        <p class="snr-pend-sub">Delivering — ainda dá tempo de virar Delivered hoje.</p>
        <div class="snr-pac-lista">
            ${pendentes.map(p => {
                const endereco = _snrRuaNumero(p.endereco) || "Endereço não encontrado na AT";
                const extra = [p.bairro, p.cidade].filter(Boolean).join(" · ");
                return `
                <div class="snr-pac solo">
                    <span class="snr-pac-cod">${_snrEsc(p.codigo)}</span>
                    <span class="snr-pac-end">${_snrEsc(endereco)}${extra ? `<small>${_snrEsc(extra)}</small>` : ""}</span>
                </div>`;
            }).join("")}
        </div>
    </section>`;
}

function _snrCsvEscapar(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function _snrExportarCsv() {
    if (!_snrDet || !_snrDet.pedidos || !_snrDet.pedidos.length) return gcAlert("Nenhum pedido para exportar.");
    const colunas = ["Código", "AT", "Endereço", "Bairro", "Cidade", "Status"];
    const linhas = _snrDet.pedidos.map(p => [
        p.codigo, p.task_id || "", _snrRuaNumero(p.endereco), p.bairro || "", p.cidade || "", p.status || "",
    ]);
    // BOM na frente pro Excel abrir os acentos corretamente.
    const csv = "﻿" + [colunas, ...linhas].map(l => l.map(_snrCsvEscapar).join(",")).join("\r\n") + "\r\n";

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos_${String(_snrDet.nome).replace(/[^\wÀ-ɏ]+/g, "-")}_${_snrDia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function _snrRenderDetalhe() {
    if (!_snrDet) return;
    const pedidos = _snrDet.pedidos || [];

    document.getElementById("snr-det-sub").innerText =
        `${gcCalBr(_snrDia)} · ${pedidos.length.toLocaleString("pt-BR")} pedido${pedidos.length !== 1 ? "s" : ""}`;
    _snrGraficarStatus(pedidos);

    document.getElementById("snr-det-tbody").innerHTML = pedidos.length
        ? pedidos.map(p => {
            // Endereço só existe quando o código bateu com uma linha da AT que
            // tem essa informação (o Romaneio) — pedido mais velho, ligado a
            // uma AT de antes disso, fica sem endereço, e é isso mesmo.
            const endereco = _snrRuaNumero(p.endereco) || "—";
            return `
            <tr>
                <td data-label="Código" class="cod">${_snrEsc(p.codigo)}</td>
                <td data-label="AT">${_snrEsc(p.task_id || "—")}</td>
                <td data-label="Endereço"><span class="snr-end">${_snrEsc(endereco)}${p.bairro ? `<br><span class="sub">${_snrEsc(p.bairro)}${p.cidade ? " · " + _snrEsc(p.cidade) : ""}</span>` : ""}</span></td>
                <td data-label="Status"><span class="snr-st" style="--c:${_snrCorStatusGeral(p.status)}">${_snrEsc(p.status || "—")}</span></td>
            </tr>`;
        }).join("")
        : `<tr><td colspan="4" style="text-align:center;color:#8494a9;padding:20px">Nada aqui.</td></tr>`;
}
