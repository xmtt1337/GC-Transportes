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
            if (body.nf_pendente) {
                empty.innerHTML = `
                    <div style="max-width:440px;margin:0 auto;text-align:center;padding:8px 0">
                        <div style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        </div>
                        <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:8px">Regularize a nota fiscal pendente</div>
                        <div style="font-size:13.5px;color:#94a3b8;line-height:1.6;margin-bottom:20px">${body.error}</div>
                        <button onclick="abrirMinhasNFs()" style="padding:11px 22px;border-radius:10px;border:none;background:#3a86ff;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Ir para Notas Fiscais</button>
                    </div>`;
            } else {
                empty.innerText = body.error || "Nenhum fechamento encontrado para este período.";
            }
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
const _REL_DRIVER_CORES  = { "Loggi": "#12A5E8", "Anjun": "#22C55E", "Imile": "#9333EA", "JET": "#EF4444", "Total Express": "#3a86ff", "Shopee": "#F97316" };

// Nome do arquivo baixado, bem descritivo:
// "Relatorio Fechamento - <Entregador> - <Transportadora|Todas> - 2ª Quinzena Junho 2026.xlsx"
function _relDriverNomeArquivo(entregador, transpLabel, mes, ano, quinzena) {
    const partes = [
        "Relatorio Fechamento",
        entregador || null,
        transpLabel || "Todas Transportadoras",
        `${quinzena}ª Quinzena ${MESES[mes - 1]} ${ano}`,
    ].filter(Boolean);
    return partes.join(" - ").replace(/[\\/:*?"<>|]/g, "") + ".xlsx";
}

// Painel do entregador (Meus Fechamentos) — usa o período selecionado na tela.
// transp (opcional) = mostra só aquela transportadora (clique direto no card dela).
function abrirRelatorioDriver(transp) {
    if (!_fQuinzena) return;
    const label = transp ? (_REL_DRIVER_LABELS[transp] || transp) : null;
    const nome  = (window._gcUser && window._gcUser.displayName) || "";
    _abrirRelatorioDriverCom(
        `${API}/painel/relatorio-driver?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`,
        `${label ? label + " — " : ""}${MESES[_fMes - 1]} / ${_fAno} — ${_fQuinzena}ª quinzena`,
        _relDriverNomeArquivo(nome, label, _fMes, _fAno, _fQuinzena),
        transp
    );
}

// Visão do admin (Fechamento → Pesquisar) — mesmo modal, para o entregador selecionado
function abrirRelatorioDriverAdmin(transp) {
    if (!_admFQuinzena || !_admFEntregador) return;
    const label = transp ? (_REL_DRIVER_LABELS[transp] || transp) : null;
    _abrirRelatorioDriverCom(
        `${API}/admin/relatorio-driver?mes=${_admFMes}&ano=${_admFAno}&quinzena=${_admFQuinzena}&entregador=${encodeURIComponent(_admFEntregador)}`,
        `${_admFEntregador} — ${label ? label + " — " : ""}${MESES[_admFMes - 1]} / ${_admFAno} — ${_admFQuinzena}ª quinzena`,
        _relDriverNomeArquivo(_admFEntregador, label, _admFMes, _admFAno, _admFQuinzena),
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
        // Só habilita o download se houver linhas detalhadas (a Shopee, por ora,
        // vem só com o resumo — sem relatório completo pra baixar)
        document.getElementById("rd-btn-baixar").disabled = !lista.some(t => t.linhas && t.linhas.length);

        // Resumo geral de prazo (soma do que está sendo exibido). Os campos só existem
        // na resposta do backend atualizado — se não vierem, a seção não é montada.
        const temCamposPrazo = lista.some(t => t.dentro_prazo !== undefined);
        const totDentro = lista.reduce((s, t) => s + (t.dentro_prazo || 0), 0);
        const totFora   = lista.reduce((s, t) => s + (t.fora_prazo   || 0), 0);
        const totSem    = lista.reduce((s, t) => s + (t.sem_prazo    || 0), 0);
        const totPrazo  = totDentro + totFora;
        const pctDentro = totPrazo ? ((totDentro / totPrazo) * 100).toFixed(1) : "0.0";
        const pctFora   = totPrazo ? ((totFora   / totPrazo) * 100).toFixed(1) : "0.0";

        const legenda = (cor, nome, qtd, pct) => `
            <div class="rd-leg-row">
                <span class="rd-dot" style="background:${cor}"></span>
                <span class="rd-leg-nome">${nome}</span>
                <span class="rd-leg-qtd">${qtd}</span>
                ${pct !== null ? `<span class="rd-leg-pct">${pct}%</span>` : ""}
            </div>`;

        const chartHtml = (temCamposPrazo && totPrazo) ? `
            <div class="rd-chart-card">
                <div class="rd-donut">
                    <canvas id="rd-pie"></canvas>
                    <div class="rd-donut-center">
                        <div class="rd-donut-pct" style="color:${totFora > totDentro ? "#ef4444" : "#22c55e"}">${pctDentro}%</div>
                        <div class="rd-donut-sub">no prazo</div>
                    </div>
                </div>
                <div class="rd-legend">
                    <div class="rd-leg-title">Prazo de entrega</div>
                    ${legenda("#22c55e", "Dentro do prazo", totDentro, pctDentro)}
                    ${legenda("#ef4444", "Fora do prazo", totFora, pctFora)}
                </div>
            </div>` : "";

        // Quantidade e valor por cidade — agregado das transportadoras exibidas
        // (rows sem "Cidade" na planilha, como a Shopee, entram como "—" ou nem aparecem)
        const porCidadeAgg = {};
        lista.forEach(t => (t.cidades || []).forEach(c => {
            if (!porCidadeAgg[c.cidade]) porCidadeAgg[c.cidade] = { cidade: c.cidade, quantidade: 0, valor_num: 0 };
            porCidadeAgg[c.cidade].quantidade += c.quantidade;
            porCidadeAgg[c.cidade].valor_num  += c.valor_num;
        }));
        const cidadesOrdenadas = Object.values(porCidadeAgg).sort((a, b) => b.valor_num - a.valor_num);

        const cidadesHtml = cidadesOrdenadas.length ? `
            <div class="rd-transp-card">
                <div class="rd-transp-head">
                    <div class="rd-transp-nome">Por cidade</div>
                </div>
                ${cidadesOrdenadas.map(c => `
                    <div class="rd-usr-row">
                        <span class="rd-usr-nome">${c.cidade}</span>
                        <span class="rd-usr-val">${c.quantidade} · ${moedaJS(c.valor_num)}</span>
                    </div>`).join("")}
            </div>` : "";

        body.innerHTML = chartHtml + cidadesHtml + lista.map(t => {
            const label = _REL_DRIVER_LABELS[t.transportadora] || t.transportadora;
            const cor   = _REL_DRIVER_CORES[t.transportadora] || "#3a86ff";
            const temPrazo = ((t.dentro_prazo || 0) + (t.fora_prazo || 0)) > 0;
            return `
            <div class="rd-transp-card">
                <div class="rd-transp-head">
                    <div class="rd-transp-nome"><span class="rd-dot" style="background:${cor}"></span>${label}</div>
                    <div class="rd-transp-tot">${t.quantidade} entrega${t.quantidade !== 1 ? "s" : ""} · <strong>${t.valor}</strong></div>
                </div>
                ${temPrazo ? `
                <div class="rd-prazo-row">
                    <span style="color:#22c55e">✓ ${t.dentro_prazo} no prazo</span>
                    <span style="color:${t.fora_prazo ? "#ef4444" : "#64748b"}">✗ ${t.fora_prazo} fora do prazo</span>
                </div>` : ""}
                ${t.usuarios.map(u => `
                    <div class="rd-usr-row">
                        <span class="rd-usr-nome">${u.usuario}</span>
                        <span class="rd-usr-val">${u.quantidade} · ${u.valor}</span>
                    </div>`).join("")}
            </div>`;
        }).join("");

        if (temCamposPrazo && totPrazo > 0) {
            if (_relDriverChart) { _relDriverChart.destroy(); _relDriverChart = null; }
            const dados  = [];
            const cores  = [];
            const nomes  = [];
            if (totDentro) { dados.push(totDentro); cores.push("#22c55e"); nomes.push("Dentro do prazo"); }
            if (totFora)   { dados.push(totFora);   cores.push("#ef4444"); nomes.push("Fora do prazo"); }
            _relDriverChart = new Chart(document.getElementById("rd-pie").getContext("2d"), {
                type: "doughnut",
                data: {
                    labels: nomes,
                    datasets: [{ data: dados, backgroundColor: cores, borderColor: "#0b0f18", borderWidth: 2 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: "70%",
                    // Tooltip desligado: ao passar o mouse ele cobria o percentual do
                    // centro, e a legenda ao lado já mostra os mesmos números.
                    plugins: { legend: { display: false }, tooltip: { enabled: false } }
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
    // Só entram no arquivo as transportadoras com relatório completo (com linhas)
    const lista = _relDriverDados.transportadoras.filter(t => t.linhas && t.linhas.length);
    if (!lista.length) return;
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
