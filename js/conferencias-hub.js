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
    lista.innerHTML = `
        <div class="adm-nf-wrap"><table class="adm-nf-table">
            <thead><tr><th>Carga</th><th>Situação</th><th>Última carga</th><th>Por</th><th>Linhas</th><th>Envio</th></tr></thead>
            <tbody>
                ${fontes.map(_chubLinhaHtml).join("")}
                <tr>
                    <td data-label="Carga"><button type="button" class="alim-link" onclick="abrirShopeePedidos()">Pedidos pesquisados</button></td>
                    <td data-label="Situação">—</td><td data-label="Última carga">—</td><td data-label="Por">—</td>
                    <td data-label="Linhas">—</td><td data-label="Envio">—</td>
                </tr>
            </tbody>
        </table></div>`;
}

const _CHUB_SITUACAO = {
    hoje:   { cor: "#22c55e", texto: "Alimentado hoje" },
    antiga: { cor: "#f59e0b", texto: "Carga de outro dia" },
    nunca:  { cor: "#ef4444", texto: "Nunca alimentado" },
};

function _chubLinhaHtml(f) {
    const s = _CHUB_SITUACAO[f.situacao] || _CHUB_SITUACAO.nunca;
    const quando = f.importado_em ? _chubQuando(f.importado_em) : "—";
    return `
    <tr>
        <td data-label="Carga"><button type="button" class="alim-link" onclick="_chubAbrirFonte('${f.chave}')">${_chubEsc(f.rotulo)}</button></td>
        <td data-label="Situação" style="color:${s.cor}">${s.texto}</td>
        <td data-label="Última carga">${_chubEsc(quando)}</td>
        <td data-label="Por">${_chubEsc(f.importado_por || "—")}</td>
        <td data-label="Linhas">${Number(f.total || 0).toLocaleString("pt-BR")}</td>
        <td data-label="Envio">${f.acumula ? "Soma" : "Substitui"}</td>
    </tr>`;
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
