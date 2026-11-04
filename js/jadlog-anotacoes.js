// Operação › Transportadoras › Jadlog › Anotações: a operação escolhe o dia (abre no de hoje)
// e anota quantos pacotes Jadlog cada entregador entregou. O Jadlog não tem relatório — o
// fechamento monta os pacotes a partir daqui (Criar Fechamento › Jadlog › Atualizar com as anotações).

const _JAD_API = () => `${API}/jadlog/anotacoes`;
let _jadDados = null;          // { dia, anotacoes, entregadores, total }
let _jadValores = {};          // entregador → texto digitado (o que ainda não foi salvo)
let _jadAdicionados = [];      // escolhidos no "Adicionar entregador" e ainda sem anotação salva

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
    _jadAdicionados = [];
    fetch(`${_JAD_API()}${dia ? "?dia=" + encodeURIComponent(dia) : ""}`, { headers: _jadHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_jadEsc(d.error)}</div>`; return; }
        _jadDados = d;
        el.innerHTML = _jadHtml(d, msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as anotações.</div>`; });
}

/** Lista: só quem já tem anotação no dia e quem a operação escolheu agora (no fim, na ordem em que entrou). */
function _jadLinhas(d, adicionados) {
    const vistos = new Set();
    const anotados = (d.anotacoes || []).slice().sort((a, b) => a.entregador.localeCompare(b.entregador, "pt-BR"))
        .map(a => ({ entregador: a.entregador, anotacao: a }));
    return anotados.concat((adicionados || []).map(n => ({ entregador: n, anotacao: null })))
        .filter(l => { const k = _jadChave(l.entregador); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

/** Quem ainda pode ser escolhido (não está na lista do dia). */
function _jadDisponiveis(d, linhas) {
    const na = new Set(linhas.map(l => _jadChave(l.entregador)));
    return (d.entregadores || []).filter(n => !na.has(_jadChave(n)));
}

function _jadHtml(d, msg) {
    const linhas = _jadLinhas(d, _jadAdicionados);
    return `
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap;align-items:flex-end">
            <label class="aj-campo"><span class="cft-rotulo">Dia</span>
                <input type="date" class="cft-input" id="jad-dia" value="${_jadEsc(d.dia)}" style="margin:0" onchange="_jadCarregar(this.value)"></label>
            <label class="aj-campo" style="flex:1 1 280px"><span class="cft-rotulo">Adicionar entregador</span>
                <select class="fech-select" id="jad-add" style="width:100%" onchange="_jadAdicionar(this.value)">
                    <option value="">Escolha o entregador...</option>
                    ${_jadDisponiveis(d, linhas).map(n => `<option value="${_jadEsc(n)}">${_jadEsc(n)}</option>`).join("")}
                </select></label>
            <span style="flex:1"></span>
            <span class="cft-ajuda" id="jad-total">${Number(d.total || 0).toLocaleString("pt-BR")} pacote(s) anotados no dia</span>
            <button class="cft-btn primario" id="jad-salvar" onclick="_jadSalvar()">Salvar</button>
        </div>
        ${d.aviso ? `<div class="cft-ajuda" style="color:#f59e0b;margin-top:6px">${_jadEsc(d.aviso)}</div>` : ""}
        <div class="cft-ajuda" id="jad-status" style="margin:6px 0 10px">${msg || "Escolha o entregador, digite quantos pacotes Jadlog ele entregou e salve. Deixar vazio ou 0 apaga a anotação."}</div>
        <div class="cft-tabela-wrap"><table class="cft-tabela">
            <thead><tr><th>Entregador</th><th style="width:140px">Pacotes Jadlog</th><th>Anotado por</th></tr></thead>
            <tbody id="jad-tbody">${linhas.length ? "" : `<tr><td colspan="3" class="cft-vazio" style="padding:12px">Nenhuma anotação neste dia. Escolha um entregador acima.</td></tr>`}${linhas.map((l, i) => `<tr data-nome="${_jadEsc(_jadChave(l.entregador))}">
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

/** Põe o escolhido na lista (sem perder o que já foi digitado) e foca no campo dele. */
function _jadAdicionar(nome) {
    if (!nome || !_jadDados) return;
    _jadAdicionados.push(nome);
    document.getElementById("jad-conteudo").innerHTML = _jadHtml(_jadDados);
    document.querySelectorAll(".jad-qtd").forEach(i => { if (i.dataset.entregador in _jadValores) i.value = _jadValores[i.dataset.entregador]; });
    const n = Object.keys(_jadValores).length;
    if (n) document.getElementById("jad-status").innerText = `${n} alteração(ões) por salvar.`;
    const campo = [...document.querySelectorAll(".jad-qtd")].find(i => i.dataset.entregador === nome);
    if (campo) campo.focus();
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
