// ───── TRANSPORTADORAS: A BARRA ÚNICA ─────
//
// Nasceu como barra das conferências e virou a casa de cada transportadora: um
// item só no menu lateral, com uma aba por transportadora e, na linha de baixo,
// a mesma lista de funções na mesma ordem — sempre o que já existe no sistema.
// A transportadora é ABA, não item de menu: a lista cresce, e cada uma que
// entrasse no menu deixaria a barra lateral mais alta sem dizer nada de novo.
// Transportadora nova aqui é uma linha em _CHUB_TRANSP.
//
// A Separação NÃO entra aqui de propósito: ela é geral, bipa pacote de qualquer
// transportadora. O que cada uma tem é o Alimentar, que abastece essa separação.
//
// A barra não é uma tela: ela é DESENHADA DENTRO de cada tela que participa, por
// mostrarTela(). É o que faz o destaque continuar certo quando a pessoa chega por
// link direto (xmtt.com.br/Shopee/Atribuicoes) ou pelo botão voltar do navegador,
// e não só quando ela clica na aba.

// Sem cor por transportadora: a aba usa o azul do sistema, como o resto. Cor
// aqui competiria com as cores que JÁ significam alguma coisa nas telas de
// baixo — progresso, situação do pacote — e a aba não precisa de cor pra dizer
// qual está aberta.
//   falta:    como ela aparece nos Pacotes Faltantes
//   extravio: como reconhecê-la na planilha de extravios, que tem grafia livre
//   ativo:    nome dela na rota das conversas; sem ele, ela não tem modelo de ativo
const _CHUB_TRANSP = [
    { chave: "shopee",        rotulo: "Shopee",        falta: "Shopee",        extravio: /shopee|spx/, ativo: "Shopee" },
    { chave: "loggi",         rotulo: "Loggi",         falta: "Loggi",         extravio: /loggi/ },
    { chave: "anjun",         rotulo: "Anjun",         falta: "Anjun",         extravio: /anjun/,      ativo: "Anjun" },
    { chave: "imile",         rotulo: "Imile",         falta: "Imile",         extravio: /imile/,      ativo: "iMile" },
    { chave: "jt",            rotulo: "J&T",           falta: "J&T Express",   extravio: /jt/,         ativo: "JT" },
    { chave: "total_express", rotulo: "Total Express", falta: "Total Express", extravio: /total/ },
];

// Quem vê cada função. Sem `roles`, todo mundo que enxerga esta barra. É só o que
// aparece: quem manda de verdade é o servidor, em cada rota.
const _CHUB_ROLES_TORRE  = ["admin", "dev", "finance", "sac"];
const _CHUB_ROLES_ATIVOS = ["sac", "dev", "admin"];
const _CHUB_ROLES_ETIQ   = ["user", "admin", "finance", "dev"];

/** As funções que toda transportadora tem, depois das de alimentar e conferir. */
function _chubComuns(t) {
    const itens = [
        { chave: "narua",     rotulo: "Na Rua",            roles: _CHUB_ROLES_TORRE, abrir: () => abrirTorreNaRua(null, t.chave) },
        { chave: "etiquetas", rotulo: "Etiquetas",         roles: _CHUB_ROLES_ETIQ,  abrir: () => { abrirEtiquetas(); _etqSelecionarTransp(t.chave); } },
        { chave: "faltantes", rotulo: "Pacotes Faltantes", abrir: () => _chubAbrirFaltantes(t) },
        { chave: "extravios", rotulo: "Extravios",         roles: _CHUB_ROLES_TORRE, abrir: () => abrirExtraviosRegistros(null, t.extravio) },
    ];
    if (t.ativo) itens.push({ chave: "ativos", rotulo: "Ativos", roles: _CHUB_ROLES_ATIVOS, abrir: () => abrirWhatsappConversas(null, { transp: t.ativo }) });
    return itens;
}

// Quem é da torre vê a lista de todos; os demais só registram, como no menu Galpão.
function _chubAbrirFaltantes(t) {
    if (_CHUB_ROLES_TORRE.includes(_chubRole())) return abrirPacotesFaltantesAdmin(null, t.falta);
    abrirPacotesFaltantes();
    _pfSelecionarTransp(t.falta);
}

// `inicio` é por onde a transportadora abre. A Shopee tem duas conferências porque
// é a única que exporta os dados da rota; a por arquivo é o recurso das que não
// exportam nada, e a tela dela atende qualquer transportadora.
const _CHUB_SUBS = Object.fromEntries(_CHUB_TRANSP.map(t => [t.chave, t.chave === "shopee" ? [
    { chave: "recebimento", rotulo: "Recebimento",   abrir: () => abrirShopeeReceber() },
    { chave: "alimentar",   rotulo: "Alimentar",     abrir: () => abrirPainelAlimentar() },
    { chave: "linehaul",    rotulo: "Line Haul",     abrir: () => abrirShopeeLineHaul(), inicio: true },
    { chave: "atribuicoes", rotulo: "Atribuições",   abrir: () => abrirShopeeAtribuicoes() },
    ..._chubComuns(t),
    { chave: "stuck",       rotulo: "Stuck",         abrir: () => abrirShopeeStuck() },
    { chave: "backlog",     rotulo: "Backlog",       abrir: () => abrirShopeeStuckBacklog() },
    { chave: "avariado",    rotulo: "Item Avariado", abrir: () => abrirShopeeAvariado() },
    { chave: "pod",         rotulo: "POD",           roles: ["dev"], abrir: () => abrirPodSemanal() },
] : [
    { chave: "alimentar",   rotulo: "Alimentar",     abrir: () => abrirAlimentar(null, t.chave) },
    { chave: "conferencia", rotulo: "Conferência",   abrir: () => abrirConferencias(null, t.chave), inicio: true },
    ..._chubComuns(t),
]]));

// O que NÃO é de uma transportadora só. "Entregadores" mostra o que cada
// entregador está conferindo, e a conferência dele pega a rota inteira — os
// pacotes das várias transportadoras que ele leva no mesmo carro. Por isso sai
// de dentro da Shopee: ali dizia que a coisa era da Shopee, e não é.
const _CHUB_ACOES = [
    { chave: "entregadores", rotulo: "Entregadores", abrir: () => abrirShopeeConfEntregadores() },
];

// Telas que ganham a barra.
//   da:           de onde sai a transportadora, nas telas que atendem várias
//   soPelaBarra:  a tela também abre fora daqui, valendo pra todas — nesse caso a
//                 barra não aparece, senão diria que ela é de uma transportadora só
const _CHUB_TELAS = {
    "tela-conferencias":             { sub: "conferencia", da: () => typeof _confTransp !== "undefined" && _confTransp },
    "tela-alimentar":                { sub: "alimentar",   da: () => typeof _alimentarTransp !== "undefined" && _alimentarTransp },
    "tela-torre-na-rua":             { sub: "narua",       da: () => typeof _nrTransp !== "undefined" && _nrTransp },
    "tela-painel-alimentar":         { transp: "shopee", sub: "alimentar" },
    "tela-shopee-romaneiro":         { transp: "shopee", sub: "alimentar" },
    "tela-shopee-at":                { transp: "shopee", sub: "alimentar" },
    "tela-shopee-pedidos":           { transp: "shopee", sub: "alimentar" },
    "tela-shopee-receber":           { transp: "shopee", sub: "recebimento" },
    "tela-shopee-linehaul":          { transp: "shopee", sub: "linehaul" },
    "tela-shopee-atribuicoes":       { transp: "shopee", sub: "atribuicoes" },
    "tela-shopee-stuck":             { transp: "shopee", sub: "stuck" },
    "tela-shopee-stuck-backlog":     { transp: "shopee", sub: "backlog" },
    "tela-shopee-avariado":          { transp: "shopee", sub: "avariado" },
    "tela-shopee-conf-entregadores": { acao: "entregadores" },
    "tela-etiquetas":                { sub: "etiquetas", soPelaBarra: true },
    "tela-pacotes-faltantes":        { sub: "faltantes", soPelaBarra: true },
    "tela-torre-pacotes-faltantes":  { sub: "faltantes", soPelaBarra: true },
    "tela-extravios-registros":      { sub: "extravios", soPelaBarra: true },
    "tela-whatsapp-conversas":       { sub: "ativos",    soPelaBarra: true },
    "tela-pod-semanal":              { transp: "shopee", sub: "pod", soPelaBarra: true },
};

let _chubTransp = "shopee";   // aba aberta agora
let _chubSub    = null;       // função aberta agora: trocar de aba tenta ficar nela
let _chubStatus = {};         // transportadora -> resposta de /alimentar/status
let _chubPelaBarra = false;   // a tela abrindo agora saiu de um clique na barra

function _chubEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _chubInfo(chave) {
    return _CHUB_TRANSP.find(t => t.chave === chave) || _CHUB_TRANSP[0];
}

function _chubRole() {
    return typeof window !== "undefined" && window._gcUser ? window._gcUser.role : null;
}

function _chubPode(item) {
    return !item.roles || item.roles.includes(_chubRole());
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

/** Abre uma transportadora, na mesma função em que a pessoa estava, se ela tiver. */
function _chubIr(transp) {
    _chubTransp = transp;
    // O polo decide o XPT de tudo na Shopee: a pergunta vem já na abertura da aba.
    if (transp === "shopee" && typeof gcPoloGarantir === "function") gcPoloGarantir();
    const subs = (_CHUB_SUBS[transp] || []).filter(_chubPode);
    _chubAbrirItem(subs.find(s => s.chave === _chubSub) || subs.find(s => s.inicio));
}

/** Troca de função dentro da mesma transportadora. */
function _chubIrSub(chave) {
    const sub = (_CHUB_SUBS[_chubTransp] || []).find(s => s.chave === chave);
    if (sub) _chubAbrirItem(sub);
}

function _chubAbrirItem(item) {
    if (!item) return;
    _chubPelaBarra = true;
    try { item.abrir(); } finally { _chubPelaBarra = false; }
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

    let barra = tela.querySelector(":scope > .chub");
    if (conf.soPelaBarra && !_chubPelaBarra) {
        if (barra) barra.remove();
        return;
    }

    // Tela compartilhada: quem manda é a transportadora que ela acabou de carregar.
    const transp = conf.transp || (conf.da && conf.da()) || _chubTransp;
    _chubTransp = transp;
    _chubSub = conf.sub || null;

    if (!barra) {
        barra = document.createElement("div");
        barra.className = "chub";
        tela.insertBefore(barra, tela.firstChild);
    }
    barra.innerHTML = _chubHtml(transp, conf);

    // Destaca o menu lateral. Antes quem fazia isso era o link do submenu, que
    // nao existe mais: sem esta linha a barra lateral ficaria sem marca nenhuma
    // em toda tela de transportadora.
    document.querySelectorAll(".menu-item").forEach(m => m.classList.remove("active"));
    const item = document.getElementById("menu-conferencias");
    if (item) item.classList.add("active");

    if (_chubTemAlimentar(transp)) _chubCarregarStatus(transp);
}

function _chubHtml(transp, conf) {
    // Tela que vale pra todas as transportadoras não marca aba nenhuma: marcar
    // uma diria que a pessoa está dentro daquela transportadora, e não está.
    const transversal = !!conf.acao;
    const abaAtiva = transversal ? null : transp;

    const abas = _CHUB_TRANSP.map(t => `
        <button type="button" class="chub-tab${t.chave === abaAtiva ? " active" : ""}"
                onclick="_chubIr('${t.chave}')">${_chubEsc(t.rotulo)}</button>`).join("");

    const subs = (_CHUB_SUBS[_chubInfo(transp).chave] || []).filter(_chubPode);
    const subAtiva = transversal ? null : conf.sub;
    // O número de cargas atrasadas mora no Alimentar, e só em quem tem o que alimentar.
    const badge = `<span class="chub-badge" id="chub-badge" style="display:none"></span>`;
    const linhaSubs = subs.length ? `
        <div class="chub-subs">
            ${subs.map(s => `
                <button type="button" class="chub-sub${s.chave === subAtiva ? " active" : ""}"
                        onclick="_chubIrSub('${s.chave}')">${_chubEsc(s.rotulo)}${
                            s.chave === "alimentar" && _chubTemAlimentar(transp) ? badge : ""}</button>`).join("")}
        </div>` : "";

    const acoes = _CHUB_ACOES.map(a => `
        <button type="button" class="chub-acao${conf.acao === a.chave ? " active" : ""}"
                onclick="_chubAcao('${a.chave}')">${_chubEsc(a.rotulo)}</button>`).join("");

    return `<div class="chub-topo"><div class="chub-tabs">${abas}</div>`
        + `<div class="chub-acoes">${acoes}</div></div>${linhaSubs}`;
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
        // Cada tela tem a sua barra, todas com o mesmo id: vale a da tela aberta.
        const badge = document.querySelector(".view.active-view #chub-badge");
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
    // Este painel é o da Shopee; as demais alimentam pela tela de Alimentar Separação.
    _chubTransp = "shopee";
    document.getElementById("alim-titulo").innerText = "Alimentar — " + _chubInfo(_chubTransp).rotulo;
    mostrarTela("tela-painel-alimentar", "Conferencias/Alimentar");
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
    // Pedidos pesquisados não conta como pendência (a operação parou de alimentar),
    // mas a tela segue no ar e este é o caminho até ela.
    lista.innerHTML = fontes.map(_chubCardHtml).join("") + `
        <button type="button" class="chub-acao" onclick="abrirShopeePedidos()">Pedidos pesquisados</button>`;
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

// As telas de envio continuam as mesmas, dentro da aba da transportadora. Este
// painel é atalho e diagnóstico — não duplica o formulário de upload.
const _CHUB_FONTES_ABRIR = {
    romaneiro: () => abrirShopeeRomaneiro(),
    at:        () => abrirShopeeAT(),
};

function _chubAbrirFonte(chave) {
    const abrir = _CHUB_FONTES_ABRIR[chave];
    if (abrir) abrir();
}
