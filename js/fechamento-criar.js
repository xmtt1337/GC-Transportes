// ───── CRIAR FECHAMENTO (relatório por transportadora → fechamento tratado no banco) ─────
// A pessoa escolhe mês/ano/quinzena, clica na transportadora e anexa o relatório dela.
// O backend (modules/fechamento-transportadoras) trata: conversão de nome, cidade → preço,
// prazo e polo pela planilha de precificação, dentro do prazo, incentivo, desconto,
// adicional por peso e valor do motorista — e grava como o fechamento daquela quinzena.
let _cfMes         = new Date().getMonth() + 1;
let _cfAno         = new Date().getFullYear();
let _cfQuinzena    = null;
let _cfTranspAtual = null;
let _cfReqId       = 0; // descarta resposta de período trocado antes do fetch anterior voltar
let _cfResumo      = [];
let _cfColunas     = null; // nomes de coluna aceitos por transportadora (GET /config)
let _cfIgnSab      = false;
let _cfIgnDom      = false;
let _cfTemLote     = false;
let _cfBusca       = "";
let _cfFiltro      = "";
let _cfPagina      = 0;
let _cfBuscaTimer  = null;
const _CF_POR_PAGINA = 200;
const _CF_API = () => `${API}/admin/fechamento-transportadoras`;

// key/label também são lidos por pedidos-ocorrencia.js.
const _CF_TRANSPORTADORAS = [
    { key: "shopee", label: "Shopee Xpress", cor: "#F97316" },
    { key: "loggi",  label: "Loggi",         cor: "#12A5E8" },
    { key: "anjun",  label: "Anjun",         cor: "#22C55E" },
    { key: "imile",  label: "Imile",         cor: "#9333EA" },
    { key: "total",  label: "Total Express", cor: "#EAB308" },
];

function _cfEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function _cfDia(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a.slice(2)}`;
}
function _cfNum(n, casas = 2) {
    return n === null || n === undefined ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
function _cfHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}
function _cfQs(extra) {
    const p = { mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, ...(extra || {}) };
    return Object.keys(p).map(k => k + "=" + encodeURIComponent(p[k] ?? "")).join("&");
}

function abrirCriarFechamento(event) {
    if (event) event.preventDefault();
    _cfQuinzena = null;
    _cfTranspAtual = null;
    _cfReqId++; // resposta ainda pendente não pode pintar a tela sem quinzena escolhida
    document.getElementById("cf-btn-1q").classList.remove("active");
    document.getElementById("cf-btn-2q").classList.remove("active");
    document.getElementById("cf-empty").innerText = "Selecione o mês, ano e quinzena.";
    document.getElementById("cf-empty").style.display = "";
    document.getElementById("cf-content").style.display = "none";
    _cfIniciarSelects();
    mostrarTela("tela-criar-fechamento");
}

function _cfIniciarSelects() {
    const selAno   = document.getElementById("cf-ano");
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = "";
    for (let a = anoAtual - 1; a <= anoAtual; a++) {
        const opt = document.createElement("option");
        opt.value = a; opt.textContent = a;
        if (a === _cfAno) opt.selected = true;
        selAno.appendChild(opt);
    }
    document.getElementById("cf-mes").value = _cfMes;
}

function _cfPeriodoMudou() {
    _cfMes = parseInt(document.getElementById("cf-mes").value);
    _cfAno = parseInt(document.getElementById("cf-ano").value);
    if (_cfQuinzena) _cfCarregarResumo();
}

function _cfSelecionarQuinzena(q) {
    _cfQuinzena = q;
    document.getElementById("cf-btn-1q").classList.toggle("active", q === 1);
    document.getElementById("cf-btn-2q").classList.toggle("active", q === 2);
    _cfCarregarResumo();
}

function _cfCarregarResumo() {
    if (!_cfQuinzena) return;
    _cfMes = parseInt(document.getElementById("cf-mes").value);
    _cfAno = parseInt(document.getElementById("cf-ano").value);
    const empty   = document.getElementById("cf-empty");
    const content = document.getElementById("cf-content");
    const reqId   = ++_cfReqId;
    skMostrar(empty);
    empty.style.display = "";
    content.style.display = "none";

    fetch(`${_CF_API()}/resumo?${_cfQs()}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(rows => {
        if (reqId !== _cfReqId) return; // período já mudou de novo — resposta desatualizada, ignora
        empty.style.display = "none";
        content.style.display = "";
        _cfResumo = Array.isArray(rows) ? rows : [];
        _cfRenderCards();
        if (_cfTranspAtual) _cfCarregarDetalhe();
        else document.getElementById("cf-painel").style.display = "none";
    }).catch(() => {
        if (reqId === _cfReqId) skFim(empty, "Erro ao carregar dados do período.");
    });
}

// Recarrega só os cards (depois de upload/recálculo), sem esconder a tela.
function _cfAtualizarCards() {
    const reqId = _cfReqId;
    fetch(`${_CF_API()}/resumo?${_cfQs()}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(rows => {
        if (reqId !== _cfReqId) return;
        _cfResumo = Array.isArray(rows) ? rows : [];
        _cfRenderCards();
    }).catch(() => {});
}

function _cfRenderCards() {
    document.getElementById("cf-cards").innerHTML = _CF_TRANSPORTADORAS.map(t => {
        const r = _cfResumo.find(x => x.chave === t.key || x.transportadora === t.label);
        let corpo;
        if (!r) {
            corpo = `<div class="cft-card-vazio">Sem relatório</div>`;
        } else {
            const comData = r.dentro_prazo + r.fora_prazo;
            const pct = comData ? Math.round(r.dentro_prazo / comData * 100) : 0;
            corpo = `
                <div class="cft-card-linha"><strong>${r.total.toLocaleString("pt-BR")}</strong> pacotes · <strong>${pct}%</strong> no prazo</div>
                <div class="cft-card-linha">Motoristas: <strong>${moedaJS(r.valor_motorista)}</strong></div>
                ${r.com_pendencia ? `<div class="cft-card-linha cft-card-pend">${r.com_pendencia.toLocaleString("pt-BR")} com pendência</div>` : ""}
                <div class="cft-arquivo" title="${_cfEsc(r.arquivo)}">${_cfEsc(r.arquivo || "")}</div>`;
        }
        return `<button class="cft-card${_cfTranspAtual === t.key ? " active" : ""}" style="--cft-cor:${t.cor}" onclick="_cfSelecionarTransp('${t.key}')">
            <div class="cft-card-nome">${t.label}</div>${corpo}</button>`;
    }).join("");
}

function _cfSelecionarTransp(key) {
    _cfTranspAtual = key;
    _cfBusca = ""; _cfFiltro = ""; _cfPagina = 0;
    _cfRenderCards();
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === key);
    document.getElementById("cf-painel-nome").innerText = cfg.label;
    document.getElementById("cf-upload-titulo").innerText = `Anexar relatório — ${cfg.label}`;
    document.getElementById("cf-upload-status").innerHTML = "";
    document.getElementById("cf-file-input").value = "";
    // Loggi está sempre no prazo — sábado/domingo não muda nada lá.
    document.getElementById("cf-fds-barra").style.display = key === "loggi" ? "none" : "";
    document.getElementById("cf-painel").style.display = "";
    _cfCarregarDetalhe();
}

function _cfCarregarDetalhe() {
    const key = _cfTranspAtual;
    const reqId = _cfReqId;
    const det = document.getElementById("cf-detalhe");
    det.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CF_API()}/lote?${_cfQs({ transportadora: key })}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (reqId !== _cfReqId || key !== _cfTranspAtual) return;
        if (d.error) { det.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfTemLote = !!d.lote;
        if (d.lote) {
            _cfIgnSab = !!d.lote.ignorar_sabado;
            _cfIgnDom = !!d.lote.ignorar_domingo;
            const quando = new Date(d.lote.recalculado_em || d.lote.enviado_em);
            document.getElementById("cf-painel-arquivo").innerText =
                `${d.lote.arquivo || "relatório"} · ${d.lote.recalculado_em ? "recalculado" : "enviado"} em ${quando.toLocaleString("pt-BR")}`;
        } else {
            document.getElementById("cf-painel-arquivo").innerText = "";
        }
        _cfRenderChips();
        if (!d.lote) {
            det.innerHTML = `<div class="cft-ajuda">Nenhum relatório dessa transportadora nesta quinzena ainda.</div>`;
            return;
        }
        det.innerHTML = _cfHtmlResumo(d.resumo) + _cfHtmlAcoes() + _cfHtmlTabelaBase();
        _cfCarregarPacotes();
    }).catch(() => {
        if (reqId === _cfReqId) det.innerHTML = `<div class="cft-erro">Erro ao carregar o fechamento.</div>`;
    });
}

function _cfRenderChips() {
    document.getElementById("cf-chip-sab").classList.toggle("on", _cfIgnSab);
    document.getElementById("cf-chip-dom").classList.toggle("on", _cfIgnDom);
}

function _cfHtmlResumo(r) {
    const comData = r.dentro_prazo + r.fora_prazo;
    const pct = comData ? Math.round(r.dentro_prazo / comData * 100) : 0;
    const kpis = `
        <div class="cft-kpis">
            <div class="cft-kpi"><div class="cft-kpi-valor">${r.total.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Pacotes</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${pct}%</div><div class="cft-kpi-rotulo">${r.dentro_prazo.toLocaleString("pt-BR")} no prazo</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${r.fora_prazo.toLocaleString("pt-BR")}</div><div class="cft-kpi-rotulo">Fora do prazo</div></div>
            <div class="cft-kpi"><div class="cft-kpi-valor">${moedaJS(r.valor_motorista)}</div><div class="cft-kpi-rotulo">Valor motoristas</div></div>
        </div>`;

    const tags = (lista) => `<div class="cft-pend-tags">${lista.map(x =>
        `<span class="cft-tag">${_cfEsc(x.nome)} <b>${x.qtd}</b></span>`).join("")}</div>`;
    const grupos = [];
    if (r.cidades_sem_preco.length) grupos.push(`<div class="cft-pend-grupo"><b>Cidade sem preço na planilha</b> — sem valor nem prazo até cadastrar na aba da transportadora:${tags(r.cidades_sem_preco)}</div>`);
    if (r.tipos_sem_preco.length) grupos.push(`<div class="cft-pend-grupo"><b>Tipo de produto sem coluna de preço</b>:${tags(r.tipos_sem_preco)}</div>`);
    if (r.nomes_sem_conversao.length) grupos.push(`<div class="cft-pend-grupo"><b>Usuário sem conversão de nome</b> — cadastre em Cadastros › Usuários › Conversão de nomes:${tags(r.nomes_sem_conversao)}</div>`);
    if (r.sem_data_entrega) grupos.push(`<div class="cft-pend-grupo"><b>${r.sem_data_entrega}</b> sem data de entrega (não pagos)</div>`);
    if (r.sem_data_atribuicao) grupos.push(`<div class="cft-pend-grupo"><b>${r.sem_data_atribuicao}</b> sem data de atribuição (prazo não calculado)</div>`);
    const pend = grupos.length ? `
        <div class="cft-pend">
            <div class="cft-pend-titulo">Pendências</div>
            ${grupos.join("")}
            <div class="cft-ajuda" style="margin-top:10px">Depois de corrigir, clique em Recalcular — não precisa reenviar o relatório.</div>
        </div>` : "";
    return kpis + pend;
}

function _cfHtmlAcoes() {
    return `
        <div class="cft-barra">
            <button class="cft-btn verde" id="cf-btn-recalcular" onclick="_cfRecalcular()">↻ Recalcular</button>
            <button class="cft-btn" onclick="_cfExportar(this)">⤓ Baixar relatório tratado</button>
            <button class="cft-btn vermelho" onclick="_cfExcluir()">Excluir relatório</button>
            <span class="cft-ajuda" id="cf-acao-status"></span>
        </div>`;
}

function _cfHtmlTabelaBase() {
    return `
        <div class="cft-barra" style="justify-content:space-between">
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="cft-chip${_cfFiltro === "" ? " on" : ""}" data-cf-filtro="" onclick="_cfMudarFiltro('')">Todos</button>
                <button class="cft-chip${_cfFiltro === "fora" ? " on" : ""}" data-cf-filtro="fora" onclick="_cfMudarFiltro('fora')">Fora do prazo</button>
                <button class="cft-chip${_cfFiltro === "pendentes" ? " on" : ""}" data-cf-filtro="pendentes" onclick="_cfMudarFiltro('pendentes')">Com pendência</button>
            </div>
            <div class="adm-search-input-area" style="max-width:300px">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7b98b5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="cf-busca" placeholder="Código, usuário, driver ou cidade..." value="${_cfEsc(_cfBusca)}" oninput="_cfBuscar(this.value)">
            </div>
        </div>
        <div id="cf-tabela"></div>`;
}

const _CF_PENDENCIA_TEXTO = {
    cidade_sem_preco: "cidade sem preço", tipo_sem_preco: "tipo sem preço", sem_conversao_nome: "sem conversão de nome",
    sem_data_entrega: "sem data de entrega", sem_data_atribuicao: "sem data de atribuição",
};

function _cfCarregarPacotes() {
    const el = document.getElementById("cf-tabela");
    if (!el) return;
    const key = _cfTranspAtual;
    const reqId = _cfReqId;
    const params = { transportadora: key, busca: _cfBusca, filtro: _cfFiltro, limite: _CF_POR_PAGINA, pagina: _cfPagina };
    fetch(`${_CF_API()}/pacotes?${_cfQs(params)}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (reqId !== _cfReqId || key !== _cfTranspAtual) return;
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        const total = key === "total";
        const linhas = (d.pacotes || []).map(p => {
            const pend = (p.pendencias || []).map(x => _CF_PENDENCIA_TEXTO[x] || x).join(", ");
            const prazo = p.dentro_prazo === "Sim" ? `<span class="cft-sim">Sim</span>`
                : p.dentro_prazo === "Não" ? `<span class="cft-nao">Não</span>` : `<span class="cft-vazio">—</span>`;
            return `<tr class="${pend ? "pendente" : ""}" title="${_cfEsc(pend)}">
                <td>${p.driver ? _cfEsc(p.driver) : `<span class="cft-vazio">—</span>`}</td>
                <td>${_cfEsc(p.usuario)}</td>
                <td>${_cfEsc(p.codigo)}</td>
                ${total ? `<td>${_cfEsc(p.tipo_produto)}</td>` : ""}
                <td>${_cfEsc(p.cidade || p.cep)}</td>
                <td>${_cfEsc(p.polo)}</td>
                <td>${_cfDia(p.data_atribuicao)}</td>
                <td>${_cfDia(p.data_entrega)}</td>
                <td>${_cfDia(p.deve_ser_entregue)}</td>
                <td>${prazo}</td>
                <td class="num">${_cfNum(p.peso_kg, 2)}</td>
                <td class="num">${_cfNum(p.valor_entrega)}</td>
                <td class="num">${_cfNum(p.incentivo)}</td>
                <td class="num">${_cfNum(p.desconto)}</td>
                <td class="num">${_cfNum(p.adicional_peso)}</td>
                <td class="num"><strong>${_cfNum(p.valor_motorista)}</strong></td>
            </tr>`;
        }).join("");
        const paginas = Math.max(1, Math.ceil(d.total / _CF_POR_PAGINA));
        el.innerHTML = `
            <div class="cft-tabela-wrap"><table class="cft-tabela">
                <thead><tr>
                    <th>Driver</th><th>Usuário</th><th>Código</th>${total ? "<th>Tipo</th>" : ""}<th>Cidade</th><th>Polo</th>
                    <th>Atribuição</th><th>Entrega</th><th>Deve ser entregue</th><th>No prazo</th>
                    <th>Peso (kg)</th><th>Valor</th><th>Incentivo</th><th>Desconto</th><th>Adic. peso</th><th>Motorista</th>
                </tr></thead>
                <tbody>${linhas || `<tr><td colspan="16" class="cft-vazio" style="padding:16px">Nenhum pacote.</td></tr>`}</tbody>
            </table></div>
            <div class="cft-paginacao">
                <span>${d.total.toLocaleString("pt-BR")} pacote${d.total !== 1 ? "s" : ""}</span>
                ${paginas > 1 ? `<span>
                    <button class="cft-chip" ${_cfPagina === 0 ? "disabled" : ""} onclick="_cfMudarPagina(-1)">‹</button>
                    página ${_cfPagina + 1} de ${paginas}
                    <button class="cft-chip" ${_cfPagina >= paginas - 1 ? "disabled" : ""} onclick="_cfMudarPagina(1)">›</button>
                </span>` : ""}
            </div>`;
    }).catch(() => {
        if (reqId === _cfReqId) el.innerHTML = `<div class="cft-erro">Erro ao carregar os pacotes.</div>`;
    });
}

function _cfBuscar(v) {
    clearTimeout(_cfBuscaTimer);
    _cfBuscaTimer = setTimeout(() => { _cfBusca = v.trim(); _cfPagina = 0; _cfCarregarPacotes(); }, 300);
}
function _cfMudarFiltro(f) {
    _cfFiltro = f; _cfPagina = 0;
    document.querySelectorAll("[data-cf-filtro]").forEach(b => b.classList.toggle("on", b.dataset.cfFiltro === f));
    _cfCarregarPacotes();
}
function _cfMudarPagina(delta) {
    _cfPagina = Math.max(0, _cfPagina + delta);
    _cfCarregarPacotes();
}

// Sábado/domingo: com relatório já gravado, recalcula na hora; sem relatório, vale pro
// próximo upload.
function _cfAlternarFds(qual) {
    if (qual === "sab") _cfIgnSab = !_cfIgnSab; else _cfIgnDom = !_cfIgnDom;
    _cfRenderChips();
    if (_cfTemLote) _cfRecalcular();
}

function _cfRecalcular() {
    const key = _cfTranspAtual;
    const chips = [document.getElementById("cf-chip-sab"), document.getElementById("cf-chip-dom")];
    const btn = document.getElementById("cf-btn-recalcular");
    const status = document.getElementById("cf-acao-status");
    chips.forEach(c => c.disabled = true);
    if (btn) btn.disabled = true;
    if (status) status.innerText = "Recalculando (relendo planilha de precificação e conversão de nomes)...";
    fetch(`${_CF_API()}/recalcular`, {
        method: "POST", headers: _cfHeaders(true),
        body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: key,
            ignorar_sabado: _cfIgnSab, ignorar_domingo: _cfIgnDom }),
    }).then(r => r.json())
    .then(d => {
        chips.forEach(c => c.disabled = false);
        if (key !== _cfTranspAtual) return;
        if (d.error) { if (status) status.innerText = d.error; if (btn) btn.disabled = false; return; }
        _cfAtualizarCards();
        _cfCarregarDetalhe();
    }).catch(() => {
        chips.forEach(c => c.disabled = false);
        if (btn) btn.disabled = false;
        if (status) status.innerText = "Erro ao recalcular.";
    });
}

function _cfExcluir() {
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual);
    gcConfirm(`Excluir o relatório da <b>${cfg.label}</b> desta quinzena? Os pacotes tratados saem do banco.`, () => {
        fetch(`${_CF_API()}/lote?${_cfQs({ transportadora: cfg.key })}`, { method: "DELETE", headers: _cfHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.error) { gcAlert(d.error); return; }
            _cfAtualizarCards();
            _cfCarregarDetalhe();
        }).catch(() => gcAlert("Erro ao excluir."));
    }, "Excluir relatório", "Excluir");
}

// Mesma ordem de colunas da planilha de fechamento.
const _CF_EXPORT_COLUNAS = [
    ["Transportadora", "transportadora"], ["Tipo de Produto", "tipo_produto"], ["Driver", "driver"],
    ["Usuario", "usuario"], ["Codigo", "codigo"], ["Cidade", "cidade"], ["Polo", "polo"],
    ["Destinatario", "destinatario"], ["Endereço", "endereco"], ["Data atribuicao", "data_atribuicao"],
    ["Data entrega", "data_entrega"], ["Deve ser entregue", "deve_ser_entregue"], ["Dentro do prazo", "dentro_prazo"],
    ["Peso (Kg)", "peso_kg"], ["Valor entrega", "valor_entrega"], ["Incentivo", "incentivo"], ["Desconto", "desconto"],
    ["Adicional por peso", "adicional_peso"], ["Valor motorista", "valor_motorista"],
];

function _cfExportar(btn) {
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === _cfTranspAtual);
    btn.disabled = true;
    fetch(`${_CF_API()}/exportar?${_cfQs({ transportadora: cfg.key })}`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        btn.disabled = false;
        if (d.error) { gcAlert(d.error); return; }
        const linhas = [_CF_EXPORT_COLUNAS.map(c => c[0])].concat(
            d.pacotes.map(p => _CF_EXPORT_COLUNAS.map(c => p[c[1]] ?? "")));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), cfg.label.slice(0, 31));
        XLSX.writeFile(wb, `fechamento_${cfg.key}_${String(_cfMes).padStart(2, "0")}-${_cfAno}_q${_cfQuinzena}.xlsx`);
    }).catch(() => { btn.disabled = false; gcAlert("Erro ao baixar."); });
}

// ── Upload ──
async function _cfArquivoSelecionado(input) {
    const file = input.files[0];
    if (!file) return;
    const key = _cfTranspAtual;
    const cfg = _CF_TRANSPORTADORAS.find(t => t.key === key);
    if (!cfg) return;
    const status = document.getElementById("cf-upload-status");
    status.innerHTML = `<div class="cft-ajuda" style="font-size:13px">Lendo arquivo...</div>`;

    try {
        if (!_cfColunas) {
            const c = await fetch(`${_CF_API()}/config`, { headers: _cfHeaders() }).then(r => r.json());
            if (c.error) throw new Error(c.error);
            _cfColunas = c.colunas;
        }
        const grid = await _cfLerGrid(file);
        if (!grid || grid.length < 2) throw new Error("Arquivo vazio ou inválido.");
        const { grid: enviar, posicoes } = _cfSoColunasUteis(grid, _cfColunas[key] || []);
        status.innerHTML = `<div class="cft-ajuda" style="font-size:13px">Tratando ${(grid.length - 1).toLocaleString("pt-BR")} linhas (planilha de precificação + conversão de nomes)...</div>`;
        const res = await fetch(`${_CF_API()}/upload`, {
            method: "POST", headers: _cfHeaders(true),
            body: JSON.stringify({
                mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: key, arquivo: file.name,
                ignorar_sabado: _cfIgnSab, ignorar_domingo: _cfIgnDom,
                grid: enviar, posicoes_originais: posicoes, cabecalho_original: grid[0],
            }),
        });
        const d = await res.json();
        input.value = "";
        if (!res.ok) {
            status.innerHTML = `<div class="cft-erro">${_cfEsc(d.error || "Erro ao enviar.")}
                ${d.cabecalho_encontrado ? `<div class="cft-ajuda" style="margin-top:8px">Colunas que o arquivo tem:</div>
                <div class="cft-pend-tags">${d.cabecalho_encontrado.map(h => `<span class="cft-tag">${_cfEsc(h)}</span>`).join("")}</div>` : ""}</div>`;
            return;
        }
        if (key !== _cfTranspAtual) return;
        status.innerHTML = `<div style="color:#22c55e;font-size:13px">✓ ${d.resumo.total.toLocaleString("pt-BR")} pacotes tratados e gravados.</div>`;
        _cfAtualizarCards();
        _cfCarregarDetalhe();
    } catch (err) {
        status.innerHTML = `<div class="cft-erro">${_cfEsc(err.message)}</div>`;
        input.value = "";
    }
}

// Mesma normalização do backend (nomes-padrao/normalizacao.chave): sem acento/caixa/espaço extra.
function _cfChave(v) {
    return String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Relatório da Shopee tem dezenas de colunas × dezenas de milhares de linhas — manda só
// as colunas que o backend sabe ler. "#S" na lista é coluna pela letra; a posição original
// de cada coluna vai junto (posicoes) pro backend saber qual era a S.
function _cfSoColunasUteis(grid, aceitas) {
    const set = new Set(aceitas.filter(a => !/^#/.test(a)).map(_cfChave));
    const letras = new Set(aceitas.filter(a => /^#[A-Za-z]{1,3}$/.test(a)).map(a => _cfLetraParaIndice(a.slice(1))));
    const posicoes = grid[0].map((h, i) => set.has(_cfChave(h)) || letras.has(i) ? i : -1).filter(i => i >= 0);
    return { grid: grid.map(row => posicoes.map(i => row[i] ?? "")), posicoes };
}

function _cfLetraParaIndice(letras) {
    let n = 0;
    for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

// Data de célula do Excel vira "AAAA-MM-DD HH:MM:SS" (sem ambiguidade dia/mês); o resto
// vai como o texto que aparece na célula (código numérico grande não perde dígito).
function _cfLerGrid(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                let wb;
                if (file.name.toLowerCase().endsWith(".csv")) {
                    let text = new TextDecoder("utf-8").decode(data);
                    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(data);
                    // raw: texto puro, sem o SheetJS tentar ler "01/10/2026" como data americana.
                    wb = XLSX.read(text, { type: "string", raw: true });
                } else {
                    wb = XLSX.read(data, { type: "array", cellDates: true });
                }
                const ws = wb.Sheets[wb.SheetNames[0]];
                const crus = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
                const txt = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
                const p2 = n => String(n).padStart(2, "0");
                resolve(crus.map((row, i) => row.map((v, j) => {
                    if (v instanceof Date) {
                        // SheetJS monta a data no fuso local; arredonda pro segundo (vem com ms de sobra).
                        const d = new Date(Math.round(v.getTime() / 1000) * 1000);
                        return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
                    }
                    const t = txt[i] && txt[i][j];
                    return t !== undefined && t !== "" ? String(t) : String(v ?? "");
                })));
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}
