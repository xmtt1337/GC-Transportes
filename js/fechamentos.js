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

function _calcularDataPagamento(mes, ano, quinzena, ativadoAt) {
    // Q1 Jun/2026 em diante: conta 45 dias a partir de quando o admin ativou a planilha
    const usarAtivado = ativadoAt && (ano > 2026 || (ano === 2026 && mes >= 6));
    const base = usarAtivado
        ? new Date(ativadoAt)
        : (quinzena === 1 ? new Date(ano, mes - 1, 15) : new Date(ano, mes, 0));
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
                                const dataPrev = _calcularDataPagamento(_fMes, _fAno, _fQuinzena, d.planilha_ativado_at);
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
                const dataPrev = _calcularDataPagamento(_fMes, _fAno, _fQuinzena, d.planilha_ativado_at);
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
        const _descTotal = [...(d.extravios_linhas||[]), ...(d.multas_linhas||[])]
            .filter(x => x.tem_valor)
            .reduce((a, x) => a + _parseMoeda(x.valor), 0);
        document.getElementById("paj-descontos").innerText = _descTotal > 0
            ? "R$ " + _descTotal.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})
            : d.descontos;
        document.getElementById("paj-ticket").innerText       = d.desconto_ticket;

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

        // Extravios
        _renderExtravios(d.extravios_linhas, "extravios-lista", true);

        // Multas
        const multTbody = document.getElementById("multas-tbody");
        multTbody.innerHTML = d.multas_linhas.length
            ? d.multas_linhas.map(m => {
                const msg = encodeURIComponent(`Olá! Eu gostaria de contestar uma multa da ${m.transportadora}.\nCódigo: ${m.codigo}`);
                const wa = `<a class="extr-wa" href="https://wa.me/554991984179?text=${msg}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.554 4.103 1.523 5.824L0 24l6.338-1.502A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.79 9.79 0 0 1-5.001-1.372l-.36-.214-3.761.892.952-3.656-.235-.374A9.79 9.79 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>Contestar</a>`;
                return `<tr>
                <td class="mono">${m.transportadora}</td>
                <td class="mono">${m.codigo}</td>
                <td class="${m.tem_valor ? 'val-neg' : ''}">${m.valor}</td>
                <td>${wa}</td>
              </tr>`;
            }).join("")
            : `<tr><td colspan="4" class="poc-empty">Nenhuma multa no período</td></tr>`;

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
