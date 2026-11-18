// ───── OPERAÇÃO › TRANSPORTADORAS › LOGGI › CONFERÊNCIA ─────
// (Nasceu "Agrupamento"; em 17/11/2026 virou a Conferência da Loggi, no lugar da de expedição.)
// Quanto dos pacotes que CHEGARAM HOJE no "Na base" da Loggi (Status "Sem tentativa") já foi
// agrupado, e o que falta. As leituras do dia se somam (mesmo código = mesma linha).
// Quem lê o relatório é a extensão XM - Operação, no Arco (Baixar relatórios › Loggi ›
// "Conferir agora"): ela manda só código, ID, cidade e prazo. Agrupado = bipado no Agrupar
// pacotes com a extensão no mesmo dia (tirou na lixeira depois = não conta). O sistema refaz
// a conta a cada abertura: a % sobe conforme a equipe bipa, sem ler o relatório de novo.
// Backend: /macros/loggi-bipagem/na-base (modules/loggi-bipagem/na-base.js).
const _LAG_API = () => `${API}/macros/loggi-bipagem/na-base`;
const _LAG_MAX_LINHAS = 500;
const _LAG_ATUALIZAR_MS = 60000;

let _lagDados = null;     // resposta do GET
let _lagDia = null;       // AAAA-MM-DD escolhido; null = o último lido
let _lagBase = 0;         // índice da base (se um dia houver mais de uma)
let _lagCidade = "";      // filtro da tabela pela cidade clicada
let _lagTimer = null;

function _lagEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const _lagNum = n => Number(n || 0).toLocaleString("pt-BR");
// Sempre 2 casas (99,78%), para baixo: 99,996% não vira 100,00%.
const _lagPct = (a, t) => t ? (Math.floor(a * 10000 / t) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%" : "—";
const _lagDiaBr = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const _lagPrazo = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : ""; };

function abrirLoggiAgrupamento(event) {
    if (event) event.preventDefault();
    _lagDia = null;
    _lagCidade = "";
    mostrarTela("tela-loggi-agrupamento", "Conferencias/Loggi");
    document.getElementById("titulo-pagina").innerText = "Conferência — Loggi";
    _lagCarregar();
    // Enquanto a tela está aberta, a % acompanha os bipes.
    clearInterval(_lagTimer);
    _lagTimer = setInterval(() => {
        const tela = document.getElementById("tela-loggi-agrupamento");
        if (!tela || !tela.classList.contains("active-view")) { clearInterval(_lagTimer); return; }
        if (!document.hidden) _lagCarregar(true);
    }, _LAG_ATUALIZAR_MS);
}

function _lagCarregar(quieto) {
    const el = document.getElementById("lag-resultado");
    if (!quieto) el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    const q = _lagDia ? `?dia=${encodeURIComponent(_lagDia)}` : "";
    fetch(_LAG_API() + q, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) { el.innerHTML = `<div class="cft-erro">${_lagEsc(d.error)}</div>`; return; }
            _lagDados = d;
            if (_lagBase >= (d.bases || []).length) _lagBase = 0;
            _lagPintar();
        })
        .catch(() => { if (!quieto) el.innerHTML = `<div class="cft-erro">Erro ao conectar com o servidor.</div>`; });
}

function _lagPintar() {
    const d = _lagDados || {};
    const el = document.getElementById("lag-resultado");
    const dias = d.dias || [];
    const selDia = dias.length ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_lagDia=this.value;_lagCidade='';_lagCarregar()">
        ${dias.map(x => `<option value="${x}"${x === d.dia ? " selected" : ""}>${_lagDiaBr(x)}${x === d.hoje ? " (hoje)" : ""}</option>`).join("")}
    </select>` : "";
    const bases = d.bases || [];
    const selBase = bases.length > 1 ? `<select class="cft-input" style="width:auto;flex:0 0 auto;margin:0" onchange="_lagBase=Number(this.value);_lagCidade='';_lagPintar()">
        ${bases.map((b, i) => `<option value="${i}"${i === _lagBase ? " selected" : ""}>Base ${_lagEsc(b.base)}</option>`).join("")}
    </select>` : "";
    document.getElementById("lag-barra").innerHTML = selDia + selBase
        + `<button class="cft-btn" onclick="_lagCarregar()">Atualizar</button>`;

    const b = bases[_lagBase];
    if (!b) {
        el.innerHTML = `<div class="cft-ajuda">Ninguém conferiu o Na base ainda. No Arco, abra a extensão XM - Operação › Conferências › Loggi › aba <b>Agrupamento</b> › <b>Conferir agora</b>.</div>`;
        return;
    }
    const buscaAntes = (document.getElementById("lag-busca") || {}).value || ""; // a atualização de 1 em 1 min não apaga a busca
    const completo = b.total > 0 && !b.faltam;
    const lido = new Date(b.lido_em);
    const hora = Number.isNaN(lido.getTime()) ? "" : lido.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const antigo = d.dia !== d.hoje;
    // Mesmo visual do painel da extensão: pizza (rosca) agrupados x faltam e barras por cidade.
    const comFalta = (b.porCidade || []).filter(c => c.total > c.agrupados);
    const maior = Math.max(1, ...comFalta.map(c => c.total));
    const barras = comFalta.length ? comFalta.map(c => {
        const falta = c.total - c.agrupados;
        return `<div class="lag-barra-cidade${c.cidade === _lagCidade ? " lag-sel" : ""}" data-c="${_lagEsc(c.cidade)}" title="${_lagEsc(c.cidade)}: ${_lagNum(c.agrupados)} de ${_lagNum(c.total)} agrupados — clique pra ver os pacotes" onclick="_lagFiltrarCidade(this.dataset.c)">
            <span>${_lagEsc(c.cidade)}</span>
            <div class="lag-trilho"><i class="lag-ok" style="width:${c.agrupados / maior * 100}%"></i><i class="lag-falta" style="width:${falta / maior * 100}%"></i></div>
            <em>${_lagNum(falta)}</em>
            <a href="#" class="lag-acao" title="Tirar da conta (para todos)" onclick="event.preventDefault();event.stopPropagation();_lagIgnorar(this.parentElement.dataset.c,true)">tirar</a>
        </div>`;
    }).join("") : `<div class="cft-ajuda">Nenhuma cidade com pacote faltando.</div>`;
    el.innerHTML = `
        <div class="lag-colunas">
            <div class="lag-cartao lag-resumo">
                <div class="lag-pizza${completo ? " lag-completo" : ""}${b.total ? "" : " lag-vazia"}" style="--pct:${Math.min(100, b.porcentagem || 0)}"><svg viewBox="0 0 120 68"><path class="arco-fundo" d="M10 60 A50 50 0 0 1 110 60"/><path class="arco-valor" d="M10 60 A50 50 0 0 1 110 60"/></svg><span>${_lagPct(b.agrupados, b.total)}</span></div>
                <div>
                    <div class="lag-conta">${b.total ? `${_lagNum(b.agrupados)} de ${_lagNum(b.total)} agrupados${b.faltam ? ` · faltam ${_lagNum(b.faltam)}` : ""}` : `Nenhum recebido hoje "Sem tentativa"`}</div>
                    <div class="lag-legenda"><span><i class="lag-ok"></i>Agrupados</span><span><i class="lag-falta"></i>Faltam</span><span class="cft-ajuda">meta 100%</span></div>
                    <div class="cft-ajuda">${_lagNum(b.recebidos)} recebidos ${antigo ? `em ${_lagDiaBr(d.dia)}` : "hoje"} (só os "Sem tentativa" entram na conta) · Na base lido às ${hora}${b.usuario ? ` por ${_lagEsc(b.usuario)}` : ""} · base ${_lagEsc(b.base)}.</div>
                    <div class="cft-ajuda" style="margin-top:4px">Pacote que chegou depois disso entra na próxima leitura ("Conferir agora" na extensão); as leituras se somam.</div>
                </div>
            </div>
            <div class="lag-cartao">
                <div class="lag-titulo"><span>Faltam por cidade</span><span class="cft-ajuda">"tirar" = fora da conta</span></div>
                <div class="lag-barras">${barras}</div>
                ${(b.ignoradas || []).length ? `<div class="cft-ajuda" style="margin-top:10px">Fora da conta: ${b.ignoradas.map(c =>
                    `${_lagEsc(c.cidade)} (${_lagNum(c.total)}) <a href="#" class="lag-acao" data-c="${_lagEsc(c.cidade)}" onclick="event.preventDefault();_lagIgnorar(this.dataset.c,false)">voltar</a>`).join(" · ")}</div>` : ""}
            </div>
        </div>
        <div class="cft-barra" style="margin:18px 0 8px">
            <span class="nr-grafico-titulo" style="margin:0">Faltam agrupar${_lagCidade ? ` · ${_lagEsc(_lagCidade)} <a href="#" class="cft-link" onclick="event.preventDefault();_lagFiltrarCidade('')">ver todas</a>` : ""}</span>
            <input class="cft-input" id="lag-busca" placeholder="Buscar código ou cidade..." style="width:220px;flex:0 0 auto;margin:0" oninput="_lagPintarTabela()">
            <button class="cft-btn" onclick="_lagCopiar()">Copiar códigos</button>
            <span class="cft-ajuda" id="lag-copia"></span>
        </div>
        <div id="lag-tabela"></div>`;
    document.getElementById("lag-busca").value = buscaAntes;
    _lagPintarTabela();
}

// Tirar/voltar uma cidade da conta: vale para todos (fica no sistema) e para todo dia.
function _lagIgnorar(cidade, ignorar) {
    if (_lagCidade === cidade) _lagCidade = "";
    fetch(`${_LAG_API()}/ignorar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ cidade, ignorar }),
    }).then(r => r.json()).then(d => {
        if (d.error) { alert(d.error); return; }
        _lagCarregar(true);
    }).catch(() => alert("Erro ao conectar com o servidor."));
}

function _lagFiltrarCidade(c) {
    _lagCidade = _lagCidade === c ? "" : c;
    _lagPintar();
}

function _lagFiltrados() {
    const b = ((_lagDados && _lagDados.bases) || [])[_lagBase];
    if (!b) return [];
    const busca = String((document.getElementById("lag-busca") || {}).value || "").trim().toLowerCase();
    return (b.pendentes || []).filter(p => (!_lagCidade || (p.cidade || "(sem cidade)") === _lagCidade)
        && (!busca || [p.codigo, p.id, p.cidade].some(v => String(v || "").toLowerCase().includes(busca))));
}

function _lagPintarTabela() {
    const el = document.getElementById("lag-tabela");
    if (!el) return;
    const lista = _lagFiltrados();
    if (!lista.length) { el.innerHTML = `<div class="cft-ajuda">Nada faltando por aqui.</div>`; return; }
    el.innerHTML = `<div class="cft-tabela-wrap" style="max-height:62vh"><table class="cft-tabela">
        <thead><tr><th>Código de barras</th><th>Cidade</th><th>Prazo</th></tr></thead>
        <tbody>${lista.slice(0, _LAG_MAX_LINHAS).map(p => `<tr>
            <td>${_lagEsc(p.codigo || p.id)}</td><td>${_lagEsc(p.cidade) || `<span class="cft-vazio">—</span>`}</td>
            <td>${_lagEsc(_lagPrazo(p.prazo))}</td></tr>`).join("")}</tbody></table></div>
        ${lista.length > _LAG_MAX_LINHAS ? `<div class="cft-ajuda" style="margin-top:6px">Mostrando ${_LAG_MAX_LINHAS} de ${_lagNum(lista.length)}. "Copiar códigos" leva todos do filtro.</div>` : ""}`;
}

function _lagCopiar() {
    const codigos = _lagFiltrados().map(p => p.codigo || p.id);
    const st = document.getElementById("lag-copia");
    if (!codigos.length) { st.innerText = "Nada pra copiar."; return; }
    navigator.clipboard.writeText(codigos.join("\n"))
        .then(() => { st.innerText = `${_lagNum(codigos.length)} copiado(s).`; })
        .catch(() => { st.innerText = "Não deu pra copiar."; });
}
