// ───── MACROS ─────
// Tarefas que o sistema roda sozinho, numa lista (ver _MAC_GRUPOS) com o detalhe do escolhido ao
// lado. Três tipos:
//   - os relatórios do SPX (AT Exportada, Pedidos Pesquisados, Backlog — modules/macros-comando),
//     que rodam no Chrome do galpão: "Rodar agora", em qual computador e o horário;
//   - o Colador (Recebimento, AT Cluster), também no Chrome, com polo e configuração da sessão;
//   - o aviso de rota incompleta (modules/avisos-entregador), que roda no servidor por rodadas.
// Admin só vê o Colador; o resto é de dev.
//
// Configurar é sempre pela tela — nunca mexendo direto no banco (mesmo espírito de
// Conversão de nomes e Telefones dos entregadores).

let _macLista = [];
let _macTipos = [];     // catálogo de critérios do macro aberto no modal (vem do servidor)
let _macRodadas = [];   // cópia de trabalho das rodadas de quem está aberto no modal
let _macChaveEditando = null;
let _macVigia = null;   // { online, visto_ha_s }: o Chrome do galpão consultou o servidor há pouco?
let _macAgenda = null;  // cópia de trabalho da agenda de um macro do SPX aberto no modal
let _macFonte = "rodadas"; // qual lista de horários o relógio (hora/minuto) edita: "rodadas" | "agenda"
let _macPoll = null;    // timer que acompanha um "Rodar" até ele sair do "aguardando"
let _macGeral = null;   // problema que o vigia contou sem saber de qual macro (erro inesperado, etc.)
let _macComputador = null; // o computador escolhido pra executar os macros (null = qualquer um)
let _macColadores = [];    // [{ qual, chave, nome, detalhe, configurado, config, resumo, comando, computadores }]
let _macColadorEditando = null; // copia de trabalho da config aberta no modal de configurar

// O resto de Macros (avisos de rota, macros do SPX) continua só dev; o Colador abre pra admin
// também (pedido do usuário, 29/09/2026) — _macRedesenhar() filtra o que cada um vê.
function abrirMacros(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev" && role !== "admin") {
        gcAlert("Só dev e admin acessam os Macros.");
        return;
    }
    mostrarTela("tela-macros");
    _macCarregarLista();
}

function _macEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// "avisos_entregador" -> "avisos-entregador", o caminho que o servidor usa. Funciona pra
// qualquer chave futura que siga a mesma convenção, sem precisar de uma tabela de rotas.
const _macRotaDaChave = chave => String(chave || "").replace(/_/g, "-");

// `silencioso`: recarrega por baixo, sem apagar a lista nem mostrar o esqueleto (depois de
// salvar ou de ligar/desligar — a tela não pode piscar por causa disso).
function _macCarregarLista(silencioso) {
    const empty = document.getElementById("mac-empty");
    const lista = document.getElementById("mac-lista");
    if (!silencioso) {
        skMostrar(empty, "cards");
        empty.style.display = "";
        lista.innerHTML = "";
    }

    const cab = { headers: { "Authorization": "Bearer " + token } };
    Promise.all([
        // Avisos + macros do SPX são só dev: pra admin (que só enxerga o Colador) isso vem 403
        // de propósito — trata como "nada aqui" em vez de erro, senão o Colador nem apareceria.
        fetch(`${API}/admin/macros`, cab).then(r => r.json()).catch(() => null),
        // Servidor sem os macros do SPX (ou fora do ar só nessa rota): as linhas deles ficam
        // "Indisponível no momento" e o resto da tela continua funcionando.
        fetch(`${API}/admin/macros/spx`, cab).then(r => r.json()).catch(() => null),
        // Idem pro Colador — rota própria (ver rotasColador.js), aberta pra admin também.
        fetch(`${API}/admin/macros/colador`, cab).then(r => r.json()).catch(() => null),
        // O que roda agora em cada aba (só memória no servidor). Sem isso a tela segue, só sem o "rodando".
        fetch(`${API}/admin/macros/atividade`, cab).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ])
        .then(([d, spx, colador, atividade]) => {
            if (atividade) _macAtividade = atividade;
            const doSpx = spx && Array.isArray(spx.macros) ? spx.macros : [];
            _macLista = ((d && d.macros) || []).concat(doSpx);
            _macVigia = spx && spx.vigia ? spx.vigia : null;
            _macGeral = spx && spx.geral ? spx.geral : null;
            _macComputador = spx && spx.computador ? spx.computador : null;
            _macColadores = colador && Array.isArray(colador.coladores) ? colador.coladores : [];
            empty.style.display = "none";
            _macRedesenhar();
            _macAcompanhar();
            _macVigiarAtividade();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// ── O layout: lista de macros à esquerda, tudo do escolhido à direita ──
// A lista diz o essencial de cada um (rodando, falhou, ligado, desligado). Clicar abre, ao lado,
// TUDO daquele macro num lugar só: onde executa, em qual polo, situação, rodar, horário ou
// configuração, o que está rodando agora e o histórico recente — sem modal.
//
// Dois pedaços do detalhe, redesenhados em momentos diferentes:
//   #macd-vivo   - situação, Rodar, "Executar em", rodando agora: muda sozinho (acompanhamento
//                  de um Rodar, atividade das abas) e é redesenhado a cada mudança;
//   #macd-config - o formulário (horário, rodadas, configuração do Colador): só é montado ao
//                  escolher o macro e depois de salvar — redesenhar no meio apagaria o que a
//                  pessoa está digitando.

let _macSelecionado = null;   // id do item aberto: "spx:alimentacao", "col:recebimento", "av:avisos_entregador"...
let _macAtividade = null;     // /admin/macros/atividade (o que roda agora em cada aba)
let _macPollVivo = null;
let _macHistMacro = { macro: null, eventos: null };
const _MAC_CHAVE_SELECIONADO = "gc-macros-selecionado";

const _MAC_XPTS = [
    { xpt: "XPT_CFC", polo: "Caçador" },
    { xpt: "XPT_VIA", polo: "Videira" },
];
const _macPoloDoXpt = xpt => (_MAC_XPTS.find(p => p.xpt === xpt) || {}).polo || "";

// O catálogo da lista. A arrumação é daqui do front: o servidor só manda os macros que JÁ
// funcionam, e cada um cai no grupo dele. Item sem `chave` ainda vai ser integrado: aparece
// apagado, só pra ficar marcado onde ele vai morar.
const _MAC_GRUPOS = [
    {
        titulo: "Relatórios do SPX", so_dev: true,
        texto: "Rodam no Chrome do galpão, com a extensão e o XM Vigia.",
        itens: [
            { id: "spx:alimentacao", tipo: "spx", qual: "alimentacao", nome: "Alimentar AT exportada", detalhe: "Exporta e baixa a AT do dia" },
            { id: "spx:pedidos", tipo: "spx", qual: "pedidos", nome: "Pedidos pesquisados", detalhe: "Pesquisa em lote os pedidos novos da AT" },
            { id: "spx:backlog", tipo: "spx", qual: "backlog", nome: "Backlog", detalhe: "Baixa o backlog do hub" },
        ],
    },
    {
        titulo: "Colador",
        texto: "Digita no SPX os códigos bipados no sistema. Pode rodar em mais de um computador.",
        itens: [
            { id: "col:recebimento", tipo: "colador", qual: "recebimento", nome: "Colador — Recebimento", detalhe: "Recebe os pacotes no SPX" },
            { id: "col:at_cluster", tipo: "colador", qual: "at_cluster", nome: "Colador — AT Cluster", detalhe: "Atribui no SPX o que já foi recebido" },
        ],
    },
    {
        titulo: "Avisos de rota incompleta", so_dev: true,
        texto: "Mensagem no WhatsApp pro entregador quando a rota ainda não fechou.",
        itens: [
            { id: "av:avisos_entregador", tipo: "aviso", chave: "avisos_entregador", nome: "Shopee XPT_CFC", detalhe: "Caçador · WhatsApp oficial (WABA)", xpt: "XPT_CFC" },
            { id: "av:pendente_via", tipo: "pendente", nome: "Shopee XPT_VIA", detalhe: "Videira", xpt: "XPT_VIA" },
        ],
    },
];

// Explicação de cada macro do SPX, no topo do detalhe.
const _MAC_DICAS_SPX = {
    alimentacao: "Depois de cada AT, o Pedidos Pesquisados roda sozinho.",
    pedidos: "Não tem horário próprio: roda sozinho 15s depois de cada AT Exportada, com os pedidos que ainda não foram pesquisados.",
    backlog: "Cada rodada grava o retrato inteiro do backlog — quanto mais seguido, mais o banco cresce.",
};

const _macEhDev = () => !!(window._gcUser && window._gcUser.role === "dev");

// A lista de itens que esta pessoa vê, cada um com o dado do servidor (`m`) quando houver.
function _macItens() {
    const dev = _macEhDev();
    const grupos = [];
    for (const g of _MAC_GRUPOS) {
        if (g.so_dev && !dev) continue;
        const itens = g.itens.map(i => Object.assign({}, i, { m: _macDadoDo(i) }))
            // O Colador só aparece se o servidor o mandou; os outros ficam marcados mesmo sem dado.
            .filter(i => i.tipo !== "colador" || i.m);
        if (itens.length) grupos.push(Object.assign({}, g, { itens }));
    }
    // Macro que o servidor mande e que ainda não tenha lugar na lista não some: cai em "Outros".
    if (dev) {
        const conhecidas = new Set(["avisos_entregador", "spx_alimentacao", "spx_pedidos", "spx_backlog"]);
        const sobra = _macLista.filter(m => !m.qual && !conhecidas.has(m.chave));
        if (sobra.length) grupos.push({ titulo: "Outros", itens: sobra.map(m => ({
            id: `av:${m.chave}`, tipo: "aviso", chave: m.chave, nome: m.nome, detalhe: m.descricao, m })) });
    }
    return grupos;
}

function _macDadoDo(item) {
    if (item.tipo === "spx") return _macLista.find(m => m.qual === item.qual) || null;
    if (item.tipo === "colador") return _macColadores.find(c => c.qual === item.qual) || null;
    if (item.tipo === "aviso") return _macLista.find(m => m.chave === item.chave) || null;
    return null;
}

function _macItemPorId(id) {
    for (const g of _macItens()) {
        const i = g.itens.find(x => x.id === id);
        if (i) return i;
    }
    return null;
}

// ── o que está rodando agora (vem da extensão, pela atividade das abas) ──
const _macAbasDe = qual => ((_macAtividade && _macAtividade.abas) || []).filter(a => a.macro === qual);
const _macRodandoDe = qual => _macAbasDe(qual).filter(a => a.estado === "rodando");

// A próxima rodada agendada de um relatório: a do computador escolhido, ou a mais cedo.
function _macProximaDe(qual) {
    const lista = ((_macAtividade && _macAtividade.ativos) || []).filter(a => a.macro === qual && a.proxima_em);
    if (!lista.length) return null;
    return lista.find(a => _macComputador && _macMesmoPc(a.maquina, _macComputador))
        || lista.slice().sort((a, b) => a.proxima_em - b.proxima_em)[0];
}

// "15:31 (em 12 min)" / "15:31 (a qualquer momento)". A hora sai do relógio do servidor (já
// convertido), mostrada em Brasília.
function _macProximaTexto(p) {
    const hora = new Date(p.proxima_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const s = p.proxima_em_s;
    const falta = s === null || s === undefined ? "" : s <= 60 ? " (a qualquer momento)"
        : s < 3600 ? ` (em ${Math.round(s / 60)} min)` : ` (em ${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")})`;
    return hora + falta;
}

// O XPT em que um macro do SPX roda: o da estação logada na aba do computador escolhido — a
// extensão lê embaixo da logo do SPX. A aba mais recente desse macro, ou qualquer aba daquele
// computador, diz qual é.
function _macXptDoSpx(qual) {
    const abas = (_macAtividade && _macAtividade.abas) || [];
    const doMacro = abas.filter(a => a.macro === qual && a.xpt);
    const doPc = abas.filter(a => a.xpt && (!_macComputador || _macMesmoPc(a.maquina, _macComputador)));
    const a = doMacro.find(x => !_macComputador || _macMesmoPc(x.maquina, _macComputador)) || doMacro[0] || doPc[0];
    return a ? { xpt: a.xpt, maquina: a.maquina } : null;
}

// ── a lista ──
// O resumo de cada linha: o ponto (cor = estado) e uma frase curta.
function _macResumoLinha(item) {
    const m = item.m;
    if (item.tipo === "pendente") return { tom: "mudo", texto: "Ainda não integrado" };
    if (!m) return { tom: "mudo", texto: "Indisponível no momento" };

    if (item.tipo === "spx") {
        const rodando = _macRodandoDe(item.qual);
        if (rodando.length) return { tom: "andando", texto: `Rodando agora em ${rodando.map(a => a.maquina).join(", ")}` };
        if (_macOcupado(m.comando)) return { tom: "andando", texto: "Pedido enviado — aguardando o computador" };
        if (m.problema && m.problema.nivel === "erro") return { tom: "erro", texto: `Falhou ${_macHa(m.problema.segundos_atras)}` };
        if (m.agendavel && m.configurado && !m.ativo) return { tom: "mudo", texto: "Horário desligado" };
        const prox = _macProximaDe(item.qual);
        if (prox) return { tom: "ok", texto: `Próxima às ${_macProximaTexto(prox)}` };
        return { tom: m.agendavel && !m.configurado ? "mudo" : "ok", texto: m.resumo || "" };
    }
    if (item.tipo === "colador") {
        const rodando = _macRodandoDe(item.qual);
        if (rodando.length) {
            const xpts = [...new Set(rodando.map(a => a.xpt).filter(Boolean))].join(" e ");
            return { tom: "andando", texto: `Rodando em ${rodando.length} computador${rodando.length > 1 ? "es" : ""}${xpts ? ` · ${xpts}` : ""}` };
        }
        if ((m.comandos || []).some(c => c.estado === "aguardando" || c.estado === "entregue")) {
            return { tom: "andando", texto: "Pedido enviado — aguardando o computador" };
        }
        return { tom: m.configurado ? "ok" : "mudo", texto: m.resumo || "" };
    }
    // aviso
    return m.ativo ? { tom: "ok", texto: "Ativo" }
        : { tom: "mudo", texto: "Desligado" };
}

function _macHtmlLista(grupos) {
    return grupos.map(g => `
        <div class="macl-grupo">
            <div class="macl-grupo-titulo">${_macEsc(g.titulo)}</div>
            ${g.itens.map(i => {
                const r = _macResumoLinha(i);
                const sel = i.id === _macSelecionado;
                return `<button type="button" class="macl-item${sel ? " sel" : ""}${i.tipo === "pendente" ? " pendente" : ""}"
                            ${sel ? 'aria-current="true"' : ""} onclick="_macSelecionar('${_macEsc(i.id)}')">
                    <span class="macl-nome">${_macEsc(i.nome)}</span>
                    <span class="macl-resumo"><span class="mac-cmd-ponto macl-ponto-${r.tom}"></span>${_macEsc(r.texto)}</span>
                </button>`;
            }).join("")}
        </div>`).join("");
}

// ── a tela inteira ──
// Primeira vez (ou o escolhido sumiu): abre o lembrado, ou o primeiro da lista.
function _macGarantirSelecao(grupos) {
    const todos = grupos.flatMap(g => g.itens);
    if (_macSelecionado && todos.some(i => i.id === _macSelecionado)) return false;
    let lembrado = null;
    try { lembrado = localStorage.getItem(_MAC_CHAVE_SELECIONADO); } catch (e) { /* sem storage */ }
    const achado = todos.find(i => i.id === lembrado) || todos.find(i => i.tipo !== "pendente") || todos[0];
    _macSelecionado = achado ? achado.id : null;
    return true;
}

function _macRedesenhar() {
    const lista = document.getElementById("mac-lista");
    if (!lista) return;
    const grupos = _macItens();
    const mudouSelecao = _macGarantirSelecao(grupos);
    const nav = document.getElementById("macl-nav");
    // Primeira montagem: o esqueleto das duas colunas. Depois só se trocam os pedaços.
    if (!nav || mudouSelecao) {
        lista.innerHTML = `<div class="macl">
            <nav class="macl-lista" id="macl-nav" aria-label="Macros"></nav>
            <section class="macl-detalhe" id="macl-detalhe"></section>
        </div>`;
        document.getElementById("macl-nav").innerHTML = _macHtmlLista(grupos);
        _macMontarDetalhe();
        return;
    }
    nav.innerHTML = _macHtmlLista(grupos);
    _macRedesenharVivo();
}

function _macSelecionar(id) {
    if (id === _macSelecionado) return;
    _macSelecionado = id;
    try { localStorage.setItem(_MAC_CHAVE_SELECIONADO, id); } catch (e) { /* sem storage */ }
    _macFecharHorario();
    const nav = document.getElementById("macl-nav");
    if (nav) nav.innerHTML = _macHtmlLista(_macItens());
    _macMontarDetalhe();
    // No celular a lista fica em cima: leva o olho pro que abriu.
    const det = document.getElementById("macl-detalhe");
    if (det && det.scrollIntoView && window.innerWidth < 900) det.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── o detalhe ──
function _macMontarDetalhe() {
    const det = document.getElementById("macl-detalhe");
    if (!det) return;
    const item = _macItemPorId(_macSelecionado);
    if (!item) { det.innerHTML = `<div class="mac-ag-vazio">Escolha um macro na lista.</div>`; return; }

    // O esqueleto vazio primeiro; cada pedaço é preenchido pelo mesmo caminho que o atualiza depois.
    det.innerHTML = `
        ${_macCabecalhoHtml(item)}
        <div id="macd-vivo"></div>
        <div id="macd-config"></div>
        ${_macTemHistorico(item) ? `<div class="macd-bloco">
            <div class="macd-bloco-cab"><div class="macd-rotulo">Histórico recente</div>
                <button type="button" class="mac-link" onclick="_macAbrirHistorico('${_macEsc(item.qual)}')">Ver tudo</button></div>
            <div id="macd-hist" class="mac-hist-lista macd-hist"><div class="mac-ag-vazio">Carregando...</div></div>
        </div>` : ""}`;
    document.getElementById("macd-vivo").innerHTML = _macVivoHtml(item);
    document.getElementById("macd-config").innerHTML = _macConfigHtml(item);
    _macPrepararConfig(item);
    if (_macTemHistorico(item)) _macCarregarHistoricoDoMacro(item.qual);
}

const _macTemHistorico = item => (item.tipo === "spx" || item.tipo === "colador") && !!item.m;

function _macRedesenharVivo() {
    const el = document.getElementById("macd-vivo");
    const item = _macItemPorId(_macSelecionado);
    if (el && item) el.innerHTML = _macVivoHtml(item);
    const cab = document.getElementById("macd-cab-controle");
    if (cab && item) cab.innerHTML = _macControleCabHtml(item);
}

// Nome, explicação e (quando existe) o interruptor de ligar/desligar.
function _macCabecalhoHtml(item) {
    const dica = item.tipo === "spx" ? (_MAC_DICAS_SPX[item.qual] || item.detalhe) : item.detalhe;
    return `<header class="macd-cab">
        <div class="macd-cab-texto">
            <h3 class="macd-titulo">${_macEsc(item.nome)}</h3>
            ${dica ? `<p class="macd-sub">${_macEsc(dica)}</p>` : ""}
        </div>
        <div id="macd-cab-controle">${_macControleCabHtml(item)}</div>
    </header>`;
}

// O interruptor só existe onde há o que ligar: aviso, e horário do SPX já configurado por aqui
// (antes disso o macro segue a agenda do popup da extensão).
function _macControleCabHtml(item) {
    const m = item.m;
    if (!m) return "";
    const pode = item.tipo === "aviso" || (item.tipo === "spx" && m.agendavel && m.configurado);
    if (!pode) return "";
    return `<label class="macd-liga">
        <span>${m.ativo ? (item.tipo === "spx" ? "Horário ligado" : "Ligado") : (item.tipo === "spx" ? "Horário desligado" : "Desligado")}</span>
        <button type="button" class="gc-toggle mac-toggle${m.ativo ? " gc-toggle--on" : ""}" role="switch" aria-checked="${m.ativo ? "true" : "false"}"
                title="${m.ativo ? "Desligar" : "Ligar"}" onclick="_macAlternarAtivo('${_macEsc(m.chave)}', this)"><span class="gc-toggle__knob"></span></button>
    </label>`;
}

function _macCampoHtml(rotulo, valor, nota) {
    return `<div class="macd-campo"><div class="macd-rotulo">${rotulo}</div><div class="macd-valor">${valor}</div>${nota ? `<div class="macd-nota">${nota}</div>` : ""}</div>`;
}

function _macRodandoAgoraHtml(qual) {
    const abas = _macAbasDe(qual).filter(a => a.estado === "rodando" || a.estado === "sem_sinal");
    if (!abas.length || typeof _mexCartaoHtml !== "function") return "";
    return `<div class="macd-bloco"><div class="macd-rotulo">Rodando agora</div>
        <div class="macd-cartoes">${abas.map(_mexCartaoHtml).join("")}</div></div>`;
}

// O pedaço que muda sozinho: onde executa, polo, situação, Rodar, rodando agora.
function _macVivoHtml(item) {
    const m = item.m;
    if (item.tipo === "pendente") {
        return `<div class="macd-bloco"><div class="mac-ag-vazio">Ainda não integrado. Quando estiver pronto, ele se configura por aqui.</div></div>`;
    }
    if (!m) return `<div class="macd-bloco"><div class="mac-ag-vazio">Indisponível no momento — o servidor não respondeu sobre este macro.</div></div>`;
    if (item.tipo === "spx") return _macVivoSpxHtml(item, m);
    if (item.tipo === "colador") return _macVivoColadorHtml(item, m);
    return _macVivoAvisoHtml(item, m);
}

function _macVivoSpxHtml(item, m) {
    const pc = _macComputador;
    const onlinePc = pc ? _macPcOnline(pc) : null;
    const xpt = _macXptDoSpx(item.qual);
    const poloTexto = xpt
        ? `<b>${_macEsc(xpt.xpt)}</b> · ${_macEsc(_macPoloDoXpt(xpt.xpt))}`
        : `<span class="mac-agenda-mudo">ainda não visto</span>`;
    const poloNota = xpt
        ? `A estação logada no SPX de ${_macEsc(xpt.maquina)}. Pra trocar de polo, troque a estação embaixo da logo do SPX.`
        : "Aparece quando a extensão (3.36 ou mais nova) contar. É a estação logada embaixo da logo do SPX.";
    const carga = m.ultima_carga ? _macEsc(_macCargaTexto(m.ultima_carga)) : `<span class="mac-agenda-mudo">nenhuma ainda</span>`;
    const situacao = _macSituacaoHtml(m);

    return `
        <div class="macd-grade">
            ${_macCampoHtml("Executar em", _macVigiaHtml() || `<span class="mac-agenda-mudo">nenhum computador conectado</span>`,
                `Vale pros três relatórios: dividem a mesma conta do SPX.${pc && onlinePc === false ? " <b>Desconectado agora.</b>" : ""}`)}
            ${_macCampoHtml("Polo (XPT)", poloTexto, poloNota)}
            ${_macCampoHtml("Última carga", carga, "Quando o arquivo chegou no sistema — a prova de que rodou de verdade.")}
            ${_macCampoHtml("Próxima rodada", _macProximaDe(item.qual)
                ? _macEsc(_macProximaTexto(_macProximaDe(item.qual)))
                : `<span class="mac-agenda-mudo">${m.agendavel && m.configurado && !m.ativo ? "horário desligado" : "nenhuma agendada"}</span>`,
                item.qual === "pedidos" ? "Vai logo depois de cada AT Exportada." : `${_macEsc(m.resumo || "")}${_macProximaDe(item.qual) ? ` · em ${_macEsc(_macProximaDe(item.qual).maquina)}` : ""}`)}
        </div>
        ${_macAvisoComputadorHtml()}
        <div class="macd-acoes">
            <button type="button" class="mac-rodar" title="${_macEsc(pc ? `Rodar agora em ${pc}` : "Rodar agora")}"
                    ${_macOcupado(m.comando) ? "disabled" : ""} onclick="_macRodar('${_macEsc(m.qual)}', this)">▶ Rodar agora</button>
            ${situacao ? `<div class="macd-situacao">${situacao}</div>` : ""}
        </div>
        ${_macGeral ? _macGeralHtml() : ""}
        ${_macRodandoAgoraHtml(item.qual)}`;
}

function _macVivoColadorHtml(item, m) {
    const ocupado = _macColadorConflita(m, _macColadorAlvo[m.qual]);
    const rodando = _macRodandoDe(m.qual);
    const xptsRodando = [...new Set(rodando.map(a => a.xpt).filter(Boolean))];
    const nota = xptsRodando.length
        ? `Rodando agora em ${xptsRodando.map(x => `${x} · ${_macPoloDoXpt(x)}`).join(" e ")}.`
        : "Cada computador cola só o XPT da estação logada no SPX dele — e não roda se não bater com o escolhido abaixo.";
    return `
        <div class="macd-grade">
            ${_macCampoHtml("Executar em", _macHtmlAlvoColador(m),
                `Só pro próximo Rodar. ${_macColadorPresencaHtml(m.computadores)}`)}
            ${_macCampoHtml("Polo (XPT)", m.config && m.config.xpt
                ? `<b>${_macEsc(m.config.xpt)}</b> · ${_macEsc(_macPoloDoXpt(m.config.xpt))}` : `<span class="mac-agenda-mudo">não escolhido</span>`, nota)}
            ${m.recebidos_hoje !== undefined && m.recebidos_hoje !== null
                ? _macCampoHtml("Hoje", `${_macEsc(m.recebidos_hoje)} recebido(s) no SPX`, "Contados no banco: o que o Colador já colou.") : ""}
        </div>
        <div class="macd-acoes">
            <button type="button" class="mac-rodar" title="Rodar agora" ${ocupado ? "disabled" : ""}
                    onclick="_macRodarColador('${_macEsc(m.qual)}', this)">▶ Rodar agora</button>
            ${(m.comandos || []).length ? `<div class="macd-situacao">${_macSituacaoColadorHtml(m.qual, m.comandos)}</div>` : ""}
        </div>
        ${_macRodandoAgoraHtml(m.qual)}`;
}

function _macVivoAvisoHtml(item, m) {
    return `<div class="macd-grade">
        ${_macCampoHtml("Executar em", "No servidor", "Não depende de computador nem do Chrome ligado.")}
        ${_macCampoHtml("Polo (XPT)", item.xpt ? `<b>${_macEsc(item.xpt)}</b> · ${_macEsc(_macPoloDoXpt(item.xpt))}` : "—",
            "Só entregadores deste polo recebem o aviso.")}
    </div>`;
}

// ── o formulário de cada tipo (mesmos ids dos antigos modais, agora no painel) ──
function _macConfigHtml(item) {
    const m = item.m;
    if (!m || item.tipo === "pendente") return "";
    if (item.tipo === "spx") {
        if (!m.agendavel) return "";
        return `<div class="macd-bloco">
            <div class="macd-rotulo">Horário</div>
            ${m.configurado ? "" : `<div class="macd-nota" style="margin-bottom:10px">Ainda segue o horário do popup da extensão. Salvar aqui passa a valer o daqui (já ligado).</div>`}
            <div class="mac-ag-bloco" id="mac-ag-bloco-intervalo">
                <div class="mac-ag-opcao">
                    <label class="mac-ag-radio"><input type="radio" name="mac-ag-modo" id="mac-ag-modo-intervalo" onchange="_macMudarModo('intervalo')"> A cada</label>
                    <input type="number" id="mac-ag-minutos" class="usr-modal-input mac-ag-minutos" min="1" max="1440" step="1" oninput="_macMudarMinutos(this.value)">
                    <span class="mac-ag-unidade">minutos</span>
                </div>
                <div class="mac-ag-dica" id="mac-ag-dica-minimo"></div>
            </div>
            <div class="mac-ag-bloco" id="mac-ag-bloco-horarios">
                <div class="mac-ag-opcao">
                    <label class="mac-ag-radio"><input type="radio" name="mac-ag-modo" id="mac-ag-modo-horarios" onchange="_macMudarModo('horarios')"> Todo dia, nestes horários</label>
                </div>
                <div id="mac-ag-horarios"></div>
                <button type="button" class="mac-adicionar" onclick="_macAdicionarHorario()">+ Adicionar horário</button>
            </div>
            <div class="macd-salvar"><div class="usr-modal-error" id="mac-ag-erro"></div>
                <button class="usr-modal-btn-primary" id="mac-ag-salvar" onclick="_macSalvarAgenda()">Salvar horário</button></div>
        </div>`;
    }
    if (item.tipo === "colador") {
        return `<div class="macd-bloco">
            <div class="macd-rotulo">Configuração</div>
            <div class="macd-nota" style="margin-bottom:12px">Vale a partir do próximo "Rodar" — não muda uma sessão já em andamento.</div>
            <div class="mac-col-linha">
                <div class="mac-col-campo">
                    <label for="mac-col-xpt">Polo (XPT)</label>
                    <select id="mac-col-xpt" class="usr-modal-input" onchange="_macColMudarCampo('xpt', this.value)">
                        <option value="">Escolha…</option>
                        ${_MAC_XPTS.map(p => `<option value="${p.xpt}">${p.xpt} · ${p.polo}</option>`).join("")}
                    </select>
                </div>
                <div class="mac-col-campo">
                    <label for="mac-col-dia">Dia</label>
                    <div class="mac-col-linha" style="align-items:center">
                        <input type="date" id="mac-col-dia" class="usr-modal-input" oninput="_macColMudarCampo('dia', this.value)">
                        <label class="mac-col-check"><input type="checkbox" id="mac-col-todos-dias" onchange="_macColMudarTodosDias(this.checked)"> todos os dias</label>
                    </div>
                </div>
            </div>
            <div class="mac-col-linha">
                <div class="mac-col-campo">
                    <label for="mac-col-carencia">Carência (segundos)</label>
                    <input type="number" id="mac-col-carencia" class="usr-modal-input" min="0" max="3600" oninput="_macColMudarCampo('carencia', this.value)">
                </div>
                <div class="mac-col-campo">
                    <label for="mac-col-lote">Códigos por lote</label>
                    <input type="number" id="mac-col-lote" class="usr-modal-input" min="1" max="500" oninput="_macColMudarCampo('lote', this.value)">
                </div>
            </div>
            <div class="mac-col-campo">
                <label for="mac-col-intervalo">Intervalo entre códigos — <span id="mac-col-intervalo-rotulo">0.5s</span></label>
                <input type="range" id="mac-col-intervalo" min="0" max="1.5" step="0.1" oninput="_macColMudarIntervalo(this.value)">
            </div>
            <label class="mac-col-check" style="margin:14px 0 4px">
                <input type="checkbox" id="mac-col-continuo" onchange="_macColMudarCampo('continuo', this.checked)">
                Modo contínuo — fica de vigia, colando o que chegar
            </label>
            <div class="macd-salvar"><div class="usr-modal-error" id="mac-col-erro"></div>
                <button class="usr-modal-btn-primary" id="mac-col-salvar" onclick="_macSalvarColador()">Salvar configuração</button></div>
        </div>`;
    }
    return `<div class="macd-bloco">
        <div class="macd-rotulo">Rodadas</div>
        <div class="macd-nota" style="margin-bottom:12px">Em cada horário, o sistema avisa quem se encaixa no critério escolhido.</div>
        <div id="mac-rodadas-lista"><div class="mac-ag-vazio">Carregando...</div></div>
        <button type="button" class="mac-adicionar" onclick="_macAdicionarRodada()">+ Adicionar rodada</button>
        <div class="macd-salvar"><div class="usr-modal-error" id="mac-editar-erro"></div>
            <button class="usr-modal-btn-primary" id="mac-editar-salvar" onclick="_macSalvar()">Salvar rodadas</button></div>
    </div>`;
}

// Enche o formulário recém-montado com o que está salvo.
function _macPrepararConfig(item) {
    if (!item.m) return;
    if (item.tipo === "spx" && item.m.agendavel) _macAbrirConfigurarSpx(item.qual);
    else if (item.tipo === "colador") _macAbrirConfigurarColador(item.qual);
    else if (item.tipo === "aviso") _macAbrirConfigurar(item.chave);
}

// "Salvo" no lugar da mensagem de erro do formulário, em verde, por alguns segundos.
function _macMostrarSalvo(idErro) {
    const el = document.getElementById(idErro);
    if (!el) return;
    el.innerHTML = `<span class="macd-salvo">Salvo.</span>`;
    setTimeout(() => { if (el.innerHTML.includes("macd-salvo")) el.innerHTML = ""; }, 4000);
}

function _macCarregarHistoricoDoMacro(macro) {
    _macHistMacro = { macro, eventos: null };
    fetch(`${API}/admin/macros/spx/historico?limite=12&macro=${encodeURIComponent(macro)}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (_macHistMacro.macro !== macro) return;
            _macHistMacro.eventos = d.eventos || [];
            const el = document.getElementById("macd-hist");
            if (el) el.innerHTML = d.error ? `<div class="mac-ag-vazio">${_macEsc(d.error)}</div>` : _macHistoricoHtml(d.eventos);
        })
        .catch(() => {
            const el = document.getElementById("macd-hist");
            if (el) el.innerHTML = `<div class="mac-ag-vazio">Erro ao conectar com o servidor.</div>`;
        });
}

// A atividade das abas, de 5 em 5s enquanto a tela está aberta — só memória no servidor. Só
// redesenha a lista e o "vivo" quando algo mudou (o formulário nunca).
function _macCarregarAtividade() {
    return fetch(`${API}/admin/macros/atividade`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
            if (!d) return;
            const assinar = typeof _mexAssinatura === "function" ? _mexAssinatura : JSON.stringify;
            const mudou = assinar(d) !== assinar(_macAtividade);
            _macAtividade = d;
            if (mudou) _macRedesenhar();
        })
        .catch(() => {});
}

function _macVigiarAtividade() {
    if (_macPollVivo) return;
    const passo = () => {
        const tela = document.getElementById("tela-macros");
        if (!tela || !tela.classList.contains("active-view")) { _macPollVivo = null; return; }
        (document.hidden ? Promise.resolve() : _macCarregarAtividade())
            .finally(() => { _macPollVivo = setTimeout(passo, 5000); });
    };
    _macPollVivo = setTimeout(passo, 5000);
}

// "19:05 Abaixo de 90% concluído · 22:05 Mais de 1 pacotes em Delivering" (resumo do servidor)
// vira uma linha por rodada, com o horário separado do critério. Texto fora desse formato
// ("sem rodada configurada") passa inteiro, numa linha só.
function _macResumoHtml(resumo) {
    const partes = String(resumo || "").split(" · ").filter(Boolean);
    if (!partes.length) return "";
    return partes.map(p => {
        const m = /^(\d{2}:\d{2}) (.+)$/.exec(p);
        return m
            ? `<div class="mac-agenda-linha"><span class="mac-agenda-hora">${m[1]}</span><span>${_macEsc(m[2].charAt(0).toLowerCase() + m[2].slice(1))}</span></div>`
            : `<div class="mac-agenda-linha"><span>${_macEsc(p)}</span></div>`;
    }).join("");
}

// ── Macros do SPX: "Rodar agora", última carga e andamento ──

// "há 12 min" a partir de segundos. Os segundos vêm do servidor (calculados no Postgres, com o
// relógio de Brasília) — nunca de Date no navegador contra um horário sem fuso.
function _macHa(segundos) {
    const s = Math.max(0, Number(segundos) || 0);
    if (s < 60) return "há instantes";
    const min = Math.floor(s / 60);
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return h < 48 ? `há ${h} h` : `há ${Math.floor(h / 24)} dias`;
}

// "hoje 14:32 (há 12 min)" / "23/09 14:32 (há 1 dia)". `quando` é texto de Brasília sem fuso
// ("2026-09-24 14:32:00.123"): a hora sai do próprio texto, sem passar por Date.
function _macQuandoTexto(quando) {
    const q = String(quando || "");
    const dia = q.slice(0, 10);
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return `${dia === hoje ? "hoje" : `${dia.slice(8, 10)}/${dia.slice(5, 7)}`} ${q.slice(11, 16)}`;
}

function _macCargaTexto(c) {
    return `${_macQuandoTexto(c.quando)} (${_macHa(c.segundos_atras)})`;
}

// aguardando/entregue = ainda em andamento (o Chrome não confirmou que começou).
const _macOcupado = cmd => !!cmd && (cmd.estado === "aguardando" || cmd.estado === "entregue");

function _macHoraBrasilia(iso) {
    return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

// O que dizer de um pedido de "Rodar": texto e tom (andando | ok | aviso | erro). Cada estado
// diz o que a pessoa precisa saber e, quando falha, o que conferir.
function _macComandoTexto(cmd, vigia) {
    switch (cmd.estado) {
        case "aguardando": {
            // Com destino, o que importa é ELE estar conectado (outro computador ouvindo não serve).
            const alvo = cmd.alvo || "";
            const ninguem = alvo ? !_macPcOnlineEm(vigia, alvo) : (vigia && !vigia.online);
            if (ninguem) {
                return { tom: "aviso", texto: alvo
                    ? `Pedido enviado, mas ${alvo} não está conectado. Abra o Chrome e o XM Vigia nele, ou escolha outro computador.`
                    : "Pedido enviado, mas nenhum computador responde. Confira se o Chrome e o XM Vigia estão abertos." };
            }
            return { tom: "andando", texto: `Pedido enviado — aguardando ${alvo || "o computador dos macros"}…` };
        }
        case "entregue":
            return { tom: "andando", texto: "Recebido pela extensão — iniciando…" };
        case "iniciado":
            return { tom: "ok", texto: `Iniciado às ${_macHoraBrasilia(cmd.criado_em)} por ${cmd.criado_por}${cmd.alvo ? ` em ${cmd.alvo}` : ""}` };
        case "erro":
            return { tom: "erro", texto: `Não rodou: ${cmd.erro || "motivo não informado"}` };
        case "expirado":
            return { tom: "aviso", texto: cmd.alvo
                ? `Ninguém buscou o pedido — ${cmd.alvo} está com o Chrome e o XM Vigia abertos?`
                : "Ninguém buscou o pedido — o Chrome ou o XM Vigia estão fechados?" };
        case "sem_confirmacao":
            return { tom: "aviso", texto: "A extensão recebeu o pedido mas não confirmou — veja na tela do SPX." };
        default:
            return { tom: "aviso", texto: String(cmd.estado || "") };
    }
}

// Uma linha só de "situação" por macro. Antes eram até três linhas miúdas (agenda, última carga,
// andamento) empilhadas em colunas — era isso que deixava a tela carregada. Agora: o que está
// acontecendo AGORA (pedido em andamento, ou que acabou de falhar) ou, se nada, o último problema
// que o vigia/a extensão contaram. Sem nada disso, a linha nem existe.
function _macSituacaoHtml(m) {
    const cmd = m.comando;
    const relevante = cmd && (_macOcupado(cmd) || cmd.estado === "erro" || cmd.estado === "expirado"
        || cmd.estado === "sem_confirmacao" || (cmd.estado === "iniciado" && cmd.idade_s < 180));
    if (relevante) {
        const c = _macComandoTexto(cmd, _macVigia);
        return `<div class="mac-sit mac-sit-${c.tom}"><span class="mac-cmd-ponto"></span><span>${_macEsc(c.texto)}</span></div>`;
    }
    return m.problema ? _macProblemaHtml(m.problema, m.qual) : "";
}

// "Falhou há 12 min · CASA — o SPX pediu login" + o atalho pro histórico. Erro em vermelho,
// aviso só com o pontinho amarelo: nem todo aviso é defeito.
function _macProblemaHtml(p, qual) {
    const erro = p.nivel === "erro";
    const onde = p.maquina ? ` · ${_macEsc(p.maquina)}` : "";
    return `<div class="mac-sit mac-sit-${erro ? "erro" : "aviso"}"><span class="mac-cmd-ponto"></span>`
        + `<span><b>${erro ? "Falhou" : "Atenção"}</b> ${_macEsc(_macHa(p.segundos_atras))}${onde} — ${_macEsc(p.texto)} `
        + `<button type="button" class="mac-link" onclick="_macAbrirHistorico('${_macEsc(qual)}')">Detalhes</button></span></div>`;
}

// ── Em QUAL computador os macros executam ──
// Com duas ou três máquinas ligadas (vigia + extensão), sem isto o horário rodava em TODAS e o
// "Rodar" ia pra quem perguntasse primeiro. Uma escolha só, pros três macros: eles dividem a
// mesma conta do SPX, então dois computadores rodando macros diferentes também se atrapalham.
// As outras máquinas continuam conectadas, mas paradas (sem horário e sem Rodar).
const _macMesmoPc = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const _macPcOnlineEm = (vigia, nome) => !!vigia && (vigia.maquinas || []).some(m => m.online && _macMesmoPc(m.nome, nome));
const _macPcOnline = nome => _macPcOnlineEm(_macVigia, nome);

// Os computadores que se pode escolher: os que já consultaram o servidor, mais o escolhido se ele
// estiver desligado (a escolha continua valendo, e some da lista se não aparecer).
function _macComputadoresConhecidos() {
    const nomes = [];
    const soma = n => { if (n && !nomes.some(x => _macMesmoPc(x, n))) nomes.push(n); };
    ((_macVigia && _macVigia.maquinas) || []).forEach(m => soma(m.nome));
    soma(_macComputador);
    return nomes;
}

// O que dizer sobre quem está ouvindo — só quando há algo errado ou ambíguo. Sem problema, sem
// linha: o seletor já mostra o computador e o pontinho diz se está conectado.
function _macAvisoComputador() {
    if (!_macVigia) return null;
    const maquinas = Array.isArray(_macVigia.maquinas) ? _macVigia.maquinas : null;
    const on = maquinas ? maquinas.filter(m => m.online) : (_macVigia.online ? [{ nome: "" }] : []);

    if (_macComputador) {
        if (_macPcOnline(_macComputador)) return null;
        const visto = maquinas && maquinas.find(m => _macMesmoPc(m.nome, _macComputador));
        const quando = visto ? ` (visto ${_macHa(visto.visto_ha_s)})` : "";
        return { tom: "aviso", texto: `${_macComputador} não está conectado${quando} — abra o Chrome (com a extensão) e o XM Vigia nele, ou escolha outro computador.` };
    }
    if (on.length > 1) {
        return { tom: "aviso", texto: `${on.length} computadores conectados (${on.map(m => m.nome || "sem nome").join(", ")}) — escolha acima em qual os macros rodam. Sem escolha, o horário roda em todos.` };
    }
    if (!on.length) {
        const quando = _macVigia.visto_ha_s === null || _macVigia.visto_ha_s === undefined ? "" : ` (visto ${_macHa(_macVigia.visto_ha_s)})`;
        return { tom: "aviso", texto: `Nenhum computador conectado${quando} — abra o Chrome (com a extensão) e o XM Vigia.` };
    }
    return null;
}

function _macAvisoComputadorHtml() {
    const a = _macAvisoComputador();
    return a ? `<div class="mac-geral"><div class="mac-sit mac-sit-${a.tom}"><span class="mac-cmd-ponto"></span><span>${_macEsc(a.texto)}</span></div></div>` : "";
}

function _macVigiaHtml() {
    if (!_macVigia) return "";
    const nomes = _macComputadoresConhecidos();
    const opcoes = [`<option value=""${_macComputador ? "" : " selected"}>Qualquer computador</option>`]
        .concat(nomes.map(n => `<option value="${_macEsc(n)}"${_macMesmoPc(n, _macComputador) ? " selected" : ""}>${_macEsc(n)}${_macPcOnline(n) ? "" : " — desconectado"}</option>`));

    // O pontinho: o escolhido conectado (verde) ou não (amarelo); sem escolha, ok só com um
    // computador ouvindo.
    const on = ((_macVigia.maquinas || []).filter(m => m.online)).length || (_macVigia.online && !_macVigia.maquinas ? 1 : 0);
    const tom = _macComputador ? (_macPcOnline(_macComputador) ? "on" : "off") : (on === 1 ? "on" : "off");
    return `<span class="mac-computador"><label for="mac-computador-sel">Executa em</label>`
        + `<select id="mac-computador-sel" class="mac-select" onchange="_macEscolherComputador(this.value)">${opcoes.join("")}</select>`
        + `<span class="mac-vigia mac-vigia-${tom}"><span class="mac-cmd-ponto"></span></span></span>`;
}

// Escolheu o computador. Troca na hora e volta atrás se o servidor recusar.
function _macEscolherComputador(valor) {
    const antes = _macComputador;
    _macComputador = valor || null;
    _macRedesenhar();

    fetch(`${API}/admin/macros/spx/computador`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ maquina: valor || null })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (ok) return;
            _macComputador = antes;
            _macRedesenhar();
            gcAlert(d.error || "Não foi possível mudar o computador.");
        })
        .catch(() => {
            _macComputador = antes;
            _macRedesenhar();
            gcAlert("Erro ao conectar com o servidor.");
        });
}

// O que o vigia contou sem saber de qual macro é (erro inesperado, arquivo que não é relatório...).
function _macGeralHtml() {
    return _macGeral ? `<div class="mac-geral">${_macProblemaHtml(_macGeral, "")}</div>` : "";
}

// ── Ligar/desligar direto na lista ──
// O interruptor da linha grava só o "ativo" (as rodadas ficam como estão), sem passar pelo
// modal. Troca na hora e volta atrás se o servidor recusar.
function _macAlternarAtivo(chave, botao) {
    const m = _macLista.find(x => x.chave === chave);
    if (!m || (botao && botao.disabled)) return;
    const antes = !!m.ativo;
    const novo = !antes;

    m.ativo = novo;
    _macRedesenhar();

    // Macro do SPX tem rota própria (/admin/macros/spx/:qual); os outros seguem a convenção
    // "chave com traço".
    const rota = m.qual ? `spx/${m.qual}` : _macRotaDaChave(chave);
    fetch(`${API}/admin/macros/${rota}/ativo`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novo })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (ok) {
                // O resumo da linha ("Desligado" / "A cada 1 h") depende do interruptor.
                if (m.qual) _macCarregarLista(true);
                return;
            }
            m.ativo = antes;
            _macRedesenhar();
            gcAlert(d.error || "Não foi possível mudar.");
        })
        .catch(() => {
            m.ativo = antes;
            _macRedesenhar();
            gcAlert("Erro ao conectar com o servidor.");
        });
}

// ── Rodar agora ──
// O pedido vai pro servidor, o vigia busca (de ~30 em 30s) e a extensão executa no Chrome do
// galpão. Aqui só se pede e se acompanha: a linha mostra em que pé está, até o Chrome
// confirmar que começou (ou avisar que não conseguiu).
function _macRodar(qual, botao) {
    const m = _macLista.find(x => x.qual === qual);
    if (!m || _macOcupado(m.comando)) return;
    if (botao) botao.disabled = true;

    fetch(`${API}/admin/macros/spx/${qual}/rodar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: "{}"
    })
        .then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })))
        .then(({ ok, status, d }) => {
            if (ok || (status === 409 && d.comando)) {
                m.comando = d.comando;
                if (d.vigia) _macVigia = d.vigia;
                if (!ok) gcAlert(d.error);
                _macRedesenhar();
                _macAcompanhar();
                return;
            }
            if (botao) botao.disabled = false;
            gcAlert(d.error || "Não foi possível pedir.");
        })
        .catch(() => {
            if (botao) botao.disabled = false;
            gcAlert("Erro ao conectar com o servidor.");
        });
}

// Pergunta o andamento de poucos em poucos segundos (só memória no servidor, não toca no
// banco) enquanto houver pedido em andamento — e para sozinho quando não há mais, quando a
// pessoa sai da tela, ou depois de 12 minutos (o pedido já teria expirado no servidor).
function _macAcompanhar() {
    if (_macPoll) return;
    const inicio = Date.now();

    const passo = () => {
        const tela = document.getElementById("tela-macros");
        const visivel = !!tela && tela.classList.contains("active-view");
        const andando = _macLista.some(m => m.qual && _macOcupado(m.comando));
        if (!visivel || !andando || Date.now() - inicio > 12 * 60 * 1000) { _macPoll = null; return; }

        fetch(`${API}/admin/macros/spx/estado`, { headers: { "Authorization": "Bearer " + token } })
            .then(r => r.json())
            .then(d => {
                if (!d || !d.comandos) return;
                _macLista.forEach(m => { if (m.qual && d.comandos[m.qual]) m.comando = d.comandos[m.qual]; });
                if (d.vigia) _macVigia = d.vigia;
                _macRedesenhar();
            })
            .catch(() => { /* uma volta sem resposta: tenta de novo na próxima */ })
            .finally(() => { _macPoll = setTimeout(passo, 3000); });
    };
    _macPoll = setTimeout(passo, 3000);
}

// As rodadas do aviso, no painel (o formulário já está montado por _macConfigHtml).
function _macAbrirConfigurar(chave) {
    _macChaveEditando = chave;
    _macFonte = "rodadas";
    const erro = document.getElementById("mac-editar-erro");
    if (erro) erro.innerText = "";

    fetch(`${API}/admin/macros/${_macRotaDaChave(chave)}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) { gcAlert(d.error); return; }
            if (_macChaveEditando !== chave) return; // trocou de macro enquanto carregava
            _macTipos = d.tipos || [];
            _macRodadas = (d.rodadas || []).map(r => Object.assign({}, r));
            _macRenderizarRodadas();
        })
        .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

function _macRotuloParametro(tipoId) {
    const t = _macTipos.find(x => x.id === tipoId);
    return t ? t.parametroRotulo : "Parâmetro";
}

// Dois dígitos nos rótulos: "03", não "3".
const _macDoisDigitos = n => String(n).padStart(2, "0");

// "19:05" pro campo de horário — sempre com dois dígitos ("19:03", não "19:3"). Vazio quando
// hora/minuto não são inteiros da faixa (00–23 e 00–59): melhor um campo vazio do que um
// horário que não é o guardado.
const _macEmFaixa = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

function _macHorarioTexto(r) {
    return _macEmFaixa(r.hora, 23) && _macEmFaixa(r.minuto, 59)
        ? `${_macDoisDigitos(r.hora)}:${_macDoisDigitos(r.minuto)}` : "";
}

// Digitar no campo: o navegador devolve sempre "HH:MM" em 24h (mesmo que MOSTRE AM/PM, conforme
// o idioma) ou "" enquanto está incompleto. Grava em hora e minuto, que é o que o servidor
// guarda — a faixa (0–23, 0–59) o próprio campo já garante.
function _macMudarHorario(i, valor) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(valor || "");
    _macFonteHm()[i].hora = m ? Number(m[1]) : "";
    _macFonteHm()[i].minuto = m ? Number(m[2]) : "";
}

// ── Escolher o horário numa lista ──
// O campo de horário do Chrome tem uma lista própria, mas ela DÁ A VOLTA (depois do 59 vem o
// 00 de novo) e parecia rolar sem fim — e não dá pra mudar isso. O relógio do campo abre esta
// lista no lugar: hora (00–23) e minuto (00–59) lado a lado, com começo e fim. Digitar direto
// no campo continua funcionando.
const _macRelogioSvg = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`;

let _macPop = null;   // a lista aberta: { el, i, input, aoFora, aoTecla }

// O relogio serve a duas telas: as rodadas do aviso e os horarios de um macro do SPX. Qual lista
// ele edita depende de qual modal esta aberto (_macFonte).
const _macFonteHm = () => (_macFonte === "agenda" && _macAgenda ? _macAgenda.horarios : _macRodadas);

function _macFecharHorario() {
    if (!_macPop) return;
    document.removeEventListener("mousedown", _macPop.aoFora, true);
    document.removeEventListener("keydown", _macPop.aoTecla, true);
    window.removeEventListener("resize", _macFecharHorario);
    _macPop.el.remove();
    _macPop = null;
}

// Uma coluna: de `de` até `ate`, dois dígitos, com o valor atual marcado.
function _macColunaHtml(de, ate, atual, campo, i) {
    let html = "";
    for (let n = de; n <= ate; n++) {
        html += `<button type="button" class="mac-hm-item${n === atual ? " sel" : ""}" tabindex="-1" data-n="${n}" onclick="_macEscolherHm(${i},'${campo}',${n})">${_macDoisDigitos(n)}</button>`;
    }
    return html;
}

function _macAbrirHorario(i, botao) {
    const jaAberta = !!_macPop && _macPop.i === i;
    _macFecharHorario();
    if (jaAberta) return; // clicar de novo no relógio fecha

    const r = _macFonteHm()[i];
    const el = document.createElement("div");
    el.className = "mac-hm-pop";
    el.innerHTML = `
        <div class="mac-hm-lista"><div class="mac-hm-rotulo">Hora</div>
            <div class="mac-hm-col" data-campo="hora">${_macColunaHtml(0, 23, r.hora, "hora", i)}</div></div>
        <div class="mac-hm-lista"><div class="mac-hm-rotulo">Minuto</div>
            <div class="mac-hm-col" data-campo="minuto">${_macColunaHtml(0, 59, r.minuto, "minuto", i)}</div></div>`;
    document.body.appendChild(el);

    // Abre PRA BAIXO do campo; só vira pra cima se embaixo não couber e em cima houver mais lugar.
    const caixa = botao.getBoundingClientRect();
    const alto = el.offsetHeight, largo = el.offsetWidth;
    const abaixo = window.innerHeight - caixa.bottom;
    const praCima = abaixo < alto + 12 && caixa.top > abaixo;
    el.style.left = Math.max(8, Math.min(caixa.left, window.innerWidth - largo - 8)) + "px";
    el.style.top = (praCima ? Math.max(8, caixa.top - alto - 6) : caixa.bottom + 6) + "px";

    const aoFora = ev => { if (!el.contains(ev.target) && !botao.contains(ev.target)) _macFecharHorario(); };
    const aoTecla = ev => { if (ev.key === "Escape") { ev.stopPropagation(); _macFecharHorario(); } };
    document.addEventListener("mousedown", aoFora, true);
    document.addEventListener("keydown", aoTecla, true);
    window.addEventListener("resize", _macFecharHorario);
    _macPop = { el, i, input: botao.parentNode.querySelector("input"), aoFora, aoTecla };

    // Cada coluna já abre com o valor atual à vista, no meio.
    el.querySelectorAll(".mac-hm-col").forEach(col => {
        const sel = col.querySelector(".sel");
        if (sel) col.scrollTop = sel.offsetTop - (col.clientHeight - sel.offsetHeight) / 2;
    });
}

// Escolheu na lista: grava, marca na coluna e atualiza o campo. Escolher o minuto é o último
// passo, então fecha; escolher a hora deixa aberta pra escolher o minuto em seguida.
function _macEscolherHm(i, campo, n) {
    _macFonteHm()[i][campo] = n;
    if (_macPop) {
        _macPop.el.querySelectorAll(`.mac-hm-col[data-campo="${campo}"] .mac-hm-item`)
            .forEach(b => b.classList.toggle("sel", Number(b.dataset.n) === n));
        if (_macPop.input) _macPop.input.value = _macHorarioTexto(_macFonteHm()[i]);
    }
    if (campo === "minuto") _macFecharHorario();
}

const _macCapitalizar = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

// Uma rodada = uma linha (sem cartão dentro do cartão do modal): horário, critério, o número
// do critério e um "Remover" discreto. O rótulo do número acompanha o critério escolhido.
function _macLinhaRodada(r, i) {
    const rotuloParam = _macRotuloParametro(r.tipo);
    return `
    <div class="mac-rodada">
        <div class="mac-campo mac-campo-horario">
            <span>Horário</span>
            <div class="mac-horario-wrap">
                <input type="time" class="usr-modal-input mac-horario" value="${_macHorarioTexto(r)}"
                       oninput="_macMudarHorario(${i}, this.value)">
                <button type="button" class="mac-relogio" title="Escolher o horário numa lista" aria-label="Escolher o horário"
                        onclick="_macAbrirHorario(${i}, this)">${_macRelogioSvg}</button>
            </div>
        </div>
        <label class="mac-campo mac-campo-criterio">
            <span>Critério</span>
            <select class="usr-modal-input mac-criterio" title="${_macEsc((_macTipos.find(t => t.id === r.tipo) || {}).rotulo)}"
                    onchange="_macMudarTipo(${i}, this.value)">
                ${_macTipos.map(t => `<option value="${t.id}"${t.id === r.tipo ? " selected" : ""}>${_macEsc(t.rotulo)}</option>`).join("")}
            </select>
        </label>
        <label class="mac-campo mac-campo-param">
            <span title="${_macEsc(rotuloParam)}">${_macEsc(_macCapitalizar(rotuloParam))}</span>
            <input type="number" min="0" class="usr-modal-input" value="${r.parametro}"
                   oninput="_macMudarCampo(${i},'parametro',this.value)">
        </label>
        <button type="button" class="mac-remover" onclick="_macRemoverRodada(${i})">Remover</button>
    </div>`;
}

function _macRenderizarRodadas() {
    _macFecharHorario(); // a lista aberta era de uma linha que está sendo redesenhada
    const el = document.getElementById("mac-rodadas-lista");
    if (!_macRodadas.length) {
        el.innerHTML = `<div style="font-size:12.5px;color:#66829c;padding:8px 0">Nenhuma rodada — adicione pelo menos uma.</div>`;
        return;
    }
    el.innerHTML = _macRodadas.map((r, i) => _macLinhaRodada(r, i)).join("");
}

// `_macRodadas` é sempre quem manda: os campos só escrevem nela, e um re-render (troca de
// tipo) nunca perde o que já foi digitado nos outros campos.
function _macMudarCampo(i, campo, valor) {
    _macRodadas[i][campo] = valor === "" ? "" : Number(valor);
}

function _macMudarTipo(i, tipoId) {
    const t = _macTipos.find(x => x.id === tipoId);
    _macRodadas[i].tipo = tipoId;
    _macRodadas[i].parametro = t ? t.parametroPadrao : 0;
    _macRenderizarRodadas(); // o rótulo do campo parâmetro muda junto com o tipo
}

function _macAdicionarRodada() {
    const primeiro = _macTipos[0];
    _macRodadas.push({ hora: 12, minuto: 0, tipo: primeiro ? primeiro.id : "", parametro: primeiro ? primeiro.parametroPadrao : 0 });
    _macRenderizarRodadas();
}

function _macRemoverRodada(i) {
    _macRodadas.splice(i, 1);
    _macRenderizarRodadas();
}

function _macSalvar() {
    const erro = document.getElementById("mac-editar-erro");
    erro.innerText = "";
    if (!_macRodadas.length) { erro.innerText = "Adicione pelo menos uma rodada."; return; }

    // Ligar/desligar é no interruptor do topo; salvar as rodadas mantém o que está.
    const atual = _macLista.find(x => x.chave === _macChaveEditando);
    const ativo = !!(atual && atual.ativo);
    const btn = document.getElementById("mac-editar-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/macros/${_macRotaDaChave(_macChaveEditando)}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo, rodadas: _macRodadas })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar rodadas";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _macMostrarSalvo("mac-editar-erro");
            _macCarregarLista(true);
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar rodadas";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}

// ── Horário de um macro do SPX ──
// Duas formas de agendar, e a tela guarda as DUAS ao mesmo tempo: `modo` diz qual vale. Assim
// trocar de "a cada N minutos" pra "nestes horários" não joga fora o que já estava digitado.

function _macAbrirConfigurarSpx(qual) {
    const m = _macLista.find(x => x.qual === qual);
    if (!m || !m.agenda) return;
    _macAgenda = {
        qual,
        modo: m.agenda.modo === "horarios" ? "horarios" : "intervalo",
        minutos: m.agenda.minutos,
        minimo: m.minutos_minimo || 20,
        horarios: (m.agenda.horarios || []).map(h => ({ hora: h.hora, minuto: h.minuto })),
    };
    _macFonte = "agenda";
    document.getElementById("mac-ag-erro").innerText = "";
    _macRenderizarAgenda();
}

function _macRenderizarAgenda() {
    _macFecharHorario(); // a lista aberta era de uma linha que está sendo redesenhada
    const a = _macAgenda;
    const porIntervalo = a.modo === "intervalo";

    document.getElementById("mac-ag-modo-intervalo").checked = porIntervalo;
    document.getElementById("mac-ag-modo-horarios").checked = !porIntervalo;
    const minutos = document.getElementById("mac-ag-minutos");
    minutos.value = a.minutos;
    minutos.min = a.minimo;
    document.getElementById("mac-ag-dica-minimo").innerText = `Mínimo de ${a.minimo} minutos.`;

    // A parte que NÃO está valendo fica apagada, mas continua editável.
    document.getElementById("mac-ag-bloco-intervalo").classList.toggle("mac-ag-apagado", !porIntervalo);
    document.getElementById("mac-ag-bloco-horarios").classList.toggle("mac-ag-apagado", porIntervalo);

    document.getElementById("mac-ag-horarios").innerHTML = a.horarios.length
        ? a.horarios.map((h, i) => _macLinhaHorario(h, i)).join("")
        : `<div class="mac-ag-vazio">Nenhum horário ainda.</div>`;
}

function _macLinhaHorario(h, i) {
    return `
    <div class="mac-hor-linha">
        <div class="mac-horario-wrap">
            <input type="time" class="usr-modal-input mac-horario" value="${_macHorarioTexto(h)}"
                   oninput="_macMudarHorario(${i}, this.value)">
            <button type="button" class="mac-relogio" title="Escolher o horário numa lista" aria-label="Escolher o horário"
                    onclick="_macAbrirHorario(${i}, this)">${_macRelogioSvg}</button>
        </div>
        <button type="button" class="mac-remover" onclick="_macRemoverHorario(${i})">Remover</button>
    </div>`;
}

function _macMudarModo(modo) {
    _macAgenda.modo = modo === "horarios" ? "horarios" : "intervalo";
    _macRenderizarAgenda();
}

function _macMudarMinutos(valor) {
    _macAgenda.minutos = valor === "" ? "" : Number(valor);
}

function _macAdicionarHorario() {
    // O último horário + 1h como sugestão: quem adiciona costuma ir montando "8, 12, 16…".
    const ultimo = _macAgenda.horarios[_macAgenda.horarios.length - 1];
    const hora = ultimo && _macEmFaixa(ultimo.hora, 23) ? Math.min(23, ultimo.hora + 1) : 8;
    _macAgenda.horarios.push({ hora, minuto: 0 });
    _macAgenda.modo = "horarios"; // adicionar horário é querer usar horários
    _macRenderizarAgenda();
}

function _macRemoverHorario(i) {
    _macAgenda.horarios.splice(i, 1);
    _macRenderizarAgenda();
}

// O que vai pro servidor, ou o motivo de não ir. Mesmas regras do servidor — repetidas aqui
// só pra a mensagem aparecer na hora, sem ir e voltar da rede (o servidor confere de novo).
function _macMontarAgenda(a) {
    const minutos = Number(a.minutos);
    const minutosValidos = a.minutos !== "" && Number.isInteger(minutos) && minutos >= a.minimo && minutos <= 1440;
    if (a.modo === "intervalo" && !minutosValidos) {
        return { erro: `O intervalo tem que ser de ${a.minimo} a 1440 minutos.` };
    }

    const horarios = [];
    for (const h of a.horarios) {
        if (!_macEmFaixa(h.hora, 23) || !_macEmFaixa(h.minuto, 59)) {
            return { erro: "Tem um horário em branco ou inválido." };
        }
        horarios.push({ hora: h.hora, minuto: h.minuto });
    }
    if (a.modo === "horarios" && !horarios.length) return { erro: "Adicione pelo menos um horário." };

    // Intervalo que não vale e não está em uso não impede de salvar os horários: fica de fora e
    // o servidor guarda o padrão dele.
    return { agenda: Object.assign({ modo: a.modo, horarios }, minutosValidos ? { minutos } : {}) };
}

function _macSalvarAgenda() {
    const erro = document.getElementById("mac-ag-erro");
    erro.innerText = "";
    const r = _macMontarAgenda(_macAgenda);
    if (r.erro) { erro.innerText = r.erro; return; }

    const btn = document.getElementById("mac-ag-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    // Ligar/desligar é no interruptor do topo. Macro nunca configurado por aqui sai já ligado:
    // quem chegou até o Salvar quer que rode.
    const m = _macLista.find(x => x.qual === _macAgenda.qual);
    const ativo = m && m.configurado ? !!m.ativo : true;

    fetch(`${API}/admin/macros/spx/${_macAgenda.qual}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo, agenda: r.agenda })
    })
        .then(res => res.json().then(d => ({ ok: res.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar horário";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _macMostrarSalvo("mac-ag-erro");
            _macCarregarLista(true);
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar horário";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}

// ── Histórico: o que aconteceu, de todos os macros ou de um ──
// Cada linha é um evento contado pelo vigia ou pela extensão, com o computador de onde veio.
const _MAC_NOME_CURTO = { alimentacao: "AT", pedidos: "Pedidos", backlog: "Backlog", recebimento: "Colador Recebimento", at_cluster: "Colador AT Cluster", geral: "Geral" };
const _MAC_ORIGEM = { vigia: "vigia", extensao: "extensão" };

function _macHistoricoHtml(eventos) {
    if (!eventos || !eventos.length) return `<div class="mac-ag-vazio">Nada registrado ainda.</div>`;
    return eventos.map(e => {
        const onde = [e.maquina, _MAC_ORIGEM[e.origem] || e.origem, e.arquivo].filter(Boolean).map(_macEsc).join(" · ");
        return `
        <div class="mac-hist-linha mac-hist-${_macEsc(e.nivel)}">
            <span class="mac-cmd-ponto"></span>
            <span class="mac-hist-quando">${_macEsc(_macQuandoTexto(e.quando))}</span>
            <span class="mac-hist-corpo"><b>${_macEsc(_MAC_NOME_CURTO[e.macro] || e.macro)}</b> ${_macEsc(e.texto)}
                <span class="mac-hist-onde">${onde}</span></span>
        </div>`;
    }).join("");
}

function _macAbrirHistorico(macro) {
    const nome = macro ? (_MAC_NOME_CURTO[macro] || macro) : "";
    document.getElementById("mac-hist-titulo").innerText = nome ? `Histórico — ${nome}` : "Histórico dos macros";
    const lista = document.getElementById("mac-hist-lista");
    lista.innerHTML = `<div class="mac-ag-vazio">Carregando...</div>`;
    _abrirModal("modal-macro-historico");

    const filtro = macro ? `&macro=${encodeURIComponent(macro)}` : "";
    fetch(`${API}/admin/macros/spx/historico?limite=80${filtro}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => { lista.innerHTML = d.error ? `<div class="mac-ag-vazio">${_macEsc(d.error)}</div>` : _macHistoricoHtml(d.eventos); })
        .catch(() => { lista.innerHTML = `<div class="mac-ag-vazio">Erro ao conectar com o servidor.</div>`; });
}

// ── Colador (extensão XM Macros SPX + XM Vigia — migrado do colador_neon.py em 29/09/2026) ──
// Mesma ideia do Rodar/Configurar dos macros do SPX, mas sem horário nenhum: o Colador é uma
// sessão que se liga e desliga (ou fica de vigia, modo contínuo), não uma agenda. Sem
// "computador escolhido" PERSISTENTE (ao contrário do SPX) - de propósito, pra dar pra rodar em
// Caçador e Videira ao mesmo tempo, cada PC na conta do próprio polo (a reserva de lote no
// backend garante que dois coladores nunca pegam o mesmo código; quem evita colar o polo errado
// é a extensão, lendo o XPT da própria página do SPX). Em vez disso, cada Rodar pode escolher
// um alvo só PRA AQUELE CLIQUE (_macColadorAlvo, abaixo) — mostrado até o próximo Rodar mudar.
// Única parte de Macros que admin também acessa, não só dev.

// O computador escolhido pro PRÓXIMO clique de Rodar de cada colador (vazio = qualquer um). Só
// existe no navegador — nada salvo no servidor, diferente do "Executa em" do SPX.
let _macColadorAlvo = {};

// Só um pontinho + texto, no mesmo estilo de _macVigiaHtml: quantos computadores estão com o
// Chrome (extensão) + XM Vigia ouvindo agora — é a MESMA lista dos macros do SPX (fila.vigia()),
// não uma por colador. Sem inflar a tela com uma lista - "Detalhes" não existe aqui porque não
// há histórico (só Rodar e Configurar).
function _macColadorPresencaHtml(computadores) {
    const on = (computadores || []).filter(c => c.online);
    if (on.length === 1) return `<span class="mac-vigia mac-vigia-on"><span class="mac-cmd-ponto"></span>${_macEsc(on[0].nome || "conectado")}</span>`;
    if (on.length > 1) return `<span class="mac-vigia mac-vigia-aviso"><span class="mac-cmd-ponto"></span>${on.length} computadores conectados</span>`;
    return `<span class="mac-vigia mac-vigia-off"><span class="mac-cmd-ponto"></span>nenhum computador conectado</span>`;
}

// O comando mais recente: mesma lógica de tom dos macros do SPX (_macComandoTexto), com textos
// próprios do Colador (não fala em "Chrome" nem em horário) — e um estado a mais ("cancelado")
// que só o Colador tem (o SPX não deixa cancelar um pedido pendente).
function _macComandoColadorTexto(cmd) {
    const emAlvo = cmd.alvo ? ` em ${cmd.alvo}` : "";
    switch (cmd.estado) {
        case "aguardando":
            return { tom: "andando", texto: `Pedido enviado${emAlvo} — aguardando o Chrome (com a extensão) e o XM Vigia atenderem…` };
        case "entregue":
            return { tom: "andando", texto: `Recebido pelo Chrome${emAlvo} — iniciando…` };
        case "iniciado":
            // parar_pedido: alguém já clicou "parar" pra este — o vigia pega isso no próximo
            // /comandos dele (até ~30s); não dá pra confirmar aqui que já parou de verdade
            // (quem sabe é o próprio painel do macro, na tela de quem está rodando).
            return cmd.parar_pedido
                ? { tom: "aviso", texto: `Rodando${emAlvo} — parada pedida, aguardando o Chrome atender (até ~30s)…` }
                : { tom: "ok", texto: `Iniciado às ${_macHoraBrasilia(cmd.criado_em)} por ${cmd.criado_por}${emAlvo}` };
        case "erro":
            return { tom: "erro", texto: `Não rodou${emAlvo}: ${cmd.erro || "motivo não informado"}` };
        case "cancelado":
            return { tom: "aviso", texto: `Cancelado${emAlvo} antes de começar.` };
        case "expirado":
            return { tom: "aviso", texto: `Ninguém pegou esse pedido${emAlvo} a tempo — confira se o Chrome (com a extensão) e o XM Vigia estão de pé.` };
        case "sem_confirmacao":
            return { tom: "aviso", texto: `Recebido pelo Chrome${emAlvo}, mas ele nunca confirmou que começou.` };
        default:
            return { tom: "aviso", texto: String(cmd.estado || "") };
    }
}

// "cancelar": só faz sentido pendente (ninguém pegou ainda, ou pegou mas não confirmou) - depois
// de "iniciado" a trava de duplicado já nem bloqueia mais nada, então cancelar não teria o que
// liberar. "parar": só pro que já está rodando de verdade, e só uma vez (parar_pedido evita
// martelar o botão mandando o mesmo pedido enquanto o vigia não passou pela aba).
function _macBotaoAcaoColadorHtml(qual, cmd) {
    if (cmd.estado === "aguardando" || cmd.estado === "entregue") {
        return `<button type="button" class="mac-sit-acao" onclick="_macCancelarColador('${_macEsc(qual)}', '${_macEsc(cmd.id)}', this)">cancelar</button>`;
    }
    if (cmd.estado === "iniciado" && !cmd.parar_pedido) {
        return `<button type="button" class="mac-sit-acao" onclick="_macPararColador('${_macEsc(qual)}', '${_macEsc(cmd.id)}', this)">parar</button>`;
    }
    return "";
}

// Uma linha por MÁQUINA que já pediu este qual (comandos vem de fila.comandosDe — ver
// rotasColador.js) - Caçador e Videira rodando o mesmo Colador ao mesmo tempo aparecem os dois,
// cada um com a ação que faz sentido pro estado dele.
function _macSituacaoColadorHtml(qual, comandos) {
    return (comandos || []).map(cmd => {
        const c = _macComandoColadorTexto(cmd);
        const botao = _macBotaoAcaoColadorHtml(qual, cmd);
        return `<div class="mac-sit mac-sit-${c.tom}"><span class="mac-cmd-ponto"></span><span>${_macEsc(c.texto)}</span>${botao}</div>`;
    }).join("");
}

// "recebidos_hoje" só vem no item do Recebimento (ver rotasColador.js) — é a contagem de
// verdade no banco (colado_em preenchido), não algo que a tela calcula.
function _macRecebidosHtml(item) {
    if (item.recebidos_hoje === undefined || item.recebidos_hoje === null) return "";
    return ` · <span class="mac-agenda-resumo">${item.recebidos_hoje} recebido(s) hoje no SPX</span>`;
}

// O seletor de "pra qual computador vai o PRÓXIMO Rodar" — não é uma escolha salva (como o
// "Executa em" do SPX): _macColadorAlvo só vive no navegador, e cada clique manda o que
// estiver marcado aqui na hora. As opções são os computadores que o vigia já viu (mesma lista
// de _macColadorPresencaHtml) — computador que nunca apareceu não tem como ser escolhido.
function _macHtmlAlvoColador(item) {
    const nomes = [...new Set((item.computadores || []).map(c => c.nome).filter(Boolean))];
    const atual = _macColadorAlvo[item.qual] || "";
    const opcoes = [`<option value=""${atual ? "" : " selected"}>Qualquer computador</option>`]
        .concat(nomes.map(n => {
            const online = (item.computadores || []).some(c => c.nome === n && c.online);
            return `<option value="${_macEsc(n)}"${n === atual ? " selected" : ""}>${_macEsc(n)}${online ? "" : " — desconectado"}</option>`;
        }));
    return `<select class="mac-select" title="Rodar em qual computador" aria-label="Rodar ${_macEsc(item.nome)} em qual computador"
                onchange="_macColadorMudarAlvo('${_macEsc(item.qual)}', this.value)">${opcoes.join("")}</select>`;
}

function _macColadorMudarAlvo(qual, valor) {
    _macColadorAlvo[qual] = valor || "";
    _macRedesenhar(); // o Rodar fica desabilitado/habilitado dependendo do alvo escolhido agora
}

// Só desabilita o Rodar quando o alvo ESCOLHIDO agora bate com um pedido pendente - mesma regra
// do backend (fila.js/conflitaAlvo): "qualquer computador" conflita com tudo, alvo específico só
// conflita com ele mesmo. Sem isso o botão ficaria preso achando que o Colador está ocupado só
// porque OUTRA máquina está rodando, o que é exatamente o que agora é permitido.
function _macColadorConflita(item, alvoEscolhido) {
    const alvo = (alvoEscolhido || "").toLowerCase();
    return (item.comandos || []).some(cmd => {
        if (cmd.estado !== "aguardando" && cmd.estado !== "entregue") return false;
        const cmdAlvo = (cmd.alvo || "").toLowerCase();
        return !alvo || !cmdAlvo || alvo === cmdAlvo;
    });
}

// Substitui, dentro de item.comandos, o que já existia pra ESSE alvo (mesma máquina) - ou
// acrescenta, se for a primeira vez que essa máquina pede este qual. Assim o Rodar pra uma
// segunda máquina não apaga a situação da primeira, que continua rodando em paralelo.
function _macMergeComandoColador(item, cmd) {
    if (!Array.isArray(item.comandos)) item.comandos = [];
    const chave = (cmd.alvo || "").toLowerCase();
    const i = item.comandos.findIndex(c => (c.alvo || "").toLowerCase() === chave);
    if (i >= 0) item.comandos[i] = cmd; else item.comandos.push(cmd);
}

function _macRodarColador(qual, botao) {
    const item = _macColadores.find(c => c.qual === qual);
    if (!item) return;
    if (botao) botao.disabled = true;
    const maquina = _macColadorAlvo[qual] || null;

    fetch(`${API}/admin/macros/colador/${qual}/rodar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ maquina })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) {
                if (botao) botao.disabled = false;
                gcAlert(d.error || "Não foi possível pedir.");
                return;
            }
            _macMergeComandoColador(item, Object.assign({ idade_s: 0 }, d.comando));
            if (!d.algum_conectado) {
                const onde = maquina ? `o computador "${maquina}" não está` : "nenhum computador está";
                gcAlert(`Pedido enviado, mas ${onde} com o Chrome/XM Vigia conectado agora — ele roda assim que alguém abrir.`);
            }
            _macRedesenhar();
            _macAcompanharColador();
        })
        .catch(() => {
            if (botao) botao.disabled = false;
            gcAlert("Erro ao conectar com o servidor.");
        });
}

// Cancela um pendente (aguardando/entregue) na hora — libera a mesma máquina pra pedir de novo
// sem esperar a expiração. Não serve pro que já rodou (o servidor recusa com 409; a trava de
// duplicado já nem bloqueia mais nada nesse ponto mesmo).
function _macCancelarColador(qual, id, botao) {
    const item = _macColadores.find(c => c.qual === qual);
    if (botao) botao.disabled = true;
    fetch(`${API}/admin/macros/colador/comandos/${encodeURIComponent(id)}/cancelar`, {
        method: "POST", headers: { "Authorization": "Bearer " + token }
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) { if (botao) botao.disabled = false; gcAlert(d.error || "Não foi possível cancelar."); return; }
            if (item) _macMergeComandoColador(item, d.comando);
            _macRedesenhar();
        })
        .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}

// Pede pra um "iniciado" parar — o vigia repassa pro Chrome certo no próximo /comandos dele (até
// ~30s). Não muda o estado aqui: só marca parar_pedido pra tela não deixar clicar de novo à toa.
function _macPararColador(qual, id, botao) {
    const item = _macColadores.find(c => c.qual === qual);
    if (botao) botao.disabled = true;
    fetch(`${API}/admin/macros/colador/comandos/${encodeURIComponent(id)}/parar`, {
        method: "POST", headers: { "Authorization": "Bearer " + token }
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) { if (botao) botao.disabled = false; gcAlert(d.error || "Não foi possível pedir pra parar."); return; }
            if (item) {
                const cmd = (item.comandos || []).find(c => c.id === id);
                if (cmd) cmd.parar_pedido = true;
            }
            _macRedesenhar();
        })
        .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}

// Reconsulta a lista inteira em vez de ter um /estado próprio (como o SPX tem) — é pouca coisa
// pra justificar outro endpoint; a fila em memória (fila.js) é a mesma dos macros do SPX.
let _macPollColador = null;
function _macAcompanharColador() {
    if (_macPollColador) return;
    const passo = () => {
        const tela = document.getElementById("tela-macros");
        const visivel = !!tela && tela.classList.contains("active-view");
        // "entregue" entra aqui também (não só "aguardando"): sem isso o poll parava assim que o
        // Chrome pegasse o pedido, e "iniciado"/"erro" só apareceriam na próxima vez que a tela
        // fosse reaberta.
        const andando = _macColadores.some(c => (c.comandos || []).some(cmd => cmd.estado === "aguardando" || cmd.estado === "entregue"));
        if (!visivel || !andando) { _macPollColador = null; return; }

        fetch(`${API}/admin/macros/colador`, { headers: { "Authorization": "Bearer " + token } })
            .then(r => r.json())
            .then(d => {
                if (d && Array.isArray(d.coladores)) { _macColadores = d.coladores; _macRedesenhar(); }
            })
            .catch(() => { /* tenta de novo na proxima */ })
            .finally(() => { _macPollColador = setTimeout(passo, 4000); });
    };
    _macPollColador = setTimeout(passo, 4000);
}

// ── Configurar o Colador ──
function _macAbrirConfigurarColador(qual) {
    const item = _macColadores.find(c => c.qual === qual);
    if (!item) return;
    _macColadorEditando = Object.assign({ qual, nome: item.nome }, JSON.parse(JSON.stringify(item.config)));
    document.getElementById("mac-col-erro").innerText = "";
    _macRenderizarColador();
}

function _macRenderizarColador() {
    const c = _macColadorEditando;
    document.getElementById("mac-col-xpt").value = c.xpt || "";
    document.getElementById("mac-col-todos-dias").checked = !!c.todos_dias;
    document.getElementById("mac-col-dia").value = c.dia || "";
    document.getElementById("mac-col-dia").disabled = !!c.todos_dias;
    document.getElementById("mac-col-carencia").value = c.carencia;
    document.getElementById("mac-col-lote").value = c.lote;
    document.getElementById("mac-col-intervalo").value = c.intervalo;
    document.getElementById("mac-col-intervalo-rotulo").innerText = c.intervalo.toFixed(1) + "s";
    document.getElementById("mac-col-continuo").checked = c.continuo !== false;
}

function _macColMudarTodosDias(marcado) {
    _macColadorEditando.todos_dias = marcado;
    _macRenderizarColador();
}
function _macColMudarCampo(campo, valor) {
    _macColadorEditando[campo] = valor;
}
function _macColMudarIntervalo(valor) {
    _macColadorEditando.intervalo = Number(valor);
    document.getElementById("mac-col-intervalo-rotulo").innerText = Number(valor).toFixed(1) + "s";
}

// Mesmas regras do servidor (colador.js) — só pra a mensagem aparecer na hora; o servidor
// confere de novo.
function _macMontarConfigColador(c) {
    if (!c.todos_dias && !/^\d{4}-\d{2}-\d{2}$/.test(c.dia || "")) {
        return { erro: 'Informe o dia (AAAA-MM-DD) ou marque "todos os dias".' };
    }
    if (!String(c.xpt || "").trim()) return { erro: "Escolha o XPT." };
    const carencia = Number(c.carencia);
    if (!Number.isInteger(carencia) || carencia < 0 || carencia > 3600) return { erro: "Carência tem que ser de 0 a 3600 segundos." };
    const lote = Number(c.lote);
    if (!Number.isInteger(lote) || lote < 1 || lote > 500) return { erro: "Códigos por lote tem que ser de 1 a 500." };
    const intervalo = Number(c.intervalo);
    if (!Number.isFinite(intervalo) || intervalo < 0 || intervalo > 1.5) return { erro: "Intervalo tem que ser de 0 a 1,5 segundos." };
    return {
        config: {
            todos_dias: !!c.todos_dias, dia: c.todos_dias ? null : c.dia.trim(),
            xpt: c.xpt.trim(), carencia, lote, intervalo: Math.round(intervalo * 10) / 10,
            continuo: c.continuo !== false,
        },
    };
}

function _macSalvarColador() {
    const erro = document.getElementById("mac-col-erro");
    erro.innerText = "";
    const r = _macMontarConfigColador(_macColadorEditando);
    if (r.erro) { erro.innerText = r.erro; return; }

    const btn = document.getElementById("mac-col-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/macros/colador/${_macColadorEditando.qual}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ config: r.config })
    })
        .then(res => res.json().then(d => ({ ok: res.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar configuração";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _macMostrarSalvo("mac-col-erro");
            _macCarregarLista(true);
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar configuração";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}
