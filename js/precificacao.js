// ───── FECHAMENTO › PRECIFICAÇÃO ─────
// A planilha de precificação no sistema: uma aba por transportadora, com cidade, faixa de
// CEP, região, polo, prazo (SLA), Direto/Parceiro e valor + incentivo (por tipo de produto na
// Total Express). Cada transportadora importa uma vez da planilha; depois disso o fechamento
// só lê daqui. Mudou preço → Recalcular a quinzena no Criar Fechamento.
// Ver: gestor. Editar/importar: só dev. Backend: /admin/precificacao (modules/precificacao).
const _PR_API = () => `${API}/admin/precificacao`;
let _prTransp = null;      // chave da transportadora aberta
let _prLista = [];         // [{chave, nome, aba, importado_em}]
let _prDados = null;       // GET /admin/precificacao da transportadora
let _prAba = "tabela";     // "tabela" | "historico"
let _prReq = 0;

function _prEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _prHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _prDev() { return !!(window._gcUser && window._gcUser.role === "dev"); }
function _prMoeda(n) {
    return n === null || n === undefined || n === "" ? "—" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _prCep(n) {
    if (n === null || n === undefined || n === "") return "";
    const s = String(n).padStart(8, "0");
    return s.slice(0, 5) + "-" + s.slice(5);
}
function _prQuando(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function abrirPrecificacao(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-precificacao");
    document.getElementById("pr-conteudo").innerHTML = `
        <div class="cft-secao" style="margin-top:0">Precificação</div>
        <div class="cft-ajuda" style="margin-bottom:14px">Preço e prazo de cada cidade por transportadora — o que antes ficava na planilha de precificação.
            Depois de importar uma transportadora, o fechamento passa a usar só o que está aqui. Mudou um valor: clique em Recalcular no Criar Fechamento pra valer.</div>
        <div class="cft-barra" style="margin:0 0 10px;gap:8px;flex-wrap:wrap" id="pr-transps"></div>
        <div id="pr-corpo">${skLogo(true)}</div>`;
    fetch(`${_PR_API()}/transportadoras`, { headers: _prHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.error) { document.getElementById("pr-corpo").innerHTML = `<div class="cft-erro">${_prEsc(d.error)}</div>`; return; }
            _prLista = d.transportadoras || [];
            if (!_prTransp || !_prLista.some(t => t.chave === _prTransp)) _prTransp = _prLista.length ? _prLista[0].chave : null;
            _prCarregar();
        })
        .catch(() => { document.getElementById("pr-corpo").innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

function _prDesenharTransps() {
    document.getElementById("pr-transps").innerHTML = _prLista.map(t =>
        `<button type="button" class="filtro-tab${t.chave === _prTransp ? " active" : ""}" onclick="_prTrocar('${t.chave}')">${_prEsc(t.nome)}${t.importado_em ? "" : ` <span style="color:#eab308;font-size:11px">planilha</span>`}</button>`).join("");
}

function _prTrocar(chave) { _prTransp = chave; _prAba = "tabela"; _prCarregar(); }

function _prCarregar() {
    _prDesenharTransps();
    const corpo = document.getElementById("pr-corpo");
    if (!_prTransp) { corpo.innerHTML = `<div class="cft-ajuda">Nenhuma transportadora com preço.</div>`; return; }
    corpo.innerHTML = skLogo(true);
    const id = ++_prReq;
    fetch(`${_PR_API()}?transportadora=${encodeURIComponent(_prTransp)}`, { headers: _prHeaders() })
        .then(r => r.json())
        .then(d => {
            if (id !== _prReq) return;
            if (d.error) { corpo.innerHTML = `<div class="cft-erro">${_prEsc(d.error)}</div>`; return; }
            _prDados = d;
            _prDesenhar();
        })
        .catch(() => { if (id === _prReq) corpo.innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

function _prTrocarAba(aba) { _prAba = aba; _prDesenhar(); }

function _prDesenhar() {
    const d = _prDados, t = _prLista.find(x => x.chave === _prTransp) || {};
    const corpo = document.getElementById("pr-corpo");
    const sistema = d.fonte === "sistema";
    const status = sistema
        ? `<span>No sistema desde ${_prQuando(d.importado_em)}${d.importado_por ? ` (${_prEsc(d.importado_por)})` : ""}.</span>
           ${_prDev() ? `<button class="cft-link" onclick="_prImportar(true)">Importar de novo da planilha</button>` : ""}`
        : `<span style="color:#eab308">Ainda lendo da planilha (aba "${_prEsc(t.aba)}") — o que aparece abaixo é a planilha, só leitura.</span>
           ${_prDev() ? `<button class="cft-btn primario" onclick="_prImportar(false)">Importar da planilha</button>` : `<span class="cft-ajuda">Só dev importa.</span>`}`;
    const usam = (t.tambem_usam || []).length
        ? `<div class="cft-ajuda" style="margin:0 0 10px">A ${_prEsc(t.tambem_usam.join(" e a "))} também usa esta tabela (não tem tabela própria).</div>` : "";
    corpo.innerHTML = `
        <div class="cft-barra" style="margin:0 0 10px;gap:12px;flex-wrap:wrap;align-items:center">${status}</div>
        ${usam}
        ${d.erro ? `<div class="cft-erro" style="margin-bottom:10px">${_prEsc(d.erro)}</div>` : ""}
        <div class="cft-barra" style="margin:0 0 10px;gap:8px">
            <button type="button" class="filtro-tab${_prAba === "tabela" ? " active" : ""}" onclick="_prTrocarAba('tabela')">Tabela</button>
            ${sistema ? `<button type="button" class="filtro-tab${_prAba === "historico" ? " active" : ""}" onclick="_prTrocarAba('historico')">Histórico</button>` : ""}
        </div>
        <div id="pr-aba"></div>`;
    if (_prAba === "historico" && sistema) _prCarregarHistorico();
    else _prDesenharTabela();
}

/** Linhas que batem com a busca (cidade, polo, região, motoristas). */
function _prFiltrar(linhas, q) {
    const n = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const b = n(q).trim();
    if (!b) return linhas;
    return linhas.filter(l => [l.cidade, l.polo, l.regiao, l.motoristas].some(x => n(x).includes(b)));
}

function _prDesenharTabela() {
    const d = _prDados;
    const el = document.getElementById("pr-aba");
    const editar = d.fonte === "sistema" && _prDev();
    const busca = (document.getElementById("pr-busca") || {}).value || "";
    el.innerHTML = `
        <div class="cft-barra" style="margin:0 0 10px;gap:10px;flex-wrap:wrap;align-items:center">
            <input id="pr-busca" class="cft-input" style="max-width:280px;margin:0" placeholder="Buscar cidade, polo, região..." value="${_prEsc(busca)}" oninput="_prDesenharLinhas()">
            <span class="cft-ajuda" id="pr-contagem"></span>
            ${editar ? `<button class="cft-btn primario" onclick="_prAbrirLinha(null)">Adicionar cidade</button>` : ""}
        </div>
        <div class="cft-tabela-wrap" style="max-height:65vh;overflow:auto"><table class="cft-tabela"><thead><tr>
            <th>Cidade</th><th>CEP inicial</th><th>CEP final</th><th>Região</th><th>Polo</th><th class="num">SLA</th><th>Direto/Parceiro</th>
            ${d.tipos.map(tp => `<th class="num">${d.tipos.length > 1 ? _prEsc(tp) + " " : ""}Valor</th><th class="num">${d.tipos.length > 1 ? _prEsc(tp) + " " : ""}Incentivo</th>`).join("")}
            <th>Motoristas</th>${editar ? "<th></th>" : ""}
        </tr></thead><tbody id="pr-linhas"></tbody></table></div>`;
    _prDesenharLinhas();
}

function _prDesenharLinhas() {
    const d = _prDados;
    const editar = d.fonte === "sistema" && _prDev();
    const linhas = _prFiltrar(d.linhas, (document.getElementById("pr-busca") || {}).value);
    document.getElementById("pr-contagem").innerText = `${linhas.length} de ${d.linhas.length} linha${d.linhas.length !== 1 ? "s" : ""}`;
    document.getElementById("pr-linhas").innerHTML = linhas.map(l => {
        const v = l.valores || {};
        return `<tr>
            <td>${_prEsc(l.cidade)}</td><td>${_prCep(l.cep_ini)}</td><td>${_prCep(l.cep_fim)}</td><td>${_prEsc(l.regiao || "")}</td>
            <td>${_prEsc(l.polo || "")}</td><td class="num">${l.sla ?? ""}</td><td>${l.parceiro ? "Parceiro" : "Direto"}</td>
            ${d.tipos.map(tp => `<td class="num">${_prMoeda(v[tp] ? v[tp].valor : null)}</td><td class="num">${_prMoeda(v[tp] ? v[tp].incentivo : null)}</td>`).join("")}
            <td style="white-space:normal;max-width:240px">${_prEsc(l.motoristas || "")}</td>
            ${editar ? `<td><button class="cft-link" onclick="_prAbrirLinha(${l.id})">Editar</button>
                <button class="cft-link cft-neg" style="margin-left:8px" onclick="_prRemover(${l.id})">Remover</button></td>` : ""}
        </tr>`;
    }).join("") || `<tr><td colspan="99" class="cft-ajuda">Nenhuma linha.</td></tr>`;
}

function _prImportar(deNovo) {
    const t = _prLista.find(x => x.chave === _prTransp) || {};
    const msg = deNovo
        ? `Importar de novo a aba "${t.aba}" da planilha? Isso SUBSTITUI a tabela da ${t.nome} no sistema (o que foi editado aqui se perde; fica no histórico).`
        : `Importar a aba "${t.aba}" da planilha pra o sistema? A partir daí o fechamento da ${t.nome} lê só daqui.`;
    gcConfirm(msg, async () => {
        try {
            const r = await fetch(`${_PR_API()}/importar`, { method: "POST", headers: _prHeaders(true), body: JSON.stringify({ transportadora: _prTransp }) });
            const d = await r.json();
            if (!r.ok) return gcAlert(d.error || "Não foi possível importar.");
            gcAlert(`${d.linhas} linha${d.linhas !== 1 ? "s" : ""} importada${d.linhas !== 1 ? "s" : ""}. Recalcule a quinzena no Criar Fechamento.`);
            abrirPrecificacao();
        } catch (_) { gcAlert("Erro ao conectar com o servidor."); }
    }, null, "Importar");
}

// ── Adicionar / editar uma linha ──
function _prAbrirLinha(id) {
    const d = _prDados;
    const l = id ? d.linhas.find(x => x.id === id) : { valores: {} };
    if (!l) return;
    _prFecharLinha();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "pr-modal";
    const campo = (rot, nome, val, extra = "") => `<label class="cft-rotulo" style="display:block;margin-top:8px">${rot}
        <input class="cft-input" data-campo="${nome}" value="${_prEsc(val ?? "")}" ${extra} style="margin-top:4px"></label>`;
    const v = l.valores || {};
    ov.innerHTML = `
        <div class="cft-modal" style="max-width:640px;width:96vw">
            <div class="cft-modal-titulo">${id ? "Editar" : "Adicionar"} cidade</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
                ${campo("Cidade", "cidade", l.cidade)}
                ${campo("Polo", "polo", l.polo)}
                ${campo("CEP inicial", "cep_ini", _prCep(l.cep_ini), 'placeholder="só se a cidade tem faixa"')}
                ${campo("CEP final", "cep_fim", _prCep(l.cep_fim))}
                ${campo("Região", "regiao", l.regiao)}
                <label class="cft-rotulo" style="display:block;margin-top:8px">Direto/Parceiro
                    <select class="cft-input" data-campo="parceiro" style="margin-top:4px">
                        <option value="false"${l.parceiro ? "" : " selected"}>Direto</option><option value="true"${l.parceiro ? " selected" : ""}>Parceiro</option></select></label>
                ${campo("SLA motorista (dias)", "sla", l.sla)}
                ${campo("SLA transportadora (dias)", "sla_transportadora", l.sla_transportadora)}
                ${d.tipos.map(tp => campo(`${d.tipos.length > 1 ? tp + " — " : ""}Valor entrega (R$)`, `valor:${tp}`, v[tp] && v[tp].valor !== null ? _prMoeda(v[tp].valor) : "")
                    + campo(`${d.tipos.length > 1 ? tp + " — " : ""}Incentivo (R$)`, `incentivo:${tp}`, v[tp] ? _prMoeda(v[tp].incentivo) : "")).join("")}
            </div>
            ${campo("Motoristas (anotação)", "motoristas", l.motoristas)}
            <div class="cft-erro" id="pr-modal-erro" style="min-height:18px;margin-top:8px"></div>
            <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
                <button class="cft-btn" onclick="_prFecharLinha()">Cancelar</button>
                <button class="cft-btn primario" id="pr-modal-salvar" onclick="_prSalvarLinha(${id || "null"})">Salvar</button>
            </div>
        </div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _prFecharLinha(); });
    document.body.appendChild(ov);
}

function _prFecharLinha() {
    const ov = document.getElementById("pr-modal");
    if (ov) ov.remove();
}

/** Campos do modal → corpo do POST/PUT. */
function _prCorpoLinha(campos, tipos) {
    const c = { valores: {} };
    for (const [nome, val] of Object.entries(campos)) {
        const [k, tipo] = nome.split(":");
        if (tipo) { c.valores[tipo] = c.valores[tipo] || {}; c.valores[tipo][k] = val; }
        else c[k] = val;
    }
    for (const tp of tipos) c.valores[tp] = c.valores[tp] || {};
    c.parceiro = c.parceiro === "true";
    return c;
}

async function _prSalvarLinha(id) {
    const campos = {};
    document.querySelectorAll("#pr-modal [data-campo]").forEach(i => { campos[i.dataset.campo] = i.value; });
    const corpo = _prCorpoLinha(campos, _prDados.tipos);
    corpo.transportadora = _prTransp;
    const btn = document.getElementById("pr-modal-salvar");
    btn.disabled = true;
    try {
        const r = await fetch(id ? `${_PR_API()}/linha/${id}` : `${_PR_API()}/linha`, {
            method: id ? "PUT" : "POST", headers: _prHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json();
        btn.disabled = false;
        if (!r.ok) { document.getElementById("pr-modal-erro").innerText = d.error || "Não foi possível salvar."; return; }
        _prFecharLinha();
        _prCarregar();
    } catch (_) {
        btn.disabled = false;
        document.getElementById("pr-modal-erro").innerText = "Erro ao conectar com o servidor.";
    }
}

function _prRemover(id) {
    const l = _prDados.linhas.find(x => x.id === id);
    if (!l) return;
    gcConfirm(`Remover ${l.cidade}${l.cep_ini ? ` (CEP ${_prCep(l.cep_ini)} a ${_prCep(l.cep_fim)})` : ""} da tabela? Pacote dessa cidade fica sem preço até ter outra linha.`, async () => {
        try {
            const r = await fetch(`${_PR_API()}/linha/${id}`, { method: "DELETE", headers: _prHeaders() });
            const d = await r.json();
            if (!r.ok) return gcAlert(d.error || "Não foi possível remover.");
            _prCarregar();
        } catch (_) { gcAlert("Erro ao conectar com o servidor."); }
    }, null, "Remover");
}

// ── Histórico ──
function _prCarregarHistorico() {
    const el = document.getElementById("pr-aba");
    el.innerHTML = skLogo(true);
    fetch(`${_PR_API()}/log?transportadora=${encodeURIComponent(_prTransp)}`, { headers: _prHeaders() })
        .then(r => r.json())
        .then(d => { el.innerHTML = d.error ? `<div class="cft-erro">${_prEsc(d.error)}</div>` : _prHtmlHistorico(d.linhas || []); })
        .catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

function _prValorLog(v) {
    if (v === null || v === undefined || v === "") return "vazio";
    if (typeof v === "boolean") return v ? "Parceiro" : "Direto";
    return typeof v === "number" ? v.toLocaleString("pt-BR") : String(v);
}

function _prHtmlHistorico(linhas) {
    if (!linhas.length) return `<div class="cft-ajuda">Nenhuma mudança ainda.</div>`;
    const acao = { importou: "Importou da planilha", criou: "Adicionou", alterou: "Alterou", removeu: "Removeu" };
    return `<div class="cft-tabela-wrap"><table class="cft-tabela"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Cidade</th><th>Mudança</th></tr></thead><tbody>
        ${linhas.map(x => `<tr>
            <td>${_prQuando(x.em)}</td><td>${_prEsc(x.quem || "")}</td><td>${acao[x.acao] || _prEsc(x.acao)}</td><td>${_prEsc(x.cidade || "")}</td>
            <td style="white-space:normal">${x.acao === "alterou"
                ? x.mudancas.map(m => `${_prEsc(m.campo)}: ${_prEsc(_prValorLog(m.antes))} → ${_prEsc(_prValorLog(m.depois))}`).join("<br>")
                : x.acao === "importou" && x.depois ? `${x.depois.linhas} linhas${x.depois.substituiu ? ` (substituiu ${x.depois.substituiu})` : ""}` : ""}</td>
        </tr>`).join("")}</tbody></table></div>`;
}
