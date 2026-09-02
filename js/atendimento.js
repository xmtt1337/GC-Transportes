// ───── CENTRAL DE ATENDIMENTO — LADO DE QUEM PEDE AJUDA ─────
//
// O balãozinho do canto inferior direito. Aparece pra TODO cargo — entregador,
// motorista, operação, financeiro — porque a dúvida sobre o sistema não tem
// cargo. Quem clica só tem uma conversa, sempre com o suporte: não escolhe
// destinatário, não abre chamado, não vê a caixa de mais ninguém.
//
// Nada disso passa pelo WhatsApp. É mensagem gravada no nosso banco (backend em
// modules/atendimento) — sem número de telefone, sem template e sem janela de 24h.
//
// Na conta do suporte o balãozinho não aparece: ela usa o menu "Atendimento", que
// é a outra ponta da mesma conversa (js/atendimento-admin.js).

// De quanto em quanto tempo o balãozinho fechado confere se chegou resposta. Um
// minuto é folgado pro ritmo de um suporte interno e não faz a aba esquecida
// aberta martelar o servidor o dia inteiro.
const _ATD_INTERVALO_BADGE = 60000;
// Com o painel ABERTO a conversa está na frente da pessoa; aí vale recarregar
// mais de perto, como em qualquer chat.
const _ATD_INTERVALO_ABERTO = 12000;

// Teto do que cabe numa mensagem — o mesmo do servidor (modules/atendimento/config.js).
// Repetido aqui só pra avisar antes de enviar; quem recusa de verdade é o backend.
const _ATD_TEXTO_MAX = 2000;

let _atdAberto = false;
let _atdSuporte = false;      // esta conta é a do suporte? (aí não há balãozinho)
// A pergunta "quem é esta conta" em andamento. A tela do suporte espera por ela
// antes de decidir se abre: um link direto pra /Atendimento/Conversas chega junto
// com o carregamento do perfil, e sem esperar o próprio suporte levaria um
// "sem acesso" só por ter chegado alguns milissegundos antes da resposta.
let _atdPronto = null;
let _atdTimerBadge = null;
let _atdTimerAberto = null;
let _atdEnviando = false;
let _atdCarregouUmaVez = false;

// ── Ajudantes puros (sem DOM) — compartilhados com a tela do suporte ──

// Escapa sem passar pelo DOM: as mesmas funções são testadas fora do navegador,
// e um createElement aqui exigiria simular `document` só pra escrever texto.
function _atdEscapar(texto) {
    return String(texto == null ? "" : texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, "<br>");
}

function _atdHora(quando) {
    const d = new Date(quando);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Separador entre os dias da conversa. "Hoje"/"Ontem" vêm acompanhados da data:
// sozinhos não dizem nada pra quem rola a conversa uma semana depois.
function _atdDiaSeparador(quando, agora) {
    const d = new Date(quando);
    if (isNaN(d)) return "";
    const hoje = agora ? new Date(agora) : new Date();
    const dia = d.toLocaleDateString("pt-BR");
    const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
    if (mesmoDia(d, hoje)) return `Hoje · ${dia}`;
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    if (mesmoDia(d, ontem)) return `Ontem · ${dia}`;
    return dia;
}

// Horário na lista do suporte: hora se foi hoje, "Ontem", senão a data. É a
// mesma leitura de qualquer app de mensagem — quem olha quer saber "é de agora?".
function _atdQuandoCurto(quando, agora) {
    const d = new Date(quando);
    if (isNaN(d)) return "";
    const hoje = agora ? new Date(agora) : new Date();
    if (d.toDateString() === hoje.toDateString()) return _atdHora(d);
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    if (d.toDateString() === ontem.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Contador do balãozinho. Passa de 9 e vira "9+": o círculo é pequeno, e a
// diferença entre 12 e 30 não muda o que a pessoa vai fazer (abrir e ler).
function _atdBadgeTexto(n) {
    const v = Number(n) || 0;
    if (v <= 0) return "";
    return v > 9 ? "9+" : String(v);
}

/**
 * Mensagens viram a lista de blocos que a conversa desenha, na ordem: um
 * separador a cada virada de dia, e uma bolha por mensagem.
 *
 * Fica separado do desenho porque é o que dá pra conferir em teste — a bolha em
 * si é só HTML em volta do que sai daqui.
 */
function _atdBlocos(mensagens, agora) {
    const blocos = [];
    let diaAnterior = null;
    for (const m of mensagens || []) {
        const quando = new Date(m.criado_em);
        const dia = isNaN(quando) ? null : quando.toDateString();
        if (dia && dia !== diaAnterior) {
            diaAnterior = dia;
            blocos.push({ tipo: "dia", texto: _atdDiaSeparador(quando, agora) });
        }
        blocos.push({ tipo: "msg", mensagem: m });
    }
    return blocos;
}

/** HTML de uma conversa inteira. `meuLado` é o lado que aparece à direita. */
function _atdHtmlConversa(mensagens, meuLado, agora) {
    return _atdBlocos(mensagens, agora).map(b => {
        if (b.tipo === "dia") return `<div class="atd-dia"><span>${_atdEscapar(b.texto)}</span></div>`;
        const m = b.mensagem;
        const lado = m.de === meuLado ? "minha" : "dele";
        // Quem respondeu só aparece nas mensagens do outro lado: repetir o
        // próprio nome em cada bolha não informa nada.
        const autor = lado === "dele" && m.autor
            ? `<span class="atd-bolha-autor">${_atdEscapar(m.autor)}</span>` : "";
        return `<div class="atd-bolha ${lado}">${autor}${_atdEscapar(m.texto)}`
             + `<span class="atd-bolha-hora">${_atdHora(m.criado_em)}</span></div>`;
    }).join("");
}

// ── Início ──

// Chamado pelo core.js depois do perfil carregar. É aqui que se decide se esta
// conta vê o balãozinho (todo mundo) ou o menu "Atendimento" (só o suporte) —
// e quem responde isso é o servidor, não uma lista de nomes no navegador.
function atdIniciar() {
    _atdPronto = fetch(API + "/atendimento/status", { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => {
            _atdSuporte = !!d.suporte;
            if (_atdSuporte) {
                const menu = document.getElementById("menu-atendimento");
                const sub  = document.getElementById("submenu-atendimento");
                if (menu) menu.style.display = "";
                if (sub)  sub.style.display  = "";
            } else {
                const btn = document.getElementById("atd-launcher");
                if (btn) btn.style.display = "";
            }
            _atdPintarBadge(d.nao_lidas);
            if (_atdTimerBadge) clearInterval(_atdTimerBadge);
            _atdTimerBadge = setInterval(_atdConferirBadge, _ATD_INTERVALO_BADGE);
        })
        // Servidor velho (sem o módulo) ou fora do ar: o balãozinho simplesmente
        // não aparece. Um botão que dá erro ao clicar seria pior que não ter.
        .catch(() => {});
}

function _atdConferirBadge() {
    if (_atdAberto) return; // com o painel aberto a leitura já zera a contagem
    fetch(API + "/atendimento/status", { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => _atdPintarBadge(d.nao_lidas))
        .catch(() => {});
}

function _atdPintarBadge(n) {
    const texto = _atdBadgeTexto(n);
    // O suporte vê a fila no menu lateral; os demais, no balãozinho.
    const alvos = _atdSuporte
        ? [document.getElementById("atd-badge-menu")]
        : [document.getElementById("atd-badge")];
    alvos.forEach(el => {
        if (!el) return;
        el.innerText = texto;
        el.style.display = texto ? "" : "none";
    });
}

// ── Painel ──

function atdAlternarPainel() {
    if (_atdAberto) return atdFecharPainel();
    _atdAberto = true;
    const painel = document.getElementById("atd-painel");
    const btn = document.getElementById("atd-launcher");
    if (painel) painel.style.display = "";
    if (btn) btn.classList.add("aberto");
    _atdCarregar(_atdCarregouUmaVez);
    if (_atdTimerAberto) clearInterval(_atdTimerAberto);
    _atdTimerAberto = setInterval(() => _atdCarregar(true), _ATD_INTERVALO_ABERTO);
    const campo = document.getElementById("atd-input");
    if (campo) setTimeout(() => campo.focus(), 60);
}

function atdFecharPainel() {
    _atdAberto = false;
    const painel = document.getElementById("atd-painel");
    const btn = document.getElementById("atd-launcher");
    if (painel) painel.style.display = "none";
    if (btn) btn.classList.remove("aberto");
    if (_atdTimerAberto) { clearInterval(_atdTimerAberto); _atdTimerAberto = null; }
    _atdConferirBadge();
}

// silencioso: recarrega sem apagar o que está na tela (usado pelo timer), pra
// conversa aberta não piscar a cada volta.
function _atdCarregar(silencioso) {
    const body = document.getElementById("atd-body");
    if (!body) return;
    if (!silencioso) body.innerHTML = `<div class="atd-aviso">Carregando...</div>`;

    return fetch(API + "/atendimento/minha", { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => {
            _atdCarregouUmaVez = true;
            const mensagens = d.mensagens || [];
            if (!mensagens.length) {
                body.innerHTML = `<div class="atd-vazio">
                    <div class="atd-vazio-titulo">Como podemos ajudar?</div>
                    <div class="atd-vazio-texto">Escreva sua dúvida ou problema aqui.
                    A resposta aparece nesta mesma janela.</div>
                </div>`;
                _atdPintarBadge(0);
                return;
            }
            // Quem já estava lendo mais acima não é jogado pro fim a cada volta
            // do timer — só desce sozinho quem estava acompanhando o fim.
            const noFim = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
            body.innerHTML = _atdHtmlConversa(mensagens, "usuario");
            if (!silencioso || noFim) body.scrollTop = body.scrollHeight;
            _atdPintarBadge(0); // abrir a conversa é o mesmo gesto de ler
        })
        .catch(() => {
            if (!silencioso) body.innerHTML = `<div class="atd-aviso erro">Não consegui carregar a conversa.</div>`;
        });
}

function _atdTecla(ev) {
    // Enter envia, Shift+Enter quebra linha — o combinado de qualquer chat.
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); atdEnviar(); }
}

// A caixa cresce com o texto até um teto, em vez de rolar numa linha só.
function _atdAjustarAltura(campo) {
    campo.style.height = "auto";
    campo.style.height = Math.min(campo.scrollHeight, 110) + "px";
}

function atdEnviar() {
    if (_atdEnviando) return;
    const campo = document.getElementById("atd-input");
    if (!campo) return;
    const texto = campo.value.trim();
    if (!texto) return;
    if (texto.length > _ATD_TEXTO_MAX) {
        gcAlert(`A mensagem passa de ${_ATD_TEXTO_MAX} caracteres. Divida em duas.`);
        return;
    }

    _atdEnviando = true;
    const botao = document.getElementById("atd-enviar");
    if (botao) botao.disabled = true;

    fetch(API + "/atendimento/mensagem", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
    })
        .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
        .then(({ ok, corpo }) => {
            if (!ok) { gcAlert(corpo.error || "Não consegui enviar a mensagem."); return; }
            // Só limpa DEPOIS do servidor aceitar: se der erro, o que a pessoa
            // escreveu continua na caixa em vez de sumir.
            campo.value = "";
            _atdAjustarAltura(campo);
            return _atdCarregar(true);
        })
        .catch(() => gcAlert("Erro ao conectar com o servidor."))
        .finally(() => {
            _atdEnviando = false;
            if (botao) botao.disabled = false;
            campo.focus();
        });
}
