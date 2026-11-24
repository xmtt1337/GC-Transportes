// ───── OPERAÇÃO › TRANSPORTADORAS › ANJUN / IMILE › CONFERÊNCIA ─────
// A Conferência do dia de cada transportadora no PADRÃO das conferências (desde 24/11/2026; Loggi e
// Shopee entram depois). Quem desenha é o js/conferencia-padrao.js — o MESMO arquivo das páginas do
// XMTT nos portais (automacao/xm-conferencias/extensao/padrao): números do dia, abas Por cidade /
// Por entregador / Atribuídos errado / Na base / Certos e o "Visualizar" com os pedidos.
// Aqui: o dia, o polo (dev/admin), Atualizar, "Cidades por login" e o cartão de cada login (clicar no
// entregador abre: as cidades cadastradas e as de hoje que faltam, para corrigir a lista).
// Quem lê o portal é a extensão XM - Conferências (XMTT › Conferências › Conferência do dia ›
// "Conferir agora"); o sistema refaz a conta a cada abertura contra a lista login → cidades atual.
// Backend: /macros/<transportadora>-conferencia (sistema-backend/modules/conferencia-padrao).
// (Antes: js/anjun-conferencia.js, só da Anjun e só com as pendências.)

const _CD_CFG = {
    anjun: {
        nome: "Anjun", api: "anjun-conferencia", tela: "tela-anjun-conferencia", rota: "Conferencias/Anjun", pre: "anc", quem: "login",
        onde: "No portal da Anjun, abra XMTT › Conferências › Conferência do dia e clique em Conferir agora.",
        extras: [{ campo: "cliente", titulo: "Cliente" }, { campo: "valor", titulo: "Valor declarado", formato: "moeda" }, { campo: "entrada", titulo: "Entrada no ponto", formato: "hora" }],
        info: d => `${_cdNum(d.total)} recebidos no ponto`,
        vazio: d => !d.total && !(d.ignoradas || []).length,
    },
    imile: {
        nome: "iMile", api: "imile-conferencia", tela: "tela-imile-conferencia", rota: "Conferencias/Imile", pre: "imc", quem: "entregador",
        onde: "No DS da iMile, abra XM › Conferências › Conferência do dia e clique em Conferir agora.",
        extras: [{ campo: "status_pacote", titulo: "Last Scan Status" }, { campo: "entrada", titulo: "Recebido no hub", formato: "hora" }],
        rotulos: { aCaminho: "A caminho do DS" },
        info: d => `${_cdNum(d.recebidos_hub)} recebidos no hub, ${_cdNum(d.total)} já no DS`,
        vazio: d => !d.recebidos_hub,
    },
};
const _CD_POLOS = { cacador: "Caçador", videira: "Videira", joacaba: "Joaçaba" };
const _CD_ATUALIZAR_MS = 60000;
// As cores da tela padrão no tema do sistema (escuro).
const _CD_TEMA = {
    "--xcp-texto": "#e2e8f0", "--xcp-sub": "#8494a9", "--xcp-borda": "rgba(255,255,255,0.08)", "--xcp-cartao": "transparent",
    "--xcp-janela": "#121a26", "--xcp-cabecalho": "#141b26", "--xcp-linha": "rgba(255,255,255,0.04)", "--xcp-hover": "rgba(255,255,255,0.03)",
    "--xcp-destaque": "#3a86ff", "--xcp-ok": "#22c55e", "--xcp-base": "#f59e0b", "--xcp-erro": "#ef4444", "--xcp-trilho": "rgba(255,255,255,0.08)",
    "--xcp-campo": "rgba(255,255,255,0.04)", "--xcp-veu": "rgba(2,6,14,0.7)", "--xcp-raio": "12px", "--xcp-sombra": "none",
};

const _cdEstado = {};   // por transportadora: { dados, dia, polo, timer, vista }
let _cdAtual = "anjun"; // a da tela aberta (o cartão do login usa)

const _cdEsc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const _cdNum = n => Number(n || 0).toLocaleString("pt-BR");
const _cdDiaBr = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const _cdChave = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const _cdEst = t => (_cdEstado[t] = _cdEstado[t] || { dados: null, dia: null, polo: "", timer: null, vista: null });

function abrirAnjunConferencia(event) { _cdAbrir(event, "anjun"); }
function abrirImileConferencia(event) { _cdAbrir(event, "imile"); }

function _cdAbrir(event, t) {
    if (event) event.preventDefault();
    const cfg = _CD_CFG[t];
    const est = _cdEst(t);
    _cdAtual = t;
    est.dia = null;
    mostrarTela(cfg.tela, cfg.rota);
    document.getElementById("titulo-pagina").innerText = `Conferência — ${cfg.nome}`;
    _cdCarregar(t);
    clearInterval(est.timer);
    est.timer = setInterval(() => {
        const tela = document.getElementById(cfg.tela);
        if (!tela || !tela.classList.contains("active-view")) { clearInterval(est.timer); if (est.vista) est.vista.fecharJanela(); return; }
        if (!document.hidden) _cdCarregar(t, true);
    }, _CD_ATUALIZAR_MS);
}

/** As duas caixas do resultado: a mensagem (carregando, erro, vazio) e a tela padrão. */
function _cdCaixas(t) {
    const cfg = _CD_CFG[t];
    const el = document.getElementById(`${cfg.pre}-resultado`);
    if (!el.querySelector(".cd-msg")) el.innerHTML = `<div class="cd-msg"></div><div class="cd-padrao"></div>`;
    return { msg: el.querySelector(".cd-msg"), padrao: el.querySelector(".cd-padrao") };
}

function _cdMensagem(t, html) {
    const { msg, padrao } = _cdCaixas(t);
    msg.innerHTML = html;
    padrao.hidden = true;
}

function _cdCarregar(t, quieto) {
    const cfg = _CD_CFG[t];
    const est = _cdEst(t);
    if (!quieto) _cdMensagem(t, `<div class="cft-ajuda">Carregando...</div>`);
    const q = new URLSearchParams();
    if (est.dia) q.set("dia", est.dia);
    if (est.polo) q.set("polo", est.polo);
    fetch(`${API}/macros/${cfg.api}${q.toString() ? "?" + q : ""}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) { _cdMensagem(t, `<div class="cft-erro">${_cdEsc(d.error)}</div>`); return; }
            est.dados = d;
            _cdPintar(t);
        })
        .catch(() => { if (!quieto) _cdMensagem(t, `<div class="cft-erro">Erro ao conectar com o servidor.</div>`); });
}

function _cdMudarDia(t, dia) { _cdEst(t).dia = dia; _cdCarregar(t); }
function _cdMudarPolo(t, polo) { _cdEst(t).polo = polo; _cdCarregar(t); }

/** A linha embaixo dos números: recebidos, polo, quem leu. */
function _cdInfo(t, d) {
    const lido = d.leitura || {};
    return `${_CD_CFG[t].info(d)} ${d.dia === d.hoje ? "hoje" : "em " + _cdDiaBr(d.dia)}${d.polo ? ` · ${_CD_POLOS[d.polo] || d.polo}` : " (todos os polos)"}`
        + (d.ve_tudo && !d.polo && d.sem_polo ? ` · ${_cdNum(d.sem_polo)} sem polo conhecido` : "")
        + (lido.lido_em ? ` · lido às ${new Date(lido.lido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${lido.usuario ? " por " + lido.usuario : ""}` : "")
        + ". As leituras do dia se somam.";
}

function _cdPintar(t) {
    const cfg = _CD_CFG[t];
    const est = _cdEst(t);
    const d = est.dados || {};
    const dias = d.dias || [];
    const selDia = dias.length ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_cdMudarDia('${t}', this.value)">
        ${dias.map(x => `<option value="${x}"${x === d.dia ? " selected" : ""}>${_cdDiaBr(x)}${x === d.hoje ? " (hoje)" : ""}</option>`).join("")}</select>` : "";
    const selPolo = d.ve_tudo ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_cdMudarPolo('${t}', this.value)">
        <option value="">Todos os polos</option>${Object.entries(_CD_POLOS).map(([k, n]) => `<option value="${k}"${k === est.polo ? " selected" : ""}>${n}</option>`).join("")}</select>`
        : (d.polo ? `<span class="cft-ajuda">Polo ${_cdEsc(_CD_POLOS[d.polo] || d.polo)}</span>` : "");
    document.getElementById(`${cfg.pre}-barra`).innerHTML = selDia + selPolo
        + `<button class="cft-btn" onclick="_cdCarregar('${t}')">Atualizar</button><button class="cft-btn" onclick="_cdAbrirLista('${t}')">Cidades por ${cfg.quem}</button>`;

    if (!d.dia || cfg.vazio(d)) {
        _cdMensagem(t, `<div class="cft-ajuda">${d.dia ? "Nenhum pacote recebido neste dia" + (d.polo ? " no polo." : ".") : "Ninguém conferiu ainda."} ${_cdEsc(cfg.onde)}</div>`);
        return;
    }
    const { msg, padrao } = _cdCaixas(t);
    msg.innerHTML = "";
    padrao.hidden = false;
    if (!est.vista) {
        est.vista = XMConfPadrao.criar(padrao, {
            tema: _CD_TEMA,
            extras: cfg.extras,
            rotulos: cfg.rotulos,
            info: dd => _cdInfo(t, dd),
            aoIgnorar: (cidade, tirar) => _cdIgnorar(t, cidade, tirar),
            aoEntregador: u => { _cdAtual = t; _cdAbrirLogin(u); },
        });
    }
    est.vista.mostrar(d);
}

// Tirar/voltar uma cidade da conta: vale para todos e todo dia (fica no log com quem fez).
function _cdIgnorar(t, cidade, ignorar) {
    fetch(`${API}/macros/${_CD_CFG[t].api}/ignorar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ cidade, ignorar }),
    }).then(r => r.json()).then(d => {
        if (d.error) { alert(d.error); return; }
        _cdCarregar(t, true);
    }).catch(() => alert("Erro ao conectar com o servidor."));
}

// ── Cidades de cada login (lista login → cidades da transportadora, a mesma da conferência) ──
// Clicar no entregador (abas Por entregador, Atribuídos errado e Certos) abre o cartão: cidades já
// cadastradas (com "×" pra tirar) e as cidades dele hoje que ainda não estão, pra marcar.
// "Cidades por login" na barra mostra a lista inteira. Toda mudança fica no log com quem fez.
const _CD_CID_API = () => `${API}/admin/conferencia-expedicao/cidades-usuario`;
let _cdLista = null; // linhas de cidades-usuario da transportadora aberta

async function _cdCarregarLista(t) {
    const r = await fetch(`${_CD_CID_API()}?transportadora=${t}`, { headers: { "Authorization": "Bearer " + token } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Erro ao ler a lista de cidades.");
    _cdLista = d.linhas || [];
    return _cdLista;
}

function _cdFecharModal() { const ov = document.getElementById("cd-modal"); if (ov) ov.remove(); }

function _cdModal(html) {
    _cdFecharModal();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "cd-modal";
    ov.innerHTML = `<div class="cft-modal">${html}</div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _cdFecharModal(); });
    document.body.appendChild(ov);
}

async function _cdAbrirLogin(usuario) {
    const t = _cdAtual;
    const cfg = _CD_CFG[t];
    _cdModal(`<div class="cft-ajuda">Carregando...</div>`);
    try { await _cdCarregarLista(t); } catch (e) { _cdModal(`<div class="cft-erro">${_cdEsc(e.message)}</div>`); return; }
    const k = _cdChave(usuario);
    const dele = _cdLista.filter(l => _cdChave(l.usuario) === k);
    const cadastradas = new Set(dele.map(l => _cdChave(l.cidade)));
    // Cidades dos pedidos dele hoje que não estão na lista (os "atribuído errado" e "sem cidade cadastrada").
    const d = _cdEst(t).dados || {};
    const hoje = new Map();
    for (const p of XMConfPadrao.pacotesDe(d)) {
        if (_cdChave(p.entregador) !== k || !p.cidade || p.status === "ok" || cadastradas.has(_cdChave(p.cidade))) continue;
        hoje.set(p.cidade, (hoje.get(p.cidade) || 0) + 1);
    }
    const conhecidas = [...new Set(_cdLista.map(l => l.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    _cdModal(`
        <div class="cft-modal-titulo">Cidades de <span style="color:#e2e8f0">${_cdEsc(usuario)}</span> na ${_cdEsc(cfg.nome)}</div>
        <div class="cft-ajuda">Cadastradas (a conferência só dá "certo" nestas):</div>
        ${dele.length ? `<div class="cft-pend-tags" style="margin:6px 0 12px">${dele.map(l => `<span class="cft-tag">${_cdEsc(l.cidade)}
            <a href="#" class="lag-acao" title="Tirar esta cidade" data-u="${_cdEsc(usuario)}" onclick="event.preventDefault();_cdTirarCidade(${Number(l.id)}, this.dataset.u)">×</a></span>`).join("")}</div>`
            : `<div class="cft-ajuda" style="font-style:italic;margin:6px 0 12px">Nenhuma: os pedidos dele aparecem como "Entregador sem cidade cadastrada".</div>`}
        ${hoje.size ? `<div class="cft-ajuda">Cidades dele hoje que não estão na lista. Marque as que ele faz:</div>
            <div style="display:flex;flex-direction:column;gap:4px;margin:6px 0 12px;max-height:200px;overflow:auto">
            ${[...hoje].map(([c, n]) => `<label class="cft-ajuda" style="display:flex;align-items:center;gap:8px;cursor:pointer;color:#cbd5e1">
                <input type="checkbox" class="cd-marca" value="${_cdEsc(c)}"> ${_cdEsc(c)} <span class="cft-ajuda">${_cdNum(n)} pedido(s)</span></label>`).join("")}
            </div>` : ""}
        <label class="cft-rotulo" for="cd-outra">Outra cidade</label>
        <input id="cd-outra" class="cft-input" list="cd-conhecidas" autocomplete="off" placeholder="Digite a cidade..." onkeydown="if(event.key==='Enter')_cdSalvarLogin()">
        <datalist id="cd-conhecidas">${conhecidas.map(c => `<option value="${_cdEsc(c)}">`).join("")}</datalist>
        <div class="cft-ajuda" id="cd-modal-status" style="min-height:18px;margin-top:8px"></div>
        <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
            <button class="cft-btn" onclick="_cdFecharModal()">Fechar</button>
            <button class="cft-btn primario" id="cd-modal-salvar" data-u="${_cdEsc(usuario)}" onclick="_cdSalvarLogin()">Acrescentar</button>
        </div>`);
}

async function _cdSalvarLogin() {
    const t = _cdAtual;
    const btn = document.getElementById("cd-modal-salvar");
    const st = document.getElementById("cd-modal-status");
    const usuario = btn.dataset.u;
    const cidades = [...document.querySelectorAll(".cd-marca")].filter(c => c.checked).map(c => c.value);
    const outra = document.getElementById("cd-outra").value.trim();
    if (outra) cidades.push(outra);
    if (!cidades.length) { st.innerText = "Marque ou digite pelo menos uma cidade."; return; }
    btn.disabled = true;
    st.innerText = "Salvando...";
    try {
        const r = await fetch(_CD_CID_API(), {
            method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ transportadora: t, usuario, cidades }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { btn.disabled = false; st.innerText = d.error || "Erro ao salvar."; return; }
        _cdCarregar(t, true);
        await _cdAbrirLogin(usuario);
    } catch (_) { btn.disabled = false; st.innerText = "Erro ao salvar."; }
}

async function _cdTirarCidade(id, usuario) {
    const t = _cdAtual;
    if (!confirm("Tirar esta cidade? Os pedidos dela passam a contar como atribuídos errado.")) return;
    const r = await fetch(`${_CD_CID_API()}/${id}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token } }).catch(() => null);
    if (!r || !r.ok) { alert("Não deu pra tirar a cidade."); return; }
    _cdCarregar(t, true);
    await _cdAbrirLogin(usuario);
}

/** "Cidades por login": a lista inteira da transportadora, com busca; clicar no login abre o cartão. */
async function _cdAbrirLista(t) {
    _cdAtual = t;
    const cfg = _CD_CFG[t];
    _cdModal(`<div class="cft-ajuda">Carregando...</div>`);
    try { await _cdCarregarLista(t); } catch (e) { _cdModal(`<div class="cft-erro">${_cdEsc(e.message)}</div>`); return; }
    _cdModal(`
        <div class="cft-modal-titulo">Cidades por ${_cdEsc(cfg.quem)} · ${_cdEsc(cfg.nome)}</div>
        <input class="cft-input" id="cd-lista-busca" placeholder="Buscar ${_cdEsc(cfg.quem)} ou cidade..." oninput="_cdPintarLista()" style="margin-bottom:10px">
        <div id="cd-lista-logins" style="max-height:60vh;overflow:auto"></div>
        <div class="cft-barra" style="justify-content:space-between;margin:10px 0 0">
            <span class="cft-ajuda">Quem não está aqui: clique no nome dele na conferência (aba Por entregador).</span>
            <button class="cft-btn" onclick="_cdFecharModal()">Fechar</button>
        </div>`);
    _cdPintarLista();
}

function _cdPintarLista() {
    const busca = _cdChave((document.getElementById("cd-lista-busca") || {}).value);
    const porLogin = new Map();
    for (const l of _cdLista || []) {
        const k = _cdChave(l.usuario);
        if (!porLogin.has(k)) porLogin.set(k, { usuario: l.usuario, cidades: [] });
        porLogin.get(k).cidades.push(l.cidade);
    }
    const lista = [...porLogin.values()]
        .filter(u => !busca || _cdChave(u.usuario).includes(busca) || u.cidades.some(c => _cdChave(c).includes(busca)))
        .sort((a, b) => a.usuario.localeCompare(b.usuario, "pt-BR"));
    document.getElementById("cd-lista-logins").innerHTML = lista.length ? lista.map(u => `
        <div class="anc-lista-item"><a href="#" class="lag-acao" data-u="${_cdEsc(u.usuario)}" onclick="event.preventDefault();_cdAbrirLogin(this.dataset.u)">${_cdEsc(u.usuario)}</a>
            <span class="cft-ajuda">${u.cidades.map(_cdEsc).join(", ")}</span></div>`).join("")
        : `<div class="cft-ajuda">Ninguém encontrado.</div>`;
}
