// POD Shopee > Semanal (GET /entregador/pod-semanal) e o bloco da tela inicial do entregador.
//
// O POD vem da planilha do André (abas "POD por Driver"), só Caçador e Videira. Cada edição
// que o servidor viu fica gravada: a tela mostra a versão mais recente de cada semana e quando
// cada edição apareceu. A semana é sempre a inteira (seg–dom) anterior ao dia da atualização.
//
// Quem recorta as linhas de cada entregador é o servidor (Conversão de nomes); esta tela só
// desenha o que chegou. O dev recebe todo mundo, com filtro de polo e o diagnóstico da leitura.
//
// Usa _enrEsc de entregador-na-rua.js.

let _pdsDados = null;
let _pdsAbertas = new Set();   // semana_inicio das semanas abertas
let _pdsPolo = "";             // filtro do dev ("" = os dois)
let _pdsBusca = "";
let _pdsCarregando = false;
let _pdsStatus = null;          // última leitura da planilha (só dev)

function abrirPodSemanal(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-pod-semanal");
    _pdsCarregar();
}

// "19/10" a partir de "2026-10-19" — texto puro, sem Date no meio.
function _pdsDia(dia) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dia || ""));
    return m ? `${m[3]}/${m[2]}` : String(dia || "");
}

// "27/10 às 14:32" a partir de "2026-10-27 14:32" (já em Brasília, vem do servidor).
function _pdsQuando(em) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(String(em || ""));
    return m ? `${m[3]}/${m[2]} às ${m[4]}` : String(em || "");
}

const _pdsPeriodo = s => `${_pdsDia(s.semana_inicio)} a ${_pdsDia(s.semana_fim)}`;
const _pdsUltimaEdicao = s => (s.edicoes && s.edicoes.length ? s.edicoes[s.edicoes.length - 1] : "");

// Meta da Shopee: Good Pod de pelo menos 80% na semana. Só ele ganha cor — o Bad Pod é o
// mesmo dado pelo outro lado, e pintar os dois repetiria o recado.
const PDS_META_GOOD = 80;

function _pdsClasse(coluna, valor) {
    const c = String(coluna || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (c !== "good pod") return "";
    const v = parseFloat(String(valor || "").replace("%", "").replace(/\./g, "").replace(",", "."));
    if (!isFinite(v)) return "";
    return v >= PDS_META_GOOD ? "bom" : "ruim";
}

const _PDS_PRINCIPAIS = ["good pod", "bad pod"];
const _pdsChaveCol = c => String(c || "").toLowerCase().replace(/\s+/g, " ").trim();

// Good Pod e Bad Pod são o que ele veio ver: número grande, lado a lado. O resto vira uma lista
// curta de rótulo e valor — no celular, uma caixa por nota virava uma torre de 7 caixas.
function _pdsNotasHtml(cabecalho, l) {
    const idx = cabecalho.map((c, i) => i);
    const principais = idx.filter(i => _PDS_PRINCIPAIS.includes(_pdsChaveCol(cabecalho[i])));
    const outros = idx.filter(i => !principais.includes(i));
    const val = i => _enrEsc(l.valores[i] || "—");
    return `
        ${principais.length ? `
            <div class="pds-principais">
                ${principais.map(i => `
                    <div>
                        <div class="pds-princ-rot">${_enrEsc(cabecalho[i])}${_pdsChaveCol(cabecalho[i]) === "good pod" ? ` <span class="pds-meta">· meta ${PDS_META_GOOD}%</span>` : ""}</div>
                        <div class="pds-princ-val ${_pdsClasse(cabecalho[i], l.valores[i])}">${val(i)}</div>
                    </div>`).join("")}
            </div>` : ""}
        ${outros.length ? `
            <dl class="pds-outros">
                ${outros.map(i => `<div><dt>${_enrEsc(cabecalho[i])}</dt><dd class="${_pdsClasse(cabecalho[i], l.valores[i])}">${val(i)}</dd></div>`).join("")}
            </dl>` : ""}`;
}

// Entregador: um cartão por linha (mais de uma quando há outros logins unificados no nome
// dele). O título é o usuário da Shopee; a cidade fica embaixo, menor.
function _pdsLinhaHtml(cabecalho, l) {
    return `
        <div class="pds-linha">
            <div class="pds-linha-nome">${_enrEsc(l.entregador)}</div>
            <div class="pds-linha-cidade">${_enrEsc(l.cidade || l.station)}</div>
            ${_pdsNotasHtml(cabecalho, l)}
        </div>`;
}

// Sem acento e sem caixa: "Rogerio" acha "Rogério".
const _pdsSemAcento = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Ordem alfabética do entregador e, com `filtrar`, a busca (e o polo, que só o dev escolhe).
function _pdsOrdenar(linhas, filtrar) {
    const busca = filtrar ? _pdsSemAcento(_pdsBusca).trim() : "";
    return linhas
        .filter(l => !filtrar || !_pdsPolo || l.polo === _pdsPolo)
        .filter(l => !busca || _pdsSemAcento(l.entregador).includes(busca) || _pdsSemAcento(l.cidade).includes(busca))
        .sort((a, b) => a.entregador.localeCompare(b.entregador, "pt-BR", { sensitivity: "base" }));
}

function _pdsLinhasHtml(s, filtrar) {
    const linhas = _pdsOrdenar(s.linhas, filtrar);
    if (!linhas.length) return `<div class="enr-vazio">Ninguém com esse nome nesta semana.</div>`;
    return `<div class="pds-cartoes">${linhas.map(l => _pdsLinhaHtml(s.cabecalho, l)).join("")}</div>`;
}

// Dev: todo mundo numa tabela, que dá pra comparar de relance. Rola de lado dentro da caixa,
// nunca a página.
function _pdsTabelaHtml(s) {
    const linhas = _pdsOrdenar(s.linhas, true);
    if (!linhas.length) return `<div class="enr-vazio">Ninguém com esse filtro nesta semana.</div>`;
    return `
        <div class="pds-tabela-caixa">
            <table class="pds-tabela">
                <thead><tr><th>Entregador</th><th>Cidade</th><th>Polo</th>${s.cabecalho.map(c => `<th>${_enrEsc(c)}</th>`).join("")}</tr></thead>
                <tbody>${linhas.map(l => `
                    <tr>
                        <td>${_enrEsc(l.entregador)}</td><td>${_enrEsc(l.cidade)}</td><td>${_enrEsc(l.polo)}</td>
                        ${s.cabecalho.map((c, i) => `<td class="num ${_pdsClasse(c, l.valores[i])}">${_enrEsc(l.valores[i] || "")}</td>`).join("")}
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`;
}

function _pdsEdicoesHtml(s) {
    const ed = s.edicoes || [];
    if (ed.length < 2) return "";
    return `<p class="pds-edicoes">Edições gravadas: ${ed.map(_pdsQuando).map(_enrEsc).join(" · ")}</p>`;
}

function _pdsSemanaHtml(s, todos) {
    const aberta = _pdsAbertas.has(s.semana_inicio);
    const ultima = _pdsUltimaEdicao(s);
    const qtd = (s.edicoes || []).length;
    return `
        <div class="enr-ent${aberta ? " aberto" : ""}">
            <button type="button" class="enr-ent-topo" aria-expanded="${aberta}"
                    data-semana="${_enrEsc(s.semana_inicio)}" onclick="_pdsAlternar(this.dataset.semana)">
                <span class="enr-ent-nome">Semana ${_pdsPeriodo(s)}</span>
                <span class="pds-seta">${aberta ? "▴" : "▾"}</span>
                <span class="enr-ent-sub">Atualizado em ${_enrEsc(_pdsQuando(ultima))}${qtd > 1 ? ` · ${qtd} edições` : ""}</span>
            </button>
            ${aberta ? `
                <div class="pds-corpo">
                    ${todos ? _pdsTabelaHtml(s) : _pdsLinhasHtml(s, true)}
                    ${_pdsEdicoesHtml(s)}
                </div>` : ""}
        </div>`;
}

const _pdsCampoBusca = () => `
            <input type="search" class="pds-busca" placeholder="Procurar entregador ou cidade"
                   value="${_enrEsc(_pdsBusca)}" oninput="_pdsBuscar(this.value)">`;

function _pdsFiltrosHtml() {
    const chip = (v, rot) => `<button type="button" class="pds-chip${_pdsPolo === v ? " ativo" : ""}" onclick="_pdsFiltrarPolo('${v}')">${rot}</button>`;
    return `
        <div class="pds-filtros">
            ${chip("", "Todos")}${chip("Caçador", "Caçador")}${chip("Videira", "Videira")}${_pdsCampoBusca()}
        </div>`;
}

// Entregador: só a busca, e só quando alguma semana tem mais de um cartão.
function _pdsBuscaHtml() {
    return `<div class="pds-filtros">${_pdsCampoBusca()}</div>`;
}

function _pdsAviso(texto, comBotao) {
    const el = document.getElementById("pds-conteudo");
    if (!el) return;
    el.innerHTML = `
        <div class="enr-aviso">${_enrEsc(texto)}</div>
        ${comBotao ? `<button type="button" class="enr-recarregar epf-de-novo" onclick="_pdsCarregar()">Tentar de novo</button>` : ""}`;
}

function _pdsRender() {
    const el = document.getElementById("pds-conteudo");
    if (!el || !_pdsDados) return;
    const d = _pdsDados;
    const semanas = d.semanas || [];
    el.innerHTML = `
        <p class="epf-nota">Cada semana vai de segunda a domingo e sai na semana seguinte.</p>
        ${d.todos ? _pdsFiltrosHtml() : semanas.some(s => s.linhas.length > 1) ? _pdsBuscaHtml() : ""}
        ${semanas.length
            ? `<div class="enr-ents">${semanas.map(s => _pdsSemanaHtml(s, d.todos)).join("")}</div>`
            : `<div class="enr-aviso">${d.todos ? "Nenhuma semana gravada ainda." : "Você ainda não aparece em nenhuma semana do POD."}</div>`}
        ${d.todos ? `<div id="pds-diag">${_pdsDiagHtml(_pdsStatus, false)}</div>` : ""}`;
}

function _pdsAlternar(semana) {
    if (_pdsAbertas.has(semana)) _pdsAbertas.delete(semana);
    else _pdsAbertas.add(semana);
    _pdsRender();
}

function _pdsFiltrarPolo(polo) { _pdsPolo = polo; _pdsRender(); }

function _pdsBuscar(v) {
    _pdsBusca = v;
    _pdsRender();
    const campo = document.querySelector("#pds-conteudo .pds-busca");
    if (campo) { campo.focus(); campo.setSelectionRange(v.length, v.length); }
}

function _pdsBuscarDados() {
    return fetch(`${API}/entregador/pod-semanal`, { headers: { "Authorization": "Bearer " + localStorage.getItem("token") } })
        .then(r => r.json())
        .then(d => {
            if (!d || d.error || !Array.isArray(d.semanas)) throw new Error((d && d.error) || "");
            _pdsDados = d;
            // A semana mais recente já abre: é ela que ele veio ver.
            if (!_pdsAbertas.size && d.semanas.length) _pdsAbertas.add(d.semanas[0].semana_inicio);
            return d;
        });
}

function _pdsCarregar() {
    if (_pdsCarregando) return;
    _pdsCarregando = true;
    if (!_pdsDados) _pdsAviso("Carregando o POD…", false);
    _pdsBuscarDados()
        .then(d => { _pdsCarregando = false; _pdsRender(); _pdsHome(); if (d.todos) _pdsDiagnostico(); })
        .catch(err => {
            _pdsCarregando = false;
            if (_pdsDados) { _pdsRender(); return; }
            _pdsAviso(err.message ? `Não deu pra carregar: ${err.message}` : "Não deu pra carregar. Confira a internet e tente de novo.", true);
        });
}

// ── Tela inicial do entregador: só a semana mais recente em que ele aparece. ──
function _pdsHome() {
    const el = document.getElementById("home-pod");
    if (!el) return;
    const d = _pdsDados;
    const s = d && !d.todos && d.semanas && d.semanas[0];
    if (!s) { el.innerHTML = ""; return; }
    el.innerHTML = `
        <section class="enr">
            <div class="pds-home-topo">
                <span class="enr-titulo">POD Shopee</span>
                <button type="button" class="pds-link" onclick="abrirPodSemanal(event)">Ver semanas</button>
                <span class="pds-home-sub">Semana ${_pdsPeriodo(s)} · atualizado em ${_enrEsc(_pdsQuando(_pdsUltimaEdicao(s)))}</span>
            </div>
            ${_pdsLinhasHtml(s)}
        </section>`;
}

// Chamado pelo core.js pra todo entregador. Sem semana dele, o bloco fica vazio (não é erro:
// quem não roda Shopee em Caçador/Videira nunca aparece no POD).
function _pdsCarregarHome() {
    _pdsBuscarDados().then(_pdsHome).catch(() => {});
}

// ── Dev: o que a última leitura da planilha achou, e um botão pra ler agora. ──
function _pdsDiagHtml(st, lendo) {
    const abas = (st && st.abas) || [];
    return `
        <div class="pds-diag">
            <div class="enr-topo">
                <span class="enr-titulo">Leitura da planilha</span>
                <span class="enr-atual">${st && st.em ? `Última leitura: <b>${_enrEsc(new Date(st.em).toLocaleString("pt-BR"))}</b> · relê sozinho a cada 10 min` : "Ainda não leu desde que o servidor subiu"}</span>
                <button type="button" class="enr-recarregar" onclick="_pdsLerAgora()" ${lendo ? "disabled" : ""}>${lendo ? "Lendo…" : "Ler agora"}</button>
            </div>
            ${st && st.erro ? `<div class="pds-diag-erro">${_enrEsc(st.erro)}${st.todas && st.todas.length ? ` Abas da planilha: ${_enrEsc(st.todas.join(", "))}` : ""}</div>` : ""}
            ${abas.map(a => a.erro
                ? `<div class="pds-diag-erro">${_enrEsc(a.aba)}: ${_enrEsc(a.erro)}</div>`
                : `<div class="pds-diag-aba">Aba lida: <b>${_enrEsc(a.aba)}</b> · ${a.linhas} de ${a.linhas_lidas} linhas são de Caçador/Videira · ${a.gravou ? `gravou edição nova na semana ${_pdsPeriodo(a)}` : "sem mudança desde a última edição gravada"}<br>Colunas: ${_enrEsc(a.cabecalho.join(", "))}</div>`).join("")}
            ${st && st.ignoradas && st.ignoradas.length ? `<div class="pds-diag-aba">Abas antigas ignoradas: ${_enrEsc(st.ignoradas.join(", "))}</div>` : ""}
        </div>`;
}

function _pdsDiagnostico() {
    fetch(`${API}/admin/pod-semanal/status`, { headers: { "Authorization": "Bearer " + localStorage.getItem("token") } })
        .then(r => r.json())
        .then(st => {
            _pdsStatus = st && !st.error ? st : null;
            const el = document.getElementById("pds-diag");
            if (el) el.innerHTML = _pdsDiagHtml(_pdsStatus, false);
        })
        .catch(() => {});
}

function _pdsLerAgora() {
    const el = document.getElementById("pds-diag");
    if (el) el.innerHTML = _pdsDiagHtml(null, true);
    fetch(`${API}/admin/pod-semanal/ler`, { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("token") } })
        .then(r => r.json())
        .then(st => {
            if (st && st.error) {
                const caixa = document.getElementById("pds-diag");
                if (caixa) caixa.innerHTML = _pdsDiagHtml({ erro: st.error }, false);
                return;
            }
            _pdsCarregar();
        })
        .catch(() => _pdsDiagnostico());
}
