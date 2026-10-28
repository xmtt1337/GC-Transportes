// ───── MEUS FECHAMENTOS: FECHAMENTO DO SISTEMA (visão do entregador) ─────
// Quando a quinzena foi publicada (Criar Fechamento / Resumo da Quinzena › Publicar), o
// /painel devolve fonte "sistema" e o fechamento vem de lá em vez da planilha. Mesmo jeito
// da tela antiga: cards por transportadora, Adicionais e Descontos. Tocando na
// transportadora abre um card com os dias; tocando no dia, os pedidos que afetaram
// (onhold, atrasado, não entregue) com quando deveriam ser entregues. Tudo na tela, sem
// baixar relatório. "Performance por dia" na tela principal mostra os dias que tiveram onhold,
// atraso ou PNR (quantos pacotes caíram pra tarifa mínima e quanto custou). PNR aparece na lista
// do dia. Chamado por _carregarPainel (fechamentos.js).

function _fsEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _fsR(n) {
    return "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fsDia(iso) {
    const [, m, d] = String(iso || "").split("-");
    return d ? `${d}/${m}` : "—";
}
const _FS_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function _fsSem(iso) { return _FS_SEM[new Date(iso + "T12:00:00Z").getUTCDay()]; }
function _fsPct(p) {
    return p == null ? "—" : Number(p).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}
// Cor do cabeçalho do card (mesmas classes da tela da planilha).
function _fsClasseTransp(nome) {
    const n = String(nome || "").toLowerCase();
    if (n.startsWith("shopee")) return "pt-card-shopee";
    if (n.startsWith("loggi")) return "pt-card-loggi";
    if (n.startsWith("imile")) return "pt-card-imile";
    if (n.startsWith("anjun")) return "pt-card-anjun";
    if (n.startsWith("total")) return "pt-card-te";
    if (n.startsWith("j&t") || n.startsWith("jet")) return "pt-card-jt";
    return "";
}
const _fsEhShopee = (nome) => /^shopee/i.test(nome || "");

let _fsDados = null;

function _fsRender(d) {
    _fsDados = d;
    const c = d.conta || {};
    const card = (titulo, linhas, extra) => `<div class="pt-card ${extra || ""}">
        <div class="pt-header">${titulo}</div>${linhas.map(([a, b]) => `<div class="pt-row"><span>${a}</span><span>${b}</span></div>`).join("")}</div>`;
    const paj = (rot, v, sub) => `<div class="paj-card${v ? " negativo" : ""}"><div class="paj-label">${rot}</div>
        ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}<div class="paj-value">${_fsR(v)}</div></div>`;
    document.getElementById("fech-sistema").innerHTML = `
        <div class="painel-section-title">Transportadoras</div>
        <div class="painel-transp">${(d.transportadoras || []).map((t, i) => `<div class="pt-card ${_fsClasseTransp(t.nome)} fs-clicavel" onclick="_fsAbrirTransp(${i})">
            <div class="pt-header">${_fsEsc(t.nome)}</div>
            <div class="pt-row"><span>Valor</span><span>${_fsR(t.valor)}</span></div>
            <div class="pt-row"><span>Entregues</span><span>${t.pacotes.toLocaleString("pt-BR")} pacotes</span></div>
            <div class="pt-row"><span>Por pacote</span><span>${_fsR(t.por_pacote)}</span></div>
        </div>`).join("")}</div>

        ${_fsHtmlPerformance(d)}

        <div class="painel-section-title">Adicionais</div>
        <div class="painel-adicionais">
            ${card("Acréscimos", [["Valor", _fsR(c.acrescimos)]])}
            ${card("Deslocamento", [["Valor", _fsR(c.deslocamento)]].concat(d.deslocamento ? [["Dias", `${d.deslocamento.dias} × ${_fsR(d.deslocamento.valor_dia)}`]] : []))}
        </div>

        <div class="painel-section-title">Descontos</div>
        <div class="painel-descontos">
            ${paj("Extravios + Multas", c.extravios)}
            ${paj("Ticket Log", c.ticketlog, "Desconto no cartão")}
            ${c.descontos ? paj("Outros descontos", c.descontos) : ""}
        </div>

        ${(d.extravios || []).length ? `<div class="painel-ocorrencias"><div class="poc-card">
            <div class="poc-header">Extravios e multas</div>
            <div class="extr-lista">${d.extravios.map(e => `<div class="extr-card">
                <div class="extr-top"><span class="extr-transp">${_fsEsc(e.transportadora)} · ${_fsEsc(e.status)}</span><span class="extr-codigo">${_fsEsc(e.codigo)}</span></div>
                <div class="extr-bottom"><span class="extr-valor val-neg">${_fsR(e.valor)}</span></div></div>`).join("")}</div>
        </div></div>` : ""}

        ${(d.ajustes || []).length ? `<div class="painel-ocorrencias"><div class="poc-card">
            <div class="poc-header">Acréscimos e descontos</div>
            <div class="extr-lista">${d.ajustes.map(a => `<div class="extr-card">
                <div class="extr-top"><span class="extr-transp">${a.tipo === "acrescimo" ? "Acréscimo" : "Desconto"}</span></div>
                ${a.descricao ? `<div class="extr-endereco">${_fsEsc(a.descricao)}</div>` : ""}
                <div class="extr-bottom"><span class="extr-valor ${a.tipo === "acrescimo" ? "fs-pos" : "val-neg"}">${a.tipo === "acrescimo" ? "+" : "−"} ${_fsR(a.valor)}</span></div></div>`).join("")}</div>
        </div></div>` : ""}`;
}

// ── Performance por dia (tela principal): só os dias que tiveram algo contra ──

/** Menor e maior R$/pacote da tabela no dia (tarifa mínima e o valor de 100%). */
function _fsFaixa(dia) {
    const f = (_fsDados || {}).faixas || {};
    const lista = (_fsSem(dia) === "dom" ? f.domingo : f.semana) || [];
    const v = lista.map(x => Number(x.valor)).filter(n => n > 0);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : { min: _fsSem(dia) === "dom" ? 1.8 : 1.5, max: null };
}

/** Quanto a PNR tirou do dia: entregas que caíram × (valor do dia − tarifa mínima). Fixo: não dá pra saber daqui. */
function _fsPerdaPnr(p) {
    if (!p || !p.tarifa_minima || p.fixo) return 0;
    return Math.max(0, Math.round((p.pacotes_minima || 0) * (p.valor - _fsFaixa(p.dia).min) * 100) / 100);
}

const _fsAfetouDia = (p) => (p.onholds || 0) + (p.outras_atraso || 0) + (p.acareacoes || 0) > 0 || p.tarifa_minima;

function _fsHtmlPerformance(d) {
    const perf = d.performance;
    if (!perf || !(perf.dias || []).length) return "";
    const afetados = perf.dias.filter(_fsAfetouDia);
    const soma = (f) => perf.dias.reduce((s, p) => s + (f(p) || 0), 0);
    const pacMin = soma(p => p.tarifa_minima ? (p.fixo ? p.pacotes_pagos : p.pacotes_minima) : 0);
    const perda = soma(_fsPerdaPnr);
    const mini = (rot, v, neg) => `<div class="fs-mini"><span>${rot}</span><b${neg ? ` class="fs-neg"` : ""}>${v}</b></div>`;
    return `<div class="painel-section-title">Performance por dia</div>
        <div class="fs-resumo">
            ${mini("Performance da quinzena", _fsPct(perf.pct))}
            ${mini("Dias com ocorrência", `${afetados.length} de ${perf.dias.length}`)}
            ${mini("Onholds e atrasados", soma(p => (p.onholds || 0) + (p.outras_atraso || 0)).toLocaleString("pt-BR"))}
            ${mini("PNR", soma(p => p.acareacoes).toLocaleString("pt-BR"))}
            ${pacMin ? mini("Pacotes na tarifa mínima", pacMin.toLocaleString("pt-BR"), true) : ""}
            ${perda ? mini("Perdido com PNR", "−" + _fsR(perda), true) : ""}
        </div>
        ${afetados.length ? `<div class="fs-sub">Toque no dia pra ver os pedidos que afetaram.</div>
        <div class="fs-dias" style="margin-bottom:18px">${afetados.map(_fsCardDia).join("")}</div>`
            : `<div class="cft-ajuda" style="margin-bottom:18px">Nenhum dia com ocorrência nesta quinzena.</div>`}`;
}

function _fsCardDia(p) {
    const fx = _fsFaixa(p.dia);
    const perda = _fsPerdaPnr(p);
    return `<div class="fs-dia fs-clicavel fs-dia-alerta" onclick="_fsAbrirDia('${p.dia}')">
        <div class="fs-dia-topo"><b>${_fsDia(p.dia)}</b> <span>${_fsSem(p.dia)}</span></div>
        <div class="fs-dia-linha">Performance <b>${_fsPct(p.pct)}</b></div>
        <div class="fs-dia-linha">${p.fixo ? "Valor fixo" : `<span class="fs-nw">${_fsR(p.valor)}</span>/pct`}${!p.fixo && fx.max && p.valor < fx.max
            ? ` <span class="fs-neg fs-nw" title="Quanto ficou abaixo do valor de 100% de performance, por pacote">(−${_fsR(fx.max - p.valor)})</span>` : ""}</div>
        ${p.onholds ? `<div class="fs-dia-linha">${p.onholds} onhold(s)</div>` : ""}
        ${p.outras_atraso ? `<div class="fs-dia-linha">${p.outras_atraso} atrasado(s)</div>` : ""}
        ${p.acareacoes ? `<div class="fs-dia-linha">${p.acareacoes} PNR</div>` : ""}
        ${p.tarifa_minima ? `<div class="fs-dia-linha fs-neg">${p.fixo ? `Fixo com desconto em ${p.pacotes_pagos} pacotes`
            : `${p.pacotes_minima || 0} pacote(s) na tarifa mínima (${_fsR(fx.min)})`}</div>` : ""}
        ${perda ? `<div class="fs-dia-linha fs-neg">−${_fsR(perda)} com PNR</div>` : ""}
        <div class="fs-dia-alerta-txt">ver pedidos ›</div>
    </div>`;
}

/** Abre o dia direto da tela principal: todos os pedidos que afetaram, de todas as transportadoras. */
function _fsAbrirDia(dia) {
    _fsFechar();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "fs-modal";
    ov.innerHTML = `<div class="cft-modal fs-modal"></div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _fsFechar(); });
    document.body.appendChild(ov);
    _fsMostrarDia(-1, dia);
}

// ── Card da transportadora: dias; tocando no dia, os pedidos que afetaram ──

/** Dia da performance (com acareações / tarifa mínima), ou undefined. */
function _fsPerfDia(dia) {
    return ((_fsDados.performance || {}).dias || []).find(x => x.dia === dia);
}

/** Dias da transportadora: pacotes/valor do dia e quantos afetaram (Shopee: % do dia). */
function _fsDiasDaTransp(nome) {
    const d = _fsDados;
    const perf = new Map(((d.performance || {}).dias || []).map(x => [x.dia, x]));
    return (d.por_dia || []).filter(x => x.transportadora === nome).map(x => {
        const p = perf.get(x.dia);
        const shopee = _fsEhShopee(nome);
        // Shopee: o valor do dia segue a performance, que junta todas as transportadoras.
        const acars = _fsAfetantes(nome, x.dia).filter(i => i.tipo === "Acareação").length;
        const afetaram = acars + (shopee ? (p ? p.onholds + p.outras_atraso : 0) : x.atrasados + x.nao_entregues);
        return { ...x, pct: p ? p.pct : null, por_pacote: shopee && p ? p.valor : (x.entregues ? x.valor / x.entregues : 0), afetaram,
            minima: !!(p && p.tarifa_minima), acareacoes: p ? p.acareacoes || 0 : 0 };
    });
}

/**
 * Pedidos que afetaram um dia. Shopee: tudo que derrubou a performance do dia; outras: só
 * dela. Dia na tarifa mínima: todas as acareações do dia (a regra junta as transportadoras).
 */
function _fsAfetantes(nome, dia) {
    const p = _fsPerfDia(dia);
    const minima = !!(p && p.tarifa_minima);
    return (_fsDados.insucessos || []).filter(i => i.dia === dia
        && (_fsEhShopee(nome) || i.transportadora === nome || (minima && i.tipo === "Acareação")));
}

function _fsAbrirTransp(i) {
    const t = (_fsDados.transportadoras || [])[i];
    if (!t) return;
    _fsFechar();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "fs-modal";
    ov.innerHTML = `<div class="cft-modal fs-modal"></div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _fsFechar(); });
    document.body.appendChild(ov);
    _fsMostrarTransp(i);
}
function _fsFechar() {
    const ov = document.getElementById("fs-modal");
    if (ov) ov.remove();
}

function _fsMostrarTransp(i) {
    const t = _fsDados.transportadoras[i];
    const dias = _fsDiasDaTransp(t.nome);
    const shopee = _fsEhShopee(t.nome);
    const perf = _fsDados.performance;
    document.querySelector("#fs-modal .fs-modal").innerHTML = `
        <div class="fs-modal-topo"><div class="pt-card ${_fsClasseTransp(t.nome)} fs-titulo"><div class="pt-header" style="margin:0;padding:0;border:0">${_fsEsc(t.nome)}</div></div>
            <a href="#" class="fs-fechar" onclick="event.preventDefault();_fsFechar()">Fechar</a></div>
        <div class="fs-resumo">
            <div class="fs-mini"><span>Entregues</span><b>${t.pacotes.toLocaleString("pt-BR")}</b></div>
            <div class="fs-mini"><span>Valor</span><b>${_fsR(t.valor)}</b></div>
            <div class="fs-mini"><span>Por pacote</span><b>${_fsR(t.por_pacote)}</b></div>
            ${shopee && perf ? `<div class="fs-mini"><span>Performance</span><b>${_fsPct(perf.pct)}</b></div>` : ""}
        </div>
        <div class="fs-sub">Dias${dias.some(x => x.afetaram) ? " · toque no dia com ocorrência pra ver os pedidos" : ""}</div>
        <div class="fs-dias">${dias.length ? dias.map(x => `<div class="fs-dia${x.afetaram ? " fs-clicavel fs-dia-alerta" : ""}"${x.afetaram ? ` onclick="_fsMostrarDia(${i}, '${x.dia}')"` : ""}>
            <div class="fs-dia-topo"><b>${_fsDia(x.dia)}</b> <span>${_fsSem(x.dia)}</span></div>
            <div class="fs-dia-linha">${x.entregues} entregue(s)</div>
            <div class="fs-dia-linha"><b>${_fsR(x.valor)}</b></div>
            ${shopee && x.pct != null ? `<div class="fs-dia-linha">${_fsPct(x.pct)} · <span class="fs-nw">${_fsR(x.por_pacote)}</span>/pct</div>` : ""}
            ${x.minima ? (() => { const p = _fsPerfDia(x.dia) || {}; return `<div class="fs-dia-linha fs-neg">${p.fixo ? "Fixo com desconto"
                : `Tarifa mínima em ${p.pacotes_minima || 0} pct`} · ${x.acareacoes} PNR</div>`; })() : ""}
            ${x.afetaram ? `<div class="fs-dia-alerta-txt">${x.afetaram} ocorrência(s) ›</div>` : ""}
        </div>`).join("") : `<div class="cft-ajuda">Sem dias nesta transportadora.</div>`}</div>`;
}

// i = transportadora aberta; -1 = veio da Performance por dia (mostra tudo do dia).
function _fsMostrarDia(i, dia) {
    const t = i >= 0 ? _fsDados.transportadoras[i] : null;
    const lista = t ? _fsAfetantes(t.nome, dia) : (_fsDados.insucessos || []).filter(x => x.dia === dia);
    const p = _fsPerfDia(dia);
    const fx = _fsFaixa(dia);
    const perda = _fsPerdaPnr(p);
    const mini = (rot, v, neg) => `<div class="fs-mini"><span>${rot}</span><b${neg ? ` class="fs-neg"` : ""}>${v}</b></div>`;
    document.querySelector("#fs-modal .fs-modal").innerHTML = `
        <div class="fs-modal-topo">${t ? `<a href="#" class="fs-fechar" onclick="event.preventDefault();_fsMostrarTransp(${i})">‹ ${_fsEsc(t.nome)}</a>` : "<span></span>"}
            <a href="#" class="fs-fechar" onclick="event.preventDefault();_fsFechar()">Fechar</a></div>
        <div class="fs-sub">${_fsDia(dia)} ${_fsSem(dia)} · o que afetou o dia</div>
        ${p ? `<div class="fs-resumo">
            ${mini("Performance", _fsPct(p.pct))}
            ${mini("R$ por pacote", p.fixo ? "Fixo" : _fsR(p.valor))}
            ${mini("Onholds e atrasados", (p.onholds || 0) + (p.outras_atraso || 0), (p.onholds || 0) + (p.outras_atraso || 0) > 0)}
            ${mini("PNR", p.acareacoes || 0, (p.acareacoes || 0) > 0)}
            ${p.tarifa_minima && !p.fixo ? mini("Na tarifa mínima", `${p.pacotes_minima || 0} pct`, true) : ""}
            ${perda ? mini("Perdido com PNR", "−" + _fsR(perda), true) : ""}
        </div>` : ""}
        ${p && !p.fixo && fx.max && p.valor < fx.max ? `<div class="cft-ajuda" style="margin-bottom:8px">Com 100% de performance seria ${_fsR(fx.max)} por pacote;
            os onholds e atrasados abaixo baixaram pra ${_fsR(p.valor)}.</div>` : ""}
        ${p && p.tarifa_minima ? `<div class="cft-ajuda fs-neg" style="margin-bottom:8px">${p.acareacoes} PNR contaram neste dia (abertas no dia seguinte)
            ${p.fixo ? `— acima do limite pras baixas do dia: todos os pacotes do dia ficaram no valor fixo com desconto, ${_fsR(p.valor)} por pacote.`
                : `— passou do limite no usuário ${_fsEsc(p.usuarios_minima || "")}: ${p.pacotes_minima || 0} entrega(s) desse usuário ficaram na tarifa mínima (${_fsR(fx.min)}).`}</div>` : ""}
        ${t && _fsEhShopee(t.nome) ? `<div class="cft-ajuda" style="margin-bottom:8px">O valor da Shopee no dia segue a performance, que conta também as outras transportadoras.</div>` : ""}
        <div class="extr-lista" style="padding:0">${lista.length ? lista.map(x => `<div class="extr-card">
            <div class="extr-top"><span class="extr-transp fs-neg">${x.tipo === "Acareação" ? "PNR" : _fsEsc(x.tipo)} · ${_fsEsc(x.transportadora)}</span><span class="extr-codigo">${_fsEsc(x.codigo || "")}</span></div>
            <div class="extr-endereco">${x.deveria ? `Deveria ser entregue ${_fsDia(x.deveria)}` : ""}${x.entregue ? ` · entregue ${_fsDia(x.entregue)}` : (x.tipo === "Não entregue" ? " · não entregue" : "")}
                ${x.motivo ? `${_fsEsc(x.motivo)}${x.ocorrencia_hora ? ` · às ${_fsEsc(x.ocorrencia_hora)}` : ""}` : ""}</div>
        </div>`).join("") : `<div class="extr-vazio">Sem detalhe dos pedidos desse dia.</div>`}</div>`;
}
