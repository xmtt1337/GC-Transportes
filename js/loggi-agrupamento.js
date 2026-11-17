// ───── OPERAÇÃO › TRANSPORTADORAS › LOGGI › AGRUPAMENTO ─────
// Quanto do "Na base" da Loggi (Status "Sem tentativa") já foi agrupado hoje, e o que falta.
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
const _lagPct = (a, t) => t ? (Math.floor(a / t * 1000) / 10).toLocaleString("pt-BR") + "%" : "—";
const _lagDiaBr = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const _lagPrazo = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : ""; };

function abrirLoggiAgrupamento(event) {
    if (event) event.preventDefault();
    _lagDia = null;
    _lagCidade = "";
    mostrarTela("tela-loggi-agrupamento", "Loggi/Agrupamento");
    document.getElementById("titulo-pagina").innerText = "Agrupamento — Loggi";
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
        el.innerHTML = `<div class="cft-ajuda">Ninguém conferiu o Na base ainda. No Arco, abra a extensão XM - Operação › Baixar relatórios › Loggi › <b>Conferir agora</b>.</div>`;
        return;
    }
    const buscaAntes = (document.getElementById("lag-busca") || {}).value || ""; // a atualização de 1 em 1 min não apaga a busca
    const completo = b.total > 0 && !b.faltam;
    const lido = new Date(b.lido_em);
    const hora = Number.isNaN(lido.getTime()) ? "" : lido.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const antigo = d.dia !== d.hoje;
    el.innerHTML = `
        <div class="lag-progresso">
            <div class="lag-topo">
                <span class="lag-pct${completo ? " lag-completo" : ""}">${_lagPct(b.agrupados, b.total)}</span>
                <span class="cft-ajuda">${_lagNum(b.agrupados)} de ${_lagNum(b.total)} "Sem tentativa" agrupados${b.faltam ? ` · faltam <b class="cft-neg">${_lagNum(b.faltam)}</b>` : ""} · meta 100%</span>
            </div>
            <div class="lag-barra"><i class="${completo ? "lag-completo" : ""}" style="width:${Math.min(100, b.porcentagem || 0)}%"></i></div>
            <div class="cft-ajuda" style="margin-top:6px">Na base lido ${antigo ? `em ${_lagDiaBr(d.dia)} ` : ""}às ${hora}${b.usuario ? ` por ${_lagEsc(b.usuario)}` : ""} · base ${_lagEsc(b.base)}.
                Pacote que chegou depois disso só entra numa nova leitura ("Conferir agora" na extensão).</div>
        </div>
        <div class="lag-colunas">
            <div>
                <div class="nr-grafico-titulo" style="margin-bottom:8px">Por cidade</div>
                <div class="cft-tabela-wrap" style="max-height:62vh"><table class="cft-tabela">
                    <thead><tr><th>Cidade</th><th class="num">Sem tentativa</th><th class="num">Faltam</th><th class="num">Agrupado</th></tr></thead>
                    <tbody>${(b.porCidade || []).map(c => {
                        const falta = c.total - c.agrupados;
                        return `<tr class="lag-linha${c.cidade === _lagCidade ? " lag-sel" : ""}" data-c="${_lagEsc(c.cidade)}" onclick="_lagFiltrarCidade(this.dataset.c)">
                            <td>${_lagEsc(c.cidade)}</td><td class="num">${_lagNum(c.total)}</td>
                            <td class="num ${falta ? "cft-neg" : ""}">${falta ? _lagNum(falta) : "—"}</td>
                            <td class="num ${falta ? "" : "cft-pos"}">${_lagPct(c.agrupados, c.total)}</td></tr>`;
                    }).join("")}</tbody></table></div>
            </div>
            <div>
                <div class="cft-barra" style="margin:0 0 8px">
                    <span class="nr-grafico-titulo" style="margin:0">Faltam agrupar${_lagCidade ? ` · ${_lagEsc(_lagCidade)} <a href="#" class="cft-link" onclick="event.preventDefault();_lagFiltrarCidade('')">ver todas</a>` : ""}</span>
                    <input class="cft-input" id="lag-busca" placeholder="Buscar código ou cidade..." style="width:220px;flex:0 0 auto;margin:0" oninput="_lagPintarTabela()">
                    <button class="cft-btn" onclick="_lagCopiar()">Copiar códigos</button>
                    <span class="cft-ajuda" id="lag-copia"></span>
                </div>
                <div id="lag-tabela"></div>
            </div>
        </div>`;
    document.getElementById("lag-busca").value = buscaAntes;
    _lagPintarTabela();
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
