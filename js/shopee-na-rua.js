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

function _snrEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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
        el.className = "shr-ultima vazia";
        el.innerHTML = `<span class="shr-ultima-label">Pedidos pesquisados</span>
            <span class="shr-ultima-valor">Nenhuma importação ainda</span>`;
        return;
    }
    el.className = "shr-ultima";
    el.innerHTML = `
        <span class="shr-ultima-label">Atualizado</span>
        <span class="shr-ultima-valor">${_snrDataHora(atualizado.importado_em)}</span>
        <span class="shr-ultima-rel">${_snrRelativo(atualizado.segundos_atras)}</span>
        <span class="shr-ultima-obs">XM Vigia (automático)</span>`;
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
        if (!_snrLista.length) {
            skFim(empty, _snrDias.length
                ? "Nenhum pedido pesquisado nesse dia."
                : "Nenhum pedido pesquisado ainda. O macro de Pedidos Pesquisados alimenta isso sozinho.");
            document.getElementById("snr-resumo").innerHTML = "";
            return;
        }
        empty.style.display = "none";
        res.style.display = "";
        _snrRenderResumo();
        _snrRenderLista();
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

function _snrRenderResumo() {
    const totalPedidos = _snrLista.reduce((s, e) => s + e.total, 0);
    const semEntregador = _snrLista.find(e => e.nome === "Sem entregador");

    document.getElementById("snr-resumo").innerHTML = `
        <div class="paj-card"><div class="paj-label">Pedidos</div><div class="paj-value">${totalPedidos}</div></div>
        <div class="paj-card"><div class="paj-label">Entregadores</div><div class="paj-value">${_snrLista.filter(e => e.nome !== "Sem entregador").length}</div></div>
        <div class="paj-card"><div class="paj-label">Sem entregador</div><div class="paj-value" style="color:${semEntregador ? "#eab308" : "#8494a9"}">${semEntregador ? semEntregador.total : 0}</div></div>`;
}

function _snrRenderLista() {
    document.getElementById("snr-entregadores").innerHTML = _snrLista.map(e => {
        const semEntregador = e.nome === "Sem entregador";
        return `
        <div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:10px;background:rgba(255,255,255,0.02)">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-weight:700;color:${semEntregador ? "#eab308" : "#e2e8f0"};font-size:14px;flex:1;min-width:140px">
                    ${_snrEsc(e.nome)}
                </span>
                <span style="font-variant-numeric:tabular-nums;font-weight:700;color:#93c5fd;font-size:15px;flex:none">
                    ${e.total} pedido${e.total !== 1 ? "s" : ""}
                </span>
                <button class="adm-usr-action senha" style="flex:none" onclick="_snrAbrirDetalhe('${_snrEsc(e.nome).replace(/'/g, "\\'")}')">Ver pedidos</button>
            </div>
        </div>`;
    }).join("");
}

// ── Detalhe: os pedidos de um entregador ──
function _snrAbrirDetalhe(nome) {
    _snrMostrarDetalhe();
    document.getElementById("snr-det-nome").innerText = nome;
    document.getElementById("snr-det-sub").innerText = gcCalBr(_snrDia);
    document.getElementById("snr-det-tbody").innerHTML =
        `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:22px">Carregando...</td></tr>`;

    fetch(`${API}/shopee-na-rua/entregador?dia=${encodeURIComponent(_snrDia)}&nome=${encodeURIComponent(nome)}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        if (d && d.error) {
            document.getElementById("snr-det-tbody").innerHTML =
                `<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:22px">${_snrEsc(d.error)}</td></tr>`;
            return;
        }
        _snrDet = d;
        _snrRenderDetalhe();
    })
    .catch(() => {
        document.getElementById("snr-det-tbody").innerHTML =
            `<tr><td colspan="5" style="text-align:center;color:#ef4444;padding:22px">Erro ao conectar com o servidor.</td></tr>`;
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
            ctx.font = "700 25px Inter, sans-serif";
            ctx.fillStyle = opts.cor || "#e2e8f0";
            ctx.fillText(opts.valor, cx, cy - (opts.rotulo ? 10 : 0));
            if (opts.rotulo) {
                ctx.font = "600 10.5px Inter, sans-serif";
                ctx.fillStyle = "#7b8ba3";
                ctx.fillText(opts.rotulo, cx, cy + 12);
            }
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
                animation: { duration: 220 },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c =>
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
                animation: { duration: 220 },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: c =>
                        `${c.label}: ${c.parsed} (${_snrPct(st.total ? c.parsed / st.total * 100 : 0)})` } },
                    snrCenterText: { valor: _snrPct(st.performance), rotulo: "performance", cor: _snrCorPerformance(st.performance) },
                },
            },
        });
    }

    document.getElementById("snr-gr-status-legenda").innerHTML = `
        <span class="nr-leg"><i style="background:${SNR_COR_ENTREGUE}"></i>Delivered · ${st.entregue} (${_snrPct(st.pctEntregue)})</span>
        <span class="nr-leg"><i style="background:${SNR_COR_PENDENTE}"></i>Delivering · ${st.pendente} (${_snrPct(st.pctPendente)})</span>
        <span class="nr-leg"><i style="background:${SNR_COR_INSUCESSO}"></i>OnHold · ${st.insucesso} (${_snrPct(st.pctInsucesso)})</span>`;
    document.getElementById("snr-gr-status-sub").innerText = st.finalizados
        ? `Entre os finalizados (Delivered + OnHold): ${_snrPct(st.taxaSucesso)} entregue e ${_snrPct(st.taxaFalha)} onhold. Delivering ainda não entra nessa conta — ainda não finalizou.`
        : "Nenhum pedido finalizado ainda hoje.";

    document.getElementById("snr-gr-performance-legenda").innerHTML = `
        <span class="nr-leg"><i style="background:${SNR_COR_ENTREGUE}"></i>Delivered · ${st.entregue}</span>
        <span class="nr-leg"><i style="background:${SNR_COR_INSUCESSO}"></i>OnHold + Delivering · ${st.pendente + st.insucesso}</span>`;
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
        <div class="nr-grafico-card">
            <div class="nr-grafico-titulo">Pendentes que afetam a performance</div>
            <div style="font-size:12.5px;color:#7b8ba3;margin-top:10px">Nenhum — tudo já finalizou (Delivered ou OnHold).</div>
        </div>`;
        return;
    }

    wrap.innerHTML = `
    <div class="nr-grafico-card">
        <div class="nr-grafico-titulo">Pendentes que afetam a performance · ${pendentes.length}</div>
        <div style="font-size:11.5px;color:#7b8ba3;margin:4px 0 2px">Delivering — ainda dá tempo de virar Delivered hoje.</div>
        <div class="snr-pend-lista">
            ${pendentes.map(p => {
                const endereco = _snrRuaNumero(p.endereco) || "Endereço não encontrado na AT";
                const extra = [p.bairro, p.cidade].filter(Boolean).join(" · ");
                return `
                <div class="snr-pend-item">
                    <span class="snr-pend-codigo">${_snrEsc(p.codigo)}</span>
                    <span class="snr-pend-endereco">${_snrEsc(endereco)}${extra ? `<span class="snr-pend-extra">${_snrEsc(extra)}</span>` : ""}</span>
                </div>`;
            }).join("")}
        </div>
    </div>`;
}

function _snrRenderDetalhe() {
    if (!_snrDet) return;
    const pedidos = _snrDet.pedidos || [];

    _snrGraficarStatus(pedidos);

    document.getElementById("snr-det-tbody").innerHTML = pedidos.length
        ? pedidos.map(p => {
            // Endereço só existe quando o código bateu com uma linha da AT que
            // tem essa informação (o Romaneio) — pedido mais velho, ligado a
            // uma AT de antes disso, fica sem endereço, e é isso mesmo.
            const endereco = _snrRuaNumero(p.endereco) || "—";
            return `
            <tr>
                <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_snrEsc(p.codigo)}</td>
                <td data-label="AT">${_snrEsc(p.task_id || "—")}</td>
                <td data-label="Endereço">${_snrEsc(endereco)}${p.bairro ? `<br><span style="color:#8494a9;font-size:11.5px">${_snrEsc(p.bairro)}${p.cidade ? " · " + _snrEsc(p.cidade) : ""}</span>` : ""}</td>
                <td data-label="Cluster">${_snrEsc(p.cluster || "—")}</td>
                <td data-label="Status">${_snrEsc(p.status || "—")}</td>
            </tr>`;
        }).join("")
        : `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:20px">Nada aqui.</td></tr>`;
}
