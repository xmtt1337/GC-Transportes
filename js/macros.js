// ───── MACROS (SÓ DEV) ─────
// Tarefas que o sistema roda sozinho, em seções (ver _MAC_SECOES). Dois tipos:
//   - o aviso de rota incompleta da Shopee XPT_CFC (modules/avisos-entregador), que roda no
//     servidor e se configura por rodadas (critério + horário);
//   - os macros do SPX (AT Exportada, Pedidos Pesquisados, Backlog — modules/macros-comando),
//     que rodam no Chrome do galpão: dá pra pedir "Rodar agora" e configurar o horário
//     (a cada N minutos ou em horários fixos).
// Item sem `chave` é um que ainda vai ser integrado: fica na lista, apagado.
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
    ])
        .then(([d, spx, colador]) => {
            const doSpx = spx && Array.isArray(spx.macros) ? spx.macros : [];
            _macLista = ((d && d.macros) || []).concat(doSpx);
            _macVigia = spx && spx.vigia ? spx.vigia : null;
            _macGeral = spx && spx.geral ? spx.geral : null;
            _macComputador = spx && spx.computador ? spx.computador : null;
            _macColadores = colador && Array.isArray(colador.coladores) ? colador.coladores : [];
            empty.style.display = "none";
            _macRedesenhar();
            _macAcompanhar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

// Avisos + macros do SPX: só dev (o resto de Macros continua como sempre foi). O Colador
// aparece pros dois — é a única parte que o admin acessa.
function _macRedesenhar() {
    const lista = document.getElementById("mac-lista");
    const role = window._gcUser && window._gcUser.role;
    const doDev = role === "dev" ? _macHtmlSecoes(_macLista) : "";
    if (lista) lista.innerHTML = doDev + _macHtmlSecaoColador(_macColadores);
}

// ── Como a tela se organiza ──
// A arrumação é daqui do front: o servidor só manda os macros que JÁ funcionam (por chave), e
// cada um cai no lugar dele. Item sem `chave` é um que ainda vai ser integrado — aparece na
// lista, apagado, sem "Configurar", só pra ficar marcado onde ele vai morar.
const _MAC_SECOES = [
    {
        titulo: "Avisos de rota incompleta",
        texto: "Mensagem no WhatsApp pro entregador quando a rota ainda não fechou.",
        grupos: [{
            itens: [
                { nome: "Shopee XPT_CFC", detalhe: "Caçador · WhatsApp oficial (WABA)", chave: "avisos_entregador" },
                { nome: "Shopee XPT_VIA", detalhe: "Videira" },
            ],
        }],
    },
    {
        titulo: "Macros",
        texto: "Rotinas do sistema da Shopee, executadas no computador com o Chrome e o XM Vigia.",
        vigia: true,
        grupos: [{
            itens: [
                { nome: "Alimentar AT exportada", detalhe: "Exporta e baixa a AT do dia", chave: "spx_alimentacao" },
                { nome: "Pedidos pesquisados", detalhe: "Pesquisa em lote os pedidos novos da AT", chave: "spx_pedidos" },
                { nome: "Backlog", detalhe: "Baixa o backlog do hub", chave: "spx_backlog" },
            ],
        }],
    },
];

// Explicação de cada macro do SPX no modal de horário.
const _MAC_DICAS_SPX = {
    alimentacao: "Depois de cada AT, o Pedidos Pesquisados roda sozinho.",
    backlog: "Cada rodada grava o retrato inteiro do backlog — quanto mais seguido, mais o banco cresce.",
};

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

const _macEngrenagemSvg = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;

// A linha de um macro do SPX: nome + uma linha de "quando roda · última carga" à esquerda, os
// controles agrupados à direita (interruptor, Rodar, horário) e, só se houver algo a dizer, uma
// linha de situação embaixo. A explicação do macro vai no tooltip do nome, não na tela.
function _macHtmlItemSpx(item, m) {
    const semAgendaDoSistema = m.agendavel && !m.configurado;
    const carga = m.ultima_carga
        ? `Última carga ${_macEsc(_macCargaTexto(m.ultima_carga))}`
        : "Nenhuma carga ainda";

    // O interruptor só existe quando a agenda já foi configurada por aqui; antes disso o
    // macro segue a agenda do popup da extensão e não há o que ligar ou desligar. Onde falta
    // interruptor ou engrenagem fica um espaço do mesmo tamanho: o Rodar tem que cair no
    // mesmo lugar em todas as linhas.
    const toggle = m.agendavel && m.configurado
        ? `<button type="button" class="gc-toggle mac-toggle${m.ativo ? " gc-toggle--on" : ""}" role="switch" aria-checked="${m.ativo ? "true" : "false"}"
                   title="${m.ativo ? "Desligar o horário" : "Ligar o horário"}" onclick="_macAlternarAtivo('${_macEsc(m.chave)}', this)"><span class="gc-toggle__knob"></span></button>`
        : `<span class="mac-slot mac-slot-toggle"></span>`;
    const horario = m.agendavel
        ? `<button type="button" class="mac-icone" title="Horário" aria-label="Configurar o horário — ${_macEsc(item.nome)}"
                   onclick="_macAbrirConfigurarSpx('${_macEsc(m.qual)}')">${_macEngrenagemSvg}</button>`
        : `<span class="mac-slot mac-slot-icone"></span>`;

    return `
        <div class="mac-item mac-item-spx">
            <div class="mac-spx-texto">
                <div class="mac-item-nome" title="${_macEsc(item.detalhe || "")}">${_macEsc(item.nome)}</div>
                <div class="mac-spx-meta"><span class="mac-agenda-resumo${semAgendaDoSistema ? " mac-agenda-mudo" : ""}">${_macEsc(m.resumo)}</span> · ${carga}</div>
                ${_macSituacaoHtml(m)}
            </div>
            <div class="mac-spx-controles">
                ${toggle}
                <button type="button" class="mac-rodar" title="${_macEsc(_macComputador ? `Rodar agora em ${_macComputador}` : "Rodar agora")}"
                        ${_macOcupado(m.comando) ? "disabled" : ""} onclick="_macRodar('${_macEsc(m.qual)}', this)">▶ Rodar</button>
                ${horario}
            </div>
        </div>`;
}

function _macHtmlItem(item, m) {
    if (m && m.qual) return _macHtmlItemSpx(item, m);

    const nome = `<div class="mac-item-nome">${_macEsc(item.nome)}</div>`
        + (item.detalhe ? `<div class="mac-item-detalhe">${_macEsc(item.detalhe)}</div>` : "");

    if (!item.chave || !m) {
        // Ainda não integrado (ou o servidor não mandou esse macro): fica marcado, sem ação.
        const aviso = item.chave ? "Indisponível no momento" : "Ainda não integrado";
        return `
        <div class="mac-item mac-item-pendente">
            <div class="mac-item-id">${nome}</div>
            <div class="mac-item-agenda">${aviso}</div>
            <div class="mac-item-status"></div>
            <div class="mac-item-acao"></div>
        </div>`;
    }
    return `
        <div class="mac-item">
            <div class="mac-item-id">${nome}</div>
            <div class="mac-item-agenda">${_macResumoHtml(m.resumo)}</div>
            <div class="mac-item-status ${m.ativo ? "ligado" : "desligado"}">
                <button type="button" class="gc-toggle mac-toggle${m.ativo ? " gc-toggle--on" : ""}" role="switch" aria-checked="${m.ativo ? "true" : "false"}"
                        title="${m.ativo ? "Desligar" : "Ligar"}" onclick="_macAlternarAtivo('${_macEsc(m.chave)}', this)"><span class="gc-toggle__knob"></span></button>
                <span class="mac-status-texto">${m.ativo ? "Ativo" : "Desligado"}</span>
            </div>
            <div class="mac-item-acao"><button type="button" class="mac-configurar" onclick="_macAbrirConfigurar('${_macEsc(m.chave)}')">Configurar</button></div>
        </div>`;
}

function _macHtmlSecao(secao, porChave) {
    const grupos = secao.grupos.map(g => `
        <div class="mac-grupo">
            ${g.titulo ? `<div class="mac-grupo-titulo">${_macEsc(g.titulo)}</div>` : ""}
            ${g.itens.map(item => _macHtmlItem(item, item.chave && porChave[item.chave])).join("")}
        </div>`).join("");
    const titulo = `<h3 class="mac-secao-titulo">${_macEsc(secao.titulo)}</h3>`;
    // A seção dos macros do SPX leva, na linha do título, quem está ouvindo e o histórico.
    const cabecalho = secao.vigia
        ? `<div class="mac-secao-cab">${titulo}<div class="mac-secao-acoes">${_macVigiaHtml()}`
          + `<button type="button" class="mac-link" onclick="_macAbrirHistorico()">Histórico</button></div></div>`
        : titulo;
    return `
    <section class="mac-secao">
        ${cabecalho}
        ${secao.texto ? `<p class="mac-secao-texto">${_macEsc(secao.texto)}</p>` : ""}
        ${secao.vigia ? _macAvisoComputadorHtml() + _macGeralHtml() : ""}
        <div class="mac-painel">${grupos}</div>
    </section>`;
}

// A tela inteira, a partir da lista do servidor. Macro que o servidor mande e que ainda não
// tenha lugar em _MAC_SECOES não some: cai em "Outros", configurável normalmente.
function _macHtmlSecoes(lista) {
    const porChave = {};
    (lista || []).forEach(m => { porChave[m.chave] = m; });
    const conhecidas = new Set();
    _MAC_SECOES.forEach(s => s.grupos.forEach(g => g.itens.forEach(i => i.chave && conhecidas.add(i.chave))));
    const sobra = (lista || []).filter(m => !conhecidas.has(m.chave));

    const secoes = sobra.length
        ? _MAC_SECOES.concat([{ titulo: "Outros", grupos: [{ itens: sobra.map(m => ({ nome: m.nome, detalhe: m.descricao, chave: m.chave })) }] }])
        : _MAC_SECOES;
    return secoes.map(s => _macHtmlSecao(s, porChave)).join("");
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

// Nome do macro no título do modal: o da tela ("Avisos de rota incompleta — Shopee XPT_CFC"),
// que é como ele aparece na lista; o nome do servidor só se ele não tiver lugar na tela.
function _macTituloModal(chave) {
    for (const s of _MAC_SECOES) {
        for (const g of s.grupos) {
            const item = g.itens.find(i => i.chave === chave);
            if (item) return `${s.titulo} — ${item.nome}`;
        }
    }
    const m = _macLista.find(x => x.chave === chave);
    return (m && m.nome) || "Configurar macro";
}

function _macAbrirConfigurar(chave) {
    _macChaveEditando = chave;
    _macFonte = "rodadas";
    const m = _macLista.find(x => x.chave === chave);
    document.getElementById("mac-editar-titulo").innerText = _macTituloModal(chave);
    document.getElementById("mac-editar-descricao").innerText = (m && m.descricao) || "";
    document.getElementById("mac-editar-erro").innerText = "";

    fetch(`${API}/admin/macros/${_macRotaDaChave(chave)}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) { gcAlert(d.error); return; }
            _macTipos = d.tipos || [];
            _macRodadas = (d.rodadas || []).map(r => Object.assign({}, r));
            document.getElementById("mac-editar-ativo").checked = !!d.ativo;
            _macRenderizarRodadas();
            _abrirModal("modal-macro-editar");
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

    const ativo = document.getElementById("mac-editar-ativo").checked;
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
            btn.textContent = "Salvar";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _fecharModal("modal-macro-editar");
            _macCarregarLista();
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar";
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

    document.getElementById("mac-ag-titulo").innerText = m.nome;
    document.getElementById("mac-ag-descricao").innerText = _MAC_DICAS_SPX[qual] || "";
    document.getElementById("mac-ag-erro").innerText = "";
    // Macro nunca configurado por aqui abre já ligado: quem chegou até o Salvar quer que rode.
    document.getElementById("mac-ag-ativo").checked = m.configurado ? !!m.ativo : true;
    _macRenderizarAgenda();
    _abrirModal("modal-macro-agenda");
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

    fetch(`${API}/admin/macros/spx/${_macAgenda.qual}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: document.getElementById("mac-ag-ativo").checked, agenda: r.agenda })
    })
        .then(res => res.json().then(d => ({ ok: res.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _fecharModal("modal-macro-agenda");
            _macCarregarLista(true);
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}

// ── Histórico: o que aconteceu, de todos os macros ou de um ──
// Cada linha é um evento contado pelo vigia ou pela extensão, com o computador de onde veio.
const _MAC_NOME_CURTO = { alimentacao: "AT", pedidos: "Pedidos", backlog: "Backlog", geral: "Geral" };
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

function _macHtmlItemColador(item) {
    const ocupado = _macColadorConflita(item, _macColadorAlvo[item.qual]);
    return `
        <div class="mac-item mac-item-spx">
            <div class="mac-spx-texto">
                <div class="mac-item-nome" title="${_macEsc(item.detalhe || "")}">${_macEsc(item.nome)}</div>
                <div class="mac-spx-meta">
                    <span class="mac-agenda-resumo${item.configurado ? "" : " mac-agenda-mudo"}">${_macEsc(item.resumo)}</span>
                    · ${_macColadorPresencaHtml(item.computadores)}${_macRecebidosHtml(item)}
                </div>
                ${_macSituacaoColadorHtml(item.qual, item.comandos)}
            </div>
            <div class="mac-spx-controles">
                ${_macHtmlAlvoColador(item)}
                <button type="button" class="mac-rodar" title="Rodar agora" ${ocupado ? "disabled" : ""}
                        onclick="_macRodarColador('${_macEsc(item.qual)}', this)">▶ Rodar</button>
                <button type="button" class="mac-icone" title="Configurar" aria-label="Configurar — ${_macEsc(item.nome)}"
                        onclick="_macAbrirConfigurarColador('${_macEsc(item.qual)}')">${_macEngrenagemSvg}</button>
            </div>
        </div>`;
}

function _macHtmlSecaoColador(coladores) {
    if (!coladores || !coladores.length) return "";
    return `
    <section class="mac-secao">
        <h3 class="mac-secao-titulo">Colador</h3>
        <p class="mac-secao-texto">Recebimento e AT Cluster — roda no Chrome (com a extensão) e o XM Vigia; dá pra rodar em mais de um computador ao mesmo tempo.</p>
        <div class="mac-painel">${coladores.map(_macHtmlItemColador).join("")}</div>
    </section>`;
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

    document.getElementById("mac-col-titulo").innerText = item.nome;
    document.getElementById("mac-col-erro").innerText = "";
    _macRenderizarColador();
    _abrirModal("modal-macro-colador");
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
            btn.textContent = "Salvar";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _fecharModal("modal-macro-colador");
            _macCarregarLista(true);
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}
