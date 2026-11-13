// ───── FECHAMENTO › PRECIFICAÇÃO ─────
// A planilha de precificação no sistema, por transportadora. Cada cidade tem uma ou mais
// linhas: "All Drivers" (vale pra todo entregador) e/ou entregadores com valor próprio — o
// fechamento usa a do entregador; sem ela, a All Drivers. Cada tabela "vale a partir de" uma
// quinzena (versões); a quinzena usa a mais recente que já começou. Sem nenhuma tabela, o
// fechamento lê a planilha V1 do Google (aqui só leitura). Mudou preço → Recalcular.
// Ver: gestor. Editar/importar: só dev. Backend: /admin/precificacao (modules/precificacao).
const _PR_API = () => `${API}/admin/precificacao`;
const _PR_TODOS = "All Drivers";
const _PR_DESDE_SEMPRE = "2000-01-01";
const _PR_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let _prTransp = null;      // chave da transportadora aberta
let _prLista = [];         // [{chave, nome, aba, tambem_usam, versoes:[{id, vale_de, origem, linhas}]}]
let _prPlanilhas = [];     // [{chave, nome, vale_de}] — planilhas que dá pra importar
let _prQuinzenaAtual = null;
let _prVersao = null;      // id da versão aberta (null = a que vale hoje)
let _prDados = null;       // GET /admin/precificacao da transportadora
let _prAba = "tabela";     // "tabela" | "historico"
let _prEntregadores = null; // nomes padrão (pra escolher na linha)
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
function _prQuando(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const _prNorm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "2026-10-16" → "Q2 Out/2026"; "2000-01-01" → "Desde o início". */
function _prQuinzenaRotulo(valeDe) {
    if (!valeDe || valeDe === _PR_DESDE_SEMPRE) return "Desde o início";
    const [a, m, d] = String(valeDe).split("-");
    return `Q${d === "16" ? 2 : 1} ${_PR_MESES[+m - 1]}/${a}`;
}

/** Quinzenas pra escolher (de jan/2025 até 6 meses depois da atual), mais recente primeiro. */
function _prQuinzenas(atual) {
    const [aa, ma] = String(atual || "2026-01-01").split("-").map(Number);
    const out = [];
    for (let a = 2025, m = 1; a * 12 + m <= aa * 12 + ma + 6; m === 12 ? (a++, m = 1) : m++) {
        const mm = String(m).padStart(2, "0");
        out.push(`${a}-${mm}-01`, `${a}-${mm}-16`);
    }
    return out.reverse();
}

/** Versão que vale na quinzena que começa em `inicio` (a de vale_de mais recente até lá). */
function _prVersaoQueVale(versoes, inicio) {
    const ok = (versoes || []).filter(v => v.vale_de <= inicio).sort((a, b) => b.vale_de.localeCompare(a.vale_de));
    return ok[0] || null;
}

/**
 * Linhas → grupos por cidade, na ordem da tabela: [{cidade, linhas}] com "All Drivers"
 * primeiro e os entregadores em ordem alfabética.
 */
function _prAgruparCidades(linhas) {
    const grupos = new Map();
    for (const l of linhas) {
        const k = _prNorm(l.cidade);
        if (!grupos.has(k)) grupos.set(k, { cidade: l.cidade, linhas: [] });
        grupos.get(k).linhas.push(l);
    }
    for (const g of grupos.values()) {
        g.linhas.sort((a, b) => (a.entregador ? 1 : 0) - (b.entregador ? 1 : 0) || String(a.entregador || "").localeCompare(String(b.entregador || ""), "pt-BR"));
    }
    return [...grupos.values()];
}

function abrirPrecificacao(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-precificacao");
    document.getElementById("pr-conteudo").innerHTML = `
        <div class="cft-secao" style="margin-top:0">Precificação</div>
        <div class="cft-ajuda" style="margin-bottom:14px">Preço e prazo de cada cidade por transportadora. Cada cidade pode ter a linha
            <b>${_PR_TODOS}</b> (vale pra todos) e entregadores com valor próprio — o fechamento usa a linha do entregador; sem ela, a ${_PR_TODOS}.
            Cada tabela vale a partir de uma quinzena. Mudou um valor: clique em Recalcular no Criar Fechamento pra valer.</div>
        <div class="cft-barra" style="margin:0 0 10px;gap:8px;flex-wrap:wrap" id="pr-transps"></div>
        <div id="pr-corpo">${skLogo(true)}</div>`;
    fetch(`${_PR_API()}/transportadoras`, { headers: _prHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.error) { document.getElementById("pr-corpo").innerHTML = `<div class="cft-erro">${_prEsc(d.error)}</div>`; return; }
            _prLista = d.transportadoras || [];
            _prPlanilhas = d.planilhas || [];
            _prQuinzenaAtual = d.quinzena_atual;
            if (!_prTransp || !_prLista.some(t => t.chave === _prTransp)) _prTransp = _prLista.length ? _prLista[0].chave : null;
            const t = _prLista.find(x => x.chave === _prTransp);
            if (_prVersao && !(t && t.versoes.some(v => v.id === _prVersao))) _prVersao = null;
            _prCarregar();
        })
        .catch(() => { document.getElementById("pr-corpo").innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

function _prDesenharTransps() {
    document.getElementById("pr-transps").innerHTML = _prLista.map(t =>
        `<button type="button" class="filtro-tab${t.chave === _prTransp ? " active" : ""}" onclick="_prTrocar('${t.chave}')">${_prEsc(t.nome)}${t.versoes.length ? "" : ` <span style="color:#eab308;font-size:11px">planilha</span>`}</button>`).join("");
}

function _prTrocar(chave) { _prTransp = chave; _prVersao = null; _prAba = "tabela"; _prCarregar(); }
function _prTrocarVersao(id) { _prVersao = id ? Number(id) : null; _prCarregar(); }

function _prCarregar() {
    _prDesenharTransps();
    const corpo = document.getElementById("pr-corpo");
    if (!_prTransp) { corpo.innerHTML = `<div class="cft-ajuda">Nenhuma transportadora com preço.</div>`; return; }
    corpo.innerHTML = skLogo(true);
    const id = ++_prReq;
    const q = `transportadora=${encodeURIComponent(_prTransp)}${_prVersao ? `&versao=${_prVersao}` : ""}`;
    fetch(`${_PR_API()}?${q}`, { headers: _prHeaders() })
        .then(r => r.json())
        .then(d => {
            if (id !== _prReq) return;
            if (d.error) { corpo.innerHTML = `<div class="cft-erro">${_prEsc(d.error)}</div>`; return; }
            _prDados = d;
            if (d.versao) _prVersao = d.versao.id;
            _prDesenhar();
        })
        .catch(() => { if (id === _prReq) corpo.innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

function _prTrocarAba(aba) { _prAba = aba; _prDesenhar(); }

function _prDesenhar() {
    const d = _prDados, t = _prLista.find(x => x.chave === _prTransp) || { versoes: [] };
    const corpo = document.getElementById("pr-corpo");
    const sistema = d.fonte === "sistema";
    const vigente = _prVersaoQueVale(t.versoes, _prQuinzenaAtual);
    let status;
    if (sistema) {
        const opcoes = t.versoes.slice().reverse().map(v => `<option value="${v.id}"${v.id === d.versao.id ? " selected" : ""}>
            ${_prEsc(_prQuinzenaRotulo(v.vale_de))}${v.vale_de === _PR_DESDE_SEMPRE ? "" : " em diante"}${vigente && vigente.id === v.id ? " (vale hoje)" : ""}</option>`).join("");
        status = `<label class="cft-rotulo" style="display:flex;gap:8px;align-items:center;margin:0">Tabela
                <select class="cft-input" style="margin:0;width:auto" onchange="_prTrocarVersao(this.value)">${opcoes}</select></label>
            <span class="cft-ajuda">${_prEsc(d.versao.origem || "")}${d.versao.criado_por ? ` — ${_prEsc(d.versao.criado_por)}` : ""}${d.versao.criado_em ? `, ${_prQuando(d.versao.criado_em)}` : ""}</span>
            ${_prDev() ? `<button class="cft-link" onclick="_prAbrirImportar()">Importar planilha</button>
                <button class="cft-link" onclick="_prAbrirNovaVersao()">Nova tabela a partir de uma quinzena</button>
                <button class="cft-link cft-neg" onclick="_prRemoverVersao()">Remover esta tabela</button>` : ""}`;
    } else {
        status = `<span style="color:#eab308">Sem tabela no sistema — o fechamento ainda lê a planilha V1 (aba "${_prEsc(t.aba)}"). O que aparece abaixo é ela, só leitura.</span>
            ${_prDev() ? `<button class="cft-btn primario" onclick="_prAbrirImportar()">Importar planilha</button>` : `<span class="cft-ajuda">Só dev importa.</span>`}`;
    }
    const cobre = sistema && t.versoes.length && !t.versoes.some(v => v.vale_de === _PR_DESDE_SEMPRE)
        ? `<div class="cft-ajuda" style="margin:0 0 10px">Antes de ${_prEsc(_prQuinzenaRotulo(t.versoes[0].vale_de))} o fechamento continua usando a planilha V1.</div>` : "";
    const usam = (t.tambem_usam || []).length
        ? `<div class="cft-ajuda" style="margin:0 0 10px">A ${_prEsc(t.tambem_usam.join(" e a "))} também usa esta tabela (não tem tabela própria).</div>` : "";
    corpo.innerHTML = `
        <div class="cft-barra" style="margin:0 0 10px;gap:12px;flex-wrap:wrap;align-items:center">${status}</div>
        ${cobre}${usam}
        ${d.erro ? `<div class="cft-erro" style="margin-bottom:10px">${_prEsc(d.erro)}</div>` : ""}
        <div class="cft-barra" style="margin:0 0 10px;gap:8px">
            <button type="button" class="filtro-tab${_prAba === "tabela" ? " active" : ""}" onclick="_prTrocarAba('tabela')">Tabela</button>
            ${sistema ? `<button type="button" class="filtro-tab${_prAba === "historico" ? " active" : ""}" onclick="_prTrocarAba('historico')">Histórico</button>` : ""}
        </div>
        <div id="pr-aba"></div>`;
    if (_prAba === "historico" && sistema) _prCarregarHistorico();
    else _prDesenharTabela();
}

/** Linhas que batem com a busca (cidade, entregador, polo, região, anotação). */
function _prFiltrar(linhas, q) {
    const b = _prNorm(q);
    if (!b) return linhas;
    return linhas.filter(l => [l.cidade, l.entregador, l.polo, l.regiao, l.motoristas].some(x => _prNorm(x).includes(b)));
}

function _prDesenharTabela() {
    const d = _prDados;
    const el = document.getElementById("pr-aba");
    const editar = d.fonte === "sistema" && _prDev();
    const busca = (document.getElementById("pr-busca") || {}).value || "";
    el.innerHTML = `
        <div class="cft-barra" style="margin:0 0 10px;gap:10px;flex-wrap:wrap;align-items:center">
            <input id="pr-busca" class="cft-input" style="max-width:280px;margin:0" placeholder="Buscar cidade, entregador, polo..." value="${_prEsc(busca)}" oninput="_prDesenharLinhas()">
            <span class="cft-ajuda" id="pr-contagem"></span>
            ${editar ? `<button class="cft-btn primario" onclick="_prAbrirLinha(null)">Adicionar cidade</button>` : ""}
        </div>
        <div class="cft-tabela-wrap" style="max-height:65vh;overflow:auto"><table class="cft-tabela"><thead><tr>
            <th>Cidade</th><th>Entregador</th><th>Polo</th><th class="num">SLA</th><th>Direto/Parceiro</th>
            ${d.tipos.map(tp => `<th class="num">${d.tipos.length > 1 ? _prEsc(tp) + " " : ""}Valor</th><th class="num">${d.tipos.length > 1 ? _prEsc(tp) + " " : ""}Incentivo</th>`).join("")}
            ${editar ? "<th></th>" : ""}
        </tr></thead><tbody id="pr-linhas"></tbody></table></div>`;
    _prDesenharLinhas();
}

function _prDesenharLinhas() {
    const d = _prDados;
    const editar = d.fonte === "sistema" && _prDev();
    const linhas = _prFiltrar(d.linhas, (document.getElementById("pr-busca") || {}).value);
    const grupos = _prAgruparCidades(linhas);
    const nCidades = _prAgruparCidades(d.linhas).length;
    document.getElementById("pr-contagem").innerText = `${grupos.length} de ${nCidades} cidade${nCidades !== 1 ? "s" : ""}`;
    const colunas = 5 + d.tipos.length * 2 + (editar ? 1 : 0);
    const linhaHtml = (l, primeira, cidade) => {
        const v = l.valores || {};
        const nome = l.entregador ? _prEsc(l.entregador) : `<span class="cft-ajuda" title="${_prEsc(l.motoristas || "")}">${_PR_TODOS}</span>`;
        return `<tr>
            <td>${primeira ? `<b>${_prEsc(cidade)}</b>` : ""}</td>
            <td>${nome}</td>
            <td>${_prEsc(l.polo || "")}</td><td class="num">${l.sla ?? ""}</td><td>${l.parceiro ? "Parceiro" : "Direto"}</td>
            ${d.tipos.map(tp => `<td class="num">${_prMoeda(v[tp] ? v[tp].valor : null)}</td><td class="num">${_prMoeda(v[tp] ? v[tp].incentivo : null)}</td>`).join("")}
            ${editar ? `<td style="white-space:nowrap"><button class="cft-link" onclick="_prAbrirLinha(${l.id})">Editar</button>
                <button class="cft-link cft-neg" style="margin-left:8px" onclick="_prRemover(${l.id})">Remover</button></td>` : ""}
        </tr>`;
    };
    document.getElementById("pr-linhas").innerHTML = grupos.map(g =>
        g.linhas.map((l, i) => linhaHtml(l, i === 0, g.cidade)).join("")
        + (editar ? `<tr><td></td><td colspan="${colunas - 1}"><button class="cft-link" onclick="_prAbrirLinha(null, ${_prEsc(JSON.stringify(g.linhas[0].id))})">+ Entregador</button></td></tr>` : "")
    ).join("") || `<tr><td colspan="99" class="cft-ajuda">Nenhuma linha.</td></tr>`;
}

// ── Importar planilha (V1/V2/outra) como a tabela que vale a partir de uma quinzena ──
function _prAbrirImportar() {
    const t = _prLista.find(x => x.chave === _prTransp) || {};
    _prFecharModal();
    const p0 = _prPlanilhas[0] || { chave: "", vale_de: _PR_DESDE_SEMPRE };
    const quinz = [_PR_DESDE_SEMPRE, ..._prQuinzenas(_prQuinzenaAtual)];
    const ov = _prModal(`
        <div class="cft-modal-titulo">Importar planilha — ${_prEsc(t.nome)}</div>
        <label class="cft-rotulo" style="display:block;margin-top:8px">Planilha
            <select class="cft-input" id="pr-imp-planilha" style="margin-top:4px" onchange="_prImpTrocouPlanilha()">
                ${_prPlanilhas.map(p => `<option value="${_prEsc(p.chave)}" data-vale="${_prEsc(p.vale_de)}">${_prEsc(p.nome)}</option>`).join("")}
                <option value="outra">Outra (colar o link)</option></select></label>
        <label class="cft-rotulo" id="pr-imp-link-wrap" style="display:none;margin-top:8px">Link da planilha
            <input class="cft-input" id="pr-imp-link" style="margin-top:4px" placeholder="https://docs.google.com/spreadsheets/d/..." onchange="_prImpCarregarAbas()"></label>
        <label class="cft-rotulo" style="display:block;margin-top:8px">Aba
            <select class="cft-input" id="pr-imp-aba" style="margin-top:4px"><option>${_prEsc(t.aba)}</option></select></label>
        <label class="cft-rotulo" style="display:block;margin-top:8px">Vale a partir de
            <select class="cft-input" id="pr-imp-vale" style="margin-top:4px">
                ${quinz.map(q => `<option value="${q}"${q === p0.vale_de ? " selected" : ""}>${_prEsc(_prQuinzenaRotulo(q))}</option>`).join("")}</select></label>
        <div class="cft-ajuda" style="margin-top:8px">Se já existe uma tabela que começa nessa quinzena, ela é substituída (o que foi editado nela fica só no histórico).
            A conta do servidor precisa ter acesso de Leitor na planilha.</div>
        <div class="cft-erro" id="pr-modal-erro" style="min-height:18px;margin-top:8px"></div>
        <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
            <button class="cft-btn" onclick="_prFecharModal()">Cancelar</button>
            <button class="cft-btn primario" id="pr-modal-salvar" onclick="_prImportar()">Importar</button>
        </div>`);
    _prImpCarregarAbas();
    return ov;
}

function _prImpTrocouPlanilha() {
    const sel = document.getElementById("pr-imp-planilha");
    const outra = sel.value === "outra";
    document.getElementById("pr-imp-link-wrap").style.display = outra ? "block" : "none";
    const vale = sel.selectedOptions[0] && sel.selectedOptions[0].dataset.vale;
    if (vale) document.getElementById("pr-imp-vale").value = vale;
    if (!outra) _prImpCarregarAbas();
}

function _prImpOrigem() {
    const p = document.getElementById("pr-imp-planilha").value;
    return p === "outra" ? { planilha_link: document.getElementById("pr-imp-link").value.trim() } : { planilha: p };
}

/** Abas da planilha escolhida, com a aba da transportadora já selecionada se existir. */
function _prImpCarregarAbas() {
    const t = _prLista.find(x => x.chave === _prTransp) || {};
    const o = _prImpOrigem();
    if (!o.planilha && !o.planilha_link) return;
    const sel = document.getElementById("pr-imp-aba");
    const erro = document.getElementById("pr-modal-erro");
    const qs = o.planilha ? `planilha=${encodeURIComponent(o.planilha)}` : `planilha_link=${encodeURIComponent(o.planilha_link)}`;
    fetch(`${_PR_API()}/abas?${qs}`, { headers: _prHeaders() })
        .then(r => r.json())
        .then(d => {
            if (!document.getElementById("pr-imp-aba")) return;
            if (d.error) { erro.innerText = d.error; return; }
            erro.innerText = "";
            const abas = d.abas || [];
            const padrao = abas.find(a => _prNorm(a) === _prNorm(t.aba)) || abas[0];
            sel.innerHTML = abas.map(a => `<option${a === padrao ? " selected" : ""}>${_prEsc(a)}</option>`).join("");
        })
        .catch(() => { erro.innerText = "Erro ao conectar com o servidor."; });
}

async function _prImportar() {
    const corpo = { transportadora: _prTransp, ..._prImpOrigem(), aba: document.getElementById("pr-imp-aba").value, vale_de: document.getElementById("pr-imp-vale").value };
    const btn = document.getElementById("pr-modal-salvar");
    btn.disabled = true;
    try {
        const r = await fetch(`${_PR_API()}/importar`, { method: "POST", headers: _prHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json();
        btn.disabled = false;
        if (!r.ok) { document.getElementById("pr-modal-erro").innerText = d.error || "Não foi possível importar."; return; }
        _prFecharModal();
        _prVersao = d.versao_id;
        const nao = (d.nao_reconhecidos || []);
        gcAlert(`${d.linhas} linha${d.linhas !== 1 ? "s" : ""} importada${d.linhas !== 1 ? "s" : ""} (vale a partir de ${_prQuinzenaRotulo(corpo.vale_de)}). `
            + `${(d.reconhecidos || []).length} entregador${(d.reconhecidos || []).length !== 1 ? "es" : ""} reconhecido${(d.reconhecidos || []).length !== 1 ? "s" : ""}.`
            + (nao.length ? ` Não reconhecidos (viraram ${_PR_TODOS}; confira): ${nao.join(", ")}.` : "")
            + " Recalcule as quinzenas no Criar Fechamento.");
        abrirPrecificacao();
    } catch (_) {
        btn.disabled = false;
        document.getElementById("pr-modal-erro").innerText = "Erro ao conectar com o servidor.";
    }
}

// ── Nova tabela (cópia da aberta) a partir de uma quinzena ──
function _prAbrirNovaVersao() {
    const d = _prDados;
    _prFecharModal();
    const t = _prLista.find(x => x.chave === _prTransp) || { versoes: [] };
    const usadas = new Set(t.versoes.map(v => v.vale_de));
    const quinz = _prQuinzenas(_prQuinzenaAtual).filter(q => !usadas.has(q));
    _prModal(`
        <div class="cft-modal-titulo">Nova tabela — ${_prEsc(t.nome)}</div>
        <div class="cft-ajuda">Começa como cópia da tabela aberta (${_prEsc(_prQuinzenaRotulo(d.versao.vale_de))}); depois é só mudar o que precisar.
            As quinzenas antes dela continuam com a tabela antiga.</div>
        <label class="cft-rotulo" style="display:block;margin-top:8px">Vale a partir de
            <select class="cft-input" id="pr-nova-vale" style="margin-top:4px">
                ${quinz.map(q => `<option value="${q}"${q === _prQuinzenaAtual ? " selected" : ""}>${_prEsc(_prQuinzenaRotulo(q))}</option>`).join("")}</select></label>
        <div class="cft-erro" id="pr-modal-erro" style="min-height:18px;margin-top:8px"></div>
        <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
            <button class="cft-btn" onclick="_prFecharModal()">Cancelar</button>
            <button class="cft-btn primario" id="pr-modal-salvar" onclick="_prCriarVersao()">Criar</button>
        </div>`);
}

async function _prCriarVersao() {
    const corpo = { transportadora: _prTransp, vale_de: document.getElementById("pr-nova-vale").value, copiar_de: _prDados.versao.id };
    const btn = document.getElementById("pr-modal-salvar");
    btn.disabled = true;
    try {
        const r = await fetch(`${_PR_API()}/versao`, { method: "POST", headers: _prHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json();
        btn.disabled = false;
        if (!r.ok) { document.getElementById("pr-modal-erro").innerText = d.error || "Não foi possível criar."; return; }
        _prFecharModal();
        _prVersao = d.id;
        abrirPrecificacao();
    } catch (_) {
        btn.disabled = false;
        document.getElementById("pr-modal-erro").innerText = "Erro ao conectar com o servidor.";
    }
}

function _prRemoverVersao() {
    const v = _prDados.versao;
    gcConfirm(`Remover a tabela que vale a partir de ${_prQuinzenaRotulo(v.vale_de)}? As quinzenas dela passam a usar a tabela anterior (ou a planilha V1, se não houver).`, async () => {
        try {
            const r = await fetch(`${_PR_API()}/versao/${v.id}`, { method: "DELETE", headers: _prHeaders() });
            const d = await r.json();
            if (!r.ok) return gcAlert(d.error || "Não foi possível remover.");
            _prVersao = null;
            abrirPrecificacao();
        } catch (_) { gcAlert("Erro ao conectar com o servidor."); }
    }, null, "Remover");
}

// ── Adicionar / editar uma linha (cidade + entregador) ──
function _prModal(html) {
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "pr-modal";
    ov.innerHTML = `<div class="cft-modal" style="max-width:640px;width:96vw">${html}</div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _prFecharModal(); });
    document.body.appendChild(ov);
    return ov;
}

function _prFecharModal() {
    const ov = document.getElementById("pr-modal");
    if (ov) ov.remove();
}

function _prCarregarEntregadores() {
    if (_prEntregadores) return Promise.resolve(_prEntregadores);
    return fetch(`${_PR_API()}/entregadores`, { headers: _prHeaders() })
        .then(r => r.json())
        .then(d => (_prEntregadores = d.entregadores || []))
        .catch(() => []);
}

/**
 * @param {?number} id linha a editar (null = nova)
 * @param {?number} daCidade id de uma linha da cidade: "+ Entregador" (cidade, polo, prazo
 *   e Direto/Parceiro vêm dela; valores em branco)
 */
async function _prAbrirLinha(id, daCidade) {
    const d = _prDados;
    const ref = daCidade ? d.linhas.find(x => x.id === daCidade) : null;
    const l = id ? d.linhas.find(x => x.id === id)
        : ref ? { cidade: ref.cidade, polo: ref.polo, sla: ref.sla, parceiro: ref.parceiro, sla_transportadora: ref.sla_transportadora, valores: {}, entregador: "" }
        : { valores: {}, entregador: null };
    if (!l) return;
    _prFecharModal();
    const nomes = await _prCarregarEntregadores();
    const campo = (rot, nome, val, extra = "") => `<label class="cft-rotulo" style="display:block;margin-top:8px">${rot}
        <input class="cft-input" data-campo="${nome}" value="${_prEsc(val ?? "")}" ${extra} style="margin-top:4px"></label>`;
    const v = l.valores || {};
    const titulo = id ? `Editar — ${_prEsc(l.cidade)}` : ref ? `Adicionar entregador — ${_prEsc(ref.cidade)}` : "Adicionar cidade";
    _prModal(`
        <div class="cft-modal-titulo">${titulo}</div>
        <datalist id="pr-entregadores"><option value="${_PR_TODOS}">${nomes.map(n => `<option value="${_prEsc(n)}">`).join("")}</datalist>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
            ${campo("Cidade", "cidade", l.cidade, ref ? "readonly" : "")}
            ${campo("Entregador", "entregador", l.entregador === null ? _PR_TODOS : l.entregador, `list="pr-entregadores" placeholder="${_PR_TODOS} ou escolha o entregador"`)}
            ${campo("Polo", "polo", l.polo)}
            <label class="cft-rotulo" style="display:block;margin-top:8px">Direto/Parceiro
                <select class="cft-input" data-campo="parceiro" style="margin-top:4px">
                    <option value="false"${l.parceiro ? "" : " selected"}>Direto</option><option value="true"${l.parceiro ? " selected" : ""}>Parceiro</option></select></label>
            ${campo("SLA motorista (dias)", "sla", l.sla)}
            <div></div>
            ${d.tipos.map(tp => campo(`${d.tipos.length > 1 ? tp + " — " : ""}Valor entrega (R$)`, `valor:${tp}`, v[tp] && v[tp].valor !== null ? _prMoeda(v[tp].valor) : "")
                + campo(`${d.tipos.length > 1 ? tp + " — " : ""}Incentivo (R$)`, `incentivo:${tp}`, v[tp] ? _prMoeda(v[tp].incentivo) : "")).join("")}
        </div>
        ${campo("Anotação", "motoristas", l.motoristas)}
        <div class="cft-erro" id="pr-modal-erro" style="min-height:18px;margin-top:8px"></div>
        <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
            <button class="cft-btn" onclick="_prFecharModal()">Cancelar</button>
            <button class="cft-btn primario" id="pr-modal-salvar" onclick="_prSalvarLinha(${id || "null"})">Salvar</button>
        </div>`);
    // O que a tela não mostra (CEP, região, SLA da transportadora) volta igual no salvar.
    document.getElementById("pr-modal").dataset.escondidos = JSON.stringify({
        cep_ini: l.cep_ini ?? null, cep_fim: l.cep_fim ?? null, regiao: l.regiao ?? null, sla_transportadora: l.sla_transportadora ?? null,
    });
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

/** Entregador digitado tem que ser "All Drivers" ou um nome da lista. → {nome} | {erro} */
function _prConferirEntregador(texto, nomes) {
    const s = String(texto || "").trim();
    if (!s || _prNorm(s) === _prNorm(_PR_TODOS)) return { nome: null };
    const achou = (nomes || []).find(n => _prNorm(n) === _prNorm(s));
    return achou ? { nome: achou } : { erro: `Escolha o entregador da lista (ou ${_PR_TODOS}).` };
}

async function _prSalvarLinha(id) {
    const campos = {};
    document.querySelectorAll("#pr-modal [data-campo]").forEach(i => { campos[i.dataset.campo] = i.value; });
    const corpo = { ...JSON.parse(document.getElementById("pr-modal").dataset.escondidos || "{}"), ..._prCorpoLinha(campos, _prDados.tipos) };
    const ent = _prConferirEntregador(corpo.entregador, _prEntregadores);
    if (ent.erro) { document.getElementById("pr-modal-erro").innerText = ent.erro; return; }
    corpo.entregador = ent.nome;
    corpo.versao_id = _prDados.versao.id;
    const btn = document.getElementById("pr-modal-salvar");
    btn.disabled = true;
    try {
        const r = await fetch(id ? `${_PR_API()}/linha/${id}` : `${_PR_API()}/linha`, {
            method: id ? "PUT" : "POST", headers: _prHeaders(true), body: JSON.stringify(corpo) });
        const d = await r.json();
        btn.disabled = false;
        if (!r.ok) { document.getElementById("pr-modal-erro").innerText = d.error || "Não foi possível salvar."; return; }
        _prFecharModal();
        _prCarregar();
    } catch (_) {
        btn.disabled = false;
        document.getElementById("pr-modal-erro").innerText = "Erro ao conectar com o servidor.";
    }
}

function _prRemover(id) {
    const l = _prDados.linhas.find(x => x.id === id);
    if (!l) return;
    const quem = l.entregador ? `${l.entregador} de ${l.cidade}` : `${l.cidade} (${_PR_TODOS})`;
    const efeito = l.entregador ? `Os pacotes dele em ${l.cidade} passam a usar a linha ${_PR_TODOS} (se houver).` : `Quem não tem linha própria em ${l.cidade} fica sem preço.`;
    gcConfirm(`Remover ${quem}? ${efeito}`, async () => {
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
    const acao = { importou: "Importou planilha", criou: "Adicionou", alterou: "Alterou", removeu: "Removeu", "criou versão": "Nova tabela", "removeu versão": "Removeu tabela" };
    const detalhe = (x) => {
        if (x.acao === "alterou") return x.mudancas.map(m => `${_prEsc(m.campo)}: ${_prEsc(_prValorLog(m.antes))} → ${_prEsc(_prValorLog(m.depois))}`).join("<br>");
        const dd = x.depois || {}, aa = x.antes || {};
        if (x.acao === "importou") return `${dd.linhas} linhas${dd.substituiu ? ` (substituiu ${dd.substituiu})` : ""}${dd.origem ? ` — ${_prEsc(dd.origem)}` : ""}`;
        if (x.acao === "criou versão") return `cópia de ${_prEsc(_prQuinzenaRotulo(dd.copia_de))}`;
        if (x.acao === "removeu versão") return `${aa.linhas} linhas`;
        const l = x.acao === "criou" ? dd : aa;
        return _prEsc(l.entregador || _PR_TODOS);
    };
    return `<div class="cft-tabela-wrap"><table class="cft-tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Tabela</th><th>O quê</th><th>Cidade</th><th>Detalhe</th></tr></thead><tbody>
        ${linhas.map(x => `<tr>
            <td>${_prQuando(x.em)}</td><td>${_prEsc(x.quem || "")}</td>
            <td>${x.vale_de ? _prEsc(_prQuinzenaRotulo(x.vale_de)) : (x.depois && x.depois.vale_de ? _prEsc(_prQuinzenaRotulo(x.depois.vale_de)) : "")}</td>
            <td>${acao[x.acao] || _prEsc(x.acao)}</td><td>${_prEsc(x.cidade || "")}</td>
            <td style="white-space:normal">${detalhe(x)}</td>
        </tr>`).join("")}</tbody></table></div>`;
}
