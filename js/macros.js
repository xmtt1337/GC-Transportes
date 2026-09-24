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

function abrirMacros(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev") {
        gcAlert("Só dev acessa os Macros.");
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
        fetch(`${API}/admin/macros`, cab).then(r => r.json()),
        // Servidor sem os macros do SPX (ou fora do ar só nessa rota): as linhas deles ficam
        // "Indisponível no momento" e o resto da tela continua funcionando.
        fetch(`${API}/admin/macros/spx`, cab).then(r => r.json()).catch(() => null),
    ])
        .then(([d, spx]) => {
            if (d && d.error) { skFim(empty, d.error); return; }
            const doSpx = spx && Array.isArray(spx.macros) ? spx.macros : [];
            _macLista = (d.macros || []).concat(doSpx);
            _macVigia = spx && spx.vigia ? spx.vigia : null;
            empty.style.display = "none";
            _macRedesenhar();
            _macAcompanhar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _macRedesenhar() {
    const lista = document.getElementById("mac-lista");
    if (lista) lista.innerHTML = _macHtmlSecoes(_macLista);
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
        texto: "Rotinas do sistema da Shopee, executadas no Chrome do galpão.",
        vigia: true,
        grupos: [{
            titulo: "Shopee",
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
function _macCargaTexto(c) {
    const quando = String(c.quando || "");
    const dia = quando.slice(0, 10);
    const hora = quando.slice(11, 16);
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const dataTexto = dia === hoje ? "hoje" : `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
    return `${dataTexto} ${hora} (${_macHa(c.segundos_atras)})`;
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
        case "aguardando":
            return vigia && !vigia.online
                ? { tom: "aviso", texto: "Pedido enviado, mas o Chrome do galpão não responde. Confira se o Chrome e o XM Vigia estão abertos." }
                : { tom: "andando", texto: "Pedido enviado — aguardando o Chrome do galpão…" };
        case "entregue":
            return { tom: "andando", texto: "Recebido pela extensão — iniciando…" };
        case "iniciado":
            return { tom: "ok", texto: `Iniciado às ${_macHoraBrasilia(cmd.criado_em)} por ${cmd.criado_por}` };
        case "erro":
            return { tom: "erro", texto: `Não rodou: ${cmd.erro || "motivo não informado"}` };
        case "expirado":
            return { tom: "aviso", texto: "Ninguém buscou o pedido — o Chrome ou o XM Vigia estão fechados?" };
        case "sem_confirmacao":
            return { tom: "aviso", texto: "A extensão recebeu o pedido mas não confirmou — veja na tela do SPX." };
        default:
            return { tom: "aviso", texto: String(cmd.estado || "") };
    }
}

function _macComandoHtml(m) {
    if (!m.comando) return "";
    const c = _macComandoTexto(m.comando, _macVigia);
    return `<div class="mac-cmd mac-cmd-${c.tom}"><span class="mac-cmd-ponto"></span>${_macEsc(c.texto)}</div>`;
}

// A linha "Chrome do galpão: conectado" sob o título da seção. Sem ela, um "Rodar" que não
// acontece parece defeito do sistema, quando é o Chrome fechado.
function _macVigiaHtml() {
    if (!_macVigia) return "";
    const v = _macVigia;
    const texto = v.online
        ? "Chrome do galpão conectado"
        : v.visto_ha_s === null || v.visto_ha_s === undefined
            ? "Sem contato com o Chrome do galpão — abra o Chrome (com a extensão) e o XM Vigia."
            : `Sem contato com o Chrome do galpão ${_macHa(v.visto_ha_s)} — abra o Chrome (com a extensão) e o XM Vigia.`;
    return `<div class="mac-vigia ${v.online ? "mac-vigia-on" : "mac-vigia-off"}"><span class="mac-cmd-ponto"></span>${_macEsc(texto)}</div>`;
}

function _macHtmlItemSpx(item, m) {
    const nome = `<div class="mac-item-nome">${_macEsc(item.nome)}</div>`
        + (item.detalhe ? `<div class="mac-item-detalhe">${_macEsc(item.detalhe)}</div>` : "");
    const carga = m.ultima_carga
        ? `Última carga: ${_macEsc(_macCargaTexto(m.ultima_carga))}`
        : "Nenhuma carga ainda";
    // O Rodar fica sempre na extrema direita (a acao principal), com ou sem Configurar ao lado.
    const semAgendaDoSistema = m.agendavel && !m.configurado;

    // O interruptor só existe quando a agenda já foi configurada por aqui; antes disso o
    // macro segue a agenda do popup da extensão e não há o que ligar ou desligar.
    const status = m.agendavel && m.configurado ? `
            <div class="mac-item-status ${m.ativo ? "ligado" : "desligado"}">
                <button type="button" class="gc-toggle mac-toggle${m.ativo ? " gc-toggle--on" : ""}" role="switch" aria-checked="${m.ativo ? "true" : "false"}"
                        title="${m.ativo ? "Desligar" : "Ligar"}" onclick="_macAlternarAtivo('${_macEsc(m.chave)}', this)"><span class="gc-toggle__knob"></span></button>
                <span class="mac-status-texto">${m.ativo ? "Ativo" : "Desligado"}</span>
            </div>` : `<div class="mac-item-status"></div>`;

    const configurar = m.agendavel
        ? `<button type="button" class="mac-configurar" onclick="_macAbrirConfigurarSpx('${_macEsc(m.qual)}')">Configurar</button>` : "";

    return `
        <div class="mac-item mac-item-spx">
            <div class="mac-item-id">${nome}</div>
            <div class="mac-item-agenda">
                <div class="mac-agenda-resumo${semAgendaDoSistema ? " mac-agenda-mudo" : ""}">${_macEsc(m.resumo)}</div>
                <div class="mac-carga">${carga}</div>
                ${_macComandoHtml(m)}
            </div>
            ${status}
            <div class="mac-item-acao">
                ${configurar}
                <button type="button" class="mac-rodar" title="Rodar agora, no Chrome do galpão"
                        ${_macOcupado(m.comando) ? "disabled" : ""} onclick="_macRodar('${_macEsc(m.qual)}', this)">▶ Rodar</button>
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
    return `
    <section class="mac-secao">
        <h3 class="mac-secao-titulo">${_macEsc(secao.titulo)}</h3>
        ${secao.texto ? `<p class="mac-secao-texto">${_macEsc(secao.texto)}</p>` : ""}
        ${secao.vigia ? _macVigiaHtml() : ""}
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
