// ───── MEUS FECHAMENTOS: FECHAMENTO DO SISTEMA (visão do entregador) ─────
// Quando a quinzena foi publicada (Criar Fechamento / Resumo da Quinzena › Publicar), o
// /painel devolve fonte "sistema" e o fechamento vem de lá em vez da planilha. Mesmo jeito
// da tela antiga: cards por transportadora (só o resumo), Adicionais e Descontos. "Performance
// por dia" mostra todos os dias; tocando no dia, abas com os entregues, os atrasados e onholds
// (com quando deveriam ser entregues) e as PNR abertas. Duas visões do fechamento: Geral (o do
// entregador) e Por usuário (usuário principal: marca quem quer ver e a tela vira o fechamento
// dessas pessoas: valor, R$/pacote, transportadoras e dias). Não abre por transportadora: a performance junta todas, e o detalhe separado confundia. "Baixar
// relatório detalhado" gera a planilha com as mesmas abas do Resumo da Quinzena.
// Chamado por _carregarPainel (fechamentos.js).

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
let _fsPedidos = null;       // pedidos dele na quinzena (só busca quando precisa)
let _fsPedidosBusca = null;
let _fsDiaAberto = null;     // "dia|aba" na tela, pra não redesenhar o que já foi fechado
let _fsVisao = "geral";      // "geral" ou "usuario"
let _fsMarcados = new Set(); // pessoas marcadas em Por usuário (nenhuma = todas)
let _fsPessoas = [];         // pessoas da quinzena, na ordem da lista
const _FS_SEM_USUARIO = "Sem usuário";

/**
 * Pro entregador a XPT não importa: "Shopee Caçador"/"Shopee Videira" viram um card só,
 * "Shopee" (pacotes, valor e dias somados; os pedidos que afetaram também com o nome curto).
 */
function _fsJuntarShopee(d) {
    const ehS = (n) => _fsEhShopee(n);
    const ts = (d.transportadoras || []).filter(t => ehS(t.nome));
    if (!ts.length) return d;
    const pacotes = ts.reduce((s, t) => s + (t.pacotes || 0), 0), valor = ts.reduce((s, t) => s + (t.valor || 0), 0);
    const shopee = { nome: "Shopee", pacotes, valor: Math.round(valor * 100) / 100, por_pacote: pacotes ? Math.round((valor / pacotes) * 100) / 100 : 0 };
    const i = (d.transportadoras || []).findIndex(t => ehS(t.nome));
    const transportadoras = d.transportadoras.filter(t => !ehS(t.nome));
    transportadoras.splice(i, 0, shopee);
    const dias = new Map();
    const porDia = [];
    for (const x of d.por_dia || []) {
        if (!ehS(x.transportadora)) { porDia.push(x); continue; }
        const r = dias.get(x.dia);
        if (!r) { const n = { ...x, transportadora: "Shopee" }; dias.set(x.dia, n); porDia.push(n); continue; }
        for (const k of ["pacotes", "entregues", "atrasados", "nao_entregues", "valor"]) r[k] = (r[k] || 0) + (x[k] || 0);
    }
    const insucessos = (d.insucessos || []).map(x => ehS(x.transportadora) ? { ...x, transportadora: "Shopee" } : x);
    return { ...d, transportadoras, por_dia: porDia, insucessos };
}

// Onde desenhar e de quem: o Meus Fechamentos (padrão, o próprio login) ou o Fechamento ›
// Pesquisar do gestor (adm-fech-sistema, pedidos do entregador escolhido).
let _fsCtx = null;
function _fsCtxPadrao() {
    const v = (f) => { try { return f(); } catch (e) { return null; } }; // fechamentos.js pode não estar carregado
    return { el: "fech-sistema", mes: v(() => _fMes), ano: v(() => _fAno), quinzena: v(() => _fQuinzena),
        pedidos: () => `${API}/painel/fechamento-pedidos?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}` };
}

function _fsRender(d, ctx) {
    _fsCtx = ctx || _fsCtxPadrao();
    d = _fsJuntarShopee(d);
    _fsDados = d;
    _fsPedidos = _fsPedidosBusca = null;
    _fsVisao = "geral";
    _fsMarcados = new Set();
    _fsDesenhar();
}

function _fsDesenhar() {
    const el = document.getElementById(_fsCtx.el);
    const visao = (k, n) => `<button type="button"${_fsVisao === k ? ` class="active"` : ""} onclick="_fsTrocarVisao('${k}')">${n}</button>`;
    const topo = `<div class="fs-visao">${visao("geral", "Geral")}${visao("usuario", "Por usuário")}</div>
        <div style="margin-bottom:12px"><a href="#" class="fs-fechar" id="fs-baixar" onclick="event.preventDefault();_fsBaixarRelatorio()">Baixar relatório detalhado</a></div>`;
    if (_fsVisao === "geral") { el.innerHTML = topo + _fsHtmlGeral(_fsDados); return; }
    if (_fsPedidos) { el.innerHTML = topo + _fsHtmlPorUsuario(); return; }
    el.innerHTML = topo + `<div id="fs-usuario">${skLogo(true, "Carregando os pedidos")}</div>`;
    _fsCarregarPedidos().then(() => { if (_fsVisao === "usuario") _fsDesenhar(); }).catch(err => {
        const e = document.getElementById("fs-usuario");
        if (e && _fsVisao === "usuario") e.innerHTML = _fsEsc(err.message || "Erro ao carregar os pedidos.");
    });
}

function _fsTrocarVisao(visao) {
    _fsVisao = visao;
    _fsDesenhar();
}

function _fsHtmlGeral(d) {
    const c = d.conta || {};
    const card = (titulo, linhas, extra) => `<div class="pt-card ${extra || ""}">
        <div class="pt-header">${titulo}</div>${linhas.map(([a, b]) => `<div class="pt-row"><span>${a}</span><span>${b}</span></div>`).join("")}</div>`;
    const paj = (rot, v, sub) => `<div class="paj-card${v ? " negativo" : ""}"><div class="paj-label">${rot}</div>
        ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}<div class="paj-value">${_fsR(v)}</div></div>`;
    const col = d.coletas || null;
    return `
        ${_fsHtmlPagamento(d)}
        <div class="painel-section-title">Transportadoras</div>
        <div class="painel-transp">${(d.transportadoras || []).map(t => `<div class="pt-card ${_fsClasseTransp(t.nome)}">
            <div class="pt-header">${_fsEsc(t.nome)}</div>
            <div class="pt-row"><span>Valor</span><span>${_fsR(t.valor)}</span></div>
            <div class="pt-row"><span>Entregues</span><span>${t.pacotes.toLocaleString("pt-BR")} pacotes</span></div>
            <div class="pt-row"><span>Por pacote</span><span>${_fsR(t.por_pacote)}</span></div>
        </div>`).join("")}</div>

        ${_fsHtmlPerformance(d)}
        ${_fsHtmlPod()}

        <div class="painel-section-title">Adicionais</div>
        <div class="painel-adicionais">
            ${card("Acréscimos", [["Valor", _fsR((c.acrescimos || 0) - (col ? col.total : 0))]])}
            ${col ? card("Coletas", [["Coletas", col.quantidade.toLocaleString("pt-BR")], ["Por coleta", _fsR(col.valor)], ["Valor", _fsR(col.total)]]) : ""}
            ${card("Deslocamento", [["Valor", _fsR(c.deslocamento)]].concat(d.deslocamento ? [["Dias", `${d.deslocamento.dias} × ${_fsR(d.deslocamento.valor_dia)}`]]
                .concat(_fsKm(d.deslocamento)) : []))}
        </div>

        <div class="painel-section-title">Descontos</div>
        <div class="painel-descontos">
            ${paj("Extravios + Multas", c.extravios)}
            ${paj("Ticket Log", c.ticketlog, "Desconto no cartão")}
            ${c.descontos ? paj("Outros descontos", c.descontos) : ""}
        </div>

        ${_fsHtmlForaPrazo(d.fora_prazo_cidade || [])}

        ${_fsHtmlTicketlog(d.ticketlog || [])}

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

const _fsDataCurta = (iso) => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
const _fsNum = (n, casas) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Cada abastecimento do Ticket Log descontado na quinzena: quando, onde, quanto e com qual cartão. */
function _fsHtmlTicketlog(lista) {
    if (!lista.length) return "";
    const total = lista.reduce((s, a) => s + (a.valor || 0), 0);
    const litros = lista.reduce((s, a) => s + (a.litros || 0), 0);
    return `<div class="painel-ocorrencias"><div class="poc-card">
        <div class="poc-header">Abastecimentos Ticket Log</div>
        <div class="extr-endereco" style="margin:10px 12px 0">${lista.length} abastecimento${lista.length !== 1 ? "s" : ""}${litros ? ` · ${_fsNum(litros, 2)} L` : ""} · ${_fsR(total)}</div>
        <div class="extr-lista">${lista.map(a => {
            const comb = [a.servico, a.litros != null ? `${_fsNum(a.litros, 2)} L` : "", a.valor_litro != null ? `${_fsR(a.valor_litro)}/L` : ""].filter(Boolean).join(" · ");
            const ident = [a.cartao_final ? `Cartão final ${a.cartao_final}` : "", a.placa ? `Placa ${a.placa}` : "", a.matricula ? `Matrícula ${a.matricula}` : "",
                a.km != null ? `Km ${_fsNum(a.km, 0)}` : ""].filter(Boolean).join(" · ");
            return `<div class="extr-card">
                <div class="extr-top"><span class="extr-transp">${_fsDataCurta(a.data)}${a.hora ? " às " + _fsEsc(a.hora) : ""}</span><span class="extr-codigo">${_fsEsc(a.posto || "")}</span></div>
                ${comb || a.cidade ? `<div class="extr-endereco">${_fsEsc([comb, a.cidade].filter(Boolean).join(" · "))}</div>` : ""}
                ${ident ? `<div class="extr-endereco">${_fsEsc(ident)}</div>` : ""}
                ${a.aviso ? `<div class="extr-endereco" style="color:#f59e0b">${_fsEsc(a.aviso)}</div>` : ""}
                <div class="extr-bottom"><span class="extr-valor val-neg">${_fsR(a.valor)}</span></div></div>`;
        }).join("")}</div>
    </div></div>`;
}

let _fsForaPrazoTodos = false; // lista de fora do prazo aberta inteira

/** Dias entre o prazo e a entrega ("2026-09-21" → "2026-09-23" = 2). */
function _fsDiasAtraso(deveria, entregue) {
    if (!deveria || !entregue) return null;
    return Math.round((Date.parse(entregue + "T12:00:00Z") - Date.parse(deveria + "T12:00:00Z")) / 86400000);
}

/**
 * Entregas fora do prazo pagas pela tabela da cidade (polos fora da performance e cartões):
 * pacote a pacote, a conta "valor da cidade − desconto = recebeu". Fora do prazo não tem
 * incentivo; em cidade de parceiro sai também o desconto (40%).
 */
function _fsHtmlForaPrazo(lista) {
    if (!lista.length) return "";
    const pct = lista[0].desconto_pct || 40;
    const desc = lista.reduce((s, p) => s + (p.desconto || 0), 0);
    const naoEntregues = lista.filter(p => !p.entregue).length;
    const mostrar = _fsForaPrazoTodos ? lista : lista.slice(0, 20);
    return `<div class="painel-ocorrencias"><div class="poc-card">
        <div class="poc-header">Entregas fora do prazo (valor pela cidade)</div>
        <div class="extr-endereco" style="margin:10px 12px 4px">${lista.length} pacote${lista.length !== 1 ? "s" : ""} fora do prazo${naoEntregues ? ` (${naoEntregues} não entregue${naoEntregues !== 1 ? "s" : ""})` : ""}
            ${desc ? ` · <b class="fs-neg">${_fsR(desc)}</b> de desconto (já tirado do valor das transportadoras)` : ""}</div>
        <div class="extr-endereco" style="margin:0 12px 0">Entregou depois do prazo: não recebe o incentivo da cidade e, nas cidades de parceiro,
            perde ${pct}% do valor. Pacote não entregue não é pago.</div>
        <div class="extr-lista">${mostrar.map(p => {
            const atraso = _fsDiasAtraso(p.deveria, p.entregue);
            const quando = p.entregue
                ? `Prazo ${_fsDataCurta(p.deveria)} · entregue ${_fsDataCurta(p.entregue)}${atraso > 0 ? ` (${atraso} dia${atraso !== 1 ? "s" : ""} depois)` : ""}`
                : `Prazo ${_fsDataCurta(p.deveria)} · não entregue`;
            const conta = !p.entregue
                ? `<span>Não pago</span>`
                : `<span>Cidade ${_fsR(p.valor_cidade)}</span>
                   ${p.desconto ? `<span class="fs-neg">− ${pct}% atraso ${_fsR(p.desconto)}</span>` : `<span>sem desconto (cidade sem parceiro)</span>`}
                   ${p.adicional_peso ? `<span>+ peso ${_fsR(p.adicional_peso)}</span>` : ""}
                   <span>= <b>${_fsR(p.recebeu)}</b></span>`;
            return `<div class="extr-card">
                <div class="extr-top"><span class="extr-transp">${_fsEsc(p.transportadora)}${p.cidade ? " · " + _fsEsc(p.cidade) : ""}</span><span class="extr-codigo">${_fsEsc(p.codigo)}</span></div>
                <div class="extr-endereco">${quando}</div>
                <div class="extr-endereco fs-conta-pacote">${conta}</div></div>`;
        }).join("")}</div>
        ${lista.length > mostrar.length ? `<a href="#" class="fs-fechar" style="display:inline-block;margin:0 12px 12px" onclick="event.preventDefault();_fsForaPrazoTodos=true;_fsDesenhar()">Ver os ${lista.length} pacotes</a>` : ""}
    </div></div>`;
}

/** Aba "Fora do prazo (cidade)": a mesma conta do bloco, pacote a pacote. */
function _fsAbaForaPrazo(lista) {
    return [["Transportadora", "Pedido", "Cidade", "Prazo", "Entregue em", "Dias de atraso", "Valor da cidade", "Desconto por atraso", "Adicional de peso", "Recebeu"]]
        .concat(lista.map(p => [p.transportadora, p.codigo, p.cidade || "", _fsDataCurta(p.deveria), p.entregue ? _fsDataCurta(p.entregue) : "Não entregue",
            _fsDiasAtraso(p.deveria, p.entregue) ?? "", p.entregue ? p.valor_cidade || 0 : 0, p.desconto || 0, p.adicional_peso || 0, p.recebeu || 0]));
}

/** Aba "Ticket Log" da planilha do entregador. */
function _fsAbaTicketlog(lista) {
    return [["Data", "Hora", "Posto", "Cidade", "Combustível", "Litros", "R$/litro", "Valor", "Cartão (final)", "Placa", "Matrícula", "Km", "Aviso"]]
        .concat(lista.map(a => [_fsDataCurta(a.data), a.hora || "", a.posto || "", a.cidade || "", a.servico || "", a.litros ?? "", a.valor_litro ?? "",
            a.valor || 0, a.cartao_final || "", a.placa || "", a.matricula || "", a.km ?? "", a.aviso || ""]));
}

/** Dia do pagamento: 45 dias depois do fim da quinzena (15 ou último dia do mês). "AAAA-MM-DD". */
function _fsDataPagamento(mes, ano, quinzena) {
    const base = quinzena === 1 ? new Date(Date.UTC(ano, mes - 1, 15)) : new Date(Date.UTC(ano, mes, 0));
    base.setUTCDate(base.getUTCDate() + 45);
    return base.toISOString().slice(0, 10);
}

/**
 * Quando ele recebe: previsão (45 dias depois do fim da quinzena); quem antecipou vê o que já
 * recebeu e o saldo na mesma data. Pago já tem o cartão próprio no topo (fechamentos.js).
 */
function _fsHtmlPagamento(d) {
    const c = _fsCtx || {};
    const mes = c.mes || null, ano = c.ano || null, q = c.quinzena || null;
    if (!mes || !ano || !q || d.pagamento_status === "pago") return "";
    const data = _fsDataCurta(_fsDataPagamento(mes, ano, q));
    const fim = q === 1 ? "dia 15" : "último dia do mês";
    const ant = Number(d.antecipado_num || 0);
    const saldo = Math.max(0, Number(d.total_receber_num || 0) - ant);
    const linha = ant > 0
        ? `Você antecipou <b>${_fsR(ant)}</b>. ${saldo > 0.01 ? `O saldo de <b>${_fsR(saldo)}</b> cai em <b>${data}</b>.` : "Não sobrou saldo a receber."}`
        : `<b>${_fsR(d.total_receber_num)}</b> previsto para <b>${data}</b>.`;
    return `<div class="painel-ocorrencias"><div class="poc-card">
        <div class="poc-header">Quando você recebe</div>
        <div class="extr-endereco" style="margin:10px 12px 4px;color:#cbd5e1;font-size:13px">${linha}</div>
        <div class="extr-endereco" style="margin:0 12px 12px">O pagamento sai 45 dias depois do fim da quinzena (${fim}). Quem antecipa recebe antes a parte antecipada.</div>
    </div></div>`;
}

/** Km por dia do deslocamento (asfalto e chão), só os que tem. */
function _fsKm(ds) {
    const km = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " km";
    return [["Asfalto por dia", ds.km_asfalto], ["Chão por dia", ds.km_chao]].filter(([, v]) => Number(v) > 0).map(([r, v]) => [r, km(v)]);
}

// ── Performance por dia (tela principal): todos os dias; os que perderam valor em destaque ──

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

/** Dia em que ele perdeu dinheiro: R$ abaixo do valor de 100% ou entregas na tarifa mínima por PNR. Ocorrência que não custou nada não entra. */
const _fsPerdeuDia = (p) => {
    const fx = _fsFaixa(p.dia);
    return (!p.fixo && fx.max != null && p.valor < fx.max) || (p.tarifa_minima && (p.fixo || (p.pacotes_minima || 0) > 0)) || (p.pod_pacotes || 0) > 0;
};

/** Semanas com POD abaixo da meta: o período, o Good Pod da semana e quanto saiu na quinzena. */
function _fsHtmlPod() {
    const pod = _fsDados.pod || {};
    const semanas = (pod.semanas || []).filter(_fsVale);
    if (!semanas.length) return "";
    const pct = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
    return `<div class="painel-ocorrencias" style="margin-bottom:18px"><div class="poc-card">
        <div class="poc-header">Desconto por POD</div>
        <div class="extr-lista">${semanas.map(x => `<div class="extr-card">
            <div class="extr-top"><span class="extr-transp">Semana de ${_fsDia(x.semana_inicio)} a ${_fsDia(x.semana_fim)}</span><span class="extr-codigo">${_fsEsc(x.usuario)}</span></div>
            <div class="extr-endereco">Good Pod <b class="fs-neg">${pct(x.good)}</b> (meta ${pct(pod.meta)})${x.cidade ? ` · ${_fsEsc(x.cidade)}` : ""} · ${x.pacotes.toLocaleString("pt-BR")} entrega(s) Shopee nesta quinzena</div>
            <div class="extr-bottom"><span class="extr-valor val-neg">−${_fsR(x.valor)}</span></div></div>`).join("")}</div>
    </div></div>`;
}

function _fsHtmlPerformance(d) {
    const perf = d.performance;
    if (!perf || !(perf.dias || []).length) return "";
    const afetados = perf.dias.filter(_fsPerdeuDia);
    const soma = (f) => perf.dias.reduce((s, p) => s + (f(p) || 0), 0);
    const pacMin = soma(p => p.tarifa_minima ? (p.fixo ? p.pacotes_pagos : p.pacotes_minima) : 0);
    const perda = soma(_fsPerdaPnr);
    const mini = (rot, v, neg) => `<div class="fs-mini"><span>${rot}</span><b${neg ? ` class="fs-neg"` : ""}>${v}</b></div>`;
    return `<div class="painel-section-title">Performance por dia</div>
        <div class="fs-resumo">
            ${mini("Dias com perda", `${afetados.length} de ${perf.dias.length}`)}
            ${mini("Onholds e atrasados", soma(p => (p.onholds || 0) + (p.outras_atraso || 0)).toLocaleString("pt-BR"))}
            ${mini("PNR", soma(p => p.acareacoes).toLocaleString("pt-BR"))}
            ${pacMin ? mini("Pacotes na tarifa mínima", pacMin.toLocaleString("pt-BR"), true) : ""}
            ${perda ? mini("Perdido com PNR", "−" + _fsR(perda), true) : ""}
        </div>
        <div class="fs-sub">${afetados.length ? "Em vermelho, os dias em que você recebeu menos que o valor cheio. Toque no dia pra ver os pedidos."
            : "Nenhum dia com perda nesta quinzena: todos no valor cheio."}</div>
        <div class="fs-dias" style="margin-bottom:18px">${perf.dias.slice().sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0)).map(_fsCardDia).join("")}</div>`;
}

function _fsCardDia(p) {
    const fx = _fsFaixa(p.dia);
    const perda = _fsPerdaPnr(p);
    const perdeu = _fsPerdeuDia(p);
    const ocorrencias = (p.onholds || 0) + (p.outras_atraso || 0) + (p.acareacoes || 0);
    return `<div class="fs-dia fs-clicavel${perdeu ? " fs-dia-alerta" : ""}" onclick="_fsAbrirDia('${p.dia}')">
        <div class="fs-dia-topo"><b>${_fsDia(p.dia)}</b> <span>${_fsSem(p.dia)}</span></div>
        <div class="fs-dia-linha">Performance <b>${_fsPct(p.pct)}</b></div>
        <div class="fs-dia-linha">${p.fixo ? "Valor fixo" : p.tarifa_minima && p.pacotes_minima && p.pacotes_pagos
            ? `média <span class="fs-nw">${_fsR(p.total / p.pacotes_pagos)}</span>/pct` : `<span class="fs-nw">${_fsR(p.valor)}</span>/pct`}${!p.fixo && fx.max && p.valor < fx.max
            ? ` <span class="fs-neg fs-nw" title="Quanto ficou abaixo do valor de 100% de performance, por pacote">(−${_fsR(fx.max - p.valor)})</span>` : ""}</div>
        ${p.onholds ? `<div class="fs-dia-linha">${p.onholds} onhold(s)</div>` : ""}
        ${p.outras_atraso ? `<div class="fs-dia-linha">${p.outras_atraso} atrasado(s)</div>` : ""}
        ${p.acareacoes ? `<div class="fs-dia-linha">${p.acareacoes} PNR</div>` : ""}
        ${p.tarifa_minima ? `<div class="fs-dia-linha fs-neg">${p.fixo ? `Fixo com desconto em ${p.pacotes_pagos} pacotes`
            : `${p.pacotes_minima || 0} pacote(s) na tarifa mínima (${_fsR(fx.min)})`}</div>` : ""}
        ${perda ? `<div class="fs-dia-linha fs-neg">−${_fsR(perda)} com PNR</div>` : ""}
        ${p.pod_pacotes ? `<div class="fs-dia-linha fs-neg">−${_fsR(p.pod_desconto)} com POD</div>` : ""}
        ${perdeu ? `<div class="fs-dia-alerta-txt">ver pedidos ›</div>` : `<div class="fs-dia-linha fs-pos">Valor cheio</div>${ocorrencias ? `<div class="fs-dia-linha">ver pedidos ›</div>` : ""}`}
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
    _fsMostrarDia(dia);
}

/** Dia da performance (com acareações / tarifa mínima), ou undefined. */
function _fsPerfDia(dia) {
    return ((_fsDados.performance || {}).dias || []).find(x => x.dia === dia);
}

function _fsFechar() {
    _fsDiaAberto = null;
    const ov = document.getElementById("fs-modal");
    if (ov) ov.remove();
}

/** Pedidos dele na quinzena, uma busca só por quinzena (Shopee sem a XPT, como no resto do painel). */
function _fsCarregarPedidos() {
    if (_fsPedidosBusca) return _fsPedidosBusca;
    const dados = _fsDados;
    _fsPedidosBusca = (async () => {
        const r = await fetch(_fsCtx.pedidos(), { headers: { "Authorization": "Bearer " + token } });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Erro ao carregar os pedidos.");
        const lista = (j.pacotes || []).map(p => _fsEhShopee(p.transportadora) ? { ...p, transportadora: "Shopee" } : p);
        if (dados === _fsDados) _fsPedidos = lista;
        return lista;
    })().catch(err => { if (dados === _fsDados) _fsPedidosBusca = null; throw err; });
    return _fsPedidosBusca;
}

function _fsIsoDeBr(d) {
    const [dd, mm, aa] = String(d || "").split("/");
    return aa ? `${aa}-${mm}-${dd}` : null;
}

/** Entregues do dia, na mesma conta do número do dia: o dia da performance, senão o da entrega. */
function _fsEntreguesDoDia(dia) {
    return (_fsPedidos || []).filter(p => p.data_entrega && _fsIsoDeBr(p.perf_dia || p.data_entrega) === dia);
}

const _fsPessoa = (x) => x.pessoa || _FS_SEM_USUARIO;

/** Pedido ou ocorrência entra na visão atual? Geral: tudo. Por usuário: só quem está marcado (nenhum = todos). */
const _fsVale = (x) => _fsVisao !== "usuario" || !_fsMarcados.size || _fsMarcados.has(_fsPessoa(x));

/** Dia do pedido, na mesma conta do número do dia: performance, senão a entrega, senão o prazo. */
const _fsDiaDoPedido = (p) => _fsIsoDeBr(p.perf_dia || p.data_entrega || p.deve_ser_entregue);

/** Soma de um grupo de pedidos e ocorrências: entregues, valor, R$/pacote, atrasos e onholds, PNR. */
function _fsSomar(pedidos, ocorrencias) {
    const entregues = pedidos.filter(p => p.data_entrega).length;
    const valor = Math.round(pedidos.reduce((t, p) => t + (p.valor_motorista || 0), 0) * 100) / 100;
    const pnr = ocorrencias.filter(x => x.tipo === "Acareação").length;
    const pod = Math.round(pedidos.reduce((t, p) => t + (p.desconto_pod || 0), 0) * 100) / 100;
    return { entregues, valor, por_pacote: entregues ? valor / entregues : 0, atrasos: ocorrencias.length - pnr, pnr, pod };
}

/** Pessoas da quinzena com o resultado de cada uma, da que mais recebeu pra que menos. */
function _fsListaPessoas() {
    const ocorrencias = _fsDados.insucessos || [];
    const nomes = [...new Set(_fsPedidos.concat(ocorrencias).map(_fsPessoa))];
    return nomes.map(nome => ({ nome, ..._fsSomar(_fsPedidos.filter(p => _fsPessoa(p) === nome), ocorrencias.filter(x => _fsPessoa(x) === nome)) }))
        .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"));
}

function _fsMarcarPessoa(i) {
    const { nome } = _fsPessoas[i];
    if (!_fsMarcados.delete(nome)) _fsMarcados.add(nome);
    _fsDesenhar();
}

/** Quem da visão atual passou do limite de PNR no dia (as entregas dessas pessoas caíram pra tarifa mínima). */
function _fsPassaramLimite(p) {
    if (!p || !p.tarifa_minima || p.fixo || !p.usuarios_minima) return [];
    return String(p.usuarios_minima).split(", ").filter(nome => _fsVale({ pessoa: nome }));
}

const _fsMini = (rot, v, neg) => `<div class="fs-mini"><span>${rot}</span><b${neg ? ` class="fs-neg"` : ""}>${v}</b></div>`;

function _fsMinisSoma(t) {
    return `<div class="fs-resumo">
        ${_fsMini("Entregues", t.entregues.toLocaleString("pt-BR"))}
        ${_fsMini("Valor", _fsR(t.valor))}
        ${_fsMini("R$ por pacote", _fsR(t.por_pacote))}
        ${_fsMini("Onholds e atrasados", t.atrasos.toLocaleString("pt-BR"), t.atrasos > 0)}
        ${_fsMini("PNR", t.pnr.toLocaleString("pt-BR"), t.pnr > 0)}
    </div>`;
}

function _fsCardDiaUsuario(dia, t) {
    const passou = _fsPassaramLimite(_fsPerfDia(dia));
    return `<div class="fs-dia fs-clicavel${passou.length ? " fs-dia-alerta" : ""}" onclick="_fsAbrirDia('${dia}')">
        <div class="fs-dia-topo"><b>${_fsDia(dia)}</b> <span>${_fsSem(dia)}</span></div>
        <div class="fs-dia-linha">${t.entregues.toLocaleString("pt-BR")} entregue(s)</div>
        <div class="fs-dia-linha"><b>${_fsR(t.valor)}</b></div>
        <div class="fs-dia-linha"><span class="fs-nw">${_fsR(t.por_pacote)}</span>/pct</div>
        ${t.atrasos ? `<div class="fs-dia-linha">${t.atrasos} onhold(s) e atraso(s)</div>` : ""}
        ${t.pnr ? `<div class="fs-dia-linha">${t.pnr} PNR</div>` : ""}
        ${passou.length ? `<div class="fs-dia-linha fs-neg">Tarifa mínima por PNR</div>` : ""}
        ${t.pod ? `<div class="fs-dia-linha fs-neg">−${_fsR(t.pod)} com POD</div>` : ""}
        <div class="${passou.length ? "fs-dia-alerta-txt" : "fs-dia-linha"}">ver pedidos ›</div>
    </div>`;
}

/** O fechamento das pessoas marcadas: a lista seleciona; embaixo, os números só delas. */
function _fsHtmlPorUsuario() {
    const num = (n) => n.toLocaleString("pt-BR");
    _fsPessoas = _fsListaPessoas();
    const pedidos = _fsPedidos.filter(_fsVale);
    const ocorrencias = (_fsDados.insucessos || []).filter(_fsVale);
    const transps = [...new Set(pedidos.map(p => p.transportadora))]
        .map(nome => ({ nome, ..._fsSomar(pedidos.filter(p => p.transportadora === nome), []) })).sort((a, b) => b.valor - a.valor);
    const dias = [...new Set(pedidos.map(_fsDiaDoPedido).concat(ocorrencias.map(x => x.dia)))].filter(Boolean).sort();
    return `<div class="cft-ajuda" style="margin-bottom:6px">Marque quem você quer ver. Sem ninguém marcado, aparecem todos.</div>
        <div class="cft-tabela-wrap" style="margin-bottom:14px"><table class="cft-tabela"><thead><tr><th></th><th>Usuário</th>
            <th style="text-align:right">Entregues</th><th style="text-align:right">Valor</th><th style="text-align:right">R$/pacote</th>
            <th style="text-align:right;white-space:normal;min-width:62px">Onholds e atrasos</th><th style="text-align:right">PNR</th></tr></thead>
            <tbody>${_fsPessoas.map((u, i) => `<tr style="cursor:pointer" onclick="_fsMarcarPessoa(${i})">
                <td style="width:1%"><input type="checkbox" style="pointer-events:none"${_fsMarcados.has(u.nome) ? " checked" : ""}></td>
                <td style="white-space:normal;min-width:120px">${_fsEsc(u.nome)}</td>
                <td class="num">${num(u.entregues)}</td><td class="num">${_fsR(u.valor)}</td><td class="num">${_fsR(u.por_pacote)}</td>
                <td class="num">${num(u.atrasos)}</td><td class="num">${num(u.pnr)}</td></tr>`).join("")}</tbody></table></div>
        ${_fsMinisSoma(_fsSomar(pedidos, ocorrencias))}
        <div class="painel-section-title">Transportadoras</div>
        <div class="painel-transp">${transps.map(t => `<div class="pt-card ${_fsClasseTransp(t.nome)}">
            <div class="pt-header">${_fsEsc(t.nome)}</div>
            <div class="pt-row"><span>Valor</span><span>${_fsR(t.valor)}</span></div>
            <div class="pt-row"><span>Entregues</span><span>${num(t.entregues)} pacotes</span></div>
            <div class="pt-row"><span>Por pacote</span><span>${_fsR(t.por_pacote)}</span></div>
        </div>`).join("")}</div>
        ${_fsHtmlPod()}
        <div class="painel-section-title">Por dia</div>
        <div class="fs-sub">Toque no dia pra ver os pedidos.</div>
        <div class="fs-dias" style="margin-bottom:18px">${dias.map(dia => _fsCardDiaUsuario(dia,
            _fsSomar(pedidos.filter(p => _fsDiaDoPedido(p) === dia), ocorrencias.filter(x => x.dia === dia)))).join("")}</div>
        <div class="cft-ajuda">Acréscimos, descontos e performance são do entregador: veja em Geral.</div>`;
}

function _fsHtmlResumoDia(dia, p, entregues) {
    const fx = _fsFaixa(dia);
    const perda = _fsPerdaPnr(p);
    const mini = _fsMini;
    return `${p || entregues ? `<div class="fs-resumo">
            ${mini("Entregues", entregues.toLocaleString("pt-BR"))}
            ${p ? `${mini("Performance", _fsPct(p.pct))}
            ${mini(p.tarifa_minima && !p.fixo && p.pacotes_minima ? "R$ por pacote (média)" : "R$ por pacote", p.fixo ? "Fixo"
                : p.tarifa_minima && p.pacotes_minima && p.pacotes_pagos ? _fsR(p.total / p.pacotes_pagos) : _fsR(p.valor))}
            ${mini("Onholds e atrasados", (p.onholds || 0) + (p.outras_atraso || 0), (p.onholds || 0) + (p.outras_atraso || 0) > 0)}
            ${mini("PNR", p.acareacoes || 0, (p.acareacoes || 0) > 0)}
            ${p.tarifa_minima && !p.fixo ? mini("Na tarifa mínima", `${p.pacotes_minima || 0} pct`, true) : ""}
            ${perda ? mini("Perdido com PNR", "−" + _fsR(perda), true) : ""}
            ${p.pod_pacotes ? mini("Perdido com POD", "−" + _fsR(p.pod_desconto), true) : ""}` : ""}
        </div>` : ""}
        ${p && p.pod_pacotes ? `<div class="cft-ajuda fs-neg" style="margin-bottom:8px">POD abaixo da meta na semana: ${p.pod_pacotes} entrega(s) Shopee com desconto (${_fsEsc(p.pod_usuarios || "")}).</div>` : ""}
        ${p && !p.fixo && fx.max && p.valor < fx.max ? `<div class="cft-ajuda" style="margin-bottom:8px">Com 100% de performance seria ${_fsR(fx.max)} por pacote;
            os onholds e atrasados abaixo baixaram pra ${_fsR(p.valor)}.</div>` : ""}
        ${p && p.tarifa_minima ? `<div class="cft-ajuda fs-neg" style="margin-bottom:8px">${p.acareacoes} PNR neste dia
            ${p.fixo ? `— acima do limite pras baixas do dia: todos os pacotes do dia ficaram no valor fixo com desconto, ${_fsR(p.valor)} por pacote.`
                : `— passou do limite no usuário ${_fsEsc(p.usuarios_minima || "")}: ${p.pacotes_minima || 0} entrega(s) desse usuário ficaram na tarifa mínima (${_fsR(fx.min)}).`}</div>` : ""}`;
}

function _fsCardEntregue(p) {
    return `<div class="extr-card">
        <div class="extr-top"><span class="extr-transp">${_fsEsc(p.transportadora)}</span><span class="extr-codigo">${_fsEsc(p.codigo || "")}</span></div>
        <div class="extr-endereco">Entregue ${_fsEsc(p.data_entrega.slice(0, 5))}${p.cidade ? ` · ${_fsEsc(p.cidade)}` : ""}${p.dentro_prazo === "Não" && p.deve_ser_entregue
            ? ` · deveria ser entregue ${_fsEsc(p.deve_ser_entregue.slice(0, 5))}` : ""}${p.pessoa ? ` · ${_fsEsc(p.pessoa)}` : ""}</div>
    </div>`;
}

function _fsCardOcorrencia(x) {
    return `<div class="extr-card">
        <div class="extr-top"><span class="extr-transp fs-neg">${x.tipo === "Acareação" ? "PNR" : _fsEsc(x.tipo)} · ${_fsEsc(x.transportadora)}</span><span class="extr-codigo">${_fsEsc(x.codigo || "")}</span></div>
        <div class="extr-endereco">${x.deveria ? `Deveria ser entregue ${_fsDia(x.deveria)}` : ""}${x.entregue ? ` · entregue ${_fsDia(x.entregue)}` : (x.tipo === "Não entregue" ? " · não entregue" : "")}
            ${x.tipo === "Acareação" ? "" : x.motivo ? `${_fsEsc(x.motivo)}${x.ocorrencia_hora ? ` · às ${_fsEsc(x.ocorrencia_hora)}` : ""}` : ""}${x.pessoa ? ` · ${_fsEsc(x.pessoa)}` : ""}</div>
    </div>`;
}

// Abas: entregues (default; os pedidos vêm do backend na 1ª vez), atrasados e onholds, PNR abertas.
// Segue a visão da tela: Geral = o dia do entregador; Por usuário = só as pessoas marcadas.
function _fsMostrarDia(dia, aba) {
    aba = aba || "entregues";
    _fsDiaAberto = dia + "|" + aba;
    const porUsuario = _fsVisao === "usuario";
    const doDia = (_fsDados.insucessos || []).filter(x => x.dia === dia).filter(_fsVale);
    const listaP = doDia.filter(x => x.tipo === "Acareação");
    const listaA = doDia.filter(x => x.tipo !== "Acareação");
    const entregues = (_fsDados.por_dia || []).filter(x => x.dia === dia).reduce((s, x) => s + (x.entregues || 0), 0);
    const esperando = aba === "entregues" && entregues > 0 && !_fsPedidos;
    const listaE = _fsEntreguesDoDia(dia).filter(_fsVale);
    const abas = [["entregues", "Entregues", porUsuario ? listaE.length : entregues], ["atrasados", "Atrasados e onholds", listaA.length], ["pnr", "PNR abertas", listaP.length]];
    const linhas = aba === "entregues" ? listaE : aba === "pnr" ? listaP : listaA;
    const cards = linhas.map(aba === "entregues" ? _fsCardEntregue : _fsCardOcorrencia);
    const corpo = esperando ? skLogo(true, "Carregando os pedidos")
        : cards.length ? cards.join("") : `<div class="extr-vazio">Nenhum pedido nesta aba.</div>`;
    document.querySelector("#fs-modal .fs-modal").innerHTML = `
        <div class="fs-modal-topo"><span></span>
            <a href="#" class="fs-fechar" onclick="event.preventDefault();_fsFechar()">Fechar</a></div>
        <div class="fs-sub">${_fsDia(dia)} ${_fsSem(dia)} · ${porUsuario && _fsMarcados.size ? _fsEsc([..._fsMarcados].join(", ")) : "pedidos do dia"}</div>
        ${porUsuario ? _fsMinisSoma(_fsSomar((_fsPedidos || []).filter(p => _fsDiaDoPedido(p) === dia).filter(_fsVale), doDia)) : _fsHtmlResumoDia(dia, _fsPerfDia(dia), entregues)}
        <div class="filtro-tabs" style="margin-bottom:10px">${abas.map(([k, n, q]) => `<button type="button" class="filtro-tab${k === aba ? " active" : ""}" onclick="_fsMostrarDia('${dia}', '${k}')">${n} ${q.toLocaleString("pt-BR")}</button>`).join("")}</div>
        <div class="extr-lista" id="fs-dia-lista" style="padding:0">${corpo}</div>`;
    if (!esperando) return;
    _fsCarregarPedidos().then(() => {
        if (_fsDiaAberto === dia + "|" + aba) _fsMostrarDia(dia, aba);
    }).catch(err => {
        const el = document.getElementById("fs-dia-lista");
        if (el && _fsDiaAberto === dia + "|" + aba) el.innerHTML = `<div class="extr-vazio">${_fsEsc(err.message || "Erro ao carregar os pedidos.")}</div>`;
    });
}

/** Planilha da quinzena: mesmas abas do Resumo da Quinzena, com os pedidos dele (vêm do backend na hora). */
async function _fsBaixarRelatorio() {
    const link = document.getElementById("fs-baixar");
    const texto = link.textContent;
    link.textContent = "Gerando...";
    try {
        const pacotes = await _fsCarregarPedidos();
        const d = _fsDados;
        const onholds = (d.insucessos || []).filter(x => x.tipo === "Onhold" || x.tipo === "Acareação");
        const wb = XLSX.utils.book_new();
        for (const a of _rqAbasEntregador({ r: { dias: (d.performance && d.performance.dias) || [] }, pacotes, onholds })) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.linhas), a.nome);
        if ((d.fora_prazo_cidade || []).length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_fsAbaForaPrazo(d.fora_prazo_cidade)), "Fora do prazo (cidade)");
        if ((d.ticketlog || []).length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_fsAbaTicketlog(d.ticketlog)), "Ticket Log");
        XLSX.writeFile(wb, `fechamento_${d.codigo_quinzena}.xlsx`);
    } catch (err) {
        gcAlert(err.message || "Erro ao gerar o relatório.");
    } finally {
        link.textContent = texto;
    }
}
