// ───── OPERAÇÃO › TRANSPORTADORAS › ANJUN › CONFERÊNCIA ─────
// Recebidos no ponto hoje (coluna "Tempo de entrada no ponto") e os três objetivos:
//   1. foi expedido (tem entregador)?  2. foi expedido certo (o login faz a cidade)?
//   3. recebemos fora de abrangência (cidade que nenhum login da Anjun faz)?
// Quem lê o portal é a extensão XM - Operação (Conferências › Anjun › "Conferir agora"); o
// sistema refaz a conta a cada abertura contra a lista login → cidades atual. Mesmo visual da
// Conferência da Loggi (js/loggi-agrupamento.js). O upload antigo (js/conferencia-expedicao.js)
// continua no código, só sem link no menu.
// Backend: /macros/anjun-conferencia (modules/anjun-conferencia).
const _ANC_API = () => `${API}/macros/anjun-conferencia`;
const _ANC_MAX_LINHAS = 500;
const _ANC_ATUALIZAR_MS = 60000;
const _ANC_POLOS = { cacador: "Caçador", videira: "Videira", joacaba: "Joaçaba" };
const _ANC_STATUS = {
    sem_entregador: ["Sem entregador", "anc-falta"], cidade_errada: ["Cidade errada", "anc-errada"],
    usuario_sem_cidade: ["Login sem cidade", "cft-ajuda"], sem_cidade: ["Sem cidade", "cft-ajuda"],
    fora_abrangencia: ["Fora de abrangência", "cft-ajuda"],
};

let _ancDados = null;
let _ancDia = null;
let _ancPolo = "";      // só dev/admin: "" = todos
let _ancFiltro = "";    // status da tabela ("" = todas as pendências)
let _ancCidade = "";
let _ancTimer = null;

const _ancEsc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const _ancNum = n => Number(n || 0).toLocaleString("pt-BR");
const _ancPct = v => Number(v || 0).toLocaleString("pt-BR") + "%";
const _ancDiaBr = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const _ancHora = d => { const m = String(d || "").match(/(\d{2}:\d{2})/); return m ? m[1] : ""; };

function abrirAnjunConferencia(event) {
    if (event) event.preventDefault();
    _ancDia = null; _ancFiltro = ""; _ancCidade = "";
    mostrarTela("tela-anjun-conferencia", "Conferencias/Anjun");
    document.getElementById("titulo-pagina").innerText = "Conferência — Anjun";
    _ancCarregar();
    clearInterval(_ancTimer);
    _ancTimer = setInterval(() => {
        const tela = document.getElementById("tela-anjun-conferencia");
        if (!tela || !tela.classList.contains("active-view")) { clearInterval(_ancTimer); return; }
        if (!document.hidden) _ancCarregar(true);
    }, _ANC_ATUALIZAR_MS);
}

function _ancCarregar(quieto) {
    const el = document.getElementById("anc-resultado");
    if (!quieto) el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    const q = new URLSearchParams();
    if (_ancDia) q.set("dia", _ancDia);
    if (_ancPolo) q.set("polo", _ancPolo);
    fetch(`${_ANC_API()}${q.toString() ? "?" + q : ""}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) { el.innerHTML = `<div class="cft-erro">${_ancEsc(d.error)}</div>`; return; }
            _ancDados = d;
            _ancPintar();
        })
        .catch(() => { if (!quieto) el.innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

function _ancPintar() {
    const d = _ancDados || {};
    const el = document.getElementById("anc-resultado");
    const dias = d.dias || [];
    const selDia = dias.length ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_ancDia=this.value;_ancCarregar()">
        ${dias.map(x => `<option value="${x}"${x === d.dia ? " selected" : ""}>${_ancDiaBr(x)}${x === d.hoje ? " (hoje)" : ""}</option>`).join("")}</select>` : "";
    const selPolo = d.ve_tudo ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_ancPolo=this.value;_ancCarregar()">
        <option value="">Todos os polos</option>${Object.entries(_ANC_POLOS).map(([k, n]) => `<option value="${k}"${k === _ancPolo ? " selected" : ""}>${n}</option>`).join("")}</select>`
        : (d.polo ? `<span class="cft-ajuda">Polo ${_ancEsc(_ANC_POLOS[d.polo] || d.polo)}</span>` : "");
    document.getElementById("anc-barra").innerHTML = selDia + selPolo + `<button class="cft-btn" onclick="_ancCarregar()">Atualizar</button>`;

    if (!d.dia || !d.total) {
        el.innerHTML = `<div class="cft-ajuda">${d.dia ? "Nenhum pacote recebido neste dia" + (d.polo ? " no polo." : ".") : "Ninguém conferiu ainda."}
            No portal da Anjun, abra a extensão XM - Operação › Conferências › Anjun › <b>Conferir agora</b>.</div>`;
        return;
    }
    const buscaAntes = (document.getElementById("anc-busca") || {}).value || "";
    const falta = d.nossos - d.expedidos;
    const completo = d.nossos > 0 && !falta;
    const certoOk = d.expedidos > 0 && d.certos === d.expedidos;
    const lido = d.leitura || {};
    const comPend = (d.porCidade || []).filter(c => c.total > c.certos);
    const maior = Math.max(1, ...comPend.map(c => c.total));
    const barras = comPend.length ? comPend.map(c => {
        const sem = c.total - c.expedidos, outras = c.expedidos - c.certos;
        return `<div class="lag-barra-cidade${c.cidade === _ancCidade ? " lag-sel" : ""}" data-c="${_ancEsc(c.cidade)}" onclick="_ancFiltrarCidade(this.dataset.c)"
            title="${_ancEsc(c.cidade)}: ${_ancNum(c.certos)} certos, ${_ancNum(sem)} sem entregador, ${_ancNum(outras)} com outro problema (de ${_ancNum(c.total)}) — clique pra ver">
            <span>${_ancEsc(c.cidade)}</span>
            <div class="lag-trilho"><i class="lag-ok" style="width:${c.certos / maior * 100}%"></i><i class="lag-falta" style="width:${sem / maior * 100}%"></i><i class="anc-errada-bg" style="width:${outras / maior * 100}%"></i></div>
            <em>${_ancNum(sem + outras)}</em>
            <a href="#" class="lag-acao" title="Tirar da conta (para todos)" onclick="event.preventDefault();event.stopPropagation();_ancIgnorar(this.parentElement.dataset.c,true)">tirar</a>
        </div>`;
    }).join("") : `<div class="cft-ajuda">Nenhuma cidade com pendência.</div>`;
    const c = d.contagem || {};
    const filtros = [["", "Todas", d.pendentes.length], ["sem_entregador", "Sem entregador", c.sem_entregador],
        ["cidade_errada", "Cidade errada", c.cidade_errada], ["usuario_sem_cidade", "Login sem cidade", c.usuario_sem_cidade],
        ["fora_abrangencia", "Fora de abrangência", c.fora_abrangencia]].filter(([k, , n]) => !k || n);
    el.innerHTML = `
        <div class="anc-cartoes">
            <div class="lag-cartao lag-resumo">
                <div class="lag-pizza${completo ? " lag-completo" : ""}" style="--pct:${Math.min(100, d.pct_expedido || 0)}"><span>${_ancPct(d.pct_expedido)}</span></div>
                <div>
                    <div class="lag-conta">${_ancNum(d.expedidos)} de ${_ancNum(d.nossos)} expedidos${falta ? ` · faltam ${_ancNum(falta)}` : ""}</div>
                    <div class="lag-legenda"><span><i class="lag-ok"></i>Expedidos</span><span><i class="lag-falta"></i>Sem entregador</span><span class="cft-ajuda">meta 100%</span></div>
                    <div class="cft-ajuda">${_ancNum(d.total)} recebidos no ponto ${d.dia === d.hoje ? "hoje" : "em " + _ancDiaBr(d.dia)}${d.polo ? "" : " (todos os polos)"}${lido.lido_em ? ` · lido às ${new Date(lido.lido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${lido.usuario ? " por " + _ancEsc(lido.usuario) : ""}` : ""}.
                        Pacote que entrou depois disso entra no próximo "Conferir agora"; as leituras se somam.${d.sem_polo ? ` ${_ancNum(d.sem_polo)} pacote(s) com ponto desconhecido.` : ""}</div>
                </div>
            </div>
            <div class="lag-cartao anc-numeros">
                <div><div class="anc-valor${certoOk ? " anc-ok" : ""}">${d.expedidos ? _ancPct(d.pct_certo) : "—"}</div><div class="cft-ajuda">2. expedidos certo<br>${_ancNum(d.certos)} de ${_ancNum(d.expedidos)} · meta 100%</div></div>
                <div><div class="anc-valor${c.fora_abrangencia ? " anc-alerta" : " anc-ok"}">${_ancNum(c.fora_abrangencia)}</div><div class="cft-ajuda">3. fora de abrangência<br>${(d.fora || []).slice(0, 4).map(f => `${_ancEsc(f.cidade)} (${_ancNum(f.qtd)})`).join(", ") || "nenhum"}</div></div>
            </div>
        </div>
        <div class="lag-colunas" style="margin-top:18px">
            <div class="lag-cartao">
                <div class="lag-titulo"><span>Pendências por cidade</span><span class="cft-ajuda">"tirar" = fora da conta</span></div>
                <div class="lag-legenda" style="margin-top:0"><span><i class="lag-ok"></i>Certo</span><span><i class="lag-falta"></i>Sem entregador</span><span><i class="anc-errada-bg"></i>Cidade errada / login sem cidade</span></div>
                <div class="lag-barras">${barras}</div>
                ${(d.ignoradas || []).length ? `<div class="cft-ajuda" style="margin-top:10px">Fora da conta: ${d.ignoradas.map(x =>
                    `${_ancEsc(x.cidade)} (${_ancNum(x.total)}) <a href="#" class="lag-acao" data-c="${_ancEsc(x.cidade)}" onclick="event.preventDefault();_ancIgnorar(this.dataset.c,false)">voltar</a>`).join(" · ")}</div>` : ""}
            </div>
            <div class="lag-cartao">
                <div class="lag-titulo"><span>Logins com pacote de outra cidade</span></div>
                ${(d.porLogin || []).length ? `<div class="lag-barras">${d.porLogin.map(l => `<div class="anc-login"><span>${_ancEsc(l.usuario)}</span>
                    <span class="cft-ajuda">${l.erradas ? `${_ancNum(l.erradas)} de cidade que ele não faz` : ""}${l.erradas && l.sem_cadastro ? " · " : ""}${l.sem_cadastro ? `${_ancNum(l.sem_cadastro)} sem cidade cadastrada` : ""}</span></div>`).join("")}</div>`
                    : `<div class="cft-ajuda">Nenhum login com pacote fora das cidades dele.</div>`}
            </div>
        </div>
        <div class="cft-barra" style="margin:18px 0 8px">
            <span class="nr-grafico-titulo" style="margin:0">Pendências${_ancCidade ? ` · ${_ancEsc(_ancCidade)} <a href="#" class="lag-acao" onclick="event.preventDefault();_ancFiltrarCidade('')">ver todas</a>` : ""}</span>
            <span class="filtro-tabs" style="margin:0">${filtros.map(([k, n, q]) => `<button type="button" class="filtro-tab${k === _ancFiltro ? " active" : ""}" onclick="_ancFiltro='${k}';_ancPintar()">${n} ${_ancNum(q)}</button>`).join("")}</span>
            <input class="cft-input" id="anc-busca" placeholder="Buscar waybill, login, cidade ou cliente..." style="width:260px;flex:0 0 auto;margin:0" oninput="_ancPintarTabela()">
            <button class="cft-btn" onclick="_ancCopiar()">Copiar waybills</button>
            <span class="cft-ajuda" id="anc-copia"></span>
        </div>
        <div id="anc-tabela"></div>`;
    document.getElementById("anc-busca").value = buscaAntes;
    _ancPintarTabela();
}

function _ancFiltrarCidade(c) { _ancCidade = _ancCidade === c ? "" : c; _ancPintar(); }

function _ancFiltrados() {
    const d = _ancDados || {};
    const busca = String((document.getElementById("anc-busca") || {}).value || "").trim().toLowerCase();
    return (d.pendentes || []).filter(p => (!_ancFiltro || p.status === _ancFiltro) && (!_ancCidade || p.cidade === _ancCidade)
        && (!busca || [p.waybill, p.entregador, p.cidade, p.cliente].some(v => String(v || "").toLowerCase().includes(busca))));
}

function _ancPintarTabela() {
    const el = document.getElementById("anc-tabela");
    if (!el) return;
    const lista = _ancFiltrados();
    const verPolo = !!(_ancDados && _ancDados.ve_tudo && !_ancDados.polo);
    if (!lista.length) { el.innerHTML = `<div class="cft-ajuda">Nada pendente por aqui.</div>`; return; }
    el.innerHTML = `<div class="cft-tabela-wrap" style="max-height:62vh"><table class="cft-tabela">
        <thead><tr><th>Waybill</th>${verPolo ? "<th>Polo</th>" : ""}<th>Entregador</th><th>Cidade</th><th>Cliente</th><th class="num">Valor declarado</th><th>Entrada no ponto</th><th>Situação</th></tr></thead>
        <tbody>${lista.slice(0, _ANC_MAX_LINHAS).map(p => {
            const [rot, cls] = _ANC_STATUS[p.status] || [p.status, ""];
            return `<tr><td>${_ancEsc(p.waybill)}</td>${verPolo ? `<td>${_ancEsc(_ANC_POLOS[p.polo] || p.polo || "—")}</td>` : ""}
                <td>${p.entregador ? _ancEsc(p.entregador) : `<span class="cft-vazio">—</span>`}</td><td>${_ancEsc(p.cidade)}</td>
                <td>${_ancEsc(String(p.cliente || "").slice(0, 32))}</td><td class="num">${p.valor == null ? "" : Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                <td>${_ancEsc(_ancHora(p.entrada))}</td><td class="${cls}">${rot}</td></tr>`;
        }).join("")}</tbody></table></div>
        ${lista.length > _ANC_MAX_LINHAS ? `<div class="cft-ajuda" style="margin-top:6px">Mostrando ${_ANC_MAX_LINHAS} de ${_ancNum(lista.length)}. "Copiar waybills" leva todos do filtro.</div>` : ""}`;
}

function _ancCopiar() {
    const codigos = _ancFiltrados().map(p => p.waybill);
    const st = document.getElementById("anc-copia");
    if (!codigos.length) { st.innerText = "Nada pra copiar."; return; }
    navigator.clipboard.writeText(codigos.join("\n"))
        .then(() => { st.innerText = `${_ancNum(codigos.length)} copiado(s).`; })
        .catch(() => { st.innerText = "Não deu pra copiar."; });
}

// Tirar/voltar uma cidade da conta: vale para todos e todo dia (fica no log com quem fez).
function _ancIgnorar(cidade, ignorar) {
    if (_ancCidade === cidade) _ancCidade = "";
    fetch(`${_ANC_API()}/ignorar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ cidade, ignorar }),
    }).then(r => r.json()).then(d => {
        if (d.error) { alert(d.error); return; }
        _ancCarregar(true);
    }).catch(() => alert("Erro ao conectar com o servidor."));
}
