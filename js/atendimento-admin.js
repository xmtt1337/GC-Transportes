// ───── CENTRAL DE ATENDIMENTO — LADO DO SUPORTE ─────
//
// A outra ponta do balãozinho (js/atendimento.js): a caixa com as conversas de
// todo mundo, aberta só pra conta do suporte. Quem libera o menu é o servidor,
// em /atendimento/status — aqui não há lista de nomes nem checagem de cargo.
//
// A tela é lista à esquerda, conversa à direita. Em tela estreita as duas não
// cabem lado a lado: abrir uma conversa esconde a lista, e o "←" traz de volta.

const _ATDA_INTERVALO_LISTA = 20000;
const _ATDA_INTERVALO_CHAT  = 12000;

// Mesmas cores do crachá de cargo da home — o cargo de quem escreveu muda o que
// a resposta vai ser (entregador pergunta de fechamento, operação de bipagem).
const _ATDA_CORES_ROLE = {
    dev: "#a78bfa", admin: "#fb923c", finance: "#34d399", user: "#3a86ff",
    entregador: "#22c55e", sac: "#06b6d4", motorista: "#f59e0b", "ADM Videira": "#e879f9",
};

let _atdaAba = "abertas";
let _atdaConversas = [];
let _atdaAtual = null;       // { id, usuario_nome, usuario_username, usuario_role, arquivada }
let _atdaTimerLista = null;
let _atdaTimerChat = null;
let _atdaEnviando = false;

/** Cargo escrito como crachá, com a cor dele. */
function _atdaCrachaRole(role) {
    if (!role) return "";
    const cor = _ATDA_CORES_ROLE[role] || "#8494a9";
    return `<span class="atd-adm-role" style="color:${cor};border-color:${cor}3d;background:${cor}14">`
         + `${_atdEscapar(role)}</span>`;
}

/** Iniciais pro avatar — duas letras, do nome de verdade quando existe. */
function _atdaIniciais(nome) {
    const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "?";
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// ── Puxar conversa com quem ainda não escreveu ──
//
// O entregador não fica com o sistema aberto o dia inteiro; quando o suporte
// precisa falar com ele (fechamento, NF, pacote faltante), não dá pra esperar
// que ele escreva primeiro. Quem pode ser chamado é o servidor que diz — a
// lista vem pronta de /atendimento/candidatos.

// Quantos nomes desenhar de uma vez. A lista inteira caberia, mas 500 linhas de
// cara não ajudam ninguém a achar uma pessoa: o corte empurra pra busca, que é
// como se acha alguém de verdade.
const _ATDA_CANDIDATOS_MOSTRA = 60;

let _atdaCandidatos = [];

/** Texto comparável: sem acento, sem caixa, sem espaço nas pontas. */
function _atdaChaveBusca(texto) {
    return String(texto == null ? "" : texto)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().trim();
}

/**
 * Filtra o seletor pelo que foi digitado, em nome OU username.
 *
 * Cada palavra é procurada por conta própria, em qualquer ordem: quem digita
 * "silva joao" está procurando "João da Silva", e uma busca por frase inteira
 * não acharia. Sem acento dos dois lados — ninguém digita "Ubiratã" com o til
 * quando está com pressa.
 */
function _atdaFiltrarCandidatos(lista, busca) {
    const chave = _atdaChaveBusca(busca);
    const todos = lista || [];
    if (!chave) return todos.slice();
    const termos = chave.split(/\s+/);
    return todos.filter(c => {
        const alvo = _atdaChaveBusca(`${c.nome} ${c.username}`);
        return termos.every(t => alvo.includes(t));
    });
}

function _atdaAbrirNova() {
    const busca = document.getElementById("atd-novo-busca");
    const alvo  = document.getElementById("atd-novo-lista");
    if (busca) busca.value = "";
    if (alvo)  alvo.innerHTML = `<div class="atd-aviso">Carregando...</div>`;
    _abrirModal("modal-atd-novo");
    if (busca) setTimeout(() => busca.focus(), 80);

    fetch(`${API}/atendimento/candidatos`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
        .then(({ ok, corpo }) => {
            if (!alvo) return;
            if (!ok) { alvo.innerHTML = `<div class="atd-aviso erro">${_atdEscapar(corpo.error || "Erro ao carregar.")}</div>`; return; }
            _atdaCandidatos = corpo.candidatos || [];
            _atdaPintarCandidatos();
        })
        .catch(() => {
            if (alvo) alvo.innerHTML = `<div class="atd-aviso erro">Erro ao conectar com o servidor.</div>`;
        });
}

function _atdaPintarCandidatos() {
    const alvo  = document.getElementById("atd-novo-lista");
    const busca = document.getElementById("atd-novo-busca");
    if (!alvo) return;

    const achados = _atdaFiltrarCandidatos(_atdaCandidatos, busca ? busca.value : "");
    if (!achados.length) {
        alvo.innerHTML = `<div class="atd-aviso">${_atdaCandidatos.length
            ? "Ninguém com esse nome."
            : "Nenhum entregador ativo cadastrado."}</div>`;
        return;
    }

    const mostra = achados.slice(0, _ATDA_CANDIDATOS_MOSTRA);
    const sobra  = achados.length - mostra.length;
    alvo.innerHTML = mostra.map(c => `
        <div class="atd-novo-item" onclick="_atdaEscolherCandidato(${c.usuario_id})">
            <div class="atd-adm-avatar">${_atdEscapar(_atdaIniciais(c.nome))}</div>
            <div class="atd-novo-item-corpo">
                <div class="atd-adm-nome">${_atdEscapar(c.nome)}</div>
                <div class="atd-adm-item-meta">${_atdaCrachaRole(c.role)}
                    <span class="atd-adm-username">${_atdEscapar(c.username)}</span></div>
            </div>
            ${c.tem_conversa ? `<span class="atd-novo-jatem">já conversaram</span>` : ""}
        </div>`).join("")
        + (sobra ? `<div class="atd-aviso">e mais ${sobra} — refine a busca.</div>` : "");
}

function _atdaEscolherCandidato(usuarioId) {
    const cand = _atdaCandidatos.find(c => c.usuario_id === usuarioId);
    if (!cand) return;
    _fecharModal("modal-atd-novo");

    // Já está na lista carregada: abre a conversa de verdade, com o histórico.
    // Nada de conversa duplicada — é uma por pessoa, no banco e aqui.
    const existente = _atdaConversas.find(c => c.usuario_id === usuarioId);
    if (existente) { _atdaAbrirConversa(existente.id); return; }

    // Ainda não existe: fica em espera até o primeiro envio criá-la.
    _atdaAtual = {
        id: null,
        usuario_id: cand.usuario_id,
        usuario_nome: cand.nome,
        usuario_username: cand.username,
        usuario_role: cand.role,
        arquivada: false,
    };
    const painel = document.getElementById("atd-adm-chat");
    if (painel) painel.classList.add("aberto");
    _atdaPintarCabecalho();
    _atdaPintarLista();

    const body = document.getElementById("atd-adm-body");
    if (body) {
        body.innerHTML = `<div class="atd-vazio">
            <div class="atd-vazio-titulo">Nenhuma mensagem ainda</div>
            <div class="atd-vazio-texto">${cand.tem_conversa
                ? "Vocês já conversaram antes — o histórico volta assim que você enviar."
                : "Escreva abaixo para começar a conversa."}</div>
        </div>`;
    }
    // O relógio já roda: enquanto não houver id ele não faz requisição nenhuma
    // (ver _atdaCarregarConversa), e passa a valer sozinho depois do 1º envio.
    if (_atdaTimerChat) clearInterval(_atdaTimerChat);
    _atdaTimerChat = setInterval(() => {
        const tela = document.getElementById("tela-atendimento");
        if (!tela || !tela.classList.contains("active-view") || !_atdaAtual) {
            clearInterval(_atdaTimerChat); _atdaTimerChat = null; return;
        }
        _atdaCarregarConversa(true);
    }, _ATDA_INTERVALO_CHAT);

    const campo = document.getElementById("atd-adm-input");
    if (campo) setTimeout(() => campo.focus(), 60);
}

function abrirAtendimento(event) {
    if (event) event.preventDefault();
    // Espera a resposta de /atendimento/status antes de decidir. Um link direto
    // pra esta tela chega junto com o carregamento do perfil: sem esperar, o
    // próprio suporte levaria "sem acesso" por ter chegado antes da resposta.
    Promise.resolve(_atdPronto).then(() => {
        if (!_atdSuporte) { gcAlert("Você não tem acesso à Central de Atendimento."); return; }
        _atdaAbrirTela();
    });
}

function _atdaAbrirTela() {
    mostrarTela("tela-atendimento");
    _atdaCarregarLista();
    if (_atdaTimerLista) clearInterval(_atdaTimerLista);
    _atdaTimerLista = setInterval(() => {
        const tela = document.getElementById("tela-atendimento");
        if (!tela || !tela.classList.contains("active-view")) {
            clearInterval(_atdaTimerLista); _atdaTimerLista = null;
            if (_atdaTimerChat) { clearInterval(_atdaTimerChat); _atdaTimerChat = null; }
            return;
        }
        _atdaCarregarLista(true);
        if (_atdaAtual) _atdaCarregarConversa(true);
    }, _ATDA_INTERVALO_LISTA);
}

function _atdaTrocarAba(aba) {
    _atdaAba = aba;
    document.querySelectorAll("#atd-adm-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.aba === aba));
    // A conversa aberta é de outra aba agora — deixá-la na tela mostraria uma
    // arquivada dentro da lista de abertas, e vice-versa.
    _atdaFecharConversa();
    _atdaCarregarLista();
}

function _atdaCarregarLista(silencioso) {
    const alvo = document.getElementById("atd-adm-itens");
    if (!alvo) return;
    if (!silencioso) skMostrar(alvo, "lista", 5);

    const arquivadas = _atdaAba === "arquivadas" ? "1" : "0";
    return fetch(`${API}/atendimento/conversas?arquivadas=${arquivadas}`, {
        headers: { "Authorization": "Bearer " + token },
    })
        .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
        .then(({ ok, corpo }) => {
            alvo.classList.remove("sk-mode");
            if (!ok) { alvo.innerHTML = `<div class="atd-aviso erro">${_atdEscapar(corpo.error || "Erro ao carregar.")}</div>`; return; }
            _atdaConversas = corpo.conversas || [];
            _atdaPintarLista();
            // O menu lateral mostra quantas pessoas estão sem resposta; recarregar
            // a lista é a informação mais fresca que existe pra isso.
            if (_atdaAba === "abertas") {
                _atdPintarBadge(_atdaConversas.filter(c => (c.nao_lidas || 0) > 0).length);
            }
        })
        .catch(() => {
            alvo.classList.remove("sk-mode");
            if (!silencioso) alvo.innerHTML = `<div class="atd-aviso erro">Erro ao conectar com o servidor.</div>`;
        });
}

function _atdaPintarLista() {
    const alvo = document.getElementById("atd-adm-itens");
    if (!alvo) return;
    if (!_atdaConversas.length) {
        alvo.innerHTML = `<div class="atd-aviso">${_atdaAba === "arquivadas"
            ? "Nenhuma conversa arquivada."
            : "Nenhuma conversa aberta. Quando alguém escrever, aparece aqui."}</div>`;
        return;
    }
    alvo.innerHTML = _atdaConversas.map(c => {
        const naoLidas = _atdBadgeTexto(c.nao_lidas);
        const ativa = _atdaAtual && _atdaAtual.id === c.id ? " ativa" : "";
        const nova  = naoLidas ? " nova" : "";
        // "Você:" antes da prévia quando a última fala foi nossa — sem isso não
        // dá pra saber, olhando a lista, quem está esperando quem.
        const prefixo = c.ultimo_de === "suporte" ? `<span class="atd-adm-eu">Você:</span> ` : "";
        return `<div class="atd-adm-item${ativa}${nova}" onclick="_atdaAbrirConversa(${c.id})">
            <div class="atd-adm-avatar">${_atdEscapar(_atdaIniciais(c.usuario_nome))}</div>
            <div class="atd-adm-item-corpo">
                <div class="atd-adm-item-topo">
                    <span class="atd-adm-nome">${_atdEscapar(c.usuario_nome)}</span>
                    <span class="atd-adm-quando">${_atdEscapar(_atdQuandoCurto(c.ultima_em))}</span>
                </div>
                <div class="atd-adm-item-baixo">
                    <span class="atd-adm-resumo">${prefixo}${_atdEscapar(c.resumo)}</span>
                    ${naoLidas ? `<span class="atd-adm-naolidas">${naoLidas}</span>` : ""}
                </div>
                <div class="atd-adm-item-meta">${_atdaCrachaRole(c.usuario_role)}
                    <span class="atd-adm-username">${_atdEscapar(c.usuario_username)}</span></div>
            </div>
        </div>`;
    }).join("");
}

function _atdaAbrirConversa(id) {
    const c = _atdaConversas.find(x => x.id === id);
    _atdaAtual = c ? { ...c } : { id };
    const painel = document.getElementById("atd-adm-chat");
    if (painel) painel.classList.add("aberto"); // manda a lista pro fundo em tela estreita
    _atdaPintarCabecalho();
    _atdaPintarLista();
    _atdaCarregarConversa();
    if (_atdaTimerChat) clearInterval(_atdaTimerChat);
    _atdaTimerChat = setInterval(() => {
        const tela = document.getElementById("tela-atendimento");
        if (!tela || !tela.classList.contains("active-view") || !_atdaAtual) {
            clearInterval(_atdaTimerChat); _atdaTimerChat = null; return;
        }
        _atdaCarregarConversa(true);
    }, _ATDA_INTERVALO_CHAT);
    const campo = document.getElementById("atd-adm-input");
    if (campo) setTimeout(() => campo.focus(), 60);
}

function _atdaFecharConversa() {
    _atdaAtual = null;
    if (_atdaTimerChat) { clearInterval(_atdaTimerChat); _atdaTimerChat = null; }
    const painel = document.getElementById("atd-adm-chat");
    if (painel) painel.classList.remove("aberto");
    const corpo = document.getElementById("atd-adm-body");
    if (corpo) corpo.innerHTML = "";
    _atdaPintarCabecalho();
}

function _atdaPintarCabecalho() {
    const vazio = document.getElementById("atd-adm-vazio");
    const chat  = document.getElementById("atd-adm-conversa");
    if (vazio) vazio.style.display = _atdaAtual ? "none" : "";
    if (chat)  chat.style.display  = _atdaAtual ? "" : "none";
    if (!_atdaAtual) return;

    const nome = document.getElementById("atd-adm-chat-nome");
    const sub  = document.getElementById("atd-adm-chat-sub");
    const av   = document.getElementById("atd-adm-chat-avatar");
    const btn  = document.getElementById("atd-adm-arquivar");
    if (nome) nome.innerText = _atdaAtual.usuario_nome || "—";
    if (av)   av.innerText   = _atdaIniciais(_atdaAtual.usuario_nome);
    if (sub) {
        sub.innerHTML = `${_atdaCrachaRole(_atdaAtual.usuario_role)}
            <span class="atd-adm-username">${_atdEscapar(_atdaAtual.usuario_username || "")}</span>`;
    }
    if (btn) {
        btn.innerText = _atdaAtual.arquivada ? "Reabrir" : "Arquivar";
        // Não dá pra arquivar o que ainda não existe: a conversa só nasce no
        // primeiro envio. O botão volta assim que ela é criada.
        btn.style.display = _atdaAtual.id ? "" : "none";
    }
}

function _atdaCarregarConversa(silencioso) {
    if (!_atdaAtual) return;
    // Conversa que o suporte puxou pelo seletor e ainda não existe no banco: não
    // há o que buscar, e a tela já mostra o convite pra escrever a primeira.
    if (!_atdaAtual.id) return;
    const body = document.getElementById("atd-adm-body");
    if (!body) return;
    if (!silencioso) body.innerHTML = `<div class="atd-aviso">Carregando...</div>`;
    const id = _atdaAtual.id;

    return fetch(`${API}/atendimento/conversas/${id}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
        .then(({ ok, corpo }) => {
            // Trocou de conversa enquanto a resposta vinha: o que chegou é da
            // conversa anterior e não pode sobrescrever a que está na tela.
            if (!_atdaAtual || _atdaAtual.id !== id) return;
            if (!ok) { body.innerHTML = `<div class="atd-aviso erro">${_atdEscapar(corpo.error || "Erro ao carregar.")}</div>`; return; }
            _atdaAtual = { ..._atdaAtual, ...(corpo.conversa || {}) };
            _atdaPintarCabecalho();
            const noFim = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
            body.innerHTML = _atdHtmlConversa(corpo.mensagens || [], "suporte")
                || `<div class="atd-aviso">Conversa vazia.</div>`;
            if (!silencioso || noFim) body.scrollTop = body.scrollHeight;
            // Ler zera as não lidas desta conversa também na lista, sem esperar
            // a próxima volta do timer.
            const naLista = _atdaConversas.find(x => x.id === id);
            if (naLista && naLista.nao_lidas) { naLista.nao_lidas = 0; _atdaPintarLista(); }
        })
        .catch(() => {
            if (!silencioso) body.innerHTML = `<div class="atd-aviso erro">Erro ao conectar com o servidor.</div>`;
        });
}

function _atdaTecla(ev) {
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); _atdaEnviar(); }
}

function _atdaAjustarAltura(campo) {
    campo.style.height = "auto";
    campo.style.height = Math.min(campo.scrollHeight, 110) + "px";
}

function _atdaEnviar() {
    if (_atdaEnviando || !_atdaAtual) return;
    const campo = document.getElementById("atd-adm-input");
    if (!campo) return;
    const texto = campo.value.trim();
    if (!texto) return;

    _atdaEnviando = true;
    const botao = document.getElementById("atd-adm-enviar");
    if (botao) botao.disabled = true;

    // Conversa puxada pelo seletor ainda não tem id — é o primeiro envio que a
    // cria, e por isso vai por outra rota, com o usuário no corpo. Do segundo
    // envio em diante é a rota normal de resposta.
    const nova = !_atdaAtual.id;
    const url = nova ? `${API}/atendimento/conversas`
                     : `${API}/atendimento/conversas/${_atdaAtual.id}/mensagem`;
    const carga = nova ? { usuario_id: _atdaAtual.usuario_id, texto } : { texto };

    fetch(url, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(carga),
    })
        .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
        .then(({ ok, corpo }) => {
            if (!ok) { gcAlert(corpo.error || "Não consegui enviar a resposta."); return; }
            campo.value = "";
            _atdaAjustarAltura(campo);
            if (nova && _atdaAtual) {
                _atdaAtual.id = corpo.conversa_id;
                // Conversa recém-criada (ou reaberta) está sempre em "Abertas".
                // Ficar na aba de arquivadas esconderia justo o que acabou de nascer.
                if (_atdaAba !== "abertas") {
                    _atdaAba = "abertas";
                    document.querySelectorAll("#atd-adm-abas .filtro-tab").forEach(b =>
                        b.classList.toggle("active", b.dataset.aba === "abertas"));
                }
            }
            return _atdaCarregarConversa(true).then(() => _atdaCarregarLista(true));
        })
        .catch(() => gcAlert("Erro ao conectar com o servidor."))
        .finally(() => {
            _atdaEnviando = false;
            if (botao) botao.disabled = false;
            campo.focus();
        });
}

// Arquivar não apaga nada: só tira da fila. E a conversa volta sozinha pra
// "Abertas" se a pessoa escrever de novo (o servidor reabre no próximo envio).
function _atdaArquivar() {
    if (!_atdaAtual) return;
    const id = _atdaAtual.id;
    const arquivada = !_atdaAtual.arquivada;

    fetch(`${API}/atendimento/conversas/${id}/arquivar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ arquivada }),
    })
        .then(r => r.json().then(corpo => ({ ok: r.ok, corpo })))
        .then(({ ok, corpo }) => {
            if (!ok) { gcAlert(corpo.error || "Não consegui mudar a conversa de lista."); return; }
            _atdaFecharConversa();
            _atdaCarregarLista();
        })
        .catch(() => gcAlert("Erro ao conectar com o servidor."));
}
