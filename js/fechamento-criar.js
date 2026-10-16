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
let _cfRegras     = null; // quadro de regras de prazo em edição: [{escopo, t: {chave: {sab, dom}}}]
let _cfPolos      = [];
let _cfNomesPend  = []; // [{nome, qtd, feito}] — nomes sem conversão do lote aberto (tags clicáveis)
let _cfEntregadores = null; // {nomes, aviso} — Dados entregadores + Conversão de nomes, lido 1x por tela
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
            const quando = new Date(d.lote.recalculado_em || d.lote.enviado_em);
            document.getElementById("cf-painel-arquivo").innerText =
                `${d.lote.arquivo || "relatório"} · ${d.lote.recalculado_em ? "recalculado" : "enviado"} em ${quando.toLocaleString("pt-BR")}`;
        } else {
            document.getElementById("cf-painel-arquivo").innerText = "";
        }
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
    _cfNomesPend = r.nomes_sem_conversao.map(x => ({ ...x, feito: null }));
    if (r.nomes_sem_conversao.length) grupos.push(`<div class="cft-pend-grupo"><b>Usuário sem conversão de nome</b> — clique no nome pra dizer quem é o entregador:<div class="cft-pend-tags" id="cf-nomes-pend">${_cfHtmlNomesPend()}</div></div>`);
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

function _cfHtmlNomesPend() {
    return _cfNomesPend.map((x, i) => x.feito
        ? `<span class="cft-tag cft-tag-ok" title="${_cfEsc(x.nome)} → ${_cfEsc(x.feito)}">${_cfEsc(x.nome)}<span>→ ${_cfEsc(x.feito)}</span></span>`
        : `<button class="cft-tag cft-tag-btn" onclick="_cfAbrirConversao(${i})">${_cfEsc(x.nome)} <b>${x.qtd}</b></button>`
    ).join("");
}

// ── Card de conversão de nome: nome do relatório → entregador responsável. Grava na
// Conversão de nomes (POST /admin/nomes-padrao), a mesma lista de Cadastros › Usuários.
function _cfAbrirConversao(i) {
    const item = _cfNomesPend[i];
    if (!item) return;
    _cfFecharConversao();
    const ov = document.createElement("div");
    ov.className = "cft-modal-overlay";
    ov.id = "cf-conv";
    // Sugestão inicial: a primeira parte do usuário ("kauane.maciel" → "kauane").
    const palpite = String(item.nome).split(/[.\s_-]+/).filter(Boolean)[0] || item.nome;
    ov.innerHTML = `
        <div class="cft-modal">
            <div class="cft-modal-titulo">Quem é o entregador?</div>
            <div class="cft-ajuda" style="margin-bottom:12px">No relatório aparece <b style="color:#e2e8f0">${_cfEsc(item.nome)}</b>
                — ${item.qtd.toLocaleString("pt-BR")} pacote${item.qtd !== 1 ? "s" : ""}.</div>
            <div class="cft-cidades" id="cf-conv-cidades-rel"></div>
            <div style="display:flex;justify-content:space-between;align-items:baseline">
                <label class="cft-rotulo" for="cf-conv-input">Entregador responsável</label>
                <span class="cft-ajuda" id="cf-conv-total"></span>
            </div>
            <input id="cf-conv-input" class="cft-input" autocomplete="off" placeholder="Digite pra buscar..." value="${_cfEsc(palpite)}"
                oninput="_cfBuscarEntregador(this.value)" onkeydown="if(event.key==='Enter')_cfSalvarConversao(${i})">
            <div class="cft-sugestoes" id="cf-conv-sugestoes"></div>
            <div class="cft-novo" id="cf-conv-novo">
                <span class="cft-ajuda">Não achou?</span>
                <button class="cft-link" onclick="_cfAbrirNovoEntregador()">Cadastrar novo entregador</button>
            </div>
            <div class="cft-cidades" id="cf-conv-cidades-ent"></div>
            <div class="cft-ajuda" id="cf-conv-status" style="min-height:18px;margin-top:8px"></div>
            <div class="cft-barra" style="justify-content:flex-end;margin-bottom:0">
                <button class="cft-btn" onclick="_cfFecharConversao()">Cancelar</button>
                <button class="cft-btn primario" id="cf-conv-salvar" onclick="_cfSalvarConversao(${i})">Salvar</button>
            </div>
        </div>`;
    ov.addEventListener("click", e => { if (e.target === ov) _cfFecharConversao(); });
    document.body.appendChild(ov);
    const inp = document.getElementById("cf-conv-input");
    inp.focus(); inp.select();
    _cfBuscarEntregador(palpite);
    _cfMostrarCidades("cf-conv-cidades-rel", `${_CF_API()}/cidades?${_cfQs({ transportadora: _cfTranspAtual, usuario: item.nome })}`,
        `Cidades de <b>${_cfEsc(item.nome)}</b> neste relatório`, "Sem cidade neste relatório.");
}

// Cidades (com quantos pacotes) — pra reconhecer quem é quem pelo lugar que atende.
function _cfMostrarCidades(id, url, titulo, vazio) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.url = url;
    el.innerHTML = `<div class="cft-ajuda">${titulo}: carregando...</div>`;
    fetch(url, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (el.dataset.url !== url) return; // clicou em outro enquanto carregava
        const cidades = d.cidades || [];
        el.innerHTML = `<div class="cft-ajuda">${titulo}:</div>` + (cidades.length
            ? `<div class="cft-pend-tags">${cidades.map(c => `<span class="cft-tag">${_cfEsc(c.cidade)} <b>${c.qtd.toLocaleString("pt-BR")}</b></span>`).join("")}</div>`
            : `<div class="cft-ajuda" style="font-style:italic">${vazio}</div>`);
    }).catch(() => { if (el.dataset.url === url) el.innerHTML = `<div class="cft-erro">Erro ao carregar cidades.</div>`; });
}

function _cfFecharConversao() {
    const ov = document.getElementById("cf-conv");
    if (ov) ov.remove();
}

// Lista inteira vem uma vez (planilha Dados entregadores + Conversão de nomes) e o filtro
// é local — digitar não fica esperando o Google a cada letra.
function _cfBuscarEntregador(q) {
    const el = document.getElementById("cf-conv-sugestoes");
    if (!el) return;
    // Digitou de novo: as cidades do entregador escolhido antes não valem mais.
    const ent = document.getElementById("cf-conv-cidades-ent");
    if (ent) { ent.innerHTML = ""; ent.dataset.url = ""; }
    if (!_cfEntregadores) {
        el.innerHTML = `<div class="cft-ajuda" style="padding:6px 2px">Carregando entregadores...</div>`;
        fetch(`${_CF_API()}/entregadores`, { headers: _cfHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.error) throw new Error(d.error);
            _cfEntregadores = { nomes: d.nomes || [], aviso: d.aviso || null };
            const atual = document.getElementById("cf-conv-input");
            if (atual) _cfBuscarEntregador(atual.value);
        }).catch(err => { el.innerHTML = `<div class="cft-erro">${_cfEsc(err.message || "Erro ao carregar entregadores.")}</div>`; });
        return;
    }
    const termo = _cfChave(q);
    // Começa com o termo primeiro, depois quem só contém; vazio mostra todo mundo.
    const todos = _cfEntregadores.nomes;
    const comeca = [], contem = [];
    for (const n of todos) {
        const k = _cfChave(n);
        if (!termo || k.startsWith(termo)) comeca.push(n);
        else if (k.includes(termo)) contem.push(n);
    }
    const lista = comeca.concat(contem);
    const aviso = _cfEntregadores.aviso ? `<div class="cft-erro" style="font-size:12px;padding:4px 2px">${_cfEsc(_cfEntregadores.aviso)}</div>` : "";
    el.innerHTML = aviso + (lista.length
        ? lista.slice(0, 200).map(n => `<button class="cft-sugestao" data-nome="${_cfEsc(n)}" onclick="_cfEscolherEntregador(this.dataset.nome)">${_cfEsc(n)}</button>`).join("")
          + (lista.length > 200 ? `<div class="cft-ajuda" style="padding:6px 2px">+${lista.length - 200} — digite mais pra filtrar.</div>` : "")
        : `<div class="cft-ajuda" style="padding:6px 2px">Ninguém com esse nome nos Dados entregadores — salvar cria um nome novo.</div>`);
    const cont = document.getElementById("cf-conv-total");
    if (cont) cont.innerText = `${lista.length} de ${todos.length} entregadores`;
}

// Cadastro de entregador novo pela própria tela: grava na aba "Solicitação de usuários"
// da planilha Dados entregadores (mesmo "Inserir Entregador" do Planejamento).
function _cfAbrirNovoEntregador() {
    const el = document.getElementById("cf-conv-novo");
    const digitado = (document.getElementById("cf-conv-input").value || "").trim();
    el.innerHTML = `
        <label class="cft-rotulo" for="cf-novo-nome">Novo entregador</label>
        <input id="cf-novo-nome" class="cft-input" autocomplete="off" placeholder="Nome Sobrenome - Cidade" value="${_cfEsc(digitado)}"
            onkeydown="if(event.key==='Enter')_cfCadastrarEntregador()">
        <div class="cft-ajuda" style="margin-top:6px">Modelo: <b style="color:#cbd5e1">Nome Sobrenome - Cidade</b>. Vai pra aba Solicitação de usuários dos Dados entregadores.</div>
        <div class="cft-barra" style="margin:8px 0 0">
            <button class="cft-btn" id="cf-novo-btn" onclick="_cfCadastrarEntregador()">Cadastrar</button>
            <span class="cft-ajuda" id="cf-novo-status"></span>
        </div>`;
    const inp = document.getElementById("cf-novo-nome");
    inp.focus();
}

function _cfCadastrarEntregador() {
    const nome = document.getElementById("cf-novo-nome").value.trim();
    const btn = document.getElementById("cf-novo-btn");
    const status = document.getElementById("cf-novo-status");
    if (!nome) { status.innerText = "Digite o nome."; return; }
    btn.disabled = true;
    status.innerText = "Cadastrando...";
    fetch(`${_CF_API()}/entregadores`, { method: "POST", headers: _cfHeaders(true), body: JSON.stringify({ nome }) })
    .then(async r => {
        const d = await r.json().catch(() => ({}));
        btn.disabled = false;
        if (!r.ok) { status.innerText = d.error || "Erro ao cadastrar."; return; }
        if (_cfEntregadores && !_cfEntregadores.nomes.includes(d.nome)) {
            _cfEntregadores.nomes.push(d.nome);
            _cfEntregadores.nomes.sort((a, b) => a.localeCompare(b, "pt-BR"));
        }
        const novo = document.getElementById("cf-conv-novo");
        novo.innerHTML = `<span class="cft-ajuda">${_cfEsc(d.nome)} cadastrado nos Dados entregadores. Clique em Salvar pra ligar ao nome do relatório.</span>`;
        _cfEscolherEntregador(d.nome);
    }).catch(() => { btn.disabled = false; status.innerText = "Erro ao cadastrar."; });
}

function _cfEscolherEntregador(nome) {
    const inp = document.getElementById("cf-conv-input");
    inp.value = nome;
    document.getElementById("cf-conv-sugestoes").innerHTML = "";
    inp.focus();
    _cfMostrarCidades("cf-conv-cidades-ent", `${_CF_API()}/cidades?driver=${encodeURIComponent(nome)}`,
        `Cidades que <b>${_cfEsc(nome)}</b> já fez nos fechamentos`, "Ainda não aparece em nenhum fechamento gravado.");
}

function _cfSalvarConversao(i) {
    const item = _cfNomesPend[i];
    const nome = document.getElementById("cf-conv-input").value.trim();
    const status = document.getElementById("cf-conv-status");
    const btn = document.getElementById("cf-conv-salvar");
    if (!nome) { status.innerText = "Escolha o entregador."; return; }
    btn.disabled = true;
    status.innerText = "Salvando...";
    fetch(`${API}/admin/nomes-padrao`, {
        method: "POST", headers: _cfHeaders(true),
        body: JSON.stringify({ nome_origem: item.nome, nome_sistema: nome }),
    }).then(async r => {
        const d = await r.json().catch(() => ({}));
        // 409 = esse par já estava cadastrado: pro que a pessoa quer, é a mesma coisa que salvar.
        if (!r.ok && r.status !== 409) {
            btn.disabled = false;
            status.innerText = r.status === 403 ? "Só quem é dev pode mexer na Conversão de nomes." : (d.error || "Erro ao salvar.");
            return;
        }
        item.feito = nome;
        _cfFecharConversao();
        const lista = document.getElementById("cf-nomes-pend");
        if (lista) lista.innerHTML = _cfHtmlNomesPend();
        const st = document.getElementById("cf-acao-status");
        if (st) st.innerText = "Conversão salva — clique em Recalcular pra aplicar nos pacotes.";
    }).catch(() => { btn.disabled = false; status.innerText = "Erro ao salvar."; });
}

function _cfHtmlAcoes() {
    return `
        <div class="cft-barra">
            <button class="cft-btn" id="cf-btn-recalcular" onclick="_cfRecalcular()">Recalcular</button>
            <button class="cft-btn" onclick="_cfExportar(this)">Baixar relatório tratado</button>
            <button class="cft-btn perigo" onclick="_cfExcluir()">Excluir relatório</button>
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

function _cfRecalcular() {
    const key = _cfTranspAtual;
    const btn = document.getElementById("cf-btn-recalcular");
    const status = document.getElementById("cf-acao-status");
    if (btn) btn.disabled = true;
    if (status) status.innerText = "Recalculando (relendo planilha de precificação, conversão de nomes e regras de prazo)...";
    fetch(`${_CF_API()}/recalcular`, {
        method: "POST", headers: _cfHeaders(true),
        body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: key }),
    }).then(r => r.json())
    .then(d => {
        if (key !== _cfTranspAtual) return;
        if (d.error) { if (status) status.innerText = d.error; if (btn) btn.disabled = false; return; }
        _cfAtualizarCards();
        _cfCarregarDetalhe();
    }).catch(() => {
        if (btn) btn.disabled = false;
        if (status) status.innerText = "Erro ao recalcular.";
    });
}

// ── Regras de prazo: quais transportadoras não contam sábado/domingo, geral e por polo.
// A regra do polo SOMA à geral (ver modules/fechamento-transportadoras/regras-prazo.js).
function _cfAbrirRegras() {
    const el = document.getElementById("cf-regras");
    if (el.style.display !== "none") { el.style.display = "none"; return; }
    el.style.display = "";
    el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CF_API()}/regras-prazo`, { headers: _cfHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cfEsc(d.error)}</div>`; return; }
        _cfPolos = d.polos || [];
        const linhas = [{ escopo: "geral", t: {} }];
        for (const r of d.regras || []) {
            let l = linhas.find(x => _cfChave(x.escopo) === _cfChave(r.escopo));
            if (!l) { l = { escopo: r.escopo, t: {} }; linhas.push(l); }
            l.t[r.transportadora] = { sab: !!r.ignorar_sabado, dom: !!r.ignorar_domingo };
        }
        _cfRegras = linhas;
        _cfRenderRegras();
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar as regras.</div>`; });
}

function _cfRenderRegras(msg) {
    const el = document.getElementById("cf-regras");
    const celula = (i, key, dia, rot) => {
        const on = !!((_cfRegras[i].t[key] || {})[dia]);
        return `<button class="cft-chip cft-chip-mini${on ? " on" : ""}" title="${on ? "Não conta" : "Conta"} ${rot === "Sáb" ? "sábado" : "domingo"}"
            onclick="_cfAlternarRegra(${i}, '${key}', '${dia}')">${rot}</button>`;
    };
    const usados = new Set(_cfRegras.map(l => _cfChave(l.escopo)));
    const sugestoes = _cfPolos.filter(p => !usados.has(_cfChave(p)));
    el.innerHTML = `
        <div class="cft-ajuda" style="margin-bottom:10px">Marcado = <b>não conta</b> aquele dia no prazo (cada dia desses que cair no prazo soma +1 dia).
            A linha de um polo soma à Geral pros pacotes daquele polo (o polo vem da planilha de precificação).</div>
        <div class="cft-tabela-wrap"><table class="cft-tabela cft-regras-tabela">
            <thead><tr><th>Vale para</th>${_CF_TRANSPORTADORAS.map(t => `<th>${t.label}</th>`).join("")}<th></th></tr></thead>
            <tbody>${_cfRegras.map((l, i) => `<tr>
                <td><strong>${l.escopo === "geral" ? "Geral (todos os polos)" : "Polo " + _cfEsc(l.escopo)}</strong></td>
                ${_CF_TRANSPORTADORAS.map(t => `<td>${celula(i, t.key, "sab", "Sáb")} ${celula(i, t.key, "dom", "Dom")}</td>`).join("")}
                <td>${l.escopo === "geral" ? "" : `<button class="cft-chip cft-chip-mini" onclick="_cfRemoverPolo(${i})">Remover</button>`}</td>
            </tr>`).join("")}</tbody>
        </table></div>
        <div class="cft-barra">
            <input list="cf-polos-lista" id="cf-novo-polo" class="fech-select" placeholder="Polo (ex.: Joaçaba)" style="min-width:200px">
            <datalist id="cf-polos-lista">${sugestoes.map(p => `<option value="${_cfEsc(p)}">`).join("")}</datalist>
            <button class="cft-btn" onclick="_cfAdicionarPolo()">+ Regra para polo</button>
            <span style="flex:1"></span>
            <button class="cft-btn primario" id="cf-regras-salvar" onclick="_cfSalvarRegras()">Salvar${_cfQuinzena ? " e recalcular a quinzena" : ""}</button>
        </div>
        <div class="cft-ajuda" id="cf-regras-status">${msg || ""}</div>`;
}

function _cfAlternarRegra(i, key, dia) {
    const t = _cfRegras[i].t;
    t[key] = t[key] || { sab: false, dom: false };
    t[key][dia] = !t[key][dia];
    _cfRenderRegras();
}

function _cfAdicionarPolo() {
    const nome = document.getElementById("cf-novo-polo").value.trim();
    if (!nome) return;
    if (_cfChave(nome) === "geral" || _cfRegras.some(l => _cfChave(l.escopo) === _cfChave(nome))) {
        _cfRenderRegras("Esse polo já está na lista.");
        return;
    }
    _cfRegras.push({ escopo: nome, t: {} });
    _cfRenderRegras();
}

function _cfRemoverPolo(i) {
    _cfRegras.splice(i, 1);
    _cfRenderRegras();
}

async function _cfSalvarRegras() {
    const btn = document.getElementById("cf-regras-salvar");
    const status = document.getElementById("cf-regras-status");
    const regras = [];
    for (const l of _cfRegras) {
        for (const [key, v] of Object.entries(l.t)) {
            if (v.sab || v.dom) regras.push({ escopo: l.escopo, transportadora: key, ignorar_sabado: v.sab, ignorar_domingo: v.dom });
        }
    }
    btn.disabled = true;
    status.innerText = "Salvando...";
    try {
        const r = await fetch(`${_CF_API()}/regras-prazo`, { method: "PUT", headers: _cfHeaders(true), body: JSON.stringify({ regras }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro ao salvar.");
        // Regra nova só vale pro que for (re)calculado: recalcula o que já subiu nesta quinzena.
        const lotes = _cfQuinzena ? _cfResumo.map(x => x.chave).filter(Boolean) : [];
        const falhas = [];
        for (let i = 0; i < lotes.length; i++) {
            status.innerText = `Salvo. Recalculando ${i + 1} de ${lotes.length}...`;
            const rr = await fetch(`${_CF_API()}/recalcular`, {
                method: "POST", headers: _cfHeaders(true),
                body: JSON.stringify({ mes: _cfMes, ano: _cfAno, quinzena: _cfQuinzena, transportadora: lotes[i] }),
            });
            if (!rr.ok) falhas.push(_CF_TRANSPORTADORAS.find(t => t.key === lotes[i])?.label || lotes[i]);
        }
        btn.disabled = false;
        status.innerText = falhas.length ? `Salvo, mas não consegui recalcular: ${falhas.join(", ")}.`
            : lotes.length ? "Salvo e recalculado." : "Salvo. Vale pros próximos relatórios e recálculos.";
        if (lotes.length) { _cfAtualizarCards(); if (_cfTranspAtual) _cfCarregarDetalhe(); }
    } catch (err) {
        btn.disabled = false;
        status.innerText = err.message;
    }
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
        status.innerHTML = `<div class="cft-ajuda" style="font-size:13px;color:#cbd5e1">${d.resumo.total.toLocaleString("pt-BR")} pacotes tratados e gravados.</div>`;
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
