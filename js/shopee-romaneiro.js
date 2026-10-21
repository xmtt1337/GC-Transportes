// ───── SHOPEE → ALIMENTAR → ROMANEIRO SHOPEE ─────
// Envia as linhas do romaneiro de LH pro sistema. Cada envio acrescenta: não existe
// remover pela tela. Se um romaneiro vier errado, o conserto é mandar o certo por cima —
// apagar histórico de alimentação some com a prova do que já foi carregado.

// Colunas esperadas no arquivo. `nomes` são as grafias que já vimos: o arquivo vem da
// Shopee e o cabeçalho muda de acento e de caixa entre um relatório e outro.
const SHL_COLUNAS = [
    { id: "horario_entrega", label: "Horário de entrega", nomes: ["horario de entrega", "horário de entrega", "horario entrega"] },
    { id: "pedido_tn",       label: "Pedido (TN)",        nomes: ["pedido (tn)", "pedido tn", "pedido"] },
    { id: "origem",          label: "Origem",             nomes: ["origem"] },
    { id: "destino",         label: "Destino",            nomes: ["destino"] },
    { id: "numero_to",       label: "Número da TO",       nomes: ["numero da to", "número da to", "numero to", "nº da to", "no da to"] },
    { id: "rota_lh",         label: "Rota de LH",         nomes: ["rota de lh", "rota lh"] },
];

// Arquivos lidos e aguardando envio: [{ nome, linhas, faltando }]. A carga de um dia chega
// repartida em várias planilhas, então a tela acumula até a pessoa mandar tudo de uma vez.
let _shlArquivos = [];
let _shlEnviando = false;

const _shlTotalLinhas = () => _shlArquivos.reduce((s, a) => s + a.linhas.length, 0);

// Mesmo teto do servidor (LH_MAX_LINHAS). Vale pelo total do envio, não por arquivo.
const SHL_MAX_LINHAS = 20000;

function abrirShopeeRomaneiro(event) {
    if (event) event.preventDefault();
    _shlCancelar();
    mostrarTela("tela-shopee-romaneiro");
    _shlCarregarHistorico();

    // Arrastar os arquivos em cima do quadro também vale — é como o resto do sistema faz.
    const area = document.getElementById("shl-upload-area");
    area.ondragover  = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop      = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files && e.dataTransfer.files.length) _shlLerVarios(e.dataTransfer.files);
    };
}

const _shlNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
                        .toLowerCase().replace(/\s+/g, " ").trim();

function _shlEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _shlMsg(msg, tipo) {
    const el = document.getElementById("shl-erro");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.erro;
    el.style.cssText = `display:block;margin-bottom:16px;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

function _shlArquivo(input) {
    if (input.files && input.files.length) _shlLerVarios(input.files);
    input.value = ""; // permite reenviar o mesmo arquivo sem recarregar a tela
}

// Lê um atrás do outro e só então redesenha. Um arquivo com problema não derruba os outros:
// ele entra na lista de recusados e o resto segue — no meio de cinco planilhas, perder as
// quatro boas porque uma veio torta seria o pior desfecho possível.
async function _shlLerVarios(fileList) {
    _shlMsg("", null);
    const arquivos = Array.from(fileList);
    const recusados = [];
    const avisos = [];

    for (const file of arquivos) {
        document.getElementById("shl-sub").innerText = `Lendo ${file.name}...`;
        // Mesmo arquivo escolhido duas vezes viraria linha duplicada no romaneiro.
        if (_shlArquivos.some(a => a.nome === file.name)) {
            recusados.push(`${file.name} (já está na lista)`);
            continue;
        }
        try {
            const grid = await _shlLerGrid(file);
            const lidas = _shlMapear(grid);
            if (lidas.erro)            { recusados.push(`${file.name} (${lidas.erro})`); continue; }
            if (!lidas.dados.length)   { recusados.push(`${file.name} (nenhuma linha preenchida)`); continue; }
            if (lidas.faltando.length) avisos.push(`${file.name}: ${lidas.faltando.join(", ")}`);
            _shlArquivos.push({ nome: file.name, linhas: lidas.dados, faltando: lidas.faltando });
        } catch (err) {
            recusados.push(`${file.name} (${err.message})`);
        }
    }

    _shlRenderPrevia();
    const partes = [];
    if (_shlTotalLinhas() > SHL_MAX_LINHAS) {
        partes.push(`São <strong>${_shlTotalLinhas().toLocaleString("pt-BR")}</strong> linhas no total e o limite por envio é ${
            SHL_MAX_LINHAS.toLocaleString("pt-BR")}. Tire alguns arquivos e mande em duas vezes.`);
    }
    if (recusados.length) partes.push(`Não entraram: <strong>${_shlEsc(recusados.join(" · "))}</strong>.`);
    if (avisos.length)    partes.push(`Colunas não encontradas (entram em branco) — ${_shlEsc(avisos.join(" · "))}.`);
    if (partes.length)    _shlMsg(partes.join("<br>"), _shlArquivos.length ? "aviso" : "erro");
}

function _shlRemoverArquivo(indice) {
    _shlArquivos.splice(indice, 1);
    if (!_shlArquivos.length) return _shlCancelar();
    _shlRenderPrevia();
}

// Mesma leitura do Alimentar: XLSX resolve .xlsx e .csv, e o `raw:false` mantém hora e
// número como o arquivo mostra, em vez de virar número de série do Excel.
function _shlLerGrid(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = file.name.toLowerCase().endsWith(".csv")
                    ? XLSX.read(new TextDecoder("utf-8").decode(data), { type: "string" })
                    : XLSX.read(data, { type: "array", raw: false });
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("falha ao abrir o arquivo"));
        reader.readAsArrayBuffer(file);
    });
}

// Acha o cabeçalho e casa as colunas pelo nome. Procura nas primeiras linhas porque esses
// relatórios costumam vir com título ou linha em branco antes da tabela.
function _shlMapear(grid) {
    let cabIdx = -1, indices = null;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const cab = (grid[i] || []).map(_shlNorm);
        const tentativa = {};
        let achou = 0;
        for (const col of SHL_COLUNAS) {
            const idx = cab.findIndex(c => col.nomes.includes(c));
            if (idx >= 0) { tentativa[col.id] = idx; achou++; }
        }
        // Metade das colunas já identifica a linha do cabeçalho; o resto vira aviso.
        if (achou >= Math.ceil(SHL_COLUNAS.length / 2)) { cabIdx = i; indices = tentativa; break; }
    }
    if (cabIdx < 0) {
        return { erro: "Não encontrei o cabeçalho no arquivo. Ele precisa ter as colunas: " +
                       SHL_COLUNAS.map(c => c.label).join(", ") + "." };
    }

    const faltando = SHL_COLUNAS.filter(c => indices[c.id] === undefined).map(c => c.label);
    const dados = [];
    for (let i = cabIdx + 1; i < grid.length; i++) {
        const linha = grid[i] || [];
        const obj = {};
        for (const col of SHL_COLUNAS) {
            const idx = indices[col.id];
            obj[col.id] = idx === undefined ? "" : String(linha[idx] ?? "").trim();
        }
        // Linha vazia no fim do arquivo é comum — não vira registro.
        if (Object.values(obj).some(v => v)) dados.push(obj);
    }
    return { dados, faltando };
}

const _SHL_SUB_PADRAO = "Arraste os arquivos aqui ou clique para selecionar — pode escolher vários de uma vez (.xlsx, .xls ou .csv)";

function _shlRenderPrevia() {
    if (!_shlArquivos.length) return _shlCancelar();
    const n = _shlTotalLinhas();
    const qtd = _shlArquivos.length;
    document.getElementById("shl-previa-titulo").innerText =
        `Prévia · ${n} linha${n !== 1 ? "s" : ""} em ${qtd} arquivo${qtd !== 1 ? "s" : ""}`;
    document.getElementById("shl-sub").innerText = _SHL_SUB_PADRAO;

    // Um cartão por arquivo, com o que dá pra remover antes de enviar: quem junta cinco
    // planilhas precisa poder tirar a errada sem recomeçar a seleção inteira.
    document.getElementById("shl-arquivos").innerHTML = _shlArquivos.map((a, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);margin-bottom:8px">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3a86ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span style="flex:1;min-width:0;font-size:13px;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_shlEsc(a.nome)}</span>
            <span style="font-size:12.5px;color:#8494a9;font-variant-numeric:tabular-nums;flex:none">${a.linhas.length} linha${a.linhas.length !== 1 ? "s" : ""}</span>
            <button type="button" onclick="_shlRemoverArquivo(${i})" title="Tirar este arquivo"
                    style="flex:none;border:none;background:none;color:#8494a9;cursor:pointer;font-size:17px;line-height:1;padding:2px 4px;font-family:inherit">&times;</button>
        </div>`).join("");

    // Mostra as 20 primeiras do conjunto: a prévia é pra conferir se as colunas casaram,
    // não pra ler os arquivos inteiros. A coluna Arquivo diz de qual planilha é cada linha.
    const todas = _shlArquivos.flatMap(a => a.linhas.map(l => ({ ...l, _arq: a.nome })));
    const amostra = todas.slice(0, 20);
    document.getElementById("shl-previa-tbody").innerHTML = amostra.map(l => `
        <tr>${SHL_COLUNAS.map(c =>
            `<td data-label="${c.label}">${_shlEsc(l[c.id]) || '<span style="color:#717f95">—</span>'}</td>`).join("")}
           <td data-label="Arquivo" style="color:#8494a9;font-size:12px">${_shlEsc(l._arq)}</td></tr>
    `).join("") + (n > amostra.length
        ? `<tr><td colspan="${SHL_COLUNAS.length + 1}" style="text-align:center;color:#8494a9;padding:14px">
             + ${n - amostra.length} linha${n - amostra.length !== 1 ? "s" : ""} que não cabem na prévia</td></tr>`
        : "");

    document.getElementById("shl-previa").style.display = "";
    // Barra aqui em vez de deixar o servidor recusar: juntando arquivos é fácil passar do
    // limite, e descobrir isso depois de esperar o envio inteiro é o pior momento.
    const btn = document.getElementById("shl-btn-enviar");
    const passou = n > SHL_MAX_LINHAS;
    btn.disabled = passou;
    btn.textContent = passou
        ? `${n.toLocaleString("pt-BR")} linhas — passou do limite`
        : `Enviar ${n} linha${n !== 1 ? "s" : ""}`;
}

function _shlCancelar() {
    _shlArquivos = [];
    _shlMsg("", null);
    const previa = document.getElementById("shl-previa");
    if (previa) previa.style.display = "none";
    const lista = document.getElementById("shl-arquivos");
    if (lista) lista.innerHTML = "";
    const sub = document.getElementById("shl-sub");
    if (sub) sub.innerText = _SHL_SUB_PADRAO;
}

function _shlEnviar() {
    if (_shlEnviando || !_shlArquivos.length) return;
    _shlEnviando = true;
    const btn = document.getElementById("shl-btn-enviar");
    btn.disabled = true;
    btn.textContent = "Enviando...";

    fetch(`${API}/shopee/lh`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ arquivos: _shlArquivos.map(a => ({ arquivo: a.nome, linhas: a.linhas })) })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        _shlEnviando = false;
        btn.disabled = false;
        if (!ok) {
            btn.textContent = "Enviar para o sistema";
            return _shlMsg(_shlEsc(d.error) || "Não foi possível enviar.", "erro");
        }
        const n = d.gravadas;
        const qtd = (d.arquivos || []).length;
        _shlCancelar();
        _shlMsg(`✓ ${n} linha${n !== 1 ? "s" : ""} enviada${n !== 1 ? "s" : ""}${
            qtd > 1 ? ` de ${qtd} arquivos` : ""}.`, "ok");
        _shlCarregarHistorico();
    })
    .catch(() => {
        _shlEnviando = false;
        btn.disabled = false;
        btn.textContent = "Enviar para o sistema";
        _shlMsg("Erro ao conectar com o servidor.", "erro");
    });
}

// ── Histórico ──
function _shlCarregarHistorico() {
    const empty  = document.getElementById("shl-hist-empty");
    const result = document.getElementById("shl-hist-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    fetch(`${API}/shopee/lh/importacoes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            const imps = (d && d.importacoes) || [];
            _shlRenderUltima(imps[0], d && d.total);
            if (!imps.length) { skFim(empty, "Nenhum romaneiro enviado ainda."); return; }
            empty.style.display = "none";
            result.style.display = "";

            // Agrupado por dia, com o total do dia no cabeçalho. Numa lista corrida de
            // arquivos não dá pra ver se a carga de hoje já entrou inteira — que é a única
            // pergunta que se faz olhando esta tela.
            const porDia = new Map();
            for (const i of imps) {
                const dia = i.dia || "—";
                if (!porDia.has(dia)) porDia.set(dia, []);
                porDia.get(dia).push(i);
            }
            const totaisDia = Object.fromEntries(((d && d.dias) || []).map(x => [x.dia, x]));
            const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
            const podeRemover = _shlPodeRemover();
            _shlEnvios = imps;

            document.getElementById("shl-hist-tbody").innerHTML = [...porDia.entries()].map(([dia, lista]) => {
                const resumo = totaisDia[dia];
                const linhasDia = resumo ? resumo.linhas : lista.reduce((s, i) => s + i.linhas, 0);
                const envios = resumo ? resumo.envios : lista.length;
                return `
                <tr class="shl-dia-linha">
                    <td colspan="5" style="background:rgba(58,134,255,0.07);border-top:1px solid rgba(58,134,255,0.18);padding:9px 12px">
                        <span style="font-weight:700;color:#93c5fd;font-size:13px">${_shlDiaTexto(dia, hoje)}</span>
                        <span style="color:#8494a9;font-size:12.5px;margin-left:8px">
                            ${envios} arquivo${envios !== 1 ? "s" : ""} · ${linhasDia.toLocaleString("pt-BR")} linha${linhasDia !== 1 ? "s" : ""}
                        </span>
                        ${_shlEhDia(dia) ? `<button class="shl-baixar" style="float:right" title="Baixar todos os pedidos deste dia"
                                onclick="_shlExportarDia(this,'${dia}')">Baixar o dia (.xlsx)</button>` : ""}
                    </td>
                </tr>` + lista.map(i => `
                <tr>
                    <td data-label="Arquivo">${_shlEsc(i.arquivo) || "—"}</td>
                    <td data-label="Linhas" style="font-variant-numeric:tabular-nums">${i.linhas}</td>
                    <td data-label="Enviado por">${_shlEsc(i.importado_por) || "—"}</td>
                    <td data-label="Quando" style="color:#8494a9">${_shlDataHora(i.importado_em)}</td>
                    <td data-label="" style="text-align:right;white-space:nowrap">
                        <button class="shl-baixar" title="Baixar os pedidos deste envio"
                                onclick="_shlExportarEnvio(this,${imps.indexOf(i)})">Baixar</button>
                        ${podeRemover ? `<button class="shr-del-btn" style="margin-left:10px" title="Remover este envio"
                                onclick="_shlRemover('${_shlEsc(i.importado_em)}','${_shlEsc(i.arquivo).replace(/'/g, "\\'")}',${i.linhas})">Remover</button>` : ""}
                    </td>
                </tr>`).join("");
            }).join("");
        })
        .catch(() => {
            skFim(empty, "Erro ao conectar com o servidor.");
            _shlRenderUltima(null, null);
        });
}

// ── Exportar ──
// Os pedidos ficam guardados linha por linha; daqui sai a planilha de um dia inteiro ou
// de um envio só. O servidor devolve as linhas e a planilha é montada aqui, igual às
// outras exportações do sistema.

// Envios listados no histórico, na ordem da tela — o botão "Baixar" de cada linha aponta
// pra cá pelo índice, em vez de levar nome de arquivo dentro do onclick.
let _shlEnvios = [];

const _shlEhDia = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// Colunas da planilha: as do romaneiro, com o mesmo nome da prévia, e depois quando e por
// quem a linha entrou no XM. Data e hora em colunas separadas pra dar pra filtrar o dia no
// Excel sem quebrar texto.
const SHL_COLUNAS_EXPORTAR = [
    ...SHL_COLUNAS.map(c => ({ id: c.id, label: c.label })),
    { id: "arquivo",       label: "Arquivo" },
    { id: "envio_data",    label: "Data do envio ao XM" },
    { id: "envio_hora",    label: "Hora do envio ao XM" },
    { id: "importado_por", label: "Enviado ao XM por" },
];

// Data e hora de Brasília de um carimbo do servidor, já separadas.
function _shlDataHoraPartes(iso) {
    if (!iso) return { data: "", hora: "" };
    const d = new Date(iso);
    return {
        data: d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        hora: d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    };
}

function _shlLinhasPlanilha(pedidos) {
    return pedidos.map(p => {
        const envio = _shlDataHoraPartes(p.importado_em);
        const valor = { ...p, envio_data: envio.data, envio_hora: envio.hora };
        return Object.fromEntries(SHL_COLUNAS_EXPORTAR.map(c => [c.label, valor[c.id] ?? ""]));
    });
}

// ── Exportar em massa: calendário de intervalo ──
// Mesmo desenho do exportador do Recebimento (js/shopee.js): clicar numa data e depois
// noutra marca o período; clicar numa só e baixar já é um dia — de e até saem iguais.
const SHL_CAL_DOW   = ["D", "S", "T", "Q", "Q", "S", "S"];
const SHL_CAL_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                       "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
let _shlCalInicio = null, _shlCalFim = null, _shlCalMes = null;

const _shlFmtData   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _shlParseData = s => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };

function _shlCalMesAnterior() { _shlCalMes.setMonth(_shlCalMes.getMonth() - 1); _shlCalRender(); }
function _shlCalMesProximo()  { _shlCalMes.setMonth(_shlCalMes.getMonth() + 1); _shlCalRender(); }

function _shlCalClick(dataStr) {
    const d = _shlParseData(dataStr);
    // Intervalo fechado começa uma seleção nova; clique anterior ao início inverte as pontas.
    if (!_shlCalInicio || _shlCalFim) { _shlCalInicio = d; _shlCalFim = null; }
    else if (d < _shlCalInicio)       { _shlCalFim = _shlCalInicio; _shlCalInicio = d; }
    else                              { _shlCalFim = d; }
    _shlCalRender();
    document.getElementById("shl-exp-erro").innerText = "";
}

function _shlCalRender() {
    const ano = _shlCalMes.getFullYear(), mesIdx = _shlCalMes.getMonth();
    const primeiroDiaSemana = new Date(ano, mesIdx, 1).getDay();
    const diasNoMes  = new Date(ano, mesIdx + 1, 0).getDate();
    const celulaIni  = new Date(ano, mesIdx, 1 - primeiroDiaSemana);
    const total      = Math.ceil((primeiroDiaSemana + diasNoMes) / 7) * 7;
    const ini = _shlCalInicio, fim = _shlCalFim;

    let grid = "";
    for (let i = 0; i < total; i++) {
        const dia = new Date(celulaIni);
        dia.setDate(celulaIni.getDate() + i);
        let classes = "ped-cal-day" + (dia.getMonth() !== mesIdx ? " outro-mes" : "");
        if (ini && fim) {
            const t = dia.getTime();
            if (t === ini.getTime() && t === fim.getTime()) classes += " intervalo-unico";
            else if (t === ini.getTime()) classes += " intervalo-inicio";
            else if (t === fim.getTime()) classes += " intervalo-fim";
            else if (t > ini.getTime() && t < fim.getTime()) classes += " no-intervalo";
        } else if (ini && dia.getTime() === ini.getTime()) {
            classes += " intervalo-unico";
        }
        grid += `<div class="${classes}" onclick="_shlCalClick('${_shlFmtData(dia)}')">${dia.getDate()}</div>`;
    }

    const texto = !ini ? "Clique na data"
        : !fim ? `${ini.toLocaleDateString("pt-BR")} — clique de novo para um período`
        : ini.getTime() === fim.getTime() ? ini.toLocaleDateString("pt-BR")
        : `${ini.toLocaleDateString("pt-BR")} — ${fim.toLocaleDateString("pt-BR")}`;

    document.getElementById("shl-cal").innerHTML = `
        <div class="ped-cal-header">
            <button type="button" class="ped-cal-nav" onclick="_shlCalMesAnterior()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span>${SHL_CAL_MESES[mesIdx]} ${ano}</span>
            <button type="button" class="ped-cal-nav" onclick="_shlCalMesProximo()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>
        <div class="ped-cal-grid">${SHL_CAL_DOW.map(d => `<div class="ped-cal-dow">${d}</div>`).join("")}${grid}</div>
        <div class="ped-cal-footer"><span class="ped-cal-range-txt">${texto}</span></div>`;
}

function _shlAbrirExportar() {
    const hoje = _shlParseData(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    _shlCalInicio = hoje;
    _shlCalFim    = hoje;
    _shlCalMes    = new Date(hoje);
    _shlCalMes.setDate(1);
    _shlCalRender();
    document.getElementById("shl-exp-erro").innerText = "";
    _abrirModal("modal-shl-exportar");
}

// Baixa em massa: todos os pedidos enviados ao XM no período marcado no calendário.
function _shlExportarPeriodo() {
    const erro = document.getElementById("shl-exp-erro");
    erro.innerText = "";
    if (!_shlCalInicio) { erro.innerText = "Clique numa data no calendário."; return; }

    // Fim vazio = intervalo de um dia só.
    const de  = _shlFmtData(_shlCalInicio);
    const ate = _shlFmtData(_shlCalFim || _shlCalInicio);
    _shlExportar(document.getElementById("shl-exp-btn"), { de, ate },
        de === ate ? "romaneiro_" + de : `romaneiro_${de}_a_${ate}`,
        { avisar: m => { erro.innerText = m; }, aoBaixar: () => _fecharModal("modal-shl-exportar") });
}

// Nome do .xlsx de um envio: o do arquivo original sem a extensão, pra quem baixa
// reconhecer de qual planilha veio.
function _shlNomeEnvio(envio) {
    const base = String(envio.arquivo || "").replace(/\.(xlsx|xls|csv)$/i, "").trim();
    return "romaneiro_" + (base || String(envio.dia || "envio"));
}

function _shlExportarDia(btn, dia) {
    _shlExportar(btn, { dia }, "romaneiro_" + dia);
}

function _shlExportarEnvio(btn, idx) {
    const envio = _shlEnvios[idx];
    if (!envio) return;
    _shlExportar(btn, { importado_em: envio.importado_em }, _shlNomeEnvio(envio));
}

// `filtro` é { de, ate }, { dia } ou { importado_em }. No modal o aviso sai dentro dele
// (`avisar`) e ele fecha depois de baixar (`aoBaixar`); nos botões da lista, num alerta.
function _shlExportar(btn, filtro, nome, { avisar = gcAlert, aoBaixar = () => {} } = {}) {
    if (btn.disabled) return;
    const texto = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Gerando...";
    fetch(`${API}/shopee/lh/pedidos?${new URLSearchParams(filtro)}`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) return avisar(d.error || "Não foi possível exportar.");
        const pedidos = d.pedidos || [];
        if (!pedidos.length) return avisar("Nenhum pedido enviado nesse período.");
        const ws = XLSX.utils.json_to_sheet(_shlLinhasPlanilha(pedidos),
            { header: SHL_COLUNAS_EXPORTAR.map(c => c.label) });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Romaneiro");
        XLSX.writeFile(wb, nome + ".xlsx");
        aoBaixar();
    })
    .catch(() => avisar("Erro ao conectar com o servidor."))
    .finally(() => { btn.disabled = false; btn.textContent = texto; });
}

// Só admin e dev removem. Apagar linhas de romaneiro muda o "faltam" da conferência de
// LineHaul: é conserto de envio repetido, não parte do dia a dia de quem alimenta.
function _shlPodeRemover() {
    return ["admin", "dev"].includes((window._gcUser && window._gcUser.role) || "");
}

// Remove o envio inteiro — as linhas daquele arquivo saem do romaneiro junto.
function _shlRemover(importadoEm, arquivo, linhas) {
    gcConfirm(
        `Remover o envio "${arquivo}"?\n\nAs ${Number(linhas).toLocaleString("pt-BR")} linhas dele saem do romaneiro, e a conferência de LineHaul passa a não esperar mais esses pacotes. Para desfazer, é só enviar o arquivo de novo.`,
        () => {
            fetch(`${API}/shopee/lh/importacao?importado_em=${encodeURIComponent(importadoEm)}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + token }
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) return gcAlert(d.error || "Não foi possível remover.");
                _shlMsg(`✓ Envio "${_shlEsc(arquivo)}" removido — ${Number(d.linhas || linhas).toLocaleString("pt-BR")} linhas saíram do romaneiro.`, "ok");
                _shlCarregarHistorico();
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
        },
        "Remover envio",
        "Sim, remover"
    );
}

function _shlDataHora(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// "Hoje" e "Ontem" por extenso: são os dois dias que alguém procura de fato nesta tela, e
// achá-los pela data exige comparar com o calendário de cabeça.
function _shlDiaTexto(dia, hoje) {
    if (!dia || dia === "—") return "Sem data";
    const br = dia.split("-").reverse().join("/");
    if (dia === hoje) return `Hoje · ${br}`;
    const ontem = new Date(hoje + "T12:00:00");
    ontem.setDate(ontem.getDate() - 1);
    if (dia === ontem.toISOString().slice(0, 10)) return `Ontem · ${br}`;
    return br;
}

// "Há quanto tempo" junto da data: o que interessa é saber se o romaneiro de hoje já
// entrou, e uma data crua exige a pessoa fazer essa conta de cabeça.
function _shlHaQuantoTempo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1)   return "agora mesmo";
    if (min < 60)  return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24)    return `há ${h}h`;
    const d = Math.floor(h / 24);
    return d === 1 ? "ontem" : `há ${d} dias`;
}

function _shlRenderUltima(ultima, total) {
    const el = document.getElementById("shl-ultima");
    if (!ultima) {
        el.className = "shr-ultima vazia";
        el.innerHTML = `<span class="shr-ultima-label">Romaneiro</span>
            <span class="shr-ultima-valor">Nenhum envio ainda</span>`;
        return;
    }
    el.className = "shr-ultima";
    el.innerHTML = `
        <span class="shr-ultima-label">Atualizado</span>
        <span class="shr-ultima-valor">${_shlDataHora(ultima.importado_em)}</span>
        <span class="shr-ultima-rel">${_shlHaQuantoTempo(ultima.importado_em)}</span>
        <span class="shr-ultima-obs">${_shlEsc(ultima.importado_por) || "—"} · ${ultima.linhas} linha${ultima.linhas !== 1 ? "s" : ""}${
            total ? ` · ${total.toLocaleString("pt-BR")} no total` : ""}</span>`;
}
