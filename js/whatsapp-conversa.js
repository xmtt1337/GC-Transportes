// ───── WHATSAPP — RÉPLICA VISUAL DA CONVERSA (SÓ DEV) ─────
// Recria o visual do app do WhatsApp com os dados reais trocados com o cliente,
// pra servir de "print" pro SAC mostrar pra transportadora sem precisar do celular.
let _wacNumeroAtual = null;
let _wacAutoRefresh = null;
let _wacSelecionadas = new Set(); // ids ("e12"/"r5") marcados pra excluir
let _wacDados = [];               // última resposta do servidor, pra filtrar sem re-buscar
let _wacPedidoAtual = "";         // pedido do card que abriu a conversa
let _wacResolvidoAtual = false;
let _wacRelogio = null;           // redesenha o funil pra acompanhar a passagem do tempo
let _wacPrecisaDestacar = false;  // rolar até a mensagem do pedido só na abertura
let _wacAba = "acareacao";        // "acareacao" (com prazo) | "outros" | "chamaram"
let _wacTransp = null;            // transportadora selecionada; null = escolher no 1º render
let _wacRevalidarTransp = false;  // trocou de aba: conferir se a escolhida tem conversa lá

// Cargos cujo disparo entra no funil de acareação. Os demais caem em "Outros ativos".
const WA_ROLES_ACAREACAO = ["sac", "dev"];

// Avatar padrão do sistema — igual pra todo mundo, sem emoji e sem imitar outro app.
const WA_AVATAR_SVG = `<svg viewBox="0 0 212 212" width="100%" height="100%" aria-hidden="true">
    <circle cx="106" cy="106" r="106" fill="#1b2635"/>
    <path fill="#8494a9" d="M106 109c17 0 31-14 31-31s-14-31-31-31-31 14-31 31 14 31 31 31zm0 13c-25 0-56 12-56 31v14h112v-14c0-19-31-31-56-31z"/>
</svg>`;

// Prazo padrão em horas, usado só para envios antigos, feitos antes do campo de prazo
// existir. Hoje o prazo vem preenchido no disparo, por pedido.
const WA_PRAZO_HORAS_PADRAO = 48;

// Vencimento exato: conta as horas do prazo a partir do minuto do envio.
function _wacVencimento(primeiroEnvio, prazoHoras) {
    const horas = prazoHoras || WA_PRAZO_HORAS_PADRAO;
    return new Date(new Date(primeiroEnvio).getTime() + horas * 60 * 60 * 1000);
}

// Cor do prazo em degradê por HORAS RESTANTES, alinhado com as colunas: 48h ou mais
// branco, 24h âmbar, vencendo vermelho. É absoluto de propósito — faltar 2h é urgente
// independente do prazo ter sido de 6h ou de 200h. Passa pelo âmbar porque
// branco→vermelho direto vira rosa no meio.
const _WAC_BRANCO = [226, 232, 240], _WAC_AMBAR = [251, 191, 36], _WAC_VERMELHO = [239, 68, 68];
const _WAC_HORAS_ESCALA = 48;

function _wacMisturar(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function _wacCorPrazo(vencimento) {
    const horas = (vencimento - new Date()) / (60 * 60 * 1000);
    if (horas <= 0) return "#ef4444";
    const r = Math.min(1, horas / _WAC_HORAS_ESCALA); // 1 = 48h+, 0.5 = 24h, 0 = vencendo
    const c = r >= 0.5
        ? _wacMisturar(_WAC_AMBAR, _WAC_BRANCO, (r - 0.5) * 2)
        : _wacMisturar(_WAC_VERMELHO, _WAC_AMBAR, r * 2);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// "faltam 6h" / "faltam 40min" / "venceu há 3h" — precisão que o card de prazo curto exige.
function _wacTempoRestante(vencimento) {
    const ms = vencimento - new Date();
    const venceu = ms < 0;
    const totalMin = Math.floor(Math.abs(ms) / 60000);
    const horas = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const texto = horas >= 24 ? `${Math.floor(horas / 24)}d ${horas % 24}h`
                : horas >= 1  ? `${horas}h ${min}min`
                : `${min}min`;
    return venceu ? `venceu há ${texto}` : `faltam ${texto}`;
}

// O agrupamento em blocos (hoje/1 dia/2 dias) compara a DATA do vencimento exato acima
// com a data de hoje — assim o corte de bucket cai num dia legível, mas o vencimento em
// si continua sendo as 48h corridas de verdade (é o que aparece na hora certa na conversa).
function _wacStatusPrazo(conversa) {
    // Sem envio nosso não há prazo correndo. Esses casos ficam na aba "Nos chamaram" e
    // não chegam aqui; o retorno existe só pra nenhuma linha inesperada quebrar o funil.
    if (!conversa.primeiro_envio) return "recebidas";
    if (conversa.respondido) return "respondidos";
    // Por horas restantes, não por data de calendário: faltando 21h o caso é urgente,
    // mesmo que o vencimento caia "amanhã". É a mesma escala que colore o prazo.
    const vencimento = _wacVencimento(conversa.primeiro_envio, conversa.prazo_horas);
    const horas = (vencimento - new Date()) / (60 * 60 * 1000);

    if (horas <= 0)  return "vencidos";
    if (horas <= 24) return "vencendo_hoje";
    return "mais_24h";
}

// Colunas abertas: o que corre contra o prazo. Duas bastam — o que vence dentro do dia
// é o que exige ação, e separar o resto em 48h ou mais só espalhava card sem urgência.
// Quem nos procurou sem disparo nosso saiu daqui e virou aba própria.
const WA_COLUNAS_PRAZO = [
    { chave: "vencendo_hoje", titulo: "Vencendo hoje" },
    { chave: "mais_24h",      titulo: "24h +" },
];

// Segunda faixa de colunas: casos encerrados (respondido) ou perdidos (venceu sem
// resposta). Ficam sempre abertas — é coluna igual à de cima, abrir e fechar só atrapalha.
const WA_COLUNAS_FECHADAS = [
    { chave: "vencidos",    titulo: "Vencidos sem resposta" },
    { chave: "respondidos", titulo: "Respondidos" },
];

const WA_GRUPOS_PRAZO = [...WA_COLUNAS_PRAZO, ...WA_COLUNAS_FECHADAS];

function abrirWhatsappConversas(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (!WA_ROLES_ATIVOS.includes(role)) {
        gcAlert("Você não tem acesso às conversas de ativos.");
        return;
    }
    // Quem não faz acareação já entra na aba que lhe interessa.
    if (!WA_ROLES_ACAREACAO.includes(role)) _wacAba = "outros";
    _wacTransp = null; // cada visita começa numa transportadora que tem trabalho
    document.querySelectorAll("#wac-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.aba === _wacAba));
    mostrarTela("tela-whatsapp-conversas");
    _wacCarregarLista();

    // Redesenha de minuto em minuto: o tempo restante e a coluna dependem do relógio,
    // então sem isso um pedido só "venceria" na próxima vez que a tela fosse aberta.
    if (_wacRelogio) clearInterval(_wacRelogio);
    _wacRelogio = setInterval(() => {
        const tela = document.getElementById("tela-whatsapp-conversas");
        if (!tela || !tela.classList.contains("active-view")) { clearInterval(_wacRelogio); _wacRelogio = null; return; }
        if (_wacArrastando) return; // não redesenha no meio de um arrasto
        _wacRenderizar();
    }, 60000);
}

// Data da conversa em texto curto. O card mostrava só o vencimento (acareação) ou a hora
// crua (outros), então não dava pra saber de QUE DIA era a conversa sem abrir.
// "Hoje"/"Ontem" por extenso porque são os dois que se procura; o ano só entra quando a
// conversa é de outro ano, senão ocupa espaço sem informar nada.
function _wacDataCurta(valor) {
    if (!valor) return "—";
    const d = new Date(valor);
    if (isNaN(d.getTime())) return "—";
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const hoje = new Date();
    const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
    if (mesmoDia(d, hoje)) return `Hoje ${hora}`;
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    if (mesmoDia(d, ontem)) return `Ontem ${hora}`;
    const dia = d.toLocaleDateString("pt-BR",
        d.getFullYear() === hoje.getFullYear()
            ? { day: "2-digit", month: "2-digit" }
            : { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${dia} ${hora}`;
}

// O selo de não lidas. Conta as mensagens que o cliente mandou depois da última vez que
// ESTA pessoa abriu a conversa — o ponto verde de antes só dizia "tem resposta", e ficava
// aceso mesmo depois de alguém já ter lido tudo.
function _wacSeloNaoLidas(r) {
    const n = Number(r.nao_lidas) || 0;
    if (!n) return "";
    const titulo = n === 1 ? "1 mensagem que você ainda não leu" : `${n} mensagens que você ainda não leu`;
    return `<span class="wac-card-naolidas" title="${titulo}">${n > 99 ? "99+" : n}</span>`;
}

function _wacCards(itens, grupo) {
    const fmt = d => d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return itens.map(r => {
        // Quem já respondeu não tem prazo correndo — mostra a última mensagem no lugar.
        const semPrazo = grupo.chave === "respondidos";
        const vencimento = semPrazo ? null : _wacVencimento(r.primeiro_envio, r.prazo_horas);
        const linhaPrazo = semPrazo
            ? `Respondido · ${fmt(new Date(r.ultima))}`
            : `${_wacTempoRestante(vencimento)} · ${fmt(vencimento)}`;
        // O card é do PEDIDO; o cliente vira a linha de apoio.
        const titulo = r.pedido || _wacFormatarNumero(r.numero);
        // Só código e número: o nome do cliente já está na conversa, e repetir aqui polui.
        const apoio  = _wacFormatarNumero(r.numero);
        const porQuem = r.enviado_por_nome ? ` · ${r.enviado_por_nome}` : "";
        const pedidoEsc = (r.pedido || "").replace(/'/g, "\\'");
        const aviso = _wacSeloNaoLidas(r);
        // Data da última movimentação da conversa, separada da linha de prazo — são coisas
        // diferentes e antes só a segunda aparecia.
        const linhaData = `<div class="wac-card-data">${_wacDataCurta(r.ultima)}${
            r.nao_lidas ? "" : r.lido_em ? " · lida" : ""}</div>`;
        // Só os respondidos têm botão: reabrir arrastando exigiria mirar numa coluna de
        // prazo específica, e a certa depende do vencimento — o botão evita esse chute.
        const acao = r.respondido
            ? `<button class="wac-card-acao reabrir" title="Reabrir pedido" onclick="_wacReabrirPeloCard(event,'${r.numero}','${pedidoEsc}')">↺</button>`
            : "";
        return `
        <div class="wac-card${r.nao_lidas ? " nao-lida" : ""}" draggable="true"
             ondragstart="_wacArrastarInicio(event,'${r.numero}','${pedidoEsc}')"
             ondragend="_wacArrastarFim(event)"
             onclick="_wacAbrirConversa('${r.numero}','${pedidoEsc}',${!!r.respondido})">
            <div class="wac-card-avatar">${WA_AVATAR_SVG}</div>
            <div class="wac-card-info">
                <div class="wac-card-nome">${titulo}${aviso}</div>
                ${apoio ? `<div class="wac-card-numero">${apoio}</div>` : ""}
                <div class="wac-card-prazo" ${vencimento ? `style="color:${_wacCorPrazo(vencimento)}"` : ""}>${linhaPrazo}${porQuem}</div>
                ${linhaData}
            </div>
            ${acao}
        </div>`;
    }).join("");
}

function _wacCarregarLista() {
    const empty  = document.getElementById("wac-lista-empty");
    const result = document.getElementById("wac-lista-resultado");
    skMostrar(empty, "cards");
    result.style.display = "none";

    fetch(`${API}/admin/whatsapp/conversas`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) { skFim(empty, "Nenhuma conversa registrada ainda."); return; }
            _wacDados = rows;
            const busca = document.getElementById("wac-busca");
            if (busca) busca.value = "";
            empty.style.display = "none";
            result.style.display = "";
            _wacRenderizar();
        })
        .catch(() => { skFim(empty, "Erro ao carregar conversas."); });
}

// ── Em qual aba cada conversa mora ──
// Os três destinos são exaustivos e não se sobrepõem: sem envio nosso é "Nos chamaram";
// o resto vai pelo CARGO de quem disparou, com SAC e dev na acareação (que tem prazo) e
// o restante do time em outros ativos. Assim nenhuma conversa fica sem aba.
const _wacSemEnvio    = r => !r.primeiro_envio;
const _wacEhAcareacao = r => !r.enviado_por_role || WA_ROLES_ACAREACAO.includes(r.enviado_por_role);

function _wacAbaDe(conversa) {
    if (_wacSemEnvio(conversa)) return "chamaram";
    return _wacEhAcareacao(conversa) ? "acareacao" : "outros";
}

// Busca local por pedido, número ou nome — os dados já estão carregados, não refaz requisição.
function _wacCasaBusca(conversa, termo) {
    return !termo ||
        (conversa.pedido || "").toLowerCase().includes(termo) ||
        (conversa.numero || "").toLowerCase().includes(termo) ||
        (conversa.nome_cliente || "").toLowerCase().includes(termo);
}

function _wacTermoBusca() {
    return (document.getElementById("wac-busca")?.value || "").trim().toLowerCase();
}

function _wacFiltrar() {
    _wacIrOndeEsta();
    _wacRenderizar();
}

// Pesquisar um pedido que está em outra aba ou outra transportadora daria uma tela
// vazia, como se ele não existisse. Em vez disso, leva a tela até onde o resultado está.
function _wacIrOndeEsta() {
    const termo = _wacTermoBusca();
    if (!termo) return;

    const achados = _wacDados.filter(r => _wacCasaBusca(r, termo));
    if (!achados.length) return; // não existe mesmo: a tela vazia é a resposta certa

    const naVisao = r => _wacAbaDe(r) === _wacAba &&
        (_wacAba === "chamaram" || _wacTranspDe(r) === _wacTransp);
    if (achados.some(naVisao)) return; // já está à vista, não mexe em nada

    // Prefere o resultado da aba aberta: trocar só de transportadora desloca menos.
    const alvo = achados.find(r => _wacAbaDe(r) === _wacAba) || achados[0];
    _wacAba = _wacAbaDe(alvo);
    if (_wacAba !== "chamaram") _wacTransp = _wacTranspDe(alvo);
    document.querySelectorAll("#wac-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.aba === _wacAba));
}

// Outros ativos e Nos chamaram: mesma mecânica de colunas e arrastar da acareação, só
// que sem prazo — o que separa aqui é o desfecho da entrega, não o tempo. Os títulos
// mudam porque num caso nós procuramos o cliente e no outro foi ele que nos procurou.
const WA_COLUNAS_OUTROS = [
    { chave: "aguardando",   titulo: "Aguardando",    resultado: null },
    { chave: "entregue",     titulo: "Entregue",      resultado: "recebeu" },
    { chave: "nao_entregue", titulo: "Não entregue",  resultado: "nao_recebeu" },
];

// "Nos chamaram" é uma lista só: não tem prazo nem desfecho de entrega pra separar em
// colunas — é o cliente que apareceu, e o que se faz com ele se resolve dentro da conversa.
function _wacRenderizarChamaram(itens) {
    document.getElementById("wac-lista-chamaram").innerHTML =
        _wacCardsOutros(itens, false) || `<div class="wac-coluna-vazia">Nenhuma conversa aqui.</div>`;
}

function _wacRenderizarDesfecho(itens, alvoId, colunas) {
    const grupos = { aguardando: [], entregue: [], nao_entregue: [] };
    itens.forEach(r => {
        if (!r.respondido) grupos.aguardando.push(r);
        else if (r.resultado === "recebeu") grupos.entregue.push(r);
        else grupos.nao_entregue.push(r);
    });

    document.getElementById(alvoId).innerHTML = colunas.map(g => `
        <div class="wac-coluna">
            <div class="wac-coluna-header">
                <span>${g.titulo}</span><span class="wac-coluna-contagem">${grupos[g.chave].length}</span>
            </div>
            <div class="wac-coluna-cards wac-drop"
                 ondragover="_wacDropSobre(event)" ondragleave="_wacDropSaiu(event)"
                 ondrop="_wacSoltar(event,${g.resultado ? `'${g.resultado}'` : "null"})">
                ${_wacCardsOutros(grupos[g.chave]) || `<div class="wac-coluna-vazia">—</div>`}
            </div>
        </div>`).join("");
}

// arrastavel = false na lista de "Nos chamaram": lá não existe coluna pra onde soltar.
function _wacCardsOutros(itens, arrastavel = true) {
    return itens.map(r => {
        const pedidoEsc = (r.pedido || "").replace(/'/g, "\\'");
        const aviso = _wacSeloNaoLidas(r);
        const porQuem = r.enviado_por_nome ? `${r.enviado_por_nome} · ` : "";
        const arrasto = arrastavel
            ? `draggable="true" ondragstart="_wacArrastarInicio(event,'${r.numero}','${pedidoEsc}')" ondragend="_wacArrastarFim(event)"`
            : "";
        return `
        <div class="wac-card${r.nao_lidas ? " nao-lida" : ""}" ${arrasto}
             onclick="_wacAbrirConversa('${r.numero}','${pedidoEsc}',${!!r.respondido})">
            <div class="wac-card-avatar">${WA_AVATAR_SVG}</div>
            <div class="wac-card-info">
                <div class="wac-card-nome">${r.pedido || _wacFormatarNumero(r.numero)}${aviso}</div>
                <div class="wac-card-numero">${_wacFormatarNumero(r.numero)}</div>
                <div class="wac-card-prazo">${porQuem}${_wacDataCurta(r.ultima)}${
                    r.nao_lidas ? "" : r.lido_em ? " · lida" : ""}</div>
            </div>
        </div>`;
    }).join("");
}

// ── Relatório ──
// Um botão por aba, e cada um leva a aba INTEIRA (todas as transportadoras juntas) — não o
// que está filtrado na tela. O relatório é da operação toda; exportar só a transportadora
// aberta seria uma pegadinha silenciosa em cima de um filtro que existe pra trabalhar.
function _wacExportar(aba) {
    const itens = _wacDados.filter(r => _wacAbaDe(r) === aba);
    const rotulo = aba === "acareacao" ? "Acareação" : "Outros ativos";
    if (!itens.length) return gcAlert(`Nenhuma conversa em ${rotulo.toLowerCase()} para exportar.`);

    const dados = itens.map(r => {
        const t = WA_TRANSPORTADORAS[_wacTranspDe(r)];
        // Três estados, não dois: "Não" é o cliente ter dito que não recebeu, e é diferente
        // de ninguém ter marcado nada ainda. Juntar os dois num "Não" contaria como não
        // entregue todo caso que só está esperando resposta.
        const entregue = !r.respondido ? "Pendente"
                       : r.resultado === "recebeu" ? "Sim"
                       : r.resultado === "nao_recebeu" ? "Não"
                       : "Pendente";
        return {
            "Tipo":           rotulo,
            "Transportadora": (t && t.rotulo) || "Sem transportadora",
            "Código":         r.pedido || "",
            "Entregue":       entregue,
        };
    });

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, aba === "acareacao" ? "Acareações" : "Outros ativos");
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    XLSX.writeFile(wb, `ativos_${aba === "acareacao" ? "acareacoes" : "outros"}_${hoje}.xlsx`);
}

function _wacTrocarAba(aba) {
    _wacAba = aba;
    _wacRevalidarTransp = true; // mantém a transportadora se ela tiver conversa na aba nova
    document.querySelectorAll("#wac-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.aba === aba));
    _wacRenderizar();
}

// ── Separação por transportadora ──
// Vem do template usado no disparo, que já identifica a transportadora na hora de
// enviar. Conversa que o cliente abriu sozinho não tem disparo nosso, logo não tem
// transportadora — cai em "Sem transportadora" em vez de sumir do filtro.
function _wacTranspDe(conversa) {
    return _waTransportadoraDe(conversa.template_inicial) || "outras";
}

function _wacFiltrarTransp(chave) {
    _wacTransp = chave;
    _wacRenderizar();
}

// Barra fixa com todas as transportadoras do disparo. Sem "Todas": a tela é sempre a de
// uma transportadora só. A contagem ao lado de cada uma é que mostra onde tem trabalho.
function _wacRenderizarTranspTabs(itens) {
    const el = document.getElementById("wac-transp-tabs");
    // "Nos chamaram" não veio de disparo nosso, então não tem transportadora pra separar.
    if (_wacAba === "chamaram") { el.style.display = "none"; return; }
    el.style.display = "";

    const contagem = {};
    itens.forEach(r => { const k = _wacTranspDe(r); contagem[k] = (contagem[k] || 0) + 1; });

    const chaves = [...WA_TRANSPORTADORAS_ORDEM];
    // Rede de segurança: disparo com template fora do mapa (renomeado na Meta, por
    // exemplo) não pode sumir da tela — ganha uma aba própria, e só quando existe.
    if (contagem.outras) chaves.push("outras");

    // Sem "Todas", a tela precisa começar em alguma transportadora: pega a primeira que
    // tem conversa. Só reavalia na abertura e ao trocar de aba — durante o trabalho a
    // seleção nunca pula sozinha, nem quando a busca esvazia a coluna.
    if (_wacTransp === null || _wacRevalidarTransp) {
        if (!contagem[_wacTransp]) _wacTransp = chaves.find(k => contagem[k]) || chaves[0];
        _wacRevalidarTransp = false;
    }
    if (!chaves.includes(_wacTransp)) _wacTransp = chaves[0];

    el.innerHTML = chaves.map(k => {
        const t = WA_TRANSPORTADORAS[k] || { rotulo: "Outras", cor: "#8494a9" };
        return `<button type="button" class="wac-transp-tab${_wacTransp === k ? " active" : ""}"
                        style="--transp-cor:${t.cor}" onclick="_wacFiltrarTransp('${k}')"
                >${t.rotulo}<span class="wac-transp-n">${contagem[k] || 0}</span></button>`;
    }).join("");
}

function _wacRenderizar() {
    const termo = _wacTermoBusca();

    document.getElementById("wac-visao-acareacao").style.display = _wacAba === "acareacao" ? "" : "none";
    document.getElementById("wac-visao-outros").style.display    = _wacAba === "outros" ? "" : "none";
    document.getElementById("wac-visao-chamaram").style.display  = _wacAba === "chamaram" ? "" : "none";

    // A contagem da barra de transportadoras é do que a aba mostra, antes do filtro dela
    // mesma — senão a transportadora escolhida seria a única com número diferente de zero.
    const daAba = _wacDados.filter(r => _wacAbaDe(r) === _wacAba && _wacCasaBusca(r, termo));
    _wacRenderizarTranspTabs(daAba); // pode definir _wacTransp, então vem antes do filtro
    const visiveis = _wacAba === "chamaram" ? daAba : daAba.filter(r => _wacTranspDe(r) === _wacTransp);

    if (_wacAba === "chamaram") return _wacRenderizarChamaram(visiveis);
    if (_wacAba === "outros")   return _wacRenderizarDesfecho(visiveis, "wac-lista-outros", WA_COLUNAS_OUTROS);

    const grupos = {};
    WA_GRUPOS_PRAZO.forEach(g => { grupos[g.chave] = []; });
    // Chave inesperada não pode derrubar o funil inteiro — cria o balde na hora.
    visiveis.forEach(r => { const k = _wacStatusPrazo(r); (grupos[k] = grupos[k] || []).push(r); });

    document.getElementById("wac-lista").innerHTML = WA_COLUNAS_PRAZO.map(g => `
        <div class="wac-coluna">
            <div class="wac-coluna-header">
                <span>${g.titulo}</span><span class="wac-coluna-contagem">${grupos[g.chave].length}</span>
            </div>
            <div class="wac-coluna-cards wac-drop"
                 ondragover="_wacDropSobre(event)" ondragleave="_wacDropSaiu(event)" ondrop="_wacSoltar(event,null)">
                ${_wacCards(grupos[g.chave], g) || `<div class="wac-coluna-vazia">—</div>`}
            </div>
        </div>`).join("");

    // Segunda faixa, sempre visível. Os respondidos se abrem em duas colunas pelo
    // desfecho — são elas que recebem o card quando alguém arrasta pra resolver.
    const [gVencidos, gRespondidos] = WA_COLUNAS_FECHADAS;
    const fechadas = [
        { titulo: gVencidos.titulo, grupo: gVencidos,    itens: grupos.vencidos,                                          resultado: null },
        { titulo: "Recebido",       grupo: gRespondidos, itens: grupos.respondidos.filter(r => r.resultado === "recebeu"), resultado: "recebeu" },
        { titulo: "Não recebido",   grupo: gRespondidos, itens: grupos.respondidos.filter(r => r.resultado !== "recebeu"), resultado: "nao_recebeu" },
    ];

    document.getElementById("wac-lista-fechados").innerHTML = fechadas.map(c => `
        <div class="wac-coluna">
            <div class="wac-coluna-header">
                <span>${c.titulo}</span><span class="wac-coluna-contagem">${c.itens.length}</span>
            </div>
            <div class="wac-coluna-cards wac-drop"
                 ondragover="_wacDropSobre(event)" ondragleave="_wacDropSaiu(event)"
                 ondrop="_wacSoltar(event,${c.resultado ? `'${c.resultado}'` : "null"})">
                ${_wacCards(c.itens, c.grupo) || `<div class="wac-coluna-vazia">—</div>`}
            </div>
        </div>`).join("");
}

// O cabeçalho mostra só o número, nunca o nome do cliente — contato não salvo, como
// aparece de verdade, o que dá credibilidade ao print enviado à transportadora.
function _wacAbrirConversa(numero, pedido, resolvido) {
    _wacNumeroAtual = numero;
    _wacPedidoAtual = pedido || "";
    _wacResolvidoAtual = resolvido === true || resolvido === "true";
    _wacPrecisaDestacar = true; // só nesta abertura
    _wacSelecionadas.clear();
    document.getElementById("wac-chat-nome").innerText = _wacFormatarNumero(numero);
    document.getElementById("wac-chat-numero").innerText = "";
    mostrarTela("tela-whatsapp-conversa-chat");
    _wacCarregarConversa();
    // Recarrega sozinho enquanto a conversa está aberta, pra resposta do cliente
    // aparecer sem precisar sair e entrar de novo. 30s é folgado pro ritmo de uma
    // conversa e evita 360 consultas por hora numa aba esquecida aberta.
    if (_wacAutoRefresh) clearInterval(_wacAutoRefresh);
    _wacAutoRefresh = setInterval(() => {
        const tela = document.getElementById("tela-whatsapp-conversa-chat");
        if (!tela || !tela.classList.contains("active-view")) { clearInterval(_wacAutoRefresh); _wacAutoRefresh = null; return; }
        _wacCarregarConversa(true);
    }, 30000);
}

// 5549999276131 → +55 49 99927-6131
function _wacFormatarNumero(numero) {
    const n = String(numero).replace(/\D/g, "");
    const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${n}`;
}

function _wacEscapar(s) {
    const div = document.createElement("div");
    div.innerText = s || "";
    return div.innerHTML.replace(/\n/g, "<br>");
}

// silencioso: recarrega sem piscar "Carregando..." (usado pelo auto-refresh)
function _wacCarregarConversa(silencioso) {
    const body = document.getElementById("wac-chat-body");
    if (!silencioso) body.innerHTML = `<div style="text-align:center;color:#8494a9;font-size:13px;padding:20px">Carregando...</div>`;

    return fetch(`${API}/admin/whatsapp/conversa/${_wacNumeroAtual}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            if (!Array.isArray(rows) || !rows.length) {
                body.innerHTML = `<div style="text-align:center;color:#8494a9;font-size:13px;padding:20px">Nenhuma mensagem encontrada.</div>`;
                return;
            }
            const scrollAnterior = body.scrollTop;
            body.innerHTML = rows.map(m => {
                const hora  = new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                const check = m.direcao === "enviada" ? `<span class="wac-check">✓</span>` : "";
                const sel   = _wacSelecionadas.has(m.id) ? " selecionada" : "";
                const ped   = m.pedido ? ` data-pedido="${m.pedido}"` : "";
                // Quem do time disparou — várias pessoas usam o mesmo número da empresa.
                const autor = m.autor ? `<span class="wac-bubble-autor">${_wacEscapar(m.autor)}</span>` : "";
                return `<div class="wac-bubble ${m.direcao}${sel}"${ped} onclick="_wacAlternarSelecao('${m.id}')">${autor}${_wacEscapar(m.texto)}<span class="wac-bubble-hora">${hora} ${check}</span></div>`;
            }).join("");
            // Só desce sozinho na abertura; no auto-refresh respeita onde a pessoa estava.
            body.scrollTop = silencioso ? scrollAnterior : body.scrollHeight;
            // Vai até a mensagem do pedido uma única vez, ao abrir pelo card. Depois disso
            // (ex.: mandou uma mensagem e a conversa recarregou) fica onde deveria: no fim.
            if (!silencioso && _wacPrecisaDestacar) {
                _wacPrecisaDestacar = false;
                _wacDestacarPedido(body);
            }
            _wacAtualizarBarraSelecao();
        })
        .catch(() => { body.innerHTML = `<div style="text-align:center;color:#ef4444;font-size:13px;padding:20px">Erro ao carregar conversa.</div>`; });
}

// Abriu por um card de pedido: leva direto pra mensagem daquele pedido e pisca nela,
// senão numa conversa com vários pedidos a pessoa cairia no fim sem saber qual é qual.
function _wacDestacarPedido(body) {
    if (!_wacPedidoAtual) return;
    const alvo = body.querySelector(`.wac-bubble[data-pedido="${CSS.escape(_wacPedidoAtual)}"]`);
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center" });
    alvo.classList.add("destacada");
    setTimeout(() => alvo.classList.remove("destacada"), 2000);
}

// ── Arrastar e soltar entre as colunas ──
// Arrastar pra "Recebido"/"Não recebido" resolve o pedido; arrastar de volta pra uma
// coluna de prazo reabre. É o mesmo endpoint do botão ✓, só que sem passar pelo modal.
let _wacArrastando = null;

function _wacArrastarInicio(ev, numero, pedido) {
    _wacArrastando = { numero, pedido };
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", pedido || numero);
    ev.currentTarget.classList.add("arrastando");
}

function _wacArrastarFim(ev) {
    ev.currentTarget.classList.remove("arrastando");
    _wacArrastando = null;
    document.querySelectorAll(".wac-drop.sobre").forEach(e => e.classList.remove("sobre"));
}

function _wacDropSobre(ev) { ev.preventDefault(); ev.currentTarget.classList.add("sobre"); }
function _wacDropSaiu(ev)  { ev.currentTarget.classList.remove("sobre"); }

// resultado null = reabrir (voltou pra uma coluna de prazo)
function _wacSoltar(ev, resultado) {
    ev.preventDefault();
    ev.currentTarget.classList.remove("sobre");
    if (!_wacArrastando) return;
    const { numero, pedido } = _wacArrastando;
    _wacArrastando = null;

    fetch(`${API}/admin/whatsapp/resolver`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(resultado
            ? { pedido, numero, resolvido: true, resultado, mensagem_ids: [] }
            : { pedido, numero, resolvido: false })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) { gcAlert(body.error || "Erro ao mover."); return; }
        _wacCarregarLista();
    })
    .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

// ── Marcação manual de resolvido ──
// Vale tanto pelo card no funil (rápido, sem abrir a conversa) quanto pela mensagem
// selecionada dentro do chat (aí a mensagem fica gravada como prova da decisão).
let _wacResultadoAlvo = null; // { pedido, numero, mensagem_ids, noChat }

function _wacAbrirModalResultado() {
    if (!_wacSelecionadas.size) return;
    const n = _wacSelecionadas.size;
    _wacResultadoAlvo = {
        pedido: _wacPedidoAtual, numero: _wacNumeroAtual,
        mensagem_ids: [..._wacSelecionadas], noChat: true
    };
    document.getElementById("wac-resultado-msg").innerText =
        `${n} mensagem${n !== 1 ? "s" : ""} selecionada${n !== 1 ? "s" : ""}` +
        (_wacPedidoAtual ? ` como resposta do pedido ${_wacPedidoAtual}.` : ".") +
        " O que o cliente respondeu?";
    document.getElementById("wac-resultado-overlay").style.display = "";
}

function _wacReabrirPeloCard(event, numero, pedido) {
    event.stopPropagation();
    fetch(`${API}/admin/whatsapp/resolver`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, numero, resolvido: false })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) { gcAlert(body.error || "Erro ao reabrir."); return; }
        _wacCarregarLista();
    })
    .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

function _wacFecharModalResultado() {
    document.getElementById("wac-resultado-overlay").style.display = "none";
    _wacResultadoAlvo = null;
}

function _wacConfirmarResultado(resultado) {
    if (!_wacResultadoAlvo) return;
    const alvo = _wacResultadoAlvo;
    fetch(`${API}/admin/whatsapp/resolver`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            pedido: alvo.pedido, numero: alvo.numero, resolvido: true,
            resultado, mensagem_ids: alvo.mensagem_ids
        })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) { gcAlert(body.error || "Erro ao salvar."); return; }
        _wacFecharModalResultado();
        if (alvo.noChat) { _wacResolvidoAtual = true; _wacLimparSelecao(); }
        else _wacCarregarLista();
    })
    .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

// ── Seleção e exclusão de mensagens ──
function _wacAlternarSelecao(id) {
    if (_wacSelecionadas.has(id)) _wacSelecionadas.delete(id);
    else _wacSelecionadas.add(id);
    document.querySelectorAll(".wac-bubble").forEach(b => {
        const bid = (b.getAttribute("onclick") || "").match(/'([^']+)'/);
        if (bid) b.classList.toggle("selecionada", _wacSelecionadas.has(bid[1]));
    });
    _wacAtualizarBarraSelecao();
}

function _wacAtualizarBarraSelecao() {
    const barra = document.getElementById("wac-selecao-barra");
    if (!barra) return;
    const n = _wacSelecionadas.size;
    barra.style.display = n ? "" : "none";
    if (n) document.getElementById("wac-selecao-contagem").innerText =
        `${n} mensagem${n !== 1 ? "s" : ""} selecionada${n !== 1 ? "s" : ""}`;
}

function _wacLimparSelecao() {
    _wacSelecionadas.clear();
    document.querySelectorAll(".wac-bubble.selecionada").forEach(b => b.classList.remove("selecionada"));
    _wacAtualizarBarraSelecao();
}

function _wacExcluirSelecionadas() {
    const ids = [..._wacSelecionadas];
    if (!ids.length) return;
    gcConfirm(
        `Excluir ${ids.length} mensagem${ids.length !== 1 ? "s" : ""} do histórico do sistema? ` +
        `Isso não apaga nada no WhatsApp do cliente — só some daqui e do print.`,
        () => {
            fetch(`${API}/admin/whatsapp/excluir-mensagens`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ ids })
            })
            .then(r => r.json().then(body => ({ ok: r.ok, body })))
            .then(({ ok, body }) => {
                if (!ok) { gcAlert(body.error || "Erro ao excluir."); return; }
                _wacLimparSelecao();
                _wacCarregarConversa(true); // sem piscar a conversa toda
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
        },
        "Excluir mensagens", "Excluir"
    );
}

// Resposta livre — só funciona dentro da janela de 24h aberta pelo cliente (sem template).
function _wacResponderEnviar() {
    const input = document.getElementById("wac-compose-input");
    const texto = input.value.trim();
    if (!texto || !_wacNumeroAtual) return;

    input.disabled = true;
    fetch(`${API}/admin/whatsapp/responder`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ numero: _wacNumeroAtual, texto })
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        input.disabled = false;
        if (!ok) {
            if (body.detalhe) console.error("[whatsapp] recusa da Meta:", body.detalhe);
            gcAlert(body.error || "Erro ao enviar.");
            return;
        }
        input.value = "";
        input.focus();
        // Recarrega sem piscar "Carregando..." e desce até a mensagem recém-enviada —
        // a recarga completa fazia a conversa sumir e voltar a cada envio.
        _wacCarregarConversa(true).then(() => {
            const corpo = document.getElementById("wac-chat-body");
            if (corpo) corpo.scrollTop = corpo.scrollHeight;
        });
    })
    .catch(() => { input.disabled = false; gcAlert("Erro ao conectar com o servidor."); });
}
