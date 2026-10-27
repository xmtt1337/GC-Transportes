// ───── MEUS FECHAMENTOS: FECHAMENTO DO SISTEMA (visão do entregador) ─────
// Quando a quinzena foi publicada no Fechamento (Resumo da Quinzena › Publicar), o /painel
// devolve fonte "sistema" e o fechamento vem de lá em vez da planilha: a conta inteira,
// valor por transportadora com R$/pacote, a performance dia a dia e — tocando no dia — os
// pedidos que derrubaram (onhold, atrasado, não entregue) com quando deveriam ser entregues.
// Tudo na tela, sem baixar relatório. Chamado por _carregarPainel (fechamentos.js).

function _fsEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _fsR(n) {
    return "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fsDia(iso) {
    const [a, m, d] = String(iso || "").split("-");
    return d ? `${d}/${m}` : "—";
}
function _fsPct(p) {
    return p == null ? "—" : Number(p).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
// Mesma régua da tabela de valor: 98%+ paga o máximo; abaixo de 95% (90% no domingo) o mínimo.
function _fsPctClasse(p, iso) {
    if (p == null) return "";
    const dom = iso && new Date(iso + "T12:00:00Z").getUTCDay() === 0;
    return p >= 98 ? "cft-pos" : p < (dom ? 90 : 95) ? "cft-neg" : "";
}

/** Texto das faixas de valor (seg a sáb / domingo). */
function _fsFaixas(f) {
    if (!f) return "";
    const lista = (l) => (l || []).map((x, i) => {
        const ant = l[i - 1];
        if (x.ate === null || x.ate === Infinity || x.ate > 1000) return `${ant ? ant.ate : 0}% ou mais: ${_fsR(x.valor)}`;
        return `${ant ? `de ${ant.ate}% ` : ""}abaixo de ${x.ate}%: ${_fsR(x.valor)}`;
    }).join(" · ");
    return `Segunda a sábado — ${lista(f.semana)}. Domingo — ${lista(f.domingo)}.`;
}

let _fsDados = null;
const _fsAbertos = new Set();

function _fsRender(d) {
    _fsDados = d;
    _fsAbertos.clear();
    const el = document.getElementById("fech-sistema");
    const c = d.conta || {};
    const linhaConta = (rot, v, cls, sinal) => v || rot === "Bruto" ? `<div class="fs-conta-linha"><span>${sinal ? `<span class="fs-sinal">${sinal}</span> ` : ""}${rot}</span>
        <span class="${cls || ""}">${_fsR(v)}</span></div>` : "";
    el.innerHTML = `
        <div class="painel-section-title">Como chegou no valor</div>
        <div class="fs-card">
            ${linhaConta("Bruto", c.bruto)}
            ${linhaConta("Acréscimos", c.acrescimos, "cft-pos", "+")}
            ${linhaConta(`Deslocamento${d.deslocamento ? ` (${d.deslocamento.dias} dias × ${_fsR(d.deslocamento.valor_dia)})` : ""}`, c.deslocamento, "cft-pos", "+")}
            ${linhaConta("Ticket Log", c.ticketlog, "cft-neg", "−")}
            ${linhaConta("Extravios e multas", c.extravios, "cft-neg", "−")}
            ${linhaConta("Descontos", c.descontos, "cft-neg", "−")}
            <div class="fs-conta-linha fs-conta-total"><span>= Total a receber</span><span class="${c.liquido < 0 ? "cft-neg" : "cft-pos"}">${_fsR(c.liquido)}</span></div>
        </div>

        <div class="painel-section-title">Por transportadora</div>
        <div class="fs-card fs-tabela-wrap"><table class="cft-tabela">
            <thead><tr><th>Transportadora</th><th style="text-align:right">Pacotes</th><th style="text-align:right">Valor</th><th style="text-align:right">Por pacote</th></tr></thead>
            <tbody>${(d.transportadoras || []).map(t => `<tr><td>${_fsEsc(t.nome)}</td><td class="num">${t.pacotes.toLocaleString("pt-BR")}</td>
                <td class="num">${_fsR(t.valor)}</td><td class="num">${_fsR(t.por_pacote)}</td></tr>`).join("")}</tbody>
        </table></div>

        ${d.performance ? `
        <div class="painel-section-title">Performance — <span class="${_fsPctClasse(d.performance.pct)}">${_fsPct(d.performance.pct)}</span> na quinzena</div>
        <div class="cft-ajuda" style="margin-bottom:8px">Performance do dia = entregues ÷ (entregues + onholds + pacotes que atrasaram ou não foram entregues no dia do prazo),
            juntando todas as transportadoras. O valor por pacote do dia segue a performance: ${_fsEsc(_fsFaixas(d.faixas))}
            <b>Toque no dia</b> pra ver o que derrubou.</div>
        <div class="fs-card fs-tabela-wrap"><table class="cft-tabela fs-larga">
            <thead><tr><th>Dia</th><th style="text-align:right">Entregues</th><th style="text-align:right">Onholds</th><th style="text-align:right">Atrasados</th>
                <th style="text-align:right">Performance</th><th style="text-align:right">Por pacote</th><th style="text-align:right">Total</th></tr></thead>
            <tbody id="fs-dias"></tbody>
        </table></div>` : ""}

        ${(d.extravios || []).length ? `
        <div class="painel-section-title">Extravios e multas</div>
        <div class="fs-card fs-tabela-wrap"><table class="cft-tabela">
            <thead><tr><th>Tipo</th><th>Transportadora</th><th>Pedido</th><th style="text-align:right">Valor</th></tr></thead>
            <tbody>${d.extravios.map(e => `<tr><td>${_fsEsc(e.status)}</td><td>${_fsEsc(e.transportadora)}</td><td>${_fsEsc(e.codigo)}</td>
                <td class="num cft-neg">${_fsR(e.valor)}</td></tr>`).join("")}</tbody>
        </table></div>` : ""}

        ${(d.ajustes || []).length ? `
        <div class="painel-section-title">Acréscimos e descontos</div>
        <div class="fs-card fs-tabela-wrap"><table class="cft-tabela">
            <tbody>${d.ajustes.map(a => `<tr><td>${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"}</td><td style="white-space:normal">${_fsEsc(a.descricao || "")}</td>
                <td class="num ${a.tipo === "acrescimo" ? "cft-pos" : "cft-neg"}">${a.tipo === "acrescimo" ? "+" : "−"} ${_fsR(a.valor)}</td></tr>`).join("")}</tbody>
        </table></div>` : ""}`;
    _fsRenderDias();
}

/** Pedidos que derrubaram o dia (vêm junto no /painel, sem nova chamada). */
function _fsInsucessosDoDia(dia) {
    return (_fsDados.insucessos || []).filter(x => x.dia === dia);
}

function _fsRenderDias() {
    const tb = document.getElementById("fs-dias");
    if (!tb || !_fsDados.performance) return;
    const sem = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    tb.innerHTML = _fsDados.performance.dias.map(x => {
        const ruins = x.onholds + x.outras_atraso;
        const aberto = _fsAbertos.has(x.dia);
        const ins = aberto ? _fsInsucessosDoDia(x.dia) : [];
        return `<tr${ruins ? ` style="cursor:pointer" onclick="_fsAlternarDia('${x.dia}')"` : ""}>
            <td>${ruins ? `<span class="cft-ajuda">${aberto ? "▾" : "▸"}</span> ` : ""}${_fsDia(x.dia)} <span class="cft-ajuda">${sem[new Date(x.dia + "T12:00:00Z").getUTCDay()]}</span></td>
            <td class="num">${(x.shopee + x.outras_prazo).toLocaleString("pt-BR")}</td>
            <td class="num${x.onholds ? " cft-neg" : ""}">${x.onholds}</td>
            <td class="num${x.outras_atraso ? " cft-neg" : ""}">${x.outras_atraso}</td>
            <td class="num ${_fsPctClasse(x.pct, x.dia)}"><strong>${_fsPct(x.pct)}</strong></td>
            <td class="num">${_fsR(x.valor)}</td>
            <td class="num">${_fsR(x.total)}</td>
        </tr>${aberto ? `<tr><td colspan="7" class="fs-detalhe">${ins.length ? ins.map(i => `<div class="fs-ins">
            <span class="cft-neg">${_fsEsc(i.tipo)}</span> · ${_fsEsc(i.transportadora)} · <b>${_fsEsc(i.codigo || "")}</b>
            ${i.deveria ? ` · deveria ser entregue ${_fsDia(i.deveria)}` : ""}${i.entregue ? `, entregue ${_fsDia(i.entregue)}` : (i.tipo === "Não entregue" ? ", não entregue" : "")}
            ${i.motivo ? ` · ${_fsEsc(i.motivo)}${i.ocorrencia_hora ? ` às ${_fsEsc(i.ocorrencia_hora)}` : ""}` : ""}</div>`).join("")
            : `<span class="cft-ajuda">Sem detalhe dos pedidos desse dia.</span>`}</td></tr>` : ""}`;
    }).join("");
}

function _fsAlternarDia(dia) {
    if (_fsAbertos.has(dia)) _fsAbertos.delete(dia); else _fsAbertos.add(dia);
    _fsRenderDias();
}
