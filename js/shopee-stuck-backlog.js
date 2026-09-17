// ───── SHOPEE → STUCK → BACKLOG ─────
//
// Outro retrato da mesma base do Stuck, mas que sobe de um arquivo (Shipment
// ID + LM Hub Days) em vez de vir da planilha da Shopee — não mexe nela, nem
// lê nada de lá. Só entra pedido com 1 dia ou mais parado: 0.99 é "quase um
// dia" e fica de fora.
//
// O histórico do pedido reaproveita o modal e a busca que o Stuck já tem
// (_sstAbrirHistorico, em shopee-stuck.js) — é o mesmo rastro no sistema
// inteiro, e duas implementações do mesmo histórico só divergiriam depois.

let _sstbRegistros = [];
let _sstbFiltro = "";
let _sstbArquivo = null;    // { nome, linhas } lido e aguardando envio
let _sstbEnviando = false;

// Filtro de coluna (estilo planilha) do Status e do Último usuário. `null`
// quer dizer "sem filtro" (tudo visível) — igual o Google Sheets, que trata
// "tudo marcado" como equivalente a não filtrar.
let _sstbStatusSel = null;
let _sstbUsuarioSel = null;
let _sstbOrdStatus = null;   // "asc" | "desc" | null
let _sstbOrdUsuario = null;

// Filtro por faixa de dias parado — clicar num card filtra a tabela por
// aquela faixa (em vez de abrir uma lista à parte). `null` é "todas".
let _sstbDiasSel = null;

function _sstbEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function abrirShopeeStuckBacklog(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-shopee-stuck-backlog", "Shopee/Stuck/Backlog");
    document.getElementById("sstb-busca").value = "";
    _sstbFiltro = "";
    _sstbStatusSel = null;
    _sstbUsuarioSel = null;
    _sstbOrdStatus = null;
    _sstbOrdUsuario = null;
    _sstbDiasSel = null;
    document.getElementById("sstb-th-status")?.classList.remove("ativo");
    document.getElementById("sstb-th-usuario")?.classList.remove("ativo");
    _sstbCarregar();
}

function _sstbCarregar() {
    const empty = document.getElementById("sstb-empty");
    const wrap  = document.getElementById("sstb-conteudo");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    wrap.style.display = "none";

    fetch(`${API}/shopee/stuck/backlog`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(b => ({ ok: r.ok, b })))
        .then(({ ok, b }) => {
            if (!ok) { skFim(empty, b.error || "Erro ao carregar o backlog."); return; }
            if (b.sem_estacao) {
                skFim(empty, "Seu polo não opera Shopee, então não há Backlog para mostrar.");
                return;
            }
            _sstbRegistros = b.registros || [];
            document.getElementById("sstb-estacao").innerText = b.estacao || "—";
            _sstbPintarMeta(b);
            if (!_sstbRegistros.length) {
                skFim(empty, 'Nenhum arquivo enviado ainda para esta base. Use "Enviar arquivo" para começar.');
                return;
            }
            empty.style.display = "none";
            wrap.style.display = "";
            _sstbRenderizar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _sstbPintarMeta(b) {
    const el = document.getElementById("sstb-atualizado");
    if (!b || !b.importado_em) { el.innerText = "nenhum arquivo enviado"; return; }
    const d = new Date(b.importado_em);
    el.innerText = `atualizado ${d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${
        b.importado_por ? " · " + b.importado_por : ""}`;
}

function _sstbFiltrar() {
    _sstbFiltro = document.getElementById("sstb-busca").value;
    _sstbRenderizar();
}

// Busca por texto + os filtros de coluna, combinados (E lógico) — e a
// ordenação de qualquer um dos dois, se estiver ativa. É esta lista (já
// filtrada) que alimenta a tabela: filtrar por status/usuário/dias recorta
// tudo junto, não só a tabela.
//
// `semFiltroDias` existe pra alimentar os CARDS e o gráfico de dias parado:
// eles têm que continuar mostrando as 6 faixas inteiras (só recortadas por
// status/usuário/busca) mesmo com um card já selecionado — senão, ao clicar
// em "3 dias", as outras faixas zerariam e a visão geral desapareceria.
function _sstbVisiveis(opts) {
    const semFiltroDias = opts && opts.semFiltroDias;
    const termo = String(_sstbFiltro || "").trim().toLowerCase();
    let lista = _sstbRegistros;
    if (termo) lista = lista.filter(r => String(r.shipment_id || "").toLowerCase().includes(termo));
    if (_sstbStatusSel) lista = lista.filter(r => _sstbStatusSel.has(String(r.latest_status || "").trim()));
    if (_sstbUsuarioSel) lista = lista.filter(r => _sstbUsuarioSel.has(String(r.latest_user_name || "").trim()));
    if (!semFiltroDias && _sstbDiasSel) lista = lista.filter(r => _sstbDiasSel.has(_sstbFaixaDe(r.dias).chave));
    if (_sstbOrdStatus) lista = [...lista].sort((a, b) => colfCompara(a.latest_status, b.latest_status, _sstbOrdStatus));
    else if (_sstbOrdUsuario) lista = [...lista].sort((a, b) => colfCompara(a.latest_user_name, b.latest_user_name, _sstbOrdUsuario));
    return lista;
}

// Clicar num card filtra a tabela por aquela faixa; clicar de novo no MESMO
// card (já sozinho selecionado) limpa o filtro — é o padrão de "clicar pra
// recortar, clicar de novo pra voltar" que o resto do sistema já usa.
function _sstbClicarFaixa(chave) {
    const jaEraSoEssa = _sstbDiasSel && _sstbDiasSel.size === 1 && _sstbDiasSel.has(chave);
    _sstbDiasSel = jaEraSoEssa ? null : new Set([chave]);
    _sstbRenderizar();
}

function _sstbAbrirFiltroStatus(btn) {
    colfAbrir(btn, {
        valores: _sstbRegistros.map(r => r.latest_status || ""),
        selecionados: _sstbStatusSel,
        ordenar: { atual: _sstbOrdStatus },
        aoAplicar: (sel, ordem) => {
            _sstbStatusSel = sel;
            _sstbOrdStatus = ordem;
            if (ordem) _sstbOrdUsuario = null; // só uma ordenação ativa por vez
            btn.classList.toggle("ativo", !!sel);
            _sstbRenderizar();
        },
    });
}

function _sstbAbrirFiltroUsuario(btn) {
    colfAbrir(btn, {
        valores: _sstbRegistros.map(r => r.latest_user_name || ""),
        selecionados: _sstbUsuarioSel,
        ordenar: { atual: _sstbOrdUsuario },
        aoAplicar: (sel, ordem) => {
            _sstbUsuarioSel = sel;
            _sstbOrdUsuario = ordem;
            if (ordem) _sstbOrdStatus = null;
            btn.classList.toggle("ativo", !!sel);
            _sstbRenderizar();
        },
    });
}

// ── Faixas de dias parado ──
// Sempre 1 dia ou mais (o filtro do envio já garante isso), então sem "no
// prazo" nenhum — só a escala de gravidade, num hue só, igual o Na Rua faz.
// Uma faixa por dia até 5, e só a partir daí abre "6 dias +": individualizar
// pra sempre deixaria a última faixa cada vez mais rara de acontecer, e o
// resto do backlog (que é a maioria) sem nenhuma granularidade.
const SSTB_FAIXAS = [
    { chave: "d1", rotulo: "1 dia",     min: 1, max: 1 },
    { chave: "d2", rotulo: "2 dias",    min: 2, max: 2 },
    { chave: "d3", rotulo: "3 dias",    min: 3, max: 3 },
    { chave: "d4", rotulo: "4 dias",    min: 4, max: 4 },
    { chave: "d5", rotulo: "5 dias",    min: 5, max: 5 },
    { chave: "d6", rotulo: "6 dias +",  min: 6, max: Infinity },
];
// Mesmo hue do Na Rua (NR_RAMPAS.shopee), esticado pra 6 degraus: mais claro
// é mais grave — num fundo escuro, é o claro que chama atenção primeiro.
const SSTB_CORES = {
    d1: "#833600", d2: "#9c4200", d3: "#ab4a00", d4: "#d26218", d5: "#e08c60", d6: "#f0b088",
};

function _sstbFaixaDe(dias) {
    const inteiro = Math.floor(dias);
    return SSTB_FAIXAS.find(f => inteiro >= f.min && inteiro <= f.max) || SSTB_FAIXAS[SSTB_FAIXAS.length - 1];
}

// "2 dias parado" mostra o inteiro, não o LM Hub Days cru: 10.15 é "10 dias",
// não "10.15 dias" — é assim que a Loggi mostra dias na tela de Na Rua.
function _sstbFormatarDias(dias) {
    const inteiro = Math.floor(dias);
    return `${inteiro} dia${inteiro !== 1 ? "s" : ""}`;
}

function _sstbRenderizar() {
    const lista = _sstbVisiveis();                          // tabela e contador (com o filtro de dias)
    const listaTiles = _sstbVisiveis({ semFiltroDias: true }); // cards e gráfico (sem o próprio filtro de dias)

    document.getElementById("sstb-contador").innerText = lista.length === _sstbRegistros.length
        ? `${_sstbRegistros.length} pedido${_sstbRegistros.length !== 1 ? "s" : ""} no backlog`
        : `${lista.length} de ${_sstbRegistros.length}`;

    const porFaixa = Object.fromEntries(SSTB_FAIXAS.map(f => [f.chave, 0]));
    listaTiles.forEach(r => { porFaixa[_sstbFaixaDe(r.dias).chave]++; });

    // O card FILTRA a tabela por aquela faixa (não abre mais uma lista à
    // parte) — fica marcado enquanto o filtro dele estiver ativo.
    document.getElementById("sstb-tiles").innerHTML = SSTB_FAIXAS.map(f => {
        const ativa = _sstbDiasSel && _sstbDiasSel.has(f.chave);
        return `
        <div class="nr-tile nr-tile-click${ativa ? " nr-tile-selecionada" : ""}" onclick="_sstbClicarFaixa('${f.chave}')" title="Filtrar por ${f.rotulo.toLowerCase()} parado">
            <div class="nr-tile-label"><span class="nr-chip-cor" style="background:${SSTB_CORES[f.chave]}"></span>${f.rotulo}</div>
            <div class="nr-tile-valor">${porFaixa[f.chave].toLocaleString("pt-BR")}</div>
            <div class="nr-tile-sub">pedido${porFaixa[f.chave] !== 1 ? "s" : ""}</div>
        </div>`;
    }).join("");

    document.getElementById("sstb-tbody").innerHTML = lista.map(r => _sstbLinhaHtml(r)).join("");
    _sstbGraficar(listaTiles, lista, porFaixa);
}

function _sstbLinhaHtml(r) {
    const cor = SSTB_CORES[_sstbFaixaDe(r.dias).chave];
    return `
    <tr>
        <td data-label="Pedido" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;color:#e2e8f0">${_sstbEsc(r.shipment_id)}</td>
        <td data-label="Status">${_sstbEsc(r.latest_status) || "—"}</td>
        <td data-label="Dias parado" style="text-align:center"><i class="nr-pac-ponto" style="background:${cor}"></i>${_sstbFormatarDias(r.dias)}</td>
        <td data-label="Último usuário">${_sstbEsc(r.latest_user_name) || "—"}</td>
        <td data-label="Histórico">
            <button type="button" class="sst-hist-btn" onclick="_sstAbrirHistorico('${_sstbEsc(r.shipment_id)}')">Visualizar</button>
        </td>
    </tr>`;
}

// ── Gráficos ──
// Dois recortes que os cards e a tabela não respondem de relance:
//   1. o formato do backlog por tempo parado (mesma informação dos cards, em
//      barra — mais fácil de comparar 6 valores de uma vez do que 6 cards);
//   2. quem tem mais pedido parado com o recorte atual, pra saber com quem
//      cobrar primeiro.
const SSTB_EIXO  = { color: "#7b8ba3", font: { size: 11 } };
const SSTB_GRADE = { color: "rgba(255,255,255,0.055)", drawTicks: false };
const SSTB_GRAF_BASE = { responsive: true, maintainAspectRatio: false, animation: { duration: 220 } };
let _sstbGraficos = {};

function _sstbDestruirGraficos() {
    Object.values(_sstbGraficos).forEach(g => { try { g.destroy(); } catch (_) {} });
    _sstbGraficos = {};
}

// Nome comprido ("[3799071]MURILO BROL FERREIRA") vira só o essencial no
// eixo; o nome inteiro continua no tooltip.
function _sstbEncurtar(nome) {
    const t = String(nome || "").replace(/^\[\d+\]\s*/, "").trim();
    return t.length <= 20 ? t : t.slice(0, 19) + "…";
}

function _sstbGraficar(listaTiles, listaFiltrada, porFaixa) {
    _sstbDestruirGraficos();
    if (typeof Chart === "undefined") return;

    _sstbGraficos.dias = new Chart(document.getElementById("sstb-gr-dias"), {
        type: "bar",
        data: {
            labels: SSTB_FAIXAS.map(f => f.rotulo),
            datasets: [{
                data: SSTB_FAIXAS.map(f => porFaixa[f.chave]),
                backgroundColor: SSTB_FAIXAS.map(f => SSTB_CORES[f.chave]),
                borderRadius: { topLeft: 4, topRight: 4 },
                borderSkipped: "bottom",
                maxBarThickness: 34,
            }],
        },
        options: {
            ...SSTB_GRAF_BASE,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => c.parsed.y.toLocaleString("pt-BR") + " pedidos" } },
            },
            scales: {
                x: { ticks: SSTB_EIXO, grid: { display: false } },
                y: { ticks: SSTB_EIXO, grid: SSTB_GRADE, beginAtZero: true },
            },
        },
    });

    // Top usuários NA VISÃO ATUAL (com o filtro de dias, se houver um ativo):
    // filtrar por "6 dias +" e olhar este gráfico já responde "de quem é a
    // maior parte desse backlog velho".
    const porUsuario = new Map();
    listaFiltrada.forEach(r => {
        const nome = String(r.latest_user_name || "").trim();
        if (nome) porUsuario.set(nome, (porUsuario.get(nome) || 0) + 1);
    });
    const topUsuarios = [...porUsuario.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const vazio = document.getElementById("sstb-gr-usr-vazio");
    if (vazio) vazio.style.display = topUsuarios.length ? "none" : "";
    if (!topUsuarios.length) return;

    _sstbGraficos.usuarios = new Chart(document.getElementById("sstb-gr-usuarios"), {
        type: "bar",
        data: {
            labels: topUsuarios.map(([nome]) => _sstbEncurtar(nome)),
            datasets: [{
                data: topUsuarios.map(([, n]) => n),
                backgroundColor: "#F97316",
                borderRadius: { topRight: 4, bottomRight: 4 },
                borderSkipped: "left",
                maxBarThickness: 18,
            }],
        },
        options: {
            ...SSTB_GRAF_BASE, indexAxis: "y",
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                    title: c => topUsuarios[c[0].dataIndex][0],
                    label: c => c.parsed.x.toLocaleString("pt-BR") + " pedidos",
                } },
            },
            scales: {
                x: { ticks: SSTB_EIXO, grid: SSTB_GRADE, beginAtZero: true },
                y: { ticks: { ...SSTB_EIXO, autoSkip: false }, grid: { display: false } },
            },
        },
    });
}

// ── Envio do arquivo ──
// Colunas do arquivo, casadas pelo NOME normalizado — igual todo upload do
// sistema, pra não depender da ordem das colunas no export. Shipment ID e LM
// Hub Days são obrigatórias (sem elas não dá pra filtrar nem listar o
// pedido); Status e Último usuário são só contexto e entram em branco se o
// arquivo não trouxer.
const SSTB_COLUNAS = [
    { id: "shipment_id",      nomes: ["shipment id", "shipmentid", "shipment_id"], obrigatoria: true },
    { id: "lm_hub_days",      nomes: ["lm hub days", "lm_hub_days", "lm hub ageing days"], obrigatoria: true },
    { id: "latest_status",    nomes: ["latest status", "latest_status"], obrigatoria: false },
    { id: "latest_user_name", nomes: ["latest user name", "latest_user_name", "latest username"], obrigatoria: false },
];

const _sstbNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
                        .toLowerCase().replace(/\s+/g, " ").trim();

function _sstbNumero(v) {
    if (typeof v === "number") return v;
    const t = String(v ?? "").trim();
    if (!t) return NaN;
    // "10,15" (vírgula decimal) só quando não há ponto — arquivo já com ponto
    // (10.15) fica como está.
    const norm = (t.includes(",") && !t.includes(".")) ? t.replace(",", ".") : t;
    return Number(norm);
}

function _sstbAbrirUpload() {
    _sstbMsg("", null);
    _sstbArquivo = null;
    _sstbPintarPrevia();

    const area = document.getElementById("sstb-upload-area");
    area.ondragover  = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop      = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files && e.dataTransfer.files.length) _sstbLerArquivo(e.dataTransfer.files[0]);
    };
    _abrirModal("modal-sstb-upload");
}

function _sstbEscolherArquivo(input) {
    if (input.files && input.files.length) _sstbLerArquivo(input.files[0]);
    input.value = ""; // permite reenviar o mesmo arquivo sem recarregar a tela
}

function _sstbMsg(msg, tipo) {
    const el = document.getElementById("sstb-upload-erro");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.erro;
    el.style.cssText = `display:block;margin:12px 0;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

// Mesmo cuidado de encoding que o upload da Na Rua: um export salvo em
// Latin-1/Windows-1252 lido como UTF-8 vira "SHOPEE" com lixo no acento.
function _sstbDecodificar(buffer) {
    const bytes = new Uint8Array(buffer);
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    if (!/�/.test(utf8) && !/[ÃÂ][-¿]/.test(utf8)) return utf8;
    return new TextDecoder("windows-1252").decode(bytes);
}

function _sstbLerArquivo(file) {
    _sstbMsg("", null);
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const nome = file.name.toLowerCase();
            let grid;
            if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
                const wb = XLSX.read(_sstbDecodificar(e.target.result), { type: "string" });
                grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
            } else {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", raw: false });
                grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
            }
            const lido = _sstbMapear(grid);
            if (lido.erro) return _sstbMsg(_sstbEsc(lido.erro), "erro");
            if (!lido.dados.length) return _sstbMsg("Nenhuma linha com 1 dia ou mais parado nesse arquivo.", "erro");
            _sstbArquivo = { nome: file.name, linhas: lido.dados };
            if (lido.foraDoFiltro || lido.invalidas) {
                const partes = [];
                if (lido.foraDoFiltro) partes.push(`${lido.foraDoFiltro} com menos de 1 dia parado`);
                if (lido.invalidas) partes.push(`${lido.invalidas} sem pedido ou sem LM Hub Days válido`);
                _sstbMsg(`${lido.dados.length.toLocaleString("pt-BR")} linhas entram. Ficaram de fora: ${partes.join(" · ")}.`, "aviso");
            }
            _sstbPintarPrevia();
        } catch (err) {
            _sstbMsg(`Não consegui ler o arquivo: ${_sstbEsc(err.message)}`, "erro");
        }
    };
    reader.onerror = () => _sstbMsg("Falha ao abrir o arquivo.", "erro");
    reader.readAsArrayBuffer(file);
}

// Acha o cabeçalho nas 10 primeiras linhas e casa as colunas pelo nome
// normalizado — aceita o cabeçalho assim que as OBRIGATÓRIAS forem achadas,
// as opcionais entram se estiverem lá. O corte de "1 dia ou mais" já é
// aplicado aqui, na prévia — o servidor reaplica o mesmo corte na
// importação, não confia só no navegador.
function _sstbMapear(grid) {
    let cabIdx = -1, indices = null;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const cab = (grid[i] || []).map(_sstbNorm);
        const tentativa = {};
        for (const col of SSTB_COLUNAS) {
            const idx = cab.findIndex(c => col.nomes.includes(c));
            if (idx >= 0) tentativa[col.id] = idx;
        }
        const temObrigatorias = SSTB_COLUNAS.filter(c => c.obrigatoria).every(c => tentativa[c.id] !== undefined);
        if (temObrigatorias) { cabIdx = i; indices = tentativa; break; }
    }
    if (cabIdx < 0) {
        return { erro: "Não encontrei as colunas Shipment ID e LM Hub Days no arquivo." };
    }

    const dados = [];
    let foraDoFiltro = 0, invalidas = 0;
    for (let i = cabIdx + 1; i < grid.length; i++) {
        const linha = grid[i] || [];
        const shipment = String(linha[indices.shipment_id] ?? "").trim();
        const bruto = _sstbNumero(linha[indices.lm_hub_days]);
        if (!shipment && !Number.isFinite(bruto)) continue; // linha vazia no fim do arquivo
        if (!shipment || !Number.isFinite(bruto)) { invalidas++; continue; }
        const dias = Math.round(bruto * 100) / 100;
        if (dias < 1) { foraDoFiltro++; continue; }
        const status  = indices.latest_status    !== undefined ? String(linha[indices.latest_status] ?? "").trim() : "";
        const usuario = indices.latest_user_name !== undefined ? String(linha[indices.latest_user_name] ?? "").trim() : "";
        dados.push({ shipment_id: shipment, lm_hub_days: dias, latest_status: status, latest_user_name: usuario });
    }
    return { dados, foraDoFiltro, invalidas };
}

function _sstbPintarPrevia() {
    const el = document.getElementById("sstb-previa");
    const btn = document.getElementById("sstb-btn-enviar");
    if (!_sstbArquivo) {
        el.innerHTML = "";
        btn.style.display = "none";
        return;
    }
    const n = _sstbArquivo.linhas.length;
    const amostra = _sstbArquivo.linhas.slice(0, 8);

    el.innerHTML = `
        <div class="nr-previa-topo">
            <span class="ant-sol-title" style="border:none;padding:0;margin:0">
                Prévia · ${n.toLocaleString("pt-BR")} linha${n !== 1 ? "s" : ""} de ${_sstbEsc(_sstbArquivo.nome)}
            </span>
            <button type="button" class="usr-modal-btn-cancel" onclick="_sstbDescartar()">Descartar</button>
        </div>
        <table class="ant-hist-table">
            <thead><tr><th>Shipment ID</th><th>LM Hub Days</th><th>Latest Status</th><th>Latest User Name</th></tr></thead>
            <tbody>
                ${amostra.map(l => `
                <tr>
                    <td data-label="Shipment ID" style="font-family:monospace;font-size:11.5px">${_sstbEsc(l.shipment_id)}</td>
                    <td data-label="LM Hub Days">${_sstbFormatarDias(l.lm_hub_days)}</td>
                    <td data-label="Latest Status">${_sstbEsc(l.latest_status) || "—"}</td>
                    <td data-label="Latest User Name">${_sstbEsc(l.latest_user_name) || "—"}</td>
                </tr>`).join("")}
                ${n > amostra.length ? `<tr><td colspan="4" style="text-align:center;color:#8494a9;padding:12px">
                    + ${(n - amostra.length).toLocaleString("pt-BR")} linhas que não cabem na prévia</td></tr>` : ""}
            </tbody>
        </table>`;
    btn.style.display = "";
    btn.disabled = false;
    btn.textContent = `Enviar ${n.toLocaleString("pt-BR")} linha${n !== 1 ? "s" : ""}`;
}

function _sstbDescartar() {
    _sstbArquivo = null;
    _sstbMsg("", null);
    _sstbPintarPrevia();
}

function _sstbEnviar() {
    if (_sstbEnviando || !_sstbArquivo) return;
    const n = _sstbArquivo.linhas.length;
    // O envio SUBSTITUI o backlog anterior desta base — vale avisar antes, não depois.
    gcConfirm(
        `Enviar ${n.toLocaleString("pt-BR")} linhas como o backlog atual da sua base?\n\nIsso substitui o backlog anterior.`,
        () => {
            _sstbEnviando = true;
            const btn = document.getElementById("sstb-btn-enviar");
            btn.disabled = true;
            btn.textContent = "Enviando...";

            fetch(`${API}/shopee/stuck/backlog/importar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ linhas: _sstbArquivo.linhas })
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                _sstbEnviando = false;
                btn.disabled = false;
                if (!ok) {
                    btn.textContent = `Enviar ${n.toLocaleString("pt-BR")} linhas`;
                    return _sstbMsg(_sstbEsc(d.error) || "Não foi possível enviar.", "erro");
                }
                _fecharModal("modal-sstb-upload");
                _sstbCarregar();
            })
            .catch(() => {
                _sstbEnviando = false;
                btn.disabled = false;
                btn.textContent = `Enviar ${n.toLocaleString("pt-BR")} linhas`;
                _sstbMsg("Erro ao conectar com o servidor.", "erro");
            });
        },
        "Enviar arquivo",
        "Sim, enviar"
    );
}
