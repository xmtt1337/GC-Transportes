// ───── FISCAL: valores do frete pela planilha da Shopee ─────
//
// A Shopee só informa quanto vai pagar depois da entrega. Como o valor é
// obrigatório no CT-e, o rascunho fica esperando — e esta tela preenche todos
// de uma vez quando a planilha de repasse chega.
//
// A planilha é lida no navegador (SheetJS), como o resto do sistema faz. Para
// o servidor vão só as linhas, nunca o arquivo.

let _valPlanilha = null;   // { nome, linhas }
let _valItens = null;      // [{codigo, valor, cidade}] já lidos AQUI
let _valColunas = null;
let _valCidades = null;    // [{cidade, n}] achadas na planilha
let _valExcluidas = new Set();
let _valTipos = null;      // [{tipo, n}] achados na planilha
let _valTiposIncluidos = null;   // null = ainda não escolhido
let _valRelatorio = null;

// ── leitura da planilha no navegador
//
// Antes eu mandava as linhas todas para o servidor lerem lá. Com a planilha
// real — 118 mil linhas — o corpo da requisição não passa, e a tela só dizia
// "Failed to fetch". Agora a planilha é lida aqui e para o servidor vão só os
// códigos que estão sendo processados, 25 por vez.
//
// As regras abaixo são as mesmas de modules/fiscal/shopee/valores-planilha.js.

const _VAL_COLS_CODIGO = [
    "3pltrackingnumbernumeroetiquetaordemshopee", "3pltrackingnumber",
    "numeroetiqueta", "trackingnumber", "ordemshopee", "codigo",
];
const _VAL_COLS_VALOR = [
    "valorfinalareceber", "valorfinal", "valorareceber", "valorreceber",
];
// Cidade de entrega: quando a planilha traz, o filtro acontece AQUI, antes de
// enfileirar. Cada código excluído é uma consulta à API da Shopee que deixa de
// ser feita — em 120 mil linhas, isso é hora de processamento a menos.
const _VAL_COLS_CIDADE = [
    "cidadeentrega", "cidadedeentrega", "cidade", "municipioentrega",
    "municipio", "destino", "cidadedestino",
];

// Componentes do valor do serviço — o FAQ da Shopee exige o desmembramento
// (frete, GRIS, ad valorem, pedágio) e a planilha traz cada um em coluna.
//
// ATENÇÃO, as colunas NÃO são somáveis. Conferido em 32 linhas da planilha:
//
//     (Frete/Tarifa Base + GRIS) ÷ (1 − alíquota) = Frete Calculado
//              2,46203 + 0,02797 = 2,49 ÷ 0,83    = 3,00
//
// Ou seja, o "Frete Calculado" JÁ CONTÉM o GRIS, com o ICMS por dentro. Somar
// os dois como componentes contaria o GRIS duas vezes e o total não fecharia.
//
// Por isso o FRETE vem do "Frete Calculado" e o GRIS não entra separado até
// alguém decidir como discriminá-lo (o valor bruto seria GRIS ÷ (1 − alíquota),
// mas isso é decisão fiscal, não conta que eu possa tomar sozinho).
// Alíquota que a Shopee apurou. Não vai para o CT-e — serve de conferência:
// quando ela difere da configurada, a operação daquela linha provavelmente é
// de outra natureza. Foi assim que apareceu o caso de Caçador e Videira, onde
// a alíquota é 5% (ISS, intramunicipal) e não 17% (ICMS, intermunicipal).
const _VAL_COLS_ALIQUOTA = ["aliquotaicmsiss", "aliquotaicms", "aliquota"];

// Tipo do serviço: a planilha mistura ENTREGA e COLETA. São operações
// diferentes — coleta não é o redespacho que este módulo emite —, então só
// entra o que for marcado aqui. O filtro acontece na leitura, antes de
// consultar a API: linha que não entra não vira consulta.
const _VAL_COLS_TIPO = ["tipodoservico", "tiposervico", "tipo", "servico"];
const _VAL_TIPO_PADRAO = /entrega/i;

const _VAL_COMPONENTES = [
    { nome: "FRETE",      colunas: ["fretecalculado", "frete", "valorfrete"] },
    { nome: "AD VALOREM", colunas: ["adv", "advalorem", "adevalorem"] },
    { nome: "PEDAGIO",    colunas: ["pedagio", "valorpedagio"] },
    { nome: "OUTROS",     colunas: ["outrosvalores", "outros"] },
];

function _valNormalizar(s) {
    return String(s == null ? "" : s)
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Aceita "R$ 4,00", "4.00000", "1.234,56" e número. */
function _valLerValor(bruto) {
    if (bruto === null || bruto === undefined || bruto === "") return null;
    if (typeof bruto === "number") return isFinite(bruto) ? bruto : null;
    let t = String(bruto).trim().replace(/[R$\s ]/gi, "");
    if (!t) return null;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function _valAcharColuna(cabecalhoNorm, candidatas) {
    for (const c of candidatas) {
        const i = cabecalhoNorm.indexOf(c);
        if (i >= 0) return i;
    }
    for (const c of candidatas) {
        const i = cabecalhoNorm.findIndex((h) => h.includes(c));
        if (i >= 0) return i;
    }
    return -1;
}

/** Lê a planilha carregada e guarda os itens. Devolve o resumo. */
function _valProcessarLocal() {
    const linhas = _valPlanilha.linhas;
    const cabecalho = linhas[0] || [];
    const norm = cabecalho.map(_valNormalizar);

    const iCod = _valCol("val-col-codigo") ?? _valAcharColuna(norm, _VAL_COLS_CODIGO);
    const iVal = _valCol("val-col-valor") ?? _valAcharColuna(norm, _VAL_COLS_VALOR);
    const iCid = _valCol("val-col-cidade") ?? _valAcharColuna(norm, _VAL_COLS_CIDADE);

    // Onde cada componente está, se estiver. Coluna ausente não vira zero:
    // um componente que a planilha não traz simplesmente não existe.
    const colsComp = _VAL_COMPONENTES
        .map((c) => ({ nome: c.nome, i: _valAcharColuna(norm, c.colunas) }))
        .filter((c) => c.i >= 0);
    const iAliq = _valAcharColuna(norm, _VAL_COLS_ALIQUOTA);
    const iTipo = _valAcharColuna(norm, _VAL_COLS_TIPO);

    if (iCod < 0 || iVal < 0) {
        throw new Error(
            `Não achei a coluna ${iCod < 0 ? "do código" : "do valor"}. ` +
            `Escolha à mão nos campos acima.`);
    }

    const todos = [];
    const vistos = new Set();
    const porCidade = new Map();
    let ignoradas = 0;
    for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i] || [];
        const codigo = String(linha[iCod] == null ? "" : linha[iCod]).trim();
        const valor = _valLerValor(linha[iVal]);
        if (!codigo || valor === null) { ignoradas++; continue; }
        if (vistos.has(codigo)) { ignoradas++; continue; }   // repetido: o 1º vale
        vistos.add(codigo);
        const cidade = iCid >= 0 ? String(linha[iCid] == null ? "" : linha[iCid]).trim() : "";

        // Só componentes com valor entram: Comp com zero polui o documento, e
        // o schema não aceita valor negativo (por isso desconto fica de fora).
        const componentes = colsComp
            .map((c) => ({ nome: c.nome, valor: _valLerValor(linha[c.i]) }))
            .filter((c) => c.valor !== null && c.valor > 0);

        // A alíquota vem em fração (0,17) ou percentual (17): normalizamos.
        let aliquota = iAliq >= 0 ? _valLerValor(linha[iAliq]) : null;
        if (aliquota !== null && aliquota > 0 && aliquota < 1) aliquota = aliquota * 100;

        const tipo = iTipo >= 0 ? String(linha[iTipo] == null ? "" : linha[iTipo]).trim() : "";

        todos.push({ codigo, valor, cidade, tipo,
                     ...(aliquota !== null ? { aliquota } : {}),
                     ...(componentes.length ? { componentes } : {}) });
        if (cidade) {
            const k = _valNormalizar(cidade);
            const atual = porCidade.get(k) || { cidade, n: 0, soma: 0 };
            atual.n++; atual.soma += valor;
            porCidade.set(k, atual);
        }
    }

    // Tipos de serviço encontrados. Na primeira leitura, só ENTREGA entra —
    // coleta é outra operação e emitir CT-e de redespacho nela seria errado.
    const porTipo = new Map();
    for (const i of todos) {
        if (!i.tipo) continue;
        const k = _valNormalizar(i.tipo);
        const atual = porTipo.get(k) || { tipo: i.tipo, n: 0, soma: 0 };
        atual.n++; atual.soma += i.valor;
        porTipo.set(k, atual);
    }
    _valTipos = [...porTipo.values()].sort((a, b) => b.n - a.n);
    if (_valTiposIncluidos === null) {
        _valTiposIncluidos = new Set(
            _valTipos.filter((t) => _VAL_TIPO_PADRAO.test(t.tipo))
                     .map((t) => _valNormalizar(t.tipo)));
    }

    _valCidades = [...porCidade.values()].sort((a, b) => b.n - a.n);
    // O filtro vale para o que vai ser enfileirado; os excluídos nem chegam
    // a virar consulta à Shopee.
    const itens = todos.filter((i) =>
        !_valExcluidas.has(_valNormalizar(i.cidade)) &&
        // Sem coluna de tipo, tudo entra: planilha antiga não deve quebrar.
        (!_valTipos.length || !i.tipo || _valTiposIncluidos.has(_valNormalizar(i.tipo))));
    const excluidos = todos.length - itens.length;

    _valItens = itens;
    _valColunas = {
        codigo: cabecalho[iCod], valor: cabecalho[iVal],
        cidade: iCid >= 0 ? cabecalho[iCid] : null,
        componentes: colsComp.map((c) => `${c.nome} (${cabecalho[c.i]})`),
    };
    const soma = Math.round(itens.reduce((t, i) => t + i.valor, 0) * 100) / 100;

    // Os componentes precisam somar o valor do serviço. Quando não somam, algo
    // que a Shopee cobra não está nas colunas — e um CT-e cujo Comp não fecha
    // com o vTPrest pode ser rejeitado. Melhor descobrir aqui.
    let divergentes = 0;
    for (const i of itens) {
        if (!i.componentes) continue;
        const s = Math.round(i.componentes.reduce((t, c) => t + c.valor, 0) * 100) / 100;
        if (Math.abs(s - i.valor) > 0.01) divergentes++;
    }

    // Agrupa as alíquotas encontradas, por cidade. Alíquota diferente da que a
    // empresa usa costuma significar operação de outra natureza — e emitir CT-e
    // ali seria declarar o imposto errado.
    const porAliquota = new Map();
    for (const i of itens) {
        if (i.aliquota === undefined || i.aliquota === null) continue;
        const k = i.aliquota.toFixed(2);
        const atual = porAliquota.get(k) || { aliquota: i.aliquota, n: 0, cidades: new Set() };
        atual.n++;
        if (i.cidade) atual.cidades.add(i.cidade);
        porAliquota.set(k, atual);
    }
    const aliquotas = [...porAliquota.values()]
        .map((a) => ({ ...a, cidades: [...a.cidades].slice(0, 8) }))
        .sort((a, b) => b.n - a.n);

    return { itens, ignoradas, soma, excluidos, divergentes, aliquotas,
             total: todos.length, colunas: _valColunas };
}

async function abrirFiscalValores(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-valores");
    _valPlanilha = null;
    _valItens = null;
    _valCidades = null;
    _valExcluidas = new Set();
    _valTipos = null;
    _valTiposIncluidos = null;
    _valRelatorio = null;
    if (_valPolling) { clearInterval(_valPolling); _valPolling = null; }
    document.getElementById("fiscal-valores-conteudo").innerHTML = _htmlValores();

    // Se houver importação rodando, mostra ela em vez de uma tela em branco —
    // quem fechou o navegador ontem volta e quer saber como ficou.
    try {
        const lista = await _cteApi("/fiscal/importacao");
        const ativa = (lista || []).find((i) => i.situacao === "PROCESSANDO");
        if (ativa) _valAcompanhar(ativa.id);
        else if ((lista || []).length) _valMostrarHistorico(lista);
    } catch { /* sem histórico: segue a tela normal */ }
}

function _valMostrarHistorico(lista) {
    document.getElementById("val-resultado").innerHTML = `
    <details class="secao-form">
        <summary><b>Importações anteriores</b> — ${lista.length}</summary>
        <table class="tabela">
            <thead><tr><th>Quando</th><th>Planilha</th><th>Situação</th>
                       <th>Progresso</th><th></th></tr></thead>
            <tbody>${lista.map((i) => `<tr>
                <td>${_fmtData(i.criado_em)}</td>
                <td>${_esc(i.nome || "—")}</td>
                <td>${_esc(i.situacao)}</td>
                <td>${(i.feitos || 0).toLocaleString("pt-BR")} / ${(i.total || 0).toLocaleString("pt-BR")}</td>
                <td><button onclick="_valAcompanhar(${i.id})">Ver</button></td>
            </tr>`).join("")}</tbody>
        </table>
    </details>`;
}

function _htmlValores() {
    return `
    <div class="cabecalho-tela">
        <h2>Valores do frete (planilha da Shopee)</h2>
        <button onclick="abrirCTes()">← Lista</button>
    </div>

    <div class="aviso-info">
        <strong>Para os CT-e que estão esperando o valor.</strong>
        <p>A planilha é casada pela coluna
           <b>3PL Tracking Number / Número Etiqueta / Ordem (Shopee)</b>, e o valor
           vem de <b>Valor Final à Receber</b>.</p>
        <p>Códigos que ainda não têm rascunho são buscados na Shopee e criados na
           hora — <b>como rascunho</b>, que ainda passa por validação e emissão.
           Documento já emitido não é tocado, e reenviar a mesma planilha não
           duplica nada.</p>
    </div>

    <div class="secao-form">
        <h3>1. A planilha</h3>
        <div class="linha-form">
            <label class="largo">Link da planilha (Google Sheets)
                <input id="val-link" placeholder="cole o link compartilhado da planilha"
                       onkeydown="if(event.key==='Enter')_valLerLink()"></label>
            <button onclick="_valLerLink()">Ler do link</button>
        </div>
        <p class="dica">
            A planilha precisa estar compartilhada como <b>"qualquer pessoa com o
            link"</b>. Se preferir, escolha o arquivo direto:
        </p>
        <input type="file" id="val-arquivo" accept=".xlsx,.xls,.csv"
               onchange="_valLerArquivo(this)">
        <div id="val-info-arquivo"></div>
    </div>

    <div id="val-etapas"></div>
    <div id="val-resultado"></div>`;
}

/**
 * Converte o link do Google Sheets na URL de exportação CSV.
 *
 * O link que a pessoa copia do navegador é o de edição; o que dá para ler é o
 * de export. A aba (gid) vem no fragmento (#gid=) ou na query.
 */
function _valUrlCsv(link) {
    const l = String(link || "").trim();
    if (!l) return null;
    if (/\/export\?/.test(l)) return l;      // já é link de exportação

    const id = (l.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || [])[1];
    if (!id) return null;
    const gid = (l.match(/[#&?]gid=(\d+)/) || [])[1] || "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

async function _valLerLink() {
    const link = document.getElementById("val-link").value;
    const info = document.getElementById("val-info-arquivo");
    const url = _valUrlCsv(link);
    if (!url) {
        info.innerHTML = `<div class="aviso-bloqueio">
            Link não reconhecido. Cole o link da planilha do Google Sheets.</div>`;
        return;
    }
    info.innerHTML = "<p class='carregando'>Lendo a planilha…</p>";
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`A planilha respondeu ${r.status}. ` +
            `Confira se está compartilhada como "qualquer pessoa com o link".`);
        const texto = await r.text();
        const wb = XLSX.read(texto, { type: "string" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
        _valPlanilha = { nome: "planilha do link", linhas };
        info.innerHTML = `<div class="aviso-sucesso">
            <strong>Planilha lida do link.</strong>
            <p>${linhas.length - 1} linha(s) além do cabeçalho.</p></div>`;
        _valMostrarEtapas();
    } catch (e) {
        info.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não consegui ler a planilha.</strong><p>${_esc(e.message)}</p></div>`;
    }
}

/** Lê a planilha no navegador. O arquivo não sai daqui. */
function _valLerArquivo(input) {
    const arquivo = input.files && input.files[0];
    if (!arquivo) return;
    const info = document.getElementById("val-info-arquivo");
    info.innerHTML = "<p class='carregando'>Lendo a planilha…</p>";

    const leitor = new FileReader();
    leitor.onload = (e) => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
            _valPlanilha = { nome: arquivo.name, linhas };
            info.innerHTML = `<div class="aviso-sucesso">
                <strong>${_esc(arquivo.name)}</strong>
                <p>${linhas.length - 1} linha(s) além do cabeçalho.</p></div>`;
            _valMostrarEtapas();
        } catch (err) {
            info.innerHTML = `<div class="aviso-bloqueio">
                <strong>Não consegui ler a planilha.</strong><p>${_esc(err.message)}</p></div>`;
        }
    };
    leitor.onerror = () => {
        info.innerHTML = `<div class="aviso-bloqueio">Falha ao abrir o arquivo.</div>`;
    };
    leitor.readAsArrayBuffer(arquivo);
}

function _valMostrarEtapas() {
    const cabecalho = (_valPlanilha.linhas[0] || []).map((c, i) => ({ i, nome: String(c || `(coluna ${i + 1})`) }));
    document.getElementById("val-etapas").innerHTML = `
    <div class="secao-form">
        <h3>2. Conferir antes de aplicar</h3>
        <p class="dica">
            As colunas são reconhecidas pelo nome. Se a planilha vier diferente,
            escolha à mão abaixo.
        </p>
        <div class="linha-form">
            <label>Coluna do código
                <select id="val-col-codigo">
                    <option value="">Reconhecer pelo nome</option>
                    ${cabecalho.map((c) => `<option value="${c.i}">${_esc(c.nome)}</option>`).join("")}
                </select></label>
            <label>Coluna do valor
                <select id="val-col-valor">
                    <option value="">Reconhecer pelo nome</option>
                    ${cabecalho.map((c) => `<option value="${c.i}">${_esc(c.nome)}</option>`).join("")}
                </select></label>
            <label>Coluna da cidade
                <select id="val-col-cidade">
                    <option value="">Reconhecer pelo nome</option>
                    ${cabecalho.map((c) => `<option value="${c.i}">${_esc(c.nome)}</option>`).join("")}
                </select></label>
            <label class="check">
                <input type="checkbox" id="val-sobrescrever"> Trocar valores já preenchidos
            </label>
        </div>
        <div id="val-tipos"></div>
        <div id="val-cidades"></div>
        <div class="acoes-rodape">
            <button onclick="_valEnviar()">Conferir (não grava)</button>
            <button class="btn-primario" onclick="_valConfirmarLote()">
                Criar os CT-e →
            </button>
        </div>
        <p class="dica">
            <b>Conferir</b> só olha os rascunhos que já existem, sem gravar nada.
            <b>Criar os CT-e</b> manda a planilha para a fila do servidor, que
            busca cada código na Shopee, cria o rascunho e põe o valor. Pergunta
            a quantidade antes. São rascunhos: nada é enviado à SEFAZ aqui.
        </p>
    </div>`;
}

/**
 * Conferência: lê a planilha AQUI e checa uma amostra no servidor.
 *
 * Checar os 118 mil códigos contra o banco antes de começar levaria mais tempo
 * que processá-los. A amostra mostra que as colunas estão certas e como o
 * sistema vai tratar os códigos; o relatório real sai durante o processamento.
 */
const _VAL_AMOSTRA = 50;

async function _valEnviar() {
    if (!_valPlanilha) return;
    const alvo = document.getElementById("val-resultado");
    alvo.innerHTML = "<p class='carregando'>Lendo a planilha…</p>";

    let local;
    try {
        local = _valProcessarLocal();
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não consegui ler a planilha.</strong><p>${_esc(e.message)}</p></div>`;
        return;
    }

    const amostra = local.itens.slice(0, _VAL_AMOSTRA);
    let r = null;
    try {
        r = await _cteApi("/fiscal/cte/valores-planilha", {
            method: "POST",
            body: JSON.stringify({
                linhas: [["codigo", "valor"], ...amostra.map((i) => [i.codigo, i.valor])],
                coluna_codigo: 0, coluna_valor: 1, simular: true,
            }),
        });
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível conferir a amostra.</strong><p>${_esc(e.message)}</p></div>`;
        return;
    }

    _valPintarTipos();
    _valPintarCidades();
    alvo.innerHTML = `
    <div class="aviso-info">
        <strong>Planilha lida — nada foi gravado.</strong>
        <p>
            <b>${local.itens.length.toLocaleString("pt-BR")}</b> código(s) a processar ·
            total <b>${_fmtBRL(local.soma)}</b><br>
            ${local.excluidos.toLocaleString("pt-BR")} fora (cidade ou tipo de serviço) ·
            ${local.ignoradas.toLocaleString("pt-BR")} linha(s) ignorada(s)
            (sem código, sem valor ou repetidas)
        </p>
        <p class="dica">Colunas: <b>${_esc(local.colunas.codigo)}</b> e
           <b>${_esc(local.colunas.valor)}</b>.
           ${(local.colunas.componentes || []).length
             ? `<br>Componentes: ${_esc(local.colunas.componentes.join(" · "))}`
             : "<br>Nenhuma coluna de componente reconhecida."}</p>
        ${(local.aliquotas || []).length > 1 ? `<p style="color:#e8a33d">
            <b>A planilha tem ${local.aliquotas.length} alíquotas diferentes.</b><br>
            ${local.aliquotas.map((a) => `${a.aliquota.toFixed(2)}% —
                ${a.n.toLocaleString("pt-BR")} pedido(s)${a.cidades.length
                    ? ` (${_esc(a.cidades.join(", "))})` : ""}`).join("<br>")}
            <br>Alíquota diferente costuma ser operação de outra natureza:
            transporte dentro do mesmo município é ISS, entre municípios é ICMS.
            Confira com o contador antes de emitir CT-e para todas.
        </p>` : ""}
        ${local.divergentes ? `<p style="color:#e8a33d">
            <b>${local.divergentes.toLocaleString("pt-BR")}</b> linha(s) em que os
            componentes não somam o valor final. O CT-e pode ser rejeitado assim —
            confira se falta alguma coluna.</p>` : ""}
    </div>

    <div class="aviso-info">
        <strong>Amostra dos ${amostra.length} primeiros, conferida no servidor:</strong>
        <p>
            ${r.atualizados.length} já têm rascunho esperando valor ·
            ${r.ja_tinham.length} já com valor ·
            ${r.nao_encontrados.length} ainda serão buscados na Shopee ·
            ${r.nao_editaveis.length} já emitidos
        </p>
    </div>

    ${local.itens.length > 5000 ? `
    <div class="aviso-info">
        <strong>São ${local.itens.length.toLocaleString("pt-BR")} códigos.</strong>
        <p>Cada um é uma consulta à API da Shopee, então isso leva horas — mas roda
           <b>no servidor</b>. Depois de enviar você pode fechar o navegador; volte
           aqui quando quiser para ver onde está.</p>
    </div>` : ""}`;
}

/**
 * Pergunta antes de criar. Uma planilha de repasse tem mais de mil linhas, e
 * confirmar a quantidade é a última chance de perceber que subiu o arquivo
 * errado — depois são mil rascunhos para limpar.
 */
/**
 * Lista as cidades da planilha para marcar quais não geram CT-e.
 *
 * Marcar aqui é melhor que filtrar depois: o pedido excluído nem vira consulta
 * à API da Shopee. Em 120 mil linhas, é hora de processamento a menos.
 */
/** Tipos de serviço da planilha, para escolher quais geram CT-e. */
function _valPintarTipos() {
    const area = document.getElementById("val-tipos");
    if (!area) return;
    if (!_valTipos || !_valTipos.length) { area.innerHTML = ""; return; }

    area.innerHTML = `
    <details class="secao-form" open>
        <summary><b>Tipo do serviço</b> — ${_valTipos.length}</summary>
        <p class="dica">
            Só o que estiver marcado gera CT-e. Coleta é operação diferente do
            redespacho que este módulo emite.
        </p>
        <div class="linha-form" style="flex-wrap:wrap;gap:8px">
            ${_valTipos.map((t) => {
                const k = _valNormalizar(t.tipo);
                return `<label class="check" style="flex:0 0 auto;min-width:220px">
                    <input type="checkbox" value="${_esc(k)}"
                           ${_valTiposIncluidos.has(k) ? "checked" : ""}
                           onchange="_valMarcarTipo(this)">
                    ${_esc(t.tipo)} <span class="dica">(${t.n.toLocaleString("pt-BR")} ·
                    ${_fmtBRL(t.soma)})</span></label>`;
            }).join("")}
        </div>
    </details>`;
}

function _valMarcarTipo(el) {
    if (el.checked) _valTiposIncluidos.add(el.value);
    else _valTiposIncluidos.delete(el.value);
    _valEnviar();
}

function _valPintarCidades() {
    const area = document.getElementById("val-cidades");
    if (!area) return;
    if (!_valCidades || !_valCidades.length) {
        area.innerHTML = `<p class="dica">
            A planilha não tem coluna de cidade reconhecida — escolha acima se
            houver, ou todos os códigos serão processados.</p>`;
        return;
    }
    area.innerHTML = `
    <details class="secao-form" open>
        <summary><b>Cidades na planilha</b> — ${_valCidades.length}</summary>
        <p class="dica">
            Marque as cidades onde a <b>GC não faz a entrega</b>. Elas não geram
            CT-e e nem são consultadas na Shopee — se eles entregam direto, não
            houve prestação nossa e o CT-e documentaria transporte inexistente.
        </p>
        <div class="linha-form" style="flex-wrap:wrap;gap:8px">
            ${_valCidades.map((c) => {
                const k = _valNormalizar(c.cidade);
                return `<label class="check" style="flex:0 0 auto;min-width:220px">
                    <input type="checkbox" value="${_esc(k)}"
                           ${_valExcluidas.has(k) ? "checked" : ""}
                           onchange="_valMarcarCidade(this)">
                    ${_esc(c.cidade)} <span class="dica">(${c.n.toLocaleString("pt-BR")} ·
                    ${_fmtBRL(c.soma)})</span></label>`;
            }).join("")}
        </div>
    </details>`;
}

function _valMarcarCidade(el) {
    if (el.checked) _valExcluidas.add(el.value);
    else _valExcluidas.delete(el.value);
    _valEnviar();   // recalcula a contagem com a exclusão
}

async function _valConfirmarLote() {
    const alvo = document.getElementById("val-resultado");
    let local;
    try {
        local = _valProcessarLocal();
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não consegui ler a planilha.</strong><p>${_esc(e.message)}</p></div>`;
        return;
    }

    const n = local.itens.length;
    const horas = (n * 0.4) / 3600;   // ~0,4s por código, com 4 em paralelo
    alvo.innerHTML = `
    <div class="aviso-info">
        <strong>Criar ${n.toLocaleString("pt-BR")} CT-e?</strong>
        <p>
            Total: <b>${_fmtBRL(local.soma)}</b>
            ${local.excluidos ? ` · ${local.excluidos.toLocaleString("pt-BR")}
                fora, de cidade excluída` : ""}
            · ${local.ignoradas.toLocaleString("pt-BR")} linha(s) ignorada(s)
        </p>
        <p class="dica">
            Códigos que já têm rascunho só terão o valor atualizado — não duplicam.
            São criados como <b>rascunho</b>: nada é enviado à SEFAZ aqui.
        </p>
        ${horas > 0.5 ? `<p><b>Deve levar cerca de ${horas < 1
            ? Math.round(horas * 60) + " minutos"
            : horas.toFixed(1).replace(".", ",") + " horas"}</b>, processando no
            servidor. Pode fechar o navegador depois de enviar.</p>` : ""}
        <div class="acoes-rodape">
            <button onclick="document.getElementById('val-resultado').innerHTML=''">Cancelar</button>
            <button class="btn-primario" onclick="_valImportarLote()">
                Sim, criar ${n.toLocaleString("pt-BR")} →
            </button>
        </div>
    </div>`;
}

// ── envia para a FILA do servidor
//
// A operação real são ~8 mil CT-e por dia. Um laço no navegador exigiria a aba
// aberta por horas, e qualquer queda de rede ou computador dormindo perderia o
// trabalho. A planilha é enfileirada e o servidor processa; esta tela só
// acompanha, e fechar o navegador não interrompe nada.

const _VAL_BLOCO_ENVIO = 2000;
let _valImportacaoId = null;
let _valPolling = null;

async function _valImportarLote() {
    const alvo = document.getElementById("val-resultado");
    if (!_valItens) {
        try { _valProcessarLocal(); }
        catch (e) { alvo.innerHTML = `<div class="aviso-bloqueio">${_esc(e.message)}</div>`; return; }
    }
    const itens = _valItens;
    if (!itens.length) {
        alvo.innerHTML = `<div class="aviso-bloqueio">Nenhuma linha utilizável.</div>`;
        return;
    }

    const sobrescrever = document.getElementById("val-sobrescrever").checked;
    alvo.innerHTML = "<p class='carregando'>Preparando a importação…</p>";

    try {
        const imp = await _cteApi("/fiscal/importacao", {
            method: "POST",
            // O filtro por cidade já foi aplicado aqui, na leitura da planilha:
            // o que não vai ser emitido nem chega a ser enfileirado.
            body: JSON.stringify({ nome: _valPlanilha.nome, sobrescrever }),
        });
        _valImportacaoId = imp.id;

        // Envia em blocos: 120 mil códigos num corpo só não passa.
        for (let i = 0; i < itens.length; i += _VAL_BLOCO_ENVIO) {
            const bloco = itens.slice(i, i + _VAL_BLOCO_ENVIO);
            await _cteApi(`/fiscal/importacao/${imp.id}/itens`, {
                method: "POST", body: JSON.stringify({ itens: bloco }),
            });
            const pct = Math.round(Math.min(i + bloco.length, itens.length) / itens.length * 100);
            alvo.innerHTML = `<div class="aviso-info">
                <strong>Enviando a planilha… ${pct}%</strong>
                <p>${Math.min(i + bloco.length, itens.length).toLocaleString("pt-BR")}
                   de ${itens.length.toLocaleString("pt-BR")}</p></div>`;
        }

        await _cteApi(`/fiscal/importacao/${imp.id}/iniciar`, {
            method: "POST", body: JSON.stringify({}) });

        _valAcompanhar(imp.id);
    } catch (e) {
        alvo.innerHTML = `<div class="aviso-bloqueio">
            <strong>Não foi possível enfileirar.</strong><p>${_esc(e.message)}</p></div>`;
    }
}

function _valAcompanhar(id) {
    _valImportacaoId = id;
    if (_valPolling) clearInterval(_valPolling);
    const atualizar = async () => {
        try {
            const p = await _cteApi(`/fiscal/importacao/${id}`);
            _valPintarProgresso(p);
            if (["CONCLUIDA", "CANCELADA"].includes(p.importacao.situacao)) {
                clearInterval(_valPolling); _valPolling = null;
            }
        } catch (e) { /* rede instável não pode parar o acompanhamento */ }
    };
    atualizar();
    _valPolling = setInterval(atualizar, 5000);
}

function _valPintarProgresso(p) {
    const alvo = document.getElementById("val-resultado");
    const s = p.por_situacao || {};
    const n = (k) => (s[k] ? s[k].n : 0);
    const pct = p.total ? Math.round((p.feitos / p.total) * 100) : 0;
    const emAndamento = p.importacao.situacao === "PROCESSANDO";

    alvo.innerHTML = `
    <div class="${emAndamento ? "aviso-info" : "aviso-sucesso"}">
        <strong>${emAndamento ? "Processando no servidor" : p.importacao.situacao} —
            ${p.feitos.toLocaleString("pt-BR")} de ${p.total.toLocaleString("pt-BR")} (${pct}%)</strong>
        <div style="background:#1e2a3d;border-radius:6px;height:10px;margin:10px 0;overflow:hidden">
            <div style="background:#3b82f6;height:100%;width:${pct}%;transition:width .3s"></div>
        </div>
        <p>
            ${n("CRIADO").toLocaleString("pt-BR")} criados ·
            ${n("ATUALIZADO").toLocaleString("pt-BR")} atualizados ·
            ${n("JA_EXISTIA").toLocaleString("pt-BR")} já prontos<br>
            ${n("IGNORADO_CIDADE").toLocaleString("pt-BR")} de cidade excluída ·
            ${n("NAO_ENCONTRADO").toLocaleString("pt-BR")} não achados na Shopee ·
            ${n("NAO_EDITAVEL").toLocaleString("pt-BR")} já emitidos ·
            ${n("ERRO").toLocaleString("pt-BR")} com erro ·
            ${n("PENDENTE").toLocaleString("pt-BR")} na fila
        </p>
        ${emAndamento ? `<p class="dica">
            <b>Pode fechar esta aba.</b> O servidor continua processando; volte aqui
            depois para ver como ficou.</p>
            <button onclick="_valCancelarImportacao(${p.importacao.id})">Cancelar importação</button>`
        : `<div class="acoes-rodape"><button onclick="abrirCTes()">Ver os CT-e →</button></div>`}
    </div>

    ${(p.problemas || []).length ? `
    <details class="secao-form">
        <summary><b>Códigos com problema</b> — ${p.problemas.length}</summary>
        <table class="tabela">
            <thead><tr><th>Código</th><th>Situação</th><th>Detalhe</th></tr></thead>
            <tbody>${p.problemas.map((x) => `<tr>
                <td class="mono-pequeno">${_esc(x.codigo)}</td>
                <td>${_esc(x.situacao)}</td>
                <td class="dica">${_esc(x.detalhe || "")}</td>
            </tr>`).join("")}</tbody>
        </table>
    </details>` : ""}`;
}

async function _valCancelarImportacao(id) {
    if (!confirm("Parar esta importação? O que já foi criado continua salvo.")) return;
    try {
        await _cteApi(`/fiscal/importacao/${id}/cancelar`,
                      { method: "POST", body: JSON.stringify({}) });
        _valAcompanhar(id);
    } catch (e) { alert(e.message); }
}

function _valCol(id) {
    const el = document.getElementById(id);
    return el && el.value !== "" ? Number(el.value) : null;
}
