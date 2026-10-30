// ───── MEUS FECHAMENTOS: FECHAMENTO DO SISTEMA (visão do entregador) ─────
// Quando a quinzena foi publicada (Criar Fechamento / Resumo da Quinzena › Publicar), o
// /painel devolve fonte "sistema" e o fechamento vem de lá em vez da planilha. Mesmo jeito
// da tela antiga: cards por transportadora (só o resumo), Adicionais e Descontos. "Performance
// por dia" mostra todos os dias; tocando no dia, abas com os entregues, os atrasados e onholds
// (com quando deveriam ser entregues) e as PNR abertas, em duas visões: Geral e Por usuário
// (usuário principal: lista as pessoas e ele marca quem quer ver). Não abre por transportadora: a performance junta todas, e o detalhe separado confundia. "Baixar
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
let _fsDiaVisao = "geral";   // "geral" ou "usuario"
let _fsDiaMarcados = new Set(); // pessoas marcadas em Por usuário (nenhuma = todas); vale nas três abas
let _fsDiaPessoas = [];      // pessoas do dia, na ordem da lista
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

function _fsRender(d) {
    d = _fsJuntarShopee(d);
    _fsDados = d;
    _fsPedidos = _fsPedidosBusca = null;
    const c = d.conta || {};
    const card = (titulo, linhas, extra) => `<div class="pt-card ${extra || ""}">
        <div class="pt-header">${titulo}</div>${linhas.map(([a, b]) => `<div class="pt-row"><span>${a}</span><span>${b}</span></div>`).join("")}</div>`;
    const paj = (rot, v, sub) => `<div class="paj-card${v ? " negativo" : ""}"><div class="paj-label">${rot}</div>
        ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}<div class="paj-value">${_fsR(v)}</div></div>`;
    document.getElementById("fech-sistema").innerHTML = `
        <div class="painel-section-title">Transportadoras</div>
        <div class="painel-transp">${(d.transportadoras || []).map(t => `<div class="pt-card ${_fsClasseTransp(t.nome)}">
            <div class="pt-header">${_fsEsc(t.nome)}</div>
            <div class="pt-row"><span>Valor</span><span>${_fsR(t.valor)}</span></div>
            <div class="pt-row"><span>Entregues</span><span>${t.pacotes.toLocaleString("pt-BR")} pacotes</span></div>
            <div class="pt-row"><span>Por pacote</span><span>${_fsR(t.por_pacote)}</span></div>
        </div>`).join("")}</div>

        ${_fsHtmlPerformance(d)}

        <div class="painel-section-title">Adicionais</div>
        <div class="painel-adicionais">
            ${card("Acréscimos", [["Valor", _fsR(c.acrescimos)]])}
            ${card("Deslocamento", [["Valor", _fsR(c.deslocamento)]].concat(d.deslocamento ? [["Dias", `${d.deslocamento.dias} × ${_fsR(d.deslocamento.valor_dia)}`]]
                .concat(_fsKm(d.deslocamento)) : []))}
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
    return (!p.fixo && fx.max != null && p.valor < fx.max) || (p.tarifa_minima && (p.fixo || (p.pacotes_minima || 0) > 0));
};

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
        <div style="margin-bottom:10px"><a href="#" class="fs-fechar" id="fs-baixar" onclick="event.preventDefault();_fsBaixarRelatorio()">Baixar relatório detalhado</a></div>
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
    _fsDiaVisao = "geral";
    _fsDiaMarcados = new Set();
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
        const r = await fetch(`${API}/painel/fechamento-pedidos?mes=${_fMes}&ano=${_fAno}&quinzena=${_fQuinzena}`, { headers: { "Authorization": "Bearer " + token } });
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

/** Pessoas do dia com o que cada uma fez, da que mais entregou pra que menos. */
function _fsPessoasDoDia(entregues, atrasos, pnrs) {
    const m = new Map();
    const somar = (lista, campo) => {
        for (const x of lista) {
            const nome = _fsPessoa(x);
            if (!m.has(nome)) m.set(nome, { nome, entregues: 0, atrasos: 0, pnr: 0 });
            m.get(nome)[campo]++;
        }
    };
    somar(entregues, "entregues");
    somar(atrasos, "atrasos");
    somar(pnrs, "pnr");
    return [...m.values()].sort((a, b) => b.entregues - a.entregues || a.nome.localeCompare(b.nome, "pt-BR"));
}

function _fsVisaoDia(dia, aba, visao) {
    _fsDiaVisao = visao;
    _fsMostrarDia(dia, aba);
}

function _fsMarcarPessoa(dia, aba, i) {
    const { nome } = _fsDiaPessoas[i];
    if (!_fsDiaMarcados.delete(nome)) _fsDiaMarcados.add(nome);
    _fsMostrarDia(dia, aba);
}

function _fsHtmlResumoDia(dia, p, entregues) {
    const fx = _fsFaixa(dia);
    const perda = _fsPerdaPnr(p);
    const mini = (rot, v, neg) => `<div class="fs-mini"><span>${rot}</span><b${neg ? ` class="fs-neg"` : ""}>${v}</b></div>`;
    return `${p || entregues ? `<div class="fs-resumo">
            ${mini("Entregues", entregues.toLocaleString("pt-BR"))}
            ${p ? `${mini("Performance", _fsPct(p.pct))}
            ${mini(p.tarifa_minima && !p.fixo && p.pacotes_minima ? "R$ por pacote (média)" : "R$ por pacote", p.fixo ? "Fixo"
                : p.tarifa_minima && p.pacotes_minima && p.pacotes_pagos ? _fsR(p.total / p.pacotes_pagos) : _fsR(p.valor))}
            ${mini("Onholds e atrasados", (p.onholds || 0) + (p.outras_atraso || 0), (p.onholds || 0) + (p.outras_atraso || 0) > 0)}
            ${mini("PNR", p.acareacoes || 0, (p.acareacoes || 0) > 0)}
            ${p.tarifa_minima && !p.fixo ? mini("Na tarifa mínima", `${p.pacotes_minima || 0} pct`, true) : ""}
            ${perda ? mini("Perdido com PNR", "−" + _fsR(perda), true) : ""}` : ""}
        </div>` : ""}
        ${p && !p.fixo && fx.max && p.valor < fx.max ? `<div class="cft-ajuda" style="margin-bottom:8px">Com 100% de performance seria ${_fsR(fx.max)} por pacote;
            os onholds e atrasados abaixo baixaram pra ${_fsR(p.valor)}.</div>` : ""}
        ${p && p.tarifa_minima ? `<div class="cft-ajuda fs-neg" style="margin-bottom:8px">${p.acareacoes} PNR neste dia
            ${p.fixo ? `— acima do limite pras baixas do dia: todos os pacotes do dia ficaram no valor fixo com desconto, ${_fsR(p.valor)} por pacote.`
                : `— passou do limite no usuário ${_fsEsc(p.usuarios_minima || "")}: ${p.pacotes_minima || 0} entrega(s) desse usuário ficaram na tarifa mínima (${_fsR(fx.min)}).`}</div>` : ""}`;
}

/** Por usuário: a lista das pessoas é o resumo e também o seletor (toca na linha pra marcar). */
function _fsHtmlPessoasDia(dia, aba) {
    if (!_fsDiaPessoas.length) return "";
    const num = (n) => n.toLocaleString("pt-BR");
    return `<div class="cft-ajuda" style="margin-bottom:6px">Marque quem você quer ver. Sem ninguém marcado, aparecem todos.</div>
        <div class="cft-tabela-wrap" style="margin-bottom:12px"><table class="cft-tabela"><thead><tr><th></th><th>Usuário</th>
            <th style="text-align:right">Entregues</th><th style="text-align:right">Atrasos e onholds</th><th style="text-align:right">PNR</th></tr></thead>
            <tbody>${_fsDiaPessoas.map((u, i) => `<tr style="cursor:pointer" onclick="_fsMarcarPessoa('${dia}', '${aba}', ${i})">
                <td style="width:1%"><input type="checkbox" style="pointer-events:none"${_fsDiaMarcados.has(u.nome) ? " checked" : ""}></td>
                <td style="white-space:normal">${_fsEsc(u.nome)}</td>
                <td class="num">${num(u.entregues)}</td><td class="num">${num(u.atrasos)}</td><td class="num">${num(u.pnr)}</td></tr>`).join("")}</tbody></table></div>`;
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

// Duas visões (Geral / Por usuário) com as mesmas abas: entregues (default; os pedidos vêm do
// backend na 1ª vez), atrasados e onholds, PNR abertas. O resumo do dia é do entregador, só no Geral.
function _fsMostrarDia(dia, aba) {
    aba = aba || "entregues";
    _fsDiaAberto = dia + "|" + aba;
    const porUsuario = _fsDiaVisao === "usuario";
    const doDia = (_fsDados.insucessos || []).filter(x => x.dia === dia);
    const pnrs = doDia.filter(x => x.tipo === "Acareação");
    const atrasos = doDia.filter(x => x.tipo !== "Acareação");
    const entregues = (_fsDados.por_dia || []).filter(x => x.dia === dia).reduce((s, x) => s + (x.entregues || 0), 0);
    const esperando = entregues > 0 && !_fsPedidos && (porUsuario || aba === "entregues");
    const doEntregues = _fsEntreguesDoDia(dia);
    _fsDiaPessoas = _fsPessoasDoDia(doEntregues, atrasos, pnrs);
    const vale = (x) => !porUsuario || !_fsDiaMarcados.size || _fsDiaMarcados.has(_fsPessoa(x));
    const [listaE, listaA, listaP] = [doEntregues, atrasos, pnrs].map(l => l.filter(vale));
    const abas = [["entregues", "Entregues", porUsuario && !esperando ? listaE.length : entregues], ["atrasados", "Atrasados e onholds", listaA.length], ["pnr", "PNR abertas", listaP.length]];
    const linhas = aba === "entregues" ? listaE : aba === "pnr" ? listaP : listaA;
    const cards = linhas.map(aba === "entregues" ? _fsCardEntregue : _fsCardOcorrencia);
    const corpo = esperando ? `<div class="extr-vazio">Carregando os pedidos...</div>`
        : cards.length ? cards.join("") : `<div class="extr-vazio">Nenhum pedido nesta aba.</div>`;
    const visao = (k, n) => `<button type="button"${_fsDiaVisao === k ? ` class="active"` : ""} onclick="_fsVisaoDia('${dia}', '${aba}', '${k}')">${n}</button>`;
    document.querySelector("#fs-modal .fs-modal").innerHTML = `
        <div class="fs-modal-topo"><span></span>
            <a href="#" class="fs-fechar" onclick="event.preventDefault();_fsFechar()">Fechar</a></div>
        <div class="fs-sub">${_fsDia(dia)} ${_fsSem(dia)} · pedidos do dia</div>
        <div class="fs-visao">${visao("geral", "Geral")}${visao("usuario", "Por usuário")}</div>
        ${porUsuario ? (esperando ? "" : _fsHtmlPessoasDia(dia, aba)) : _fsHtmlResumoDia(dia, _fsPerfDia(dia), entregues)}
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
        for (const a of _rqAbasEntregador({ r: { dias: d.performance.dias }, pacotes, onholds })) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.linhas), a.nome);
        XLSX.writeFile(wb, `fechamento_${d.codigo_quinzena}.xlsx`);
    } catch (err) {
        gcAlert(err.message || "Erro ao gerar o relatório.");
    } finally {
        link.textContent = texto;
    }
}
