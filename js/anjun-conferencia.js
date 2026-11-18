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
const _ancPct = v => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"; // sempre 99,78%
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
    document.getElementById("anc-barra").innerHTML = selDia + selPolo + `<button class="cft-btn" onclick="_ancCarregar()">Atualizar</button><button class="cft-btn" onclick="_ancAbrirLista()">Cidades por login</button>`;

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
                <div class="lag-pizza${completo ? " lag-completo" : ""}" style="--pct:${Math.min(100, d.pct_expedido || 0)}"><svg viewBox="0 0 120 68"><path class="arco-fundo" d="M10 60 A50 50 0 0 1 110 60"/><path class="arco-valor" d="M10 60 A50 50 0 0 1 110 60"/></svg><span>${_ancPct(d.pct_expedido)}</span></div>
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
                <div class="lag-titulo"><span>Logins com pacote de outra cidade</span><span class="cft-ajuda">clique no login pra ver as cidades dele</span></div>
                ${(d.porLogin || []).length ? `<div class="lag-barras">${d.porLogin.map(l => `<div class="anc-login"><a href="#" class="lag-acao" title="Ver e corrigir as cidades deste login" data-u="${_ancEsc(l.usuario)}" onclick="event.preventDefault();_ancAbrirLogin(this.dataset.u)">${_ancEsc(l.usuario)}</a>
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
                <td>${p.entregador ? `<a href="#" class="lag-acao" data-u="${_ancEsc(p.entregador)}" onclick="event.preventDefault();_ancAbrirLogin(this.dataset.u)">${_ancEsc(p.entregador)}</a>` : `<span class="cft-vazio">—</span>`}</td><td>${_ancEsc(p.cidade)}</td>
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

// ── Cidades de cada login (lista login → cidades da Anjun, a mesma da conferência antiga) ──
// Clicar no login (na lista de logins ou na coluna Entregador) abre o cartão: cidades já
// cadastradas (com "×" pra tirar) e as cidades dele hoje que ainda não estão, pra marcar.
// "Cidades por login" na barra mostra a lista inteira. Toda mudança fica no log com quem fez.
const _ANC_CID_API = () => `${API}/admin/conferencia-expedicao/cidades-usuario`;
const _ancChave = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
let _ancLista = null; // linhas de cidades-usuario da Anjun

async function _ancCarregarLista() {
    const r = await fetch(`${_ANC_CID_API()}?transportadora=anjun`, { headers: { "Authorization": "Bearer " + token } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Erro ao ler a lista de cidades.");
    _ancLista = d.linhas || [];
    return _ancLista;
}

function _ancFecharModal() { const ov = document.getElementById("anc-modal"); if (ov) ov.remove(); }

function _ancModal(html) {
    _ancFecharModal();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "anc-modal";
    ov.innerHTML = `<div class="cft-modal">${html}</div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _ancFecharModal(); });
    document.body.appendChild(ov);
}

async function _ancAbrirLogin(usuario) {
    _ancModal(`<div class="cft-ajuda">Carregando...</div>`);
    try { await _ancCarregarLista(); } catch (e) { _ancModal(`<div class="cft-erro">${_ancEsc(e.message)}</div>`); return; }
    const k = _ancChave(usuario);
    const dele = _ancLista.filter(l => _ancChave(l.usuario) === k);
    const cadastradas = new Set(dele.map(l => _ancChave(l.cidade)));
    // Cidades dos pacotes dele hoje que não estão na lista (as pendências "cidade errada"/"sem cidade").
    const hoje = new Map();
    for (const p of (_ancDados && _ancDados.pendentes) || []) {
        if (_ancChave(p.entregador) !== k || !p.cidade || cadastradas.has(_ancChave(p.cidade))) continue;
        hoje.set(p.cidade, (hoje.get(p.cidade) || 0) + 1);
    }
    const conhecidas = [...new Set(_ancLista.map(l => l.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    _ancModal(`
        <div class="cft-modal-titulo">Cidades de <span style="color:#e2e8f0">${_ancEsc(usuario)}</span> na Anjun</div>
        <div class="cft-ajuda">Cadastradas (a conferência só dá "certo" nestas):</div>
        ${dele.length ? `<div class="cft-pend-tags" style="margin:6px 0 12px">${dele.map(l => `<span class="cft-tag">${_ancEsc(l.cidade)}
            <a href="#" class="lag-acao" title="Tirar esta cidade do login" data-u="${_ancEsc(usuario)}" onclick="event.preventDefault();_ancTirarCidade(${Number(l.id)}, this.dataset.u)">×</a></span>`).join("")}</div>`
            : `<div class="cft-ajuda" style="font-style:italic;margin:6px 0 12px">Nenhuma: os pacotes dele aparecem como "Login sem cidade".</div>`}
        ${hoje.size ? `<div class="cft-ajuda">Cidades dele hoje que não estão na lista. Marque as que ele faz:</div>
            <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0 12px;max-height:200px;overflow:auto">
            ${[...hoje].map(([c, n]) => `<label class="cft-ajuda" style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#cbd5e1">
                <input type="checkbox" class="anc-marca" value="${_ancEsc(c)}"> ${_ancEsc(c)} <span class="cft-ajuda">${_ancNum(n)} pacote(s)</span></label>`).join("")}
            </div>` : ""}
        <label class="cft-rotulo" for="anc-outra">Outra cidade</label>
        <input id="anc-outra" class="cft-input" list="anc-conhecidas" autocomplete="off" placeholder="Digite a cidade..." onkeydown="if(event.key==='Enter')_ancSalvarLogin()">
        <datalist id="anc-conhecidas">${conhecidas.map(c => `<option value="${_ancEsc(c)}">`).join("")}</datalist>
        <div class="cft-ajuda" id="anc-modal-status" style="min-height:18px;margin-top:8px"></div>
        <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
            <button class="cft-btn" onclick="_ancFecharModal()">Fechar</button>
            <button class="cft-btn primario" id="anc-modal-salvar" data-u="${_ancEsc(usuario)}" onclick="_ancSalvarLogin()">Acrescentar</button>
        </div>`);
}

async function _ancSalvarLogin() {
    const btn = document.getElementById("anc-modal-salvar");
    const st = document.getElementById("anc-modal-status");
    const usuario = btn.dataset.u;
    const cidades = [...document.querySelectorAll(".anc-marca")].filter(c => c.checked).map(c => c.value);
    const outra = document.getElementById("anc-outra").value.trim();
    if (outra) cidades.push(outra);
    if (!cidades.length) { st.innerText = "Marque ou digite pelo menos uma cidade."; return; }
    btn.disabled = true;
    st.innerText = "Salvando...";
    try {
        const r = await fetch(_ANC_CID_API(), {
            method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ transportadora: "anjun", usuario, cidades }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { btn.disabled = false; st.innerText = d.error || "Erro ao salvar."; return; }
        _ancCarregar(true);
        await _ancAbrirLogin(usuario);
    } catch (_) { btn.disabled = false; st.innerText = "Erro ao salvar."; }
}

async function _ancTirarCidade(id, usuario) {
    if (!confirm("Tirar esta cidade do login? Os pacotes dela passam a contar como cidade errada.")) return;
    const r = await fetch(`${_ANC_CID_API()}/${id}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } }).catch(() => null);
    if (!r || !r.ok) { alert("Não deu pra tirar a cidade."); return; }
    _ancCarregar(true);
    await _ancAbrirLogin(usuario);
}

/** "Cidades por login": a lista inteira da Anjun, com busca; clicar no login abre o cartão. */
async function _ancAbrirLista() {
    _ancModal(`<div class="cft-ajuda">Carregando...</div>`);
    try { await _ancCarregarLista(); } catch (e) { _ancModal(`<div class="cft-erro">${_ancEsc(e.message)}</div>`); return; }
    _ancModal(`
        <div class="cft-modal-titulo">Cidades por login · Anjun</div>
        <input class="cft-input" id="anc-lista-busca" placeholder="Buscar login ou cidade..." oninput="_ancPintarLista()" style="margin-bottom:10px">
        <div id="anc-lista-logins" style="max-height:60vh;overflow:auto"></div>
        <div class="cft-barra" style="justify-content:space-between;margin:10px 0 0">
            <span class="cft-ajuda">Login que não está aqui: clique nele na coluna Entregador da conferência.</span>
            <button class="cft-btn" onclick="_ancFecharModal()">Fechar</button>
        </div>`);
    _ancPintarLista();
}

function _ancPintarLista() {
    const busca = _ancChave((document.getElementById("anc-lista-busca") || {}).value);
    const porLogin = new Map();
    for (const l of _ancLista || []) {
        const k = _ancChave(l.usuario);
        if (!porLogin.has(k)) porLogin.set(k, { usuario: l.usuario, cidades: [] });
        porLogin.get(k).cidades.push(l.cidade);
    }
    const lista = [...porLogin.values()]
        .filter(u => !busca || _ancChave(u.usuario).includes(busca) || u.cidades.some(c => _ancChave(c).includes(busca)))
        .sort((a, b) => a.usuario.localeCompare(b.usuario, "pt-BR"));
    document.getElementById("anc-lista-logins").innerHTML = lista.length ? lista.map(u => `
        <div class="anc-lista-item"><a href="#" class="lag-acao" data-u="${_ancEsc(u.usuario)}" onclick="event.preventDefault();_ancAbrirLogin(this.dataset.u)">${_ancEsc(u.usuario)}</a>
            <span class="cft-ajuda">${u.cidades.map(_ancEsc).join(", ")}</span></div>`).join("")
        : `<div class="cft-ajuda">Nenhum login encontrado.</div>`;
}
