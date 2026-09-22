// ───── TELA ENTREGADOR: ANOTAÇÕES DE QUANTIDADE ─────
// O entregador registra, por conta própria, quanto entregou de cada transportadora, dia a
// dia, e configura sua própria estimativa de valor por pacote — é só uma referência pessoal
// dele, não altera o fechamento oficial em nenhum outro lugar do sistema.

let _aqMes = new Date().getMonth() + 1;
let _aqAno = new Date().getFullYear();
let _aqQuinzena = new Date().getDate() <= 15 ? 1 : 2;
let _aqMinhas = [];       // transportadoras ativas do entregador
let _aqDisponiveis = [];  // do catálogo, ainda não adicionadas
let _aqLancamentos = [];  // lançamentos da quinzena selecionada

function abrirAnotacoesQuantidade(event) {
    if (event) event.preventDefault();
    _aqIniciarSelects();
    _aqAtualizarLimitesDia();
    mostrarTela("tela-anotacoes-entregador");
    _aqCarregarTransportadoras();
    _aqCarregarLancamentos();
}

function _aqIniciarSelects() {
    const selMes = document.getElementById("aq-sel-mes");
    const selAno = document.getElementById("aq-sel-ano");
    selMes.value = _aqMes;
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _aqAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("aq-btn-1q").classList.toggle("active", _aqQuinzena === 1);
    document.getElementById("aq-btn-2q").classList.toggle("active", _aqQuinzena === 2);
}

function _aqFiltrarPeriodo() {
    _aqMes = parseInt(document.getElementById("aq-sel-mes").value);
    _aqAno = parseInt(document.getElementById("aq-sel-ano").value);
    _aqAtualizarLimitesDia();
    _aqCarregarLancamentos();
}

function _aqSelecionarQuinzena(q) {
    _aqQuinzena = q;
    document.getElementById("aq-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("aq-btn-2q").classList.toggle("active", q === 2);
    _aqAtualizarLimitesDia();
    _aqCarregarLancamentos();
}

// O campo de dia só aceita datas dentro da quinzena escolhida — lançar num dia de fora
// confundiria qual período ele está preenchendo.
function _aqAtualizarLimitesDia() {
    const mm = String(_aqMes).padStart(2, "0");
    const inicio = _aqQuinzena === 1 ? `${_aqAno}-${mm}-01` : `${_aqAno}-${mm}-16`;
    const fim = _aqQuinzena === 1 ? `${_aqAno}-${mm}-15` : `${_aqAno}-${mm}-${String(new Date(_aqAno, _aqMes, 0).getDate()).padStart(2, "0")}`;
    const input = document.getElementById("aq-dia");
    input.min = inicio; input.max = fim;
    const hoje = new Date().toISOString().slice(0, 10);
    input.value = (hoje >= inicio && hoje <= fim) ? hoje : inicio;
    _aqRenderDiaForm();
}

function _aqMoeda(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Minhas transportadoras ──────────────────────────────────────────────

function _aqCarregarTransportadoras() {
    const tok = localStorage.getItem("token");
    fetch(`${API}/entregador/anotacoes/transportadoras`, { headers: { "Authorization": "Bearer " + tok } })
        .then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _aqMinhas = data.minhas || [];
            _aqDisponiveis = data.disponiveis || [];
            _aqRenderTransportadoras();
            _aqRenderDiaForm();
        }).catch(() => gcAlert("Erro ao carregar suas transportadoras."));
}

function _aqRenderTransportadoras() {
    const lista = document.getElementById("aq-transp-list");
    const addBtn = document.getElementById("aq-add-btn");
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
    addBtn.style.display = _aqDisponiveis.length ? "" : "none";
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
                    _aqCarregarTransportadoras();
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
            _aqCarregarTransportadoras();
        }).catch(() => { erro.innerText = "Erro ao adicionar transportadora."; });
}

// ── Lançamento do dia ───────────────────────────────────────────────────

function _aqCarregarDia() {
    _aqRenderDiaForm();
}

function _aqRenderDiaForm() {
    const wrap = document.getElementById("aq-dia-form");
    if (!wrap) return;
    const dia = document.getElementById("aq-dia").value;
    if (!_aqMinhas.length) {
        wrap.innerHTML = `<div class="aq-qty-empty">Adicione uma transportadora acima pra poder lançar quantidade.</div>`;
        return;
    }
    wrap.innerHTML = _aqMinhas.map(t => {
        const existente = _aqLancamentos.find(l => l.transportadora_id === t.id && l.dia.slice(0, 10) === dia);
        return `
            <div class="aq-qty-row">
                <div class="aq-qty-nome">${t.rotulo}</div>
                <input type="number" class="aq-qty-input" min="0" step="1"
                       id="aq-qtd-${t.id}" placeholder="0"
                       value="${existente ? existente.quantidade : ""}"
                       onblur="_aqSalvarQtd(${t.id})">
            </div>
        `;
    }).join("");
}

function _aqSalvarQtd(transportadoraId) {
    const input = document.getElementById(`aq-qtd-${transportadoraId}`);
    if (input.value === "") return; // vazio não lança nada — apagar um lançamento é pela lista abaixo
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
            _aqCarregarLancamentos();
        }).catch(() => gcAlert("Erro ao salvar o lançamento."));
}

// ── Lançamentos da quinzena + resumo ────────────────────────────────────

function _aqCarregarLancamentos() {
    const tok = localStorage.getItem("token");
    fetch(`${API}/entregador/anotacoes/lancamentos?mes=${_aqMes}&ano=${_aqAno}&quinzena=${_aqQuinzena}`, {
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
        .then(data => {
            if (data.error) { gcAlert(data.error); return; }
            _aqLancamentos = data.lancamentos || [];
            _aqRenderLista();
            _aqRenderDiaForm();
        }).catch(() => gcAlert("Erro ao carregar os lançamentos da quinzena."));

    fetch(`${API}/entregador/anotacoes/resumo?mes=${_aqMes}&ano=${_aqAno}&quinzena=${_aqQuinzena}`, {
        headers: { "Authorization": "Bearer " + tok }
    }).then(r => r.json())
        .then(data => {
            if (data.error) return;
            document.getElementById("aq-total-valor").innerText = _aqMoeda(data.total.valor_estimado);
            document.getElementById("aq-total-qtd").innerText = data.total.quantidade_total;
        }).catch(() => {});
}

function _aqRenderLista() {
    const empty = document.getElementById("aq-lista-empty");
    const table = document.getElementById("aq-lista-table");
    if (!_aqLancamentos.length) {
        empty.style.display = ""; table.style.display = "none";
        return;
    }
    empty.style.display = "none"; table.style.display = "";
    document.getElementById("aq-lista-tbody").innerHTML = _aqLancamentos.map(l => `
        <tr>
            <td>${l.dia.slice(8, 10)}/${l.dia.slice(5, 7)}</td>
            <td>${cfgRotuloAnotacoes(l.transportadora)}</td>
            <td class="aq-num">${l.quantidade}</td>
            <td class="aq-num">${_aqMoeda(l.quantidade * l.valor_unit_no_lancamento)}</td>
            <td><button class="aq-table-del" onclick="_aqExcluirLancamento(${l.id})">Excluir</button></td>
        </tr>
    `).join("");
}

function _aqExcluirLancamento(id) {
    gcConfirm("Excluir este lançamento?", () => {
        const tok = localStorage.getItem("token");
        fetch(`${API}/entregador/anotacoes/lancamentos/${id}`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + tok }
        }).then(r => r.json())
            .then(data => {
                if (data.error) { gcAlert(data.error); return; }
                _aqCarregarLancamentos();
            }).catch(() => gcAlert("Erro ao excluir o lançamento."));
    }, "Excluir lançamento", "Excluir");
}

// Rótulo por código, sem depender de ter a transportadora ainda na lista "minhas" (ela pode
// ter sido excluída depois do lançamento) — mesma lista do catálogo do backend, duplicada
// aqui só pro texto; a validação de verdade é sempre no servidor.
const _AQ_ROTULOS = {
    spx: "Shopee / SPX Express", imile: "iMile", anjun: "Anjun", total_express: "Total Express",
    abatti: "Abatti", jt_express: "J&T Express", loggi: "Loggi", magalog: "Magalog",
    azul_cargo: "Azul Cargo Express", sequoia: "Sequoia", jadlog: "Jadlog", redesul: "RedeSul",
    dialogo: "Diálogo", direct: "Direct",
};
function cfgRotuloAnotacoes(codigo) {
    return _AQ_ROTULOS[codigo] || codigo;
}
