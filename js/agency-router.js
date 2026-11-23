// ───── SPX Agency Router: o que a Shopee está mandando ─────
//
// Começou como tela de teste da integração ("chegou alguma coisa?"). Agora os
// pushes chegam de verdade, e muito — inclusive de entrega (LM). A pergunta
// mudou para "o que eles mandam tanto, e com qual status?". A tela responde
// nessa ordem:
//   1. quanto veio de cada tipo/serviço no período
//   2. quais status vieram em cada um (cru, como a SPX manda)
//   3. os disparos, filtráveis clicando numa linha de 1 ou 2
// A configuração do webhook e as recusas ficam embaixo.
//
// O status é achado pelo NOME do campo (tudo que tem "status"), em qualquer
// profundidade do payload — ver sistema-backend/modules/agencyrouter/leitura.js.
//
// A SPX NÃO manda o entregador na atualização de entrega (o receiver_name é o
// destinatário). O backend acha o entregador pelo número da AT (trip_number)
// na nossa AT exportada — daí o quadro "Por entregador".

const _AR_MOTIVOS = {
    sem_token:        "Requisição sem JWT",
    assinatura:       "Assinatura não confere",
    algoritmo:        "Algoritmo não aceito",
    expirado:         "Timestamp fora da janela",
    claims:           "Token sem os campos esperados",
    formato:          "Token malformado",
    agencia_errada:   "agency_id de outra agência",
    ip_nao_permitido: "Origem fora da lista de IPs (trava antiga, já retirada)",
};

const _AR_TIPOS = {
    1: { sigla: "FM", nome: "primeira milha" },
    2: { sigla: "LH", nome: "linha-tronco" },
    3: { sigla: "LM", nome: "última milha" },
};

const _AR_PERIODOS = [
    { id: "hoje", rotulo: "Hoje",    frase: "hoje" },
    { id: "7d",   rotulo: "7 dias",  frase: "nos últimos 7 dias" },
    { id: "30d",  rotulo: "30 dias", frase: "nos últimos 30 dias" },
    { id: "tudo", rotulo: "Tudo",    frase: "desde o começo" },
];

const _AR_POR_PAGINA = 50;

// Estado da tela. Os filtros guardam o texto que veio da SPX — por isso o
// onclick das linhas passa só o ÍNDICE, nunca o valor (que pode ter aspas).
const _ar = {
    periodo: "hoje", tipo: null, servico: null, campo: null, valor: null, pagina: 1,
    ats: null, rotuloAts: null,   // filtro "Ver disparos" de um entregador
    ordemEnt: null,               // status pelo qual o quadro por entregador está ordenado
    entregadores: [], colunasEnt: [],
    situacao: null, resumo: null, lista: null,
};

// Status que abre o quadro por entregador ordenado, quando aparece — é a
// pergunta que originou o quadro ("quem fez o OnHold?").
const _AR_STATUS_INICIAL = "OnHold";

const _arNum = (n) => Number(n || 0).toLocaleString("pt-BR");
const _arTipo = (t) => _AR_TIPOS[t] ? `${_AR_TIPOS[t].sigla} · ${_AR_TIPOS[t].nome}` : (t ?? "—");
const _arServico = (s) => s ? _esc(s) : `<span class="ar-vazio">sem serviço</span>`;

function _arQuery(extra = {}) {
    const p = new URLSearchParams({ periodo: _ar.periodo, ...extra });
    if (_ar.tipo) p.set("tipo", _ar.tipo);
    if (_ar.servico !== null) p.set("servico", _ar.servico);
    if (_ar.campo) {
        p.set("campo", _ar.campo);
        if (_ar.valor !== null) p.set("valor", _ar.valor);
    }
    if (_ar.ats && _ar.ats.length) p.set("ats", _ar.ats.join(","));
    return p.toString();
}

async function abrirAgencyRouter(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-agency-router");
    const area = document.getElementById("agency-router-conteudo");
    area.innerHTML = skLogo();
    try {
        const [situacao, resumo, lista] = await Promise.all([
            _cteApi("/api/agency-router/situacao"),
            _cteApi("/api/agency-router/resumo?periodo=" + _ar.periodo),
            _cteApi("/api/agency-router/recebidos?" + _arQuery({ pagina: _ar.pagina, limite: _AR_POR_PAGINA })),
        ]);
        Object.assign(_ar, { situacao, resumo, lista });
        area.innerHTML = _htmlAgencyRouter();
    } catch (e) {
        area.innerHTML = `<div class="aviso-bloqueio"><p>${_esc(e.message)}</p></div>`;
    }
}

/** Troca o período: refaz panorama e lista (os filtros ficam). */
function _arPeriodo(id) {
    _ar.periodo = id;
    _ar.pagina = 1;
    abrirAgencyRouter();
}

/** Só a lista: filtro ou página mudou, o panorama continua o mesmo. */
async function _arRecarregarLista(rolar = true) {
    const alvo = document.getElementById("ar-lista");
    if (!alvo) return abrirAgencyRouter();
    alvo.innerHTML = skLogo(true);
    try {
        _ar.lista = await _cteApi("/api/agency-router/recebidos?" +
            _arQuery({ pagina: _ar.pagina, limite: _AR_POR_PAGINA }));
        alvo.innerHTML = _htmlLista();
        if (rolar) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
        alvo.innerHTML = `<p class="aviso-bloqueio">${_esc(e.message)}</p>`;
    }
}

const _AR_SEM_ENTREGADOR = { ats: null, rotuloAts: null };

function _arFiltrarServico(i) {
    const l = _ar.resumo.por_servico[i];
    Object.assign(_ar, _AR_SEM_ENTREGADOR,
        { tipo: l.data_type, servico: l.servico, campo: null, valor: null, pagina: 1 });
    _arRecarregarLista();
}

function _arFiltrarStatus(i) {
    const l = _ar.resumo.status[i];
    Object.assign(_ar, _AR_SEM_ENTREGADOR,
        { tipo: l.data_type, servico: l.servico, campo: l.campo, valor: l.valor, pagina: 1 });
    _arRecarregarLista();
}

/**
 * Disparos de um entregador (linha i do quadro), opcionalmente só de um status
 * (coluna j). O filtro vai pelas ATs dele — é o que liga disparo a entregador.
 */
function _arFiltrarEntregador(i, j = null) {
    const e = _ar.entregadores[i];
    const status = j === null ? null : _ar.colunasEnt[j];
    Object.assign(_ar, {
        tipo: 3, servico: null, pagina: 1,
        campo: status === null ? null : "order_status", valor: status,
        ats: e.ats, rotuloAts: e.entregador || "AT sem entregador no sistema",
    });
    _arRecarregarLista();
}

function _arOrdenarEntregadores(j) {
    _ar.ordemEnt = _ar.colunasEnt[j];
    const alvo = document.getElementById("ar-entregadores");
    if (alvo) alvo.innerHTML = _htmlTabelaEntregadores();
}

function _arLimparFiltro() {
    Object.assign(_ar, _AR_SEM_ENTREGADOR,
        { tipo: null, servico: null, campo: null, valor: null, pagina: 1 });
    _arRecarregarLista(false);
}

function _arPagina(delta) {
    _ar.pagina = Math.max(1, _ar.pagina + delta);
    _arRecarregarLista();
}

// ══════════════════════════════════════════════ TELA
function _htmlAgencyRouter() {
    const s = _ar.situacao;
    const pronto = s.segredo_configurado && s.agency_id;
    const periodo = _AR_PERIODOS.find((p) => p.id === _ar.periodo);

    return `
    <div class="cabecalho-tela">
        <h2>SPX Agency Router
            <span class="ar-estado ${pronto ? "ar-ok" : "ar-pendente"}">${pronto ? "recebendo" : "falta configurar"}</span></h2>
        <div class="pv-view-toggle">${_AR_PERIODOS.map((p) => `
            <button class="pv-view-btn ${p.id === _ar.periodo ? "active" : ""}"
                    onclick="_arPeriodo('${p.id}')">${p.rotulo}</button>`).join("")}
        </div>
    </div>

    ${!pronto ? `
    <div class="aviso-bloqueio">
        <strong>O webhook ainda não está pronto.</strong>
        <p>Sem o secret ele recusa tudo — de propósito, para não aceitar dado
           que não consegue conferir. Configure no Render (Environment):
           <code>SPX_AGENCY_SECRET</code> e <code>SPX_AGENCY_ID</code>.</p>
    </div>` : ""}

    ${_htmlKpis(periodo)}
    ${_htmlPorServico(periodo)}
    ${_htmlPorEntregador()}
    ${_htmlStatus()}

    <div class="ar-secao">
        <h3 class="ar-titulo">Disparos</h3>
        <div id="ar-lista">${_htmlLista()}</div>
        <div id="ar-corpo"></div>
    </div>

    ${_htmlRecusas(s)}
    ${_htmlConfiguracao(s, pronto)}`;
}

/** Faixa de números do período: total e quanto de cada tipo. */
function _htmlKpis(periodo) {
    const r = _ar.resumo;
    const porTipo = { 1: 0, 2: 0, 3: 0 };
    let itens = 0;
    for (const l of r.por_servico) {
        if (porTipo[l.data_type] !== undefined) porTipo[l.data_type] += l.disparos;
        itens += l.itens;
    }
    const kpi = (rot, val) => `<div class="pv-kpi"><span class="pv-kpi-rot">${rot}</span>
        <span class="pv-kpi-val">${_arNum(val)}</span></div>`;
    return `
    <div class="pv-kpis ar-kpis">
        ${kpi(`Disparos ${periodo.frase}`, r.total)}
        ${kpi("LM · última milha", porTipo[3])}
        ${kpi("LH · linha-tronco", porTipo[2])}
        ${kpi("FM · primeira milha", porTipo[1])}
        ${kpi("Itens dentro deles", itens)}
    </div>`;
}

function _htmlPorServico(periodo) {
    const linhas = _ar.resumo.por_servico;
    return `
    <div class="ar-secao">
        <h3 class="ar-titulo">O que estão mandando</h3>
        ${!linhas.length ? `<p class="dica">Nada chegou ${periodo.frase}.</p>` : `
        <div class="ar-rolagem"><table class="adm-nf-table ar-tabela">
            <thead><tr>
                <th>Tipo</th><th>Serviço</th><th class="ar-num">Disparos</th>
                <th class="ar-num">Itens</th><th>Primeiro</th><th>Último</th><th></th>
            </tr></thead>
            <tbody>${linhas.map((l, i) => `<tr>
                <td>${_esc(_arTipo(l.data_type))}</td>
                <td class="ar-mono">${_arServico(l.servico)}</td>
                <td class="ar-num">${_arNum(l.disparos)}</td>
                <td class="ar-num">${_arNum(l.itens)}</td>
                <td>${_fmtData(l.primeiro)}</td>
                <td>${_fmtData(l.ultimo)}</td>
                <td><button class="pv-acao" onclick="_arFiltrarServico(${i})">Ver disparos</button></td>
            </tr>`).join("")}</tbody>
        </table></div>
        <p class="dica">Itens = quantos registros vêm dentro de cada disparo (um disparo
           de entrega pode trazer vários pedidos).</p>`}
    </div>`;
}

/**
 * Quadro por entregador das atualizações de entrega (LM): uma coluna por
 * status, contando pedidos distintos. Colunas na ordem do total; linhas
 * ordenadas pelo status escolhido (clique no cabeçalho), começando por OnHold.
 */
function _htmlPorEntregador() {
    const grupos = _ar.resumo.por_entregador || [];
    if (!grupos.length) return "";

    const totais = {};
    for (const g of grupos) {
        for (const [st, n] of Object.entries(g.status)) totais[st] = (totais[st] || 0) + n;
    }
    _ar.colunasEnt = Object.keys(totais).sort((a, b) => totais[b] - totais[a] || a.localeCompare(b));
    if (!_ar.colunasEnt.includes(_ar.ordemEnt)) {
        _ar.ordemEnt = _ar.colunasEnt.includes(_AR_STATUS_INICIAL) ? _AR_STATUS_INICIAL : _ar.colunasEnt[0];
    }

    return `
    <div class="ar-secao">
        <h3 class="ar-titulo">Por entregador · última milha</h3>
        <p class="ar-sub">A SPX não manda quem estava com o pacote. O entregador sai da nossa
           AT exportada, pelo número da AT que vem em cada atualização. Conta pedidos: a mesma
           atualização repetida conta uma vez.</p>
        <div id="ar-entregadores">${_htmlTabelaEntregadores()}</div>
    </div>`;
}

function _htmlTabelaEntregadores() {
    const cols = _ar.colunasEnt;
    const ordem = _ar.ordemEnt;
    // "sem entregador" sempre no fim: não é uma pessoa para comparar.
    _ar.entregadores = [...(_ar.resumo.por_entregador || [])].sort((a, b) =>
        (a.entregador === null) - (b.entregador === null)
        || (b.status[ordem] || 0) - (a.status[ordem] || 0)
        || String(a.entregador).localeCompare(String(b.entregador), "pt-BR"));

    return `
    <div class="ar-rolagem"><table class="adm-nf-table ar-tabela">
        <thead><tr>
            <th>Entregador</th><th class="ar-num">ATs</th>
            ${cols.map((c, j) => `<th class="ar-num">
                <button class="ar-ordenar ${c === ordem ? "ar-ordem-ativa" : ""}"
                        onclick="_arOrdenarEntregadores(${j})">${_esc(c || "sem status")}</button></th>`).join("")}
            <th></th>
        </tr></thead>
        <tbody>${_ar.entregadores.map((g, i) => `<tr>
            <td>${g.entregador ? _esc(g.entregador) : `<span class="ar-vazio">AT sem entregador no sistema</span>`}</td>
            <td class="ar-num" title="${_esc(g.ats.join(", "))}">${_arNum(g.ats.length)}</td>
            ${cols.map((c, j) => `<td class="ar-num">${g.status[c]
                ? `<button class="pv-acao ar-num-acao" onclick="_arFiltrarEntregador(${i}, ${j})">${_arNum(g.status[c])}</button>`
                : `<span class="ar-vazio">—</span>`}</td>`).join("")}
            <td><button class="pv-acao" onclick="_arFiltrarEntregador(${i})">Ver disparos</button></td>
        </tr>`).join("")}</tbody>
    </table></div>`;
}

/**
 * Status agrupados por tipo/serviço. Tipo e serviço só aparecem na primeira
 * linha do grupo, para o olho correr pelos valores.
 */
function _htmlStatus() {
    const linhas = _ar.resumo.status;
    if (!_ar.resumo.por_servico.length) return "";
    let grupoAnterior = null;
    return `
    <div class="ar-secao">
        <h3 class="ar-titulo">Com qual status vieram</h3>
        <p class="ar-sub">Exatamente como a SPX manda, sem tradução. Todo campo com
           "status" no nome, em qualquer parte do disparo.</p>
        ${!linhas.length ? `<p class="dica">Nenhum campo de status nos disparos do período.</p>` : `
        <div class="ar-rolagem"><table class="adm-nf-table ar-tabela">
            <thead><tr>
                <th>Tipo</th><th>Serviço</th><th>Campo</th><th>Valor</th>
                <th class="ar-num">Vezes</th><th class="ar-num">Disparos</th><th></th>
            </tr></thead>
            <tbody>${linhas.map((l, i) => {
                const grupo = l.data_type + "|" + l.servico;
                const novo = grupo !== grupoAnterior;
                grupoAnterior = grupo;
                return `<tr class="${novo && i ? "ar-grupo" : ""}">
                <td>${novo ? _esc(_arTipo(l.data_type)) : ""}</td>
                <td class="ar-mono">${novo ? _arServico(l.servico) : ""}</td>
                <td class="ar-campo">${_esc(l.campo)}</td>
                <td class="ar-mono ar-valor">${_esc(l.valor)}</td>
                <td class="ar-num">${_arNum(l.ocorrencias)}</td>
                <td class="ar-num">${_arNum(l.disparos)}</td>
                <td><button class="pv-acao" onclick="_arFiltrarStatus(${i})">Ver disparos</button></td>
            </tr>`;
            }).join("")}</tbody>
        </table></div>`}
    </div>`;
}

function _htmlFiltroAtivo() {
    if (!_ar.tipo && _ar.servico === null && !_ar.campo && !_ar.ats) return "";
    const partes = [];
    if (_ar.ats) partes.push(`${_esc(_ar.rotuloAts)} <span class="ar-vazio">(${_arNum(_ar.ats.length)} AT${_ar.ats.length > 1 ? "s" : ""})</span>`);
    if (_ar.tipo) partes.push(_esc(_arTipo(_ar.tipo)));
    if (_ar.servico !== null) partes.push(_arServico(_ar.servico));
    if (_ar.campo) partes.push(`<span class="ar-mono">${_esc(_ar.campo)} = ${_esc(_ar.valor ?? "")}</span>`);
    return `<div class="ar-filtro">Mostrando só: <b>${partes.join(" · ")}</b>
        <button class="pv-acao" onclick="_arLimparFiltro()">Mostrar todos</button></div>`;
}

/**
 * Status de um disparo: os 3 mais frequentes, o resto vira "+N". O motivo
 * (onhold_reason etc.) vem embaixo — é o que explica o OnHold.
 */
function _htmlStatusDaLinha(status, motivo) {
    if (!status.length && !motivo) return `<span class="ar-vazio">—</span>`;
    const mostra = status.slice(0, 3).map((s) => `<span>
        <span class="ar-campo">${_esc(s.campo)}</span>
        <span class="ar-mono">${_esc(s.valor)}</span>${s.n > 1 ? ` <span class="ar-vazio">×${_arNum(s.n)}</span>` : ""}</span>`);
    if (status.length > 3) mostra.push(`<span class="ar-vazio">+${status.length - 3} outros</span>`);
    if (motivo) mostra.push(`<span class="ar-motivo">${_esc(motivo)}</span>`);
    return `<div class="ar-status-lista">${mostra.join("")}</div>`;
}

function _htmlLista() {
    const l = _ar.lista;
    const periodo = _AR_PERIODOS.find((p) => p.id === _ar.periodo);
    if (!l.itens.length) {
        return `${_htmlFiltroAtivo()}<p class="dica">Nenhum disparo ${periodo.frase}${
            _htmlFiltroAtivo() ? " com esse filtro" : ""}.</p>`;
    }
    const de = (l.pagina - 1) * l.limite + 1;
    const ate = de + l.itens.length - 1;
    return `
    ${_htmlFiltroAtivo()}
    <div class="ar-rolagem"><table class="adm-nf-table ar-tabela">
        <thead><tr>
            <th>Quando</th><th>Tipo</th><th>Pedido</th><th>AT / viagem</th>
            <th>Entregador</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${l.itens.map((r) => `<tr>
            <td class="ar-quando">${_fmtData(r.recebido_em)}</td>
            <td><span class="ar-sigla">${_esc(_AR_TIPOS[r.data_type] ? _AR_TIPOS[r.data_type].sigla : (r.data_type ?? "—"))}</span>
                <span class="ar-mono ar-servico">${_arServico(r.servico)}</span></td>
            <td class="ar-mono" title="${_esc(r.pedido_campo || "")}">${_esc(r.pedido || "—")}${
                r.itens > 1 ? ` <span class="ar-vazio">+${_arNum(r.itens - 1)}</span>` : ""}</td>
            <td class="ar-mono">${_esc(r.at || "—")}</td>
            <td>${r.entregador ? _esc(r.entregador)
                : (r.at && r.data_type === 3 ? `<span class="ar-vazio">AT fora do sistema</span>` : `<span class="ar-vazio">—</span>`)}</td>
            <td>${_htmlStatusDaLinha(r.status, r.motivo)}</td>
            <td><button class="pv-acao" onclick="_arVerCorpo('${_esc(String(r.id))}')">Ver</button></td>
        </tr>`).join("")}</tbody>
    </table></div>
    <div class="ar-paginacao">
        <span>${_arNum(de)}–${_arNum(ate)} de ${_arNum(l.total)}</span>
        <button class="pv-acao" onclick="_arPagina(-1)" ${l.pagina <= 1 ? "disabled" : ""}>Anteriores</button>
        <button class="pv-acao" onclick="_arPagina(1)" ${ate >= l.total ? "disabled" : ""}>Próximos</button>
    </div>`;
}

function _htmlRecusas(s) {
    if (!s.recusas_7_dias || !s.recusas_7_dias.length) return "";
    return `
    <div class="ar-secao">
        <h3 class="ar-titulo">Recusadas nos últimos 7 dias
            ${s.recusas_total ? `<span class="ar-sub">(${_arNum(s.recusas_total)} ao todo)</span>` : ""}</h3>
        <div class="ar-rolagem"><table class="adm-nf-table ar-tabela ar-estreita">
            <thead><tr><th>Motivo</th><th class="ar-num">Quantidade</th></tr></thead>
            <tbody>${s.recusas_7_dias.map((r) => `<tr>
                <td>${_esc(_AR_MOTIVOS[r.motivo] || r.motivo)}</td>
                <td class="ar-num">${_arNum(r.total)}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="dica">
            <b>Assinatura não confere</b> costuma ser secret diferente dos dois lados.
            <b>agency_id de outra agência</b> significa que chegou dado que não é
            nosso — vale mandar para a Shopee, é prova de erro de roteamento.
        </p>
    </div>`;
}

/** Endereço e configuração: fechado quando está tudo certo. */
function _htmlConfiguracao(s, pronto) {
    return `
    <details class="ar-secao ar-config" ${pronto ? "" : "open"}>
        <summary class="ar-titulo">Configuração da integração</summary>
        <p class="mono-pequeno">${_esc(API)}${_esc(s.endpoint)}</p>
        <div class="pv-kpis">
            <div class="pv-kpi"><span class="pv-kpi-rot">Agency ID</span>
                <span class="ar-mono">${_esc(s.agency_id || "faltando")}</span></div>
            <div class="pv-kpi"><span class="pv-kpi-rot">Secret</span>
                <span class="${s.segredo_configurado ? "ar-mono" : "ar-pendente"}">${s.segredo_configurado ? "configurado" : "faltando"}</span></div>
            <div class="pv-kpi"><span class="pv-kpi-rot">Recebidos desde o começo</span>
                <span class="ar-mono">${_arNum(s.recebidos)}</span></div>
        </div>
    </details>`;
}

/**
 * Mostra o payload cru de um disparo.
 *
 * Cru de propósito: é olhando o que chegou de verdade que se descobre o que
 * cada status quer dizer.
 */
async function _arVerCorpo(id) {
    const alvo = document.getElementById("ar-corpo");
    alvo.innerHTML = skLogo(true);
    alvo.scrollIntoView({ behavior: "smooth", block: "nearest" });
    try {
        const linha = await _cteApi("/api/agency-router/recebidos/" + encodeURIComponent(id));
        alvo.innerHTML = `
        <div class="ar-detalhe">
            <div class="ar-detalhe-cab">
                <span><b>Disparo #${_esc(String(linha.id))}</b> · ${_esc(_arTipo(linha.data_type))}
                    · ${_arServico(linha.business_type)} · ${_fmtData(linha.recebido_em)}${
                    linha.entregador ? ` · entregador da AT: <b>${_esc(linha.entregador)}</b>` : ""}</span>
                <button class="pv-acao" onclick="document.getElementById('ar-corpo').innerHTML=''">Fechar</button>
            </div>
            <p class="ar-sub ar-mono">trace_id ${_esc(linha.trace_id || "—")}</p>
            <pre class="ar-pre">${_esc(JSON.stringify(linha.corpo, null, 2))}</pre>
        </div>`;
        alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
        alvo.innerHTML = `<p class="aviso-bloqueio">${_esc(e.message)}</p>`;
    }
}
