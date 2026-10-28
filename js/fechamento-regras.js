// ───── FECHAMENTO › REGRAS E CONFIGURAÇÕES ─────
// Tudo que mexe no valor da quinzena num lugar só: PNR abertas (limite por usuário e regra
// do valor fixo), exceções por entregador, polos da performance, valores fixos, sábado/
// domingo, Ticketlog, deslocamento e fonte dos extravios — e o histórico de cada mudança.
// Valores fixos e sábado/domingo usam os editores de fechamento-criar.js (#cf-fixos e
// #cf-regras moram nesta tela). Backend: /regras (modules/fechamento-transportadoras/regras.js).
const _RG_API = () => `${API}/admin/fechamento-transportadoras`;
const _RG_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
let _rgDados = null;
let _rgEntregadores = null;

function _rgEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _rgNum(n, casas = 2) {
    return Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function _rgPct(n) {
    return Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}
function _rgHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _rgPeriodo() {
    const v = (id) => parseInt((document.getElementById(id) || {}).value, 10);
    return { mes: v("rg-mes"), ano: v("rg-ano"), quinzena: v("rg-q") };
}
function _rgDataBr(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function _rgStatus(t) {
    const st = document.getElementById("rg-status");
    if (st) st.innerHTML = t || "";
}

function abrirRegrasFechamento(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-regras-fechamento");
    const d = new Date();
    const h = { mes: d.getMonth() + 1, ano: d.getFullYear(), quinzena: d.getDate() <= 15 ? 1 : 2 };
    document.getElementById("rg-topo").innerHTML = `
        <div class="cft-regras">
            <div class="cft-pend-titulo" style="color:#e2e8f0">Regras e configurações do fechamento</div>
            <div class="cft-ajuda" style="margin-bottom:8px">Tudo que mexe no valor da quinzena fica aqui. Ao salvar uma regra de PNR, uma exceção ou
                os polos, a quinzena escolhida abaixo é recalculada na hora; as outras quinzenas pegam a regra nova quando forem recalculadas.
                Toda mudança fica no histórico, no fim da página.</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <span class="cft-ajuda">Quinzena recalculada:</span>
                <select class="fech-select" id="rg-q">
                    <option value="1"${h.quinzena === 1 ? " selected" : ""}>Q1 (1 – 15)</option><option value="2"${h.quinzena === 2 ? " selected" : ""}>Q2 (16 – fim)</option></select>
                <select class="fech-select" id="rg-mes">${_RG_MESES.map((m, i) =>
                    `<option value="${i + 1}"${i + 1 === h.mes ? " selected" : ""}>${m}</option>`).join("")}</select>
                <select class="fech-select" id="rg-ano">${[h.ano - 1, h.ano].map(a =>
                    `<option value="${a}"${a === h.ano ? " selected" : ""}>${a}</option>`).join("")}</select>
                <button class="cft-btn" onclick="_rgRecalcularTudo(this)" title="Trata de novo todos os relatórios da quinzena (depois de mexer em valores fixos ou sábado/domingo)">Recalcular a quinzena</button>
                <span class="cft-ajuda" id="rg-status"></span>
            </div>
        </div>`;
    _rgCarregar();
    // Editores que já existiam (fechamento-criar.js): abrem já renderizados aqui.
    for (const [id, abrir] of [["cf-fixos", _cfAbrirFixos], ["cf-regras", _cfAbrirRegras]]) {
        const el = document.getElementById(id);
        if (el) { el.style.display = "none"; abrir(); }
    }
}

function _rgCarregar(msg) {
    const el = document.getElementById("rg-conteudo");
    if (!el) return;
    if (!_rgDados) el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_RG_API()}/regras`, { headers: _rgHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_rgEsc(d.error)}</div>`; return; }
        _rgDados = d;
        _rgRender();
        if (msg) _rgStatus(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as regras.</div>`; });
}

function _rgRender() {
    const d = _rgDados || {};
    const pnr = d.pnr || { limite_usuario: 2, regra_fixo: { fator: 0.01, desconto_pct: 40 } };
    document.getElementById("rg-conteudo").innerHTML = `
        ${_rgHtmlPnr(pnr)}
        ${_rgHtmlExcecoes(d)}
        ${_rgHtmlPerformance(d.performance || {})}`;
    document.getElementById("rg-conteudo2").innerHTML = `
        ${_rgHtmlTicketlog(d.ticketlog || {})}
        ${_rgHtmlDeslocamento(d.deslocamento || {})}
        ${_rgHtmlExtravios(d.extravios || {})}`;
    document.getElementById("rg-historico").innerHTML = _rgHtmlHistorico(d.historico || []);
}

// ── PNR abertas ──
function _rgHtmlPnr(p) {
    const f = p.regra_fixo || {};
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">PNR abertas</div>
        <div class="cft-ajuda" style="margin-bottom:8px">Vale só pros polos da performance. A PNR conta no dia anterior ao da abertura (criada dia 21 → pega o dia 20).</div>
        <div class="cft-barra" style="margin:0 0 8px;flex-wrap:wrap;align-items:center">
            <span class="cft-ajuda"><b>Sem valor fixo:</b> um usuário com mais de</span>
            <input class="cft-input" id="rg-pnr-limite" value="${_rgEsc(p.limite_usuario)}" inputmode="numeric" style="width:60px;flex:0 0 auto;margin:0">
            <span class="cft-ajuda">PNR no dia (cada usuário separado) → todos os pacotes do dia na tarifa mínima (seg a sáb R$ 1,50, dom R$ 1,80).</span>
        </div>
        <div class="cft-barra" style="margin:0;flex-wrap:wrap;align-items:center">
            <span class="cft-ajuda"><b>Com valor fixo:</b> somando os usuários, mais PNR que as baixas do dia ×</span>
            <input class="cft-input" id="rg-pnr-fixo-limite" value="${_rgPct(f.fator)}" inputmode="decimal" style="width:80px;flex:0 0 auto;margin:0">
            <span class="cft-ajuda">(ex.: 1.000 baixas × 0,01 = mais de 10 PNR) → valor fixo com</span>
            <input class="cft-input" id="rg-pnr-fixo-desconto" value="${_rgPct(f.desconto_pct)}" inputmode="decimal" style="width:60px;flex:0 0 auto;margin:0">
            <span class="cft-ajuda">% a menos. Dia com PNR e sem nenhuma baixa também cai.</span>
            <button class="cft-btn primario" onclick="_rgSalvarPnr(this)">Salvar</button>
        </div>
    </div>`;
}

async function _rgPost(caminho, metodo, corpo, okMsg, btn) {
    if (btn) btn.disabled = true;
    _rgStatus("Salvando...");
    try {
        const r = await fetch(`${_RG_API()}/${caminho}`, { method: metodo, headers: _rgHeaders(true), body: corpo ? JSON.stringify(corpo) : undefined });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { _rgStatus(`<span class="cft-erro">${_rgEsc(d.error || "Erro ao salvar.")}</span>`); return false; }
        _rgCarregar(okMsg);
        return true;
    } catch (_) {
        _rgStatus(`<span class="cft-erro">Erro ao salvar.</span>`);
        return false;
    } finally { if (btn) btn.disabled = false; }
}

function _rgSalvarPnr(btn) {
    const v = (id) => document.getElementById(id).value.trim();
    _rgPost("regras/pnr", "PUT", { ..._rgPeriodo(), limite_usuario: v("rg-pnr-limite"),
        fator: v("rg-pnr-fixo-limite"), desconto_pct: v("rg-pnr-fixo-desconto") }, "Regras de PNR salvas — quinzena recalculada.", btn);
}

// ── Exceções por entregador ──
function _rgHtmlExcecoes(d) {
    const lista = d.excecoes || [];
    const tipos = d.tipos_excecao || {};
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">Exceções por entregador</div>
        <div class="cft-ajuda" style="margin-bottom:8px">Regra que vale só pra um entregador, por cima das gerais. Início e fim são opcionais
            (sem data = vale sempre). "Limite de PNR próprio": só cai quando passar desse número no dia — sem fixo conta por usuário;
            com fixo soma os usuários, no lugar do % das baixas.</div>
        ${lista.length ? `<div class="cft-tabela-wrap"><table class="cft-tabela"><tbody>${lista.map(e => `<tr>
            <td>${_rgEsc(e.descricao)}</td>
            <td class="cft-ajuda">${_rgEsc(e.observacao || "")}</td>
            <td style="width:1%;white-space:nowrap"><a href="#" class="cft-ajuda" style="text-decoration:underline"
                onclick="event.preventDefault();_rgRemoverExcecao(${Number(e.id)})">remover</a></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="cft-ajuda" style="margin-bottom:8px">Nenhuma exceção.</div>`}
        <datalist id="rg-entregadores">${(_rgEntregadores || []).map(n => `<option value="${_rgEsc(n)}">`).join("")}</datalist>
        <div class="cft-barra" style="margin:8px 0 0;flex-wrap:wrap">
            <input class="cft-input" id="rg-exc-entregador" list="rg-entregadores" placeholder="Entregador..." style="width:300px;flex:0 0 auto;margin:0"
                onfocus="_rgGarantirEntregadores()">
            <select class="fech-select" id="rg-exc-tipo" onchange="_rgTipoExcecao()">${Object.entries(tipos).map(([k, t]) =>
                `<option value="${_rgEsc(k)}">${_rgEsc(t.nome)}</option>`).join("")}</select>
            <input class="cft-input" id="rg-exc-valor" placeholder="mais de quantas" inputmode="numeric" style="width:130px;flex:0 0 auto;margin:0;display:none">
            <label class="cft-ajuda">de <input type="date" class="cft-input" id="rg-exc-inicio" style="width:auto;margin:0"></label>
            <label class="cft-ajuda">até <input type="date" class="cft-input" id="rg-exc-fim" style="width:auto;margin:0"></label>
            <input class="cft-input" id="rg-exc-obs" placeholder="Observação (opcional)" style="width:240px;flex:0 0 auto;margin:0">
            <button class="cft-btn primario" onclick="_rgAdicionarExcecao(this)">Adicionar</button>
        </div>
    </div>`;
}

function _rgTipoExcecao() {
    const tipo = document.getElementById("rg-exc-tipo").value;
    const t = ((_rgDados || {}).tipos_excecao || {})[tipo] || {};
    document.getElementById("rg-exc-valor").style.display = t.comValor ? "" : "none";
}

function _rgGarantirEntregadores() {
    if (_rgEntregadores) return;
    fetch(`${_RG_API()}/entregadores`, { headers: _rgHeaders() })
    .then(r => r.json())
    .then(d => {
        _rgEntregadores = d.nomes || [];
        const dl = document.getElementById("rg-entregadores");
        if (dl) dl.innerHTML = _rgEntregadores.map(n => `<option value="${_rgEsc(n)}">`).join("");
    }).catch(() => {});
}

function _rgAdicionarExcecao(btn) {
    const v = (id) => document.getElementById(id).value.trim();
    _rgPost("regras/excecoes", "POST", { ..._rgPeriodo(), entregador: v("rg-exc-entregador"), tipo: v("rg-exc-tipo"), valor: v("rg-exc-valor"),
        inicio: v("rg-exc-inicio"), fim: v("rg-exc-fim"), observacao: v("rg-exc-obs") }, "Exceção adicionada — quinzena recalculada.", btn);
}

function _rgRemoverExcecao(id) {
    const e = ((_rgDados || {}).excecoes || []).find(x => x.id === id);
    gcConfirm(`Remover a exceção <b>${_rgEsc(e ? e.descricao : "")}</b>?`, () => {
        const p = _rgPeriodo();
        _rgPost(`regras/excecoes/${id}?mes=${p.mes}&ano=${p.ano}&quinzena=${p.quinzena}`, "DELETE", null, "Exceção removida — quinzena recalculada.");
    }, "Remover exceção", "Remover");
}

// ── Performance: polos e faixas ──
function _rgHtmlPerformance(p) {
    const polos = p.polos || [];
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">Performance</div>
        <div class="cft-barra" style="margin:0 0 8px;flex-wrap:wrap;gap:14px">
            <span class="cft-ajuda">Vale pros pacotes dos polos:</span>
            ${(p.polos_disponiveis || []).map(x => `<label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer;color:#cbd5e1">
                <input type="checkbox" class="rg-polo" value="${_rgEsc(x)}"${polos.includes(x) ? " checked" : ""}> ${_rgEsc(x)}</label>`).join("")}
            <button class="cft-btn" onclick="_rgSalvarPolos(this)">Salvar polos</button>
        </div>
        <div class="cft-ajuda">R$ por pacote pela performance do dia — ${typeof _cfTextoFaixas === "function" ? _cfTextoFaixas(p.faixas) : ""}</div>
        <div class="cft-ajuda" style="margin-top:6px">Valores fixos e sábado/domingo ficam nos dois quadros logo abaixo — depois de mexer neles, use <b>Recalcular a quinzena</b> lá em cima.</div>
    </div>`;
}

function _rgSalvarPolos(btn) {
    const polos = [...document.querySelectorAll(".rg-polo")].filter(c => c.checked).map(c => c.value);
    _rgPost("performance-polos", "PUT", { ..._rgPeriodo(), polos }, "Polos salvos — quinzena recalculada.", btn);
}

// ── Ticketlog ──
function _rgHtmlTicketlog(t) {
    const ehDev = window._gcUser && window._gcUser.role === "dev";
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">Ticketlog</div>
        <div class="cft-barra" style="margin:0;flex-wrap:wrap;align-items:center">
            <span class="cft-ajuda">Desconta</span>
            <input class="cft-input" id="rg-tl-pct" value="${t.percentual != null ? _rgPct(t.percentual) : ""}" inputmode="decimal"
                style="width:70px;flex:0 0 auto;margin:0"${ehDev ? "" : " disabled"}>
            <span class="cft-ajuda">% do abastecimento.${ehDev ? "" : " Só quem é dev muda."} A lista "Não descontar" fica em Criar Fechamento › Descontos: Ticketlog.</span>
            ${ehDev ? `<button class="cft-btn" onclick="_rgSalvarTicketlog(this)">Salvar</button>` : ""}
        </div>
    </div>`;
}

function _rgSalvarTicketlog(btn) {
    _rgPost("ticketlog-config", "POST", { percentual: document.getElementById("rg-tl-pct").value.trim() }, "Percentual do Ticketlog salvo.", btn);
}

// ── Deslocamento ──
function _rgHtmlDeslocamento(v) {
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">Deslocamento</div>
        <div class="cft-barra" style="margin:0;flex-wrap:wrap;align-items:center">
            <span class="cft-ajuda">R$ por km de asfalto</span>
            <input class="cft-input" id="rg-ds-asfalto" value="${_rgNum(v.asfalto)}" inputmode="decimal" style="width:80px;flex:0 0 auto;margin:0">
            <span class="cft-ajuda">· de chão</span>
            <input class="cft-input" id="rg-ds-chao" value="${_rgNum(v.chao)}" inputmode="decimal" style="width:80px;flex:0 0 auto;margin:0">
            <button class="cft-btn" onclick="_rgSalvarDeslocamento(this)">Salvar</button>
            <span class="cft-ajuda">Os km de cada entregador ficam em Fechamento › Deslocamentos.</span>
        </div>
    </div>`;
}

function _rgSalvarDeslocamento(btn) {
    _rgPost("deslocamentos-valores", "PUT", { asfalto: document.getElementById("rg-ds-asfalto").value.trim(),
        chao: document.getElementById("rg-ds-chao").value.trim() }, "Valores do deslocamento salvos.", btn);
}

// ── Extravios ──
function _rgHtmlExtravios(f) {
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">Extravios</div>
        <div class="cft-ajuda" style="margin-bottom:8px">${f.planilha ? `Lendo da planilha <b style="color:#cbd5e1">${_rgEsc(f.planilha)}</b>, aba <b style="color:#cbd5e1">${_rgEsc(f.aba)}</b>.`
            : "Lendo da planilha de extravios do site (Extravios › Registrar)."} Precisa ter as colunas Data desconto, Responsavel e Valor.</div>
        <div class="cft-barra" style="margin:0;flex-wrap:wrap">
            <input class="cft-input" id="rg-fx-link" placeholder="Link da planilha do Google" value="${f.planilha ? "https://docs.google.com/spreadsheets/d/" + _rgEsc(f.planilha) : ""}"
                style="min-width:380px;flex:1;margin:0" onchange="_rgAbasExtravios()">
            <select class="fech-select" id="rg-fx-aba">${f.aba ? `<option selected>${_rgEsc(f.aba)}</option>` : `<option value="">cole o link pra ver as abas</option>`}</select>
            <button class="cft-btn" onclick="_rgSalvarExtravios(this)">Salvar</button>
        </div>
    </div>`;
}

function _rgAbasExtravios() {
    const link = document.getElementById("rg-fx-link").value;
    _rgStatus("Abrindo a planilha...");
    fetch(`${_RG_API()}/extravios-fonte?link=${encodeURIComponent(link)}`, { headers: _rgHeaders() })
    .then(r => r.json())
    .then(f => {
        if (f.error) { _rgStatus(`<span class="cft-erro">${_rgEsc(f.error)}</span>`); return; }
        _rgStatus("");
        document.getElementById("rg-fx-aba").innerHTML = (f.abas || []).map(a => `<option>${_rgEsc(a)}</option>`).join("");
    }).catch(() => _rgStatus(`<span class="cft-erro">Erro ao abrir a planilha.</span>`));
}

function _rgSalvarExtravios(btn) {
    _rgPost("extravios-fonte", "PUT", { link: document.getElementById("rg-fx-link").value, aba: document.getElementById("rg-fx-aba").value },
        "Fonte dos extravios salva.", btn);
}

// ── Histórico ──
function _rgHtmlHistorico(lista) {
    return `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">Histórico de mudanças</div>
        ${lista.length ? `<div class="cft-tabela-wrap" style="max-height:50vh;overflow-y:auto"><table class="cft-tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>Regra</th><th>Antes</th><th>Depois</th></tr></thead>
            <tbody>${lista.map(h => `<tr>
                <td style="white-space:nowrap">${_rgEsc(_rgDataBr(h.alterado_em))}</td>
                <td>${_rgEsc(h.quem || "—")}</td>
                <td>${_rgEsc(h.rotulo)}${h.detalhe ? ` <span class="cft-ajuda">· ${_rgEsc(h.detalhe)}</span>` : ""}</td>
                <td class="cft-ajuda">${h.valor_antes != null ? _rgEsc(h.valor_antes) : "—"}</td>
                <td>${h.valor_depois != null ? _rgEsc(h.valor_depois) : `<span class="cft-ajuda">removido</span>`}</td>
            </tr>`).join("")}</tbody></table></div>` : `<div class="cft-ajuda">Nenhuma mudança registrada ainda (o histórico começou em 28/10/2026).</div>`}
    </div>`;
}

async function _rgRecalcularTudo(btn) {
    btn.disabled = true;
    _rgStatus("Recalculando todos os relatórios da quinzena...");
    try {
        const r = await fetch(`${_RG_API()}/recalcular-todas`, { method: "POST", headers: _rgHeaders(true), body: JSON.stringify(_rgPeriodo()) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao recalcular.");
        _rgStatus(_rgEsc(`Recalculadas: ${d.recalculadas.join(", ")}.`));
    } catch (err) {
        _rgStatus(`<span class="cft-erro">${_rgEsc(err.message)}</span>`);
    } finally { btn.disabled = false; }
}
