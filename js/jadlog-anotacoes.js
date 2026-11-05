// Operação › Transportadoras › Jadlog › Anotações: a operação escolhe o dia (abre no de hoje)
// e anota quantos pacotes Jadlog cada entregador entregou. O Jadlog não tem relatório — o
// fechamento monta os pacotes a partir daqui (Criar Fechamento › Jadlog › Atualizar com as anotações).
//
// A lista mostra sempre quem já teve Jadlog anotado em algum dia; outro entregador entra pela
// busca (lupa). O dia sai do calendário compartilhado (js/calendario-dias.js) — qualquer dia
// da janela é clicável, como nas Anotações do entregador.

const _JAD_API = () => `${API}/jadlog/anotacoes`;
let _jadDados = null;          // { dia, anotacoes, entregadores, habituais, dias, total }
let _jadDia = null;            // dia escolhido no calendário ("AAAA-MM-DD"); null = hoje (o servidor decide)
let _jadValores = {};          // entregador → texto digitado (o que ainda não foi salvo)
let _jadAdicionados = [];      // achados na busca e ainda sem anotação salva

function _jadEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _jadChave(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function _jadHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _jadHoje() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function abrirJadlogAnotacoes(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-jadlog-anotacoes", "Jadlog/Anotacoes");
    document.getElementById("titulo-pagina").innerText = "Anotações — Jadlog";
    _jadDia = _jadHoje() < "2026-11-01" ? _jadHoje() : "2026-10-31"; // quantidade só até a Q2 de outubro/2026
    document.getElementById("jad-conteudo").innerHTML = `
        <div class="cft-barra" style="margin-top:0;flex-wrap:wrap;align-items:center">
            <div class="slh-cal" id="jad-cal"></div>
            <div class="adm-search-input-area" style="flex:1 1 260px;max-width:360px;margin:0">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7b98b5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="jad-busca" placeholder="Pesquisar entregador..." autocomplete="off" oninput="_jadBuscar()">
            </div>
            <span style="flex:1"></span>
            <span class="cft-ajuda" id="jad-total"></span>
            <button class="cft-btn primario" id="jad-salvar" onclick="_jadSalvar()">Salvar</button>
        </div>
        <div id="jad-sugestoes" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div>
        <div class="cft-ajuda" id="jad-status" style="margin:6px 0 10px"></div>
        <div id="jad-lista"></div>`;
    _jadMontarCalendario();
    _jadCarregar();
}

/** Janela de 120 dias até hoje; dia com anotação mostra o total embaixo do número. */
function _jadDiasDoCalendario(comAnotacao, hoje) {
    const totais = new Map((comAnotacao || []).map(d => [d.dia, d.total]));
    const dias = [];
    const base = new Date(hoje + "T12:00:00");
    for (let i = -120; i <= 0; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (dia >= "2026-11-01") continue; // de novembro em diante é por atribuição (jadlog-atribuir.js)
        const t = totais.get(dia);
        dias.push(t ? { dia, sub: String(t), resumo: `${t} pacote(s) Jadlog` } : { dia });
    }
    return dias;
}

function _jadMontarCalendario() {
    const hoje = _jadHoje();
    gcCalMontar({
        alvo: "jad-cal",
        dias: _jadDiasDoCalendario(_jadDados && _jadDados.dias, hoje),
        dia: _jadDia,
        hoje,
        legenda: "Número embaixo do dia = pacotes Jadlog anotados",
        aoEscolher: (dia) => {
            const trocar = () => { _jadDia = dia; _jadMontarCalendario(); _jadCarregar(); };
            if (Object.keys(_jadValores).length) gcConfirm("Tem quantidade digitada sem salvar. Trocar de dia mesmo assim?", trocar, null, "Trocar de dia");
            else trocar();
        },
    });
}

function _jadCarregar(msg) {
    const el = document.getElementById("jad-lista");
    el.innerHTML = skLogo(true, "Carregando as anotações");
    _jadValores = {};
    _jadAdicionados = [];
    const dia = _jadDia;
    fetch(`${_JAD_API()}?dia=${encodeURIComponent(dia)}`, { headers: _jadHeaders() })
    .then(r => r.json())
    .then(d => {
        if (dia !== _jadDia) return; // trocou de dia antes de voltar
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_jadEsc(d.error)}</div>`; return; }
        _jadDados = d;
        _jadMontarCalendario();
        _jadDesenhar(msg || (d.aviso ? "" : "Digite quantos pacotes Jadlog cada um entregou no dia e salve. Vazio ou 0 apaga a anotação."));
        if (d.aviso) document.getElementById("jad-status").innerHTML = `<span style="color:#f59e0b">${_jadEsc(d.aviso)}</span>`;
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as anotações.</div>`; });
}

/**
 * Lista do dia: quem tem anotação no dia, quem já teve em outro dia (sempre aparece) e quem
 * foi achado na busca agora — sem repetir. Anotados no dia primeiro.
 */
function _jadLinhas(d, adicionados) {
    const anot = new Map((d.anotacoes || []).map(a => [_jadChave(a.entregador), a]));
    const vistos = new Set();
    const nomes = (d.anotacoes || []).map(a => a.entregador).concat(d.habituais || [], adicionados || []);
    return nomes.filter(n => { const k = _jadChave(n); if (!k || vistos.has(k)) return false; vistos.add(k); return true; })
        .map(n => ({ entregador: n, anotacao: anot.get(_jadChave(n)) || null }))
        .sort((a, b) => (!!b.anotacao - !!a.anotacao) || a.entregador.localeCompare(b.entregador, "pt-BR"));
}

/** Quem a busca acha fora da lista (até 8), pra pôr com um clique. */
function _jadSugestoes(d, linhas, busca) {
    const b = _jadChave(busca);
    if (!b) return [];
    const na = new Set(linhas.map(l => _jadChave(l.entregador)));
    return (d.entregadores || []).filter(n => !na.has(_jadChave(n)) && _jadChave(n).includes(b)).slice(0, 8);
}

function _jadHtmlLista(d) {
    const linhas = _jadLinhas(d, _jadAdicionados);
    if (!linhas.length) return `<div class="cft-ajuda" style="padding:12px 0">Ninguém anotado ainda. Pesquise o entregador na lupa pra começar.</div>`;
    return `<div class="cft-tabela-wrap"><table class="cft-tabela">
        <thead><tr><th>Entregador</th><th style="width:140px">Pacotes Jadlog</th><th>Anotado por</th></tr></thead>
        <tbody>${linhas.map(l => `<tr class="jad-linha" data-nome="${_jadEsc(_jadChave(l.entregador))}">
            <td>${_jadEsc(l.entregador)}</td>
            <td><input class="cft-input jad-qtd" style="margin:0;width:110px" inputmode="numeric" data-entregador="${_jadEsc(l.entregador)}"
                value="${_jadEsc(l.entregador in _jadValores ? _jadValores[l.entregador] : (l.anotacao ? l.anotacao.quantidade : ""))}" oninput="_jadMudou(this)"></td>
            <td class="cft-ajuda">${l.anotacao && l.anotacao.atualizado_nome ? _jadEsc(l.anotacao.atualizado_nome)
                + (l.anotacao.atualizado_em ? " · " + new Date(l.anotacao.atualizado_em).toLocaleString("pt-BR") : "") : ""}</td>
        </tr>`).join("")}</tbody>
    </table></div>`;
}

function _jadDesenhar(msg) {
    document.getElementById("jad-lista").innerHTML = _jadHtmlLista(_jadDados);
    document.getElementById("jad-total").innerText = `${Number(_jadDados.total || 0).toLocaleString("pt-BR")} pacote(s) anotados no dia`;
    if (msg !== undefined) document.getElementById("jad-status").innerText = msg;
    _jadBuscar();
}

/** Lupa: filtra a lista e sugere quem não está nela. */
function _jadBuscar() {
    const busca = (document.getElementById("jad-busca") || {}).value || "";
    const b = _jadChave(busca);
    document.querySelectorAll("#jad-lista .jad-linha").forEach(tr => { tr.style.display = !b || tr.dataset.nome.includes(b) ? "" : "none"; });
    const sug = _jadDados ? _jadSugestoes(_jadDados, _jadLinhas(_jadDados, _jadAdicionados), busca) : [];
    document.getElementById("jad-sugestoes").innerHTML = sug.map(n =>
        `<button type="button" class="cft-link" data-n="${_jadEsc(n)}" onclick="_jadAdicionar(this.dataset.n)">+ ${_jadEsc(n)}</button>`).join("");
}

function _jadAdicionar(nome) {
    if (!nome || !_jadDados) return;
    _jadAdicionados.push(nome);
    document.getElementById("jad-busca").value = "";
    _jadDesenhar();
    const campo = [...document.querySelectorAll(".jad-qtd")].find(i => i.dataset.entregador === nome);
    if (campo) campo.focus();
}

function _jadMudou(input) {
    _jadValores[input.dataset.entregador] = input.value;
    document.getElementById("jad-status").innerText = `${Object.keys(_jadValores).length} alteração(ões) por salvar.`;
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
        const r = await fetch(_JAD_API(), { method: "PUT", headers: _jadHeaders(true), body: JSON.stringify({ dia: _jadDia, itens }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        _jadCarregar(`Salvo: ${d.gravados} anotação(ões)${d.apagados ? `, ${d.apagados} apagada(s)` : ""}.`);
    } catch (err) {
        st.innerText = err.message;
    } finally {
        btn.disabled = false;
    }
}
