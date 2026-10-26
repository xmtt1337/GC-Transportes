// ───── TICKETLOG › INFORMAÇÕES (só dev) ─────
// Cadastro dos cartões Ticketlog: entregador (da planilha Dados entregadores), número do
// cartão, matrícula, placa — e o VALOR do cartão, calculado: média do líquido mensal do
// entregador nos últimos 4 meses (TOTAL A RECEBER das planilhas de fechamento, as 2
// quinzenas somadas) × o percentual escolhido aqui. Backend: modules/fechamento-transportadoras
// (ticketlog-limite.js). Os cartões também servem pra conferir o relatório da Ticketlog no
// Criar Fechamento (matrícula digitada × dono do cartão).
const _TLI_API = () => `${API}/admin/fechamento-transportadoras`;
const _TLI_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
let _tliCartoes = [];
let _tliEntregadores = null;

function _tliEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _tliHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _tliNum(n) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function abrirTicketlogInfo(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-ticketlog-info");
    _tliCarregar();
}

function _tliCarregar(msg) {
    const el = document.getElementById("tli-conteudo");
    el.innerHTML = `<div class="cft-ajuda">Carregando cartões e calculando a média dos últimos 4 meses (lê as planilhas de fechamento)...</div>`;
    Promise.all([
        fetch(`${_TLI_API()}/ticketlog-cartoes`, { headers: _tliHeaders() }).then(r => r.json()),
        _tliEntregadores ? Promise.resolve(_tliEntregadores)
            : fetch(`${_TLI_API()}/entregadores`, { headers: _tliHeaders() }).then(r => r.json())
                .then(d => (_tliEntregadores = d.nomes || [])).catch(() => []),
    ]).then(([d, nomes]) => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_tliEsc(d.error)}</div>`; return; }
        _tliCartoes = d.cartoes || [];
        _tliRender(d, nomes, msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar os cartões.</div>`; });
}

function _tliRender(d, nomes, msg) {
    const el = document.getElementById("tli-conteudo");
    const meses = (d.meses || []).map(m => `${_TLI_MESES[m.mes - 1]}/${String(m.ano).slice(2)}`).reverse().join(", ");
    const linhas = _tliCartoes.map(c => {
        const detalhe = (c.meses_media || []).map(m => `${_TLI_MESES[m.mes - 1]}/${String(m.ano).slice(2)}: R$ ${_tliNum(m.valor)}`).join(" · ");
        return `<tr>
            <td><input class="cft-input tli-in" list="tli-entregadores" data-id="${c.id}" data-k="driver" value="${_tliEsc(c.driver)}" style="min-width:240px"></td>
            <td><input class="cft-input tli-in" data-id="${c.id}" data-k="numero" value="${_tliEsc(c.numero)}" style="min-width:170px"></td>
            <td><input class="cft-input tli-in" data-id="${c.id}" data-k="matricula" value="${_tliEsc(c.matricula || "")}" style="width:80px"></td>
            <td><input class="cft-input tli-in" data-id="${c.id}" data-k="placa" value="${_tliEsc(c.placa || "")}" style="width:100px"></td>
            <td class="num" title="${_tliEsc(detalhe || "Sem fechamento nos últimos 4 meses")}">${c.meses_media && c.meses_media.length
                ? `${_tliNum(c.media_mensal)} <span class="cft-ajuda">(${c.meses_media.length} ${c.meses_media.length === 1 ? "mês" : "meses"})</span>`
                : `<span class="cft-vazio">sem fechamento</span>`}</td>
            <td class="num cft-pos"><strong>${_tliNum(c.valor)}</strong></td>
            <td style="white-space:nowrap"><button class="cft-btn" onclick="_tliSalvar(${c.id})">Salvar</button>
                <button class="cft-btn perigo" onclick="_tliRemover(${c.id})">Remover</button></td>
        </tr>`;
    }).join("");
    el.innerHTML = `
        <datalist id="tli-entregadores">${(nomes || []).map(n => `<option value="${_tliEsc(n)}">`).join("")}</datalist>
        <div class="cft-regras">
            <div class="cft-barra" style="margin-top:0">
                <span class="cft-pend-titulo" style="color:#e2e8f0;margin:0">Valor do cartão</span>
            </div>
            <div class="cft-ajuda" style="margin-bottom:8px">Valor = média do líquido mensal do entregador nos últimos 4 meses × percentual.
                Líquido do mês = "TOTAL A RECEBER" das duas quinzenas somadas, das planilhas de fechamento.
                ${meses ? `Meses usados: <b style="color:#cbd5e1">${_tliEsc(meses)}</b>.` : ""}
                Mês em que o entregador não aparece não entra na média.</div>
            ${d.erro_media ? `<div class="cft-erro" style="margin-bottom:8px">${_tliEsc(d.erro_media)}</div>` : ""}
            <div class="cft-barra" style="margin:0">
                <label class="cft-rotulo" for="tli-pct">Percentual da média</label>
                <input id="tli-pct" class="cft-input" style="width:90px;margin:0" inputmode="decimal" value="${_tliEsc(String(d.percentual).replace(".", ","))}">
                <span class="cft-ajuda">%</span>
                <button class="cft-btn primario" onclick="_tliSalvarPct()">Salvar percentual</button>
                <span class="cft-ajuda" id="tli-status">${msg || ""}</span>
            </div>
        </div>

        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Cartões</div>
            <div class="cft-ajuda" style="margin-bottom:8px">O entregador vem da lista da planilha Dados entregadores (digite pra buscar).
                O cartão também é usado pra conferir o relatório da Ticketlog no Criar Fechamento.</div>
            <div class="cft-tabela-wrap" style="max-height:520px;overflow-y:auto"><table class="cft-tabela">
                <thead><tr><th>Entregador</th><th>Número do cartão</th><th>Matrícula</th><th>Placa</th>
                    <th>Média mensal (R$)</th><th>Valor do cartão (R$)</th><th></th></tr></thead>
                <tbody>
                    ${linhas || `<tr><td colspan="7" class="cft-vazio" style="padding:14px">Nenhum cartão cadastrado.</td></tr>`}
                    <tr>
                        <td><input class="cft-input" id="tli-novo-driver" list="tli-entregadores" placeholder="Novo: entregador" style="min-width:240px"></td>
                        <td><input class="cft-input" id="tli-novo-numero" placeholder="Número do cartão" style="min-width:170px"></td>
                        <td><input class="cft-input" id="tli-novo-matricula" placeholder="Matr." style="width:80px"></td>
                        <td><input class="cft-input" id="tli-novo-placa" placeholder="Placa" style="width:100px"></td>
                        <td></td><td></td>
                        <td><button class="cft-btn primario" onclick="_tliAdicionar()">Adicionar</button></td>
                    </tr>
                </tbody>
            </table></div>
            <div class="cft-ajuda" style="margin-top:12px">Vários de uma vez: cole da planilha as colunas <b>Driver · Número · Matrícula · Placa</b> (cartão que já existe é atualizado).</div>
            <textarea id="tli-colar" class="cft-input" rows="3" placeholder="Fulano de Tal - Caçador&#9;0000000000000000&#9;99&#9;ABC0000"></textarea>
            <div class="cft-barra" style="margin:8px 0 0"><button class="cft-btn" onclick="_tliImportar()">Gravar cartões colados</button></div>
        </div>`;
}

async function _tliPost(caminho, corpo, okMsg) {
    const st = document.getElementById("tli-status");
    try {
        const r = await fetch(`${_TLI_API()}/${caminho}`, { method: "POST", headers: _tliHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao gravar.");
        _tliCarregar(_tliEsc(okMsg(d)) + (d.erros && d.erros.length ? ` <span class="cft-neg">${_tliEsc(d.erros.length + " linha(s) com erro: " + d.erros[0])}</span>` : ""));
    } catch (err) {
        if (st) st.innerText = err.message; else gcAlert(err.message);
    }
}

function _tliSalvarPct() {
    _tliPost("ticketlog-config", { percentual: document.getElementById("tli-pct").value }, (d) => `Percentual salvo: ${String(d.percentual).replace(".", ",")}%.`);
}

function _tliSalvar(id) {
    const v = {};
    document.querySelectorAll(`.tli-in[data-id="${id}"]`).forEach(i => { v[i.dataset.k] = i.value; });
    _tliPost("ticketlog-cartoes", { id, ...v }, () => "Cartão salvo.");
}

function _tliAdicionar() {
    const v = (k) => document.getElementById("tli-novo-" + k).value;
    _tliPost("ticketlog-cartoes", { driver: v("driver"), numero: v("numero"), matricula: v("matricula"), placa: v("placa") }, () => "Cartão adicionado.");
}

function _tliImportar() {
    const linhas = document.getElementById("tli-colar").value.split(/\r?\n/)
        .map(l => l.split("\t").map(c => c.trim())).filter(c => c.some(Boolean));
    if (!linhas.length) return;
    _tliPost("ticketlog-cartoes", { linhas }, (d) => `${d.gravados} cartão(ões) gravado(s).`);
}

function _tliRemover(id) {
    const c = _tliCartoes.find(x => x.id === id);
    gcConfirm(`Remover o cartão de <b>${_tliEsc(c ? c.driver : "")}</b>?`, () => {
        fetch(`${_TLI_API()}/ticketlog-cartoes/${id}`, { method: "DELETE", headers: _tliHeaders() })
        .then(r => r.json())
        .then(d => { if (d.error) gcAlert(d.error); else _tliCarregar("Removido."); })
        .catch(() => gcAlert("Erro ao remover."));
    }, "Remover cartão", "Remover");
}
