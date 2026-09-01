// ───── CONFERÊNCIAS: A BARRA ÚNICA ─────
//
// Antes, "conferir" aparecia em dois lugares do menu ao mesmo tempo: um menu
// "Conferências" com uma transportadora por link, e um subgrupo "Conferência"
// dentro do menu Shopee. A pergunta "onde fica X?" nunca tinha resposta óbvia.
//
// Agora é um menu só. A transportadora virou ABA, não item de menu — pelo mesmo
// motivo do Planejamento de Rotas: a lista de transportadoras cresce, e cada uma
// que entrasse no menu deixaria a barra lateral mais alta sem dizer nada de novo.
// Transportadora nova aqui é uma linha em _CHUB_TRANSP.
//
// A barra não é uma tela: ela é DESENHADA DENTRO de cada tela que participa, por
// mostrarTela(). É o que faz o destaque continuar certo quando a pessoa chega por
// link direto (xmtt.com.br/Shopee/Atribuicoes) ou pelo botão voltar do navegador,
// e não só quando ela clica na aba.

// Sem cor por transportadora: a aba usa o azul do sistema, como o resto. Cor
// aqui competiria com as cores que JÁ significam alguma coisa nas telas de
// baixo — progresso, situação do pacote — e a aba não precisa de cor pra dizer
// qual está aberta.
const _CHUB_TRANSP = [
    { chave: "shopee", rotulo: "Shopee" },
    { chave: "loggi",  rotulo: "Loggi"  },
    { chave: "anjun",  rotulo: "Anjun"  },
    { chave: "imile",  rotulo: "Imile"  },
    { chave: "jt",     rotulo: "J&T"    },
];

// A Shopee tem mais de um tipo de conferência porque é a única que exporta os
// dados da rota. As outras têm só a conferência por arquivo — e é por isso que a
// linha de sub-abas aparece só nela, em vez de nascer vazia nas demais.
const _CHUB_SUBS = {
    shopee: [
        { chave: "linehaul",    rotulo: "Line Haul",   abrir: () => abrirShopeeLineHaul() },
        { chave: "atribuicoes", rotulo: "Atribuições", abrir: () => abrirShopeeAtribuicoes() },
        // Sem "Por arquivo": a conferência da Shopee é a de Line Haul e a de
        // Atribuições, que saem dos dados que ela exporta. A por arquivo é o
        // recurso das transportadoras que não exportam nada. A tela continua
        // existindo e a rota Conferencias/Shopee segue valendo por URL.
    ],
};

// O que NÃO é de uma transportadora só. "Entregadores" mostra o que cada
// entregador está conferindo, e a conferência dele pega a rota inteira — os
// pacotes das várias transportadoras que ele leva no mesmo carro. Por isso sai
// de dentro da Shopee: ali dizia que a coisa era da Shopee, e não é.
const _CHUB_ACOES = [
    { chave: "entregadores", rotulo: "Entregadores", abrir: () => abrirShopeeConfEntregadores() },
];

// Telas que ganham a barra. tela-conferencias atende as cinco transportadoras, e
// por isso a transportadora dela sai de _confTransp, não deste mapa.
const _CHUB_TELAS = {
    // Sem sub-aba: a conferência por arquivo é a única das transportadoras que
    // não exportam dados, e a Shopee não oferece mais essa opção. Quem chegar
    // aqui por URL vê a aba da transportadora marcada e nenhuma sub — que é a
    // verdade: esta tela não é uma das conferências da Shopee.
    "tela-conferencias":             {},
    "tela-shopee-linehaul":          { transp: "shopee", sub: "linehaul" },
    "tela-shopee-atribuicoes":       { transp: "shopee", sub: "atribuicoes" },
    "tela-shopee-conf-entregadores": { acao: "entregadores" },
    "tela-alimentar":                { alimentar: true },
};

let _chubTransp = "shopee";   // aba aberta agora
let _chubStatus = {};         // transportadora -> resposta de /alimentar/status

function _chubEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _chubInfo(chave) {
    return _CHUB_TRANSP.find(t => t.chave === chave) || _CHUB_TRANSP[0];
}

/** A transportadora tem arquivo pra alimentar? Hoje só a Shopee exporta. */
function _chubTemAlimentar(transp) {
    return transp === "shopee";
}

// ───── Navegação ─────

/** Abre a última aba usada (Shopee na primeira vez da sessão). */
function abrirConferenciasHub(event) {
    if (event) event.preventDefault();
    _chubIr(_chubTransp);
}

/** Abre a conferência de uma transportadora. */
function _chubIr(transp) {
    _chubTransp = transp;
    const subs = _CHUB_SUBS[transp];
    if (subs) subs[0].abrir();
    else abrirConferencias(null, transp);
}

/** Troca de sub-aba dentro da mesma transportadora. */
function _chubIrSub(chave) {
    const sub = (_CHUB_SUBS[_chubTransp] || []).find(s => s.chave === chave);
    if (sub) sub.abrir();
}

// ───── A barra ─────

/**
 * Desenha a barra dentro da tela recém-aberta.
 *
 * Chamada por mostrarTela(), que é por onde TODA navegação passa — inclusive a
 * que vem de link direto e a do botão voltar. Tela de fora do mapa não tem o que
 * desenhar e sai na primeira linha.
 */
function _chubPintar(telaId) {
    const conf = _CHUB_TELAS[telaId];
    const tela = document.getElementById(telaId);
    if (!conf || !tela) return;

    // A tela de conferência por arquivo é compartilhada pelas cinco: quem manda
    // é a transportadora que ela acabou de carregar.
    const transp = conf.alimentar ? _chubTransp
                 : conf.transp || (typeof _confTransp !== "undefined" && _confTransp) || _chubTransp;
    _chubTransp = transp;

    let barra = tela.querySelector(":scope > .chub");
    if (!barra) {
        barra = document.createElement("div");
        barra.className = "chub";
        tela.insertBefore(barra, tela.firstChild);
    }
    barra.innerHTML = _chubHtml(transp, conf);

    // Destaca o menu lateral. Antes quem fazia isso era o link do submenu, que
    // nao existe mais: sem esta linha a barra lateral ficaria sem marca nenhuma
    // em toda tela de conferencia.
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
    const item = document.getElementById("menu-conferencias");
    if (item) item.classList.add("active");

    if (_chubTemAlimentar(transp)) _chubCarregarStatus(transp);
}

function _chubHtml(transp, conf) {
    // Tela que vale pra todas as transportadoras não marca aba nenhuma: marcar
    // uma diria que a pessoa está dentro daquela transportadora, e não está.
    const transversal = !!(conf.alimentar || conf.acao);
    const abaAtiva = transversal ? null : transp;

    const abas = _CHUB_TRANSP.map(t => `
        <button type="button" class="chub-tab${t.chave === abaAtiva ? " active" : ""}"
                onclick="_chubIr('${t.chave}')">${_chubEsc(t.rotulo)}</button>`).join("");

    const subs = _CHUB_SUBS[transp] || [];
    const subAtiva = transversal ? null : conf.sub;
    const linhaSubs = subs.length ? `
        <div class="chub-subs">
            ${subs.map(s => `
                <button type="button" class="chub-sub${s.chave === subAtiva ? " active" : ""}"
                        onclick="_chubIrSub('${s.chave}')">${_chubEsc(s.rotulo)}</button>`).join("")}
        </div>` : "";

    const acoes = _CHUB_ACOES.map(a => `
        <button type="button" class="chub-acao${conf.acao === a.chave ? " active" : ""}"
                onclick="_chubAcao('${a.chave}')">${_chubEsc(a.rotulo)}</button>`).join("");

    const alimentar = _chubTemAlimentar(transp) ? `
        <button type="button" class="chub-acao${conf.alimentar ? " active" : ""}" onclick="abrirPainelAlimentar(event)">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Alimentar<span class="chub-badge" id="chub-badge" style="display:none"></span>
        </button>` : "";

    return `<div class="chub-topo"><div class="chub-tabs">${abas}</div>`
        + `<div class="chub-acoes">${acoes}${alimentar}</div></div>${linhaSubs}`;
}

function _chubAcao(chave) {
    const acao = _CHUB_ACOES.find(a => a.chave === chave);
    if (acao) acao.abrir();
}

// ───── "Alimentar" ─────

/**
 * Quantas fontes ainda não foram alimentadas hoje.
 *
 * O número no botão é o ponto todo: sem ele, descobrir que faltou alimentar
 * significava abrir a conferência e ver zero pacote — o que parece defeito da
 * conferência, não falta de carga.
 */
function _chubCarregarStatus(transp, forcar) {
    const pintar = () => {
        const badge = document.getElementById("chub-badge");
        const d = _chubStatus[transp];
        if (!badge || !d) return;
        badge.style.display = d.pendentes ? "" : "none";
        badge.innerText = d.pendentes || "";
    };
    if (_chubStatus[transp] && !forcar) { pintar(); return; }

    fetch(`${API}/alimentar/status?transportadora=${encodeURIComponent(transp)}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(d => {
        if (!d || d.error) return;
        _chubStatus[transp] = d;
        pintar();
        _chubPintarAlimentar();
    })
    .catch(() => {
        const empty = document.getElementById("alim-empty");
        if (empty && empty.style.display !== "none") empty.innerText = "Erro ao conectar com o servidor.";
    });
}

// Nome com "Painel" de proposito: abrirAlimentar ja existe no alimentar.js, que
// e a tela de Alimentar Separacao do menu Operacao (a que abastece as bipagens).
// Como este arquivo carrega depois, uma funcao de mesmo nome SOBRESCREVE a outra
// em silencio - e foi o que aconteceu: clicar em "Alimentar separacao > Loggi"
// abria este painel.
function abrirPainelAlimentar(event) {
    if (event) event.preventDefault();
    document.getElementById("alim-titulo").innerText = "Alimentar — " + _chubInfo(_chubTransp).rotulo;
    mostrarTela("tela-alimentar", "Conferencias/Alimentar");
    // Sempre rebusca: a pessoa costuma voltar aqui logo depois de alimentar, e
    // uma resposta em cache diria que ainda falta o que ela acabou de mandar.
    _chubPintarCarregando();
    _chubCarregarStatus(_chubTransp, true);
}

function _chubPintarCarregando() {
    const empty = document.getElementById("alim-empty");
    const lista = document.getElementById("alim-lista");
    if (!empty || !lista) return;
    empty.style.display = "";
    empty.innerText = "Carregando...";
    lista.style.display = "none";
}

function _chubPintarAlimentar() {
    const empty = document.getElementById("alim-empty");
    const lista = document.getElementById("alim-lista");
    if (!empty || !lista) return;

    const d = _chubStatus[_chubTransp];
    const fontes = (d && d.fontes) || [];
    if (!fontes.length) {
        empty.style.display = "";
        empty.innerText = _chubInfo(_chubTransp).rotulo
            + " não tem arquivo pra alimentar — a conferência dela é por arquivo, na própria aba.";
        lista.style.display = "none";
        return;
    }
    empty.style.display = "none";
    lista.style.display = "";
    lista.innerHTML = fontes.map(_chubCardHtml).join("");
}

const _CHUB_SITUACAO = {
    hoje:   { cor: "#22c55e", texto: "Alimentado hoje" },
    antiga: { cor: "#f59e0b", texto: "Carga de outro dia" },
    nunca:  { cor: "#ef4444", texto: "Nunca alimentado" },
};

function _chubCardHtml(f) {
    const s = _CHUB_SITUACAO[f.situacao] || _CHUB_SITUACAO.nunca;
    const quando = f.importado_em ? _chubQuando(f.importado_em) : "—";
    const total = Number(f.total || 0);
    return `
    <div class="alim-card" style="--alim-c:${s.cor}">
        <div class="alim-card-topo">
            <span class="alim-card-nome">${_chubEsc(f.rotulo)}</span>
            <span class="alim-card-tag">${s.texto}</span>
        </div>
        <div class="alim-card-desc">${_chubEsc(f.descricao)}</div>
        <div class="alim-card-desc alim-card-sustenta">Sustenta: ${_chubEsc(f.sustenta)}</div>
        <div class="alim-card-meta">
            <span>Última carga: <strong>${_chubEsc(quando)}</strong></span>
            ${f.importado_por ? `<span>por ${_chubEsc(f.importado_por)}</span>` : ""}
            <span>${total.toLocaleString("pt-BR")} linha${total === 1 ? "" : "s"} no sistema</span>
        </div>
        <div class="alim-card-modo">${f.acumula
            ? "Cada envio SOMA ao que já está lá."
            : "Cada envio SUBSTITUI a carga inteira."}</div>
        <button type="button" class="usr-modal-btn-primary alim-card-btn"
                onclick="_chubAbrirFonte('${f.chave}')">Abrir ${_chubEsc(f.rotulo)}</button>
    </div>`;
}

/** Data e hora no formato que a operação lê, no fuso de Brasília. */
function _chubQuando(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

// As telas de envio continuam as mesmas, no menu da transportadora. Este painel
// é atalho e diagnóstico — não duplica o formulário de upload.
const _CHUB_FONTES_ABRIR = {
    romaneiro: () => abrirShopeeRomaneiro(),
    at:        () => abrirShopeeAT(),
};

function _chubAbrirFonte(chave) {
    const abrir = _CHUB_FONTES_ABRIR[chave];
    if (abrir) abrir();
}
