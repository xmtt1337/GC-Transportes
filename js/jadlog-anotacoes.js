// Operação › Transportadoras › Jadlog › Anotações: a operação escolhe o dia (abre no de hoje)
// e anota quantos pacotes Jadlog cada entregador entregou. O Jadlog não tem relatório — o
// fechamento monta os pacotes a partir daqui (Criar Fechamento › Jadlog › Atualizar com as anotações).

const _JAD_API = () => `${API}/jadlog/anotacoes`;
let _jadDados = null;          // { dia, anotacoes, entregadores, total }
let _jadValores = {};          // entregador → texto digitado (o que ainda não foi salvo)

function _jadEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _jadChave(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function _jadHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}

function abrirJadlogAnotacoes(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-jadlog-anotacoes", "Jadlog/Anotacoes");
    document.getElementById("titulo-pagina").innerText = "Anotações — Jadlog";
    _jadCarregar();
}

function _jadCarregar(dia, msg) {
    const el = document.getElementById("jad-conteudo");
    el.innerHTML = skLogo(true, "Carregando as anotações");
    _jadValores = {};
    fetch(`${_JAD_API()}${dia ? "?dia=" + encodeURIComponent(dia) : ""}`, { headers: _jadHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_jadEsc(d.error)}</div>`; return; }
        _jadDados = d;
        el.innerHTML = _jadHtml(d, msg);
        _jadFiltrar();
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as anotações.</div>`; });
}

/** Lista: quem já tem anotação no dia primeiro, depois os demais em ordem alfabética. */
function _jadLinhas(d) {
    const anot = new Map((d.anotacoes || []).map(a => [_jadChave(a.entregador), a]));
    const nomes = [...new Set((d.entregadores || []).concat((d.anotacoes || []).map(a => a.entregador)))];
    const vistos = new Set();
    return nomes.filter(n => { const k = _jadChave(n); if (vistos.has(k)) return false; vistos.add(k); return true; })
        .map(n => ({ entregador: n, anotacao: anot.get(_jadChave(n)) || null }))
        .sort((a, b) => (!!b.anotacao - !!a.anotacao) || a.entregador.localeCompare(b.entregador, "pt-BR"));
}

function _jadHtml(d, msg) {
    const linhas = _jadLinhas(d);
    return `
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap;align-items:flex-end">
            <label class="aj-campo"><span class="cft-rotulo">Dia</span>
                <input type="date" class="cft-input" id="jad-dia" value="${_jadEsc(d.dia)}" style="margin:0" onchange="_jadCarregar(this.value)"></label>
            <div class="adm-search-input-area" style="max-width:280px;margin:0">
                <input type="text" id="jad-busca" placeholder="Buscar entregador..." oninput="_jadFiltrar()">
            </div>
            <span style="flex:1"></span>
            <span class="cft-ajuda" id="jad-total">${Number(d.total || 0).toLocaleString("pt-BR")} pacote(s) anotados no dia</span>
            <button class="cft-btn primario" id="jad-salvar" onclick="_jadSalvar()">Salvar</button>
        </div>
        ${d.aviso ? `<div class="cft-ajuda" style="color:#f59e0b;margin-top:6px">${_jadEsc(d.aviso)}</div>` : ""}
        <div class="cft-ajuda" id="jad-status" style="margin:6px 0 10px">${msg || "Digite a quantidade de pacotes Jadlog entregues por cada um. Deixar vazio ou 0 apaga a anotação."}</div>
        <div class="cft-tabela-wrap"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th style="width:140px">Pacotes Jadlog</th><th>Anotado por</th></tr></thead>
            <tbody id="jad-tbody">${linhas.map((l, i) => `<tr data-nome="${_jadEsc(_jadChave(l.entregador))}">
                <td>${_jadEsc(l.entregador)}</td>
                <td><input class="cft-input jad-qtd" style="margin:0;width:110px" inputmode="numeric" data-i="${i}" data-entregador="${_jadEsc(l.entregador)}"
                    value="${l.anotacao ? l.anotacao.quantidade : ""}" oninput="_jadMudou(this)"></td>
                <td class="cft-ajuda">${l.anotacao && l.anotacao.atualizado_nome ? _jadEsc(l.anotacao.atualizado_nome)
                    + (l.anotacao.atualizado_em ? " · " + new Date(l.anotacao.atualizado_em).toLocaleString("pt-BR") : "") : ""}</td>
            </tr>`).join("")}</tbody>
        </table></div>`;
}

function _jadMudou(input) {
    _jadValores[input.dataset.entregador] = input.value;
    document.getElementById("jad-status").innerText = `${Object.keys(_jadValores).length} alteração(ões) por salvar.`;
}

function _jadFiltrar() {
    const b = _jadChave((document.getElementById("jad-busca") || {}).value || "");
    document.querySelectorAll("#jad-tbody tr").forEach(tr => { tr.style.display = !b || tr.dataset.nome.includes(b) ? "" : "none"; });
}

/** Só o que mudou desde que a tela abriu. */
function _jadItens() {
    return Object.entries(_jadValores).map(([entregador, quantidade]) => ({ entregador, quantidade: String(quantidade).trim() }));
}

async function _jadSalvar() {
    const itens = _jadItens();
    const st = document.getElementById("jad-status");
    if (!itens.length) { st.innerText = "Nada mudou."; return; }
    const btn = document.getElementById("jad-salvar");
    btn.disabled = true;
    st.innerText = "Salvando...";
    try {
        const dia = document.getElementById("jad-dia").value;
        const r = await fetch(_JAD_API(), { method: "PUT", headers: _jadHeaders(true), body: JSON.stringify({ dia, itens }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        _jadCarregar(dia, `Salvo: ${d.gravados} anotação(ões)${d.apagados ? `, ${d.apagados} apagada(s)` : ""}.`);
    } catch (err) {
        st.innerText = err.message;
        btn.disabled = false;
    }
}
