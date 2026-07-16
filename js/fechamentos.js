// ───── TELA FECHAMENTOS ─────
const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

let _fMes           = new Date().getMonth() + 1;
let _fAno           = new Date().getFullYear();
let _fQuinzena      = null;
let _fTotalReceber  = 0;

function abrirFechamentos(event) {
    if (event) event.preventDefault();
    _fQuinzena = null;
    document.querySelectorAll(".quinzena-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("fechamento-empty").innerText = "Selecione uma quinzena para ver o fechamento.";
    document.getElementById("fechamento-empty").style.display = "";
    document.getElementById("fechamento-data").style.display  = "none";
    _iniciarSelects();
    mostrarTela("tela-fechamentos");
}

function _iniciarSelects() {
    const selMes = document.getElementById("sel-mes");
    const selAno = document.getElementById("sel-ano");
    selMes.value = _fMes;
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 2; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _fAno) opt.selected = true;
        selAno.appendChild(opt);
    }
}

function filtrarPeriodo() {
    _fMes      = parseInt(document.getElementById("sel-mes").value);
    _fAno      = parseInt(document.getElementById("sel-ano").value);
    _fQuinzena = null;
    document.querySelectorAll(".quinzena-btn").forEach(b => b.classList.remove("active"));
    document.getElementById("fechamento-empty").innerText = "Selecione uma quinzena para ver o fechamento.";
    document.getElementById("fechamento-empty").style.display = "";
    document.getElementById("fechamento-data").style.display  = "none";
}

function _renderPgtoStatusCard(d) {
    const card = document.getElementById("pgto-status-card");
    if (!card) return;

    // Só exibe quando o pagamento foi confirmado pelo financeiro
    if (d.pagamento_status !== "pago") { card.style.display = "none"; return; }

    const temAnt   = d.antecipado_num > 0;
    const dataPgto = d.pagamento_data
        ? new Date(d.pagamento_data).toLocaleDateString("pt-BR") : null;

    const titulo = temAnt ? "Pago — Antecipação + Saldo" : "Pagamento Efetuado";
    const sub    = temAnt
        ? `Antecipado: ${d.antecipado} · Saldo pago em ${dataPgto}: ${d.liquido}`
        : `Pago em ${dataPgto} · ${d.total_receber}`;

    card.style.display = "";
    card.innerHTML = `<div class="pgto-card pgto-pago">
        <div class="pgto-card-icon">✓</div>
        <div>
            <div class="pgto-card-title">${titulo}</div>
            <div class="pgto-card-sub">${sub}</div>
        </div>
    </div>`;
}

function _calcularDataPagamento(mes, ano, quinzena) {
    // Q1: último dia é 15; Q2: último dia do mês. Conta 45 dias a partir daí.
    const base = quinzena === 1 ? new Date(ano, mes - 1, 15) : new Date(ano, mes, 0);
    const pagamento = new Date(base);
    pagamento.setDate(pagamento.getDate() + 45);
    return pagamento.toLocaleDateString("pt-BR");
}

function selecionarQuinzena(q) {
    _fQuinzena = q;
    document.getElementById("btn-1q").classList.toggle("active", q === 1);
    document.getElementById("btn-2q").classList.toggle("active", q === 2);
    _carregarPainel();
}

function _skeletonFechamento() {
    const card5 = Array(5).fill(`
        <div class="sk-card">
            <div class="sk sk-h8 sk-w60"></div>
            <div class="sk sk-h44"></div>
            <div class="sk sk-h8 sk-w40"></div>
        </div>`).join("");
    const card5sm = Array(5).fill(`
        <div class="sk-card">
            <div class="sk sk-h8 sk-w60"></div>
            <div class="sk sk-h14"></div>
            <div class="sk sk-h8 sk-w40"></div>
        </div>`).join("");
    return `
        <div class="sk-banner">
            <div class="sk-banner-left">
                <div class="sk sk-h8 sk-w40"></div>
                <div class="sk sk-h44" style="width:55%"></div>
                <div class="sk sk-h8 sk-w60"></div>
            </div>
            <div class="sk-divider"></div>
            <div class="sk-banner-right">
                <div class="sk sk-h8 sk-w80"></div>
                <div class="sk sk-h44" style="width:80px"></div>
                <div class="sk sk-h8 sk-w60"></div>
            </div>
        </div>
        <div class="sk sk-section"></div>
        <div class="sk-grid-5">${card5}</div>
        <div class="sk sk-section"></div>
        <div class="sk-grid-5">${card5sm}</div>
        <div class="sk sk-section"></div>
        <div class="sk-grid-2">
            <div class="sk-card sk-tall">
                <div class="sk sk-h8 sk-w40"></div>
                <div class="sk sk-h8 sk-w80"></div>
                <div class="sk sk-h8 sk-w60"></div>
            </div>
            <div class="sk-card sk-tall">
                <div class="sk sk-h8 sk-w40"></div>
                <div class="sk sk-h8 sk-w80"></div>
                <div class="sk sk-h8 sk-w60"></div>
            </div>
        </div>`;
}

function _carregarPainel() {
    const empty = document.getElementById("fechamento-empty");
    const data  = document.getElementById("fechamento-data");
    empty.classList.add("sk-mode");
    empty.innerHTML = _skeletonFechamento();
    empty.style.display = "";
    data.style.display  = "none";

    fetch(`${API}/painel?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json().then(body => ({ ok: res.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            empty.classList.remove("sk-mode");
            empty.innerText = body.error || "Nenhum fechamento encontrado para este período.";
            return;
        }
        const d = body;

        _fTotalReceber = d.total_receber_num || 0;

        // Banner
        const banner  = document.getElementById("pb-banner");
        const temAnt  = d.antecipado_num > 0;
        // Q2 Maio/2026 em diante: antecipação habilitada
        const ehPeriodoAnt = _fAno > 2026 || (_fAno === 2026 && (_fMes > 5 || (_fMes === 5 && _fQuinzena >= 2)));
        banner.className = "painel-banner " + (d.total_receber_num < 0 ? "banner-negativo" : "banner-positivo");
        document.getElementById("pb-eyebrow").innerText = temAnt ? "Valor bruto do período" : "Valor a receber no período";
        document.getElementById("pb-total-receber").innerText = d.total_receber;
        document.getElementById("pb-total-entregues").innerText = d.total_entregues;
        document.getElementById("pb-pagamento").style.display = "none";

        const antRow  = document.getElementById("pb-ant-row");
        const antInfo = d.antecipacao_info || null;
        if (ehPeriodoAnt) {
            antRow.style.display = "";
            if (temAnt) {
                antRow.innerHTML = `
                <div style="border:1px solid rgba(58,134,255,0.25);background:rgba(58,134,255,0.07);border-radius:14px;padding:12px 16px;display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
                    <div style="color:#3a86ff;flex-shrink:0;margin-top:1px">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#3a86ff;margin-bottom:5px">Saldo disponível na Trampay</div>
                        <div style="font-size:12px;color:#94a3b8">
                            Antecipado: <strong style="color:#e2e8f0">${d.antecipado}</strong>
                        </div>
                        ${(() => {
                            const liquidoNum = (d.total_receber_num || 0) - (d.antecipado_num || 0);
                            if (liquidoNum > 0.01) {
                                const dataPrev = _calcularDataPagamento(_fMes, _fAno, _fQuinzena);
                                return `<div style="font-size:12px;color:#94a3b8;margin-top:3px">Saldo a receber em ${dataPrev}: <strong style="color:#e2e8f0">${d.liquido}</strong></div>`;
                            }
                            return "";
                        })()}
                        <div style="font-size:11px;color:#f59e0b;margin-top:6px">Acesse o WhatsApp da Trampay para solicitar o adiantamento.</div>
                    </div>
                </div>`;
            } else if (antInfo && (antInfo.status === "pendente" || antInfo.status === "aprovada")) {
                antRow.innerHTML = `
                <div style="border:1px solid rgba(234,179,8,0.2);background:rgba(234,179,8,0.06);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:10px;font-size:12px;color:#eab308;margin-bottom:12px">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    Solicitação enviada — aguardando liberação do saldo na Trampay
                </div>`;
            } else {
                const dataPrev = _calcularDataPagamento(_fMes, _fAno, _fQuinzena);
                antRow.innerHTML = `
                <div style="font-size:12px;color:#64748b;padding:4px 2px">
                    Previsão de recebimento: <strong style="color:#94a3b8">${dataPrev}</strong>
                </div>`;
            }
        } else {
            antRow.style.display = "none";
        }

        _renderPgtoStatusCard(d);

        // Ajustes
        document.getElementById("paj-adicional").innerText    = d.adicional;
        document.getElementById("paj-adicional-card").className = "paj-card " + (_parseMoeda(d.adicional) < 0 ? "negativo" : "positivo");
        document.getElementById("paj-deslocamento").innerText = d.deslocamento;
        document.getElementById("paj-grandes").innerText      = d.valor_grandes;
        if (document.getElementById("paj-grandes-q")) document.getElementById("paj-grandes-q").innerText = d.qtd_grandes + " pacotes";
        const _descTotal = [...(d.extravios_linhas||[]), ...(d.multas_linhas||[])]
            .filter(x => x.tem_valor)
            .reduce((a, x) => a + _parseMoeda(x.valor), 0);
        document.getElementById("paj-descontos").innerText = _descTotal > 0
            ? "R$ " + _descTotal.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})
            : d.descontos;
        document.getElementById("paj-descontos-card").className = "paj-card " + (_descTotal > 0 ? "negativo" : "");
        const _ticketNum = _parseMoeda(d.desconto_ticket);
        document.getElementById("paj-ticket").innerText = d.desconto_ticket;
        document.getElementById("paj-ticket-card").className = "paj-card " + (_ticketNum > 0 ? "negativo" : "");

        // Transportadoras
        document.getElementById("pt-loggi-v").innerText  = d.valor_loggi;
        document.getElementById("pt-loggi-q").innerText  = d.entregues_loggi + " pacotes";
        document.getElementById("pt-jt-v").innerText     = d.valor_jt;
        document.getElementById("pt-jt-q").innerText     = d.entregues_jt + " pacotes";
        document.getElementById("pt-imile-v").innerText  = d.valor_imile;
        document.getElementById("pt-imile-q").innerText  = d.qtd_imile + " pacotes";
        document.getElementById("pt-anjun-v").innerText  = d.valor_anjun;
        document.getElementById("pt-anjun-q").innerText  = d.entregues_anjun + " pacotes";
        document.getElementById("pt-shopee-v").innerText = d.valor_shopee;
        document.getElementById("pt-shopee-q").innerText = d.entregues_shopee + " pacotes";
        document.getElementById("pt-coletas-v").innerText = d.valor_coletas;
        document.getElementById("pt-coletas-q").innerText = d.qtd_coletas + " coletas";
        document.getElementById("pt-totalexpress-v").innerText = d.valor_total_express;
        document.getElementById("pt-totalexpress-q").innerText = d.entregues_total_express + " pacotes";

        // Extravios
        _renderExtravios(d.extravios_linhas, "extravios-lista", true);

        // Multas
        _renderMultas(d.multas_linhas, "multas-lista", true);

        empty.classList.remove("sk-mode");
        empty.style.display = "none";
        data.style.display  = "";
        _carregarNota();
    })
    .catch(() => {
        empty.classList.remove("sk-mode");
        empty.innerText = "Erro ao conectar com o servidor.";
    });
}

// ───── NAVEGAÇÃO RÁPIDA: CHIP → FECHAMENTO ─────
function irParaFechamentoPeriodo(mes, ano, quinzena) {
    _fMes = mes;
    _fAno = ano;
    _iniciarSelects();
    document.getElementById("sel-mes").value = mes;
    document.getElementById("fechamento-data").style.display = "none";

    if (quinzena) {
        _fQuinzena = quinzena;
        document.getElementById("btn-1q").classList.toggle("active", quinzena === 1);
        document.getElementById("btn-2q").classList.toggle("active", quinzena === 2);
        document.getElementById("fechamento-empty").style.display = "none";
        mostrarTela("tela-fechamentos");
        _carregarPainel();
    } else {
        _fQuinzena = null;
        document.getElementById("btn-1q").classList.remove("active");
        document.getElementById("btn-2q").classList.remove("active");
        document.getElementById("fechamento-empty").innerText = "Selecione uma quinzena para ver o fechamento.";
        document.getElementById("fechamento-empty").style.display = "";
        mostrarTela("tela-fechamentos");
    }
}

// ───── RELATÓRIO DETALHADO POR DRIVER (planilhas reais das transportadoras) ─────
let _relDriverDados   = null;
let _relDriverArquivo = "Relatorio.xlsx";
let _relDriverChart   = null;

const _REL_DRIVER_LABELS = { "JET": "J&T", "Imile": "iMile" };
const _REL_DRIVER_CORES  = { "Loggi": "#12A5E8", "Anjun": "#22C55E", "Imile": "#9333EA", "JET": "#EF4444", "Total Express": "#3a86ff" };

// Painel do entregador (Meus Fechamentos) — usa o período selecionado na tela.
// transp (opcional) = mostra só aquela transportadora (clique direto no card dela).
function abrirRelatorioDriver(transp) {
    if (!_fQuinzena) return;
    const label  = transp ? (_REL_DRIVER_LABELS[transp] || transp) : null;
    const sufixo = transp ? `_${label.replace("&", "e").replace(/\s+/g, "")}` : "";
    _abrirRelatorioDriverCom(
        `${API}/painel/relatorio-driver?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`,
        `${label ? label + " — " : ""}${MESES[_fMes - 1]} / ${_fAno} — ${_fQuinzena}ª quinzena`,
        `Relatorio${sufixo}_${String(_fMes).padStart(2, "0")}-${_fAno}_Q${_fQuinzena}.xlsx`,
        transp
    );
}

// Visão do admin (Fechamento → Pesquisar) — mesmo modal, para o entregador selecionado
function abrirRelatorioDriverAdmin(transp) {
    if (!_admFQuinzena || !_admFEntregador) return;
    const label  = transp ? (_REL_DRIVER_LABELS[transp] || transp) : null;
    const sufixo = transp ? `_${label.replace("&", "e").replace(/\s+/g, "")}` : "";
    _abrirRelatorioDriverCom(
        `${API}/admin/relatorio-driver?mes=${_admFMes}&ano=${_admFAno}&quinzena=${_admFQuinzena}&entregador=${encodeURIComponent(_admFEntregador)}`,
        `${_admFEntregador} — ${label ? label + " — " : ""}${MESES[_admFMes - 1]} / ${_admFAno} — ${_admFQuinzena}ª quinzena`,
        `Relatorio_${_admFEntregador.replace(/[\\/:*?"<>|]/g, "")}${sufixo}_${String(_admFMes).padStart(2, "0")}-${_admFAno}_Q${_admFQuinzena}.xlsx`,
        transp
    );
}

function _abrirRelatorioDriverCom(url, subtitulo, nomeArquivo, filtroTransp) {
    _relDriverDados   = null;
    _relDriverArquivo = nomeArquivo;
    const body = document.getElementById("rd-body");
    document.getElementById("rd-sub").innerText = subtitulo;
    document.getElementById("rd-btn-baixar").disabled = true;
    body.innerHTML = `<div style="color:#64748b;font-size:13px;padding:24px 0;text-align:center">Carregando relatório...</div>`;
    _abrirModal("modal-relatorio-driver");

    fetch(url, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json().then(b => ({ ok: res.ok, b })))
    .then(({ ok, b }) => {
        if (!ok) {
            body.innerHTML = `<div style="color:#ef4444;font-size:13px;padding:24px 0;text-align:center">${b.error || "Erro ao carregar o relatório."}</div>`;
            return;
        }
        let lista = b.transportadoras || [];
        if (filtroTransp) lista = lista.filter(t => t.transportadora === filtroTransp);
        if (!lista.length) {
            const onde = filtroTransp ? `na ${_REL_DRIVER_LABELS[filtroTransp] || filtroTransp}` : "nos relatórios";
            body.innerHTML = `<div style="color:#64748b;font-size:13px;padding:24px 0;text-align:center">Nenhuma entrega encontrada ${onde} nesse período.</div>`;
            return;
        }
        _relDriverDados = { transportadoras: lista };
        document.getElementById("rd-btn-baixar").disabled = false;

        // Resumo geral de prazo (soma do que está sendo exibido)
        const totDentro = lista.reduce((s, t) => s + (t.dentro_prazo || 0), 0);
        const totFora   = lista.reduce((s, t) => s + (t.fora_prazo   || 0), 0);
        const totSem    = lista.reduce((s, t) => s + (t.sem_prazo    || 0), 0);
        const totPrazo  = totDentro + totFora;
        const pctDentro = totPrazo ? ((totDentro / totPrazo) * 100).toFixed(1) : "0.0";
        const pctFora   = totPrazo ? ((totFora   / totPrazo) * 100).toFixed(1) : "0.0";

        const legenda = (cor, nome, qtd, pct) => `
            <div style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:#94a3b8;padding:3px 0">
                <span style="width:9px;height:9px;border-radius:50%;background:${cor};flex-shrink:0"></span>
                <span style="flex:1">${nome}</span>
                <strong style="color:#e2e8f0">${qtd}</strong>
                ${pct !== null ? `<span style="color:#64748b;min-width:48px;text-align:right">${pct}%</span>` : ""}
            </div>`;

        const chartHtml = totPrazo ? `
            <div style="display:flex;align-items:center;gap:18px;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:10px">
                <div style="width:110px;height:110px;position:relative;flex-shrink:0">
                    <canvas id="rd-pie"></canvas>
                    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
                        <div style="font-size:17px;font-weight:700;color:${totFora > totDentro ? "#ef4444" : "#22c55e"}">${pctDentro}%</div>
                        <div style="font-size:9.5px;color:#64748b">no prazo</div>
                    </div>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Prazo de entrega</div>
                    ${legenda("#22c55e", "Dentro do prazo", totDentro, pctDentro)}
                    ${legenda("#ef4444", "Fora do prazo", totFora, pctFora)}
                    ${totSem ? legenda("#64748b", "Sem informação", totSem, null) : ""}
                </div>
            </div>` : "";

        body.innerHTML = chartHtml + lista.map(t => {
            const label = _REL_DRIVER_LABELS[t.transportadora] || t.transportadora;
            const cor   = _REL_DRIVER_CORES[t.transportadora] || "#3a86ff";
            const temPrazo = (t.dentro_prazo || 0) + (t.fora_prazo || 0) > 0;
            return `
            <div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px;margin-bottom:10px">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px">
                    <div style="display:flex;align-items:center;gap:8px">
                        <span style="width:9px;height:9px;border-radius:50%;background:${cor};flex-shrink:0"></span>
                        <strong style="font-size:14px;color:#e2e8f0">${label}</strong>
                    </div>
                    <div style="font-size:13px;color:#94a3b8">${t.quantidade} entrega${t.quantidade !== 1 ? "s" : ""} · <strong style="color:#e2e8f0">${t.valor}</strong></div>
                </div>
                ${temPrazo ? `
                <div style="display:flex;align-items:center;gap:14px;font-size:12px;padding:0 0 8px 17px">
                    <span style="color:#22c55e">✓ ${t.dentro_prazo} no prazo</span>
                    <span style="color:${t.fora_prazo ? "#ef4444" : "#64748b"}">✗ ${t.fora_prazo} fora do prazo</span>
                    ${t.sem_prazo ? `<span style="color:#64748b">${t.sem_prazo} sem info</span>` : ""}
                </div>` : ""}
                ${t.usuarios.map(u => `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;padding:4px 0 4px 17px;color:#94a3b8">
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.usuario}</span>
                        <span style="flex-shrink:0">${u.quantidade} · ${u.valor}</span>
                    </div>`).join("")}
            </div>`;
        }).join("");

        if (totPrazo) {
            if (_relDriverChart) { _relDriverChart.destroy(); _relDriverChart = null; }
            const dados  = [totDentro, totFora];
            const cores  = ["#22c55e", "#ef4444"];
            if (totSem) { dados.push(totSem); cores.push("#64748b"); }
            _relDriverChart = new Chart(document.getElementById("rd-pie").getContext("2d"), {
                type: "doughnut",
                data: {
                    labels: totSem ? ["Dentro do prazo", "Fora do prazo", "Sem informação"] : ["Dentro do prazo", "Fora do prazo"],
                    datasets: [{ data: dados, backgroundColor: cores, borderColor: "#0b0f18", borderWidth: 2, hoverOffset: 4 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: "70%",
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => {
                            const tot = dados.reduce((a, b) => a + b, 0);
                            const pct = tot ? ((ctx.raw / tot) * 100).toFixed(1) : "0.0";
                            return ` ${ctx.raw} (${pct}%)`;
                        }}}
                    }
                }
            });
        }
    })
    .catch(() => {
        body.innerHTML = `<div style="color:#ef4444;font-size:13px;padding:24px 0;text-align:center">Erro ao conectar com o servidor.</div>`;
    });
}

function _baixarRelatorioDriver() {
    if (!_relDriverDados) return;
    const lista = _relDriverDados.transportadoras;
    const wb = XLSX.utils.book_new();

    // Primeira aba "Todas" com tudo junto (união das colunas, na ordem em que aparecem)
    if (lista.length > 1) {
        const todasCab = [];
        lista.forEach(t => t.cabecalho.forEach(c => { if (!todasCab.includes(c)) todasCab.push(c); }));
        const todasLinhas = [];
        lista.forEach(t => {
            const idx = todasCab.map(c => t.cabecalho.indexOf(c));
            t.linhas.forEach(l => todasLinhas.push(idx.map(i => (i >= 0 ? (l[i] !== undefined ? l[i] : "") : ""))));
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([todasCab, ...todasLinhas]), "Todas");
    }

    lista.forEach(t => {
        const ws = XLSX.utils.aoa_to_sheet([t.cabecalho, ...t.linhas]);
        const nomeAba = (_REL_DRIVER_LABELS[t.transportadora] || t.transportadora).slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, nomeAba);
    });
    XLSX.writeFile(wb, _relDriverArquivo);
}

function irParaAdminFechamentoPeriodo(mes, ano, quinzena) {
    _admFMes = mes;
    _admFAno = ano;
    _admFQuinzena = quinzena || null;
    _admFEntregador = "";
    _admEntregadoresLista = [];
    _iniciarSelectsAdmFech();
    document.getElementById("adm-fech-mes").value = mes;
    document.getElementById("adm-fech-data").style.display = "none";
    document.getElementById("adm-search-input").value = "";
    document.getElementById("adm-search-input-area").style.display = "";
    document.getElementById("adm-selected-chip").style.display = "none";
    document.getElementById("adm-dropdown").style.display = "none";
    document.getElementById("adm-ent-section").style.display = "none";

    if (quinzena) {
        document.getElementById("adm-btn-1q").classList.toggle("active", quinzena === 1);
        document.getElementById("adm-btn-2q").classList.toggle("active", quinzena === 2);
    } else {
        document.getElementById("adm-btn-1q").classList.remove("active");
        document.getElementById("adm-btn-2q").classList.remove("active");
    }

    mostrarTela("tela-admin-fechamentos");

    if (quinzena) {
        buscarQuinzenaAdmin();
    } else {
        document.getElementById("adm-fech-empty").innerText = "Selecione a quinzena para ver os entregadores.";
        document.getElementById("adm-fech-empty").style.display = "";
    }
}
