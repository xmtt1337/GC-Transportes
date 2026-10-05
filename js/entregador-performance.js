// Menu Performance > Por dia, no app do entregador (GET /entregador/na-rua/historico).
//
// O registro da performance dele, dia a dia: de tudo que saiu pra rua no nome
// dele (e nos nomes unificados no dele), quanto fechou entregue. É a mesma
// porcentagem do bloco "Na rua hoje" da tela inicial, só que guardada por dia —
// e cada dia vale como ele FECHOU: o que ficou na rua ou com insucesso no fim
// do dia conta contra, mesmo que tenha sido entregue depois.
//
// Mesma exclusividade do bloco da home (pode_ver_na_rua): o menu só aparece
// pro entregador liberado, e o servidor recusa quem não foi.
//
// Usa _enrEsc, _enrPct, _enrCorPerformance e _enrPlural de entregador-na-rua.js.

const EPF_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

let _epfDados = null;
let _epfAbertos = new Set();   // dias com a quebra por entregador aberta
let _epfCarregando = false;

function abrirEntPerformance(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-ent-performance");
    _epfCarregar();
}

// "Seg, 05/10". O dia chega como texto (YYYY-MM-DD) e o dia da semana sai do
// calendário puro (ano, mês, dia) — sem hora nem fuso no meio pra deslocar.
function _epfDia(dia) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dia || ""));
    if (!m) return String(dia || "");
    const semana = EPF_SEMANA[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
    return `${semana}, ${m[3]}/${m[2]}`;
}

// "118 entregues · 9 insucessos · 4 na rua". O que não aconteceu não aparece:
// num dia redondo a linha fica só "150 entregues", sem três zeros do lado.
function _epfContagem(x) {
    return [
        `${x.entregues} ${x.entregues === 1 ? "entregue" : "entregues"}`,
        x.insucessos ? _enrPlural(x.insucessos, "insucesso", "insucessos") : "",
        x.na_rua ? `${x.na_rua} na rua` : "",
        x.aguardando ? `${x.aguardando} não ${x.aguardando === 1 ? "saiu" : "saíram"}` : "",
    ].filter(Boolean).join(" · ");
}

function _epfBarra(x) {
    const pct = x.performance === null || x.performance === undefined ? 0 : x.performance;
    return `<span class="enr-barra"><span style="width:${pct}%;background:${_enrCorPerformance(x.performance)}"></span></span>`;
}

function _epfEntregadorHtml(e) {
    return `
        <li class="epf-quem">
            <span class="epf-quem-nome">${_enrEsc(e.nome)}</span>
            <span class="epf-quem-pct" style="color:${_enrCorPerformance(e.performance)}">${_enrPct(e.performance)}</span>
            <span class="epf-quem-sub">${_epfContagem(e)}</span>
        </li>`;
}

function _epfDiaHtml(d, hoje) {
    const varios = d.entregadores.length > 1;
    const aberto = varios && _epfAbertos.has(d.dia);
    const miolo = `
        <span class="enr-ent-nome">${_epfDia(d.dia)}${d.dia === hoje ? ` <span class="epf-hoje">hoje</span>` : ""}</span>
        <span class="epf-pct" style="color:${_enrCorPerformance(d.performance)}">${_enrPct(d.performance)}</span>
        <span class="enr-ent-sub">${_epfContagem(d)}${varios ? ` · ${d.entregadores.length} entregadores` : ""}</span>
        ${_epfBarra(d)}`;
    // Com um entregador só não há o que abrir: a linha do dia já é ele.
    const topo = varios
        ? `<button type="button" class="enr-ent-topo" aria-expanded="${aberto}"
                   data-dia="${_enrEsc(d.dia)}" onclick="_epfAlternarDia(this.dataset.dia)">${miolo}</button>`
        : `<div class="enr-ent-topo epf-fixo">${miolo}</div>`;
    return `
        <div class="enr-ent${aberto ? " aberto" : ""}">
            ${topo}
            ${aberto ? `<ul class="epf-quems">${d.entregadores.map(_epfEntregadorHtml).join("")}</ul>` : ""}
        </div>`;
}

function _epfResumoHtml(d) {
    const r = d.resumo || {};
    const saiu = (r.entregues || 0) + (r.na_rua || 0) + (r.insucessos || 0);
    return `
        <div class="epf-resumo">
            <div class="epf-resumo-pct" style="color:${_enrCorPerformance(r.performance)}">${_enrPct(r.performance)}</div>
            <div class="epf-resumo-txt">
                <div class="epf-resumo-titulo">Performance dos últimos ${d.periodo_dias || 30} dias</div>
                <div class="epf-resumo-sub">${r.entregues || 0} entregues de ${saiu} que saíram · ${_enrPlural(r.dias || 0, "dia com rota", "dias com rota")}</div>
            </div>
        </div>
        <p class="epf-nota">Vale como o dia fechou: o que ficou na rua ou com insucesso no fim do dia conta contra.</p>`;
}

function _epfAviso(texto, comBotao) {
    const el = document.getElementById("epf-conteudo");
    if (!el) return;
    el.innerHTML = `
        <div class="enr-aviso">${_enrEsc(texto)}</div>
        ${comBotao ? `<button type="button" class="enr-recarregar epf-de-novo" onclick="_epfCarregar()">Tentar de novo</button>` : ""}`;
}

function _epfRender() {
    const el = document.getElementById("epf-conteudo");
    if (!el) return;
    const d = _epfDados;
    if (!d) { el.innerHTML = ""; return; }
    if (!d.dias.length) {
        _epfAviso(`Nenhuma rota da Shopee no seu nome nos últimos ${d.periodo_dias || 30} dias.`, false);
        return;
    }
    el.innerHTML = `
        ${_epfResumoHtml(d)}
        <div class="enr-ents">${d.dias.map(x => _epfDiaHtml(x, d.hoje)).join("")}</div>`;
}

function _epfAlternarDia(dia) {
    if (_epfAbertos.has(dia)) _epfAbertos.delete(dia);
    else _epfAbertos.add(dia);
    _epfRender();
}

function _epfCarregar() {
    if (_epfCarregando) return;
    _epfCarregando = true;
    if (!_epfDados) _epfAviso("Carregando sua performance…", false);

    fetch(`${API}/entregador/na-rua/historico`, { headers: { "Authorization": "Bearer " + localStorage.getItem("token") } })
        .then(r => r.json())
        .then(d => {
            _epfCarregando = false;
            if (!d || d.error || !Array.isArray(d.dias)) { _epfFalhou(d && d.error); return; }
            _epfDados = d;
            _epfRender();
        })
        .catch(() => { _epfCarregando = false; _epfFalhou(); });
}

// Com dado na tela, fica o que já estava; sem nada, diz que falhou e por quê.
function _epfFalhou(motivo) {
    if (_epfDados) { _epfRender(); return; }
    _epfAviso(motivo ? `Não deu pra carregar: ${motivo}` : "Não deu pra carregar. Confira a internet e tente de novo.", true);
}
