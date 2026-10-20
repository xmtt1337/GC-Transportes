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
            _macInstancias = spx && Array.isArray(spx.instancias) ? spx.instancias : [];
            _macColadores = colador && Array.isArray(colador.coladores) ? colador.coladores : [];
            empty.style.display = "none";
            _macRedesenhar();
            _macAcompanhar();
            _macVigiarAtividade();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// ── O layout: lista de macros com as instâncias embaixo, detalhe do escolhido à direita ──
// Cada relatório do SPX roda em quantos lugares precisar: uma INSTÂNCIA por computador + polo
// (o Chrome logado naquela estação), cada uma com o seu horário e o seu liga/desliga
// (modules/macros-comando/instancias.js). Na lista, o nome do macro e embaixo uma linha por
// instância — clicar abre ela; clicar no nome (ou no +) abre uma instância nova.
//
// O Pedidos Pesquisados não tem instância própria: vai logo depois de cada AT, no mesmo Chrome —
// as linhas dele seguem as da AT. O Colador tem uma linha por sessão (computador + polo).
//
// Dois pedaços do detalhe, redesenhados em momentos diferentes:
//   #macd-vivo   - situação, botões, rodando agora: muda sozinho (acompanhamento, atividade);
//   #macd-config - o formulário (horário, rodadas, configuração): só ao abrir e depois de salvar
//                  — redesenhar no meio apagaria o que a pessoa está digitando.

let _macSelecionado = null;   // "inst:<id>", "ped:<maquina>|<xpt>", "col:<qual>|<maquina>|<xpt>", "novo:<qual>", "colcfg:<qual>", "av:<chave>"
let _macAtividade = null;     // /admin/macros/atividade (o que roda agora em cada aba)
let _macInstancias = [];      // as instâncias dos relatórios (vem de /admin/macros/spx)
let _macPollVivo = null;
let _macHistMacro = { chave: null, eventos: null };
let _macNova = null;          // rascunho de "nova instância": { qual, maquina, xpt, ativo }
const _MAC_CHAVE_SELECIONADO = "gc-macros-selecionado";

const _MAC_XPTS = [
    { xpt: "XPT_CFC", polo: "Caçador" },
    { xpt: "XPT_VIA", polo: "Videira" },
];
const _macPoloDoXpt = xpt => (_MAC_XPTS.find(p => p.xpt === xpt) || {}).polo || "";

const _MAC_SPX = [
    { qual: "alimentacao", nome: "Alimentar AT exportada", detalhe: "Exporta e baixa a AT do dia. Depois de cada AT, o Pedidos Pesquisados roda sozinho." },
    { qual: "pedidos", nome: "Pedidos pesquisados", detalhe: "Pesquisa em lote os pedidos novos da AT — roda logo depois de cada AT, no mesmo Chrome." },
    { qual: "backlog", nome: "Backlog", detalhe: "Baixa o backlog do hub. Cada rodada grava o retrato inteiro — quanto mais seguido, mais o banco cresce." },
];
const _MAC_AVISOS = [
    { id: "av:avisos_entregador", chave: "avisos_entregador", nome: "Shopee XPT_CFC", detalhe: "Caçador · WhatsApp oficial (WABA)", xpt: "XPT_CFC" },
    { id: "av:pendente_via", nome: "Shopee XPT_VIA", detalhe: "Videira", xpt: "XPT_VIA", pendente: true },
];
const _macNomeSpx = qual => (_MAC_SPX.find(x => x.qual === qual) || {}).nome || qual;

const _macEhDev = () => !!(window._gcUser && window._gcUser.role === "dev");
const _macDadoSpx = qual => _macLista.find(m => m.qual === qual) || null;
const _macMesmoChrome = (a, maquina, xpt) => _macMesmoPc(a.maquina, maquina) && (a.xpt || null) === (xpt || null);

// ── o que está acontecendo em cada Chrome (pela atividade das abas) ──
const _macAbas = () => (_macAtividade && _macAtividade.abas) || [];
const _macAtivos = () => (_macAtividade && _macAtividade.ativos) || [];
const _macAbaRodando = (macro, maquina, xpt) =>
    _macAbas().find(a => a.macro === macro && (a.estado === "rodando" || a.estado === "sem_sinal") && _macMesmoChrome(a, maquina, xpt)) || null;
const _macAtivoDe = (macro, maquina, xpt) => _macAtivos().find(a => a.macro === macro && _macMesmoChrome(a, maquina, xpt)) || null;
// O Chrome daquele computador + polo está conectado agora?
const _macChromeOnline = (maquina, xpt) =>
    ((_macAtividade && _macAtividade.maquinas) || []).some(m => m.online && _macMesmoPc(m.nome, maquina) && m.xpt === xpt);

// O último pedido (Rodar/Reiniciar) daquele Chrome pra este macro.
function _macComandoDe(qual, maquina, xpt) {
    const m = _macDadoSpx(qual);
    return ((m && m.comandos) || []).find(c => _macMesmoPc(c.alvo, maquina) && ((c.config && c.config.xpt) || null) === (xpt || null)) || null;
}

// "15:31 (em 12 min)" / "a qualquer momento".
function _macProximaTexto(p) {
    if (!p || !p.proxima_em) return null;
    const hora = new Date(p.proxima_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const s = p.proxima_em_s;
    const falta = s === null || s === undefined ? "" : s <= 60 ? " (a qualquer momento)"
        : s < 3600 ? ` (em ${Math.round(s / 60)} min)` : ` (em ${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")})`;
    return hora + falta;
}

// ── os itens da lista ──
// Cada instância/linha: { id, tipo, qual, maquina, xpt, ... } com o estado pronto pra lista.
function _macLinhasDeInstancia(qual) {
    return _macInstancias.filter(i => i.qual === qual)
        .sort((a, b) => a.maquina.localeCompare(b.maquina) || a.xpt.localeCompare(b.xpt))
        .map(i => ({ id: `inst:${i.id}`, tipo: "inst", qual, maquina: i.maquina, xpt: i.xpt, inst: i }));
}

function _macLinhasDePedidos() {
    return _macInstancias.filter(i => i.qual === "alimentacao")
        .sort((a, b) => a.maquina.localeCompare(b.maquina) || a.xpt.localeCompare(b.xpt))
        .map(i => ({ id: `ped:${i.maquina}|${i.xpt}`, tipo: "ped", qual: "pedidos", maquina: i.maquina, xpt: i.xpt, at: i }));
}

// As sessões do Colador: as que estão rodando (atividade) + as pedidas pela tela (comandos).
function _macLinhasDoColador(c) {
    const vistas = new Map();
    const soma = (maquina, xpt) => {
        if (!maquina) return;
        const chave = `${String(maquina).toLowerCase()}|${xpt || ""}`;
        if (!vistas.has(chave)) vistas.set(chave, { id: `col:${c.qual}|${maquina}|${xpt || ""}`, tipo: "col", qual: c.qual, maquina, xpt: xpt || null, col: c });
    };
    for (const s of c.sessoes || []) soma(s.maquina, s.xpt);
    for (const a of _macAbas()) if (a.macro === c.qual) soma(a.maquina, a.xpt);
    for (const cmd of c.comandos || []) soma(cmd.alvo, (cmd.config && cmd.config.xpt) || null);
    return [...vistas.values()].sort((a, b) => a.maquina.localeCompare(b.maquina) || String(a.xpt).localeCompare(String(b.xpt)));
}

function _macGrupos() {
    const dev = _macEhDev();
    const grupos = [];
    if (dev) {
        grupos.push({ titulo: "Relatórios do SPX", macros: _MAC_SPX.map(x => ({
            id: x.qual === "pedidos" ? null : `novo:${x.qual}`, nome: x.nome, qual: x.qual,
            novo: x.qual !== "pedidos", indisponivel: !_macDadoSpx(x.qual),
            linhas: x.qual === "pedidos" ? _macLinhasDePedidos() : _macLinhasDeInstancia(x.qual),
            vazio: x.qual === "pedidos" ? "segue as instâncias da AT" : "nenhuma instância — clique pra abrir",
        })) });
    }
    if (_macColadores.length) {
        grupos.push({ titulo: "Colador", macros: _macColadores.map(c => ({
            id: `colcfg:${c.qual}`, nome: c.nome, qual: c.qual, novo: true,
            linhas: _macLinhasDoColador(c), vazio: "nenhuma sessão — clique pra abrir",
        })) });
    }
    if (dev) {
        const linhas = _MAC_AVISOS.map(a => ({ ...a, tipo: a.pendente ? "pendente" : "aviso", m: a.chave ? _macLista.find(m => m.chave === a.chave) : null }));
        const conhecidas = new Set(["avisos_entregador"]);
        for (const m of _macLista) {
            if (!m.qual && !conhecidas.has(m.chave)) linhas.push({ id: `av:${m.chave}`, tipo: "aviso", chave: m.chave, nome: m.nome, detalhe: m.descricao, m });
        }
        grupos.push({ titulo: "Avisos de rota incompleta", avisos: linhas });
    }
    return grupos;
}

// A sessão está ligada no servidor (fica rodando até alguém parar)?
function _macSessaoLigada(l) {
    return !!(l.col && (l.col.sessoes || []).some(s => _macMesmoPc(s.maquina, l.maquina) && s.xpt === l.xpt));
}

// Só a hora, pra caber na lista: "18:10".
const _macHoraCurta = p => (p && p.proxima_em
    ? new Date(p.proxima_em).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : null);

// O ponto e a frase de cada linha.
function _macEstadoLinha(l) {
    const macro = l.qual;
    const rodando = _macAbaRodando(macro, l.maquina, l.xpt);
    const ativo = _macAtivoDe(macro, l.maquina, l.xpt);
    const ultimo = ativo && ativo.ultimo;
    if (rodando) return { tom: "andando", texto: rodando.estado === "sem_sinal" ? "sem sinal do Chrome" : "rodando agora" };
    // Ligada e ainda não rodando: o Chrome desse polo abre sozinho (ou está fechado).
    if (l.tipo === "col" && _macSessaoLigada(l)) {
        return _macChromeOnline(l.maquina, l.xpt)
            ? { tom: "andando", texto: "ligada · abrindo" }
            : { tom: "aviso", texto: "ligada · Chrome desse polo fechado" };
    }
    const cmd = l.tipo === "col"
        ? (l.col.comandos || []).find(c => _macMesmoPc(c.alvo, l.maquina) && ((c.config && c.config.xpt) || null) === l.xpt)
        : _macComandoDe(macro, l.maquina, l.xpt);
    if (cmd && _macOcupado(cmd)) return { tom: "andando", texto: "pedido enviado" };
    if (l.tipo === "inst" && !l.inst.ativo) return { tom: "mudo", texto: "pausado" };
    if (l.tipo === "col") return { tom: "mudo", texto: ultimo ? `parado · última ${(_MEX_ESTADOS_TXT[ultimo.estado] || ultimo.estado)}` : "parado" };
    if (ultimo && ultimo.estado === "erro") {
        const prox = _macHoraCurta(ativo);
        return { tom: "erro", texto: `falhou${prox ? ` · próx. ${prox}` : ""}` };
    }
    const prox = _macHoraCurta(ativo);
    if (prox) return { tom: "ok", texto: `próx. ${prox}` };
    if (l.tipo === "ped") return { tom: l.at.ativo ? "ok" : "mudo", texto: l.at.ativo ? "depois de cada AT" : "AT pausada" };
    if (!_macChromeOnline(l.maquina, l.xpt)) return { tom: "aviso", texto: "Chrome desse polo fechado" };
    return { tom: "ok", texto: l.inst ? l.inst.resumo : "" };
}
const _MEX_ESTADOS_TXT = { ok: "concluída", aviso: "com aviso", erro: "falhou", parado: "parada", interrompido: "interrompida" };

// O X da linha: fechar sem abrir a tela. Sessão do Colador rodando → parar; pedida e ainda não
// começada → cancelar o pedido; instância de relatório → cancelar a instância (pede confirmação).
function _macFecharDaLinha(l) {
    const esc = s => _macEsc(s);
    if (l.tipo === "inst") {
        return { titulo: "Cancelar esta instância", acao: `_macCancelarInstancia('${esc(l.inst.id)}', this)` };
    }
    if (l.tipo !== "col") return null;
    if (_macAbaRodando(l.qual, l.maquina, l.xpt) || _macSessaoLigada(l)) {
        return { titulo: "Parar esta sessão", acao: `_macSessaoParar('${esc(l.qual)}','${esc(l.maquina)}','${esc(l.xpt || "")}', this)` };
    }
    const cmd = (l.col.comandos || []).find(c => _macMesmoPc(c.alvo, l.maquina) && ((c.config && c.config.xpt) || null) === l.xpt);
    if (cmd && _macOcupado(cmd) && cmd.estado !== "iniciado") {
        return { titulo: "Cancelar o pedido", acao: `_macCancelarColador('${esc(l.qual)}', '${esc(cmd.id)}', this)` };
    }
    return null;
}

function _macHtmlLinha(l) {
    const r = _macEstadoLinha(l);
    const sel = l.id === _macSelecionado;
    const fechar = _macFecharDaLinha(l);
    return `<div class="macl-inst-linha">
        <button type="button" class="macl-inst${sel ? " sel" : ""}" ${sel ? 'aria-current="true"' : ""} onclick="_macSelecionar('${_macEsc(l.id)}')">
            <span class="mac-cmd-ponto macl-ponto-${r.tom}"></span>
            <span class="macl-inst-onde">${_macEsc(l.maquina)} · <b>${_macEsc(l.xpt || "polo ?")}</b></span>
            <span class="macl-inst-resumo">${_macEsc(r.texto)}</span>
        </button>
        ${fechar ? `<button type="button" class="macl-fechar" title="${fechar.titulo}" aria-label="${fechar.titulo}" onclick="${fechar.acao}">×</button>` : ""}
    </div>`;
}

function _macHtmlLista(grupos) {
    return grupos.map(g => `
        <div class="macl-grupo">
            <div class="macl-grupo-titulo">${_macEsc(g.titulo)}</div>
            ${(g.macros || []).map(m => `
                <div class="macl-macro">
                    ${m.id
                        ? `<button type="button" class="macl-macro-nome${m.id === _macSelecionado ? " sel" : ""}" onclick="_macSelecionar('${_macEsc(m.id)}')"
                                   title="${m.novo ? "Abrir uma instância nova" : ""}"><span>${_macEsc(m.nome)}</span>${m.novo ? `<span class="macl-mais" aria-hidden="true">+</span>` : ""}</button>`
                        : `<div class="macl-macro-nome macl-macro-fixo"><span>${_macEsc(m.nome)}</span></div>`}
                    ${m.indisponivel ? `<div class="macl-vazio">indisponível no momento</div>`
                        : m.linhas.length ? m.linhas.map(_macHtmlLinha).join("") : `<div class="macl-vazio">${_macEsc(m.vazio)}</div>`}
                </div>`).join("")}
            ${(g.avisos || []).map(a => {
                const sel = a.id === _macSelecionado;
                const r = a.tipo === "pendente" ? { tom: "mudo", texto: "Ainda não integrado" }
                    : !a.m ? { tom: "mudo", texto: "Indisponível no momento" }
                    : a.m.ativo ? { tom: "ok", texto: "Ativo" } : { tom: "mudo", texto: "Desligado" };
                return `<button type="button" class="macl-item${sel ? " sel" : ""}${a.tipo === "pendente" ? " pendente" : ""}" ${sel ? 'aria-current="true"' : ""}
                            onclick="_macSelecionar('${_macEsc(a.id)}')">
                    <span class="macl-nome">${_macEsc(a.nome)}</span>
                    <span class="macl-resumo"><span class="mac-cmd-ponto macl-ponto-${r.tom}"></span>${_macEsc(r.texto)}</span>
                </button>`;
            }).join("")}
        </div>`).join("");
}

// Todos os ids que dá pra abrir agora (pra saber se o lembrado ainda existe).
function _macIdsAbriveis(grupos) {
    const ids = [];
    for (const g of grupos) {
        for (const m of g.macros || []) { if (m.id) ids.push(m.id); m.linhas.forEach(l => ids.push(l.id)); }
        for (const a of g.avisos || []) ids.push(a.id);
    }
    return ids;
}

function _macGarantirSelecao(grupos) {
    const ids = _macIdsAbriveis(grupos);
    if (_macSelecionado && ids.includes(_macSelecionado)) return false;
    let lembrado = null;
    try { lembrado = localStorage.getItem(_MAC_CHAVE_SELECIONADO); } catch (e) { /* sem storage */ }
    _macSelecionado = ids.includes(lembrado) ? lembrado
        : (ids.find(i => i.startsWith("inst:") || i.startsWith("col:")) || ids[0] || null);
    return true;
}

function _macRedesenhar() {
    const lista = document.getElementById("mac-lista");
    if (!lista) return;
    const grupos = _macGrupos();
    const mudouSelecao = _macGarantirSelecao(grupos);
    const nav = document.getElementById("macl-nav");
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
    if (nav) nav.innerHTML = _macHtmlLista(_macGrupos());
    _macMontarDetalhe();
    const det = document.getElementById("macl-detalhe");
    if (det && det.scrollIntoView && window.innerWidth < 900) det.scrollIntoView({ behavior: "smooth", block: "start" });
}

// O que está aberto, já com os dados de agora.
function _macAberto() {
    const id = _macSelecionado || "";
    for (const g of _macGrupos()) {
        for (const m of g.macros || []) {
            if (m.id === id) return { tipo: id.startsWith("novo:") ? "novo" : "colcfg", qual: m.qual, nome: m.nome, macro: m };
            const l = m.linhas.find(x => x.id === id);
            if (l) return { ...l, nome: m.nome };
        }
        for (const a of g.avisos || []) if (a.id === id) return a;
    }
    return null;
}

// ── o detalhe ──
function _macMontarDetalhe() {
    const det = document.getElementById("macl-detalhe");
    if (!det) return;
    const item = _macAberto();
    if (!item) { det.innerHTML = `<div class="mac-ag-vazio">Escolha um macro na lista.</div>`; return; }
    const hist = _macChaveHistorico(item);
    det.innerHTML = `
        <header class="macd-cab" id="macd-cab"></header>
        <div id="macd-vivo"></div>
        <div id="macd-config"></div>
        ${hist ? `<div class="macd-bloco">
            <div class="macd-bloco-cab"><div class="macd-rotulo">Histórico recente${item.maquina ? ` · ${_macEsc(item.maquina)}` : ""}</div>
                <button type="button" class="mac-link" onclick="_macAbrirHistorico('${_macEsc(item.qual)}')">Ver tudo</button></div>
            <div id="macd-hist" class="mac-hist-lista macd-hist"><div class="mac-ag-vazio">Carregando...</div></div>
        </div>` : ""}`;
    document.getElementById("macd-cab").innerHTML = _macCabecalhoHtml(item);
    document.getElementById("macd-vivo").innerHTML = _macVivoHtml(item);
    document.getElementById("macd-config").innerHTML = _macConfigHtml(item);
    _macPrepararConfig(item);
    if (hist) _macCarregarHistoricoDoMacro(item);
}

const _macChaveHistorico = item => ["inst", "ped", "col", "colcfg"].includes(item.tipo) ? item.qual : null;

function _macRedesenharVivo() {
    const item = _macAberto();
    if (!item) return _macMontarDetalhe();
    const vivo = document.getElementById("macd-vivo");
    const cab = document.getElementById("macd-cab");
    if (vivo) vivo.innerHTML = _macVivoHtml(item);
    if (cab) cab.innerHTML = _macCabecalhoHtml(item);
}

function _macCabecalhoHtml(item) {
    let titulo = item.nome, sub = item.detalhe || "";
    if (["inst", "ped", "col"].includes(item.tipo)) {
        sub = `${item.maquina} · ${item.xpt || "polo ?"}${item.xpt ? ` · ${_macPoloDoXpt(item.xpt)}` : ""}`;
    } else if (item.tipo === "novo") {
        sub = "Nova instância: escolha o computador e o polo onde ele vai rodar.";
    } else if (item.tipo === "colcfg") {
        sub = "Configuração das sessões e abrir uma sessão nova num computador e polo.";
    }
    const liga = item.tipo === "aviso" && item.m
        ? `<label class="macd-liga"><span>${item.m.ativo ? "Ligado" : "Desligado"}</span>
            <button type="button" class="gc-toggle mac-toggle${item.m.ativo ? " gc-toggle--on" : ""}" role="switch" aria-checked="${item.m.ativo ? "true" : "false"}"
                    title="${item.m.ativo ? "Desligar" : "Ligar"}" onclick="_macAlternarAtivo('${_macEsc(item.m.chave)}', this)"><span class="gc-toggle__knob"></span></button></label>`
        : "";
    return `<div class="macd-cab-texto"><h3 class="macd-titulo">${_macEsc(titulo)}</h3>${sub ? `<p class="macd-sub">${_macEsc(sub)}</p>` : ""}</div>${liga}`;
}

function _macCampoHtml(rotulo, valor, nota) {
    return `<div class="macd-campo"><div class="macd-rotulo">${rotulo}</div><div class="macd-valor">${valor}</div>${nota ? `<div class="macd-nota">${nota}</div>` : ""}</div>`;
}

function _macRodandoAgoraHtml(macro, maquina, xpt) {
    const aba = _macAbaRodando(macro, maquina, xpt);
    if (!aba || typeof _mexCartaoHtml !== "function") return "";
    return `<div class="macd-bloco"><div class="macd-rotulo">Rodando agora</div><div class="macd-cartoes">${_mexCartaoHtml(aba)}</div></div>`;
}

function _macUltimaHtml(macro, maquina, xpt) {
    const u = (_macAtivoDe(macro, maquina, xpt) || {}).ultimo;
    if (!u) return `<span class="mac-agenda-mudo">nenhuma registrada neste Chrome</span>`;
    const txt = { ok: "Concluída", aviso: "Terminou com aviso", erro: "Falhou", parado: "Parada", interrompido: "Interrompida" }[u.estado] || u.estado;
    return `<span class="${u.estado === "erro" ? "macd-erro" : ""}"><b>${txt}</b>${u.terminou_ha_s !== null && u.terminou_ha_s !== undefined ? ` ${_macEsc(_macHa(u.terminou_ha_s))}` : ""}</span>`
        + (u.passo ? `<div class="macd-nota">${_macEsc(u.passo)}</div>` : "");
}

function _macChromeHtml(maquina, xpt) {
    if (_macChromeOnline(maquina, xpt)) return `<span class="mac-vigia mac-vigia-on"><span class="mac-cmd-ponto"></span>conectado</span>`;
    return `<span class="mac-vigia mac-vigia-off"><span class="mac-cmd-ponto"></span>fechado ou sem a extensão</span>`;
}

function _macVivoHtml(item) {
    if (item.tipo === "pendente") return `<div class="macd-bloco"><div class="mac-ag-vazio">Ainda não integrado. Quando estiver pronto, ele se configura por aqui.</div></div>`;
    if (item.tipo === "aviso") return item.m ? _macVivoAvisoHtml(item, item.m)
        : `<div class="macd-bloco"><div class="mac-ag-vazio">Indisponível no momento — o servidor não respondeu sobre este macro.</div></div>`;
    if (item.tipo === "novo") return _macVivoNovoHtml(item);
    if (item.tipo === "colcfg") return _macVivoColCfgHtml(item);
    if (item.tipo === "inst" || item.tipo === "ped") return _macVivoSpxHtml(item);
    if (item.tipo === "col") return _macVivoSessaoHtml(item);
    return "";
}

// Uma instância de relatório (ou o Pedidos que segue uma AT): situação + botões + rodando agora.
function _macVivoSpxHtml(item) {
    const { qual, maquina, xpt } = item;
    const rodando = _macAbaRodando(qual, maquina, xpt);
    const cmd = _macComandoDe(qual, maquina, xpt);
    const ocupado = _macOcupado(cmd);
    const ativo = item.tipo === "inst" ? item.inst.ativo : item.at.ativo;
    const prox = _macProximaTexto(_macAtivoDe(qual, maquina, xpt));
    const m = _macDadoSpx(qual);
    const esc = s => _macEsc(s);
    const arg = `'${esc(qual)}','${esc(maquina)}','${esc(xpt)}'`;

    const botoes = [];
    if (item.tipo === "inst") {
        botoes.push(ativo
            ? `<button type="button" class="macd-acao" onclick="_macInstAtivo('${esc(item.inst.id)}', false, this)">Pausar</button>`
            : `<button type="button" class="macd-acao macd-acao-forte" onclick="_macInstAtivo('${esc(item.inst.id)}', true, this)">Iniciar</button>`);
    }
    botoes.push(rodando
        ? `<button type="button" class="macd-acao" ${ocupado ? "disabled" : ""} onclick="_macRodarChrome(${arg}, true, this)">Reiniciar</button>`
        : `<button type="button" class="macd-acao" ${ocupado ? "disabled" : ""} onclick="_macRodarChrome(${arg}, false, this)">Rodar agora</button>`);
    if (rodando) botoes.push(`<button type="button" class="macd-acao" onclick="_macPararChrome(${arg}, this)">Parar</button>`);
    if (item.tipo === "inst") botoes.push(`<button type="button" class="macd-acao macd-acao-perigo" onclick="_macCancelarInstancia('${esc(item.inst.id)}', this)">Cancelar instância</button>`);

    return `
        <div class="macd-grade">
            ${_macCampoHtml("Situação", rodando ? `<b>Rodando agora</b>` : ativo ? (item.tipo === "ped" ? "Ligado (segue a AT)" : "Ligada") : "Pausada",
                item.tipo === "ped" ? "Liga e pausa junto da AT deste Chrome." : (item.inst ? _macEsc(item.inst.resumo) : ""))}
            ${_macCampoHtml("Próxima rodada", prox ? esc(prox) : `<span class="mac-agenda-mudo">${rodando ? "depois desta" : ativo ? "aguardando o Chrome contar" : "pausada"}</span>`, "")}
            ${_macCampoHtml("Chrome", _macChromeHtml(maquina, xpt), `O ${esc(xpt)} em ${esc(maquina)}. Ele confere a estação embaixo da logo antes de rodar.`)}
            ${_macCampoHtml("Última rodada", _macUltimaHtml(qual, maquina, xpt),
                m && m.ultima_carga ? `Última carga no sistema (todos os polos): ${esc(_macCargaTexto(m.ultima_carga))}` : "")}
        </div>
        <div class="macd-acoes">${botoes.join("")}
            ${cmd ? `<div class="macd-situacao">${_macPedidoHtml(cmd)}</div>` : ""}
        </div>
        ${_macGeral ? _macGeralHtml() : ""}
        ${_macRodandoAgoraHtml(qual, maquina, xpt)}`;
}

// O último pedido daquele Chrome, numa linha (aguardando, iniciado, falhou...).
function _macPedidoHtml(cmd) {
    const relevante = _macOcupado(cmd) || ["erro", "expirado", "sem_confirmacao"].includes(cmd.estado)
        || (cmd.estado === "iniciado" && cmd.idade_s < 180);
    if (!relevante) return "";
    const c = _macComandoTexto(cmd, _macVigia);
    return `<div class="mac-sit mac-sit-${c.tom}"><span class="mac-cmd-ponto"></span><span>${_macEsc(c.texto)}</span></div>`;
}

// Os computadores que dá pra escolher: os que o vigia viu + os das instâncias.
function _macComputadoresConhecidos() {
    const nomes = [];
    const soma = n => { if (n && !nomes.some(x => _macMesmoPc(x, n))) nomes.push(n); };
    ((_macVigia && _macVigia.maquinas) || []).forEach(m => soma(m.nome));
    ((_macAtividade && _macAtividade.maquinas) || []).forEach(m => soma(m.nome));
    _macInstancias.forEach(i => soma(i.maquina));
    return nomes;
}

// Nova instância: computador + polo (só as combinações que ainda não existem), e o horário.
function _macVivoNovoHtml(item) {
    const qual = item.qual;
    if (!_macNova || _macNova.qual !== qual) _macNova = { qual, maquina: "", xpt: "", ativo: true };
    const n = _macNova;
    const nomes = _macComputadoresConhecidos();
    const existe = (maq, xpt) => _macInstancias.some(i => i.qual === qual && _macMesmoPc(i.maquina, maq) && i.xpt === xpt);
    const pcs = [`<option value="">Escolha…</option>`].concat(nomes.map(nome => {
        const online = ((_macAtividade && _macAtividade.maquinas) || []).some(m => m.online && _macMesmoPc(m.nome, nome));
        return `<option value="${_macEsc(nome)}"${_macMesmoPc(nome, n.maquina) ? " selected" : ""}>${_macEsc(nome)}${online ? "" : " — desconectado"}</option>`;
    }));
    const polos = [`<option value="">Escolha…</option>`].concat(_MAC_XPTS.map(p => {
        const usado = n.maquina && existe(n.maquina, p.xpt);
        return `<option value="${p.xpt}"${p.xpt === n.xpt ? " selected" : ""}${usado ? " disabled" : ""}>${p.xpt} · ${p.polo}${usado ? " — já existe" : ""}</option>`;
    }));
    const chromes = ((_macAtividade && _macAtividade.maquinas) || []).filter(m => m.online && m.xpt);
    return `<div class="macd-grade">
            ${_macCampoHtml("Computador", `<select class="mac-select" onchange="_macNovaCampo('maquina', this.value)">${pcs.join("")}</select>`, "Os que já falaram com o sistema.")}
            ${_macCampoHtml("Polo (XPT)", `<select class="mac-select" onchange="_macNovaCampo('xpt', this.value)">${polos.join("")}</select>`,
                "Roda só no Chrome logado nessa estação, nesse computador.")}
            ${_macCampoHtml("Chromes conectados agora", chromes.length
                ? chromes.map(c => `${_macEsc(c.nome)} · ${_macEsc(c.xpt)}`).join("<br>") : `<span class="mac-agenda-mudo">nenhum contou o polo ainda</span>`, "")}
        </div>
        <label class="mac-col-check" style="margin:12px 0 0"><input type="checkbox" ${n.ativo ? "checked" : ""} onchange="_macNovaCampo('ativo', this.checked)"> Já começar ligada</label>`;
}

function _macNovaCampo(campo, valor) {
    _macNova[campo] = valor;
    if (campo === "maquina") {
        const existe = x => _macInstancias.some(i => i.qual === _macNova.qual && _macMesmoPc(i.maquina, valor) && i.xpt === x);
        if (_macNova.xpt && existe(_macNova.xpt)) _macNova.xpt = "";
    }
    if (campo !== "ativo") _macRedesenharVivo();
}

// Colador: configuração das sessões + abrir sessão nova.
function _macVivoColCfgHtml(item) {
    const c = _macColadores.find(x => x.qual === item.qual);
    if (!c) return "";
    if (!_macNova || _macNova.qual !== c.qual) _macNova = { qual: c.qual, maquina: "", xpt: "" };
    const n = _macNova;
    const nomes = _macComputadoresConhecidos();
    const pcs = [`<option value="">Escolha…</option>`].concat(nomes.map(nome =>
        `<option value="${_macEsc(nome)}"${_macMesmoPc(nome, n.maquina) ? " selected" : ""}>${_macEsc(nome)}</option>`));
    const polos = [`<option value="">Escolha…</option>`].concat(_MAC_XPTS.map(p =>
        `<option value="${p.xpt}"${p.xpt === n.xpt ? " selected" : ""}>${p.xpt} · ${p.polo}</option>`));
    const pronto = n.maquina && n.xpt;
    return `<div class="macd-bloco" style="margin-top:0;border-top:none">
            <div class="macd-rotulo">Abrir sessão</div>
            <div class="macd-grade" style="padding-top:6px">
                ${_macCampoHtml("Computador", `<select class="mac-select" onchange="_macNovaCampo('maquina', this.value)">${pcs.join("")}</select>`, "")}
                ${_macCampoHtml("Polo (XPT)", `<select class="mac-select" onchange="_macNovaCampo('xpt', this.value)">${polos.join("")}</select>`,
                    "O Chrome desse computador logado nessa estação.")}
                ${c.recebidos_hoje !== undefined && c.recebidos_hoje !== null ? _macCampoHtml("Hoje", `${_macEsc(c.recebidos_hoje)} recebido(s) no SPX`, "") : ""}
            </div>
            <div class="macd-acoes"><button type="button" class="macd-acao macd-acao-forte" ${pronto ? "" : "disabled"}
                onclick="_macAbrirSessao('${_macEsc(c.qual)}', this)">Iniciar sessão</button></div>
        </div>`;
}

// Uma sessão do Colador num Chrome.
function _macVivoSessaoHtml(item) {
    const { qual, maquina, xpt } = item;
    const rodando = _macAbaRodando(qual, maquina, xpt);
    const cmd = (item.col.comandos || []).find(c => _macMesmoPc(c.alvo, maquina) && ((c.config && c.config.xpt) || null) === xpt);
    const ocupado = cmd && _macOcupado(cmd);
    const esc = s => _macEsc(s);
    const arg = `'${esc(qual)}','${esc(maquina)}','${esc(xpt || "")}'`;
    const ligada = _macSessaoLigada(item);
    const botoes = [];
    if (rodando || ligada) {
        if (rodando) botoes.push(`<button type="button" class="macd-acao" ${ocupado ? "disabled" : ""} onclick="_macSessaoRodar(${arg}, true, this)">Reiniciar</button>`);
        botoes.push(`<button type="button" class="macd-acao" onclick="_macSessaoParar(${arg}, this)">Parar</button>`);
    } else {
        botoes.push(`<button type="button" class="macd-acao macd-acao-forte" ${ocupado ? "disabled" : ""} onclick="_macSessaoRodar(${arg}, false, this)">Iniciar</button>`);
    }
    // Ligada = fica rodando sempre: se cair (F5, Chrome fechado, erro), o Chrome desse polo abre de novo.
    const situacao = rodando ? "<b>Rodando agora</b>"
        : ligada ? `<b>Ligada</b><div class="macd-nota">${_macChromeOnline(maquina, xpt) ? "o Chrome desse polo abre em até 1 min" : "abre quando o Chrome desse polo conectar"}</div>`
        : "Parada";
    return `<div class="macd-grade">
            ${_macCampoHtml("Situação", situacao, rodando || ligada ? "Fica rodando até você parar — se cair, volta sozinha." : "")}
            ${_macCampoHtml("Chrome", xpt ? _macChromeHtml(maquina, xpt) : "—", "")}
            ${_macCampoHtml("Última sessão", _macUltimaHtml(qual, maquina, xpt), "")}
        </div>
        <div class="macd-acoes">${botoes.join("")}
            ${cmd ? `<div class="macd-situacao">${(c => `<div class="mac-sit mac-sit-${c.tom}"><span class="mac-cmd-ponto"></span><span>${_macEsc(c.texto)}</span>${ocupado
                ? `<button type="button" class="mac-sit-acao" onclick="_macCancelarColador('${esc(qual)}', '${esc(cmd.id)}', this)">cancelar</button>` : ""}</div>`)(_macComandoColadorTexto(cmd))}</div>` : ""}
        </div>
        ${_macRodandoAgoraHtml(qual, maquina, xpt)}`;
}

function _macVivoAvisoHtml(item, m) {
    return `<div class="macd-grade">
        ${_macCampoHtml("Executar em", "No servidor", "Não depende de computador nem do Chrome ligado.")}
        ${_macCampoHtml("Polo (XPT)", item.xpt ? `<b>${_macEsc(item.xpt)}</b> · ${_macEsc(_macPoloDoXpt(item.xpt))}` : "—",
            "Só entregadores deste polo recebem o aviso.")}
    </div>`;
}

// ── os formulários (mesmos ids de antes, agora no painel) ──
function _macHtmlFormAgenda(textoBotao) {
    return `
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
                <span class="mac-ag-recolhido" id="mac-ag-recolhido"></span>
            </div>
            <div id="mac-ag-horarios-corpo">
                <div id="mac-ag-horarios"></div>
                <button type="button" class="mac-adicionar" onclick="_macAdicionarHorario()">+ Adicionar horário</button>
            </div>
        </div>
        <div class="macd-salvar"><div class="usr-modal-error" id="mac-ag-erro"></div>
            <button class="usr-modal-btn-primary" id="mac-ag-salvar" onclick="_macSalvarAgenda()">${textoBotao}</button></div>`;
}

function _macConfigHtml(item) {
    if (item.tipo === "inst") return `<div class="macd-bloco"><div class="macd-rotulo">Horário</div>${_macHtmlFormAgenda("Salvar horário")}</div>`;
    if (item.tipo === "novo") return `<div class="macd-bloco"><div class="macd-rotulo">Horário</div>${_macHtmlFormAgenda("Criar instância")}</div>`;
    if (item.tipo === "colcfg") {
        return `<div class="macd-bloco">
            <div class="macd-rotulo">Configuração das sessões</div>
            <div class="macd-nota" style="margin-bottom:12px">Vale a partir da próxima sessão — não muda uma já em andamento.</div>
            <div class="macd-nota" style="margin-bottom:12px">O polo é o de cada sessão (escolhido em "Abrir sessão": XPT_CFC só Caçador, XPT_VIA só Videira) e o dia é sempre o de hoje.</div>
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
    if (item.tipo === "aviso" && item.m) {
        return `<div class="macd-bloco">
            <div class="macd-rotulo">Rodadas</div>
            <div class="macd-nota" style="margin-bottom:12px">Em cada horário, o sistema avisa quem se encaixa no critério escolhido.</div>
            <div id="mac-rodadas-lista"><div class="mac-ag-vazio">Carregando...</div></div>
            <button type="button" class="mac-adicionar" onclick="_macAdicionarRodada()">+ Adicionar rodada</button>
            <div class="macd-salvar"><div class="usr-modal-error" id="mac-editar-erro"></div>
                <button class="usr-modal-btn-primary" id="mac-editar-salvar" onclick="_macSalvar()">Salvar rodadas</button></div>
        </div>`;
    }
    return "";
}

function _macPrepararConfig(item) {
    if (item.tipo === "inst") _macAbrirAgenda(item.qual, item.inst.agenda, item.inst.id);
    else if (item.tipo === "novo") _macAbrirAgenda(item.qual, null, null);
    else if (item.tipo === "colcfg") _macAbrirConfigurarColador(item.qual);
    else if (item.tipo === "aviso" && item.m) _macAbrirConfigurar(item.chave);
}

function _macMostrarSalvo(idErro, texto) {
    const el = document.getElementById(idErro);
    if (!el) return;
    el.innerHTML = `<span class="macd-salvo">${_macEsc(texto || "Salvo.")}</span>`;
    setTimeout(() => { if (el.innerHTML.includes("macd-salvo")) el.innerHTML = ""; }, 4000);
}

// O histórico recente do macro, só do computador aberto (quando há um).
function _macCarregarHistoricoDoMacro(item) {
    const chave = `${item.qual}|${item.maquina || ""}`;
    _macHistMacro = { chave, eventos: null };
    fetch(`${API}/admin/macros/spx/historico?limite=40&macro=${encodeURIComponent(item.qual)}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (_macHistMacro.chave !== chave) return;
            const eventos = (d.eventos || []).filter(e => !item.maquina || !e.maquina || _macMesmoPc(e.maquina, item.maquina)).slice(0, 12);
            _macHistMacro.eventos = eventos;
            const el = document.getElementById("macd-hist");
            if (el) el.innerHTML = d.error ? `<div class="mac-ag-vazio">${_macEsc(d.error)}</div>` : _macHistoricoHtml(eventos);
        })
        .catch(() => {
            const el = document.getElementById("macd-hist");
            if (el) el.innerHTML = `<div class="mac-ag-vazio">Erro ao conectar com o servidor.</div>`;
        });
}

// A atividade das abas, de 5 em 5s enquanto a tela está aberta (só memória no servidor). Só
// redesenha quando algo mudou — e nunca o formulário.
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

// ── ações das instâncias e dos Chromes ──
function _macPedir(metodo, caminho, corpo) {
    return fetch(`${API}${caminho}`, {
        method: metodo,
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
    }).then(r => r.json().then(d => ({ ok: r.ok, status: r.status, d })));
}

// Iniciar/Pausar: liga ou desliga o horário daquela instância (pausar também para o que roda).
function _macInstAtivo(id, ativo, botao) {
    if (botao) botao.disabled = true;
    _macPedir("PUT", `/admin/macros/spx/instancias/${encodeURIComponent(id)}`, { ativo })
        .then(({ ok, d }) => {
            if (!ok) { if (botao) botao.disabled = false; gcAlert(d.error || "Não foi possível mudar."); return; }
            const i = _macInstancias.find(x => x.id === id);
            if (i) Object.assign(i, d.instancia);
            _macRedesenhar();
        })
        .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}

function _macCancelarInstancia(id, botao) {
    const i = _macInstancias.find(x => x.id === id);
    if (!i) return;
    gcConfirm(`Cancelar ${_macEsc(_macNomeSpx(i.qual))} em ${_macEsc(i.maquina)} · ${_macEsc(i.xpt)}?\n\nO horário dela some e o que estiver rodando nesse Chrome para.`,
        () => {
            if (botao) botao.disabled = true;
            _macPedir("DELETE", `/admin/macros/spx/instancias/${encodeURIComponent(id)}`)
                .then(({ ok, d }) => {
                    if (!ok) { if (botao) botao.disabled = false; gcAlert(d.error || "Não foi possível cancelar."); return; }
                    _macInstancias = _macInstancias.filter(x => x.id !== id);
                    _macSelecionado = `novo:${i.qual}`;
                    _macRedesenhar();
                    _macMontarDetalhe();
                })
                .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
        }, "Cancelar instância", "Cancelar instância");
}

// Rodar agora / Reiniciar num Chrome (computador + polo).
function _macRodarChrome(qual, maquina, xpt, reiniciar, botao) {
    if (botao) botao.disabled = true;
    _macPedir("POST", `/admin/macros/spx/${qual}/rodar`, { maquina, xpt, reiniciar: !!reiniciar })
        .then(({ ok, status, d }) => {
            if (ok || (status === 409 && d.comando)) {
                const m = _macDadoSpx(qual);
                if (m) {
                    m.comandos = (m.comandos || []).filter(c => !(_macMesmoPc(c.alvo, maquina) && ((c.config && c.config.xpt) || null) === xpt));
                    m.comandos.unshift(d.comando);
                }
                if (d.vigia) _macVigia = d.vigia;
                if (!ok) gcAlert(d.error);
                else if (reiniciar) gcAlert("Pedido de parar enviado. Ele roda de novo em cerca de 1 minuto.", "Reiniciar");
                _macRedesenhar();
                _macAcompanhar();
                return;
            }
            if (botao) botao.disabled = false;
            gcAlert(d.error || "Não foi possível pedir.");
        })
        .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}

function _macPararChrome(qual, maquina, xpt, botao) {
    if (botao) botao.disabled = true;
    _macPedir("POST", `/admin/macros/spx/${qual}/parar`, { maquina, xpt })
        .then(({ ok, d }) => {
            if (!ok) { if (botao) botao.disabled = false; gcAlert(d.error || "Não foi possível pedir pra parar."); return; }
            gcAlert("Pedido de parar enviado — o Chrome atende em até 30 segundos.", "Parar");
        })
        .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}

// Colador: abrir/reiniciar/parar a sessão de um Chrome.
function _macSessaoRodar(qual, maquina, xpt, reiniciar, botao) {
    const item = _macColadores.find(c => c.qual === qual);
    if (!item) return;
    if (botao) botao.disabled = true;
    _macPedir("POST", `/admin/macros/colador/${qual}/rodar`, { maquina, xpt: xpt || null, reiniciar: !!reiniciar })
        .then(({ ok, d }) => {
            if (!ok) { if (botao) botao.disabled = false; gcAlert(d.error || "Não foi possível pedir."); return; }
            if (d.sessao) {
                item.sessoes = (item.sessoes || []).filter(s => !(_macMesmoPc(s.maquina, d.sessao.maquina) && s.xpt === d.sessao.xpt)).concat([d.sessao]);
            } else if (d.comando) {
                _macMergeComandoColador(item, Object.assign({ idade_s: 0 }, d.comando));
            }
            if (!d.algum_conectado) gcAlert(`Sessão ligada, mas ${maquina} não está com o Chrome/XM Vigia conectado agora — começa assim que abrir.`);
            else if (reiniciar) gcAlert("Pedido de parar enviado. A sessão abre de novo em cerca de 1 minuto.", "Reiniciar");
            _macRedesenhar();
            _macAcompanharColador();
        })
        .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}

function _macSessaoParar(qual, maquina, xpt, botao) {
    if (botao) botao.disabled = true;
    _macPedir("POST", `/admin/macros/colador/${qual}/parar`, { maquina, xpt: xpt || null })
        .then(({ ok, d }) => {
            if (!ok) { if (botao) botao.disabled = false; gcAlert(d.error || "Não foi possível pedir pra parar."); return; }
            const item = _macColadores.find(c => c.qual === qual);
            if (item) item.sessoes = (item.sessoes || []).filter(s => !(_macMesmoPc(s.maquina, maquina) && s.xpt === (xpt || null)));
            _macRedesenhar();
            gcAlert("Sessão desligada — o Chrome para em até 30 segundos e não abre de novo.", "Parar");
        })
        .catch(() => { if (botao) botao.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}

function _macAbrirSessao(qual, botao) {
    const n = _macNova;
    if (!n || !n.maquina || !n.xpt) return;
    _macSelecionado = `col:${qual}|${n.maquina}|${n.xpt}`;
    _macSessaoRodar(qual, n.maquina, n.xpt, false, botao);
}

// Pergunta o andamento de poucos em poucos segundos (só memória no servidor) enquanto houver
// pedido em andamento - e para sozinho quando não há mais, ou depois de 12 minutos.
function _macAcompanhar() {
    if (_macPoll) return;
    const inicio = Date.now();
    const passo = () => {
        const tela = document.getElementById("tela-macros");
        const visivel = !!tela && tela.classList.contains("active-view");
        const andando = _macLista.some(m => m.qual && (m.comandos || []).some(_macOcupado));
        if (!visivel || !andando || Date.now() - inicio > 12 * 60 * 1000) { _macPoll = null; return; }
        fetch(`${API}/admin/macros/spx/estado`, { headers: { "Authorization": "Bearer " + token } })
            .then(r => r.json())
            .then(d => {
                if (!d || !d.comandos) return;
                _macLista.forEach(m => { if (m.qual && d.comandos[m.qual]) m.comandos = d.comandos[m.qual]; });
                if (d.vigia) _macVigia = d.vigia;
                _macRedesenhar();
            })
            .catch(() => { /* tenta de novo */ })
            .finally(() => { _macPoll = setTimeout(passo, 3000); });
    };
    _macPoll = setTimeout(passo, 3000);
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

    const rota = _macRotaDaChave(chave);
    fetch(`${API}/admin/macros/${rota}/ativo`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novo })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (ok) return;
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

// O formulário de horário de uma instância (agenda dela) ou de uma nova (agenda padrão).
function _macAbrirAgenda(qual, agenda, instId) {
    const m = _macDadoSpx(qual);
    const ag = agenda || { modo: "intervalo", minutos: qual === "backlog" ? 60 : 30, horarios: [] };
    _macAgenda = {
        qual, instId,
        modo: ag.modo === "horarios" ? "horarios" : "intervalo",
        minutos: ag.minutos,
        minimo: (m && m.minutos_minimo) || 20,
        horarios: (ag.horarios || []).map(h => ({ hora: h.hora, minuto: h.minuto })),
        verHorarios: ag.modo === "horarios",
    };
    _macFonte = "agenda";
    const erro = document.getElementById("mac-ag-erro");
    if (erro) erro.innerText = "";
    _macRenderizarAgenda();
}

// "Todo dia, nestes horários" fica recolhido quando o que vale é o intervalo — abre ao escolher.
function _macVerHorarios() {
    _macAgenda.verHorarios = true;
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

    const aberto = !porIntervalo || a.verHorarios;
    const corpo = document.getElementById("mac-ag-horarios-corpo");
    if (corpo) corpo.style.display = aberto ? "" : "none";
    const recolhido = document.getElementById("mac-ag-recolhido");
    if (recolhido) {
        recolhido.innerHTML = aberto ? ""
            : `<button type="button" class="mac-link" onclick="_macVerHorarios()">${a.horarios.length
                ? `${a.horarios.length} horário${a.horarios.length > 1 ? "s" : ""} guardado${a.horarios.length > 1 ? "s" : ""} · mostrar` : "mostrar"}</button>`;
    }
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
    if (_macAgenda.modo === "horarios") _macAgenda.verHorarios = true;
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

// ── Histórico: o que aconteceu, de todos os macros ou de um ──
// Cada linha é um evento contado pelo vigia ou pela extensão, com o computador de onde veio.
const _MAC_NOME_CURTO = { alimentacao: "AT", pedidos: "Pedidos", backlog: "Backlog", recebimento: "Colador Recebimento", at_cluster: "Colador AT Cluster", criar_at: "Criar AT", geral: "Geral" };
const _MAC_ORIGEM = { vigia: "vigia", extensao: "extensão" };

// Salvar o horário: atualiza a instância aberta, ou cria a nova (com computador e polo escolhidos).
function _macSalvarAgenda() {
    const erro = document.getElementById("mac-ag-erro");
    erro.innerText = "";
    const r = _macMontarAgenda(_macAgenda);
    if (r.erro) { erro.innerText = r.erro; return; }
    const criando = !_macAgenda.instId;
    if (criando && (!_macNova || !_macNova.maquina || !_macNova.xpt)) {
        erro.innerText = "Escolha o computador e o polo.";
        return;
    }
    const btn = document.getElementById("mac-ag-salvar");
    const rotulo = criando ? "Criar instância" : "Salvar horário";
    btn.disabled = true;
    btn.textContent = "Salvando...";
    const pedido = criando
        ? _macPedir("POST", "/admin/macros/spx/instancias",
            { qual: _macAgenda.qual, maquina: _macNova.maquina, xpt: _macNova.xpt, ativo: _macNova.ativo !== false, agenda: r.agenda })
        : _macPedir("PUT", `/admin/macros/spx/instancias/${encodeURIComponent(_macAgenda.instId)}`, { agenda: r.agenda });
    pedido
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = rotulo;
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            if (criando) {
                _macInstancias.push(d.instancia);
                _macNova = null;
                _macSelecionado = `inst:${d.instancia.id}`;
                try { localStorage.setItem(_MAC_CHAVE_SELECIONADO, _macSelecionado); } catch (e) { /* sem storage */ }
                _macRedesenhar();
                _macMontarDetalhe();
                _macMostrarSalvo("mac-ag-erro", "Instância criada.");
                return;
            }
            const i = _macInstancias.find(x => x.id === _macAgenda.instId);
            if (i) Object.assign(i, d.instancia);
            _macMostrarSalvo("mac-ag-erro");
            _macRedesenhar();
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = rotulo;
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}

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
// Sem horário: o Colador é uma SESSÃO que se abre e fecha (ou fica de vigia, modo contínuo) num
// Chrome — computador + polo. Cada sessão é uma linha na lista (ver _macLinhasDoColador); dá pra
// rodar em Caçador e Videira ao mesmo tempo (a reserva de lote no backend garante que dois
// coladores nunca pegam o mesmo código; quem evita colar o polo errado é a extensão, lendo a
// estação da própria página do SPX). Única parte de Macros que admin também acessa.

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

// Substitui, dentro de item.comandos, o que já existia pra ESSE alvo (mesma máquina) - ou
// acrescenta, se for a primeira vez que essa máquina pede este qual. Assim o Rodar pra uma
// segunda máquina não apaga a situação da primeira, que continua rodando em paralelo.
function _macMergeComandoColador(item, cmd) {
    if (!Array.isArray(item.comandos)) item.comandos = [];
    const chave = (cmd.alvo || "").toLowerCase();
    const i = item.comandos.findIndex(c => (c.alvo || "").toLowerCase() === chave);
    if (i >= 0) item.comandos[i] = cmd; else item.comandos.push(cmd);
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
    document.getElementById("mac-col-carencia").value = c.carencia;
    document.getElementById("mac-col-lote").value = c.lote;
    document.getElementById("mac-col-intervalo").value = c.intervalo;
    document.getElementById("mac-col-intervalo-rotulo").innerText = c.intervalo.toFixed(1) + "s";
    document.getElementById("mac-col-continuo").checked = c.continuo !== false;
}

function _macColMudarCampo(campo, valor) {
    _macColadorEditando[campo] = valor;
}
function _macColMudarIntervalo(valor) {
    _macColadorEditando.intervalo = Number(valor);
    document.getElementById("mac-col-intervalo-rotulo").innerText = Number(valor).toFixed(1) + "s";
}

// Mesmas regras do servidor (colador.js) — só pra a mensagem aparecer na hora; o servidor
// confere de novo. Dia é sempre o de hoje e o polo é de cada sessão (20/10/2026): a config não
// guarda nenhum dos dois.
function _macMontarConfigColador(c) {
    const carencia = Number(c.carencia);
    if (!Number.isInteger(carencia) || carencia < 0 || carencia > 3600) return { erro: "Carência tem que ser de 0 a 3600 segundos." };
    const lote = Number(c.lote);
    if (!Number.isInteger(lote) || lote < 1 || lote > 500) return { erro: "Códigos por lote tem que ser de 1 a 500." };
    const intervalo = Number(c.intervalo);
    if (!Number.isFinite(intervalo) || intervalo < 0 || intervalo > 1.5) return { erro: "Intervalo tem que ser de 0 a 1,5 segundos." };
    return {
        config: {
            todos_dias: true, dia: null, xpt: "", carencia, lote, intervalo: Math.round(intervalo * 10) / 10,
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
