// ───── OPERAÇÃO › TRANSPORTADORAS › <TRANSPORTADORA> › CONFERÊNCIA ─────
// Sobe o relatório da transportadora e confere duas coisas (o que antes era CONT.SE na planilha):
//   1. foi atribuído?          pacote sem Entregador = sem atribuição
//   2. foi atribuído certo?    o login do Entregador atende a cidade do pacote?
// A lista login → cidades fica na aba "Cidades por usuário" desta tela. Login sem cidade ou com
// cidade fora da lista: clique no nome e marque as cidades que ele faz (mesmo jeito das
// pendências do fechamento). A conferência é refeita na hora contra a lista atual — não precisa
// subir o relatório de novo.
// Backend: /admin/conferencia-expedicao (modules/conferencia-expedicao). Começou pela Anjun;
// transportadora nova = relatório dela em relatorios.js + entrada em _CEX_NOMES.
const _CEX_API = () => `${API}/admin/conferencia-expedicao`;
const _CEX_NOMES = { anjun: "Anjun" };
const _CEX_STATUS = {
    sem_entregador:     { rotulo: "Sem atribuição",   classe: "cft-neg" },
    cidade_errada:      { rotulo: "Cidade errada",    classe: "cft-neg" },
    usuario_sem_cidade: { rotulo: "Login sem cidade", classe: "cft-aviso" },
    sem_cidade:         { rotulo: "Pacote sem cidade", classe: "cft-aviso" },
    ok:                 { rotulo: "Certo",            classe: "cft-pos" },
};
const _CEX_MAX_LINHAS = 500;

let _cexTransp = "anjun";
let _cexAba = "conferencia";
let _cexDados = null;     // resposta de /:transp/resultado
let _cexFiltro = "pend";  // pend | todos | um dos status
let _cexCidades = null;   // linhas de /cidades-usuario

function _cexEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _cexChave(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); }
function _cexHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _cexNum(n) { return Number(n || 0).toLocaleString("pt-BR"); }

function abrirConfExpedicao(event, transportadora) {
    if (event) event.preventDefault();
    _cexTransp = transportadora || "anjun";
    _cexDados = null;
    _cexCidades = null;
    const nome = _CEX_NOMES[_cexTransp] || _cexTransp;
    document.getElementById("cex-titulo").innerText = "Conferência — " + nome;
    mostrarTela("tela-conf-expedicao", "Conferencias/" + nome);
    document.getElementById("titulo-pagina").innerText = "Conferência — " + nome;
    _cexAbrirAba(_cexAba);
}

function _cexAbrirAba(aba) {
    _cexAba = aba;
    document.getElementById("cex-abas").innerHTML = [["conferencia", "Conferência"], ["cidades", "Cidades por usuário"]].map(([k, n]) =>
        `<button type="button" class="filtro-tab${k === aba ? " active" : ""}" onclick="_cexAbrirAba('${k}')">${n}</button>`).join("");
    document.getElementById("cex-painel-conferencia").style.display = aba === "conferencia" ? "" : "none";
    document.getElementById("cex-painel-cidades").style.display = aba === "cidades" ? "" : "none";
    if (aba === "conferencia") _cexCarregar();
    else _cexCarregarCidades();
}

// ── Conferência ──
function _cexCarregar(envio, msg) {
    const el = document.getElementById("cex-resultado");
    if (!_cexDados) el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    const qs = envio ? `?envio=${encodeURIComponent(envio)}` : (_cexDados && _cexDados.envio ? `?envio=${_cexDados.envio.id}` : "");
    fetch(`${_CEX_API()}/${_cexTransp}/resultado${qs}`, { headers: _cexHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cexEsc(d.error)}</div>`; return; }
        _cexDados = d;
        _cexRender(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

async function _cexSubir(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const st = document.getElementById("cex-status");
    st.className = "cft-ajuda";
    st.innerText = "Lendo arquivo...";
    try {
        const grade = await _confLerGrid(file); // conferencias.js
        st.innerText = "Enviando...";
        const r = await fetch(`${_CEX_API()}/${_cexTransp}/envios`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ arquivo: file.name, grade }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.className = "cft-erro"; st.innerText = d.error || "Erro ao enviar."; return; }
        st.innerText = "";
        const extra = [d.repetidos ? `${_cexNum(d.repetidos)} waybill repetido(s) contado(s) uma vez` : "",
            d.ignorados ? `${_cexNum(d.ignorados)} linha(s) sem waybill ignorada(s)` : ""].filter(Boolean).join(" · ");
        _cexDados = null;
        _cexCarregar(d.envio_id, `${_cexNum(d.linhas)} pacotes conferidos${extra ? " — " + extra : ""}.`);
    } catch (err) {
        st.className = "cft-erro";
        st.innerText = (err && err.message) || "Erro ao ler o arquivo.";
    }
}

function _cexRender(msg) {
    const d = _cexDados || {};
    const el = document.getElementById("cex-resultado");
    const envios = d.envios || [];
    const sel = envios.length > 1 ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_cexDados=null;_cexCarregar(this.value)">
        ${envios.map(e => `<option value="${e.id}"${d.envio && e.id === d.envio.id ? " selected" : ""}>${_cexEsc(_cexData(e.enviado_em))} · ${_cexNum(e.linhas)} pacotes</option>`).join("")}
    </select>` : "";
    const info = d.envio
        ? `<span class="cft-ajuda">${_cexEsc(d.envio.arquivo || "relatório")} · enviado ${d.envio.enviado_por ? "por " + _cexEsc(d.envio.enviado_por) + " " : ""}em ${_cexEsc(_cexData(d.envio.enviado_em))}</span>`
        : "";
    document.getElementById("cex-envio").innerHTML = sel + info + (msg ? `<span class="cft-ajuda cft-pos">${_cexEsc(msg)}</span>` : "");

    if (!d.envio) {
        el.innerHTML = `<div class="fechamento-empty">Suba o relatório da ${_cexEsc(_CEX_NOMES[_cexTransp] || _cexTransp)} pra conferir.</div>`;
        return;
    }
    const r = d.resumo || {};
    const kpi = (v, rot, cls) => `<div class="cft-kpi"><div class="cft-kpi-valor${v && cls ? " " + cls : ""}">${_cexNum(v)}</div><div class="cft-kpi-rotulo">${rot}</div></div>`;
    const usuarios = d.usuarios || [];
    const semCad = usuarios.filter(u => u.sem_cadastro);
    const comErro = usuarios.filter(u => !u.sem_cadastro && u.erradas);
    const tag = (u, n) => `<button class="cft-tag cft-tag-btn" data-u="${_cexEsc(u.usuario)}" onclick="_cexAbrirUsuario(this.dataset.u)">${_cexEsc(u.usuario)} <b>${_cexNum(n)}</b></button>`;
    const grupos = [];
    if (semCad.length) grupos.push(`<div class="cft-pend-grupo"><b>Login sem cidade cadastrada</b> — clique no nome pra dizer quais cidades ele faz:<div class="cft-pend-tags">${semCad.map(u => tag(u, u.qtd)).join("")}</div></div>`);
    if (comErro.length) grupos.push(`<div class="cft-pend-grupo"><b>Login com pacote de cidade que ele não faz</b> — confira a atribuição, ou clique no nome se a cidade for dele mesmo:<div class="cft-pend-tags">${comErro.map(u => tag(u, u.erradas)).join("")}</div></div>`);

    el.innerHTML = `
        <div class="cft-kpis">
            ${kpi(r.total, "Pacotes")}
            ${kpi(r.sem_entregador, "Sem atribuição", "cft-neg")}
            ${kpi(r.cidade_errada, "Cidade errada", "cft-neg")}
            ${kpi(r.usuario_sem_cidade, "Login sem cidade", "cft-aviso")}
            ${r.sem_cidade ? kpi(r.sem_cidade, "Pacote sem cidade", "cft-aviso") : ""}
            ${kpi(r.ok, "Atribuídos certo", "cft-pos")}
        </div>
        ${grupos.length ? `<div class="cft-pend"><div class="cft-pend-titulo">Pendências</div>${grupos.join("")}</div>` : ""}
        <div class="filtro-tabs" id="cex-filtros" style="margin-bottom:10px"></div>
        <div class="cft-barra" style="margin:0 0 10px">
            <input class="cft-input" id="cex-busca" placeholder="Buscar waybill, login ou cidade..." style="width:280px;flex:0 0 auto;margin:0" oninput="_cexPintarTabela()">
            <button class="cft-btn" onclick="_cexCopiar()">Copiar waybills</button>
            <span class="cft-ajuda" id="cex-copia"></span>
        </div>
        <div id="cex-tabela"></div>`;
    _cexPintarTabela();
}

function _cexData(v) {
    if (!v) return "";
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function _cexFiltrados() {
    const pacotes = (_cexDados && _cexDados.pacotes) || [];
    const q = _cexChave((document.getElementById("cex-busca") || {}).value);
    return pacotes.filter(p => (_cexFiltro === "todos" || (_cexFiltro === "pend" ? p.status !== "ok" : p.status === _cexFiltro))
        && (!q || _cexChave(p.waybill).includes(q) || _cexChave(p.entregador).includes(q) || _cexChave(p.cidade).includes(q)));
}

function _cexPintarTabela() {
    const r = (_cexDados && _cexDados.resumo) || {};
    const filtros = [["pend", "Pendentes", r.total - r.ok], ["sem_entregador", "Sem atribuição", r.sem_entregador],
        ["cidade_errada", "Cidade errada", r.cidade_errada], ["usuario_sem_cidade", "Login sem cidade", r.usuario_sem_cidade],
        ["sem_cidade", "Pacote sem cidade", r.sem_cidade], ["ok", "Certos", r.ok], ["todos", "Todos", r.total]]
        .filter(([k, , n]) => n || k === "pend" || k === "todos");
    const ft = document.getElementById("cex-filtros");
    if (ft) ft.innerHTML = filtros.map(([k, nome, n]) =>
        `<button type="button" class="filtro-tab${k === _cexFiltro ? " active" : ""}" onclick="_cexFiltro='${k}';_cexPintarTabela()">${nome} ${_cexNum(n)}</button>`).join("");
    const el = document.getElementById("cex-tabela");
    if (!el) return;
    const lista = _cexFiltrados();
    if (!lista.length) { el.innerHTML = `<div class="cft-ajuda">Nada por aqui.</div>`; return; }
    el.innerHTML = `<div class="cft-tabela-wrap" style="max-height:62vh"><table class="cft-tabela">
        <thead><tr><th>Waybill</th><th>Entregador</th><th>Cidade do destinatário</th><th>Cidades do login</th><th>Área de recebimento</th><th>Última rota</th><th>Entrada no ponto</th><th>Situação</th></tr></thead>
        <tbody>${lista.slice(0, _CEX_MAX_LINHAS).map(p => {
            const s = _CEX_STATUS[p.status] || { rotulo: p.status, classe: "" };
            const cid = p.cidades_usuario || [];
            return `<tr>
                <td>${_cexEsc(p.waybill)}</td>
                <td>${p.entregador ? `<a href="#" class="cft-link" data-u="${_cexEsc(p.entregador)}" onclick="event.preventDefault();_cexAbrirUsuario(this.dataset.u)">${_cexEsc(p.entregador)}</a>` : `<span class="cft-vazio">—</span>`}</td>
                <td>${_cexEsc(p.cidade) || `<span class="cft-vazio">—</span>`}</td>
                <td class="cft-ajuda" title="${_cexEsc(cid.join(", "))}">${cid.length ? _cexEsc(cid.slice(0, 3).join(", ")) + (cid.length > 3 ? ` +${cid.length - 3}` : "") : ""}</td>
                <td>${_cexEsc(p.area_recebimento)}</td>
                <td title="${_cexEsc(p.ultima_rota)}">${_cexEsc(String(p.ultima_rota || "").slice(0, 40))}</td>
                <td>${_cexEsc(p.entrada_ponto)}</td>
                <td class="${s.classe}">${s.rotulo}</td>
            </tr>`;
        }).join("")}</tbody></table></div>
        ${lista.length > _CEX_MAX_LINHAS ? `<div class="cft-ajuda" style="margin-top:6px">Mostrando ${_CEX_MAX_LINHAS} de ${_cexNum(lista.length)} — "Copiar waybills" leva todos do filtro.</div>` : ""}`;
}

function _cexCopiar() {
    const codigos = _cexFiltrados().map(p => p.waybill);
    const st = document.getElementById("cex-copia");
    if (!codigos.length) { st.innerText = "Nada pra copiar."; return; }
    navigator.clipboard.writeText(codigos.join("\n"))
        .then(() => { st.innerText = `${_cexNum(codigos.length)} copiado(s).`; })
        .catch(() => { st.innerText = "Não deu pra copiar."; });
}

// ── Card "Quais cidades esse login faz?" — cidades dele neste relatório pra marcar, mais uma
// livre. Grava em Cidades por usuário e refaz a conferência.
function _cexAbrirUsuario(usuario) {
    const d = _cexDados || {};
    const u = (d.usuarios || []).find(x => _cexChave(x.usuario) === _cexChave(usuario))
        || { usuario, qtd: 0, cadastradas: [], cidades: [], sem_cadastro: true };
    _cexFecharModal();
    const novas = u.cidades.filter(c => !c.atende);
    const conhecidas = new Set();
    for (const x of d.usuarios || []) { x.cadastradas.forEach(c => conhecidas.add(c)); x.cidades.forEach(c => conhecidas.add(c.cidade)); }
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "cex-modal";
    ov.innerHTML = `
        <div class="cft-modal">
            <div class="cft-modal-titulo">Quais cidades <span style="color:#e2e8f0">${_cexEsc(u.usuario)}</span> faz?</div>
            <div class="cft-ajuda" style="margin-bottom:10px">${_cexNum(u.qtd)} pacote${u.qtd !== 1 ? "s" : ""} dele neste relatório.</div>
            <div class="cft-ajuda">Já cadastradas:</div>
            ${u.cadastradas.length
                ? `<div class="cft-pend-tags" style="margin-bottom:12px">${u.cadastradas.map(c => `<span class="cft-tag">${_cexEsc(c)}</span>`).join("")}</div>`
                : `<div class="cft-ajuda" style="font-style:italic;margin-bottom:12px">Nenhuma.</div>`}
            ${novas.length ? `<div class="cft-ajuda">Cidades dele neste relatório que ainda não estão na lista — marque as que ele faz:</div>
                <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0 12px;max-height:200px;overflow:auto">
                    ${novas.map(c => `<label class="cft-ajuda" style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#cbd5e1">
                        <input type="checkbox" class="cex-marca" value="${_cexEsc(c.cidade)}"${u.sem_cadastro ? " checked" : ""}> ${_cexEsc(c.cidade)} <span class="cft-ajuda">${_cexNum(c.qtd)}</span></label>`).join("")}
                </div>` : ""}
            <label class="cft-rotulo" for="cex-outra">Outra cidade</label>
            <input id="cex-outra" class="cft-input" list="cex-cidades-conhecidas" autocomplete="off" placeholder="Digite a cidade..."
                onkeydown="if(event.key==='Enter')_cexSalvarUsuario()">
            <datalist id="cex-cidades-conhecidas">${[...conhecidas].sort((a, b) => a.localeCompare(b, "pt-BR")).map(c => `<option value="${_cexEsc(c)}">`).join("")}</datalist>
            <div class="cft-ajuda" id="cex-modal-status" style="min-height:18px;margin-top:8px"></div>
            <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
                <button class="cft-btn" onclick="_cexFecharModal()">Cancelar</button>
                <button class="cft-btn primario" id="cex-modal-salvar" data-u="${_cexEsc(u.usuario)}" onclick="_cexSalvarUsuario()">Salvar</button>
            </div>
        </div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _cexFecharModal(); });
    document.body.appendChild(ov);
}

function _cexFecharModal() {
    const ov = document.getElementById("cex-modal");
    if (ov) ov.remove();
}

async function _cexSalvarUsuario() {
    const btn = document.getElementById("cex-modal-salvar");
    const st = document.getElementById("cex-modal-status");
    const usuario = btn.dataset.u;
    const cidades = [...document.querySelectorAll(".cex-marca")].filter(c => c.checked).map(c => c.value);
    const outra = document.getElementById("cex-outra").value.trim();
    if (outra) cidades.push(outra);
    if (!cidades.length) { st.innerText = "Marque ou digite pelo menos uma cidade."; return; }
    btn.disabled = true;
    st.innerText = "Salvando...";
    try {
        const r = await fetch(`${_CEX_API()}/cidades-usuario`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ transportadora: _cexTransp, usuario, cidades }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { btn.disabled = false; st.innerText = d.error || "Erro ao salvar."; return; }
        _cexFecharModal();
        _cexCidades = null;
        _cexCarregar(null, `${usuario}: ${cidades.length} cidade(s) cadastrada(s).`);
    } catch (_) { btn.disabled = false; st.innerText = "Erro ao salvar."; }
}

// ── Cidades por usuário ──
function _cexCarregarCidades(msg) {
    const el = document.getElementById("cex-cidades");
    if (!_cexCidades) el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CEX_API()}/cidades-usuario?transportadora=${_cexTransp}`, { headers: _cexHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cexEsc(d.error)}</div>`; return; }
        _cexCidades = d.linhas || [];
        _cexRenderCidades(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

function _cexRenderCidades(msg) {
    const el = document.getElementById("cex-cidades");
    const busca = (document.getElementById("cex-cid-busca") || {}).value || "";
    const nome = _CEX_NOMES[_cexTransp] || _cexTransp;
    const usuarios = new Set((_cexCidades || []).map(l => _cexChave(l.usuario)));
    el.innerHTML = `
        <div class="cft-regras">
            <div class="cft-ajuda" style="margin-bottom:8px">Cada login da ${_cexEsc(nome)} e as cidades que ele faz. A conferência marca
                <b>Cidade errada</b> quando o pacote foi atribuído a um login que não tem a cidade dele aqui.</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <input class="cft-input" id="cex-cid-busca" placeholder="Buscar login ou cidade..." value="${_cexEsc(busca)}" style="width:240px;flex:0 0 auto;margin:0" oninput="_cexPintarCidades()">
                <label class="cft-btn" for="cex-cid-arquivo" style="cursor:pointer">Importar planilha</label>
                <input type="file" id="cex-cid-arquivo" accept=".csv,.xlsx,.xls" style="display:none" onchange="_cexImportar(this)">
                <span class="cft-ajuda">${_cexNum(usuarios.size)} login(s) · ${_cexNum((_cexCidades || []).length)} cidade(s)</span>
                <span class="cft-ajuda" id="cex-cid-status">${_cexEsc(msg || "")}</span>
            </div>
            <div class="cft-ajuda" style="margin-top:6px">Planilha: colunas <b>Usuário</b>, <b>Cidade</b> e (opcional) <b>Transportadora</b>; sem transportadora vale ${_cexEsc(nome)}. Soma ao que já existe.</div>
            <div class="cft-barra" style="margin:12px 0 0;flex-wrap:wrap">
                <input class="cft-input" id="cex-cid-novo-u" placeholder="Login" style="width:200px;flex:0 0 auto;margin:0">
                <input class="cft-input" id="cex-cid-novo-c" placeholder="Cidade" style="width:200px;flex:0 0 auto;margin:0" onkeydown="if(event.key==='Enter')_cexAdicionar()">
                <button class="cft-btn primario" onclick="_cexAdicionar()">Adicionar</button>
            </div>
        </div>
        <div id="cex-cid-lista"></div>`;
    _cexPintarCidades();
}

function _cexPintarCidades() {
    const el = document.getElementById("cex-cid-lista");
    if (!el) return;
    const q = _cexChave((document.getElementById("cex-cid-busca") || {}).value);
    const grupos = new Map();
    for (const l of _cexCidades || []) {
        const k = _cexChave(l.usuario);
        if (!grupos.has(k)) grupos.set(k, { usuario: l.usuario, cidades: [] });
        grupos.get(k).cidades.push(l);
    }
    const lista = [...grupos.values()].filter(g => !q || _cexChave(g.usuario).includes(q) || g.cidades.some(c => _cexChave(c.cidade).includes(q)));
    if (!lista.length) { el.innerHTML = `<div class="cft-ajuda">${(_cexCidades || []).length ? "Ninguém com esse nome." : "Nenhum login cadastrado ainda — importe a planilha ou adicione acima."}</div>`; return; }
    el.innerHTML = `<div class="cft-tabela-wrap"><table class="cft-tabela"><thead><tr><th>Login</th><th>Cidades</th><th></th></tr></thead><tbody>
        ${lista.slice(0, 300).map(g => `<tr>
            <td style="vertical-align:top">${_cexEsc(g.usuario)}</td>
            <td style="white-space:normal"><div class="cft-pend-tags" style="margin:0">${g.cidades.map(c =>
                `<span class="cft-tag" title="${_cexEsc(c.criado_por ? "por " + c.criado_por : "")}">${_cexEsc(c.cidade)}
                    <a href="#" class="cft-ajuda" style="margin-left:4px;text-decoration:none" title="Tirar" onclick="event.preventDefault();_cexRemover(${Number(c.id)})">×</a></span>`).join("")}</div></td>
            <td style="vertical-align:top"><a href="#" class="cft-link" data-u="${_cexEsc(g.usuario)}" onclick="event.preventDefault();_cexNovaCidade(this.dataset.u)">+ cidade</a></td>
        </tr>`).join("")}
    </tbody></table></div>
    ${lista.length > 300 ? `<div class="cft-ajuda" style="margin-top:6px">Mostrando 300 de ${_cexNum(lista.length)} — busque pra achar os outros.</div>` : ""}`;
}

function _cexNovaCidade(usuario) {
    document.getElementById("cex-cid-novo-u").value = usuario;
    const c = document.getElementById("cex-cid-novo-c");
    c.value = "";
    c.focus();
}

async function _cexAdicionar() {
    const usuario = document.getElementById("cex-cid-novo-u").value.trim();
    const cidade = document.getElementById("cex-cid-novo-c").value.trim();
    if (!usuario || !cidade) { gcAlert("Preencha o login e a cidade."); return; }
    try {
        const r = await fetch(`${_CEX_API()}/cidades-usuario`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ transportadora: _cexTransp, usuario, cidades: [cidade] }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { gcAlert(d.error || "Erro ao salvar."); return; }
        _cexDados = null;
        _cexCarregarCidades(d.inseridos ? `${usuario} → ${cidade}.` : "Já estava na lista.");
    } catch (_) { gcAlert("Erro ao salvar."); }
}

function _cexRemover(id) {
    fetch(`${_CEX_API()}/cidades-usuario/${id}`, { method: "DELETE", headers: _cexHeaders() })
    .then(r => r.json())
    .then(d => { if (d.error) gcAlert(d.error); else { _cexDados = null; _cexCarregarCidades("Removida."); } })
    .catch(() => gcAlert("Erro ao remover."));
}

async function _cexImportar(input) {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const st = document.getElementById("cex-cid-status");
    st.innerText = "Lendo...";
    try {
        const grade = (await _confLerGrid(file)).filter(l => l.some(c => String(c).trim()));
        const cab = (grade[0] || []).map(_cexChave);
        const iu = cab.findIndex(h => h.includes("usuario") || h.includes("login") || h.includes("entregador"));
        const ic = cab.findIndex(h => h.includes("cidade"));
        const it = cab.findIndex(h => h.includes("transportadora"));
        // Sem cabeçalho reconhecível: lê na ordem usuário, cidade, transportadora.
        const temCab = iu >= 0 && ic >= 0;
        const linhas = (temCab ? grade.slice(1) : grade).map(l => temCab
            ? [l[iu], l[ic], it >= 0 ? l[it] : ""]
            : [l[0], l[1], l[2] || ""]);
        const r = await fetch(`${_CEX_API()}/cidades-usuario/importar`, {
            method: "POST", headers: _cexHeaders(true), body: JSON.stringify({ transportadora: _cexTransp, linhas }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { st.innerText = d.error || "Erro ao importar."; return; }
        _cexDados = null;
        _cexCarregarCidades(`${_cexNum(d.inseridos)} nova(s)` + (d.ja_existiam ? `, ${_cexNum(d.ja_existiam)} já existia(m)` : "")
            + (d.ignorados ? `, ${_cexNum(d.ignorados)} linha(s) ignorada(s)` : "") + ".");
    } catch (err) { st.innerText = (err && err.message) || "Erro ao ler o arquivo."; }
}
