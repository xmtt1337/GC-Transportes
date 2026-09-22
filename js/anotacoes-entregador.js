// ───── ENTREGADOR: ANOTAÇÕES (Transportadoras / Por Dia / Quinzenas) ─────
// Três telas debaixo do menu "Anotações": cadastro de transportadoras + valor/pacote,
// lançamento diário de quantidade, e o total consolidado por quinzena (incluindo o total por
// transportadora em cada dia). O valor/pacote é travado no dia em que cada lançamento é
// CRIADO (ver PUT /entregador/anotacoes/lancamentos no backend) — reeditar a quantidade de um
// dia já lançado não muda o valor travado dele; só lançamentos novos nascem com o valor atual.

let _aqMinhas = [];       // transportadoras ativas do entregador
let _aqDisponiveis = [];  // do catálogo, ainda não adicionadas

const MESES_AQ = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                   "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function _aqMoeda(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function _aqCarregarTransportadoras(aoTerminar) {
    const tok = localStorage.getItem("token");
    return fetch(`${API}/entregador/anotacoes/transportadoras`, { headers: { "Authorization": "Bearer " + tok } })
        .then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _aqMinhas = data.minhas || [];
            _aqDisponiveis = data.disponiveis || [];
            if (aoTerminar) aoTerminar();
        }).catch(() => gcAlert("Erro ao carregar suas transportadoras."));
}

// ══════════════════════════ TELA: TRANSPORTADORAS ══════════════════════════

function abrirAnotacoesTransportadoras(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-aq-transportadoras");
    _aqCarregarTransportadoras(_aqRenderTransportadoras);
}

function _aqRenderTransportadoras() {
    const lista = document.getElementById("aq-transp-list");
    const addBtn = document.getElementById("aq-add-btn");
    if (!lista) return;
    if (!_aqMinhas.length) {
        lista.innerHTML = `<div class="aq-qty-empty">Você ainda não adicionou nenhuma transportadora.</div>`;
    } else {
        lista.innerHTML = _aqMinhas.map(t => `
            <div class="aq-transp-card">
                <div class="aq-transp-nome">${t.rotulo}</div>
                <div class="aq-transp-valor-wrap">
                    R$
                    <input type="number" class="aq-transp-valor-input" min="0" step="0.01"
                           id="aq-valor-${t.id}" value="${Number(t.valor_pacote).toFixed(2)}"
                           onblur="_aqSalvarValor(${t.id})">
                    /pacote
                </div>
                <button class="aq-transp-del" title="Excluir transportadora" onclick="_aqExcluirTransportadora(${t.id},'${t.rotulo.replace(/'/g,"\\'")}')">✕</button>
            </div>
        `).join("");
    }
    if (addBtn) addBtn.style.display = _aqDisponiveis.length ? "" : "none";
}

function _aqSalvarValor(id) {
    const input = document.getElementById(`aq-valor-${id}`);
    const valor = Number(input.value);
    if (!Number.isFinite(valor) || valor < 0) { gcAlert("Valor por pacote inválido."); return; }
    const tok = localStorage.getItem("token");
    fetch(`${API}/entregador/anotacoes/transportadoras/${id}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ valor_pacote: valor })
    }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            const t = _aqMinhas.find(x => x.id === id);
            if (t) t.valor_pacote = valor;
        }).catch(() => gcAlert("Erro ao salvar o valor por pacote."));
}

function _aqExcluirTransportadora(id, nome) {
    gcConfirm(
        `Excluir "${nome}" da sua lista?\n\nOs lançamentos que você já fez com ela continuam no histórico — você só deixa de vê-la pra lançar novos dias. Pode adicionar de novo quando quiser.`,
        () => {
            const tok = localStorage.getItem("token");
            fetch(`${API}/entregador/anotacoes/transportadoras/${id}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + tok }
            }).then(r => r.json())
                .then(data => {
                    if (data.error) { gcAlert(data.error); return; }
                    _aqCarregarTransportadoras(_aqRenderTransportadoras);
                }).catch(() => gcAlert("Erro ao excluir a transportadora."));
        }, "Excluir transportadora", "Excluir"
    );
}

function _aqAbrirModalAdicionar() {
    const sel = document.getElementById("aq-modal-transp-select");
    sel.innerHTML = _aqDisponiveis.map(t => `<option value="${t.codigo}">${t.rotulo}</option>`).join("");
    document.getElementById("aq-modal-transp-valor").value = "";
    document.getElementById("aq-modal-transp-erro").innerText = "";
    _abrirModal("modal-aq-transportadora");
}

function _aqSalvarNovaTransportadora() {
    const transportadora = document.getElementById("aq-modal-transp-select").value;
    const valor_pacote = Number(document.getElementById("aq-modal-transp-valor").value || 0);
    const erro = document.getElementById("aq-modal-transp-erro");
    if (!transportadora) { erro.innerText = "Escolha uma transportadora."; return; }
    if (!Number.isFinite(valor_pacote) || valor_pacote < 0) { erro.innerText = "Informe um valor por pacote válido."; return; }
    const tok = localStorage.getItem("token");
    fetch(`${API}/entregador/anotacoes/transportadoras`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ transportadora, valor_pacote })
    }).then(r => r.json())
        .then(data => {
            if (data.error) { erro.innerText = data.error; return; }
            _fecharModal("modal-aq-transportadora");
            _aqCarregarTransportadoras(_aqRenderTransportadoras);
        }).catch(() => { erro.innerText = "Erro ao adicionar transportadora."; });
}

// ══════════════════════════ TELA: ANOTAÇÕES POR DIA ══════════════════════════

let _aqDiaLancamentos = []; // lançamentos da quinzena do dia selecionado, pra achar os do dia exato

function abrirAnotacoesPorDia(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-aq-por-dia");
    const input = document.getElementById("aq-dia");
    if (!input.value) input.value = new Date().toISOString().slice(0, 10);
    _aqCarregarTransportadoras(() => _aqCarregarDia());
}

function _aqQuinzenaDoDia(diaISO) {
    const [ano, mes, dia] = diaISO.split("-").map(Number);
    return { ano, mes, quinzena: dia <= 15 ? 1 : 2 };
}

function _aqCarregarDia() {
    const dia = document.getElementById("aq-dia").value;
    if (!dia) return;
    const { mes, ano, quinzena } = _aqQuinzenaDoDia(dia);
    document.getElementById("aq-dia-periodo-info").innerText =
        `Esse dia entra na ${quinzena}ª Quinzena de ${MESES_AQ[mes - 1]}/${ano}.`;
    const tok = localStorage.getItem("token");
    fetch(`${API}/entregador/anotacoes/lancamentos?mes=${mes}&ano=${ano}&quinzena=${quinzena}`, {
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _aqDiaLancamentos = data.lancamentos || [];
            _aqRenderDiaForm();
        }).catch(() => gcAlert("Erro ao carregar os lançamentos do dia."));
}

function _aqRenderDiaForm() {
    const wrap = document.getElementById("aq-dia-form");
    if (!wrap) return;
    const dia = document.getElementById("aq-dia").value;
    if (!_aqMinhas.length) {
        wrap.innerHTML = `<div class="aq-qty-empty">Adicione uma transportadora em "Transportadoras" pra poder lançar quantidade.</div>`;
        return;
    }
    wrap.innerHTML = _aqMinhas.map(t => {
        const existente = _aqDiaLancamentos.find(l => l.transportadora_id === t.id && l.dia.slice(0, 10) === dia);
        return `
            <div class="aq-qty-row">
                <div class="aq-qty-nome">${t.rotulo}</div>
                <input type="number" class="aq-qty-input" min="0" step="1"
                       id="aq-qtd-${t.id}" placeholder="0"
                       value="${existente ? existente.quantidade : ""}"
                       onblur="_aqSalvarQtd(${t.id})">
                ${existente ? `<button class="aq-table-del" onclick="_aqExcluirLancamentoDoDia(${existente.id})">Excluir</button>` : ""}
            </div>
        `;
    }).join("");
}

function _aqSalvarQtd(transportadoraId) {
    const input = document.getElementById(`aq-qtd-${transportadoraId}`);
    if (input.value === "") return; // vazio não lança nada — apagar um lançamento é pelo botão Excluir
    const quantidade = parseInt(input.value, 10);
    if (!Number.isInteger(quantidade) || quantidade < 0) { gcAlert("Quantidade inválida."); return; }
    const dia = document.getElementById("aq-dia").value;
    const tok = localStorage.getItem("token");
    fetch(`${API}/entregador/anotacoes/lancamentos`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({ transportadora_id: transportadoraId, dia, quantidade })
    }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _aqCarregarDia();
        }).catch(() => gcAlert("Erro ao salvar o lançamento."));
}

function _aqExcluirLancamentoDoDia(id) {
    gcConfirm("Excluir este lançamento?", () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/entregador/anotacoes/lancamentos/${id}`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json())
            .then(data => {
                if (data.error) { gcAlert(data.error); return; }
                _aqCarregarDia();
            }).catch(() => gcAlert("Erro ao excluir o lançamento."));
    }, "Excluir lançamento", "Excluir");
}

// ══════════════════════════ TELA: QUINZENAS ══════════════════════════

let _aqQMes = new Date().getMonth() + 1;
let _aqQAno = new Date().getFullYear();
let _aqQQuinzena = new Date().getDate() <= 15 ? 1 : 2;
let _aqQLancamentos = [];

function abrirAnotacoesQuinzenas(event) {
    if (event) event.preventDefault();
    _aqQIniciarSelects();
    mostrarTela("tela-aq-quinzenas");
    _aqQCarregar();
}

function _aqQIniciarSelects() {
    const selMes = document.getElementById("aqq-sel-mes");
    const selAno = document.getElementById("aqq-sel-ano");
    selMes.value = _aqQMes;
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _aqQAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("aqq-btn-1q").classList.toggle("active", _aqQQuinzena === 1);
    document.getElementById("aqq-btn-2q").classList.toggle("active", _aqQQuinzena === 2);
}

function _aqQFiltrarPeriodo() {
    _aqQMes = parseInt(document.getElementById("aqq-sel-mes").value);
    _aqQAno = parseInt(document.getElementById("aqq-sel-ano").value);
    _aqQCarregar();
}

function _aqQSelecionarQuinzena(q) {
    _aqQQuinzena = q;
    document.getElementById("aqq-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("aqq-btn-2q").classList.toggle("active", q === 2);
    _aqQCarregar();
}

function _aqQCarregar() {
    const tok = localStorage.getItem("token");
    fetch(`${API}/entregador/anotacoes/lancamentos?mes=${_aqQMes}&ano=${_aqQAno}&quinzena=${_aqQQuinzena}`, {
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _aqQLancamentos = data.lancamentos || [];
            _aqQRenderPivot();
        }).catch(() => gcAlert("Erro ao carregar os lançamentos da quinzena."));

    fetch(`${API}/entregador/anotacoes/resumo?mes=${_aqQMes}&ano=${_aqQAno}&quinzena=${_aqQQuinzena}`, {
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
        .then(data => {
            if (data.error) return;
            document.getElementById("aqq-total-valor").innerText = _aqMoeda(data.total.valor_estimado);
            document.getElementById("aqq-total-qtd").innerText = data.total.quantidade_total;
            _aqQRenderResumoTransportadoras(data.transportadoras);
        }).catch(() => {});
}

function _aqQRenderResumoTransportadoras(transportadoras) {
    const wrap = document.getElementById("aqq-resumo-transp");
    if (!transportadoras || !transportadoras.length) {
        wrap.innerHTML = `<div class="aq-qty-empty">Nenhum lançamento nesta quinzena ainda.</div>`;
        return;
    }
    wrap.innerHTML = `
        <table class="aq-table">
            <thead><tr><th>Transportadora</th><th>Qtd</th><th>Valor est.</th></tr></thead>
            <tbody>
                ${transportadoras.map(t => `
                    <tr><td>${t.rotulo}</td><td class="aq-num">${t.quantidade_total}</td><td class="aq-num">${_aqMoeda(t.valor_estimado)}</td></tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

// Total por transportadora POR DIA: uma linha por dia que teve lançamento, uma coluna por
// transportadora que apareceu na quinzena — mesmo se ele já excluiu ela da lista "minhas"
// depois, o histórico continua aparecendo aqui.
function _aqQRenderPivot() {
    const empty = document.getElementById("aqq-pivot-empty");
    const wrap = document.getElementById("aqq-pivot-wrap");
    if (!_aqQLancamentos.length) {
        empty.style.display = ""; wrap.style.display = "none";
        return;
    }
    empty.style.display = "none"; wrap.style.display = "";

    const transportadoras = [...new Set(_aqQLancamentos.map(l => l.transportadora))]
        .sort((a, b) => cfgRotuloAnotacoes(a).localeCompare(cfgRotuloAnotacoes(b), "pt-BR"));
    const porDia = {};
    _aqQLancamentos.forEach(l => {
        const dia = l.dia.slice(0, 10);
        if (!porDia[dia]) porDia[dia] = {};
        porDia[dia][l.transportadora] = (porDia[dia][l.transportadora] || 0) + l.quantidade;
    });
    const dias = Object.keys(porDia).sort();

    const totalPorTransp = {};
    transportadoras.forEach(t => totalPorTransp[t] = 0);
    let totalGeral = 0;

    const linhas = dias.map(dia => {
        let totalDia = 0;
        const celulas = transportadoras.map(t => {
            const qtd = porDia[dia][t] || 0;
            totalPorTransp[t] += qtd;
            totalDia += qtd;
            return `<td class="aq-num">${qtd || "—"}</td>`;
        }).join("");
        totalGeral += totalDia;
        return `<tr><td>${dia.slice(8, 10)}/${dia.slice(5, 7)}</td>${celulas}<td class="aq-num" style="font-weight:700">${totalDia}</td></tr>`;
    }).join("");

    const rodape = `<tr class="aq-table-subtotal"><td>Total</td>${transportadoras.map(t => `<td class="aq-num">${totalPorTransp[t]}</td>`).join("")}<td class="aq-num">${totalGeral}</td></tr>`;

    document.getElementById("aqq-pivot-head").innerHTML =
        `<tr><th>Dia</th>${transportadoras.map(t => `<th>${cfgRotuloAnotacoes(t)}</th>`).join("")}<th>Total</th></tr>`;
    document.getElementById("aqq-pivot-body").innerHTML = linhas + rodape;
}

// Catálogo de rótulos, duplicado do backend (modules/anotacoes-quantidade/config.js) só pro
// texto — a validação de verdade é sempre no servidor.
const _AQ_ROTULOS = {
    spx: "Shopee / SPX Express", imile: "iMile", anjun: "Anjun", total_express: "Total Express",
    abatti: "Abatti", jt_express: "J&T Express", loggi: "Loggi", magalog: "Magalog",
    azul_cargo: "Azul Cargo Express", sequoia: "Sequoia", jadlog: "Jadlog", redesul: "RedeSul",
    dialogo: "Diálogo", direct: "Direct",
};
function cfgRotuloAnotacoes(codigo) {
    return _AQ_ROTULOS[codigo] || codigo;
}
