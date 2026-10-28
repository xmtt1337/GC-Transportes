// ───── FECHAMENTO › RESUMO DA QUINZENA ─────
// Uma linha por entregador: valor de cada transportadora (já com a performance
// consolidada da Shopee), bruto, desconto do Ticketlog e líquido. Lê o que foi gravado no
// Criar Fechamento — nada é calculado aqui. Backend: GET /resumo-quinzena
// (modules/fechamento-transportadoras/resumo-quinzena.js).
const _RQ_API = () => `${API}/admin/fechamento-transportadoras`;
let _rqMes = new Date().getMonth() + 1;
let _rqAno = new Date().getFullYear();
let _rqQuinzena = null;
let _rqDados = null;
let _rqOrdem = { campo: "entregador", desc: false };
let _rqReq = 0;
let _rqXCidades = [];      // cidades escolhidas no "Baixar relatório": [{nome, variantes}] (vazio = todas)
let _rqXNaoAchadas = [];   // nomes colados que não existem nesta quinzena
let _rqAba = "valores";   // valores | performance
let _rqPerf = null;       // {chave: "ano-mes-q", entregadores} da aba Performance
let _rqPerfOrdem = { campo: "pct", desc: false }; // pior performance primeiro
let _rqPerfVisiveis = [];

function _rqEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _rqNum(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _rqChave(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function abrirResumoQuinzena(event) {
    if (event) event.preventDefault();
    const selAno = document.getElementById("rq-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const o = document.createElement("option");
        o.value = a; o.textContent = a;
        if (a === _rqAno) o.selected = true;
        selAno.appendChild(o);
    }
    document.getElementById("rq-mes").value = _rqMes;
    mostrarTela("tela-resumo-quinzena");
    if (_rqQuinzena) _rqCarregar();
}

function _rqPeriodoMudou() {
    _rqMes = parseInt(document.getElementById("rq-mes").value);
    _rqAno = parseInt(document.getElementById("rq-ano").value);
    if (_rqQuinzena) _rqCarregar();
}

function _rqSelecionarQuinzena(q) {
    _rqQuinzena = q;
    document.getElementById("rq-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("rq-btn-2q").classList.toggle("active", q === 2);
    _rqCarregar();
}

function _rqCarregar() {
    const el = document.getElementById("rq-conteudo");
    const req = ++_rqReq;
    el.innerHTML = `<div class="fechamento-empty">Carregando...</div>`;
    _rqPerf = null;
    fetch(`${_RQ_API()}/resumo-quinzena?mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (req !== _rqReq) return;
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_rqEsc(d.error)}</div>`; return; }
        _rqDados = d;
        _rqRender();
    }).catch(() => { if (req === _rqReq) el.innerHTML = `<div class="cft-erro">Erro ao carregar o resumo.</div>`; });
}

// Colunas de transportadora: só as que têm relatório na quinzena.
function _rqColunas() {
    return Object.entries(_rqDados.transportadoras).filter(([, t]) => t.enviado).map(([k, t]) => ({ chave: k, nome: t.nome }));
}

function _rqRender() {
    const d = _rqDados;
    const el = document.getElementById("rq-conteudo");
    const t = d.totais;
    const polos = [...new Set(d.linhas.map(l => l.polo).filter(Boolean))].sort();
    const faltam = Object.values(d.transportadoras).filter(x => !x.enviado).map(x => x.nome);
    // Pendências (âmbar) num bloco só; o que é só informação fica em cinza embaixo dele.
    const pend = [
        t.sem_conversao.linhas ? `<li><b>${t.sem_conversao.linhas} usuário(s) sem conversão de nome</b> (R$ ${_rqNum(t.sem_conversao.valor)}) — aparecem no fim da lista; converta no Criar Fechamento.</li>` : "",
        t.ticketlog_sem_nome ? `<li><b>R$ ${_rqNum(t.ticketlog_sem_nome)} de Ticketlog sem entregador</b> — confira em Descontos: Ticketlog.</li>` : "",
        _rqExtraviosSemConversao(d),
    ].join("");
    const info = [
        faltam.length ? `Sem relatório nesta quinzena: ${_rqEsc(faltam.join(", "))}.` : "",
        !d.ticketlog_arquivos ? "Nenhum relatório do Ticketlog nesta quinzena." : "",
        _rqSemFechamento(t.sem_fechamento),
    ].filter(Boolean);
    el.innerHTML = `
        <div class="cft-barra" style="justify-content:space-between;margin:0 0 10px">
            <span class="cft-ajuda">${d.publicado_em
                ? `<b class="cft-pos">Publicado pros entregadores</b> em ${new Date(d.publicado_em).toLocaleString("pt-BR")} — no Meus Fechamentos eles já veem este fechamento (performance e o que afetou cada dia).`
                : `<b>Não publicado</b> — os entregadores ainda veem a planilha. Publique quando terminar de conferir.`}</span>
            <button class="cft-btn${d.publicado_em ? "" : " primario"}" onclick="_rqPublicar(${d.publicado_em ? "false" : "true"})">${d.publicado_em ? "Despublicar" : "Publicar para os entregadores"}</button>
        </div>
        <div class="rq-topo">
            ${_rqConta(t, d.codigo_quinzena)}
            <div class="rq-meta"><b>${t.entregadores.toLocaleString("pt-BR")}</b> entregadores · <b>${t.pacotes.toLocaleString("pt-BR")}</b> pacotes</div>
        </div>
        ${_rqPorTransportadora(d, t.bruto)}
        ${d.extravios_erro ? `<div class="cft-erro" style="margin-bottom:10px">Não consegui ler a planilha de extravios: ${_rqEsc(d.extravios_erro)}</div>` : ""}
        ${pend ? `<div class="cft-pend"><div class="cft-pend-titulo">Pendências</div><ul class="rq-pend-lista">${pend}</ul></div>` : ""}
        ${info.map(x => `<div class="cft-ajuda" style="margin-bottom:4px">${x}</div>`).join("")}

        <div class="cft-secao rq-abas">
            <a href="#" class="mex-aba" id="rq-aba-valores" onclick="event.preventDefault();_rqMudarAba('valores')">Valores por entregador</a>
            <a href="#" class="mex-aba" id="rq-aba-performance" onclick="event.preventDefault();_rqMudarAba('performance')">Performance por entregador</a>
        </div>
        <div class="cft-barra" style="justify-content:space-between;margin-top:0">
            <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <div class="adm-search-input-area" style="max-width:260px;margin:0">
                    <input type="text" id="rq-busca" placeholder="Entregador..." oninput="_rqRenderTabela()">
                </div>
                <select class="fech-select" id="rq-polo" onchange="_rqRenderTabela()">
                    <option value="">Todos os polos</option>${polos.map(p => `<option>${_rqEsc(p)}</option>`).join("")}
                </select>
            </span>
            <button class="cft-btn" onclick="_rqAlternarBaixar()">Baixar relatório</button>
        </div>
        <div id="rq-baixar" class="cft-regras" style="display:none">
            <div class="cft-ajuda" style="margin-bottom:8px">Relatório detalhado: a aba <b>Todas as transportadoras</b> (todos os pacotes juntos),
                a <b>Performance</b> por entregador e dia — clique no <b>+</b> à esquerda
                da linha no Excel pra abrir os onholds e atrasados daquele dia —, a aba <b>Insucessos</b> com todos eles e, no fim, o <b>Resumo</b> por entregador.
                Escolha o que entra — sem nada escolhido, vai tudo.</div>
            <div class="cft-rotulo" style="margin-bottom:4px">Transportadoras</div>
            <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap;gap:14px">
                ${_rqColunas().map(c => `<label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#cbd5e1">
                    <input type="checkbox" class="rq-x-transp" value="${c.chave}" checked> ${_rqEsc(c.nome)}</label>`).join("")}
            </div>
            <div class="cft-barra" style="margin:0 0 10px;flex-wrap:wrap">
                ${_rqSelect("rq-x-polo", "Todos os polos", (d.opcoes || {}).polos)}
                ${_rqSelect("rq-x-driver", "Todos os entregadores", (d.opcoes || {}).entregadores)}
            </div>
            <div class="cft-rotulo" style="margin-bottom:4px">Cidades</div>
            <datalist id="rq-x-cidades-lista">${_rqGruposCidades().map(g => `<option value="${_rqEsc(g.nome)}">`).join("")}</datalist>
            <div class="cft-barra" style="margin:0 0 6px;flex-wrap:wrap">
                <input class="cft-input" id="rq-x-cidade" list="rq-x-cidades-lista" placeholder="Digite a cidade..." style="width:320px;flex:0 0 auto;margin:0"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();_rqAddCidades(this.value);this.value='';}">
                <button class="cft-btn" onclick="const i=document.getElementById('rq-x-cidade');_rqAddCidades(i.value);i.value=''">Adicionar</button>
            </div>
            <textarea id="rq-x-colar" class="cft-input" rows="2" placeholder="Ou cole uma lista de cidades (uma por linha, ou separadas por vírgula / ponto e vírgula)"
                onpaste="setTimeout(()=>{_rqAddCidades(this.value);this.value='';},0)"></textarea>
            <div id="rq-x-cidades" style="margin:6px 0 10px"></div>
            <div class="cft-barra" style="margin:0">
                <button class="cft-btn primario" id="rq-x-btn" onclick="_rqBaixar()">Baixar</button>
                <span class="cft-ajuda" id="rq-x-status"></span>
            </div>
        </div>
        <div id="rq-painel-valores">
        <div class="cft-tabela-wrap" style="max-height:620px;overflow-y:auto"><table class="cft-tabela">
            <thead id="rq-thead"></thead><tbody id="rq-tbody"></tbody><tfoot id="rq-tfoot"></tfoot>
        </table></div>
        <div class="cft-ajuda" style="margin-top:6px">Valor de cada transportadora = soma do "Valor motorista" dos pacotes (Shopee já pela performance consolidada).
            Líquido = bruto + acréscimos − Ticketlog − extravios − descontos. Extravios: planilha de extravios, linhas com "Data desconto" = ${_rqEsc(d.codigo_quinzena || "")}.
            Acréscimos e descontos: Fechamento › Acréscimos e Descontos. Deslocamento: Fechamento › Deslocamentos. Clique no título da coluna pra ordenar.</div>
        </div>
        <div id="rq-painel-performance" style="display:none"></div>`;
    _rqRenderTabela();
    _rqRenderCidades();
    _rqRenderAbas();
}

// ── Aba Performance por entregador ──
// Performance consolidada da quinzena (a mesma que paga a Shopee: entregador × dia, juntando
// as transportadoras, só nos polos da regra) somada por entregador. Lida uma vez por quinzena.
function _rqMudarAba(a) { _rqAba = a; _rqRenderAbas(); }
function _rqRenderAbas() {
    for (const a of ["valores", "performance"]) {
        document.getElementById("rq-aba-" + a).classList.toggle("ativa", _rqAba === a);
        document.getElementById("rq-painel-" + a).style.display = _rqAba === a ? "" : "none";
    }
    if (_rqAba === "performance") _rqCarregarPerf();
}

async function _rqCarregarPerf() {
    const el = document.getElementById("rq-painel-performance");
    const chave = `${_rqAno}-${_rqMes}-${_rqQuinzena}`;
    if (_rqPerf && _rqPerf.chave === chave) { _rqRenderPerf(); return; }
    el.innerHTML = `<div class="cft-ajuda">Carregando a performance...</div>`;
    const chaves = Object.entries(_rqDados.transportadoras).filter(([, t]) => /^shopee/i.test(t.nome) && t.enviado).map(([k]) => k);
    try {
        const linhas = await _rqPerfLinhas(chaves);
        if (chave !== `${_rqAno}-${_rqMes}-${_rqQuinzena}`) return; // trocou de quinzena no meio
        _rqPerf = { chave, entregadores: _rqPerfPorEntregador(linhas) };
        _rqRenderPerf();
    } catch (_) { el.innerHTML = `<div class="cft-erro">Erro ao carregar a performance.</div>`; }
}

/** Dias (entregador × dia) somados por entregador: tentativas, performance da quinzena, pior dia. */
function _rqPerfPorEntregador(linhas) {
    const por = new Map();
    for (const l of linhas) {
        if (!por.has(l.driver)) por.set(l.driver, { entregador: l.driver, dias: [], polos: new Map(), sucessos: 0, onholds: 0, atrasos: 0, pacotes_pagos: 0, total: 0 });
        const r = por.get(l.driver);
        r.dias.push({ dia: l.dia, pct: l.pct, valor: l.valor, shopee: l.shopee || 0, onholds: l.onholds || 0,
            outras_prazo: l.outras_prazo || 0, outras_atraso: l.outras_atraso || 0, pacotes_pagos: l.pacotes_pagos || 0, total: l.total || 0, fixo: !!l.fixo,
            acareacoes: l.acareacoes || 0, tarifa_minima: !!l.tarifa_minima });
        r.sucessos += (l.shopee || 0) + (l.outras_prazo || 0);
        r.onholds += l.onholds || 0;
        r.atrasos += l.outras_atraso || 0;
        r.pacotes_pagos += l.pacotes_pagos || 0;
        r.total += l.total || 0;
        if (l.polo) r.polos.set(l.polo, (r.polos.get(l.polo) || 0) + 1);
    }
    return [...por.values()].map(r => {
        const tentativas = r.sucessos + r.onholds + r.atrasos;
        const dias = r.dias.sort((a, b) => (a.dia < b.dia ? -1 : 1));
        const comPct = dias.filter(d => d.pct != null);
        return {
            entregador: r.entregador, dias, dias_n: dias.length, sucessos: r.sucessos, onholds: r.onholds, atrasos: r.atrasos,
            polo: [...r.polos.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || "",
            pct: tentativas ? Math.round(r.sucessos / tentativas * 10000) / 100 : null,
            pior: comPct.reduce((m, d) => (!m || d.pct < m.pct ? d : m), null),
            abaixo: comPct.filter(d => d.pct < 98).length,
            acima: comPct.filter(d => d.pct >= 98).length,
            pacotes_pagos: r.pacotes_pagos, total: Math.round(r.total * 100) / 100,
            por_pacote: r.pacotes_pagos ? Math.round(r.total / r.pacotes_pagos * 100) / 100 : 0,
        };
    });
}

// Mesma régua da tabela de valor: 98% ou mais paga o máximo, abaixo de 95% o mínimo (seg a sáb).
function _rqPctClasse(p) { return p == null ? "cft-vazio" : p >= 98 ? "cft-pos" : p < 95 ? "cft-neg" : ""; }
function _rqPct(p) { return p == null ? "—" : p.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"; }
function _rqDiaCurto(iso) { const [, m, d] = String(iso || "").split("-"); return d ? `${d}/${m}` : ""; }

function _rqPerfFiltrados() {
    const busca = _rqChave((document.getElementById("rq-busca") || {}).value);
    const polo = (document.getElementById("rq-polo") || {}).value || "";
    const poloResumo = new Map((_rqDados.linhas || []).map(l => [l.entregador, l.polo]));
    const lista = _rqPerf.entregadores.map(r => ({ ...r, polo: poloResumo.get(r.entregador) || r.polo }))
        .filter(r => (!busca || _rqChave(r.entregador).includes(busca)) && (!polo || r.polo === polo));
    const { campo, desc } = _rqPerfOrdem;
    const val = (r) => campo === "pior" ? (r.pior ? r.pior.pct : null) : r[campo];
    return lista.sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null || y == null) return (x == null) - (y == null); // sem performance sempre no fim
        const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
        return desc ? -c : c;
    });
}

function _rqPerfOrdenar(campo) {
    _rqPerfOrdem = { campo, desc: _rqPerfOrdem.campo === campo ? !_rqPerfOrdem.desc : !["entregador", "polo", "pct", "pior"].includes(campo) };
    _rqRenderPerf();
}
function _rqPerfAbrir(i) {
    _rqAbrirCardEntregador(_rqPerfVisiveis[i]);
}

// ── Card do entregador: dias, % e os pedidos que derrubaram cada dia ──
let _rqCard = null; // { r, pacotes, onholds, abertos: Set(dia) }

function _rqIsoDeBr(d) {
    const m = String(d || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : (d || null);
}

/** Situação de um pacote na performance (o que o card e as planilhas mostram). */
function _rqSituacao(p) {
    if (/^shopee/i.test(p.transportadora)) return p.data_entrega ? "Entregue (Shopee)" : "Não entregue (Shopee)";
    if (!p.perf_dia) return "Fora da conta";
    if (!p.data_entrega) return "Não entregue";
    return p.dentro_prazo === "Não" ? "Atrasado" : "No prazo";
}
const _RQ_AFETOU = ["Atrasado", "Não entregue", "Onhold", "Acareação"];

/** Pedidos que contaram num dia: pacotes com perf_dia = dia + os onholds do dia. Os que afetaram primeiro. */
function _rqPedidosDoDia(dia, pacotes, onholds) {
    const ps = pacotes.filter(p => _rqIsoDeBr(p.perf_dia) === dia).map(p => ({
        situacao: _rqSituacao(p), transportadora: p.transportadora, codigo: p.codigo, cidade: p.cidade || "",
        deveria: p.deve_ser_entregue || "", entregue: p.data_entrega || "", valor: p.valor_motorista || 0, motivo: "", ocorrencia: p.data_entrega || "" }));
    const os = onholds.filter(o => o.dia === dia).map(o => ({
        situacao: o.tipo || "Onhold", transportadora: o.transportadora, codigo: o.codigo || "", cidade: "", deveria: "", entregue: "", valor: 0, motivo: o.motivo || "",
        ocorrencia: _rqOcorrencia(o) }));
    const peso = (x) => (_RQ_AFETOU.includes(x.situacao) ? 0 : 1);
    return os.concat(ps).sort((a, b) => peso(a) - peso(b) || a.situacao.localeCompare(b.situacao) || String(a.codigo).localeCompare(String(b.codigo)));
}

async function _rqAbrirCardEntregador(nome) {
    const r = (_rqPerf.entregadores || []).find(x => x.entregador === nome);
    if (!r) return;
    _rqFecharCard();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "rq-card";
    ov.innerHTML = `<div class="cft-modal rq-card"><div class="cft-ajuda">Carregando os pedidos de ${_rqEsc(nome)}...</div></div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _rqFecharCard(); });
    document.body.appendChild(ov);
    document.addEventListener("keydown", _rqCardEsc);
    const qs = `mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}&driver=${encodeURIComponent(nome)}`;
    try {
        const h = { headers: { "Authorization": "Bearer " + token } };
        const [p, i] = await Promise.all([
            fetch(`${_RQ_API()}/resumo-quinzena/pacotes?${qs}`, h).then(x => x.json()),
            fetch(`${_RQ_API()}/performance/insucessos?${qs}`, h).then(x => x.json()),
        ]);
        if (p.error || i.error) throw new Error(p.error || i.error);
        _rqCard = { r, pacotes: p.pacotes || [], onholds: (i.linhas || []).filter(x => x.tipo === "Onhold" || x.tipo === "Acareação"), abertos: new Set() };
        _rqRenderCard();
    } catch (err) {
        const c = ov.querySelector(".rq-card");
        if (c) c.innerHTML = `<div class="cft-erro">${_rqEsc(err.message || "Erro ao carregar.")}</div>`;
    }
}

function _rqCardEsc(e) { if (e.key === "Escape") _rqFecharCard(); }
function _rqFecharCard() {
    const ov = document.getElementById("rq-card");
    if (ov) ov.remove();
    document.removeEventListener("keydown", _rqCardEsc);
}

function _rqRenderCard() {
    const ov = document.getElementById("rq-card");
    if (!ov || !_rqCard) return;
    const { r, pacotes, onholds, abertos } = _rqCard;
    const diaSem = (iso) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(iso + "T12:00:00Z").getUTCDay()];
    const linhaPedido = (x) => `<tr>
        <td class="${_RQ_AFETOU.includes(x.situacao) ? "cft-neg" : "cft-ajuda"}">${_rqEsc(x.situacao)}</td>
        <td>${_rqEsc(x.transportadora)}</td><td>${_rqEsc(x.codigo)}</td>
        <td>${_rqEsc(x.deveria) || "—"}</td><td>${_rqEsc(x.entregue) || (x.situacao.startsWith("Não entregue") ? "não entregue" : "—")}</td>
        <td style="white-space:normal">${_rqEsc(x.motivo || x.cidade)}${x.situacao === "Onhold" && x.ocorrencia ? ` <span class="cft-ajuda">${_rqEsc(x.ocorrencia)}</span>` : ""}</td></tr>`;
    ov.querySelector(".rq-card").innerHTML = `
        <div class="cft-barra" style="justify-content:space-between;margin:0 0 6px">
            <div class="cft-modal-titulo" style="margin:0">${_rqEsc(r.entregador)}</div>
            <span><button class="cft-btn" onclick="_rqBaixarEntregador()">Baixar relatório do entregador</button>
                <button class="cft-btn" onclick="_rqFecharCard()">Fechar</button></span>
        </div>
        <div class="cft-ajuda" style="margin-bottom:10px">${_rqEsc(r.polo || "")} · performance da quinzena
            <strong class="${_rqPctClasse(r.pct)}">${_rqPct(r.pct)}</strong> · ${r.sucessos.toLocaleString("pt-BR")} sucessos,
            ${r.onholds} onhold(s), ${r.atrasos} atrasado(s)/não entregue(s) · ticket médio R$ ${_rqNum(r.por_pacote)} · total R$ ${_rqNum(r.total)}</div>
        <div class="cft-tabela-wrap" style="max-height:62vh;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Dia</th><th style="text-align:right">Shopee</th><th style="text-align:right">Outras no prazo</th>
                <th style="text-align:right">Onholds</th><th style="text-align:right">Atrasados</th><th style="text-align:right">Performance</th>
                <th style="text-align:right">R$/pacote</th><th style="text-align:right">Pagos</th><th style="text-align:right">Total</th><th></th></tr></thead>
            <tbody>${r.dias.map(d => {
                const afetou = d.onholds + d.outras_atraso + (d.acareacoes || 0);
                const ped = abertos.has(d.dia) ? _rqPedidosDoDia(d.dia, pacotes, onholds) : null;
                return `<tr>
                    <td>${_rqDiaCurto(d.dia)} <span class="cft-ajuda">${diaSem(d.dia)}</span></td>
                    <td class="num">${d.shopee}</td><td class="num">${d.outras_prazo}</td>
                    <td class="num${d.onholds ? " cft-neg" : ""}">${d.onholds}</td><td class="num${d.outras_atraso ? " cft-neg" : ""}">${d.outras_atraso}</td>
                    <td class="num ${_rqPctClasse(d.pct)}"><strong>${_rqPct(d.pct)}</strong></td>
                    <td class="num">${d.tarifa_minima ? `<span class="cft-neg" title="${d.acareacoes} acareações no dia: ${d.fixo ? "fixo com desconto" : `${d.pacotes_minima || 0} pacote(s) de ${d.usuarios_minima || "?"} na tarifa mínima`}">${d.acareacoes} acareações</span> ` : ""}${d.fixo && !d.tarifa_minima ? `<span class="cft-ajuda">fixo</span> ` : ""}${_rqNum(d.valor)}</td>
                    <td class="num">${d.pacotes_pagos}</td><td class="num">${_rqNum(d.total)}</td>
                    <td style="white-space:nowrap"><a href="#" class="cft-ordem" style="color:#60a5fa" onclick="event.preventDefault();_rqCardAlternarDia('${d.dia}')">${abertos.has(d.dia) ? "fechar" : (afetou ? "ver o que afetou" : "ver pedidos")}</a>
                        · <a href="#" class="cft-ordem" style="color:#60a5fa" onclick="event.preventDefault();_rqBaixarDia('${d.dia}')">baixar</a></td>
                </tr>${ped ? `<tr><td colspan="10" style="background:rgba(255,255,255,0.02);padding:8px 12px">
                    ${(() => {
                        const af = ped.filter(x => _RQ_AFETOU.includes(x.situacao));
                        const resto = ped.length - af.length;
                        return (af.length ? `<table class="cft-tabela" style="margin:0"><thead><tr><th>Situação</th><th>Transportadora</th><th>Pedido</th>
                            <th>Deveria ser entregue</th><th>Entregue em</th><th>Motivo / cidade</th></tr></thead><tbody>${af.map(linhaPedido).join("")}</tbody></table>`
                            : `<span class="cft-ajuda">Nenhum pedido derrubou esse dia.</span>`)
                            + `<div class="cft-ajuda" style="margin-top:6px">${resto} pedido(s) no prazo nesse dia — estão no "baixar".</div>`;
                    })()}</td></tr>` : ""}`;
            }).join("")}</tbody>
        </table></div>`;
}

function _rqCardAlternarDia(dia) {
    if (_rqCard.abertos.has(dia)) _rqCard.abertos.delete(dia); else _rqCard.abertos.add(dia);
    _rqRenderCard();
}

const _RQ_CAB_PEDIDOS = ["Dia da performance", "Situação", "Afetou a performance?", "Data da ocorrência", "Transportadora", "Pedido", "Cidade", "Deveria ser entregue", "Entregue em", "Valor pago", "Motivo do onhold"];
function _rqLinhasPedidos(dia, ped) {
    return ped.map(x => [_rqDiaCurto(dia), x.situacao, _RQ_AFETOU.includes(x.situacao) ? "Sim" : "Não", x.ocorrencia || "", x.transportadora, x.codigo, x.cidade,
        x.deveria, x.entregue, x.valor, x.motivo]);
}
function _rqNomeArquivo(sufixo) {
    const nome = _rqCard.r.entregador.replace(/[^\w\u00C0-\u017F]+/g, "-");
    return `performance_${nome}_${_rqQuinzena}q_${String(_rqMes).padStart(2, "0")}-${_rqAno}${sufixo}.xlsx`;
}

/** Planilha de um dia: os pedidos que contaram nele (os que afetaram primeiro). */
function _rqPlanilhaDia(dia) {
    return [_RQ_CAB_PEDIDOS].concat(_rqLinhasPedidos(dia, _rqPedidosDoDia(dia, _rqCard.pacotes, _rqCard.onholds)));
}
function _rqBaixarDia(dia) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(_rqPlanilhaDia(dia)), "Pedidos " + _rqDiaCurto(dia).replace("/", "-"));
    XLSX.writeFile(wb, _rqNomeArquivo("_dia-" + _rqDiaCurto(dia).replace("/", "-")));
}

/** Relatório inteiro do entregador: dias, o que afetou cada dia e todos os pedidos. */
function _rqAbasEntregador() {
    const { r, pacotes, onholds } = _rqCard;
    const dias = [["Dia", "Shopee entregues", "Outras no prazo", "Onholds", "Atrasados/não entregues", "Performance (%)", "R$/pacote", "Pacotes pagos", "Total"]]
        .concat(r.dias.map(d => [_rqDiaCurto(d.dia), d.shopee, d.outras_prazo, d.onholds, d.outras_atraso, d.pct, d.valor, d.pacotes_pagos, d.total]));
    const todos = r.dias.flatMap(d => _rqLinhasPedidos(d.dia, _rqPedidosDoDia(d.dia, pacotes, onholds)));
    const fora = pacotes.filter(p => !p.perf_dia && !/^shopee/i.test(p.transportadora)).map(p => ["", _rqSituacao(p), "Não", p.data_entrega || "", p.transportadora, p.codigo,
        p.cidade || "", p.deve_ser_entregue || "", p.data_entrega || "", p.valor_motorista || 0, ""]);
    return [
        { nome: "Dias", linhas: dias },
        { nome: "O que afetou", linhas: [_RQ_CAB_PEDIDOS].concat(todos.filter(l => l[2] === "Sim")) },
        { nome: "Todos os pedidos", linhas: [_RQ_CAB_PEDIDOS].concat(todos, fora) },
    ];
}
function _rqBaixarEntregador() {
    const wb = XLSX.utils.book_new();
    for (const a of _rqAbasEntregador()) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(a.linhas), a.nome);
    XLSX.writeFile(wb, _rqNomeArquivo(""));
}

function _rqRenderPerf() {
    const el = document.getElementById("rq-painel-performance");
    if (!el || !_rqPerf) return;
    const todos = _rqPerf.entregadores;
    if (!todos.length) {
        el.innerHTML = `<div class="cft-ajuda">Sem performance nesta quinzena — ela sai do relatório da Shopee (Criar Fechamento).</div>`;
        return;
    }
    const lista = _rqPerfFiltrados();
    _rqPerfVisiveis = lista.map(r => r.entregador);
    const s = lista.reduce((a, r) => a + r.sucessos, 0), f = lista.reduce((a, r) => a + r.onholds + r.atrasos, 0);
    const faixa = (fn) => lista.filter(r => r.pct != null && fn(r.pct)).length;
    const seta = (c) => _rqPerfOrdem.campo === c ? (_rqPerfOrdem.desc ? " ↓" : " ↑") : "";
    const th = (c, rot, num) => `<th${num ? ` style="text-align:right"` : ""}><a href="#" class="cft-ordem" onclick="event.preventDefault();_rqPerfOrdenar('${c}')">${rot}${seta(c)}</a></th>`;
    el.innerHTML = `
        <div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor ${_rqPctClasse(s + f ? s / (s + f) * 100 : null)}">${_rqPct(s + f ? Math.round(s / (s + f) * 10000) / 100 : null)}</div><div class="cft-kpi-rotulo">Performance geral</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${lista.length}</div><div class="cft-kpi-rotulo">Entregadores</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor cft-pos">${faixa(p => p >= 98)}</div><div class="cft-kpi-rotulo">98% ou mais</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${faixa(p => p >= 95 && p < 98)}</div><div class="cft-kpi-rotulo">95% a 98%</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor${faixa(p => p < 95) ? " cft-neg" : ""}">${faixa(p => p < 95)}</div><div class="cft-kpi-rotulo">Abaixo de 95%</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${lista.reduce((a, r) => a + r.onholds, 0).toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Onholds</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${lista.reduce((a, r) => a + r.atrasos, 0).toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Atrasos (outras transp.)</div></div>
        </div>
        <div class="cft-tabela-wrap" style="max-height:620px;overflow-y:auto"><table class="cft-tabela">
            <thead><tr>${th("entregador", "Entregador")}${th("polo", "Polo")}${th("dias_n", "Dias", true)}${th("sucessos", "Sucessos", true)}
                ${th("onholds", "Onholds", true)}${th("atrasos", "Atrasos", true)}${th("pct", "Performance", true)}${th("pior", "Pior dia", true)}
                ${th("acima", "Dias 98%+", true)}${th("abaixo", "Dias abaixo de 98%", true)}${th("pacotes_pagos", "Pacotes pagos", true)}${th("por_pacote", "Ticket médio", true)}${th("total", "Total (R$)", true)}</tr></thead>
            <tbody>${lista.length ? lista.map((r, i) => `<tr class="rq-perf-linha" onclick="_rqPerfAbrir(${i})" title="Clique pra ver os dias e os pedidos">
                <td>${_rqEsc(r.entregador)}</td>
                <td>${r.polo ? _rqEsc(r.polo) : `<span class="cft-vazio">—</span>`}</td>
                <td class="num">${r.dias.length}</td>
                <td class="num">${r.sucessos.toLocaleString("pt-BR")}</td>
                <td class="num">${r.onholds || `<span class="cft-vazio">—</span>`}</td>
                <td class="num">${r.atrasos || `<span class="cft-vazio">—</span>`}</td>
                <td class="num"><span class="rq-perf-pct"><em><i class="${_rqPctClasse(r.pct)}" style="width:${Math.max(0, Math.min(100, r.pct || 0))}%"></i></em><strong class="${_rqPctClasse(r.pct)}">${_rqPct(r.pct)}</strong></span></td>
                <td class="num">${r.pior ? `<span class="${_rqPctClasse(r.pior.pct)}">${_rqPct(r.pior.pct)}</span> <span class="cft-ajuda">${_rqDiaCurto(r.pior.dia)}</span>` : `<span class="cft-vazio">—</span>`}</td>
                <td class="num">${r.acima}</td>
                <td class="num${r.abaixo ? " cft-aviso" : ""}">${r.abaixo}</td>
                <td class="num">${r.pacotes_pagos.toLocaleString("pt-BR")}</td>
                <td class="num" title="Total ÷ pacotes pagos">${_rqNum(r.por_pacote)}</td>
                <td class="num"><strong>${_rqNum(r.total)}</strong></td>
            </tr>`).join("")
            : `<tr><td colspan="13" class="cft-vazio" style="padding:14px">Nada com esse filtro.</td></tr>`}</tbody>
        </table></div>
        <div class="cft-ajuda" style="margin-top:6px">Performance = sucessos ÷ (sucessos + onholds + atrasos), juntando todas as transportadoras — a mesma que define o valor da Shopee,
            só nos polos da regra (Criar Fechamento). Verde: 98% ou mais; vermelho: abaixo de 95%. Clique no entregador pra ver os dias, os pedidos que afetaram cada dia e baixar.
            Ticket médio = total ÷ pacotes pagos.</div>`;
}

// Cidades do filtro: aceita uma ou uma lista colada. Casa sem olhar acento, caixa,
// espaço/hífen/apóstrofo nem "/SC" ou "- SC" no fim — e pega TODAS as grafias da mesma
// cidade que existem na quinzena (Joaçaba, JOACABA, Joacaba...). O que não existe vira aviso.
function _rqChaveCidade(c) {
    return _rqChave(c).replace(/\s*[-/]\s*[a-z]{2}$/, "").replace(/[^a-z0-9]+/g, "");
}
// Grafias da quinzena agrupadas; o nome mostrado é o "mais bonito" (com acento e sem tudo maiúsculo).
function _rqGruposCidades() {
    const g = new Map();
    for (const c of ((_rqDados && _rqDados.opcoes) || {}).cidades || []) {
        const k = _rqChaveCidade(c);
        if (!k) continue;
        if (!g.has(k)) g.set(k, { chave: k, variantes: [] });
        g.get(k).variantes.push(c);
    }
    const nota = (v) => (/[^\x00-\x7f]/.test(v) ? 2 : 0) + (v !== v.toUpperCase() ? 1 : 0);
    return [...g.values()].map(x => ({ ...x, nome: x.variantes.slice().sort((a, b) => nota(b) - nota(a))[0] }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
function _rqAddCidades(texto) {
    const grupos = new Map(_rqGruposCidades().map(x => [x.chave, x]));
    for (const bruto of String(texto || "").split(/[\n\r;,\t]+/)) {
        const nome = bruto.trim();
        if (!nome) continue;
        const g = grupos.get(_rqChaveCidade(nome));
        if (g) { if (!_rqXCidades.some(x => x.chave === g.chave)) _rqXCidades.push(g); }
        else if (!_rqXNaoAchadas.includes(nome)) _rqXNaoAchadas.push(nome);
    }
    _rqRenderCidades();
}
function _rqTirarCidade(i) { _rqXCidades.splice(i, 1); _rqRenderCidades(); }
function _rqLimparCidades() { _rqXCidades = []; _rqXNaoAchadas = []; _rqRenderCidades(); }
function _rqRenderCidades() {
    const el = document.getElementById("rq-x-cidades");
    if (!el) return;
    el.innerHTML = (_rqXCidades.length
        ? `<span class="cft-ajuda">${_rqXCidades.length} cidade(s): </span>` + _rqXCidades.map((c, i) =>
            `<span class="cft-etiqueta"${c.variantes.length > 1 ? ` title="Grafias: ${_rqEsc(c.variantes.join(" · "))}"` : ""}>${_rqEsc(c.nome)}${c.variantes.length > 1 ? ` <span class="cft-ajuda">+${c.variantes.length - 1}</span>` : ""} <a href="#" title="Tirar" onclick="event.preventDefault();_rqTirarCidade(${i})">×</a></span>`).join(" ")
            + ` <a href="#" class="cft-ordem cft-ajuda" onclick="event.preventDefault();_rqLimparCidades()">limpar</a>`
        : `<span class="cft-ajuda">Todas as cidades.</span>`)
        + (_rqXNaoAchadas.length ? `<div class="cft-ajuda" style="margin-top:4px"><span class="cft-aviso">Sem pacote nesta quinzena:</span> ${_rqEsc(_rqXNaoAchadas.join(", "))}</div>` : "");
}

// A conta da quinzena numa linha: Bruto + Acréscimos + Deslocamento − Ticketlog − Extravios − Descontos = Líquido.
function _rqConta(t, codigo) {
    const item = (rot, v, cls) => `<div class="rq-conta-item"><span class="rq-conta-rot">${rot}</span><span class="rq-conta-val${v && cls ? " " + cls : ""}">${_rqNum(v)}</span></div>`;
    const op = (s) => `<span class="rq-conta-op">${s}</span>`;
    return `<div class="rq-conta">
        ${item("Bruto (R$)", t.bruto)}${op("+")}${item("Acréscimos", t.acrescimos, "cft-pos")}${op("+")}${item("Deslocamento", t.deslocamento, "cft-pos")}${op("−")}${item("Ticketlog", t.ticketlog, "cft-neg")}
        ${op("−")}${item(`Extravios · ${_rqEsc(codigo || "")}`, t.extravios, "cft-neg")}${op("−")}${item("Descontos", t.descontos, "cft-neg")}${op("=")}
        <div class="rq-conta-item rq-conta-total"><span class="rq-conta-rot">Líquido (R$)</span><span class="rq-conta-val cft-pos">${_rqNum(t.liquido)}</span></div>
    </div>`;
}

// Uma linha por transportadora, com a parte de cada uma no bruto (barra na cor dela).
function _rqPorTransportadora(d, bruto) {
    const cores = new Map((typeof _CF_TRANSPORTADORAS !== "undefined" ? _CF_TRANSPORTADORAS : []).map(x => [x.key, x.cor]));
    const ts = Object.entries(d.transportadoras).filter(([, x]) => x.enviado).sort((a, b) => b[1].valor - a[1].valor);
    if (!ts.length) return "";
    return `<div class="cft-secao">Por transportadora</div><div class="rq-transp">${ts.map(([k, x]) => {
        const pct = bruto ? x.valor / bruto * 100 : 0;
        return `<div class="rq-transp-linha" style="--rq-cor:${cores.get(k) || "#64748b"}">
            <span class="rq-transp-nome">${_rqEsc(x.nome)}</span>
            <span class="rq-transp-pac">${x.pacotes.toLocaleString("pt-BR")} pacotes</span>
            <span class="rq-transp-barra"><em><i style="width:${pct.toFixed(1)}%"></i></em></span>
            <span class="rq-transp-pct">${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
            <span class="rq-transp-valor">${_rqNum(x.valor)}</span>
        </div>`; }).join("")}</div>`;
}

// Responsável da planilha de extravios que não virou nome padrão: aparece como linha
// "sem conversão" — aqui a soma, pra pessoa corrigir o nome na planilha ou na Conversão.
function _rqExtraviosSemConversao(d) {
    const sem = (d.extravios_linhas || []).filter(e => e.sem_conversao);
    if (!sem.length) return "";
    const nomes = [...new Set(sem.map(e => e.responsavel || "(sem responsável)"))];
    return `<li><b>${sem.length} extravio(s) com responsável sem conversão</b>
        (R$ ${_rqNum(sem.reduce((s, e) => s + e.valor, 0))}): ${_rqEsc(nomes.join(", "))}.</li>`;
}

// Quem tem desconto/ajuste mas nenhum pacote na quinzena não entra na lista nem nos totais.
function _rqSemFechamento(s) {
    if (!s || !s.pessoas) return "";
    const partes = [["Ticketlog", s.ticketlog], ["extravios", s.extravios], ["descontos", s.descontos], ["acréscimos", s.acrescimos]]
        .filter(x => x[1]).map(x => `${x[0]} R$ ${_rqNum(x[1])}`);
    return `<span title="${_rqEsc((s.nomes || []).join(" · "))}">${s.pessoas} pessoa(s) com desconto/ajuste e sem fechamento nesta quinzena
        não aparecem aqui (${partes.join(", ")}) — veja em Fechamento de Extravios.</span>`;
}

// Publica (ou tira) a quinzena pros entregadores: Meus Fechamentos passa a mostrar o fechamento do sistema.
function _rqPublicar(publicar) {
    const fazer = () => fetch(`${_RQ_API()}/publicacao`, { method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ mes: _rqMes, ano: _rqAno, quinzena: _rqQuinzena, publicar }) })
        .then(r => r.json()).then(d => { if (d.error) gcAlert(d.error); else _rqCarregar(); })
        .catch(() => gcAlert("Erro ao publicar."));
    gcConfirm(publicar
        ? "Os entregadores vão ver este fechamento no Meus Fechamentos (no lugar da planilha). Publicar?"
        : "Os entregadores voltam a ver a planilha desta quinzena. Despublicar?", fazer, publicar ? "Publicar fechamento" : "Despublicar", publicar ? "Publicar" : "Despublicar");
}

function _rqFiltradas() {
    const busca = _rqChave((document.getElementById("rq-busca") || {}).value);
    const polo = (document.getElementById("rq-polo") || {}).value || "";
    const lista = _rqDados.linhas.filter(l => (!busca || _rqChave(l.entregador).includes(busca)) && (!polo || l.polo === polo));
    const { campo, desc } = _rqOrdem;
    const val = (l) => campo.startsWith("t:") ? ((l.por_transp[campo.slice(2)] || {}).valor || 0) : l[campo];
    return lista.slice().sort((a, b) => {
        if (a.sem_conversao !== b.sem_conversao) return a.sem_conversao ? 1 : -1; // sem conversão sempre no fim
        const x = val(a), y = val(b);
        const c = typeof x === "number" || typeof y === "number" ? (x || 0) - (y || 0) : String(x || "").localeCompare(String(y || ""), "pt-BR");
        return desc ? -c : c;
    });
}

function _rqOrdenar(campo) {
    _rqOrdem = { campo, desc: _rqOrdem.campo === campo ? !_rqOrdem.desc : campo !== "entregador" && campo !== "polo" };
    _rqRenderTabela();
}

function _rqRenderTabela() {
    const cols = _rqColunas();
    const seta = (c) => _rqOrdem.campo === c ? (_rqOrdem.desc ? " ↓" : " ↑") : "";
    const th = (c, rot, num) => `<th${num ? ` style="text-align:right"` : ""}><a href="#" class="cft-ordem" onclick="event.preventDefault();_rqOrdenar('${c}')">${rot}${seta(c)}</a></th>`;
    document.getElementById("rq-thead").innerHTML = `<tr>${th("entregador", "Entregador")}${th("polo", "Polo")}
        ${cols.map(c => th("t:" + c.chave, _rqEsc(c.nome), true)).join("")}
        ${th("pacotes", "Pacotes", true)}${th("bruto", "Bruto", true)}${th("acrescimos", "Acrésc.", true)}${th("deslocamento", "Desloc.", true)}${th("ticketlog", "Ticketlog", true)}
        ${th("extravios", "Extravios", true)}${th("descontos", "Descontos", true)}${th("liquido", "Líquido", true)}</tr>`;
    const lista = _rqFiltradas();
    document.getElementById("rq-tbody").innerHTML = lista.length ? lista.map(l => `<tr>
            <td>${_rqEsc(l.entregador)}${l.sem_conversao ? ` <span class="cft-aviso" title="Usuário sem conversão de nome">sem conversão</span>` : ""}</td>
            <td>${l.polo ? _rqEsc(l.polo) : `<span class="cft-vazio">—</span>`}</td>
            ${cols.map(c => { const v = l.por_transp[c.chave];
                return v ? `<td class="num" title="${v.pacotes} pacote(s)">${_rqNum(v.valor)}</td>` : `<td class="num cft-vazio">—</td>`; }).join("")}
            <td class="num">${l.pacotes.toLocaleString("pt-BR")}</td>
            <td class="num">${_rqNum(l.bruto)}</td>
            <td class="num${l.acrescimos ? " cft-pos" : ""}">${l.acrescimos ? _rqNum(l.acrescimos) : `<span class="cft-vazio">—</span>`}</td>
            <td class="num${l.deslocamento ? " cft-pos" : ""}"${l.deslocamento ? ` title="${l.deslocamento_dias} dia(s) com entrega"` : ""}>${l.deslocamento ? _rqNum(l.deslocamento) : `<span class="cft-vazio">—</span>`}</td>
            <td class="num${l.ticketlog ? " cft-neg" : ""}"${l.ticketlog_divergencias ? ` title="${l.ticketlog_divergencias} abastecimento(s) com divergência de cartão/matrícula"` : ""}>${l.ticketlog ? _rqNum(l.ticketlog) : `<span class="cft-vazio">—</span>`}</td>
            <td class="num${l.extravios ? " cft-neg" : ""}"${l.qtd_extravios ? ` title="${l.qtd_extravios} extravio(s)/multa(s)"` : ""}>${l.extravios ? _rqNum(l.extravios) : `<span class="cft-vazio">—</span>`}</td>
            <td class="num${l.descontos ? " cft-neg" : ""}">${l.descontos ? _rqNum(l.descontos) : `<span class="cft-vazio">—</span>`}</td>
            <td class="num ${l.liquido < 0 ? "cft-neg" : "cft-pos"}"><strong>${_rqNum(l.liquido)}</strong></td>
        </tr>`).join("")
        : `<tr><td colspan="${cols.length + 10}" class="cft-vazio" style="padding:14px">${_rqDados.linhas.length ? "Nada com esse filtro." : "Nenhum relatório nesta quinzena ainda."}</td></tr>`;
    const soma = (f) => lista.reduce((s, l) => s + f(l), 0);
    document.getElementById("rq-tfoot").innerHTML = lista.length ? `<tr>
            <td><strong>Total</strong> <span class="cft-ajuda">${lista.length} linha(s)</span></td><td></td>
            ${cols.map(c => `<td class="num"><strong>${_rqNum(soma(l => (l.por_transp[c.chave] || {}).valor || 0))}</strong></td>`).join("")}
            <td class="num"><strong>${soma(l => l.pacotes).toLocaleString("pt-BR")}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.bruto))}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.acrescimos))}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.deslocamento || 0))}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.ticketlog))}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.extravios))}</strong></td>
            <td class="num"><strong>${_rqNum(soma(l => l.descontos))}</strong></td>
            <td class="num cft-pos"><strong>${_rqNum(soma(l => l.liquido))}</strong></td>
        </tr>` : "";
    if (_rqAba === "performance") _rqRenderPerf(); // busca e polo valem pras duas abas
}

function _rqSelect(id, todos, lista) {
    return `<select class="fech-select" id="${id}" style="max-width:280px"><option value="">${todos}</option>${(lista || []).map(v => `<option value="${_rqEsc(v)}">${_rqEsc(v)}</option>`).join("")}</select>`;
}

function _rqAlternarBaixar() {
    const el = document.getElementById("rq-baixar");
    el.style.display = el.style.display === "none" ? "" : "none";
}

/**
 * Aba "Resumo" (por entregador) a partir dos pacotes já filtrados. Ajustes (acréscimos,
 * Ticketlog, extravios, descontos) e o líquido só entram quando não tem filtro de cidade
 * nem de transportadora — são do entregador inteiro, não de uma parte dos pacotes dele.
 */
function _rqAbaResumo(pacotes, filtros) {
    const comTl = !(filtros.cidades || []).length && !filtros.parcialTransp;
    const aj = new Map((_rqDados.linhas || []).filter(l => !l.sem_conversao).map(l => [l.entregador, l]));
    const transp = [...new Set(pacotes.map(p => p.transportadora))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const por = new Map();
    for (const p of pacotes) {
        const k = p.driver || `${p.usuario || "(sem usuário)"} (sem conversão)`;
        if (!por.has(k)) por.set(k, { nome: k, driver: p.driver, polos: new Map(), t: {}, pacotes: 0, bruto: 0 });
        const r = por.get(k);
        r.t[p.transportadora] = (r.t[p.transportadora] || 0) + (p.valor_motorista || 0);
        r.pacotes++;
        r.bruto += p.valor_motorista || 0;
        if (p.polo) r.polos.set(p.polo, (r.polos.get(p.polo) || 0) + 1);
    }
    const r2 = (n) => Math.round(n * 100) / 100;
    const cab = ["Entregador", "Polo", ...transp.map(t => t + " (R$)"), "Pacotes", "Bruto"]
        .concat(comTl ? ["Acréscimos", "Deslocamento", "Ticketlog", "Extravios", "Descontos", "Líquido"] : []);
    const linhas = [...por.values()].sort((a, b) => (!a.driver - !b.driver) || a.nome.localeCompare(b.nome, "pt-BR")).map(r => {
        const polo = [...r.polos.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0])[0] || "";
        const a = (r.driver && aj.get(r.driver)) || {};
        const [ac, ds, tlv, ex, de] = [a.acrescimos || 0, a.deslocamento || 0, a.ticketlog || 0, a.extravios || 0, a.descontos || 0];
        return [r.nome, polo, ...transp.map(t => r2(r.t[t] || 0)), r.pacotes, r2(r.bruto)]
            .concat(comTl ? [ac, ds, tlv, ex, de, r2(r.bruto + ac + ds - tlv - ex - de)] : []);
    });
    return [cab, ...linhas];
}

/**
 * Abas do relatório detalhado: uma por transportadora com as MESMAS colunas do export do
 * Criar Fechamento (_CF_EXPORT_COLUNAS / _SHOPEE, de fechamento-criar.js), a Performance
 * consolidada da Shopee (só dos entregadores que estão no arquivo) e o Resumo no fim.
 * @return {Array<{nome: string, linhas: Array<Array>}>}
 */
/** Data da ocorrência: onhold = OnHold Time ("17/09/26 14:40"); atrasado = quando foi entregue. */
function _rqOcorrencia(x) {
    if (!x || !x.ocorrencia) return "";
    return _cfDia(x.ocorrencia) + (x.ocorrencia_hora ? " " + x.ocorrencia_hora : "");
}

function _rqMontarAbas(pacotes, filtros, perfLinhas, insucessos) {
    const ordem = Object.values(_rqDados.transportadoras).map(t => t.nome);
    const nomes = [...new Set(pacotes.map(p => p.transportadora))]
        .sort((a, b) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99));
    // Todas as transportadoras numa aba só (colunas completas; a Shopee não tem algumas).
    const colsTodas = _CF_EXPORT_COLUNAS.concat([["Dia da performance", "perf_dia"], ["Performance (%)", "perf_pct"]]);
    const porTransp = (nome) => pacotes.filter(p => p.transportadora === nome);
    const abas = [{ nome: "Todas as transportadoras", linhas: [colsTodas.map(c => c[0])]
        .concat(nomes.flatMap(n => porTransp(n)).map(p => colsTodas.map(c => p[c[1]] ?? ""))) }];
    // (as abas separadas por transportadora saíram a pedido do usuário: fica só a de todas juntas)
    const drivers = new Set(pacotes.map(p => p.driver).filter(Boolean));
    const perf = (perfLinhas || []).filter(l => drivers.has(l.driver));
    if (perf.length) {
        // Estilo tabela dinâmica: cada entregador × dia tem as linhas dos insucessos agrupadas
        // embaixo (escondidas; o "+" do Excel abre).
        const ins = (insucessos || []).filter(x => drivers.has(x.driver));
        const porDia = new Map();
        for (const x of ins) { const k = x.driver + "|" + x.dia; if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(x); }
        const linhas = [["Dia", "Entregador", "Shopee entregues", "Onholds", "Outras no prazo", "Outras atrasadas",
            "Performance (%)", "Valor por pacote", "Pacotes pagos", "Total"]];
        const rows = [{}];
        for (const l of perf) {
            linhas.push([_cfDia(l.dia), l.driver, l.shopee, l.onholds, l.outras_prazo, l.outras_atraso, l.pct, l.valor, l.pacotes_pagos, l.total]);
            rows.push({});
            for (const x of porDia.get(l.driver + "|" + l.dia) || []) {
                linhas.push(["", "   ↳ " + x.tipo, x.transportadora, x.codigo || "", x.deveria ? "Deveria: " + _cfDia(x.deveria) : "",
                    x.entregue ? "Entregue: " + _cfDia(x.entregue) : (x.tipo === "Não entregue" ? "Não entregue" : ""), x.motivo || x.cidade || ""]);
                rows.push({ level: 1, hidden: true });
            }
        }
        abas.push({ nome: "Performance", linhas, rows, outline: { above: true } });
        if (ins.length) {
            abas.push({ nome: "Insucessos", linhas: [["Dia da performance", "Entregador", "Tipo", "Data da ocorrência", "Transportadora", "Código",
                "Deveria ser entregue", "Entregue em", "Motivo do onhold", "Cidade"]].concat(ins.map(x => [_cfDia(x.dia), x.driver, x.tipo, _rqOcorrencia(x),
                x.transportadora, x.codigo || "", x.deveria ? _cfDia(x.deveria) : "", x.entregue ? _cfDia(x.entregue) : "", x.motivo || "", x.cidade || ""])) });
        }
    }
    // Extravios e acréscimos/descontos dos entregadores do arquivo (só sem filtro de cidade/transportadora).
    if (!(filtros.cidades || []).length && !filtros.parcialTransp) {
        const ext = (_rqDados.extravios_linhas || []).filter(e => drivers.has(e.driver));
        if (ext.length) abas.push({ nome: "Extravios", linhas: [["Entregador", "Responsável (planilha)", "Status", "Transportadora", "Data", "Código",
            "Valor", "Causa", "Data desconto"]].concat(ext.map(e => [e.driver, e.responsavel, e.status, e.transportadora, e.data, e.codigo,
            e.valor, e.causa, e.data_desconto])) });
        const ajs = (_rqDados.ajustes_linhas || []).filter(a => drivers.has(a.driver));
        if (ajs.length) abas.push({ nome: "Acréscimos e descontos", linhas: [["Entregador", "Tipo", "Valor", "Descrição"]]
            .concat(ajs.map(a => [a.driver, a.tipo === "acrescimo" ? "Acréscimo" : "Desconto", a.valor, a.descricao || ""])) });
    }
    abas.push({ nome: "Resumo", linhas: _rqAbaResumo(pacotes, filtros) });
    return abas;
}

// Performance consolidada das XPTs da Shopee que estão no arquivo (sem repetir entregador × dia).
function _rqBuscarPerformance(pacotes) {
    return _rqPerfLinhas(Object.entries(_rqDados.transportadoras)
        .filter(([, t]) => /^shopee/i.test(t.nome) && pacotes.some(p => p.transportadora === t.nome)).map(([k]) => k));
}
// Linhas entregador × dia da performance consolidada, das XPTs pedidas, sem repetir.
async function _rqPerfLinhas(chaves) {
    const vistos = new Set(), linhas = [];
    for (const k of chaves) {
        const r = await fetch(`${_RQ_API()}/performance?mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}&transportadora=${k}`,
            { headers: { "Authorization": "Bearer " + token } });
        const d = await r.json().catch(() => ({}));
        for (const l of d.linhas || []) {
            const id = l.driver + "|" + l.dia;
            if (!vistos.has(id)) { vistos.add(id); linhas.push(l); }
        }
    }
    return linhas.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : String(a.driver).localeCompare(String(b.driver), "pt-BR")));
}

async function _rqBaixar() {
    const v = (id) => document.getElementById(id).value;
    const caixas = [...document.querySelectorAll(".rq-x-transp")];
    const transps = caixas.filter(c => c.checked).map(c => c.value);
    if (caixas.length && !transps.length) { document.getElementById("rq-x-status").innerText = "Marque ao menos uma transportadora."; return; }
    const filtros = { transportadoras: transps.length === caixas.length ? [] : transps, parcialTransp: transps.length < caixas.length,
        polo: v("rq-x-polo"), driver: v("rq-x-driver"), cidades: _rqXCidades.flatMap(c => c.variantes), nCidades: _rqXCidades.length,
        nomeCidade: _rqXCidades.length === 1 ? _rqXCidades[0].nome : "" };
    const btn = document.getElementById("rq-x-btn");
    const st = document.getElementById("rq-x-status");
    btn.disabled = true;
    st.innerText = "Buscando os pacotes...";
    try {
        const qs = `mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}`
            + `&transportadoras=${encodeURIComponent(filtros.transportadoras.join(","))}&polo=${encodeURIComponent(filtros.polo)}`
            + `&driver=${encodeURIComponent(filtros.driver)}&cidades=${encodeURIComponent(filtros.cidades.join("|"))}`;
        const r = await fetch(`${_RQ_API()}/resumo-quinzena/pacotes?${qs}`, { headers: { "Authorization": "Bearer " + token } });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro ao baixar.");
        if (!d.pacotes.length) { st.innerText = "Nenhum pacote com esse filtro."; return; }
        const perf = await _rqBuscarPerformance(d.pacotes);
        let ins = [];
        if (perf.length) {
            st.innerText = "Buscando os onholds e atrasados...";
            const ri = await fetch(`${_RQ_API()}/performance/insucessos?mes=${_rqMes}&ano=${_rqAno}&quinzena=${_rqQuinzena}`, { headers: { "Authorization": "Bearer " + token } });
            ins = ((await ri.json().catch(() => ({}))).linhas) || [];
        }
        const wb = XLSX.utils.book_new();
        for (const a of _rqMontarAbas(d.pacotes, filtros, perf, ins)) {
            const ws = XLSX.utils.aoa_to_sheet(a.linhas);
            if (a.rows) ws["!rows"] = a.rows;
            if (a.outline) ws["!outline"] = a.outline;
            XLSX.utils.book_append_sheet(wb, ws, a.nome);
        }
        const nomeTransp = filtros.transportadoras.length === 1 ? (_rqDados.transportadoras[filtros.transportadoras[0]] || {}).nome
            : filtros.transportadoras.length ? filtros.transportadoras.length + " transportadoras" : "";
        const nomeCidade = filtros.nomeCidade || (filtros.nCidades ? filtros.nCidades + " cidades" : "");
        const sufixo = [nomeTransp, filtros.polo, filtros.driver, nomeCidade].filter(Boolean)
            .map(x => "_" + x.replace(/[^\w\u00C0-\u017F-]+/g, "-")).join("");
        XLSX.writeFile(wb, `fechamento_${_rqQuinzena}q_${String(_rqMes).padStart(2, "0")}-${_rqAno}${sufixo}.xlsx`);
        st.innerText = `${d.pacotes.length.toLocaleString("pt-BR")} pacotes baixados.`;
    } catch (err) {
        st.innerText = err.message;
    } finally {
        btn.disabled = false;
    }
}
