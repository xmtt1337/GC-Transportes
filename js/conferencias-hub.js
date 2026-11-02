// ───── ALIMENTAR DA SHOPEE: O PAINEL DAS CARGAS ─────
//
// Mostra o que a Shopee exporta, quando foi a última carga e o que ela sustenta. Fica
// em Operação > Shopee > Alimentar. Sem ele, descobrir que faltou alimentar significava
// abrir a conferência e ver zero pacote — o que parece defeito da conferência, não
// falta de carga.

// Link salvo em "Conferencias" abre a primeira conferência da Shopee.
function abrirConferenciasHub(event) {
    if (event) event.preventDefault();
    abrirShopeeLineHaul();
}

let _chubStatus = null;   // resposta de /alimentar/status

function _chubEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _chubCarregarStatus() {
    fetch(`${API}/alimentar/status?transportadora=shopee`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(r => r.json())
    .then(d => {
        if (!d || d.error) return;
        _chubStatus = d;
        _chubPintarAlimentar();
    })
    .catch(() => {
        const empty = document.getElementById("alim-empty");
        if (empty && empty.style.display !== "none") empty.innerText = "Erro ao conectar com o servidor.";
    });
}

// Nome com "Painel" de proposito: abrirAlimentar ja existe no alimentar.js, que
// e a tela de Alimentar Separacao (a que abastece as bipagens).
// Como este arquivo carrega depois, uma funcao de mesmo nome SOBRESCREVE a outra
// em silencio - e foi o que aconteceu: clicar em "Alimentar separacao > Loggi"
// abria este painel.
function abrirPainelAlimentar(event) {
    if (event) event.preventDefault();
    document.getElementById("alim-titulo").innerText = "Alimentar — Shopee";
    mostrarTela("tela-painel-alimentar", "Conferencias/Alimentar");
    // Sempre rebusca: a pessoa costuma voltar aqui logo depois de alimentar, e
    // uma resposta em cache diria que ainda falta o que ela acabou de mandar.
    _chubPintarCarregando();
    _chubCarregarStatus();
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

    const fontes = (_chubStatus && _chubStatus.fontes) || [];
    if (!fontes.length) {
        empty.style.display = "";
        empty.innerText = "Nenhuma carga configurada.";
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

// Este painel é atalho e diagnóstico — não duplica o formulário de upload.
const _CHUB_FONTES_ABRIR = {
    romaneiro: () => abrirShopeeRomaneiro(),
    at:        () => abrirShopeeAT(),
};

function _chubAbrirFonte(chave) {
    const abrir = _CHUB_FONTES_ABRIR[chave];
    if (abrir) abrir();
}
