// ───── TELA DEV: RELATÓRIO DE ANOTAÇÕES DE QUANTIDADE ─────
// Consolidado por entregador/transportadora/quinzena — visão só de dev, ao lado do toggle
// que liga a tela pro entregador em Cadastros → Entregadores.

let _arMes = new Date().getMonth() + 1;
let _arAno = new Date().getFullYear();
let _arQuinzena = new Date().getDate() <= 15 ? 1 : 2;
let _arLinhas = [];
let _arTotal = { quantidade_total: 0, valor_estimado: 0 };

// Mesmo catálogo do backend (modules/anotacoes-quantidade/config.js), duplicado aqui só pro
// filtro/rótulo da tela — a validação de verdade é sempre no servidor.
const _AR_CATALOGO = [
    { codigo: "spx",           rotulo: "Shopee / SPX Express" },
    { codigo: "imile",         rotulo: "iMile" },
    { codigo: "anjun",         rotulo: "Anjun" },
    { codigo: "total_express", rotulo: "Total Express" },
    { codigo: "abatti",        rotulo: "Abatti" },
    { codigo: "jt_express",    rotulo: "J&T Express" },
    { codigo: "loggi",         rotulo: "Loggi" },
    { codigo: "magalog",       rotulo: "Magalog" },
    { codigo: "azul_cargo",    rotulo: "Azul Cargo Express" },
    { codigo: "sequoia",       rotulo: "Sequoia" },
    { codigo: "jadlog",        rotulo: "Jadlog" },
    { codigo: "redesul",       rotulo: "RedeSul" },
    { codigo: "dialogo",       rotulo: "Diálogo" },
    { codigo: "direct",        rotulo: "Direct" },
];

function abrirAnotacoesRelatorio(event) {
    if (event) event.preventDefault();
    _arIniciarSelects();
    mostrarTela("tela-anotacoes-relatorio");
    _arCarregarEntregadores();
    _arCarregarRelatorio();
}

function _arIniciarSelects() {
    const selMes = document.getElementById("ar-sel-mes");
    const selAno = document.getElementById("ar-sel-ano");
    selMes.value = _arMes;
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _arAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("ar-btn-1q").classList.toggle("active", _arQuinzena === 1);
    document.getElementById("ar-btn-2q").classList.toggle("active", _arQuinzena === 2);

    const selTransp = document.getElementById("ar-sel-transportadora");
    selTransp.innerHTML = `<option value="">Todas as transportadoras</option>` +
        _AR_CATALOGO.map(t => `<option value="${t.codigo}">${t.rotulo}</option>`).join("");
}

function _arCarregarEntregadores() {
    const tok = localStorage.getItem("token");
    fetch(`${API}/admin/usuarios?role=entregador`, { headers: { "Authorization": "Bearer " + tok } })
        .then(r => r.json())
        .then(users => {
            if (!Array.isArray(users)) return;
            const sel = document.getElementById("ar-sel-entregador");
            sel.innerHTML = `<option value="">Todos os entregadores</option>` +
                users.map(u => `<option value="${u.id}">${u.name || u.username}</option>`).join("");
        }).catch(() => {});
}

function _arFiltrarPeriodo() {
    _arMes = parseInt(document.getElementById("ar-sel-mes").value);
    _arAno = parseInt(document.getElementById("ar-sel-ano").value);
    _arCarregarRelatorio();
}

function _arSelecionarQuinzena(q) {
    _arQuinzena = q;
    document.getElementById("ar-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("ar-btn-2q").classList.toggle("active", q === 2);
    _arCarregarRelatorio();
}

function _arAplicarFiltros() {
    _arCarregarRelatorio();
}

function _arMoeda(n) {
    return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function _arCarregarRelatorio() {
    const tok = localStorage.getItem("token");
    const entregadorId = document.getElementById("ar-sel-entregador").value;
    const transportadora = document.getElementById("ar-sel-transportadora").value;
    const empty = document.getElementById("ar-empty");
    const table = document.getElementById("ar-table");
    empty.style.display = ""; empty.innerText = "Carregando...";
    table.style.display = "none";

    let url = `${API}/admin/anotacoes/relatorio?mes=${_arMes}&ano=${_arAno}&quinzena=${_arQuinzena}`;
    if (entregadorId) url += `&entregador_id=${entregadorId}`;
    if (transportadora) url += `&transportadora=${transportadora}`;

    fetch(url, { headers: { "Authorization": "Bearer " + tok } })
        .then(r => r.json())
        .then(data => {
            if (data.error) { empty.innerText = data.error; return; }
            _arLinhas = data.linhas || [];
            _arTotal = data.total || { quantidade_total: 0, valor_estimado: 0 };
            _arRenderTabela();
        }).catch(() => { empty.innerText = "Erro ao carregar o relatório."; });
}

function _arRenderTabela() {
    const empty = document.getElementById("ar-empty");
    const table = document.getElementById("ar-table");
    document.getElementById("ar-total-valor").innerText = _arMoeda(_arTotal.valor_estimado);
    document.getElementById("ar-total-qtd").innerText = _arTotal.quantidade_total;

    if (!_arLinhas.length) {
        empty.style.display = ""; empty.innerText = "Nenhum lançamento nesse período.";
        table.style.display = "none";
        return;
    }
    empty.style.display = "none"; table.style.display = "";

    // Subtotal por entregador: a query já vem ordenada por nome, então fechar o grupo assim
    // que o nome muda dá o subtotal sem precisar reagrupar tudo de novo.
    const linhasHtml = [];
    let atual = null, subQtd = 0, subValor = 0;
    const fecharGrupo = () => {
        if (atual === null) return;
        linhasHtml.push(`<tr class="aq-table-subtotal"><td colspan="2">Subtotal — ${atual}</td><td class="aq-num">${subQtd}</td><td class="aq-num">${_arMoeda(subValor)}</td></tr>`);
    };
    _arLinhas.forEach(l => {
        if (l.entregador !== atual) { fecharGrupo(); atual = l.entregador; subQtd = 0; subValor = 0; }
        subQtd += l.quantidade_total; subValor += l.valor_estimado;
        linhasHtml.push(`<tr><td>${l.entregador || "—"}</td><td>${l.rotulo}</td><td class="aq-num">${l.quantidade_total}</td><td class="aq-num">${_arMoeda(l.valor_estimado)}</td></tr>`);
    });
    fecharGrupo();
    document.getElementById("ar-tbody").innerHTML = linhasHtml.join("");
}

function _arExportarCsv() {
    if (!_arLinhas.length) return;
    const linhas = [["Entregador", "Transportadora", "Quantidade", "Valor estimado"]];
    _arLinhas.forEach(l => linhas.push([l.entregador || "", l.rotulo, l.quantidade_total, l.valor_estimado.toFixed(2).replace(".", ",")]));
    const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `anotacoes_quantidade_${_arMes}_${_arAno}_q${_arQuinzena}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}
